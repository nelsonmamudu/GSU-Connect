/**
 * The graduate class year is deployment configuration, not a code constant.
 *
 * The server owns the value (`public.graduation_class_year()`, served through
 * the `entry_config` RPC). Until that RPC answers we fall back to the value the
 * app shipped with, so a failed config fetch degrades instead of breaking
 * signup. `formatLevelLabel` still recognises any "Class of YYYY" label, so a
 * stored cohort from an earlier configuration keeps displaying correctly.
 */

export const DEFAULT_GRADUATION_CLASS_YEAR = 2026;

let graduationClassYear = DEFAULT_GRADUATION_CLASS_YEAR;

export function setGraduationClassYear(next: number | null | undefined): void {
  const value = Number(next);
  if (Number.isFinite(value) && value > 2000 && value < 3000) {
    graduationClassYear = Math.trunc(value);
  }
}

export function getGraduationClassYear(): number {
  return graduationClassYear;
}

/** The cohort label stored in `profiles.level`, e.g. "Class of 2026". */
export function graduationLevelLabel(
  year: number = graduationClassYear,
): `Class of ${number}` {
  return `Class of ${year}`;
}

/** Any stored graduate cohort label, regardless of which year configured it. */
export function isGraduateLevel(level: string | null | undefined): boolean {
  return /^class of \d{4}$/i.test((level || '').trim());
}
