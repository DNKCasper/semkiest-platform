'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Eye, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import type { ReportFormat, ReportType, ReportCustomization } from '../../types/report';

export interface ExportButtonProps {
  projectId: string;
  reportType: ReportType;
  customization: ReportCustomization;
  /** Called when user selects "View in Dashboard" */
  onViewDashboard: (
    projectId: string,
    type: ReportType,
    customization: ReportCustomization,
  ) => Promise<void>;
  /** Called when user selects "Download Excel" */
  onDownloadExcel: (
    projectId: string,
    type: ReportType,
    customization: ReportCustomization,
  ) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

/**
 * Split button for generating reports in either dashboard view or Excel download format.
 */
export function ExportButton({
  projectId,
  reportType,
  customization,
  onViewDashboard,
  onDownloadExcel,
  disabled = false,
  className,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ReportFormat | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  async function handleAction(format: ReportFormat) {
    setOpen(false);
    setLoading(format);
    try {
      if (format === 'dashboard') {
        await onViewDashboard(projectId, reportType, customization);
      } else {
        await onDownloadExcel(projectId, reportType, customization);
      }
    } finally {
      setLoading(null);
    }
  }

  const isLoading = loading !== null;

  return (
    <div ref={menuRef} className={cn('relative inline-flex', className)}>
      {/* Primary action: generate report */}
      <Button
        onClick={() => handleAction('dashboard')}
        disabled={disabled || isLoading}
        className="rounded-r-none border-r-0"
      >
        {loading === 'dashboard' ? (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        ) : (
          <Eye className="mr-1.5 h-4 w-4" />
        )}
        Generate Report
      </Button>

      {/* Dropdown toggle */}
      <Button
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled || isLoading}
        className="rounded-l-none px-2"
        aria-label="More export options"
      >
        <ChevronDown className="h-4 w-4" />
      </Button>

      {/* Dropdown menu */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 rounded-md border border-border bg-card shadow-lg">
          <div className="py-1">
            <button
              onClick={() => handleAction('dashboard')}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Eye className="h-4 w-4 text-muted-foreground" />
              View in Dashboard
            </button>
            <button
              onClick={() => handleAction('excel')}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {loading === 'excel' ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <Download className="h-4 w-4 text-muted-foreground" />
              )}
              Download Excel (.xlsx)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
