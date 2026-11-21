import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type AlertVariant = 'error' | 'success' | 'info' | 'warn';

const tones: Record<AlertVariant, string> = {
  error: 'bg-danger-bg border-danger-line text-danger',
  success: 'bg-success-bg border-success-line text-success',
  info: 'bg-info-bg border-info-line text-info',
  warn: 'bg-warn-bg border-warn-line text-warn',
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
      className={`rounded-xl px-3.5 py-2.5 text-xs leading-relaxed text-left flex items-start gap-2 border ${tones[variant]} ${className}`}
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
