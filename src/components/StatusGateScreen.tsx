import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Edit3,
  IdCard,
  LogOut,
  ShieldAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  signOutUser,
  updateUserLastSeen,
  uploadIdCardFile,
  type SupabaseAuthUser,
} from '../services/supabaseService';
import {
  AcademicLevel,
  AppUser,
  DepartmentItem,
  formatLevelLabel,
  levelsForDuration,
  MAX_ID_CARD_BYTES,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';

interface StatusGateScreenProps {
  user: AppUser;
  authUser: SupabaseAuthUser | null;
  departments: DepartmentItem[];
}

function toTitleCase(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function extractFileNameFromPath(path?: string | null): string {
  if (!path) return '';
  const base = path.split('/').pop() || path;
  const withoutUuid = base.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
    ''
  );
  return withoutUuid || base;
}

export const StatusGateScreen: React.FC<StatusGateScreenProps> = ({
  user,
  authUser,
  departments,
}) => {
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [hasIdCard, setHasIdCard] = useState(Boolean(user.idCardPath));
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  // Displayed department & level (updated optimistically on save since profiles isn't realtime)
  const [displayDepartment, setDisplayDepartment] = useState(user.department);
  const [displayLevel, setDisplayLevel] = useState<AcademicLevel>(user.level);

  // Pending student "Edit details" inline form state
  const [editingDetails, setEditingDetails] = useState(false);
  const [editDepartment, setEditDepartment] = useState(user.department);
  const [editLevel, setEditLevel] = useState<AcademicLevel | ''>(
    user.level === 'Staff' ? '' : user.level
  );
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Recovery email state (read from account_recovery table)
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [loadingRecovery, setLoadingRecovery] = useState(true);
  const [editingRecovery, setEditingRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  useEffect(() => {
    setHasIdCard(Boolean(user.idCardPath));
  }, [user.idCardPath]);

  useEffect(() => {
    setDisplayDepartment(user.department);
    setDisplayLevel(user.level);
  }, [user.department, user.level]);

  useEffect(() => {
    let active = true;
    if (!authUser) {
      setLoadingRecovery(false);
      return;
    }
    setLoadingRecovery(true);
    supabase
      .from('account_recovery')
      .select('*')
      .limit(1)
      .maybeSingle()
      .then(
        ({ data, error }) => {
          if (!active) return;
          if (!error && data && typeof data === 'object') {
            const row = data as { email?: string | null; recovery_email?: string | null };
            const found = (row.email || row.recovery_email || '').trim();
            setRecoveryEmail(found || '');
          } else {
            setRecoveryEmail('');
          }
          setLoadingRecovery(false);
        },
        () => {
          if (!active) return;
          setRecoveryEmail('');
          setLoadingRecovery(false);
        }
      );
    return () => {
      active = false;
    };
  }, [authUser]);

  const isSuspended = user.status === 'suspended';
  const isRejected = user.status === 'rejected';
  const isPending = user.status === 'pending';
  const isPendingStudent = isPending && user.accountType === 'student' && !user.is_alumni;
  const isLecturerRequest =
    user.accountType === 'staff' || user.requestedRole === 'lecturer';

  const selectedDuration =
    departments.find((d) => d.name.toLowerCase() === editDepartment.trim().toLowerCase())
      ?.durationYears ?? 4;
  const availableLevels = levelsForDuration(selectedDuration);

  useEffect(() => {
    if (editingDetails && editLevel && !availableLevels.includes(editLevel)) {
      setEditLevel('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editDepartment, editingDetails]);

  const handleOpenEditDetails = () => {
    setEditDepartment(displayDepartment);
    setEditLevel(displayLevel === 'Staff' ? '' : displayLevel);
    setDetailsError(null);
    setEditingDetails(true);
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingDetails) return;
    const cleanDept = editDepartment.trim();
    if (!cleanDept || cleanDept.length < 2) {
      setDetailsError('Please select your department.');
      return;
    }
    if (!editLevel) {
      setDetailsError('Please select your level.');
      return;
    }

    setSavingDetails(true);
    setDetailsError(null);
    setFeedback(null);
    try {
      const { error } = await supabase.rpc('update_own_pending_details', {
        p_department: cleanDept,
        p_level: editLevel,
      });
      if (error) {
        throw new Error(error.message);
      }
      setDisplayDepartment(cleanDept);
      setDisplayLevel(editLevel as AcademicLevel);
      setEditingDetails(false);
      setFeedback({
        type: 'info',
        text: 'Details updated. Your reviewer will see the corrected information.',
      });
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'Failed to update details.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleOpenEditRecovery = () => {
    setRecoveryInput(recoveryEmail || '');
    setRecoveryError(null);
    setEditingRecovery(true);
  };

  const handleSaveRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRecovery) return;
    const clean = recoveryInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      setRecoveryError('Please enter a valid email address.');
      return;
    }

    setSavingRecovery(true);
    setRecoveryError(null);
    try {
      const { error } = await supabase.rpc('set_recovery_email', {
        new_email: clean,
      });
      if (error) {
        throw new Error(error.message);
      }
      setRecoveryEmail(clean);
      setEditingRecovery(false);
      setFeedback({
        type: 'info',
        text: 'Recovery email updated.',
      });
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : 'Failed to update recovery email.');
    } finally {
      setSavingRecovery(false);
    }
  };

  const handleUploadIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ID_CARD_BYTES) {
      setFeedback({
        type: 'error',
        text: 'ID card file exceeds the 3 MB limit. Please pick a smaller image.',
      });
      return;
    }

    setUploadingIdCard(true);
    setFeedback(null);
    try {
      await uploadIdCardFile(user.uid, file);
      setHasIdCard(true);
      setUploadedFileName(file.name);
      setFeedback({
        type: 'info',
        text: 'File uploaded securely. Your reviewer can now view it during verification.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to upload file.',
      });
    } finally {
      setUploadingIdCard(false);
    }
  };

  const Icon = isSuspended
    ? ShieldAlert
    : isRejected
      ? XCircle
      : Clock;
  const iconTone =
    isSuspended || isRejected
      ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300';

  const title = isSuspended
    ? 'Account Suspended'
    : isRejected
      ? 'Registration Not Approved'
      : isLecturerRequest
        ? 'Pending Admin Verification'
        : 'Waiting for Approval';

  const attachedFileName = uploadedFileName || extractFileNameFromPath(user.idCardPath);

  const description = isSuspended
    ? 'Your GSU Connect account has been suspended by an administrator due to a moderation review. You cannot read or send messages while suspended.'
    : isRejected
      ? 'Your registration could not be verified by your department approver or administrator. Please contact your Class Rep or Administrator if this was a mistake.'
      : 'Your registration has been received.';

  const statusBadgeClass =
    user.status === 'approved'
      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
      : isRejected || isSuspended
        ? 'bg-red-100 dark:bg-red-950/70 text-red-700 dark:text-red-300'
        : 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300';

  return (
    <div className="min-h-screen bg-[#F6F8F7] dark:bg-slate-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-8 text-center space-y-5">
        <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${iconTone}`}>
          <Icon className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{description}</p>
        </div>

        {isPending && (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 px-4 py-3 text-left space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">What happens next</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Your account will be reviewed by your department helper, class rep, or an admin — as soon as possible. To speed things up, ask your class rep or department helper to approve you. You&apos;ll get full access as soon as it&apos;s approved; this page updates automatically, so no need to refresh.
            </p>
          </div>
        )}

        {(isRejected || isSuspended) && (
          <div className="space-y-2.5 text-left">
            {user.rejectionReason && (
              <div className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-4 py-3 text-xs text-red-800 dark:text-red-200 space-y-0.5">
                <p className="font-bold">Reason provided:</p>
                <p>{user.rejectionReason}</p>
              </div>
            )}
            <p className="text-xs text-slate-600 dark:text-slate-300 text-center leading-relaxed">
              Think this is a mistake? Contact support at{' '}
              <a
                href="mailto:GSUConnect0@gmail.com"
                className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                GSUConnect0@gmail.com
              </a>
            </p>
          </div>
        )}

        {!isSuspended && authUser && (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <IdCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  {hasIdCard ? (
                    <>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug break-all">
                        {attachedFileName || 'Attached verification file'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Attached for reviewer verification
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {user.accountType === 'staff'
                          ? 'Staff ID Card'
                          : 'Upload Student ID Card or Course Registration Form'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Helps approvers verify you faster (max 3 MB)
                      </p>
                    </>
                  )}
                </div>
              </div>
              <input
                ref={idCardInputRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={handleUploadIdCard}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingIdCard}
                onClick={() => idCardInputRef.current?.click()}
                className="min-h-[36px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-600 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>
                  {uploadingIdCard ? 'Uploading...' : hasIdCard ? 'Replace' : 'Upload'}
                </span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Only your reviewer can view this file. It is deleted after your account is approved.
            </p>
          </div>
        )}

        {feedback && (
          <div
            role="status"
            className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed text-left ${
              feedback.type === 'error'
                ? 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-300'
                : 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200'
            }`}
          >
            {feedback.text}
          </div>
        )}

        <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-4 text-left space-y-2.5 text-sm border border-slate-100 dark:border-slate-700/80">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Full Name</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">
              {toTitleCase(user.fullName)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">
              {user.accountType === 'staff' ? 'Staff ID' : 'Matric No.'}
            </span>
            <span className="font-mono font-medium text-slate-900 dark:text-slate-100 text-right">{user.idNumber}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">Requested Role</span>
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">
              {isLecturerRequest ? 'Lecturer / Staff' : 'Student'}
            </span>
          </div>

          {!editingDetails ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500 dark:text-slate-400">
                  {user.accountType === 'staff' ? 'Department / Office' : 'Department'}
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100 text-right">
                  {displayDepartment}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-slate-500 dark:text-slate-400">Level</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100 text-right">
                    {formatLevelLabel(displayLevel, user.is_alumni)}
                  </span>
                  {isPendingStudent && (
                    <button
                      type="button"
                      onClick={handleOpenEditDetails}
                      className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" />
                      <span>Edit details</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <form
              onSubmit={handleSaveDetails}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-3"
            >
              <div>
                <label
                  htmlFor="edit-pending-department"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Department
                </label>
                <DepartmentPicker
                  id="edit-pending-department"
                  departments={departments}
                  value={editDepartment}
                  onChange={setEditDepartment}
                />
              </div>

              <div>
                <label
                  htmlFor="edit-pending-level"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Level
                </label>
                <div className="relative">
                  <select
                    id="edit-pending-level"
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value as AcademicLevel | '')}
                    className="appearance-none w-full min-h-[44px] px-3.5 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium tabular-nums focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/15 transition-colors cursor-pointer"
                  >
                    <option value="">Select level</option>
                    {availableLevels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl} Level
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {detailsError && (
                <p className="text-xs text-red-700 dark:text-red-300">{detailsError}</p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={savingDetails}
                  onClick={() => {
                    setEditingDetails(false);
                    setDetailsError(null);
                  }}
                  className="min-h-[36px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingDetails}
                  className="min-h-[36px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingDetails ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          )}

          {user.email && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">GSU Email</span>
              <span className="font-mono text-xs text-slate-900 dark:text-slate-100 text-right break-all">
                {user.email}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Recovery Email</span>
              {!editingRecovery && authUser && !loadingRecovery && (
                <button
                  type="button"
                  onClick={handleOpenEditRecovery}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit details</span>
                </button>
              )}
            </div>
            {!editingRecovery && (
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100 break-all">
                {loadingRecovery ? 'Loading...' : recoveryEmail || 'Not set'}
              </p>
            )}
            {editingRecovery && (
              <form onSubmit={handleSaveRecovery} className="space-y-2 pt-0.5">
                <div className="flex items-center gap-2">
                  <input
                    type="email"
                    required
                    maxLength={120}
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="flex-1 min-w-0 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
                  />
                  <button
                    type="submit"
                    disabled={savingRecovery}
                    className="min-h-[38px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    {savingRecovery ? '...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    disabled={savingRecovery}
                    onClick={() => {
                      setEditingRecovery(false);
                      setRecoveryError(null);
                    }}
                    className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-60 shrink-0"
                  >
                    Cancel
                  </button>
                </div>
                {recoveryError && (
                  <p className="text-[11px] text-red-700 dark:text-red-300">{recoveryError}</p>
                )}
              </form>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Password reset links are sent here.
            </p>
          </div>

          <div className="flex justify-between items-center gap-3">
            <span className="text-slate-500 dark:text-slate-400">Status</span>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusBadgeClass}`}
            >
              {user.status}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            await updateUserLastSeen(user.uid).catch(() => undefined);
            await signOutUser();
          }}
          className="w-full min-h-[48px] rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};
