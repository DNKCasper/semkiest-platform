'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import type { ProfileFormValues } from './profile-form';

interface PerformanceConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for performance testing settings.
 */
export function PerformanceConfigPanel({ control }: PerformanceConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="perf-threshold">
          Performance threshold
          <span className="ml-1 text-xs text-muted-foreground">(ms)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Maximum acceptable page load or interaction time
        </p>
        <Controller
          control={control}
          name="categories.performance.performanceThreshold"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="perf-threshold"
                type="number"
                min={0}
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
        <Label htmlFor="perf-memory">
          Memory threshold
          <span className="ml-1 text-xs text-muted-foreground">(MB)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Maximum acceptable heap memory usage
        </p>
        <Controller
          control={control}
          name="categories.performance.memoryThreshold"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="perf-memory"
                type="number"
                min={0}
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
        <Label htmlFor="perf-cpu">
          CPU threshold
          <span className="ml-1 text-xs text-muted-foreground">(%)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Maximum acceptable CPU utilisation (0–100)
        </p>
        <Controller
          control={control}
          name="categories.performance.cpuThreshold"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="perf-cpu"
                type="number"
                min={0}
                max={100}
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
