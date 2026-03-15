'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Plus, Search, ExternalLink, FolderOpen } from 'lucide-react';
import { projectsApi } from '../../lib/api-client';
import type { Project, CreateProjectInput } from '../../types/project';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import { formatDate } from '../../lib/utils';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newUrl, setNewUrl] = useState('');

  const loadProjects = useCallback(() => {
    setLoading(true);
    projectsApi
      .list(search ? { name: search } : {})
      .then((res) => {
        setProjects(res.data);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load projects');
      })
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);

    const input: CreateProjectInput = {
      name: newName.trim(),
    };
    if (newDescription.trim()) input.description = newDescription.trim();
    if (newUrl.trim()) input.url = newUrl.trim();

    try {
      await projectsApi.create(input);
      setDialogOpen(false);
      setNewName('');
      setNewDescription('');
      setNewUrl('');
      loadProjects();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container flex items-center justify-between h-14">
          <span className="font-semibold text-lg">SemkiEst</span>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="container py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
            <p className="text-muted-foreground mt-1">
              Manage your testing projects.
            </p>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1.5" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Create Project</DialogTitle>
                <DialogDescription>
                  Add a new project to start running automated tests.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project Name</Label>
                  <Input
                    id="project-name"
                    placeholder="My Web App"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreate();
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-url">Target URL</Label>
                  <Input
                    id="project-url"
                    placeholder="https://example.com"
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    The URL of the application you want to test.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-desc">Description</Label>
                  <Input
                    id="project-desc"
                    placeholder="Optional description..."
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
                {createError && (
                  <p className="text-sm text-destructive">{createError}</p>
                )}
              </div>
              <DialogFooter>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Loading projects...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && projects.length === 0 && (
          <Card>
            <CardContent className="py-16 text-center space-y-4">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <div>
                <p className="font-medium">No projects yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create your first project to start running automated tests.
                </p>
              </div>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Project
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{project.name}</CardTitle>
                    <Badge
                      variant={
                        project.status === 'ACTIVE' ? 'default' : 'secondary'
                      }
                    >
                      {project.status.toLowerCase()}
                    </Badge>
                  </div>
                  {project.description && (
                    <CardDescription className="line-clamp-2">
                      {project.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  {project.url && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-2">
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{project.url}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created</span>
                    <span>{formatDate(project.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
