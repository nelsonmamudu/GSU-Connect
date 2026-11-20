import { passwordStrength } from '../utils/entryRules';

interface PasswordStrengthMeterProps {
  value: string;
  /** Show the textual label ("Strong") next to the bars. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Four-segment strength indicator. Purely advisory — the database enforces the
 * 8-character minimum, so this never blocks submission on its own.
 */
export function PasswordStrengthMeter({
  value,
  showLabel = true,
  className = '',
}: PasswordStrengthMeterProps) {
  if (!value) return null;
  const strength = passwordStrength(value);
  const barTone = (filled: boolean) =>
    !filled
      ? 'bg-sunken'
      : strength.score <= 1
        ? 'bg-red-500'
        : strength.score === 2
          ? 'bg-amber-500'
          : 'bg-brand';
  const labelTone =
    strength.score <= 1
      ? 'text-red-600 dark:text-red-400'
      : strength.score === 2
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-brand';

  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      <div className="flex gap-1 flex-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${barTone(i < strength.score)}`}
          />
        ))}
      </div>
      {showLabel && (
        <span className={`text-[11px] font-semibold ${labelTone}`}>{strength.label}</span>
      )}
    </div>
  );
}
