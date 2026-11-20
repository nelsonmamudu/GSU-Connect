// Shared class tokens. Keeping them in one file means a palette or radius
// change happens once instead of across thirty components.

export const radius = {
  input: 'rounded-xl',
  card: 'rounded-3xl',
  badge: 'rounded-lg',
} as const;

export const focusRing =
  'focus:outline-none focus:ring-2 focus:ring-emerald-600/15 focus:border-emerald-600';

export const inputClass =
  'w-full min-h-[44px] px-3.5 rounded-xl border bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:ring-2';

export function inputTone(invalid?: boolean): string {
  return invalid
    ? 'border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-red-500/15'
    : 'border-slate-200 dark:border-slate-700 focus:border-emerald-600 focus:ring-emerald-600/15';
}

export const controlClass =
  'min-h-[38px] px-2.5 rounded-xl border bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-600 disabled:opacity-60 cursor-pointer';

export const labelClass =
  'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5';

export const hintClass =
  'mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed';

export const errorTextClass =
  'mt-1.5 text-xs font-medium text-red-600 dark:text-red-400';
