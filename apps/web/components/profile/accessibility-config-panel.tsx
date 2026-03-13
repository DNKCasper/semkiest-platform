'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type { ProfileFormValues } from './profile-form';

interface AccessibilityConfigPanelProps {
  control: Control<ProfileFormValues>;
}

/**
 * Configuration panel for accessibility testing settings.
 */
export function AccessibilityConfigPanel({
  control,
}: AccessibilityConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="a11y-wcag">WCAG conformance level</Label>
        <p className="text-sm text-muted-foreground">
          The Web Content Accessibility Guidelines level to enforce
        </p>
        <Controller
          control={control}
          name="categories.accessibility.wcagLevel"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="a11y-wcag">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Level A — minimum compliance</SelectItem>
                <SelectItem value="AA">
                  Level AA — standard compliance (recommended)
                </SelectItem>
                <SelectItem value="AAA">
                  Level AAA — highest compliance
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="a11y-rules">
          Include / exclude rules
          <span className="ml-1 text-xs text-muted-foreground">(JSON)</span>
        </Label>
        <p className="text-sm text-muted-foreground">
          Override which axe-core rules to include or exclude, e.g.{' '}
          <code className="text-xs bg-muted px-1 rounded">
            {`{"include":["color-contrast"],"exclude":["aria-required-attr"]}`}
          </code>
        </p>
        <Controller
          control={control}
          name="categories.accessibility.includeExcludeRules"
          render={({ field, fieldState }) => (
            <>
              <Textarea
                id="a11y-rules"
                rows={4}
                placeholder="{}"
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
    </div>
  );
}
