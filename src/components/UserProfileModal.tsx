import React, { useEffect, useState } from 'react';
import {
  Ban,
  Building2,
  Check,
  GraduationCap,
  IdCard,
  MessageSquare,
  Phone,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import {
  isBlockedBetweenUsers,
  toggleBlockUser,
  updateUserRoleAndStatus,
} from '../services/supabaseService';
import {
  AppUser,
  canViewMemberIdNumber,
  ChatThread,
  formatLevelLabel,
  isUserOnline,
  ONLINE_WINDOW_MS,
  ROLE_LABELS,
  UserRole,
  UserStatus,
} from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';

interface UserProfileModalProps {
  currentUser: AppUser;
  targetUser: AppUser;
  dmChat?: ChatThread | null;
  nowMs?: number;
  isOnline?: boolean;
  onClose: () => void;
  onMessage: (target: AppUser) => Promise<void> | void;
  onVoiceCall: (target: AppUser) => Promise<void> | void;
}

function formatLastSeen(diffMs: number): string {
  const totalMinutes = Math.max(5, Math.floor(diffMs / 60_000));
  if (totalMinutes < 60) return `Last seen ${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `Last seen ${totalHours}h ago`;
  const totalDays = Math.floor(totalHours / 24);
  return `Last seen ${totalDays}d ago`;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  currentUser,
  targetUser,
  dmChat = null,
  nowMs = Date.now(),
  isOnline,
  onClose,
  onMessage,
  onVoiceCall,
}) => {
  const isSelf = targetUser.uid === currentUser.uid;
  const isAdmin = currentUser.role === 'admin';

  const [messagingBusy, setMessagingBusy] = useState(false);
  const [callingBusy, setCallingBusy] = useState(false);
  const [blockingBusy, setBlockingBusy] = useState(false);
  const [iBlockedOverride, setIBlockedOverride] = useState<boolean | null>(null);
  const [roleValue, setRoleValue] = useState<UserRole>(targetUser.role);
  const [statusValue, setStatusValue] = useState<UserStatus>(targetUser.status);
  const [adminBusy, setAdminBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setRoleValue(targetUser.role);
    setStatusValue(targetUser.status);
  }, [targetUser.uid, targetUser.role, targetUser.status]);

  useEffect(() => {
    setIBlockedOverride(null);
  }, [targetUser.uid, currentUser.blockedUsers]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const lastSeenMs = targetUser.lastSeen?.toMillis() ?? null;
  const diffMs = lastSeenMs !== null ? Math.max(0, nowMs - lastSeenMs) : null;
  const online = isOnline !== undefined ? isOnline : isUserOnline(targetUser.lastSeen, nowMs);

  const iBlocked =
    iBlockedOverride !== null
      ? iBlockedOverride
      : Boolean(currentUser.blockedUsers?.includes(targetUser.uid));
  const peerBlockedMe = Boolean(targetUser.blockedUsers?.includes(currentUser.uid));
  const anyBlocked = iBlocked || peerBlockedMe || isBlockedBetweenUsers(currentUser, targetUser);

  const showTempFeedback = (msg: string) => {
    setErrorMsg(null);
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleMessageClick = async () => {
    if (messagingBusy) return;
    setMessagingBusy(true);
    setErrorMsg(null);
    try {
      await onMessage(targetUser);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not open chat.');
    } finally {
      setMessagingBusy(false);
    }
  };

  const handleCallClick = async () => {
    if (callingBusy || anyBlocked) return;
    setCallingBusy(true);
    setErrorMsg(null);
    try {
      await onVoiceCall(targetUser);
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not start voice call.');
    } finally {
      setCallingBusy(false);
    }
  };

  const handleToggleBlock = async () => {
    if (blockingBusy || isSelf) return;
    setBlockingBusy(true);
    setErrorMsg(null);
    try {
      const nextShouldBlock = !iBlocked;
      await toggleBlockUser(
        currentUser.uid,
        currentUser.blockedUsers || [],
        targetUser.uid,
        nextShouldBlock
      );
      setIBlockedOverride(nextShouldBlock);
      showTempFeedback(
        nextShouldBlock ? `${targetUser.fullName} blocked.` : `${targetUser.fullName} unblocked.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update block status.');
    } finally {
      setBlockingBusy(false);
    }
  };

  const handleRoleChange = async (nextRole: UserRole) => {
    if (!isAdmin || isSelf || adminBusy) return;
    setAdminBusy(true);
    setErrorMsg(null);
    try {
      await updateUserRoleAndStatus(targetUser.uid, { role: nextRole });
      setRoleValue(nextRole);
      showTempFeedback(`Role updated to ${ROLE_LABELS[nextRole]}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update role.');
    } finally {
      setAdminBusy(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!isAdmin || isSelf || adminBusy) return;
    const nextStatus: UserStatus = statusValue === 'suspended' ? 'approved' : 'suspended';
    setAdminBusy(true);
    setErrorMsg(null);
    try {
      await updateUserRoleAndStatus(targetUser.uid, { status: nextStatus });
      setStatusValue(nextStatus);
      showTempFeedback(
        nextStatus === 'suspended'
          ? `${targetUser.fullName} has been suspended.`
          : `${targetUser.fullName} has been reactivated.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update account status.');
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${targetUser.fullName} profile`}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto bg-surface border border-line/80 dark:border-line rounded-t-3xl sm:rounded-3xl shadow-overlay"
      >
        {/* Top Bar */}
        <div className="sticky top-0 z-10 px-5 py-3.5 bg-white/95 dark:bg-surface/95 backdrop-blur-sm border-b border-line flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink">
            Contact Info
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close contact info"
            className="min-w-[40px] min-h-[40px] -mr-2 rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {/* Hero Avatar + Name + Live Status */}
          <div className="flex flex-col items-center text-center space-y-3">
            <div className="relative">
              <UserAvatar
                name={targetUser.fullName}
                photoURL={targetUser.photoURL}
                avatarId={targetUser.avatarId}
                size="2xl"
                roundedClass="rounded-3xl"
                fallbackClassName="bg-brand text-on-brand"
              />
              <span
                title={online ? 'Online' : 'Offline'}
                className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full ring-3 ring-white dark:ring-slate-900 ${
                  online ? 'bg-brand' : 'bg-sunken'
                }`}
              />
            </div>

            <div className="space-y-1.5 max-w-full">
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-ink break-words">
                  {targetUser.fullName}
                </h3>
                <RoleBadge role={roleValue} showStudent />
                {statusValue === 'suspended' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-danger-line dark:bg-danger-bg/70 text-danger">
                    Suspended
                  </span>
                )}
              </div>

              <div className="inline-flex items-center justify-center gap-1.5 text-xs">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    online ? 'bg-brand' : 'bg-sunken'
                  }`}
                />
                {online ? (
                  <span className="text-brand font-semibold">
                    Online · Active now
                  </span>
                ) : (
                  <span className="text-ink-muted">
                    {diffMs !== null ? `Offline · ${formatLastSeen(diffMs)}` : 'Offline'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions (Message, Voice Call, Block) */}
          {!isSelf && (
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                disabled={messagingBusy}
                onClick={handleMessageClick}
                className="min-h-[60px] px-2 py-2.5 rounded-2xl bg-brand-subtle dark:bg-brand-subtle/50 hover:bg-brand-subtle dark:hover:bg-brand-subtle/60 border border-success-line/70 text-brand flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{messagingBusy ? 'Opening...' : 'Message'}</span>
              </button>

              <button
                type="button"
                disabled={callingBusy || anyBlocked || statusValue === 'suspended'}
                onClick={handleCallClick}
                className="min-h-[60px] px-2 py-2.5 rounded-2xl bg-info-bg dark:bg-info-bg/50 hover:bg-info-line hover:bg-info/60 border border-info-line/70 dark:border-info/70 text-info flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Phone className="w-4 h-4" />
                <span>{callingBusy ? 'Calling...' : 'Voice Call'}</span>
              </button>

              <button
                type="button"
                disabled={blockingBusy}
                onClick={handleToggleBlock}
                className={`min-h-[60px] px-2 py-2.5 rounded-2xl border flex flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 ${
                  iBlocked
                    ? 'bg-brand hover:bg-brand-strong border-brand text-on-brand'
                    : 'bg-danger-bg dark:bg-danger-bg/40 hover:bg-danger-line hover:bg-danger-bg/70 border-danger-line/70 dark:border-danger/70 text-danger'
                }`}
              >
                {iBlocked ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                <span>{blockingBusy ? 'Saving...' : iBlocked ? 'Unblock' : 'Block'}</span>
              </button>
            </div>
          )}

          {anyBlocked && !isSelf && (
            <div className="rounded-2xl bg-warn-bg dark:bg-warn-bg/40 border border-warn-line/80 dark:border-warn/70 px-3.5 py-2.5 text-xs text-warn dark:text-warn-line flex items-center gap-2">
              <Ban className="w-4 h-4 shrink-0 text-warn" />
              <span>
                {iBlocked
                  ? 'You blocked this member. Unblock them to resume messaging and voice calls.'
                  : peerBlockedMe
                    ? 'This conversation is blocked by the recipient.'
                    : 'Messaging is currently blocked.'}
              </span>
            </div>
          )}

          {feedback && (
            <div className="rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 border border-success-line dark:border-success-line/70 px-3 py-2 text-xs text-brand flex items-center gap-1.5">
              <Check className="w-4 h-4 text-brand shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/60 border border-danger-line dark:border-danger/70 px-3 py-2 text-xs text-danger dark:text-danger-line">
              {errorMsg}
            </div>
          )}

          {/* Academic Details */}
          <div className="rounded-2xl bg-sunken dark:bg-sunken/60 border border-line/70 dark:border-line divide-y divide-line/70">
            <div className="px-4 py-3 flex items-center gap-3">
              <Building2 className="w-4 h-4 text-brand shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-ink-muted">
                  {targetUser.accountType === 'staff' ? 'Department / Office' : 'Department'}
                </p>
                <p className="text-sm font-semibold text-ink truncate">
                  {targetUser.department}
                </p>
              </div>
            </div>

            <div className="px-4 py-3 flex items-center gap-3">
              <GraduationCap className="w-4 h-4 text-brand shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-ink-muted">
                  {targetUser.accountType === 'staff' ? 'Academic Standing' : 'Level'}
                </p>
                <p className="text-sm font-semibold text-ink">
                  {targetUser.is_alumni
                    ? 'Alumni'
                    : targetUser.level === 'Staff'
                      ? 'University Staff'
                      : formatLevelLabel(targetUser.level)}
                </p>
              </div>
            </div>

            {canViewMemberIdNumber(currentUser, targetUser.uid) && targetUser.idNumber && (
              <div className="px-4 py-3 flex items-center gap-3">
                <IdCard className="w-4 h-4 text-brand shrink-0" />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-ink-muted">
                    {targetUser.accountType === 'staff' ? 'Staff ID' : 'Matric Number'}
                  </p>
                  <p className="text-sm font-mono font-semibold text-ink truncate">
                    {targetUser.idNumber}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Admin Quick Controls */}
          {isAdmin && !isSelf && (
            <div className="rounded-2xl border border-line bg-sunken/60 dark:bg-sunken/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-ink">
                <Shield className="w-4 h-4 text-brand" />
                <span>Admin Moderation Controls</span>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`profile-role-${targetUser.uid}`}
                  className="block text-[11px] font-medium text-ink-muted"
                >
                  Assigned Role
                </label>
                <select
                  id={`profile-role-${targetUser.uid}`}
                  value={roleValue}
                  disabled={adminBusy}
                  onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface text-xs font-semibold text-ink focus:outline-none focus:border-brand disabled:opacity-60"
                >
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                    <option key={roleKey} value={roleKey}>
                      {ROLE_LABELS[roleKey]}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                disabled={adminBusy}
                onClick={handleToggleSuspend}
                className={`w-full min-h-[42px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 ${
                  statusValue === 'suspended'
                    ? 'bg-brand hover:bg-brand-strong text-on-brand'
                    : 'bg-danger-bg dark:bg-danger-bg/50 hover:bg-danger-line hover:bg-danger-bg/80 border border-danger-line dark:border-danger/70 text-danger'
                }`}
              >
                {statusValue === 'suspended' ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Reactivate Account</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4" />
                    <span>Suspend Account</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
