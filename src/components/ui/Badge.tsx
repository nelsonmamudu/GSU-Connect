import React from 'react';

export type BadgeTone = 'neutral' | 'brand' | 'warn' | 'info' | 'danger';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-ink-soft',
  brand:
    'bg-success-bg text-success border border-success-line',
  warn: 'bg-warn-bg text-warn border border-warn-line',
  info: 'bg-info-bg text-info border border-info-line',
  danger: 'bg-danger-bg text-danger border border-danger-line',
};

export interface BadgeProps {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ tone = 'neutral', className = '', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded tabular-nums ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
