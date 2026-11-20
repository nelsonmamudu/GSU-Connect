import React from 'react';

export interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  className?: string;
  children?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, body, className = '', children }: EmptyStateProps) {
  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-10 text-center space-y-2 ${className}`}
    >
      {Icon && <Icon className="w-8 h-8 text-emerald-600/50 mx-auto" />}
      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
      {body && <p className="text-sm text-slate-500 dark:text-slate-400">{body}</p>}
      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
