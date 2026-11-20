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
  'inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-focus aria-disabled:opacity-60 aria-disabled:cursor-not-allowed';

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-[38px] px-3 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
  lg: 'min-h-[48px] px-5 text-sm',
};

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand hover:bg-brand-strong text-on-brand',
  secondary:
    'bg-brand-subtle border border-success-line text-brand hover:bg-success-bg',
  outline:
    'border border-line bg-surface hover:bg-sunken text-ink-soft',
  ghost: 'text-ink-muted hover:bg-sunken',
  danger:
    'border border-line bg-surface hover:bg-danger-bg hover:border-danger-line hover:text-danger text-ink-soft',
  dangerSolid: 'bg-danger hover:bg-danger/90 text-white',
};

/**
 * Both labels occupy the same grid cell, so the button is always at least as
 * wide as the wider of the two. A busy label like "Checking…" therefore cannot
 * make the button jump under the user's finger.
 */
function ButtonLabel({
  busy,
  busyLabel,
  children,
}: {
  busy: boolean;
  busyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-grid items-center min-w-0">
      <span className={`col-start-1 row-start-1 ${busy ? 'invisible' : ''}`}>
        {children}
      </span>
      {busy && busyLabel && (
        <span className="col-start-1 row-start-1 text-center">{busyLabel}</span>
      )}
    </span>
  );
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  full?: boolean;
  loading?: boolean;
  /** Label announced while `loading` is true. */
  loadingLabel?: string;
}

/**
 * Busy is not disabled. While `loading` is true the button keeps focus and stays
 * in the tab order, reports `aria-busy`, and ignores presses — greying it out
 * with the `disabled` attribute would drop the user's place mid-request.
 * Double-submit protection therefore has to live in the owning handler too.
 */
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
  onClick,
  ...rest
}: ButtonProps) {
  const busy = Boolean(loading);
  return (
    <button
      type={type}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (busy) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={`${base} ${sizes[size]} ${variants[variant]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {busy && <Spinner className="w-4 h-4" label={loadingLabel} />}
      <ButtonLabel busy={busy} busyLabel={loadingLabel}>
        {children}
      </ButtonLabel>
    </button>
  );
}
