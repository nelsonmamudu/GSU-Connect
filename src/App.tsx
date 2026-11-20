import {StaffVouchInbox} from './components/StaffVerification';
import {RecoveryEmailConfirm} from './components/RecoveryEmailConfirm';
import {RecoveryEmailPrompt} from './components/RecoveryEmailPrompt';
import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronRight,
  Flame,
  GraduationCap,
  House,
  Compass,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  Moon,
  Radio,
  Shield,
  ShoppingBag,
  Sparkles,
  Sun,
  User as UserIcon,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  createCallSession,
  fetchProfileById,
  getMyAccountStatus,
  markChatAsRead,
  seedDefaultAuthConfigIfMissing,
  seedDefaultDepartmentsIfEmpty,
  signOutUser,
  subscribeToAuthState,
  subscribeToOnlinePresence,
  subscribeToOwnProfile,
  subscribeToPublicDirectory,
  subscribeToWorkspaceData,
  type SupabaseAuthUser,
  updateUserLastSeen,
  verifyAlumniAccount,
  type WorkspaceDataHandle,
  type WorkspacePaginationState,
} from './services/supabaseService';
import {
  AcademicResource,
  Announcement,
  ANNOUNCEMENTS_READ_KEY,
  AppTheme,
  AppUser,
  CalendarEvent,
  CampusConfession,
  CampusStatus,
  ChatThread,
  DEFAULT_ALLOWED_EMAIL_DOMAIN,
  DEFAULT_GSU_DEPARTMENTS,
  DepartmentItem,
  formatCompactLevelLabel,
  MarketplaceListing,
  ModerationReport,
  MyAccountStatus,
  RADAR_STATUS_LABELS,
  RideErrandPost,
  slugify,
  StarredMessage,
  STATUS_TTL_MS,
  VoiceCallSession,
} from './types';
import { RoleBadge } from './components/RoleBadge';
import { UserAvatar } from './components/UserAvatar';
import { bindFunnelFlush } from './services/funnel';
import { setGraduationClassYear } from './utils/graduationClass';
import { fetchEntryConfig } from './services/supabaseService';

const LazyAuthScreen = React.lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.AuthScreen }))
);
const LazySetPasswordScreen = React.lazy(() =>
  import('./components/AuthScreen').then((m) => ({ default: m.SetPasswordScreen }))
);
const LazyStatusGateScreen = React.lazy(() =>
  import('./components/StatusGateScreen').then((m) => ({ default: m.StatusGateScreen }))
);
const LazyChatsView = React.lazy(() =>
  import('./components/ChatsView').then((m) => ({ default: m.ChatsView }))
);
const LazyTodayView = React.lazy(() =>
  import('./components/WorkspaceHomeViews').then((m) => ({ default: m.TodayView }))
);
const LazyStudyHubView = React.lazy(() =>
  import('./components/WorkspaceHomeViews').then((m) => ({ default: m.StudyHubView }))
);
const LazyCampusHubView = React.lazy(() =>
  import('./components/WorkspaceHomeViews').then((m) => ({ default: m.CampusHubView }))
);
const LazyAnnouncementsView = React.lazy(() =>
  import('./components/AnnouncementsView').then((m) => ({ default: m.AnnouncementsView }))
);
const LazyPeopleView = React.lazy(() =>
  import('./components/PeopleView').then((m) => ({ default: m.PeopleView }))
);

const LazyStatusView = React.lazy(() =>
  import('./components/StatusView').then((m) => ({ default: m.StatusView }))
);
const LazyRepositoryView = React.lazy(() =>
  import('./components/RepositoryView').then((m) => ({ default: m.RepositoryView }))
);
const LazyMarketplaceView = React.lazy(() =>
  import('./components/MarketplaceView').then((m) => ({ default: m.MarketplaceView }))
);
const LazyCalendarView = React.lazy(() =>
  import('./components/CalendarView').then((m) => ({ default: m.CalendarView }))
);
const LazyRidesErrandsView = React.lazy(() =>
  import('./components/RidesErrandsView').then((m) => ({ default: m.RidesErrandsView }))
);
const LazyConfessionsView = React.lazy(() =>
  import('./components/ConfessionsView').then((m) => ({ default: m.ConfessionsView }))
);
const LazyProfileView = React.lazy(() =>
  import('./components/ProfileView').then((m) => ({ default: m.ProfileView }))
);
const LazyAdminView = React.lazy(() =>
  import('./components/AdminView').then((m) => ({ default: m.AdminView }))
);
const LazyVoiceCallModal = React.lazy(() =>
  import('./components/VoiceCallModal').then((m) => ({ default: m.VoiceCallModal }))
);

const DEFAULT_PAGINATION_STATE: WorkspacePaginationState = {
  hasMoreApprovedUsers: false,
  hasMorePendingUsers: false,
  hasMoreAllUsers: false,
  hasMoreAnnouncements: false,
  hasMoreCalendarEvents: false,
  hasMoreResources: false,
  hasMoreMarketplace: false,
  hasMoreStatuses: false,
  hasMoreRideErrands: false,
  hasMoreConfessions: false,
  hasMoreReports: false,
};

type AppTab =
  | 'today'
  | 'chats'
  | 'study'
  | 'campus'
  | 'statuses'
  | 'repository'
  | 'marketplace'
  | 'rides'
  | 'confessions'
  | 'calendar'
  | 'announcements'
  | 'people'
  | 'profile'
  | 'admin';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('GSU Connect ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-surface rounded-3xl border border-line p-6 text-center space-y-3">
            <h1 className="text-lg font-bold text-ink">Something went wrong</h1>
            <p className="text-xs text-ink-body dark:text-ink-soft break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 rounded-xl bg-brand text-on-brand text-sm font-semibold cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<SupabaseAuthUser | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState<MyAccountStatus | null>(null);
  const [accountStatusCheckedUid, setAccountStatusCheckedUid] = useState<string | null>(null);
  const [accountExpiredGate, setAccountExpiredGate] = useState(false);
  const [verifyingAlumni, setVerifyingAlumni] = useState(false);
  const [verifyAlumniError, setVerifyAlumniError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);

  const [chats, setChats] = useState<ChatThread[]>([]);

  const [chatReadsMap, setChatReadsMap] = useState<Record<string, number>>({});
  const [localReadFloorMap, setLocalReadFloorMap] = useState<Record<string, number>>({});
  const [rawUnreadCounts, setRawUnreadCounts] = useState<Record<string, number>>({});

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementFilterPreset, setAnnouncementFilterPreset] = useState<{
    scope: 'all' | 'department';
    nonce: number;
  } | null>(null);
  const [resources, setResources] = useState<AcademicResource[]>([]);
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [statuses, setStatuses] = useState<CampusStatus[]>([]);
  const [rideErrands, setRideErrands] = useState<RideErrandPost[]>([]);
  const [confessions, setConfessions] = useState<CampusConfession[]>([]);
  const [radarToast, setRadarToast] = useState<{
    chatId: string;
    chatName: string;
    statusLabel: string;
    detail: string;
  } | null>(null);
  const [starredMessages, setStarredMessages] = useState<StarredMessage[]>([]);
  const [jumpToMessage, setJumpToMessage] = useState<{
    chatId: string;
    messageId: string;
    nonce: number;
  } | null>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [approvedUsers, setApprovedUsers] = useState<AppUser[]>([]);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [firestoreDepartments, setFirestoreDepartments] = useState<DepartmentItem[]>([]);
  const [departmentsLoaded, setDepartmentsLoaded] = useState(false);
  const [allowedEmailDomain, setAllowedEmailDomain] = useState<string>(
    DEFAULT_ALLOWED_EMAIL_DOMAIN
  );
  const [authConfigLoaded, setAuthConfigLoaded] = useState(false);
  const [authConfigExists, setAuthConfigExists] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [presenceNowMs, setPresenceNowMs] = useState<number>(() => Date.now());
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [paginationState, setPaginationState] =
    useState<WorkspacePaginationState>(DEFAULT_PAGINATION_STATE);
  const [loadingMoreKey, setLoadingMoreKey] =
    useState<keyof WorkspacePaginationState | null>(null);
  const [activeVoiceCall, setActiveVoiceCall] = useState<VoiceCallSession | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => {
    try {
      const saved = localStorage.getItem('gsu_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {
      // Ignore storage access errors
    }
    return 'light';
  });

  const lastSeenWriteRef = useRef<number>(0);
  const workspaceHandleRef = useRef<WorkspaceDataHandle | null>(null);
  const sessionStartMsRef = useRef<number>(Date.now());
  const seenRadarMapRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('gsu_theme', theme);
    } catch {
      // Ignore storage quota errors
    }
  }, [theme]);

  // Flush queued funnel events when the tab is hidden or the page unloads.
  useEffect(() => bindFunnelFlush(), []);

  // Load the graduate class year once for the whole session so reviewers and
  // the status gate see the same configured cohort as the signup screen.
  useEffect(() => {
    let active = true;
    const load = async () => {
      const config = await fetchEntryConfig();
      if (!active || !config) return;
      setGraduationClassYear(config.graduationClassYear);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileDrawerOpen]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // 1. Auth state listener (Supabase Auth)
  useEffect(() => {
    let previousUid: string | undefined;
    const unsub = subscribeToAuthState((event, session) => {
      const user = session?.user ?? null;
      setAuthUser(user);
      setAuthReady(true);
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true);
      }
      if (event === 'SIGNED_IN') {
        setAccountExpiredGate(false);
      }
      if (!user) {
        setCurrentUser(null);
        setUserLoading(false);
        setAccountStatus(null);
        setAccountStatusCheckedUid(null);
        setVerifyingAlumni(false);
        setVerifyAlumniError(null);
      } else if (user.id !== previousUid) {
        setUserLoading(true);
      }
      previousUid = user?.id;
    });
    return () => unsub();
  }, []);

  // 2a. Account lifecycle check (expired / verify_pending / alumni / active) after sign-in & profile load
  useEffect(() => {
    if (!authReady || !authUser || userLoading || !currentUser) return;
    if (accountStatusCheckedUid === authUser.id) return;

    let active = true;
    getMyAccountStatus()
      .then((res) => {
        if (!active) return;
        setAccountStatus(res);
        setAccountStatusCheckedUid(authUser.id);
        if (res.status === 'expired') {
          setAccountExpiredGate(true);
          signOutUser().catch(() => undefined);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.warn('Account status check failed:', err);
        setAccountStatus({
          status: 'active',
          is_alumni: Boolean(currentUser.is_alumni),
          is_exempt: Boolean(currentUser.is_exempt),
          verify_deadline: currentUser.verify_deadline ?? null,
          alumni_verified_at: currentUser.alumni_verified_at ?? null,
          expires_at: currentUser.expires_at ?? null,
        });
        setAccountStatusCheckedUid(authUser.id);
      });

    return () => {
      active = false;
    };
  }, [authReady, authUser, userLoading, currentUser, accountStatusCheckedUid]);

  const isAccountStatusReady =
    Boolean(authUser?.id) && accountStatusCheckedUid === authUser?.id;
  const isApproved =
    currentUser?.status === 'approved' &&
    isAccountStatusReady &&
    accountStatus?.status !== 'expired';
  const uid = currentUser?.uid;
  const userDept = currentUser?.department;
  const userLevel = currentUser?.level;
  const userRole = currentUser?.role;

  // 1b. Live allowed email domain (always readable) & departments directory (approved users only)
  useEffect(() => {
    const unsub = subscribeToPublicDirectory(Boolean(isApproved), {
      onDepartments: (items) => {
        setFirestoreDepartments(items);
        setDepartmentsLoaded(Boolean(isApproved));
      },
      onAllowedDomain: (domain, exists) => {
        setAllowedEmailDomain(domain);
        setAuthConfigLoaded(true);
        setAuthConfigExists(exists);
      },
    });
    return () => unsub();
  }, [isApproved]);

  const authUid = authUser?.id;
  // 2. Real-time listener for current user's profile row
  useEffect(() => {
    if (!authReady || !authUid) return;
    const unsub = subscribeToOwnProfile(authUid, (profile) => {
      setCurrentUser(profile);
      setUserLoading(false);
    });
    return () => unsub();
  }, [authReady, authUid]);

  const refreshOwnProfile = () => {
    if (!authUser?.id) return;
    fetchProfileById(authUser.id)
      .then((profile) => {
        if (profile) setCurrentUser(profile);
      })
      .catch(() => undefined);
  };

  // Real-time online presence via Supabase Realtime Presence + throttled last_seen write when tab hides
  useEffect(() => {
    if (!isApproved || !uid) {
      lastSeenWriteRef.current = 0;
      setOnlineUserIds(new Set());
      return;
    }

    const unsubPresence = subscribeToOnlinePresence(uid, setOnlineUserIds);

    const tickInterval = window.setInterval(() => {
      setPresenceNowMs(Date.now());
    }, 30_000);

    const writeLastSeenIfDue = () => {
      const now = Date.now();
      if (now - lastSeenWriteRef.current < 10 * 60_000) return;
      lastSeenWriteRef.current = now;
      updateUserLastSeen(uid).catch(() => undefined);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        writeLastSeenIfDue();
      } else if (document.visibilityState === 'visible') {
        setPresenceNowMs(Date.now());
        refreshOwnProfile();
      }
    };

    const handleReconnect = () => {
      refreshOwnProfile();
      workspaceHandleRef.current?.retryAll();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('online', handleReconnect);

    return () => {
      unsubPresence();
      window.clearInterval(tickInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleReconnect);
    };
  }, [isApproved, uid]);

  // Auto-seed default GSU departments and auth config when an admin enters and doc is missing
  useEffect(() => {
    if (
      isApproved &&
      userRole === 'admin' &&
      departmentsLoaded &&
      firestoreDepartments.length === 0
    ) {
      seedDefaultDepartmentsIfEmpty().catch((err) => {
        console.error('Failed auto-seeding departments:', err);
      });
    }
  }, [isApproved, userRole, departmentsLoaded, firestoreDepartments.length]);

  useEffect(() => {
    if (isApproved && userRole === 'admin' && authConfigLoaded && !authConfigExists) {
      seedDefaultAuthConfigIfMissing().catch((err) => {
        console.error('Failed auto-seeding auth config:', err);
      });
    }
  }, [isApproved, userRole, authConfigLoaded, authConfigExists]);

  useEffect(() => {
    if (!isApproved || !currentUser || !uid || !userDept || !userLevel || !userRole) {
      workspaceHandleRef.current = null;
      setChats([]);
      setChatReadsMap({});
      setLocalReadFloorMap({});
      setRawUnreadCounts({});
      setAnnouncements([]);
      setAnnouncementFilterPreset(null);
      setResources([]);
      setMarketplaceListings([]);
      setCalendarEvents([]);
      setStatuses([]);
      setRideErrands([]);
      setConfessions([]);
      setRadarToast(null);
      seenRadarMapRef.current.clear();
      setStarredMessages([]);
      setJumpToMessage(null);
      setApprovedUsers([]);
      setPendingUsers([]);
      setAllUsers([]);
      setReports([]);
      setPaginationState(DEFAULT_PAGINATION_STATE);
      setLoadingMoreKey(null);
      setWorkspaceError(null);
      setActiveVoiceCall(null);
      return;
    }

    sessionStartMsRef.current = Date.now();

    // Hydrate local read receipt floor for instant 0ms badge clearing (works offline too)
    try {
      const saved = localStorage.getItem(`gsu_chat_reads_${uid}`);
      setLocalReadFloorMap(saved ? (JSON.parse(saved) as Record<string, number>) : {});
    } catch {
      setLocalReadFloorMap({});
    }

    const handle = subscribeToWorkspaceData(
      currentUser,
      () => activeChatIdRef.current,
      {
        onChats: setChats,
        onApprovedUsers: setApprovedUsers,
        onPendingUsers: setPendingUsers,
        onAllUsers: setAllUsers,
        onAnnouncements: setAnnouncements,
        onResources: setResources,
        onMarketplace: setMarketplaceListings,
        onCalendarEvents: setCalendarEvents,
        onStatuses: setStatuses,
        onRideErrands: setRideErrands,
        onConfessions: setConfessions,
        onStarredMessages: setStarredMessages,
        onUnreadCounts: (counts, readFloors) => {
          setRawUnreadCounts(counts);
          setChatReadsMap((prev) => ({ ...prev, ...readFloors }));
        },
        onReports: setReports,
        onPaginationState: setPaginationState,
        onError: setWorkspaceError,
        onIncomingCalls: (docs) => {
          setActiveVoiceCall((prev) => {
            if (prev) {
              const updated = docs.find((d) => d.id === prev.id);
              return updated || prev;
            }
            const now = Date.now();
            const incoming = docs.find((d) => {
              if (d.receiverId !== uid || d.status !== 'ringing') return false;
              const createdMs = d.createdAt?.toMillis?.() ?? now;
              return now - createdMs <= 90_000;
            });
            return incoming || null;
          });
        },
      }
    );
    workspaceHandleRef.current = handle;

    return () => {
      workspaceHandleRef.current = null;
      handle.unsubscribe();
    };
  }, [isApproved, uid, userDept, userLevel, userRole]);

  // Refresh broadcast group chats when Chats tab opens and every 60s while visible
  useEffect(() => {
    if (!isApproved || !uid || activeTab !== 'chats') return;
    workspaceHandleRef.current?.refreshBroadcastChats();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        workspaceHandleRef.current?.refreshBroadcastChats();
      }
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [isApproved, uid, activeTab]);

  const handleLoadMore = async (key: keyof WorkspacePaginationState) => {
    if (!workspaceHandleRef.current || loadingMoreKey) return;
    setLoadingMoreKey(key);
    try {
      await workspaceHandleRef.current.loadMore(key);
      setWorkspaceError(null);
    } catch (err) {
      setWorkspaceError(
        err instanceof Error
          ? `Unable to load more items: ${err.message}`
          : 'Unable to load more items. Please check your connection and try again.'
      );
    } finally {
      setLoadingMoreKey(null);
    }
  };

  const adminAllGroups = useMemo(
    () => chats.filter((c) => c.type !== 'dm'),
    [chats]
  );

  // Real-time in-app alert banner when a Rep / Helper / Lecturer / Admin broadcasts a Live Class Radar update
  useEffect(() => {
    if (!isApproved || !uid) return;
    for (const chat of chats) {
      if (chat.type === 'dm') continue;
      const updatedMs = chat.radarUpdatedAt?.toMillis?.() ?? 0;
      const sig = `${chat.radarStatus || ''}|${chat.radarCourseCode || ''}|${chat.radarVenue || ''}|${chat.radarExamAt || ''}|${updatedMs}`;
      const prevSig = seenRadarMapRef.current.get(chat.id);
      if (prevSig === sig) continue;
      seenRadarMapRef.current.set(chat.id, sig);

      if (!chat.radarStatus || chat.radarUpdatedBy === uid) continue;
      const isLiveUpdate =
        prevSig !== undefined || updatedMs >= sessionStartMsRef.current - 5_000;
      const isViewingSameChat = activeTab === 'chats' && activeChatId === chat.id;
      if (isLiveUpdate && !isViewingSameChat) {
        const statusLabel = RADAR_STATUS_LABELS[chat.radarStatus];
        const parts = [
          chat.radarCourseCode,
          chat.radarVenue,
          chat.radarExamTitle,
          chat.radarNote,
        ].filter(Boolean);
        setRadarToast({
          chatId: chat.id,
          chatName: chat.name,
          statusLabel,
          detail: parts.join(' · ') || 'Tap to view live class update',
        });
      }
    }
  }, [isApproved, uid, chats, activeTab, activeChatId]);

  // Mark currently open chat as read whenever opened or a new message arrives while viewing it
  const activeChatLastMsgMs = useMemo(() => {
    if (!activeChatId) return 0;
    const found = chats.find((c) => c.id === activeChatId);
    return found?.lastMessageAt?.toMillis() ?? 0;
  }, [chats, activeChatId]);

  useEffect(() => {
    if (!isApproved || !uid || activeTab !== 'chats' || !activeChatId) return;

    const currentFloor = Math.max(
      chatReadsMap[activeChatId] ?? 0,
      localReadFloorMap[activeChatId] ?? 0
    );
    const shouldMark =
      currentFloor === 0 || activeChatLastMsgMs === 0 || activeChatLastMsgMs > currentFloor;

    if (!shouldMark) return;

    if (activeChatLastMsgMs > 0) {
      setLocalReadFloorMap((prev) => {
        if ((prev[activeChatId] ?? 0) >= activeChatLastMsgMs) return prev;
        const updated = { ...prev, [activeChatId]: activeChatLastMsgMs };
        try {
          localStorage.setItem(`gsu_chat_reads_${uid}`, JSON.stringify(updated));
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });
    }

    markChatAsRead(uid, activeChatId, currentUser?.fullName).catch((err) => {
      console.error('Failed marking chat as read:', err);
    });
  }, [
    isApproved,
    uid,
    currentUser?.fullName,
    activeTab,
    activeChatId,
    activeChatLastMsgMs,
    chatReadsMap,
    localReadFloorMap,
  ]);

  // Track unread announcements via chatReads/system_announcements (zero extra listeners)

  const latestOtherAnnouncementMs = useMemo(() => {
    let maxMs = 0;
    for (const a of announcements) {
      if (a.authorId === uid) continue;
      const ms = a.createdAt?.toMillis() ?? 0;
      if (ms > maxMs) maxMs = ms;
    }
    return maxMs;
  }, [announcements, uid]);

  useEffect(() => {
    if (!isApproved || !uid || activeTab !== 'announcements') return;

    const currentFloor = Math.max(
      chatReadsMap[ANNOUNCEMENTS_READ_KEY] ?? 0,
      localReadFloorMap[ANNOUNCEMENTS_READ_KEY] ?? 0
    );
    const shouldMark =
      currentFloor === 0 || latestOtherAnnouncementMs > currentFloor;

    if (!shouldMark) return;

    if (latestOtherAnnouncementMs > 0) {
      setLocalReadFloorMap((prev) => {
        if ((prev[ANNOUNCEMENTS_READ_KEY] ?? 0) >= latestOtherAnnouncementMs) return prev;
        const updated = { ...prev, [ANNOUNCEMENTS_READ_KEY]: latestOtherAnnouncementMs };
        try {
          localStorage.setItem(`gsu_chat_reads_${uid}`, JSON.stringify(updated));
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });
    }

    markChatAsRead(uid, ANNOUNCEMENTS_READ_KEY).catch((err) => {
      console.error('Failed marking announcements as read:', err);
    });
  }, [
    isApproved,
    uid,
    activeTab,
    latestOtherAnnouncementMs,
    chatReadsMap,
    localReadFloorMap,
  ]);

  const hasUnreadAnnouncements = useMemo(() => {
    if (!isApproved || activeTab === 'announcements') return false;
    const annReadMs = Math.max(
      chatReadsMap[ANNOUNCEMENTS_READ_KEY] ?? 0,
      localReadFloorMap[ANNOUNCEMENTS_READ_KEY] ?? 0
    );
    return latestOtherAnnouncementMs > annReadMs;
  }, [isApproved, activeTab, latestOtherAnnouncementMs, chatReadsMap, localReadFloorMap]);



  const unreadCounts = useMemo(() => {
    const next: Record<string, number> = {};
    for (const chat of chats) {
      if (activeTab === 'chats' && activeChatId === chat.id) {
        next[chat.id] = 0;
        continue;
      }
      const readMs = Math.max(chatReadsMap[chat.id] ?? 0, localReadFloorMap[chat.id] ?? 0);
      const lastMsgMs = chat.lastMessageAt?.toMillis() ?? 0;
      next[chat.id] = lastMsgMs > readMs ? rawUnreadCounts[chat.id] ?? 0 : 0;
    }
    return next;
  }, [chats, activeTab, activeChatId, chatReadsMap, localReadFloorMap, rawUnreadCounts]);

  const totalUnreadCount = useMemo(
    () => Object.values(unreadCounts).reduce((sum, n) => sum + n, 0),
    [unreadCounts]
  );

  const unviewedStatusCount = useMemo(() => {
    if (!isApproved || !uid) return 0;
    const cutoff = presenceNowMs - STATUS_TTL_MS;
    return statuses.filter((s) => {
      if (s.authorId === uid) return false;
      const ms = s.createdAt?.toMillis() ?? presenceNowMs;
      if (ms < cutoff) return false;
      return !s.viewedBy?.[uid];
    }).length;
  }, [isApproved, uid, statuses, presenceNowMs]);

  const hasAdminTab =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'classRep' ||
    currentUser?.role === 'deptHelper';

  const openReportsCount = useMemo(
    () => reports.filter((r) => r.status === 'open').length,
    [reports]
  );

  const pendingConfessionsCount = useMemo(() => {
    if (!hasAdminTab) return 0;
    return confessions.filter((c) => c.status === 'pending').length;
  }, [hasAdminTab, confessions]);

  const adminBadgeCount =
    currentUser?.role === 'admin'
      ? pendingUsers.length + openReportsCount
      : pendingUsers.length;

  useEffect(() => {
    if (!hasAdminTab && activeTab === 'admin') {
      setActiveTab('chats');
    }
  }, [hasAdminTab, activeTab]);



  const handleStartVoiceCall = async (target: AppUser) => {
    if (!currentUser || target.uid === currentUser.uid) return;
    const session = await createCallSession(currentUser, target);
    setActiveVoiceCall(session);
  };

  const effectiveDepartments: DepartmentItem[] = useMemo(() => {
    if (firestoreDepartments.length > 0) return firestoreDepartments;
    return DEFAULT_GSU_DEPARTMENTS.map((d) => ({
      id: slugify(d.name),
      name: d.name,
      faculty: d.faculty,
      durationYears: d.durationYears,
    }));
  }, [firestoreDepartments]);

  const handleVerifyAlumni = async () => {
    if (verifyingAlumni) return;
    setVerifyingAlumni(true);
    setVerifyAlumniError(null);
    try {
      await verifyAlumniAccount();
      setAccountStatus((prev) =>
        prev
          ? {
              ...prev,
              status: 'alumni',
              alumni_verified_at: new Date().toISOString(),
            }
          : prev
      );
      refreshOwnProfile();
    } catch (err) {
      setVerifyAlumniError(
        err instanceof Error ? err.message : 'Unable to verify your Alumni account right now.'
      );
    } finally {
      setVerifyingAlumni(false);
    }
  };

  if (passwordRecovery) {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
            <p className="text-sm font-semibold text-ink-body dark:text-ink-soft">Loading...</p>
          </div>
        }
      >
        <LazySetPasswordScreen onComplete={() => setPasswordRecovery(false)} />
      </React.Suspense>
    );
  }

  if (accountExpiredGate) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-surface rounded-3xl border border-line/80 dark:border-line p-7 sm:p-8 space-y-6 text-center shadow-xs">
          <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold text-ink">
              Account expired
            </h1>
            <p className="text-sm text-ink-body dark:text-ink-soft leading-relaxed">
              Your Alumni account has expired because it was not verified before the verification deadline.
            </p>
          </div>

          <div className="rounded-2xl bg-sunken dark:bg-sunken/70 border border-line/80 p-4 text-xs text-ink-body dark:text-ink-soft leading-relaxed space-y-2">
            <p>
              If you still need Alumni access or mentor exemption, please contact GSU Connect support:
            </p>
            <a
              href="mailto:GSUConnect0@gmail.com"
              className="inline-flex items-center justify-center gap-1.5 font-semibold text-brand hover:underline break-all"
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>GSUConnect0@gmail.com</span>
            </a>
          </div>

          <button
            type="button"
            onClick={() => setAccountExpiredGate(false)}
            className="w-full min-h-[46px] rounded-2xl bg-brand hover:bg-brand-strong text-on-brand text-sm font-semibold transition-colors cursor-pointer"
          >
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (
    !authReady ||
    (authUser && userLoading) ||
    (authUser && currentUser && accountStatusCheckedUid !== authUser.id)
  ) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand text-on-brand flex items-center justify-center">
            <GraduationCap className="w-6 h-6" />
          </div>
          <p className="text-sm font-semibold text-ink-body dark:text-ink-soft">Loading GSU Connect...</p>
        </div>
      </div>
    );
  }

  if (authUser && !currentUser && !isOnline) {
    return (
      <div className="min-h-screen bg-canvas flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md bg-surface rounded-3xl border border-line/80 dark:border-line p-7 sm:p-8 space-y-5 text-center shadow-xs">
          <div className="w-16 h-16 rounded-3xl mx-auto flex items-center justify-center bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400">
            <WifiOff className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-ink">
              You&apos;re offline
            </h1>
            <p className="text-sm text-ink-body dark:text-ink-soft leading-relaxed">
              We couldn&apos;t load your GSU Connect profile yet because there&apos;s no internet connection.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              type="button"
              onClick={refreshOwnProfile}
              className="flex-1 min-h-[46px] rounded-2xl bg-brand hover:bg-brand-strong text-on-brand text-sm font-semibold transition-colors cursor-pointer"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                signOutUser().catch(() => undefined);
              }}
              className="flex-1 min-h-[46px] rounded-2xl border border-line hover:bg-sunken text-ink-soft text-sm font-semibold transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser || !currentUser) {
    return (
      <React.Suspense
        fallback={
          <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
            <p className="text-sm font-semibold text-ink-body dark:text-ink-soft">Loading GSU Connect...</p>
          </div>
        }
      >
        <LazyAuthScreen departments={effectiveDepartments} />
      </React.Suspense>
    );
  }

  if (currentUser.status !== 'approved') {
    return (
      <>
        <React.Suspense
          fallback={
            <div className="min-h-screen bg-canvas flex items-center justify-center p-6">
              <p className="text-sm font-semibold text-ink-body dark:text-ink-soft">Loading status...</p>
            </div>
          }
        >
          <LazyStatusGateScreen
            onChecked={setCurrentUser}
            user={currentUser}
            authUser={authUser}
            departments={effectiveDepartments}
          />
        </React.Suspense>
        {authUser && <RecoveryEmailConfirm />}
        {/* The status gate already has an inline recovery-email editor; the
            floating verification prompt only appears once the account is approved. */}
      </>
    );
  }

  const navItems: {
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    dot?: boolean;
  }[] = [
    { id: 'today', label: 'Today', icon: House },
    { id: 'chats', label: 'Chats', icon: MessageSquare, badge: totalUnreadCount },
    { id: 'study', label: 'Study', icon: BookOpen },
    { id: 'campus', label: 'Campus', icon: Compass },
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'statuses', label: 'Student updates', icon: Sparkles, badge: unviewedStatusCount },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, dot: hasUnreadAnnouncements },
    { id: 'rides', label: 'Rides & Errands', icon: Car },
    { id: 'confessions', label: 'Community', icon: Flame, badge: pendingConfessionsCount },
    { id: 'repository', label: 'Repository', icon: BookOpen },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'people', label: 'People', icon: Users },
  ];

  if (hasAdminTab) {
    navItems.push({
      id: 'admin',
      label: currentUser.role === 'admin' ? 'Admin' : 'Approvals',
      icon: Shield,
      badge: adminBadgeCount,
    });
  }

  const primaryTabs: AppTab[] = ['today', 'chats', 'study', 'campus', 'profile'];
  const mobileCoreTabs = primaryTabs;
  const mobileDrawerSecondaryTabs: AppTab[] = hasAdminTab
    ? ['calendar', 'repository', 'announcements', 'statuses', 'people', 'marketplace', 'rides', 'confessions', 'admin']
    : ['calendar', 'repository', 'announcements', 'statuses', 'people', 'marketplace', 'rides', 'confessions'];
  const drawerHasAttention =
    unviewedStatusCount > 0 ||
    hasUnreadAnnouncements ||
    pendingConfessionsCount > 0 ||
    adminBadgeCount > 0;
  const drawerAttentionCount =
    unviewedStatusCount + pendingConfessionsCount + adminBadgeCount;

  const pageTitles: Record<Exclude<AppTab, 'admin'>, string> = {
    today: 'Today',
    chats: 'Chats',
    study: 'Study',
    campus: 'Campus',
    statuses: 'Student updates',
    repository: 'Repository',
    marketplace: 'Marketplace',
    rides: 'Rides & Errands',
    confessions: 'Community',
    calendar: 'Calendar & Timetable',
    announcements: 'Announcements',
    people: 'People',
    profile: 'Profile',
  };
  const pageTitle = activeTab === 'admin'
    ? currentUser.role === 'admin' ? 'Admin & Moderation' : 'Department Approvals'
    : pageTitles[activeTab];

  const hideMobileBottomBar = activeTab === 'chats' && activeChatId !== null;

  const handleSelectTab = (tabId: AppTab) => {
    setMobileDrawerOpen(false);
    setActiveTab(tabId);
    if (tabId !== 'chats') setActiveChatId(null);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col md:flex-row">
      {/* Desktop / Tablet Left Navigation Rail */}
      <aside className="hidden md:flex md:w-64 lg:w-72 md:flex-col md:fixed md:inset-y-0 bg-surface border-r border-line/80 dark:border-line p-4 justify-between z-30">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 pt-1">
            <div className="w-10 h-10 rounded-2xl bg-brand text-on-brand flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="font-display font-bold text-lg text-ink tracking-tight whitespace-nowrap">
              GSU Connect
            </span>
          </div>

          <nav aria-label="Primary navigation" className="space-y-1">
            <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">Workspace</p>
          {primaryTabs.map((tabId) => {
            const item = navItems.find((navItem) => navItem.id === tabId)!;
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 rounded-2xl flex items-center justify-between text-sm font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand dark:text-brand'
                      : 'text-ink-body dark:text-ink-soft hover:bg-sunken dark:hover:bg-sunken/80 hover:text-ink dark:hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className={`w-5 h-5 ${
                        isActive ? 'text-brand dark:text-brand' : 'text-ink-muted dark:text-ink-muted'
                      }`}
                    />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 ? (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-on-brand text-[11px] font-mono tabular-nums font-bold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  ) : (
                    item.dot && (
                      <span
                        aria-label="Unread updates"
                        className="w-2.5 h-2.5 rounded-full bg-brand shrink-0"
                      />
                    )
                  )}
                </button>
              );
            })}
            {hasAdminTab && (() => {
              const item = navItems.find((navItem) => navItem.id === 'admin')!;
              const Icon = item.icon;
              const isActive = activeTab === 'admin';
              return (
                <button
                  type="button"
                  onClick={() => handleSelectTab('admin')}
                  className={`mt-4 w-full min-h-[44px] px-3.5 rounded-2xl flex items-center justify-between text-sm font-semibold transition-colors cursor-pointer ${
                    isActive ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand dark:text-brand' : 'text-ink-body dark:text-ink-soft hover:bg-sunken dark:hover:bg-sunken/80'
                  }`}
                >
                  <span className="flex items-center gap-3"><Icon className="w-5 h-5 text-ink-muted" /><span>{item.label}</span></span>
                  {item.badge ? <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-on-brand text-[11px] font-mono font-bold flex items-center justify-center">{item.badge > 99 ? '99+' : item.badge}</span> : null}
                </button>
              );
            })()}
          </nav>
        </div>

        <div className="bg-sunken dark:bg-sunken/70 rounded-2xl p-2 border border-line flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSelectTab('profile')}
            title="Open Profile & GPA Calculator"
            className={`flex-1 min-w-0 p-1.5 rounded-xl flex items-center gap-2.5 text-left transition-colors cursor-pointer ${
              activeTab === 'profile'
                ? 'bg-brand-subtle/90 dark:bg-brand-subtle/60'
                : 'hover:bg-sunken/90 dark:hover:bg-sunken'
            }`}
          >
            <UserAvatar
              name={currentUser.fullName}
              photoURL={currentUser.photoURL}
              avatarId={currentUser.avatarId}
              size="md"
              roundedClass="rounded-xl"
              fallbackClassName="bg-brand text-white"
            />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="text-xs font-bold text-ink truncate">
                {currentUser.fullName}
              </p>
              <p className="text-[11px] text-ink-muted truncate">
                {currentUser.department} ·{' '}
                {formatCompactLevelLabel(currentUser.level, currentUser.is_alumni)}
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={handleToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken/70 dark:hover:bg-sunken hover:text-ink transition-colors shrink-0 cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 md:pl-64 lg:pl-72 flex flex-col min-h-screen">
        {/* Compact Sticky Mobile & Page Header */}
        <header
          className={`sticky top-0 z-20 h-14 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-b border-line/70 dark:border-line px-3 sm:px-6 flex items-center justify-between gap-2 ${
            hideMobileBottomBar ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Open campus menu"
              aria-expanded={mobileDrawerOpen}
              className="md:hidden relative min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-ink-soft hover:bg-sunken transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
              {drawerHasAttention && (
                <span
                  aria-label="New campus updates or moderation items"
                  className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-brand ring-2 ring-white dark:ring-surface"
                />
              )}
            </button>
            <div className="md:hidden w-8 h-8 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0">
              <GraduationCap className="w-4 h-4" />
            </div>
            <h1 className="text-base sm:text-lg font-bold text-ink truncate">
              {pageTitle}
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-ink-muted font-mono truncate hidden sm:inline">
              {currentUser.idNumber}
            </span>
          </div>
        </header>

        {!isOnline && (
          <div
            role="status"
            className="bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200/80 dark:border-amber-900/70 text-amber-900 dark:text-amber-200 px-4 py-1.5 text-xs font-medium flex items-center justify-center gap-2"
          >
            <WifiOff className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>Offline · Showing cached chats. Messages will send when you reconnect.</span>
          </div>
        )}

        {accountStatus?.status === 'verify_pending' && (() => {
          const deadlineMs = accountStatus.verify_deadline
            ? Date.parse(accountStatus.verify_deadline)
            : NaN;
          const daysRemaining = Number.isFinite(deadlineMs)
            ? Math.max(0, Math.ceil((deadlineMs - Date.now()) / 86_400_000))
            : 0;
          return (
            <div
              role="status"
              className="bg-amber-50 dark:bg-amber-950/70 border-b border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100 px-4 py-2.5 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
            >
              <div className="flex items-start sm:items-center gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="space-y-0.5 min-w-0">
                  <p className="font-semibold leading-snug">
                    Your Alumni account needs verification. Verify within {daysRemaining}{' '}
                    {daysRemaining === 1 ? 'day' : 'days'} to keep access.
                  </p>
                  {verifyAlumniError && (
                    <p className="text-[11px] text-rose-700 dark:text-rose-300 font-medium">
                      {verifyAlumniError}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                disabled={verifyingAlumni}
                onClick={handleVerifyAlumni}
                className="min-h-[36px] px-3.5 rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-center"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{verifyingAlumni ? 'Verifying...' : 'Verify my account'}</span>
              </button>
            </div>
          );
        })()}

        {radarToast && (
          <div
            role="status"
            className="bg-brand text-on-brand px-4 py-2 text-xs flex items-center justify-between gap-3 border-b border-brand"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Radio className="w-4 h-4 shrink-0 animate-pulse" />
              <p className="truncate">
                <span className="font-bold">
                  {radarToast.chatName} · {radarToast.statusLabel}:
                </span>{' '}
                <span className="text-emerald-100">{radarToast.detail}</span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const targetChatId = radarToast.chatId;
                  setRadarToast(null);
                  setActiveChatId(targetChatId);
                  setActiveTab('chats');
                }}
                className="min-h-[30px] px-2.5 rounded-lg bg-surface text-brand font-bold text-[11px] hover:bg-brand-subtle cursor-pointer"
              >
                View Chat
              </button>
              <button
                type="button"
                onClick={() => setRadarToast(null)}
                aria-label="Dismiss class radar alert"
                className="w-7 h-7 rounded-lg hover:bg-brand flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {workspaceError && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/60 border-b border-red-200/80 dark:border-red-900/70 text-red-800 dark:text-red-200 px-4 py-2 text-xs font-medium flex items-center justify-between gap-3"
          >
            <span className="truncate">{workspaceError}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setWorkspaceError(null);
                  workspaceHandleRef.current?.retryAll();
                }}
                className="min-h-[28px] px-2.5 rounded-lg bg-red-700 hover:bg-red-800 text-white font-semibold text-[11px] cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceError(null)}
                aria-label="Dismiss workspace error"
                className="w-7 h-7 rounded-lg hover:bg-red-200/60 dark:hover:bg-red-900/60 flex items-center justify-center cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main
          className={`flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 py-4 ${
            hideMobileBottomBar ? 'pb-3 lg:pb-6' : 'pb-24 md:pb-6'
          }`}
        >
          {currentUser.accountType==='staff' && <StaffVouchInbox key={currentUser.uid}/>}
          {activeTab === 'today' && (
            <React.Suspense fallback={<div className="p-8 text-sm text-ink-muted">Loading your campus overview...</div>}>
              <LazyTodayView
                currentUser={currentUser}
                calendarEvents={calendarEvents}
                announcements={announcements}
                chats={chats}
                unreadCounts={unreadCounts}
                resources={resources}
                statuses={statuses}
                marketplaceListings={marketplaceListings}
                rideErrands={rideErrands}
                onNavigate={handleSelectTab}
              />
            </React.Suspense>
          )}
          {activeTab === 'study' && (
            <React.Suspense fallback={<div className="p-8 text-sm text-ink-muted">Loading study tools...</div>}>
              <LazyStudyHubView
                currentUser={currentUser}
                calendarEvents={calendarEvents}
                announcements={announcements}
                chats={chats}
                unreadCounts={unreadCounts}
                resources={resources}
                statuses={statuses}
                marketplaceListings={marketplaceListings}
                rideErrands={rideErrands}
                onNavigate={handleSelectTab}
              />
            </React.Suspense>
          )}
          {activeTab === 'campus' && (
            <React.Suspense fallback={<div className="p-8 text-sm text-ink-muted">Loading campus hub...</div>}>
              <LazyCampusHubView
                currentUser={currentUser}
                calendarEvents={calendarEvents}
                announcements={announcements}
                chats={chats}
                unreadCounts={unreadCounts}
                resources={resources}
                statuses={statuses}
                marketplaceListings={marketplaceListings}
                rideErrands={rideErrands}
                onNavigate={handleSelectTab}
              />
            </React.Suspense>
          )}
          {activeTab === 'chats' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading chats...
                </div>
              }
            >
              <LazyChatsView
                currentUser={currentUser}
                chats={chats}
                unreadCounts={unreadCounts}
                approvedUsers={approvedUsers}
                onlineUserIds={onlineUserIds}
                departments={effectiveDepartments}
                calendarEvents={calendarEvents}
                announcements={announcements}
                statuses={statuses}
                starredMessages={starredMessages}
                jumpToMessage={jumpToMessage}
                onClearJumpToMessage={() => setJumpToMessage(null)}
                activeChatId={activeChatId}
                nowMs={presenceNowMs}
                onSelectChat={setActiveChatId}
                onBrowsePeople={() => setActiveTab('people')}
                onOpenAnnouncements={(scope) => {
                  setAnnouncementFilterPreset({ scope, nonce: Date.now() });
                  setActiveChatId(null);
                  setActiveTab('announcements');
                }}
                onStartVoiceCall={handleStartVoiceCall}
              />
            </React.Suspense>
          )}

          {activeTab === 'statuses' && (
            <div className="bg-surface rounded-3xl border border-line/80 dark:border-line overflow-hidden min-h-[540px]">
              <React.Suspense
                fallback={
                  <div className="p-10 text-center text-xs font-medium text-ink-muted">
                    Loading statuses...
                  </div>
                }
              >
                <LazyStatusView
                  currentUser={currentUser}
                  statuses={statuses}
                  approvedUsers={approvedUsers}
                  nowMs={presenceNowMs}
                  hasMore={paginationState.hasMoreStatuses}
                  loadingMore={loadingMoreKey === 'hasMoreStatuses'}
                  onLoadMore={() => handleLoadMore('hasMoreStatuses')}
                  onReplyInDm={(dmId) => {
                    setActiveChatId(dmId);
                    setActiveTab('chats');
                  }}
                />
              </React.Suspense>
            </div>
          )}

          {activeTab === 'repository' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading repository...
                </div>
              }
            >
              <LazyRepositoryView
                currentUser={currentUser}
                resources={resources}
                departments={effectiveDepartments}
                hasMore={paginationState.hasMoreResources}
                loadingMore={loadingMoreKey === 'hasMoreResources'}
                onLoadMore={() => handleLoadMore('hasMoreResources')}
              />
            </React.Suspense>
          )}

          {activeTab === 'marketplace' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading marketplace...
                </div>
              }
            >
              <LazyMarketplaceView
                currentUser={currentUser}
                listings={marketplaceListings}
                approvedUsers={approvedUsers}
                hasMore={paginationState.hasMoreMarketplace}
                loadingMore={loadingMoreKey === 'hasMoreMarketplace'}
                onLoadMore={() => handleLoadMore('hasMoreMarketplace')}
                onOpenDm={(chatId) => {
                  setActiveChatId(chatId);
                  setActiveTab('chats');
                }}
              />
            </React.Suspense>
          )}

          {activeTab === 'rides' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading rides &amp; errands...
                </div>
              }
            >
              <LazyRidesErrandsView
                currentUser={currentUser}
                posts={rideErrands}
                approvedUsers={approvedUsers}
                hasMore={paginationState.hasMoreRideErrands}
                loadingMore={loadingMoreKey === 'hasMoreRideErrands'}
                onLoadMore={() => handleLoadMore('hasMoreRideErrands')}
                onOpenDm={(chatId) => {
                  setActiveChatId(chatId);
                  setActiveTab('chats');
                }}
              />
            </React.Suspense>
          )}

          {activeTab === 'confessions' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading confessions...
                </div>
              }
            >
              <LazyConfessionsView
                currentUser={currentUser}
                confessions={confessions}
                hasMore={paginationState.hasMoreConfessions}
                loadingMore={loadingMoreKey === 'hasMoreConfessions'}
                onLoadMore={() => handleLoadMore('hasMoreConfessions')}
              />
            </React.Suspense>
          )}

          {activeTab === 'calendar' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading calendar...
                </div>
              }
            >
              <LazyCalendarView
                currentUser={currentUser}
                events={calendarEvents}
                departments={effectiveDepartments}
                hasMore={paginationState.hasMoreCalendarEvents}
                loadingMore={loadingMoreKey === 'hasMoreCalendarEvents'}
                onLoadMore={() => handleLoadMore('hasMoreCalendarEvents')}
              />
            </React.Suspense>
          )}

          {activeTab === 'announcements' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading announcements...
                </div>
              }
            >
              <LazyAnnouncementsView
                currentUser={currentUser}
                announcements={announcements}
                departments={effectiveDepartments}
                initialScopeFilter={announcementFilterPreset?.scope}
                scopeFilterNonce={announcementFilterPreset?.nonce}
                hasMore={paginationState.hasMoreAnnouncements}
                loadingMore={loadingMoreKey === 'hasMoreAnnouncements'}
                onLoadMore={() => handleLoadMore('hasMoreAnnouncements')}
              />
            </React.Suspense>
          )}

          {activeTab === 'people' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading people...
                </div>
              }
            >
              <LazyPeopleView
                currentUser={currentUser}
                approvedUsers={approvedUsers}
                chats={chats}
                nowMs={presenceNowMs}
                onlineUserIds={onlineUserIds}
                hasMore={paginationState.hasMoreApprovedUsers}
                loadingMore={loadingMoreKey === 'hasMoreApprovedUsers'}
                onLoadMore={() => handleLoadMore('hasMoreApprovedUsers')}
                onStartDm={(chatId) => {
                  setActiveChatId(chatId);
                  setActiveTab('chats');
                }}
                onStartVoiceCall={handleStartVoiceCall}
              />
            </React.Suspense>
          )}

          {activeTab === 'profile' && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading profile...
                </div>
              }
            >
              <LazyProfileView
                currentUser={currentUser}
                theme={theme}
                onToggleTheme={handleToggleTheme}
                starredMessages={starredMessages}
                onJumpToMessage={(chatId, messageId) => {
                  setActiveChatId(chatId);
                  setActiveTab('chats');
                  setJumpToMessage({ chatId, messageId, nonce: Date.now() });
                }}
                onProfileUpdated={refreshOwnProfile}
              />
            </React.Suspense>
          )}

          {activeTab === 'admin' && hasAdminTab && (
            <React.Suspense
              fallback={
                <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center text-xs font-medium text-ink-muted">
                  Loading admin panel...
                </div>
              }
            >
              <LazyAdminView
                currentUser={currentUser}
                pendingUsers={pendingUsers}
                allUsers={allUsers}
                approvedUsers={approvedUsers}
                allGroups={adminAllGroups}
                reports={reports}
                departments={effectiveDepartments}
                isFirestoreDepartmentsSeeded={firestoreDepartments.length > 0}
                allowedEmailDomain={allowedEmailDomain}
                hasMorePendingUsers={paginationState.hasMorePendingUsers}
                hasMoreAllUsers={paginationState.hasMoreAllUsers}
                hasMoreReports={paginationState.hasMoreReports}
                loadingMore={
                  loadingMoreKey === 'hasMorePendingUsers' ||
                  loadingMoreKey === 'hasMoreAllUsers' ||
                  loadingMoreKey === 'hasMoreReports'
                }
                onLoadMore={(k) => handleLoadMore(k)}
                onOpenGroup={(chatId) => {
                  setActiveChatId(chatId);
                  setActiveTab('chats');
                }}
              />
            </React.Suspense>
          )}
        </main>
      </div>

      {/* Fixed Mobile Bottom Tab Bar — Streamlined 6 Core Tabs */}
      {!hideMobileBottomBar && (
        <nav
          aria-label="Primary navigation"
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-surface/95 backdrop-blur-md border-t border-line/80 dark:border-line pb-safe grid grid-cols-5 h-16 px-1"
        >
          {mobileCoreTabs.map((tabId) => {
            const item = navItems.find((n) => n.id === tabId)!;
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleSelectTab(item.id)}
                className={`relative flex flex-col items-center justify-center min-w-0 min-h-[44px] px-0.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'text-brand dark:text-brand'
                    : 'text-ink-muted dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 inset-x-3 h-0.5 rounded-b-full bg-brand dark:bg-brand-subtle"
                  />
                )}
                <div className="relative">
                  <Icon className="w-[20px] h-[20px]" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-brand text-on-brand text-[9.5px] font-bold font-mono flex items-center justify-center tabular-nums">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[9.5px] min-[400px]:text-[10px] font-semibold tracking-tight leading-none mt-1 whitespace-nowrap truncate max-w-full">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Mobile Sliding Hamburger Navigation Drawer (Statuses, Announcements, Admin & Quick Tools) */}
      {mobileDrawerOpen && !hideMobileBottomBar && (
        <div
          onClick={() => setMobileDrawerOpen(false)}
          className="md:hidden fixed inset-0 z-50 bg-slate-900/50 dark:bg-canvas/75 backdrop-blur-xs flex justify-start"
          role="dialog"
          aria-modal="true"
          aria-label="Campus navigation menu"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[82vw] max-w-[320px] h-full bg-surface border-r border-line flex flex-col justify-between shadow-2xl"
          >
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Drawer Top Brand & Close */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand text-on-brand flex items-center justify-center shrink-0">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <span className="font-display font-bold text-base text-ink">
                    GSU Connect
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileDrawerOpen(false)}
                  aria-label="Close navigation menu"
                  className="min-w-[44px] min-h-[44px] -mr-2 rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Signed-In Profile Summary */}
              <div className="rounded-2xl bg-sunken dark:bg-sunken/70 border border-line/70 dark:border-line p-3.5 flex items-center gap-3">
                <UserAvatar
                  name={currentUser.fullName}
                  photoURL={currentUser.photoURL}
                  avatarId={currentUser.avatarId}
                  size="md"
                  roundedClass="rounded-xl"
                  fallbackClassName="bg-brand text-white"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-xs font-bold text-ink truncate">
                      {currentUser.fullName}
                    </p>
                    <RoleBadge role={currentUser.role} />
                  </div>
                  <p className="text-[11px] text-ink-muted truncate">
                    {currentUser.department} ·{' '}
                    {formatCompactLevelLabel(currentUser.level, currentUser.is_alumni)}
                  </p>
                  <p className="text-[11px] font-mono text-ink-muted truncate">
                    {currentUser.idNumber}
                  </p>
                </div>
              </div>

              {/* Secondary & Governance Section: Statuses, Announcements, Admin */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between px-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                    More campus tools
                  </p>
                  {drawerAttentionCount > 0 && (
                    <span className="text-[11px] font-mono font-bold text-brand">
                      {drawerAttentionCount} new
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {mobileDrawerSecondaryTabs.map((tabId) => {
                    const item = navItems.find((n) => n.id === tabId);
                    if (!item) return null;
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        className={`w-full min-h-[48px] px-3.5 rounded-2xl flex items-center justify-between text-sm font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand dark:text-brand'
                            : 'text-ink-soft dark:text-ink-soft hover:bg-sunken dark:hover:bg-sunken'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon
                            className={`w-5 h-5 ${
                              isActive
                                ? 'text-brand dark:text-brand'
                                : 'text-ink-muted dark:text-ink-muted'
                            }`}
                          />
                          <span>{item.label}</span>
                        </span>
                        <span className="flex items-center gap-2">
                          {item.badge !== undefined && item.badge > 0 ? (
                            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-on-brand text-[11px] font-mono tabular-nums font-bold flex items-center justify-center">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          ) : (
                            item.dot && (
                              <span
                                aria-label="Unread updates"
                                className="w-2.5 h-2.5 rounded-full bg-brand shrink-0"
                              />
                            )
                          )}
                          <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Core Campus Sections Quick Jump */}
              <div className="space-y-1.5 pt-2 border-t border-line">
                <p className="px-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                  Campus Hub
                </p>
                <div className="space-y-1">
                  {mobileCoreTabs.map((tabId) => {
                    const item = navItems.find((n) => n.id === tabId);
                    if (!item) return null;
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        className={`w-full min-h-[44px] px-3.5 rounded-2xl flex items-center justify-between text-sm font-semibold transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand dark:text-brand'
                            : 'text-ink-soft dark:text-ink-soft hover:bg-sunken dark:hover:bg-sunken'
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <Icon
                            className={`w-5 h-5 ${
                              isActive
                                ? 'text-brand dark:text-brand'
                                : 'text-ink-muted dark:text-ink-muted'
                            }`}
                          />
                          <span>{item.label}</span>
                        </span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-on-brand text-[11px] font-mono tabular-nums font-bold flex items-center justify-center">
                            {item.badge > 99 ? '99+' : item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Drawer Footer: Theme Toggle */}
            <div className="p-4 border-t border-line">
              <button
                type="button"
                onClick={handleToggleTheme}
                className="w-full min-h-[44px] px-3.5 rounded-2xl border border-line flex items-center justify-between text-xs font-semibold text-ink-soft hover:bg-sunken transition-colors cursor-pointer"
              >
                <span className="flex items-center gap-2.5">
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-ink-muted" />
                  )}
                  <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {authUser && <RecoveryEmailConfirm />}
      {authUser && <RecoveryEmailPrompt />}
      {activeVoiceCall && (
        <React.Suspense fallback={null}>
          <LazyVoiceCallModal
            currentUser={currentUser}
            callSession={activeVoiceCall}
            peerUser={
              approvedUsers.find(
                (u) =>
                  u.uid ===
                  (activeVoiceCall.callerId === currentUser.uid
                    ? activeVoiceCall.receiverId
                    : activeVoiceCall.callerId)
              ) || null
            }
            onClose={() => setActiveVoiceCall(null)}
          />
        </React.Suspense>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <MainApp />
    </AppErrorBoundary>
  );
}
