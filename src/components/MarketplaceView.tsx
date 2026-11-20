import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ImagePlus,
  MapPin,
  MessageSquare,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  createMarketplaceListing,
  deleteMarketplaceListing,
  openOrCreateDmChat,
  updateMarketplaceListing,
} from '../services/supabaseService';
import {
  AppUser,
  formatNaira,
  formatShortTime,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CONDITIONS,
  MARKETPLACE_LISTING_TYPES,
  MarketplaceCategory,
  MarketplaceCondition,
  MarketplaceListing,
  MarketplaceListingType,
  MAX_MARKETPLACE_IMAGE_BYTES,
} from '../types';
import { RoleBadge } from './RoleBadge';
import { UserAvatar } from './UserAvatar';

interface MarketplaceViewProps {
  currentUser: AppUser;
  listings: MarketplaceListing[];
  approvedUsers: AppUser[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  onOpenDm: (chatId: string) => void;
}

async function compressListingImage(
  file: File
): Promise<{ blob: Blob; previewUrl: string }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load selected image.'));
      image.src = objectUrl;
    });

    const maxDim = 1280;
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
      throw new Error('Could not process selected image.');
    }
    ctx.drawImage(img, 0, 0, width, height);

    for (const quality of [0.82, 0.68, 0.52]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      if (blob && blob.size <= MAX_MARKETPLACE_IMAGE_BYTES) {
        return { blob, previewUrl: URL.createObjectURL(blob) };
      }
    }
    throw new Error('Image exceeds the 10 MB limit after compression. Please choose a smaller photo.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  currentUser,
  listings,
  approvedUsers,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  onOpenDm,
}) => {
  const [scopeTab, setScopeTab] = useState<'all' | 'mine'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | MarketplaceListingType>('All');
  const [sortBy, setSortBy] = useState<'newest' | 'priceAsc' | 'priceDesc'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideSold, setHideSold] = useState(false);

  const userMap = useMemo(() => {
    const map = new Map<string, AppUser>();
    approvedUsers.forEach((u) => map.set(u.uid, u));
    return map;
  }, [approvedUsers]);

  const [postOpen, setPostOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());
  const [openingDmId, setOpeningDmId] = useState<string | null>(null);
  const [busyListingId, setBusyListingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create listing form state
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MarketplaceCategory>('Textbooks');
  const [listingType, setListingType] = useState<MarketplaceListingType>('Sell');
  const [priceText, setPriceText] = useState('');
  const [condition, setCondition] = useState<MarketplaceCondition>('Fairly Used');
  const [location, setLocation] = useState('Main Campus');
  const [description, setDescription] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const myListingCount = useMemo(
    () => listings.filter((l) => l.sellerId === currentUser.uid).length,
    [listings, currentUser.uid]
  );

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = listings.filter((item) => {
      if (scopeTab === 'mine' && item.sellerId !== currentUser.uid) return false;
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      if (typeFilter !== 'All' && item.listingType !== typeFilter) return false;
      if (hideSold && item.status === 'sold') return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.sellerName.toLowerCase().includes(q) ||
        item.sellerDepartment.toLowerCase().includes(q)
      );
    });

    if (sortBy === 'priceAsc') {
      return [...filtered].sort((a, b) => (a.priceNaira || 0) - (b.priceNaira || 0));
    }
    if (sortBy === 'priceDesc') {
      return [...filtered].sort((a, b) => (b.priceNaira || 0) - (a.priceNaira || 0));
    }
    return filtered;
  }, [
    listings,
    scopeTab,
    currentUser.uid,
    selectedCategory,
    typeFilter,
    hideSold,
    searchQuery,
    sortBy,
  ]);

  const openPostModal = () => {
    setEditingListing(null);
    setTitle('');
    setCategory('Textbooks');
    setListingType('Sell');
    setPriceText('');
    setCondition('Fairly Used');
    setLocation('Main Campus');
    setDescription('');
    setImageBlob(null);
    if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl('');
    setFormError(null);
    setPostOpen(true);
  };

  const openEditModal = (item: MarketplaceListing) => {
    setEditingListing(item);
    setTitle(item.title);
    setCategory(item.category);
    setListingType(item.listingType);
    setPriceText(item.priceNaira > 0 ? String(item.priceNaira) : '');
    setCondition(item.condition);
    setLocation(item.location || '');
    setDescription(item.description);
    setImageBlob(null);
    if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(item.imageData || '');
    setFormError(null);
    setPostOpen(true);
  };

  const handleCategoryChange = (nextCategory: MarketplaceCategory) => {
    setCategory(nextCategory);
    if (nextCategory === 'Lodge / Accommodation') {
      setListingType('Vacancy');
      setCondition('Available');
      if (location === 'Main Campus') setLocation('Off-Campus (Tumfure)');
    }
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError(null);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, or WebP).');
      return;
    }
    try {
      const { blob, previewUrl } = await compressListingImage(file);
      if (imagePreviewUrl.startsWith('blob:')) URL.revokeObjectURL(imagePreviewUrl);
      setImageBlob(blob);
      setImagePreviewUrl(previewUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed processing image.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setFormError(null);

    const parsedPrice = priceText.trim() ? Number(priceText.replace(/[^0-9]/g, '')) : 0;
    if (listingType !== 'Swap' && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setFormError('Please enter a valid price in Naira.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingListing) {
        await updateMarketplaceListing(editingListing.id, {
          title,
          description,
          priceNaira: parsedPrice,
          condition,
          location,
        });
      } else {
        await createMarketplaceListing(currentUser, {
          title,
          description,
          category,
          listingType,
          priceNaira: parsedPrice,
          condition,
          location,
          imageFile: imageBlob || undefined,
        });
      }
      setPostOpen(false);
      setEditingListing(null);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : editingListing
            ? 'Failed to update listing.'
            : 'Failed to publish listing.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleChatSeller = async (item: MarketplaceListing) => {
    if (item.sellerId === currentUser.uid || openingDmId) return;
    setActionError(null);
    setOpeningDmId(item.id);
    try {
      const sellerUser: AppUser = userMap.get(item.sellerId) || {
        uid: item.sellerId,
        fullName: item.sellerName,
        idNumber: '',
        idNumberNormalized: '',
        accountType: item.sellerRole === 'lecturer' ? 'staff' : 'student',
        department: item.sellerDepartment,
        level: (item.sellerLevel as AppUser['level']) || '100',
        role: item.sellerRole,
        status: 'approved',
      };
      const chatId = await openOrCreateDmChat(currentUser, sellerUser);
      onOpenDm(chatId);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not open direct message with seller.'
      );
    } finally {
      setOpeningDmId(null);
    }
  };

  const handleToggleStatus = async (item: MarketplaceListing) => {
    if (busyListingId) return;
    setActionError(null);
    setBusyListingId(item.id);
    try {
      await updateMarketplaceListing(item.id, {
        status: item.status === 'available' ? 'sold' : 'available',
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update listing status.');
    } finally {
      setBusyListingId(null);
    }
  };

  const handleDelete = async (item: MarketplaceListing) => {
    if (busyListingId) return;
    setActionError(null);
    setBusyListingId(item.id);
    try {
      await deleteMarketplaceListing(item.id);
      if (confirmDeleteId === item.id) setConfirmDeleteId(null);
      if (selectedListing?.id === item.id) setSelectedListing(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete listing.');
    } finally {
      setBusyListingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header & Controls */}
      <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base sm:text-lg font-bold text-ink">
            Campus Marketplace & Noticeboard
          </h2>
          <p className="text-xs text-ink-muted">
            Buy, sell, or swap textbooks, calculators, solar kits, electronics, and Off-Campus (Tumfure) lodge vacancies.
          </p>
        </div>

        <button
          type="button"
          onClick={openPostModal}
          className="min-h-[44px] px-4 rounded-2xl bg-brand hover:bg-brand-strong text-on-brand text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Post Listing</span>
        </button>
      </div>

      {/* Scope Toggle, Search & Category Bar */}
      <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="inline-flex p-1 rounded-2xl bg-sunken self-start">
            <button
              type="button"
              onClick={() => setScopeTab('all')}
              className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                scopeTab === 'all'
                  ? 'bg-white dark:bg-surface text-ink shadow-resting'
                  : 'text-ink-body dark:text-ink-soft hover:text-ink'
              }`}
            >
              All Listings ({listings.length})
            </button>
            <button
              type="button"
              onClick={() => setScopeTab('mine')}
              className={`min-h-[38px] px-4 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                scopeTab === 'mine'
                  ? 'bg-white dark:bg-surface text-ink shadow-resting'
                  : 'text-ink-body dark:text-ink-soft hover:text-ink'
              }`}
            >
              My Listings ({myListingCount})
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-ink-body dark:text-ink-soft cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideSold}
              onChange={(e) => setHideSold(e.target.checked)}
              className="w-4 h-4 rounded accent-brand cursor-pointer"
            />
            <span>Hide sold items</span>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          <div className="relative sm:col-span-6">
            <Search className="w-4 h-4 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items, Tumfure lodges, solar kits, textbooks, or seller..."
              aria-label="Search marketplace listings"
              className="w-full min-h-[44px] pl-10 pr-10 rounded-2xl border border-line bg-sunken/70 dark:bg-sunken/80 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand focus:ring-2 focus:ring-focus/15"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear listing search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] rounded-xl flex items-center justify-center text-ink-muted hover:text-ink-soft cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="marketCatFilter" className="sr-only">
              Filter by category
            </label>
            <select
              id="marketCatFilter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[44px] px-3.5 rounded-2xl border border-line bg-surface dark:bg-sunken text-xs sm:text-sm font-medium text-ink dark:text-ink-soft focus:outline-none focus:border-brand"
            >
              <option value="All">All Categories</option>
              {MARKETPLACE_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label htmlFor="marketSortBy" className="sr-only">
              Sort listings
            </label>
            <select
              id="marketSortBy"
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as 'newest' | 'priceAsc' | 'priceDesc')
              }
              className="w-full min-h-[44px] px-3.5 rounded-2xl border border-line bg-surface dark:bg-sunken text-xs sm:text-sm font-medium text-ink dark:text-ink-soft focus:outline-none focus:border-brand"
            >
              <option value="newest">Sort: Newest</option>
              <option value="priceAsc">Price: Low to High</option>
              <option value="priceDesc">Price: High to Low</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {(['All', ...MARKETPLACE_LISTING_TYPES] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`min-h-[32px] px-3 rounded-xl text-[11px] font-semibold border transition-colors cursor-pointer ${
                  typeFilter === t
                    ? 'bg-brand border-brand text-on-brand'
                    : 'bg-white dark:bg-sunken border-line text-ink-body dark:text-ink-soft hover:bg-sunken'
                }`}
              >
                {t === 'All' ? 'All Types' : t}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-ink-muted tabular-nums">
            Showing {filteredListings.length} of {listings.length}
          </span>
        </div>
      </div>

      {actionError && (
        <div className="rounded-2xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger px-4 py-3 text-xs text-danger flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-danger hover:text-danger cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Listings Grid */}
      {filteredListings.length === 0 ? (
        <div className="bg-surface rounded-3xl border border-line/80 dark:border-line p-10 text-center space-y-2.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-subtle dark:bg-brand-subtle/60 text-brand flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-ink">
            {scopeTab === 'mine' ? 'You have no listings yet' : 'No listings match your filter'}
          </h3>
          <p className="text-xs text-ink-muted max-w-sm mx-auto">
            {scopeTab === 'mine'
              ? 'Post textbooks, solar kits, electronics, or room vacancies to connect directly with buyers on campus.'
              : 'Try clearing your search or switching categories to see more campus listings.'}
          </p>
          <button
            type="button"
            onClick={openPostModal}
            className="mt-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 rounded-xl bg-brand text-on-brand text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Post a Listing</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredListings.map((item) => {
            const isOwner = item.sellerId === currentUser.uid;
            const canManage = isOwner || currentUser.role === 'admin';
            const isSold = item.status === 'sold';
            const isBusy = busyListingId === item.id;

            return (
              <article
                key={item.id}
                className={`bg-white dark:bg-surface rounded-2xl border border-line/80 dark:border-line p-4 flex flex-col justify-between gap-3.5 ${
                  isSold ? 'opacity-80' : ''
                }`}
              >
                <div className="space-y-3">
                  {item.imageData && !brokenImages.has(item.id) && (
                    <button
                      type="button"
                      onClick={() => setSelectedListing(item)}
                      aria-label={`Inspect photo and details for ${item.title}`}
                      className="group relative aspect-[16/10] w-full rounded-xl overflow-hidden bg-sunken border border-line/60 block cursor-pointer"
                    >
                      <img
                        src={item.imageData}
                        alt={item.title}
                        onError={() =>
                          setBrokenImages((prev) => new Set(prev).add(item.id))
                        }
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      {!isSold && (
                        <span className="absolute bottom-2 right-2 w-7 h-7 rounded-lg bg-slate-900/65 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ZoomIn className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {isSold && (
                        <div className="absolute inset-0 bg-slate-950/55 flex items-center justify-center">
                          <span className="text-xs font-bold tracking-wider uppercase text-white bg-slate-900/85 px-3 py-1 rounded-lg">
                            Sold / Taken
                          </span>
                        </div>
                      )}
                    </button>
                  )}

                  <div className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-lg font-extrabold font-mono tabular-nums text-brand">
                        {item.listingType === 'Swap' && item.priceNaira === 0
                          ? 'Open to Swap'
                          : item.priceNaira === 0
                            ? 'Negotiable'
                            : formatNaira(item.priceNaira)}
                      </span>
                      <span
                        className={`text-[11px] font-semibold uppercase tracking-wide ${
                          isSold
                            ? 'text-ink-muted'
                            : 'text-brand'
                        }`}
                      >
                        {isSold ? 'Sold' : item.listingType}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedListing(item)}
                      className="text-left block w-full cursor-pointer group"
                    >
                      <h3 className="text-sm sm:text-base font-bold text-ink group-hover:text-brand transition-colors leading-snug">
                        {item.title}
                      </h3>
                    </button>

                    <p className="text-xs text-ink-muted leading-normal">
                      <span>{item.category}</span>
                      <span aria-hidden="true"> · </span>
                      <span>{item.condition}</span>
                      {item.location && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="inline-flex items-center gap-0.5 text-ink-body dark:text-ink-soft">
                            <MapPin className="w-3 h-3 inline shrink-0" />
                            <span>{item.location}</span>
                          </span>
                        </>
                      )}
                    </p>

                    <button
                      type="button"
                      onClick={() => setSelectedListing(item)}
                      className="text-left block w-full cursor-pointer"
                    >
                      <p className="text-xs text-ink-body dark:text-ink-soft leading-relaxed line-clamp-3">
                        {item.description}
                      </p>
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-1 border-t border-line">
                  <div className="flex items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <UserAvatar
                        name={item.sellerName}
                        photoURL={userMap.get(item.sellerId)?.photoURL}
                        avatarId={userMap.get(item.sellerId)?.avatarId}
                        size="sm"
                        roundedClass="rounded-xl"
                        fallbackClassName="bg-sunken text-ink-soft"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-semibold text-ink truncate">
                            {isOwner ? 'You' : item.sellerName}
                          </span>
                          <RoleBadge role={item.sellerRole} />
                        </div>
                        <p className="text-[11px] text-ink-muted truncate">
                          {item.sellerDepartment} · {formatShortTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isOwner && (
                      <button
                        type="button"
                        onClick={() => handleChatSeller(item)}
                        disabled={openingDmId === item.id}
                        className="flex-1 min-h-[42px] px-3.5 rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          {openingDmId === item.id ? 'Opening chat...' : 'Chat Seller'}
                        </span>
                      </button>
                    )}

                    {canManage && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          disabled={isBusy}
                          className="flex-1 min-h-[42px] px-3 rounded-xl border border-line text-xs font-semibold text-ink-soft hover:bg-sunken inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-brand" />
                          <span>{isSold ? 'Mark Available' : 'Mark Sold'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          disabled={isBusy}
                          aria-label={`Edit ${item.title}`}
                          title="Edit listing"
                          className="min-w-[42px] min-h-[42px] rounded-xl border border-line text-ink-muted hover:text-brand hover:border-success-line inline-flex items-center justify-center cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {confirmDeleteId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={isBusy}
                              className="min-h-[42px] px-2.5 rounded-xl bg-danger hover:bg-danger text-white text-xs font-semibold cursor-pointer"
                            >
                              {isBusy ? '...' : 'Delete'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[42px] px-2 rounded-xl border border-line text-xs font-semibold text-ink-body dark:text-ink-soft cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(item.id)}
                            disabled={isBusy}
                            aria-label={`Delete ${item.title}`}
                            title="Delete listing"
                            className="min-w-[42px] min-h-[42px] rounded-xl border border-line text-ink-muted hover:text-danger hover:text-danger hover:border-danger-line hover:border-danger inline-flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
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
            className="min-h-[40px] px-5 rounded-2xl border border-line bg-surface hover:bg-sunken disabled:opacity-60 text-xs font-semibold text-ink-soft transition-colors cursor-pointer"
          >
            {loadingMore ? 'Loading more...' : 'Load more listings'}
          </button>
        </div>
      )}

      {/* Post / Edit Listing Modal */}
      {postOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 dark:bg-canvas/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-surface border border-transparent dark:border-line rounded-t-3xl sm:rounded-3xl p-6 space-y-4 shadow-overlay">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink">
                {editingListing ? 'Edit Marketplace Listing' : 'Post Marketplace Listing'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setPostOpen(false);
                  setEditingListing(null);
                }}
                aria-label="Close post listing dialog"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-ink-muted hover:bg-sunken cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-xl bg-danger-bg dark:bg-danger-bg/50 border border-danger-line dark:border-danger/70 p-3 text-xs text-danger">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="mktCategory"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="mktCategory"
                    disabled={!!editingListing}
                    value={category}
                    onChange={(e) => handleCategoryChange(e.target.value as MarketplaceCategory)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink disabled:opacity-60 focus:outline-none focus:border-brand"
                  >
                    {MARKETPLACE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="mktType"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Listing Type
                  </label>
                  <select
                    id="mktType"
                    disabled={!!editingListing}
                    value={listingType}
                    onChange={(e) => setListingType(e.target.value as MarketplaceListingType)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink disabled:opacity-60 focus:outline-none focus:border-brand"
                  >
                    {MARKETPLACE_LISTING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="mktTitle"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Title
                </label>
                <input
                  id="mktTitle"
                  type="text"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Casio fx-991ES Plus Calculator / Off-Campus (Tumfure) Self-Con Room"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="mktPrice"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Price in Naira (₦) {listingType === 'Swap' ? '(optional)' : ''}
                  </label>
                  <input
                    id="mktPrice"
                    type="number"
                    min={0}
                    max={100000000}
                    required={listingType !== 'Swap'}
                    value={priceText}
                    onChange={(e) => setPriceText(e.target.value)}
                    placeholder="e.g., 15000"
                    className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mktCondition"
                    className="block text-xs font-semibold text-ink-soft mb-1"
                  >
                    Condition
                  </label>
                  <select
                    id="mktCondition"
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as MarketplaceCondition)}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                  >
                    {MARKETPLACE_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>
                        {cond}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="mktLocation"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Location (Campus / Off-campus)
                </label>
                <input
                  id="mktLocation"
                  type="text"
                  maxLength={100}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., Off-Campus (Tumfure), Main Campus, Faculty of Science"
                  className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label
                  htmlFor="mktDescription"
                  className="block text-xs font-semibold text-ink-soft mb-1"
                >
                  Description
                </label>
                <textarea
                  id="mktDescription"
                  required
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe specs, edition, rent terms, or swap preferences..."
                  className="w-full p-3 rounded-xl border border-line bg-surface dark:bg-sunken text-sm text-ink focus:outline-none focus:border-brand"
                />
              </div>

              {!editingListing && (
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Photo (optional)
                  </label>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  {imagePreviewUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-line">
                      <img
                        src={imagePreviewUrl}
                        alt="Listing preview"
                        className="w-full max-h-44 object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImageBlob(null);
                          if (imagePreviewUrl.startsWith('blob:')) {
                            URL.revokeObjectURL(imagePreviewUrl);
                          }
                          setImagePreviewUrl('');
                        }}
                        aria-label="Remove photo"
                        className="absolute top-2 right-2 min-w-[36px] min-h-[36px] rounded-xl bg-slate-900/75 text-white flex items-center justify-center cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="w-full min-h-[48px] px-4 rounded-xl border border-dashed border-line bg-sunken/70 dark:bg-sunken/60 hover:border-brand text-xs font-medium text-ink-body dark:text-ink-soft inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ImagePlus className="w-4 h-4 text-brand" />
                      <span>Add item or lodge photo</span>
                    </button>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPostOpen(false);
                    setEditingListing(null);
                  }}
                  className="flex-1 min-h-[44px] rounded-xl border border-line text-sm font-semibold text-ink-soft hover:bg-sunken cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 min-h-[44px] rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-sm font-semibold cursor-pointer"
                >
                  {submitting
                    ? editingListing
                      ? 'Saving...'
                      : 'Publishing...'
                    : editingListing
                      ? 'Save Changes'
                      : 'Publish Listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Listing Detail & Photo Modal */}
      {selectedListing && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedListing.title}
          onClick={() => setSelectedListing(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-canvas/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto bg-surface border border-line/80 dark:border-line rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-overlay"
          >
            {selectedListing.imageData && !brokenImages.has(selectedListing.id) && (
              <div className="relative bg-slate-950 max-h-[52dvh] flex items-center justify-center">
                <img
                  src={selectedListing.imageData}
                  alt={selectedListing.title}
                  className="w-full max-h-[52dvh] object-contain"
                />
                <button
                  type="button"
                  onClick={() => setSelectedListing(null)}
                  aria-label="Close listing details"
                  className="absolute top-3 right-3 min-w-[40px] min-h-[40px] rounded-xl bg-slate-900/75 text-white hover:bg-slate-900 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="p-5 sm:p-6 space-y-4">
              {(!selectedListing.imageData || brokenImages.has(selectedListing.id)) && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedListing(null)}
                    aria-label="Close listing details"
                    className="min-w-[40px] min-h-[40px] rounded-xl text-ink-muted hover:bg-sunken flex items-center justify-center cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xl font-extrabold font-mono tabular-nums text-brand">
                    {selectedListing.listingType === 'Swap' && selectedListing.priceNaira === 0
                      ? 'Open to Swap'
                      : selectedListing.priceNaira === 0
                        ? 'Negotiable'
                        : formatNaira(selectedListing.priceNaira)}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    {selectedListing.status === 'sold' ? 'Sold' : selectedListing.listingType}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-ink">
                  {selectedListing.title}
                </h3>
                <p className="text-xs text-ink-muted">
                  {selectedListing.category} · {selectedListing.condition}
                  {selectedListing.location ? ` · ${selectedListing.location}` : ''}
                </p>
              </div>

              <p className="text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                {selectedListing.description}
              </p>

              <div className="pt-3 border-t border-line flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UserAvatar
                    name={selectedListing.sellerName}
                    photoURL={userMap.get(selectedListing.sellerId)?.photoURL}
                    avatarId={userMap.get(selectedListing.sellerId)?.avatarId}
                    size="sm"
                    roundedClass="rounded-xl"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-semibold text-ink truncate">
                        {selectedListing.sellerId === currentUser.uid
                          ? 'You'
                          : selectedListing.sellerName}
                      </span>
                      <RoleBadge role={selectedListing.sellerRole} />
                    </div>
                    <p className="text-[11px] text-ink-muted truncate">
                      {selectedListing.sellerDepartment} ·{' '}
                      {formatShortTime(selectedListing.createdAt)}
                    </p>
                  </div>
                </div>

                {selectedListing.sellerId !== currentUser.uid && (
                  <button
                    type="button"
                    disabled={openingDmId === selectedListing.id}
                    onClick={() => handleChatSeller(selectedListing)}
                    className="min-h-[42px] px-4 rounded-xl bg-brand hover:bg-brand-strong disabled:opacity-60 text-on-brand text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {openingDmId === selectedListing.id ? 'Opening...' : 'Chat Seller'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
