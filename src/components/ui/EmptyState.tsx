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
      className={`bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 ${elevation.resting} p-6 sm:p-8 text-center space-y-2 ${className}`}
    >
      {Icon && <Icon className="w-8 h-8 text-emerald-700/60 dark:text-emerald-400/60 mx-auto" />}
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {body && (
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-[46ch] mx-auto">
          {body}
        </p>
      )}
      {children && <div className="pt-3 flex flex-col items-center">{children}</div>}
    </div>
  );
}
