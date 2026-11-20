import {ClientCooldownError} from '../utils/entryErrors';
import {passwordError, validateGraduate} from '../utils/entryRules';
import { proofTypes } from '../utils/proof';
import {reportEntryIssue} from './entryFeedback';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  AcademicLevel,
  AccountType,
  AppUser,
  idToInternalEmail,
  MAX_ID_CARD_BYTES,
  normalizeIdNumber,
  RequestedRole,
  toAppTimestamp,
} from '../types';

export interface SignUpInput {
  captchaToken?: string;
  fullName: string;
  idNumber: string;
  accountType: AccountType;
  department: string;
  level: AcademicLevel;
  password: string;
  recoveryEmail: string;
  phone?: string;
  idCardFile?: File | null;
  staffPath?: 'email'|'id'|'document'|'vouch';
  inviteToken?: string;
  isGraduate?: boolean;
  graduationClassYear?: number;
}

export type SupabaseAuthUser = User;

interface ThrottleConfig {
  minIntervalMs: number;
  maxAttempts: number;
  windowMs: number;
}

const MEMORY_THROTTLE = new Map<string, number[]>();

function readThrottleTimestamps(bucket: string, windowMs: number, nowMs: number): number[] {
  const cutoff = nowMs - windowMs;
  let list = MEMORY_THROTTLE.get(bucket);
  if (!list) {
    try {
      const raw = localStorage.getItem(`gsu_throttle_${bucket}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          list = parsed.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
        }
      }
    } catch {
      // Ignore storage read errors
    }
  }
  return (list ?? []).filter((ts) => ts > cutoff);
}

function writeThrottleTimestamps(bucket: string, timestamps: number[]): void {
  MEMORY_THROTTLE.set(bucket, timestamps);
  try {
    localStorage.setItem(`gsu_throttle_${bucket}`, JSON.stringify(timestamps));
  } catch {
    // Ignore storage quota errors
  }
}

function assertClientThrottle(bucket: string, cfg: ThrottleConfig): void {
  const nowMs = Date.now();
  const recent = readThrottleTimestamps(bucket, cfg.windowMs, nowMs);
  const lastMs = recent[recent.length - 1] ?? 0;

  const nextAllowed = Math.max(
    lastMs + cfg.minIntervalMs,
    recent.length >= cfg.maxAttempts ? recent[0] + cfg.windowMs : 0,
  );
  if (nextAllowed > nowMs) throw new ClientCooldownError(Math.ceil((nextAllowed - nowMs) / 1000));

  recent.push(nowMs);
  writeThrottleTimestamps(bucket, recent);
}

function clearClientThrottle(bucket: string): void {
  MEMORY_THROTTLE.delete(bucket);
  try {
    localStorage.removeItem(`gsu_throttle_${bucket}`);
  } catch {
    // Ignore storage errors
  }
}

export function clearCachedWorkspaceStorage(): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (
        k &&
        (k.startsWith('gsu_cached_profile_') || k.startsWith('gsu_cached_chats_'))
      ) {
        keysToRemove.push(k);
      }
    }
    for (const k of keysToRemove) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function toTitleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Always use an opaque path with a MIME-derived extension, not a personal filename.
export async function uploadIdCardFile(uid: string, file: File, kind?:'email'|'id'|'document'|'vouch', onAttach?: () => void): Promise<string> {
  if (!uid) throw new Error('Sign in to upload verification proof.');
  if (!file || file.size < 1) {
    throw new Error('Choose a nonempty proof image or PDF.');
  }
  if (file.size > MAX_ID_CARD_BYTES) {
    throw new Error('Verification file exceeds the 3 MB limit. Please choose a smaller file.');
  }
  if (!proofTypes.includes(file.type)) throw new Error('Choose a JPEG, PNG, WebP or PDF.');

  if(kind==='id' && !file.type.startsWith('image/'))throw new Error('Choose a staff ID photo.');
  const safeName = `${kind==='id'?'staff-id':kind==='document'?'employment':'verification'}.${file.type==='application/pdf' ? 'pdf' : file.type.split('/')[1]}`;
  const storagePath = `${uid}/${crypto.randomUUID()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('id-cards')
    .upload(storagePath, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadError) {
    throw new Error('Upload failed. Please try again.');
  }

  onAttach?.();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      id_card_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid).in('status',['pending','rejected']).select('id').single();

  if (updateError) {
    throw new Error('Could not attach proof. Please try again.');
  }

  window.dispatchEvent(new CustomEvent('entry-uploaded',{detail:uid}));
  return storagePath;
}

/**
 * Resolves a Matric Number, Staff ID or email via the
 * `resolve_login` RPC (returns only the minimal internal auth email).
 */
export async function resolveLoginEmail(rawIdentifier: string): Promise<string> {
  const trimmed = rawIdentifier.trim();
  const isEmailInput = trimmed.includes('@');

  if (trimmed.length > 120) {
    throw new Error('Identifier is too long.');
  }
  if (isEmailInput) {
    const emailLower = trimmed.toLowerCase();
    if (emailLower.length < 5 || !emailLower.includes('.')) {
      throw new Error('Please enter a valid email address.');
    }
  } else if (normalizeIdNumber(trimmed).length < 3 || (/^[+\d\s().-]+$/.test(trimmed) && trimmed.replace(/\D/g,'').length >= 10)) {
    throw new Error('Please enter a valid matric number or staff ID.');
  }

  assertClientThrottle('login', {
    minIntervalMs: 1000,
    maxAttempts: 5,
    windowMs: 120_000,
  });

  if (isEmailInput) {
    return trimmed.toLowerCase();
  }

  try {
    const { data, error } = await supabase.rpc('resolve_login', {
      identifier: trimmed,
    });
    if (!error && typeof data === 'string' && data.includes('@')) {
      return data.trim().toLowerCase();
    }
  } catch {
    // Fall back below if RPC does not return a mapped email
  }

  return idToInternalEmail(trimmed);
}

/**
 * Checks whether a Matric Number / Staff ID is already registered using
 * the public RPC `identifier_available(lookup_type, value)`.
 */
export async function checkIdentifierExists(
  idNumber: string,
  accountType?: AccountType
): Promise<boolean> {
  const clean = idNumber.trim();
  const normalized = normalizeIdNumber(clean);
  if (normalized.length < 3 || clean.length > 120) return false;

  assertClientThrottle('signup_check', {
    minIntervalMs: 1000,
    maxAttempts: 5,
    windowMs: 120_000,
  });

  const lookupTypes: ('matric' | 'staff_id')[] =
    accountType === 'staff'
      ? ['staff_id']
      : accountType === 'student'
        ? ['matric']
        : ['matric', 'staff_id'];

  for (const lookupType of lookupTypes) {
    try {
      const { data, error } = await supabase.rpc('identifier_available', {
        lookup_type: lookupType,
        value: clean,
      });
      if (!error && typeof data === 'boolean') {
        if (!data) return true;
      }
    } catch {
      // Try next lookup type
    }
  }

  return false;
}

export async function signUpUser(input: SignUpInput): Promise<AppUser> {
  const fullName = clampStr(toTitleCaseName(input.fullName), 100);
  const idNumber = clampStr(input.idNumber, 40);
  const idNumberNormalized = normalizeIdNumber(idNumber).slice(0, 40);
  const department = clampStr(input.department, 80);
  const level: AcademicLevel = input.accountType === 'staff' ? 'Staff' : input.level;
  const cleanRecoveryEmail = clampStr((input.recoveryEmail || '').toLowerCase(), 120);
  const cleanPhone = clampStr((input.phone || '').trim(), 20);

  if (fullName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }
  if (idNumberNormalized.length < 3) {
    throw new Error('Matric number or Staff ID must have at least 3 alphanumeric characters.');
  }
  if (department.length < 2) {
    throw new Error('Department or office must be at least 2 characters.');
  }
  const weakPassword = passwordError(input.password);
  if (weakPassword) throw new Error(weakPassword);
  if (
    cleanRecoveryEmail.length < 5 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanRecoveryEmail)
  ) {
    throw new Error(
      'Please enter a valid email address. Password reset links are sent there.'
    );
  }
  if (cleanPhone) {
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      throw new Error('Please enter a valid phone number (e.g. 0803 123 4567).');
    }
  }
  if(input.accountType==='staff') {
    if(!input.staffPath || !['id','document','vouch','email'].includes(input.staffPath))throw new Error('Choose a staff verification method.');
    if((input.staffPath==='id'||input.staffPath==='document') && !input.idCardFile)throw new Error('Attach proof of staff status or choose email or vouching.');
    if(input.staffPath==='id' && !input.idCardFile?.type.startsWith('image/'))throw new Error('Choose a staff ID photo.');
  }
  if (input.idCardFile && input.idCardFile.size > MAX_ID_CARD_BYTES) {
    throw new Error('Verification file exceeds the 3 MB limit. Please pick a smaller image.');
  }

  const isGraduate = input.accountType === 'student' && Boolean(input.isGraduate);
  const graduationClassYear = input.graduationClassYear;
  validateGraduate(input.accountType, input.level, Boolean(input.isGraduate), graduationClassYear);

  const alreadyExists = await checkIdentifierExists(idNumber, input.accountType);
  if (alreadyExists) {
    throw new Error(
      'An account with this Matric Number / Staff ID already exists. Try signing in instead.'
    );
  }

  const authEmail = idToInternalEmail(idNumber);
  const requestedRole: RequestedRole = input.accountType === 'staff' ? 'lecturer' : 'student';

  const signupMetadata: Record<string, unknown> = {
    full_name: fullName,
    matric_no: input.accountType === 'student' ? idNumber : null,
    staff_id: input.accountType === 'staff' ? idNumber : null,
    id_number: idNumber,
    id_number_normalized: idNumberNormalized,
    account_type: input.accountType,
    department,
    level,
    requested_role: requestedRole,
    staff_proof_route: input.staffPath,
    ...(input.inviteToken && input.accountType === 'student' ? {entry_invite: input.inviteToken} : {}),
    recovery_email: cleanRecoveryEmail,
    phone: cleanPhone || null,
  };

  if (isGraduate && graduationClassYear !== undefined) {
    signupMetadata.is_graduate = true;
    signupMetadata.graduation_class_year = graduationClassYear;
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: authEmail,
    password: input.password,
    options: {
      captchaToken: input.captchaToken,
      emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      data: signupMetadata,
    },
  });

  if (signUpError) {
    throw new Error(signUpError.message);
  }
  const authUser = signUpData.user;
  if (!authUser) {
    throw new Error('Registration did not return a user account. Please try again.');
  }

  const uid = authUser.id;
  let uploadedIdCardPath: string | undefined;

  if (input.idCardFile && signUpData.session) {
    uploadedIdCardPath = await uploadIdCardFile(uid, input.idCardFile, input.staffPath).catch((err) => {
      reportEntryIssue(uid, `Account created. Proof not submitted: ${err instanceof Error && err.message === 'Could not attach proof. Please try again.' ? 'Could not attach proof.' : 'Upload failed.'} Upload again below.`);
      return undefined;
    });
  }

  if(input.idCardFile && !signUpData.session)reportEntryIssue(uid,'Sign in and upload your proof to finish verification.');
  const nowIso = new Date().toISOString();
  return {
    uid,
    fullName,
    idNumber,
    idNumberNormalized,
    accountType: input.accountType,
    department,
    level,
    role: input.accountType === 'staff' ? 'lecturer' : 'student',
    requestedRole,
    email: '',
    status: 'pending',
    idCardPath: uploadedIdCardPath,
    blockedUsers: [],
    createdAt: toAppTimestamp(nowIso),
    updatedAt: toAppTimestamp(nowIso),
    lastSeen: toAppTimestamp(nowIso),
  };
}

/**
 * Verifies the signed-in user's current password against Supabase Auth.
 * Used before sensitive account changes (password change, recovery email
 * change, account deletion). Throws an Error with a user-friendly message
 * when verification fails.
 */
export async function verifyOwnPassword(
  currentPassword: string,
  action = 'continuing', captchaToken?: string
): Promise<void> {
  if (!currentPassword) {
    throw new Error('Please enter your current password.');
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user?.email) {
    throw new Error(`Please sign in again before ${action}.`);
  }
  if (userData.user.email) {
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword, options:{captchaToken},
    });
    if (verifyErr) {
      throw new Error('Password is incorrect.');
    }
  }
}

export async function signInUser(identifier: string, password: string, captchaToken?: string): Promise<void> {
  const authEmail = await resolveLoginEmail(identifier);
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password, options:{captchaToken},
  });

  if (error) {
    throw new Error(error.message);
  }
  clearClientThrottle('login');
}

/**
 * Requests a password reset for a Matric Number, Staff ID, Phone Number, or
 * Email. The `password-reset` edge function resolves the account, looks up
 * the recovery email on file, and sends a reset link there. It always
 * returns success so the form cannot be used to probe for registered
 * accounts.
 */
export async function requestPasswordReset(identifier: string, captchaToken?: string): Promise<void> {
  if (/[\x00-\x1F\x7F]/.test(identifier)) {
    throw new Error('Please enter a valid Matric Number, Staff ID or registered phone number.');
  }
  const trimmed = identifier.trim();
  if (trimmed.length < 3 || trimmed.length > 120) {
    throw new Error('Please enter your Matric Number, Staff ID or registered phone number.');
  }
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      throw new Error('Please enter a valid email address.');
    }
  } else if (normalizeIdNumber(trimmed).length < 3) {
    throw new Error('Please enter your Matric Number, Staff ID or registered phone number.');
  }

  assertClientThrottle('password_reset', {
    minIntervalMs: 2000,
    maxAttempts: 3,
    windowMs: 120_000,
  });

  const { error } = await supabase.functions.invoke('password-reset', {
    body: { identifier: trimmed, captchaToken },
  });
  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 429) {
      throw new Error('Too many password reset requests. Please wait a few minutes and try again.');
    }
    throw new Error('Could not send the reset email. Please check your connection and try again.');
  }
}

/**
 * Updates the signed-in user's recovery email (used in Profile settings).
 * The current password is required because password-reset links are sent to
 * this address — changing it must prove fresh knowledge of the password.
 */
export async function updateRecoveryEmail(
  newEmail: string,
  currentPassword: string, captchaToken?: string
): Promise<void> {
  const clean = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error('Please enter a valid email address.');
  }
  await verifyOwnPassword(currentPassword, 'updating your recovery email',captchaToken);
  const { error } = await supabase.rpc('set_recovery_email', { new_email: clean });
  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Starts verification of a NEW recovery inbox. Re-checks the current password
 * (fresh Turnstile token expected from the caller), then asks the
 * `recovery-email` function to send a single-use link to the new address.
 * The old verified inbox stays active until the new one confirms.
 */
export async function requestRecoveryEmailVerification(
  newEmail: string,
  currentPassword: string,
  captchaToken?: string
): Promise<void> {
  const clean = newEmail.trim().toLowerCase();
  if (clean.length > 254 || !/^[a-z0-9][a-z0-9._+-]*@[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(clean)) {
    throw new Error('Please enter a valid email address.');
  }
  await verifyOwnPassword(currentPassword, 'verifying a recovery email', captchaToken);
  const { error } = await supabase.functions.invoke('recovery-email', {
    body: { action: 'send', email: clean, captchaToken },
  });
  if (error) {
    const status = (error as { context?: { status?: number } })?.context?.status;
    if (status === 429) {
      throw new Error('Too many verification requests. Please wait a few minutes and try again.');
    }
    throw new Error('Could not send the verification email. Please check your connection and try again.');
  }
}

export async function signOutUser(scope: 'local' | 'global' = 'global'): Promise<void> {
  clearCachedWorkspaceStorage();
  const { error } = await supabase.auth.signOut({ scope });
  if (error) {
    throw new Error(error.message);
  }
}

export function subscribeToAuthState(
  callback: (event: AuthChangeEvent | 'INITIAL', session: Session | null) => void
): () => void {
  let active = true;
  supabase.auth
    .getSession()
    .then(({ data }) => {
      if (active) callback('INITIAL', data.session);
    })
    .catch(() => {
      if (active) callback('INITIAL', null);
    });

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearCachedWorkspaceStorage();
    }
    if (active) callback(event, session);
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}
