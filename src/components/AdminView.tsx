import {chooseLevelMessage, clearLevelWarning, levelDifference} from '../utils/entryRules';
import { supabase } from '../lib/supabase';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  Ban,
  Building2,
  Check,
  Clock,
  Edit3,
  Eye,
  Flag,
  Globe,
  IdCard,
  MessageSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  adminExpireUser,
  adminSetAlumniExempt,
  approveOrRejectUser,
  countActiveAdmins,
  countUsersInDepartment,
  deleteCustomGroup,
  deleteDepartment,
  dismissReport,
  getPendingUserIdCardSignedUrl,
  resolveReportDeleteMessage,
  resolveReportSuspendUser,
  saveDepartment,
  searchPeople,
  updateAllowedEmailDomain,
  updateUserRoleAndStatus,
} from '../services/supabaseService';
import {
  AppUser,
  ChatThread,
  DEFAULT_ALLOWED_EMAIL_DOMAIN,
  DepartmentItem,
  formatCompactLevelLabel,
  formatDateTime,
  formatLevelLabel,
  GSU_FACULTIES,
  ModerationReport,
  ROLE_LABELS,
  UserRole,
} from '../types';
import { CreateGroupModal } from './CreateGroupModal';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';
import { Alert } from './ui/Alert';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Tabs } from './ui/Tabs';
import type { TabItem } from './ui/Tabs';
import {
  filterPending,
  summarizePending,
  type PendingFilter,
  type PendingSort,
} from '../utils/pendingQueue';
import { graduationLevelLabel, isGraduateLevel } from '../utils/graduationClass';

interface AdminViewProps {
  currentUser: AppUser;
  pendingUsers: AppUser[];
  allUsers: AppUser[];
  approvedUsers: AppUser[];
  allGroups: ChatThread[];
  reports: ModerationReport[];
  departments: DepartmentItem[];
  isFirestoreDepartmentsSeeded: boolean;
  allowedEmailDomain?: string;
  hasMorePendingUsers?: boolean;
  hasMoreAllUsers?: boolean;
  hasMoreReports?: boolean;
  loadingMore?: boolean;
  onLoadMore?: (key: 'hasMorePendingUsers' | 'hasMoreAllUsers' | 'hasMoreReports') => void;
  onOpenGroup?: (chatId: string) => void;
}

type AdminSubTab = 'pending' | 'reports' | 'users' | 'groups' | 'departments' | 'settings';

function reviewFailure(err: unknown): string {
  const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : '';
  if (/not authorized|review not permitted|permission denied/i.test(message)) return 'You cannot review this request. Check your review scope and whether the request is still pending.';
  if (/invalid cohort|confirm the student level/i.test(message)) return "Choose the student's level first";
  if (/fetch|network|offline/i.test(message)) return 'Could not reach the server. Check your connection and try again.';
  if (/rejection reason/i.test(message)) return 'Enter a reason for the rejection.';
  return message || 'The decision could not be confirmed. Refresh the request and try again.';
}

export const AdminView: React.FC<AdminViewProps> = ({
  currentUser,
  pendingUsers,
  allUsers,
  approvedUsers,
  allGroups,
  reports,
  departments,
  isFirestoreDepartmentsSeeded,
  allowedEmailDomain = DEFAULT_ALLOWED_EMAIL_DOMAIN,
  hasMorePendingUsers = false,
  hasMoreAllUsers = false,
  hasMoreReports = false,
  loadingMore = false,
  onLoadMore,
  onOpenGroup,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [subTab, setSubTab] = useState<AdminSubTab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [remoteUserResults, setRemoteUserResults] = useState<AppUser[]>([]);
  const [pendingRoleMap, setPendingRoleMap] = useState<Record<string, UserRole>>({});
  // Pending queue triage: search, filter and sort are client-side over the
  // already-scoped queue, so they never widen a reviewer's access.
  const [pendingQuery, setPendingQuery] = useState('');
  const [pendingFilter, setPendingFilter] = useState<PendingFilter>('all');
  const [pendingSort, setPendingSort] = useState<PendingSort>('newest');

  // Settings (allowed email domain) state
  const [domainInput, setDomainInput] = useState(allowedEmailDomain);
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainMessage, setDomainMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setDomainInput(allowedEmailDomain);
  }, [allowedEmailDomain]);

  // Group management state
  const [groupSearch, setGroupSearch] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [groupBanner, setGroupBanner] = useState<string | null>(null);
  const [confirmDeleteGroupId, setConfirmDeleteGroupId] = useState<string | null>(null);

  // Pending rejection reason & ID card preview state
  const [rejectTarget, setRejectTarget] = useState<AppUser | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [idCardModal, setIdCardModal] = useState<{
    user: AppUser;
    url: string | null;
    isPdf: boolean;
    fileName?: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  // Department management state
  const [deptSearch, setDeptSearch] = useState('');
  const [editingDept, setEditingDept] = useState<DepartmentItem | null>(null);
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptNameInput, setDeptNameInput] = useState('');
  const [deptFacultyInput, setDeptFacultyInput] = useState(GSU_FACULTIES[0]);
  const [customFacultyInput, setCustomFacultyInput] = useState('');
  const [deptBusy, setDeptBusy] = useState(false);
  const [deptMessage, setDeptMessage] = useState<string | null>(null);
  const [deptError, setDeptError] = useState<string | null>(null);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<DepartmentItem | null>(null);

  // User role/department confirmation & alumni lifecycle controls state
  const [pendingUserChange, setPendingUserChange] = useState<
    | { kind: 'role'; user: AppUser; nextRole: UserRole }
    | { kind: 'department'; user: AppUser; nextDepartment: string }
    | null
  >(null);
  const [expireTarget, setExpireTarget] = useState<AppUser | null>(null);
  const [userBanner, setUserBanner] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);

  const [committedDecisionIds, setCommittedDecisionIds] = useState<Set<string>>(
    () => new Set()
  );
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<{uid:string; text:string; error?:boolean} | null>(null);
  const decisionLock = useRef(false);

  const [canDecide,setCanDecide]=useState(false);
  const [caseId,setCaseId]=useState(''),[caseStatus,setCaseStatus]=useState('pending'),[caseReason,setCaseReason]=useState('');
  useEffect(()=>{let active=true;setCanDecide(false);if(isAdmin)void supabase.rpc('elevated_workspace_access').then(({data})=>{if(active)setCanDecide(data===true)});return()=>{active=false}},[isAdmin,currentUser.uid]);
  async function decideCase(){setBusyId(caseId);try{const {error}=await supabase.rpc('administrative_decision',{target:caseId,decision:caseStatus,reason:caseReason});if(error)throw error;setCaseId('');setCaseReason('');setUserBanner('Decision recorded.');}catch(e){setAdminError(e && typeof e==='object' && 'message' in e ? String(e.message):'Could not record decision.');}finally{setBusyId(null);}}
  const [adminError, setAdminError] = useState<string | null>(null);
  const [cohortNotice, setCohortNotice] = useState('');
  const [draftLevels,setDraftLevels]=useState<Record<string,string>>({});
  const levelChoices = (user: AppUser) => currentUser.role === 'classRep' ? [currentUser.level]
    : isGraduateLevel(user.level) ? [user.level] : ['100','200','300','400','500','600',graduationLevelLabel()];
  const selectedLevel = (user: AppUser) => draftLevels[user.uid] ?? (user.status !== 'pending' && levelChoices(user).includes(user.level) ? user.level : '');
  const confirmLevel = async (user: AppUser) => {
    const level = selectedLevel(user);
    const { error } = await supabase.rpc('confirm_review_level', { target: user.uid, confirmed_level: level });
    if (error) { setAdminError(reviewFailure(error)); return false; }
    if (user.status !== 'pending') setCohortNotice(`Confirmed level ${level} for ${user.fullName}.`);
    return true;
  };
  const cohortPicker = (user: AppUser, standalone = false) => (
    <label className="flex flex-wrap items-center gap-2 text-xs">Confirm level for approval
      <select disabled={!!busyId || confirmId === user.uid} value={selectedLevel(user)} onChange={e => {
        const value = e.target.value;
        setDraftLevels({...draftLevels,[user.uid]:value});
        setDecisionMessage(prev => clearLevelWarning(prev,user.uid,value));
      }}>
        <option value="">Choose level</option>{levelChoices(user).map(v => <option key={v}>{v}</option>)}
      </select>
      {standalone && <button type="button" disabled={!selectedLevel(user)} onClick={() => void confirmLevel(user)}>Confirm level</button>}
    </label>
  );
  const bannerTimerRef = useRef<number | null>(null);
  useEffect(() => {
    setCommittedDecisionIds((prev) => {
      if (prev.size === 0) return prev;
      const pendingSet = new Set(pendingUsers.map((u) => u.uid));
      let changed = false;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (pendingSet.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pendingUsers]);

  useEffect(() => {
    if (!isAdmin && (subTab === 'departments' || subTab === 'settings')) {
      setSubTab('pending');
    }
  }, [isAdmin, subTab]);

  const scheduleBannerClear = (setter: React.Dispatch<React.SetStateAction<string | null>>, ms = 4000) => {
    if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = window.setTimeout(() => setter(null), ms);
  };

  const [inviteLink, setInviteLink] = useState('');
  async function issueInvite() {
    const { data, error } = await supabase.rpc('issue_entry_invite');
    if (error) {
      setAdminError(error.message);
      return;
    }
    const link = new URL('/', location.origin);
    link.searchParams.set('invite', data);
    setInviteLink(link.href);
  }
  const scopedPending = useMemo(() => {
    const visiblePending = pendingUsers.filter((u) => !committedDecisionIds.has(u.uid));
    if (isAdmin) return visiblePending;
    // Class reps & dept helpers can only view and approve students in their own department
    return visiblePending.filter(
      (u) =>
        u.department.trim().toLowerCase() === currentUser.department.trim().toLowerCase() &&
        u.accountType === 'student' &&
        (!u.requestedRole || u.requestedRole === 'student')
    );
  }, [
    isAdmin,
    pendingUsers,
    currentUser.department,
    committedDecisionIds,
  ]);

  const openReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'open').length,
    [reports]
  );

  const pendingSummary = useMemo(() => summarizePending(scopedPending), [scopedPending]);

  const visiblePending = useMemo(
    () =>
      filterPending(scopedPending, {
        query: pendingQuery,
        filter: pendingFilter,
        sort: pendingSort,
      }),
    [scopedPending, pendingQuery, pendingFilter, pendingSort]
  );

  const pendingFilterOptions = useMemo<
    { key: PendingFilter; label: string; count?: number }[]
  >(() => {
    const summary = pendingSummary;
    return [
      { key: 'all', label: 'All', count: summary.total },
      { key: 'students', label: 'Students', count: summary.students },
      { key: 'staff', label: 'Staff', count: summary.staff },
      { key: 'invited', label: 'Rep invites', count: summary.invited },
      { key: 'no-proof', label: 'No proof yet', count: summary.withoutProof },
    ];
  }, [pendingSummary]);

  const adminTabs = useMemo<TabItem<AdminSubTab>[]>(() => {
    const items: TabItem<AdminSubTab>[] = [
      { key: 'pending', label: 'Pending Sign-ups', count: scopedPending.length },
      { key: 'reports', label: 'Reports', count: openReportsCount },
      { key: 'users', label: 'Roles & Users' },
      { key: 'groups', label: 'Groups', count: allGroups.length },
    ];
    if (isAdmin) {
      items.push(
        { key: 'departments', label: 'Departments', count: departments.length },
        { key: 'settings', label: 'Settings', icon: Settings }
      );
    }
    return items;
  }, [
    isAdmin,
    scopedPending.length,
    openReportsCount,
    allGroups.length,
    departments.length,
  ]);

  useEffect(() => {
    if (subTab !== 'users') {
      setRemoteUserResults([]);
      return;
    }
    const q = userSearch.trim();
    if (q.length < 2) {
      setRemoteUserResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchPeople(q)
        .then((res) => {
          if (active) setRemoteUserResults(res);
        })
        .catch(() => {
          if (active) setRemoteUserResults([]);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [subTab, userSearch]);

  const filteredAllUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    const mergedMap = new Map<string, AppUser>();
    approvedUsers.forEach((u) => mergedMap.set(u.uid, u));
    allUsers.forEach((u) => mergedMap.set(u.uid, u));
    remoteUserResults.forEach((u) => mergedMap.set(u.uid, u));
    return Array.from(mergedMap.values())
      .filter((u) => u.status !== 'pending')
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.idNumber.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [approvedUsers, allUsers, remoteUserResults, userSearch]);

  const filteredDepartments = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    return [...departments]
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((d) => {
        if (!q) return true;
        return (
          d.name.toLowerCase().includes(q) ||
          d.faculty.toLowerCase().includes(q)
        );
      });
  }, [departments, deptSearch]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    const rank = (t: ChatThread['type']) =>
      t === 'general' ? 0 : t === 'custom' ? 1 : 2;
    return [...allGroups]
      .filter((g) => {
        if (!q) return true;
        return (
          g.name.toLowerCase().includes(q) ||
          g.department.toLowerCase().includes(q) ||
          g.level.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const diff = rank(a.type) - rank(b.type);
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name);
      });
  }, [allGroups, groupSearch]);

  const handleDeleteGroup = async (group: ChatThread) => {
    if (group.type !== 'custom') return;
    setAdminError(null);
    setBusyId(group.id);
    try {
      await deleteCustomGroup(group.id);
      setConfirmDeleteGroupId(null);
      setGroupBanner(`Deleted group "${group.name}".`);
      scheduleBannerClear(setGroupBanner, 4000);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to delete group.');
    } finally {
      setBusyId(null);
    }
  };

  const getDefaultApprovalRole = (user: AppUser): UserRole =>
    user.requestedRole === 'lecturer' || user.accountType === 'staff'
      ? 'lecturer'
      : 'student';

  const handleDecision = async (user: AppUser, decision: 'approved' | 'rejected', reason?: string) => {
    if (decisionLock.current) return;
    decisionLock.current = true;
    setBusyId(user.uid);
    setAdminError(null);
    setCohortNotice('');
    setRejectTarget(null);
    let step = 'Confirming level';
    try {
      if (decision === 'approved' && user.accountType !== 'staff' && user.requestedRole !== 'lecturer') {
        setDecisionMessage({uid:user.uid, text:'Confirming level…'});
        const {error} = await supabase.rpc('confirm_review_level', {target:user.uid, confirmed_level:selectedLevel(user)});
        if (error) throw error;
      }
      step = decision === 'approved' ? 'Saving approval' : 'Saving rejection';
      setDecisionMessage({uid:user.uid, text:`${step}…`});
      const role = isAdmin && decision === 'approved' ? pendingRoleMap[user.uid] || getDefaultApprovalRole(user) : undefined;
      await approveOrRejectUser(user, decision, role, reason);
      setCommittedDecisionIds(prev => new Set(prev).add(user.uid));
      setCohortNotice(`${decision === 'approved' ? 'Approved' : 'Rejected'}: ${user.fullName}`);
      setDecisionMessage(null);
      setRejectionReasonInput('');
    } catch (err) {
      setDecisionMessage({uid:user.uid, text:`${step} failed: ${reviewFailure(err)}`, error:true});
    } finally {
      setConfirmId(null);
      decisionLock.current = false;
      setBusyId(null);
    }
  };

  const handleOpenIdCardPreview = async (user: AppUser) => {
    setIdCardModal({ user, url: null, isPdf: false, loading: true, error: null });
    try {
      const signed = await getPendingUserIdCardSignedUrl(user.uid);
      if (!signed) {
        setIdCardModal({
          user,
          url: null,
          isPdf: false,
          loading: false,
          error: 'No verification proof is available for this submission.',
        });
        return;
      }
      setIdCardModal({
        user,
        url: signed.url,
        isPdf: signed.isPdf,
        fileName: signed.fileName,
        loading: false,
        error: null,
      });
    } catch (err) {
      setIdCardModal({
        user,
        url: null,
        isPdf: false,
        loading: false,
        error: err instanceof Error ? err.message : 'Unable to load verification proof.',
      });
    }
  };

  const handleSaveEmailDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    setDomainBusy(true);
    setDomainMessage(null);
    try {
      const saved = await updateAllowedEmailDomain(domainInput);
      setDomainInput(saved);
      setDomainMessage({
        type: 'ok',
        text: `Allowed email domain updated to @${saved}.`,
      });
    } catch (err) {
      setDomainMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to save domain.',
      });
    } finally {
      setDomainBusy(false);
    }
  };

  const isUserExpired = (user: AppUser): boolean => {
    if ((user.status as string) === 'expired') return true;
    if (!user.expires_at) return false;
    const ms = Date.parse(user.expires_at);
    return Number.isFinite(ms) && ms <= Date.now();
  };

  const isUserVerifyPending = (user: AppUser): boolean => {
    if (!user.is_alumni || user.is_exempt || isUserExpired(user)) return false;
    if (!user.verify_deadline) return false;
    if (!user.alumni_verified_at) return true;
    const deadlineMs = Date.parse(user.verify_deadline);
    const verifiedMs = Date.parse(user.alumni_verified_at);
    if (!Number.isFinite(deadlineMs) || !Number.isFinite(verifiedMs)) return false;
    return deadlineMs - verifiedMs > 90 * 86_400_000;
  };

  const ensureNotLastAdmin = async (
    targetUser: AppUser,
    actionVerb: 'demote' | 'suspend'
  ): Promise<boolean> => {
    if (targetUser.role !== 'admin') return true;
    const localAdmins = new Set<string>();
    [currentUser, ...approvedUsers, ...allUsers].forEach((u) => {
      if (u.role === 'admin' && u.status === 'approved' && !isUserExpired(u)) {
        localAdmins.add(u.uid);
      }
    });
    let activeAdminCount = localAdmins.size;
    try {
      const remoteCount = await countActiveAdmins();
      activeAdminCount = Math.max(remoteCount, 0);
    } catch {
      // Fall back to merged local admin count if head-count query fails
    }
    const targetCountsAsActive =
      targetUser.status === 'approved' && !isUserExpired(targetUser);
    const remainingAdmins = targetCountsAsActive
      ? activeAdminCount - 1
      : activeAdminCount;
    if (remainingAdmins < 1) {
      setUserError(
        `Cannot ${actionVerb} ${targetUser.fullName} because they are the last remaining admin. Promote another user to Admin first so nobody is locked out.`
      );
      return false;
    }
    return true;
  };

  const handleRequestRoleChange = async (user: AppUser, nextRole: UserRole) => {
    if (nextRole === user.role) return;
    setAdminError(null);
    setUserError(null);
    if (user.role === 'admin' && nextRole !== 'admin') {
      setBusyId(user.uid);
      const allowed = await ensureNotLastAdmin(user, 'demote');
      setBusyId(null);
      if (!allowed) return;
    }
    setPendingUserChange({ kind: 'role', user, nextRole });
  };

  const handleRequestDepartmentChange = (user: AppUser, nextDepartment: string) => {
    if (nextDepartment === user.department) return;
    setAdminError(null);
    setUserError(null);
    setPendingUserChange({ kind: 'department', user, nextDepartment });
  };

  const handleConfirmUserChange = async () => {
    if (!pendingUserChange) return;
    const change = pendingUserChange;
    setAdminError(null);
    setUserError(null);
    setBusyId(change.user.uid);
    try {
      if (change.kind === 'role') {
        if (change.user.role === 'admin' && change.nextRole !== 'admin') {
          const allowed = await ensureNotLastAdmin(change.user, 'demote');
          if (!allowed) {
            setPendingUserChange(null);
            return;
          }
        }
        await updateUserRoleAndStatus(change.user.uid, { role: change.nextRole });
        setRemoteUserResults((prev) =>
          prev.map((u) =>
            u.uid === change.user.uid ? { ...u, role: change.nextRole } : u
          )
        );
        setUserBanner(
          `Updated ${change.user.fullName}'s role to ${ROLE_LABELS[change.nextRole]}.`
        );
      } else {
        await updateUserRoleAndStatus(change.user.uid, {
          department: change.nextDepartment,
        });
        setRemoteUserResults((prev) =>
          prev.map((u) =>
            u.uid === change.user.uid
              ? { ...u, department: change.nextDepartment }
              : u
          )
        );
        setUserBanner(
          `Moved ${change.user.fullName} to ${change.nextDepartment}.`
        );
      }
      setPendingUserChange(null);
      scheduleBannerClear(setUserBanner, 4000);
    } catch (err) {
      setAdminError(
        err instanceof Error
          ? err.message
          : change.kind === 'role'
            ? 'Unable to update user role.'
            : 'Unable to update user department.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleSuspend = async (user: AppUser) => {
    setAdminError(null);
    setUserError(null);
    setBusyId(user.uid);
    try {
      const nextStatus = user.status === 'suspended' ? 'approved' : 'suspended';
      if (nextStatus === 'suspended' && user.role === 'admin') {
        const allowed = await ensureNotLastAdmin(user, 'suspend');
        if (!allowed) return;
      }
      await updateUserRoleAndStatus(user.uid, { status: nextStatus });
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Unable to update user status.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleAlumniExempt = async (user: AppUser) => {
    if (!user.is_alumni || user.uid === currentUser.uid) return;
    const nextExempt = !user.is_exempt;
    setAdminError(null);
    setBusyId(user.uid);
    try {
      await adminSetAlumniExempt(user.uid, nextExempt);
      setRemoteUserResults((prev) =>
        prev.map((u) => (u.uid === user.uid ? { ...u, is_exempt: nextExempt } : u))
      );
      setUserBanner(
        nextExempt
          ? `${user.fullName} is now kept as a mentor (exempt from re-verification).`
          : `Removed mentor exemption for ${user.fullName}.`
      );
      scheduleBannerClear(setUserBanner, 4000);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Unable to update alumni mentor exemption.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmExpireUser = async () => {
    if (!expireTarget || expireTarget.uid === currentUser.uid) return;
    const target = expireTarget;
    setAdminError(null);
    setBusyId(target.uid);
    try {
      await adminExpireUser(target.uid);
      const nowIso = new Date().toISOString();
      setRemoteUserResults((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, expires_at: nowIso } : u))
      );
      setExpireTarget(null);
      setUserBanner(`Expired Alumni account for ${target.fullName}.`);
      scheduleBannerClear(setUserBanner, 4000);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Unable to expire alumni account.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteReportedMessage = async (report: ModerationReport) => {
    setAdminError(null);
    setBusyId(report.id);
    try {
      await resolveReportDeleteMessage(report);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Unable to delete reported message.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSuspendReportedUser = async (report: ModerationReport) => {
    setAdminError(null);
    setBusyId(report.id);
    try {
      await resolveReportSuspendUser(report);
    } catch (err) {
      setAdminError(
        err instanceof Error ? err.message : 'Unable to suspend reported user.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDismissReport = async (reportId: string) => {
    setAdminError(null);
    setBusyId(reportId);
    try {
      await dismissReport(reportId);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to dismiss report.');
    } finally {
      setBusyId(null);
    }
  };

  const openAddDepartment = () => {
    setEditingDept(null);
    setDeptNameInput('');
    setDeptFacultyInput(GSU_FACULTIES[0]);
    setCustomFacultyInput('');
    setDeptModalOpen(true);
  };

  const openEditDepartment = (dept: DepartmentItem) => {
    setEditingDept(dept);
    setDeptNameInput(dept.name);
    if (GSU_FACULTIES.includes(dept.faculty)) {
      setDeptFacultyInput(dept.faculty);
      setCustomFacultyInput('');
    } else {
      setDeptFacultyInput('__other__');
      setCustomFacultyInput(dept.faculty);
    }
    setDeptModalOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    const faculty =
      deptFacultyInput === '__other__' ? customFacultyInput : deptFacultyInput;
    if (deptNameInput.trim().length < 2 || faculty.trim().length < 2) return;

    setAdminError(null);
    setDeptBusy(true);
    try {
      await saveDepartment({
        id: editingDept?.id,
        name: deptNameInput,
        faculty,
      });
      setDeptModalOpen(false);
      setDeptMessage(
        editingDept ? 'Department updated in directory.' : 'Department added to directory.'
      );
      scheduleBannerClear(setDeptMessage, 3500);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to save department.');
    } finally {
      setDeptBusy(false);
    }
  };

  const getDepartmentUserCount = async (deptName: string): Promise<number> => {
    const targetLower = deptName.trim().toLowerCase();
    const localIds = new Set<string>();
    [...allUsers, ...approvedUsers, ...pendingUsers].forEach((u) => {
      if (u.department.trim().toLowerCase() === targetLower) {
        localIds.add(u.uid);
      }
    });
    let remoteCount = 0;
    try {
      remoteCount = await countUsersInDepartment(deptName);
    } catch {
      // Fall back to known profiles if count query fails
    }
    return Math.max(localIds.size, remoteCount);
  };

  const handleRequestDeleteDepartment = async (dept: DepartmentItem) => {
    setAdminError(null);
    setDeptError(null);
    setBusyId(dept.id);
    try {
      const userCount = await getDepartmentUserCount(dept.name);
      if (userCount > 0) {
        const msg = `${userCount} ${userCount === 1 ? 'user is' : 'users are'} in ${dept.name} and must be moved first.`;
        setDeptError(msg);
        return;
      }
      setDeleteDeptTarget(dept);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmDeleteDepartment = async () => {
    if (!deleteDeptTarget) return;
    const dept = deleteDeptTarget;
    setAdminError(null);
    setDeptError(null);
    setBusyId(dept.id);
    try {
      const userCount = await getDepartmentUserCount(dept.name);
      if (userCount > 0) {
        const msg = `${userCount} ${userCount === 1 ? 'user is' : 'users are'} in ${dept.name} and must be moved first.`;
        setDeleteDeptTarget(null);
        setDeptError(msg);
        return;
      }
      await deleteDepartment(dept.id);
      setDeleteDeptTarget(null);
      setDeptMessage(`Removed "${dept.name}" from directory.`);
      scheduleBannerClear(setDeptMessage, 3500);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : 'Unable to delete department.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {adminError && (
        <div
          role="alert"
          className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-4 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
        >
          <span>{adminError}</span>
          <button
            type="button"
            onClick={() => setAdminError(null)}
            aria-label="Dismiss admin error"
            className="text-red-500 hover:text-red-700 dark:hover:text-red-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Sub-navigation */}
      <div className="space-y-2">
        <Tabs<AdminSubTab>
          label="Admin sections"
          value={subTab}
          onChange={setSubTab}
          tabs={adminTabs}
        />
        {currentUser.role==='classRep' && <div><button type="button" onClick={issueInvite}>Generate a 7-day department invite (replaces previous link)</button>
          {inviteLink && <input aria-label="Share this registration link" readOnly value={inviteLink} onFocus={e=>e.target.select()} />}</div>}
        {canDecide && inviteLink && <input readOnly aria-label="New registration link" value={inviteLink} onFocus={e=>e.target.select()}/>}
        {isAdmin && <p className="text-xs">For admin reviews, verify your authenticator in Profile first.</p>}
        {cohortNotice && <p role="status">{cohortNotice}</p>}
        {!isAdmin && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Showing pending student sign-ups for {currentUser.department} (Lecturer requests require an Admin)
          </p>
        )}
      </div>

      {/* Pending Sign-ups */}
      {subTab === 'pending' && (
        <>
          {scopedPending.length > 0 && (
            <div className="space-y-2.5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Field label="Search pending sign-ups" htmlFor="pending-search" hideLabel className="flex-1">
                  <Input
                    id="pending-search"
                    type="search"
                    value={pendingQuery}
                    leadingIcon={Search}
                    placeholder="Name, matric number, email or department"
                    onChange={(e) => setPendingQuery(e.target.value)}
                  />
                </Field>
                <Field label="Sort by" htmlFor="pending-sort" hideLabel>
                  <Select
                    id="pending-sort"
                    value={pendingSort}
                    onChange={(e) => setPendingSort(e.target.value as PendingSort)}
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="name">Name A–Z</option>
                    <option value="department">Department A–Z</option>
                  </Select>
                </Field>
              </div>

              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter pending sign-ups">
                {pendingFilterOptions.map((option) => (
                  <Button
                    key={option.key}
                    type="button"
                    size="sm"
                    variant={pendingFilter === option.key ? 'secondary' : 'outline'}
                    aria-pressed={pendingFilter === option.key}
                    onClick={() => setPendingFilter(option.key)}
                  >
                    {option.label}
                    {typeof option.count === 'number' ? ` (${option.count})` : ''}
                  </Button>
                ))}
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Showing {visiblePending.length} of {pendingSummary.total}
                {pendingSummary.oldestWaitingHours !== null &&
                  ` · oldest waiting ${pendingSummary.oldestWaitingHours}h`}
              </p>
            </div>
          )}

          {scopedPending.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="All caught up"
              body="There are no pending account registrations waiting for approval."
            />
          ) : visiblePending.length === 0 ? (
            <EmptyState
              icon={Search}
              title="No matches"
              body="No pending sign-ups match this search or filter."
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingQuery('');
                  setPendingFilter('all');
                }}
              >
                Clear search and filters
              </Button>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {visiblePending.map((user) => {
                const isLecturerReq =
                  user.requestedRole === 'lecturer' || user.accountType === 'staff';
                const selectedRole =
                  pendingRoleMap[user.uid] || getDefaultApprovalRole(user);

                return (
                  <Card key={user.uid} padding={5} className="space-y-4">
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        name={user.fullName}
                        photoURL={user.photoURL}
                        avatarId={user.avatarId}
                        size="lg"
                        roundedClass="rounded-2xl"
                        fallbackClassName={
                          isLecturerReq
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300'
                            : 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                        }
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                            {user.fullName}
                          </h3>
                          <Badge tone={isLecturerReq ? 'indigo' : 'slate'} className="shrink-0">
                            {user.invited && 'Rep invite · '}Requested: {isLecturerReq ? 'Lecturer' : 'Student'}
                          </Badge>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="text-slate-400 dark:text-slate-500">
                            {user.accountType === 'staff' ? 'Staff ID: ' : 'Matric No: '}
                          </span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">{user.idNumber}</span>
                        </p>

                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          <span className="text-slate-400 dark:text-slate-500">
                            {user.accountType === 'staff' ? 'Dept / Office: ' : 'Department: '}
                          </span>
                          <span className="font-medium text-slate-800 dark:text-slate-200">{user.department}</span>
                          <span aria-hidden="true"> · </span>
                          <span>
                            {formatLevelLabel(user.level, user.is_alumni)}
                          </span>
                        </p>

                        {user.email && (
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                            Email: {user.email}
                          </p>
                        )}
                      </div>
                    </div>

                    {!isLecturerReq && <><p className="text-sm font-medium">Student requested {user.level}</p>{cohortPicker(user)}</>}
                    {isAdmin && (
                      <div className="flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/70 rounded-2xl px-3.5 py-2 border border-slate-100 dark:border-slate-700/80">
                        <label
                          htmlFor={`approve-role-${user.uid}`}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap"
                        >
                          Assign Role
                        </label>
                        <Select
                          id={`approve-role-${user.uid}`}
                          value={selectedRole}
                          disabled={busyId === user.uid}
                          onChange={(e) =>
                            setPendingRoleMap((prev) => ({
                              ...prev,
                              [user.uid]: e.target.value as UserRole,
                            }))
                          }
                        >
                          {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                            <option key={roleKey} value={roleKey}>
                              {ROLE_LABELS[roleKey]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {user.proofMethod && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-500 dark:text-slate-400">Evidence: </span>
                        {user.proofMethod}{user.proofDetail && ` · ${user.proofDetail}`}
                      </p>
                    )}
                    {(!user.proofMethod || ['Uploaded document','Staff ID photo'].includes(user.proofMethod)) && (
                      <Button
                        type="button"
                        variant="secondary"
                        full
                        onClick={() => handleOpenIdCardPreview(user)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View verification proof</span>
                      </Button>
                    )}

                    {decisionMessage?.uid === user.uid && (
                      <Alert variant={decisionMessage.error ? 'error' : 'success'}>
                        {decisionMessage.text}
                      </Alert>
                    )}
                    {confirmId === user.uid ? (
                      <div className="rounded-xl border border-emerald-300 p-3 space-y-2">
                        {!isLecturerReq && levelDifference(user.level,selectedLevel(user)) && (
                          <p className="text-sm font-medium text-amber-700">
                            {levelDifference(user.level,selectedLevel(user))}
                          </p>
                        )}
                        <p className="font-semibold">
                          Approve {user.fullName} as {isLecturerReq ? 'staff' : selectedLevel(user)}?
                        </p>
                        <div className="flex gap-2">
                          <Button type="button" disabled={!!busyId} onClick={() => void handleDecision(user, 'approved')}>
                            Confirm
                          </Button>
                          <Button type="button" variant="outline" disabled={!!busyId} onClick={() => setConfirmId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="danger"
                          full
                          disabled={!!busyId}
                          onClick={() => {
                            setRejectTarget(user);
                            setRejectionReasonInput('');
                          }}
                        >
                          <X className="w-4 h-4" />
                          <span>Reject</span>
                        </Button>
                        <Button
                          type="button"
                          full
                          disabled={!!busyId}
                          onClick={() => {
                            setCohortNotice('');
                            if (!isLecturerReq && !selectedLevel(user)) {
                              setDecisionMessage({uid:user.uid, text:chooseLevelMessage, error:true});
                              return;
                            }
                            setDecisionMessage(null);
                            setConfirmId(user.uid);
                          }}
                        >
                          <Check className="w-4 h-4" />
                          <span>Approve</span>
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
          {hasMorePendingUsers && onLoadMore && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore}
                onClick={() => onLoadMore('hasMorePendingUsers')}
              >
                {loadingMore ? 'Loading…' : 'Load more pending accounts'}
              </Button>
            </div>
          )}
        </>
      )}

      {/* Reports Queue */}
      {subTab === 'reports' && (
        <>
          {reports.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
              <Flag className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No reports</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Reported messages from chats will appear here for moderation review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => {
                const isOpen = report.status === 'open';
                return (
                  <div
                    key={report.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {report.reason}
                          </span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-xs text-slate-600 dark:text-slate-300">{report.chatName}</span>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                            {formatDateTime(report.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Sender: <span className="font-semibold text-slate-800 dark:text-slate-200">{report.reportedUserName}</span>
                          {' · '}
                          Reported by: <span className="font-medium text-slate-700 dark:text-slate-300">{report.reporterName}</span>
                        </p>
                      </div>

                      <span
                        className={`text-xs font-semibold capitalize shrink-0 ${
                          isOpen
                            ? 'text-amber-700 dark:text-amber-400'
                            : report.status === 'resolved'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {report.status}
                      </span>
                    </div>

                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700/80 p-3.5 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                      {report.messageText}
                    </div>

                    {report.details && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Note: {report.details}
                      </p>
                    )}

                    {isOpen ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() => handleDeleteReportedMessage(report)}
                          className="min-h-[42px] px-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete Message</span>
                        </button>
                        {report.reportedUserId !== currentUser.uid && (
                          <button
                            type="button"
                            disabled={busyId === report.id}
                            onClick={() => handleSuspendReportedUser(report)}
                            className="min-h-[42px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Ban className="w-4 h-4" />
                            <span>Suspend User</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === report.id}
                          onClick={() => handleDismissReport(report.id)}
                          className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Resolution: <span className="font-medium text-slate-700 dark:text-slate-200">{report.resolutionAction.replace('_', ' ')}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {hasMoreReports && onLoadMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => onLoadMore('hasMoreReports')}
                className="min-h-[40px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more reports'}
              </button>
            </div>
          )}
        </>
      )}

      {/* Users & Roles */}
      {subTab === 'users' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name, ID, or department..."
                className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
              />
              {userSearch && (
                <button
                  type="button"
                  onClick={() => setUserSearch('')}
                  aria-label="Clear user search"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {userBanner && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
              {userBanner}
            </div>
          )}

          {userError && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-4 py-2.5 text-xs text-red-700 dark:text-red-300 font-medium flex items-center justify-between gap-2"
            >
              <span>{userError}</span>
              <button
                type="button"
                onClick={() => setUserError(null)}
                aria-label="Dismiss user error"
                className="text-red-500 hover:text-red-700 dark:hover:text-red-200 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {filteredAllUsers.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                No matching users
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {userSearch.trim()
                  ? `No campus members matched "${userSearch.trim()}".`
                  : 'No user accounts have loaded yet.'}
              </p>
            </div>
          ) : (
          <div className="space-y-2.5">
            {filteredAllUsers.map((user) => {
              const isSelf = user.uid === currentUser.uid;
              const isSuspended = user.status === 'suspended';
              const expired = isUserExpired(user);
              const verifyPending = isUserVerifyPending(user);
              return (
                <div
                  key={user.uid}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col gap-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                          {user.fullName}
                        </span>
                        <RoleBadge role={user.role} showStudent />
                        {user.is_alumni && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70">
                            <Award className="w-3 h-3" />
                            <span>Alumni</span>
                          </span>
                        )}
                        {user.is_alumni && user.is_exempt && !expired && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70">
                            Exempt
                          </span>
                        )}
                        {verifyPending && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70">
                            Verify pending
                          </span>
                        )}
                        {expired && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-800/70">
                            Expired
                          </span>
                        )}
                        {isSuspended && (
                          <span className="text-xs font-semibold text-red-700 dark:text-red-400">
                            Suspended
                          </span>
                        )}
                        {user.status === 'rejected' && (
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            Rejected
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="font-mono">{user.idNumber}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{user.department}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{formatCompactLevelLabel(user.level, user.is_alumni)}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {canDecide && !isSelf && (caseId!==user.uid ? <button type="button" onClick={()=>{setCaseId(user.uid);setCaseReason('');setCaseStatus('pending');}}>Review decision</button> : <div className="space-y-2"><label>Decision for {user.fullName}<select value={caseStatus} onChange={e=>setCaseStatus(e.target.value)}>{['pending','approved','rejected','suspended'].map(v=><option key={v}>{v}</option>)}</select></label><input placeholder="Decision reason" aria-label="Decision reason" maxLength={500} value={caseReason} onChange={e=>setCaseReason(e.target.value)}/><button type="button" disabled={!caseReason.trim() || busyId===caseId} onClick={decideCase}>Record decision</button><button type="button" onClick={()=>setCaseId('')}>Cancel</button></div>)}
                      {canDecide && user.role==='classRep' && <button type="button" onClick={async()=>{const {data,error}=await supabase.rpc('manage_rep_invite',{rep_id:user.uid});if(error)setAdminError(error.message);else{const link=new URL('/',location.origin);link.searchParams.set('invite',data);setInviteLink(link.href);}}}>Replace department invite</button>}
                      {isAdmin && user.role==='classRep' && cohortPicker(user, true)}
                      <select
                        aria-label={`Change department for ${user.fullName}`}
                        value={user.department}
                        disabled={busyId === user.uid}
                        onChange={(e) => handleRequestDepartmentChange(user, e.target.value)}
                        className="min-h-[42px] max-w-[200px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-600 disabled:opacity-60"
                      >
                        {!departments.some((d) => d.name === user.department) && (
                          <option value={user.department}>{user.department}</option>
                        )}
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.name}>
                            {dept.name}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label={`Assign role for ${user.fullName}`}
                        value={user.role}
                        disabled={busyId === user.uid || isSelf}
                        onChange={(e) => handleRequestRoleChange(user, e.target.value as UserRole)}
                        className="min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:border-emerald-600 disabled:opacity-60"
                      >
                        {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                          <option key={roleKey} value={roleKey}>
                            {ROLE_LABELS[roleKey]}
                          </option>
                        ))}
                      </select>

                      {!isSelf && (
                        <button
                          type="button"
                          disabled={busyId === user.uid}
                          onClick={() => handleToggleSuspend(user)}
                          className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                            isSuspended
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60'
                              : 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60'
                          }`}
                        >
                          {isSuspended ? (
                            <>
                              <ShieldCheck className="w-4 h-4" />
                              <span>Reactivate</span>
                            </>
                          ) : (
                            <>
                              <UserX className="w-4 h-4" />
                              <span>Suspend</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {user.is_alumni && !isSelf && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                      <label className="inline-flex items-center gap-2.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={Boolean(user.is_exempt)}
                          aria-label={`Keep ${user.fullName} as mentor (exempt)`}
                          disabled={busyId === user.uid}
                          onClick={() => handleToggleAlumniExempt(user)}
                          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-60 ${
                            user.is_exempt
                              ? 'bg-emerald-700 border-emerald-600'
                              : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-2xs transition-transform ${
                              user.is_exempt ? 'translate-x-5.5' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span>Keep as mentor (exempt)</span>
                      </label>

                      {!expired && (
                        <button
                          type="button"
                          disabled={busyId === user.uid}
                          onClick={() => setExpireTarget(user)}
                          className="min-h-[36px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-700 dark:text-rose-300 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Expire account</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          )}
          {hasMoreAllUsers && onLoadMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => onLoadMore('hasMoreAllUsers')}
                className="min-h-[40px] px-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60"
              >
                {loadingMore ? 'Loading...' : 'Load more users'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Groups Directory & Creation */}
      {subTab === 'groups' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                placeholder="Search groups by name, department, or level..."
                className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
              />
              {groupSearch && (
                <button
                  type="button"
                  onClick={() => setGroupSearch('')}
                  aria-label="Clear group search"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Create Group</span>
              </button>
            </div>
          </div>

          {groupBanner && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
              {groupBanner}
            </div>
          )}

          {filteredGroups.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No groups yet</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Department and General groups are provisioned automatically, or create a custom group above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredGroups.map((group) => {
                const scopeLabel =
                  group.type === 'general'
                    ? 'Campus-wide general group'
                    : group.type === 'department'
                      ? `${group.department}${group.level ? ` · ${formatLevelLabel(group.level)}` : ' · All levels'}`
                      : group.accessKey === 'invited'
                        ? 'Custom · Invite-only'
                        : group.accessKey?.startsWith('deptLevel:')
                          ? `Custom · ${group.department} (${group.level ? formatLevelLabel(group.level) : 'All'})`
                          : group.accessKey?.startsWith('dept:')
                            ? `Custom · ${group.department}`
                            : 'Custom · All GSU';

                return (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {group.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {scopeLabel}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {onOpenGroup && (
                        <button
                          type="button"
                          onClick={() => onOpenGroup(group.id)}
                          aria-label={`Open ${group.name}`}
                          className="min-h-[40px] px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Open</span>
                        </button>
                      )}
                      {group.type === 'custom' && confirmDeleteGroupId !== group.id && (
                        <button
                          type="button"
                          disabled={busyId === group.id}
                          onClick={() => setConfirmDeleteGroupId(group.id)}
                          aria-label={`Delete ${group.name}`}
                          className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {group.type === 'custom' && confirmDeleteGroupId === group.id && (
                        <div className="inline-flex items-center gap-1 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800/70 rounded-xl p-1">
                          <button
                            type="button"
                            disabled={busyId === group.id}
                            onClick={() => handleDeleteGroup(group)}
                            className="min-h-[30px] px-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-[11px] font-semibold cursor-pointer"
                          >
                            {busyId === group.id ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === group.id}
                            onClick={() => setConfirmDeleteGroupId(null)}
                            className="min-h-[30px] px-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 text-[11px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Departments Directory (Admins only) */}
      {isAdmin && subTab === 'departments' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={deptSearch}
                onChange={(e) => setDeptSearch(e.target.value)}
                placeholder="Search departments or faculties..."
                className="w-full min-h-[44px] pl-10 pr-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
              />
              {deptSearch && (
                <button
                  type="button"
                  onClick={() => setDeptSearch('')}
                  aria-label="Clear department search"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={openAddDepartment}
                className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Department</span>
              </button>
            </div>
          </div>

          {deptMessage && (
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-4 py-2.5 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
              {deptMessage}
            </div>
          )}

          {deptError && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 px-4 py-2.5 text-xs text-red-700 dark:text-red-300 font-medium flex items-center justify-between gap-2"
            >
              <span>{deptError}</span>
              <button
                type="button"
                onClick={() => setDeptError(null)}
                aria-label="Dismiss department error"
                className="text-red-500 hover:text-red-700 dark:hover:text-red-200 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {filteredDepartments.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
              <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">No departments found</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Add a new department or adjust your search filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {filteredDepartments.map((dept) => (
                <div
                  key={dept.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {dept.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      Faculty of {dept.faculty}
                    </p>
                  </div>

                  {isFirestoreDepartmentsSeeded && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditDepartment(dept)}
                        aria-label={`Edit ${dept.name}`}
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-emerald-800 dark:hover:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busyId === dept.id}
                        onClick={() => handleRequestDeleteDepartment(dept)}
                        aria-label={`Delete ${dept.name}`}
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Auth Domain Settings (Admins only) */}
      {isAdmin && subTab === 'settings' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 max-w-xl space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                University Email Domain
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Optional GSU email domain suggested during sign-up (e.g., for campus email login). Student submissions go to authorized reviewers. Only admins decide lecturer and staff applications. This suggestion does not change the verified staff email domain.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveEmailDomain} className="space-y-3">
            <div>
              <label htmlFor="allowedDomainInput" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Domain
              </label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-slate-500 dark:text-slate-400 select-none">@</span>
                <input
                  id="allowedDomainInput"
                  type="text"
                  required
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value)}
                  placeholder="gsu.edu.ng"
                  className="flex-1 min-w-0 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={domainBusy}
              className="w-full sm:w-auto min-h-[44px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
            >
              {domainBusy ? 'Saving...' : 'Save Domain'}
            </button>

            {domainMessage && (
              <div
                role="status"
                className={`rounded-2xl px-3.5 py-2.5 text-xs font-medium ${
                  domainMessage.type === 'ok'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200'
                    : 'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-300'
                }`}
              >
                {domainMessage.text}
              </div>
            )}
          </form>
        </div>
      )}

      {/* Add / Edit Department Modal */}
      {deptModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingDept ? 'Edit Department' : 'Add Department'}
              </h3>
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDepartment} className="space-y-3.5">
              <div>
                <label htmlFor="deptName" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Department Name
                </label>
                <input
                  id="deptName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  value={deptNameInput}
                  onChange={(e) => setDeptNameInput(e.target.value)}
                  placeholder="e.g. Science Laboratory Technology"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                />
              </div>

              <div>
                <label htmlFor="deptFaculty" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Faculty
                </label>
                <select
                  id="deptFaculty"
                  value={deptFacultyInput}
                  onChange={(e) => setDeptFacultyInput(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                >
                  {GSU_FACULTIES.map((fac) => (
                    <option key={fac} value={fac}>
                      {fac}
                    </option>
                  ))}
                  <option value="__other__">Other Faculty...</option>
                </select>
              </div>

              {deptFacultyInput === '__other__' && (
                <div>
                  <label htmlFor="customFaculty" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    Faculty Name
                  </label>
                  <input
                    id="customFaculty"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={customFacultyInput}
                    onChange={(e) => setCustomFacultyInput(e.target.value)}
                    placeholder="e.g. Environmental Sciences"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
                  />
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDeptModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deptBusy}
                  className="flex-1 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {deptBusy ? 'Saving...' : editingDept ? 'Save Changes' : 'Add Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createGroupOpen && (
        <CreateGroupModal
          currentUser={currentUser}
          departments={departments}
          approvedUsers={approvedUsers}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(chatId) => {
            setCreateGroupOpen(false);
            setGroupBanner('Custom group created.');
            scheduleBannerClear(setGroupBanner, 4000);
            if (onOpenGroup) {
              onOpenGroup(chatId);
            }
          }}
        />
      )}

      {/* Rejection Confirmation Modal */}
      {rejectTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Reject sign-up request"
          className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Reject Sign-up Request
              </h3>
              <button
                type="button"
                disabled={busyId === rejectTarget.uid}
                onClick={() => setRejectTarget(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to reject{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">{rejectTarget.fullName}</span>{' '}
              ({rejectTarget.idNumber})? Give a reason they will see on their Awaiting Approval page:
            </p>

            <label className="text-xs">Quick reason <select defaultValue="" onChange={e=>setRejectionReasonInput(e.target.value)}><option value="">Write a reason or choose one</option>{['Document unreadable',rejectTarget.accountType === 'staff' ? 'Name or staff ID does not match' : 'Name or matric number does not match','Wrong level selected'].map(v=><option key={v}>{v}</option>)}</select></label>
            <textarea
              rows={3}
              maxLength={300}
              value={rejectionReasonInput}
              onChange={(e) => setRejectionReasonInput(e.target.value)}
              placeholder="Required reason (e.g. Matric number could not be matched with department records.)"
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
            />

            <p className="text-xs break-words">Applicant will see: {rejectionReasonInput.trim() || 'Add a reason above.'}</p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === rejectTarget.uid}
                onClick={() => setRejectTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === rejectTarget.uid || !rejectionReasonInput.trim()}
                onClick={() => handleDecision(rejectTarget, 'rejected', rejectionReasonInput)}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {busyId === rejectTarget.uid ? 'Rejecting...' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Signed ID Card Preview Modal */}
      {idCardModal && (
        <div
          onClick={() => setIdCardModal(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IdCard className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {idCardModal.user.fullName} — Verification proof
                  </h3>
                  <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {idCardModal.user.idNumber}
                  </p>
                  {idCardModal.fileName && <p className="text-sm break-words">{idCardModal.fileName}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIdCardModal(null)}
                aria-label="Close verification preview"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 p-3 flex items-center justify-center min-h-[240px]">
              {idCardModal.loading ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Loading private verification file...
                </p>
              ) : idCardModal.error ? (
                <p className="text-xs text-red-600 dark:text-red-400 text-center">
                  {idCardModal.error}
                </p>
              ) : idCardModal.url ? (
                idCardModal.isPdf ? (
                  <iframe
                    src={idCardModal.url}
                    title={idCardModal.fileName || "Verification document PDF"}
                    className="w-full h-[360px] rounded-xl border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <img
                    src={idCardModal.url}
                    alt={`Verification proof for ${idCardModal.user.fullName}`}
                    className="max-h-[420px] w-auto rounded-xl object-contain"
                  />
                )
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Confirm Expire Alumni Account Modal */}
      {expireTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm expire alumni account"
          className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Expire Alumni Account
              </h3>
              <button
                type="button"
                disabled={busyId === expireTarget.uid}
                onClick={() => setExpireTarget(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to expire the Alumni account for{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {expireTarget.fullName}
              </span>{' '}
              ({expireTarget.idNumber})? They will be signed out and locked out of GSU Connect with an Account expired notice.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === expireTarget.uid}
                onClick={() => setExpireTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === expireTarget.uid}
                onClick={handleConfirmExpireUser}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {busyId === expireTarget.uid ? 'Expiring...' : 'Expire Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Role / Department Change Modal */}
      {pendingUserChange && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            pendingUserChange.kind === 'role'
              ? 'Confirm role change'
              : 'Confirm department change'
          }
          className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {pendingUserChange.kind === 'role'
                  ? 'Confirm Role Change'
                  : 'Confirm Department Change'}
              </h3>
              <button
                type="button"
                disabled={busyId === pendingUserChange.user.uid}
                onClick={() => setPendingUserChange(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pendingUserChange.kind === 'role' ? (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Change role for{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {pendingUserChange.user.fullName}
                </span>{' '}
                ({pendingUserChange.user.idNumber}) from{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {ROLE_LABELS[pendingUserChange.user.role]}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {ROLE_LABELS[pendingUserChange.nextRole]}
                </span>
                ?
              </p>
            ) : (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Move{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {pendingUserChange.user.fullName}
                </span>{' '}
                ({pendingUserChange.user.idNumber}) from{' '}
                <span className="font-semibold text-slate-900 dark:text-slate-100">
                  {pendingUserChange.user.department}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {pendingUserChange.nextDepartment}
                </span>
                ?
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === pendingUserChange.user.uid}
                onClick={() => setPendingUserChange(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === pendingUserChange.user.uid}
                onClick={handleConfirmUserChange}
                className="flex-1 min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {busyId === pendingUserChange.user.uid ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Department Modal */}
      {deleteDeptTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete department"
          className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-transparent dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Delete Department
              </h3>
              <button
                type="button"
                disabled={busyId === deleteDeptTarget.id}
                onClick={() => setDeleteDeptTarget(null)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to remove{' '}
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {deleteDeptTarget.name}
              </span>{' '}
              (Faculty of {deleteDeptTarget.faculty}) from the departments directory?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={busyId === deleteDeptTarget.id}
                onClick={() => setDeleteDeptTarget(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busyId === deleteDeptTarget.id}
                onClick={handleConfirmDeleteDepartment}
                className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {busyId === deleteDeptTarget.id ? 'Removing...' : 'Delete Department'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
