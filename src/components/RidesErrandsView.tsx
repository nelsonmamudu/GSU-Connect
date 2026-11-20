import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock,
  MapPin,
  MessageCircle,
  Minus,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  createRideErrand,
  deleteRideErrand,
  openOrCreateDmChat,
  updateRideErrand,
  updateRideErrandStatus,
} from '../services/supabaseService';
import {
  AppUser,
  formatCompactLevelLabel,
  formatNaira,
  formatShortTime,
  RIDE_LOCATION_PRESETS,
  RideErrandPost,
  RideErrandType,
} from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';

interface RidesErrandsViewProps {
  currentUser: AppUser;
  posts: RideErrandPost[];
  approvedUsers: AppUser[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenDm: (chatId: string) => void;
}

type RidesTab = 'open' | 'rides' | 'errands' | 'mine';

export const RidesErrandsView: React.FC<RidesErrandsViewProps> = ({
  currentUser,
  posts,
  approvedUsers,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onOpenDm,
}) => {
  const [scopeTab, setScopeTab] = useState<RidesTab>('open');
  const [routeFilter, setRouteFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<RideErrandPost | null>(null);
  const [postType, setPostType] = useState<RideErrandType>('ride');
  const [title, setTitle] = useState('');
  const [origin, setOrigin] = useState('Off-Campus (Tumfure)');
  const [destination, setDestination] = useState('Main Campus');
  const [departureTime, setDepartureTime] = useState('');
  const [seatsOrSlots, setSeatsOrSlots] = useState('2');
  const [costSplitNaira, setCostSplitNaira] = useState('200');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const [openingDmPostId, setOpeningDmPostId] = useState<string | null>(null);
  const [updatingStatusId, setUpdatingStatusId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const userMap = useMemo(() => {
    const map = new Map<string, AppUser>();
    approvedUsers.forEach((u) => map.set(u.uid, u));
    return map;
  }, [approvedUsers]);

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts
      .filter((p) => {
        if (scopeTab === 'mine') return p.authorId === currentUser.uid;
        if (p.status !== 'open') return false;
        if (scopeTab === 'rides') return p.postType === 'ride';
        if (scopeTab === 'errands') return p.postType === 'errand';
        return true;
      })
      .filter((p) => {
        if (routeFilter === 'All') return true;
        const rf = routeFilter.toLowerCase();
        return (
          p.origin.toLowerCase().includes(rf) ||
          p.destination.toLowerCase().includes(rf)
        );
      })
      .filter((p) => {
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          p.details.toLowerCase().includes(q) ||
          p.origin.toLowerCase().includes(q) ||
          p.destination.toLowerCase().includes(q) ||
          p.departureTime.toLowerCase().includes(q) ||
          p.authorName.toLowerCase().includes(q)
        );
      });
  }, [posts, scopeTab, routeFilter, search, currentUser.uid]);

  const openCount = useMemo(
    () => posts.filter((p) => p.status === 'open').length,
    [posts]
  );

  const handleOpenCreate = (presetType: RideErrandType = 'ride') => {
    setEditingPost(null);
    setPostType(presetType);
    setTitle('');
    setOrigin('Off-Campus (Tumfure)');
    setDestination('Main Campus');
    setDepartureTime('');
    setSeatsOrSlots(presetType === 'ride' ? '2' : '1');
    setCostSplitNaira(presetType === 'ride' ? '200' : '0');
    setDetails('');
    setFormError(null);
    setCreateOpen(true);
  };

  const handleOpenEdit = (post: RideErrandPost) => {
    setEditingPost(post);
    setPostType(post.postType);
    setTitle(post.title);
    setOrigin(post.origin);
    setDestination(post.destination);
    setDepartureTime(post.departureTime);
    setSeatsOrSlots(String(post.seatsOrSlots));
    setCostSplitNaira(String(post.costSplitNaira));
    setDetails(post.details);
    setFormError(null);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (editingPost) {
        await updateRideErrand(editingPost.id, {
          title,
          details,
          origin,
          destination,
          departureTime,
          seatsOrSlots: Number(seatsOrSlots) || 1,
          costSplitNaira: Number(costSplitNaira) || 0,
        });
      } else {
        await createRideErrand(currentUser, {
          postType,
          title,
          details,
          origin,
          destination,
          departureTime,
          seatsOrSlots: Number(seatsOrSlots) || 1,
          costSplitNaira: Number(costSplitNaira) || 0,
        });
      }
      setCreateOpen(false);
      setEditingPost(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : editingPost
            ? 'Failed to update post.'
            : 'Failed to publish post.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleChatPoster = async (post: RideErrandPost) => {
    if (post.authorId === currentUser.uid || openingDmPostId) return;
    setBannerError(null);
    setOpeningDmPostId(post.id);
    try {
      const targetUser: AppUser = userMap.get(post.authorId) || {
        uid: post.authorId,
        fullName: post.authorName,
        idNumber: '',
        idNumberNormalized: '',
        accountType: post.authorLevel === 'Staff' ? 'staff' : 'student',
        department: post.authorDepartment,
        level: (post.authorLevel as AppUser['level']) || '100',
        role: post.authorRole,
        status: 'approved',
      };
      const chatId = await openOrCreateDmChat(currentUser, targetUser);
      onOpenDm(chatId);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not open direct message.');
    } finally {
      setOpeningDmPostId(null);
    }
  };

  const handleToggleStatus = async (post: RideErrandPost) => {
    setBannerError(null);
    setUpdatingStatusId(post.id);
    try {
      await updateRideErrandStatus(
        post.id,
        post.status === 'open' ? 'fulfilled' : 'open'
      );
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not update post status.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleAdjustSeats = async (post: RideErrandPost, delta: number) => {
    const nextSeats = Math.max(1, Math.min(20, post.seatsOrSlots + delta));
    if (nextSeats === post.seatsOrSlots) return;
    setBannerError(null);
    setUpdatingStatusId(post.id);
    try {
      await updateRideErrand(post.id, {
        title: post.title,
        details: post.details,
        origin: post.origin,
        destination: post.destination,
        departureTime: post.departureTime,
        seatsOrSlots: nextSeats,
        costSplitNaira: post.costSplitNaira,
      });
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Could not update available seats.');
    } finally {
      setUpdatingStatusId(null);
    }
  };

  const handleDelete = async (postId: string) => {
    setBannerError(null);
    setDeletingId(postId);
    try {
      await deleteRideErrand(postId);
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
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Off-Campus (Tumfure) Rides &amp; Errands
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Coordinate Keke/cab fare splits between Off-Campus (Tumfure), Main Gate, Main Campus &amp; Town, or share campus errand pickups.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleOpenCreate('ride')}
            className="min-h-[42px] px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Post Ride / Errand</span>
          </button>
        </div>

        {/* Scope Tabs + Search */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl overflow-x-auto">
            {(
              [
                { id: 'open', label: `All Open (${openCount})` },
                { id: 'rides', label: 'Rides' },
                { id: 'errands', label: 'Errands' },
                { id: 'mine', label: 'My Posts' },
              ] as { id: RidesTab; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setScopeTab(tab.id)}
                className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  scopeTab === tab.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 dark:text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Off-Campus (Tumfure), Main Gate, time, or poster..."
              aria-label="Search rides and errands"
              className="w-full min-h-[42px] pl-10 pr-10 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear ride search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[34px] min-h-[34px] rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Route Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {['All', ...RIDE_LOCATION_PRESETS].map((loc) => {
            const active = routeFilter === loc;
            return (
              <button
                key={loc}
                type="button"
                onClick={() => setRouteFilter(loc)}
                className={`min-h-[32px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-700 border-emerald-700 text-white'
                    : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500/60'
                }`}
              >
                {loc === 'All' ? 'All Routes' : loc}
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

      {/* Posts Feed */}
      {filteredPosts.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2">
          <Car className="w-9 h-9 text-slate-300 dark:text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            No matching rides or errands
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Heading between Off-Campus (Tumfure) and Main Campus soon? Post a ride split or errand request so fellow students can join.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredPosts.map((post) => {
            const poster = userMap.get(post.authorId);
            const isOwner = post.authorId === currentUser.uid;
            const canModerate = isOwner || currentUser.role === 'admin';
            const isFulfilled = post.status === 'fulfilled';

            return (
              <article
                key={post.id}
                className={`bg-white dark:bg-slate-900 rounded-3xl border p-4 sm:p-5 flex flex-col justify-between gap-4 transition-colors ${
                  isFulfilled
                    ? 'border-slate-200/60 dark:border-slate-800/60 opacity-75'
                    : 'border-slate-200/80 dark:border-slate-800'
                }`}
              >
                <div className="space-y-3">
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold ${
                          post.postType === 'ride'
                            ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                            : 'bg-sky-50 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300'
                        }`}
                      >
                        {post.postType === 'ride' ? (
                          <Car className="w-3.5 h-3.5" />
                        ) : (
                          <Package className="w-3.5 h-3.5" />
                        )}
                        <span>{post.postType === 'ride' ? 'Ride Share' : 'Errand Share'}</span>
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-xl text-[11px] font-semibold ${
                          isFulfilled
                            ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {isFulfilled ? 'Fulfilled' : 'Open'}
                      </span>
                    </div>

                    <span className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300 tabular-nums">
                      {post.costSplitNaira > 0
                        ? `${formatNaira(post.costSplitNaira)} split`
                        : 'Free / Shared'}
                    </span>
                  </div>

                  {/* Title & Route */}
                  <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                      {post.title}
                    </h3>
                    <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 rounded-2xl px-3 py-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                      <span>{post.origin}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{post.destination}</span>
                    </div>
                  </div>

                  {/* Metadata */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>{post.departureTime}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>
                        {post.seatsOrSlots}{' '}
                        {post.postType === 'ride'
                          ? post.seatsOrSlots === 1
                            ? 'seat left'
                            : 'seats left'
                          : post.seatsOrSlots === 1
                            ? 'slot'
                            : 'slots'}
                      </span>
                      {canModerate && post.status === 'open' && (
                        <span className="inline-flex items-center gap-0.5 ml-1">
                          <button
                            type="button"
                            disabled={updatingStatusId === post.id || post.seatsOrSlots <= 1}
                            onClick={() => handleAdjustSeats(post, -1)}
                            aria-label="Decrease seats or slots"
                            className="w-5 h-5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 inline-flex items-center justify-center cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            disabled={updatingStatusId === post.id || post.seatsOrSlots >= 20}
                            onClick={() => handleAdjustSeats(post, 1)}
                            aria-label="Increase seats or slots"
                            className="w-5 h-5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 inline-flex items-center justify-center cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </span>
                      )}
                    </span>
                  </div>

                  {post.details && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                      {post.details}
                    </p>
                  )}
                </div>

                {/* Footer: Poster & Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <UserAvatar
                      name={poster?.fullName || post.authorName}
                      photoURL={poster?.photoURL}
                      avatarId={poster?.avatarId}
                      size="sm"
                      roundedClass="rounded-xl"
                      fallbackClassName="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {poster?.fullName || post.authorName}
                        </span>
                        <RoleBadge role={post.authorRole} />
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {post.authorDepartment} ·{' '}
                        {formatCompactLevelLabel(post.authorLevel, poster?.is_alumni)} ·{' '}
                        {formatShortTime(post.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {!isOwner && (
                      <button
                        type="button"
                        disabled={openingDmPostId === post.id}
                        onClick={() => handleChatPoster(post)}
                        className="min-h-[38px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{openingDmPostId === post.id ? 'Opening...' : 'Chat Poster'}</span>
                      </button>
                    )}

                    {canModerate && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(post)}
                          aria-label="Edit post"
                          title="Edit post"
                          className="min-w-[38px] min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400 flex items-center justify-center cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          disabled={updatingStatusId === post.id}
                          onClick={() => handleToggleStatus(post)}
                          className="min-h-[38px] px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {isFulfilled ? (
                            <>
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Reopen</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Fulfilled</span>
                            </>
                          )}
                        </button>

                        {confirmDeleteId === post.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={deletingId === post.id}
                              onClick={() => handleDelete(post.id)}
                              className="min-h-[38px] px-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              {deletingId === post.id ? '...' : 'Confirm'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[38px] px-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs text-slate-500 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(post.id)}
                            aria-label="Delete post"
                            className="min-w-[38px] min-h-[38px] rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-500 hover:text-rose-600 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
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
            className="min-h-[40px] px-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            {loadingMore ? 'Loading more...' : 'Load more rides & errands'}
          </button>
        </div>
      )}

      {/* Create / Edit Ride / Errand Modal */}
      {createOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingPost ? 'Edit Ride or Errand' : 'Post Ride or Errand'}
          onClick={() => !submitting && (setCreateOpen(false), setEditingPost(null))}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <form
            onSubmit={handleCreateSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {editingPost ? 'Edit Ride or Errand' : 'Post Ride or Errand Share'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Split transport costs or coordinate campus pickups safely
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCreateOpen(false);
                  setEditingPost(null);
                }}
                aria-label="Close modal"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingPost && (
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setPostType('ride')}
                  className={`min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    postType === 'ride'
                      ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Ride Share</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPostType('errand')}
                  className={`min-h-[40px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                    postType === 'errand'
                      ? 'bg-white dark:bg-slate-900 text-sky-800 dark:text-sky-300 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Package className="w-4 h-4" />
                  <span>Errand Share</span>
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Title
              </label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  postType === 'ride'
                    ? 'e.g., Sharing Keke from Off-Campus (Tumfure) to Science Complex'
                    : 'e.g., Going to Town — can pick up printouts or food'
                }
                className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Route
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const prevOrigin = origin;
                    setOrigin(destination);
                    setDestination(prevOrigin);
                  }}
                  className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3 h-3" />
                  <span>Swap Origin ↔ Destination</span>
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Origin / Pickup Point
                  </label>
                  <input
                    type="text"
                    required
                    list="gsu-ride-locations"
                    maxLength={80}
                    value={origin}
                    onChange={(e) => setOrigin(e.target.value)}
                    placeholder="Off-Campus (Tumfure)"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Destination
                  </label>
                  <input
                    type="text"
                    required
                    list="gsu-ride-locations"
                    maxLength={80}
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    placeholder="Main Campus"
                    className="w-full min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            <datalist id="gsu-ride-locations">
              {RIDE_LOCATION_PRESETS.map((loc) => (
                <option key={loc} value={loc} />
              ))}
            </datalist>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Departure / Time
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  placeholder="e.g., Today 4:30 PM"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  {postType === 'ride' ? 'Seats Left' : 'Errand Slots'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={seatsOrSlots}
                  onChange={(e) => setSeatsOrSlots(e.target.value)}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:border-emerald-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Cost Split (₦)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={costSplitNaira}
                  onChange={(e) => setCostSplitNaira(e.target.value)}
                  placeholder="0 for free"
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Additional Notes (optional)
              </label>
              <textarea
                rows={3}
                maxLength={500}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Exact junction/landmark in Off-Campus (Tumfure) or drop-off details..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 resize-none"
              />
            </div>

            {formError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setCreateOpen(false);
                  setEditingPost(null);
                }}
                className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="min-h-[42px] px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
              >
                {submitting
                  ? editingPost
                    ? 'Saving...'
                    : 'Publishing...'
                  : editingPost
                    ? 'Save Changes'
                    : 'Publish Post'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
