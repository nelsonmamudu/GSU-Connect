import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

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

// Colour is never the only signal: every tone carries an icon as well.
const icons: Record<AlertVariant, React.ComponentType<{ className?: string }>> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
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
  const Icon = icons[variant];
  return (
    <div
      role={resolvedRole}
      className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed text-left flex items-start gap-2 ${tones[variant]} ${className}`}
    >
      <Icon className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
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
