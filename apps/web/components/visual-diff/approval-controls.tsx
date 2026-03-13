'use client';

import * as React from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { approvalApi } from '../../lib/approval-api-client';
import type { ApprovalStatus } from './types';

export interface ApprovalControlsProps {
  /** ID of the visual test result to approve or reject */
  resultId: string;
  /** Current approval status */
  currentStatus: ApprovalStatus;
  /** Optional comment to attach to the approval or rejection */
  comment?: string;
  /** Called after a successful status change */
  onStatusChange?: (id: string, status: ApprovalStatus) => void;
  /** Called when an API error occurs */
  onError?: (message: string) => void;
  /** Layout orientation */
  orientation?: 'horizontal' | 'vertical';
  /** Additional CSS classes */
  className?: string;
  /** When true, renders compact icon-only buttons */
  compact?: boolean;
}

type ActionState = 'idle' | 'approving' | 'rejecting';

/**
 * ApprovalControls renders approve / reject / reset buttons for a single
 * visual test result, wired to the approval workflow API (SEM-72).
 *
 * Keyboard shortcut hints (a / r) are shown on the buttons when `compact`
 * is false, acting as a reminder for the shortcuts handled by the parent
 * SideBySideViewer.
 */
export function ApprovalControls({
  resultId,
  currentStatus,
  comment,
  onStatusChange,
  onError,
  orientation = 'horizontal',
  className,
  compact = false,
}: ApprovalControlsProps) {
  const [actionState, setActionState] = React.useState<ActionState>('idle');

  const isLoading = actionState !== 'idle';

  const handleApprove = async () => {
    if (isLoading || currentStatus === 'approved') return;
    setActionState('approving');
    try {
      await approvalApi.approve(resultId, comment);
      onStatusChange?.(resultId, 'approved');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve';
      onError?.(message);
    } finally {
      setActionState('idle');
    }
  };

  const handleReject = async () => {
    if (isLoading || currentStatus === 'rejected') return;
    setActionState('rejecting');
    try {
      await approvalApi.reject(resultId, comment);
      onStatusChange?.(resultId, 'rejected');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reject';
      onError?.(message);
    } finally {
      setActionState('idle');
    }
  };


  const statusBadgeClass = {
    pending: 'bg-muted text-muted-foreground',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    rejected: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }[currentStatus];

  return (
    <div
      className={cn(
        'flex items-center gap-2',
        orientation === 'vertical' && 'flex-col',
        className,
      )}
      role="group"
      aria-label="Approval controls"
    >
      {/* Status badge */}
      <span
        className={cn(
          'rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
          statusBadgeClass,
        )}
        aria-live="polite"
      >
        {currentStatus}
      </span>

      {/* Approve button */}
      <Button
        size={compact ? 'icon' : 'sm'}
        variant={currentStatus === 'approved' ? 'default' : 'outline'}
        onClick={handleApprove}
        disabled={isLoading || currentStatus === 'approved'}
        aria-label="Approve baseline"
        title="Approve (A)"
        className={cn(
          currentStatus === 'approved' && 'bg-green-600 hover:bg-green-700 text-white border-green-600',
        )}
      >
        {actionState === 'approving' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        {!compact && <span className="ml-1.5">Approve</span>}
      </Button>

      {/* Reject button */}
      <Button
        size={compact ? 'icon' : 'sm'}
        variant={currentStatus === 'rejected' ? 'destructive' : 'outline'}
        onClick={handleReject}
        disabled={isLoading || currentStatus === 'rejected'}
        aria-label="Reject baseline"
        title="Reject (R)"
      >
        {actionState === 'rejecting' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
        {!compact && <span className="ml-1.5">Reject</span>}
      </Button>

    </div>
  );
}

ApprovalControls.displayName = 'ApprovalControls';
