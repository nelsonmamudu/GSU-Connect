import React, { createContext, useContext, useId } from 'react';
import { errorTextClass, hintClass, labelClass } from './styles';

export interface FieldControl {
  controlId: string;
  errorId: string;
  hintId: string;
  describedBy: string | undefined;
  invalid: boolean;
}

const FieldContext = createContext<FieldControl | null>(null);

/** Read by `Input`/`Select` so label, error and hint wiring stays in one place. */
export function useFieldControl(): FieldControl | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  /** Id of the control. Auto-generated when omitted. */
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  /** Hide the visible label but keep it for assistive tech. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  htmlFor,
  required,
  optional,
  error,
  hint,
  hideLabel,
  className = '',
  children,
}: FieldProps) {
  const autoId = useId();
  const controlId = htmlFor ?? autoId.replace(/:/g, '');
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-help`;
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') ||
    undefined;

  return (
    <div className={className}>
      <label
        htmlFor={controlId}
        className={`${labelClass} ${hideLabel ? 'sr-only' : ''}`}
      >
        {label}
        {required && (
          <span aria-hidden="true" className="text-red-500">
            {' '}
            *
          </span>
        )}
        {optional && (
          <span className="font-normal text-ink-muted">
            {' '}
            (Optional)
          </span>
        )}
      </label>
      <FieldContext.Provider
        value={{ controlId, errorId, hintId, describedBy, invalid: Boolean(error) }}
      >
        {children}
      </FieldContext.Provider>
      {error && (
        <p id={errorId} className={errorTextClass}>
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className={hintClass}>
          {hint}
        </p>
      )}
    </div>
  );
}
