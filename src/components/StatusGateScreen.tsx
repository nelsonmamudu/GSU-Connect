import {useTurnstile} from './Turnstile';
import {updateRecoveryEmail} from '../services/authService';
import {friendlyEntryError} from '../utils/entryErrors';
import {StaffPathPicker,StaffProofAction,staffPaths,type StaffPath} from './StaffVerification';
import {noFileMessage, prepareReviewProof} from '../utils/prepareReviewProof';
import {studentProof,staffProof,proofFileName} from '../utils/proof';
import {takeEntryIssue} from '../services/entryFeedback';
import { mapProfileRowToAppUser } from '../services/supabaseService';
import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  IdCard,
  LogOut,
  ShieldAlert,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getSignedIdCardUrl,
  signOutUser,
  updateUserLastSeen,
  uploadIdCardFile,
  type SupabaseAuthUser,
} from '../services/supabaseService';
import {
  AcademicLevel,
  AppUser,
  DepartmentItem,
  formatFileSize,
  formatLevelLabel,
  levelsForDuration,
} from '../types';
import { DepartmentPicker } from './DepartmentPicker';
import { ProofDropzone } from './ProofDropzone';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { errorTextClass } from './ui/styles';
import { trackFunnel } from '../services/funnel';
import { graduationLevelLabel, isGraduateLevel } from '../utils/graduationClass';

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

function TimelineRow({
  done,
  current,
  label,
  hint,
}: {
  done: boolean;
  current?: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
          done
            ? 'bg-brand text-white'
            : current
              ? 'border-2 border-brand'
              : 'border-2 border-line dark:border-line'
        }`}
      >
        {done && <CheckCircle2 className="w-3 h-3" />}
      </span>
      <div className="min-w-0">
        <p
          className={`text-xs font-semibold ${
            done || current
              ? 'text-ink dark:text-ink'
              : 'text-ink-muted dark:text-ink-muted'
          }`}
        >
          {label}
        </p>
        {hint && (
          <p className="text-[11px] text-ink-muted leading-relaxed">{hint}</p>
        )}
      </div>
    </li>
  );
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
  const [choosingReplacement, setChoosingReplacement] = useState(false);
  const [resubmitted, setResubmitted] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'info' | 'error'; text: string } | null>(null);
  const [uploadStep, setUploadStep] = useState('');
  const [submitFailed, setSubmitFailed] = useState(false);
  const [compressionNote, setCompressionNote] = useState('');
  const [proofPreviewUrl, setProofPreviewUrl] = useState<string | null>(null);
  const [proofPreviewLoading, setProofPreviewLoading] = useState(false);


  const [checkMessage, setCheckMessage] = useState('');
  const [checking, setChecking] = useState(false);
  const checkSeq = useRef(0);
  const lastStatus = useRef(user.status);
  useEffect(() => {
    trackFunnel('status_gate_view', { status: user.status, hasIdCard });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.uid]);
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
        if (profile.status !== lastStatus.current) {
          trackFunnel('status_change', { from: lastStatus.current, to: profile.status });
          lastStatus.current = profile.status;
        }
        onChecked(profile);
        setResubmitted(false);
        if (!profile.idCardPath) setUploadedFileName(null);
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
  const recoveryCheck = useTurnstile('recovery');
  const [recoveryPassword, setRecoveryPassword] = useState('');
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

  // Signed, short-lived preview of the attached proof (owner-only via RLS).
  useEffect(() => {
    let active = true;
    if (!user.idCardPath) {
      setProofPreviewUrl(null);
      setProofPreviewLoading(false);
      return;
    }
    const load = async () => {
      setProofPreviewLoading(true);
      try {
        const url = await getSignedIdCardUrl(user.idCardPath!);
        if (active) setProofPreviewUrl(url);
      } catch {
        if (active) setProofPreviewUrl(null);
      } finally {
        if (active) setProofPreviewLoading(false);
      }
    };
    void load();
    // Signed URLs are short-lived; refresh so the preview doesn't break.
    const timer = window.setInterval(() => {
      if (active) void load();
    }, 90_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [user.idCardPath]);

  const isSuspended = user.status === 'suspended';
  const isRejected = user.status === 'rejected';
  const isPending = user.status === 'pending';
  const canEditStudentDetails = (isPending || isRejected) && user.accountType === 'student';
  const isLecturerRequest =
    user.accountType === 'staff' || user.requestedRole === 'lecturer';

  const selectedDuration =
    departments.find((d) => d.name.toLowerCase() === editDepartment.trim().toLowerCase())
      ?.durationYears ?? 4;
  const availableLevels:AcademicLevel[] = [...levelsForDuration(selectedDuration),graduationLevelLabel()];

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
      setDetailsError(friendlyEntryError(err, 'Failed to update details.'));
    } finally {
      setSavingDetails(false);
    }
  };

  const handleOpenEditRecovery = () => {
    setRecoveryInput(recoveryEmail || '');
    setRecoveryError(null);
    setRecoveryPassword('');
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
      await updateRecoveryEmail(clean, recoveryPassword, recoveryCheck.consume());
      setRecoveryEmail(clean);
      setEditingRecovery(false); setRecoveryPassword('');
      setFeedback({
        type: 'info',
        text: 'Recovery email updated.',
      });
    } catch (err) {
      setRecoveryError(friendlyEntryError(err, 'Failed to update recovery email.'));
    } finally {
      setSavingRecovery(false);
    }
  };

  const noFile = (accept: string) => setFeedback({type:'error', text:accept === 'application/pdf' ? 'No PDF received. Try again and choose a PDF from Files.' : noFileMessage});
  const submitAttached = async () => {
    setUploadStep('Submitting…');
    const {error} = await supabase.rpc('resubmit_signup');
    if (error) throw error;
    setResubmitted(true);
    setSubmitFailed(false);
  };
  const finishUpload = async () => {
    setChoosingReplacement(false);
    setFeedback({type:'info', text:'Proof uploaded. Waiting for review.'});
    await check();
  };
  const submitOnly = async () => {
    setUploadingIdCard(true);
    setFeedback(null);
    try {
      await submitAttached();
      setChoosingReplacement(false);
      setFeedback({type:'info', text:'Resubmitted — your request is back in the review queue.'});
      await check();
    }
    catch { setSubmitFailed(true); setFeedback({type:'error', text:'Your proof is attached, but we couldn’t resubmit it yet. Tap “Retry submission”.'}); }
    finally { setUploadingIdCard(false); setUploadStep(''); }
  };
  const handleProofFile = async (original: File) => {
    setUploadingIdCard(true);
    setFeedback(null);
    setCompressionNote('');
    let stage = 'prepare';
    trackFunnel('proof_upload_started', {
      rejected: isRejected,
      staffPath,
      bytes: original.size,
      type: original.type,
    });
    try {
      setUploadStep('Preparing file…');
      const file = await prepareReviewProof(original);
      if (file.size < original.size) {
        setCompressionNote(`Photo resized to ${formatFileSize(file.size)} for review.`);
      }
      stage = 'upload'; setUploadStep('Uploading…');
      await uploadIdCardFile(user.uid,file,isLecturerRequest?staffPath:undefined, () => {
        stage = 'attach'; setUploadStep('Attaching proof…');
      });
      setHasIdCard(true);
      setUploadedFileName(proofFileName(original.name));
      trackFunnel('proof_upload_succeeded', {
        rejected: isRejected,
        staffPath,
        bytes: file.size,
        type: file.type,
      });
      if (isRejected) {
        stage = 'submit';
        await submitAttached();
        setChoosingReplacement(false);
        setFeedback({type:'info', text:'Replacement submitted — your request is back in the review queue.'});
        await check();
      } else {
        await finishUpload();
      }
    } catch (err) {
      trackFunnel('proof_upload_failed', { stage, message: String(err) });
      const text = stage === 'submit' ? 'Your proof is attached, but we couldn’t resubmit it yet. Tap “Retry submission”.'
        : stage === 'attach' ? 'Could not attach proof. Please try again.'
        : stage === 'upload' ? 'Upload failed. Please try again.'
        : friendlyEntryError(err, 'Could not prepare this file. Choose another photo or PDF.');
      if (stage === 'submit') setSubmitFailed(true);
      setFeedback({type:'error',text});
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
      : hasIdCard===null ? 'Checking your status…' : !hasIdCard ? 'Finish Verification' : isLecturerRequest
        ? 'Pending Admin Verification'
        : 'Waiting for Approval';

  const attachedFileName = uploadedFileName || proofFileName(user.idCardPath);

  const needsReplacement = isRejected && !resubmitted && !submitFailed;
  const showPickers = !attachedFileName || needsReplacement || choosingReplacement;
  const attachedIsPdf = (user.idCardPath || '').toLowerCase().endsWith('.pdf');

  const description = isSuspended
    ? 'Your GSU Connect account has been suspended by an administrator due to a moderation review. You cannot read or send messages while suspended.'
    : isRejected
      ? (isLecturerRequest ? 'An admin could not verify your staff registration. Check the reason or contact support.' : 'Check the rejection reason below. You can edit your department and level, then upload replacement proof to resubmit for review.')
      : hasIdCard===null ? 'Check whether your proof has reached the review queue.' : hasIdCard ? 'Your proof has been submitted.' : 'Your account exists. Complete verification below to enter the review queue.';

  const statusBadgeTone =
    user.status === 'approved'
      ? 'brand'
      : isRejected || isSuspended
        ? 'danger'
        : 'warn';

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md bg-surface rounded-3xl border border-line/80 dark:border-line shadow-sm p-6 sm:p-8 text-center space-y-5">
        <div className={`w-14 h-14 rounded-2xl mx-auto flex items-center justify-center ${iconTone}`}>
          <Icon className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          <p className="text-sm text-ink-body dark:text-ink-soft leading-relaxed">{description}</p>
        </div>

        {isPending && !isLecturerRequest && hasIdCard === false && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-900">Upload proof to enter the review queue.</p>
        )}
        {isPending && (
          <div className="rounded-2xl bg-sunken dark:bg-sunken/60 border border-line/70 dark:border-line px-4 py-3.5 text-left space-y-3">
            <p className="text-xs font-bold text-ink">What happens next</p>
            <ol className="space-y-2">
              <TimelineRow done label="Account created" />
              <TimelineRow
                done={Boolean(hasIdCard)}
                current={!hasIdCard}
                label={hasIdCard ? 'Proof submitted' : 'Proof needed'}
                hint={hasIdCard ? undefined : 'Upload a photo or PDF to enter the review queue.'}
              />
              <TimelineRow
                done={false}
                current={Boolean(hasIdCard)}
                label="Review decision"
                hint={isLecturerRequest ? 'An admin will review your staff submission.' : 'An authorized reviewer will check your submission.'}
              />
            </ol>
            <p className="text-[11px] text-ink-muted leading-relaxed">
              Review timing depends on admin availability, so there is no fixed
              deadline. This page updates automatically once a decision is made —
              or tap “Check status” to look again.
            </p>
          </div>
        )}

        <div className="flex flex-col items-center gap-1.5">
          <Button type="button" variant="outline" onClick={()=>void check(true)} loading={checking} loadingLabel="Checking…">
            Check status
          </Button>
          <p role="status" className="text-xs text-ink-muted text-center">{checkMessage}</p>
        </div>
        {(isRejected || isSuspended) && (
          <div className="space-y-2.5 text-left">
            {user.rejectionReason && (
              <Alert variant="error">
                <span className="font-bold">Reason provided:</span>
                <span className="block">{user.rejectionReason}</span>
              </Alert>
            )}
            <p className="text-xs text-ink-body dark:text-ink-soft text-center leading-relaxed">
              Think this is a mistake? Contact support at{' '}
              <a
                href="mailto:GSUConnect0@gmail.com"
                className="font-semibold text-brand hover:underline"
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
          <section aria-label="Verification proof" className="rounded-2xl border border-line/80 dark:border-line bg-sunken/70 dark:bg-sunken/60 p-3.5 space-y-2 text-left">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-2.5 min-w-0">
                <IdCard className="w-4 h-4 text-brand shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  {attachedFileName ? (
                    <>
                      {proofPreviewUrl && !attachedIsPdf ? (
                        <img
                          src={proofPreviewUrl}
                          alt="Preview of attached proof"
                          className="mt-1 h-28 w-28 rounded-xl border border-line object-cover"
                        />
                      ) : proofPreviewUrl && attachedIsPdf ? (
                        <a
                          href={proofPreviewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand hover:underline"
                        >
                          <IdCard className="w-3.5 h-3.5" /> Open PDF
                        </a>
                      ) : proofPreviewLoading ? (
                        <p className="mt-1 text-[11px] text-ink-muted">Loading preview…</p>
                      ) : null}
                      <p className="text-xs font-semibold text-ink leading-snug break-all">
                        {attachedFileName}
                      </p>
                      <p className="text-[11px] text-ink-muted leading-relaxed">
                        {needsReplacement ? 'Upload a replacement to resubmit' : 'Attached for reviewer verification'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-xs font-semibold text-ink leading-snug">
                        {user.accountType === 'staff'
                          ? staffProof : studentProof}
                      </p>
                      <p className="text-[11px] text-ink-muted leading-relaxed">
                        {isLecturerRequest && staffPath === 'id' ? 'JPEG, PNG or WebP' : 'JPEG, PNG, WebP or PDF'} · photos resized under 1 MB{(!isLecturerRequest || staffPath !== 'id') && ' · PDFs up to 3 MB'}
                      </p>
                    </>
                  )}
                </div>
              </div>
              {!showPickers && (submitFailed ? (
                <Button type="button" loading={uploadingIdCard} onClick={() => void submitOnly()}>
                  Retry submission
                </Button>
              ) : (
                <Button type="button" variant="outline" disabled={uploadingIdCard}
                  onClick={() => { setChoosingReplacement(true); setFeedback(null); }}>
                  Replace file
                </Button>
              ))}
            </div>
            {showPickers && (
              <div className="space-y-2">
                <ProofDropzone
                  file={null}
                  onFile={(file) => { if (file) void handleProofFile(file); }}
                  accept={isLecturerRequest && staffPath === 'id' ? ['image/*'] : ['image/*', 'application/pdf']}
                  disabled={uploadingIdCard}
                  title={isRejected ? 'Upload a replacement' : 'Upload proof of status'}
                  required
                  chooseLabel={isRejected ? 'Choose replacement' : 'Choose photo or PDF'}
                  onCancel={() => noFile(isLecturerRequest && staffPath === 'id' ? 'image/*' : 'image/*,application/pdf')}
                />
                {choosingReplacement && !needsReplacement && (
                  <Button type="button" variant="ghost" disabled={uploadingIdCard}
                    onClick={() => { setChoosingReplacement(false); setFeedback(null); }}>
                    Cancel
                  </Button>
                )}
              </div>
            )}
            {uploadStep && <p role="status" className="text-sm font-semibold">{uploadStep}</p>}
            {compressionNote && <p role="status" className="text-[11px] text-ink-muted">{compressionNote}</p>}
            {showPickers && <p className="text-[11px] text-ink-muted leading-relaxed">
              Private verification file. Deleted within 24 hours after approval; replaced copies too.
            </p>}
          </section>
        )}

        {feedback && (
          <Alert variant={feedback.type === 'error' ? 'error' : 'success'}>
            {feedback.text}
          </Alert>
        )}

        <div className="bg-sunken dark:bg-sunken/70 rounded-2xl p-4 text-left space-y-2.5 text-sm border border-line dark:border-line/80">
          <div className="flex justify-between gap-3">
            <span className="text-ink-muted">Full Name</span>
            <span className="font-semibold text-ink text-right">
              {toTitleCase(user.fullName)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-muted">
              {user.accountType === 'staff' ? 'Staff ID' : 'Matric No.'}
            </span>
            <span className="font-mono font-medium text-ink text-right">{user.idNumber}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-muted">Requested Role</span>
            <span className="font-semibold text-ink text-right">
              {isLecturerRequest ? 'Lecturer / Staff' : 'Student'}
            </span>
          </div>

          {!editingDetails ? (
            <>
              <div className="flex justify-between gap-3">
                <span className="text-ink-muted">
                  {user.accountType === 'staff' ? 'Department / Office' : 'Department'}
                </span>
                <span className="font-medium text-ink text-right">
                  {displayDepartment}
                </span>
              </div>
              <div className="flex justify-between items-center gap-3">
                <span className="text-ink-muted">Level</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink text-right">
                    {formatLevelLabel(displayLevel, user.is_alumni)}
                  </span>
                  {canEditStudentDetails && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleOpenEditDetails}
                      className="text-brand hover:bg-transparent px-2">
                      <Edit3 className="w-3 h-3" />
                      <span>Edit details</span>
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <form
              onSubmit={handleSaveDetails}
              className="rounded-xl border border-line bg-surface p-3 space-y-3"
            >
              <Field label="Department" htmlFor="edit-pending-department">
                <DepartmentPicker
                  id="edit-pending-department"
                  departments={departments}
                  value={editDepartment}
                  onChange={setEditDepartment}
                />
              </Field>

              <Field label="Level" htmlFor="edit-pending-level">
                <div className="relative">
                  <Select
                    id="edit-pending-level"
                    value={editLevel}
                    onChange={(e) => setEditLevel(e.target.value as AcademicLevel | '')}
                    className="appearance-none w-full pr-10 font-medium tabular-nums"
                  >
                    <option value="">Select level</option>
                    {availableLevels.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {isGraduateLevel(lvl)?lvl:`${lvl} Level`}
                      </option>
                    ))}
                  </Select>
                  <ChevronDown className="w-4 h-4 text-ink-muted shrink-0 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </Field>

              {detailsError && <Alert variant="error">{detailsError}</Alert>}

              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="outline" size="sm" disabled={savingDetails}
                  onClick={() => {
                    setEditingDetails(false);
                    setDetailsError(null);
                  }}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={savingDetails} loadingLabel="Saving…">
                  Save
                </Button>
              </div>
            </form>
          )}

          {user.email && (
            <div className="flex justify-between gap-3">
              <span className="text-ink-muted">GSU Email</span>
              <span className="font-mono text-xs text-ink text-right break-all">
                {user.email}
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-1">
              <span className="text-ink-muted">Recovery Email</span>
              {!editingRecovery && (
                <span className="overflow-x-auto whitespace-nowrap text-sm font-medium text-ink">
                  {loadingRecovery ? 'Loading...' : recoveryEmail || 'Not set'}
                </span>
              )}
              {!editingRecovery && authUser && !loadingRecovery && (
                <Button type="button" variant="ghost" size="sm" onClick={handleOpenEditRecovery}
                  className="justify-self-start text-brand hover:bg-transparent px-2">
                  <Edit3 className="w-3 h-3" />
                  <span>Edit details</span>
                </Button>
              )}
            </div>
            {editingRecovery && (
              <form onSubmit={handleSaveRecovery} className="space-y-2 pt-0.5">
                <Field label="Current password" htmlFor="status-recovery-password">
                  <Input
                    id="status-recovery-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={recoveryPassword}
                    onChange={e=>setRecoveryPassword(e.target.value)}
                  />
                </Field>
                <Field label="Recovery email" htmlFor="status-recovery-email" error={recoveryError ?? undefined}>
                  <Input
                    id="status-recovery-email"
                    type="email"
                    required
                    maxLength={120}
                    value={recoveryInput}
                    onChange={(e) => setRecoveryInput(e.target.value)}
                    placeholder="e.g. yourname@gmail.com"
                  />
                </Field>
                {recoveryCheck.widget}
                <div className="flex justify-end gap-2">
                  <Button type="submit" size="sm" loading={savingRecovery} loadingLabel="Saving…">
                    Save
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={savingRecovery}
                    onClick={() => {
                      setEditingRecovery(false); setRecoveryPassword('');
                      setRecoveryError(null);
                    }}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            <p className="text-[11px] text-ink-muted">
              Password reset links are sent here. You’ll be asked to verify this inbox after approval.
            </p>
          </div>

          <div className="flex justify-between items-center gap-3">
            <span className="text-ink-muted">Status</span>
            <Badge tone={statusBadgeTone} className="capitalize px-2.5">
              {hasIdCard===null?'Checking…':isPending && !hasIdCard?'Incomplete':user.status}
            </Badge>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          full
          onClick={async () => {
            await updateUserLastSeen(user.uid).catch(() => undefined);
            await signOutUser();
          }}
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  );
};
