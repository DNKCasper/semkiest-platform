'use client';

import { useState } from 'react';
import {
  Download,
  Eye,
  Link2,
  Trash2,
  Loader2,
  FileSpreadsheet,
  LayoutDashboard,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { formatDateTime } from '../../lib/utils';
import type { Report, ReportStatus } from '../../types/report';

export interface ReportHistoryProps {
  reports: Report[];
  onPreview: (report: Report) => void;
  onDownload: (report: Report) => Promise<void>;
  onDelete: (reportId: string) => Promise<void>;
  onCopyLink: (report: Report) => void;
  loading?: boolean;
}

const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; variant: 'success' | 'secondary' | 'destructive' | 'outline' }
> = {
  ready: {
    label: 'Ready',
    icon: CheckCircle2,
    variant: 'success',
  },
  generating: {
    label: 'Generating',
    icon: RefreshCw,
    variant: 'secondary',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    variant: 'outline',
  },
  failed: {
    label: 'Failed',
    icon: AlertCircle,
    variant: 'destructive',
  },
};

const FORMAT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  excel: FileSpreadsheet,
  dashboard: LayoutDashboard,
  pdf: FileSpreadsheet,
};

/**
 * Table showing previously generated reports with download and action links.
 */
export function ReportHistory({
  reports,
  onPreview,
  onDownload,
  onDelete,
  onCopyLink,
  loading = false,
}: ReportHistoryProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDownload(report: Report) {
    setDownloadingId(report.id);
    try {
      await onDownload(report);
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(reportId: string) {
    setDeletingId(reportId);
    try {
      await onDelete(reportId);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading report history...
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground text-sm">
        No reports generated yet. Use the Generate Report button to create your first report.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Report</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Generated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.map((report) => {
            const statusCfg = STATUS_CONFIG[report.status];
            const StatusIcon = statusCfg.icon;
            const FormatIcon = FORMAT_ICONS[report.format] ?? FileSpreadsheet;

            return (
              <TableRow key={report.id}>
                <TableCell className="font-medium max-w-xs truncate">
                  {report.title}
                </TableCell>

                <TableCell>
                  <span className="text-sm capitalize">
                    {report.type.replace(/_/g, ' ')}
                  </span>
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <FormatIcon className="h-3.5 w-3.5" />
                    <span className="capitalize">{report.format}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <Badge variant={statusCfg.variant} className="gap-1">
                    <StatusIcon
                      className={`h-3 w-3 ${
                        report.status === 'generating' ? 'animate-spin' : ''
                      }`}
                    />
                    {statusCfg.label}
                  </Badge>
                </TableCell>

                <TableCell className="text-sm text-muted-foreground">
                  {report.generatedAt ? formatDateTime(report.generatedAt) : '—'}
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {/* Preview (dashboard format only) */}
                    {report.status === 'ready' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onPreview(report)}
                        aria-label="Preview report"
                        title="Preview"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Download */}
                    {report.status === 'ready' && report.downloadUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(report)}
                        disabled={downloadingId === report.id}
                        aria-label="Download report"
                        title="Download"
                      >
                        {downloadingId === report.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    {/* Copy share link */}
                    {report.shareUrl && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onCopyLink(report)}
                        aria-label="Copy share link"
                        title="Copy link"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    )}

                    {/* Delete */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(report.id)}
                      disabled={deletingId === report.id}
                      aria-label="Delete report"
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      {deletingId === report.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
