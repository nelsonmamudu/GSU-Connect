import React from 'react';
import { focusRing } from './styles';

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

/**
 * Segmented control. The row scrolls instead of wrapping so a count change
 * never reflows the tabs, and counts are tabular so a changing number does not
 * make the label jitter.
 */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  className = '',
}: TabsProps<T>) {
  return (
    <div
      className={`w-full overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex flex-nowrap items-center gap-1 p-1 bg-sunken rounded-2xl min-w-max"
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
              className={`min-h-[44px] px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${focusRing} ${
                active
                  ? 'bg-surface text-ink shadow-resting'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {Icon && <Icon className="w-3.5 h-3.5" />}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className="tabular-nums">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
