import React from 'react';
import { controlClass, inputTone } from './styles';
import { useFieldControl } from './Field';

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ className = '', invalid, id, ...rest }: SelectProps) {
  const ctx = useFieldControl();
  const resolvedId = id ?? ctx?.controlId;
  const resolvedInvalid = invalid ?? ctx?.invalid;
  return (
    <select
      id={resolvedId}
      aria-invalid={resolvedInvalid || undefined}
      className={`${controlClass} ${inputTone(resolvedInvalid)} ${className}`}
      {...rest}
    />
  );
}
