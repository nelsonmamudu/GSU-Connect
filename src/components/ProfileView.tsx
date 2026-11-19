import { AdminTotp } from "./AdminTotp";
import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Calculator,
  Camera,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  HelpCircle,
  KeyRound,
  LogOut,
  Mail,
  MapPin,
  Moon,
  RotateCcw,
  Shield,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  changeOwnPassword,
  fetchOwnRecoveryEmail,
  requestOwnAccountDeletion,
  signOutUser,
  unstarMessageForUser,
  updateOwnAvatar,
  updateOwnFullName,
  updateRecoveryEmail,
  updateUserLastSeen,
} from '../services/supabaseService';
import {
  AppTheme,
  AppUser,
  formatCompactLevelLabel,
  formatLevelLabel,
  MAX_AVATAR_BYTES,
  PRESET_AVATARS,
  StarredMessage,
} from '../types';
import { GpaCalculatorScreen } from './GpaCalculatorScreen';
import { RoleBadge } from './RoleBadge';
import { StarredMessagesModal } from './StarredMessagesModal';
import { renderPresetAvatarIcon, UserAvatar } from './UserAvatar';

export type { AppTheme };

interface ProfileViewProps {
  currentUser: AppUser;
  theme: AppTheme;
  starredMessages?: StarredMessage[];
  onToggleTheme: () => void;
  onJumpToMessage?: (chatId: string, messageId: string) => void;
  onProfileUpdated?: () => void;
}

interface NotificationPrefs {
  messages: boolean;
  announcementsAndTimetable: boolean;
  soundAlerts: boolean;
}

const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  messages: true,
  announcementsAndTimetable: true,
  soundAlerts: true,
};

const SUPPORT_EMAIL = 'GSUConnect0@gmail.com';

function toTitleCaseName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

async function compressProfilePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a valid image file (JPEG, PNG, or WebP).');
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Selected file could not be decoded as an image.'));
      image.src = objectUrl;
    });

    const targetSize = 512;
    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Image processing is unavailable in this browser.');
    }

    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, Math.floor((img.width - minSide) / 2));
    const sy = Math.max(0, Math.floor((img.height - minSide) / 2));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, targetSize, targetSize);

    const qualities = [0.85, 0.72, 0.56];
    for (const quality of qualities) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', quality)
      );
      if (blob && blob.size <= MAX_AVATAR_BYTES) {
        return blob;
      }
    }
    throw new Error('Compressed image still exceeded the 2 MB avatar limit. Please choose another photo.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  theme,
  starredMessages = [],
  onToggleTheme,
  onJumpToMessage,
  onProfileUpdated,
}) => {
  const [showGpaCalculator, setShowGpaCalculator] = useState(false);
  const [starredOpen, setStarredOpen] = useState(false);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(currentUser.fullName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedBannerText, setSavedBannerText] = useState<string | null>(null);
  const savedTimerRef = useRef<number | null>(null);

  // Recovery email
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [loadingRecovery, setLoadingRecovery] = useState(true);
  const [editingRecovery, setEditingRecovery] = useState(false);
  const [recoveryInput, setRecoveryInput] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [savingRecovery, setSavingRecovery] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);

  // Change password modal
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Notification preferences (per-user device localStorage)
  const notifStorageKey = `gsu_notification_prefs_${currentUser.uid}`;
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => {
    try {
      const raw = localStorage.getItem(notifStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
        return {
          messages: parsed.messages !== false,
          announcementsAndTimetable: parsed.announcementsAndTimetable !== false,
          soundAlerts: parsed.soundAlerts !== false,
        };
      }
    } catch {
      // Ignore storage access errors
    }
    return DEFAULT_NOTIFICATION_PREFS;
  });

  // Terms & Privacy Policy modals
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  // Delete account modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePasswordInput, setDeletePasswordInput] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteManualRequired, setDeleteManualRequired] = useState(false);

  const closeDeleteModal = () => {
    if (deletingAccount) return;
    setDeleteModalOpen(false);
    setDeleteConfirmText('');
    setDeletePasswordInput('');
    setDeleteError(null);
  };

  const canEditOwnName = currentUser.role === 'admin' || currentUser.status !== 'approved';
  const availablePresetAvatars = PRESET_AVATARS.filter(
    (preset) => !preset.adminOnly || currentUser.role === 'admin'
  );

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoadingRecovery(true);
    fetchOwnRecoveryEmail()
      .then((email) => {
        if (!active) return;
        setRecoveryEmail(email);
        setLoadingRecovery(false);
      })
      .catch(() => {
        if (!active) return;
        setRecoveryEmail('');
        setLoadingRecovery(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser.uid]);

  useEffect(() => {
    try {
      localStorage.setItem(notifStorageKey, JSON.stringify(notifPrefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [notifStorageKey, notifPrefs]);

  const isDark = theme === 'dark';

  const showSavedToast = (message = 'Profile updated.') => {
    setSavedBannerText(message);
    if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
    savedTimerRef.current = window.setTimeout(() => setSavedBannerText(null), 3500);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditOwnName || saving) return;
    const formatted = toTitleCaseName(nameInput);
    if (formatted.length < 2) {
      setNameError('Full name must be at least 2 characters.');
      return;
    }
    if (formatted.length > 100) {
      setNameError('Full name must be 100 characters or fewer.');
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      await updateOwnFullName(currentUser.uid, formatted);
      setEditingName(false);
      onProfileUpdated?.();
      showSavedToast('Display name updated.');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Could not update display name.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingRecovery) return;
    const cleaned = recoveryInput.trim().toLowerCase();
    if (cleaned.length < 5 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setRecoveryError('Please enter a valid email address.');
      return;
    }
    if (!recoveryPassword) {
      setRecoveryError('Please enter your current password.');
      return;
    }
    setRecoveryError(null);
    setSavingRecovery(true);
    try {
      await updateRecoveryEmail(cleaned, recoveryPassword);
      setRecoveryEmail(cleaned);
      setEditingRecovery(false);
      setRecoveryPassword('');
      showSavedToast('Recovery email updated.');
    } catch (err) {
      setRecoveryError(err instanceof Error ? err.message : 'Could not update recovery email.');
    } finally {
      setSavingRecovery(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingPassword) return;
    setPasswordError(null);
    if (!currentPasswordInput) {
      setPasswordError('Please enter your current password.');
      return;
    }
    if (newPasswordInput.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPasswordInput !== confirmPasswordInput) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changeOwnPassword(currentPasswordInput, newPasswordInput);
      setPasswordModalOpen(false);
      setCurrentPasswordInput('');
      setNewPasswordInput('');
      setConfirmPasswordInput('');
      showSavedToast('Password changed successfully.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const clearUserDeviceData = () => {
    try {
      localStorage.removeItem(`gsu_gpa_calc_${currentUser.uid}`);
      localStorage.removeItem(notifStorageKey);
    } catch {
      // Ignore storage access errors
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deletingAccount) return;
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Type DELETE in all caps to confirm.');
      return;
    }
    if (!deletePasswordInput) {
      setDeleteError('Please enter your password.');
      return;
    }
    setDeleteError(null);
    setDeletingAccount(true);
    try {
      const outcome = await requestOwnAccountDeletion(deletePasswordInput);
      if (outcome === 'deleted') {
        clearUserDeviceData();
        setDeleteModalOpen(false);
        setDeleteConfirmText('');
        setDeletePasswordInput('');
        return;
      }
      setDeleteManualRequired(true);
      setDeletePasswordInput('');
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : 'Could not process account deletion.'
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || avatarSaving) return;
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      const compressedBlob = await compressProfilePhoto(file);
      await updateOwnAvatar(
        currentUser.uid,
        { file: compressedBlob, avatarId: null },
        { isAdmin: currentUser.role === 'admin' }
      );
      setAvatarModalOpen(false);
      showSavedToast('Profile photo updated.');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload profile picture.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleSelectPresetAvatar = async (avatarId: string) => {
    if (avatarSaving) return;
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      await updateOwnAvatar(
        currentUser.uid,
        { photoURL: null, avatarId },
        { isAdmin: currentUser.role === 'admin' }
      );
      setAvatarModalOpen(false);
      showSavedToast('Avatar updated.');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to update avatar.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleResetAvatar = async () => {
    if (avatarSaving) return;
    setAvatarSaving(true);
    setAvatarError(null);
    try {
      await updateOwnAvatar(
        currentUser.uid,
        { photoURL: null, avatarId: null },
        { isAdmin: currentUser.role === 'admin' }
      );
      setAvatarModalOpen(false);
      showSavedToast('Avatar reset to initials.');
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Failed to reset avatar.');
    } finally {
      setAvatarSaving(false);
    }
  };

  const permissionsList = (() => {
    switch (currentUser.role) {
      case 'admin':
        return [
          'Approve or reject sign-ups across all departments',
          'Assign user roles and suspend accounts',
          'Review message reports and delete messages',
          'Post campus-wide and department announcements',
        ];
      case 'classRep':
      case 'deptHelper':
        return [
          `Approve or reject pending sign-ups in ${currentUser.department}`,
          'Post announcements to GSU or your department',
          'Participate in GSU General, cohort group, and DMs',
        ];
      case 'lecturer':
        return [
          'Post announcements to GSU or your department',
          'Participate in GSU General, Staff group, and DMs',
        ];
      default:
        return [
          `Member of GSU General and ${currentUser.department} · ${formatCompactLevelLabel(currentUser.level, currentUser.is_alumni)}`,
          'Start private 1-to-1 chats with approved students & staff',
          'Report inappropriate messages for admin review',
        ];
    }
  })();

  if (showGpaCalculator) {
    return (
      <GpaCalculatorScreen
        userId={currentUser.uid}
        userName={currentUser.fullName}
        onBack={() => setShowGpaCalculator(false)}
      />
    );
  }

  const ndpaMailtoHref = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `NDPA Account & Data Deletion Request — ${currentUser.idNumber}`
  )}&body=${encodeURIComponent(
    `Hello GSU Connect Support,\n\nUnder the Nigeria Data Protection Act (NDPA), please permanently delete my GSU Connect account and associated personal data.\n\nFull Name: ${currentUser.fullName}\nMatric / Staff ID: ${currentUser.idNumber}\nDepartment: ${currentUser.department}\n\nThank you.`
  )}`;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Identity Card */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => {
                setAvatarError(null);
                setAvatarModalOpen(true);
              }}
              aria-label="Change profile picture or avatar"
              className="relative shrink-0 group cursor-pointer rounded-3xl focus:outline-none focus:ring-2 focus:ring-emerald-600/40"
            >
              <UserAvatar
                name={currentUser.fullName}
                photoURL={currentUser.photoURL}
                avatarId={currentUser.avatarId}
                size="xl"
                roundedClass="rounded-3xl"
                fallbackClassName="bg-emerald-700 text-white"
              />
              <span className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-slate-900 dark:bg-emerald-600 text-white border-2 border-white dark:border-slate-900 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 break-words">
                  {currentUser.fullName}
                </h2>
                <RoleBadge role={currentUser.role} showStudent />
              </div>
              <p className="text-sm font-mono text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                {currentUser.idNumber}
              </p>
              {!canEditOwnName && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Contact an admin to change your name.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setAvatarError(null);
                  setAvatarModalOpen(true);
                }}
                className="mt-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Change photo or avatar
              </button>
            </div>
          </div>

          {canEditOwnName && !editingName && (
            <button
              type="button"
              onClick={() => {
                setNameInput(currentUser.fullName);
                setNameError(null);
                setEditingName(true);
              }}
              className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Name</span>
            </button>
          )}
        </div>

        {canEditOwnName && editingName && (
          <form onSubmit={handleSaveName} className="space-y-2 pt-1">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                minLength={2}
                maxLength={100}
                value={nameInput}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameError(null);
                }}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-emerald-600"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingName(false);
                    setNameError(null);
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
            {nameError && (
              <p className="text-xs text-rose-600 dark:text-rose-400">{nameError}</p>
            )}
          </form>
        )}

        {savedBannerText && (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 px-3 py-2 text-xs text-emerald-900 dark:text-emerald-200 inline-flex items-center gap-1.5">
            <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{savedBannerText}</span>
          </div>
        )}

        {/* Department & Level Grid (Role omitted as shown by header badge) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Department</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
              {currentUser.department}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Contact an admin to change your department.
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Level</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              {formatLevelLabel(currentUser.level, currentUser.is_alumni)}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              To change your level, contact an admin. Level changes require document verification.
            </p>
          </div>
        </div>

        {(currentUser.studyCourses?.length || currentUser.studySpot) && (
          <div className="rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/35 border border-emerald-200/70 dark:border-emerald-900/60 p-3.5 space-y-1.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Study Partner Profile</span>
            </p>
            {currentUser.studyCourses && currentUser.studyCourses.length > 0 && (
              <p className="text-xs text-slate-700 dark:text-slate-200">
                <span className="font-semibold">Courses:</span>{' '}
                {currentUser.studyCourses.join(', ')}
              </p>
            )}
            {currentUser.studySpot && (
              <p className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                <span>Preferred spot: {currentUser.studySpot}</span>
              </p>
            )}
          </div>
        )}
      </div>

      {/* Appearance / Theme Toggle */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-amber-300 flex items-center justify-center shrink-0">
            {isDark ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Appearance
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isDark ? 'Dark mode enabled' : 'Light mode enabled'}
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label="Toggle dark mode"
          onClick={onToggleTheme}
          className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600/30 ${
            isDark
              ? 'bg-emerald-700 border-emerald-600'
              : 'bg-slate-200 border-slate-300'
          }`}
        >
          <span
            className={`inline-flex h-6 w-6 transform items-center justify-center rounded-full bg-white text-slate-700 shadow-xs transition-transform ${
              isDark ? 'translate-x-7' : 'translate-x-1'
            }`}
          >
            {isDark ? (
              <Moon className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            )}
          </span>
        </button>
      </div>

      {/* Saved / Starred Messages */}
      <button
        type="button"
        onClick={() => setStarredOpen(true)}
        className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 hover:border-amber-300 dark:hover:border-amber-700/80 p-5 flex items-center justify-between gap-4 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <Star className="w-5 h-5 fill-current" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Starred Messages
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {starredMessages.length === 0
                ? 'Bookmark important notes & timetables'
                : `${starredMessages.length} saved ${starredMessages.length === 1 ? 'message' : 'messages'}`}
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
      </button>

      {/* Dedicated GPA Calculator Launcher */}
      <button
        type="button"
        onClick={() => setShowGpaCalculator(true)}
        className="w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/80 p-5 flex items-center justify-between gap-4 text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Calculator className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              GPA Calculator
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              GSU 5.0 GPA &amp; CGPA tracker · Saved on this device
            </p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
      </button>

      {/* Notification Settings */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Bell className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Notification Settings
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Preferences saved on this device
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {(
            [
              {
                key: 'messages',
                title: 'Chat & Direct Messages',
                desc: 'Highlight unread messages and replies in your chats',
              },
              {
                key: 'announcementsAndTimetable',
                title: 'Announcements & Timetable',
                desc: 'Show badges for campus notices and schedule updates',
              },
              {
                key: 'soundAlerts',
                title: 'In-App Sound Alerts',
                desc: 'Play subtle audio chimes for incoming calls and messages',
              },
            ] as const
          ).map((item) => {
            const enabled = notifPrefs[item.key];
            return (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 py-1"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {item.desc}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={item.title}
                  onClick={() =>
                    setNotifPrefs((prev) => ({
                      ...prev,
                      [item.key]: !prev[item.key],
                    }))
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    enabled
                      ? 'bg-emerald-700 border-emerald-600'
                      : 'bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                      enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Security & Recovery */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <KeyRound className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-sm font-bold">Account Security</h3>
        </div>

        {/* Recovery Email */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Recovery Email
            </span>
            {!editingRecovery && (
              <button
                type="button"
                onClick={() => {
                  setRecoveryInput(recoveryEmail);
                  setRecoveryPassword('');
                  setRecoveryError(null);
                  setEditingRecovery(true);
                }}
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                {recoveryEmail ? 'Edit' : 'Add'}
              </button>
            )}
          </div>

          {!editingRecovery ? (
            recoveryEmail ? (
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 break-all">
                {recoveryEmail}
              </p>
            ) : (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {loadingRecovery
                  ? 'Loading...'
                  : 'No recovery email set — add one for password resets.'}
              </p>
            )
          ) : (
            <form onSubmit={handleSaveRecoveryEmail} className="space-y-2 pt-1">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={recoveryInput}
                  onChange={(e) => {
                    setRecoveryInput(e.target.value);
                    setRecoveryError(null);
                  }}
                  placeholder="yourname@example.com"
                  className="flex-1 min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={savingRecovery}
                    className="min-h-[40px] px-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                  >
                    {savingRecovery ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    disabled={savingRecovery}
                    onClick={() => {
                      setEditingRecovery(false);
                      setRecoveryPassword('');
                      setRecoveryError(null);
                    }}
                    className="min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={recoveryPassword}
                onChange={(e) => {
                  setRecoveryPassword(e.target.value);
                  setRecoveryError(null);
                }}
                placeholder="Enter your current password to confirm"
                aria-label="Current password"
                className="w-full min-h-[40px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-600"
              />
              {recoveryError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{recoveryError}</p>
              )}
            </form>
          )}
        </div>

        {/* Change Password */}
        <button
          type="button"
          onClick={() => {
            setCurrentPasswordInput('');
            setNewPasswordInput('');
            setConfirmPasswordInput('');
            setPasswordError(null);
            setPasswordModalOpen(true);
          }}
          className="w-full min-h-[46px] px-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
        >
          <div className="min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
              Change Password
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Update your GSU Connect sign-in password
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>

      {/* Who Can See My Info */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Eye className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-sm font-bold">Who Can See My Info</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Visible to approved GSU members:
            </span>{' '}
            Your full name, department, level, profile photo/avatar, role badge, and study partner courses appear in campus directories and chats.
          </p>
          <p>
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              Restricted &amp; private info:
            </span>{' '}
            Only you and authorized approvers (Admins, Class Reps, and Department Helpers) can see your Matric/Staff ID. Your phone number and recovery email are never shown to other members and are used only for login and account recovery. Verification ID cards are deleted after approval.
          </p>
        </div>
      </div>

      {/* Account Access */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-3">
        <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
          <Shield className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <h3 className="text-sm font-bold">Account Access</h3>
        </div>
        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {permissionsList.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Support & Legal */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-6 space-y-2">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
          <span>Support &amp; Legal</span>
        </h3>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
            `GSU Connect Support — ${currentUser.idNumber}`
          )}`}
          className="w-full min-h-[44px] px-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            <Mail className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Help &amp; Support ({SUPPORT_EMAIL})</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </a>

        <button
          type="button"
          onClick={() => setLegalModal('terms')}
          className="w-full min-h-[44px] px-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Terms of Use</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => setLegalModal('privacy')}
          className="w-full min-h-[44px] px-3.5 rounded-2xl hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-between gap-3 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Privacy Policy</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
      </div>

      {currentUser.role === "admin" && <AdminTotp />}
      {/* Sign Out */}
      <button
        type="button"
        onClick={async () => {
          await updateUserLastSeen(currentUser.uid).catch(() => undefined);
          await signOutUser();
        }}
        className="w-full min-h-[48px] rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 dark:hover:border-red-900/70 hover:text-red-700 dark:hover:text-red-300 text-slate-700 dark:text-slate-200 font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Sign Out</span>
      </button>

      {/* Delete My Account & Data (NDPA) */}
      <div className="rounded-3xl border border-rose-200/80 dark:border-rose-900/60 bg-rose-50/40 dark:bg-rose-950/20 p-5 space-y-2.5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
              Delete My Account &amp; Data
            </p>
            <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 mt-0.5">
              Permanently erase your GSU Connect account and personal data under the Nigeria Data Protection Act (NDPA).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setDeleteConfirmText('');
              setDeletePasswordInput('');
              setDeleteError(null);
              setDeleteManualRequired(false);
              setDeleteModalOpen(true);
            }}
            className="min-h-[38px] px-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Account</span>
          </button>
        </div>
      </div>

      {starredOpen && (
        <StarredMessagesModal
          starredMessages={starredMessages}
          onClose={() => setStarredOpen(false)}
          onUnstar={(messageId) => unstarMessageForUser(currentUser.uid, messageId)}
          onJumpToMessage={(chatId, messageId) => {
            setStarredOpen(false);
            onJumpToMessage?.(chatId, messageId);
          }}
        />
      )}

      {/* Avatar Picker Modal */}
      {avatarModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit profile picture and avatar"
          onClick={() => !avatarSaving && setAvatarModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Profile Photo &amp; Avatar
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Upload a photo or pick a campus avatar badge
                </p>
              </div>
              <button
                type="button"
                disabled={avatarSaving}
                onClick={() => setAvatarModalOpen(false)}
                aria-label="Close avatar picker"
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 py-1">
              <UserAvatar
                name={currentUser.fullName}
                photoURL={currentUser.photoURL}
                avatarId={currentUser.avatarId}
                size="2xl"
                roundedClass="rounded-3xl"
                fallbackClassName="bg-emerald-700 text-white"
              />
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  disabled={avatarSaving}
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[42px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>{avatarSaving ? 'Saving...' : 'Upload Photo'}</span>
                </button>

                {(currentUser.photoURL || currentUser.avatarId) && (
                  <button
                    type="button"
                    disabled={avatarSaving}
                    onClick={handleResetAvatar}
                    className="min-h-[42px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Use Initials</span>
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadPhoto}
                className="hidden"
              />
            </div>

            {avatarError && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-900/70 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                {avatarError}
              </div>
            )}

            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Campus Preset Avatars
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                {availablePresetAvatars.map((preset) => {
                  const selected =
                    !currentUser.photoURL && currentUser.avatarId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      disabled={avatarSaving}
                      onClick={() => handleSelectPresetAvatar(preset.id)}
                      title={preset.label}
                      className={`relative rounded-2xl p-2 flex flex-col items-center gap-1.5 border transition-all cursor-pointer disabled:opacity-60 ${
                        selected
                          ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/50 ring-2 ring-emerald-500/30'
                          : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${preset.gradientClass} text-white flex items-center justify-center shadow-xs shrink-0`}
                      >
                        {renderPresetAvatarIcon(preset.iconKey, 'w-5 h-5')}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 text-center leading-tight line-clamp-2 break-words w-full">
                        {preset.label}
                      </span>
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                          <Check className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change Password"
          onClick={() => !savingPassword && setPasswordModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Change Password
              </h3>
              <button
                type="button"
                disabled={savingPassword}
                onClick={() => setPasswordModalOpen(false)}
                aria-label="Close change password dialog"
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={currentPasswordInput}
                  onChange={(e) => {
                    setCurrentPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  New Password (minimum 8 characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    setPasswordError(null);
                  }}
                  className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600"
                />
              </div>

              {passwordError && (
                <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                  {passwordError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={savingPassword}
                  onClick={() => setPasswordModalOpen(false)}
                  className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold cursor-pointer"
                >
                  {savingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Legal Modals (Terms / Privacy Policy) */}
      {legalModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={legalModal === 'terms' ? 'Terms of Use' : 'Privacy Policy'}
          onClick={() => setLegalModal(null)}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {legalModal === 'terms' ? 'GSU Connect Terms of Use' : 'GSU Connect Privacy Policy'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Last updated: November 17, 2026
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                aria-label="Close legal information"
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {legalModal === 'terms' ? (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Who Operates GSU Connect:</strong>{' '}
                  GSU Connect is the Gombe State University (GSU) student community platform, built to support communication, academic collaboration, and campus updates among verified members of the GSU community. For support or inquiries, contact{' '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Eligibility &amp; Minimum Age:</strong>{' '}
                  To register and use GSU Connect, you must be at least 16 years old and a current or former student, graduate/alumnus, or staff member of Gombe State University.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Accurate Identity:</strong>{' '}
                  You agree to register with your real name, Matric/Staff ID, department, and academic level. Impersonation, falsified verification documents, or misrepresenting your role or cohort is prohibited and may result in suspension or removal.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Campus Conduct &amp; Moderation:</strong>{' '}
                  Harassment, spam, scams, hate speech, and unauthorized sharing of private student or staff data are forbidden across chats, study spaces, marketplace, and confessions. Admins and authorized moderators may review reported content and suspend accounts that violate campus guidelines.
                </p>
              </div>
            ) : (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Operator &amp; Scope:</strong>{' '}
                  GSU Connect is operated as the Gombe State University (GSU) student community platform for verified GSU students, alumni, and staff (minimum age 16+). We process personal data strictly in line with the{' '}
                  <strong className="text-slate-800 dark:text-slate-100">
                    Nigeria Data Protection Act (NDPA)
                  </strong>{' '}
                  to verify campus eligibility and run community features.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Information Collected:</strong>{' '}
                  Full name, Matric/Staff ID, department, academic level, recovery email, optional phone number, profile avatar/photo, and verification ID documents uploaded during onboarding.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Cloud Storage &amp; Visibility:</strong>{' '}
                  Account data, messages, and shared files are stored and processed securely using Supabase cloud database and storage infrastructure. Phone numbers and recovery emails are kept private, and Matric/Staff IDs are visible only to you and authorized approvers (Admins, Class Reps, and Department Helpers). GPA calculator entries and notification preferences are stored locally on your device.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Data Retention:</strong>{' '}
                  Verification ID documents are deleted after your account is approved. Active account profile and community data are retained while your account remains active and removed upon verified account deletion.
                </p>
                <p>
                  <strong className="text-slate-800 dark:text-slate-100">Your NDPA Rights:</strong>{' '}
                  Under the Nigeria Data Protection Act (NDPA), you may request access, correction, or erasure of your personal data at any time from your Profile or by emailing{' '}
                  <a
                    href={`mailto:${SUPPORT_EMAIL}`}
                    className="font-semibold text-emerald-700 dark:text-emerald-400 underline"
                  >
                    {SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setLegalModal(null)}
                className="min-h-[40px] px-4 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account & Data Confirmation Modal (NDPA) */}
      {deleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Delete Account and Data"
          onClick={closeDeleteModal}
          className="fixed inset-0 z-50 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold">Delete Account &amp; Data</h3>
              </div>
              <button
                type="button"
                disabled={deletingAccount}
                onClick={closeDeleteModal}
                aria-label="Close delete account dialog"
                className="min-w-[38px] min-h-[38px] rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deleteManualRequired ? (
              <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 p-3.5 text-amber-900 dark:text-amber-200">
                  Instant automated server erasure is not yet active on the backend, so we have not removed your account yet. Under the{' '}
                  <strong>Nigeria Data Protection Act (NDPA)</strong>, send a verified deletion request below and our team will erase your account and data promptly.
                </div>

                <a
                  href={ndpaMailtoHref}
                  className="w-full min-h-[44px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                >
                  <Mail className="w-4 h-4" />
                  <span>Send NDPA Deletion Email ({SUPPORT_EMAIL})</span>
                </a>

                <button
                  type="button"
                  onClick={async () => {
                    clearUserDeviceData();
                    await updateUserLastSeen(currentUser.uid).catch(() => undefined);
                    await signOutUser();
                  }}
                  className="w-full min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Clear Local Device Data &amp; Sign Out
                </button>
              </div>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-3">
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  In accordance with the{' '}
                  <strong className="text-slate-800 dark:text-slate-100">
                    Nigeria Data Protection Act (NDPA)
                  </strong>
                  , this permanently requests removal of your profile, credentials, and personal account data from GSU Connect. This cannot be undone.
                </p>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Type <span className="font-mono font-bold text-rose-600 dark:text-rose-400">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    required
                    value={deleteConfirmText}
                    onChange={(e) => {
                      setDeleteConfirmText(e.target.value);
                      setDeleteError(null);
                    }}
                    placeholder="DELETE"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
                    Enter your password to confirm
                  </label>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={deletePasswordInput}
                    onChange={(e) => {
                      setDeletePasswordInput(e.target.value);
                      setDeleteError(null);
                    }}
                    placeholder="Your current password"
                    className="w-full min-h-[42px] px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:border-rose-500"
                  />
                </div>

                {deleteError && (
                  <div className="rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/70 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
                    {deleteError}
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={closeDeleteModal}
                    className="min-h-[40px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={deletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE' || !deletePasswordInput}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                  >
                    {deletingAccount ? 'Processing...' : 'Confirm Deletion'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
