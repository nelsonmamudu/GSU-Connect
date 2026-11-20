import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { focusRing } from './styles';

export interface StepperStep {
  key: string | number;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  current: string | number;
  /** Called when a completed step is tapped to go back to it. */
  onSelect?: (key: string | number) => void;
  label?: string;
  className?: string;
}

export function Stepper({ steps, current, onSelect, label, className = '' }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === current);
  return (
    <div className={className}>
      <ol className="flex items-center gap-2" aria-label={label}>
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <React.Fragment key={step.key}>
              <li>
                <button
                  type="button"
                  onClick={() => {
                    if (done && onSelect) onSelect(step.key);
                  }}
                  disabled={!done}
                  aria-current={active ? 'step' : undefined}
                  className={`flex items-center gap-2 rounded-xl px-1.5 py-1 min-h-[44px] transition-colors ${focusRing} ${
                    done ? 'cursor-pointer' : 'cursor-default'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums border shrink-0 ${
                      done
                        ? 'bg-emerald-700 border-emerald-700 text-white'
                        : active
                          ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400'
                          : 'border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </span>
                  <span
                    className={`text-xs font-semibold whitespace-nowrap ${
                      active
                        ? 'text-slate-900 dark:text-slate-100'
                        : done
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                </button>
              </li>
              {i < steps.length - 1 && (
                <li className="h-px flex-1 bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </div>
  );
}
