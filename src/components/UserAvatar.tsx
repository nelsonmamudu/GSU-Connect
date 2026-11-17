import React, { useEffect, useState } from 'react';
import {
  Atom,
  Award,
  BookOpen,
  Compass,
  Cpu,
  Flame,
  GraduationCap,
  HeartPulse,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import { getInitials, PRESET_AVATARS, PresetAvatarOption } from '../types';

export type UserAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface UserAvatarProps {
  name: string;
  photoURL?: string;
  avatarId?: string;
  size?: UserAvatarSize;
  roundedClass?: string;
  fallbackClassName?: string;
  className?: string;
}

const SIZE_CLASSES: Record<UserAvatarSize, string> = {
  xs: 'w-7 h-7 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-xs',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-16 h-16 text-xl',
  '2xl': 'w-20 h-20 text-2xl',
};

const ICON_SIZE_CLASSES: Record<UserAvatarSize, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-5 h-5',
  xl: 'w-7 h-7',
  '2xl': 'w-9 h-9',
};

export function renderPresetAvatarIcon(
  iconKey: PresetAvatarOption['iconKey'],
  className: string
): React.ReactNode {
  switch (iconKey) {
    case 'graduation':
      return <GraduationCap className={className} />;
    case 'book':
      return <BookOpen className={className} />;
    case 'award':
      return <Award className={className} />;
    case 'atom':
      return <Atom className={className} />;
    case 'flame':
      return <Flame className={className} />;
    case 'cpu':
      return <Cpu className={className} />;
    case 'compass':
      return <Compass className={className} />;
    case 'sparkles':
      return <Sparkles className={className} />;
    case 'shield':
      return <ShieldCheck className={className} />;
    case 'heart-pulse':
      return <HeartPulse className={className} />;
    case 'scale':
      return <Scale className={className} />;
    case 'zap':
      return <Zap className={className} />;
  }
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name,
  photoURL,
  avatarId,
  size = 'md',
  roundedClass = 'rounded-full',
  fallbackClassName = 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-200',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [photoURL]);

  const cleanPhoto = (photoURL || '').trim();
  const preset = avatarId ? PRESET_AVATARS.find((p) => p.id === avatarId) : undefined;
  const sizeClass = SIZE_CLASSES[size];
  const iconSizeClass = ICON_SIZE_CLASSES[size];

  if (cleanPhoto && !imgError) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 ${sizeClass} ${roundedClass} bg-slate-200 dark:bg-slate-800 ${className}`}
      >
        <img
          src={cleanPhoto}
          alt={name || 'GSU Member'}
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  if (preset) {
    return (
      <div
        className={`relative overflow-hidden shrink-0 ${sizeClass} ${roundedClass} bg-gradient-to-br ${preset.gradientClass} text-white flex items-center justify-center shadow-2xs ${className}`}
        aria-label={`${name || 'GSU Member'} avatar`}
      >
        {renderPresetAvatarIcon(preset.iconKey, iconSizeClass)}
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden shrink-0 ${sizeClass} ${roundedClass} ${fallbackClassName} font-semibold flex items-center justify-center ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
