import {graduateError} from './entryRules';

// Only exact, application-owned copy may pass through; never append backend detail.
const allowed = new Set([graduateError,
  "An account with this Matric Number / Staff ID already exists. Try signing in instead.",
  "Attach proof of staff status or choose email or vouching.",
  "Attach your selected proof of staff status, or choose email or vouching.",
  "Choose a JPEG, PNG, WebP or PDF.",
  "Choose a nonempty JPEG, PNG, WebP or PDF.",
  "Choose a nonempty proof image or PDF.",
  "Choose a staff ID photo.",
  "Choose a staff verification method.",
  "Could not attach proof. Please try again.",
  "Could not prepare a legible photo under 1 MB. Choose a smaller photo or PDF.",
  "Could not send the reset email. Please check your connection and try again.",
  "Department or office must be at least 2 characters.",
  "Full name must be at least 2 characters.",
  "Identifier is too long.",
  "Matric number or Staff ID must have at least 3 alphanumeric characters.",
  "PDF exceeds the 3 MB limit. Choose a smaller PDF.",
  "Password is incorrect.",
  "Password must be at least 8 characters.",
  "Photo is too large",
  "Please enter a valid Matric Number, Staff ID, phone number, or email.",
  "Please enter a valid email address.",
  "Please enter a valid email address. Password reset links are sent there.",
  "Please enter a valid matric number, staff ID or sign-in email.",
  "Please enter a valid phone number (e.g. 0803 123 4567).",
  "Please enter your Matric Number, Staff ID, phone number, or email.",
  "Please enter your current password.",
  "Please select or enter your department (at least 2 characters).",
  "Please select or enter your department or office (at least 2 characters).",
  "Please select your department",
  "Please select your department or office",
  "Please select your level",
  "Registration did not return a user account. Please try again.",
  "Sign in to upload verification proof.",
  "Too many password reset requests. Please wait a few minutes and try again.",
  "Upload failed. Please try again.",
  "Verification file exceeds the 3 MB limit. Please choose a smaller file.",
  "Verification file exceeds the 3 MB limit. Please pick a smaller image.",
]);
export function friendlyEntryError(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : '';
  return allowed.has(msg) ? msg : fallback;
}

export function formatAuthError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (/invalid graduation year|graduation year is required|graduate status/.test(lower)) return graduateError;
  if (lower.includes('already registered') || lower.includes('already exists') || lower.includes('duplicate')) {
    return 'An account with this Matric Number / Staff ID already exists. Try signing in instead.';
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return 'Please enter a valid email address or Matric Number / Staff ID.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Incorrect Matric Number, Staff ID, email, or password.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please confirm your email address via the verification link in your inbox before signing in.';
  }
  if (lower.includes('password should be at least') || lower.includes('weak')) {
    return 'Password must be at least 8 characters.';
  }
  if (lower.includes('please wait') && (lower.includes('second') || lower.includes('minute'))) {
    return 'Please wait before trying again.';
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return 'Network error. Please check your internet connection and try again.';
  }
  return friendlyEntryError(err, 'Unable to complete this request. Please try again.');
}
