import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  signUpUser as authSignUpUser,
  uploadIdCardFile,
  verifyOwnPassword,
  type SignUpInput,
} from './authService';
import {
  AcademicLevel,
  AcademicResource,
  AccountLifecycleStatus,
  AccountType,
  Announcement,
  ANNOUNCEMENTS_READ_KEY,
  appRoleToDbRole,
  AppTimestamp,
  AppUser,
  CalendarEvent,
  CalendarEventType,
  CalendarLevel,
  CallLogOutcome,
  CampusConfession,
  CampusStatus,
  ChatMember,
  ChatMessage,
  ChatReadReceipt,
  ChatThread,
  ChatType,
  ChatTypingStatus,
  ConfessionCategory,
  ConfessionStatus,
  CustomGroupScope,
  dbRoleToAppRole,
  DEFAULT_ALLOWED_EMAIL_DOMAIN,
  DEFAULT_GSU_DEPARTMENTS,
  DELETED_MESSAGE_PLACEHOLDER,
  DepartmentItem,
  formatAudioDuration,
  formatCallLogDuration,
  formatLevelLabel,
  getCustomGroupAccessKeys,
  getMessageSnippet,
  isValidEmailDomain,
  MarketplaceCategory,
  MarketplaceCondition,
  MarketplaceListing,
  MarketplaceListingType,
  MarketplaceStatus,
  MAX_AVATAR_BYTES,
  MAX_CHAT_DOCUMENT_BYTES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_MARKETPLACE_IMAGE_BYTES,
  MAX_MESSAGE_CONTENT_LENGTH,
  MAX_PINNED_CHATS,
  MAX_RESOURCE_FILE_BYTES,
  MAX_STATUS_IMAGE_BYTES,
  MAX_VOICE_NOTE_BYTES,
  MessageType,
  ModerationReport,
  MyAccountStatus,
  normalizeEmailDomain,
  normalizeIdNumber,
  PRESET_AVATARS,
  RadarStatusType,
  ReplyTarget,
  ReportReason,
  RequestedRole,
  ResourceCategory,
  ResourceLevel,
  RideErrandPost,
  RideErrandStatus,
  RideErrandType,
  slugify,
  StarredMessage,
  STATUS_BG_COLORS,
  STATUS_TTL_MS,
  StatusType,
  toAppTimestamp,
  UserRole,
  UserStatus,
  VoiceCallSession,
  VoiceCallStatus,
} from '../types';
import { downloadDataUrl } from '../utils/fileHelpers';

export * from './authService';

export async function signUpUser(input: SignUpInput): Promise<AppUser> {
  return authSignUpUser(input);
}

export const PUBLIC_PROFILE_COLUMNS =
  'id, full_name, role, status, matric_no, staff_id, department, level, photo_url, avatar_id, last_seen, study_courses, study_bio, is_alumni, is_exempt, verify_deadline, alumni_verified_at, expires_at, created_at';

const OWN_PROFILE_COLUMNS =
  'id, full_name, role, status, matric_no, staff_id, department, level, photo_url, avatar_id, last_seen, study_courses, study_bio, email, phone, blocked_users, id_card_path, rejection_reason, assigned_reviewer_id, is_alumni, is_exempt, verify_deadline, alumni_verified_at, expires_at, created_at, updated_at';

const PUBLIC_CONFESSION_COLUMNS = 'id, content, status, created_at';

const USERS_PAGE_SIZE = 30;
const PENDING_PAGE_SIZE = 50;
const ANNOUNCEMENTS_PAGE_SIZE = 30;
const EVENTS_PAGE_SIZE = 50;
const RESOURCES_PAGE_SIZE = 30;
const MARKETPLACE_PAGE_SIZE = 30;
const STATUSES_PAGE_SIZE = 40;
const RIDES_PAGE_SIZE = 30;
const CONFESSIONS_PAGE_SIZE = 40;
const REPORTS_PAGE_SIZE = 30;
const CHAT_MESSAGES_PAGE_SIZE = 50;
const CHAT_REFRESH_DEBOUNCE_MS = 15_000;

export interface WorkspacePaginationState {
  hasMoreApprovedUsers: boolean;
  hasMorePendingUsers: boolean;
  hasMoreAllUsers: boolean;
  hasMoreAnnouncements: boolean;
  hasMoreCalendarEvents: boolean;
  hasMoreResources: boolean;
  hasMoreMarketplace: boolean;
  hasMoreStatuses: boolean;
  hasMoreRideErrands: boolean;
  hasMoreConfessions: boolean;
  hasMoreReports: boolean;
}

export interface WorkspaceDataHandle {
  unsubscribe: () => void;
  refreshBroadcastChats: () => void;
  retryAll: () => void;
  loadMore: (key: keyof WorkspacePaginationState) => Promise<void>;
}

export interface ChatRoomHandle {
  unsubscribe: () => void;
  loadOlderMessages: () => Promise<boolean>;
}

// ============================================================
// Internal Helpers, Envelope Codec & Storage Uploads
// ============================================================

const META_PREFIX = '__GSU_META__:';
const STUDY_SPOT_PREFIX = '__spot__:';

function clampStr(val: string, max: number): string {
  return val.trim().slice(0, max);
}

function compactObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  return out as Partial<T>;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function encodeEnvelope<T extends object>(payload: T): string {
  return `${META_PREFIX}${JSON.stringify(compactObject(payload as Record<string, unknown>))}`;
}

function decodeEnvelope<T extends object>(
  raw: string | null | undefined
): { meta: T | null; plainText: string } {
  const str = typeof raw === 'string' ? raw : '';
  if (str.startsWith(META_PREFIX)) {
    const parsed = safeJsonParse<T>(str.slice(META_PREFIX.length));
    if (parsed && typeof parsed === 'object') {
      return { meta: parsed, plainText: '' };
    }
  }
  if (str.startsWith('{"__gsu":1')) {
    const parsed = safeJsonParse<T>(str);
    if (parsed && typeof parsed === 'object') {
      return { meta: parsed, plainText: '' };
    }
  }
  return { meta: null, plainText: str };
}

function extractFallbackPreviewFromTruncatedEnvelope(raw: string): {
  text: string;
  sender?: string;
} {
  const textMatch =
    raw.match(/"lastMessageText":"((?:[^"\\]|\\.)*)"/) ||
    raw.match(/"text":"((?:[^"\\]|\\.)*)/);
  const senderMatch =
    raw.match(/"lastMessageSender":"((?:[^"\\]|\\.)*)"/) ||
    raw.match(/"senderName":"((?:[^"\\]|\\.)*)"/);
  const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return {
    text: textMatch ? unescape(textMatch[1]) : 'New message',
    sender: senderMatch ? unescape(senderMatch[1]) : undefined,
  };
}

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function sanitizeStorageFileName(rawName: string): string {
  const cleaned = rawName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  return cleaned.slice(-80) || 'file';
}

function isDirectUrlOrDataUri(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('blob:')
  );
}

async function uploadToStorageBucket(
  bucket: 'avatars' | 'chat-media' | 'chat-files' | 'resources',
  path: string,
  fileOrBlob: Blob | File,
  contentType?: string
): Promise<string> {
  const { error } = await supabase.storage.from(bucket).upload(path, fileOrBlob, {
    contentType: contentType || fileOrBlob.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    throw new Error(error.message);
  }
  return path;
}

function getPublicStorageUrl(
  bucket: 'avatars' | 'chat-media' | 'resources',
  path: string
): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}


function extractPublicUrlObjectPath(
  publicUrl: string | null | undefined,
  bucket: string
): string | null {
  if (!publicUrl) return null;
  const marker = `/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  const objectPath = publicUrl.slice(idx + marker.length).split('?')[0];
  try {
    return objectPath ? decodeURIComponent(objectPath) : null;
  } catch {
    return objectPath || null;
  }
}

/**
 * Best-effort storage cleanup after a row delete. Never throws: an orphaned
 * object is preferable to a failed delete of the owning row. Storage RLS
 * still applies (e.g. only the owner may remove chat-media objects).
 */
async function removeStorageObjectBestEffort(
  bucket: 'avatars' | 'chat-media' | 'chat-files' | 'resources',
  objectPath: string | null
): Promise<void> {
  if (!objectPath) return;
  try {
    const { error } = await supabase.storage.from(bucket).remove([objectPath]);
    if (error) console.warn(`Storage cleanup warning (${bucket}/${objectPath}):`, error.message);
  } catch (err) {
    console.warn('Storage cleanup warning:', err);
  }
}

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

async function createCachedSignedUrl(
  bucket: 'chat-files' | 'id-cards',
  storagePath: string,
  expiresInSec = 3600
): Promise<string> {
  const clean = storagePath.trim();
  if (!clean) return '';
  if (isDirectUrlOrDataUri(clean)) return clean;

  const cacheKey = `${bucket}:${clean}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(clean, expiresInSec);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Unable to generate secure file link.');
  }
  signedUrlCache.set(cacheKey, {
    url: data.signedUrl,
    expiresAt: Date.now() + expiresInSec * 1000,
  });
  return data.signedUrl;
}

export async function getSignedChatFileUrl(pathOrUrl: string): Promise<string> {
  return createCachedSignedUrl('chat-files', pathOrUrl, 3600);
}

export async function downloadChatDocument(pathOrUrl: string, fileName: string): Promise<void> {
  const resolvedUrl = await getSignedChatFileUrl(pathOrUrl);
  if (!resolvedUrl) {
    throw new Error('Document file is unavailable.');
  }
  downloadDataUrl(resolvedUrl, fileName);
}

export async function getSignedIdCardUrl(idCardPath: string): Promise<string> {
  return createCachedSignedUrl('id-cards', idCardPath, 3600);
}

export { uploadIdCardFile };

// ============================================================
// DM Pair Cache (Issue #3)
// ============================================================

const dmChatIdCache = new Map<string, string>();

function makeDmPairKey(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join(':');
}

export function cacheDmChatPair(uidA: string, uidB: string, chatId: string): void {
  if (!uidA || !uidB || !chatId || uidA === uidB) return;
  dmChatIdCache.set(makeDmPairKey(uidA, uidB), chatId);
}

export function getCachedDmChatId(uidA: string, uidB: string): string | null {
  if (!uidA || !uidB || uidA === uidB) return null;
  return dmChatIdCache.get(makeDmPairKey(uidA, uidB)) || null;
}

export function findDmChat(
  chats: ChatThread[],
  uidA: string,
  uidB: string
): ChatThread | null {
  if (!uidA || !uidB || uidA === uidB) return null;
  const cachedId = getCachedDmChatId(uidA, uidB);
  if (cachedId) {
    const byId = chats.find((c) => c.id === cachedId);
    if (byId) return byId;
  }
  const found =
    chats.find(
      (c) =>
        c.type === 'dm' &&
        c.participantIds.includes(uidA) &&
        c.participantIds.includes(uidB)
    ) || null;
  if (found) {
    cacheDmChatPair(uidA, uidB, found.id);
  }
  return found;
}

// ============================================================
// Cross-Tab / Cross-Client Realtime Sync Bus
// ============================================================

type SyncListener = (payload: { table: string; scopeId?: string }) => void;
const localSyncListeners = new Set<SyncListener>();
let sharedSyncChannel: RealtimeChannel | null = null;
let sharedSyncRefCount = 0;

function notifyLocalSync(table: string, scopeId?: string) {
  localSyncListeners.forEach((fn) => {
    try {
      fn({ table, scopeId });
    } catch {
      // Ignore listener error
    }
  });
}

function ensureSharedSyncChannel(): RealtimeChannel {
  if (!sharedSyncChannel) {
    sharedSyncChannel = supabase.channel('gsu-realtime-sync', {
      config: { broadcast: { self: false } },
    });
    sharedSyncChannel
      .on('broadcast', { event: 'sync' }, (msg) => {
        const p = (msg.payload || {}) as { table?: string; scopeId?: string };
        if (p.table) notifyLocalSync(p.table, p.scopeId);
      })
      .subscribe();
  }
  return sharedSyncChannel;
}

function emitTableSync(table: string, scopeId?: string) {
  notifyLocalSync(table, scopeId);
  try {
    const ch = ensureSharedSyncChannel();
    ch.send({
      type: 'broadcast',
      event: 'sync',
      payload: { table, scopeId, ts: Date.now() },
    }).catch(() => undefined);
  } catch {
    // Ignore broadcast failure
  }
}

function onSyncSignal(
  tables: string[],
  fn: (scopeId?: string, table?: string) => void
): () => void {
  sharedSyncRefCount += 1;
  ensureSharedSyncChannel();
  const tableSet = new Set(tables);
  const handler: SyncListener = ({ table, scopeId }) => {
    if (tableSet.has(table)) fn(scopeId, table);
  };
  localSyncListeners.add(handler);
  return () => {
    localSyncListeners.delete(handler);
    sharedSyncRefCount = Math.max(0, sharedSyncRefCount - 1);
    if (sharedSyncRefCount === 0 && sharedSyncChannel) {
      supabase.removeChannel(sharedSyncChannel);
      sharedSyncChannel = null;
    }
  };
}

// ============================================================
// Postgres Row -> UI Type Mappers
// ============================================================

interface ProfileRow {
  id: string;
  full_name?: string | null;
  status?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  matric_no?: string | null;
  staff_id?: string | null;
  department?: string | null;
  level?: string | null;
  photo_url?: string | null;
  avatar_id?: string | null;
  id_card_path?: string | null;
  rejection_reason?: string | null;
  assigned_reviewer_id?: string | null;
  last_seen?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  study_courses?: string[] | null;
  study_bio?: string | null;
  blocked_users?: string[] | null;
  is_alumni?: boolean | null;
  is_exempt?: boolean | null;
  verify_deadline?: string | null;
  alumni_verified_at?: string | null;
  expires_at?: string | null;
}

interface ChatRow {
  id: string;
  created_by?: string | null;
  name?: string | null;
  department?: string | null;
  level?: string | null;
  group_type?: string | null;
  is_group?: boolean | null;
  last_message?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
  pinned_message_id?: string | null;
}

interface ChatMemberRow {
  user_id: string;
  chat_id: string;
  is_pinned?: boolean | null;
  joined_at?: string | null;
  unread_count?: number | null;
}

interface MessageRow {
  id: string;
  sender_id: string;
  chat_id: string;
  reply_to_id?: string | null;
  content?: string | null;
  reactions?: Record<string, string> | null;
  media_url?: string | null;
  file_name?: string | null;
  is_view_once?: boolean | null;
  is_edited?: boolean | null;
  is_deleted?: boolean | null;
  created_at?: string | null;
  viewed_by?: string[] | null;
  starred_by?: string[] | null;
}

interface ResourceRow {
  id: string;
  title?: string | null;
  department?: string | null;
  level?: string | null;
  course_code?: string | null;
  downloads?: number | null;
  file_url?: string | null;
  created_at?: string | null;
}

interface MarketplaceRow {
  id: string;
  seller_id: string;
  title?: string | null;
  description?: string | null;
  category?: string | null;
  listing_type?: string | null;
  condition?: string | null;
  location?: string | null;
  price?: number | string | null;
  images?: string[] | null;
  is_sold?: boolean | null;
  created_at?: string | null;
}

interface EventRow {
  id: string;
  created_by?: string | null;
  title?: string | null;
  description?: string | null;
  department?: string | null;
  venue?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string | null;
}

interface AnnouncementRow {
  id: string;
  title?: string | null;
  body?: string | null;
  scope?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  author_role?: string | null;
  created_at?: string | null;
}

interface DepartmentRow {
  id?: string;
  name: string;
  faculty: string;
  duration_years?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AppSettingRow {
  key: string;
  value?: string | null;
  updated_at?: string | null;
}

interface MessageReportRow {
  id: string;
  chat_id: string;
  message_id: string;
  message_text?: string | null;
  reported_user_id: string;
  reporter_id: string;
  reason?: string | null;
  details?: string | null;
  status?: string | null;
  resolution_action?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface StatusRow {
  id: string;
  user_id: string;
  content?: string | null;
  media_url?: string | null;
  bg_color?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
  viewed_by?: string[] | null;
}

interface RideErrandRow {
  id: string;
  note?: string | null;
  post_type?: string | null;
  origin?: string | null;
  destination?: string | null;
  departure_time?: string | null;
  seats_available?: number | null;
  created_at?: string | null;
}

interface ConfessionRow {
  id: string;
  content?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface CallRow {
  id: string;
  caller_id: string;
  receiver_id: string;
  status?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string | null;
  offer?: unknown;
  answer?: unknown;
  caller_candidates?: unknown;
  receiver_candidates?: unknown;
}

interface ChatMetaEnvelope {
  __gsu?: number;
  type?: ChatType;
  accessKey?: string;
  participantIds?: string[];
  lastMessageText?: string;
  lastMessageSender?: string;
  updatedAt?: string;
  pinnedMessageText?: string;
  pinnedMessageSender?: string;
  pinnedBy?: string;
  pinnedByName?: string;
  pinnedAt?: string;
  radarStatus?: RadarStatusType;
  radarCourseCode?: string;
  radarVenue?: string;
  radarNote?: string;
  radarExamTitle?: string;
  radarExamAt?: string;
  radarUpdatedBy?: string;
  radarUpdatedByName?: string;
  radarUpdatedByRole?: string;
  radarUpdatedAt?: string;
}

export function mapProfileRowToAppUser(
  row: ProfileRow,
  pinnedChatIds?: string[]
): AppUser {
  const isStaff =
    Boolean(row.staff_id) ||
    row.level === 'Staff' ||
    row.role === 'staff' ||
    row.role === 'lecturer';
  const accountType: AccountType = isStaff ? 'staff' : 'student';
  const idNumber =
    (isStaff ? row.staff_id : row.matric_no) ||
    row.matric_no ||
    row.staff_id ||
    row.email ||
    'GSU';
  const rawCourses = Array.isArray(row.study_courses) ? row.study_courses : [];
  let studySpot = '';
  const studyCourses: string[] = [];
  for (const item of rawCourses) {
    if (typeof item !== 'string') continue;
    if (item.startsWith(STUDY_SPOT_PREFIX)) {
      studySpot = item.slice(STUDY_SPOT_PREFIX.length);
    } else {
      studyCourses.push(item);
    }
  }
  const email = row.email && !row.email.endsWith('@gsuconnect.app') ? row.email : '';

  return {
    uid: row.id,
    fullName: row.full_name || 'GSU Member',
    idNumber,
    idNumberNormalized: normalizeIdNumber(idNumber),
    accountType,
    department: row.department || 'General',
    level: ((row.level as AcademicLevel) || (isStaff ? 'Staff' : '100')),
    role: dbRoleToAppRole(row.role),
    requestedRole: (isStaff ? 'lecturer' : 'student') as RequestedRole,
    email,
    status: ((row.status as UserStatus) || 'pending'),
    rejectionReason: row.rejection_reason || undefined,
    idCardPath: row.id_card_path || undefined,
    blockedUsers: Array.isArray(row.blocked_users) ? row.blocked_users : [],
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.updated_at),
    lastSeen: toAppTimestamp(row.last_seen),
    pinnedChatIds: pinnedChatIds || [],
    photoURL: row.photo_url || undefined,
    avatarId: row.avatar_id || undefined,
    studyCourses,
    studySpot: studySpot || undefined,
    studyBio: row.study_bio || undefined,
    is_alumni: Boolean(row.is_alumni),
    is_exempt: Boolean(row.is_exempt),
    verify_deadline: row.verify_deadline || null,
    alumni_verified_at: row.alumni_verified_at || null,
    expires_at: row.expires_at || null,
  };
}

function mapChatRowToChatThread(
  row: ChatRow,
  dmParticipantsByChatId?: Map<string, string[]>
): ChatThread {
  const { meta, plainText } = decodeEnvelope<ChatMetaEnvelope & Partial<MessageMetaEnvelope>>(
    row.last_message
  );

  let inferredType: ChatType = 'custom';
  if (row.group_type === 'general') inferredType = 'general';
  else if (row.group_type === 'department' || row.group_type === 'level') {
    inferredType = 'department';
  } else if (row.group_type === 'announcement' || row.group_type === 'custom') {
    inferredType = 'custom';
  } else if (row.is_group === false) {
    inferredType = 'dm';
  } else if (meta?.type) {
    inferredType = meta.type;
  } else if (row.department && row.level) {
    inferredType = 'department';
  }

  let lastMessageText = '';
  let lastMessageSender = 'GSU Connect';
  if (meta) {
    if (typeof meta.lastMessageText === 'string') {
      lastMessageText = meta.lastMessageText;
      lastMessageSender = meta.lastMessageSender || 'GSU Connect';
    } else if (typeof meta.text === 'string') {
      lastMessageText = meta.text;
      lastMessageSender = meta.senderName || 'GSU Member';
    }
  } else if (
    typeof row.last_message === 'string' &&
    (row.last_message.startsWith(META_PREFIX) || row.last_message.startsWith('{"__gsu":1'))
  ) {
    const fb = extractFallbackPreviewFromTruncatedEnvelope(row.last_message);
    lastMessageText = fb.text;
    if (fb.sender) lastMessageSender = fb.sender;
  } else {
    lastMessageText = plainText;
  }

  const dmMembers = dmParticipantsByChatId?.get(row.id);
  const participantIds =
    dmMembers && dmMembers.length > 0
      ? dmMembers
      : Array.isArray(meta?.participantIds)
        ? meta.participantIds
        : [];

  return {
    id: row.id,
    type: inferredType,
    name: row.name || (inferredType === 'general' ? 'General' : 'GSU Chat'),
    department: row.department || '',
    level: row.level || '',
    accessKey: meta?.accessKey || '',
    createdBy: row.created_by || undefined,
    participantIds,
    lastMessageText,
    lastMessageSender,
    lastMessageAt: toAppTimestamp(row.last_message_at || row.created_at),
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(meta?.updatedAt || row.last_message_at || row.created_at),
    pinnedMessageId: row.pinned_message_id || undefined,
    pinnedMessageText: meta?.pinnedMessageText || undefined,
    pinnedMessageSender: meta?.pinnedMessageSender || undefined,
    pinnedBy: meta?.pinnedBy || undefined,
    pinnedByName: meta?.pinnedByName || undefined,
    pinnedAt: toAppTimestamp(meta?.pinnedAt),
    radarStatus: meta?.radarStatus,
    radarCourseCode: meta?.radarCourseCode,
    radarVenue: meta?.radarVenue,
    radarNote: meta?.radarNote,
    radarExamTitle: meta?.radarExamTitle,
    radarExamAt: meta?.radarExamAt,
    radarUpdatedBy: meta?.radarUpdatedBy,
    radarUpdatedByName: meta?.radarUpdatedByName,
    radarUpdatedByRole: meta?.radarUpdatedByRole
      ? dbRoleToAppRole(meta.radarUpdatedByRole)
      : undefined,
    radarUpdatedAt: toAppTimestamp(meta?.radarUpdatedAt),
  };
}

interface MessageMetaEnvelope {
  __gsu?: number;
  text: string;
  senderName?: string;
  senderRole?: string;
  messageType?: MessageType;
  audioDurationSec?: number;
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
  mimeType?: string;
  fileSizeBytes?: number;
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventVenue?: string;
  eventNotes?: string;
  contactUid?: string;
  contactName?: string;
  contactDepartment?: string;
  contactLevel?: string;
  contactIdNumber?: string;
  contactRole?: string;
  callOutcome?: CallLogOutcome;
  callDurationSec?: number;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToSnippet?: string;
  replyToMessageType?: MessageType;
  editedAt?: string;
  deletedAt?: string;
  deletedBy?: string;
  deletedByName?: string;
  viewOnceOpenedAt?: string;
  viewOnceOpenedBy?: string;
}

function mapMessageRowToChatMessage(
  row: MessageRow,
  userMap: Map<string, AppUser>
): ChatMessage {
  const { meta, plainText } = decodeEnvelope<MessageMetaEnvelope>(row.content);
  const sender = userMap.get(row.sender_id);
  const messageType: MessageType = meta?.messageType || 'text';
  const mediaData = row.media_url || undefined;
  const viewedByArr = Array.isArray(row.viewed_by) ? row.viewed_by : [];

  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    senderName: meta?.senderName || sender?.fullName || 'GSU Member',
    senderRole: meta?.senderRole ? dbRoleToAppRole(meta.senderRole) : sender?.role || 'student',
    text: row.is_deleted ? DELETED_MESSAGE_PLACEHOLDER : (meta?.text ?? plainText ?? ''),
    createdAt: toAppTimestamp(row.created_at),
    reactions:
      row.reactions && typeof row.reactions === 'object' && !Array.isArray(row.reactions)
        ? row.reactions
        : {},
    messageType: row.is_deleted ? 'text' : messageType,
    audioData: !row.is_deleted && messageType === 'voice' ? mediaData : undefined,
    audioDurationSec: meta?.audioDurationSec,
    pollQuestion: meta?.pollQuestion,
    pollOptions: meta?.pollOptions,
    pollVotes: meta?.pollVotes || {},
    mediaData:
      !row.is_deleted && (messageType === 'image' || messageType === 'document')
        ? mediaData
        : undefined,
    fileName: row.file_name || undefined,
    mimeType: meta?.mimeType,
    fileSizeBytes: meta?.fileSizeBytes,
    eventTitle: meta?.eventTitle,
    eventDate: meta?.eventDate,
    eventTime: meta?.eventTime,
    eventVenue: meta?.eventVenue,
    eventNotes: meta?.eventNotes,
    contactUid: meta?.contactUid,
    contactName: meta?.contactName,
    contactDepartment: meta?.contactDepartment,
    contactLevel: meta?.contactLevel,
    contactIdNumber: meta?.contactIdNumber,
    contactRole: meta?.contactRole ? dbRoleToAppRole(meta.contactRole) : undefined,
    callOutcome: meta?.callOutcome,
    callDurationSec: meta?.callDurationSec,
    replyToMessageId: row.reply_to_id || meta?.replyToMessageId,
    replyToSenderName: meta?.replyToSenderName,
    replyToSnippet: meta?.replyToSnippet,
    replyToMessageType: meta?.replyToMessageType,
    editedAt: toAppTimestamp(meta?.editedAt || (row.is_edited ? row.created_at : null)),
    deletedAt: toAppTimestamp(meta?.deletedAt || (row.is_deleted ? row.created_at : null)),
    deletedBy: meta?.deletedBy,
    deletedByName: meta?.deletedByName,
    isViewOnce: Boolean(row.is_view_once),
    viewOnceOpenedAt: toAppTimestamp(
      meta?.viewOnceOpenedAt || (row.is_view_once && viewedByArr.length > 0 ? row.created_at : null)
    ),
    viewOnceOpenedBy: meta?.viewOnceOpenedBy || viewedByArr[0],
  };
}

interface ResourceMetaEnvelope {
  __gsu?: number;
  title: string;
  description?: string;
  category?: ResourceCategory;
  faculty?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  authorId?: string;
  authorName?: string;
  authorRole?: string;
}

function mapResourceRow(row: ResourceRow): AcademicResource {
  const { meta, plainText } = decodeEnvelope<ResourceMetaEnvelope>(row.title);
  return {
    id: row.id,
    title: meta?.title || plainText || 'Academic Resource',
    description: meta?.description || '',
    category: meta?.category || 'Lecture Notes',
    faculty: meta?.faculty || 'Science',
    department: row.department || 'General',
    level: ((row.level as ResourceLevel) || 'General'),
    courseCode: row.course_code || 'GSU',
    fileName: meta?.fileName || `${row.course_code || 'resource'}.pdf`,
    mimeType: meta?.mimeType || 'application/octet-stream',
    fileSizeBytes: meta?.fileSizeBytes || 1024,
    fileData: row.file_url || '',
    downloadCount: Number(row.downloads || 0),
    authorId: meta?.authorId || '',
    authorName: meta?.authorName || 'GSU Member',
    authorRole: dbRoleToAppRole(meta?.authorRole),
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.created_at),
  };
}

function mapMarketplaceRow(
  row: MarketplaceRow,
  userMap: Map<string, AppUser>
): MarketplaceListing {
  const seller = userMap.get(row.seller_id);
  const images = Array.isArray(row.images) ? row.images : [];
  return {
    id: row.id,
    title: row.title || 'Campus Listing',
    description: row.description || '',
    category: ((row.category as MarketplaceCategory) || 'Other'),
    listingType: ((row.listing_type as MarketplaceListingType) || 'Sell'),
    priceNaira: Number(row.price || 0),
    condition: ((row.condition as MarketplaceCondition) || 'Available'),
    location: row.location || 'Main Campus',
    imageData: images[0] || undefined,
    status: row.is_sold ? 'sold' : 'available',
    sellerId: row.seller_id,
    sellerName: seller?.fullName || 'GSU Member',
    sellerDepartment: seller?.department || 'General',
    sellerLevel: seller?.is_alumni ? 'Alumni' : seller?.level || '100',
    sellerRole: seller?.role || 'student',
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.created_at),
  };
}

interface EventMetaEnvelope {
  __gsu?: number;
  kind?: 'calendar';
  description?: string;
  eventType?: CalendarEventType;
  date?: string;
  startTime?: string;
  endTime?: string;
  courseCode?: string;
  level?: CalendarLevel;
  authorId?: string;
  authorName?: string;
  authorRole?: string;
}

function mapEventRowToCalendarEvent(
  row: EventRow,
  userMap: Map<string, AppUser>
): CalendarEvent {
  const { meta, plainText } = decodeEnvelope<EventMetaEnvelope>(row.description);

  const startIso = row.start_time || row.created_at || new Date().toISOString();
  const startDateObj = new Date(startIso);
  const endDateObj = row.end_time ? new Date(row.end_time) : null;
  const fallbackDate = Number.isFinite(startDateObj.getTime())
    ? startDateObj.toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const fallbackStart = Number.isFinite(startDateObj.getTime())
    ? startDateObj.toISOString().slice(11, 16)
    : '09:00';
  const fallbackEnd =
    endDateObj && Number.isFinite(endDateObj.getTime())
      ? endDateObj.toISOString().slice(11, 16)
      : '';

  const author = row.created_by ? userMap.get(row.created_by) : undefined;
  const role = meta?.authorRole ? dbRoleToAppRole(meta.authorRole) : author?.role || 'classRep';

  return {
    id: row.id,
    title: row.title || 'Campus Event',
    description: meta?.description ?? plainText ?? '',
    eventType: meta?.eventType || 'campus_event',
    date: meta?.date || fallbackDate,
    startTime: meta?.startTime || fallbackStart,
    endTime: meta?.endTime || fallbackEnd,
    venue: row.venue || 'Main Campus',
    courseCode: meta?.courseCode || '',
    department: row.department || 'All GSU',
    level: meta?.level || 'All',
    authorId: meta?.authorId || row.created_by || '',
    authorName: meta?.authorName || author?.fullName || 'GSU Moderator',
    authorRole: (role === 'admin' || role === 'classRep' || role === 'lecturer'
      ? role
      : 'classRep') as CalendarEvent['authorRole'],
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.created_at),
  };
}

function mapAnnouncementRow(
  row: AnnouncementRow,
  userMap: Map<string, AppUser>
): Announcement {
  const author = row.author_id ? userMap.get(row.author_id) : undefined;
  const resolvedRole = dbRoleToAppRole(row.author_role || author?.role || 'admin');
  return {
    id: row.id,
    title: row.title || 'Campus Notice',
    body: row.body || '',
    scope: row.scope || 'All GSU',
    authorId: row.author_id || '',
    authorName: row.author_name || author?.fullName || 'GSU Moderator',
    authorRole: (resolvedRole === 'student' ? 'admin' : resolvedRole) as Exclude<
      UserRole,
      'student'
    >,
    createdAt: toAppTimestamp(row.created_at),
  };
}

function mapReportRow(
  row: MessageReportRow,
  userMap: Map<string, AppUser>,
  chatMap: Map<string, ChatThread>
): ModerationReport {
  const reported = userMap.get(row.reported_user_id);
  const reporter = userMap.get(row.reporter_id);
  const chat = chatMap.get(row.chat_id);
  return {
    id: row.id,
    chatId: row.chat_id,
    chatName: chat?.name || 'GSU Chat',
    messageId: row.message_id,
    messageText: row.message_text || '',
    reportedUserId: row.reported_user_id,
    reportedUserName: reported?.fullName || 'GSU Member',
    reporterId: row.reporter_id,
    reporterName: reporter?.fullName || 'GSU Member',
    reason: ((row.reason as ReportReason) || 'Other'),
    details: row.details || '',
    status: ((row.status as ModerationReport['status']) || 'open'),
    resolutionAction: row.resolution_action || '',
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.updated_at || row.created_at),
  };
}

function mapStatusRow(row: StatusRow, userMap: Map<string, AppUser>): CampusStatus {
  const author = userMap.get(row.user_id);
  const viewedMap: Record<string, boolean> = {};
  (Array.isArray(row.viewed_by) ? row.viewed_by : []).forEach((uid) => {
    viewedMap[uid] = true;
  });

  return {
    id: row.id,
    authorId: row.user_id,
    authorName: author?.fullName || 'GSU Member',
    authorDepartment: author?.department || 'General',
    authorLevel: author?.is_alumni ? 'Alumni' : author?.level || '100',
    authorRole: author?.role || 'student',
    type: row.media_url ? 'image' : 'text',
    text: row.content || '',
    bgColor: row.bg_color || undefined,
    imageData: row.media_url || undefined,
    viewedBy: viewedMap,
    createdAt: toAppTimestamp(row.created_at),
  };
}

interface RideErrandMetaEnvelope {
  __gsu?: number;
  title?: string;
  details?: string;
  costSplitNaira?: number;
  status?: RideErrandStatus;
  authorId?: string;
  authorName?: string;
  authorDepartment?: string;
  authorLevel?: string;
  authorRole?: string;
  updatedAt?: string;
}

function mapRideErrandRow(row: RideErrandRow): RideErrandPost {
  const { meta, plainText } = decodeEnvelope<RideErrandMetaEnvelope>(row.note);
  return {
    id: row.id,
    postType: row.post_type === 'errand' ? 'errand' : 'ride',
    title: meta?.title || `${row.origin || 'Campus'} to ${row.destination || 'Tumfure'}`,
    details: meta?.details ?? plainText ?? '',
    origin: row.origin || 'Main Campus',
    destination: row.destination || 'Off-Campus (Tumfure)',
    departureTime: row.departure_time || 'Now',
    seatsOrSlots: Number(row.seats_available || 1),
    costSplitNaira: Number(meta?.costSplitNaira || 0),
    status: meta?.status === 'fulfilled' ? 'fulfilled' : 'open',
    authorId: meta?.authorId || '',
    authorName: meta?.authorName || 'GSU Member',
    authorDepartment: meta?.authorDepartment || 'General',
    authorLevel: meta?.authorLevel || '100',
    authorRole: dbRoleToAppRole(meta?.authorRole),
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(meta?.updatedAt || row.created_at),
  };
}

interface ConfessionMetaEnvelope {
  __gsu?: number;
  category?: ConfessionCategory;
  text: string;
  moderatedBy?: string;
  updatedAt?: string;
}

function mapConfessionRow(
  row: ConfessionRow,
  upvote?: { count: number; mine: boolean }
): CampusConfession {
  const { meta, plainText } = decodeEnvelope<ConfessionMetaEnvelope>(row.content);
  return {
    id: row.id,
    category: meta?.category || 'Confession',
    text: meta?.text ?? plainText ?? '',
    status: ((row.status as ConfessionStatus) || 'pending'),
    upvoteCount: upvote?.count ?? 0,
    upvotedByMe: upvote?.mine ?? false,
    moderatedBy: meta?.moderatedBy,
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(meta?.updatedAt || row.created_at),
  };
}

interface UpvoteCountRow {
  confession_id: string;
  upvote_count: number | string | null;
}

// Fetch upvote aggregates (counts are public; voter identities are not)
// and the current user's own votes (RLS shows only own rows).
async function fetchConfessionUpvoteState(
  ids: string[]
): Promise<Map<string, { count: number; mine: boolean }>> {
  const map = new Map<string, { count: number; mine: boolean }>();
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return map;

  const [countsRes, ownRes] = await Promise.all([
    supabase
      .from('confession_upvote_counts')
      .select('confession_id, upvote_count')
      .in('confession_id', uniqueIds),
    supabase.from('confession_upvotes').select('confession_id').in('confession_id', uniqueIds),
  ]);
  (countsRes.data as UpvoteCountRow[] | null)?.forEach((row) => {
    map.set(row.confession_id, {
      count: Number(row.upvote_count) || 0,
      mine: false,
    });
  });
  (ownRes.data as Array<{ confession_id: string }> | null)?.forEach((row) => {
    const current = map.get(row.confession_id) || { count: 0, mine: false };
    current.mine = true;
    map.set(row.confession_id, current);
  });
  return map;
}

async function mapConfessionRowsWithUpvotes(rows: ConfessionRow[]): Promise<CampusConfession[]> {
  const state = await fetchConfessionUpvoteState(rows.map((r) => r.id));
  return rows.map((row) => mapConfessionRow(row, state.get(row.id)));
}

function mapCallRowToVoiceCallSession(
  row: CallRow,
  userMap: Map<string, AppUser>
): VoiceCallSession {
  const caller = userMap.get(row.caller_id);
  const receiver = userMap.get(row.receiver_id);
  const offerStr =
    typeof row.offer === 'string'
      ? row.offer
      : row.offer && typeof row.offer === 'object'
        ? JSON.stringify(row.offer)
        : undefined;
  const answerStr =
    typeof row.answer === 'string'
      ? row.answer
      : row.answer && typeof row.answer === 'object'
        ? JSON.stringify(row.answer)
        : undefined;

  return {
    id: row.id,
    callerId: row.caller_id,
    callerName: caller?.fullName || 'GSU Member',
    callerAvatar: caller ? serializeUserAvatar(caller) : undefined,
    callerDepartment: caller?.department || '',
    receiverId: row.receiver_id,
    receiverName: receiver?.fullName || 'GSU Member',
    receiverAvatar: receiver ? serializeUserAvatar(receiver) : undefined,
    receiverDepartment: receiver?.department || '',
    dmChatId: getCachedDmChatId(row.caller_id, row.receiver_id) || '',
    status: ((row.status as VoiceCallStatus) || 'ringing'),
    offer: offerStr,
    answer: answerStr,
    acceptedAt: toAppTimestamp(row.started_at),
    createdAt: toAppTimestamp(row.created_at),
    updatedAt: toAppTimestamp(row.ended_at || row.started_at || row.created_at),
  };
}

// ============================================================
// Profile, Presence & Block List Operations (Issue #5)
// ============================================================

export function isBlockedBetweenUsers(
  userA?: Pick<AppUser, 'uid' | 'blockedUsers'> | null,
  userB?: Pick<AppUser, 'uid' | 'blockedUsers'> | null
): boolean {
  if (!userA || !userB) return false;
  const aBlockedB = Array.isArray(userA.blockedUsers) && userA.blockedUsers.includes(userB.uid);
  const bBlockedA = Array.isArray(userB.blockedUsers) && userB.blockedUsers.includes(userA.uid);
  return aBlockedB || bBlockedA;
}

export async function toggleBlockUser(
  myUid: string,
  currentBlockedUsers: string[] = [],
  targetUid: string,
  shouldBlock: boolean
): Promise<string[]> {
  if (!myUid || !targetUid || myUid === targetUid) return currentBlockedUsers;
  const next = shouldBlock
    ? Array.from(new Set([...currentBlockedUsers, targetUid]))
    : currentBlockedUsers.filter((id) => id !== targetUid);

  const { error } = await supabase
    .from('profiles')
    .update({
      blocked_users: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', myUid);
  if (error) throw new Error(error.message);

  emitTableSync('profiles', myUid);
  return next;
}

const profileCache = new Map<string, AppUser>();

function cacheUsers(users: AppUser[]): void {
  for (const u of users) {
    if (u?.uid) profileCache.set(u.uid, u);
  }
}

export function getCachedProfile(uid: string): AppUser | undefined {
  return profileCache.get(uid);
}

export async function resolveProfilesByIds(ids: string[]): Promise<Record<string, AppUser>> {
  const uniqueIds = Array.from(new Set(ids.map((id) => (id || '').trim()).filter(Boolean)));
  const result: Record<string, AppUser> = {};
  const missing: string[] = [];

  for (const id of uniqueIds) {
    const cached = profileCache.get(id);
    if (cached) {
      result[id] = cached;
    } else {
      missing.push(id);
    }
  }

  for (let i = 0; i < missing.length; i += 100) {
    const chunk = missing.slice(i, i + 100);
    const { data, error } = await supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_COLUMNS)
      .in('id', chunk);
    if (error || !Array.isArray(data)) continue;
    for (const row of data as ProfileRow[]) {
      const mapped = mapProfileRowToAppUser(row);
      profileCache.set(mapped.uid, mapped);
      result[mapped.uid] = mapped;
    }
  }

  return result;
}

export async function searchPeople(q: string): Promise<AppUser[]> {
  const clean = q.trim();
  if (!clean) return [];
  const { data, error } = await supabase.rpc('search_people', { q: clean });
  if (error) {
    throw new Error(error.message);
  }
  const rows = Array.isArray(data) ? (data as ProfileRow[]) : [];
  const mapped = rows.map((row) => mapProfileRowToAppUser(row));
  cacheUsers(mapped);
  return mapped;
}

export async function getPendingUserIdCardSignedUrl(
  userId: string
): Promise<{ url: string; isPdf: boolean } | null> {
  const cleanId = (userId || '').trim();
  if (!cleanId) return null;
  const { data, error } = await supabase.storage
    .from('id-cards')
    .list(cleanId, { limit: 5, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) {
    throw new Error(error.message);
  }
  const fileObj = (data || []).find((item) => Boolean(item?.name));
  if (!fileObj?.name) return null;
  const storagePath = `${cleanId}/${fileObj.name}`;
  const url = await createCachedSignedUrl('id-cards', storagePath, 3600);
  return {
    url,
    isPdf: fileObj.name.toLowerCase().endsWith('.pdf'),
  };
}

export async function fetchProfileById(uid: string): Promise<AppUser | null> {
  if (!uid) return null;
  const [{ data: profileRow, error }, { data: memberRows }] = await Promise.all([
    supabase.from('profiles').select(OWN_PROFILE_COLUMNS).eq('id', uid).maybeSingle(),
    supabase
      .from('chat_members')
      .select('chat_id, is_pinned')
      .eq('user_id', uid)
      .eq('is_pinned', true),
  ]);
  if (error || !profileRow) return null;
  const pinnedIds = Array.isArray(memberRows)
    ? (memberRows as ChatMemberRow[]).map((m) => m.chat_id)
    : [];
  const mapped = mapProfileRowToAppUser(profileRow as ProfileRow, pinnedIds);
  profileCache.set(mapped.uid, mapped);
  return mapped;
}

export async function updateUserLastSeen(uid: string): Promise<void> {
  if (!uid) return;
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({
      last_seen: nowIso,
      updated_at: nowIso,
    })
    .eq('id', uid);
  if (error) {
    console.warn('Last seen update warning:', error.message);
  }
}

export function subscribeToOnlinePresence(
  uid: string,
  onOnlineIds: (ids: Set<string>) => void
): () => void {
  if (!uid) {
    onOnlineIds(new Set());
    return () => undefined;
  }

  let active = true;
  const channel = supabase.channel('gsu-online-presence', {
    config: { presence: { key: uid } },
  });

  const syncPresence = () => {
    if (!active) return;
    const state = channel.presenceState();
    const online = new Set<string>(Object.keys(state));
    online.add(uid);
    onOnlineIds(online);
  };

  channel
    .on('presence', { event: 'sync' }, syncPresence)
    .on('presence', { event: 'join' }, syncPresence)
    .on('presence', { event: 'leave' }, syncPresence)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && active) {
        channel
          .track({ online_at: new Date().toISOString() })
          .catch(() => undefined);
      }
    });

  return () => {
    active = false;
    channel.untrack().catch(() => undefined);
    supabase.removeChannel(channel);
  };
}

function toTitleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export async function updateOwnFullName(uid: string, rawFullName: string): Promise<void> {
  const fullName = clampStr(toTitleCaseName(rawFullName), 100);
  if (fullName.length < 2) {
    throw new Error('Full name must be at least 2 characters.');
  }
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);
  if (error) throw new Error(error.message);
  emitTableSync('profiles', uid);
}

export async function updateOwnAvatar(
  uid: string,
  input: { file?: Blob | File | null; photoURL?: string | null; avatarId?: string | null },
  options?: { isAdmin?: boolean }
): Promise<void> {
  if (!uid) return;
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.file) {
    if (input.file.size < 1) {
      throw new Error('Selected profile photo is empty.');
    }
    if (input.file.size > MAX_AVATAR_BYTES) {
      throw new Error('Profile photo exceeds the 2 MB limit. Please pick a smaller image.');
    }
    const ext = input.file.type === 'image/png' ? 'png' : input.file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${uid}/${crypto.randomUUID()}_avatar.${ext}`;
    await uploadToStorageBucket('avatars', path, input.file, input.file.type || 'image/jpeg');
    payload.photo_url = getPublicStorageUrl('avatars', path);
  } else if (input.photoURL === null) {
    payload.photo_url = null;
  } else if (typeof input.photoURL === 'string') {
    const cleanPhoto = input.photoURL.trim();
    payload.photo_url = cleanPhoto || null;
  }

  if (input.avatarId === null) {
    payload.avatar_id = null;
  } else if (typeof input.avatarId === 'string') {
    const cleanAvatar = input.avatarId.trim();
    if (!cleanAvatar) {
      payload.avatar_id = null;
    } else {
      const matchedPreset = PRESET_AVATARS.find((p) => p.id === cleanAvatar);
      if (!matchedPreset) {
        throw new Error('Selected preset avatar is invalid.');
      }
      if (matchedPreset.adminOnly && !options?.isAdmin) {
        throw new Error('This preset avatar is reserved for Admins.');
      }
      payload.avatar_id = cleanAvatar;
    }
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', uid);
  if (error) throw new Error(error.message);
  emitTableSync('profiles', uid);
}

export async function fetchOwnRecoveryEmail(): Promise<string> {
  const { data, error } = await supabase
    .from('account_recovery')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error || !data || typeof data !== 'object') {
    return '';
  }
  const row = data as { email?: string | null; recovery_email?: string | null };
  return (row.email || row.recovery_email || '').trim();
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (!currentPassword) {
    throw new Error('Please enter your current password.');
  }
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
  if (newPassword === currentPassword) {
    throw new Error('New password must be different from your current password.');
  }

  await verifyOwnPassword(currentPassword, 'changing your password');

  const { error: updateErr } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateErr) {
    throw new Error(updateErr.message);
  }
}

/**
 * Permanently deletes (anonymizes) the caller's account via the
 * `delete_own_account()` RPC. The user's current password is verified
 * against Supabase Auth first so a stray click — or someone with
 * momentary access to an unlocked device — cannot wipe the account.
 */
export async function requestOwnAccountDeletion(
  password: string
): Promise<'deleted' | 'manual_required'> {
  await verifyOwnPassword(password, 'deleting your account');

  const { error } = await supabase.rpc('delete_own_account');
  if (!error) {
    await supabase.auth.signOut().catch(() => undefined);
    return 'deleted';
  }
  const msg = error.message || '';
  if (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    /could not find the function|does not exist|schema cache/i.test(msg)
  ) {
    return 'manual_required';
  }
  throw new Error(msg || 'Could not process account deletion request.');
}

export async function updateOwnStudyProfile(
  uid: string,
  rawCourses: string[],
  rawStudySpot: string
): Promise<void> {
  if (!uid) return;
  const cleanedCourses: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawCourses) {
    const clean = clampStr(raw.toUpperCase().replace(/\s+/g, ' '), 20);
    if (clean.length >= 2 && !seen.has(clean)) {
      seen.add(clean);
      cleanedCourses.push(clean);
      if (cleanedCourses.length >= 8) break;
    }
  }
  const studySpot = clampStr(rawStudySpot, 80);
  const storedCourses = studySpot
    ? [...cleanedCourses, `${STUDY_SPOT_PREFIX}${studySpot}`]
    : cleanedCourses;

  const { error } = await supabase
    .from('profiles')
    .update({
      study_courses: storedCourses,
      updated_at: new Date().toISOString(),
    })
    .eq('id', uid);

  if (error) throw new Error(error.message);
  emitTableSync('profiles', uid);
}

export async function getMyAccountStatus(): Promise<MyAccountStatus> {
  const { data, error } = await supabase.rpc('get_my_account_status');
  if (error) {
    throw new Error(error.message);
  }
  const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  const rawStatus = typeof raw?.status === 'string' ? raw.status : 'active';
  const validStatuses: AccountLifecycleStatus[] = [
    'active',
    'alumni',
    'verify_pending',
    'expired',
    'no_profile',
  ];
  const status: AccountLifecycleStatus = validStatuses.includes(
    rawStatus as AccountLifecycleStatus
  )
    ? (rawStatus as AccountLifecycleStatus)
    : 'active';

  return {
    status,
    is_alumni: Boolean(raw?.is_alumni),
    is_exempt: Boolean(raw?.is_exempt),
    verify_deadline: typeof raw?.verify_deadline === 'string' ? raw.verify_deadline : null,
    alumni_verified_at:
      typeof raw?.alumni_verified_at === 'string' ? raw.alumni_verified_at : null,
    expires_at: typeof raw?.expires_at === 'string' ? raw.expires_at : null,
  };
}

export async function verifyAlumniAccount(): Promise<void> {
  const { error } = await supabase.rpc('verify_alumni_account');
  if (error) {
    throw new Error(error.message);
  }
  emitTableSync('profiles');
}

export async function adminSetAlumniExempt(userId: string, exempt: boolean): Promise<void> {
  if (!userId) throw new Error('User ID is required.');
  const { error } = await supabase.rpc('admin_set_alumni_exempt', {
    user_id: userId,
    exempt,
  });
  if (error) {
    throw new Error(error.message);
  }
  emitTableSync('profiles', userId);
}

export async function adminExpireUser(userId: string): Promise<void> {
  if (!userId) throw new Error('User ID is required.');
  const { error } = await supabase.rpc('admin_expire_user', {
    user_id: userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  emitTableSync('profiles', userId);
}

// ============================================================
// Groups, DMs & Memberships (Issues #1, #3, #8)
// ============================================================

async function ensureChatMemberRow(chatId: string, userId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('chat_members')
    .select('chat_id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return false;

  const { error } = await supabase.from('chat_members').upsert(
    {
      chat_id: chatId,
      user_id: userId,
      is_pinned: false,
      joined_at: new Date().toISOString(),
      unread_count: 0,
    },
    { onConflict: 'user_id,chat_id' }
  );
  if (error) {
    console.warn('ensureChatMemberRow warning:', error.message);
    return false;
  }
  return true;
}

export async function createAdminGroup(
  adminUser: AppUser,
  input: {
    name: string;
    scopeType: CustomGroupScope;
    department?: string;
    level?: string;
    invitedUsers?: AppUser[];
    allApprovedUsers?: AppUser[];
  }
): Promise<string> {
  if (adminUser.role !== 'admin') {
    throw new Error('Only admins can create custom groups.');
  }

  const name = clampStr(input.name, 120);
  if (name.length < 2) {
    throw new Error('Group name must be at least 2 characters.');
  }

  let department = '';
  let level = '';
  let accessKey = 'all';
  let groupType = 'custom';
  let introText = `Admin created campus-wide group "${name}".`;

  if (input.scopeType === 'department') {
    department = clampStr(input.department || '', 80);
    if (department.length < 2) throw new Error('Please choose a department for this group.');
    accessKey = `dept:${department}`;
    groupType = 'custom';
    introText = `Department group for ${department}.`;
  } else if (input.scopeType === 'deptLevel') {
    department = clampStr(input.department || '', 80);
    level = clampStr(input.level || '', 20);
    if (department.length < 2 || !level) {
      throw new Error('Please choose both a department and level.');
    }
    accessKey = `deptLevel:${department}|${level}`;
    groupType = 'custom';
    const lvlLabel = formatLevelLabel(level);
    introText = `Cohort group for ${department} (${lvlLabel}).`;
  } else if (input.scopeType === 'invited') {
    accessKey = 'invited';
    groupType = 'custom';
    introText = `Private group created by ${adminUser.fullName}.`;
  }

  const chatId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const metaEnvelope: ChatMetaEnvelope = {
    __gsu: 1,
    type: 'custom',
    accessKey,
    lastMessageText: clampStr(introText, 180),
    lastMessageSender: clampStr(adminUser.fullName, 60),
    updatedAt: nowIso,
  };

  const { error } = await supabase.from('chats').insert({
    id: chatId,
    created_by: adminUser.uid,
    name,
    department,
    level,
    group_type: groupType,
    is_group: true,
    last_message: encodeEnvelope(metaEnvelope),
    last_message_at: nowIso,
    created_at: nowIso,
  });

  if (error) throw new Error(error.message);

  await ensureChatMemberRow(chatId, adminUser.uid);

  if (input.scopeType === 'invited') {
    for (const u of input.invitedUsers || []) {
      if (u.status === 'approved' && u.uid !== adminUser.uid) {
        await ensureChatMemberRow(chatId, u.uid);
      }
    }
  } else if (input.allApprovedUsers && input.allApprovedUsers.length > 0) {
    const matching = input.allApprovedUsers.filter((u) => {
      if (u.status !== 'approved' || u.uid === adminUser.uid) return false;
      if (input.scopeType === 'all') return true;
      if (input.scopeType === 'department') return u.department === department;
      return u.department === department && u.level === level;
    });
    for (const member of matching) {
      await ensureChatMemberRow(chatId, member.uid);
    }
  }

  emitTableSync('chats');
  emitTableSync('chat_members');
  return chatId;
}

export async function deleteCustomGroup(chatId: string): Promise<void> {
  const { error } = await supabase.from('chats').delete().eq('id', chatId);
  if (error) throw new Error(error.message);
  emitTableSync('chats');
  emitTableSync('chat_members');
}

export async function openOrCreateDmChat(
  currentUser: AppUser,
  targetUser: AppUser
): Promise<string> {
  if (currentUser.uid === targetUser.uid) {
    throw new Error('You cannot start a direct message with yourself.');
  }

  const cached = getCachedDmChatId(currentUser.uid, targetUser.uid);
  if (cached && !isBlockedBetweenUsers(currentUser, targetUser)) {
    return cached;
  }

  const { data, error } = await supabase.rpc('start_dm', {
    other: targetUser.uid,
  });
  if (error) {
    throw new Error(error.message);
  }

  const chatId =
    typeof data === 'string'
      ? data.trim()
      : data && typeof data === 'object'
        ? String(
            (data as { id?: unknown; chat_id?: unknown; start_dm?: unknown }).id ||
              (data as { chat_id?: unknown }).chat_id ||
              (data as { start_dm?: unknown }).start_dm ||
              ''
          ).trim()
        : '';

  if (!chatId) {
    throw new Error('Could not open direct conversation.');
  }

  cacheDmChatPair(currentUser.uid, targetUser.uid, chatId);
  emitTableSync('chats');
  emitTableSync('chat_members');
  return chatId;
}

async function updateChatMetadata(
  chatId: string,
  updater: (current: ChatThread) => Partial<ChatMetaEnvelope>,
  columnUpdates: Record<string, unknown> = {}
): Promise<void> {
  const { data: row, error: fetchErr } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (!row) return;

  const thread = mapChatRowToChatThread(row as ChatRow);
  const { meta: existingEnvelope } = decodeEnvelope<ChatMetaEnvelope>((row as ChatRow).last_message);
  const overrides = updater(thread);
  const mergedEnvelope: ChatMetaEnvelope = {
    ...(existingEnvelope || {}),
    __gsu: 1,
    type: thread.type,
    accessKey: thread.accessKey || '',
    lastMessageText: thread.lastMessageText || '',
    lastMessageSender: thread.lastMessageSender || 'GSU Connect',
    updatedAt: new Date().toISOString(),
    ...overrides,
  };

  const { error } = await supabase
    .from('chats')
    .update({
      last_message: encodeEnvelope(mergedEnvelope as Record<string, unknown>),
      ...columnUpdates,
    })
    .eq('id', chatId);
  if (error) throw new Error(error.message);
  emitTableSync('chats', chatId);
}

export async function togglePinChatForUser(
  uid: string,
  chatId: string,
  currentPinnedChatIds: string[] = []
): Promise<boolean> {
  if (!uid || !chatId) return false;
  const isAlreadyPinned = currentPinnedChatIds.includes(chatId);
  if (!isAlreadyPinned && currentPinnedChatIds.length >= MAX_PINNED_CHATS) {
    throw new Error(`You can pin up to ${MAX_PINNED_CHATS} chats. Unpin one first.`);
  }

  const nextPinned = !isAlreadyPinned;
  const { data: updatedRows, error: updErr } = await supabase
    .from('chat_members')
    .update({ is_pinned: nextPinned })
    .eq('user_id', uid)
    .eq('chat_id', chatId)
    .select('chat_id');

  if (updErr) throw new Error(updErr.message);

  if (!updatedRows || updatedRows.length === 0) {
    const { error: insErr } = await supabase.from('chat_members').upsert(
      {
        user_id: uid,
        chat_id: chatId,
        is_pinned: nextPinned,
        unread_count: 0,
        joined_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,chat_id' }
    );
    if (insErr) throw new Error(insErr.message);
  }

  emitTableSync('chat_members', uid);
  emitTableSync('profiles', uid);
  return nextPinned;
}

// ============================================================
// Messages, Storage Media & Length Enforcement (Issues #7 & #10)
// ============================================================

function buildReplyMeta(replyTo?: ReplyTarget | null): Partial<MessageMetaEnvelope> {
  if (!replyTo || !replyTo.messageId) return {};
  return {
    replyToMessageId: clampStr(replyTo.messageId, 64),
    replyToSenderName: clampStr(replyTo.senderName, 40) || 'Member',
    replyToSnippet: clampStr(replyTo.snippet, 80) || 'Message',
    replyToMessageType: replyTo.messageType && replyTo.messageType !== 'text'
      ? replyTo.messageType
      : undefined,
  };
}

function fitEnvelopeWithinLimit(envelope: MessageMetaEnvelope): string {
  const basePayload: Record<string, unknown> = { __gsu: 1, ...envelope };
  let encoded = encodeEnvelope(basePayload);
  if (encoded.length <= MAX_MESSAGE_CONTENT_LENGTH) {
    return encoded;
  }

  if (typeof envelope.replyToSnippet === 'string' && envelope.replyToSnippet.length > 16) {
    const trimmed = { ...basePayload, replyToSnippet: clampStr(envelope.replyToSnippet, 24) };
    encoded = encodeEnvelope(trimmed);
    if (encoded.length <= MAX_MESSAGE_CONTENT_LENGTH) return encoded;
  }

  if (typeof envelope.senderName === 'string' && envelope.senderName.length > 24) {
    const trimmed = {
      ...basePayload,
      replyToSnippet: envelope.replyToSnippet ? clampStr(envelope.replyToSnippet, 20) : undefined,
      senderName: clampStr(envelope.senderName, 24),
    };
    encoded = encodeEnvelope(trimmed);
    if (encoded.length <= MAX_MESSAGE_CONTENT_LENGTH) return encoded;
  }

  throw new Error(
    `Message exceeds the ${MAX_MESSAGE_CONTENT_LENGTH}-character limit. Please shorten your message or notes.`
  );
}

async function insertMessageAndUpdateChat(params: {
  id?: string;
  chatId: string;
  sender: AppUser;
  envelope: MessageMetaEnvelope;
  plainTextOnly?: boolean;
  mediaUrl?: string | null;
  fileName?: string | null;
  isViewOnce?: boolean;
  replyToId?: string | null;
}): Promise<void> {
  const msgId = params.id || crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const usePlain =
    params.plainTextOnly &&
    !params.replyToId &&
    (!params.envelope.messageType || params.envelope.messageType === 'text');

  const content = usePlain
    ? params.envelope.text
    : fitEnvelopeWithinLimit(params.envelope);

  if (content.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(
      `Message exceeds the ${MAX_MESSAGE_CONTENT_LENGTH}-character limit. Please shorten your text.`
    );
  }

  const { error } = await supabase.from('messages').insert({
    id: msgId,
    chat_id: params.chatId,
    sender_id: params.sender.uid,
    reply_to_id: params.replyToId || null,
    content,
    reactions: {},
    media_url: params.mediaUrl || null,
    file_name: params.fileName || null,
    is_view_once: Boolean(params.isViewOnce),
    is_edited: false,
    is_deleted: false,
    viewed_by: [],
    starred_by: [],
    created_at: nowIso,
  });
  if (error) {
    if (error.message.toLowerCase().includes('content') || error.code === '23514') {
      throw new Error(
        `Message exceeds the ${MAX_MESSAGE_CONTENT_LENGTH}-character database limit. Please shorten your text.`
      );
    }
    throw new Error(error.message);
  }

  emitTableSync('messages', params.chatId);
  emitTableSync('chats', params.chatId);
}

export async function sendMessage(
  chatId: string,
  sender: AppUser,
  rawText: string,
  replyTo?: ReplyTarget | null
): Promise<void> {
  const trimmed = rawText.trim();
  if (!trimmed) return;
  if (trimmed.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(
      `Message is too long (${trimmed.length}/${MAX_MESSAGE_CONTENT_LENGTH} characters).`
    );
  }

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    plainTextOnly: true,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text: trimmed,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'text',
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function sendVoiceMessage(
  chatId: string,
  sender: AppUser,
  audioBlob: Blob,
  durationSec: number,
  replyTo?: ReplyTarget | null,
  isViewOnce: boolean = false
): Promise<void> {
  if (!chatId || !audioBlob || audioBlob.size < 1) return;
  if (audioBlob.size > MAX_VOICE_NOTE_BYTES) {
    throw new Error('Voice note exceeds the 5 MB limit. Please record a shorter clip.');
  }

  const ext = audioBlob.type.includes('mp4')
    ? 'm4a'
    : audioBlob.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  const storagePath = `${chatId}/${crypto.randomUUID()}_voice.${ext}`;
  await uploadToStorageBucket(
    'chat-files',
    storagePath,
    audioBlob,
    audioBlob.type || 'audio/webm'
  );

  const safeDuration = Math.min(180, Math.max(1, Math.round(durationSec || 1)));
  const summaryText = isViewOnce
    ? 'View-once voice message'
    : `Voice note (${formatAudioDuration(safeDuration)})`;

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    mediaUrl: storagePath,
    isViewOnce,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text: summaryText,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'voice',
      audioDurationSec: safeDuration,
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function sendPollMessage(
  chatId: string,
  sender: AppUser,
  rawQuestion: string,
  rawOptions: string[],
  replyTo?: ReplyTarget | null
): Promise<void> {
  const pollQuestion = clampStr(rawQuestion, 160);
  const pollOptions = rawOptions
    .map((opt) => clampStr(opt, 80))
    .filter((opt) => opt.length > 0)
    .slice(0, 6);

  if (pollQuestion.length < 2) {
    throw new Error('Poll question must be at least 2 characters.');
  }
  if (pollOptions.length < 2) {
    throw new Error('Please provide at least 2 non-empty poll options.');
  }

  const summary = clampStr(`Poll: ${pollQuestion}`, 180);
  await insertMessageAndUpdateChat({
    chatId,
    sender,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text: summary,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'poll',
      pollQuestion,
      pollOptions,
      pollVotes: {},
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function voteOnPoll(
  chatId: string,
  messageId: string,
  uid: string,
  optionIndex: number
): Promise<void> {
  if (!chatId || !messageId || !uid) return;
  if (!Number.isInteger(optionIndex) || optionIndex < 0) return;

  const { error } = await supabase.rpc('vote_on_poll', {
    p_message_id: messageId,
    p_option_index: optionIndex,
  });
  if (error) throw new Error(error.message);
  emitTableSync('messages', chatId);
}

export async function sendImageMessage(
  chatId: string,
  sender: AppUser,
  imageBlob: Blob | File,
  rawFileName: string,
  rawCaption: string = '',
  replyTo?: ReplyTarget | null,
  isViewOnce: boolean = false
): Promise<void> {
  if (!imageBlob || imageBlob.size < 1) {
    throw new Error('Selected image is empty.');
  }
  if (imageBlob.size > MAX_CHAT_IMAGE_BYTES) {
    throw new Error('Image exceeds the 5 MB limit. Please pick a smaller image.');
  }
  const fileName = clampStr(rawFileName, 160) || 'image.jpg';
  const safeName = sanitizeStorageFileName(fileName);
  const storagePath = `${chatId}/${crypto.randomUUID()}_${safeName}`;

  await uploadToStorageBucket(
    'chat-files',
    storagePath,
    imageBlob,
    imageBlob.type || 'image/jpeg'
  );

  const caption = isViewOnce ? '' : clampStr(rawCaption, 1400);
  const text = isViewOnce ? 'View-once photo' : caption || `Photo: ${fileName}`;

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    mediaUrl: storagePath,
    fileName,
    isViewOnce,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'image',
      fileSizeBytes: Math.round(imageBlob.size),
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function sendDocumentMessage(
  chatId: string,
  sender: AppUser,
  file: File,
  rawCaption: string = '',
  replyTo?: ReplyTarget | null
): Promise<void> {
  if (!file || file.size < 1) {
    throw new Error('Selected document is empty.');
  }
  if (file.size > MAX_CHAT_DOCUMENT_BYTES) {
    throw new Error('Document exceeds the 5 MB limit for chat files.');
  }

  const fileName = clampStr(file.name, 160) || 'document';
  const safeName = sanitizeStorageFileName(fileName);
  const mimeType = clampStr(file.type || 'application/octet-stream', 100);
  const storagePath = `${chatId}/${crypto.randomUUID()}_${safeName}`;

  await uploadToStorageBucket('chat-files', storagePath, file, mimeType);

  const caption = clampStr(rawCaption, 1400);
  const text = caption || `Document: ${fileName}`;

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    mediaUrl: storagePath,
    fileName,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'document',
      mimeType,
      fileSizeBytes: Math.round(file.size),
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function sendEventMessage(
  chatId: string,
  sender: AppUser,
  input: {
    title: string;
    date: string;
    time: string;
    venue: string;
    notes?: string;
  },
  replyTo?: ReplyTarget | null
): Promise<void> {
  const eventTitle = clampStr(input.title, 120);
  const eventDate = input.date.trim();
  const eventTime = clampStr(input.time, 30);
  const eventVenue = clampStr(input.venue, 90);
  const eventNotes = clampStr(input.notes || '', 180);

  if (eventTitle.length < 2) throw new Error('Event title must be at least 2 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error('Please choose a valid event date.');
  if (!eventTime) throw new Error('Please enter the event time.');
  if (!eventVenue) throw new Error('Please enter the event venue or hall.');

  const text = clampStr(`Event: ${eventTitle} · ${eventDate} at ${eventTime} (${eventVenue})`, 320);

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'event',
      eventTitle,
      eventDate,
      eventTime,
      eventVenue,
      eventNotes,
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function sendContactMessage(
  chatId: string,
  sender: AppUser,
  contact: AppUser,
  replyTo?: ReplyTarget | null
): Promise<void> {
  const contactName = clampStr(contact.fullName, 60);
  if (contactName.length < 2) throw new Error('Selected contact is invalid.');

  const contactDepartment = clampStr(contact.department, 60) || 'General';
  const contactLevel = contact.is_alumni ? 'Alumni' : clampStr(contact.level, 20) || '100';
  const contactIdNumber = clampStr(contact.idNumber, 40) || 'N/A';

  const text = clampStr(`Contact: ${contactName} (${contactDepartment})`, 180);

  await insertMessageAndUpdateChat({
    chatId,
    sender,
    replyToId: replyTo?.messageId || null,
    envelope: {
      text,
      senderName: clampStr(sender.fullName, 50),
      senderRole: appRoleToDbRole(sender.role),
      messageType: 'contact',
      contactUid: contact.uid,
      contactName,
      contactDepartment,
      contactLevel,
      contactIdNumber,
      contactRole: appRoleToDbRole(contact.role),
      ...buildReplyMeta(replyTo),
    },
  });
}

export async function toggleMessageReaction(
  chatId: string,
  messageId: string,
  uid: string,
  emoji: string
): Promise<void> {
  if (!chatId || !messageId || !uid || !emoji) return;
  const { error } = await supabase.rpc('toggle_message_reaction', {
    p_message_id: messageId,
    p_emoji: emoji,
  });
  if (error) throw new Error(error.message);
  emitTableSync('messages', chatId);
}

export async function editTextMessage(
  chatId: string,
  messageId: string,
  rawText: string
): Promise<void> {
  const text = rawText.trim();
  if (!chatId || !messageId || !text) {
    throw new Error('Message cannot be empty.');
  }
  if (text.length > MAX_MESSAGE_CONTENT_LENGTH) {
    throw new Error(
      `Edited message exceeds the ${MAX_MESSAGE_CONTENT_LENGTH}-character limit.`
    );
  }

  const { data: row } = await supabase
    .from('messages')
    .select('content')
    .eq('id', messageId)
    .maybeSingle();
  const { meta } = decodeEnvelope<MessageMetaEnvelope>((row as MessageRow | null)?.content);
  const nextEnvelope: MessageMetaEnvelope = {
    ...(meta || {}),
    __gsu: 1,
    text,
    messageType: meta?.messageType || 'text',
    editedAt: new Date().toISOString(),
  };

  const encoded = fitEnvelopeWithinLimit(nextEnvelope);
  const { error } = await supabase
    .from('messages')
    .update({
      content: encoded,
      is_edited: true,
    })
    .eq('id', messageId);
  if (error) throw new Error(error.message);
  emitTableSync('messages', chatId);
}

export async function deleteMessageForEveryone(
  chatId: string,
  messageId: string,
  actor: AppUser
): Promise<void> {
  if (!chatId || !messageId || !actor.uid) return;
  const { error } = await supabase.rpc('delete_message_for_everyone', {
    p_message_id: messageId,
  });
  if (error) throw new Error(error.message);
  emitTableSync('messages', chatId);
  emitTableSync('starred', actor.uid);
}

export async function openViewOnceMessage(
  chatId: string,
  messageId: string,
  readerUid: string
): Promise<void> {
  if (!chatId || !messageId || !readerUid) return;
  const { error } = await supabase.rpc('open_view_once_message', {
    p_message_id: messageId,
  });
  if (error) throw new Error(error.message);
  emitTableSync('messages', chatId);
}

export async function pinMessageInGroup(
  chatId: string,
  message: ChatMessage,
  actor: AppUser
): Promise<void> {
  if (!chatId || !message.id || message.deletedAt) return;
  const snippet = clampStr(getMessageSnippet(message), 160) || 'Pinned message';

  await updateChatMetadata(
    chatId,
    () => ({
      pinnedMessageText: snippet,
      pinnedMessageSender: clampStr(message.senderName, 50) || 'GSU Member',
      pinnedBy: actor.uid,
      pinnedByName: clampStr(actor.fullName, 50) || 'Moderator',
      pinnedAt: new Date().toISOString(),
    }),
    { pinned_message_id: message.id }
  );
}

export async function unpinMessageInGroup(chatId: string): Promise<void> {
  if (!chatId) return;
  await updateChatMetadata(
    chatId,
    () => ({
      pinnedMessageText: undefined,
      pinnedMessageSender: undefined,
      pinnedBy: undefined,
      pinnedByName: undefined,
      pinnedAt: undefined,
    }),
    { pinned_message_id: null }
  );
}

// Star toggle via security-definer RPC. Both star and unstar funnel here;
// the RPC flips the caller's entry in starred_by (the UI branches on the
// known star state, so the toggle direction is always the intended one).
async function toggleStar(chatId: string, messageId: string, uid: string): Promise<void> {
  const { error } = await supabase.rpc('toggle_message_star', {
    p_message_id: messageId,
  });
  if (error) throw new Error(error.message);
  emitTableSync('starred', uid);
  if (chatId) emitTableSync('messages', chatId);
}

export async function starMessageForUser(
  uid: string,
  chat: ChatThread,
  message: ChatMessage
): Promise<void> {
  if (!uid || !chat.id || !message.id || message.deletedAt) return;
  await toggleStar(chat.id, message.id, uid);
}

export async function unstarMessageForUser(uid: string, messageId: string): Promise<void> {
  if (!uid || !messageId) return;
  // The chat id is unknown here; emit the starred sync so lists refresh.
  await toggleStar('', messageId, uid);
}

// ============================================================
// Read Receipts & Realtime Typing Broadcast
// ============================================================

const READ_RECEIPTS_KEY_PREFIX = 'gsu_read_receipts_chat_';
const activeChatBroadcastChannels = new Map<string, RealtimeChannel>();

function getOrCreateChatBroadcastChannel(chatId: string): RealtimeChannel {
  let ch = activeChatBroadcastChannels.get(chatId);
  if (!ch) {
    ch = supabase.channel(`chat-ephemeral:${chatId}`, {
      config: { broadcast: { self: false } },
    });
    ch.subscribe();
    activeChatBroadcastChannels.set(chatId, ch);
  }
  return ch;
}

export async function markChatAsRead(
  uid: string,
  chatId: string,
  fullName?: string
): Promise<void> {
  if (!uid || !chatId) return;
  const nowMs = Date.now();
  const userReads = readLocalStorage<Record<string, number>>(`gsu_chat_reads_${uid}`, {});
  userReads[chatId] = Math.max(userReads[chatId] ?? 0, nowMs);
  writeLocalStorage(`gsu_chat_reads_${uid}`, userReads);
  const isChatThread = chatId !== ANNOUNCEMENTS_READ_KEY;

  if (isChatThread) {
    await supabase
      .from('chat_members')
      .update({ unread_count: 0 })
      .eq('user_id', uid)
      .eq('chat_id', chatId);

    const storageKey = `${READ_RECEIPTS_KEY_PREFIX}${chatId}`;
    const saved = readLocalStorage<Record<string, { fullName: string; ms: number }>>(storageKey, {});
    saved[uid] = { fullName: clampStr(fullName || 'GSU Member', 100), ms: nowMs };
    writeLocalStorage(storageKey, saved);

    try {
      const ch = getOrCreateChatBroadcastChannel(chatId);
      ch.send({
        type: 'broadcast',
        event: 'read_receipt',
        payload: { uid, fullName: clampStr(fullName || 'GSU Member', 100), ms: nowMs },
      }).catch(() => undefined);
    } catch {
      // Ignore broadcast error
    }
  }

  emitTableSync('chat_reads', uid);
}

export async function setTypingStatus(chatId: string, user: AppUser): Promise<void> {
  if (!chatId || !user.uid) return;
  try {
    const ch = getOrCreateChatBroadcastChannel(chatId);
    await ch.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        uid: user.uid,
        fullName: clampStr(user.fullName, 100) || 'GSU Member',
        ms: Date.now(),
        typing: true,
      },
    });
  } catch {
    // Ignore typing broadcast failure
  }
}

export async function clearTypingStatus(chatId: string, uid: string): Promise<void> {
  if (!chatId || !uid) return;
  try {
    const ch = getOrCreateChatBroadcastChannel(chatId);
    await ch.send({
      type: 'broadcast',
      event: 'typing',
      payload: {
        uid,
        fullName: '',
        ms: Date.now(),
        typing: false,
      },
    });
  } catch {
    // Ignore typing broadcast failure
  }
}

// ============================================================
// Announcements, Message Reports, Admin & Departments (Issues #1, #2, #4, #6, #9)
// ============================================================

export async function createAnnouncement(
  author: AppUser,
  rawTitle: string,
  rawBody: string,
  rawScope: string
): Promise<void> {
  if (author.role === 'student') {
    throw new Error('Only admins, class reps, dept helpers, and lecturers can post announcements.');
  }
  const title = clampStr(rawTitle, 140);
  const body = clampStr(rawBody, 3000);
  const scope = clampStr(rawScope, 80);

  if (title.length < 2 || body.length < 2) {
    throw new Error('Please enter both a title and message.');
  }

  const { error } = await supabase.from('announcements').insert({
    id: crypto.randomUUID(),
    title,
    body,
    scope,
    author_id: author.uid,
    author_name: clampStr(author.fullName, 100),
    author_role: appRoleToDbRole(author.role),
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  emitTableSync('announcements');
}

export async function deleteAnnouncement(announcementId: string): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', announcementId);
  if (error) throw new Error(error.message);
  emitTableSync('announcements');
}

export async function submitMessageReport(
  chat: ChatThread,
  message: ChatMessage,
  reporter: AppUser,
  reason: ReportReason,
  rawDetails: string
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase.from('message_reports').insert({
    id: crypto.randomUUID(),
    chat_id: chat.id,
    message_id: message.id,
    message_text: clampStr(message.text, 2000),
    reported_user_id: message.senderId,
    reporter_id: reporter.uid,
    reason,
    details: clampStr(rawDetails, 500),
    status: 'open',
    resolution_action: '',
    created_at: nowIso,
    updated_at: nowIso,
  });
  if (error) throw new Error(error.message);
  emitTableSync('reports');
}

export async function resolveReportDeleteMessage(report: ModerationReport): Promise<void> {
  const { error: msgErr } = await supabase
    .from('messages')
    .delete()
    .eq('id', report.messageId);
  if (msgErr) throw new Error(msgErr.message);

  const { error: repErr } = await supabase
    .from('message_reports')
    .update({
      status: 'resolved',
      resolution_action: 'message_deleted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', report.id);
  if (repErr) throw new Error(repErr.message);

  emitTableSync('messages', report.chatId);
  emitTableSync('reports');
}

export async function resolveReportSuspendUser(report: ModerationReport): Promise<void> {
  const { error: rpcErr } = await supabase.rpc('review_signup', {
    target: report.reportedUserId,
    new_status: 'suspended',
    reason: clampStr(report.reason || 'Suspended via moderation review', 300),
  });
  if (rpcErr) throw new Error(rpcErr.message);

  const { error: repErr } = await supabase
    .from('message_reports')
    .update({
      status: 'resolved',
      resolution_action: 'user_suspended',
      updated_at: new Date().toISOString(),
    })
    .eq('id', report.id);
  if (repErr) throw new Error(repErr.message);

  emitTableSync('profiles', report.reportedUserId);
  emitTableSync('reports');
}

export async function dismissReport(reportId: string): Promise<void> {
  const { error } = await supabase
    .from('message_reports')
    .update({
      status: 'dismissed',
      resolution_action: 'dismissed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId);
  if (error) throw new Error(error.message);
  emitTableSync('reports');
}

export async function approveOrRejectUser(
  targetUser: AppUser,
  decision: 'approved' | 'rejected',
  assignedRole?: UserRole,
  rejectionReason?: string
): Promise<void> {
  const cleanReason =
    decision === 'rejected' && rejectionReason
      ? clampStr(rejectionReason, 300)
      : null;

  const { error: reviewErr } = await supabase.rpc('review_signup', {
    target: targetUser.uid,
    new_status: decision,
    reason: cleanReason,
  });
  if (reviewErr) throw new Error(reviewErr.message);

  if (decision === 'approved' && assignedRole && assignedRole !== targetUser.role) {
    const { error: roleErr } = await supabase.rpc('set_role', {
      target: targetUser.uid,
      new_role: appRoleToDbRole(assignedRole),
    });
    if (roleErr) throw new Error(roleErr.message);
  }

  emitTableSync('profiles', targetUser.uid);
  emitTableSync('chats');
  emitTableSync('chat_members');
}

let cachedUnloadAccessToken: string | null = null;
if (typeof window !== 'undefined') {
  supabase.auth
    .getSession()
    .then(({ data }) => {
      cachedUnloadAccessToken = data.session?.access_token || null;
    })
    .catch(() => undefined);
  supabase.auth.onAuthStateChange((_event, session) => {
    cachedUnloadAccessToken = session?.access_token || null;
  });
}

export function flushApproveOrRejectKeepalive(
  targetUser: AppUser,
  decision: 'approved' | 'rejected',
  assignedRole?: UserRole,
  rejectionReason?: string
): void {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const token = cachedUnloadAccessToken;

  if (!supabaseUrl || !supabaseAnonKey || !token || typeof fetch !== 'function') {
    void approveOrRejectUser(targetUser, decision, assignedRole, rejectionReason).catch(
      () => undefined
    );
    return;
  }

  const cleanReason =
    decision === 'rejected' && rejectionReason
      ? clampStr(rejectionReason, 300)
      : null;

  const headers = {
    'Content-Type': 'application/json',
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token}`,
  };

  const reviewReq = fetch(`${supabaseUrl}/rest/v1/rpc/review_signup`, {
    method: 'POST',
    keepalive: true,
    headers,
    body: JSON.stringify({
      target: targetUser.uid,
      new_status: decision,
      reason: cleanReason,
    }),
  });

  if (decision === 'approved' && assignedRole && assignedRole !== targetUser.role) {
    void reviewReq
      .then(() =>
        fetch(`${supabaseUrl}/rest/v1/rpc/set_role`, {
          method: 'POST',
          keepalive: true,
          headers,
          body: JSON.stringify({
            target: targetUser.uid,
            new_role: appRoleToDbRole(assignedRole),
          }),
        })
      )
      .catch(() => undefined);
  } else {
    void reviewReq.catch(() => undefined);
  }
}

export async function countActiveAdmins(): Promise<number> {
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .eq('status', 'approved');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function updateUserRoleAndStatus(
  targetUid: string,
  updates: {
    role?: UserRole;
    status?: UserStatus;
    department?: string;
    reason?: string;
  }
): Promise<void> {
  if (updates.role) {
    const { error } = await supabase.rpc('set_role', {
      target: targetUid,
      new_role: appRoleToDbRole(updates.role),
    });
    if (error) throw new Error(error.message);
  }

  if (updates.status && updates.status !== 'pending') {
    const { error } = await supabase.rpc('review_signup', {
      target: targetUid,
      new_status: updates.status,
      reason: updates.reason ? clampStr(updates.reason, 300) : null,
    });
    if (error) throw new Error(error.message);
  }

  if (updates.department !== undefined) {
    const dept = clampStr(updates.department, 80);
    if (dept.length < 2) {
      throw new Error('Department name must be at least 2 characters.');
    }
    const { error } = await supabase.rpc('admin_set_department', {
      target: targetUid,
      new_department: dept,
    });
    if (error) throw new Error(error.message);
  }

  emitTableSync('profiles', targetUid);
  emitTableSync('chats');
}

function isMissingTableError(error?: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = (error.code || '').toUpperCase();
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export async function seedDefaultAuthConfigIfMissing(): Promise<void> {
  const { data, error: fetchErr } = await supabase
    .from('app_settings')
    .select('key')
    .eq('key', 'allowed_email_domain')
    .maybeSingle();
  if (isMissingTableError(fetchErr)) return;
  if (data) return;

  const { error: upsertErr } = await supabase.from('app_settings').upsert(
    {
      key: 'allowed_email_domain',
      value: DEFAULT_ALLOWED_EMAIL_DOMAIN,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (isMissingTableError(upsertErr)) return;
  if (upsertErr) throw new Error(upsertErr.message);
  emitTableSync('config');
}

export async function updateAllowedEmailDomain(rawDomain: string): Promise<string> {
  const clean = normalizeEmailDomain(rawDomain);
  if (!isValidEmailDomain(clean)) {
    throw new Error('Please enter a valid email domain (e.g. gsu.edu.ng).');
  }
  const { error } = await supabase.from('app_settings').upsert(
    {
      key: 'allowed_email_domain',
      value: clean,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' }
  );
  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('The app_settings table is not in Supabase yet. Run the SQL migration first.');
    }
    throw new Error(error.message);
  }
  emitTableSync('config');
  return clean;
}

export async function seedDefaultDepartmentsIfEmpty(): Promise<number> {
  const { count, error: countErr } = await supabase
    .from('departments')
    .select('id', { count: 'exact', head: true });
  if (isMissingTableError(countErr)) return 0;
  if (countErr) throw new Error(countErr.message);
  if ((count || 0) > 0) return 0;

  const nowIso = new Date().toISOString();
  const rows = DEFAULT_GSU_DEPARTMENTS.map((d) => ({
    id: crypto.randomUUID(),
    name: clampStr(d.name, 80),
    faculty: clampStr(d.faculty, 80),
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const { error } = await supabase
    .from('departments')
    .upsert(rows, { onConflict: 'name', ignoreDuplicates: true });
  if (isMissingTableError(error)) return 0;
  if (error) throw new Error(error.message);

  emitTableSync('departments');
  return rows.length;
}

export async function saveDepartment(input: {
  id?: string;
  name: string;
  faculty: string;
}): Promise<void> {
  const name = clampStr(input.name, 80);
  const faculty = clampStr(input.faculty, 80);
  if (name.length < 2 || faculty.length < 2) {
    throw new Error('Department name and faculty must each be at least 2 characters.');
  }

  const nowIso = new Date().toISOString();
  if (input.id) {
    const { error } = await supabase
      .from('departments')
      .update({ name, faculty, updated_at: nowIso })
      .eq('id', input.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('departments').insert({
      id: crypto.randomUUID(),
      name,
      faculty,
      created_at: nowIso,
      updated_at: nowIso,
    });
    if (error) throw new Error(error.message);
  }

  emitTableSync('departments');
}

export async function countUsersInDepartment(departmentName: string): Promise<number> {
  const clean = clampStr(departmentName, 80);
  if (!clean) return 0;
  const { count, error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('department', clean);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deleteDepartment(departmentId: string): Promise<void> {
  const { error } = await supabase.from('departments').delete().eq('id', departmentId);
  if (error) throw new Error(error.message);
  emitTableSync('departments');
}

// ============================================================
// Academic Resource Repository (Issue #7: `resources` bucket + RPC)
// ============================================================

export interface CreateResourceInput {
  title: string;
  description: string;
  category: ResourceCategory;
  faculty: string;
  department: string;
  level: ResourceLevel;
  courseCode: string;
  file: File;
}

export async function createAcademicResource(
  author: AppUser,
  input: CreateResourceInput
): Promise<void> {
  const title = clampStr(input.title, 140);
  const description = clampStr(input.description, 400);
  const faculty = clampStr(input.faculty, 80);
  const department = clampStr(input.department, 80);
  const courseCode = clampStr(input.courseCode.toUpperCase(), 20);
  const file = input.file;

  if (title.length < 2) throw new Error('Resource title must be at least 2 characters.');
  if (faculty.length < 2 || department.length < 2) {
    throw new Error('Please choose a faculty and department.');
  }
  if (courseCode.length < 2) {
    throw new Error('Please enter a valid course code (e.g., PHYS 401).');
  }
  if (!file || file.size < 1) {
    throw new Error('Please attach a valid file.');
  }
  if (file.size > MAX_RESOURCE_FILE_BYTES) {
    throw new Error('File exceeds the 10 MB limit for repository materials.');
  }

  const fileName = clampStr(file.name, 160) || 'resource';
  const mimeType = clampStr(file.type || 'application/octet-stream', 120);
  const safeName = sanitizeStorageFileName(fileName);
  const path = `${author.uid}/${crypto.randomUUID()}_${safeName}`;

  await uploadToStorageBucket('resources', path, file, mimeType);
  const publicUrl = getPublicStorageUrl('resources', path);

  const encodedTitle = encodeEnvelope({
    __gsu: 1,
    title,
    description,
    category: input.category,
    faculty,
    fileName,
    mimeType,
    fileSizeBytes: Math.round(file.size),
    authorId: author.uid,
    authorName: clampStr(author.fullName, 100),
    authorRole: appRoleToDbRole(author.role),
  });

  const { error } = await supabase.from('resources').insert({
    id: crypto.randomUUID(),
    title: encodedTitle,
    department,
    level: input.level,
    course_code: courseCode,
    downloads: 0,
    file_url: publicUrl,
    file_type: mimeType,
    uploaded_by: author.uid,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  emitTableSync('resources');
}

export async function incrementResourceDownload(resourceId: string): Promise<void> {
  if (!resourceId) return;
  const { error } = await supabase.rpc('increment_downloads', { rid: resourceId });
  if (error) throw new Error(error.message);
  emitTableSync('resources');
}

export async function deleteAcademicResource(resourceId: string): Promise<void> {
  if (!resourceId) return;
  const { data: existing } = await supabase
    .from('resources')
    .select('file_url')
    .eq('id', resourceId)
    .maybeSingle();
  const objectPath = extractPublicUrlObjectPath(
    (existing as { file_url?: string | null } | null)?.file_url,
    'resources'
  );
  const { error } = await supabase.from('resources').delete().eq('id', resourceId);
  if (error) throw new Error(error.message);
  await removeStorageObjectBestEffort('resources', objectPath);
  emitTableSync('resources');
}

// ============================================================
// Campus Marketplace & Noticeboard (Issue #7: `chat-media` bucket)
// ============================================================

export interface CreateMarketplaceListingInput {
  title: string;
  description: string;
  category: MarketplaceCategory;
  listingType: MarketplaceListingType;
  priceNaira: number;
  condition: MarketplaceCondition;
  location: string;
  imageFile?: Blob | File | null;
}

export async function createMarketplaceListing(
  seller: AppUser,
  input: CreateMarketplaceListingInput
): Promise<void> {
  const title = clampStr(input.title, 120);
  const description = clampStr(input.description, 1000);
  const location = clampStr(input.location, 100);
  const priceNaira = Math.max(0, Math.min(100_000_000, Math.round(input.priceNaira || 0)));

  if (title.length < 2) throw new Error('Listing title must be at least 2 characters.');
  if (description.length < 2) {
    throw new Error('Please provide a short description for your listing.');
  }

  let imageUrl: string | null = null;
  if (input.imageFile) {
    if (input.imageFile.size > MAX_MARKETPLACE_IMAGE_BYTES) {
      throw new Error('Listing photo exceeds the 10 MB limit.');
    }
    const ext = input.imageFile.type === 'image/png' ? 'png' : 'jpg';
    const path = `${seller.uid}/${crypto.randomUUID()}_listing.${ext}`;
    await uploadToStorageBucket(
      'chat-media',
      path,
      input.imageFile,
      input.imageFile.type || 'image/jpeg'
    );
    imageUrl = getPublicStorageUrl('chat-media', path);
  }

  const { error } = await supabase.from('marketplace_listings').insert({
    id: crypto.randomUUID(),
    seller_id: seller.uid,
    title,
    description,
    category: input.category,
    listing_type: input.listingType,
    condition: input.condition,
    location,
    price: priceNaira,
    images: imageUrl ? [imageUrl] : [],
    is_sold: false,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  emitTableSync('marketplace_listings');
}

export async function updateMarketplaceListing(
  listingId: string,
  updates: {
    status?: MarketplaceStatus;
    priceNaira?: number;
    title?: string;
    description?: string;
    condition?: MarketplaceCondition;
    location?: string;
  }
): Promise<void> {
  if (!listingId) return;
  const payload: Record<string, unknown> = {};
  if (updates.status !== undefined) payload.is_sold = updates.status === 'sold';
  if (updates.priceNaira !== undefined) {
    payload.price = Math.max(0, Math.min(100_000_000, Math.round(updates.priceNaira)));
  }
  if (updates.title !== undefined) {
    const clean = clampStr(updates.title, 120);
    if (clean.length < 2) throw new Error('Title must be at least 2 characters.');
    payload.title = clean;
  }
  if (updates.description !== undefined) {
    const clean = clampStr(updates.description, 1000);
    if (clean.length < 2) throw new Error('Description must be at least 2 characters.');
    payload.description = clean;
  }
  if (updates.condition !== undefined) payload.condition = updates.condition;
  if (updates.location !== undefined) payload.location = clampStr(updates.location, 100);

  const { error } = await supabase
    .from('marketplace_listings')
    .update(payload)
    .eq('id', listingId);
  if (error) throw new Error(error.message);
  emitTableSync('marketplace_listings');
}

export async function deleteMarketplaceListing(listingId: string): Promise<void> {
  if (!listingId) return;
  const { data: existing } = await supabase
    .from('marketplace_listings')
    .select('images')
    .eq('id', listingId)
    .maybeSingle();
  const images = Array.isArray((existing as { images?: unknown } | null)?.images)
    ? ((existing as { images: unknown[] }).images as unknown[])
    : [];
  const { error } = await supabase.from('marketplace_listings').delete().eq('id', listingId);
  if (error) throw new Error(error.message);
  for (const image of images) {
    if (typeof image !== 'string') continue;
    await removeStorageObjectBestEffort(
      'chat-media',
      extractPublicUrlObjectPath(image, 'chat-media')
    );
  }
  emitTableSync('marketplace_listings');
}

// ============================================================
// Campus Event Calendar & Exam Timetable
// ============================================================

export interface SaveCalendarEventInput {
  title: string;
  description: string;
  eventType: CalendarEventType;
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  courseCode: string;
  department: string;
  level: CalendarLevel;
}

function buildIsoTimestampForDateAndTime(date: string, time: string): string {
  const safeTime = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '09:00';
  const candidate = new Date(`${date}T${safeTime}:00`);
  if (Number.isFinite(candidate.getTime())) return candidate.toISOString();
  return new Date(`${date}T09:00:00Z`).toISOString();
}

export async function createCalendarEvent(
  author: AppUser,
  input: SaveCalendarEventInput
): Promise<void> {
  if (!['admin', 'classRep', 'deptHelper', 'lecturer'].includes(author.role)) {
    throw new Error('Only admins, class reps, dept helpers, and lecturers can post timetable entries.');
  }
  const title = clampStr(input.title, 140);
  const description = clampStr(input.description, 1000);
  const date = input.date.trim();
  const startTime = clampStr(input.startTime, 20);
  const endTime = clampStr(input.endTime, 20);
  const venue = clampStr(input.venue, 100);
  const courseCode = clampStr(input.courseCode.toUpperCase(), 20);
  const requestedDept = clampStr(input.department || '', 80);
  const department =
    author.role === 'admin'
      ? requestedDept || 'All GSU'
      : requestedDept.toLowerCase() === 'all gsu'
        ? 'All GSU'
        : clampStr(author.department, 80);

  if (title.length < 2) throw new Error('Title must be at least 2 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Please choose a valid date.');
  if (startTime.length < 1) throw new Error('Please provide a start time.');
  if (venue.length < 1) throw new Error('Please provide a venue or hall.');
  if (department.length < 2) throw new Error('Please choose a department.');

  const startIso = buildIsoTimestampForDateAndTime(date, startTime);
  const endIso = endTime ? buildIsoTimestampForDateAndTime(date, endTime) : startIso;
  const encodedDesc = encodeEnvelope({
    __gsu: 1,
    kind: 'calendar',
    description,
    eventType: input.eventType,
    date,
    startTime,
    endTime,
    courseCode,
    level: input.level,
    authorId: author.uid,
    authorName: clampStr(author.fullName, 100),
    authorRole: appRoleToDbRole(author.role),
  });

  const { error } = await supabase.from('events').insert({
    id: crypto.randomUUID(),
    created_by: author.uid,
    title,
    description: encodedDesc,
    department,
    venue,
    start_time: startIso,
    end_time: endIso,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  emitTableSync('events');
}

export async function updateCalendarEvent(
  author: AppUser,
  eventId: string,
  input: SaveCalendarEventInput
): Promise<void> {
  if (!['admin', 'classRep', 'deptHelper', 'lecturer'].includes(author.role)) {
    throw new Error('Only admins, class reps, dept helpers, and lecturers can update timetable entries.');
  }
  const title = clampStr(input.title, 140);
  const description = clampStr(input.description, 1000);
  const date = input.date.trim();
  const startTime = clampStr(input.startTime, 20);
  const endTime = clampStr(input.endTime, 20);
  const venue = clampStr(input.venue, 100);
  const courseCode = clampStr(input.courseCode.toUpperCase(), 20);
  const requestedDept = clampStr(input.department || '', 80);
  const department =
    author.role === 'admin'
      ? requestedDept || 'All GSU'
      : requestedDept.toLowerCase() === 'all gsu'
        ? 'All GSU'
        : clampStr(author.department, 80);

  if (title.length < 2) throw new Error('Title must be at least 2 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Please choose a valid date.');
  if (startTime.length < 1) throw new Error('Please provide a start time.');
  if (venue.length < 1) throw new Error('Please provide a venue or hall.');
  if (department.length < 2) throw new Error('Please choose a department.');

  const startIso = buildIsoTimestampForDateAndTime(date, startTime);
  const endIso = endTime ? buildIsoTimestampForDateAndTime(date, endTime) : startIso;
  const encodedDesc = encodeEnvelope({
    __gsu: 1,
    kind: 'calendar',
    description,
    eventType: input.eventType,
    date,
    startTime,
    endTime,
    courseCode,
    level: input.level,
    authorId: author.uid,
    authorName: clampStr(author.fullName, 100),
    authorRole: appRoleToDbRole(author.role),
  });

  const { error } = await supabase
    .from('events')
    .update({
      title,
      description: encodedDesc,
      department,
      venue,
      start_time: startIso,
      end_time: endIso,
    })
    .eq('id', eventId);
  if (error) throw new Error(error.message);
  emitTableSync('events');
}

export async function deleteCalendarEvent(eventId: string): Promise<void> {
  if (!eventId) return;
  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) throw new Error(error.message);
  emitTableSync('events');
}

// ============================================================
// Campus Status / 24-Hour Updates (Issue #7: `chat-media` bucket)
// ============================================================

export interface CreateCampusStatusInput {
  type: StatusType;
  text: string;
  bgColor?: string;
  imageFile?: Blob | File | null;
}

export async function createCampusStatus(
  author: AppUser,
  input: CreateCampusStatusInput
): Promise<void> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const expiresIso = new Date(now + STATUS_TTL_MS).toISOString();

  let content = '';
  let bgColor: string | null = null;
  let mediaUrl: string | null = null;

  if (input.type === 'text') {
    const cleanText = clampStr(input.text, 400);
    if (!cleanText) throw new Error('Status message cannot be empty.');
    content = cleanText;
    bgColor =
      input.bgColor && /^#[0-9a-fA-F]{6}$/.test(input.bgColor)
        ? input.bgColor
        : STATUS_BG_COLORS[0].hex;
  } else {
    if (!input.imageFile || input.imageFile.size < 1) {
      throw new Error('Please choose a status photo to upload.');
    }
    if (input.imageFile.size > MAX_STATUS_IMAGE_BYTES) {
      throw new Error('Status photo exceeds the 10 MB limit.');
    }
    const ext = input.imageFile.type === 'image/png' ? 'png' : 'jpg';
    const path = `${author.uid}/${crypto.randomUUID()}_status.${ext}`;
    await uploadToStorageBucket(
      'chat-media',
      path,
      input.imageFile,
      input.imageFile.type || 'image/jpeg'
    );
    mediaUrl = getPublicStorageUrl('chat-media', path);
    content = clampStr(input.text || '', 250);
  }

  const { error } = await supabase.from('statuses').insert({
    id: crypto.randomUUID(),
    user_id: author.uid,
    content,
    media_url: mediaUrl,
    bg_color: bgColor,
    expires_at: expiresIso,
    created_at: nowIso,
    viewed_by: [],
  });
  if (error) throw new Error(error.message);
  emitTableSync('statuses');
}

export async function markCampusStatusViewed(
  statusId: string,
  viewerUid: string
): Promise<void> {
  if (!statusId || !viewerUid) return;
  const { data } = await supabase
    .from('statuses')
    .select('viewed_by')
    .eq('id', statusId)
    .maybeSingle();
  const existing = Array.isArray((data as StatusRow | null)?.viewed_by)
    ? ((data as StatusRow).viewed_by as string[])
    : [];
  if (existing.includes(viewerUid)) return;

  const { error } = await supabase
    .from('statuses')
    .update({ viewed_by: [...existing, viewerUid] })
    .eq('id', statusId);
  if (error) console.warn('markCampusStatusViewed warning:', error.message);
  emitTableSync('statuses');
}

export async function deleteCampusStatus(statusId: string): Promise<void> {
  if (!statusId) return;
  const { data: existing } = await supabase
    .from('statuses')
    .select('media_url')
    .eq('id', statusId)
    .maybeSingle();
  const objectPath = extractPublicUrlObjectPath(
    (existing as { media_url?: string | null } | null)?.media_url,
    'chat-media'
  );
  const { error } = await supabase.from('statuses').delete().eq('id', statusId);
  if (error) throw new Error(error.message);
  await removeStorageObjectBestEffort('chat-media', objectPath);
  emitTableSync('statuses');
}

// ============================================================
// Voice Calls & WebRTC Signaling (calls + Broadcast)
// ============================================================

function serializeUserAvatar(user: AppUser): string {
  if (user.photoURL && user.photoURL.length <= 600) {
    return user.photoURL;
  }
  if (user.avatarId) {
    return `preset:${clampStr(user.avatarId, 32)}`;
  }
  return '';
}

const activeCallBroadcastChannels = new Map<string, RealtimeChannel>();

function getOrCreateCallBroadcastChannel(callId: string): RealtimeChannel {
  let ch = activeCallBroadcastChannels.get(callId);
  if (!ch) {
    ch = supabase.channel(`call-rtc:${callId}`, {
      config: { broadcast: { self: false } },
    });
    ch.subscribe();
    activeCallBroadcastChannels.set(callId, ch);
  }
  return ch;
}

export async function createCallSession(
  caller: AppUser,
  receiver: AppUser,
  offerJson?: string
): Promise<VoiceCallSession> {
  if (caller.uid === receiver.uid) {
    throw new Error('You cannot call your own account.');
  }
  if (isBlockedBetweenUsers(caller, receiver)) {
    throw new Error('Voice calls are disabled while this conversation is blocked.');
  }

  let dmChatId = getCachedDmChatId(caller.uid, receiver.uid);
  if (!dmChatId) {
    dmChatId = await openOrCreateDmChat(caller, receiver);
  }

  const callId = crypto.randomUUID();
  const nowIso = new Date().toISOString();
  const parsedOffer = offerJson ? safeJsonParse<Record<string, unknown>>(offerJson) : null;

  const { error } = await supabase.from('calls').insert({
    id: callId,
    caller_id: caller.uid,
    receiver_id: receiver.uid,
    status: 'ringing',
    offer: parsedOffer,
    answer: null,
    caller_candidates: [],
    receiver_candidates: [],
    created_at: nowIso,
  });
  if (error) throw new Error(error.message);

  emitTableSync('calls', callId);

  return {
    id: callId,
    callerId: caller.uid,
    callerName: clampStr(caller.fullName, 100) || 'GSU Member',
    callerAvatar: serializeUserAvatar(caller),
    callerDepartment: clampStr(caller.department || '', 80),
    receiverId: receiver.uid,
    receiverName: clampStr(receiver.fullName, 100) || 'GSU Member',
    receiverAvatar: serializeUserAvatar(receiver),
    receiverDepartment: clampStr(receiver.department || '', 80),
    dmChatId,
    status: 'ringing',
    offer: offerJson,
    createdAt: toAppTimestamp(nowIso),
    updatedAt: toAppTimestamp(nowIso),
  };
}

export async function updateCallSession(
  callId: string,
  updates: {
    status?: VoiceCallStatus;
    offer?: string;
    answer?: string;
    setAcceptedAt?: boolean;
  }
): Promise<void> {
  if (!callId) return;
  const payload: Record<string, unknown> = {};
  if (updates.status) {
    payload.status = updates.status;
    if (
      updates.status === 'ended' ||
      updates.status === 'declined' ||
      updates.status === 'missed'
    ) {
      payload.ended_at = new Date().toISOString();
    }
  }
  if (updates.offer !== undefined) {
    payload.offer = safeJsonParse(updates.offer) ?? updates.offer.slice(0, 16000);
  }
  if (updates.answer !== undefined) {
    payload.answer = safeJsonParse(updates.answer) ?? updates.answer.slice(0, 16000);
  }
  if (updates.setAcceptedAt) {
    payload.started_at = new Date().toISOString();
  }

  const { error } = await supabase.from('calls').update(payload).eq('id', callId);
  if (error) throw new Error(error.message);

  try {
    const ch = getOrCreateCallBroadcastChannel(callId);
    ch.send({
      type: 'broadcast',
      event: 'call_update',
      payload: { callId, ...updates },
    }).catch(() => undefined);
  } catch {
    // Ignore broadcast failure
  }
  emitTableSync('calls', callId);
}

export async function addCallCandidate(
  callId: string,
  role: 'caller' | 'receiver',
  senderId: string,
  candidateJson: string
): Promise<void> {
  if (!callId || !senderId || !candidateJson) return;
  const candidateItem = {
    id: crypto.randomUUID(),
    senderId,
    candidate: candidateJson.slice(0, 4000),
  };

  try {
    const ch = getOrCreateCallBroadcastChannel(callId);
    await ch.send({
      type: 'broadcast',
      event: 'ice_candidate',
      payload: { role, ...candidateItem },
    });
  } catch {
    // Ignore broadcast failure
  }

  const col = role === 'caller' ? 'caller_candidates' : 'receiver_candidates';
  const { data } = await supabase.from('calls').select(col).eq('id', callId).maybeSingle();
  const currentList = Array.isArray((data as Record<string, unknown> | null)?.[col])
    ? ((data as Record<string, unknown>)[col] as unknown[])
    : [];
  const nextList = [...currentList.slice(-24), candidateItem];
  await supabase
    .from('calls')
    .update({ [col]: nextList })
    .eq('id', callId)
    .then(() => undefined);
}

export async function logVoiceCallMessage(params: {
  callId: string;
  dmChatId: string;
  peerId?: string;
  actor: AppUser;
  outcome: CallLogOutcome;
  durationSec?: number;
}): Promise<void> {
  const { callId, peerId, actor, outcome, durationSec = 0 } = params;
  let dmChatId = params.dmChatId;
  if (!callId || !actor.uid) return;

  if (!dmChatId && peerId) {
    dmChatId = getCachedDmChatId(actor.uid, peerId) || '';
    if (!dmChatId) {
      const { data: rpcId } = await supabase.rpc('start_dm', { other: peerId });
      if (typeof rpcId === 'string' && rpcId) {
        dmChatId = rpcId;
        cacheDmChatPair(actor.uid, peerId, dmChatId);
      }
    }
  }
  if (!dmChatId) return;

  if (peerId && actor.blockedUsers?.includes(peerId)) return;

  const safeDuration = Math.max(0, Math.round(Number.isFinite(durationSec) ? durationSec : 0));
  const text =
    outcome === 'completed'
      ? `Voice call • ${formatCallLogDuration(safeDuration)}`
      : outcome === 'declined'
        ? 'Declined voice call'
        : outcome === 'cancelled'
          ? 'Cancelled voice call'
          : 'Missed voice call';

  const msgId = `call_log_${callId}`;
  const deterministicMsgUuid = crypto.randomUUID();
  const { data: recentMsgs } = await supabase
    .from('messages')
    .select('id, content')
    .eq('chat_id', dmChatId)
    .order('created_at', { ascending: false })
    .limit(10);

  const alreadyLogged = (recentMsgs || []).some((m) => {
    const { meta } = decodeEnvelope<MessageMetaEnvelope & { callLogKey?: string }>(
      (m as MessageRow).content
    );
    return meta?.callLogKey === msgId;
  });
  if (alreadyLogged) return;

  await insertMessageAndUpdateChat({
    id: deterministicMsgUuid,
    chatId: dmChatId,
    sender: actor,
    envelope: {
      text,
      senderName: clampStr(actor.fullName, 50) || 'GSU Member',
      senderRole: appRoleToDbRole(actor.role),
      messageType: 'call',
      callOutcome: outcome,
      ...(outcome === 'completed' ? { callDurationSec: safeDuration } : {}),
      callLogKey: msgId,
    } as MessageMetaEnvelope & { callLogKey: string },
  });
}

// ============================================================
// Live Class Radar & Exam Countdown
// ============================================================

export interface UpdateChatLiveRadarInput {
  radarStatus: RadarStatusType;
  radarCourseCode?: string;
  radarVenue?: string;
  radarNote?: string;
  radarExamTitle?: string;
  radarExamAt?: string;
}

export async function updateChatLiveRadar(
  chatId: string,
  actor: AppUser,
  input: UpdateChatLiveRadarInput
): Promise<void> {
  if (!chatId || !actor.uid) return;
  if (!['admin', 'classRep', 'deptHelper', 'lecturer'].includes(actor.role)) {
    throw new Error('Only Class Reps, Dept Helpers, Lecturers, and Admins can broadcast live radar updates.');
  }

  const courseCode = clampStr((input.radarCourseCode || '').toUpperCase(), 24);
  const venue = clampStr(input.radarVenue || '', 100);
  const note = clampStr(input.radarNote || '', 200);
  const examTitle = clampStr(input.radarExamTitle || '', 120);
  const examAt = clampStr(input.radarExamAt || '', 32);

  if (input.radarStatus === 'exam_countdown' && (!examTitle || !examAt)) {
    throw new Error('Please enter both the exam/test title and date & time.');
  }

  await updateChatMetadata(chatId, () => ({
    radarStatus: input.radarStatus,
    radarCourseCode: courseCode || undefined,
    radarVenue: venue || undefined,
    radarNote: note || undefined,
    radarExamTitle: examTitle || undefined,
    radarExamAt: examAt || undefined,
    radarUpdatedBy: actor.uid,
    radarUpdatedByName: clampStr(actor.fullName, 60) || 'Moderator',
    radarUpdatedByRole: appRoleToDbRole(actor.role),
    radarUpdatedAt: new Date().toISOString(),
  }));
}

export async function clearChatLiveRadar(chatId: string): Promise<void> {
  if (!chatId) return;
  await updateChatMetadata(chatId, () => ({
    radarStatus: undefined,
    radarCourseCode: undefined,
    radarVenue: undefined,
    radarNote: undefined,
    radarExamTitle: undefined,
    radarExamAt: undefined,
    radarUpdatedBy: undefined,
    radarUpdatedByName: undefined,
    radarUpdatedByRole: undefined,
    radarUpdatedAt: undefined,
  }));
}

// ============================================================
// Off-Campus (Tumfure) Ride & Errand Share Board
// ============================================================

export interface CreateRideErrandInput {
  postType: RideErrandType;
  title: string;
  details: string;
  origin: string;
  destination: string;
  departureTime: string;
  seatsOrSlots: number;
  costSplitNaira: number;
}

export interface UpdateRideErrandInput {
  title: string;
  details: string;
  origin: string;
  destination: string;
  departureTime: string;
  seatsOrSlots: number;
  costSplitNaira: number;
}

export async function createRideErrand(
  author: AppUser,
  input: CreateRideErrandInput
): Promise<void> {
  const title = clampStr(input.title, 140);
  const details = clampStr(input.details, 500);
  const origin = clampStr(input.origin, 80);
  const destination = clampStr(input.destination, 80);
  const departureTime = clampStr(input.departureTime, 60);
  const seatsOrSlots = Math.max(1, Math.min(20, Math.round(input.seatsOrSlots || 1)));
  const costSplitNaira = Math.max(0, Math.min(1_000_000, Math.round(input.costSplitNaira || 0)));

  if (title.length < 2) throw new Error('Title must be at least 2 characters.');
  if (origin.length < 2 || destination.length < 2) {
    throw new Error('Please specify both pickup/origin and destination.');
  }
  if (departureTime.length < 1) throw new Error('Please enter a departure or pickup time.');

  const nowIso = new Date().toISOString();
  const note = encodeEnvelope({
    __gsu: 1,
    title,
    details,
    costSplitNaira,
    status: 'open' as RideErrandStatus,
    authorId: author.uid,
    authorName: clampStr(author.fullName, 100) || 'GSU Member',
    authorDepartment: clampStr(author.department, 80) || 'General',
    authorLevel: author.is_alumni ? 'Alumni' : clampStr(author.level, 20) || '100',
    authorRole: appRoleToDbRole(author.role),
    updatedAt: nowIso,
  });

  const { error } = await supabase.from('rides_errands').insert({
    id: crypto.randomUUID(),
    post_type: input.postType,
    origin,
    destination,
    departure_time: departureTime,
    seats_available: seatsOrSlots,
    note,
    posted_by: author.uid,
    created_at: nowIso,
  });
  if (error) throw new Error(error.message);
  emitTableSync('rides_errands');
}

export async function updateRideErrand(
  postId: string,
  input: UpdateRideErrandInput
): Promise<void> {
  if (!postId) return;
  const title = clampStr(input.title, 140);
  const details = clampStr(input.details, 500);
  const origin = clampStr(input.origin, 80);
  const destination = clampStr(input.destination, 80);
  const departureTime = clampStr(input.departureTime, 60);
  const seatsOrSlots = Math.max(1, Math.min(20, Math.round(input.seatsOrSlots || 1)));
  const costSplitNaira = Math.max(0, Math.min(1_000_000, Math.round(input.costSplitNaira || 0)));

  if (title.length < 2) throw new Error('Title must be at least 2 characters.');
  if (origin.length < 2 || destination.length < 2) {
    throw new Error('Please specify both pickup/origin and destination.');
  }
  if (departureTime.length < 1) throw new Error('Please enter a departure or pickup time.');

  const { data: existing } = await supabase
    .from('rides_errands')
    .select('note')
    .eq('id', postId)
    .maybeSingle();
  const { meta } = decodeEnvelope<RideErrandMetaEnvelope>((existing as RideErrandRow | null)?.note);
  const note = encodeEnvelope({
    ...(meta || {}),
    __gsu: 1,
    title,
    details,
    costSplitNaira,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('rides_errands')
    .update({
      origin,
      destination,
      departure_time: departureTime,
      seats_available: seatsOrSlots,
      note,
    })
    .eq('id', postId);
  if (error) throw new Error(error.message);
  emitTableSync('rides_errands');
}

export async function updateRideErrandStatus(
  postId: string,
  status: RideErrandStatus
): Promise<void> {
  if (!postId) return;
  const { data: existing } = await supabase
    .from('rides_errands')
    .select('note')
    .eq('id', postId)
    .maybeSingle();
  const { meta } = decodeEnvelope<RideErrandMetaEnvelope>((existing as RideErrandRow | null)?.note);
  const note = encodeEnvelope({
    ...(meta || {}),
    __gsu: 1,
    status,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await supabase.from('rides_errands').update({ note }).eq('id', postId);
  if (error) throw new Error(error.message);
  emitTableSync('rides_errands');
}

export async function deleteRideErrand(postId: string): Promise<void> {
  if (!postId) return;
  const { error } = await supabase.from('rides_errands').delete().eq('id', postId);
  if (error) throw new Error(error.message);
  emitTableSync('rides_errands');
}

// ============================================================
// Anonymous GSU Confessions & Gist (Moderated)
// ============================================================

export async function createConfession(
  author: AppUser,
  category: ConfessionCategory,
  rawText: string
): Promise<ConfessionStatus> {
  const text = clampStr(rawText, 800);
  if (text.length < 4) {
    throw new Error('Confession or gist must be at least 4 characters.');
  }

  const initialStatus: ConfessionStatus = 'pending';
  const nowIso = new Date().toISOString();

  const content = encodeEnvelope({
    __gsu: 1,
    category,
    text,
    updatedAt: nowIso,
  });

  const { error } = await supabase.from('confessions').insert({
    id: crypto.randomUUID(),
    author_id: author.uid,
    content,
    status: initialStatus,
    created_at: nowIso,
  });
  if (error) throw new Error(error.message);
  emitTableSync('confessions');
  return initialStatus;
}

export async function fetchMyConfessions(): Promise<CampusConfession[]> {
  const { data, error } = await supabase.rpc('my_confessions');
  if (error) throw new Error(error.message);
  const rows = Array.isArray(data) ? (data as ConfessionRow[]) : [];
  return mapConfessionRowsWithUpvotes(rows);
}

export async function fetchConfessionAuthor(cid: string): Promise<AppUser | null> {
  if (!cid) return null;
  const { data, error } = await supabase.rpc('confession_author', { cid });
  if (error) throw new Error(error.message);
  if (!data) return null;

  const first = Array.isArray(data) ? data[0] : data;
  if (!first) return null;

  if (typeof first === 'string') {
    const resolved = await resolveProfilesByIds([first]);
    return resolved[first] || null;
  }

  if (typeof first === 'object') {
    const rec = first as Record<string, unknown>;
    const candidateId =
      (typeof rec.id === 'string' && rec.id) ||
      (typeof rec.author_id === 'string' && rec.author_id) ||
      (typeof rec.confession_author === 'string' && rec.confession_author) ||
      '';
    if (typeof rec.full_name === 'string' && candidateId) {
      const mapped = mapProfileRowToAppUser(rec as unknown as ProfileRow);
      profileCache.set(mapped.uid, mapped);
      return mapped;
    }
    if (candidateId) {
      const resolved = await resolveProfilesByIds([candidateId]);
      return resolved[candidateId] || null;
    }
  }

  return null;
}

export async function moderateConfession(
  confessionId: string,
  moderatorUid: string,
  decision: 'approved' | 'rejected'
): Promise<void> {
  if (!confessionId || !moderatorUid) return;
  const { data: existing } = await supabase
    .from('confessions')
    .select('content')
    .eq('id', confessionId)
    .maybeSingle();
  const { meta, plainText } = decodeEnvelope<ConfessionMetaEnvelope>(
    (existing as ConfessionRow | null)?.content
  );
  const content = encodeEnvelope({
    ...(meta || { text: plainText }),
    __gsu: 1,
    moderatedBy: moderatorUid,
    updatedAt: new Date().toISOString(),
  });

  const { error } = await supabase
    .from('confessions')
    .update({ status: decision, content })
    .eq('id', confessionId);
  if (error) throw new Error(error.message);
  emitTableSync('confessions');
}

// Toggles the caller's upvote via the security-definer RPC.
// Returns the server-authoritative state so the UI can update immediately.
export async function toggleConfessionUpvote(
  confessionId: string
): Promise<{ upvoted: boolean; upvoteCount: number }> {
  if (!confessionId) return { upvoted: false, upvoteCount: 0 };
  const { data, error } = await supabase.rpc('toggle_confession_upvote', {
    p_confession_id: confessionId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data)
    ? (data as Array<{ upvoted?: boolean; upvote_count?: number | string }>)[0]
    : (data as { upvoted?: boolean; upvote_count?: number | string } | null);
  emitTableSync('confessions');
  return {
    upvoted: Boolean(row?.upvoted),
    upvoteCount: Number(row?.upvote_count) || 0,
  };
}

export async function deleteConfession(confessionId: string): Promise<void> {
  if (!confessionId) return;
  const { error } = await supabase.from('confessions').delete().eq('id', confessionId);
  if (error) throw new Error(error.message);
  emitTableSync('confessions');
}

// ============================================================
// Supabase Realtime Subscriptions
// ============================================================

export function subscribeToPublicDirectory(
  canReadDepartments: boolean,
  handlers: {
    onDepartments: (items: DepartmentItem[], seeded: boolean) => void;
    onAllowedDomain: (domain: string, exists: boolean) => void;
  }
): () => void {
  let active = true;

  const load = async () => {
    try {
      const settingPromise = supabase
        .from('app_settings')
        .select('key, value')
        .eq('key', 'allowed_email_domain')
        .maybeSingle();

      const deptPromise = canReadDepartments
        ? supabase.from('departments').select('*').order('name', { ascending: true })
        : supabase.rpc('list_departments');

      const [{ data: deptData }, { data: settingRow }] = await Promise.all([
        deptPromise,
        settingPromise,
      ]);
      if (!active) return;

      const domainValue = (settingRow as AppSettingRow | null)?.value;
      handlers.onAllowedDomain(
        domainValue ? normalizeEmailDomain(domainValue) : DEFAULT_ALLOWED_EMAIL_DOMAIN,
        Boolean(domainValue)
      );

      if (Array.isArray(deptData) && deptData.length > 0) {
        handlers.onDepartments(
          (deptData as DepartmentRow[]).map((d) => ({
            id: d.id || slugify(d.name),
            name: d.name,
            faculty: d.faculty,
            durationYears: d.duration_years ?? 4,
            createdAt: d.created_at ? toAppTimestamp(d.created_at) : null,
            updatedAt: d.updated_at
              ? toAppTimestamp(d.updated_at)
              : d.created_at
                ? toAppTimestamp(d.created_at)
                : null,
          })),
          true
        );
      } else {
        handlers.onDepartments([], false);
      }
    } catch {
      if (!active) return;
      handlers.onAllowedDomain(DEFAULT_ALLOWED_EMAIL_DOMAIN, false);
      handlers.onDepartments([], false);
    }
  };

  load();

  let ch = supabase
    .channel(`public-directory:${canReadDepartments ? 'approved' : 'guest'}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, () => load());

  if (canReadDepartments) {
    ch = ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'departments' },
      () => load()
    );
  }
  ch.subscribe();

  const unsubSync = onSyncSignal(
    canReadDepartments ? ['departments', 'config'] : ['config'],
    () => {
      load();
    }
  );

  return () => {
    active = false;
    unsubSync();
    supabase.removeChannel(ch);
  };
}

export function subscribeToOwnProfile(
  uid: string,
  onProfile: (user: AppUser | null) => void
): () => void {
  let active = true;

  const load = async () => {
    const profile = await fetchProfileById(uid).catch(() => null);
    if (active) onProfile(profile);
  };

  load();

  const channel = supabase
    .channel(`profile:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_members', filter: `user_id=eq.${uid}` },
      () => load()
    )
    .subscribe();

  const unsubSync = onSyncSignal(['profiles', 'chat_members'], (scopeId) => {
    if (!scopeId || scopeId === uid) load();
  });

  return () => {
    active = false;
    unsubSync();
    supabase.removeChannel(channel);
  };
}

export interface WorkspaceRealtimeHandlers {
  onChats: (chats: ChatThread[]) => void;
  onApprovedUsers: (users: AppUser[]) => void;
  onPendingUsers: (users: AppUser[]) => void;
  onAllUsers: (users: AppUser[]) => void;
  onAnnouncements: (items: Announcement[]) => void;
  onResources: (items: AcademicResource[]) => void;
  onMarketplace: (items: MarketplaceListing[]) => void;
  onCalendarEvents: (items: CalendarEvent[]) => void;
  onStatuses: (items: CampusStatus[]) => void;
  onRideErrands: (items: RideErrandPost[]) => void;
  onConfessions: (items: CampusConfession[]) => void;
  onStarredMessages: (items: StarredMessage[]) => void;
  onUnreadCounts: (counts: Record<string, number>, readFloors: Record<string, number>) => void;
  onReports: (items: ModerationReport[]) => void;
  onIncomingCalls: (calls: VoiceCallSession[]) => void;
  onPaginationState?: (state: WorkspacePaginationState) => void;
  onError?: (errorMessage: string | null) => void;
}

export function subscribeToWorkspaceData(
  currentUser: AppUser,
  activeChatIdGetter: () => string | null,
  handlers: WorkspaceRealtimeHandlers
): WorkspaceDataHandle {
  let active = true;
  const uid = currentUser.uid;
  const role = currentUser.role;
  const userDept = currentUser.department;
  const userLevel = currentUser.level;
  const isReviewer = ['admin', 'classRep', 'deptHelper'].includes(role);

  const latestUsersMap = new Map<string, AppUser>();
  profileCache.forEach((u, k) => latestUsersMap.set(k, u));
  latestUsersMap.set(currentUser.uid, currentUser);
  profileCache.set(currentUser.uid, currentUser);

  let latestChatRows: ChatRow[] = [];
  let latestMemberRows: ChatMemberRow[] = [];
  let latestDmParticipants = new Map<string, string[]>();
  let latestChatsMap = new Map<string, ChatThread>();

  let currentApprovedUsers: AppUser[] = [];
  let currentPendingUsers: AppUser[] = [];
  let currentAllUsers: AppUser[] = [];
  let currentAnnouncements: AnnouncementRow[] = [];
  let currentEventRows: EventRow[] = [];
  let currentResourceRows: ResourceRow[] = [];
  let currentMarketplaceRows: MarketplaceRow[] = [];
  let currentStatusRows: StatusRow[] = [];
  let currentRideErrandRows: RideErrandRow[] = [];
  let currentConfessionRows: ConfessionRow[] = [];
  let currentReportRows: MessageReportRow[] = [];

  const paginationState: WorkspacePaginationState = {
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

  const emitPagination = () => {
    if (!active) return;
    handlers.onPaginationState?.({ ...paginationState });
  };

  const reportError = (msg: string | null) => {
    if (!active) return;
    handlers.onError?.(msg);
  };

  const absorbProfiles = (users: AppUser[]) => {
    cacheUsers(users);
    for (const u of users) {
      latestUsersMap.set(u.uid, u);
    }
  };

  const ensureProfilesLoaded = async (ids: string[]): Promise<boolean> => {
    const missing = ids.filter((id) => id && !latestUsersMap.has(id));
    if (missing.length === 0) return false;
    const resolved = await resolveProfilesByIds(missing);
    if (!active) return false;
    const values = Object.values(resolved);
    if (values.length === 0) return false;
    absorbProfiles(values);
    return true;
  };

  let dmGroupMsgChannel: RealtimeChannel | null = null;
  let lastDmGroupIdsKey = '';
  let lastChatFetchAt = 0;
  let chatDebounceTimer: number | null = null;

  const refreshProfiles = async () => {
    const approvedPromise = supabase
      .from('profiles')
      .select(PUBLIC_PROFILE_COLUMNS)
      .eq('status', 'approved')
      .order('full_name', { ascending: true })
      .limit(USERS_PAGE_SIZE);

    const pendingPromise = isReviewer
      ? (role === 'admin'
          ? supabase
              .from('profiles')
              .select(PUBLIC_PROFILE_COLUMNS)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(PENDING_PAGE_SIZE)
          : supabase
              .from('profiles')
              .select(PUBLIC_PROFILE_COLUMNS)
              .eq('status', 'pending')
              .eq('department', userDept)
              .order('created_at', { ascending: false })
              .limit(PENDING_PAGE_SIZE))
      : Promise.resolve({ data: [] as ProfileRow[], error: null });

    const allUsersPromise =
      role === 'admin'
        ? supabase
            .from('profiles')
            .select(PUBLIC_PROFILE_COLUMNS)
            .order('created_at', { ascending: false })
            .limit(USERS_PAGE_SIZE)
        : Promise.resolve({ data: [] as ProfileRow[], error: null });

    const [approvedRes, pendingRes, allRes] = await Promise.all([
      approvedPromise,
      pendingPromise,
      allUsersPromise,
    ]);
    if (!active) return;

    if (approvedRes.error) {
      reportError(`Unable to load campus members: ${approvedRes.error.message}`);
    } else {
      reportError(null);
    }

    if (Array.isArray(approvedRes.data)) {
      const mapped = (approvedRes.data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(mapped);
      currentApprovedUsers = mapped;
      paginationState.hasMoreApprovedUsers = mapped.length === USERS_PAGE_SIZE;
      handlers.onApprovedUsers(currentApprovedUsers);
    }

    if (Array.isArray(pendingRes.data)) {
      const mapped = (pendingRes.data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(mapped);
      currentPendingUsers = mapped;
      paginationState.hasMorePendingUsers = isReviewer && mapped.length === PENDING_PAGE_SIZE;
      handlers.onPendingUsers(currentPendingUsers);
    }

    if (role === 'admin' && Array.isArray(allRes.data)) {
      const mapped = (allRes.data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(mapped);
      currentAllUsers = mapped;
      paginationState.hasMoreAllUsers = mapped.length === USERS_PAGE_SIZE;
      handlers.onAllUsers(currentAllUsers);
    } else if (role !== 'admin') {
      currentAllUsers = [];
      paginationState.hasMoreAllUsers = false;
      handlers.onAllUsers([]);
    }

    emitPagination();
  };

  const computeAndEmitChats = () => {
    if (!active) return;
    const memberChatIds = new Set(latestMemberRows.map((m) => m.chat_id));
    const accessKeys = new Set(getCustomGroupAccessKeys(userDept, userLevel));

    const visibleChats: ChatThread[] = [];
    const nextChatMap = new Map<string, ChatThread>();

    for (const row of latestChatRows) {
      const mapped = mapChatRowToChatThread(row, latestDmParticipants);
      nextChatMap.set(mapped.id, mapped);

      let include = false;
      if (row.group_type === 'general' || mapped.type === 'general') {
        include = true;
      } else if (row.group_type === 'announcement') {
        include = true;
      } else if (
        row.group_type === 'department' ||
        row.group_type === 'level' ||
        mapped.type === 'department'
      ) {
        include =
          role === 'admin' ||
          (mapped.department === userDept && (!mapped.level || mapped.level === userLevel)) ||
          memberChatIds.has(mapped.id);
      } else if (mapped.type === 'dm') {
        include =
          memberChatIds.has(mapped.id) ||
          mapped.participantIds.includes(uid) ||
          mapped.createdBy === uid;
      } else if (role === 'admin') {
        include = true;
      } else if (mapped.accessKey && accessKeys.has(mapped.accessKey)) {
        include = true;
      } else {
        include = memberChatIds.has(mapped.id);
      }

      if (include) visibleChats.push(mapped);
    }

    latestChatsMap = nextChatMap;
    handlers.onChats(visibleChats);

    const localReads = readLocalStorage<Record<string, number>>(`gsu_chat_reads_${uid}`, {});
    const unreadMap: Record<string, number> = {};
    const openChatId = activeChatIdGetter();

    for (const chat of visibleChats) {
      if (openChatId === chat.id) {
        unreadMap[chat.id] = 0;
        continue;
      }
      const memberRow = latestMemberRows.find((m) => m.chat_id === chat.id);
      const dbUnread = Number(memberRow?.unread_count || 0);
      const readMs = localReads[chat.id] ?? 0;
      const lastMs = chat.lastMessageAt?.toMillis() ?? 0;

      if (dbUnread > 0) {
        unreadMap[chat.id] = dbUnread;
      } else if (lastMs > readMs && chat.lastMessageSender !== currentUser.fullName) {
        unreadMap[chat.id] = 1;
      } else {
        unreadMap[chat.id] = 0;
      }
    }
    handlers.onUnreadCounts(unreadMap, localReads);
  };

  const applyLocalMessageInsertToChatList = (row: MessageRow) => {
    if (!active || !row?.chat_id) return;
    const { meta, plainText } = decodeEnvelope<MessageMetaEnvelope>(row.content);
    const sender = latestUsersMap.get(row.sender_id);
    const senderName = meta?.senderName || sender?.fullName || 'GSU Member';
    const previewText = row.is_deleted
      ? DELETED_MESSAGE_PLACEHOLDER
      : meta?.text ?? plainText ?? 'New message';
    const nowIso = row.created_at || new Date().toISOString();

    let updatedAny = false;
    latestChatRows = latestChatRows.map((c) => {
      if (c.id !== row.chat_id) return c;
      updatedAny = true;
      const { meta: existingChatMeta } = decodeEnvelope<ChatMetaEnvelope>(c.last_message);
      const nextMeta: ChatMetaEnvelope = {
        ...(existingChatMeta || {}),
        __gsu: 1,
        lastMessageText: clampStr(previewText, 180),
        lastMessageSender: clampStr(senderName, 60),
        updatedAt: nowIso,
      };
      return {
        ...c,
        last_message: encodeEnvelope(nextMeta as Record<string, unknown>),
        last_message_at: nowIso,
      };
    });

    if (row.sender_id !== uid && activeChatIdGetter() !== row.chat_id) {
      latestMemberRows = latestMemberRows.map((m) =>
        m.chat_id === row.chat_id
          ? { ...m, unread_count: Number(m.unread_count || 0) + 1 }
          : m
      );
    }

    if (updatedAny) {
      computeAndEmitChats();
    }
    if (row.sender_id && !latestUsersMap.has(row.sender_id)) {
      ensureProfilesLoaded([row.sender_id]).catch(() => undefined);
    }
  };

  const rebuildDmGroupMsgChannel = () => {
    if (!active) return;
    const memberChatIds = new Set(latestMemberRows.map((m) => m.chat_id));
    const eligibleIds = latestChatRows
      .filter((r) => {
        const isBroadcast =
          r.group_type === 'general' ||
          r.group_type === 'announcement' ||
          r.group_type === 'department' ||
          r.group_type === 'level';
        if (isBroadcast) return false;
        if (r.is_group === false || r.group_type === 'custom') {
          return memberChatIds.has(r.id) || r.created_by === uid;
        }
        return false;
      })
      .map((r) => r.id)
      .sort()
      .slice(0, 100);

    const nextKey = eligibleIds.join(',');
    if (nextKey === lastDmGroupIdsKey) return;
    lastDmGroupIdsKey = nextKey;

    if (dmGroupMsgChannel) {
      supabase.removeChannel(dmGroupMsgChannel);
      dmGroupMsgChannel = null;
    }

    if (eligibleIds.length === 0) return;

    dmGroupMsgChannel = supabase
      .channel(`dm-group-msgs:${uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=in.(${eligibleIds.join(',')})`,
        },
        (payload) => {
          if (!active || !payload.new) return;
          applyLocalMessageInsertToChatList(payload.new as MessageRow);
        }
      )
      .subscribe();
  };

  const refreshChatsImmediate = async () => {
    lastChatFetchAt = Date.now();
    const [chatsRes, membersRes] = await Promise.all([
      supabase.from('chats').select('*').limit(150),
      supabase.from('chat_members').select('*').eq('user_id', uid).limit(150),
    ]);
    if (!active) return;

    if (chatsRes.error) {
      reportError(`Unable to load chats: ${chatsRes.error.message}`);
    } else {
      reportError(null);
    }

    if (Array.isArray(chatsRes.data)) latestChatRows = chatsRes.data as ChatRow[];
    if (Array.isArray(membersRes.data)) latestMemberRows = membersRes.data as ChatMemberRow[];

    const dmIds = latestChatRows.filter((c) => c.is_group === false).map((c) => c.id);
    const dmParticipantsMap = new Map<string, string[]>();
    const dmPeerIds: string[] = [];
    if (dmIds.length > 0) {
      const { data: dmMemberRows } = await supabase
        .from('chat_members')
        .select('chat_id, user_id')
        .in('chat_id', dmIds);
      if (Array.isArray(dmMemberRows)) {
        for (const r of dmMemberRows as { chat_id: string; user_id: string }[]) {
          const list = dmParticipantsMap.get(r.chat_id) || [];
          if (!list.includes(r.user_id)) list.push(r.user_id);
          dmParticipantsMap.set(r.chat_id, list);
          if (r.user_id !== uid) dmPeerIds.push(r.user_id);
        }
        for (const [chatId, userIds] of dmParticipantsMap.entries()) {
          if (userIds.length >= 2) {
            cacheDmChatPair(userIds[0], userIds[1], chatId);
          }
        }
      }
    }
    latestDmParticipants = dmParticipantsMap;
    computeAndEmitChats();
    rebuildDmGroupMsgChannel();
    if (dmPeerIds.length > 0) {
      ensureProfilesLoaded(dmPeerIds)
        .then((changed) => {
          if (changed && active) computeAndEmitChats();
        })
        .catch(() => undefined);
    }
  };

  const refreshChatsDebounced = () => {
    if (!active) return;
    const elapsed = Date.now() - lastChatFetchAt;
    if (elapsed >= CHAT_REFRESH_DEBOUNCE_MS) {
      if (chatDebounceTimer !== null) {
        window.clearTimeout(chatDebounceTimer);
        chatDebounceTimer = null;
      }
      refreshChatsImmediate().catch(() => undefined);
      return;
    }
    if (chatDebounceTimer === null) {
      chatDebounceTimer = window.setTimeout(() => {
        chatDebounceTimer = null;
        if (active) {
          refreshChatsImmediate().catch(() => undefined);
        }
      }, CHAT_REFRESH_DEBOUNCE_MS - elapsed);
    }
  };

  const emitAnnouncements = () => {
    if (!active) return;
    handlers.onAnnouncements(
      currentAnnouncements.map((r) => mapAnnouncementRow(r, latestUsersMap))
    );
  };

  const refreshAnnouncements = async () => {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(ANNOUNCEMENTS_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load announcements: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentAnnouncements = data as AnnouncementRow[];
      paginationState.hasMoreAnnouncements = data.length === ANNOUNCEMENTS_PAGE_SIZE;
      emitAnnouncements();
      emitPagination();
      const ids = currentAnnouncements.map((r) => r.author_id || '').filter(Boolean);
      ensureProfilesLoaded(ids).then((changed) => changed && emitAnnouncements());
    }
  };

  const emitCalendarEvents = () => {
    if (!active) return;
    const calendar = currentEventRows.map((r) =>
      mapEventRowToCalendarEvent(r, latestUsersMap)
    );
    calendar.sort((a, b) => a.date.localeCompare(b.date));
    handlers.onCalendarEvents(calendar);
  };

  const refreshCalendarEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(EVENTS_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load calendar events: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentEventRows = data as EventRow[];
      paginationState.hasMoreCalendarEvents = data.length === EVENTS_PAGE_SIZE;
      emitCalendarEvents();
      emitPagination();
    }
  };

  const refreshResources = async () => {
    const { data, error } = await supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RESOURCES_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load repository resources: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentResourceRows = data as ResourceRow[];
      paginationState.hasMoreResources = data.length === RESOURCES_PAGE_SIZE;
      handlers.onResources(currentResourceRows.map(mapResourceRow));
      emitPagination();
    }
  };

  const emitMarketplace = () => {
    if (!active) return;
    handlers.onMarketplace(
      currentMarketplaceRows.map((r) => mapMarketplaceRow(r, latestUsersMap))
    );
  };

  const refreshMarketplace = async () => {
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(MARKETPLACE_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load marketplace listings: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentMarketplaceRows = data as MarketplaceRow[];
      paginationState.hasMoreMarketplace = data.length === MARKETPLACE_PAGE_SIZE;
      emitMarketplace();
      emitPagination();
      ensureProfilesLoaded(currentMarketplaceRows.map((r) => r.seller_id)).then(
        (changed) => changed && emitMarketplace()
      );
    }
  };

  const emitStatuses = () => {
    if (!active) return;
    handlers.onStatuses(currentStatusRows.map((r) => mapStatusRow(r, latestUsersMap)));
  };

  const refreshStatuses = async () => {
    const { data, error } = await supabase
      .from('statuses')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(STATUSES_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load campus statuses: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentStatusRows = data as StatusRow[];
      paginationState.hasMoreStatuses = data.length === STATUSES_PAGE_SIZE;
      emitStatuses();
      emitPagination();
      ensureProfilesLoaded(currentStatusRows.map((r) => r.user_id)).then(
        (changed) => changed && emitStatuses()
      );
    }
  };

  const refreshRideErrands = async () => {
    const { data, error } = await supabase
      .from('rides_errands')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(RIDES_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load rides and errands: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentRideErrandRows = data as RideErrandRow[];
      paginationState.hasMoreRideErrands = data.length === RIDES_PAGE_SIZE;
      handlers.onRideErrands(currentRideErrandRows.map(mapRideErrandRow));
      emitPagination();
    }
  };

  const refreshConfessions = async () => {
    const { data, error } = await supabase
      .from('confessions')
      .select(PUBLIC_CONFESSION_COLUMNS)
      .order('created_at', { ascending: false })
      .limit(CONFESSIONS_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load confessions: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentConfessionRows = data as ConfessionRow[];
      paginationState.hasMoreConfessions = data.length === CONFESSIONS_PAGE_SIZE;
      mapConfessionRowsWithUpvotes(currentConfessionRows).then((items) => {
        if (!active) return;
        handlers.onConfessions(items);
      });
      emitPagination();
    }
  };

  const refreshStarred = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .contains('starred_by', [uid])
      .order('created_at', { ascending: false })
      .limit(50);
    if (!active || !Array.isArray(data)) return;
    const rows = data as MessageRow[];
    await ensureProfilesLoaded(rows.map((r) => r.sender_id)).catch(() => undefined);
    if (!active) return;

    const starred: StarredMessage[] = rows.map((r) => {
      const msg = mapMessageRowToChatMessage(r, latestUsersMap);
      const chat = latestChatsMap.get(msg.chatId);
      return {
        messageId: msg.id,
        chatId: msg.chatId,
        chatName: chat?.name || 'GSU Chat',
        chatType: chat?.type || ('custom' as ChatType),
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        text: msg.text,
        messageType: msg.messageType || 'text',
        fileName: msg.fileName,
        eventTitle: msg.eventTitle,
        eventDate: msg.eventDate,
        pollQuestion: msg.pollQuestion,
        contactName: msg.contactName,
        messageCreatedAt: msg.createdAt,
        starredAt: msg.createdAt,
      };
    });
    handlers.onStarredMessages(starred);
  };

  const emitReports = () => {
    if (!active) return;
    handlers.onReports(
      currentReportRows.map((r) => mapReportRow(r, latestUsersMap, latestChatsMap))
    );
  };

  const refreshReports = async () => {
    if (role !== 'admin') {
      if (active) {
        currentReportRows = [];
        paginationState.hasMoreReports = false;
        handlers.onReports([]);
        emitPagination();
      }
      return;
    }
    const { data, error } = await supabase
      .from('message_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(REPORTS_PAGE_SIZE);
    if (!active) return;
    if (error) {
      reportError(`Unable to load moderation reports: ${error.message}`);
      return;
    }
    if (Array.isArray(data)) {
      currentReportRows = data as MessageReportRow[];
      paginationState.hasMoreReports = data.length === REPORTS_PAGE_SIZE;
      emitReports();
      emitPagination();
      const ids = currentReportRows.flatMap((r) => [r.reported_user_id, r.reporter_id]);
      ensureProfilesLoaded(ids).then((changed) => changed && emitReports());
    }
  };

  const refreshIncomingCalls = async () => {
    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('receiver_id', uid)
      .order('created_at', { ascending: false })
      .limit(15);
    if (!active || !Array.isArray(data)) return;
    const rows = data as CallRow[];
    await ensureProfilesLoaded(rows.map((r) => r.caller_id)).catch(() => undefined);
    if (!active) return;
    handlers.onIncomingCalls(rows.map((r) => mapCallRowToVoiceCallSession(r, latestUsersMap)));
  };

  const loadMore = async (key: keyof WorkspacePaginationState): Promise<void> => {
    if (!active) return;
    const mergeById = <T extends { id: string }>(prev: T[], incoming: T[]): T[] => {
      const seen = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      for (const item of incoming) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          merged.push(item);
        }
      }
      return merged;
    };

    if (key === 'hasMoreApprovedUsers') {
      const from = currentApprovedUsers.length;
      const { data } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .eq('status', 'approved')
        .order('full_name', { ascending: true })
        .range(from, from + USERS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const nextUsers = (data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(nextUsers);
      const seen = new Set(currentApprovedUsers.map((u) => u.uid));
      currentApprovedUsers = [
        ...currentApprovedUsers,
        ...nextUsers.filter((u) => !seen.has(u.uid)),
      ];
      paginationState.hasMoreApprovedUsers = nextUsers.length === USERS_PAGE_SIZE;
      handlers.onApprovedUsers(currentApprovedUsers);
      emitPagination();
      return;
    }

    if (key === 'hasMorePendingUsers' && isReviewer) {
      const from = currentPendingUsers.length;
      const q =
        role === 'admin'
          ? supabase
              .from('profiles')
              .select(PUBLIC_PROFILE_COLUMNS)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .range(from, from + PENDING_PAGE_SIZE - 1)
          : supabase
              .from('profiles')
              .select(PUBLIC_PROFILE_COLUMNS)
              .eq('status', 'pending')
              .eq('department', userDept)
              .order('created_at', { ascending: false })
              .range(from, from + PENDING_PAGE_SIZE - 1);
      const { data } = await q;
      if (!active || !Array.isArray(data)) return;
      const nextUsers = (data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(nextUsers);
      const seen = new Set(currentPendingUsers.map((u) => u.uid));
      currentPendingUsers = [
        ...currentPendingUsers,
        ...nextUsers.filter((u) => !seen.has(u.uid)),
      ];
      paginationState.hasMorePendingUsers = nextUsers.length === PENDING_PAGE_SIZE;
      handlers.onPendingUsers(currentPendingUsers);
      emitPagination();
      return;
    }

    if (key === 'hasMoreAllUsers' && role === 'admin') {
      const from = currentAllUsers.length;
      const { data } = await supabase
        .from('profiles')
        .select(PUBLIC_PROFILE_COLUMNS)
        .order('created_at', { ascending: false })
        .range(from, from + USERS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const nextUsers = (data as ProfileRow[]).map((r) => mapProfileRowToAppUser(r));
      absorbProfiles(nextUsers);
      const seen = new Set(currentAllUsers.map((u) => u.uid));
      currentAllUsers = [
        ...currentAllUsers,
        ...nextUsers.filter((u) => !seen.has(u.uid)),
      ];
      paginationState.hasMoreAllUsers = nextUsers.length === USERS_PAGE_SIZE;
      handlers.onAllUsers(currentAllUsers);
      emitPagination();
      return;
    }

    if (key === 'hasMoreAnnouncements') {
      const from = currentAnnouncements.length;
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + ANNOUNCEMENTS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as AnnouncementRow[];
      currentAnnouncements = mergeById(currentAnnouncements, rows);
      paginationState.hasMoreAnnouncements = rows.length === ANNOUNCEMENTS_PAGE_SIZE;
      await ensureProfilesLoaded(rows.map((r) => r.author_id || '').filter(Boolean));
      emitAnnouncements();
      emitPagination();
      return;
    }

    if (key === 'hasMoreCalendarEvents') {
      const from = currentEventRows.length;
      const { data } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + EVENTS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as EventRow[];
      currentEventRows = mergeById(currentEventRows, rows);
      paginationState.hasMoreCalendarEvents = rows.length === EVENTS_PAGE_SIZE;
      emitCalendarEvents();
      emitPagination();
      return;
    }

    if (key === 'hasMoreResources') {
      const from = currentResourceRows.length;
      const { data } = await supabase
        .from('resources')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + RESOURCES_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as ResourceRow[];
      currentResourceRows = mergeById(currentResourceRows, rows);
      paginationState.hasMoreResources = rows.length === RESOURCES_PAGE_SIZE;
      handlers.onResources(currentResourceRows.map(mapResourceRow));
      emitPagination();
      return;
    }

    if (key === 'hasMoreMarketplace') {
      const from = currentMarketplaceRows.length;
      const { data } = await supabase
        .from('marketplace_listings')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + MARKETPLACE_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as MarketplaceRow[];
      currentMarketplaceRows = mergeById(currentMarketplaceRows, rows);
      paginationState.hasMoreMarketplace = rows.length === MARKETPLACE_PAGE_SIZE;
      await ensureProfilesLoaded(rows.map((r) => r.seller_id));
      emitMarketplace();
      emitPagination();
      return;
    }

    if (key === 'hasMoreStatuses') {
      const from = currentStatusRows.length;
      const { data } = await supabase
        .from('statuses')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + STATUSES_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as StatusRow[];
      currentStatusRows = mergeById(currentStatusRows, rows);
      paginationState.hasMoreStatuses = rows.length === STATUSES_PAGE_SIZE;
      await ensureProfilesLoaded(rows.map((r) => r.user_id));
      emitStatuses();
      emitPagination();
      return;
    }

    if (key === 'hasMoreRideErrands') {
      const from = currentRideErrandRows.length;
      const { data } = await supabase
        .from('rides_errands')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + RIDES_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as RideErrandRow[];
      currentRideErrandRows = mergeById(currentRideErrandRows, rows);
      paginationState.hasMoreRideErrands = rows.length === RIDES_PAGE_SIZE;
      handlers.onRideErrands(currentRideErrandRows.map(mapRideErrandRow));
      emitPagination();
      return;
    }

    if (key === 'hasMoreConfessions') {
      const from = currentConfessionRows.length;
      const { data } = await supabase
        .from('confessions')
        .select(PUBLIC_CONFESSION_COLUMNS)
        .order('created_at', { ascending: false })
        .range(from, from + CONFESSIONS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as ConfessionRow[];
      currentConfessionRows = mergeById(currentConfessionRows, rows);
      paginationState.hasMoreConfessions = rows.length === CONFESSIONS_PAGE_SIZE;
      mapConfessionRowsWithUpvotes(currentConfessionRows).then((items) => {
        if (!active) return;
        handlers.onConfessions(items);
      });
      emitPagination();
      return;
    }

    if (key === 'hasMoreReports' && role === 'admin') {
      const from = currentReportRows.length;
      const { data } = await supabase
        .from('message_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + REPORTS_PAGE_SIZE - 1);
      if (!active || !Array.isArray(data)) return;
      const rows = data as MessageReportRow[];
      currentReportRows = mergeById(currentReportRows, rows);
      paginationState.hasMoreReports = rows.length === REPORTS_PAGE_SIZE;
      await ensureProfilesLoaded(rows.flatMap((r) => [r.reported_user_id, r.reporter_id]));
      emitReports();
      emitPagination();
    }
  };

  const runAllInitial = () => {
    reportError(null);
    refreshProfiles().then(() => {
      if (!active) return;
      refreshChatsImmediate().then(() => {
        if (!active) return;
        refreshStarred();
        refreshReports();
        refreshIncomingCalls();
      });
      refreshAnnouncements();
      refreshCalendarEvents();
      refreshResources();
      refreshMarketplace();
      refreshStatuses();
      refreshRideErrands();
      refreshConfessions();
    });
  };

  runAllInitial();

  const workspaceChannel = supabase
    .channel(`workspace:${uid}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_members', filter: `user_id=eq.${uid}` },
      () => refreshChatsDebounced()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () =>
      refreshAnnouncements()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () =>
      refreshCalendarEvents()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () =>
      refreshResources()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'marketplace_listings' }, () =>
      refreshMarketplace()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, () =>
      refreshStatuses()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides_errands' }, () =>
      refreshRideErrands()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'confessions' }, () =>
      refreshConfessions()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'confession_upvotes' }, () =>
      refreshConfessions()
    )
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reports' }, () =>
      refreshReports()
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calls', filter: `receiver_id=eq.${uid}` },
      () => refreshIncomingCalls()
    )
    .subscribe();

  const unsubSync = onSyncSignal(
    [
      'profiles',
      'chats',
      'chat_members',
      'chat_reads',
      'announcements',
      'events',
      'resources',
      'marketplace_listings',
      'statuses',
      'rides_errands',
      'confessions',
      'starred',
      'reports',
      'calls',
      'messages',
    ],
    (_scopeId, table) => {
      switch (table) {
        case 'profiles':
          refreshProfiles();
          break;
        case 'chats':
        case 'chat_members':
          refreshChatsDebounced();
          break;
        case 'chat_reads':
          computeAndEmitChats();
          break;
        case 'announcements':
          refreshAnnouncements();
          break;
        case 'events':
          refreshCalendarEvents();
          break;
        case 'resources':
          refreshResources();
          break;
        case 'marketplace_listings':
          refreshMarketplace();
          break;
        case 'statuses':
          refreshStatuses();
          break;
        case 'rides_errands':
          refreshRideErrands();
          break;
        case 'confessions':
          refreshConfessions();
          break;
        case 'starred':
          refreshStarred();
          break;
        case 'reports':
          refreshReports();
          break;
        case 'calls':
          refreshIncomingCalls();
          break;
        case 'messages':
          break;
        default:
          break;
      }
    }
  );

  return {
    unsubscribe: () => {
      active = false;
      if (chatDebounceTimer !== null) {
        window.clearTimeout(chatDebounceTimer);
        chatDebounceTimer = null;
      }
      unsubSync();
      supabase.removeChannel(workspaceChannel);
      if (dmGroupMsgChannel) {
        supabase.removeChannel(dmGroupMsgChannel);
        dmGroupMsgChannel = null;
      }
    },
    refreshBroadcastChats: () => refreshChatsDebounced(),
    retryAll: () => runAllInitial(),
    loadMore,
  };
}

export function subscribeToChatRoom(
  chatId: string,
  currentUser: AppUser,
  userMap: Map<string, AppUser>,
  handlers: {
    onMessages: (msgs: ChatMessage[]) => void;
    onReadReceipts: (receipts: ChatReadReceipt[]) => void;
    onTypingStatuses: (typing: ChatTypingStatus[]) => void;
    onHasMoreOlder?: (hasMore: boolean) => void;
  }
): ChatRoomHandle {
  let active = true;
  const typingMap = new Map<string, ChatTypingStatus>();
  const storageKey = `${READ_RECEIPTS_KEY_PREFIX}${chatId}`;
  const messageRowsMap = new Map<string, MessageRow>();
  let oldestCreatedAt: string | null = null;
  let hasMoreOlder = false;
  let loadingOlder = false;

  const getSenderMap = (): Map<string, AppUser> => {
    if (profileCache.size === 0) return userMap;
    const merged = new Map<string, AppUser>(profileCache);
    userMap.forEach((u, id) => merged.set(id, u));
    return merged;
  };

  const emitMessagesFromMap = () => {
    if (!active) return;
    const sortedRows = Array.from(messageRowsMap.values()).sort((a, b) =>
      (a.created_at || '').localeCompare(b.created_at || '')
    );
    oldestCreatedAt = sortedRows[0]?.created_at || oldestCreatedAt;
    const mergedUsers = getSenderMap();
    const list = sortedRows.map((r) => mapMessageRowToChatMessage(r, mergedUsers));
    handlers.onMessages(list);
    handlers.onHasMoreOlder?.(hasMoreOlder);

    const unknownSenderIds = sortedRows
      .map((r) => r.sender_id)
      .filter((id) => id && !mergedUsers.has(id));
    if (unknownSenderIds.length > 0) {
      resolveProfilesByIds(unknownSenderIds)
        .then((resolved) => {
          if (active && Object.keys(resolved).length > 0) {
            const refreshedUsers = getSenderMap();
            const refreshedList = Array.from(messageRowsMap.values())
              .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
              .map((r) => mapMessageRowToChatMessage(r, refreshedUsers));
            handlers.onMessages(refreshedList);
          }
        })
        .catch(() => undefined);
    }
  };

  const emitReadReceipts = () => {
    if (!active) return;
    const saved = readLocalStorage<Record<string, { fullName: string; ms: number }>>(storageKey, {});
    const mergedUsers = getSenderMap();
    const list: ChatReadReceipt[] = Object.entries(saved).map(([uid, info]) => ({
      uid,
      fullName: info.fullName || mergedUsers.get(uid)?.fullName || 'GSU Member',
      lastReadAt: AppTimestamp.fromMillis(info.ms),
      updatedAt: AppTimestamp.fromMillis(info.ms),
    }));
    handlers.onReadReceipts(list);
  };

  const loadLatestMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(CHAT_MESSAGES_PAGE_SIZE);

    if (!active) return;
    if (error) {
      console.warn('Error loading chat messages:', error.message);
      handlers.onMessages([]);
      handlers.onHasMoreOlder?.(false);
      return;
    }

    const rows = (data as MessageRow[]) || [];
    for (const row of rows) {
      messageRowsMap.set(row.id, row);
    }
    if (messageRowsMap.size <= CHAT_MESSAGES_PAGE_SIZE) {
      hasMoreOlder = rows.length === CHAT_MESSAGES_PAGE_SIZE;
    }
    emitMessagesFromMap();
  };

  const loadOlderMessages = async (): Promise<boolean> => {
    if (!active || loadingOlder || !hasMoreOlder || !oldestCreatedAt) return false;
    loadingOlder = true;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .lt('created_at', oldestCreatedAt)
        .order('created_at', { ascending: false })
        .limit(CHAT_MESSAGES_PAGE_SIZE);
      if (!active || error || !Array.isArray(data)) return false;

      const rows = data as MessageRow[];
      hasMoreOlder = rows.length === CHAT_MESSAGES_PAGE_SIZE;
      for (const row of rows) {
        messageRowsMap.set(row.id, row);
      }
      emitMessagesFromMap();
      return rows.length > 0;
    } finally {
      loadingOlder = false;
    }
  };

  loadLatestMessages();
  emitReadReceipts();

  const dbChannel = supabase
    .channel(`room-db:${chatId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
      (payload) => {
        if (!active) return;
        if (payload.eventType === 'DELETE') {
          const oldId = (payload.old as { id?: string } | null)?.id;
          if (oldId && messageRowsMap.delete(oldId)) {
            emitMessagesFromMap();
          } else {
            loadLatestMessages();
          }
          return;
        }
        const nextRow = payload.new as MessageRow | undefined;
        if (nextRow?.id) {
          messageRowsMap.set(nextRow.id, nextRow);
          emitMessagesFromMap();
        } else {
          loadLatestMessages();
        }
      }
    )
    .subscribe();

  const ephemeralChannel = supabase
    .channel(`chat-ephemeral:${chatId}`, {
      config: { broadcast: { self: false } },
    })
    .on('broadcast', { event: 'typing' }, (msg) => {
      if (!active) return;
      const p = (msg.payload || {}) as {
        uid?: string;
        fullName?: string;
        ms?: number;
        typing?: boolean;
      };
      if (!p.uid || p.uid === currentUser.uid) return;
      if (p.typing === false) {
        typingMap.delete(p.uid);
      } else {
        typingMap.set(p.uid, {
          uid: p.uid,
          fullName: p.fullName || 'GSU Member',
          lastTypedAt: AppTimestamp.fromMillis(p.ms || Date.now()),
        });
      }
      handlers.onTypingStatuses(Array.from(typingMap.values()));
    })
    .on('broadcast', { event: 'read_receipt' }, (msg) => {
      if (!active) return;
      const p = (msg.payload || {}) as { uid?: string; fullName?: string; ms?: number };
      if (!p.uid) return;
      const saved = readLocalStorage<Record<string, { fullName: string; ms: number }>>(storageKey, {});
      saved[p.uid] = { fullName: p.fullName || 'GSU Member', ms: p.ms || Date.now() };
      writeLocalStorage(storageKey, saved);
      emitReadReceipts();
    })
    .subscribe();

  activeChatBroadcastChannels.set(chatId, ephemeralChannel);

  const syncUnsub = onSyncSignal(['messages', 'chat_reads'], (scopeId) => {
    if (!scopeId || scopeId === chatId) {
      loadLatestMessages();
      emitReadReceipts();
    }
  });

  return {
    unsubscribe: () => {
      active = false;
      syncUnsub();
      activeChatBroadcastChannels.delete(chatId);
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(ephemeralChannel);
    },
    loadOlderMessages,
  };
}

export function subscribeToGroupMembers(
  chatId: string,
  userMap: Map<string, AppUser>,
  onMembers: (members: ChatMember[]) => void
): () => void {
  let active = true;

  const mapRows = (rows: ChatMemberRow[]): ChatMember[] =>
    rows.map((row) => {
      const u = userMap.get(row.user_id) || profileCache.get(row.user_id);
      return {
        uid: row.user_id,
        fullName: u?.fullName || 'GSU Member',
        idNumber: u?.idNumber || 'N/A',
        department: u?.department || 'General',
        level: u?.is_alumni ? 'Alumni' : u?.level || '100',
        role: u?.role || 'student',
        joinedAt: toAppTimestamp(row.joined_at),
      };
    });

  const load = async () => {
    const { data } = await supabase
      .from('chat_members')
      .select('*')
      .eq('chat_id', chatId)
      .limit(150);
    if (!active || !Array.isArray(data)) return;

    const rows = data as ChatMemberRow[];
    onMembers(mapRows(rows));

    const unknownIds = rows
      .map((r) => r.user_id)
      .filter((id) => id && !userMap.has(id) && !profileCache.has(id));
    if (unknownIds.length > 0) {
      resolveProfilesByIds(unknownIds)
        .then((resolved) => {
          if (active && Object.keys(resolved).length > 0) {
            onMembers(mapRows(rows));
          }
        })
        .catch(() => undefined);
    }
  };

  load();

  const ch = supabase
    .channel(`members:${chatId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'chat_members', filter: `chat_id=eq.${chatId}` },
      () => load()
    )
    .subscribe();

  const unsubSync = onSyncSignal(['chat_members'], () => load());

  return () => {
    active = false;
    unsubSync();
    supabase.removeChannel(ch);
  };
}

export function subscribeToVoiceCall(
  callId: string,
  currentUserUid: string,
  isCaller: boolean,
  handlers: {
    onCallUpdate: (session: VoiceCallSession) => void;
    onRemoteCandidate: (candidateId: string, candidateJson: string) => void;
  }
): () => void {
  let active = true;
  const remoteCandidateCol = isCaller ? 'receiver_candidates' : 'caller_candidates';

  const processCallRow = (row: CallRow) => {
    if (!active) return;
    const offerStr =
      typeof row.offer === 'string'
        ? row.offer
        : row.offer && typeof row.offer === 'object'
          ? JSON.stringify(row.offer)
          : undefined;
    const answerStr =
      typeof row.answer === 'string'
        ? row.answer
        : row.answer && typeof row.answer === 'object'
          ? JSON.stringify(row.answer)
          : undefined;

    handlers.onCallUpdate({
      id: row.id,
      callerId: row.caller_id,
      callerName: 'GSU Member',
      receiverId: row.receiver_id,
      receiverName: 'GSU Member',
      dmChatId: getCachedDmChatId(row.caller_id, row.receiver_id) || '',
      status: ((row.status as VoiceCallStatus) || 'ringing'),
      offer: offerStr,
      answer: answerStr,
      acceptedAt: toAppTimestamp(row.started_at),
      createdAt: toAppTimestamp(row.created_at),
      updatedAt: toAppTimestamp(row.ended_at || row.started_at || row.created_at),
    });

    const remoteCandidates = Array.isArray(row[remoteCandidateCol])
      ? (row[remoteCandidateCol] as { id?: string; senderId?: string; candidate?: string }[])
      : [];
    for (const item of remoteCandidates) {
      if (item?.id && item?.candidate && item.senderId !== currentUserUid) {
        handlers.onRemoteCandidate(item.id, item.candidate);
      }
    }
  };

  const loadCall = async () => {
    const { data } = await supabase.from('calls').select('*').eq('id', callId).maybeSingle();
    if (data) processCallRow(data as CallRow);
  };

  loadCall();

  const dbChannel = supabase
    .channel(`call-db:${callId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'calls', filter: `id=eq.${callId}` },
      (payload) => {
        if (payload.new) {
          processCallRow(payload.new as CallRow);
        } else {
          loadCall();
        }
      }
    )
    .subscribe();

  const rtcBroadcast = supabase
    .channel(`call-rtc:${callId}`, {
      config: { broadcast: { self: false } },
    })
    .on('broadcast', { event: 'ice_candidate' }, (msg) => {
      if (!active) return;
      const p = (msg.payload || {}) as {
        id?: string;
        role?: 'caller' | 'receiver';
        senderId?: string;
        candidate?: string;
      };
      if (p.id && p.candidate && p.senderId !== currentUserUid) {
        handlers.onRemoteCandidate(p.id, p.candidate);
      }
    })
    .on('broadcast', { event: 'call_update' }, () => {
      loadCall();
    })
    .subscribe();

  activeCallBroadcastChannels.set(callId, rtcBroadcast);

  const unsubSync = onSyncSignal(['calls'], (scopeId) => {
    if (!scopeId || scopeId === callId) loadCall();
  });

  return () => {
    active = false;
    unsubSync();
    activeCallBroadcastChannels.delete(callId);
    supabase.removeChannel(dbChannel);
    supabase.removeChannel(rtcBroadcast);
  };
}
