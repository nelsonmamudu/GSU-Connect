import {useTurnstile} from './Turnstile';
import {formatAuthError} from '../utils/entryErrors';
import {minPasswordLength, passwordError} from '../utils/entryRules';
import {StaffPathPicker,type StaffPath} from './StaffVerification';
import {studentProof,staffProof,proofTypes} from '../utils/proof';
import {
  getGraduationClassYear,
  graduationLevelLabel,
  setGraduationClassYear,
} from '../utils/graduationClass';
import { ProofDropzone } from './ProofDropzone';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { Alert } from './ui/Alert';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Stepper } from './ui/Stepper';
import { errorTextClass } from './ui/styles';
import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  fetchEntryConfig,
  fetchSessionEndYear,
  requestPasswordReset,
  signInUser,
  signUpUser,
} from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import {
  AcademicLevel,
  AccountType,
  DepartmentItem,
  levelsForDuration,
  MAX_ID_CARD_BYTES,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';
import { trackFunnel } from '../services/funnel';

type AuthMode = 'login' | 'signup' | 'forgot';
type LevelSelection = AcademicLevel | 'graduate' | '';
type SignupStep = 1 | 2 | 3;
type FieldName =
  | 'fullName'
  | 'idNumber'
  | 'department'
  | 'level'
  | 'email'
  | 'phone'
  | 'password'
  | 'confirmPassword'
  | 'proof'
  | 'forgotIdentifier';
type FieldErrors = Partial<Record<FieldName, string>>;

const SIGNUP_STEPS: { value: SignupStep; label: string; heading: string; hint: string }[] = [
  { value: 1, label: 'Proof', heading: 'Start with your ID', hint: 'Upload a photo or PDF — we’ll fill in what we can.' },
  { value: 2, label: 'Details', heading: 'Your details', hint: 'Check the details we read and fill in anything missing.' },
  { value: 3, label: 'Account', heading: 'Your account', hint: 'This is how you’ll sign in and recover your account.' },
];

const FIELD_ELEMENT_ID: Record<FieldName, string> = {
  fullName: 'fullName',
  idNumber: 'idNumber',
  department: 'department-picker',
  level: 'student-level-group',
  email: 'email',
  phone: 'phone',
  password: 'password',
  confirmPassword: 'confirmPassword',
  proof: 'proof-upload',
  forgotIdentifier: 'forgotIdentifier',
};

// Mixed login/reset fields also accept email. Keep ambiguous text verbatim until blur.
function entryIdentifier(value: string, idOnly = false, finished = false) {
  return idOnly || (!value.includes('@') && (value.includes('/') || finished))
    ? value.toUpperCase() : value;
}

interface AuthScreenProps {
  departments: DepartmentItem[];
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: 'login' | 'signup';
  onChange: (mode: 'login' | 'signup') => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 p-1 bg-sunken rounded-2xl mb-6">
      {(['login', 'signup'] as const).map((key) => (
        <Button
          key={key}
          type="button"
          variant="ghost"
          size="lg"
          aria-pressed={mode === key}
          onClick={() => onChange(key)}
          className={
            mode === key
              ? 'bg-white dark:bg-surface text-ink shadow-resting'
              : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
          }
        >
          {key === 'login' ? 'Sign In' : 'Create Account'}
        </Button>
      ))}
    </div>
  );
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ departments }) => {
  const [mode, setMode] = useState<AuthMode>(new URLSearchParams(location.search).has('invite')?'signup':'login');
  const [step, setStep] = useState<SignupStep>(1);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const submittingRef = useRef(false);
  const challenge = useTurnstile(mode);
  const [staffPath,setStaffPath]=useState<StaffPath>('email');
  const [accountType, setAccountType] = useState<AccountType>('student');
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState<LevelSelection>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState('');
  const [inviteToken] = useState(() => new URLSearchParams(location.search).get('invite') || '');
  const [inviteDept, setInviteDept] = useState('');
  const [ocrHint, setOcrHint] = useState('');
  const scan = useRef<AbortController | null>(null);
  useEffect(() => {
    scan.current?.abort();
    setOcrHint('');
    setIdCardFile(null);
    return () => scan.current?.abort();
  }, [accountType, mode]);
  useEffect(() => {
    trackFunnel('auth_view', { mode });
  }, [mode]);
  useEffect(() => {
    if (mode === 'signup') trackFunnel('signup_step_reached', { step });
  }, [mode, step]);
  useEffect(() => {
    let active = true;
    if (/^[a-f0-9-]{36}$/i.test(inviteToken)) {
      void supabase.rpc('entry_invite_department', { token: inviteToken }).then(({ data }) => {
        if (active && typeof data === 'string') {
          setInviteDept(data);
          setDepartment((prev) => prev || data);
        }
      });
    }
    return () => {
      active = false;
    };
  }, [inviteToken]);
  const [sessionLabel, setSessionLabel] = useState('');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  // The graduate class year is server configuration; the session label is a
  // display hint. `entry_config` answers both. Before that migration exists we
  // fall back to the older `session_end_year` RPC for the label only, so the
  // class year keeps its shipped default rather than being guessed.
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadConfig = async (allowRetry: boolean) => {
      const config = await fetchEntryConfig();
      if (!active) return;
      if (config) {
        setGraduationClassYear(config.graduationClassYear);
        if (config.sessionLabel) setSessionLabel(config.sessionLabel);
        return;
      }
      // Older deployments without entry_config: label only, never guess the year.
      const endYear = await fetchSessionEndYear();
      if (!active) return;
      if (endYear) {
        setSessionLabel(`${endYear - 1}/${endYear}`);
        return;
      }
      if (allowRetry) {
        retryTimer = setTimeout(() => {
          void loadConfig(false);
        }, 1500);
      }
    };

    void loadConfig(true);

    return () => {
      active = false;
      if (retryTimer !== null) {
        clearTimeout(retryTimer);
      }
    };
  }, []);

  // Levels available for the selected department (driven by course length).
  const selectedDuration =
    departments.find((d) => d.name.toLowerCase() === department.trim().toLowerCase())
      ?.durationYears ?? 4;
  const availableLevels = levelsForDuration(selectedDuration);

  // If the current numeric level is not valid for the newly selected department, reset to empty.
  // "graduate" is valid for every department and is preserved when changing department.
  useEffect(() => {
    if (
      accountType === 'student' &&
      level &&
      level !== 'graduate' &&
      !availableLevels.includes(level)
    ) {
      setLevel('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, accountType]);

  const setFieldError = (name: FieldName, message?: string) =>
    setFieldErrors((prev) => {
      if (message) {
        if (prev[name] === message) return prev;
        return { ...prev, [name]: message };
      }
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });

  const touchField = (name: FieldName) =>
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));

  const applyErrors = (next: FieldErrors) => {
    setFieldErrors(next);
    setTouched((prev) => {
      const merged = { ...prev };
      (Object.keys(next) as FieldName[]).forEach((name) => {
        merged[name] = true;
      });
      return merged;
    });
    const first = Object.keys(next)[0] as FieldName | undefined;
    if (!first) return;
    const el = document.getElementById(FIELD_ELEMENT_ID[first]);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  /**
   * One validator per field. Fields are judged on blur, then re-judged live
   * while the user fixes them — never on every keystroke from the first one.
   */
  const FIELD_VALIDATORS: Record<FieldName, () => string | undefined> = {
    fullName: () =>
      fullName.trim().length < 2 ? 'Please enter your full name.' : undefined,
    idNumber: () => {
      if (idNumber.trim().length >= 3) return undefined;
      if (mode === 'login') return 'Enter your Matric Number or Staff ID.';
      if (mode === 'forgot') {
        return 'Enter your Matric Number, Staff ID or registered phone number.';
      }
      return accountType === 'staff' ? 'Enter your Staff ID.' : 'Enter your Matric Number.';
    },
    department: () =>
      department.trim().length < 2
        ? accountType === 'staff'
          ? 'Please select your department or office.'
          : 'Please select your department.'
        : undefined,
    level: () =>
      accountType === 'student' && !level ? 'Please select your level.' : undefined,
    email: () =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())
        ? undefined
        : 'Please enter a valid recovery email.',
    phone: () => {
      if (!phone.trim()) return undefined;
      const digits = phone.replace(/\D/g, '');
      return digits.length < 10 || digits.length > 15
        ? 'Please enter a valid phone number (e.g. 0803 123 4567).'
        : undefined;
    },
    password: () => {
      if (mode !== 'signup') return password ? undefined : 'Enter your password.';
      return password.length < minPasswordLength
        ? 'Password must be at least 8 characters.'
        : undefined;
    },
    confirmPassword: () =>
      password !== confirmPassword ? 'Passwords do not match.' : undefined,
    proof: () =>
      accountType === 'staff' && (staffPath === 'id' || staffPath === 'document') && !idCardFile
        ? 'Attach your selected proof of staff status, or choose email or vouching.'
        : undefined,
    forgotIdentifier: () =>
      forgotIdentifier.trim().length < 3
        ? 'Enter your Matric Number, Staff ID or registered phone number.'
        : undefined,
  };

  const collectErrors = (names: FieldName[]): FieldErrors => {
    const next: FieldErrors = {};
    names.forEach((name) => {
      const message = FIELD_VALIDATORS[name]?.();
      if (message) next[name] = message;
    });
    return next;
  };

  const validateProof = (): FieldErrors => collectErrors(['proof']);
  const validateIdentity = (): FieldErrors =>
    collectErrors(['fullName', 'idNumber', 'department', 'level']);
  const validateAccount = (): FieldErrors =>
    collectErrors(['email', 'phone', 'password', 'confirmPassword']);
  const validateLogin = (): FieldErrors => collectErrors(['idNumber', 'password']);
  const validateForgot = (): FieldErrors => collectErrors(['forgotIdentifier']);

  // Live re-validation, but only for fields the user has already left (or that
  // already carry a message). Untouched fields stay quiet until blur or submit.
  useEffect(() => {
    const live = (Object.keys(FIELD_VALIDATORS) as FieldName[]).filter(
      (name) => touched[name] || fieldErrors[name],
    );
    if (live.length === 0) return;
    const next = collectErrors(live);
    setFieldErrors((prev) => {
      const keys = new Set<FieldName>([
        ...(Object.keys(prev) as FieldName[]),
        ...(Object.keys(next) as FieldName[]),
      ]);
      let changed = false;
      keys.forEach((key) => {
        if (prev[key] !== next[key]) changed = true;
      });
      return changed ? next : prev;
    });
  }, [
    fullName,
    idNumber,
    department,
    level,
    email,
    phone,
    password,
    confirmPassword,
    idCardFile,
    accountType,
    staffPath,
    mode,
    touched,
    fieldErrors,
  ]);

  const handleProofFile = async (file: File) => {
    if (file.size > MAX_ID_CARD_BYTES) {
      setError('File exceeds the 3 MB limit. Please choose a smaller photo or PDF.');
      return;
    }
    if (accountType==='staff' && staffPath==='id' && !file.type.startsWith('image/')) {setError('Choose a staff ID photo, not a PDF.');return;}
    if (!proofTypes.includes(file.type) || !file.size) {
      setError('Choose a JPEG, PNG, WebP or PDF.');
      return;
    }
    setError(null);
    touchField('proof');
    setIdCardFile(file);
    trackFunnel('signup_proof_selected', {
      bytes: file.size,
      type: file.type,
      accountType,
      staffPath,
    });
    scan.current?.abort();
    const controller = new AbortController();
    scan.current = controller;
    setOcrHint('Reading proof on this device. You can type the fields yourself.');
    const timeout = window.setTimeout(() => {
      if (!controller.signal.aborted) {
        controller.abort();
        setOcrHint('Reading took too long. Enter the details manually.');
      }
    }, 45000);
    try {
      const fields = await (
        await import('../utils/proofOcr')
      ).readProof(
        file,
        departments.map((d) => d.name),
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (fields.name) setFullName((v) => v || fields.name!);
      if (accountType === 'student' && fields.matric) setIdNumber((v) => v || fields.matric!.toUpperCase());
      if (fields.department) setDepartment((v) => v || fields.department!);
      setOcrHint('Check your details and enter any missing fields.');
    } catch {
      if (!controller.signal.aborted)
        setOcrHint(
          'Could not read this file. Enter your details manually; the file is still attached.',
        );
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Double-submit guard: the button also goes busy, but a second Enter or a
    // double tap can still re-enter before the first request resolves.
    if (submittingRef.current) return;
    setError(null);

    const next =
      mode === 'login'
        ? validateLogin()
        : mode === 'forgot'
          ? validateForgot()
          : { ...validateProof(), ...validateIdentity(), ...validateAccount() };
    if (Object.keys(next).length > 0) {
      applyErrors(next);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signInUser(idNumber, password, challenge.consume());
      } else if (mode === 'forgot') {
        await requestPasswordReset(forgotIdentifier, challenge.consume());
        setForgotSent(true);
      } else {
        if(accountType==='staff' && ['id','document'].includes(staffPath) && !idCardFile)throw new Error('Attach your selected proof of staff status, or choose email or vouching.');
        if (!department.trim()) {
          throw new Error(
            accountType === 'staff'
              ? 'Please select your department or office'
              : 'Please select your department'
          );
        }
        if (department.trim().length < 2) {
          throw new Error(
            accountType === 'staff'
              ? 'Please select or enter your department or office (at least 2 characters).'
              : 'Please select or enter your department (at least 2 characters).'
          );
        }
        if (accountType === 'student' && !level) {
          throw new Error('Please select your level');
        }
        const isGraduateSelected = accountType === 'student' && level === 'graduate';
        const submittedLevel: AcademicLevel =
          accountType === 'staff'
            ? 'Staff'
            : isGraduateSelected
              ? graduationLevelLabel()
              : (level as AcademicLevel);

        await signUpUser({
          captchaToken:challenge.consume(),
          fullName,
          idNumber,
          accountType,
          department,
          level: submittedLevel,
          password,
          recoveryEmail: email,
          phone,
          idCardFile,
          staffPath: accountType==='staff'?staffPath:undefined,
          inviteToken: accountType==='student' && department===inviteDept ? inviteToken : undefined,
          ...(isGraduateSelected
            ? {
                isGraduate: true,
                graduationClassYear: getGraduationClassYear(),
              }
            : {}),
        });
        trackFunnel('signup_submitted', {
          accountType,
          staffPath,
          level: submittedLevel,
          hasProof: Boolean(idCardFile),
          recoveryEmail: Boolean(email.trim()),
          phone: Boolean(phone.trim()),
        });
        try { sessionStorage.setItem('gsu_signup_recovery', email.trim().toLowerCase()); } catch { /* ignore */ }
        // Signup and a usable session are separate outcomes (e.g. auth configuration changes).
        if (!(await supabase.auth.getSession()).data.session) {
          setMode('login');setPassword('');setStep(1);setFieldErrors({});setTouched({});
          setSignupNotice('Sign in to finish verification. Creating an account alone does not submit it for review.');
        }
      }
    } catch (err) {
      trackFunnel('auth_error', { mode, message: formatAuthError(err) });
      setError(formatAuthError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    if (next === 'signup') setIdNumber(v => v.toUpperCase());
    setMode(next);
    setError(null);
    setSignupNotice('');
    setForgotSent(false);
    setStep(1);
    setFieldErrors({});
    setTouched({});
  };

  const handleContinue = () => {
    const next = step === 1 ? validateProof() : validateIdentity();
    if (Object.keys(next).length > 0) {
      applyErrors(next);
      return;
    }
    trackFunnel('signup_step_completed', { step });
    setStep((prev) => (prev === 1 ? 2 : 3));
  };

  const stepHeading = SIGNUP_STEPS.find((s) => s.value === step);
  const stepperSteps = SIGNUP_STEPS.map((s) => ({ key: s.value, label: s.label }));

  const renderProofSection = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">{stepHeading?.heading}</h3>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{stepHeading?.hint}</p>
      </div>

      <div>
        <span className="block text-xs font-semibold text-ink-soft mb-1.5">I am a:</span>
        <div className="grid grid-cols-2 gap-2">
          {(['student', 'staff'] as const).map((type) => (
            <Button
              key={type}
              type="button"
              variant="outline"
              size="lg"
              aria-pressed={accountType === type}
              onClick={() => {
                setAccountType(type);
                setError(null);
                touchField('proof');
              }}
              className={
                accountType === type
                  ? 'bg-brand-subtle dark:bg-brand-subtle/60 border-brand text-brand'
                  : 'bg-white dark:bg-sunken/70'
              }
            >
              {type === 'student' ? 'Student' : 'Lecturer or Staff'}
            </Button>
          ))}
        </div>
      </div>

      {accountType==='student' && inviteToken && (
        <Alert variant="success">
          {inviteDept ? `Class rep invitation: ${inviteDept}. Review is still required.` : 'Unconfirmed invitation. You can register normally.'}
        </Alert>
      )}
      {accountType==='staff' && (
        <StaffPathPicker value={staffPath} onChange={v=>{setStaffPath(v);setIdCardFile(null);scan.current?.abort();setOcrHint('');touchField('proof');}}/>
      )}

      {(accountType==='student' || staffPath==='id' || staffPath==='document') ? (
        <ProofDropzone
          file={idCardFile}
          onFile={(file) => {
            if (!file) {
              scan.current?.abort();
              setOcrHint('');
              setIdCardFile(null);
              return;
            }
            void handleProofFile(file);
          }}
          accept={accountType==='staff' && staffPath==='id' ? proofTypes.filter(t=>t.startsWith('image/')) : proofTypes}
          error={fieldErrors.proof}
          title={accountType === 'staff' ? staffProof : studentProof}
          required={accountType === 'staff'}
          note={ocrHint || 'Only you and authorized reviewers can access your proof.'}
        />
      ) : (
        <div className="border-t border-line/70 dark:border-line pt-4 text-left space-y-1">
          <div className="flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-brand shrink-0 mt-0.5" />
            <p className="text-xs font-semibold text-ink">Verify after sign-in</p>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            {staffPath === 'email'
              ? 'We’ll email a confirmation link to your @gsu.edu.ng inbox after you create your account.'
              : 'After sign-in, ask a verified staff member in your department to confirm your affiliation.'}
          </p>
        </div>
      )}
    </div>
  );

  const renderDetailsSection = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">{stepHeading?.heading}</h3>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{stepHeading?.hint}</p>
      </div>

      <Field label="Full Name" htmlFor="fullName" error={fieldErrors.fullName}>
        <Input
          id="fullName"
          type="text"
          minLength={2}
          maxLength={100}
          value={fullName}
          autoComplete="name"
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => touchField('fullName')}
          placeholder="e.g. Amina Bello Musa"
        />
      </Field>

      <Field
        label={accountType === 'staff' ? 'Staff ID' : 'Matric Number'}
        htmlFor="idNumber"
        error={fieldErrors.idNumber}
      >
        <Input
          id="idNumber"
          type="text"
          minLength={3}
          maxLength={120}
          value={idNumber}
          autoCapitalize="characters"
          autoComplete="username"
          className="font-mono"
          onChange={(e) => setIdNumber(entryIdentifier(e.target.value, true))}
          onBlur={(e) => {
            setIdNumber(entryIdentifier(e.target.value, true, true));
            touchField('idNumber');
          }}
          placeholder={accountType === 'staff' ? 'e.g. GSU/STF/1042' : 'e.g. UG21/CS/1001'}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3">
        <Field
          label={accountType === 'staff' ? 'Department or Office' : 'Department'}
          htmlFor="department-picker"
          error={fieldErrors.department}
        >
          <DepartmentPicker
            id="department-picker"
            departments={departments}
            value={department}
            onChange={(v) => { setDepartment(v); touchField('department'); }}
            customOptionLabel={
              accountType === 'staff'
                ? 'Other (Type department or office)'
                : 'Other (Type your department)'
            }
            customPlaceholder={
              accountType === 'staff'
                ? 'e.g. Registry, Bursary, ICT Directorate'
                : 'Enter your department name (e.g. Environmental Management)'
            }
          />
        </Field>

        {accountType === 'student' && (
          <div>
            <fieldset
              id="student-level-group"
              tabIndex={-1}
              aria-invalid={Boolean(fieldErrors.level)}
              aria-describedby={fieldErrors.level ? 'level-error' : undefined}
              className="outline-none"
            >
              <legend className="text-xs font-semibold mb-2">Student level</legend>
              <div className="grid grid-cols-3 gap-2">
                {[...availableLevels, 'graduate' as const].map(value => (
                  <label key={value} className={`flex items-center gap-2 rounded-xl border px-2 py-2 text-sm ${value==='graduate'?'col-span-full':''} ${level===value?'border-brand':'border-line'}`}>
                    <input type="radio" name="student-level" value={value} checked={level===value} onChange={()=>{setLevel(value);touchField('level');}} />
                    {value==='graduate' ? `Graduate — ${graduationLevelLabel()} only` : `${value} Level`}
                  </label>
                ))}
              </div>
            </fieldset>
            {fieldErrors.level && (
              <p id="level-error" className={errorTextClass}>{fieldErrors.level}</p>
            )}
            <p className="text-xs text-ink-muted mt-1.5 leading-relaxed">
              Select your actual level{sessionLabel ? ` for ${sessionLabel}` : ''}, not the level on an older document.
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const renderAccountSection = () => (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-ink">{stepHeading?.heading}</h3>
        <p className="text-xs text-ink-muted mt-1 leading-relaxed">{stepHeading?.hint}</p>
      </div>

      <Field
        label="Recovery email"
        htmlFor="email"
        error={fieldErrors.email}
        hint="Reset links go to this inbox. Use your matric number or staff ID to sign in."
      >
        <Input
          id="email"
          type="email"
          maxLength={120}
          value={email}
          autoComplete="email"
          leadingIcon={Mail}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => touchField('email')}
          placeholder="e.g. yourname@gmail.com"
        />
      </Field>

      <Field
        label="Phone Number"
        optional
        htmlFor="phone"
        error={fieldErrors.phone}
        hint="You can use this number to request a password reset."
      >
        <Input
          id="phone"
          type="tel"
          maxLength={20}
          value={phone}
          autoComplete="tel"
          leadingIcon={Phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => touchField('phone')}
          placeholder="e.g. 0803 123 4567"
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors.password}
        hint="Use at least 8 characters with a mix of cases, numbers and symbols."
      >
        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          minLength={minPasswordLength}
          value={password}
          autoComplete="new-password"
          leadingIcon={Lock}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => touchField('password')}
          placeholder="Enter your password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="min-w-[40px] min-h-[40px] flex items-center justify-center text-ink-muted hover:text-ink-soft cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />
        <PasswordStrengthMeter value={password} className="mt-2" />
      </Field>

      <Field
        label="Confirm Password"
        htmlFor="confirmPassword"
        error={fieldErrors.confirmPassword}
      >
        <Input
          id="confirmPassword"
          type={showPassword ? 'text' : 'password'}
          minLength={minPasswordLength}
          value={confirmPassword}
          autoComplete="new-password"
          leadingIcon={Lock}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => touchField('confirmPassword')}
          placeholder="Repeat your password"
        />
      </Field>
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
        {/* Left campus introduction panel */}
        <div className="lg:col-span-5 space-y-5 text-center lg:text-left px-2">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center shadow-resting">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink">
                GSU Connect
              </h1>
              <p className="text-sm text-brand font-medium">
                Gombe State University
              </p>
            </div>
          </div>

          <p className="text-ink-body dark:text-ink-soft text-base leading-relaxed max-w-md mx-auto lg:mx-0">
            Connect with your classmates and find relevant notices and study materials at GSU.
          </p>
          <p className="text-xs text-ink-muted max-w-md mx-auto lg:mx-0">
            An independent, student-built app. It is not an official GSU service and is not endorsed by the university.
          </p>

          <div className="hidden lg:grid grid-cols-1 gap-3 pt-2 text-sm text-ink-body dark:text-ink-soft">
            <div className="flex items-start gap-3 bg-white/80 dark:bg-surface/90 border border-line/80 dark:border-line rounded-2xl p-3.5">
              <UserCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink">Department &amp; Level Groups</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Automatically placed into GSU General and your department cohort upon approval.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 dark:bg-surface/90 border border-line/80 dark:border-line rounded-2xl p-3.5">
              <ShieldCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-ink">Verified Campus Access</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Staff accounts are reviewed by an admin. Student accounts are reviewed by an authorized reviewer in their department or by an admin.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right authentication card */}
        <div className="lg:col-span-7 w-full max-w-md mx-auto lg:max-w-none bg-surface rounded-3xl border border-line/80 dark:border-line shadow-resting p-6 sm:p-8">
          {mode !== 'forgot' ? (
            <>
              <ModeSwitch mode={mode === 'signup' ? 'signup' : 'login'} onChange={(next) => switchMode(next)} />

              {mode === 'signup' && (
                <Stepper
                  steps={stepperSteps}
                  current={step}
                  label="Signup progress"
                  className="mb-6"
                  onSelect={(key) => setStep(key as SignupStep)}
                />
              )}

              <form onSubmit={handleSubmit} noValidate className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <Alert variant="success">
                      Staff accounts are reviewed by an admin. Student accounts are reviewed by an authorized reviewer in their department or by an admin.
                    </Alert>

                    {step === 1 && renderProofSection()}
                    {step === 2 && renderDetailsSection()}
                    {step === 3 && renderAccountSection()}
                  </>
                )}

                {mode === 'signup' ? (
                  <div className="flex items-center gap-2.5 pt-1">
                    {step > 1 && (
                      <Button type="button" variant="outline" size="lg" onClick={() => setStep((prev) => (prev === 3 ? 2 : 1))}>
                        Back
                      </Button>
                    )}
                    {step < 3 ? (
                      <Button type="button" size="lg" full onClick={handleContinue}>
                        Continue
                      </Button>
                    ) : (
                      <>
                        {error && <Alert variant="error">{error}</Alert>}
                        {challenge.widget}
                        <Button type="submit" size="lg" full loading={submitting} loadingLabel="Creating account…">
                          Submit Registration
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {mode==='login' && signupNotice && (
                      <Alert variant="success">{signupNotice}</Alert>
                    )}
                    <Field
                      label="Matric number or staff ID"
                      htmlFor="idNumber"
                      error={fieldErrors.idNumber}
                      hint={
                        mode === 'login'
                          ? 'Your registered phone number is for password recovery, not sign-in.'
                          : undefined
                      }
                    >
                      <Input
                        id="idNumber"
                        type="text"
                        minLength={3}
                        maxLength={120}
                        value={idNumber}
                        autoCapitalize="none"
                        autoComplete="username"
                        className="font-mono"
                        onChange={(e) => setIdNumber(entryIdentifier(e.target.value, false))}
                        onBlur={(e) => {
                          setIdNumber(entryIdentifier(e.target.value, false, true));
                          touchField('idNumber');
                        }}
                        placeholder="e.g. UG21/CS/1001"
                      />
                    </Field>

                    <Field label="Password" htmlFor="password" error={fieldErrors.password}>
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        autoComplete="current-password"
                        leadingIcon={Lock}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => touchField('password')}
                        placeholder="Enter your password"
                        trailing={
                          <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-ink-muted hover:text-ink-soft cursor-pointer"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                      />
                    </Field>

                    {error && <Alert variant="error">{error}</Alert>}

                    {challenge.widget}
                    <Button type="submit" size="lg" full loading={submitting} loadingLabel="Signing in…">
                      Sign In
                    </Button>

                    {mode === 'login' && (
                      <div className="text-center pt-1">
                        <button
                          type="button"
                          onClick={() => switchMode('forgot')}
                          className="text-xs font-semibold text-brand hover:underline cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                          Forgot your password?
                        </button>
                      </div>
                    )}
                  </>
                )}
              </form>
            </>
          ) : (
            /* Forgot password form */
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-body dark:text-ink-soft hover:text-brand cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>

              <div>
                <h2 className="text-lg font-bold text-ink">
                  Reset your password
                </h2>
                <p className="text-sm text-ink-muted mt-1 leading-relaxed">
                  Enter an account identifier below, not the inbox where you receive reset links.
                </p>
              </div>

              {forgotSent ? (
                <div className="rounded-2xl bg-brand-subtle dark:bg-brand-subtle/50 border border-success-line dark:border-success-line/70 px-4 py-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                  <div className="text-sm text-brand leading-relaxed">
                    <p className="font-semibold">Check your inbox</p>
                    <p className="text-xs mt-1">
                      If an account exists for that ID, a password reset link has been sent
                      to the recovery email on file. The link expires in 1 hour. Check your spam
                      folder if you do not see it.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <Field
                    label="Matric number, staff ID or registered phone number"
                    htmlFor="forgotIdentifier"
                    error={fieldErrors.forgotIdentifier}
                  >
                    <Input
                      id="forgotIdentifier"
                      type="text"
                      minLength={3}
                      maxLength={120}
                      value={forgotIdentifier}
                      autoCapitalize="none"
                      autoComplete="username"
                      className="font-mono"
                      onChange={(e) => setForgotIdentifier(entryIdentifier(e.target.value))}
                      onBlur={(e) => {
                        setForgotIdentifier(entryIdentifier(e.target.value, false, true));
                        touchField('forgotIdentifier');
                      }}
                      placeholder="e.g. UG21/CS/1001"
                    />
                  </Field>

                  {error && <Alert variant="error">{error}</Alert>}

                  {challenge.widget}
                  <Button type="submit" size="lg" full loading={submitting} loadingLabel="Sending…">
                    Send Reset Link
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Set-new-password screen shown after the user clicks a password reset link.
 * Rendered by App.tsx when Supabase fires the PASSWORD_RECOVERY auth event.
 */
export const SetPasswordScreen: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'password' | 'confirmPassword', string>>
  >({});
  const [touched, setTouched] = useState<
    Partial<Record<'password' | 'confirmPassword', boolean>>
  >({});

  const touch = (name: 'password' | 'confirmPassword') =>
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }));

  const resetValidators: Record<
    'password' | 'confirmPassword',
    () => string | undefined
  > = {
    password: () => passwordError(password) || undefined,
    confirmPassword: () =>
      password !== confirmPassword ? 'Passwords do not match.' : undefined,
  };

  // Blur first, then live — so the strength rules are not read as nagging while
  // the password is still being typed.
  useEffect(() => {
    const live = (Object.keys(resetValidators) as ('password' | 'confirmPassword')[]).filter(
      (name) => touched[name] || fieldErrors[name],
    );
    if (live.length === 0) return;
    const next: Partial<Record<'password' | 'confirmPassword', string>> = {};
    live.forEach((name) => {
      const message = resetValidators[name]();
      if (message) next[name] = message;
    });
    setFieldErrors((prev) => {
      const keys = new Set<'password' | 'confirmPassword'>([
        ...(Object.keys(prev) as ('password' | 'confirmPassword')[]),
        ...(Object.keys(next) as ('password' | 'confirmPassword')[]),
      ]);
      let changed = false;
      keys.forEach((key) => {
        if (prev[key] !== next[key]) changed = true;
      });
      return changed ? next : prev;
    });
  }, [password, confirmPassword, touched, fieldErrors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const next: Partial<Record<'password' | 'confirmPassword', string>> = {};
    const weakPassword = passwordError(password);
    if (weakPassword) next.password = weakPassword;
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match.';
    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      setTouched({ password: true, confirmPassword: true });
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      onComplete();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto bg-surface rounded-3xl border border-line/80 dark:border-line shadow-resting p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center shadow-resting">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-ink">
              Set a New Password
            </h1>
            <p className="text-sm text-brand font-medium">
              GSU Connect
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Field label="New Password" htmlFor="newPassword" error={fieldErrors.password}>
            <Input
              id="newPassword"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={minPasswordLength}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => touch('password')}
              placeholder="Minimum 8 characters"
              leadingIcon={Lock}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center text-ink-muted hover:text-ink-soft cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
            />
          </Field>
          <PasswordStrengthMeter value={password} />

          <Field
            label="Confirm New Password"
            htmlFor="confirmPassword"
            error={fieldErrors.confirmPassword}
          >
            <Input
              id="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={minPasswordLength}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => touch('confirmPassword')}
              placeholder="Repeat your new password"
              leadingIcon={Lock}
            />
          </Field>

          {error && <Alert variant="error">{error}</Alert>}

          <Button type="submit" size="lg" full loading={submitting} loadingLabel="Updating…">
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
};
