'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { projectsApi } from '../../../../lib/api-client';
import type { Project, UpdateProjectInput } from '../../../../types/project';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../../../components/ui/dialog';

export default function ProjectSettingsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');

  useEffect(() => {
    projectsApi
      .get(params.id)
      .then((p) => {
        setProject(p);
        setName(p.name);
        setDescription(p.description ?? '');
        setUrl(p.url ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setSaveMessage(null);

    const input: UpdateProjectInput = {};
    if (name.trim() !== project?.name) input.name = name.trim();
    if (description.trim() !== (project?.description ?? ''))
      input.description = description.trim() || null;
    if (url.trim() !== (project?.url ?? ''))
      input.url = url.trim() || null;

    if (Object.keys(input).length === 0) {
      setSaveMessage('No changes to save.');
      setSaving(false);
      return;
    }

    try {
      const updated = await projectsApi.update(params.id, input);
      setProject(updated);
      setSaveMessage('Project updated successfully.');
    } catch (err: unknown) {
      setSaveMessage(err instanceof Error ? err.message : 'Failed to update project');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await projectsApi.delete(params.id);
      router.push('/projects');
    } catch {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-64 bg-muted animate-pulse rounded-lg" />
      </div>
    );
  }

  if (!project) {
    return <p className="text-destructive">Project not found.</p>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage project configuration.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">General</CardTitle>
          <CardDescription>Basic project information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="settings-name">Project Name</Label>
            <Input
              id="settings-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-url">Target URL</Label>
            <Input
              id="settings-url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="settings-desc">Description</Label>
            <Input
              id="settings-desc"
              placeholder="Optional description..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            {saveMessage && (
              <span className="text-sm text-muted-foreground">{saveMessage}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete this project and all its data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-4 w-4 mr-1.5" />
                Delete Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete Project</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete <strong>{project.name}</strong>?
                  This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Project'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
