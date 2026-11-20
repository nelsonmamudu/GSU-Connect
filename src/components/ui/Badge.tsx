import React from 'react';

export type BadgeTone =
  | 'slate'
  | 'emerald'
  | 'amber'
  | 'indigo'
  | 'red'
  | 'sky';

const tones: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
  emerald:
    'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200/70 dark:border-emerald-900/60',
  amber:
    'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70',
  indigo:
    'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70',
  red: 'bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 border border-red-200/70 dark:border-red-800/70',
  sky: 'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200/70 dark:border-sky-800/70',
};

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = 'slate', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
