'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Plus,
  Pencil,
  Trash2,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Settings2,
} from 'lucide-react';
import { profilesApi } from '../../../../lib/profiles-api-client';
import type { TestProfile, CreateProfileInput, UpdateProfileInput } from '../../../../types/profile';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../../components/ui/dialog';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { formatDate } from '../../../../lib/utils';

interface ProfileFormState {
  name: string;
  description: string;
  config: string; // JSON string
}

interface DialogState {
  isOpen: boolean;
  mode: 'create' | 'edit';
  profileId?: string;
}

export default function ProfilesPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;

  const [profiles, setProfiles] = useState<TestProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    mode: 'create',
  });

  const [formState, setFormState] = useState<ProfileFormState>({
    name: '',
    description: '',
    config: '{}',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    profileId: string;
    profileName: string;
  } | null>(null);

  // Load profiles
  useEffect(() => {
    loadProfiles();
  }, [projectId]);

  async function loadProfiles() {
    try {
      setLoading(true);
      setError(null);
      const response = await profilesApi.list(projectId);
      setProfiles(response.data || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load profiles';
      setError(message);
      console.error('Failed to load profiles:', err);
    } finally {
      setLoading(false);
    }
  }

  function openCreateDialog() {
    setDialogState({ isOpen: true, mode: 'create' });
    setFormState({ name: '', description: '', config: '{}' });
    setFormError(null);
  }

  function openEditDialog(profile: TestProfile) {
    const config = profile.config || profile.settings || {};
    setDialogState({ isOpen: true, mode: 'edit', profileId: profile.id });
    setFormState({
      name: profile.name,
      description: profile.description || '',
      config: JSON.stringify(config, null, 2),
    });
    setFormError(null);
  }

  function closeDialog() {
    setDialogState({ isOpen: false, mode: 'create' });
    setFormState({ name: '', description: '', config: '{}' });
    setFormError(null);
  }

  async function handleSaveProfile() {
    try {
      setFormError(null);
      setIsSubmitting(true);

      if (!formState.name.trim()) {
        setFormError('Profile name is required');
        return;
      }

      let parsedConfig: Record<string, unknown> = {};
      if (formState.config.trim()) {
        try {
          parsedConfig = JSON.parse(formState.config);
        } catch {
          setFormError('Invalid JSON in config field');
          return;
        }
      }

      if (dialogState.mode === 'create') {
        const input: CreateProfileInput = {
          name: formState.name.trim(),
          description: formState.description.trim() || undefined,
          categories: [],
          config: parsedConfig,
        };
        await profilesApi.create(projectId, input);
      } else {
        const input: UpdateProfileInput = {
          name: formState.name.trim(),
          description: formState.description.trim() || undefined,
          config: parsedConfig,
        };
        await profilesApi.update(projectId, dialogState.profileId!, input);
      }

      await loadProfiles();
      closeDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setFormError(message);
      console.error('Failed to save profile:', err);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDeleteProfile(profileId: string) {
    try {
      await profilesApi.delete(projectId, profileId);
      await loadProfiles();
      setDeleteConfirmation(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete profile';
      setError(message);
      console.error('Failed to delete profile:', err);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
          <div className="h-48 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="sm">
            <Link href={`/projects/${projectId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Test Profiles</h1>
            <p className="text-sm text-muted-foreground">
              Manage test configuration profiles for this project
            </p>
          </div>
        </div>

        <Dialog open={dialogState.isOpen} onOpenChange={(open) => {
          if (!open) closeDialog();
        }}>
          <DialogTrigger asChild>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              New Profile
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {dialogState.mode === 'create' ? 'Create Profile' : 'Edit Profile'}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Name field */}
              <div className="space-y-2">
                <Label htmlFor="name">Profile Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Staging Environment"
                  value={formState.name}
                  onChange={(e) =>
                    setFormState({ ...formState, name: e.target.value })
                  }
                />
              </div>

              {/* Description field */}
              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Input
                  id="description"
                  placeholder="e.g., Profile for staging environment testing"
                  value={formState.description}
                  onChange={(e) =>
                    setFormState({ ...formState, description: e.target.value })
                  }
                />
              </div>

              {/* Config field */}
              <div className="space-y-2">
                <Label htmlFor="config">JSON Configuration (Optional)</Label>
                <textarea
                  id="config"
                  placeholder='e.g., {"timeout": 30000, "retries": 3}'
                  value={formState.config}
                  onChange={(e) =>
                    setFormState({ ...formState, config: e.target.value })
                  }
                  className="w-full h-40 p-3 border border-input bg-background rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Error message */}
              {formError && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-destructive">{formError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => closeDialog()}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveProfile} disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {dialogState.mode === 'create' ? 'Create' : 'Update'} Profile
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-medium text-destructive">Error loading profiles</h3>
            <p className="text-sm text-destructive/80 mt-1">{error}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={loadProfiles}
              className="mt-2"
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!error && profiles.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-12 pb-12 text-center">
            <Settings2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-muted-foreground mb-2">
              No profiles yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first test profile to get started
            </p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create First Profile
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Profiles grid */}
      {!error && profiles.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((profile) => {
            const config = profile.config || profile.settings || {};
            const configKeys = Object.keys(config);

            return (
              <Card key={profile.id} className="flex flex-col">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base truncate">
                        {profile.name}
                      </CardTitle>
                      {profile.description && (
                        <CardDescription className="line-clamp-2">
                          {profile.description}
                        </CardDescription>
                      )}
                    </div>
                    {profile.isDefault && (
                      <Badge variant="default" className="flex-shrink-0">
                        Default
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 flex-1">
                  {/* Config summary */}
                  {configKeys.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        Configuration:
                      </p>
                      <div className="space-y-1">
                        {configKeys.slice(0, 3).map((key) => (
                          <div
                            key={key}
                            className="text-xs bg-muted p-2 rounded font-mono text-muted-foreground overflow-hidden text-ellipsis"
                          >
                            <span className="font-semibold">{key}:</span>{' '}
                            {JSON.stringify(config[key]).substring(0, 40)}
                            {JSON.stringify(config[key]).length > 40 ? '...' : ''}
                          </div>
                        ))}
                        {configKeys.length > 3 && (
                          <div className="text-xs text-muted-foreground">
                            +{configKeys.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  <div className="text-xs text-muted-foreground">
                    <p>Created: {formatDate(profile.createdAt)}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => openEditDialog(profile)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() =>
                        setDeleteConfirmation({
                          profileId: profile.id,
                          profileName: profile.name,
                        })
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirmation && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setDeleteConfirmation(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Profile</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to delete the profile{' '}
                <span className="font-semibold text-foreground">
                  "{deleteConfirmation.profileName}"
                </span>
                ? This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteConfirmation(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() =>
                    handleDeleteProfile(deleteConfirmation.profileId)
                  }
                >
                  Delete Profile
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
