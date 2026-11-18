import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
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
  levelsForDuration,
  MAX_ID_CARD_BYTES,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';

type AuthMode = 'login' | 'signup' | 'forgot';
type LevelSelection = AcademicLevel | 'graduate' | '';

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
  if (lower.includes('please wait') && (lower.includes('second') || lower.includes('minute'))) {
    return raw;
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return 'Network error. Please check your internet connection and try again.';
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
  const [department, setDepartment] = useState('');
  const [level, setLevel] = useState<LevelSelection>('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idCardFile, setIdCardFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionEndYear, setSessionEndYear] = useState<number | null>(null);
  const [sessionLabel, setSessionLabel] = useState('2026/2027');
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  const graduationClassYear = sessionEndYear !== null ? sessionEndYear - 1 : null;

  // Load the current academic session end year (e.g. 2027 -> "2026/2027", Graduate Class of 2026).
  useEffect(() => {
    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadSessionEndYear = async (allowRetry: boolean) => {
      try {
        const { data, error: rpcError } = await supabase.rpc('session_end_year');
        if (!active) return;
        if (!rpcError) {
          const endYear = Number(data);
          if (Number.isFinite(endYear) && endYear > 2000) {
            setSessionEndYear(endYear);
            setSessionLabel(`${endYear - 1}/${endYear}`);
            return;
          }
        }
      } catch {
        // Fall through to optional retry
      }
      if (active && allowRetry) {
        retryTimer = setTimeout(() => {
          void loadSessionEndYear(false);
        }, 1500);
      }
    };

    void loadSessionEndYear(true);

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
        let resolvedGradClassYear = graduationClassYear;
        if (isGraduateSelected && resolvedGradClassYear === null) {
          try {
            const { data, error: rpcError } = await supabase.rpc('session_end_year');
            const endYear = !rpcError ? Number(data) : NaN;
            if (Number.isFinite(endYear) && endYear > 2000) {
              setSessionEndYear(endYear);
              setSessionLabel(`${endYear - 1}/${endYear}`);
              resolvedGradClassYear = endYear - 1;
            }
          } catch {
            // Handled below
          }
          if (resolvedGradClassYear === null) {
            throw new Error("Couldn't confirm the current session year. Please try again.");
          }
        }
        const finalNumericLevel =
          availableLevels[availableLevels.length - 1] ?? ('400' as AcademicLevel);
        const submittedLevel: AcademicLevel =
          accountType === 'staff'
            ? 'Staff'
            : isGraduateSelected
              ? finalNumericLevel
              : (level as AcademicLevel);

        await signUpUser({
          fullName,
          idNumber,
          accountType,
          department,
          level: submittedLevel,
          password,
          recoveryEmail: email,
          phone,
          idCardFile,
          ...(isGraduateSelected && resolvedGradClassYear !== null
            ? {
                isGraduate: true,
                graduationClassYear: resolvedGradClassYear,
              }
            : {}),
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
    setForgotIdentifier('');
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
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-900/60 rounded-xl px-3.5 py-2.5 leading-relaxed">
                      Every account is verified by an admin, class rep, or department helper before access is granted.
                    </p>

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
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
                        ? 'Matric, Staff ID, phone or email'
                        : accountType === 'staff'
                          ? 'e.g. GSU/STF/1042'
                          : 'e.g. UG21/CS/1001'
                    }
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                  />
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
                          <div className="relative">
                            <select
                              id="level"
                              value={level}
                              onChange={(e) => setLevel(e.target.value as LevelSelection)}
                              className="appearance-none w-full min-h-[44px] px-3.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium tabular-nums focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 transition-colors cursor-pointer"
                            >
                              <option value="">Select level</option>
                              {availableLevels.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                  {lvl} Level
                                </option>
                              ))}
                              <option value="graduate">
                                {graduationClassYear !== null
                                  ? `Graduate — Class of ${graduationClassYear}`
                                  : 'Graduate (previous session)'}
                              </option>
                            </select>
                            <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                            Choose your current level for the {sessionLabel} session. If you
                            completed your programme in the previous session, choose{' '}
                            {graduationClassYear !== null
                              ? `Graduate — Class of ${graduationClassYear}`
                              : 'Graduate (previous session)'}
                            .
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Email (compulsory — password reset links go here) */}
                    <div>
                      <label htmlFor="email" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
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
                          className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
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
                          className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
                        />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                        You can also sign in with this phone number later.
                      </p>
                    </div>

                    {/* Student ID Card or Course Registration Form upload */}
                    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2">
                      <div className="flex items-start gap-2">
                        <IdCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
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
                      <div>
                        {idCardFile ? (
                          <button
                            type="button"
                            onClick={() => setIdCardFile(null)}
                            className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => idCardInputRef.current?.click()}
                            className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-600 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
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
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Only your reviewer can view this file. It is deleted after your account is approved.
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
                      placeholder="Enter your password"
                      className="w-full min-h-[44px] pl-10 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
                  {mode === 'signup' && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Minimum 8 characters.
                    </p>
                  )}
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
                  Enter your Matric Number, Staff ID, registered phone number, GSU sign-in
                  email, or recovery email. If multiple accounts share your recovery email,
                  use the sign-in ID for the account you want to reset.
                </p>
              </div>

              {forgotSent ? (
                <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/70 px-4 py-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">
                    <p className="font-semibold">Check your inbox</p>
                    <p className="text-xs mt-1">
                      If the details you entered identify one account, look for a reset link
                      in its recovery inbox. The link expires in 1 hour. Check your spam
                      folder if you do not see it.
                    </p>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="mt-2 text-xs font-semibold underline underline-offset-2 min-h-[44px] cursor-pointer"
                    >
                      Try a different ID or email
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="forgotIdentifier" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Sign-in ID or recovery email
                    </label>
                    <input
                      id="forgotIdentifier"
                      type="text"
                      autoComplete="off"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      minLength={3}
                      maxLength={120}
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      placeholder="Matric Number, Staff ID, phone, or email"
                      className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm font-mono focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
                className="w-full min-h-[44px] pl-10 pr-12 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
                className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15"
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
