import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  IdCard,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { requestPasswordReset, signInUser, signUpUser } from '../services/supabaseService';
import { supabase } from '../lib/supabase';
import {
  AcademicLevel,
  AccountType,
  DepartmentItem,
  formatFileSize,
  idToInternalEmail,
  levelsForDuration,
  MAX_ID_CARD_BYTES,
  normalizeIdNumber,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';

type AuthMode = 'login' | 'signup' | 'forgot';

function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('duplicate')) {
    return 'An account with this Matric Number / Staff ID already exists. Try signing in instead.';
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Please enter a valid email address or Matric Number / Staff ID.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect Matric Number, Staff ID, phone number, email, or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address via the verification link in your inbox before signing in.';
  }
  if (lower.includes('password should be at least') || lower.includes('weak')) {
    return 'Password must be at least 8 characters.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return raw;
}

interface AuthScreenProps {
  departments: DepartmentItem[];
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ departments }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [accountType, setAccountType] = useState<AccountType>('student');
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [department, setDepartment] = useState(
    departments.find((d) => d.name === 'Computer Science')?.name ||
      departments[0]?.name ||
      'Computer Science'
  );
  const [level, setLevel] = useState<AcademicLevel>('100');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionLabel, setSessionLabel] = useState('2026/2027');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedPreview = normalizeIdNumber(idNumber);
  const isLoginEmail = mode === 'login' && idNumber.trim().includes('@');

  // Load the current academic session label (e.g. "2026/2027") for the level warning.
  useEffect(() => {
    let active = true;
    supabase
      .rpc('session_end_year')
      .then(({ data, error }) => {
        if (!active || error) return;
        const endYear = Number(data);
        if (Number.isFinite(endYear) && endYear > 2000) {
          setSessionLabel(`${endYear - 1}/${endYear}`);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  // Levels available for the selected department (driven by course length).
  const selectedDuration =
    departments.find((d) => d.name.toLowerCase() === department.trim().toLowerCase())
      ?.durationYears ?? 4;
  const availableLevels = levelsForDuration(selectedDuration);

  // If the current level is not valid for the newly selected department, reset to 100.
  useEffect(() => {
    if (accountType === 'student' && !availableLevels.includes(level)) {
      setLevel('100');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [department, accountType]);

  const handleSelectIdCard = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ID_CARD_BYTES) {
      setError('File exceeds the 3 MB limit. Please choose a smaller photo or PDF.');
      return;
    }
    setError(null);
    setIdCardFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await signInUser(idNumber, password);
      } else if (mode === 'forgot') {
        await requestPasswordReset(forgotIdentifier);
        setForgotSent(true);
      } else {
        if (department.trim().length < 2) {
          throw new Error(
            accountType === 'staff'
              ? 'Please select or enter your department or office (at least 2 characters).'
              : 'Please select or enter your department (at least 2 characters).'
          );
        }
        await signUpUser({
          fullName,
          idNumber,
          accountType,
          department,
          level: accountType === 'staff' ? 'Staff' : level,
          password,
          recoveryEmail: email,
          phone,
          idCardFile,
        });
      }
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError(null);
    setForgotSent(false);
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] dark:bg-slate-950 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">
        {/* Left campus introduction panel */}
        <div className="lg:col-span-5 space-y-5 text-center lg:text-left px-2">
          <div className="inline-flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-sm">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                GSU Connect
              </h1>
              <p className="text-sm text-emerald-800 dark:text-emerald-400 font-medium">
                Gombe State University
              </p>
            </div>
          </div>

          <p className="text-slate-600 dark:text-slate-300 text-base leading-relaxed max-w-md mx-auto lg:mx-0">
            Campus messaging built for verified GSU students, class reps, departmental helpers, and lecturers.
          </p>

          <div className="hidden lg:grid grid-cols-1 gap-3 pt-2 text-sm text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-3 bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5">
              <UserCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Department &amp; Level Groups</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Automatically placed into GSU General and your department cohort upon approval.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-white/80 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3.5">
              <ShieldCheck className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">Verified Campus Access</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Every account is reviewed and approved by an admin, class rep, or department helper before campus access is granted.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right authentication card */}
        <div className="lg:col-span-7 w-full max-w-md mx-auto lg:max-w-none bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8">
          {mode !== 'forgot' ? (
            <>
              {/* Segmented mode switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl mb-6">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    mode === 'login'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    mode === 'signup'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        I am a:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAccountType('student');
                            setError(null);
                          }}
                          className={`min-h-[44px] rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                            accountType === 'student'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-900 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          Student
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAccountType('staff');
                            setError(null);
                          }}
                          className={`min-h-[44px] rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                            accountType === 'staff'
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-600 text-emerald-900 dark:text-emerald-200'
                              : 'bg-white dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                          }`}
                        >
                          Lecturer or Staff
                        </button>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Full Name
                      </label>
                      <input
                        id="fullName"
                        type="text"
                        required
                        minLength={2}
                        maxLength={100}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Amina Bello Musa"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="idNumber" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    {mode === 'login'
                      ? 'Matric Number, Staff ID, Phone, or Email'
                      : accountType === 'staff'
                        ? 'Staff ID'
                        : 'Matric Number'}
                  </label>
                  <input
                    id="idNumber"
                    type="text"
                    required
                    minLength={3}
                    maxLength={120}
                    value={idNumber}
                    onChange={(e) => setIdNumber(e.target.value)}
                    placeholder={
                      mode === 'login'
                        ? 'e.g. UG21/CS/1001, 0803 123 4567, or name@gmail.com'
                        : accountType === 'staff'
                          ? 'e.g. GSU/STF/1042'
                          : 'e.g. UG21/CS/1001'
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
                  {!isLoginEmail && normalizedPreview.length >= 3 && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono truncate">
                      ID handle: {idToInternalEmail(idNumber)}
                    </p>
                  )}
                </div>

                {mode === 'signup' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className={accountType === 'staff' ? 'sm:col-span-2' : ''}>
                        <label htmlFor="department-picker" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          {accountType === 'staff' ? 'Department or Office' : 'Department'}
                        </label>
                        <DepartmentPicker
                          id="department-picker"
                          departments={departments}
                          value={department}
                          onChange={setDepartment}
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
                      </div>

                      {accountType === 'student' && (
                        <div>
                          <label htmlFor="level" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            Level
                          </label>
                          <select
                            id="level"
                            value={level}
                            onChange={(e) => setLevel(e.target.value as AcademicLevel)}
                            className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 text-sm tabular-nums focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                          >
                            {availableLevels.map((lvl) => (
                              <option key={lvl} value={lvl}>
                                {lvl} Level
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                            Please select your current level for the {sessionLabel} academic
                            session. Your class chat is assigned automatically.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Email (compulsory — password reset links go here) */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2">
                      <label htmlFor="email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="email"
                          type="email"
                          required
                          maxLength={120}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="e.g. yourname@gmail.com"
                          className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        If you forget your password, a reset link will be sent to this email.
                        Use an email you can access, such as your personal Gmail.
                      </p>
                    </div>

                    {/* Phone number (optional — also works as a sign-in option) */}
                    <div>
                      <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Phone Number <span className="font-normal text-slate-500 dark:text-slate-400">(Optional)</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="phone"
                          type="tel"
                          maxLength={20}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="e.g. 0803 123 4567"
                          className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        You can also sign in with this phone number later.
                      </p>
                    </div>

                    {/* Student ID Card or Course Registration Form upload */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <IdCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {accountType === 'staff'
                              ? 'Staff ID Card Photo'
                              : 'Student ID Card or Course Registration Form'}{' '}
                            <span className="font-normal text-slate-500 dark:text-slate-400">(Optional)</span>
                          </span>
                        </div>
                        <input
                          ref={idCardInputRef}
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleSelectIdCard}
                          className="hidden"
                        />
                        {idCardFile ? (
                          <button
                            type="button"
                            onClick={() => setIdCardFile(null)}
                            className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => idCardInputRef.current?.click()}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-600 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer shrink-0"
                          >
                            Choose File
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {idCardFile
                          ? `Selected: ${idCardFile.name} (${formatFileSize(idCardFile.size)})`
                          : accountType === 'staff'
                            ? 'Attach your staff ID card (max 3 MB) to speed up verification by an admin.'
                            : 'Attach your student ID card or course registration form (max 3 MB) to speed up verification. 100 level students without an ID card yet can upload their course registration form.'}
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="password" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters"
                      className="w-full min-h-[44px] pl-10 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-3.5 py-3 text-xs text-red-800 dark:text-red-300 leading-relaxed"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                >
                  {submitting
                    ? mode === 'login'
                      ? 'Signing in...'
                      : 'Creating account...'
                    : mode === 'login'
                      ? 'Sign In'
                      : 'Submit Registration'}
                </button>

                {mode === 'login' && (
                  <div className="text-center pt-1">
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      Forgot your password?
                    </button>
                  </div>
                )}

                {mode === 'signup' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center leading-relaxed pt-1">
                    {accountType === 'staff'
                      ? 'Lecturer and Staff accounts are reviewed and approved by an admin before access is granted.'
                      : 'Every account is reviewed and approved by an admin, class rep, or department helper.'}
                  </p>
                )}
              </form>
            </>
          ) : (
            /* Forgot password form */
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </button>

              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Reset your password
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Enter your Matric Number, Staff ID, phone number, or email. We will send
                  a reset link to the email on your account.
                </p>
              </div>

              {forgotSent ? (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-4 py-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">
                    <p className="font-semibold">Check your inbox</p>
                    <p className="text-xs mt-1">
                      If an account exists for that ID, a password reset link has been sent
                      to the email on file. The link expires in 1 hour. Check your spam
                      folder if you do not see it.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="forgotIdentifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Matric Number, Staff ID, Phone, or Email
                    </label>
                    <input
                      id="forgotIdentifier"
                      type="text"
                      required
                      minLength={3}
                      maxLength={120}
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="e.g. UG21/CS/1001, 0803 123 4567, or name@gmail.com"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                    />
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-3.5 py-3 text-xs text-red-800 dark:text-red-300 leading-relaxed"
                    >
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full min-h-[48px] rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
                  >
                    {submitting ? 'Sending...' : 'Send Reset Link'}
                  </button>
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);
      onComplete();
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F8F7] dark:bg-slate-950 flex flex-col justify-center px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center shadow-sm">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Set a New Password
            </h1>
            <p className="text-sm text-emerald-800 dark:text-emerald-400 font-medium">
              GSU Connect
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="newPassword" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full min-h-[44px] pl-10 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Confirm New Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your new password"
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-3.5 py-3 text-xs text-red-800 dark:text-red-300 leading-relaxed"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[48px] rounded-2xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
};
