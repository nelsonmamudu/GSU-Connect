import React from 'react';
import { focusRing } from './styles';

export interface ChipProps {
  /** Selected chips read as filled, not just outlined. */
  active?: boolean;
  /** Rendered tabular so a changing count cannot shift the label. */
  count?: number;
  onClick?: () => void;
  /** Optional accessible label when the visible text alone is ambiguous. */
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Filter chip. Resting, hover and active are three visually distinct states,
 * and `aria-pressed` carries the state to assistive tech so colour is never the
 * only signal.
 */
export function Chip({
  active,
  count,
  onClick,
  label,
  className = '',
  children,
}: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(active)}
      aria-label={label}
      onClick={onClick}
      className={`min-h-[40px] px-3 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-colors cursor-pointer ${focusRing} ${
        active
          ? 'bg-brand border-brand text-on-brand'
          : 'bg-surface border-line text-ink-soft hover:border-line-strong hover:text-ink'
      } ${className}`}
    >
      <span>{children}</span>
      {typeof count === 'number' && <span className="tabular-nums">({count})</span>}
    </button>
  );
}

export interface ChipRowProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

/** One scrolling row of chips with an edge fade, instead of a wrapping grid. */
export function ChipRow({ label, className = '', children }: ChipRowProps) {
  return (
    <div className={`relative ${className}`}>
      <div
        role="group"
        aria-label={label}
        className="flex flex-nowrap gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l from-surface to-transparent"
      />
    </div>
  );
}
