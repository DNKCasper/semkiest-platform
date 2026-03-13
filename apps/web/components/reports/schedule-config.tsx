'use client';

import { useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Clock, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Badge } from '../ui/badge';
import type { ScheduleConfig, ReportType } from '../../types/report';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const scheduleSchema = z.object({
  frequency: z.enum(['weekly', 'monthly']),
  dayOfPeriod: z.coerce.number().int().min(0).max(28),
  reportType: z.enum([
    'executive_summary',
    'technical_details',
    'trends_analysis',
    'test_run',
    'project_summary',
    'organization',
  ]),
  recipientInput: z.string().optional(),
});

type ScheduleFormValues = z.infer<typeof scheduleSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ScheduleConfigProps {
  projectId: string;
  existingSchedules: ScheduleConfig[];
  onSave: (values: {
    frequency: 'weekly' | 'monthly';
    dayOfPeriod: number;
    recipients: string[];
    reportType: ReportType;
  }) => Promise<void>;
  onDelete: (scheduleId: string) => Promise<void>;
  className?: string;
}

const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  executive_summary: 'Executive Summary',
  technical_details: 'Technical Details',
  trends_analysis: 'Trends Analysis',
  test_run: 'Test Run',
  project_summary: 'Project Summary',
  organization: 'Organization',
};

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Schedule configuration panel. Shows existing schedules and a dialog to add new ones.
 */
export function ScheduleConfigPanel({
  existingSchedules,
  onSave,
  onDelete,
  className,
}: ScheduleConfigProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      frequency: 'weekly',
      dayOfPeriod: 1,
      reportType: 'executive_summary',
      recipientInput: '',
    },
  });

  const frequency = watch('frequency');
  const recipientInput = watch('recipientInput') ?? '';

  function addRecipient() {
    const email = recipientInput.trim();
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipients.includes(email)) {
      setRecipients((prev) => [...prev, email]);
    }
  }

  function removeRecipient(email: string) {
    setRecipients((prev) => prev.filter((r) => r !== email));
  }

  async function onSubmit(values: ScheduleFormValues) {
    if (recipients.length === 0) return;
    setSaving(true);
    try {
      await onSave({
        frequency: values.frequency,
        dayOfPeriod: values.dayOfPeriod,
        recipients,
        reportType: values.reportType as ReportType,
      });
      setDialogOpen(false);
      reset();
      setRecipients([]);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={className}>
      {/* Existing schedules */}
      {existingSchedules.length > 0 ? (
        <ul className="space-y-3 mb-4">
          {existingSchedules.map((schedule) => (
            <li
              key={schedule.id}
              className="flex items-center justify-between rounded-md border border-border px-4 py-3 bg-card"
            >
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="font-medium">
                    {REPORT_TYPE_LABELS[schedule.reportType]} —{' '}
                    {schedule.frequency === 'weekly'
                      ? `Every ${WEEKDAYS[schedule.dayOfPeriod]}`
                      : `Monthly (day ${schedule.dayOfPeriod})`}
                  </p>
                  <p className="text-muted-foreground">
                    {schedule.recipients.join(', ')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={schedule.isActive ? 'success' : 'secondary'}>
                  {schedule.isActive ? 'Active' : 'Paused'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(schedule.id)}
                  disabled={deletingId === schedule.id}
                  aria-label="Delete schedule"
                >
                  {deletingId === schedule.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground mb-4">
          No scheduled reports configured.
        </p>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => setDialogOpen(true)}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Add Schedule
      </Button>

      {/* Add Schedule Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule Report Delivery</DialogTitle>
            <DialogDescription>
              Configure automatic report generation and email delivery.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            {/* Report type */}
            <div className="space-y-1.5">
              <Label htmlFor="reportType">Report Type</Label>
              <Controller
                name="reportType"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="reportType">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(REPORT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Frequency */}
            <div className="space-y-1.5">
              <Label htmlFor="frequency">Frequency</Label>
              <Controller
                name="frequency"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="frequency">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {/* Day of period */}
            <div className="space-y-1.5">
              <Label htmlFor="dayOfPeriod">
                {frequency === 'weekly' ? 'Day of Week' : 'Day of Month'}
              </Label>
              {frequency === 'weekly' ? (
                <Controller
                  name="dayOfPeriod"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(v) => field.onChange(Number(v))}
                    >
                      <SelectTrigger id="dayOfPeriod">
                        <SelectValue placeholder="Select day" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day, idx) => (
                          <SelectItem key={day} value={String(idx)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              ) : (
                <Input
                  id="dayOfPeriod"
                  type="number"
                  min={1}
                  max={28}
                  placeholder="1–28"
                  {...register('dayOfPeriod')}
                />
              )}
              {errors.dayOfPeriod && (
                <p className="text-xs text-destructive">{errors.dayOfPeriod.message}</p>
              )}
            </div>

            {/* Recipients */}
            <div className="space-y-1.5">
              <Label>Recipients</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  {...register('recipientInput')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addRecipient();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addRecipient}
                >
                  Add
                </Button>
              </div>
              {recipients.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {recipients.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="gap-1 cursor-pointer"
                      onClick={() => removeRecipient(email)}
                    >
                      {email}
                      <span className="text-muted-foreground hover:text-foreground">×</span>
                    </Badge>
                  ))}
                </div>
              )}
              {recipients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add at least one recipient email address.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving || recipients.length === 0}
              >
                {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Save Schedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
