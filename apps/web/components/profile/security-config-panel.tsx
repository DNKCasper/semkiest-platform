'use client';

import { Controller, type Control } from 'react-hook-form';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import type { SeverityLevel } from '../../types/profile';
import type { ProfileFormValues } from './profile-form';

interface SecurityConfigPanelProps {
  control: Control<ProfileFormValues>;
}

const SEVERITY_LEVELS: { value: SeverityLevel; label: string; color: string }[] =
  [
    { value: 'critical', label: 'Critical', color: 'text-red-600' },
    { value: 'high', label: 'High', color: 'text-orange-600' },
    { value: 'medium', label: 'Medium', color: 'text-yellow-600' },
    { value: 'low', label: 'Low', color: 'text-blue-600' },
  ];

/**
 * Configuration panel for security testing settings.
 */
export function SecurityConfigPanel({ control }: SecurityConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sec-scan-type">Security scanning type</Label>
        <p className="text-sm text-muted-foreground">
          Standard to use when identifying and classifying vulnerabilities
        </p>
        <Controller
          control={control}
          name="categories.security.scanningType"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="sec-scan-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWASP">
                  OWASP — Open Web Application Security Project
                </SelectItem>
                <SelectItem value="CWE">
                  CWE — Common Weakness Enumeration
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="space-y-2">
        <Label>Severity filter</Label>
        <p className="text-sm text-muted-foreground">
          Only report findings at or above selected severity levels
        </p>
        <Controller
          control={control}
          name="categories.security.severityFilter"
          render={({ field, fieldState }) => {
            const toggle = (level: SeverityLevel) => {
              if (field.value.includes(level)) {
                field.onChange(field.value.filter((v) => v !== level));
              } else {
                field.onChange([...field.value, level]);
              }
            };

            return (
              <>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_LEVELS.map(({ value, label, color }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggle(value)}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        field.value.includes(value)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background hover:bg-accent',
                        !field.value.includes(value) && color,
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {fieldState.error && (
                  <p className="text-sm text-destructive">
                    {fieldState.error.message}
                  </p>
                )}
              </>
            );
          }}
        />
      </div>
    </div>
  );
}
