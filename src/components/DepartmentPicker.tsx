import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { DepartmentItem } from '../types';

interface DepartmentPickerProps {
  departments: DepartmentItem[];
  value: string;
  onChange: (department: string) => void;
  id?: string;
  customOptionLabel?: string;
  customPlaceholder?: string;
}

export const DepartmentPicker: React.FC<DepartmentPickerProps> = ({
  departments,
  value,
  onChange,
  id = 'department-picker',
  customOptionLabel = 'Other (Type your department)',
  customPlaceholder = 'Enter your department name (e.g. Environmental Management)',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [isOtherMode, setIsOtherMode] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const customInputRef = useRef<HTMLInputElement | null>(null);

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => a.name.localeCompare(b.name));
  }, [departments]);

  const matchedItem = useMemo(
    () =>
      sortedDepartments.find(
        (d) => d.name.toLowerCase() === value.trim().toLowerCase()
      ) || null,
    [sortedDepartments, value]
  );

  // Sync custom mode if parent initializes with a non-catalog department
  useEffect(() => {
    if (value && !matchedItem && sortedDepartments.length > 0 && !isOtherMode) {
      setIsOtherMode(true);
      setCustomValue(value);
    }
  }, [value, matchedItem, sortedDepartments.length, isOtherMode]);

  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchInputRef.current?.focus(), 20);
    } else {
      setSearch('');
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedDepartments;
    return sortedDepartments.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.faculty.toLowerCase().includes(q)
    );
  }, [sortedDepartments, search]);

  const handleSelectDepartment = (deptName: string) => {
    setIsOtherMode(false);
    setCustomValue('');
    onChange(deptName);
    setOpen(false);
  };

  const handleSelectOther = (prefill = '') => {
    setIsOtherMode(true);
    setCustomValue(prefill);
    onChange(prefill);
    setOpen(false);
    setTimeout(() => customInputRef.current?.focus(), 20);
  };

  return (
    <div ref={containerRef} className="relative space-y-2">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full min-h-[44px] px-3.5 rounded-xl border border-line bg-sunken/50 dark:bg-sunken/80 hover:bg-white dark:hover:bg-sunken text-left text-sm flex items-center justify-between gap-2 focus:outline-none focus:bg-white dark:focus:bg-sunken focus:border-brand focus:ring-2 focus:ring-focus/15 transition-colors cursor-pointer"
      >
        <span className="min-w-0 truncate text-ink font-medium">
          {isOtherMode
            ? 'Other (Custom department)'
            : matchedItem
              ? matchedItem.name
              : value || 'Select department'}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted dark:text-ink-muted shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute z-40 left-0 right-0 mt-1 bg-surface rounded-2xl border border-line shadow-lg overflow-hidden">
          <div className="p-2 border-b border-line bg-sunken/60">
            <div className="relative">
              <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search department or faculty..."
                className="w-full min-h-[40px] pl-9 pr-8 rounded-xl border border-line bg-surface text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-brand"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-ink-muted hover:text-ink-body dark:hover:text-ink-soft cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            role="listbox"
            className="max-h-60 overflow-y-auto divide-y divide-line"
          >
            {filtered.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <p className="text-xs text-ink-muted">
                  No department matched &ldquo;{search.trim()}&rdquo;.
                </p>
                {search.trim().length >= 2 && (
                  <button
                    type="button"
                    onClick={() => handleSelectOther(search.trim())}
                    className="min-h-[40px] px-3 rounded-xl bg-brand-subtle dark:bg-brand-subtle/60 hover:bg-brand-subtle dark:hover:bg-brand-subtle/60 text-brand text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Use &ldquo;{search.trim()}&rdquo;</span>
                  </button>
                )}
              </div>
            ) : (
              filtered.map((dept) => {
                const isSelected =
                  !isOtherMode &&
                  value.trim().toLowerCase() === dept.name.toLowerCase();
                return (
                  <button
                    key={dept.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => handleSelectDepartment(dept.name)}
                    className={`w-full min-h-[44px] px-3.5 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand'
                        : 'hover:bg-sunken text-ink'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{dept.name}</p>
                      <p className="text-[11px] text-ink-muted truncate">
                        Faculty of {dept.faculty}
                      </p>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-brand shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-line/80 dark:border-line bg-sunken/70 dark:bg-sunken/60 p-1.5">
            <button
              type="button"
              onClick={() =>
                handleSelectOther(
                  filtered.length === 0 && search.trim().length >= 2
                    ? search.trim()
                    : ''
                )
              }
              className={`w-full min-h-[44px] px-3 rounded-xl text-left text-sm font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                isOtherMode
                  ? 'bg-brand-subtle dark:bg-brand-subtle/60 text-brand'
                  : 'text-brand hover:bg-brand-subtle/70 dark:hover:bg-brand-subtle/40'
              }`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>{customOptionLabel}</span>
            </button>
          </div>
        </div>
      )}

      {isOtherMode && (
        <div>
          <input
            ref={customInputRef}
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={customValue}
            onChange={(e) => {
              setCustomValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder={customPlaceholder}
            className="w-full min-h-[44px] px-3.5 rounded-xl border border-brand bg-surface dark:bg-sunken text-ink placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-focus/15"
          />
        </div>
      )}
    </div>
  );
};
