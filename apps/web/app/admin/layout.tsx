import Link from 'next/link';
import { BarChart3, ChevronLeft } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
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
          <span className="text-sm font-medium flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            Admin
          </span>
        </div>
      </header>

      <div className="container py-6">{children}</div>
    </div>
  );
}
