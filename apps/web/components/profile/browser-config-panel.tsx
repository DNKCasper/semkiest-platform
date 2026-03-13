'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { cn } from '../../lib/utils';
import type { BrowserType, ViewportType } from '../../types/profile';
import type { ProfileFormValues } from './profile-form';

interface BrowserConfigPanelProps {
  control: Control<ProfileFormValues>;
}

const BROWSERS: { value: BrowserType; label: string }[] = [
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'safari', label: 'Safari' },
  { value: 'edge', label: 'Edge' },
];

const VIEWPORTS: { value: ViewportType; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'custom', label: 'Custom' },
];

function MultiToggleGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  const toggle = (item: T) => {
    if (value.includes(item)) {
      onChange(value.filter((v) => v !== item));
    } else {
      onChange([...value, item]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={cn(
            'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value.includes(opt.value)
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Configuration panel for cross-browser compatibility settings.
 */
export function BrowserConfigPanel({ control }: BrowserConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Selected browsers</Label>
        <p className="text-sm text-muted-foreground">
          Choose which browsers to run tests in
        </p>
        <Controller
          control={control}
          name="categories.browser.browsers"
          render={({ field, fieldState }) => (
            <>
              <MultiToggleGroup
                options={BROWSERS}
                value={field.value}
                onChange={field.onChange}
              />
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label>Selected viewports</Label>
        <p className="text-sm text-muted-foreground">
          Choose which viewport sizes to test
        </p>
        <Controller
          control={control}
          name="categories.browser.viewports"
          render={({ field, fieldState }) => (
            <>
              <MultiToggleGroup
                options={VIEWPORTS}
                value={field.value}
                onChange={field.onChange}
              />
              {fieldState.error && (
                <p className="text-sm text-destructive">
                  {fieldState.error.message}
                </p>
              )}
            </>
          )}
        />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="browser-parallel">Parallel execution</Label>
          <p className="text-sm text-muted-foreground">
            Run browser tests simultaneously to speed up execution
          </p>
        </div>
        <Controller
          control={control}
          name="categories.browser.parallelExecution"
          render={({ field }) => (
            <Switch
              id="browser-parallel"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>
    </div>
  );
}
