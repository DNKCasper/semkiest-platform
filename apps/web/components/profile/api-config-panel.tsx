'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { ProfileFormValues } from './profile-form';

interface APIConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for API/backend testing settings.
 */
export function APIConfigPanel({ control }: APIConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api-base-url">API base URL</Label>
        <p className="text-sm text-muted-foreground">
          Root URL for all API requests in this test suite
        </p>
        <Controller
          control={control}
          name="categories.api.apiBaseUrl"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="api-base-url"
                type="url"
                placeholder="https://api.example.com"
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

      <div className="space-y-2">
        <Label htmlFor="api-auth-method">Authentication method</Label>
        <p className="text-sm text-muted-foreground">
          How to authenticate requests made during API tests
        </p>
        <Controller
          control={control}
          name="categories.api.authMethod"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="api-auth-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="bearer">Bearer token</SelectItem>
                <SelectItem value="basic">Basic auth</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-timeout">
          Request timeout
          <span className="ml-1 text-xs text-muted-foreground">(seconds)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Maximum time to wait for an API response before failing
        </p>
        <Controller
          control={control}
          name="categories.api.requestTimeout"
          render={({ field, fieldState }) => (
            <>
              <Input
                id="api-timeout"
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
