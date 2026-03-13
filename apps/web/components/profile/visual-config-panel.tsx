'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { ProfileFormValues } from './profile-form';

interface VisualConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for visual/appearance testing settings.
 */
export function VisualConfigPanel({ control }: VisualConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="visual-baseline">Baseline comparison</Label>
        <p className="text-sm text-muted-foreground">
          How strictly to compare against the visual baseline
        </p>
        <Controller
          control={control}
          name="categories.visual.baselineComparison"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="visual-baseline">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lenient">
                  Lenient — allows minor pixel differences
                </SelectItem>
                <SelectItem value="strict">
                  Strict — exact pixel match required
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="visual-ignore-regions">
          Ignore regions
          <span className="ml-1 text-xs text-muted-foreground">(JSON array)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Specify screen regions to exclude from comparison, e.g.{' '}
          <code className="text-xs bg-muted px-1 rounded">
            {`[{"x":0,"y":0,"width":100,"height":50}]`}
          </code>
        </p>
        <Controller
          control={control}
          name="categories.visual.ignoreRegions"
          render={({ field, fieldState }) => (
            <>
              <Textarea
                id="visual-ignore-regions"
                rows={4}
                placeholder="[]"
                className="font-mono text-sm"
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

      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor="visual-dpr">Device pixel ratio handling</Label>
          <p className="text-sm text-muted-foreground">
            Normalise screenshots across different DPR screens
          </p>
        </div>
        <Controller
          control={control}
          name="categories.visual.devicePixelRatioHandling"
          render={({ field }) => (
            <Switch
              id="visual-dpr"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />
      </div>
    </div>
  );
}
