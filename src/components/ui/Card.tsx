import React from 'react';

export interface CardProps {
  /** 4 | 5 | 6 | 10 — matches the app's existing paddings. */
  padding?: 4 | 5 | 6 | 10;
  className?: string;
  children: React.ReactNode;
}

const paddings: Record<NonNullable<CardProps['padding']>, string> = {
  4: 'p-4',
  5: 'p-5',
  6: 'p-6',
  10: 'p-10',
};

export function Card({ padding = 5, className = '', children }: CardProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 ${paddings[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
