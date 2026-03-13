import * as React from 'react';
import { cn } from '../../lib/utils';

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <label
        htmlFor={id}
        className="flex items-center gap-2 cursor-pointer select-none"
      >
        <input
          type="checkbox"
          id={id}
          ref={ref}
          className={cn(
            'h-4 w-4 rounded border border-input bg-background text-primary',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'accent-primary',
            className,
          )}
          {...props}
        />
        {label && <span className="text-sm leading-none">{label}</span>}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
