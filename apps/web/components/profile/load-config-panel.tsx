'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import type { ProfileFormValues } from './profile-form';

interface LoadConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for load/stress testing settings.
 */
export function LoadConfigPanel({ control }: LoadConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="load-users">Concurrent users</Label>
        <p className="text-sm text-muted-foreground">
          Number of virtual users to simulate simultaneously
        </p>
        <Controller
          control={control}
          name="categories.load.concurrentUsers"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="load-users"
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

      <div className="space-y-2">
        <Label htmlFor="load-ramp">
          Ramp-up time
          <span className="ml-1 text-xs text-muted-foreground">(seconds)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Time to gradually increase load to the target concurrent users
        </p>
        <Controller
          control={control}
          name="categories.load.rampUpTime"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="load-ramp"
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
        <Label htmlFor="load-duration">
          Duration
          <span className="ml-1 text-xs text-muted-foreground">(seconds)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Total duration of the load test
        </p>
        <Controller
          control={control}
          name="categories.load.duration"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="load-duration"
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

      <div className="space-y-2">
        <Label htmlFor="load-endpoints">
          Load test endpoints
        </Label>
        <p className="text-sm text-muted-foreground">
          One URL per line. These endpoints will be targeted during the load test.
        </p>
        <Controller
          control={control}
          name="categories.load.endpoints"
          render={({ field, fieldState }) => (
            <>
              <Textarea
                id="load-endpoints"
                rows={4}
                placeholder={'https://example.com/api/resource\nhttps://example.com/page'}
                {...field}
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
