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
    ? 'text-success-line bg-white/15'
    : role === 'admin'
      ? 'text-brand bg-brand-subtle/80 dark:bg-brand-subtle/80'
      : role === 'lecturer'
        ? 'text-warn bg-warn-line/80 dark:bg-warn-bg/70'
        : role === 'classRep' || role === 'deptHelper'
          ? 'text-success bg-success-line/80 dark:bg-success-bg/70'
          : 'text-ink-body bg-sunken dark:text-ink-soft';

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold tracking-tight whitespace-nowrap shrink-0 ${tone}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
};
