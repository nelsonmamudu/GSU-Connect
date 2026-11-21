import React from 'react';
import { ROLE_LABELS, UserRole } from '../types';

interface RoleBadgeProps {
  role: UserRole;
  showStudent?: boolean;
  inverted?: boolean;
  /** Server-derived owner tag. Never settable from profile data. */
  founder?: boolean;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({
  role,
  showStudent = false,
  inverted = false,
  founder = false,
}) => {
  if (role === 'student' && !showStudent && !founder) return null;

  const tone = founder
    ? inverted
      ? 'text-warn-line bg-white/15 ring-1 ring-warn-line/40'
      : 'text-warn bg-warn-line/80 dark:bg-warn-bg/70 ring-1 ring-warn/30'
    : inverted
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
      {founder ? 'Founder' : ROLE_LABELS[role]}
    </span>
  );
};
