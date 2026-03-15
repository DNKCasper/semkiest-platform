'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  BarChart3,
  FlaskConical,
  ArrowRight,
  ExternalLink,
  Calendar,
  Globe,
} from 'lucide-react';
import { projectsApi } from '../../../lib/api-client';
import type { Project } from '../../../types/project';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { formatDate } from '../../../lib/utils';

export default function ProjectOverviewPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    projectsApi
      .get(params.id)
      .then((p) => {
        setProject(p);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load project');
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Project Not Found</h1>
        <p className="text-destructive">{error ?? 'Could not load this project.'}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/projects">Back to Projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant={project.status === 'ACTIVE' ? 'default' : 'secondary'}>
              {project.status.toLowerCase()}
            </Badge>
          </div>
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}/settings`}>Settings</Link>
        </Button>
      </div>

      {/* Project info cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {project.url && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Globe className="h-4 w-4" />
                Target URL
              </div>
              <a
                href={project.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
              >
                {project.url}
                <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Created
            </div>
            <p className="text-sm font-medium">{formatDate(project.createdAt)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Calendar className="h-4 w-4" />
              Last Updated
            </div>
            <p className="text-sm font-medium">{formatDate(project.updatedAt)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4" />
              Test Runs
            </CardTitle>
            <CardDescription>
              View and manage automated test run history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.id}/runs`}>
                View Test Runs <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4" />
              Reports
            </CardTitle>
            <CardDescription>
              Generate, download, and schedule reports.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${project.id}/reports`}>
                View Reports <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
