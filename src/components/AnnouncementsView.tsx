import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Megaphone, Plus, Search, Trash2, X } from 'lucide-react';
import { createAnnouncement, deleteAnnouncement } from '../services/supabaseService';
import { Announcement, AppUser, DepartmentItem, formatDateTime } from '../types';
import { RoleBadge } from './RoleBadge';

interface AnnouncementsViewProps {
  currentUser: AppUser;
  announcements: Announcement[];
  departments: DepartmentItem[];
  initialScopeFilter?: 'all' | 'department';
  scopeFilterNonce?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

export const AnnouncementsView: React.FC<AnnouncementsViewProps> = ({
  currentUser,
  announcements,
  departments,
  initialScopeFilter,
  scopeFilterNonce,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}) => {
  const [filter, setFilter] = useState<'all' | 'department'>(initialScopeFilter || 'all');
  const [searchQuery, setSearchQuery] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    if (initialScopeFilter) {
      setFilter(initialScopeFilter);
    }
  }, [initialScopeFilter, scopeFilterNonce]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scope, setScope] = useState('All GSU');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const canPost = ['admin', 'classRep', 'deptHelper', 'lecturer'].includes(
    currentUser.role
  );

  const filteredAnnouncements = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return announcements.filter((a) => {
      if (filter === 'department' && a.scope !== currentUser.department && a.scope !== 'All GSU') {
        return false;
      }
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.authorName.toLowerCase().includes(q) ||
        a.scope.toLowerCase().includes(q)
      );
    });
  }, [announcements, filter, searchQuery, currentUser.department]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAnnouncement(currentUser, title, body, scope);
      setTitle('');
      setBody('');
      setScope('All GSU');
      setComposerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (announcementId: string) => {
    if (deletingId) return;
    setActionError(null);
    setDeletingId(announcementId);
    try {
      await deleteAnnouncement(announcementId);
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Unable to delete announcement.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  const handleCopyAnnouncement = async (item: Announcement) => {
    try {
      await navigator.clipboard.writeText(
        `${item.title}\n\n${item.body}\n— ${item.authorName} (${item.scope})`
      );
      setCopiedId(item.id);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setActionError('Clipboard copy is not available in this browser.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-sunken/70 dark:bg-sunken rounded-2xl self-start">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === 'all'
                ? 'bg-white dark:bg-surface text-ink shadow-resting'
                : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
            }`}
          >
            All Notices
          </button>
          <button
            type="button"
            onClick={() => setFilter('department')}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
              filter === 'department'
                ? 'bg-white dark:bg-surface text-ink shadow-resting'
                : 'text-ink-body dark:text-ink-muted hover:text-ink dark:hover:text-ink-soft'
            }`}
          >
            {currentUser.department}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1 lg:max-w-xl lg:justify-end">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notices, courses, authors..."
              className="w-full min-h-[42px] pl-9 pr-9 rounded-2xl border border-line bg-surface text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear announcement search"
                className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-soft absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canPost && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="min-h-[44px] px-4 rounded-2xl bg-brand hover:bg-brand-strong text-on-brand text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Post Announcement</span>
            </button>
          )}
        </div>
      </div>

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

      {filteredAnnouncements.length === 0 ? (
        <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center space-y-2">
          <Megaphone className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-ink">
            {searchQuery.trim() ? 'No matching announcements' : 'No announcements yet'}
          </h3>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">
            {searchQuery.trim()
              ? 'Try another keyword or clear your search filter.'
              : 'Campus notices from app admins, lecturers, class reps and departmental helpers will appear here. These are not official university communications.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAnnouncements.map((item) => {
            const canDelete =
              currentUser.role === 'admin' || item.authorId === currentUser.uid;
            const isConfirming = confirmDeleteId === item.id;
            const isDeleting = deletingId === item.id;
            const isCopied = copiedId === item.id;
            return (
              <article
                key={item.id}
                className="bg-surface rounded-3xl border border-line/80 dark:border-line p-5 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-base font-bold text-ink leading-snug">
                      {item.title}
                    </h3>
                    <div className="flex items-center gap-1 -mt-1 -mr-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyAnnouncement(item)}
                        aria-label="Copy announcement text"
                        title="Copy announcement"
                        className="min-w-[34px] min-h-[34px] px-2 rounded-xl flex items-center justify-center gap-1 text-xs font-semibold text-ink-muted hover:text-brand hover:bg-brand-subtle dark:hover:bg-brand-subtle/40 transition-colors cursor-pointer"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-brand" />
                            <span className="text-brand">Copied</span>
                          </>
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {canDelete && !isConfirming && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label="Delete announcement"
                          className="min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-danger hover:text-danger hover:bg-danger-bg hover:bg-danger-bg/40 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {canDelete && isConfirming && (
                        <div className="inline-flex items-center gap-1 bg-danger-bg dark:bg-danger-bg/60 border border-danger-line dark:border-danger/70 rounded-xl p-1">
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => handleDeleteAnnouncement(item.id)}
                            className="min-h-[28px] px-2 rounded-lg bg-danger hover:bg-danger disabled:opacity-60 text-danger-on text-[11px] font-semibold cursor-pointer"
                          >
                            {isDeleting ? 'Deleting...' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            disabled={isDeleting}
                            onClick={() => setConfirmDeleteId(null)}
                            className="min-h-[28px] px-2 rounded-lg text-ink-body dark:text-ink-soft hover:bg-white dark:hover:bg-sunken text-[11px] font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap">
                    {item.body}
                  </p>
                </div>

                <div className="pt-3 border-t border-line flex items-center flex-wrap gap-2 text-xs text-ink-muted">
                  <span className="font-semibold text-ink dark:text-ink-soft">{item.authorName}</span>
                  <RoleBadge role={item.authorRole} />
                  <span aria-hidden="true">·</span>
                  <span>{item.scope}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatDateTime(item.createdAt)}
                  </span>
                </div>
              </article>
            );
          })}
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
            {loadingMore ? 'Loading more...' : 'Load older announcements'}
          </button>
        </div>
      )}

      {composerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-canvas/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">New Announcement</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                aria-label="Close composer"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePublish} className="space-y-3.5">
              <div>
                <label htmlFor="annScope" className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Audience
                </label>
                <select
                  id="annScope"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand"
                >
                  <option value="All GSU">All GSU</option>
                  <option value={currentUser.department}>{currentUser.department}</option>
                  {currentUser.role === 'admin' &&
                    departments
                      .filter((d) => d.name !== currentUser.department)
                      .map((dept) => (
                        <option key={dept.id} value={dept.name}>
                          {dept.name}
                        </option>
                      ))}
                </select>
              </div>

              <div>
                <label htmlFor="annTitle" className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Headline
                </label>
                <input
                  id="annTitle"
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. CSC 301 Lecture Venue Update"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand"
                />
              </div>

              <div>
                <label htmlFor="annBody" className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Details
                </label>
                <textarea
                  id="annBody"
                  required
                  minLength={2}
                  maxLength={3000}
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write your announcement clearly for students and staff..."
                  className="w-full p-3.5 rounded-xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand"
                />
              </div>

              {error && (
                <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 px-3 py-2 text-xs text-danger">
                  {error}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {submitting ? 'Posting...' : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
