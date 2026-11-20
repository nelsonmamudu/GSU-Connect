import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Ban,
  BarChart3,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Contact,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Flag,
  GraduationCap,
  Image as ImageIcon,
  Info,
  Link2,
  MapPin,
  Megaphone,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Phone,
  PhoneCall,
  PhoneMissed,
  Pin,
  PinOff,
  Plus,
  Radio,
  Reply,
  Search,
  Send,
  ShieldCheck,
  SmilePlus,
  Sparkles,
  Square,
  Star,
  Timer,
  Trash2,
  Users,
  Volume2,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  clearChatLiveRadar,
  clearTypingStatus,
  deleteMessageForEveryone,
  downloadChatDocument,
  editTextMessage,
  findDmChat,
  getSignedChatFileUrl,
  isBlockedBetweenUsers,
  markChatAsRead,
  openOrCreateDmChat,
  openViewOnceMessage,
  pinMessageInGroup,
  resolveProfilesByIds,
  searchPeople,
  sendContactMessage,
  sendDocumentMessage,
  sendEventMessage,
  sendImageMessage,
  sendMessage,
  sendPollMessage,
  sendVoiceMessage,
  setTypingStatus,
  starMessageForUser,
  submitMessageReport,
  subscribeToChatRoom,
  subscribeToGroupMembers,
  toggleBlockUser,
  toggleMessageReaction,
  togglePinChatForUser,
  unpinMessageInGroup,
  unstarMessageForUser,
  updateChatLiveRadar,
  voteOnPoll,
  type ChatRoomHandle,
} from '../services/supabaseService';
import {
  AcademicLevel,
  Announcement,
  AppUser,
  CalendarEvent,
  CampusStatus,
  canViewMemberIdNumber,
  ChatMember,
  ChatMessage,
  ChatReadReceipt,
  ChatThread,
  ChatTypingStatus,
  DELETED_MESSAGE_PLACEHOLDER,
  DepartmentItem,
  formatAudioDuration,
  formatCompactLevelLabel,
  formatFileSize,
  formatLevelLabel,
  formatShortTime,
  getFileTypeBadge,
  getMessageSnippet,
  isUserOnline,
  MAX_CHAT_DOCUMENT_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_PINNED_CHATS,
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_SECONDS,
  MESSAGE_EDIT_WINDOW_MS,
  MESSAGE_REACTIONS,
  normalizeIdNumber,
  RADAR_STATUS_LABELS,
  RadarStatusType,
  ReplyTarget,
  REPORT_REASONS,
  ReportReason,
  ROLE_LABELS,
  StarredMessage,
  STATUS_TTL_MS,
  TYPING_INDICATOR_WINDOW_MS,
} from '../types';
import { CreateGroupModal } from './CreateGroupModal';
import { FilePreviewModal, PreviewFileTarget } from './FilePreviewModal';
import { LiveRadarBanner } from './LiveRadarBanner';
import { RoleBadge } from './RoleBadge';
import { StarredMessagesModal } from './StarredMessagesModal';
import { UserAvatar } from './UserAvatar';
import { UserProfileModal } from './UserProfileModal';
import { VoiceNotePlayer } from './VoiceNotePlayer';
import { downloadDataUrl, getFilePreviewKind } from '../utils/fileHelpers';

const LazyStatusView = React.lazy(() =>
  import('./StatusView').then((m) => ({ default: m.StatusView }))
);

function isDirectImageSrc(src: string): boolean {
  return (
    src.startsWith('data:') ||
    src.startsWith('blob:')
  );
}

const SignedChatImage: React.FC<
  React.ImgHTMLAttributes<HTMLImageElement> & { src: string }
> = ({ src, alt, ...rest }) => {
  const [resolvedSrc, setResolvedSrc] = useState<string>(() =>
    isDirectImageSrc(src) ? src : ''
  );

  useEffect(() => {
    if (!src) {
      setResolvedSrc('');
      return;
    }
    if (isDirectImageSrc(src)) {
      setResolvedSrc(src);
      return;
    }
    let active = true;
    getSignedChatFileUrl(src)
      .then((signed) => {
        if (active) setResolvedSrc(signed);
      })
      .catch(() => {
        if (active) setResolvedSrc('');
      });
    return () => {
      active = false;
    };
  }, [src]);

  if (!resolvedSrc) {
    return (
      <div
        aria-label={alt || 'Loading image'}
        className={`${rest.className || ''} bg-sunken/70 dark:bg-sunken/80 animate-pulse min-h-[120px] min-w-[160px]`}
      />
    );
  }

  return <img {...rest} src={resolvedSrc} alt={alt} />;
};

interface ChatsViewProps {
  currentUser: AppUser;
  chats: ChatThread[];
  unreadCounts?: Record<string, number>;
  approvedUsers: AppUser[];
  onlineUserIds?: Set<string>;
  departments: DepartmentItem[];
  calendarEvents?: CalendarEvent[];
  announcements?: Announcement[];
  statuses?: CampusStatus[];
  starredMessages?: StarredMessage[];
  jumpToMessage?: { chatId: string; messageId: string; nonce: number } | null;
  onClearJumpToMessage?: () => void;
  groupsReady?: boolean;
  activeChatId: string | null;
  nowMs?: number;
  onSelectChat: (chatId: string | null) => void;
  onBrowsePeople: () => void;
  onOpenAnnouncements?: (scope: 'all' | 'department') => void;
  onStartVoiceCall?: (target: AppUser) => Promise<void> | void;
}

export const ChatsView: React.FC<ChatsViewProps> = ({
  currentUser,
  chats,
  unreadCounts = {},
  approvedUsers,
  onlineUserIds,
  departments,
  calendarEvents = [],
  announcements = [],
  statuses = [],
  starredMessages = [],
  jumpToMessage = null,
  onClearJumpToMessage,
  groupsReady = true,
  activeChatId,
  nowMs = Date.now(),
  onSelectChat,
  onBrowsePeople,
  onOpenAnnouncements,
  onStartVoiceCall,
}) => {
  const [sidebarMode, setSidebarMode] = useState<'chats' | 'updates'>('chats');
  const [collapsedCommunities, setCollapsedCommunities] = useState<Record<string, boolean>>({});
  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatSearchQuery, setInChatSearchQuery] = useState('');
  const [inChatSearchActiveIdx, setInChatSearchActiveIdx] = useState(0);
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupInfoTab, setGroupInfoTab] = useState<'members' | 'media' | 'docs' | 'links'>('members');
  const [groupMemberDocs, setGroupMemberDocs] = useState<ChatMember[]>([]);
  const [groupInfoDmBusyUid, setGroupInfoDmBusyUid] = useState<string | null>(null);
  const [viewOncePhoto, setViewOncePhoto] = useState(false);
  const [viewOnceVoice, setViewOnceVoice] = useState(false);
  const [openingViewOnceMsgId, setOpeningViewOnceMsgId] = useState<string | null>(null);
  const [activeViewOnceModal, setActiveViewOnceModal] = useState<{
    kind: 'image' | 'voice';
    senderName: string;
    mediaData?: string;
    audioData?: string;
    durationSec?: number;
  } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMoreOlderMessages, setHasMoreOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [resolvedPeersMap, setResolvedPeersMap] = useState<Record<string, AppUser>>({});
  const [contactRemoteResults, setContactRemoteResults] = useState<AppUser[]>([]);
  const [pendingMessageIds, setPendingMessageIds] = useState<Set<string>>(() => new Set());
  const [readReceipts, setReadReceipts] = useState<ChatReadReceipt[]>([]);
  const [readReceiptsLoaded, setReadReceiptsLoaded] = useState(false);
  const [typingStatuses, setTypingStatuses] = useState<ChatTypingStatus[]>([]);
  const [typingNowMs, setTypingNowMs] = useState(() => Date.now());
  const [expandedReceiptMsgId, setExpandedReceiptMsgId] = useState<string | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<string | null>(null);
  const [moreMenuMsgId, setMoreMenuMsgId] = useState<string | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [chatPinNotice, setChatPinNotice] = useState<string | null>(null);
  const [pinningChatId, setPinningChatId] = useState<string | null>(null);
  const [pinningMsgBusy, setPinningMsgBusy] = useState(false);
  const [starringMsgId, setStarringMsgId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState<ChatMessage | null>(null);
  const [deletingMsgBusy, setDeletingMsgBusy] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<{ msgId: string; x: number } | null>(null);
  const [starredModalOpen, setStarredModalOpen] = useState(false);
  const [internalJumpTarget, setInternalJumpTarget] = useState<{
    chatId: string;
    messageId: string;
    nonce: number;
  } | null>(null);
  const [reportingMessage, setReportingMessage] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('Spam');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportBanner, setReportBanner] = useState<string | null>(null);
  const [blockingBusy, setBlockingBusy] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recordingPhase, setRecordingPhase] = useState<'idle' | 'recording' | 'preview'>('idle');
  const [recordingSec, setRecordingSec] = useState(0);
  const [recordedVoiceDraft, setRecordedVoiceDraft] = useState<{
    blob: Blob;
    previewUrl: string;
    durationSec: number;
  } | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [sendingPoll, setSendingPoll] = useState(false);
  const [pollFormError, setPollFormError] = useState<string | null>(null);
  const [votingMsgId, setVotingMsgId] = useState<string | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [imageDraft, setImageDraft] = useState<{
    blob: Blob;
    previewUrl: string;
    fileName: string;
    fileSizeBytes: number;
  } | null>(null);
  const [docDraft, setDocDraft] = useState<{
    file: File;
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
  } | null>(null);
  const [mediaCaption, setMediaCaption] = useState('');
  const [sendingMedia, setSendingMedia] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eventTime, setEventTime] = useState('10:00 AM');
  const [eventVenue, setEventVenue] = useState('');
  const [eventNotes, setEventNotes] = useState('');
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [sendingEvent, setSendingEvent] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [sendingContact, setSendingContact] = useState(false);
  const [openingContactDmUid, setOpeningContactDmUid] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    src: string;
    fileName: string;
    caption?: string;
  } | null>(null);
  const [profileModalUid, setProfileModalUid] = useState<string | null>(null);
  const [profileModalSnapshot, setProfileModalSnapshot] = useState<AppUser | null>(null);
  const [radarModalOpen, setRadarModalOpen] = useState(false);
  const [radarStatusDraft, setRadarStatusDraft] = useState<RadarStatusType>('lecturer_in_class');
  const [radarCourseDraft, setRadarCourseDraft] = useState('');
  const [radarVenueDraft, setRadarVenueDraft] = useState('');
  const [radarNoteDraft, setRadarNoteDraft] = useState('');
  const [radarExamTitleDraft, setRadarExamTitleDraft] = useState('');
  const [radarExamAtDraft, setRadarExamAtDraft] = useState('');
  const [radarSaving, setRadarSaving] = useState(false);
  const [radarFormError, setRadarFormError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<PreviewFileTarget | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [unseenBelowCount, setUnseenBelowCount] = useState(0);

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const isNearBottomRef = useRef(true);
  const prevMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const msgRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const highlightTimerRef = useRef<number | null>(null);
  const reportTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const swipeStartRef = useRef<{ msgId: string; x: number; y: number } | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const seededReceiptChatsRef = useRef<Set<string>>(new Set());
  const lastSyncedReadMsgRef = useRef<Record<string, number>>({});
  const lastTypingSentAtRef = useRef<number>(0);
  const typingIdleTimerRef = useRef<number | null>(null);
  const activeTypingChatIdRef = useRef<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recorderActionRef = useRef<'cancel' | 'preview' | 'send'>('preview');
  const recordingTargetChatIdRef = useRef<string | null>(null);
  const voicePreviewUrlRef = useRef<string | null>(null);
  const chatRoomHandleRef = useRef<ChatRoomHandle | null>(null);
  const imagePreviewUrlRef = useRef<string | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, AppUser>();
    Object.values(resolvedPeersMap).forEach((u) => map.set(u.uid, u));
    approvedUsers.forEach((u) => map.set(u.uid, u));
    return map;
  }, [approvedUsers, resolvedPeersMap]);

  useEffect(() => {
    const missingPeerIds = new Set<string>();
    chats.forEach((c) => {
      if (c.type !== 'dm') return;
      c.participantIds.forEach((pid) => {
        if (pid && pid !== currentUser.uid && !userMap.has(pid)) {
          missingPeerIds.add(pid);
        }
      });
    });
    if (missingPeerIds.size === 0) return;
    let active = true;
    resolveProfilesByIds(Array.from(missingPeerIds))
      .then((resolved) => {
        if (active && Object.keys(resolved).length > 0) {
          setResolvedPeersMap((prev) => ({ ...prev, ...resolved }));
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [chats, currentUser.uid, userMap]);

  const openUserProfile = (uidToOpen: string) => {
    const found =
      uidToOpen === currentUser.uid ? currentUser : userMap.get(uidToOpen) || null;
    if (found) setProfileModalSnapshot(found);
    setProfileModalUid(uidToOpen);
  };

  const profileModalUser = useMemo(() => {
    if (!profileModalUid) return null;
    if (profileModalUid === currentUser.uid) return currentUser;
    return userMap.get(profileModalUid) || profileModalSnapshot;
  }, [profileModalUid, currentUser, userMap, profileModalSnapshot]);

  const profileModalDmChat = useMemo(() => {
    if (!profileModalUser) return null;
    return findDmChat(chats, currentUser.uid, profileModalUser.uid);
  }, [chats, currentUser.uid, profileModalUser]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) || null,
    [chats, activeChatId]
  );

  const canBroadcastRadar = ['admin', 'classRep', 'deptHelper', 'lecturer'].includes(
    currentUser.role
  );

  const openRadarModal = () => {
    if (!activeChat || activeChat.type === 'dm' || !canBroadcastRadar) return;
    setRadarStatusDraft(activeChat.radarStatus || 'lecturer_in_class');
    setRadarCourseDraft(activeChat.radarCourseCode || '');
    setRadarVenueDraft(activeChat.radarVenue || '');
    setRadarNoteDraft(activeChat.radarNote || '');
    setRadarExamTitleDraft(activeChat.radarExamTitle || '');
    setRadarExamAtDraft(activeChat.radarExamAt || '');
    setRadarFormError(null);
    setRadarModalOpen(true);
  };

  const handleSaveRadar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || activeChat.type === 'dm' || radarSaving) return;
    setRadarFormError(null);
    setRadarSaving(true);
    try {
      await updateChatLiveRadar(activeChat.id, currentUser, {
        radarStatus: radarStatusDraft,
        radarCourseCode: radarCourseDraft,
        radarVenue: radarVenueDraft,
        radarNote: radarNoteDraft,
        radarExamTitle: radarExamTitleDraft,
        radarExamAt: radarExamAtDraft,
      });
      setRadarModalOpen(false);
    } catch (err) {
      setRadarFormError(err instanceof Error ? err.message : 'Could not broadcast live radar update.');
    } finally {
      setRadarSaving(false);
    }
  };

  const handleClearRadar = async () => {
    if (!activeChat || activeChat.type === 'dm' || radarSaving) return;
    setRadarFormError(null);
    setRadarSaving(true);
    try {
      await clearChatLiveRadar(activeChat.id);
      setRadarModalOpen(false);
    } catch (err) {
      setRadarFormError(err instanceof Error ? err.message : 'Could not clear radar status.');
    } finally {
      setRadarSaving(false);
    }
  };

  const toLocalDateTimeInputValue = (date: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const getDmPeer = (chat: ChatThread): AppUser | null => {
    if (chat.type !== 'dm') return null;
    const peerId = chat.participantIds.find((id) => id !== currentUser.uid);
    return peerId ? userMap.get(peerId) || null : null;
  };

  const getChatDisplayTitle = (chat: ChatThread): string => {
    if (chat.type === 'dm') {
      const peer = getDmPeer(chat);
      return peer ? peer.fullName : chat.name;
    }
    return chat.name;
  };

  const getChatSubtitle = (chat: ChatThread): string => {
    if (chat.type === 'general') return 'All approved GSU students & staff';
    if (chat.type === 'department') {
      const levelText = chat.level ? formatLevelLabel(chat.level) : 'All levels';
      return `${chat.department} · ${levelText}`;
    }
    if (chat.type === 'custom') {
      if (chat.accessKey === 'invited') return 'Invite-only group';
      if (chat.accessKey?.startsWith('deptLevel:')) {
        const levelText = chat.level ? formatLevelLabel(chat.level) : 'All levels';
        return `${chat.department} · ${levelText}`;
      }
      if (chat.accessKey?.startsWith('dept:')) {
        return `${chat.department} · All levels`;
      }
      return 'Campus-wide group';
    }
    const peer = getDmPeer(chat);
    if (!peer) return 'Direct message';
    const levelLabel = formatCompactLevelLabel(peer.level, peer.is_alumni);
    return canViewMemberIdNumber(currentUser, peer.uid) && peer.idNumber
      ? `${peer.department} · ${levelLabel} · ${peer.idNumber}`
      : `${peer.department} · ${levelLabel}`;
  };

  const pinnedChatIds = currentUser.pinnedChatIds || [];
  const pinnedChatSet = useMemo(() => new Set(pinnedChatIds), [pinnedChatIds]);
  const starredIdSet = useMemo(
    () => new Set(starredMessages.map((s) => s.messageId)),
    [starredMessages]
  );

  const activeReplyTarget = useMemo<ReplyTarget | null>(() => {
    if (!replyingTo || replyingTo.deletedAt) return null;
    return {
      messageId: replyingTo.id,
      senderName: replyingTo.senderName,
      snippet: getMessageSnippet(replyingTo),
      messageType: replyingTo.messageType || 'text',
    };
  }, [replyingTo]);

  const trimmedSearch = searchQuery.trim().toLowerCase();
  const normalizedSearchId = normalizeIdNumber(searchQuery);

  const sortedChats = useMemo(() => {
    const matchesSearch = (chat: ChatThread) => {
      if (!trimmedSearch) return true;
      if (chat.type === 'dm') {
        const peerId = chat.participantIds.find((id) => id !== currentUser.uid);
        const peer = peerId ? userMap.get(peerId) : undefined;
        const participantName = peer ? peer.fullName : chat.name;
        const participantDept = peer?.department || '';
        const participantId = peer?.idNumber || '';
        const participantIdNorm = peer?.idNumberNormalized || '';
        const canSeeId = peer ? canViewMemberIdNumber(currentUser, peer.uid) : false;
        return (
          participantName.toLowerCase().includes(trimmedSearch) ||
          participantDept.toLowerCase().includes(trimmedSearch) ||
          (canSeeId &&
            (participantId.toLowerCase().includes(trimmedSearch) ||
              (normalizedSearchId.length > 0 && participantIdNorm.includes(normalizedSearchId))))
        );
      }
      return (
        chat.name.toLowerCase().includes(trimmedSearch) ||
        (chat.department || '').toLowerCase().includes(trimmedSearch)
      );
    };

    const pinned = chats
      .filter((c) => pinnedChatSet.has(c.id) && matchesSearch(c))
      .sort((a, b) => pinnedChatIds.indexOf(a.id) - pinnedChatIds.indexOf(b.id));

    const groups = chats.filter(
      (c) => c.type !== 'dm' && !pinnedChatSet.has(c.id) && matchesSearch(c)
    );
    const dms = chats.filter(
      (c) => c.type === 'dm' && !pinnedChatSet.has(c.id) && matchesSearch(c)
    );
    const orderRank = (type: ChatThread['type']) =>
      type === 'general' ? 0 : type === 'department' ? 1 : 2;
    groups.sort((a, b) => {
      const diff = orderRank(a.type) - orderRank(b.type);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name);
    });
    dms.sort((a, b) => {
      const ta = a.lastMessageAt?.toMillis() ?? 0;
      const tb = b.lastMessageAt?.toMillis() ?? 0;
      return tb - ta;
    });
    return { pinned, groups, dms };
  }, [chats, currentUser.uid, trimmedSearch, normalizedSearchId, userMap, pinnedChatSet, pinnedChatIds]);

  const unviewedStatusCount = useMemo(() => {
    return statuses.filter((s) => {
      if (s.authorId === currentUser.uid) return false;
      if (s.createdAt && nowMs - s.createdAt.toMillis() > STATUS_TTL_MS) return false;
      return !s.viewedBy?.[currentUser.uid];
    }).length;
  }, [statuses, currentUser.uid, nowMs]);

  const deptFacultyMap = useMemo(() => {
    const map = new Map<string, string>();
    departments.forEach((d) => map.set(d.name, d.faculty));
    return map;
  }, [departments]);

  const communitySections = useMemo(() => {
    const sections: {
      id: string;
      title: string;
      subtitle: string;
      announcementScope?: 'all' | 'department';
      announcementLabel?: string;
      announcementPreview?: string;
      groups: ChatThread[];
    }[] = [];

    const campusGroups: ChatThread[] = [];
    const byDepartment = new Map<string, ChatThread[]>();
    const specialGroups: ChatThread[] = [];

    sortedChats.groups.forEach((g) => {
      const dept = (g.department || '').trim();
      if (g.type === 'general' || g.accessKey === 'all') {
        campusGroups.push(g);
      } else if (dept && dept !== 'All GSU') {
        const list = byDepartment.get(dept) || [];
        list.push(g);
        byDepartment.set(dept, list);
      } else {
        specialGroups.push(g);
      }
    });

    const latestCampusNotice = announcements.find((a) => a.scope === 'All GSU');
    const latestDeptNotice = announcements.find((a) => a.scope === currentUser.department);

    const campusNoticeMatchesSearch =
      !trimmedSearch ||
      'university announcements notices campus all gsu'.includes(trimmedSearch);

    if (campusGroups.length > 0 || (onOpenAnnouncements && campusNoticeMatchesSearch && sortedChats.pinned.every((p) => p.type !== 'general'))) {
      sections.push({
        id: 'community_university',
        title: 'Gombe State University',
        subtitle: 'Main Campus Community',
        announcementScope: onOpenAnnouncements ? 'all' : undefined,
        announcementLabel: 'University Announcements',
        announcementPreview: latestCampusNotice
          ? latestCampusNotice.title
          : 'Official campus-wide bulletins',
        groups: campusGroups,
      });
    }

    const deptKeys = Array.from(byDepartment.keys()).sort((a, b) => {
      if (a === currentUser.department) return -1;
      if (b === currentUser.department) return 1;
      return a.localeCompare(b);
    });

    if (
      !byDepartment.has(currentUser.department) &&
      onOpenAnnouncements &&
      (!trimmedSearch ||
        currentUser.department.toLowerCase().includes(trimmedSearch) ||
        'department announcements'.includes(trimmedSearch))
    ) {
      // Include user's department announcements even if their dept chat is pinned
      deptKeys.unshift(currentUser.department);
    }

    deptKeys.forEach((deptName) => {
      const faculty = deptFacultyMap.get(deptName) || 'Academic Faculty';
      const isMyDept = deptName === currentUser.department;
      const groups = byDepartment.get(deptName) || [];
      sections.push({
        id: `community_dept_${deptName}`,
        title: `${deptName} Community`,
        subtitle: `Faculty of ${faculty}`,
        announcementScope: isMyDept && onOpenAnnouncements ? 'department' : undefined,
        announcementLabel: isMyDept ? `${deptName} Announcements` : undefined,
        announcementPreview: isMyDept
          ? latestDeptNotice
            ? latestDeptNotice.title
            : 'Departmental notices & timetables'
          : undefined,
        groups,
      });
    });

    if (specialGroups.length > 0) {
      sections.push({
        id: 'community_special',
        title: 'Clubs & Special Groups',
        subtitle: 'Custom & Invite-Only Spaces',
        groups: specialGroups,
      });
    }

    return sections;
  }, [
    sortedChats.groups,
    sortedChats.pinned,
    announcements,
    currentUser.department,
    deptFacultyMap,
    onOpenAnnouncements,
    trimmedSearch,
  ]);

  const toggleCommunityCollapsed = (id: string) => {
    setCollapsedCommunities((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const clearImageDraft = () => {
    if (imagePreviewUrlRef.current) {
      URL.revokeObjectURL(imagePreviewUrlRef.current);
      imagePreviewUrlRef.current = null;
    }
    setImageDraft(null);
  };

  const stopTypingForChat = (chatId: string | null) => {
    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
      typingIdleTimerRef.current = null;
    }
    if (chatId && activeTypingChatIdRef.current === chatId) {
      activeTypingChatIdRef.current = null;
      lastTypingSentAtRef.current = 0;
      clearTypingStatus(chatId, currentUser.uid).catch((err) => {
        console.error('Failed clearing typing status:', err);
      });
    }
  };

  useEffect(() => {
    setSendError(null);
    setExpandedReceiptMsgId(null);
    setReactionPickerMsgId(null);
    setMoreMenuMsgId(null);
    setReplyingTo(null);
    setEditingMessage(null);
    setConfirmDeleteMsg(null);
    setSwipeOffset(null);
    setHighlightedMsgId(null);
    setPollModalOpen(false);
    setAttachmentMenuOpen(false);
    clearImageDraft();
    setDocDraft(null);
    setMediaCaption('');
    setViewOncePhoto(false);
    setViewOnceVoice(false);
    setActiveViewOnceModal(null);
    setInChatSearchOpen(false);
    setInChatSearchQuery('');
    setInChatSearchActiveIdx(0);
    setGroupInfoOpen(false);
    setGroupInfoTab('members');
    setGroupMemberDocs([]);
    setEventModalOpen(false);
    setContactModalOpen(false);
    setLightboxImage(null);
    setPreviewFile(null);
    setRadarModalOpen(false);
    setShowScrollToBottom(false);
    setUnseenBelowCount(0);
    isNearBottomRef.current = true;
    prevMessageCountRef.current = 0;
    cancelVoiceRecording();
    if (!activeChatId) {
      setMessages([]);
      setPendingMessageIds(new Set());
      setReadReceipts([]);
      setReadReceiptsLoaded(false);
      setTypingStatuses([]);
      return;
    }

    setLoadingMessages(true);
    setHasMoreOlderMessages(false);
    setLoadingOlderMessages(false);
    setReadReceiptsLoaded(false);
    setTypingStatuses([]);

    const roomHandle = subscribeToChatRoom(activeChatId, currentUser, userMap, {
      onMessages: (list) => {
        setPendingMessageIds(new Set());
        setMessages(list);
        setLoadingMessages(false);
      },
      onReadReceipts: (receipts) => {
        setReadReceipts(receipts);
        setReadReceiptsLoaded(true);
      },
      onTypingStatuses: (typing) => {
        setTypingNowMs(Date.now());
        setTypingStatuses(typing);
      },
      onHasMoreOlder: (hasMore) => {
        setHasMoreOlderMessages(hasMore);
      },
    });
    chatRoomHandleRef.current = roomHandle;

    return () => {
      roomHandle.unsubscribe();
      if (chatRoomHandleRef.current === roomHandle) {
        chatRoomHandleRef.current = null;
      }
      stopTypingForChat(activeChatId);
    };
  }, [activeChatId, currentUser.uid]);

  useEffect(() => {
    const hasPeerTypingDocs = typingStatuses.some((t) => t.uid !== currentUser.uid);
    if (!hasPeerTypingDocs) return;
    setTypingNowMs(Date.now());
    const interval = window.setInterval(() => {
      setTypingNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [typingStatuses, currentUser.uid]);

  // Ensure this user's readReceipt stays synced with the newest incoming message seen
  useEffect(() => {
    if (!activeChatId || !readReceiptsLoaded) return;
    const myReceipt = readReceipts.find((r) => r.uid === currentUser.uid);
    const myReceiptMs = myReceipt?.lastReadAt?.toMillis() ?? 0;

    let latestOtherMsgMs = 0;
    for (const m of messages) {
      if (m.senderId === currentUser.uid || pendingMessageIds.has(m.id)) continue;
      const ms = m.createdAt?.toMillis() ?? 0;
      if (ms > latestOtherMsgMs) latestOtherMsgMs = ms;
    }

    const needsInitialSeed = !myReceipt && !seededReceiptChatsRef.current.has(activeChatId);
    const needsAdvance =
      latestOtherMsgMs > myReceiptMs &&
      (lastSyncedReadMsgRef.current[activeChatId] ?? 0) < latestOtherMsgMs;

    if (!needsInitialSeed && !needsAdvance) return;

    if (needsInitialSeed) {
      seededReceiptChatsRef.current.add(activeChatId);
    }
    if (latestOtherMsgMs > 0) {
      lastSyncedReadMsgRef.current[activeChatId] = Math.max(
        lastSyncedReadMsgRef.current[activeChatId] ?? 0,
        latestOtherMsgMs
      );
    }

    markChatAsRead(currentUser.uid, activeChatId, currentUser.fullName).catch((err) => {
      console.error('Failed updating read receipt:', err);
    });
  }, [
    activeChatId,
    readReceiptsLoaded,
    readReceipts,
    messages,
    pendingMessageIds,
    currentUser.uid,
    currentUser.fullName,
  ]);

  const scrollToMessage = (messageId: string) => {
    if (!messageId) return;
    const el = msgRefs.current[messageId];
    if (!el) {
      setSendError('That message is not in the currently loaded messages. Try loading older messages.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMsgId(messageId);
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = window.setTimeout(() => {
      setHighlightedMsgId((prev) => (prev === messageId ? null : prev));
      highlightTimerRef.current = null;
    }, 2400);
  };

  useEffect(() => {
    const activeJump = jumpToMessage || internalJumpTarget;
    if (!activeJump) return;
    if (loadingMessages || activeChatId !== activeJump.chatId) return;

    const timer = window.setTimeout(() => {
      scrollToMessage(activeJump.messageId);
      if (jumpToMessage && activeJump === jumpToMessage) {
        onClearJumpToMessage?.();
      } else {
        setInternalJumpTarget(null);
      }
    }, 90);
    return () => window.clearTimeout(timer);
  }, [jumpToMessage, internalJumpTarget, loadingMessages, activeChatId, messages.length]);

  const handleFeedScroll = () => {
    const el = feedContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distFromBottom <= 100;
    isNearBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (nearBottom) {
      setUnseenBelowCount(0);
    }
  };

  const jumpToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    isNearBottomRef.current = true;
    setShowScrollToBottom(false);
    setUnseenBelowCount(0);
  };

  useEffect(() => {
    const pendingJump = jumpToMessage || internalJumpTarget;
    if (pendingJump && pendingJump.chatId === activeChatId) return;
    const prevCount = prevMessageCountRef.current;
    const nextCount = messages.length;
    prevMessageCountRef.current = nextCount;
    if (nextCount === 0) return;

    const latestMsg = messages[nextCount - 1];
    const isInitialLoad = prevCount === 0;
    const sentByMe = latestMsg?.senderId === currentUser.uid;
    if (isInitialLoad || isNearBottomRef.current || sentByMe) {
      messagesEndRef.current?.scrollIntoView({
        behavior: isInitialLoad ? 'auto' : 'smooth',
      });
      setUnseenBelowCount(0);
    } else if (nextCount > prevCount) {
      setUnseenBelowCount((c) => c + (nextCount - prevCount));
    }
  }, [messages.length, activeChatId, jumpToMessage, internalJumpTarget, currentUser.uid, messages]);

  const handleDraftChange = (nextValue: string) => {
    setDraft(nextValue);
    if (!activeChat || isDmBlocked) return;

    if (!nextValue.trim()) {
      stopTypingForChat(activeChat.id);
      return;
    }

    if (typingIdleTimerRef.current !== null) {
      window.clearTimeout(typingIdleTimerRef.current);
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      stopTypingForChat(activeChat.id);
    }, 4000);

    const now = Date.now();
    if (
      activeTypingChatIdRef.current !== activeChat.id ||
      now - lastTypingSentAtRef.current >= 2500
    ) {
      activeTypingChatIdRef.current = activeChat.id;
      lastTypingSentAtRef.current = now;
      setTypingStatus(activeChat.id, currentUser).catch((err) => {
        console.error('Failed setting typing status:', err);
      });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !draft.trim()) return;
    if (isDmBlocked) return;

    if (editingMessage) {
      if (savingEdit) return;
      const trimmed = draft.trim();
      if (trimmed === editingMessage.text.trim()) {
        setEditingMessage(null);
        setDraft('');
        return;
      }
      setSavingEdit(true);
      setSendError(null);
      try {
        await editTextMessage(activeChat.id, editingMessage.id, trimmed);
        setEditingMessage(null);
        setDraft('');
        stopTypingForChat(activeChat.id);
      } catch (err) {
        setSendError(
          err instanceof Error
            ? err.message
            : 'Message could not be edited (15-minute window may have expired).'
        );
      } finally {
        setSavingEdit(false);
      }
      return;
    }

    const textToSend = draft;
    const replyTarget = activeReplyTarget;
    setDraft('');
    setReplyingTo(null);
    setSendError(null);
    stopTypingForChat(activeChat.id);
    sendMessage(activeChat.id, currentUser, textToSend, replyTarget).catch((err) => {
      console.error('Failed to send message:', err);
      setDraft((prev) => (prev ? prev : textToSend));
      setSendError(err instanceof Error ? err.message : 'Message could not be sent.');
    });
  };

  useEffect(() => {
    if (!reactionPickerMsgId) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-reaction-area="true"]')) return;
      setReactionPickerMsgId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReactionPickerMsgId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [reactionPickerMsgId]);

  useEffect(() => {
    if (!moreMenuMsgId) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-msg-menu="true"]')) return;
      setMoreMenuMsgId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuMsgId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreMenuMsgId]);

  const stopMediaTracks = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  const cancelVoiceRecording = () => {
    recorderActionRef.current = 'cancel';
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore stop errors during cleanup
      }
    }
    stopMediaTracks();
    audioChunksRef.current = [];
    recordingTargetChatIdRef.current = null;
    if (voicePreviewUrlRef.current) {
      URL.revokeObjectURL(voicePreviewUrlRef.current);
      voicePreviewUrlRef.current = null;
    }
    setRecordingPhase('idle');
    setRecordingSec(0);
    setRecordedVoiceDraft(null);
    setViewOnceVoice(false);
  };

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
      }
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
      if (reportTimerRef.current !== null) {
        window.clearTimeout(reportTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      if (voicePreviewUrlRef.current) {
        URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      }
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
        imagePreviewUrlRef.current = null;
      }
      recorderActionRef.current = 'cancel';
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore unmount cleanup errors
        }
      }
      stopMediaTracks();
    };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const startLongPress = (msgId: string) => {
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      setReactionPickerMsgId(msgId);
    }, 450);
  };

  const startReplyToMessage = (msg: ChatMessage) => {
    if (msg.deletedAt || pendingMessageIds.has(msg.id)) return;
    setEditingMessage(null);
    setMoreMenuMsgId(null);
    setReactionPickerMsgId(null);
    setReplyingTo(msg);
    window.setTimeout(() => composerInputRef.current?.focus(), 40);
  };

  const startEditMessage = (msg: ChatMessage) => {
    if (msg.deletedAt || pendingMessageIds.has(msg.id)) return;
    setReplyingTo(null);
    setMoreMenuMsgId(null);
    setReactionPickerMsgId(null);
    setAttachmentMenuOpen(false);
    setEditingMessage(msg);
    setDraft(msg.text);
    window.setTimeout(() => composerInputRef.current?.focus(), 40);
  };

  const handleToggleStarMessage = async (msg: ChatMessage) => {
    if (!activeChat || msg.deletedAt || pendingMessageIds.has(msg.id)) return;
    if (starringMsgId === msg.id) return;
    setStarringMsgId(msg.id);
    setMoreMenuMsgId(null);
    try {
      if (starredIdSet.has(msg.id)) {
        await unstarMessageForUser(currentUser.uid, msg.id);
      } else {
        await starMessageForUser(currentUser.uid, activeChat, msg);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not update saved message.');
    } finally {
      setStarringMsgId(null);
    }
  };

  const handleTogglePinMessageInGroup = async (msg: ChatMessage) => {
    if (!activeChat || activeChat.type === 'dm' || pinningMsgBusy || msg.deletedAt) return;
    setPinningMsgBusy(true);
    setMoreMenuMsgId(null);
    try {
      if (activeChat.pinnedMessageId === msg.id) {
        await unpinMessageInGroup(activeChat.id);
      } else {
        await pinMessageInGroup(activeChat.id, msg, currentUser);
      }
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not update pinned message.');
    } finally {
      setPinningMsgBusy(false);
    }
  };

  const handleUnpinBanner = async () => {
    if (!activeChat || activeChat.type === 'dm' || pinningMsgBusy) return;
    setPinningMsgBusy(true);
    try {
      await unpinMessageInGroup(activeChat.id);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not unpin message.');
    } finally {
      setPinningMsgBusy(false);
    }
  };

  const handleTogglePinChat = async (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinningChatId === chatId) return;
    setPinningChatId(chatId);
    setChatPinNotice(null);
    try {
      await togglePinChatForUser(currentUser.uid, chatId, pinnedChatIds);
    } catch (err) {
      setChatPinNotice(
        err instanceof Error
          ? err.message
          : `You can pin up to ${MAX_PINNED_CHATS} chats.`
      );
    } finally {
      setPinningChatId(null);
    }
  };

  const handleConfirmDeleteMessage = async () => {
    if (!activeChat || !confirmDeleteMsg || deletingMsgBusy) return;
    setDeletingMsgBusy(true);
    setSendError(null);
    try {
      await deleteMessageForEveryone(activeChat.id, confirmDeleteMsg.id, currentUser);
      if (activeChat.type !== 'dm' && activeChat.pinnedMessageId === confirmDeleteMsg.id) {
        // Any sender can end up deleting their own message while it is pinned,
        // and privileged moderators can delete anyone's message — either way the
        // pin must not linger on a removed message. Best effort: the server
        // enforces chat-update permissions, so log and move on if it fails.
        unpinMessageInGroup(activeChat.id).catch((err) => {
          console.error('Failed unpinning deleted message:', err);
        });
      }
      if (replyingTo?.id === confirmDeleteMsg.id) setReplyingTo(null);
      if (editingMessage?.id === confirmDeleteMsg.id) {
        setEditingMessage(null);
        setDraft('');
      }
      if (starredIdSet.has(confirmDeleteMsg.id)) {
        unstarMessageForUser(currentUser.uid, confirmDeleteMsg.id).catch(() => {});
      }
      setConfirmDeleteMsg(null);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setDeletingMsgBusy(false);
    }
  };

  const handleToggleReaction = (msgId: string, emoji: string) => {
    if (!activeChat || isDmBlocked) return;
    setReactionPickerMsgId(null);
    toggleMessageReaction(activeChat.id, msgId, currentUser.uid, emoji).catch((err) => {
      console.error('Failed toggling reaction:', err);
    });
  };

  const pickSupportedAudioMimeType = (): string | undefined => {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  };

  const dispatchVoiceNote = async (targetChatId: string, audioBlob: Blob, durationSec: number) => {
    setSendingVoice(true);
    setSendError(null);
    const replyTarget = activeReplyTarget;
    const sendAsViewOnce = viewOnceVoice;
    try {
      await sendVoiceMessage(
        targetChatId,
        currentUser,
        audioBlob,
        durationSec,
        replyTarget,
        sendAsViewOnce
      );
      if (voicePreviewUrlRef.current) {
        URL.revokeObjectURL(voicePreviewUrlRef.current);
        voicePreviewUrlRef.current = null;
      }
      setReplyingTo(null);
      setRecordingPhase('idle');
      setRecordedVoiceDraft(null);
      setRecordingSec(0);
      setViewOnceVoice(false);
    } catch (err) {
      console.error('Failed sending voice note:', err);
      setSendError(err instanceof Error ? err.message : 'Voice note could not be sent.');
    } finally {
      setSendingVoice(false);
    }
  };

  const startVoiceRecording = async () => {
    if (!activeChat || isDmBlocked || recordingPhase !== 'idle' || sendingVoice) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setSendError('Voice recording is not supported in this browser.');
      return;
    }

    setSendError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingTargetChatIdRef.current = activeChat.id;
      recorderActionRef.current = 'preview';

      const mimeType = pickSupportedAudioMimeType();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }
        );
      } catch {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      }
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const action = recorderActionRef.current;
        const targetChatId = recordingTargetChatIdRef.current;
        const elapsedSec = Math.max(
          1,
          Math.min(
            MAX_VOICE_NOTE_SECONDS,
            Math.round((Date.now() - recordingStartedAtRef.current) / 1000)
          )
        );
        const chunks = [...audioChunksRef.current];
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';

        stopMediaTracks();
        audioChunksRef.current = [];

        if (action === 'cancel' || chunks.length === 0) {
          setRecordingPhase('idle');
          setRecordingSec(0);
          return;
        }

        try {
          const blob = new Blob(chunks, { type: finalMime });
          if (blob.size > MAX_VOICE_NOTE_BYTES) {
            setSendError('Voice note exceeds the 5 MB limit. Please record a shorter clip.');
            setRecordingPhase('idle');
            setRecordingSec(0);
            return;
          }

          if (action === 'send' && targetChatId) {
            await dispatchVoiceNote(targetChatId, blob, elapsedSec);
          } else {
            if (voicePreviewUrlRef.current) {
              URL.revokeObjectURL(voicePreviewUrlRef.current);
            }
            const previewUrl = URL.createObjectURL(blob);
            voicePreviewUrlRef.current = previewUrl;
            setRecordedVoiceDraft({ blob, previewUrl, durationSec: elapsedSec });
            setRecordingPhase('preview');
          }
        } catch (err) {
          console.error('Failed processing voice note:', err);
          setSendError('Could not process recorded audio.');
          setRecordingPhase('idle');
          setRecordingSec(0);
        }
      };

      recordingStartedAtRef.current = Date.now();
      setRecordingSec(0);
      setRecordingPhase('recording');
      recorder.start(250);

      recordingTimerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - recordingStartedAtRef.current) / 1000);
        setRecordingSec(Math.min(MAX_VOICE_NOTE_SECONDS, secs));
        if (secs >= MAX_VOICE_NOTE_SECONDS && mediaRecorderRef.current?.state === 'recording') {
          recorderActionRef.current = 'preview';
          mediaRecorderRef.current.stop();
        }
      }, 250);
    } catch (err) {
      stopMediaTracks();
      setRecordingPhase('idle');
      const errName = err instanceof DOMException ? err.name : '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setSendError('Microphone access denied. Allow microphone permission to send voice notes.');
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setSendError('No microphone detected on this device.');
      } else {
        setSendError('Could not start voice recording.');
      }
    }
  };

  const stopAndPreviewVoiceRecording = () => {
    if (recordingPhase !== 'recording') return;
    recorderActionRef.current = 'preview';
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendVoiceRecordingNow = async () => {
    if (!activeChat || isDmBlocked || sendingVoice) return;
    if (recordingPhase === 'recording') {
      recorderActionRef.current = 'send';
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }
    if (recordingPhase === 'preview' && recordedVoiceDraft) {
      await dispatchVoiceNote(
        activeChat.id,
        recordedVoiceDraft.blob,
        recordedVoiceDraft.durationSec
      );
    }
  };

  const handleCopyMessageText = async (msg: ChatMessage) => {
    const textToCopy = (msg.text || '').trim();
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedMsgId(msg.id);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedMsgId((prev) => (prev === msg.id ? null : prev));
        setMoreMenuMsgId(null);
      }, 900);
    } catch {
      setSendError('Could not copy message to clipboard.');
      setMoreMenuMsgId(null);
    }
  };

  const handleToggleBlock = async () => {
    if (!activeChat || activeChat.type !== 'dm' || blockingBusy) return;
    const peer = getDmPeer(activeChat);
    if (!peer) return;
    const iBlocked = Boolean(currentUser.blockedUsers?.includes(peer.uid));
    setBlockingBusy(true);
    setSendError(null);
    try {
      await toggleBlockUser(
        currentUser.uid,
        currentUser.blockedUsers || [],
        peer.uid,
        !iBlocked
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not update block status.');
    } finally {
      setBlockingBusy(false);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !reportingMessage || submittingReport) return;
    setSubmittingReport(true);
    setSendError(null);
    try {
      await submitMessageReport(
        activeChat,
        reportingMessage,
        currentUser,
        reportReason,
        reportDetails
      );
      setReportingMessage(null);
      setReportDetails('');
      setReportReason('Spam');
      setReportBanner('Message reported to GSU Connect admins.');
      if (reportTimerRef.current !== null) {
        window.clearTimeout(reportTimerRef.current);
      }
      reportTimerRef.current = window.setTimeout(() => setReportBanner(null), 4000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not submit report. Please try again.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const openPollCreator = () => {
    if (!activeChat || activeChat.type === 'dm') return;
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollFormError(null);
    setPollModalOpen(true);
  };

  const handleCreatePollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || activeChat.type === 'dm' || sendingPoll) return;
    const cleanedQuestion = pollQuestion.trim();
    const cleanedOptions = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (cleanedQuestion.length < 2) {
      setPollFormError('Please enter a poll question (at least 2 characters).');
      return;
    }
    if (cleanedOptions.length < 2) {
      setPollFormError('Please fill in at least 2 poll options.');
      return;
    }

    setPollFormError(null);
    setSendingPoll(true);
    try {
      await sendPollMessage(
        activeChat.id,
        currentUser,
        cleanedQuestion,
        cleanedOptions,
        activeReplyTarget
      );
      setReplyingTo(null);
      setPollModalOpen(false);
      setPollQuestion('');
      setPollOptions(['', '']);
    } catch (err) {
      setPollFormError(err instanceof Error ? err.message : 'Failed creating poll.');
    } finally {
      setSendingPoll(false);
    }
  };

  const handleVotePoll = async (msg: ChatMessage, optionIndex: number) => {
    if (!activeChat || activeChat.type === 'dm' || pendingMessageIds.has(msg.id)) return;
    const currentVote = msg.pollVotes?.[currentUser.uid];
    if (currentVote === optionIndex) return;
    setVotingMsgId(msg.id);
    try {
      await voteOnPoll(activeChat.id, msg.id, currentUser.uid, optionIndex);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not record your vote.');
    } finally {
      setVotingMsgId(null);
    }
  };

  const compressImageToBlob = (
    file: File
  ): Promise<{ blob: Blob; previewUrl: string; fileSizeBytes: number }> =>
    new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize image processor.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        for (const quality of [0.8, 0.68, 0.55]) {
          const blob = await new Promise<Blob | null>((res) =>
            canvas.toBlob((b) => res(b), 'image/jpeg', quality)
          );
          if (blob && blob.size <= MAX_CHAT_IMAGE_BYTES) {
            const previewUrl = URL.createObjectURL(blob);
            resolve({ blob, previewUrl, fileSizeBytes: blob.size });
            return;
          }
        }
        reject(new Error('Image exceeds the 5 MB limit after compression.'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Unsupported or corrupted image file.'));
      };
      img.src = objectUrl;
    });

  const handleGalleryFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChat || isDmBlocked) return;
    if (!file.type.startsWith('image/')) {
      setSendError('Please select a valid image file (PNG, JPG, WebP, or GIF).');
      return;
    }
    setSendError(null);
    try {
      const { blob, previewUrl, fileSizeBytes } = await compressImageToBlob(file);
      if (imagePreviewUrlRef.current) {
        URL.revokeObjectURL(imagePreviewUrlRef.current);
      }
      imagePreviewUrlRef.current = previewUrl;
      setMediaCaption('');
      setViewOncePhoto(false);
      setDocDraft(null);
      setImageDraft({
        blob,
        previewUrl,
        fileName: file.name || 'photo.jpg',
        fileSizeBytes,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to load selected image.');
    }
  };

  const handleDocumentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeChat || isDmBlocked) return;
    setSendError(null);

    if (file.size <= 0) {
      setSendError('The selected document is empty.');
      return;
    }
    if (file.size > MAX_CHAT_DOCUMENT_BYTES) {
      setSendError(
        `Document "${file.name}" (${formatFileSize(file.size)}) exceeds the 5 MB chat limit. Larger handouts can be shared in Repository.`
      );
      return;
    }

    setMediaCaption('');
    clearImageDraft();
    setDocDraft({
      file,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSizeBytes: file.size,
    });
  };

  const handleSendImageDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !imageDraft || sendingMedia) return;
    setSendingMedia(true);
    setSendError(null);
    try {
      await sendImageMessage(
        activeChat.id,
        currentUser,
        imageDraft.blob,
        imageDraft.fileName,
        viewOncePhoto ? '' : mediaCaption,
        activeReplyTarget,
        viewOncePhoto
      );
      setReplyingTo(null);
      clearImageDraft();
      setMediaCaption('');
      setViewOncePhoto(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Photo could not be sent.');
    } finally {
      setSendingMedia(false);
    }
  };

  const handleSendDocDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || !docDraft || sendingMedia) return;
    setSendingMedia(true);
    setSendError(null);
    try {
      await sendDocumentMessage(
        activeChat.id,
        currentUser,
        docDraft.file,
        mediaCaption,
        activeReplyTarget
      );
      setReplyingTo(null);
      setDocDraft(null);
      setMediaCaption('');
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Document could not be sent.');
    } finally {
      setSendingMedia(false);
    }
  };

  const openEventCreator = () => {
    if (!activeChat || isDmBlocked) return;
    setAttachmentMenuOpen(false);
    setEventTitle('');
    setEventDate(new Date().toISOString().slice(0, 10));
    setEventTime('10:00 AM');
    setEventVenue('');
    setEventNotes('');
    setEventFormError(null);
    setEventModalOpen(true);
  };

  const handleSendCalendarPresetEvent = async (ev: CalendarEvent) => {
    if (!activeChat || isDmBlocked || sendingEvent) return;
    setSendingEvent(true);
    setEventFormError(null);
    try {
      await sendEventMessage(
        activeChat.id,
        currentUser,
        {
          title: ev.title,
          date: ev.date,
          time: ev.startTime
            ? ev.endTime
              ? `${ev.startTime} - ${ev.endTime}`
              : ev.startTime
            : '09:00 AM',
          venue: ev.venue || 'GSU Main Campus',
          notes: ev.description || `${ev.eventType.replace('_', ' ')} · ${ev.department}`,
        },
        activeReplyTarget
      );
      setReplyingTo(null);
      setEventModalOpen(false);
    } catch (err) {
      setEventFormError(err instanceof Error ? err.message : 'Could not share event.');
    } finally {
      setSendingEvent(false);
    }
  };

  const handleSendCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChat || isDmBlocked || sendingEvent) return;
    setSendingEvent(true);
    setEventFormError(null);
    try {
      await sendEventMessage(
        activeChat.id,
        currentUser,
        {
          title: eventTitle,
          date: eventDate,
          time: eventTime,
          venue: eventVenue,
          notes: eventNotes,
        },
        activeReplyTarget
      );
      setReplyingTo(null);
      setEventModalOpen(false);
    } catch (err) {
      setEventFormError(err instanceof Error ? err.message : 'Could not share event.');
    } finally {
      setSendingEvent(false);
    }
  };

  const openContactPicker = () => {
    if (!activeChat || isDmBlocked) return;
    setAttachmentMenuOpen(false);
    setContactSearch('');
    setContactModalOpen(true);
  };

  const handleShareContact = async (person: AppUser) => {
    if (!activeChat || isDmBlocked || sendingContact) return;
    setSendingContact(true);
    setSendError(null);
    try {
      await sendContactMessage(activeChat.id, currentUser, person, activeReplyTarget);
      setReplyingTo(null);
      setContactModalOpen(false);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Contact could not be shared.');
    } finally {
      setSendingContact(false);
    }
  };

  const handleMessageSharedContact = async (msg: ChatMessage) => {
    if (!msg.contactUid || msg.contactUid === currentUser.uid || openingContactDmUid) return;
    const targetUser: AppUser = userMap.get(msg.contactUid) || {
      uid: msg.contactUid,
      fullName: msg.contactName || 'GSU Member',
      email: '',
      department: msg.contactDepartment || 'General',
      level: ((msg.contactLevel as AcademicLevel) || '100'),
      idNumber: msg.contactIdNumber || '',
      idNumberNormalized: normalizeIdNumber(msg.contactIdNumber || ''),
      accountType: msg.contactRole === 'lecturer' || msg.contactLevel === 'Staff' ? 'staff' : 'student',
      role: msg.contactRole || 'student',
      status: 'approved',
      createdAt: null,
    };

    setOpeningContactDmUid(msg.id);
    try {
      const dmChatId = await openOrCreateDmChat(currentUser, targetUser);
      onSelectChat(dmChatId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not open direct chat.');
    } finally {
      setOpeningContactDmUid(null);
    }
  };

  const upcomingCalendarEvents = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...calendarEvents]
      .filter((ev) => ev.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [calendarEvents]);

  useEffect(() => {
    if (!contactModalOpen) {
      setContactRemoteResults([]);
      return;
    }
    const q = contactSearch.trim();
    if (q.length < 2) {
      setContactRemoteResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchPeople(q)
        .then((res) => {
          if (active) setContactRemoteResults(res);
        })
        .catch(() => {
          if (active) setContactRemoteResults([]);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [contactModalOpen, contactSearch]);

  const filteredContactCandidates = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const qNorm = normalizeIdNumber(contactSearch);
    const mergedMap = new Map<string, AppUser>();
    approvedUsers.forEach((u) => mergedMap.set(u.uid, u));
    contactRemoteResults.forEach((u) => mergedMap.set(u.uid, u));
    return Array.from(mergedMap.values())
      .filter((u) => u.uid !== currentUser.uid)
      .filter((u) => {
        if (!q) return true;
        return (
          u.fullName.toLowerCase().includes(q) ||
          u.department.toLowerCase().includes(q) ||
          (canViewMemberIdNumber(currentUser, u.uid) &&
            Boolean(qNorm) &&
            normalizeIdNumber(u.idNumber).includes(qNorm))
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [approvedUsers, contactRemoteResults, currentUser.uid, contactSearch]);

  const activeDmPeer = useMemo(
    () => (activeChat?.type === 'dm' ? getDmPeer(activeChat) : null),
    [activeChat, userMap, currentUser.uid]
  );
  const iBlockedDm = Boolean(
    activeDmPeer && currentUser.blockedUsers?.includes(activeDmPeer.uid)
  );
  const peerBlockedDm = Boolean(
    activeDmPeer && activeDmPeer.blockedUsers?.includes(currentUser.uid)
  );
  const isDmBlocked = Boolean(iBlockedDm || peerBlockedDm);

  useEffect(() => {
    if (isDmBlocked && activeChatId) {
      stopTypingForChat(activeChatId);
      cancelVoiceRecording();
      setAttachmentMenuOpen(false);
    }
  }, [isDmBlocked, activeChatId]);

  useEffect(() => {
    if (!attachmentMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-attachment-area="true"]')) return;
      setAttachmentMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAttachmentMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [attachmentMenuOpen]);

  const activeTypers = useMemo(() => {
    return typingStatuses
      .filter((t) => {
        if (t.uid === currentUser.uid) return false;
        const tsMs = t.lastTypedAt?.toMillis();
        if (!tsMs) return false;
        return typingNowMs - tsMs <= TYPING_INDICATOR_WINDOW_MS;
      })
      .map((t) => userMap.get(t.uid)?.fullName || t.fullName);
  }, [typingStatuses, currentUser.uid, typingNowMs, userMap]);

  const typingSummary = useMemo(() => {
    if (activeTypers.length === 0) return '';
    if (activeTypers.length === 1) return `${activeTypers[0]} is typing...`;
    if (activeTypers.length === 2) {
      return `${activeTypers[0]} and ${activeTypers[1]} are typing...`;
    }
    const extraCount = activeTypers.length - 2;
    return `${activeTypers[0]}, ${activeTypers[1]} and ${extraCount} ${
      extraCount === 1 ? 'other' : 'others'
    } are typing...`;
  }, [activeTypers]);

  const isMemberOnline = (u?: Pick<AppUser, 'uid' | 'lastSeen'> | null): boolean => {
    if (!u) return false;
    if (onlineUserIds) return onlineUserIds.has(u.uid);
    return isUserOnline(u.lastSeen, nowMs);
  };

  const activeGroupOnlineCount = useMemo(() => {
    if (!activeChat || activeChat.type === 'dm') return 0;
    const key = activeChat.accessKey || '';
    const scopedUsers = approvedUsers.filter((u) => {
      if (activeChat.type === 'general' || key === 'all') return true;
      if (activeChat.type === 'department' || key.startsWith('deptLevel:')) {
        return u.department === activeChat.department && u.level === activeChat.level;
      }
      if (key.startsWith('dept:')) {
        return u.department === activeChat.department;
      }
      return false;
    });
    if (onlineUserIds && (activeChat.type === 'general' || key === 'all')) {
      return onlineUserIds.size;
    }
    return scopedUsers.filter((u) => isMemberOnline(u)).length;
  }, [activeChat, approvedUsers, nowMs, onlineUserIds]);

  // Subscribe to Group Members via Supabase Realtime while Group Info Drawer is open
  useEffect(() => {
    if (!groupInfoOpen || !activeChat || activeChat.type === 'dm') {
      setGroupMemberDocs([]);
      return;
    }
    const unsub = subscribeToGroupMembers(activeChat.id, userMap, (members) => {
      setGroupMemberDocs(members);
    });
    return () => unsub();
  }, [groupInfoOpen, activeChat, userMap]);

  const groupInfoMembers = useMemo(() => {
    if (!activeChat || activeChat.type === 'dm') return [];
    const byUid = new Map<
      string,
      {
        uid: string;
        fullName: string;
        department: string;
        level: string;
        role: AppUser['role'];
        idNumber: string;
        online: boolean;
        userObj?: AppUser;
        isAlumni?: boolean;
      }
    >();

    // First include explicit ChatMember docs
    groupMemberDocs.forEach((m) => {
      const liveUser = userMap.get(m.uid);
      byUid.set(m.uid, {
        uid: m.uid,
        fullName: liveUser?.fullName || m.fullName,
        department: liveUser?.department || m.department,
        level: liveUser?.level || m.level,
        role: liveUser?.role || m.role,
        idNumber: liveUser?.idNumber || m.idNumber,
        online: onlineUserIds ? onlineUserIds.has(m.uid) : liveUser ? isUserOnline(liveUser.lastSeen, nowMs) : false,
        userObj: liveUser,
        isAlumni: Boolean(liveUser?.is_alumni),
      });
    });

    // Also include approvedUsers who match the group scope
    const key = activeChat.accessKey || '';
    approvedUsers.forEach((u) => {
      const inScope =
        activeChat.type === 'general' ||
        key === 'all' ||
        ((activeChat.type === 'department' || key.startsWith('deptLevel:')) &&
          u.department === activeChat.department &&
          u.level === activeChat.level) ||
        (key.startsWith('dept:') && u.department === activeChat.department);

      if (inScope && !byUid.has(u.uid)) {
        byUid.set(u.uid, {
          uid: u.uid,
          fullName: u.fullName,
          department: u.department,
          level: u.level,
          role: u.role,
          idNumber: u.idNumber,
          online: isMemberOnline(u),
          userObj: u,
          isAlumni: Boolean(u.is_alumni),
        });
      }
    });

    const roleRank = (r: AppUser['role']) =>
      r === 'admin' ? 0 : r === 'lecturer' ? 1 : r === 'classRep' ? 2 : r === 'deptHelper' ? 3 : 4;

    return Array.from(byUid.values()).sort((a, b) => {
      if (a.online !== b.online) return a.online ? -1 : 1;
      const rDiff = roleRank(a.role) - roleRank(b.role);
      if (rDiff !== 0) return rDiff;
      return a.fullName.localeCompare(b.fullName);
    });
  }, [activeChat, groupMemberDocs, approvedUsers, userMap, nowMs, onlineUserIds]);

  const groupHubData = useMemo(() => {
    const mediaImages: ChatMessage[] = [];
    const voiceNotes: ChatMessage[] = [];
    const docs: ChatMessage[] = [];
    const links: { url: string; msgId: string; senderName: string; createdAt: ChatMessage['createdAt'] }[] = [];
    const urlRegex = /https?:\/\/[^\s<>"')]+/gi;

    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.deletedAt || m.isViewOnce) continue;
      if (m.messageType === 'image' && m.mediaData) {
        mediaImages.push(m);
      } else if (m.messageType === 'voice' && m.audioData) {
        voiceNotes.push(m);
      } else if (m.messageType === 'document' && m.mediaData) {
        docs.push(m);
      }
      const haystack = `${m.text || ''} ${m.eventNotes || ''}`;
      const matched = haystack.match(urlRegex);
      if (matched) {
        for (const rawUrl of matched) {
          links.push({
            url: rawUrl,
            msgId: m.id,
            senderName: m.senderId === currentUser.uid ? 'You' : m.senderName,
            createdAt: m.createdAt,
          });
        }
      }
    }
    return { mediaImages, voiceNotes, docs, links };
  }, [messages, currentUser.uid]);

  const trimmedInChatQuery = inChatSearchQuery.trim().toLowerCase();

  const inChatMatches = useMemo(() => {
    if (!inChatSearchOpen || !trimmedInChatQuery) return [];
    const matches: string[] = [];
    for (const m of messages) {
      if (m.deletedAt || m.isViewOnce) continue;
      const haystack = [
        m.text,
        m.fileName,
        m.pollQuestion,
        m.eventTitle,
        m.eventVenue,
        m.contactName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(trimmedInChatQuery)) {
        matches.push(m.id);
      }
    }
    return matches;
  }, [messages, inChatSearchOpen, trimmedInChatQuery]);

  useEffect(() => {
    if (!inChatSearchOpen || inChatMatches.length === 0) {
      setInChatSearchActiveIdx(0);
      return;
    }
    const latestIdx = inChatMatches.length - 1;
    setInChatSearchActiveIdx(latestIdx);
    scrollToMessage(inChatMatches[latestIdx]);
  }, [trimmedInChatQuery, inChatSearchOpen]);

  const stepInChatSearch = (direction: -1 | 1) => {
    if (inChatMatches.length === 0) return;
    const nextIdx =
      (inChatSearchActiveIdx + direction + inChatMatches.length) % inChatMatches.length;
    setInChatSearchActiveIdx(nextIdx);
    scrollToMessage(inChatMatches[nextIdx]);
  };

  const renderHighlightedSegment = (segment: string, keyPrefix: string) => {
    if (!inChatSearchOpen || !trimmedInChatQuery || !segment) return segment;
    const escaped = trimmedInChatQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = segment.split(regex);
    if (parts.length <= 1) return segment;
    return parts.map((part, idx) =>
      part.toLowerCase() === trimmedInChatQuery ? (
        <mark
          key={`${keyPrefix}-${idx}`}
          className="bg-warn/90 dark:bg-warn/40 text-ink dark:text-warn-bg rounded px-0.5 font-semibold"
        >
          {part}
        </mark>
      ) : (
        <React.Fragment key={`${keyPrefix}-${idx}`}>{part}</React.Fragment>
      )
    );
  };

  const renderHighlightedText = (text: string) => {
    if (!text) return text;
    const urlRegex = /(https?:\/\/[^\s<>()]+)/gi;
    const segments = text.split(urlRegex);
    if (segments.length <= 1) {
      return renderHighlightedSegment(text, 'txt');
    }
    return segments.map((seg, idx) => {
      if (/^https?:\/\//i.test(seg)) {
        const cleanUrl = seg.replace(/[.,!?;:]+$/, '');
        const trailing = seg.slice(cleanUrl.length);
        return (
          <React.Fragment key={`seg-${idx}`}>
            <a
              href={cleanUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="underline decoration-current/60 underline-offset-2 hover:opacity-80 break-all"
            >
              {renderHighlightedSegment(cleanUrl, `url-${idx}`)}
            </a>
            {trailing}
          </React.Fragment>
        );
      }
      return (
        <React.Fragment key={`seg-${idx}`}>
          {renderHighlightedSegment(seg, `txt-${idx}`)}
        </React.Fragment>
      );
    });
  };

  const formatDateDividerLabel = (ms: number): string => {
    const date = new Date(ms);
    const today = new Date();
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const diffDays = Math.round((startOfToday - startOfDate) / 86_400_000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
    });
  };

  const handleOpenViewOnce = async (msg: ChatMessage) => {
    if (!activeChat || !msg.isViewOnce || msg.viewOnceOpenedAt || msg.senderId === currentUser.uid) {
      return;
    }
    if (openingViewOnceMsgId === msg.id) return;
    const kind: 'image' | 'voice' = msg.messageType === 'voice' ? 'voice' : 'image';
    if (kind === 'image' && !msg.mediaData) return;
    if (kind === 'voice' && !msg.audioData) return;

    setOpeningViewOnceMsgId(msg.id);
    setActiveViewOnceModal({
      kind,
      senderName: msg.senderName,
      mediaData: msg.mediaData,
      audioData: msg.audioData,
      durationSec: msg.audioDurationSec,
    });
    try {
      await openViewOnceMessage(activeChat.id, msg.id, currentUser.uid);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Unable to open view-once media.');
    } finally {
      setOpeningViewOnceMsgId(null);
    }
  };

  const handleMessageGroupMember = async (memberUid: string, fallbackMember: {
    uid: string;
    fullName: string;
    department: string;
    level: string;
    role: AppUser['role'];
    idNumber: string;
    userObj?: AppUser;
  }) => {
    if (memberUid === currentUser.uid || groupInfoDmBusyUid) return;
    const targetUser: AppUser = fallbackMember.userObj || {
      uid: fallbackMember.uid,
      fullName: fallbackMember.fullName,
      department: fallbackMember.department,
      level: (fallbackMember.level as AcademicLevel) || '100',
      idNumber: fallbackMember.idNumber || '',
      idNumberNormalized: normalizeIdNumber(fallbackMember.idNumber || ''),
      accountType: fallbackMember.role === 'lecturer' || fallbackMember.level === 'Staff' ? 'staff' : 'student',
      role: fallbackMember.role,
      status: 'approved',
      email: '',
      createdAt: null,
    };
    setGroupInfoDmBusyUid(memberUid);
    try {
      const dmId = await openOrCreateDmChat(currentUser, targetUser);
      setGroupInfoOpen(false);
      onSelectChat(dmId);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Could not open direct message.');
    } finally {
      setGroupInfoDmBusyUid(null);
    }
  };

  const renderChatRow = (chat: ChatThread) => {
    const isSelected = chat.id === activeChatId;
    const isPinned = pinnedChatSet.has(chat.id);
    const title = getChatDisplayTitle(chat);
    const peer = getDmPeer(chat);
    const isGroup = chat.type !== 'dm';
    const unread = unreadCounts[chat.id] || 0;
    const peerOnline = peer ? isMemberOnline(peer) : false;

    return (
      <div
        key={chat.id}
        className={`w-full min-h-[68px] rounded-2xl transition-colors flex items-center gap-1 pr-2 border ${
          isSelected
            ? 'bg-brand-subtle/90 dark:bg-brand-subtle/50 border-success-line dark:border-success-line/80'
            : unread > 0
              ? 'bg-white dark:bg-surface border-success-line/80 dark:border-success-line/70 hover:border-success-line dark:hover:border-brand'
              : 'bg-white dark:bg-surface border-line/80 dark:border-line hover:border-line'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectChat(chat.id)}
          className="flex-1 min-w-0 text-left p-3.5 pr-1 flex items-center gap-3.5 cursor-pointer"
        >
          {isGroup ? (
            <div
              className={`relative w-11 h-11 rounded-2xl shrink-0 flex items-center justify-center font-semibold text-sm ${
                chat.type === 'general'
                  ? 'bg-brand text-on-brand'
                  : chat.type === 'department'
                    ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand'
                    : 'bg-success-bg dark:bg-success-bg/60 text-success dark:text-success-line border border-success-line/70 dark:border-success/70'
              }`}
            >
              <Users className="w-5 h-5" />
            </div>
          ) : (
            <div className="relative shrink-0">
              <UserAvatar
                name={title}
                photoURL={peer?.photoURL}
                avatarId={peer?.avatarId}
                size="lg"
                roundedClass="rounded-2xl"
                fallbackClassName="bg-sunken text-ink-soft"
              />
              {peer && (
                <span
                  title={peerOnline ? 'Online' : 'Offline'}
                  aria-label={peerOnline ? 'Online' : 'Offline'}
                  className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                    peerOnline ? 'bg-brand' : 'bg-sunken'
                  }`}
                />
              )}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-semibold text-sm text-ink truncate">
                  {title}
                </span>
                {peer && <RoleBadge role={peer.role} />}
                {isGroup && chat.radarStatus && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide shrink-0 inline-flex items-center gap-1 ${
                      chat.radarStatus === 'class_cancelled'
                        ? 'bg-danger-line dark:bg-danger-bg/70 text-danger'
                        : chat.radarStatus === 'venue_changed'
                          ? 'bg-warn-line dark:bg-warn-bg/70 text-warn'
                          : 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                    <span>LIVE</span>
                  </span>
                )}
              </div>
              <span
                className={`text-[11px] tabular-nums font-mono shrink-0 ${
                  unread > 0
                    ? 'text-brand font-semibold'
                    : 'text-ink-muted'
                }`}
              >
                {formatShortTime(chat.lastMessageAt)}
              </span>
            </div>

            {(peer?.department || (peer?.idNumber && canViewMemberIdNumber(currentUser, peer.uid)) || chat.department) && (
              <p className="text-[11px] text-ink-muted truncate mt-0.5">
                {peer ? (
                  <>
                    <span>{peer.department}</span>
                    {peer.idNumber && canViewMemberIdNumber(currentUser, peer.uid) && (
                      <>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{peer.idNumber}</span>
                      </>
                    )}
                  </>
                ) : (
                  chat.department
                )}
              </p>
            )}

            <div className="flex items-center justify-between gap-2 mt-0.5">
              <p
                className={`text-xs truncate ${
                  unread > 0
                    ? 'text-ink font-semibold'
                    : 'text-ink-muted'
                }`}
              >
                {chat.type === 'dm' && peer && isBlockedBetweenUsers(currentUser, peer)
                  ? 'Conversation blocked'
                  : chat.lastMessageText || 'No messages yet'}
              </p>
              {unread > 0 && (
                <span
                  aria-label={`${unread} unread messages`}
                  className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand text-on-brand text-[11px] font-bold font-mono tabular-nums flex items-center justify-center shrink-0"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={(e) => handleTogglePinChat(chat.id, e)}
          disabled={pinningChatId === chat.id}
          aria-label={isPinned ? `Unpin ${title}` : `Pin ${title}`}
          title={isPinned ? 'Unpin chat' : 'Pin chat to top (max 3)'}
          className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-xl shrink-0 inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50 ${
            isPinned
              ? 'text-brand bg-brand-subtle dark:bg-brand-subtle/60 hover:bg-brand-subtle dark:hover:bg-brand-subtle/70'
              : 'text-ink-muted hover:text-ink-soft hover:bg-sunken'
          }`}
        >
          <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-current' : ''}`} />
        </button>
      </div>
    );
  };

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 min-w-0">
      {/* Left column: Chat list / Updates switcher (hidden on mobile when a chat is active) */}
      <div
        className={`lg:col-span-4 flex flex-col gap-3 min-w-0 ${
          activeChat ? 'hidden lg:flex' : 'flex'
        }`}
      >
        {/* Top Segmented Switcher: Chats | Updates */}
        <div className="flex items-center gap-1 p-1 bg-sunken/75 dark:bg-sunken/90 rounded-2xl">
          <button
            type="button"
            onClick={() => setSidebarMode('chats')}
            className={`flex-1 min-h-[40px] px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              sidebarMode === 'chats'
                ? 'bg-white dark:bg-surface text-ink shadow-resting'
                : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chats</span>
          </button>
          <button
            type="button"
            onClick={() => setSidebarMode('updates')}
            className={`flex-1 min-h-[40px] px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
              sidebarMode === 'updates'
                ? 'bg-white dark:bg-surface text-ink shadow-resting'
                : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Updates</span>
            {unviewedStatusCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold font-mono flex items-center justify-center tabular-nums">
                {unviewedStatusCount > 99 ? '99+' : unviewedStatusCount}
              </span>
            )}
          </button>
        </div>

        {sidebarMode === 'updates' ? (
          <div className="flex-1 bg-surface rounded-3xl border border-line/80 dark:border-line overflow-hidden min-h-[420px]">
            <React.Suspense
              fallback={
                <div className="py-12 text-center text-xs text-ink-muted">
                  Loading updates...
                </div>
              }
            >
              <LazyStatusView
                currentUser={currentUser}
                statuses={statuses}
                approvedUsers={approvedUsers}
                nowMs={nowMs}
                onReplyInDm={(dmId) => {
                  setSidebarMode('chats');
                  onSelectChat(dmId);
                }}
              />
            </React.Suspense>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, dept, or matric/ID..."
                  aria-label="Search chats by name, department, or matric number"
                  className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl border border-line/80 dark:border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-focus/15"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear chat search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink-soft hover:bg-sunken cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setStarredModalOpen(true)}
                aria-label={`Starred Messages (${starredMessages.length})`}
                title="View Starred Messages"
                className="min-h-[44px] px-3 rounded-2xl border border-line/80 dark:border-line bg-surface hover:border-warn hover:border-warn text-ink-soft inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
              >
                <Star
                  className={`w-4 h-4 ${
                    starredMessages.length > 0
                      ? 'text-warn fill-current'
                      : 'text-ink-muted'
                  }`}
                />
                {starredMessages.length > 0 && (
                  <span className="text-xs font-bold font-mono tabular-nums">
                    {starredMessages.length}
                  </span>
                )}
              </button>
            </div>

            {chatPinNotice && (
              <div className="rounded-xl bg-warn-bg dark:bg-warn-bg/50 border border-warn-line dark:border-warn/70 px-3 py-2 text-xs text-warn dark:text-warn-line flex items-center justify-between gap-2">
                <span>{chatPinNotice}</span>
                <button
                  type="button"
                  onClick={() => setChatPinNotice(null)}
                  aria-label="Dismiss pin notice"
                  className="text-warn cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {trimmedSearch &&
            sortedChats.pinned.length === 0 &&
            sortedChats.groups.length === 0 &&
            sortedChats.dms.length === 0 ? (
              <div
                role="status"
                className="bg-surface rounded-2xl border border-line/80 dark:border-line p-8 text-center space-y-2.5"
              >
                <div className="w-11 h-11 rounded-2xl bg-sunken text-ink-muted flex items-center justify-center mx-auto">
                  <Search className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-ink">No results</h3>
                <p className="text-xs text-ink-muted max-w-xs mx-auto leading-relaxed">
                  No chats match &ldquo;{searchQuery.trim()}&rdquo; by name, department, or matric/ID number.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="mt-1 inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-sunken hover:bg-sunken text-ink-soft text-xs font-semibold transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              </div>
            ) : (
              <>
                {sortedChats.pinned.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-xs font-semibold text-brand tracking-wide inline-flex items-center gap-1.5">
                        <Pin className="w-3.5 h-3.5 fill-current" />
                        <span>Pinned ({sortedChats.pinned.length}/{MAX_PINNED_CHATS})</span>
                      </h2>
                    </div>
                    <div className="space-y-2">{sortedChats.pinned.map(renderChatRow)}</div>
                  </div>
                )}

                {(!trimmedSearch || sortedChats.groups.length > 0 || communitySections.length > 0) && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-xs font-semibold text-ink-muted tracking-wide">
                        Faculty & Dept Communities
                      </h2>
                      {currentUser.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => setCreateGroupOpen(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:text-brand min-h-[36px] px-2 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>New Group</span>
                        </button>
                      )}
                    </div>
                    {sortedChats.groups.length === 0 &&
                    sortedChats.pinned.every((c) => c.type === 'dm') ? (
                      <div className="bg-surface rounded-2xl border border-line/80 dark:border-line p-5 text-center space-y-2">
                        <Users className="w-6 h-6 text-brand/50 mx-auto" />
                        <p className="text-sm font-medium text-ink-soft">
                          {groupsReady ? 'Loading university groups...' : 'Setting up your groups...'}
                        </p>
                        <p className="text-xs text-ink-muted">
                          General and your {currentUser.department} cohort chats appear automatically once provisioned.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {communitySections.map((section) => {
                          const isCollapsed = !trimmedSearch && Boolean(collapsedCommunities[section.id]);
                          const sectionUnread = section.groups.reduce(
                            (sum, g) => sum + (unreadCounts[g.id] || 0),
                            0
                          );
                          return (
                            <div
                              key={section.id}
                              className="rounded-2xl border border-line/75 dark:border-line bg-sunken/70 dark:bg-surface/50 p-2 space-y-2"
                            >
                              <button
                                type="button"
                                onClick={() => toggleCommunityCollapsed(section.id)}
                                aria-expanded={!isCollapsed}
                                className="w-full px-2 py-1.5 rounded-xl flex items-center justify-between gap-2 text-left hover:bg-white/70 dark:hover:bg-sunken/70 transition-colors cursor-pointer"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <span className="w-8 h-8 rounded-xl bg-brand/10 dark:bg-brand-subtle/15 text-brand flex items-center justify-center shrink-0">
                                    <GraduationCap className="w-4 h-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-ink truncate">
                                      {section.title}
                                    </p>
                                    <p className="text-[11px] text-ink-muted truncate">
                                      {section.subtitle}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {isCollapsed && sectionUnread > 0 && (
                                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-on-brand text-[10px] font-bold font-mono flex items-center justify-center">
                                      {sectionUnread}
                                    </span>
                                  )}
                                  {isCollapsed ? (
                                    <ChevronRight className="w-4 h-4 text-ink-muted" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4 text-ink-muted" />
                                  )}
                                </div>
                              </button>

                              {!isCollapsed && (
                                <div className="space-y-1.5">
                                  {section.announcementScope && onOpenAnnouncements && (
                                    <button
                                      type="button"
                                      onClick={() => onOpenAnnouncements(section.announcementScope!)}
                                      className="w-full min-h-[54px] rounded-xl bg-surface border border-line/80 dark:border-line hover:border-success-line dark:hover:border-brand px-3 py-2 flex items-center gap-3 text-left transition-colors cursor-pointer"
                                    >
                                      <span className="w-9 h-9 rounded-xl bg-warn-line dark:bg-warn-bg/60 text-warn flex items-center justify-center shrink-0">
                                        <Megaphone className="w-4 h-4" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-semibold text-ink truncate">
                                          {section.announcementLabel || 'Announcements'}
                                        </p>
                                        <p className="text-[11px] text-ink-muted truncate">
                                          {section.announcementPreview}
                                        </p>
                                      </div>
                                      <ChevronRight className="w-4 h-4 text-ink-muted shrink-0" />
                                    </button>
                                  )}
                                  {section.groups.map(renderChatRow)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {(!trimmedSearch || sortedChats.dms.length > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <h2 className="text-xs font-semibold text-ink-muted tracking-wide">
                        Direct Messages
                      </h2>
                      <button
                        type="button"
                        onClick={onBrowsePeople}
                        className="text-xs font-semibold text-brand hover:text-brand min-h-[36px] px-2 cursor-pointer"
                      >
                        Find People
                      </button>
                    </div>
                    {sortedChats.dms.length === 0 &&
                    sortedChats.pinned.every((c) => c.type !== 'dm') ? (
                      <div className="bg-surface rounded-2xl border border-line/80 dark:border-line p-5 text-center space-y-2">
                        <MessageSquare className="w-6 h-6 text-slate-300 dark:text-slate-600 mx-auto" />
                        <p className="text-sm font-medium text-ink-soft">No private chats yet</p>
                        <p className="text-xs text-ink-muted">
                          Search approved students or staff in the People tab to start a 1-to-1 chat.
                        </p>
                        <button
                          type="button"
                          onClick={onBrowsePeople}
                          className="mt-1 inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-strong transition-colors cursor-pointer"
                        >
                          Browse People
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">{sortedChats.dms.map(renderChatRow)}</div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Right column: Active conversation */}
      <div
        className={`relative lg:col-span-8 flex flex-col min-w-0 bg-white dark:bg-surface rounded-3xl border border-line/80 dark:border-line shadow-resting overflow-hidden ${
          activeChat ? 'flex h-[calc(100dvh-7.5rem)] lg:h-[calc(100dvh-6.5rem)]' : 'hidden lg:flex lg:h-[calc(100dvh-6.5rem)]'
        }`}
      >
        {!activeChat ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-subtle dark:bg-brand-subtle/60 text-brand flex items-center justify-center mb-3">
              <MessageSquare className="w-7 h-7" />
            </div>
            <h3 className="text-base font-bold text-ink">Select a conversation</h3>
            <p className="text-sm text-ink-muted max-w-xs mt-1">
              Choose GSU General, your department cohort, or a direct message to begin chatting in real time.
            </p>
          </div>
        ) : (
          <>
            {/* Conversation Header */}
            <div className="px-3 sm:px-5 py-3 border-b border-line flex items-center justify-between gap-2 bg-white/95 dark:bg-surface/95 backdrop-blur-sm">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelectChat(null)}
                  aria-label="Back to chats"
                  className="lg:hidden min-w-[44px] min-h-[44px] -ml-1 rounded-xl flex items-center justify-center text-ink-body dark:text-ink-soft hover:bg-sunken cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeChat.type === 'dm') {
                      const peer = getDmPeer(activeChat);
                      if (peer) openUserProfile(peer.uid);
                    } else {
                      setGroupInfoOpen(true);
                    }
                  }}
                  className="min-w-0 flex-1 text-left flex items-center gap-2.5 cursor-pointer rounded-xl px-1.5 py-1 -mx-1.5 hover:bg-sunken dark:hover:bg-sunken/60 transition-colors"
                >
                  {activeChat.type === 'dm' && getDmPeer(activeChat) && (() => {
                    const peer = getDmPeer(activeChat)!;
                    const peerOnline = isMemberOnline(peer);
                    return (
                      <div className="relative shrink-0">
                        <UserAvatar
                          name={peer.fullName}
                          photoURL={peer.photoURL}
                          avatarId={peer.avatarId}
                          size="md"
                          roundedClass="rounded-2xl"
                          fallbackClassName="bg-sunken text-ink-soft"
                        />
                        <span
                          title={peerOnline ? 'Online' : 'Offline'}
                          aria-label={peerOnline ? 'Online' : 'Offline'}
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                            peerOnline ? 'bg-brand' : 'bg-sunken'
                          }`}
                        />
                      </div>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-sm sm:text-base font-bold text-ink truncate">
                        {getChatDisplayTitle(activeChat)}
                      </h2>
                      {activeChat.type === 'dm' && getDmPeer(activeChat) && (
                        <RoleBadge role={getDmPeer(activeChat)!.role} />
                      )}
                    </div>
                    <p className="text-xs text-ink-muted truncate flex items-center gap-1.5">
                      {activeChat.type === 'dm' && getDmPeer(activeChat) ? (
                        <>
                          <span
                            className={
                              isMemberOnline(getDmPeer(activeChat)!)
                                ? 'text-brand font-medium shrink-0'
                                : 'text-ink-muted shrink-0'
                            }
                          >
                            {isMemberOnline(getDmPeer(activeChat)!)
                              ? 'Online'
                              : 'Offline'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{getChatSubtitle(activeChat)}</span>
                        </>
                      ) : activeChat.accessKey !== 'invited' ? (
                        <>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              activeGroupOnlineCount > 0 ? 'bg-brand' : 'bg-sunken'
                            }`}
                          />
                          <span
                            className={
                              activeGroupOnlineCount > 0
                                ? 'text-brand font-medium shrink-0'
                                : 'text-ink-muted shrink-0'
                            }
                          >
                            {activeGroupOnlineCount} online
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{getChatSubtitle(activeChat)}</span>
                        </>
                      ) : (
                        <span className="truncate">{getChatSubtitle(activeChat)}</span>
                      )}
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setInChatSearchOpen((prev) => !prev);
                    setInChatSearchQuery('');
                  }}
                  aria-label="Search messages in this chat"
                  title="Search in conversation"
                  className={`min-w-[38px] min-h-[38px] rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer ${
                    inChatSearchOpen
                      ? 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand'
                      : 'text-ink-muted hover:bg-sunken hover:text-ink-soft'
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>

                {activeChat.type === 'dm' && getDmPeer(activeChat) && onStartVoiceCall && (
                  <button
                    type="button"
                    disabled={isDmBlocked}
                    onClick={() => {
                      const peer = getDmPeer(activeChat);
                      if (peer) {
                        Promise.resolve(onStartVoiceCall(peer)).catch((err) => {
                          setSendError(
                            err instanceof Error
                              ? err.message
                              : 'Unable to start voice call right now.'
                          );
                        });
                      }
                    }}
                    aria-label="Start voice call"
                    title={isDmBlocked ? 'Voice calls are disabled while blocked' : 'Voice call'}
                    className="min-w-[38px] min-h-[38px] rounded-xl inline-flex items-center justify-center text-info hover:bg-info-bg hover:bg-info-bg/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                  </button>
                )}

                {activeChat.type !== 'dm' && canBroadcastRadar && (
                  <button
                    type="button"
                    onClick={openRadarModal}
                    aria-label="Broadcast live class radar and exam countdown"
                    title="Live Class Radar & Exam Countdown"
                    className={`min-h-[38px] px-2.5 rounded-xl inline-flex items-center gap-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      activeChat.radarStatus
                        ? 'bg-brand text-on-brand hover:bg-brand-strong'
                        : 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand hover:bg-brand-subtle dark:hover:bg-brand-subtle/60'
                    }`}
                  >
                    <Radio className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Radar</span>
                  </button>
                )}

                {activeChat.type !== 'dm' && (
                  <button
                    type="button"
                    onClick={() => setGroupInfoOpen(true)}
                    aria-label="Group info, members, and shared media"
                    title="Group Info & Media Hub"
                    className="min-w-[38px] min-h-[38px] rounded-xl inline-flex items-center justify-center text-ink-muted hover:bg-sunken hover:text-ink-soft transition-colors cursor-pointer"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => handleTogglePinChat(activeChat.id, e)}
                  disabled={pinningChatId === activeChat.id}
                  aria-label={pinnedChatSet.has(activeChat.id) ? 'Unpin chat' : 'Pin chat'}
                  title={pinnedChatSet.has(activeChat.id) ? 'Unpin chat' : 'Pin chat'}
                  className={`min-w-[38px] min-h-[38px] rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer ${
                    pinnedChatSet.has(activeChat.id)
                      ? 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand'
                      : 'text-ink-muted hover:bg-sunken hover:text-ink-soft'
                  }`}
                >
                  <Pin
                    className={`w-4 h-4 ${pinnedChatSet.has(activeChat.id) ? 'fill-current' : ''}`}
                  />
                </button>

                {activeChat.type === 'dm' && (
                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockingBusy}
                    className={`min-h-[40px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer ${
                      iBlockedDm
                        ? 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand hover:bg-brand-subtle dark:hover:bg-brand-subtle/60'
                        : 'bg-danger-bg dark:bg-danger-bg/50 text-danger hover:bg-danger-line hover:bg-danger/60'
                    }`}
                  >
                    {iBlockedDm ? (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Unblock</span>
                      </>
                    ) : (
                      <>
                        <Ban className="w-4 h-4" />
                        <span>Block</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* In-Chat Keyword Search Bar */}
            {inChatSearchOpen && (
              <div className="shrink-0 px-3 sm:px-5 py-2 border-b border-line bg-sunken/90 dark:bg-surface/95 flex items-center gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    autoFocus
                    value={inChatSearchQuery}
                    onChange={(e) => setInChatSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        stepInChatSearch(e.shiftKey ? 1 : -1);
                      } else if (e.key === 'Escape') {
                        setInChatSearchOpen(false);
                        setInChatSearchQuery('');
                      }
                    }}
                    placeholder="Find keywords in this conversation..."
                    className="w-full min-h-[38px] pl-8 pr-3 rounded-xl border border-line bg-surface dark:bg-sunken text-xs text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                {trimmedInChatQuery && (
                  <span className="text-[11px] font-mono tabular-nums text-ink-muted shrink-0">
                    {inChatMatches.length > 0
                      ? `${inChatSearchActiveIdx + 1}/${inChatMatches.length}`
                      : '0 matches'}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={inChatMatches.length === 0}
                    onClick={() => stepInChatSearch(-1)}
                    aria-label="Previous match"
                    className="min-w-[34px] min-h-[34px] rounded-lg flex items-center justify-center text-ink-body dark:text-ink-soft hover:bg-sunken/70 dark:hover:bg-sunken disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={inChatMatches.length === 0}
                    onClick={() => stepInChatSearch(1)}
                    aria-label="Next match"
                    className="min-w-[34px] min-h-[34px] rounded-lg flex items-center justify-center text-ink-body dark:text-ink-soft hover:bg-sunken/70 dark:hover:bg-sunken disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInChatSearchOpen(false);
                      setInChatSearchQuery('');
                    }}
                    aria-label="Close in-chat search"
                    className="min-w-[34px] min-h-[34px] rounded-lg flex items-center justify-center text-ink-muted hover:bg-sunken/70 dark:hover:bg-sunken cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Live Class Radar & Exam Countdown Banner */}
            <LiveRadarBanner
              chat={activeChat}
              canBroadcastRadar={canBroadcastRadar}
              radarSaving={radarSaving}
              onEdit={openRadarModal}
              onClear={handleClearRadar}
            />

            {/* Sticky Pinned Group Message Banner */}
            {activeChat.type !== 'dm' && activeChat.pinnedMessageId && (
              <div className="shrink-0 px-3 sm:px-5 py-2 border-b border-success-line dark:border-success-line/50 bg-brand-subtle/75 dark:bg-brand-subtle/35 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => scrollToMessage(activeChat.pinnedMessageId!)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2.5 cursor-pointer group"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand/10 dark:bg-brand-subtle/15 text-brand flex items-center justify-center shrink-0">
                    <Pin className="w-3.5 h-3.5 fill-current" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-brand truncate">
                      Pinned · {activeChat.pinnedMessageSender || 'Announcement'}
                    </p>
                    <p className="text-xs text-ink-soft truncate group-hover:underline">
                      {activeChat.pinnedMessageText}
                    </p>
                  </div>
                </button>
                {['admin', 'classRep', 'lecturer'].includes(currentUser.role) && (
                  <button
                    type="button"
                    disabled={pinningMsgBusy}
                    onClick={handleUnpinBanner}
                    aria-label="Unpin group message"
                    title="Unpin message"
                    className="min-w-[34px] min-h-[34px] rounded-lg flex items-center justify-center text-ink-muted hover:text-danger hover:text-danger hover:bg-white/70 dark:hover:bg-sunken/70 transition-colors cursor-pointer shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {reportBanner && (
              <div className="mx-4 mt-3 rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 border border-success-line dark:border-success-line/70 px-3.5 py-2.5 text-xs text-brand flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-brand shrink-0" />
                <span>{reportBanner}</span>
              </div>
            )}

            {/* Messages Feed */}
            <div className="relative flex-1 min-h-0 flex flex-col">
              <div
                ref={feedContainerRef}
                onScroll={handleFeedScroll}
                className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3 bg-[#FAFBFB] dark:bg-canvas/60"
              >
              {loadingMessages ? (
                <div className="py-12 text-center text-xs text-ink-muted">
                  Loading messages...
                </div>
              ) : messages.length === 0 ? (
                <div className="py-12 text-center space-y-1">
                  <p className="text-sm font-medium text-ink-body dark:text-ink-soft">No messages yet</p>
                  <p className="text-xs text-ink-muted">
                    Say hello to start the conversation.
                  </p>
                </div>
              ) : (
                <>
                  {hasMoreOlderMessages && (
                    <div className="flex justify-center pb-2">
                      <button
                        type="button"
                        disabled={loadingOlderMessages}
                        onClick={async () => {
                          if (!chatRoomHandleRef.current || loadingOlderMessages) return;
                          setLoadingOlderMessages(true);
                          const container = feedContainerRef.current;
                          const prevScrollHeight = container?.scrollHeight ?? 0;
                          try {
                            await chatRoomHandleRef.current.loadOlderMessages();
                            window.requestAnimationFrame(() => {
                              if (container) {
                                const diff = container.scrollHeight - prevScrollHeight;
                                if (diff > 0) container.scrollTop += diff;
                              }
                            });
                          } catch (err) {
                            setSendError(
                              err instanceof Error
                                ? `Could not load older messages: ${err.message}`
                                : 'Could not load older messages. Check your connection and try again.'
                            );
                          } finally {
                            setLoadingOlderMessages(false);
                          }
                        }}
                        className="min-h-[34px] px-4 rounded-full bg-surface border border-line hover:border-brand text-xs font-semibold text-ink-soft shadow-resting transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {loadingOlderMessages ? 'Loading older...' : 'Load older messages'}
                      </button>
                    </div>
                  )}
                  {messages.map((msg, idx) => {
                  const isMine = msg.senderId === currentUser.uid;
                  const isMsgPending = pendingMessageIds.has(msg.id);
                  const msgMs = !isMsgPending ? msg.createdAt?.toMillis() ?? 0 : 0;
                  const msgDateMs = msg.createdAt?.toMillis() ?? 0;
                  const prevMsgDateMs = idx > 0 ? messages[idx - 1].createdAt?.toMillis() ?? 0 : 0;
                  const showDateDivider =
                    msgDateMs > 0 &&
                    (idx === 0 ||
                      prevMsgDateMs === 0 ||
                      new Date(msgDateMs).toDateString() !== new Date(prevMsgDateMs).toDateString());
                  const dateDividerNode = showDateDivider ? (
                    <div className="flex justify-center py-1.5">
                      <span className="px-3 py-1 rounded-full bg-sunken/75 dark:bg-sunken/90 text-[11px] font-semibold text-ink-body dark:text-ink-soft shadow-resting">
                        {formatDateDividerLabel(msgDateMs)}
                      </span>
                    </div>
                  ) : null;

                  if (msg.messageType === 'call') {
                    const isMissedOrDeclined =
                      msg.callOutcome === 'missed' ||
                      msg.callOutcome === 'declined' ||
                      msg.callOutcome === 'cancelled';
                    const isCallHighlighted = highlightedMsgId === msg.id;
                    return (
                      <React.Fragment key={msg.id}>
                        {dateDividerNode}
                        <div
                          ref={(el) => {
                            msgRefs.current[msg.id] = el;
                          }}
                          className={`flex justify-center py-1 rounded-2xl transition-colors duration-500 ${
                            isCallHighlighted
                              ? 'bg-brand/15 dark:bg-brand/20 ring-2 ring-success/40'
                              : ''
                          }`}
                        >
                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-line/80 dark:border-line shadow-resting text-xs">
                          {isMissedOrDeclined ? (
                            <PhoneMissed className="w-3.5 h-3.5 text-danger shrink-0" />
                          ) : (
                            <PhoneCall className="w-3.5 h-3.5 text-brand shrink-0" />
                          )}
                          <span
                            className={`font-medium ${
                              isMissedOrDeclined
                                ? 'text-danger'
                                : 'text-ink-soft'
                            }`}
                          >
                            {renderHighlightedText(msg.text)}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-ink-muted">
                            · {formatShortTime(msg.createdAt)}
                          </span>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  }

                  const msgReaders =
                    msgMs > 0
                      ? readReceipts
                          .filter((r) => {
                            if (r.uid === currentUser.uid) return false;
                            if (r.uid === msg.senderId) return false;
                            return (r.lastReadAt?.toMillis() ?? 0) >= msgMs;
                          })
                          .map((r) => ({
                            uid: r.uid,
                            fullName: userMap.get(r.uid)?.fullName || r.fullName,
                            lastReadAt: r.lastReadAt,
                          }))
                      : [];

                  const showReceiptRow = !isMsgPending && (isMine || msgReaders.length > 0);
                  const isExpanded = expandedReceiptMsgId === msg.id;
                  const seenSummary =
                    msgReaders.length === 1
                      ? `Read by ${msgReaders[0].fullName}`
                      : msgReaders.length === 2
                        ? `Read by ${msgReaders[0].fullName} and ${msgReaders[1].fullName}`
                        : msgReaders.length > 2
                          ? `Read by ${msgReaders[0].fullName}, ${msgReaders[1].fullName} +${msgReaders.length - 2}`
                          : '';

                  const reactionsMap = msg.reactions || {};
                  const myReaction = reactionsMap[currentUser.uid] || null;
                  const isDeleted = Boolean(msg.deletedAt);
                  const isPickerOpen =
                    reactionPickerMsgId === msg.id && !isMsgPending && !isDmBlocked && !isDeleted;
                  const isMoreOpen = moreMenuMsgId === msg.id && !isMsgPending && !isDeleted;
                  const isStarred = starredIdSet.has(msg.id);
                  const isPinnedMsg =
                    activeChat.type !== 'dm' && activeChat.pinnedMessageId === msg.id;
                  const isHighlighted = highlightedMsgId === msg.id;
                  const canEditMsg =
                    !isDeleted &&
                    !isMsgPending &&
                    isMine &&
                    (!msg.messageType || msg.messageType === 'text') &&
                    msgMs > 0 &&
                    Date.now() - msgMs <= MESSAGE_EDIT_WINDOW_MS;
                  // Launch decision (2026-11-17): delete-for-everyone is
                  // sender-or-admin only; the RPC enforces the same.
                  const canDeleteMsg =
                    !isDeleted &&
                    !isMsgPending &&
                    !isDmBlocked &&
                    (isMine || currentUser.role === 'admin');
                  const canPinMsg =
                    !isDeleted &&
                    !isMsgPending &&
                    activeChat.type !== 'dm' &&
                    ['admin', 'classRep', 'lecturer'].includes(currentUser.role);
                  const dragOffset = swipeOffset?.msgId === msg.id ? swipeOffset.x : 0;

                  const groupedReactions = (() => {
                    const counts = new Map<
                      string,
                      { emoji: string; count: number; users: string[]; reactedByMe: boolean }
                    >();
                    for (const [uid, emoji] of Object.entries(reactionsMap)) {
                      if (!emoji) continue;
                      const existing = counts.get(emoji);
                      const displayName =
                        uid === currentUser.uid
                          ? 'You'
                          : userMap.get(uid)?.fullName || 'GSU Member';
                      if (existing) {
                        existing.count += 1;
                        existing.users.push(displayName);
                        if (uid === currentUser.uid) existing.reactedByMe = true;
                      } else {
                        counts.set(emoji, {
                          emoji,
                          count: 1,
                          users: [displayName],
                          reactedByMe: uid === currentUser.uid,
                        });
                      }
                    }
                    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
                  })();

                  return (
                    <React.Fragment key={msg.id}>
                      {dateDividerNode}
                    <div
                      ref={(el) => {
                        msgRefs.current[msg.id] = el;
                      }}
                      className={`flex flex-col rounded-2xl transition-colors duration-500 ${
                        isMine ? 'items-end' : 'items-start'
                      } ${
                        isHighlighted
                          ? 'bg-brand/15 dark:bg-brand/20 ring-2 ring-success/40 p-1.5 -mx-1.5'
                          : ''
                      }`}
                    >
                      <div
                        className={`flex items-start gap-2 ${
                          !isMine && activeChat.type !== 'dm'
                            ? 'max-w-[90%] sm:max-w-[78%]'
                            : 'max-w-[85%] sm:max-w-[75%]'
                        }`}
                      >
                        {!isMine && activeChat.type !== 'dm' && (() => {
                          const senderProfile = userMap.get(msg.senderId);
                          const canOpenSender = Boolean(senderProfile);
                          return (
                            <button
                              type="button"
                              disabled={!canOpenSender}
                              onClick={() => canOpenSender && openUserProfile(msg.senderId)}
                              aria-label={canOpenSender ? `View ${msg.senderName}'s profile` : msg.senderName}
                              className={`mt-0.5 shrink-0 rounded-full focus:outline-none ${
                                canOpenSender ? 'cursor-pointer hover:opacity-90' : 'cursor-default'
                              }`}
                            >
                              <UserAvatar
                                name={senderProfile?.fullName || msg.senderName}
                                photoURL={senderProfile?.photoURL}
                                avatarId={senderProfile?.avatarId}
                                size="sm"
                                roundedClass="rounded-full"
                                fallbackClassName="bg-brand-subtle dark:bg-brand-subtle/70 text-brand"
                              />
                            </button>
                          );
                        })()}
                      <div className="relative min-w-0 flex-1">
                        {dragOffset > 14 && (
                          <div
                            aria-hidden="true"
                            className="absolute -left-9 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-brand-subtle dark:bg-brand-subtle/70 text-brand flex items-center justify-center shadow-resting"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </div>
                        )}

                        {isPickerOpen && (
                          <div
                            data-reaction-area="true"
                            role="toolbar"
                            aria-label="Choose a reaction"
                            className={`absolute z-20 ${
                              idx === 0 ? 'top-full mt-1.5' : '-top-12'
                            } ${
                              isMine ? 'right-0' : 'left-0'
                            } bg-white dark:bg-sunken border border-line dark:border-line rounded-2xl shadow-overlay px-1.5 py-1 flex items-center gap-0.5`}
                          >
                            {MESSAGE_REACTIONS.map(({ emoji, label }) => {
                              const selected = myReaction === emoji;
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  data-reaction-area="true"
                                  onClick={() => handleToggleReaction(msg.id, emoji)}
                                  title={selected ? `Remove ${label}` : label}
                                  aria-label={selected ? `Remove ${label} reaction` : `React with ${label}`}
                                  aria-pressed={selected}
                                  className={`min-w-[36px] min-h-[36px] rounded-xl text-lg flex items-center justify-center transition-transform hover:scale-115 active:scale-95 cursor-pointer ${
                                    selected
                                      ? 'bg-brand-subtle dark:bg-brand-subtle/70 ring-1 ring-success'
                                      : 'hover:bg-sunken'
                                  }`}
                                >
                                  {emoji}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <div
                          style={
                            dragOffset > 0
                              ? { transform: `translateX(${dragOffset}px)`, transition: 'none' }
                              : { transition: 'transform 180ms ease-out' }
                          }
                          onTouchStart={
                            !isMsgPending && !isDmBlocked && !isDeleted
                              ? (e) => {
                                  startLongPress(msg.id);
                                  if (e.touches.length === 1) {
                                    swipeStartRef.current = {
                                      msgId: msg.id,
                                      x: e.touches[0].clientX,
                                      y: e.touches[0].clientY,
                                    };
                                  }
                                }
                              : undefined
                          }
                          onTouchMove={(e) => {
                            const start = swipeStartRef.current;
                            if (!start || start.msgId !== msg.id || e.touches.length !== 1) {
                              clearLongPressTimer();
                              return;
                            }
                            const dx = e.touches[0].clientX - start.x;
                            const dy = Math.abs(e.touches[0].clientY - start.y);
                            if (Math.abs(dx) > 8 || dy > 8) {
                              clearLongPressTimer();
                            }
                            if (dy < 28 && dx > 10) {
                              setSwipeOffset({ msgId: msg.id, x: Math.min(72, dx) });
                            }
                          }}
                          onTouchEnd={() => {
                            clearLongPressTimer();
                            if (swipeOffset?.msgId === msg.id && swipeOffset.x >= 48) {
                              startReplyToMessage(msg);
                            }
                            swipeStartRef.current = null;
                            setSwipeOffset(null);
                          }}
                          onTouchCancel={() => {
                            clearLongPressTimer();
                            swipeStartRef.current = null;
                            setSwipeOffset(null);
                          }}
                          className={`rounded-2xl px-3.5 py-2.5 shadow-resting select-text ${
                            isMine
                              ? 'bg-brand text-on-brand rounded-br-md'
                              : 'bg-white dark:bg-sunken border border-line/80 dark:border-line text-ink rounded-bl-md'
                          }`}
                        >
                          <div className="flex items-center flex-wrap gap-1.5 mb-1">
                            {isMine ? (
                              <span className="text-xs font-semibold text-success-bg">
                                You
                              </span>
                            ) : userMap.has(msg.senderId) ? (
                              <button
                                type="button"
                                onClick={() => openUserProfile(msg.senderId)}
                                className="text-xs font-semibold text-ink hover:underline cursor-pointer text-left"
                              >
                                {msg.senderName}
                              </button>
                            ) : (
                              <span className="text-xs font-semibold text-ink">
                                {msg.senderName}
                              </span>
                            )}
                            <RoleBadge
                              role={msg.senderRole}
                              showStudent={false}
                              inverted={isMine}
                            />
                            <span
                              className={`text-[11px] font-mono tabular-nums ${
                                isMine ? 'text-on-brand' : 'text-ink-muted'
                              }`}
                            >
                              {formatShortTime(msg.createdAt)}
                            </span>
                            {!isDeleted && msg.editedAt && (
                              <span
                                className={`text-[10px] italic ${
                                  isMine
                                    ? 'text-on-brand/85'
                                    : 'text-ink-muted'
                                }`}
                              >
                                · Edited
                              </span>
                            )}
                            {isPinnedMsg && !isDeleted && (
                              <Pin
                                aria-label="Pinned in group"
                                className={`w-3 h-3 ${
                                  isMine
                                    ? 'text-on-brand fill-current'
                                    : 'text-brand fill-current'
                                }`}
                              />
                            )}
                            {isStarred && !isDeleted && (
                              <Star
                                aria-label="Starred message"
                                className={`w-3 h-3 ${
                                  isMine
                                    ? 'text-warn fill-current'
                                    : 'text-warn fill-current'
                                }`}
                              />
                            )}
                            {isMine && isMsgPending && (
                              <span
                                title="Queued offline — will send automatically when reconnected"
                                className="inline-flex items-center gap-1 text-[10px] font-medium text-success-line/90"
                              >
                                <Clock className="w-3 h-3" />
                                <span>Queued</span>
                              </span>
                            )}
                          </div>

                          {!isDeleted && msg.replyToMessageId && (
                            <button
                              type="button"
                              onClick={() => scrollToMessage(msg.replyToMessageId!)}
                              className={`w-full text-left rounded-xl px-2.5 py-1.5 mb-2 border transition-colors cursor-pointer ${
                                isMine
                                  ? 'bg-black/15 hover:bg-black/25 border-white/20 text-on-brand'
                                  : 'bg-sunken/90 hover:bg-sunken/70 dark:bg-surface/70 dark:hover:bg-surface border-line/90 dark:border-line text-ink dark:text-ink-soft'
                              }`}
                            >
                              <div className="flex items-center gap-1 text-[11px] font-bold truncate">
                                <Reply className="w-3 h-3 shrink-0 opacity-80" />
                                <span className="truncate">
                                  {msg.replyToSenderName || 'Member'}
                                </span>
                              </div>
                              <p
                                className={`text-xs line-clamp-2 break-words mt-0.5 ${
                                  isMine
                                    ? 'text-on-brand/90'
                                    : 'text-ink-body dark:text-ink-soft'
                                }`}
                              >
                                {msg.replyToSnippet || 'Original message'}
                              </p>
                            </button>
                          )}

                          {isDeleted ? (
                            <p
                              className={`text-sm italic leading-relaxed ${
                                isMine
                                  ? 'text-on-brand/85'
                                  : 'text-ink-muted'
                              }`}
                            >
                              {DELETED_MESSAGE_PLACEHOLDER}
                            </p>
                          ) : msg.isViewOnce ? (
                            msg.viewOnceOpenedAt ? (
                              <div
                                className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-dashed text-xs italic ${
                                  isMine
                                    ? 'border-on-brand/40 text-on-brand/85'
                                    : 'border-line text-ink-muted'
                                }`}
                              >
                                <span className="w-5 h-5 rounded-full border border-dashed border-current flex items-center justify-center text-[10px] font-bold not-italic">
                                  1
                                </span>
                                <span>Opened</span>
                              </div>
                            ) : isMine ? (
                              <div
                                className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-black/15 border border-dashed border-white/30 text-white text-xs"
                              >
                                <span className="w-6 h-6 rounded-full border border-dashed border-white/80 flex items-center justify-center text-[11px] font-bold shrink-0">
                                  1
                                </span>
                                <div className="min-w-0">
                                  <p className="font-semibold">
                                    {msg.messageType === 'voice'
                                      ? 'View-once voice message'
                                      : 'View-once photo'}
                                  </p>
                                  <p className="text-[10px] text-success-line/80">
                                    Recipient can open once
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                disabled={isMsgPending || openingViewOnceMsgId === msg.id}
                                onClick={() => handleOpenViewOnce(msg)}
                                className="inline-flex items-center gap-2.5 px-3 py-2 rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 hover:bg-brand-subtle dark:hover:bg-brand-subtle/60 border border-dashed border-brand text-brand text-xs transition-colors cursor-pointer disabled:opacity-60"
                              >
                                <span className="w-6 h-6 rounded-full border-2 border-dashed border-brand text-brand flex items-center justify-center text-[11px] font-bold shrink-0">
                                  1
                                </span>
                                <div className="text-left min-w-0">
                                  <p className="font-bold flex items-center gap-1.5">
                                    {msg.messageType === 'voice' ? (
                                      <>
                                        <Volume2 className="w-3.5 h-3.5" />
                                        <span>Voice message</span>
                                      </>
                                    ) : (
                                      <>
                                        <ImageIcon className="w-3.5 h-3.5" />
                                        <span>Photo</span>
                                      </>
                                    )}
                                  </p>
                                  <p className="text-[10px] text-brand">
                                    Tap to open once
                                  </p>
                                </div>
                              </button>
                            )
                          ) : msg.messageType === 'voice' && msg.audioData ? (
                            <VoiceNotePlayer
                              src={msg.audioData}
                              durationSec={msg.audioDurationSec}
                              inverted={isMine}
                            />
                          ) : msg.messageType === 'image' && msg.mediaData ? (
                            <div className="space-y-2 pt-0.5 max-w-[280px] sm:max-w-[320px]">
                              <div className="relative group rounded-xl overflow-hidden bg-slate-950/20">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxImage({
                                      src: msg.mediaData!,
                                      fileName: msg.fileName || 'gsu-photo.jpg',
                                      caption:
                                        msg.text && msg.text !== `Photo: ${msg.fileName}`
                                          ? msg.text
                                          : undefined,
                                    })
                                  }
                                  className="block w-full text-left cursor-pointer"
                                  aria-label={`Preview ${msg.fileName || 'image'}`}
                                >
                                  <SignedChatImage
                                    src={msg.mediaData}
                                    alt={msg.fileName || 'Shared image'}
                                    className="w-full max-h-64 object-cover rounded-xl"
                                    loading="lazy"
                                  />
                                  <span
                                    aria-hidden="true"
                                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-950/60 text-white flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity"
                                  >
                                    <ZoomIn className="w-3.5 h-3.5" />
                                  </span>
                                </button>
                              </div>
                              {msg.text && msg.text !== `Photo: ${msg.fileName}` && (
                                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                  {renderHighlightedText(msg.text)}
                                </p>
                              )}
                              <div className="flex items-center justify-between gap-2 text-[11px]">
                                <span
                                  className={`truncate ${
                                    isMine
                                      ? 'text-on-brand/85'
                                      : 'text-ink-muted'
                                  }`}
                                >
                                  {formatFileSize(msg.fileSizeBytes || 0)}
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      const url = await getSignedChatFileUrl(msg.mediaData!);
                                      await downloadDataUrl(url, msg.fileName || 'gsu-photo.jpg');
                                    } catch (err) {
                                      setSendError(
                                        err instanceof Error ? err.message : 'Unable to save image.'
                                      );
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 font-semibold px-2 py-1 rounded-lg transition-colors shrink-0 cursor-pointer ${
                                    isMine
                                      ? 'bg-white/15 hover:bg-white/25 text-on-brand'
                                      : 'bg-sunken dark:bg-sunken/80 hover:bg-sunken text-ink-soft'
                                  }`}
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Save</span>
                                </button>
                              </div>
                            </div>
                          ) : msg.messageType === 'document' && msg.mediaData ? (
                            (() => {
                              const badge = getFileTypeBadge(msg.fileName || 'FILE', msg.mimeType);
                              const canPreview = Boolean(
                                getFilePreviewKind(msg.mimeType, msg.fileName, msg.mediaData)
                              );
                              return (
                                <div className="space-y-2 pt-0.5 min-w-[220px] max-w-[300px]">
                                  <div
                                    className={`rounded-xl p-2.5 flex items-center gap-2 border ${
                                      isMine
                                        ? 'bg-brand-strong/55 border-white/20'
                                        : 'bg-sunken dark:bg-surface/70 border-line'
                                    }`}
                                  >
                                    <div
                                      className={`w-10 h-10 rounded-lg shrink-0 flex flex-col items-center justify-center font-mono text-[10px] font-bold tracking-tight ${
                                        isMine
                                          ? 'bg-on-brand/20 text-on-brand'
                                          : 'bg-info-line dark:bg-info-bg/70 text-info'
                                      }`}
                                    >
                                      <FileText className="w-3.5 h-3.5 mb-0.5" />
                                      <span>{badge}</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-semibold leading-snug break-words line-clamp-2">
                                        {renderHighlightedText(msg.fileName || 'Document')}
                                      </p>
                                      <p
                                        className={`text-[11px] font-mono mt-0.5 ${
                                          isMine
                                            ? 'text-on-brand/85'
                                            : 'text-ink-muted'
                                        }`}
                                      >
                                        {badge} · {formatFileSize(msg.fileSizeBytes || 0)}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {canPreview && (
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            try {
                                              const signedUrl = await getSignedChatFileUrl(msg.mediaData!);
                                              setPreviewFile({
                                                fileName: msg.fileName || 'Document',
                                                mimeType: msg.mimeType,
                                                dataUrl: signedUrl,
                                                subtitle: `${badge} · ${formatFileSize(msg.fileSizeBytes || 0)}`,
                                              });
                                            } catch (err) {
                                              setSendError(
                                                err instanceof Error
                                                  ? err.message
                                                  : 'Unable to preview document.'
                                              );
                                            }
                                          }}
                                          aria-label={`Preview ${msg.fileName || 'document'}`}
                                          title="Preview file"
                                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                            isMine
                                              ? 'bg-white/15 hover:bg-white/25 text-on-brand'
                                              : 'bg-white dark:bg-sunken border border-line text-ink-soft hover:bg-sunken'
                                          }`}
                                        >
                                          <Eye className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          downloadChatDocument(
                                            msg.mediaData!,
                                            msg.fileName || 'document'
                                          ).catch((err) => {
                                            setSendError(
                                              err instanceof Error
                                                ? err.message
                                                : 'Unable to download document.'
                                            );
                                          });
                                        }}
                                        aria-label={`Download ${msg.fileName || 'document'}`}
                                        title="Download file"
                                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                                          isMine
                                            ? 'bg-white/15 hover:bg-white/25 text-on-brand'
                                            : 'bg-white dark:bg-sunken border border-line text-ink-soft hover:bg-sunken'
                                        }`}
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  {msg.text && msg.text !== `Document: ${msg.fileName}` && (
                                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                      {renderHighlightedText(msg.text)}
                                    </p>
                                  )}
                                </div>
                              );
                            })()
                          ) : msg.messageType === 'event' && msg.eventTitle ? (
                            <div
                              className={`min-w-[225px] max-w-[300px] rounded-xl p-3 space-y-2 border ${
                                isMine
                                  ? 'bg-brand-strong/50 border-white/20'
                                  : 'bg-warn-bg/70 dark:bg-warn-bg/30 border-warn-line/80 dark:border-warn/60'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div
                                  className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${
                                    isMine
                                      ? 'bg-on-brand/20 text-on-brand'
                                      : 'bg-warn-line dark:bg-warn/60 text-warn'
                                  }`}
                                >
                                  <CalendarDays className="w-4 h-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p
                                    className={`text-[10px] font-semibold uppercase tracking-wide ${
                                      isMine
                                        ? 'text-on-brand/90'
                                        : 'text-warn'
                                    }`}
                                  >
                                    Campus Event
                                  </p>
                                  <p className="text-sm font-bold leading-snug break-words">
                                    {msg.eventTitle}
                                  </p>
                                </div>
                              </div>
                              <div
                                className={`text-xs space-y-1 ${
                                  isMine
                                    ? 'text-on-brand/95'
                                    : 'text-ink-soft'
                                }`}
                              >
                                <p className="flex items-center gap-1.5 font-medium">
                                  <Clock className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                  <span>
                                    {msg.eventDate} · {msg.eventTime}
                                  </span>
                                </p>
                                {msg.eventVenue && (
                                  <p className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 shrink-0 opacity-80" />
                                    <span className="break-words">{msg.eventVenue}</span>
                                  </p>
                                )}
                                {msg.eventNotes && (
                                  <p
                                    className={`text-[11px] leading-relaxed pt-0.5 ${
                                      isMine
                                        ? 'text-on-brand/85'
                                        : 'text-ink-muted'
                                    }`}
                                  >
                                    {msg.eventNotes}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : msg.messageType === 'contact' && msg.contactName ? (
                            <div
                              className={`min-w-[225px] max-w-[300px] rounded-xl p-3 space-y-2.5 border ${
                                isMine
                                  ? 'bg-brand-strong/50 border-white/20'
                                  : 'bg-sunken dark:bg-surface/70 border-line'
                              }`}
                            >
                              <button
                                type="button"
                                disabled={!msg.contactUid || !userMap.has(msg.contactUid)}
                                onClick={() => {
                                  if (msg.contactUid && userMap.has(msg.contactUid)) {
                                    openUserProfile(msg.contactUid);
                                  }
                                }}
                                className={`w-full text-left flex items-center gap-2.5 ${
                                  msg.contactUid && userMap.has(msg.contactUid)
                                    ? 'cursor-pointer hover:opacity-90'
                                    : 'cursor-default'
                                }`}
                              >
                                <UserAvatar
                                  name={msg.contactName}
                                  photoURL={msg.contactUid ? userMap.get(msg.contactUid)?.photoURL : undefined}
                                  avatarId={msg.contactUid ? userMap.get(msg.contactUid)?.avatarId : undefined}
                                  size="md"
                                  roundedClass="rounded-full"
                                  fallbackClassName={
                                    isMine
                                      ? 'bg-on-brand/20 text-on-brand'
                                      : 'bg-info-line dark:bg-info-bg/70 text-info dark:text-info-line'
                                  }
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-bold leading-tight truncate">
                                      {msg.contactName}
                                    </p>
                                    {msg.contactRole && (
                                      <RoleBadge role={msg.contactRole} inverted={isMine} />
                                    )}
                                  </div>
                                  <p
                                    className={`text-[11px] truncate mt-0.5 ${
                                      isMine
                                        ? 'text-on-brand/85'
                                        : 'text-ink-muted'
                                    }`}
                                  >
                                    {msg.contactDepartment} ·{' '}
                                    {formatCompactLevelLabel(
                                      msg.contactLevel || '100',
                                      (msg.contactUid ? userMap.get(msg.contactUid)?.is_alumni : false) ||
                                        msg.contactLevel === 'Alumni'
                                    )}
                                  </p>
                                  {msg.contactIdNumber &&
                                    canViewMemberIdNumber(currentUser, msg.contactUid) && (
                                      <p
                                        className={`text-[10px] font-mono mt-0.5 ${
                                          isMine
                                            ? 'text-on-brand/85'
                                            : 'text-ink-muted'
                                        }`}
                                      >
                                        {msg.contactIdNumber}
                                      </p>
                                    )}
                                </div>
                              </button>
                              {msg.contactUid && msg.contactUid !== currentUser.uid && (
                                <button
                                  type="button"
                                  disabled={openingContactDmUid === msg.id}
                                  onClick={() => handleMessageSharedContact(msg)}
                                  className={`w-full min-h-[36px] rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${
                                    isMine
                                      ? 'bg-on-brand/20 hover:bg-white/30 text-on-brand'
                                      : 'bg-brand hover:bg-brand-strong text-on-brand'
                                  }`}
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                  <span>
                                    {openingContactDmUid === msg.id ? 'Opening...' : 'Message'}
                                  </span>
                                </button>
                              )}
                            </div>
                          ) : msg.messageType === 'poll' &&
                            msg.pollQuestion &&
                            Array.isArray(msg.pollOptions) ? (
                            (() => {
                              const votesMap = msg.pollVotes || {};
                              const myVote = votesMap[currentUser.uid];
                              const optionCounts = msg.pollOptions.map(() => 0);
                              let totalVotes = 0;
                              for (const choice of Object.values(votesMap)) {
                                if (
                                  typeof choice === 'number' &&
                                  choice >= 0 &&
                                  choice < optionCounts.length
                                ) {
                                  optionCounts[choice] += 1;
                                  totalVotes += 1;
                                }
                              }

                              return (
                                <div className="min-w-[230px] sm:min-w-[270px] space-y-2.5 pt-0.5">
                                  <div className="flex items-start gap-2">
                                    <BarChart3
                                      className={`w-4 h-4 mt-0.5 shrink-0 ${
                                        isMine
                                          ? 'text-on-brand'
                                          : 'text-brand'
                                      }`}
                                    />
                                    <p className="text-sm font-bold leading-snug break-words">
                                      {msg.pollQuestion}
                                    </p>
                                  </div>

                                  <div className="space-y-1.5">
                                    {msg.pollOptions.map((optionLabel, optIdx) => {
                                      const count = optionCounts[optIdx] || 0;
                                      const pct =
                                        totalVotes > 0
                                          ? Math.round((count / totalVotes) * 100)
                                          : 0;
                                      const isSelected = myVote === optIdx;

                                      return (
                                        <button
                                          key={optIdx}
                                          type="button"
                                          disabled={isMsgPending || votingMsgId === msg.id}
                                          onClick={() => handleVotePoll(msg, optIdx)}
                                          aria-pressed={isSelected}
                                          className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer disabled:cursor-default ${
                                            isMine
                                              ? isSelected
                                                ? 'border-white/80 bg-white/20 text-white'
                                                : 'border-white/25 bg-brand-strong/40 hover:bg-brand-strong/60 text-on-brand'
                                              : isSelected
                                                ? 'border-brand bg-brand-subtle/70 dark:bg-brand-subtle/40 text-ink'
                                                : 'border-line bg-sunken/70 dark:bg-surface/50 hover:border-line text-ink dark:text-ink-soft'
                                          }`}
                                        >
                                          <div
                                            aria-hidden="true"
                                            style={{ width: `${pct}%` }}
                                            className={`absolute inset-y-0 left-0 transition-all duration-300 ${
                                              isMine
                                                ? isSelected
                                                  ? 'bg-white/25'
                                                  : 'bg-white/15'
                                                : isSelected
                                                  ? 'bg-brand/20 dark:bg-brand/25'
                                                  : 'bg-sunken/70 dark:bg-sunken/50'
                                            }`}
                                          />
                                          <div className="relative flex items-center justify-between gap-2 text-xs">
                                            <span className="flex items-center gap-1.5 font-medium min-w-0">
                                              {isSelected && (
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                              )}
                                              <span className="break-words">{optionLabel}</span>
                                            </span>
                                            <span className="font-mono tabular-nums text-[11px] font-semibold shrink-0">
                                              {pct}% ({count})
                                            </span>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  <p
                                    className={`text-[11px] ${
                                      isMine
                                        ? 'text-on-brand/85'
                                        : 'text-ink-muted'
                                    }`}
                                  >
                                    {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                                    {myVote !== undefined
                                      ? ' · You voted'
                                      : ' · Tap an option to vote'}
                                  </p>
                                </div>
                              );
                            })()
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                              {renderHighlightedText(msg.text)}
                            </p>
                          )}

                          {!isDeleted && (
                            <div className="mt-1.5 flex items-center justify-end gap-1 flex-wrap relative">
                              {!isMsgPending && !isDmBlocked && (
                                <button
                                  type="button"
                                  onClick={() => startReplyToMessage(msg)}
                                  title="Reply to message"
                                  aria-label="Reply to message"
                                  className={`inline-flex items-center gap-1 text-[11px] py-0.5 px-1.5 rounded-md transition-colors cursor-pointer ${
                                    isMine
                                      ? 'text-on-brand/85 hover:text-on-brand hover:bg-on-brand/10'
                                      : 'text-ink-muted hover:text-brand hover:bg-brand-subtle dark:hover:bg-brand-subtle/40'
                                  }`}
                                >
                                  <Reply className="w-3 h-3" />
                                  <span>Reply</span>
                                </button>
                              )}

                              {!isMsgPending && !msg.isViewOnce && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStarMessage(msg)}
                                  disabled={starringMsgId === msg.id}
                                  title={isStarred ? 'Unstar message' : 'Star message'}
                                  aria-label={isStarred ? 'Unstar message' : 'Star message'}
                                  className={`inline-flex items-center gap-1 text-[11px] py-0.5 px-1.5 rounded-md transition-colors cursor-pointer ${
                                    isStarred
                                      ? isMine
                                        ? 'text-warn bg-white/10'
                                        : 'text-warn bg-warn-bg dark:bg-warn-bg/40'
                                      : isMine
                                        ? 'text-on-brand/85 hover:text-on-brand hover:bg-on-brand/10'
                                        : 'text-ink-muted hover:text-warn hover:text-warn hover:bg-warn-bg hover:bg-warn-bg/40'
                                  }`}
                                >
                                  <Star className={`w-3 h-3 ${isStarred ? 'fill-current' : ''}`} />
                                </button>
                              )}

                              {!isMsgPending && !isDmBlocked && (
                                <button
                                  type="button"
                                  data-reaction-area="true"
                                  onClick={() =>
                                    setReactionPickerMsgId((prev) =>
                                      prev === msg.id ? null : msg.id
                                    )
                                  }
                                  title="React to message"
                                  aria-label="React to message"
                                  aria-expanded={isPickerOpen}
                                  className={`inline-flex items-center gap-1 text-[11px] py-0.5 px-1.5 rounded-md transition-colors cursor-pointer ${
                                    isMine
                                      ? 'text-on-brand/85 hover:text-on-brand hover:bg-on-brand/10'
                                      : 'text-ink-muted hover:text-brand hover:bg-brand-subtle dark:hover:bg-brand-subtle/40'
                                  }`}
                                >
                                  <SmilePlus className="w-3 h-3" />
                                </button>
                              )}

                              {!isMsgPending && (
                                <div className="relative" data-msg-menu="true">
                                  <button
                                    type="button"
                                    data-msg-menu="true"
                                    onClick={() =>
                                      setMoreMenuMsgId((prev) =>
                                        prev === msg.id ? null : msg.id
                                      )
                                    }
                                    aria-label="Message options"
                                    aria-expanded={isMoreOpen}
                                    title="More actions"
                                    className={`inline-flex items-center justify-center py-0.5 px-1.5 rounded-md transition-colors cursor-pointer ${
                                      isMine
                                        ? 'text-on-brand/85 hover:text-on-brand hover:bg-on-brand/10'
                                        : 'text-ink-muted hover:text-ink-soft hover:bg-sunken'
                                    }`}
                                  >
                                    <MoreHorizontal className="w-3.5 h-3.5" />
                                  </button>

                                  {isMoreOpen && (
                                    <div
                                      data-msg-menu="true"
                                      role="menu"
                                      className={`absolute z-30 bottom-full mb-1.5 w-44 rounded-2xl bg-white dark:bg-surface border border-line dark:border-line shadow-overlay py-1.5 text-ink dark:text-ink ${
                                        isMine ? 'right-0' : 'left-0'
                                      }`}
                                    >
                                      {msg.text && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => handleCopyMessageText(msg)}
                                          className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-sunken flex items-center gap-2 cursor-pointer"
                                        >
                                          {copiedMsgId === msg.id ? (
                                            <>
                                              <Check className="w-3.5 h-3.5 text-brand" />
                                              <span className="text-brand">
                                                Copied!
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <Copy className="w-3.5 h-3.5 text-ink-muted" />
                                              <span>Copy text</span>
                                            </>
                                          )}
                                        </button>
                                      )}

                                      {canPinMsg && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          disabled={pinningMsgBusy}
                                          onClick={() => handleTogglePinMessageInGroup(msg)}
                                          className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-sunken flex items-center gap-2 cursor-pointer"
                                        >
                                          {isPinnedMsg ? (
                                            <>
                                              <PinOff className="w-3.5 h-3.5 text-ink-muted" />
                                              <span>Unpin from group</span>
                                            </>
                                          ) : (
                                            <>
                                              <Pin className="w-3.5 h-3.5 text-brand" />
                                              <span>Pin to group</span>
                                            </>
                                          )}
                                        </button>
                                      )}

                                      {canEditMsg && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => startEditMessage(msg)}
                                          className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-sunken flex items-center gap-2 cursor-pointer"
                                        >
                                          <Pencil className="w-3.5 h-3.5 text-ink-muted" />
                                          <span>Edit message</span>
                                        </button>
                                      )}

                                      {canDeleteMsg && (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          onClick={() => {
                                            setMoreMenuMsgId(null);
                                            setConfirmDeleteMsg(msg);
                                          }}
                                          className="w-full px-3 py-2 text-left text-xs font-medium text-danger hover:bg-danger-bg hover:bg-danger-bg/40 flex items-center gap-2 cursor-pointer"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                          <span>Delete for everyone</span>
                                        </button>
                                      )}

                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setMoreMenuMsgId(null);
                                          setReportingMessage(msg);
                                        }}
                                        className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-sunken flex items-center gap-2 cursor-pointer"
                                      >
                                        <Flag className="w-3.5 h-3.5 text-ink-muted" />
                                        <span>Report message</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      </div>

                      {!isDeleted && groupedReactions.length > 0 && (
                        <div
                          className={`mt-1 px-1 flex flex-wrap gap-1 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {groupedReactions.map((group) => (
                            <button
                              key={group.emoji}
                              type="button"
                              disabled={isMsgPending || isDmBlocked}
                              onClick={() =>
                                handleToggleReaction(msg.id, group.emoji)
                              }
                              title={`${group.users.join(', ')}`}
                              aria-label={`${group.emoji} ${group.count} (${group.users.join(', ')})`}
                              aria-pressed={group.reactedByMe}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                                isMsgPending || isDmBlocked
                                  ? 'cursor-default opacity-80'
                                  : 'cursor-pointer'
                              } ${
                                group.reactedByMe
                                  ? 'bg-brand-subtle dark:bg-brand-subtle/70 border-success-line dark:border-brand text-brand'
                                  : 'bg-white dark:bg-sunken border-line/90 dark:border-line text-ink-soft hover:border-line'
                              }`}
                            >
                              <span className="leading-none">{group.emoji}</span>
                              <span className="text-[11px] font-semibold tabular-nums">
                                {group.count}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}

                      {showReceiptRow && (
                        <div
                          className={`mt-1 px-1 flex flex-col ${
                            isMine ? 'items-end' : 'items-start'
                          }`}
                        >
                          {msgReaders.length > 0 ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedReceiptMsgId((prev) => (prev === msg.id ? null : msg.id))
                                }
                                aria-expanded={isExpanded}
                                title="View read receipt details"
                                className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink dark:hover:text-ink-soft cursor-pointer"
                              >
                                <CheckCheck className="w-3.5 h-3.5 text-brand shrink-0" />
                                <span>{seenSummary}</span>
                              </button>

                              {isExpanded && (
                                <div className="mt-1 max-w-xs rounded-xl bg-surface dark:bg-sunken border border-line/80 dark:border-line px-2.5 py-2 shadow-resting flex flex-wrap gap-1.5">
                                  {msgReaders.map((reader) => (
                                    <span
                                      key={reader.uid}
                                      className="inline-flex items-center gap-1 text-[11px] text-ink-soft bg-sunken dark:bg-sunken/80 rounded-md px-2 py-0.5"
                                    >
                                      <CheckCheck className="w-3 h-3 text-brand shrink-0" />
                                      <span>{reader.fullName}</span>
                                      {reader.lastReadAt && (
                                        <span className="text-[10px] font-mono text-ink-muted">
                                          · {formatShortTime(reader.lastReadAt)}
                                        </span>
                                      )}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                              <Check className="w-3.5 h-3.5 text-ink-muted shrink-0" />
                              <span>Sent</span>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    </React.Fragment>
                  );
                })}
                </>
              )}
              <div ref={messagesEndRef} />
              </div>

              {showScrollToBottom && (
                <button
                  type="button"
                  onClick={jumpToBottom}
                  aria-label="Scroll to latest messages"
                  className="absolute bottom-3 right-4 z-10 min-h-[38px] px-3 rounded-full bg-white/95 dark:bg-surface/95 border border-line shadow-overlay text-xs font-semibold text-ink hover:bg-sunken inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4 text-brand" />
                  <span>
                    {unseenBelowCount > 0
                      ? `${unseenBelowCount} new ${unseenBelowCount === 1 ? 'message' : 'messages'}`
                      : 'Latest'}
                  </span>
                </button>
              )}
            </div>

            {sendError && (
              <div className="mx-3 mb-2 rounded-xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 px-3 py-2 text-xs text-danger flex items-center justify-between gap-2">
                <span>{sendError}</span>
                <button
                  type="button"
                  onClick={() => setSendError(null)}
                  aria-label="Dismiss send error"
                  className="text-danger hover:text-danger hover:text-danger-line cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {!isDmBlocked && activeTypers.length > 0 && (
              <div
                aria-live="polite"
                className="px-4 py-1.5 bg-[#FAFBFB] dark:bg-canvas/60 border-t border-line/80 dark:border-line/70 flex items-center gap-2"
              >
                <span className="inline-flex items-center gap-0.5" aria-hidden="true">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand dark:bg-brand-subtle animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand dark:bg-brand-subtle animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-brand dark:bg-brand-subtle animate-bounce" />
                </span>
                <span className="text-xs font-medium text-brand truncate">
                  {typingSummary}
                </span>
              </div>
            )}

            {/* Hidden file inputs for Gallery & Document attachments */}
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              onChange={handleGalleryFileChange}
              className="hidden"
            />
            <input
              ref={documentInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={handleDocumentFileChange}
              className="hidden"
            />

            {/* WhatsApp-Style Attachment Drawer / Sheet */}
            {attachmentMenuOpen && !isDmBlocked && (
              <div
                data-attachment-area="true"
                className="relative z-30 border-t border-line/80 dark:border-line bg-slate-950/95 dark:bg-canvas text-slate-100 px-4 pt-2.5 pb-4 rounded-t-3xl shadow-overlay"
              >
                <div className="w-10 h-1 rounded-full bg-slate-700 mx-auto mb-3" />
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-semibold text-slate-300 tracking-wide">
                    Share to {getChatDisplayTitle(activeChat)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachmentMenuOpen(false)}
                    aria-label="Close attachment menu"
                    className="w-8 h-8 rounded-full flex items-center justify-center text-ink-muted hover:text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 max-w-lg mx-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      galleryInputRef.current?.click();
                    }}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-900/90 transition-colors cursor-pointer group"
                  >
                    <span className="w-13 h-13 rounded-full bg-gradient-to-br from-info to-fuchsia-600 text-white shadow-overlay shadow-violet-950/50 flex items-center justify-center group-active:scale-95 transition-transform">
                      <ImageIcon className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-medium text-slate-200">Gallery</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      documentInputRef.current?.click();
                    }}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-900/90 transition-colors cursor-pointer group"
                  >
                    <span className="w-13 h-13 rounded-full bg-gradient-to-br from-info to-blue-600 text-white shadow-overlay shadow-indigo-950/50 flex items-center justify-center group-active:scale-95 transition-transform">
                      <FileText className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-medium text-slate-200">Document</span>
                  </button>

                  {activeChat.type !== 'dm' && (
                    <button
                      type="button"
                      onClick={() => {
                        setAttachmentMenuOpen(false);
                        openPollCreator();
                      }}
                      className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-900/90 transition-colors cursor-pointer group"
                    >
                      <span className="w-13 h-13 rounded-full bg-gradient-to-br from-brand to-success text-white shadow-overlay shadow-emerald-950/50 flex items-center justify-center group-active:scale-95 transition-transform">
                        <BarChart3 className="w-5 h-5" />
                      </span>
                      <span className="text-xs font-medium text-slate-200">Poll</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={openEventCreator}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-900/90 transition-colors cursor-pointer group"
                  >
                    <span className="w-13 h-13 rounded-full bg-gradient-to-br from-warn to-orange-600 text-white shadow-overlay shadow-amber-950/50 flex items-center justify-center group-active:scale-95 transition-transform">
                      <CalendarDays className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-medium text-slate-200">Event</span>
                  </button>

                  <button
                    type="button"
                    onClick={openContactPicker}
                    className="flex flex-col items-center gap-1.5 py-2 rounded-2xl hover:bg-slate-900/90 transition-colors cursor-pointer group"
                  >
                    <span className="w-13 h-13 rounded-full bg-gradient-to-br from-info to-cyan-600 text-white shadow-overlay shadow-sky-950/50 flex items-center justify-center group-active:scale-95 transition-transform">
                      <Contact className="w-5 h-5" />
                    </span>
                    <span className="text-xs font-medium text-slate-200">Contact</span>
                  </button>
                </div>
              </div>
            )}

            {/* Quoted Reply Preview Bar / Active Edit Banner */}
            {!isDmBlocked && (replyingTo || editingMessage) && (
              <div className="px-3 sm:px-4 py-2 border-t border-line bg-sunken/90 dark:bg-sunken/70 flex items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span className="w-8 h-8 rounded-xl bg-brand-subtle dark:bg-brand-subtle/70 text-brand flex items-center justify-center shrink-0">
                    {editingMessage ? (
                      <Pencil className="w-4 h-4" />
                    ) : (
                      <Reply className="w-4 h-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-brand truncate">
                      {editingMessage
                        ? 'Editing message'
                        : `Replying to ${replyingTo!.senderName}`}
                    </p>
                    <p className="text-xs text-ink-body dark:text-ink-soft truncate">
                      {editingMessage
                        ? editingMessage.text
                        : getMessageSnippet(replyingTo!)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (editingMessage) {
                      setEditingMessage(null);
                      setDraft('');
                    } else {
                      setReplyingTo(null);
                    }
                  }}
                  aria-label={editingMessage ? 'Cancel editing message' : 'Cancel reply'}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken/70 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Message Input Bar */}
            {isDmBlocked ? (
              <div className="p-4 border-t border-line bg-sunken dark:bg-sunken/70 text-center space-y-2">
                <p className="text-xs font-medium text-ink-body dark:text-ink-soft">
                  {iBlockedDm
                    ? 'You blocked this conversation. Unblock to send messages again.'
                    : 'You cannot send messages in this conversation.'}
                </p>
                {iBlockedDm && (
                  <button
                    type="button"
                    onClick={handleToggleBlock}
                    disabled={blockingBusy}
                    className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-brand text-on-brand text-xs font-semibold hover:bg-brand-strong cursor-pointer"
                  >
                    Unblock User
                  </button>
                )}
              </div>
            ) : recordingPhase === 'recording' ? (
              <div className="p-2 sm:p-3 border-t border-line bg-surface flex items-center gap-1.5 w-full min-w-0">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  aria-label="Cancel voice recording"
                  title="Discard recording"
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-sunken hover:bg-danger-bg hover:bg-danger-bg/50 text-ink-body dark:text-ink-soft hover:text-danger hover:text-danger inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex-1 min-w-0 min-h-[42px] px-3 rounded-full border border-danger-line dark:border-danger/70 bg-danger-bg/70 dark:bg-danger-bg/30 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-danger min-w-0">
                    <span className="w-2 h-2 rounded-full bg-danger animate-pulse shrink-0" />
                    <span className="truncate">Recording</span>
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-danger shrink-0">
                    {formatAudioDuration(recordingSec)} / {formatAudioDuration(MAX_VOICE_NOTE_SECONDS)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={stopAndPreviewVoiceRecording}
                  aria-label="Stop recording to preview"
                  title="Stop & preview"
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-sunken hover:bg-sunken text-ink inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                </button>

                <button
                  type="button"
                  onClick={() => setViewOnceVoice((v) => !v)}
                  aria-pressed={viewOnceVoice}
                  aria-label="Toggle View Once voice message"
                  title={viewOnceVoice ? 'View Once enabled' : 'Enable View Once'}
                  className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full border-2 border-dashed inline-flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    viewOnceVoice
                      ? 'bg-brand border-brand text-on-brand'
                      : 'bg-sunken border-line text-ink-body dark:text-ink-soft hover:border-brand'
                  }`}
                >
                  1
                </button>

                <button
                  type="button"
                  onClick={sendVoiceRecordingNow}
                  disabled={sendingVoice}
                  aria-label="Send voice note"
                  title="Send voice note"
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-brand hover:bg-brand-strong disabled:opacity-40 text-on-brand inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : recordingPhase === 'preview' && recordedVoiceDraft ? (
              <div className="p-2 sm:p-3 border-t border-line bg-surface flex items-center gap-1.5 w-full min-w-0">
                <button
                  type="button"
                  onClick={cancelVoiceRecording}
                  disabled={sendingVoice}
                  aria-label="Discard voice note"
                  title="Discard voice note"
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-sunken hover:bg-danger-bg hover:bg-danger-bg/50 text-ink-body dark:text-ink-soft hover:text-danger hover:text-danger inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <div className="flex-1 min-w-0 px-2.5 py-1 rounded-full border border-line bg-sunken/80">
                  <VoiceNotePlayer
                    src={recordedVoiceDraft.previewUrl}
                    durationSec={recordedVoiceDraft.durationSec}
                    inverted={false}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setViewOnceVoice((v) => !v)}
                  aria-pressed={viewOnceVoice}
                  aria-label="Toggle View Once voice message"
                  title={viewOnceVoice ? 'View Once enabled' : 'Enable View Once'}
                  className={`w-10 h-10 min-w-[40px] min-h-[40px] rounded-full border-2 border-dashed inline-flex items-center justify-center text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    viewOnceVoice
                      ? 'bg-brand border-brand text-on-brand'
                      : 'bg-sunken border-line text-ink-body dark:text-ink-soft hover:border-brand'
                  }`}
                >
                  1
                </button>

                <button
                  type="button"
                  onClick={sendVoiceRecordingNow}
                  disabled={sendingVoice}
                  aria-label="Send voice note"
                  className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full bg-brand hover:bg-brand-strong disabled:opacity-40 text-on-brand inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSend}
                className="p-2.5 sm:p-3 border-t border-line bg-surface flex items-center gap-2 w-full min-w-0"
              >
                <div className="flex-1 min-w-0 min-h-[46px] pl-4 pr-1.5 rounded-full border border-line bg-sunken/80 dark:bg-sunken/90 focus-within:bg-white dark:focus-within:bg-sunken focus-within:border-brand focus-within:ring-2 focus-within:ring-focus/15 flex items-center gap-1 transition-colors">
                  <input
                    ref={composerInputRef}
                    type="text"
                    value={draft}
                    onChange={(e) => handleDraftChange(e.target.value)}
                    maxLength={2000}
                    placeholder={
                      editingMessage
                        ? 'Edit your message...'
                        : `Message ${getChatDisplayTitle(activeChat)}...`
                    }
                    className="flex-1 min-w-0 w-full bg-transparent py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none"
                  />
                  {!editingMessage && (
                    <button
                      type="button"
                      data-attachment-area="true"
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      aria-label="Open attachment menu"
                      aria-expanded={attachmentMenuOpen}
                      title="Attach media, file, poll, event, or contact"
                      className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full shrink-0 inline-flex items-center justify-center transition-colors cursor-pointer ${
                        attachmentMenuOpen
                          ? 'bg-brand-subtle dark:bg-brand-subtle/70 text-brand'
                          : 'text-ink-muted hover:text-brand hover:bg-sunken/70 dark:hover:bg-sunken/60'
                      }`}
                    >
                      <Paperclip className="w-4 h-4 -rotate-45" />
                    </button>
                  )}
                </div>

                {editingMessage ? (
                  <button
                    type="submit"
                    disabled={savingEdit || !draft.trim()}
                    aria-label="Save edited message"
                    title="Save edited message"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-brand hover:bg-brand-strong active:scale-95 disabled:opacity-50 text-on-brand inline-flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-resting"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                ) : draft.trim().length > 0 ? (
                  <button
                    type="submit"
                    aria-label="Send message"
                    title="Send message"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-brand hover:bg-brand-strong active:scale-95 text-on-brand inline-flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-resting"
                  >
                    <Send className="w-4 h-4 translate-x-[0.5px]" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentMenuOpen(false);
                      startVoiceRecording();
                    }}
                    disabled={sendingVoice}
                    aria-label="Record voice note"
                    title="Record voice note"
                    className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-brand hover:bg-brand-strong active:scale-95 disabled:opacity-40 text-on-brand inline-flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-resting"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </div>

      {/* Report Message Modal */}
      {reportingMessage && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-canvas/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">Report Message</h3>
              <button
                type="button"
                onClick={() => setReportingMessage(null)}
                aria-label="Close report dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl bg-sunken dark:bg-sunken/70 border border-line dark:border-line/80 p-3 text-xs text-ink-soft space-y-1">
              <p className="font-semibold text-ink">{reportingMessage.senderName}</p>
              <p className="line-clamp-3">{reportingMessage.text}</p>
            </div>

            <form onSubmit={handleSubmitReport} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Reason
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setReportReason(reason)}
                      className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium text-left transition-colors cursor-pointer ${
                        reportReason === reason
                          ? 'bg-brand-subtle dark:bg-brand-subtle/60 border-brand text-brand'
                          : 'bg-white dark:bg-sunken/70 border-line text-ink-body dark:text-ink-soft hover:border-line'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="reportDetails" className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Additional details (optional)
                </label>
                <textarea
                  id="reportDetails"
                  rows={2}
                  maxLength={500}
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Provide context for the moderation team..."
                  className="w-full p-3 rounded-xl border border-line bg-sunken/60 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReportingMessage(null)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="flex-1 min-h-[44px] rounded-xl bg-danger hover:bg-danger disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createGroupOpen && currentUser.role === 'admin' && (
        <CreateGroupModal
          currentUser={currentUser}
          departments={departments}
          approvedUsers={approvedUsers}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(chatId) => {
            setCreateGroupOpen(false);
            onSelectChat(chatId);
          }}
        />
      )}

      {/* Create Group Poll Modal */}
      {pollModalOpen && activeChat && activeChat.type !== 'dm' && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-canvas/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-brand" />
                <h3 className="text-base font-bold text-ink">
                  Create Group Poll
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPollModalOpen(false)}
                aria-label="Close poll dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pollFormError && (
              <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 p-3 text-xs text-danger">
                {pollFormError}
              </div>
            )}

            <form onSubmit={handleCreatePollSubmit} className="space-y-3.5">
              <div>
                <label
                  htmlFor="pollQuestionInput"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Question
                </label>
                <input
                  id="pollQuestionInput"
                  type="text"
                  required
                  maxLength={200}
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  placeholder="e.g., Preferred time for CHM 201 revision?"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-ink-soft">
                    Options (2–6)
                  </label>
                  {pollOptions.length < 6 && (
                    <button
                      type="button"
                      onClick={() => setPollOptions((prev) => [...prev, ''])}
                      className="text-xs font-semibold text-brand hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add option</span>
                    </button>
                  )}
                </div>

                {pollOptions.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      maxLength={100}
                      required={idx < 2}
                      value={opt}
                      onChange={(e) => {
                        const val = e.target.value;
                        setPollOptions((prev) =>
                          prev.map((item, i) => (i === idx ? val : item))
                        );
                      }}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                    />
                    {pollOptions.length > 2 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                        }
                        aria-label={`Remove option ${idx + 1}`}
                        className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:text-danger hover:text-danger hover:bg-danger-bg hover:bg-danger-bg/40 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPollModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingPoll}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {sendingPoll ? 'Posting...' : 'Post Poll'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Gallery Image Preview & Caption Modal */}
      {imageDraft && activeChat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md max-h-[92dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <ImageIcon className="w-5 h-5 text-info shrink-0" />
                <h3 className="text-base font-bold text-ink truncate">
                  Send Photo
                </h3>
              </div>
              <button
                type="button"
                onClick={clearImageDraft}
                aria-label="Cancel photo"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-72">
              <img
                src={imageDraft.previewUrl}
                alt={imageDraft.fileName}
                className="max-h-72 w-auto object-contain"
              />
            </div>

            <p className="text-xs text-ink-muted truncate font-mono">
              {imageDraft.fileName} · {formatFileSize(imageDraft.fileSizeBytes)}
            </p>

            <form onSubmit={handleSendImageDraft} className="space-y-3">
              {viewOncePhoto ? (
                <div className="px-3.5 py-2.5 rounded-xl bg-brand-subtle dark:bg-brand-subtle/50 border border-success-line dark:border-success-line/70 text-xs text-brand flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full border-2 border-dashed border-brand flex items-center justify-center text-[10px] font-bold shrink-0">
                    1
                  </span>
                  <span>View Once enabled — photo deletes permanently after opening once.</span>
                </div>
              ) : (
                <input
                  type="text"
                  maxLength={500}
                  value={mediaCaption}
                  onChange={(e) => setMediaCaption(e.target.value)}
                  placeholder="Add a caption (optional)..."
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearImageDraft}
                  className="min-h-[44px] px-4 rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setViewOncePhoto((v) => !v)}
                  aria-pressed={viewOncePhoto}
                  aria-label="Toggle View Once photo"
                  title={viewOncePhoto ? 'View Once enabled' : 'Send as View Once'}
                  className={`min-h-[44px] px-3 rounded-xl border-2 border-dashed inline-flex items-center gap-1.5 text-xs font-bold transition-colors cursor-pointer shrink-0 ${
                    viewOncePhoto
                      ? 'bg-brand border-brand text-on-brand'
                      : 'bg-sunken border-line text-ink-soft hover:border-brand'
                  }`}
                >
                  <span>1</span>
                  <span className="hidden sm:inline">Once</span>
                </button>
                <button
                  type="submit"
                  disabled={sendingMedia}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{sendingMedia ? 'Sending...' : viewOncePhoto ? 'Send Once' : 'Send Photo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Document Preview & Caption Modal */}
      {docDraft && activeChat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-info shrink-0" />
                <h3 className="text-base font-bold text-ink truncate">
                  Send Document
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDocDraft(null)}
                aria-label="Cancel document"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl border border-line bg-sunken dark:bg-sunken/80 p-3.5 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-info-line dark:bg-info-bg/70 text-info flex flex-col items-center justify-center font-mono text-[10px] font-bold shrink-0">
                <FileText className="w-4 h-4 mb-0.5" />
                <span>{getFileTypeBadge(docDraft.fileName, docDraft.mimeType)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink break-words">
                  {docDraft.fileName}
                </p>
                <p className="text-xs font-mono text-ink-muted mt-0.5">
                  {getFileTypeBadge(docDraft.fileName, docDraft.mimeType)} ·{' '}
                  {formatFileSize(docDraft.fileSizeBytes)}
                </p>
              </div>
            </div>

            <form onSubmit={handleSendDocDraft} className="space-y-3">
              <input
                type="text"
                maxLength={500}
                value={mediaCaption}
                onChange={(e) => setMediaCaption(e.target.value)}
                placeholder="Add a note about this file (optional)..."
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDocDraft(null)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingMedia}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{sendingMedia ? 'Sending...' : 'Send File'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Event / Reminder Modal */}
      {eventModalOpen && activeChat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-warn" />
                <h3 className="text-base font-bold text-ink">
                  Share Campus Event
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEventModalOpen(false)}
                aria-label="Close event dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {upcomingCalendarEvents.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-ink-body dark:text-ink-soft">
                  Quick-share upcoming campus timetable
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {upcomingCalendarEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      disabled={sendingEvent}
                      onClick={() => handleSendCalendarPresetEvent(ev)}
                      className="w-full text-left rounded-xl border border-line bg-sunken/70 hover:border-warn hover:border-warn px-3 py-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <p className="text-xs font-bold text-ink truncate">
                        {ev.title}
                      </p>
                      <p className="text-[11px] text-ink-muted truncate mt-0.5">
                        {ev.date} · {ev.startTime} · {ev.venue}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {eventFormError && (
              <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 p-3 text-xs text-danger">
                {eventFormError}
              </div>
            )}

            <form onSubmit={handleSendCustomEvent} className="space-y-3">
              <p className="text-xs font-semibold text-ink-body dark:text-ink-soft">
                Or compose an event reminder
              </p>
              <input
                type="text"
                required
                maxLength={140}
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
                placeholder="Event title (e.g., CHM 201 Tutorial)"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  required
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
                <input
                  type="text"
                  required
                  maxLength={30}
                  value={eventTime}
                  onChange={(e) => setEventTime(e.target.value)}
                  placeholder="Time (e.g., 10:00 AM)"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>
              <input
                type="text"
                required
                maxLength={100}
                value={eventVenue}
                onChange={(e) => setEventVenue(e.target.value)}
                placeholder="Venue (e.g., SLT Hall B, Tudun Wada)"
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
              />
              <textarea
                rows={2}
                maxLength={300}
                value={eventNotes}
                onChange={(e) => setEventNotes(e.target.value)}
                placeholder="Optional reminder notes..."
                className="w-full p-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEventModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEvent}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {sendingEvent ? 'Sharing...' : 'Share Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Share Verified GSU Contact Modal */}
      {contactModalOpen && activeChat && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-md max-h-[85dvh] flex flex-col bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-5 space-y-3 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Contact className="w-5 h-5 text-info" />
                <h3 className="text-base font-bold text-ink">
                  Share GSU Contact
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setContactModalOpen(false)}
                aria-label="Close contact picker"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search verified student or staff..."
                className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-line bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredContactCandidates.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink-muted">
                  No matching verified contacts found.
                </p>
              ) : (
                filteredContactCandidates.map((person) => (
                  <button
                    key={person.uid}
                    type="button"
                    disabled={sendingContact}
                    onClick={() => handleShareContact(person)}
                    className="w-full text-left rounded-2xl border border-line/80 dark:border-line hover:border-info hover:border-info bg-sunken/70 dark:bg-sunken/60 px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <UserAvatar
                      name={person.fullName}
                      photoURL={person.photoURL}
                      avatarId={person.avatarId}
                      size="md"
                      roundedClass="rounded-full"
                      fallbackClassName="bg-info-line dark:bg-info-bg/70 text-info dark:text-info-line"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-ink truncate">
                          {person.fullName}
                        </span>
                        <RoleBadge role={person.role} />
                      </div>
                      <p className="text-xs text-ink-muted truncate">
                        {person.department} ·{' '}
                        {formatCompactLevelLabel(person.level, person.is_alumni)}
                        {canViewMemberIdNumber(currentUser, person.uid) && person.idNumber && (
                          <>
                            {' · '}
                            <span className="font-mono">{person.idNumber}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <Send className="w-4 h-4 text-brand shrink-0" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Message for Everyone Confirmation Modal */}
      {confirmDeleteMsg && activeChat && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete message for everyone"
          className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-canvas/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full sm:max-w-sm bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-danger" />
                <h3 className="text-base font-bold text-ink">
                  Delete for Everyone?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConfirmDeleteMsg(null)}
                aria-label="Cancel delete"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-ink-body dark:text-ink-soft leading-relaxed">
              This will permanently remove the content of this message from{' '}
              <span className="font-semibold text-ink">
                {getChatDisplayTitle(activeChat)}
              </span>{' '}
              for all participants and replace it with &ldquo;{DELETED_MESSAGE_PLACEHOLDER}&rdquo;.
            </p>

            <div className="rounded-2xl bg-sunken dark:bg-sunken/70 border border-line dark:border-line/80 p-3 text-xs text-ink-soft space-y-1">
              <p className="font-semibold text-ink">
                {confirmDeleteMsg.senderId === currentUser.uid
                  ? 'You'
                  : confirmDeleteMsg.senderName}
              </p>
              <p className="line-clamp-3 break-words">
                {getMessageSnippet(confirmDeleteMsg)}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDeleteMsg(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingMsgBusy}
                onClick={handleConfirmDeleteMessage}
                className="flex-1 min-h-[44px] rounded-xl bg-danger hover:bg-danger disabled:opacity-60 text-white text-sm font-semibold cursor-pointer"
              >
                {deletingMsgBusy ? 'Deleting...' : 'Delete Message'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Starred Messages Modal */}
      {starredModalOpen && (
        <StarredMessagesModal
          starredMessages={starredMessages}
          onClose={() => setStarredModalOpen(false)}
          onUnstar={(messageId) => unstarMessageForUser(currentUser.uid, messageId)}
          onJumpToMessage={(chatId, messageId) => {
            setStarredModalOpen(false);
            if (chatId === activeChatId && !loadingMessages) {
              scrollToMessage(messageId);
            } else {
              setInternalJumpTarget({ chatId, messageId, nonce: Date.now() });
              onSelectChat(chatId);
            }
          }}
        />
      )}

      {/* Group Info & Media / Docs / Links Hub Drawer */}
      {groupInfoOpen && activeChat && activeChat.type !== 'dm' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Group info and shared media hub"
          onClick={() => setGroupInfoOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/55 dark:bg-canvas/80 backdrop-blur-xs flex justify-end"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md h-full bg-surface border-l border-line shadow-overlay flex flex-col"
          >
            <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-brand text-on-brand flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-ink truncate">
                    {getChatDisplayTitle(activeChat)}
                  </h3>
                  <p className="text-xs text-ink-muted truncate">
                    {getChatSubtitle(activeChat)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGroupInfoOpen(false)}
                aria-label="Close group info"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Hub Tabs */}
            <div className="px-4 py-2.5 border-b border-line grid grid-cols-4 gap-1 bg-sunken/70 dark:bg-canvas/40">
              {(
                [
                  { id: 'members', label: 'Members', count: groupInfoMembers.length },
                  { id: 'media', label: 'Media', count: groupHubData.mediaImages.length + groupHubData.voiceNotes.length },
                  { id: 'docs', label: 'Docs', count: groupHubData.docs.length },
                  { id: 'links', label: 'Links', count: groupHubData.links.length },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroupInfoTab(tab.id)}
                  className={`min-h-[38px] px-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    groupInfoTab === tab.id
                      ? 'bg-white dark:bg-sunken text-brand shadow-resting border border-line/70 dark:border-line'
                      : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
                  }`}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {groupInfoTab === 'members' && (
                groupInfoMembers.length === 0 ? (
                  <p className="text-xs text-ink-muted text-center py-8">
                    No members loaded yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupInfoMembers.map((member) => {
                      const canInspect = member.uid !== currentUser.uid && Boolean(member.userObj);
                      return (
                        <div
                          key={member.uid}
                          onClick={() => {
                            if (canInspect) openUserProfile(member.uid);
                          }}
                          className={`p-2.5 rounded-2xl border border-line/70 dark:border-line bg-sunken/60 dark:bg-sunken/50 flex items-center gap-3 ${
                            canInspect ? 'cursor-pointer hover:border-success-line dark:hover:border-brand transition-colors' : ''
                          }`}
                        >
                          <div className="relative shrink-0">
                            <UserAvatar
                              name={member.fullName}
                              photoURL={member.userObj?.photoURL}
                              avatarId={member.userObj?.avatarId}
                              size="md"
                              roundedClass="rounded-full"
                              fallbackClassName="bg-brand-subtle dark:bg-brand-subtle/70 text-brand"
                            />
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                member.online ? 'bg-brand' : 'bg-sunken'
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-ink truncate">
                                {member.uid === currentUser.uid ? 'You' : member.fullName}
                              </span>
                              <RoleBadge role={member.role} showStudent={false} />
                            </div>
                            <p className="text-[11px] text-ink-muted truncate mt-0.5">
                              {member.department} ·{' '}
                              {formatCompactLevelLabel(
                                member.level,
                                member.isAlumni || member.userObj?.is_alumni
                              )}
                              {canViewMemberIdNumber(currentUser, member.uid) && member.idNumber && (
                                <>
                                  {' · '}
                                  <span className="font-mono">{member.idNumber}</span>
                                </>
                              )}{' '}
                              ·{' '}
                              <span className={member.online ? 'text-brand font-medium' : ''}>
                                {member.online ? 'Online' : 'Offline'}
                              </span>
                            </p>
                          </div>
                          {member.uid !== currentUser.uid && (
                            <button
                              type="button"
                              disabled={groupInfoDmBusyUid === member.uid}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMessageGroupMember(member.uid, member);
                              }}
                              aria-label={`Message ${member.fullName}`}
                              className="min-w-[36px] min-h-[36px] rounded-xl bg-surface border border-line hover:border-brand text-brand flex items-center justify-center cursor-pointer shrink-0"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {groupInfoTab === 'media' && (
                groupHubData.mediaImages.length === 0 && groupHubData.voiceNotes.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <ImageIcon className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-ink-muted">
                      No shared photos or voice notes in this chat yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupHubData.mediaImages.length > 0 && (
                      <div className="grid grid-cols-3 gap-2">
                        {groupHubData.mediaImages.map((imgMsg) => (
                          <button
                            key={imgMsg.id}
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                src: imgMsg.mediaData!,
                                fileName: imgMsg.fileName || 'gsu-photo.jpg',
                                caption:
                                  imgMsg.text && imgMsg.text !== `Photo: ${imgMsg.fileName}`
                                    ? imgMsg.text
                                    : undefined,
                              })
                            }
                            className="aspect-square rounded-xl overflow-hidden bg-sunken border border-line/80 dark:border-line cursor-pointer hover:opacity-90 transition-opacity"
                          >
                            <SignedChatImage
                              src={imgMsg.mediaData!}
                              alt={imgMsg.fileName || 'Shared photo'}
                              className="w-full h-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    )}

                    {groupHubData.voiceNotes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
                          Voice Notes ({groupHubData.voiceNotes.length})
                        </p>
                        {groupHubData.voiceNotes.map((vMsg) => (
                          <div
                            key={vMsg.id}
                            className="p-2.5 rounded-2xl bg-sunken dark:bg-sunken/70 border border-line/70 dark:border-line/80 space-y-1"
                          >
                            <div className="flex items-center justify-between text-[11px] text-ink-muted">
                              <span className="font-semibold text-ink-soft">
                                {vMsg.senderId === currentUser.uid ? 'You' : vMsg.senderName}
                              </span>
                              <span>{formatShortTime(vMsg.createdAt)}</span>
                            </div>
                            <VoiceNotePlayer
                              src={vMsg.audioData!}
                              durationSec={vMsg.audioDurationSec}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              )}

              {groupInfoTab === 'docs' && (
                groupHubData.docs.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <FileText className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-ink-muted">
                      No PDFs, past questions, or handouts shared here yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupHubData.docs.map((docMsg) => {
                      const badge = getFileTypeBadge(docMsg.fileName || 'FILE', docMsg.mimeType);
                      const canPreviewDoc = Boolean(
                        docMsg.mediaData &&
                          getFilePreviewKind(docMsg.mimeType, docMsg.fileName, docMsg.mediaData)
                      );
                      return (
                        <div
                          key={docMsg.id}
                          className="p-3 rounded-2xl border border-line/80 dark:border-line bg-sunken/70 dark:bg-sunken/60 flex items-center gap-2.5"
                        >
                          <div className="w-10 h-10 rounded-xl bg-info-line dark:bg-info-bg/70 text-info flex flex-col items-center justify-center font-mono text-[10px] font-bold shrink-0">
                            <FileText className="w-3.5 h-3.5 mb-0.5" />
                            <span>{badge}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-ink truncate">
                              {docMsg.fileName || 'Document'}
                            </p>
                            <p className="text-[11px] text-ink-muted truncate mt-0.5">
                              {formatFileSize(docMsg.fileSizeBytes || 0)} ·{' '}
                              {docMsg.senderId === currentUser.uid ? 'You' : docMsg.senderName} ·{' '}
                              {formatShortTime(docMsg.createdAt)}
                            </p>
                          </div>
                          {canPreviewDoc && docMsg.mediaData && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const signedUrl = await getSignedChatFileUrl(docMsg.mediaData!);
                                  setPreviewFile({
                                    fileName: docMsg.fileName || 'Document',
                                    mimeType: docMsg.mimeType,
                                    dataUrl: signedUrl,
                                    subtitle: `${badge} · ${formatFileSize(docMsg.fileSizeBytes || 0)}`,
                                  });
                                } catch (err) {
                                  setSendError(
                                    err instanceof Error
                                      ? err.message
                                      : 'Unable to preview document.'
                                  );
                                }
                              }}
                              aria-label={`Preview ${docMsg.fileName || 'document'}`}
                              title="Preview file"
                              className="w-9 h-9 rounded-xl bg-surface border border-line text-ink-soft hover:border-brand flex items-center justify-center shrink-0 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (!docMsg.mediaData) return;
                              downloadChatDocument(
                                docMsg.mediaData,
                                docMsg.fileName || 'document'
                              ).catch((err) => {
                                setSendError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Unable to download document.'
                                );
                              });
                            }}
                            aria-label={`Download ${docMsg.fileName || 'document'}`}
                            title="Download file"
                            className="w-9 h-9 rounded-xl bg-surface border border-line text-ink-soft hover:border-brand flex items-center justify-center shrink-0 cursor-pointer"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {groupInfoTab === 'links' && (
                groupHubData.links.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <Link2 className="w-7 h-7 text-slate-300 dark:text-slate-600 mx-auto" />
                    <p className="text-xs text-ink-muted">
                      No web links shared in this conversation yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {groupHubData.links.map((item, idx) => (
                      <div
                        key={`${item.msgId}-${idx}`}
                        className="p-3 rounded-2xl border border-line/80 dark:border-line bg-sunken/70 dark:bg-sunken/60 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
                          <span className="font-semibold text-ink-soft truncate">
                            {item.senderName}
                          </span>
                          <span className="shrink-0">{formatShortTime(item.createdAt)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-medium text-brand hover:underline truncate inline-flex items-center gap-1 min-w-0 flex-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{item.url}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              setGroupInfoOpen(false);
                              scrollToMessage(item.msgId);
                            }}
                            className="text-[11px] font-semibold text-ink-body dark:text-ink-soft hover:text-brand shrink-0 cursor-pointer"
                          >
                            View msg
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Secure View-Once Photo / Voice Note Modal */}
      {activeViewOnceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="View-once media"
          className="fixed inset-0 z-50 bg-slate-950/95 text-white flex flex-col items-center justify-between p-4 sm:p-6"
        >
          <div className="w-full max-w-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-7 h-7 rounded-full border-2 border-dashed border-brand text-success flex items-center justify-center text-xs font-bold shrink-0">
                1
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {activeViewOnceModal.senderName}
                </p>
                <p className="text-[11px] text-ink-muted truncate">
                  {activeViewOnceModal.kind === 'voice'
                    ? 'View-once voice message'
                    : 'View-once photo'}{' '}
                  · Deleted from chat once opened
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveViewOnceModal(null)}
              aria-label="Close view-once media"
              className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 w-full max-w-xl flex items-center justify-center py-6">
            {activeViewOnceModal.kind === 'image' && activeViewOnceModal.mediaData ? (
              <SignedChatImage
                src={activeViewOnceModal.mediaData}
                alt="View-once photo"
                className="max-h-[72dvh] w-auto rounded-2xl object-contain shadow-overlay select-none"
              />
            ) : activeViewOnceModal.kind === 'voice' && activeViewOnceModal.audioData ? (
              <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 space-y-4">
                <div className="flex items-center gap-2 text-success text-xs font-semibold">
                  <Volume2 className="w-4 h-4" />
                  <span>Listen once before closing</span>
                </div>
                <VoiceNotePlayer
                  src={activeViewOnceModal.audioData}
                  durationSec={activeViewOnceModal.durationSec}
                  inverted={true}
                />
              </div>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setActiveViewOnceModal(null)}
            className="min-h-[44px] px-6 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      )}

      {/* Fullscreen Image Lightbox */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Image preview"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl flex flex-col items-center gap-3"
          >
            <div className="w-full flex items-center justify-between text-white">
              <span className="text-xs font-mono truncate">{lightboxImage.fileName}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const url = await getSignedChatFileUrl(lightboxImage.src);
                      await downloadDataUrl(url, lightboxImage.fileName);
                    } catch (err) {
                      setSendError(
                        err instanceof Error ? err.message : 'Unable to download image.'
                      );
                    }
                  }}
                  className="min-h-[38px] px-3 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  aria-label="Close image preview"
                  className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <SignedChatImage
              src={lightboxImage.src}
              alt={lightboxImage.fileName}
              className="max-h-[78dvh] w-auto rounded-2xl object-contain shadow-overlay"
            />
            {lightboxImage.caption && (
              <p className="text-sm text-slate-200 text-center max-w-lg">
                {lightboxImage.caption}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Contact / User Profile Modal */}
      {profileModalUser && (
        <UserProfileModal
          currentUser={currentUser}
          targetUser={profileModalUser}
          dmChat={profileModalDmChat}
          nowMs={nowMs}
          isOnline={onlineUserIds ? onlineUserIds.has(profileModalUser.uid) : undefined}
          onClose={() => {
            setProfileModalUid(null);
            setProfileModalSnapshot(null);
          }}
          onMessage={async (target) => {
            const dmChatId = await openOrCreateDmChat(currentUser, target);
            setGroupInfoOpen(false);
            onSelectChat(dmChatId);
          }}
          onVoiceCall={async (target) => {
            if (onStartVoiceCall) {
              setGroupInfoOpen(false);
              await onStartVoiceCall(target);
            }
          }}
        />
      )}

      {/* Live Class Radar & Exam Countdown Broadcaster Modal */}
      {radarModalOpen && activeChat && activeChat.type !== 'dm' && canBroadcastRadar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Broadcast live class radar and exam countdown"
          onClick={() => !radarSaving && setRadarModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-overlay"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-brand-subtle dark:bg-brand-subtle/70 text-brand flex items-center justify-center shrink-0">
                  <Radio className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    Live Class Radar &amp; Exam Countdown
                  </h3>
                  <p className="text-xs text-ink-muted truncate">
                    Broadcast instant status to {getChatDisplayTitle(activeChat)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={radarSaving}
                onClick={() => setRadarModalOpen(false)}
                aria-label="Close live radar modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {radarFormError && (
              <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/60 border border-danger-line dark:border-danger/70 px-3 py-2 text-xs text-danger">
                {radarFormError}
              </div>
            )}

            <form onSubmit={handleSaveRadar} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-ink-soft">
                  Quick Status Preset
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(Object.keys(RADAR_STATUS_LABELS) as RadarStatusType[]).map((key) => {
                    const selected = radarStatusDraft === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setRadarStatusDraft(key)}
                        className={`min-h-[40px] px-3 rounded-xl border text-xs font-semibold text-left transition-colors cursor-pointer ${
                          selected
                            ? 'border-brand bg-brand-subtle dark:bg-brand-subtle/60 text-brand ring-2 ring-success/20'
                            : 'border-line bg-sunken/70 dark:bg-sunken/60 text-ink-soft hover:border-line'
                        }`}
                      >
                        {RADAR_STATUS_LABELS[key]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="radarCourseInput"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Course Code (optional)
                  </label>
                  <input
                    id="radarCourseInput"
                    type="text"
                    maxLength={24}
                    value={radarCourseDraft}
                    onChange={(e) => setRadarCourseDraft(e.target.value)}
                    placeholder="e.g., CSC 301"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label
                    htmlFor="radarVenueInput"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Venue / Hall
                  </label>
                  <input
                    id="radarVenueInput"
                    type="text"
                    maxLength={100}
                    value={radarVenueDraft}
                    onChange={(e) => setRadarVenueDraft(e.target.value)}
                    placeholder="e.g., Science Complex Twin Hall"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  'Science Complex Twin Hall',
                  'SLT Hall',
                  'ETF Lecture Theatre',
                  'New Lecture Theatre',
                  'Main Library',
                ].map((presetVenue) => (
                  <button
                    key={presetVenue}
                    type="button"
                    onClick={() => setRadarVenueDraft(presetVenue)}
                    className={`min-h-[28px] px-2.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                      radarVenueDraft === presetVenue
                        ? 'bg-brand border-brand text-on-brand'
                        : 'bg-sunken dark:bg-sunken/80 border-line text-ink-body dark:text-ink-soft hover:border-brand/60'
                    }`}
                  >
                    {presetVenue}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="radarNoteInput"
                    className="text-xs font-semibold text-ink-soft"
                  >
                    Short Update Note (optional)
                  </label>
                  <span className="text-[11px] font-mono tabular-nums text-ink-muted">
                    {radarNoteDraft.length} / 200
                  </span>
                </div>
                <input
                  id="radarNoteInput"
                  type="text"
                  maxLength={200}
                  value={radarNoteDraft}
                  onChange={(e) => setRadarNoteDraft(e.target.value)}
                  placeholder="e.g., Dr. Bello just arrived — attendance sheet moving now"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="rounded-2xl bg-sunken dark:bg-sunken/60 border border-line/70 dark:border-line p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-ink dark:text-ink-soft">
                    <Timer className="w-4 h-4 text-info" />
                    <span>Exam / Test Countdown Timer (optional)</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(Date.now() + 2 * 3_600_000);
                        setRadarExamAtDraft(toLocalDateTimeInputValue(d));
                      }}
                      className="min-h-[26px] px-2 rounded-lg bg-surface border border-line text-[10.5px] font-semibold text-ink-body dark:text-ink-soft hover:border-info cursor-pointer"
                    >
                      +2 Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 1);
                        d.setHours(9, 0, 0, 0);
                        setRadarExamAtDraft(toLocalDateTimeInputValue(d));
                      }}
                      className="min-h-[26px] px-2 rounded-lg bg-surface border border-line text-[10.5px] font-semibold text-ink-body dark:text-ink-soft hover:border-info cursor-pointer"
                    >
                      Tomorrow 9 AM
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 7);
                        d.setHours(9, 0, 0, 0);
                        setRadarExamAtDraft(toLocalDateTimeInputValue(d));
                      }}
                      className="min-h-[26px] px-2 rounded-lg bg-surface border border-line text-[10.5px] font-semibold text-ink-body dark:text-ink-soft hover:border-info cursor-pointer"
                    >
                      +7 Days
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    maxLength={120}
                    value={radarExamTitleDraft}
                    onChange={(e) => setRadarExamTitleDraft(e.target.value)}
                    placeholder="e.g., CHM 201 Midterm Exam"
                    aria-label="Exam or test title"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-line bg-surface text-xs text-ink focus:outline-none focus:border-brand"
                  />
                  <input
                    type="datetime-local"
                    value={radarExamAtDraft}
                    onChange={(e) => setRadarExamAtDraft(e.target.value)}
                    aria-label="Exam date and time"
                    className="w-full min-h-[40px] px-3 rounded-xl border border-line bg-surface text-xs text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {activeChat.radarStatus && (
                  <button
                    type="button"
                    disabled={radarSaving}
                    onClick={handleClearRadar}
                    className="min-h-[44px] px-4 rounded-xl border border-danger-line dark:border-danger/70 text-danger hover:bg-danger-bg hover:bg-danger-bg/40 text-xs font-semibold cursor-pointer"
                  >
                    Clear Radar
                  </button>
                )}
                <button
                  type="button"
                  disabled={radarSaving}
                  onClick={() => setRadarModalOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={radarSaving}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {radarSaving ? 'Broadcasting...' : 'Broadcast Radar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <FilePreviewModal
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
};
