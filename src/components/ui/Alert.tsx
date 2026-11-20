import React from 'react';

export type AlertVariant = 'error' | 'success' | 'info' | 'warn';

const tones: Record<AlertVariant, string> = {
  error:
    'bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800/70 text-red-800 dark:text-red-300',
  success:
    'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 text-emerald-900 dark:text-emerald-200',
  info: 'bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300',
  warn:
    'bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-amber-800 dark:text-amber-300',
};

export interface AlertProps {
  variant?: AlertVariant;
  /** Defaults to `alert` for errors/warnings, `status` otherwise. */
  role?: 'alert' | 'status';
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export function Alert({
  variant = 'info',
  role,
  onDismiss,
  dismissLabel = 'Dismiss message',
  className = '',
  children,
}: AlertProps) {
  const resolvedRole = role ?? (variant === 'error' || variant === 'warn' ? 'alert' : 'status');
  return (
    <div
      role={resolvedRole}
      className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed text-left flex items-start gap-2 ${tones[variant]} ${className}`}
    >
      <span className="flex-1 min-w-0">{children}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
        >
          <span aria-hidden="true">✕</span>
        </button>
      )}
    </div>
  );
}
