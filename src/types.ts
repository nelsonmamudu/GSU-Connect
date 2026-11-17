export class AppTimestamp {
  private readonly ms: number;

  constructor(ms: number) {
    this.ms = Number.isFinite(ms) ? ms : Date.now();
  }

  toMillis(): number {
    return this.ms;
  }

  toDate(): Date {
    return new Date(this.ms);
  }

  toISOString(): string {
    return new Date(this.ms).toISOString();
  }

  static now(): AppTimestamp {
    return new AppTimestamp(Date.now());
  }

  static fromMillis(ms: number): AppTimestamp {
    return new AppTimestamp(ms);
  }

  static fromDate(date: Date): AppTimestamp {
    return new AppTimestamp(date.getTime());
  }

  static fromISO(iso: string): AppTimestamp | null {
    if (!iso) return null;
    const parsed = Date.parse(iso);
    if (!Number.isFinite(parsed)) return null;
    return new AppTimestamp(parsed);
  }
}

export type Timestamp = AppTimestamp;

export function toAppTimestamp(
  value?: string | number | Date | AppTimestamp | { toMillis?: () => number } | null
): AppTimestamp | null {
  if (value === null || value === undefined) return null;
  if (value instanceof AppTimestamp) return value;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? new AppTimestamp(value) : null;
  }
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? new AppTimestamp(value.getTime()) : null;
  }
  if (typeof value === 'string') {
    return AppTimestamp.fromISO(value);
  }
  if (typeof value === 'object' && typeof value.toMillis === 'function') {
    return new AppTimestamp(value.toMillis());
  }
  return null;
}

export function toMillis(
  value?: string | number | Date | AppTimestamp | { toMillis?: () => number } | null,
  fallback: number = 0
): number {
  const ts = toAppTimestamp(value);
  return ts ? ts.toMillis() : fallback;
}

export type UserRole = 'admin' | 'classRep' | 'deptHelper' | 'lecturer' | 'student';
export type DbUserRole = 'student' | 'staff' | 'lecturer' | 'class_rep' | 'dept_helper' | 'admin';
export type RequestedRole = 'student' | 'lecturer';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type AccountLifecycleStatus = 'active' | 'alumni' | 'verify_pending' | 'expired' | 'no_profile';
export interface MyAccountStatus {
  status: AccountLifecycleStatus;
  is_alumni: boolean;
  is_exempt: boolean;
  verify_deadline: string | null;
  alumni_verified_at: string | null;
  expires_at: string | null;
}
export type AccountType = 'student' | 'staff';
export type AcademicLevel = '100' | '200' | '300' | '400' | '500' | '600' | 'Staff';
export type ChatType = 'general' | 'department' | 'custom' | 'dm';
export type CustomGroupScope = 'all' | 'department' | 'deptLevel' | 'invited';
export type ReportReason =
  | 'Spam'
  | 'Harassment'
  | 'Misinformation'
  | 'Inappropriate Content'
  | 'Other';

export function dbRoleToAppRole(role?: string | null): UserRole {
  switch ((role || '').trim()) {
    case 'admin':
      return 'admin';
    case 'class_rep':
    case 'classRep':
      return 'classRep';
    case 'dept_helper':
    case 'deptHelper':
      return 'deptHelper';
    case 'staff':
    case 'lecturer':
      return 'lecturer';
    case 'student':
    default:
      return 'student';
  }
}

export function appRoleToDbRole(role: UserRole): DbUserRole {
  switch (role) {
    case 'admin':
      return 'admin';
    case 'classRep':
      return 'class_rep';
    case 'deptHelper':
      return 'dept_helper';
    case 'lecturer':
      return 'lecturer';
    case 'student':
    default:
      return 'student';
  }
}

export function isApproverRole(role: UserRole): boolean {
  return role === 'admin' || role === 'classRep' || role === 'deptHelper';
}

export function canViewMemberIdNumber(
  viewer: Pick<AppUser, 'uid' | 'role'>,
  targetUid?: string | null
): boolean {
  if (targetUid && viewer.uid === targetUid) return true;
  return isApproverRole(viewer.role);
}

export type AppTheme = 'light' | 'dark';

export interface AppUser {
  uid: string;
  fullName: string;
  idNumber: string;
  idNumberNormalized: string;
  accountType: AccountType;
  department: string;
  level: AcademicLevel;
  role: UserRole;
  requestedRole?: RequestedRole;
  email?: string;
  status: UserStatus;
  rejectionReason?: string;
  idCardPath?: string;
  blockedUsers?: string[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  lastSeen?: Timestamp | null;
  pinnedChatIds?: string[];
  photoURL?: string;
  avatarId?: string;
  studyCourses?: string[];
  studySpot?: string;
  studyBio?: string;
  is_alumni?: boolean;
  is_exempt?: boolean;
  verify_deadline?: string | null;
  alumni_verified_at?: string | null;
  expires_at?: string | null;
}

export type UserProfile = AppUser;

export type VoiceCallStatus = 'ringing' | 'accepted' | 'declined' | 'ended' | 'missed';
export type CallLogOutcome = 'completed' | 'missed' | 'declined' | 'cancelled';

export interface VoiceCallSession {
  id: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callerDepartment?: string;
  receiverId: string;
  receiverName: string;
  receiverAvatar?: string;
  receiverDepartment?: string;
  dmChatId: string;
  status: VoiceCallStatus;
  offer?: string;
  answer?: string;
  acceptedAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface AuthConfig {
  allowedEmailDomain: string;
  updatedAt?: Timestamp | null;
}

export type RadarStatusType =
  | 'lecturer_in_class'
  | 'venue_changed'
  | 'class_cancelled'
  | 'attendance_ongoing'
  | 'exam_countdown';

export const RADAR_STATUS_LABELS: Record<RadarStatusType, string> = {
  lecturer_in_class: 'Lecturer is in class',
  venue_changed: 'Venue changed',
  class_cancelled: 'Class Cancelled',
  attendance_ongoing: 'Attendance ongoing',
  exam_countdown: 'Exam Countdown',
};

export interface ChatThread {
  id: string;
  type: ChatType;
  name: string;
  department: string;
  level: string;
  accessKey?: string;
  createdBy?: string;
  participantIds: string[];
  lastMessageText: string;
  lastMessageSender: string;
  lastMessageAt?: Timestamp | null;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  pinnedMessageSender?: string;
  pinnedBy?: string;
  pinnedByName?: string;
  pinnedAt?: Timestamp | null;
  radarStatus?: RadarStatusType;
  radarCourseCode?: string;
  radarVenue?: string;
  radarNote?: string;
  radarExamTitle?: string;
  radarExamAt?: string;
  radarUpdatedBy?: string;
  radarUpdatedByName?: string;
  radarUpdatedByRole?: UserRole;
  radarUpdatedAt?: Timestamp | null;
}

export interface ChatMember {
  uid: string;
  fullName: string;
  idNumber: string;
  department: string;
  level: string;
  role: UserRole;
  joinedAt?: Timestamp | null;
}

export interface JoinedGroup {
  chatId: string;
  name: string;
  addedBy: string;
  joinedAt?: Timestamp | null;
}

export interface ChatRead {
  chatId: string;
  lastReadAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ChatReadReceipt {
  uid: string;
  fullName: string;
  lastReadAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ChatTypingStatus {
  uid: string;
  fullName: string;
  lastTypedAt?: Timestamp | null;
}

export type MessageType =
  | 'text'
  | 'voice'
  | 'poll'
  | 'image'
  | 'document'
  | 'event'
  | 'contact'
  | 'call';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  createdAt?: Timestamp | null;
  reactions?: Record<string, string>;
  messageType?: MessageType;
  audioData?: string;
  audioDurationSec?: number;
  pollQuestion?: string;
  pollOptions?: string[];
  pollVotes?: Record<string, number>;
  mediaData?: string;
  fileName?: string;
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
  contactRole?: UserRole;
  callOutcome?: CallLogOutcome;
  callDurationSec?: number;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToSnippet?: string;
  replyToMessageType?: MessageType;
  editedAt?: Timestamp | null;
  deletedAt?: Timestamp | null;
  deletedBy?: string;
  deletedByName?: string;
  isViewOnce?: boolean;
  viewOnceOpenedAt?: Timestamp | null;
  viewOnceOpenedBy?: string;
}

export interface ReplyTarget {
  messageId: string;
  senderName: string;
  snippet: string;
  messageType: MessageType;
}

export interface StarredMessage {
  messageId: string;
  chatId: string;
  chatName: string;
  chatType: ChatType;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  text: string;
  messageType: MessageType;
  fileName?: string;
  eventTitle?: string;
  eventDate?: string;
  pollQuestion?: string;
  contactName?: string;
  messageCreatedAt?: Timestamp | null;
  starredAt?: Timestamp | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  scope: string;
  authorId: string;
  authorName: string;
  authorRole: Exclude<UserRole, 'student'>;
  createdAt?: Timestamp | null;
}

export interface ModerationReport {
  id: string;
  chatId: string;
  chatName: string;
  messageId: string;
  messageText: string;
  reportedUserId: string;
  reportedUserName: string;
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  details: string;
  status: 'open' | 'resolved' | 'dismissed';
  resolutionAction: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface DepartmentItem {
  id: string;
  name: string;
  faculty: string;
  durationYears?: number;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type ResourceCategory =
  | 'Past Questions'
  | 'Lecture Handout'
  | 'Lab Manual'
  | 'Lecture Notes'
  | 'Study Guide';

export type ResourceLevel = '100' | '200' | '300' | '400' | '500' | 'General';

export interface AcademicResource {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  faculty: string;
  department: string;
  level: ResourceLevel;
  courseCode: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  fileData: string;
  downloadCount: number;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type MarketplaceCategory =
  | 'Textbooks'
  | 'Calculators'
  | 'Solar Kits'
  | 'Electronics'
  | 'Lodge / Accommodation'
  | 'Other';

export type MarketplaceListingType = 'Sell' | 'Swap' | 'Vacancy';

export type MarketplaceCondition =
  | 'Brand New'
  | 'Like New'
  | 'Fairly Used'
  | 'Available';

export type MarketplaceStatus = 'available' | 'sold';

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string;
  category: MarketplaceCategory;
  listingType: MarketplaceListingType;
  priceNaira: number;
  condition: MarketplaceCondition;
  location: string;
  imageData?: string;
  status: MarketplaceStatus;
  sellerId: string;
  sellerName: string;
  sellerDepartment: string;
  sellerLevel: string;
  sellerRole: UserRole;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type CalendarEventType = 'exam' | 'seminar' | 'deadline' | 'campus_event';
export type CalendarLevel = 'All' | '100' | '200' | '300' | '400' | '500';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  eventType: CalendarEventType;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  venue: string;
  courseCode: string;
  department: string;
  level: CalendarLevel;
  authorId: string;
  authorName: string;
  authorRole: 'admin' | 'classRep' | 'lecturer';
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export type StatusType = 'text' | 'image';

export interface CampusStatus {
  id: string;
  authorId: string;
  authorName: string;
  authorDepartment: string;
  authorLevel: string;
  authorRole: UserRole;
  type: StatusType;
  text: string;
  bgColor?: string;
  imageData?: string;
  viewedBy: Record<string, boolean>;
  createdAt?: Timestamp | null;
}

export type RideErrandType = 'ride' | 'errand';
export type RideErrandStatus = 'open' | 'fulfilled';

export interface RideErrandPost {
  id: string;
  postType: RideErrandType;
  title: string;
  details: string;
  origin: string;
  destination: string;
  departureTime: string;
  seatsOrSlots: number;
  costSplitNaira: number;
  status: RideErrandStatus;
  authorId: string;
  authorName: string;
  authorDepartment: string;
  authorLevel: string;
  authorRole: UserRole;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const RIDE_LOCATION_PRESETS: string[] = [
  'Main Campus',
  'Main Gate',
  'Off-Campus (Tumfure)',
  'Town / Gombe Central',
  'Library / Science Complex',
  'College of Medical Sciences',
];

export type ConfessionCategory =
  | 'Confession'
  | 'Campus Gist'
  | 'Lecture Hall'
  | 'Off-Campus (Tumfure)'
  | 'Shoutout';

export type ConfessionStatus = 'pending' | 'approved' | 'rejected';

export interface CampusConfession {
  id: string;
  category: ConfessionCategory;
  text: string;
  status: ConfessionStatus;
  upvotes: Record<string, boolean>;
  moderatedBy?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export const CONFESSION_CATEGORIES: ConfessionCategory[] = [
  'Confession',
  'Campus Gist',
  'Lecture Hall',
  'Off-Campus (Tumfure)',
  'Shoutout',
];

export type GsuGradeLetter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export const GSU_GRADE_POINTS: Record<GsuGradeLetter, number> = {
  A: 5,
  B: 4,
  C: 3,
  D: 2,
  E: 1,
  F: 0,
};

export interface GpaCourseEntry {
  id: string;
  code: string;
  units: number;
  grade: GsuGradeLetter;
}

export const STATUS_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STATUS_IMAGE_BYTES = 10 * 1024 * 1024;
export const STATUS_BG_COLORS: { hex: string; label: string }[] = [
  { hex: '#047857', label: 'GSU Emerald' },
  { hex: '#0f172a', label: 'Midnight Slate' },
  { hex: '#1d4ed8', label: 'Academic Blue' },
  { hex: '#7c3aed', label: 'Royal Violet' },
  { hex: '#be123c', label: 'Crimson' },
  { hex: '#b45309', label: 'Savannah Amber' },
];

export const GSU_FACULTIES: string[] = [
  'Science',
  'Arts & Social Sciences',
  'Management Sciences',
  'Education',
  'Environmental Sciences',
  'Law',
  'Agriculture',
  'Pharmaceutical Sciences',
  'Basic Medical Sciences',
  'Clinical Sciences',
];

export const DEFAULT_GSU_DEPARTMENTS: { name: string; faculty: string; durationYears: number }[] = [
  // Faculty of Agriculture (7)
  { name: 'Agricultural Economics', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Agricultural Extension', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Agriculture', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Animal Science', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Fisheries & Aquaculture', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Horticulture & Landscape Management', faculty: 'Agriculture', durationYears: 5 },
  { name: 'Soil Science', faculty: 'Agriculture', durationYears: 5 },

  // Faculty of Management Sciences (4)
  { name: 'Accounting', faculty: 'Management Sciences', durationYears: 4 },
  { name: 'Banking & Finance', faculty: 'Management Sciences', durationYears: 4 },
  { name: 'Business Administration', faculty: 'Management Sciences', durationYears: 4 },
  { name: 'Logistics & Supply Chain Management', faculty: 'Management Sciences', durationYears: 4 },

  // Faculty of Arts & Social Sciences (10)
  { name: 'Christian Religious Studies', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Economics', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'English', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'History', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'International Relations', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Islamic Studies', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Peace & Conflict Resolution', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Political Science', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Public Administration', faculty: 'Arts & Social Sciences', durationYears: 4 },
  { name: 'Sociology', faculty: 'Arts & Social Sciences', durationYears: 4 },

  // College of Medical Sciences (7)
  { name: 'Human Anatomy', faculty: 'Basic Medical Sciences', durationYears: 4 },
  { name: 'Human Nutrition & Dietetics', faculty: 'Basic Medical Sciences', durationYears: 4 },
  { name: 'Medicine', faculty: 'Clinical Sciences', durationYears: 6 },
  { name: 'Nursing', faculty: 'Basic Medical Sciences', durationYears: 5 },
  { name: 'Pharmacology', faculty: 'Basic Medical Sciences', durationYears: 4 },
  { name: 'Human Physiology', faculty: 'Basic Medical Sciences', durationYears: 4 },
  { name: 'Public Health', faculty: 'Clinical Sciences', durationYears: 4 },

  // Faculty of Education (13)
  { name: 'Christian Religious Education', faculty: 'Education', durationYears: 4 },
  { name: 'Computer Science Education', faculty: 'Education', durationYears: 4 },
  { name: 'Economics Education', faculty: 'Education', durationYears: 4 },
  { name: 'Islamic Education', faculty: 'Education', durationYears: 4 },
  { name: 'Mathematics Education', faculty: 'Education', durationYears: 4 },
  { name: 'Physics Education', faculty: 'Education', durationYears: 4 },
  { name: 'Political Science Education', faculty: 'Education', durationYears: 4 },
  { name: 'Biology Education', faculty: 'Education', durationYears: 4 },
  { name: 'Chemistry Education', faculty: 'Education', durationYears: 4 },
  { name: 'English Education', faculty: 'Education', durationYears: 4 },
  { name: 'Geography Education', faculty: 'Education', durationYears: 4 },
  { name: 'Educational Administration & Planning', faculty: 'Education', durationYears: 4 },
  { name: 'Library & Information Science', faculty: 'Education', durationYears: 4 },

  // Faculty of Environmental Sciences (4)
  { name: 'Architecture', faculty: 'Environmental Sciences', durationYears: 5 },
  { name: 'Building Technology', faculty: 'Environmental Sciences', durationYears: 5 },
  { name: 'Estate Management', faculty: 'Environmental Sciences', durationYears: 5 },
  { name: 'Quantity Surveying', faculty: 'Environmental Sciences', durationYears: 5 },

  // Faculty of Law (2)
  { name: 'Law', faculty: 'Law', durationYears: 5 },
  { name: 'Common & Islamic Law', faculty: 'Law', durationYears: 5 },

  // Faculty of Pharmaceutical Sciences (1)
  { name: 'Pharmacy', faculty: 'Pharmaceutical Sciences', durationYears: 5 },

  // Faculty of Science (16)
  { name: 'Biochemistry', faculty: 'Science', durationYears: 4 },
  { name: 'Biology', faculty: 'Science', durationYears: 4 },
  { name: 'Biotechnology', faculty: 'Science', durationYears: 4 },
  { name: 'Botany', faculty: 'Science', durationYears: 4 },
  { name: 'Chemistry', faculty: 'Science', durationYears: 4 },
  { name: 'Computer Science', faculty: 'Science', durationYears: 4 },
  { name: 'Environmental Chemistry & Toxicology', faculty: 'Science', durationYears: 4 },
  { name: 'Geography', faculty: 'Science', durationYears: 4 },
  { name: 'Geology', faculty: 'Science', durationYears: 4 },
  { name: 'Industrial Chemistry', faculty: 'Science', durationYears: 4 },
  { name: 'Mathematics', faculty: 'Science', durationYears: 4 },
  { name: 'Microbiology', faculty: 'Science', durationYears: 4 },
  { name: 'Physics', faculty: 'Science', durationYears: 4 },
  { name: 'Science Laboratory Technology', faculty: 'Science', durationYears: 5 },
  { name: 'Statistics', faculty: 'Science', durationYears: 4 },
  { name: 'Zoology', faculty: 'Science', durationYears: 4 },
];

export const GSU_DEPARTMENTS: string[] = DEFAULT_GSU_DEPARTMENTS.map((d) => d.name);

export const STUDENT_LEVELS: Exclude<AcademicLevel, 'Staff'>[] = [
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
];

/**
 * Formats a stored level for display. Alumni accounts always show "Alumni";
 * numeric levels become "500 Level"; cohort labels such as "Class of 2026"
 * are shown as-is (never "Class of 2026 Level"); Staff stays "Staff".
 */
export function formatLevelLabel(level: string, isAlumni?: boolean): string {
  if (isAlumni) return 'Alumni';
  const v = (level || '').trim();
  if (!v || v.toLowerCase() === 'staff') return 'Staff';
  if (v.toLowerCase() === 'alumni') return 'Alumni';
  if (/^class of \d{4}$/i.test(v)) return v;
  if (/^\d{3}$/.test(v)) return `${v} Level`;
  return v;
}

/**
 * Compact level/cohort badge text (e.g. "400L", "Staff", "Class of 2026", or "Alumni").
 */
export function formatCompactLevelLabel(level: string, isAlumni?: boolean): string {
  if (isAlumni) return 'Alumni';
  const v = (level || '').trim();
  if (!v || v.toLowerCase() === 'staff') return 'Staff';
  if (v.toLowerCase() === 'alumni') return 'Alumni';
  if (/^class of \d{4}$/i.test(v)) return v;
  if (/^\d{3}$/.test(v)) return `${v}L`;
  return v;
}

/** Valid student levels for a course of the given length in years. */
export function levelsForDuration(durationYears: number): AcademicLevel[] {
  const dur = Math.min(6, Math.max(1, Math.floor(durationYears) || 4));
  const levels: AcademicLevel[] = [];
  for (let i = 1; i <= dur; i++) {
    levels.push(`${i}00` as AcademicLevel);
  }
  return levels;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  classRep: 'Class Rep',
  deptHelper: 'Dept Helper',
  lecturer: 'Lecturer',
  student: 'Student',
};

export const REPORT_REASONS: ReportReason[] = [
  'Spam',
  'Harassment',
  'Misinformation',
  'Inappropriate Content',
  'Other',
];

export const MESSAGE_REACTIONS = [
  { emoji: '❤️', label: 'Heart' },
  { emoji: '👍', label: 'Thumbs up' },
  { emoji: '😂', label: 'Laughter' },
  { emoji: '😮', label: 'Surprised' },
  { emoji: '😢', label: 'Sad' },
  { emoji: '🙏', label: 'Thanks' },
] as const;

export const RESOURCE_CATEGORIES: ResourceCategory[] = [
  'Past Questions',
  'Lecture Handout',
  'Lab Manual',
  'Lecture Notes',
  'Study Guide',
];

export const RESOURCE_LEVELS: ResourceLevel[] = [
  '100',
  '200',
  '300',
  '400',
  '500',
  'General',
];

export const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024;

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  'Textbooks',
  'Calculators',
  'Solar Kits',
  'Electronics',
  'Lodge / Accommodation',
  'Other',
];

export const MARKETPLACE_LISTING_TYPES: MarketplaceListingType[] = [
  'Sell',
  'Swap',
  'Vacancy',
];

export const MARKETPLACE_CONDITIONS: MarketplaceCondition[] = [
  'Brand New',
  'Like New',
  'Fairly Used',
  'Available',
];

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  exam: 'Exam Timetable',
  seminar: 'Dept Seminar',
  deadline: 'Deadline',
  campus_event: 'Campus Event',
};

export const CALENDAR_LEVELS: CalendarLevel[] = [
  'All',
  '100',
  '200',
  '300',
  '400',
  '500',
];

export const DEFAULT_ALLOWED_EMAIL_DOMAIN = 'gsu.edu.ng';
export const ANNOUNCEMENTS_READ_KEY = 'system_announcements';

export function normalizeEmailDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@+/, '');
}

export function isValidEmailDomain(domain: string): boolean {
  const clean = normalizeEmailDomain(domain);
  return clean.length >= 3 && clean.length <= 80 && /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(clean);
}

export function emailMatchesDomain(email: string, allowedDomain: string): boolean {
  const cleanEmail = email.trim().toLowerCase();
  const cleanDomain = normalizeEmailDomain(allowedDomain);
  const parts = cleanEmail.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1] === cleanDomain;
}

export function normalizeIdNumber(idNumber: string): string {
  return idNumber.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function idToInternalEmail(idNumber: string): string {
  const normalized = normalizeIdNumber(idNumber);
  return `${normalized}@gsuconnect.app`;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function hash32(input: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function deterministicUuid(seedText: string): string {
  const p0 = hash32(`s0:${seedText}`, 0x811c9dc5);
  const p1 = hash32(`s1:${seedText}`, 0x9e3779b9);
  const p2 = hash32(`s2:${seedText}`, 0x85ebca6b);
  const p3 = hash32(`s3:${seedText}`, 0xc2b2ae35);
  const bytes = new Uint8Array(16);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, p0, false);
  dv.setUint32(4, p1, false);
  dv.setUint32(8, p2, false);
  dv.setUint32(12, p3, false);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function getCustomGroupAccessKeys(
  department: string,
  level: string
): [string, string, string] {
  return ['all', `dept:${department}`, `deptLevel:${department}|${level}`];
}

export function formatShortTime(ts?: Timestamp | string | number | null): string {
  const parsed = toAppTimestamp(ts);
  if (!parsed) return 'Just now';
  const date = parsed.toDate();
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (sameDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDateTime(ts?: Timestamp | string | number | null): string {
  const parsed = toAppTimestamp(ts);
  if (!parsed) return 'Just now';
  const date = parsed.toDate();
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const ONLINE_WINDOW_MS = 5 * 60 * 1000;
export const TYPING_INDICATOR_WINDOW_MS = 7 * 1000;
export const MAX_VOICE_NOTE_SECONDS = 30;
export const MAX_VOICE_NOTE_BYTES = 5 * 1024 * 1024;

export function formatAudioDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatCallLogDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function isUserOnline(
  lastSeen?: Timestamp | string | number | null,
  nowMs: number = Date.now()
): boolean {
  const parsed = toAppTimestamp(lastSeen);
  if (!parsed) return false;
  return nowMs - parsed.toMillis() <= ONLINE_WINDOW_MS;
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'GS';
  // Skip purely numeric tokens (e.g. the "006" in seeded "TEST User 006")
  // so initials come from real name words.
  const meaningful = parts.filter((part) => /[^\p{N}]/u.test(part));
  const tokens = meaningful.length > 0 ? meaningful : parts;
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

export function formatFileSize(bytes: number): string {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe < 1024) return `${safe} B`;
  if (safe < 1024 * 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${(safe / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatNaira(amount: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(amount) ? amount : 0));
  return `₦${safe.toLocaleString('en-NG')}`;
}

export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MARKETPLACE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export const MAX_ID_CARD_BYTES = 3 * 1024 * 1024;
export const MAX_CHAT_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_CONTENT_LENGTH = 2000;
export const MAX_PINNED_CHATS = 3;
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETED_MESSAGE_PLACEHOLDER = 'This message was deleted';

export interface PresetAvatarOption {
  id: string;
  label: string;
  gradientClass: string;
  iconKey:
    | 'graduation'
    | 'book'
    | 'award'
    | 'atom'
    | 'flame'
    | 'cpu'
    | 'compass'
    | 'sparkles'
    | 'shield'
    | 'heart-pulse'
    | 'scale'
    | 'zap';
  adminOnly?: boolean;
}

export const PRESET_AVATARS: PresetAvatarOption[] = [
  { id: 'emerald-crest', label: 'GSU Crest', gradientClass: 'from-emerald-600 to-teal-700', iconKey: 'graduation', adminOnly: true },
  { id: 'royal-scholars', label: 'Scholars', gradientClass: 'from-indigo-600 to-blue-700', iconKey: 'book' },
  { id: 'savanna-gold', label: 'Laurel', gradientClass: 'from-amber-500 to-orange-600', iconKey: 'award' },
  { id: 'lab-cyan', label: 'Science Lab', gradientClass: 'from-cyan-500 to-sky-600', iconKey: 'atom' },
  { id: 'crimson-debate', label: 'Campus Pulse', gradientClass: 'from-rose-500 to-red-600', iconKey: 'flame' },
  { id: 'violet-tech', label: 'Computing', gradientClass: 'from-violet-600 to-purple-700', iconKey: 'cpu' },
  { id: 'forest-campus', label: 'Explorer', gradientClass: 'from-green-600 to-emerald-700', iconKey: 'compass' },
  { id: 'sunset-arts', label: 'Arts & Humanities', gradientClass: 'from-pink-500 to-amber-500', iconKey: 'sparkles' },
  { id: 'slate-executive', label: 'Executive', gradientClass: 'from-slate-700 to-slate-900', iconKey: 'shield', adminOnly: true },
  { id: 'teal-medical', label: 'Health Sciences', gradientClass: 'from-teal-500 to-emerald-600', iconKey: 'heart-pulse' },
  { id: 'cobalt-law', label: 'Law & Senate', gradientClass: 'from-blue-600 to-indigo-800', iconKey: 'scale' },
  { id: 'ochre-engineering', label: 'Innovation', gradientClass: 'from-yellow-500 to-amber-700', iconKey: 'zap' },
];

export function getFileTypeBadge(fileName: string, mimeType?: string): string {
  const cleanName = (fileName || '').trim();
  const dotIdx = cleanName.lastIndexOf('.');
  if (dotIdx >= 0 && dotIdx < cleanName.length - 1) {
    const ext = cleanName.slice(dotIdx + 1).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (ext && ext.length <= 6) return ext;
  }
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return 'PDF';
  if (mime.includes('wordprocessingml') || mime.includes('msword')) return 'DOCX';
  if (mime.includes('presentationml') || mime.includes('powerpoint')) return 'PPTX';
  if (mime.includes('spreadsheetml') || mime.includes('excel')) return 'XLSX';
  if (mime.startsWith('image/')) return 'IMG';
  if (mime.includes('text/plain')) return 'TXT';
  return 'FILE';
}

export function getMessageSnippet(msg: ChatMessage): string {
  if (msg.deletedAt) return DELETED_MESSAGE_PLACEHOLDER;
  const kind = msg.messageType || 'text';
  if (msg.isViewOnce) {
    if (msg.viewOnceOpenedAt) return 'Opened';
    return kind === 'voice' ? 'View-once voice message' : 'View-once photo';
  }
  if (kind === 'voice') {
    return msg.text || `Voice note (${formatAudioDuration(msg.audioDurationSec || 1)})`;
  }
  if (kind === 'poll') {
    return msg.pollQuestion ? `Poll: ${msg.pollQuestion}` : msg.text;
  }
  if (kind === 'image') {
    if (msg.text && msg.text !== `Photo: ${msg.fileName}`) return `Photo: ${msg.text}`;
    return msg.fileName ? `Photo: ${msg.fileName}` : 'Photo';
  }
  if (kind === 'document') {
    return msg.fileName ? `Document: ${msg.fileName}` : msg.text;
  }
  if (kind === 'event') {
    return msg.eventTitle
      ? `Event: ${msg.eventTitle}${msg.eventDate ? ` (${msg.eventDate})` : ''}`
      : msg.text;
  }
  if (kind === 'contact') {
    return msg.contactName ? `Contact: ${msg.contactName}` : msg.text;
  }
  if (kind === 'call') {
    return msg.text;
  }
  return msg.text;
}
