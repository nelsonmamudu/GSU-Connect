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
          ? 'bg-emerald-700 border-emerald-700 text-white'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-900 dark:hover:text-slate-100'
      } ${className}`}
    >
      <span>{children}</span>
      {typeof count === 'number' && <span className="tabular-nums">({count})</span>}
    </button>
  );
}

export interface ChipRowProps {
  label: string;
  /** Fade gradient stops; defaults match a white/slate-900 surface. */
  fadeClassName?: string;
  className?: string;
  children: React.ReactNode;
}

/** One scrolling row of chips with an edge fade, instead of a wrapping grid. */
export function ChipRow({
  label,
  fadeClassName = 'from-white dark:from-slate-900',
  className = '',
  children,
}: ChipRowProps) {
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
        className={`pointer-events-none absolute inset-y-0 right-0 w-7 bg-gradient-to-l ${fadeClassName} to-transparent`}
      />
    </div>
  );
}
