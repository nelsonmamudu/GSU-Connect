import React from 'react';
import { Spinner } from './Spinner';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'dangerSolid';

export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40';

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[38px] px-3 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-5 text-sm',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-700 hover:bg-emerald-800 text-white',
  secondary:
    'bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100/80 dark:hover:bg-emerald-900/50 border border-emerald-200/70 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300',
  outline:
    'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200',
  ghost:
    'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
  danger:
    'border border-slate-200 dark:border-slate-700 hover:bg-red-50 dark:hover:bg-red-950/40 hover:border-red-200 dark:hover:border-red-800/70 hover:text-red-700 dark:hover:text-red-300 text-slate-700 dark:text-slate-200',
  dangerSolid: 'bg-red-600 hover:bg-red-700 text-white',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
  /** Label announced while `loading` is true. */
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  loading,
  loadingLabel,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${base} ${sizes[size]} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner className="w-4 h-4" label={loadingLabel} />}
      {loading && loadingLabel ? <span>{loadingLabel}</span> : children}
    </button>
  );
}
