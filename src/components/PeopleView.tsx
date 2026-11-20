import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  MapPin,
  MessageCircle,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  findDmChat,
  openOrCreateDmChat,
  searchPeople,
  updateOwnStudyProfile,
  updateUserRoleAndStatus,
} from '../services/supabaseService';
import {
  AppUser,
  canViewMemberIdNumber,
  ChatThread,
  formatCompactLevelLabel,
  isUserOnline,
  ROLE_LABELS,
  STUDENT_LEVELS,
  UserRole,
} from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';
import { UserProfileModal } from './UserProfileModal';

interface PeopleViewProps {
  currentUser: AppUser;
  approvedUsers: AppUser[];
  chats?: ChatThread[];
  nowMs?: number;
  onlineUserIds?: Set<string>;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onStartDm: (chatId: string) => void;
  onStartVoiceCall?: (target: AppUser) => Promise<void> | void;
}

function formatOfflineLastSeen(diffMs: number): string {
  const totalMinutes = Math.max(5, Math.floor(diffMs / 60_000));
  if (totalMinutes < 60) return `Last seen ${totalMinutes}m ago`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `Last seen ${totalHours}h ago`;
  const totalDays = Math.floor(totalHours / 24);
  return `Last seen ${totalDays}d ago`;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
  currentUser,
  approvedUsers,
  chats = [],
  nowMs = Date.now(),
  onlineUserIds,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onStartDm,
  onStartVoiceCall,
}) => {
  const isAdmin = currentUser.role === 'admin';
  const [search, setSearch] = useState('');
  const [remoteSearchUsers, setRemoteSearchUsers] = useState<AppUser[] | null>(null);
  const [searchingRemote, setSearchingRemote] = useState(false);
  const [segment, setSegment] = useState<'all' | 'dept' | 'staff' | 'study'>('all');
  const [studyCourseFilter, setStudyCourseFilter] = useState('');
  const [studyLevelFilter, setStudyLevelFilter] = useState<string>('All');

  const [myCourses, setMyCourses] = useState<string[]>(currentUser.studyCourses || []);
  const [newCourseInput, setNewCourseInput] = useState('');
  const [myStudySpot, setMyStudySpot] = useState(currentUser.studySpot || '');
  const [savingStudyProfile, setSavingStudyProfile] = useState(false);
  const [studySavedBanner, setStudySavedBanner] = useState(false);

  const [openingUid, setOpeningUid] = useState<string | null>(null);
  const [updatingRoleUid, setUpdatingRoleUid] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [profileModalUid, setProfileModalUid] = useState<string | null>(null);
  const [profileModalSnapshot, setProfileModalSnapshot] = useState<AppUser | null>(null);
  const studyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (studyTimerRef.current) window.clearTimeout(studyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed.length < 2) {
      setRemoteSearchUsers(null);
      setSearchingRemote(false);
      return;
    }
    let cancelled = false;
    setSearchingRemote(true);
    const timer = window.setTimeout(async () => {
      try {
        const matches = await searchPeople(trimmed);
        if (!cancelled) setRemoteSearchUsers(matches);
      } catch {
        if (!cancelled) setRemoteSearchUsers(null);
      } finally {
        if (!cancelled) setSearchingRemote(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    setMyCourses(currentUser.studyCourses || []);
    setMyStudySpot(currentUser.studySpot || '');
  }, [currentUser.studyCourses, currentUser.studySpot]);

  const combinedDirectory = useMemo(() => {
    if (!remoteSearchUsers || remoteSearchUsers.length === 0) return approvedUsers;
    const byId = new Map<string, AppUser>();
    approvedUsers.forEach((u) => byId.set(u.uid, u));
    remoteSearchUsers.forEach((u) => byId.set(u.uid, u));
    return Array.from(byId.values());
  }, [approvedUsers, remoteSearchUsers]);

  const selectedProfileUser = useMemo(() => {
    if (!profileModalUid) return null;
    return combinedDirectory.find((u) => u.uid === profileModalUid) || profileModalSnapshot;
  }, [combinedDirectory, profileModalUid, profileModalSnapshot]);

  const selectedProfileDmChat = useMemo(() => {
    if (!selectedProfileUser) return null;
    return findDmChat(chats, currentUser.uid, selectedProfileUser.uid);
  }, [chats, currentUser.uid, selectedProfileUser]);

  const myCourseSet = useMemo(
    () => new Set((currentUser.studyCourses || []).map((c) => c.toUpperCase())),
    [currentUser.studyCourses]
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const courseFilterUpper = studyCourseFilter.trim().toUpperCase();

    const list = combinedDirectory
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => {
        if (segment === 'dept') return u.department === currentUser.department;
        if (segment === 'staff') {
          return u.accountType === 'staff' || u.role === 'lecturer' || u.role === 'admin';
        }
        if (segment === 'study') {
          if (u.accountType === 'staff' && (!u.studyCourses || u.studyCourses.length === 0)) {
            return false;
          }
          if (studyLevelFilter !== 'All' && u.level !== studyLevelFilter) {
            return false;
          }
          if (courseFilterUpper) {
            const courses = u.studyCourses || [];
            const matchesCourse = courses.some((c) =>
              c.toUpperCase().includes(courseFilterUpper)
            );
            if (!matchesCourse) return false;
          }
        }
        return true;
      })
      .filter((u) => {
        if (!q) return true;
        const coursesStr = (u.studyCourses || []).join(' ').toLowerCase();
        const spotStr = (u.studySpot || '').toLowerCase();
        const canSeeId = canViewMemberIdNumber(currentUser, u.uid);
        const normalizedQ = q.replace(/[^a-z0-9]/g, '');
        return (
          u.fullName.toLowerCase().includes(q) ||
          (canSeeId &&
            (u.idNumber.toLowerCase().includes(q) ||
              (normalizedQ.length > 0 && u.idNumberNormalized.includes(normalizedQ)))) ||
          u.department.toLowerCase().includes(q) ||
          coursesStr.includes(q) ||
          spotStr.includes(q)
        );
      });

    if (segment === 'study') {
      return [...list].sort((a, b) => {
        const aCourses = a.studyCourses || [];
        const bCourses = b.studyCourses || [];
        const aShared = aCourses.filter((c) => myCourseSet.has(c.toUpperCase())).length;
        const bShared = bCourses.filter((c) => myCourseSet.has(c.toUpperCase())).length;
        if (bShared !== aShared) return bShared - aShared;
        if ((bCourses.length > 0 ? 1 : 0) !== (aCourses.length > 0 ? 1 : 0)) {
          return (bCourses.length > 0 ? 1 : 0) - (aCourses.length > 0 ? 1 : 0);
        }
        const aSameDept = a.department === currentUser.department ? 1 : 0;
        const bSameDept = b.department === currentUser.department ? 1 : 0;
        if (bSameDept !== aSameDept) return bSameDept - aSameDept;
        return a.fullName.localeCompare(b.fullName);
      });
    }

    return list.sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [
    combinedDirectory,
    currentUser.uid,
    currentUser.department,
    search,
    segment,
    studyCourseFilter,
    studyLevelFilter,
    myCourseSet,
  ]);

  const checkOnline = (u: AppUser) =>
    onlineUserIds ? onlineUserIds.has(u.uid) : isUserOnline(u.lastSeen, nowMs);

  const onlineCount = useMemo(
    () =>
      filteredUsers.filter((u) =>
        onlineUserIds ? onlineUserIds.has(u.uid) : isUserOnline(u.lastSeen, nowMs)
      ).length,
    [filteredUsers, onlineUserIds, nowMs]
  );

  const handleMessage = async (target: AppUser) => {
    setActionError(null);
    setOpeningUid(target.uid);
    try {
      const chatId = await openOrCreateDmChat(currentUser, target);
      onStartDm(chatId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to start direct message.'
      );
    } finally {
      setOpeningUid(null);
    }
  };

  const handleRoleChange = async (targetUid: string, role: UserRole) => {
    setActionError(null);
    setUpdatingRoleUid(targetUid);
    try {
      await updateUserRoleAndStatus(targetUid, { role });
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to update member role.'
      );
    } finally {
      setUpdatingRoleUid(null);
    }
  };

  const handleAddCourseChip = () => {
    const clean = newCourseInput.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 20);
    if (clean.length < 2) return;
    if (myCourses.includes(clean) || myCourses.length >= 8) {
      setNewCourseInput('');
      return;
    }
    setMyCourses((prev) => [...prev, clean]);
    setNewCourseInput('');
  };

  const handleSaveStudyProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingStudyProfile) return;
    setActionError(null);
    const pendingClean = newCourseInput.trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 20);
    const finalCourses =
      pendingClean.length >= 2 && !myCourses.includes(pendingClean) && myCourses.length < 8
        ? [...myCourses, pendingClean]
        : myCourses;
    if (pendingClean.length >= 2) setNewCourseInput('');
    setSavingStudyProfile(true);
    try {
      await updateOwnStudyProfile(currentUser.uid, finalCourses, myStudySpot);
      setMyCourses(finalCourses);
      setStudySavedBanner(true);
      if (studyTimerRef.current) window.clearTimeout(studyTimerRef.current);
      studyTimerRef.current = window.setTimeout(() => setStudySavedBanner(false), 3000);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to save study profile.'
      );
    } finally {
      setSavingStudyProfile(false);
    }
  };

  return (
    <div className="space-y-4">
      {actionError && (
        <div
          role="alert"
          className="rounded-2xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 px-4 py-2.5 text-xs text-danger flex items-center justify-between gap-2"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="text-danger hover:text-danger hover:text-danger-line cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              segment === 'study'
                ? 'Search study partners by name, course code (e.g. CHM 201), or library spot...'
                : 'Search by full name, matric number, or Staff ID...'
            }
            className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand focus:ring-2 focus:ring-focus/15"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear people search"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-sunken rounded-2xl overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setSegment('all')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                segment === 'all'
                  ? 'bg-white dark:bg-surface text-ink shadow-2xs'
                  : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
              }`}
            >
              All Members
            </button>
            <button
              type="button"
              onClick={() => setSegment('dept')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                segment === 'dept'
                  ? 'bg-white dark:bg-surface text-ink shadow-2xs'
                  : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
              }`}
            >
              My Dept
            </button>
            <button
              type="button"
              onClick={() => setSegment('staff')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                segment === 'staff'
                  ? 'bg-white dark:bg-surface text-ink shadow-2xs'
                  : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
              }`}
            >
              Staff
            </button>
            <button
              type="button"
              onClick={() => setSegment('study')}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                segment === 'study'
                  ? 'bg-brand text-on-brand shadow-2xs'
                  : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Find Study Partner</span>
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 text-xs text-ink-muted px-1">
            <span
              className={`w-2 h-2 rounded-full ${
                onlineCount > 0 ? 'bg-brand' : 'bg-sunken'
              }`}
            />
            <span>{onlineCount} recently active</span>
          </div>
        </div>
      </div>

      {/* Study Partner Finder Tools & My Study Profile */}
      {segment === 'study' && (
        <div className="space-y-3">
          <form
            onSubmit={handleSaveStudyProfile}
            className="bg-surface rounded-3xl border border-success-line/80 dark:border-success-line/60 p-4 sm:p-5 space-y-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand" />
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    My Study Courses &amp; Preferred Spot
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Add courses you are reading (max 8) so classmates in the same course can match with you.
                  </p>
                </div>
              </div>
              {studySavedBanner && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                  <Check className="w-4 h-4" />
                  <span>Study profile saved</span>
                </span>
              )}
            </div>

            {myCourses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {myCourses.map((course) => (
                  <span
                    key={course}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-brand-subtle dark:bg-brand-subtle/70 border border-success-line dark:border-success-line/70 text-xs font-bold text-brand"
                  >
                    <span>{course}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setMyCourses((prev) => prev.filter((c) => c !== course))
                      }
                      aria-label={`Remove ${course}`}
                      className="hover:text-danger cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-5 flex gap-1.5">
                <input
                  type="text"
                  maxLength={20}
                  value={newCourseInput}
                  onChange={(e) => setNewCourseInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCourseChip();
                    }
                  }}
                  placeholder="Add course (e.g. CHM 201)"
                  className="flex-1 min-w-0 min-h-[40px] px-3 rounded-xl border border-line bg-sunken text-xs font-semibold text-ink uppercase placeholder:normal-case focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={handleAddCourseChip}
                  disabled={myCourses.length >= 8}
                  className="min-h-[40px] px-3 rounded-xl bg-sunken hover:bg-sunken text-xs font-semibold text-ink-soft inline-flex items-center gap-1 shrink-0 cursor-pointer disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <div className="sm:col-span-5 relative">
                <MapPin className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  maxLength={80}
                  value={myStudySpot}
                  onChange={(e) => setMyStudySpot(e.target.value)}
                  placeholder="Preferred spot (e.g. Main Library, Science LT)"
                  className="w-full min-h-[40px] pl-8 pr-3 rounded-xl border border-line bg-sunken text-xs text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="sm:col-span-2">
                <button
                  type="submit"
                  disabled={savingStudyProfile}
                  className="w-full min-h-[40px] px-3 rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-xs font-semibold cursor-pointer"
                >
                  {savingStudyProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>

          {/* Study Match Filters */}
          <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 relative">
              <input
                type="text"
                value={studyCourseFilter}
                onChange={(e) => setStudyCourseFilter(e.target.value)}
                placeholder="Filter by course code (e.g. CHM 201, CSC 301)..."
                className="w-full min-h-[40px] pl-3.5 pr-9 rounded-xl border border-line bg-sunken text-xs font-semibold text-ink focus:outline-none focus:border-brand"
              />
              {studyCourseFilter && (
                <button
                  type="button"
                  onClick={() => setStudyCourseFilter('')}
                  aria-label="Clear course code filter"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-soft absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {(['All', ...STUDENT_LEVELS] as string[]).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setStudyLevelFilter(lvl)}
                  className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                    studyLevelFilter === lvl
                      ? 'bg-brand border-brand text-on-brand'
                      : 'bg-sunken border-line text-ink-body dark:text-ink-soft'
                  }`}
                >
                  {lvl === 'All' ? 'All Levels' : `${lvl}L`}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {filteredUsers.length === 0 ? (
        <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center space-y-2">
          <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-ink">
            {searchingRemote ? 'Searching campus directory...' : 'No matching members'}
          </h3>
          <p className="text-sm text-ink-muted">
            {segment === 'study'
              ? 'No students matched that course code or level yet. Try clearing filters or add your own study courses above!'
              : 'Try searching another name, matric number, or Staff ID.'}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredUsers.map((person) => {
            const lastSeenMs = person.lastSeen?.toMillis() ?? null;
            const diffMs = lastSeenMs !== null ? Math.max(0, nowMs - lastSeenMs) : null;
            const recentlyActive = checkOnline(person);
            const statusTooltip = recentlyActive
              ? 'Online · Active now'
              : diffMs !== null
                ? `Offline · ${formatOfflineLastSeen(diffMs)}`
                : 'Offline';
            const personCourses = person.studyCourses || [];

            return (
              <div
                key={person.uid}
                className="bg-surface rounded-2xl border border-line/80 dark:border-line p-4 flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileModalSnapshot(person);
                      setProfileModalUid(person.uid);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left rounded-xl -m-1 p-1 hover:bg-sunken dark:hover:bg-sunken/60 transition-colors cursor-pointer"
                  >
                    <div className="relative shrink-0">
                      <UserAvatar
                        name={person.fullName}
                        photoURL={person.photoURL}
                        avatarId={person.avatarId}
                        size="lg"
                        roundedClass="rounded-2xl"
                        fallbackClassName="bg-brand-subtle dark:bg-brand-subtle/60 text-brand"
                      />
                      <span
                        title={statusTooltip}
                        aria-label={recentlyActive ? 'Online, recently active' : 'Offline'}
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                          recentlyActive ? 'bg-brand' : 'bg-sunken'
                        }`}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm font-semibold text-ink truncate hover:underline">
                          {person.fullName}
                        </span>
                        <RoleBadge role={person.role} />
                      </div>
                      <p className="text-xs text-ink-muted truncate mt-0.5">
                        <span>{person.department}</span>
                        <span aria-hidden="true"> · </span>
                        <span>
                          {formatCompactLevelLabel(person.level, person.is_alumni)}
                        </span>
                        {canViewMemberIdNumber(currentUser, person.uid) && person.idNumber && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono">{person.idNumber}</span>
                          </>
                        )}
                      </p>
                      <div className="flex items-center gap-1.5 mt-1 text-xs">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            recentlyActive ? 'bg-brand' : 'bg-sunken'
                          }`}
                        />
                        {recentlyActive ? (
                          <span className="inline-flex items-center gap-1.5 text-brand font-medium truncate">
                            <span>Online</span>
                            <span aria-hidden="true" className="text-brand/50">·</span>
                            <span>Recently active</span>
                          </span>
                        ) : (
                          <span className="text-ink-muted truncate">
                            <span>Offline</span>
                            {diffMs !== null && (
                              <>
                                <span aria-hidden="true"> · </span>
                                <span className="text-ink-muted">
                                  {formatOfflineLastSeen(diffMs)}
                                </span>
                              </>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {isAdmin && (
                      <select
                        aria-label={`Change role for ${person.fullName}`}
                        value={person.role}
                        disabled={updatingRoleUid === person.uid}
                        onChange={(e) => handleRoleChange(person.uid, e.target.value as UserRole)}
                        className="min-h-[42px] px-2.5 rounded-xl border border-line bg-sunken text-xs font-semibold text-ink focus:outline-none focus:border-brand disabled:opacity-60"
                      >
                        {(Object.keys(ROLE_LABELS) as UserRole[]).map((roleKey) => (
                          <option key={roleKey} value={roleKey}>
                            {ROLE_LABELS[roleKey]}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => handleMessage(person)}
                      disabled={openingUid === person.uid}
                      className="min-h-[42px] px-3.5 rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 hover:bg-brand-subtle dark:hover:bg-brand-subtle/60 text-brand text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {openingUid === person.uid
                          ? 'Opening...'
                          : segment === 'study'
                            ? 'Study DM'
                            : 'Message'}
                      </span>
                    </button>
                  </div>
                </div>

                {(personCourses.length > 0 || person.studySpot) && (
                  <div className="pt-2 border-t border-line flex flex-wrap items-center gap-1.5">
                    {personCourses.map((course) => {
                      const isShared = myCourseSet.has(course.toUpperCase());
                      return (
                        <span
                          key={course}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                            isShared
                              ? 'bg-brand text-on-brand'
                              : 'bg-sunken text-ink-soft'
                          }`}
                        >
                          {course}
                        </span>
                      );
                    })}
                    {person.studySpot && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-warn-bg dark:bg-warn-bg/50 text-warn text-[11px] font-semibold">
                        <MapPin className="w-3 h-3" />
                        <span>{person.studySpot}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!search.trim() && hasMore && onLoadMore && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="min-h-[40px] px-5 rounded-2xl border border-line bg-surface hover:bg-sunken text-xs font-semibold text-ink-soft cursor-pointer disabled:opacity-60"
            >
              {loadingMore ? 'Loading more...' : 'Load more members'}
            </button>
          </div>
        )}
        </>
      )}

      {selectedProfileUser && (
        <UserProfileModal
          currentUser={currentUser}
          targetUser={selectedProfileUser}
          dmChat={selectedProfileDmChat}
          nowMs={nowMs}
          isOnline={onlineUserIds ? onlineUserIds.has(selectedProfileUser.uid) : undefined}
          onClose={() => {
            setProfileModalUid(null);
            setProfileModalSnapshot(null);
          }}
          onMessage={handleMessage}
          onVoiceCall={async (target) => {
            if (onStartVoiceCall) {
              await onStartVoiceCall(target);
            } else {
              await handleMessage(target);
            }
          }}
        />
      )}
    </div>
  );
};
