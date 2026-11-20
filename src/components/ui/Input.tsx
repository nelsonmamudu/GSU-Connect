import React from 'react';
import { inputClass, inputTone } from './styles';
import { useFieldControl } from './Field';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marks the control invalid; normally supplied by `Field`. */
  invalid?: boolean;
  /** Supplies `aria-describedby`; normally supplied by `Field`. */
  describedBy?: string;
  /** Leading icon, rendered left of the text. */
  leadingIcon?: React.ComponentType<{ className?: string }>;
  /** Trailing content (e.g. a show/hide password button). */
  trailing?: React.ReactNode;
  /** Extra classes for the wrapper, not the input. */
  wrapperClassName?: string;
}

export function Input({
  leadingIcon: Icon,
  trailing,
  wrapperClassName = '',
  className = '',
  id,
  invalid,
  describedBy,
  ...rest
}: InputProps) {
  const ctx = useFieldControl();
  const resolvedId = id ?? ctx?.controlId;
  const resolvedInvalid = invalid ?? ctx?.invalid;
  const resolvedDescribedBy = describedBy ?? ctx?.describedBy;
  const padding = Icon ? 'pl-10' : '';
  const trailingPad = trailing ? 'pr-12' : '';

  return (
    <div className={`relative ${wrapperClassName}`}>
      {Icon && (
        <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      )}
      <input
        id={resolvedId}
        aria-invalid={resolvedInvalid || undefined}
        aria-describedby={resolvedDescribedBy}
        className={`${inputClass} ${padding} ${trailingPad} ${inputTone(resolvedInvalid)} ${className}`}
        {...rest}
      />
      {trailing && <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>}
    </div>
  );
}
