export interface SpinnerProps {
  className?: string;
  label?: string;
}

/** Inline loading indicator. Pair with `aria-busy` on the owning control. */
export function Spinner({ className = 'w-4 h-4', label }: SpinnerProps) {
  return (
    <span role="status" className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`inline-block rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
      />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
