'use client';

import * as React from 'react';
import {
  Play,
  ChevronDown,
  Info,
  Loader2,
  AlertCircle,
  Monitor,
  Eye,
  Zap,
  Accessibility,
  Shield,
  Globe,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import type { TestProfile, TriggerRunInput } from '../../types/run';

// ---------------------------------------------------------------------------
// Test category configuration
// ---------------------------------------------------------------------------

interface CategoryOption {
  key: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TEST_CATEGORIES: CategoryOption[] = [
  { key: 'ui', label: 'UI Functional', icon: <Monitor className="h-4 w-4" />, description: 'Page loads, navigation, form interactions' },
  { key: 'visual', label: 'Visual Regression', icon: <Eye className="h-4 w-4" />, description: 'Screenshot comparison and layout checks' },
  { key: 'performance', label: 'Performance', icon: <Zap className="h-4 w-4" />, description: 'Core Web Vitals, load times, resources' },
  { key: 'accessibility', label: 'Accessibility', icon: <Accessibility className="h-4 w-4" />, description: 'WCAG compliance, ARIA, keyboard nav' },
  { key: 'security', label: 'Security', icon: <Shield className="h-4 w-4" />, description: 'Headers, TLS, vulnerability scanning' },
  { key: 'api', label: 'API / Backend', icon: <Globe className="h-4 w-4" />, description: 'Endpoint contracts and error handling' },
];

/**
 * Map from UI category keys to the agent types sent to the coordinator.
 * Must stay in sync with CATEGORY_TO_AGENTS in coordinate.worker.ts.
 */
const CATEGORY_TO_AGENTS: Record<string, string[]> = {
  ui:            ['explorer', 'ui-functional'],
  visual:        ['visual-regression'],
  performance:   ['performance'],
  accessibility: ['accessibility'],
  security:      ['security'],
  api:           ['api'],
};

/** Derive initially enabled categories from a profile's settings/categories. */
function getProfileCategories(profile: TestProfile): Set<string> {
  const enabled = new Set<string>();

  // If profile.categories has values, use those
  if (profile.categories && profile.categories.length > 0) {
    for (const cat of profile.categories) {
      const lower = cat.toLowerCase().replace(/\s+/g, '');
      // Normalise common category names
      if (lower.includes('ui') || lower.includes('functional')) enabled.add('ui');
      else if (lower.includes('visual') || lower.includes('appearance')) enabled.add('visual');
      else if (lower.includes('performance') || lower.includes('load')) enabled.add('performance');
      else if (lower.includes('accessibility') || lower.includes('a11y')) enabled.add('accessibility');
      else if (lower.includes('security')) enabled.add('security');
      else if (lower.includes('api') || lower.includes('backend')) enabled.add('api');
    }
  }

  // Also check profile.settings for { ui: { enabled: true } } format
  if (profile.settings) {
    for (const key of Object.keys(CATEGORY_TO_AGENTS)) {
      const val = profile.settings[key] as Record<string, unknown> | undefined;
      if (val && val.enabled === true) {
        enabled.add(key);
      }
    }
  }

  // Default to UI if nothing is enabled
  if (enabled.size === 0) {
    enabled.add('ui');
  }

  return enabled;
}

// ---------------------------------------------------------------------------
// Profile detail card shown in the confirmation step
// ---------------------------------------------------------------------------

function ProfileDetail({ profile }: { profile: TestProfile }) {
  return (
    <Card className="border-primary/40">
      <CardContent className="pt-4 space-y-3">
        <div>
          <p className="text-sm font-medium">{profile.name}</p>
          {profile.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{profile.description}</p>
          )}
        </div>

        {profile.categories.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Categories</p>
            <div className="flex flex-wrap gap-1.5">
              {profile.categories.map((cat) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {profile.isDefault && (
          <Badge variant="outline" className="text-xs">
            Default profile
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Test type toggle grid
// ---------------------------------------------------------------------------

interface TestTypeSelectorProps {
  enabledCategories: Set<string>;
  onToggle: (key: string) => void;
}

function TestTypeSelector({ enabledCategories, onToggle }: TestTypeSelectorProps) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">
        Test Types to Run
      </p>
      <p className="text-xs text-muted-foreground mb-3">
        Toggle the test categories for this run. These are pre-configured from your profile but can be adjusted per run.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {TEST_CATEGORIES.map((cat) => {
          const isEnabled = enabledCategories.has(cat.key);
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => onToggle(cat.key)}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border p-3 text-left transition-all',
                isEnabled
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-muted hover:border-muted-foreground/30 opacity-60',
              )}
            >
              <span className={cn(
                'mt-0.5 shrink-0',
                isEnabled ? 'text-primary' : 'text-muted-foreground',
              )}>
                {cat.icon}
              </span>
              <div className="min-w-0">
                <p className={cn(
                  'text-xs font-medium',
                  isEnabled ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {cat.label}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                  {cat.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirmation dialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  profile: TestProfile | null;
  projectName?: string;
  isSubmitting: boolean;
  error: string | null;
  enabledCategories: Set<string>;
  onToggleCategory: (key: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  profile,
  projectName,
  isSubmitting,
  error,
  enabledCategories,
  onToggleCategory,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const enabledCount = enabledCategories.size;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Test Run</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You are about to start a test run
            {projectName ? (
              <>
                {' '}for <span className="font-medium text-foreground">{projectName}</span>
              </>
            ) : null}
            . Select which test types to include, then confirm.
          </p>

          {profile && <ProfileDetail profile={profile} />}

          <TestTypeSelector
            enabledCategories={enabledCategories}
            onToggle={onToggleCategory}
          />

          {enabledCount === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              Select at least one test type to start a run.
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              disabled={isSubmitting || enabledCount === 0}
              className="gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Run ({enabledCount} type{enabledCount !== 1 ? 's' : ''})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export interface RunTriggerProps {
  profiles: TestProfile[];
  projectName?: string;
  defaultProfileId?: string;
  isLoadingProfiles?: boolean;
  onTrigger: (input: TriggerRunInput) => Promise<void>;
  className?: string;
}

/**
 * Run trigger UI: profile selection dropdown + test type toggles + confirmation dialog.
 *
 * - Shows all configured profiles in a dropdown
 * - Profile selection shows details inline
 * - Confirmation dialog lets the user adjust which test types to run
 * - Quick-run button uses the default / last-used profile
 */
export function RunTrigger({
  profiles,
  projectName,
  defaultProfileId,
  isLoadingProfiles = false,
  onTrigger,
  className,
}: RunTriggerProps) {
  const defaultProfile =
    profiles.find((p) => p.id === defaultProfileId) ??
    profiles.find((p) => p.isDefault) ??
    profiles[0] ??
    null;

  const [selectedProfileId, setSelectedProfileId] = React.useState<string>(
    defaultProfile?.id ?? '',
  );
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [enabledCategories, setEnabledCategories] = React.useState<Set<string>>(new Set(['ui']));

  const selectedProfile =
    profiles.find((p) => p.id === selectedProfileId) ?? null;

  // When profile changes, reset categories from profile config
  React.useEffect(() => {
    if (selectedProfile) {
      setEnabledCategories(getProfileCategories(selectedProfile));
    }
  }, [selectedProfile]);

  const handleToggleCategory = React.useCallback((key: string) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  /** Build the agents array from enabled categories. */
  const buildAgentsList = React.useCallback((): string[] => {
    const agents: string[] = [];
    for (const cat of enabledCategories) {
      const mapped = CATEGORY_TO_AGENTS[cat];
      if (mapped) agents.push(...mapped);
    }
    return agents;
  }, [enabledCategories]);

  const handleOpenConfirm = () => {
    if (!selectedProfileId) return;
    setError(null);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!selectedProfileId || enabledCategories.size === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onTrigger({ profileId: selectedProfileId, agents: buildAgentsList() });
      setShowConfirm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickRun = async () => {
    if (!defaultProfile) return;
    setSelectedProfileId(defaultProfile.id);
    setError(null);
    setIsSubmitting(true);
    try {
      const cats = getProfileCategories(defaultProfile);
      const agents: string[] = [];
      for (const cat of cats) {
        const mapped = CATEGORY_TO_AGENTS[cat];
        if (mapped) agents.push(...mapped);
      }
      await onTrigger({ profileId: defaultProfile.id, agents });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Profile selector */}
      <div className="space-y-1.5">
        <Label htmlFor="profile-select">Test Profile</Label>
        <Select
          value={selectedProfileId}
          onValueChange={setSelectedProfileId}
          disabled={isLoadingProfiles || profiles.length === 0}
        >
          <SelectTrigger id="profile-select" className="w-full sm:w-72">
            <SelectValue
              placeholder={
                isLoadingProfiles
                  ? 'Loading profiles\u2026'
                  : profiles.length === 0
                    ? 'No profiles configured'
                    : 'Select a profile'
              }
            />
          </SelectTrigger>
          <SelectContent>
            {profiles.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex items-center gap-2">
                  {p.name}
                  {p.isDefault && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                      default
                    </Badge>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Profile detail preview */}
      {selectedProfile && (
        <div className="space-y-1.5">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            Profile details
          </p>
          <ProfileDetail profile={selectedProfile} />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleOpenConfirm}
          disabled={!selectedProfileId || isLoadingProfiles || isSubmitting}
          className="gap-2"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          Run Test
          <ChevronDown className="h-4 w-4 opacity-70" />
        </Button>

        {defaultProfile && defaultProfile.id !== selectedProfileId && (
          <Button
            variant="outline"
            onClick={handleQuickRun}
            disabled={isSubmitting}
            className="gap-2"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Quick Run ({defaultProfile.name})
          </Button>
        )}
      </div>

      {/* Inline error */}
      {error && !showConfirm && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Confirmation dialog with test type selection */}
      <ConfirmDialog
        open={showConfirm}
        profile={selectedProfile}
        projectName={projectName}
        isSubmitting={isSubmitting}
        error={error}
        enabledCategories={enabledCategories}
        onToggleCategory={handleToggleCategory}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
