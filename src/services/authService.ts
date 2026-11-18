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
  fullName: string;
  idNumber: string;
  accountType: AccountType;
  department: string;
  level: AcademicLevel;
  password: string;
  recoveryEmail: string;
  phone?: string;
  idCardFile?: File | null;
  isGraduate?: boolean;
  graduationClassYear?: number;
}

export type SupabaseAuthUser = User;

interface ThrottleConfig {
  minIntervalMs: number;
  maxAttempts: number;
  windowMs: number;
  actionLabel: string;
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

  if (lastMs && nowMs - lastMs < cfg.minIntervalMs) {
    const waitSec = Math.max(1, Math.ceil((cfg.minIntervalMs - (nowMs - lastMs)) / 1000));
    throw new Error(
      `Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} before ${cfg.actionLabel}.`
    );
  }

  if (recent.length >= cfg.maxAttempts) {
    const oldest = recent[0] ?? nowMs;
    const waitSec = Math.max(1, Math.ceil((oldest + cfg.windowMs - nowMs) / 1000));
    throw new Error(
      `Too many attempts. Please wait ${waitSec} second${waitSec === 1 ? '' : 's'} and try again.`
    );
  }

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

function sanitizeStorageFileName(rawName: string): string {
  const cleaned = rawName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return cleaned.slice(-80) || 'file';
}

/**
 * Uploads the user's own Student/Staff ID card (or course registration form)
 * to the private `id-cards` bucket (`<userId>/<filename>`) and stores the
 * path in `profiles.id_card_path`.
 */
export async function uploadIdCardFile(uid: string, file: File): Promise<string> {
  if (!uid) throw new Error('You must be signed in to upload an ID card.');
  if (!file || file.size < 1) {
    throw new Error('Please choose a valid ID card image.');
  }
  if (file.size > MAX_ID_CARD_BYTES) {
    throw new Error('ID card image exceeds the 3 MB limit. Please choose a smaller file.');
  }
  const allowedMime = file.type && (file.type.startsWith('image/') || file.type === 'application/pdf');
  if (file.type && !allowedMime) {
    throw new Error('ID card must be an image (JPEG, PNG, WebP) or PDF.');
  }

  const safeName = sanitizeStorageFileName(file.name || 'id_card.jpg');
  const storagePath = `${uid}/${crypto.randomUUID()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('id-cards')
    .upload(storagePath, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      id_card_path: storagePath,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return storagePath;
}

/**
 * Resolves a Matric Number, Staff ID, Phone Number, or Email via the
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
  } else if (normalizeIdNumber(trimmed).length < 3) {
    throw new Error('Please enter a valid matric number, Staff ID, phone number, or email.');
  }

  assertClientThrottle('login', {
    minIntervalMs: 1000,
    maxAttempts: 5,
    windowMs: 120_000,
    actionLabel: 'signing in again',
  });

  if (isEmailInput && trimmed.toLowerCase().endsWith('@gsuconnect.app')) {
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

  return isEmailInput ? trimmed.toLowerCase() : idToInternalEmail(trimmed);
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
    actionLabel: 'checking again',
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
  if (input.password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
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
  if (input.idCardFile && input.idCardFile.size > MAX_ID_CARD_BYTES) {
    throw new Error('ID card photo exceeds the 3 MB limit. Please pick a smaller image.');
  }

  const isGraduate = input.accountType === 'student' && Boolean(input.isGraduate);
  const graduationClassYear =
    isGraduate &&
    typeof input.graduationClassYear === 'number' &&
    Number.isInteger(input.graduationClassYear) &&
    input.graduationClassYear >= 2000 &&
    input.graduationClassYear <= 2100
      ? input.graduationClassYear
      : undefined;

  if (isGraduate && graduationClassYear === undefined) {
    throw new Error(
      'Unable to determine your graduation class year for the current session. Please wait a moment and try again.'
    );
  }

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
    uploadedIdCardPath = await uploadIdCardFile(uid, input.idCardFile).catch((err) => {
      console.warn('ID card upload warning after signup:', err);
      return undefined;
    });
  }

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
  action = 'continuing'
): Promise<void> {
  if (!currentPassword) {
    throw new Error('Please enter your current password.');
  }
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error(`Please sign in again before ${action}.`);
  }
  if (userData.user.email) {
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email: userData.user.email,
      password: currentPassword,
    });
    if (verifyErr) {
      throw new Error('Password is incorrect.');
    }
  }
}

export async function signInUser(identifier: string, password: string): Promise<void> {
  const authEmail = await resolveLoginEmail(identifier);
  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
  clearClientThrottle('login');
}

/**
 * Requests a password reset for a Matric Number, Staff ID, Phone Number, or
 * GSU sign-in email. The `password-reset` edge function sends the link to
 * the recovery email on file and returns the same generic response for
 * matched and unmatched accounts.
 */
export async function requestPasswordReset(identifier: string): Promise<void> {
  if (/[\x00-\x1F\x7F]/.test(identifier)) {
    throw new Error('Please enter a valid Matric Number, Staff ID, phone number, or email.');
  }
  const trimmed = identifier.trim();
  if (trimmed.length < 3 || trimmed.length > 120) {
    throw new Error('Please enter your Matric Number, Staff ID, phone number, or email.');
  }
  if (trimmed.includes('@')) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      throw new Error('Please enter a valid email address.');
    }
  } else if (normalizeIdNumber(trimmed).length < 3) {
    throw new Error('Please enter your Matric Number, Staff ID, phone number, or email.');
  }

  assertClientThrottle('password_reset', {
    minIntervalMs: 2000,
    maxAttempts: 3,
    windowMs: 120_000,
    actionLabel: 'requesting another reset link',
  });

  const { error } = await supabase.functions.invoke('password-reset', {
    body: { identifier: trimmed },
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
  currentPassword: string
): Promise<void> {
  const clean = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error('Please enter a valid email address.');
  }
  await verifyOwnPassword(currentPassword, 'updating your recovery email');
  const { error } = await supabase.rpc('set_recovery_email', { new_email: clean });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutUser(): Promise<void> {
  clearCachedWorkspaceStorage();
  const { error } = await supabase.auth.signOut();
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
