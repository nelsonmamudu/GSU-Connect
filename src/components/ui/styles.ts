// Shared class tokens, resolved from the role tokens in `src/index.css`.
//
// Nothing here hardcodes a colour: every class reads a role (`surface`, `ink`,
// `brand`, `danger`…), so dark mode is the token swap in `index.css` and a
// palette change is one file.
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
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-focus';

// Inputs stay at 16px: anything smaller makes iOS Safari zoom the whole page
// when the field is focused.
export const inputClass =
  'w-full min-h-[44px] px-3.5 rounded-lg border bg-sunken text-ink placeholder:text-ink-muted text-base focus:outline-none focus:bg-surface disabled:opacity-60 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export function inputTone(invalid?: boolean): string {
  return invalid
    ? 'border-danger focus:border-danger focus-visible:ring-danger'
    : 'border-line focus:border-brand focus-visible:ring-focus';
}

export const controlClass =
  'min-h-[44px] px-3.5 rounded-lg border bg-surface text-base font-semibold text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-focus disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

export const labelClass =
  'block text-xs font-semibold text-ink-soft mb-1.5';

export const hintClass =
  'mt-1.5 text-[11px] text-ink-muted leading-relaxed';

export const errorTextClass = 'mt-1.5 text-xs font-medium text-danger';

// One three-step elevation scale instead of a free-for-all of shadow sizes:
// cards and inline panels rest, menus and popovers lift, modals float. The
// utilities are defined in `index.css` so they swap under `.dark` like every
// other token — a shadow that reads on white is invisible on the dark surface.
export const elevation = {
  resting: 'shadow-resting',
  raised: 'shadow-raised',
  overlay: 'shadow-overlay',
} as const;
