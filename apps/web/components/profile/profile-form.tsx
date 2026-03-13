'use client';

import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Switch } from '../ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { CategoryPanels } from './category-panels';
import type { TestProfile, CreateProfileInput } from '../../types/profile';
import { defaultProfileCategories } from '../../types/profile';

// ─── Zod Schema ─────────────────────────────────────────────────────────────

const uiConfigSchema = z.object({
  enabled: z.boolean(),
  retryOnFailure: z.boolean(),
  retryCount: z.number().int().min(1).max(5),
  timeoutPerTest: z.number().int().min(1),
});

const visualConfigSchema = z.object({
  enabled: z.boolean(),
  baselineComparison: z.enum(['strict', 'lenient']),
  ignoreRegions: z.string(),
  devicePixelRatioHandling: z.boolean(),
});

const browserConfigSchema = z.object({
  enabled: z.boolean(),
  browsers: z.array(z.enum(['chrome', 'firefox', 'safari', 'edge'])),
  viewports: z.array(z.enum(['mobile', 'tablet', 'desktop', 'custom'])),
  parallelExecution: z.boolean(),
});

const performanceConfigSchema = z.object({
  enabled: z.boolean(),
  performanceThreshold: z.number().min(0),
  memoryThreshold: z.number().min(0),
  cpuThreshold: z.number().min(0).max(100),
});

const loadConfigSchema = z.object({
  enabled: z.boolean(),
  concurrentUsers: z.number().int().min(1),
  rampUpTime: z.number().min(0),
  duration: z.number().min(1),
  endpoints: z.string(),
});

const accessibilityConfigSchema = z.object({
  enabled: z.boolean(),
  wcagLevel: z.enum(['A', 'AA', 'AAA']),
  includeExcludeRules: z.string(),
});

const securityConfigSchema = z.object({
  enabled: z.boolean(),
  scanningType: z.enum(['OWASP', 'CWE']),
  severityFilter: z.array(z.enum(['critical', 'high', 'medium', 'low'])),
});

const apiConfigSchema = z.object({
  enabled: z.boolean(),
  apiBaseUrl: z.string(),
  authMethod: z.enum(['none', 'bearer', 'basic']),
  requestTimeout: z.number().int().min(1),
});

export const profileFormSchema = z.object({
  name: z.string().min(1, 'Profile name is required'),
  description: z.string().optional(),
  profileType: z.enum(['smoke', 'regression', 'performance']),
  isTemplate: z.boolean(),
  categories: z.object({
    ui: uiConfigSchema,
    visual: visualConfigSchema,
    browser: browserConfigSchema,
    performance: performanceConfigSchema,
    load: loadConfigSchema,
    accessibility: accessibilityConfigSchema,
    security: securityConfigSchema,
    api: apiConfigSchema,
  }),
});

export type ProfileFormValues = z.infer<typeof profileFormSchema>;

// ─── Category Labels ─────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<keyof ProfileFormValues['categories'], string> = {
  ui: 'UI functional',
  visual: 'Visual',
  browser: 'Cross-browser',
  performance: 'Performance',
  load: 'Load testing',
  accessibility: 'Accessibility',
  security: 'Security',
  api: 'API testing',
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface ProfileFormProps {
  projectId: string;
  initialData?: TestProfile;
  onSubmit: (data: CreateProfileInput) => Promise<void>;
  onCancel: () => void;
}

// ─── Summary ─────────────────────────────────────────────────────────────────

function ProfileSummary({ values }: { values: ProfileFormValues }) {
  const enabledCategories = (
    Object.keys(values.categories) as (keyof typeof values.categories)[]
  ).filter((key) => values.categories[key].enabled);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span className="text-muted-foreground">Name</span>
        <span className="font-medium">{values.name || '—'}</span>
        <span className="text-muted-foreground">Type</span>
        <span className="font-medium capitalize">{values.profileType}</span>
        <span className="text-muted-foreground">Template</span>
        <span className="font-medium">{values.isTemplate ? 'Yes' : 'No'}</span>
      </div>
      <div>
        <p className="mb-2 text-muted-foreground">Enabled categories</p>
        {enabledCategories.length === 0 ? (
          <p className="text-muted-foreground italic">None selected</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {enabledCategories.map((key) => (
              <Badge key={key} variant="secondary">
                {CATEGORY_LABELS[key]}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Create / edit form for a test profile.
 */
export function ProfileForm({
  projectId: _projectId,
  initialData,
  onSubmit,
  onCancel,
}: ProfileFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: initialData
      ? {
          name: initialData.name,
          description: initialData.description ?? '',
          profileType: initialData.profileType,
          isTemplate: initialData.isTemplate,
          categories: initialData.categories,
        }
      : {
          name: '',
          description: '',
          profileType: 'smoke',
          isTemplate: false,
          categories: defaultProfileCategories,
        },
  });

  const formValues = watch();

  const handleFormSubmit = async (values: ProfileFormValues) => {
    setIsSubmitting(true);
    try {
      await onSubmit({
        name: values.name,
        description: values.description,
        profileType: values.profileType,
        isTemplate: values.isTemplate,
        categories: values.categories,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-8">
      {/* ── Profile Metadata ── */}
      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="profile-name">
              Profile name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="profile-name"
              placeholder="e.g. Smoke test — production"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-description">Description</Label>
            <Textarea
              id="profile-description"
              placeholder="Briefly describe the purpose of this profile"
              rows={3}
              {...register('description')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="profile-type">Profile type</Label>
            <Controller
              control={control}
              name="profileType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="profile-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="smoke">Smoke test</SelectItem>
                    <SelectItem value="regression">Full regression</SelectItem>
                    <SelectItem value="performance">
                      Performance focus
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Save as template</p>
              <p className="text-sm text-muted-foreground">
                Make this profile available as a starting point for other
                projects in your organisation
              </p>
            </div>
            <Controller
              control={control}
              name="isTemplate"
              render={({ field }) => (
                <Switch
                  id="profile-is-template"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Category Configuration ── */}
      <CategoryPanels control={control} />

      {/* ── Preview ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Configuration summary</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((prev) => !prev)}
          >
            {showPreview ? 'Hide preview' : 'Show preview'}
          </Button>
        </CardHeader>
        {showPreview && (
          <CardContent>
            <ProfileSummary values={formValues} />
          </CardContent>
        )}
      </Card>

      {/* ── Actions ── */}
      <div className="flex items-center justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? 'Saving…'
            : initialData
              ? 'Save changes'
              : 'Create profile'}
        </Button>
      </div>
    </form>
  );
}
