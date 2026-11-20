import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  MessageSquare,
  Pause,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import {
  createCampusStatus,
  deleteCampusStatus,
  markCampusStatusViewed,
  openOrCreateDmChat,
} from '../services/supabaseService';
import {
  AppUser,
  CampusStatus,
  formatCompactLevelLabel,
  formatShortTime,
  MAX_STATUS_IMAGE_BYTES,
  STATUS_BG_COLORS,
  STATUS_TTL_MS,
  StatusType,
} from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';

interface StatusViewProps {
  currentUser: AppUser;
  statuses: CampusStatus[];
  approvedUsers: AppUser[];
  nowMs: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onReplyInDm: (chatId: string) => void;
}

interface AuthorStatusGroup {
  authorId: string;
  authorName: string;
  authorDepartment: string;
  authorLevel: string;
  authorRole: AppUser['role'];
  items: CampusStatus[];
  latestAtMs: number;
  hasUnviewed: boolean;
}

const SLIDE_DURATION_MS = 6000;

async function compressStatusImageToBlob(file: File): Promise<{ blob: Blob; previewUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onerror = () => reject(new Error('Invalid image file.'));
      image.onload = () => resolve(image);
      image.src = objectUrl;
    });

    const maxSide = 1440;
    let { width, height } = img;
    if (width > maxSide || height > maxSide) {
      if (width >= height) {
        height = Math.max(1, Math.round((height * maxSide) / width));
        width = maxSide;
      } else {
        width = Math.max(1, Math.round((width * maxSide) / height));
        height = maxSide;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas compression is unavailable.');
    }
    ctx.drawImage(img, 0, 0, width, height);
    for (const q of [0.85, 0.72, 0.56]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', q)
      );
      if (blob && blob.size <= MAX_STATUS_IMAGE_BYTES) {
        return { blob, previewUrl: URL.createObjectURL(blob) };
      }
    }
    throw new Error('Photo exceeds the 10 MB limit after compression. Try another image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const StatusView: React.FC<StatusViewProps> = ({
  currentUser,
  statuses,
  approvedUsers,
  nowMs,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onReplyInDm,
}) => {
  const [composerOpen, setComposerOpen] = useState(false);
  const [composeType, setComposeType] = useState<StatusType>('text');
  const [statusText, setStatusText] = useState('');
  const [bgColor, setBgColor] = useState<string>(STATUS_BG_COLORS[0].hex);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const [composeError, setComposeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [viewerAuthorId, setViewerAuthorId] = useState<string | null>(null);
  const [viewerSlideIdx, setViewerSlideIdx] = useState(0);
  const [viewerPaused, setViewerPaused] = useState(false);
  const [slideProgressPct, setSlideProgressPct] = useState(0);
  const [viewersDrawerOpen, setViewersDrawerOpen] = useState(false);
  const [confirmDeleteSlide, setConfirmDeleteSlide] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [replyingDmBusy, setReplyingDmBusy] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const viewedMarkSentRef = useRef<Set<string>>(new Set());
  const elapsedOffsetRef = useRef<number>(0);
  const lastTrackedSlideIdRef = useRef<string | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, AppUser>();
    approvedUsers.forEach((u) => map.set(u.uid, u));
    return map;
  }, [approvedUsers]);

  // Filter strictly to active updates within the last 24 hours
  const activeStatuses = useMemo(() => {
    return statuses.filter((s) => {
      if (!s.createdAt) return true;
      return nowMs - s.createdAt.toMillis() <= STATUS_TTL_MS;
    });
  }, [statuses, nowMs]);

  const myStatuses = useMemo(() => {
    return activeStatuses
      .filter((s) => s.authorId === currentUser.uid)
      .sort((a, b) => (a.createdAt?.toMillis() ?? nowMs) - (b.createdAt?.toMillis() ?? nowMs));
  }, [activeStatuses, currentUser.uid, nowMs]);

  const { recentGroups, viewedGroups, allAuthorGroupsMap } = useMemo(() => {
    const byAuthor = new Map<string, AuthorStatusGroup>();

    activeStatuses.forEach((status) => {
      const createdMs = status.createdAt?.toMillis() ?? nowMs;
      const existing = byAuthor.get(status.authorId);
      const isViewed = Boolean(status.viewedBy?.[currentUser.uid]);
      if (!existing) {
        byAuthor.set(status.authorId, {
          authorId: status.authorId,
          authorName: status.authorName,
          authorDepartment: status.authorDepartment,
          authorLevel: status.authorLevel,
          authorRole: status.authorRole,
          items: [status],
          latestAtMs: createdMs,
          hasUnviewed: status.authorId !== currentUser.uid && !isViewed,
        });
      } else {
        existing.items.push(status);
        if (createdMs > existing.latestAtMs) existing.latestAtMs = createdMs;
        if (status.authorId !== currentUser.uid && !isViewed) {
          existing.hasUnviewed = true;
        }
      }
    });

    // Sort slides inside each author group chronologically (oldest -> newest)
    byAuthor.forEach((group) => {
      group.items.sort(
        (a, b) => (a.createdAt?.toMillis() ?? nowMs) - (b.createdAt?.toMillis() ?? nowMs)
      );
    });

    const others = Array.from(byAuthor.values()).filter(
      (g) => g.authorId !== currentUser.uid
    );
    others.sort((a, b) => b.latestAtMs - a.latestAtMs);

    return {
      recentGroups: others.filter((g) => g.hasUnviewed),
      viewedGroups: others.filter((g) => !g.hasUnviewed),
      allAuthorGroupsMap: byAuthor,
    };
  }, [activeStatuses, currentUser.uid, nowMs]);

  const activeGroup = viewerAuthorId ? allAuthorGroupsMap.get(viewerAuthorId) || null : null;
  const activeSlide =
    activeGroup && activeGroup.items[viewerSlideIdx] ? activeGroup.items[viewerSlideIdx] : null;

  // Close viewer if author's slides disappear (e.g., deleted)
  useEffect(() => {
    if (!viewerAuthorId) return;
    if (!activeGroup || activeGroup.items.length === 0) {
      setViewerAuthorId(null);
      setViewerSlideIdx(0);
      setViewersDrawerOpen(false);
      return;
    }
    if (viewerSlideIdx >= activeGroup.items.length) {
      setViewerSlideIdx(Math.max(0, activeGroup.items.length - 1));
    }
  }, [viewerAuthorId, activeGroup, viewerSlideIdx]);

  // Mark slide viewed when opened by another user
  useEffect(() => {
    if (!activeSlide) return;
    if (activeSlide.authorId === currentUser.uid) return;
    if (activeSlide.viewedBy?.[currentUser.uid]) return;
    if (viewedMarkSentRef.current.has(activeSlide.id)) return;
    viewedMarkSentRef.current.add(activeSlide.id);
    markCampusStatusViewed(activeSlide.id, currentUser.uid).catch((err) => {
      viewedMarkSentRef.current.delete(activeSlide.id);
      console.error('Failed marking status viewed:', err);
    });
  }, [activeSlide, currentUser.uid]);

  // Ordered author sequence for seamless story playback
  const viewerAuthorSequence = useMemo(() => {
    const seq: string[] = [];
    if (myStatuses.length > 0 && viewerAuthorId === currentUser.uid) {
      return [currentUser.uid];
    }
    recentGroups.forEach((g) => seq.push(g.authorId));
    viewedGroups.forEach((g) => seq.push(g.authorId));
    return seq;
  }, [myStatuses.length, viewerAuthorId, currentUser.uid, recentGroups, viewedGroups]);

  const handleNextSlide = () => {
    setConfirmDeleteSlide(false);
    setViewerError(null);
    elapsedOffsetRef.current = 0;
    if (!activeGroup) {
      setViewerAuthorId(null);
      return;
    }
    setViewersDrawerOpen(false);
    if (viewerSlideIdx + 1 < activeGroup.items.length) {
      setViewerSlideIdx((idx) => idx + 1);
      setSlideProgressPct(0);
      return;
    }
    const currentSeqIdx = viewerAuthorSequence.indexOf(activeGroup.authorId);
    if (currentSeqIdx >= 0 && currentSeqIdx + 1 < viewerAuthorSequence.length) {
      setViewerAuthorId(viewerAuthorSequence[currentSeqIdx + 1]);
      setViewerSlideIdx(0);
      setSlideProgressPct(0);
    } else {
      setViewerAuthorId(null);
      setViewerSlideIdx(0);
      setSlideProgressPct(0);
    }
  };

  const handlePrevSlide = () => {
    if (!activeGroup) return;
    setConfirmDeleteSlide(false);
    setViewerError(null);
    elapsedOffsetRef.current = 0;
    setViewersDrawerOpen(false);
    if (viewerSlideIdx > 0) {
      setViewerSlideIdx((idx) => idx - 1);
      setSlideProgressPct(0);
      return;
    }
    const currentSeqIdx = viewerAuthorSequence.indexOf(activeGroup.authorId);
    if (currentSeqIdx > 0) {
      const prevAuthorId = viewerAuthorSequence[currentSeqIdx - 1];
      const prevGroup = allAuthorGroupsMap.get(prevAuthorId);
      setViewerAuthorId(prevAuthorId);
      setViewerSlideIdx(prevGroup ? Math.max(0, prevGroup.items.length - 1) : 0);
      setSlideProgressPct(0);
    } else {
      setSlideProgressPct(0);
    }
  };

  // Auto-advance timer preserving elapsed progress across pause/resume
  useEffect(() => {
    if (!activeSlide) return;
    if (lastTrackedSlideIdRef.current !== activeSlide.id) {
      lastTrackedSlideIdRef.current = activeSlide.id;
      elapsedOffsetRef.current = 0;
      setSlideProgressPct(0);
      setConfirmDeleteSlide(false);
    }
    if (viewerPaused || viewersDrawerOpen || confirmDeleteSlide) return;
    const runStart = Date.now();
    const baseElapsed = elapsedOffsetRef.current;
    const timer = window.setInterval(() => {
      const totalElapsed = baseElapsed + (Date.now() - runStart);
      elapsedOffsetRef.current = totalElapsed;
      const pct = Math.min(100, (totalElapsed / SLIDE_DURATION_MS) * 100);
      setSlideProgressPct(pct);
      if (totalElapsed >= SLIDE_DURATION_MS) {
        window.clearInterval(timer);
        elapsedOffsetRef.current = 0;
        handleNextSlide();
      }
    }, 60);
    return () => window.clearInterval(timer);
  }, [activeSlide?.id, viewerPaused, viewersDrawerOpen, confirmDeleteSlide]);

  // Keyboard navigation in story viewer
  useEffect(() => {
    if (!activeGroup || !activeSlide) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewersDrawerOpen) {
          setViewersDrawerOpen(false);
        } else {
          setViewerAuthorId(null);
          setConfirmDeleteSlide(false);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevSlide();
      } else if (e.key === ' ') {
        e.preventDefault();
        setViewerPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeGroup, activeSlide, viewersDrawerOpen, viewerSlideIdx]);

  const openViewerForAuthor = (authorId: string) => {
    const group = allAuthorGroupsMap.get(authorId);
    if (!group || group.items.length === 0) return;
    const firstUnviewedIdx = group.items.findIndex(
      (item) => item.authorId !== currentUser.uid && !item.viewedBy?.[currentUser.uid]
    );
    elapsedOffsetRef.current = 0;
    lastTrackedSlideIdRef.current = null;
    setConfirmDeleteSlide(false);
    setViewerError(null);
    setViewerAuthorId(authorId);
    setViewerSlideIdx(firstUnviewedIdx >= 0 ? firstUnviewedIdx : 0);
    setSlideProgressPct(0);
    setViewerPaused(false);
    setViewersDrawerOpen(false);
  };

  const clearPhotoDraft = () => {
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    setPhotoBlob(null);
    setPhotoPreviewUrl(null);
  };

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
  }, [photoPreviewUrl]);

  const handlePickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setComposeError(null);
    try {
      const { blob, previewUrl } = await compressStatusImageToBlob(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoBlob(blob);
      setPhotoPreviewUrl(previewUrl);
      setComposeType('image');
      setComposerOpen(true);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Unable to process photo.');
    }
  };

  const handlePublishStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setComposeError(null);
    setSubmitting(true);
    try {
      if (composeType === 'text') {
        await createCampusStatus(currentUser, {
          type: 'text',
          text: statusText,
          bgColor,
        });
      } else {
        if (!photoBlob) {
          throw new Error('Please choose a photo to post.');
        }
        await createCampusStatus(currentUser, {
          type: 'image',
          text: photoCaption,
          imageFile: photoBlob,
        });
      }
      setStatusText('');
      clearPhotoDraft();
      setPhotoCaption('');
      setComposerOpen(false);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to post update.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteActiveSlide = async () => {
    if (!activeSlide || deletingBusy) return;
    setViewerError(null);
    setDeletingBusy(true);
    try {
      await deleteCampusStatus(activeSlide.id);
      setConfirmDeleteSlide(false);
      setViewersDrawerOpen(false);
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : 'Failed deleting status.');
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleReplyAuthorInDm = async () => {
    if (!activeSlide || replyingDmBusy) return;
    const targetUser = userMap.get(activeSlide.authorId);
    if (!targetUser) return;
    setViewerError(null);
    setReplyingDmBusy(true);
    try {
      const dmId = await openOrCreateDmChat(currentUser, targetUser);
      setViewerAuthorId(null);
      onReplyInDm(dmId);
    } catch (err) {
      setViewerError(err instanceof Error ? err.message : 'Failed opening direct message.');
    } finally {
      setReplyingDmBusy(false);
    }
  };

  const totalMyViews = useMemo(() => {
    const uniqueUids = new Set<string>();
    myStatuses.forEach((s) => {
      Object.keys(s.viewedBy || {}).forEach((u) => {
        if (u !== currentUser.uid && s.viewedBy[u]) uniqueUids.add(u);
      });
    });
    return uniqueUids.size;
  }, [myStatuses, currentUser.uid]);

  const activeSlideViewers = useMemo(() => {
    if (!activeSlide) return [];
    return Object.entries(activeSlide.viewedBy || {})
      .filter(([uid, seen]) => seen && uid !== activeSlide.authorId)
      .map(
        ([uid]) =>
          userMap.get(uid) || {
            uid,
            fullName: 'GSU Member',
            department: 'GSU',
            level: '',
            is_alumni: false,
            role: 'student' as const,
            photoURL: undefined as string | undefined,
            avatarId: undefined as string | undefined,
          }
      );
  }, [activeSlide, userMap]);

  return (
    <div className="h-full overflow-y-auto px-3 py-3 space-y-5">
      {/* My Status Card */}
      <div className="bg-sunken dark:bg-sunken/60 border border-line/80 rounded-2xl p-3.5 space-y-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (myStatuses.length > 0) {
                openViewerForAuthor(currentUser.uid);
              } else {
                setComposeType('text');
                setComposerOpen(true);
              }
            }}
            className="relative shrink-0 cursor-pointer"
            aria-label={myStatuses.length > 0 ? 'View my status updates' : 'Post my first status'}
          >
            <UserAvatar
              name={currentUser.fullName}
              photoURL={currentUser.photoURL}
              avatarId={currentUser.avatarId}
              size="lg"
              roundedClass="rounded-full"
              className={`w-12 h-12 ${
                myStatuses.length > 0
                  ? 'ring-2 ring-success ring-offset-2 ring-offset-white dark:ring-offset-slate-900'
                  : ''
              }`}
              fallbackClassName={
                myStatuses.length > 0
                  ? 'bg-brand text-on-brand'
                  : 'bg-sunken text-ink-soft'
              }
            />
            {myStatuses.length === 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center ring-2 ring-white dark:ring-surface">
                <Plus className="w-3 h-3" />
              </span>
            )}
          </button>

          <div
            onClick={() => {
              if (myStatuses.length > 0) {
                openViewerForAuthor(currentUser.uid);
              } else {
                setComposeType('text');
                setComposerOpen(true);
              }
            }}
            className="flex-1 min-w-0 cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink truncate">
                My Status
              </p>
              {myStatuses.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand">
                  <Eye className="w-3.5 h-3.5" />
                  {totalMyViews} {totalMyViews === 1 ? 'view' : 'views'}
                </span>
              )}
            </div>
            <p className="text-xs text-ink-muted truncate mt-0.5">
              {myStatuses.length > 0
                ? `${myStatuses.length} active update${myStatuses.length > 1 ? 's' : ''} · Last ${formatShortTime(myStatuses[myStatuses.length - 1].createdAt)}`
                : 'Share a 24-hour text or photo campus update'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setComposeError(null);
              setComposeType('text');
              setComposerOpen(true);
            }}
            className="flex-1 min-h-[40px] px-3 rounded-xl bg-brand hover:bg-brand-strong text-on-brand text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Type className="w-3.5 h-3.5" />
            <span>Text Update</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setComposeError(null);
              photoInputRef.current?.click();
            }}
            className="flex-1 min-h-[40px] px-3 rounded-xl bg-surface hover:bg-sunken border border-line text-ink dark:text-ink-soft text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5 text-brand" />
            <span>Photo Update</span>
          </button>
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          onChange={handlePickPhoto}
          className="hidden"
        />
      </div>

      {/* Recent Updates (Unviewed) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Recent updates
          </span>
          <span className="text-[11px] font-mono text-ink-muted">
            {recentGroups.length}
          </span>
        </div>

        {recentGroups.length === 0 ? (
          <div className="px-3 py-5 text-center rounded-2xl border border-dashed border-line space-y-1.5">
            <Sparkles className="w-5 h-5 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs text-ink-muted">
              No unviewed 24-hour updates from GSU members right now.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {recentGroups.map((group) => {
              const latest = group.items[group.items.length - 1];
              return (
                <button
                  key={group.authorId}
                  type="button"
                  onClick={() => openViewerForAuthor(group.authorId)}
                  className="w-full px-2.5 py-2.5 rounded-2xl flex items-center gap-3 text-left hover:bg-sunken dark:hover:bg-sunken/70 transition-colors cursor-pointer"
                >
                  <UserAvatar
                    name={group.authorName}
                    photoURL={userMap.get(group.authorId)?.photoURL}
                    avatarId={userMap.get(group.authorId)?.avatarId}
                    size="lg"
                    roundedClass="rounded-full"
                    className="ring-2 ring-success ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
                    fallbackClassName="bg-brand text-on-brand"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-ink truncate">
                        {group.authorName}
                      </span>
                      <span className="text-[11px] text-brand font-medium shrink-0">
                        {formatShortTime(latest.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted truncate mt-0.5">
                      {group.authorDepartment} · {group.items.length} update
                      {group.items.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Viewed Updates */}
      {viewedGroups.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
              Viewed updates
            </span>
            <span className="text-[11px] font-mono text-ink-muted">
              {viewedGroups.length}
            </span>
          </div>
          <div className="space-y-1">
            {viewedGroups.map((group) => {
              const latest = group.items[group.items.length - 1];
              return (
                <button
                  key={group.authorId}
                  type="button"
                  onClick={() => openViewerForAuthor(group.authorId)}
                  className="w-full px-2.5 py-2.5 rounded-2xl flex items-center gap-3 text-left hover:bg-sunken dark:hover:bg-sunken/70 transition-colors cursor-pointer"
                >
                  <UserAvatar
                    name={group.authorName}
                    photoURL={userMap.get(group.authorId)?.photoURL}
                    avatarId={userMap.get(group.authorId)?.avatarId}
                    size="lg"
                    roundedClass="rounded-full"
                    className="ring-2 ring-slate-300 dark:ring-slate-600 ring-offset-2 ring-offset-white dark:ring-offset-slate-900"
                    fallbackClassName="bg-sunken text-ink-soft"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-soft truncate">
                        {group.authorName}
                      </span>
                      <span className="text-[11px] text-ink-muted shrink-0">
                        {formatShortTime(latest.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted truncate mt-0.5">
                      {group.authorDepartment} · {group.items.length} update
                      {group.items.length > 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="min-h-[40px] px-5 rounded-2xl border border-line bg-surface hover:bg-sunken disabled:opacity-60 text-xs font-semibold text-ink-soft transition-colors cursor-pointer"
          >
            {loadingMore ? 'Loading more...' : 'Load older status updates'}
          </button>
        </div>
      )}

      {/* Compose Status Modal */}
      {composerOpen && (
        <div
          onClick={() => !submitting && setComposerOpen(false)}
          className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface border border-line rounded-3xl p-5 shadow-overlay space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-brand" />
                <h3 className="text-base font-bold text-ink">
                  Post 24-Hour Update
                </h3>
              </div>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setComposerOpen(false)}
                aria-label="Close status composer"
                className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="inline-flex items-center gap-1 p-1 bg-sunken rounded-2xl w-full">
              <button
                type="button"
                onClick={() => {
                  setComposeError(null);
                  setComposeType('text');
                }}
                className={`flex-1 min-h-[38px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  composeType === 'text'
                    ? 'bg-white dark:bg-surface text-ink shadow-resting'
                    : 'text-ink-body dark:text-ink-muted'
                }`}
              >
                Text Card
              </button>
              <button
                type="button"
                onClick={() => {
                  setComposeError(null);
                  setComposeType('image');
                }}
                className={`flex-1 min-h-[38px] rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  composeType === 'image'
                    ? 'bg-white dark:bg-surface text-ink shadow-resting'
                    : 'text-ink-body dark:text-ink-muted'
                }`}
              >
                Photo Update
              </button>
            </div>

            {composeError && (
              <div className="p-3 rounded-2xl bg-danger-bg dark:bg-danger-bg/60 border border-danger-line dark:border-danger text-xs text-danger">
                {composeError}
              </div>
            )}

            <form onSubmit={handlePublishStatus} className="space-y-4">
              {composeType === 'text' ? (
                <>
                  <div
                    className="rounded-2xl p-6 min-h-[170px] flex items-center justify-center text-center shadow-inner transition-colors"
                    style={{ backgroundColor: bgColor }}
                  >
                    <textarea
                      value={statusText}
                      onChange={(e) => setStatusText(e.target.value)}
                      maxLength={400}
                      rows={4}
                      required
                      placeholder="Type a campus update, study reminder, or notice..."
                      className="w-full bg-transparent text-white placeholder:text-white/60 text-base font-bold text-center resize-none focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink-muted">
                      Background
                    </span>
                    <div className="flex items-center gap-2">
                      {STATUS_BG_COLORS.map((swatch) => (
                        <button
                          key={swatch.hex}
                          type="button"
                          onClick={() => setBgColor(swatch.hex)}
                          aria-label={swatch.label}
                          title={swatch.label}
                          className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                            bgColor === swatch.hex
                              ? 'ring-2 ring-offset-2 ring-success dark:ring-offset-slate-900 scale-110'
                              : 'hover:scale-105'
                          }`}
                          style={{ backgroundColor: swatch.hex }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {photoPreviewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-64">
                      <img
                        src={photoPreviewUrl}
                        alt="Status preview"
                        className="max-h-64 w-auto object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="absolute bottom-2.5 right-2.5 px-3 py-1.5 rounded-xl bg-slate-900/80 text-white text-xs font-semibold hover:bg-slate-900 cursor-pointer"
                      >
                        Change photo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="w-full min-h-[160px] rounded-2xl border-2 border-dashed border-line hover:border-brand flex flex-col items-center justify-center gap-2 text-ink-muted cursor-pointer"
                    >
                      <Camera className="w-7 h-7 text-brand" />
                      <span className="text-xs font-semibold">Tap to select a campus photo</span>
                    </button>
                  )}
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    maxLength={250}
                    placeholder="Add an optional caption..."
                    className="w-full min-h-[44px] px-3.5 rounded-2xl bg-sunken border border-line text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-focus"
                  />
                </>
              )}

              <button
                type="submit"
                disabled={submitting || (composeType === 'text' ? !statusText.trim() : !photoBlob)}
                className="w-full min-h-[44px] rounded-2xl bg-brand hover:bg-brand-strong disabled:opacity-50 text-on-brand text-sm font-semibold transition-colors cursor-pointer"
              >
                {submitting ? 'Sharing Update...' : 'Share for 24 Hours'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Full-Screen Story Viewer */}
      {activeGroup && activeSlide && (
        <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col">
          {/* Top Progress Segments */}
          <div className="px-3 pt-3 pb-2 space-y-2.5 bg-gradient-to-b from-slate-950/90 to-transparent z-10">
            <div className="flex items-center gap-1.5">
              {activeGroup.items.map((item, idx) => {
                const widthPct =
                  idx < viewerSlideIdx ? 100 : idx === viewerSlideIdx ? slideProgressPct : 0;
                return (
                  <div
                    key={item.id}
                    className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden"
                  >
                    <div
                      className="h-full bg-surface rounded-full transition-[width] duration-75"
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <UserAvatar
                  name={activeGroup.authorName}
                  photoURL={userMap.get(activeGroup.authorId)?.photoURL}
                  avatarId={userMap.get(activeGroup.authorId)?.avatarId}
                  size="sm"
                  roundedClass="rounded-full"
                  className="w-9 h-9"
                  fallbackClassName="bg-brand text-on-brand"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white truncate">
                      {activeGroup.authorId === currentUser.uid ? 'My Status' : activeGroup.authorName}
                    </span>
                    <RoleBadge role={activeGroup.authorRole} />
                  </div>
                  <p className="text-[11px] text-slate-300 truncate">
                    {activeGroup.authorDepartment}
                    {activeGroup.authorLevel || userMap.get(activeGroup.authorId)?.is_alumni
                      ? ` · ${formatCompactLevelLabel(
                          activeGroup.authorLevel,
                          userMap.get(activeGroup.authorId)?.is_alumni
                        )}`
                      : ''}{' '}
                    · {formatShortTime(activeSlide.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewerPaused((p) => !p)}
                  aria-label={viewerPaused ? 'Resume status' : 'Pause status'}
                  className="min-w-[38px] min-h-[38px] rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer"
                >
                  {viewerPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                {(activeSlide.authorId === currentUser.uid || currentUser.role === 'admin') &&
                  (confirmDeleteSlide ? (
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        disabled={deletingBusy}
                        onClick={handleDeleteActiveSlide}
                        className="min-h-[34px] px-2.5 rounded-full bg-danger hover:bg-danger text-danger-on text-xs font-semibold cursor-pointer"
                      >
                        {deletingBusy ? '...' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSlide(false)}
                        className="min-h-[34px] px-2 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={deletingBusy}
                      onClick={() => setConfirmDeleteSlide(true)}
                      aria-label="Delete status update"
                      className="min-w-[38px] min-h-[38px] rounded-full hover:bg-danger/20 text-danger flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => {
                    setViewerAuthorId(null);
                    setViewersDrawerOpen(false);
                    setConfirmDeleteSlide(false);
                  }}
                  aria-label="Close status viewer"
                  className="min-w-[38px] min-h-[38px] rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {viewerError && (
              <div className="rounded-xl bg-danger-bg/90 border border-danger/80 px-3 py-2 text-xs text-danger-line text-center">
                {viewerError}
              </div>
            )}
          </div>

          {/* Slide Canvas */}
          <div className="relative flex-1 flex items-center justify-center overflow-hidden px-4 py-4">
            {/* Prev / Next Tap Zones */}
            <button
              type="button"
              onClick={handlePrevSlide}
              aria-label="Previous update"
              className="hidden sm:flex absolute left-4 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 items-center justify-center text-white cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextSlide}
              aria-label="Next update"
              className="hidden sm:flex absolute right-4 z-10 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 items-center justify-center text-white cursor-pointer"
            >
              <ChevronRight className="w-5 h-5" />
            </button>

            <div
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                if (e.clientX - rect.left < rect.width * 0.35) {
                  handlePrevSlide();
                } else {
                  handleNextSlide();
                }
              }}
              className="w-full max-w-xl h-full flex flex-col items-center justify-center cursor-pointer select-none"
            >
              {activeSlide.type === 'text' ? (
                <div
                  className="w-full min-h-[320px] max-h-[75vh] rounded-3xl p-8 flex items-center justify-center text-center shadow-overlay"
                  style={{ backgroundColor: activeSlide.bgColor || STATUS_BG_COLORS[0].hex }}
                >
                  <p className="text-xl sm:text-2xl font-bold leading-relaxed text-white whitespace-pre-wrap break-words">
                    {activeSlide.text}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 max-h-full">
                  <img
                    src={activeSlide.imageData}
                    alt={activeSlide.text || 'Campus status photo'}
                    className="max-h-[68vh] w-auto rounded-2xl object-contain shadow-overlay"
                  />
                  {activeSlide.text && (
                    <p className="px-4 py-2 rounded-2xl bg-black/60 text-sm text-white text-center max-w-md">
                      {activeSlide.text}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Bar: Author Views or Viewer Quick DM */}
          <div className="px-4 py-3.5 bg-gradient-to-t from-slate-950/95 to-transparent flex items-center justify-center">
            {activeSlide.authorId === currentUser.uid ? (
              <button
                type="button"
                onClick={() => setViewersDrawerOpen((prev) => !prev)}
                className="min-h-[40px] px-4 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Eye className="w-4 h-4 text-success" />
                <span>
                  {activeSlideViewers.length}{' '}
                  {activeSlideViewers.length === 1 ? 'view' : 'views'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={replyingDmBusy}
                onClick={handleReplyAuthorInDm}
                className="min-h-[42px] px-5 rounded-full bg-brand hover:bg-brand text-on-brand text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>{replyingDmBusy ? 'Opening DM...' : `Reply to ${activeGroup.authorName}`}</span>
              </button>
            )}
          </div>

          {/* Viewers List Drawer for Status Author */}
          {viewersDrawerOpen && activeSlide.authorId === currentUser.uid && (
            <div
              onClick={() => setViewersDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md bg-surface text-ink rounded-t-3xl p-5 max-h-[60vh] flex flex-col gap-3 shadow-overlay"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-brand" />
                    <h4 className="text-sm font-bold">
                      Viewed by ({activeSlideViewers.length})
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewersDrawerOpen(false)}
                    className="min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {activeSlideViewers.length === 0 ? (
                  <p className="text-xs text-ink-muted py-4 text-center">
                    No views yet. Approved GSU members who view this status will appear here.
                  </p>
                ) : (
                  <div className="overflow-y-auto space-y-2 pr-1">
                    {activeSlideViewers.map((viewer) => (
                      <div
                        key={viewer.uid}
                        className="flex items-center gap-3 p-2 rounded-xl bg-sunken dark:bg-sunken/70"
                      >
                        <UserAvatar
                          name={viewer.fullName}
                          photoURL={viewer.photoURL}
                          avatarId={viewer.avatarId}
                          size="sm"
                          roundedClass="rounded-full"
                          fallbackClassName="bg-brand text-on-brand"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{viewer.fullName}</p>
                          <p className="text-[11px] text-ink-muted truncate">
                            {viewer.department}
                            {viewer.level || viewer.is_alumni
                              ? ` · ${formatCompactLevelLabel(viewer.level, viewer.is_alumni)}`
                              : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
