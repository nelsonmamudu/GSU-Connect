import { AppUser, toMillis } from '../types';

export type PendingFilter = 'all' | 'students' | 'staff' | 'invited' | 'no-proof';
export type PendingSort = 'newest' | 'oldest' | 'name' | 'department';

export interface PendingQueueOptions {
  query?: string;
  filter?: PendingFilter;
  sort?: PendingSort;
}

export interface PendingQueueSummary {
  total: number;
  students: number;
  staff: number;
  invited: number;
  withoutProof: number;
  /** Age in hours of the oldest un-reviewed request, when timestamps exist. */
  oldestWaitingHours: number | null;
}

export function isLecturerRequest(user: AppUser): boolean {
  return user.accountType === 'staff' || user.requestedRole === 'lecturer';
}

export function hasProofEvidence(user: AppUser): boolean {
  return Boolean(user.proofMethod || user.idCardPath);
}

function matchesQuery(user: AppUser, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [user.fullName, user.idNumber, user.email || '', user.department]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function matchesFilter(user: AppUser, filter: PendingFilter): boolean {
  switch (filter) {
    case 'students':
      return !isLecturerRequest(user);
    case 'staff':
      return isLecturerRequest(user);
    case 'invited':
      return Boolean(user.invited);
    case 'no-proof':
      return !hasProofEvidence(user);
    case 'all':
    default:
      return true;
  }
}

function compare(a: AppUser, b: AppUser, sort: PendingSort): number {
  switch (sort) {
    case 'oldest':
      return toMillis(a.createdAt) - toMillis(b.createdAt);
    case 'name':
      return a.fullName.localeCompare(b.fullName);
    case 'department':
      return a.department.localeCompare(b.department) || a.fullName.localeCompare(b.fullName);
    case 'newest':
    default:
      return toMillis(b.createdAt) - toMillis(a.createdAt);
  }
}

/** Search, filter and sort the pending queue without mutating the input. */
export function filterPending(
  users: AppUser[],
  options: PendingQueueOptions = {},
): AppUser[] {
  const { query = '', filter = 'all', sort = 'newest' } = options;
  return users
    .filter((user) => matchesQuery(user, query) && matchesFilter(user, filter))
    .slice()
    .sort((a, b) => compare(a, b, sort));
}

export function summarizePending(users: AppUser[]): PendingQueueSummary {
  const oldest = users.reduce<number | null>((acc, user) => {
    const ms = toMillis(user.createdAt);
    if (!ms) return acc;
    return acc === null || ms < acc ? ms : acc;
  }, null);
  return {
    total: users.length,
    students: users.filter((u) => !isLecturerRequest(u)).length,
    staff: users.filter((u) => isLecturerRequest(u)).length,
    invited: users.filter((u) => u.invited).length,
    withoutProof: users.filter((u) => !hasProofEvidence(u)).length,
    oldestWaitingHours:
      oldest === null ? null : Math.max(0, Math.round((Date.now() - oldest) / 3_600_000)),
  };
}
