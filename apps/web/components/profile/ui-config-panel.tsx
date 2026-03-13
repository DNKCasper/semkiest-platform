'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import type { ProfileFormValues } from './profile-form';

interface UIConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for UI functional testing settings.
 */
export function UIConfigPanel({ control }: UIConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="ui-retry-on-failure">Retry on failure</Label>
          <p className="text-sm text-muted-foreground">
            Automatically retry failed test cases
          </p>
        </div>
        <Controller
          control={control}
          name="categories.ui.retryOnFailure"
          render={({ field }) => (
            <Switch
              id="ui-retry-on-failure"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ui-retry-count">
          Retry count
          <span className="ml-1 text-xs text-muted-foreground">(1–5)</span>
        </Label>
        <Controller
          control={control}
          name="categories.ui.retryCount"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="ui-retry-count"
                type="number"
                min={1}
                max={5}
                {...field}
                onChange={(e) => field.onChange(Number(e.target.value))}
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
        <Label htmlFor="ui-timeout">
          Timeout per test
          <span className="ml-1 text-xs text-muted-foreground">(seconds)</span>
        </Label>
        <Controller
          control={control}
          name="categories.ui.timeoutPerTest"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="ui-timeout"
                type="number"
                min={1}
                {...field}
                onChange={(e) => field.onChange(Number(e.target.value))}
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
    </div>
  );
}
