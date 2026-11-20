import React from 'react';
import { ROLE_LABELS, UserRole } from '../types';

interface RoleBadgeProps {
  role: UserRole;
  showStudent?: boolean;
  inverted?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  showStudent = false,
  inverted = false,
}) => {
  if (role === 'student' && !showStudent) return null;

  const tone = inverted
    ? 'text-emerald-100 bg-white/15'
    : role === 'admin'
      ? 'text-brand bg-brand-subtle/80 dark:text-brand dark:bg-brand-subtle/80'
      : role === 'lecturer'
        ? 'text-amber-800 bg-amber-100/80 dark:text-amber-300 dark:bg-amber-950/70'
        : role === 'classRep' || role === 'deptHelper'
          ? 'text-teal-800 bg-teal-100/80 dark:text-teal-300 dark:bg-teal-950/70'
          : 'text-ink-body bg-sunken dark:text-ink-soft dark:bg-sunken';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold tracking-tight whitespace-nowrap shrink-0 ${tone}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
};
