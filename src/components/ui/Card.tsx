import React from 'react';
import { elevation } from './styles';

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
      className={`bg-surface rounded-xl border border-line ${elevation.resting} ${paddings[padding]} ${className}`}
    >
      {children}
    </div>
  );
}
