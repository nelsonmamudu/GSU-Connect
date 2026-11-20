import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Eye,
  EyeOff,
  Flame,
  Plus,
  Search,
  ShieldCheck,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react';
import {
  createConfession,
  deleteConfession,
  fetchConfessionAuthor,
  fetchMyConfessions,
  moderateConfession,
  toggleConfessionUpvote,
} from '../services/supabaseService';
import {
  AppUser,
  CampusConfession,
  CONFESSION_CATEGORIES,
  ConfessionCategory,
  formatShortTime,
} from '../types';

interface ConfessionsViewProps {
  currentUser: AppUser;
  confessions: CampusConfession[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

type ConfessionViewMode = 'feed' | 'queue' | 'mine';

export const ConfessionsView: React.FC<ConfessionsViewProps> = ({
  currentUser,
  confessions,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) => {
  // The hardened database only lets admins change a confession's status
  // (guard_confession_update trigger), so moderation UI is admin-only.
  const isAdmin = currentUser.role === 'admin';
  const isModerator = isAdmin;
  const [viewMode, setViewMode] = useState<ConfessionViewMode>('feed');
  const [categoryFilter, setCategoryFilter] = useState<ConfessionCategory | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'top'>('newest');

  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<ConfessionCategory>('Confession');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [submitSuccessNote, setSubmitSuccessNote] = useState<string | null>(null);
  const successTimerRef = useRef<number | null>(null);

  const [moderatingId, setModeratingId] = useState<string | null>(null);
  const [upvotingId, setUpvotingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [mySubmissions, setMySubmissions] = useState<CampusConfession[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [revealedAuthors, setRevealedAuthors] = useState<Record<string, AppUser | null>>({});
  const [revealingAuthorId, setRevealingAuthorId] = useState<string | null>(null);

  const loadMySubmissions = useCallback(async () => {
    setLoadingMine(true);
    try {
      const rows = await fetchMyConfessions();
      setMySubmissions(rows);
    } catch (err) {
      if (viewMode === 'mine') {
        setBannerError(err instanceof Error ? err.message : 'Unable to load your submissions.');
      }
    } finally {
      setLoadingMine(false);
    }
  }, [viewMode]);

  useEffect(() => {
    loadMySubmissions();
  }, [currentUser.uid, confessions.length]);

  useEffect(() => {
    if (viewMode === 'mine') {
      loadMySubmissions();
    }
  }, [viewMode, loadMySubmissions]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
    };
  }, []);

  const approvedList = useMemo(
    () => confessions.filter((c) => c.status === 'approved'),
    [confessions]
  );

  const pendingQueue = useMemo(
    () => (isModerator ? confessions.filter((c) => c.status === 'pending') : []),
    [confessions, isModerator]
  );

  const visiblePosts = useMemo(() => {
    const base =
      viewMode === 'queue' && isModerator
        ? pendingQueue
        : viewMode === 'mine'
          ? mySubmissions
          : approvedList;

    const q = searchQuery.trim().toLowerCase();
    const filtered = base.filter((c) => {
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        c.text.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'top' && viewMode === 'feed') {
      return [...filtered].sort((a, b) => (b.upvoteCount || 0) - (a.upvoteCount || 0));
    }
    return filtered;
  }, [
    viewMode,
    isModerator,
    pendingQueue,
    mySubmissions,
    approvedList,
    categoryFilter,
    searchQuery,
    sortBy,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await createConfession(currentUser, category, text);
      setCreateOpen(false);
      setText('');
      setSubmitSuccessNote(
        'Submitted anonymously! Your post is pending review by a campus moderator before it appears in the feed.'
      );
      if (successTimerRef.current) window.clearTimeout(successTimerRef.current);
      successTimerRef.current = window.setTimeout(() => setSubmitSuccessNote(null), 5000);
      loadMySubmissions();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevealAuthor = async (postId: string) => {
    if (!isAdmin || revealingAuthorId) return;
    setBannerError(null);
    setRevealingAuthorId(postId);
    try {
      const author = await fetchConfessionAuthor(postId);
      setRevealedAuthors((prev) => ({ ...prev, [postId]: author }));
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not look up author.');
    } finally {
      setRevealingAuthorId(null);
    }
  };

  const handleUpvote = async (post: CampusConfession) => {
    if (upvotingId || post.status !== 'approved') return;
    setBannerError(null);
    setUpvotingId(post.id);
    try {
      const { upvoted, upvoteCount } = await toggleConfessionUpvote(post.id);
      // The feed refreshes itself via the sync broadcast; keep the
      // local "mine" list consistent immediately too.
      setMySubmissions((prev) =>
        prev.map((p) => (p.id === post.id ? { ...p, upvotedByMe: upvoted, upvoteCount } : p))
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not update upvote.');
    } finally {
      setUpvotingId(null);
    }
  };

  const handleModerate = async (postId: string, decision: 'approved' | 'rejected') => {
    if (!isModerator || moderatingId) return;
    setBannerError(null);
    setModeratingId(postId);
    try {
      await moderateConfession(postId, currentUser.uid, decision);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not moderate post.');
    } finally {
      setModeratingId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setBannerError(null);
    setDeletingId(postId);
    try {
      await deleteConfession(postId);
      setMySubmissions((prev) => prev.filter((item) => item.id !== postId));
      setConfirmDeleteId(null);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not delete post.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                GSU Confessions &amp; Gist
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                <EyeOff className="w-3 h-3" />
                <span>Anonymous</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Share campus thoughts, Off-Campus (Tumfure) gist, lecture hall moments, or shoutouts. Names and matric numbers are never displayed.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
            className="min-h-[42px] px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Post Anonymously</span>
          </button>
        </div>

        {submitSuccessNote && (
          <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200 flex items-center justify-between gap-2">
            <span>{submitSuccessNote}</span>
            <button
              type="button"
              onClick={() => setSubmitSuccessNote(null)}
              className="text-emerald-700 dark:text-emerald-300 hover:opacity-75 cursor-pointer"
              aria-label="Dismiss message"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
            <button
              type="button"
              onClick={() => setViewMode('feed')}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'feed'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Approved Feed ({approvedList.length})
            </button>

            {isModerator && (
              <button
                type="button"
                onClick={() => setViewMode('queue')}
                className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  viewMode === 'queue'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <span>Moderation Queue</span>
                {pendingQueue.length > 0 && (
                  <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-600 text-white text-[10px] font-bold tabular-nums flex items-center justify-center">
                    {pendingQueue.length}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setViewMode('mine')}
              className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                viewMode === 'mine'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              My Submissions ({mySubmissions.length})
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'feed' && (
              <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSortBy('newest')}
                  className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    sortBy === 'newest'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Newest
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('top')}
                  className={`min-h-[30px] px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                    sortBy === 'top'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Top Upvoted
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Search & Category Filter Pills */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search confessions, lecture hall gist, Tumfure, or shoutouts..."
            aria-label="Search confessions"
            className="w-full min-h-[42px] pl-10 pr-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear confession search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(['All', ...CONFESSION_CATEGORIES] as const).map((cat) => {
            const active = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`min-h-[32px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500/60'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {bannerError && (
        <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-4 py-3 text-xs text-rose-800 dark:text-rose-200 flex items-center justify-between gap-2">
          <span>{bannerError}</span>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            aria-label="Dismiss error"
            className="text-rose-600 hover:text-rose-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Cards */}
      {viewMode === 'mine' && loadingMine && visiblePosts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
          Loading your anonymous submissions...
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
          <Flame className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {viewMode === 'queue'
              ? 'Moderation queue is clear'
              : viewMode === 'mine'
                ? 'No anonymous submissions yet'
                : 'No confessions or gist yet'}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {viewMode === 'queue'
              ? 'All submitted campus posts have been reviewed.'
              : 'Be the first to share a campus confession, Off-Campus (Tumfure) update, or shoutout.'}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visiblePosts.map((post) => {
            const upvoteCount = post.upvoteCount || 0;
            const hasUpvoted = Boolean(post.upvotedByMe);
            const canDelete = isAdmin;
            const revealedAuthor = revealedAuthors[post.id];
            const authorChecked = Object.prototype.hasOwnProperty.call(revealedAuthors, post.id);

            return (
              <article
                key={post.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
                        <EyeOff className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          Anonymous GSU Student
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {formatShortTime(post.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold">
                        {post.category}
                      </span>
                      {viewMode !== 'feed' && (
                        <span
                          className={`px-2 py-1 rounded-xl text-[11px] font-semibold capitalize ${
                            post.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : post.status === 'rejected'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                          }`}
                        >
                          {post.status}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                    {post.text}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  {post.status === 'approved' ? (
                    <button
                      type="button"
                      disabled={upvotingId === post.id}
                      onClick={() => handleUpvote(post)}
                      className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer tabular-nums ${
                        hasUpvoted
                          ? 'bg-emerald-700 border-emerald-700 text-white'
                          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
                      }`}
                    >
                      <ThumbsUp className="w-3.5 h-3.5" />
                      <span>{upvoteCount}</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                      <span>
                        {post.status === 'pending'
                          ? 'Awaiting moderator approval'
                          : 'Rejected by moderator'}
                      </span>
                    </span>
                  )}

                  <div className="flex items-center gap-1.5">
                    {isModerator && post.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          disabled={moderatingId === post.id}
                          onClick={() => handleModerate(post.id, 'approved')}
                          className="min-h-[36px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={moderatingId === post.id}
                          onClick={() => handleModerate(post.id, 'rejected')}
                          className="min-h-[36px] px-3 rounded-xl border border-rose-200 dark:border-rose-900/70 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </>
                    )}

                    {isAdmin && (
                      <button
                        type="button"
                        disabled={revealingAuthorId === post.id}
                        onClick={() => handleRevealAuthor(post.id)}
                        title="Admin-only author audit lookup"
                        className="min-h-[36px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-semibold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>
                          {revealingAuthorId === post.id
                            ? 'Checking...'
                            : authorChecked
                              ? 'Lookup Again'
                              : 'Author'}
                        </span>
                      </button>
                    )}

                    {canDelete &&
                      (confirmDeleteId === post.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={deletingId === post.id}
                            onClick={() => handleDelete(post.id)}
                            className="min-h-[36px] px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {deletingId === post.id ? '...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[36px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(post.id)}
                          aria-label="Delete confession"
                          className="min-w-[36px] min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ))}
                  </div>
                </div>

                {isAdmin && authorChecked && (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300">
                    {revealedAuthor ? (
                      <span>
                        <span className="font-semibold">Author (admin audit):</span>{' '}
                        {revealedAuthor.fullName} · <span className="font-mono">{revealedAuthor.idNumber}</span> · {revealedAuthor.department}
                      </span>
                    ) : (
                      <span>Author record is unavailable.</span>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>

        {viewMode !== 'mine' && hasMore && onLoadMore && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="min-h-[40px] px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60"
            >
              {loadingMore ? 'Loading more...' : 'Load older confessions'}
            </button>
          </div>
        )}
        </>
      )}

      {/* Post Anonymously Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Post Anonymously"
          onClick={() => !submitting && setCreateOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Post Anonymously
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Your name, matric number &amp; department stay hidden from readers.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CONFESSION_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      category === cat
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Your Message
                </label>
                <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {text.length} / 800
                </span>
              </div>
              <textarea
                required
                minLength={4}
                maxLength={800}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Share respectfully — no harassment, hate speech, or personal doxxing..."
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 resize-none"
              />
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              All submissions go through moderator review before appearing in the campus feed.
            </p>

            {formError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setCreateOpen(false)}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {submitting ? 'Submitting...' : 'Submit Anonymously'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
