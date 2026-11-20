import {getGraduationClassYear, graduationLevelLabel} from './graduationClass';

export const minPasswordLength = 8;
export const passwordError = (value: string) => value.length < minPasswordLength ? 'Password must be at least 8 characters.' : '';

const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', 'qwertyui', 'qwerty123',
  'gsuconnect', 'gsu2026', 'admin123', 'letmein1', '00000000', '11111111', 'abcdefg1',
]);

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: 'Too weak' | 'Weak' | 'Fair' | 'Strong' | 'Excellent';
}

// Lightweight, dependency-free strength estimate. The database still enforces
// the 8-character minimum; this only helps people choose a better password.
export function passwordStrength(value: string): PasswordStrength {
  if (!value) return { score: 0, label: 'Too weak' };
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 12) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  if (COMMON_PASSWORDS.has(value.toLowerCase())) score = 0;
  const clamped = Math.max(0, Math.min(4, score)) as PasswordStrength['score'];
  const labels: PasswordStrength['label'][] = ['Too weak', 'Weak', 'Fair', 'Strong', 'Excellent'];
  return { score: clamped, label: labels[clamped] };
}
export function graduateError(year: number = getGraduationClassYear()) {
  return `Graduate is only for the ${graduationLevelLabel(year)}. Otherwise, choose your current numeric level.`;
}
export function validateGraduate(account: string, level: string, selected: boolean, year?: number) {
  const configured = getGraduationClassYear();
  if (!selected && !/^class of /i.test(level) && year === undefined) return;
  if (
    account !== 'student' ||
    !selected ||
    year !== configured ||
    level !== graduationLevelLabel(configured)
  ) {
    throw new Error(graduateError(configured));
  }
}
export const chooseLevelMessage = "Choose the student's level first";
export function clearLevelWarning<T extends {uid:string; text:string}>(message:T|null, uid:string, selection:string) {
  return selection && message?.uid === uid && message.text === chooseLevelMessage ? null : message;
}
export function levelDifference(requested:string, confirmed:string) {
  return confirmed && confirmed !== requested ? `Differs from requested level ${requested}` : '';
}
