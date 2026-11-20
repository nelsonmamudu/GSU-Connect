import React from 'react';

export interface TabItem<T extends string> {
  key: T;
  label: string;
  count?: number;
  /** Renders a small icon before the label. */
  icon?: React.ComponentType<{ className?: string }>;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  label?: string;
  className?: string;
}

/** Segmented control used for admin sections. */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex flex-nowrap items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-2xl min-w-max"
      >
        {tabs.map((tab) => {
          const active = tab.key === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab.key)}
              className={`min-h-[40px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${
                active
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && <>({tab.count})</>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
