import {graduateClass} from './proof';

export const minPasswordLength = 8;
export const passwordError = (value: string) => value.length < minPasswordLength ? 'Password must be at least 8 characters.' : '';
export const graduateError = 'Graduate is only for the Class of 2026. Otherwise, choose your current numeric level.';
export function validateGraduate(account: string, level: string, selected: boolean, year?: number) {
  if (!selected && !/^class of /i.test(level) && year === undefined) return;
  if (account !== 'student' || !selected || year !== graduateClass || level !== `Class of ${graduateClass}`) throw new Error(graduateError);
}
export const chooseLevelMessage = "Choose the student's level first";
export function clearLevelWarning<T extends {uid:string; text:string}>(message:T|null, uid:string, selection:string) {
  return selection && message?.uid === uid && message.text === chooseLevelMessage ? null : message;
}
export function levelDifference(requested:string, confirmed:string) {
  return confirmed && confirmed !== requested ? `Differs from requested level ${requested}` : '';
}
