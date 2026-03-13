'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import type { BaselineStatus } from './types';

// ─── Status Badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<BaselineStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  'auto-approved': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_LABELS: Record<BaselineStatus, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  rejected: 'Rejected',
  'auto-approved': 'Auto-Approved',
};

interface StatusBadgeProps {
  status: BaselineStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        STATUS_STYLES[status],
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Rejection Dialog ─────────────────────────────────────────────────────────

interface RejectionDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isLoading?: boolean;
}

function RejectionDialog({
  open,
  onClose,
  onConfirm,
  isLoading,
}: RejectionDialogProps) {
  const [reason, setReason] = React.useState('');

  function handleConfirm() {
    if (reason.trim()) {
      onConfirm(reason.trim());
      setReason('');
    }
  }

  function handleClose() {
    setReason('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject Baseline</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="rejection-reason" className="mb-2 block">
            Reason for rejection{' '}
            <span className="text-destructive" aria-hidden>
              *
            </span>
          </Label>
          <Textarea
            id="rejection-reason"
            placeholder="Describe what is wrong with this change..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="resize-none"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!reason.trim() || isLoading}
          >
            {isLoading ? 'Rejecting...' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── ApprovalActions ──────────────────────────────────────────────────────────

export interface ApprovalActionsProps {
  baselineId: string;
  status: BaselineStatus;
  /** Called when the user confirms an approval. */
  onApprove: (baselineId: string, comment?: string) => Promise<void>;
  /** Called when the user confirms a rejection with a reason. */
  onReject: (baselineId: string, reason: string) => Promise<void>;
  className?: string;
}

/**
 * Approve / reject action buttons for a single baseline diff.
 *
 * - Shows the current status as a badge.
 * - Approve button triggers immediately (optionally with a comment).
 * - Reject button opens a confirmation dialog requiring a reason.
 * - Buttons are disabled while an action is in flight.
 *
 * @example
 * ```tsx
 * <ApprovalActions
 *   baselineId={baseline.id}
 *   status={baseline.status}
 *   onApprove={handleApprove}
 *   onReject={handleReject}
 * />
 * ```
 */
export function ApprovalActions({
  baselineId,
  status,
  onApprove,
  onReject,
  className,
}: ApprovalActionsProps) {
  const [isApproving, setIsApproving] = React.useState(false);
  const [isRejecting, setIsRejecting] = React.useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = React.useState(false);

  const isBusy = isApproving || isRejecting;

  async function handleApprove() {
    setIsApproving(true);
    try {
      await onApprove(baselineId);
    } finally {
      setIsApproving(false);
    }
  }

  async function handleRejectConfirm(reason: string) {
    setIsRejecting(true);
    try {
      await onReject(baselineId, reason);
      setRejectDialogOpen(false);
    } finally {
      setIsRejecting(false);
    }
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <StatusBadge status={status} />

      <div className="ml-auto flex gap-2">
        <Button
          variant="outline"
          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
          onClick={() => setRejectDialogOpen(true)}
          disabled={isBusy || status === 'rejected'}
          aria-label="Reject this baseline diff"
        >
          Reject
        </Button>

        <Button
          onClick={handleApprove}
          disabled={isBusy || status === 'approved' || status === 'auto-approved'}
          aria-label="Approve this baseline diff"
        >
          {isApproving ? 'Approving...' : 'Approve'}
        </Button>
      </div>

      <RejectionDialog
        open={rejectDialogOpen}
        onClose={() => setRejectDialogOpen(false)}
        onConfirm={handleRejectConfirm}
        isLoading={isRejecting}
      />
    </div>
  );
}
