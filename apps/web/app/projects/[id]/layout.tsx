'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FlaskConical,
  BarChart3,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { projectsApi } from '../../../lib/api-client';

const navItems = [
  {
    label: 'Overview',
    href: (id: string) => `/projects/${id}`,
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Test Runs',
    href: (id: string) => `/projects/${id}/runs`,
    icon: FlaskConical,
    exact: false,
  },
  {
    label: 'Reports',
    href: (id: string) => `/projects/${id}/reports`,
    icon: BarChart3,
    exact: false,
  },
  {
    label: 'Settings',
    href: (id: string) => `/projects/${id}/settings`,
    icon: Settings,
    exact: false,
  },
];

export default function ProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const projectId = params.id;
  const [projectName, setProjectName] = useState('Project');

  useEffect(() => {
    projectsApi.get(projectId).then((p) => setProjectName(p.name)).catch(() => {});
  }, [projectId]);

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container flex items-center h-14 gap-4">
          <Link
            href="/projects"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Projects
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">{projectName}</span>
        </div>
      </header>

      <div className="container flex gap-6 py-6">
        {/* Sidebar navigation */}
        <nav className="w-52 shrink-0">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const href = item.href(projectId);
              const isActive = item.exact
                ? pathname === href
                : pathname.startsWith(href);
              return (
                <li key={item.label}>
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Page content */}
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
