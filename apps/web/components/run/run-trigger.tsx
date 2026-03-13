'use client';

import * as React from 'react';
import { Play, ChevronDown, Info, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Card, CardContent } from '../ui/card';
import { cn } from '../../lib/utils';
import type { TestProfile, TriggerRunInput } from '../../types/run';

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

        {Object.keys(profile.settings).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Settings</p>
            <div className="rounded-md bg-muted p-2 text-xs font-mono space-y-0.5">
              {Object.entries(profile.settings).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-muted-foreground">{k}:</span>
                  <span>{String(v)}</span>
                </div>
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
// Confirmation dialog
// ---------------------------------------------------------------------------

interface ConfirmDialogProps {
  open: boolean;
  profile: TestProfile | null;
  projectName?: string;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  profile,
  projectName,
  isSubmitting,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-lg">
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
            {' '}using the profile below. Confirm to proceed.
          </p>

          {profile && <ProfileDetail profile={profile} />}

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
            <Button onClick={onConfirm} disabled={isSubmitting} className="gap-2">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Start Run
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
 * Run trigger UI: profile selection dropdown + confirmation dialog before starting.
 *
 * - Shows all configured profiles in a dropdown
 * - Hovering / selecting a profile shows its details inline
 * - Confirmation dialog before actually starting the run
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

  const selectedProfile =
    profiles.find((p) => p.id === selectedProfileId) ?? null;

  const handleOpenConfirm = () => {
    if (!selectedProfileId) return;
    setError(null);
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    if (!selectedProfileId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onTrigger({ profileId: selectedProfileId });
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
      await onTrigger({ profileId: defaultProfile.id });
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
                  ? 'Loading profiles…'
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

      {/* Confirmation dialog */}
      <ConfirmDialog
        open={showConfirm}
        profile={selectedProfile}
        projectName={projectName}
        isSubmitting={isSubmitting}
        error={error}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
