// Shared class tokens. Keeping them in one file means a palette or radius
// change happens once instead of across thirty components.
//
// Radius follows one scale (border-radius-system): chips/badges 4, buttons and
// inputs 8, cards and alerts 12, modals and sheets 16. Nested surfaces subtract
// their padding from the outer radius rather than reusing it.

export const radius = {
  badge: 'rounded',
  input: 'rounded-lg',
  button: 'rounded-lg',
  card: 'rounded-xl',
  alert: 'rounded-xl',
  sheet: 'rounded-2xl',
} as const;

// 2px ring, 2px offset, and a solid colour that clears 3:1 on both themes.
// `:focus-visible` keeps pointer clicks clean and keyboard tabs ringed.
export const focusRing =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 focus-visible:ring-emerald-700 dark:focus-visible:ring-emerald-400';

// Inputs stay at 16px: anything smaller makes iOS Safari zoom the whole page
// when the field is focused.
export const inputClass =
  'w-full min-h-[44px] px-3.5 rounded-lg border bg-slate-50/50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-500 text-base focus:outline-none focus:bg-white dark:focus:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';

export function inputTone(invalid?: boolean): string {
  return invalid
    ? 'border-red-400 dark:border-red-500 focus:border-red-500 focus-visible:ring-red-600 dark:focus-visible:ring-red-400'
    : 'border-slate-200 dark:border-slate-700 focus:border-emerald-700 dark:focus:border-emerald-400 focus-visible:ring-emerald-700 dark:focus-visible:ring-emerald-400';
}

export const controlClass =
  'min-h-[44px] px-3.5 rounded-lg border bg-white dark:bg-slate-900 text-base font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900 focus-visible:ring-emerald-700 dark:focus-visible:ring-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

// One three-step elevation scale instead of a free-for-all of shadow sizes:
// cards and inline panels rest, menus and popovers lift, modals float.
export const elevation = {
  resting: 'shadow-sm',
  raised: 'shadow-md',
  overlay: 'shadow-lg',
} as const;

export const labelClass =
  'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5';

// slate-600 rather than slate-500: 4.5:1 on white instead of ~4.3:1.
export const hintClass =
  'mt-1.5 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed';

export const errorTextClass =
  'mt-1.5 text-xs font-medium text-red-600 dark:text-red-400';
