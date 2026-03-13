import Link from 'next/link';
import { BarChart3, FlaskConical, ArrowRight } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';

interface ProjectOverviewPageProps {
  params: { id: string };
}

/** Basic project overview page. */
export default function ProjectOverviewPage({ params }: ProjectOverviewPageProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Overview</h1>
        <p className="text-muted-foreground mt-1">
          View test runs, reports, and project settings.
        </p>
      </div>

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
              <Link href={`/projects/${params.id}/runs`}>
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
              <Link href={`/projects/${params.id}/reports`}>
                View Reports <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
