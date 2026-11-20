import {StaffPathPicker,StaffProofAction,staffPaths,type StaffPath} from './StaffVerification';
import {noFileMessage, prepareReviewProof} from '../utils/prepareReviewProof';
import {studentProof,staffProof} from '../utils/proof';
import {takeEntryIssue} from '../services/entryFeedback';
import { mapProfileRowToAppUser } from '../services/supabaseService';
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
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';

interface StatusGateScreenProps {
  user: AppUser;
  authUser: SupabaseAuthUser | null;
  departments: DepartmentItem[];
  onChecked:(profile:AppUser)=>void;
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
  departments, onChecked,
}) => {
  const [uploadingIdCard, setUploadingIdCard] = useState(false);
  const [staffPath,setStaffPath]=useState<StaffPath>(()=>{const hint=authUser?.user_metadata?.staff_proof_route;return location.hash.startsWith('#staff-confirm=')?'email':Object.hasOwn(staffPaths,hint)?hint:'email';});
  useEffect(()=>{const route=()=>{if(location.hash.startsWith('#staff-confirm='))setStaffPath('email')};window.addEventListener('hashchange',route);return()=>window.removeEventListener('hashchange',route);},[]);
  const [method,setMethod]=useState(''),[vouchState,setVouchState]=useState('');
  const [hasIdCard, setHasIdCard] = useState<boolean | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [uploadStep, setUploadStep] = useState('');
  const [retrySubmit, setRetrySubmit] = useState(false);


  const [checkMessage, setCheckMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const checkSeq = useRef(0);
  const check = React.useCallback(
    async (manual = false) => {
      const seq = ++checkSeq.current;
      if (manual) {
        setChecking(true);
        setCheckMessage('Checking…');
      }
      try {
        const { data, error } = await supabase.rpc('check_own_entry');
        if (error || !data || data.id !== user.uid) throw Error('Unavailable');
        if (seq !== checkSeq.current) return;
        const profile = mapProfileRowToAppUser(data);
        onChecked(profile);
        const ready=Boolean(data.proof_method || profile.idCardPath);setMethod(data.proof_method || '');setVouchState(data.vouch_state||'');setHasIdCard(ready);
        setCheckMessage(
          manual
            ? profile.status === 'pending'
              ? ready
                ? 'Still pending — proof received.'
                : 'Not submitted — complete your proof to finish verification.'
              : `Account ${profile.status}.`
            : '',
        );
      } catch {
        if (seq === checkSeq.current) {
          setHasIdCard(null);
          setCheckMessage('Could not check current status. Try again when connected.');
        }
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    },
    [user.uid, onChecked],
  );
  useEffect(() => {
    const onIssue = () => {
      const text = takeEntryIssue(user.uid);
      if (text) setFeedback({ type: 'error', text });
    };
    onIssue();
    const refresh = () => {
      if (!document.hidden) void check();
    };
    window.addEventListener('entry-uploaded', refresh);
    window.addEventListener('entry-feedback', onIssue);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channel = supabase
      .channel(`entry-status:${user.uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entry_changes', filter: `user_id=eq.${user.uid}` },
        refresh,
      )
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') refresh();
      });
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      checkSeq.current++;
      clearInterval(timer);
      void supabase.removeChannel(channel);
      window.removeEventListener('entry-uploaded', refresh);
      window.removeEventListener('online', refresh);
      window.removeEventListener('entry-feedback', onIssue);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user.uid, check]);
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
      .select('email').eq('user_id',authUser.id)
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
  const canEditStudentDetails = (isPending || isRejected) && user.accountType === 'student';
  const isLecturerRequest =
    user.accountType === 'staff' || user.requestedRole === 'lecturer';

  const selectedDuration =
    departments.find((d) => d.name.toLowerCase() === editDepartment.trim().toLowerCase())
      ?.durationYears ?? 4;
  const availableLevels:AcademicLevel[] = [...levelsForDuration(selectedDuration),'Class of 2026'];

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
    if (cleanDept.length < 2 || cleanDept.length > 80 || /[\x00-\x1f\x7f]/.test(cleanDept)) {
      setDetailsError('Please select your department.');
      return;
    }
    if (!editLevel || !availableLevels.includes(editLevel)) {
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

  const noFile = () => setFeedback({type:'error', text:noFileMessage});
  const submitAttached = async () => {
    setUploadStep('Submitting…');
    const {error} = await supabase.rpc('resubmit_signup');
    if (error) throw error;
    setRetrySubmit(false);
  };
  const finishUpload = async () => {
    setFeedback({type:'info', text:'Proof uploaded. Waiting for review.'});
    await check();
  };
  const submitOnly = async () => {
    setUploadingIdCard(true);
    setFeedback(null);
    try { await submitAttached(); await finishUpload(); }
    catch { setFeedback({type:'error', text:'Submission failed. Your proof is attached. Retry submission without uploading it again.'}); }
    finally { setUploadingIdCard(false); setUploadStep(''); }
  };
  const handleUploadIdCard = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const original = e.target.files?.[0];
    e.target.value = '';
    if (!original) { noFile(); return; }
    setUploadingIdCard(true);
    setFeedback(null);
    let stage = 'prepare';
    try {
      setUploadStep('Preparing file…');
      const file = await prepareReviewProof(original);
      stage = 'upload'; setUploadStep('Uploading…');
      await uploadIdCardFile(user.uid,file,isLecturerRequest?staffPath:undefined, () => {
        stage = 'attach'; setUploadStep('Attaching proof…');
      });
      setHasIdCard(true);
      setUploadedFileName(original.name);
      if (isRejected) { stage = 'submit'; setRetrySubmit(true); await submitAttached(); }
      await finishUpload();
    } catch (err) {
      const reason = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Check your connection and try again.';
      const label = stage === 'submit' ? 'Submission failed. Your proof is attached. Retry submission without uploading it again.'
        : stage === 'attach' ? 'Attaching proof failed.' : stage === 'upload' ? 'Upload failed.' : '';
      setFeedback({type:'error',text:`${label} ${reason}`.trim()});
    } finally { setUploadingIdCard(false); setUploadStep(''); }
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
      : hasIdCard===null ? 'Verification Status' : !hasIdCard ? 'Finish Verification' : isLecturerRequest
        ? 'Pending Admin Verification'
        : 'Waiting for Approval';

  const attachedFileName = uploadedFileName || extractFileNameFromPath(user.idCardPath);

  const description = isSuspended
    ? 'Your GSU Connect account has been suspended by an administrator due to a moderation review. You cannot read or send messages while suspended.'
    : isRejected
      ? (isLecturerRequest ? 'An admin could not verify your staff registration. Check the reason or contact support.' : 'Check the rejection reason below. You can edit your department and level, then upload replacement proof to resubmit for review.')
      : hasIdCard===null ? 'Check whether your proof has reached the review queue.' : hasIdCard ? 'Your proof has been submitted.' : 'Your account exists. Complete verification below to enter the review queue.';

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

        {isPending && !isLecturerRequest && hasIdCard === false && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">Upload proof to enter the review queue.</p>
        )}
        {isPending && (
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 px-4 py-3 text-left space-y-1">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">What happens next</p>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {hasIdCard ? (isLecturerRequest ? 'An admin will review your staff submission.' : 'An authorized reviewer will check your submission.') : 'You can return later. Your account cannot enter the workspace before approval.'}
            </p>
          </div>
        )}

        <button type="button" disabled={checking} onClick={()=>void check(true)} className="min-h-[44px] font-semibold text-emerald-700">Check status</button>
        <p role="status">{checkMessage}</p>
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

        {!isSuspended && authUser && isLecturerRequest && <><StaffPathPicker value={staffPath} onChange={setStaffPath}/>
          {method && <p>Evidence received: {method}. Final admin review is required.</p>}
          <StaffProofAction path={staffPath} state={vouchState} onUpdate={()=>void check()}/></>}
        {!isSuspended && authUser && (!isLecturerRequest || staffPath==='id' || staffPath==='document') && (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 p-3.5 space-y-2 text-left">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2.5 min-w-0">
                <IdCard className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  {user.idCardPath ? (
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
                          ? staffProof : studentProof}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {isLecturerRequest && staffPath === 'id' ? 'JPEG, PNG or WebP' : 'JPEG, PNG, WebP or PDF'} · photos resized under 1 MB{(!isLecturerRequest || staffPath !== 'id') && ' · PDFs up to 3 MB'}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {(isLecturerRequest && staffPath==='id' ? ['image/*'] : ['image/*','application/pdf']).map(accept => (
                  <label key={accept} className="relative flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold focus-within:ring-2 focus-within:ring-emerald-600">
                    <Upload className="w-4 h-4" />{accept === 'image/*' ? 'Choose photo' : 'Choose PDF'}
                    <input type="file" accept={accept} disabled={uploadingIdCard}
                      aria-label={accept === 'image/*' ? 'Choose photo' : 'Choose PDF'}
                      ref={node => { if (node) node.oncancel = noFile; }} onChange={handleUploadIdCard}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  </label>
                ))}
              </div>
            </div>
            {uploadStep && <p role="status" className="text-sm font-semibold">{uploadStep}</p>}
            {retrySubmit && isRejected && !uploadingIdCard && <button type="button" className="min-h-[44px] font-semibold text-emerald-700" onClick={() => void submitOnly()}>Retry submission</button>}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Private verification file. Deleted within 24 hours after approval; replaced copies too.
            </p>
          </div>
        )}

        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
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
                  {canEditStudentDetails && (
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
                        {lvl==='Class of 2026'?'Class of 2026':`${lvl} Level`}
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
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
              <span className="text-slate-500 dark:text-slate-400">Recovery Email</span>
              {!editingRecovery && (
                <span className="text-right text-sm font-medium text-slate-900 dark:text-slate-100 break-all">
                  {loadingRecovery ? 'Loading...' : recoveryEmail || 'Not set'}
                </span>
              )}
              {!editingRecovery && authUser && !loadingRecovery && (
                <button
                  type="button"
                  onClick={handleOpenEditRecovery}
                  className="col-start-2 justify-self-end text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Edit3 className="w-3 h-3" />
                  <span>Edit details</span>
                </button>
              )}
            </div>
            {editingRecovery && (
              <form onSubmit={handleSaveRecovery} className="space-y-2 pt-0.5">
                <div className="space-y-2">
                  <input
                    aria-label="Recovery email"
                    type="email"
                    required
                    maxLength={120}
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                    className="w-full min-w-0 min-h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
                  />
                  <div className="flex justify-end gap-2">
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
              {isPending && hasIdCard===null?'Unconfirmed':isPending && !hasIdCard?'Incomplete':user.status}
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
