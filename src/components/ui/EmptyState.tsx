import React from 'react';
import { elevation } from './styles';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  className?: string;
  /** The single next action for this empty state. */
  children?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, body, className = '', children }: EmptyStateProps) {
  return (
    <div
      className={`bg-surface rounded-2xl border border-line ${elevation.resting} p-6 sm:p-8 text-center space-y-2 ${className}`}
    >
      {Icon && <Icon className="w-8 h-8 text-brand/70 mx-auto" />}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {body && (
        <p className="text-sm text-ink-muted leading-relaxed max-w-[46ch] mx-auto">
          {body}
        </p>
      )}
      {children && <div className="pt-3 flex flex-col items-center">{children}</div>}
    </div>
  );
}
