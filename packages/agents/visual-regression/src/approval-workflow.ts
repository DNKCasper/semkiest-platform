/**
 * Visual Regression Approval Workflow
 *
 * Handles all business logic for reviewing, approving, and rejecting visual
 * baseline diffs. Supports single and batch operations, auto-approval below
 * a configurable threshold, and full history tracking.
 */

import type {
  ApprovalAction,
  ApprovalRecord,
  ApproveBaselineInput,
  AutoApproveConfig,
  BaselineQuery,
  BaselineRepository,
  BaselineStatus,
  BatchApprovalInput,
  BatchApprovalItemResult,
  BatchApprovalResult,
  DiffViewerData,
  DiffViewMode,
  RejectBaselineInput,
  VisualBaseline,
} from './types';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class BaselineNotFoundError extends Error {
  constructor(id: string) {
    super(`Visual baseline not found: ${id}`);
    this.name = 'BaselineNotFoundError';
  }
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: BaselineStatus, to: BaselineStatus) {
    super(`Cannot transition baseline status from "${from}" to "${to}"`);
    this.name = 'InvalidStatusTransitionError';
  }
}

export class InsufficientPermissionsError extends Error {
  constructor(userId: string, action: string) {
    super(`User "${userId}" does not have permission to perform: ${action}`);
    this.name = 'InsufficientPermissionsError';
  }
}

// ─── Permission Checker ───────────────────────────────────────────────────────

/**
 * Pluggable permission checker.
 * Implement this interface to enforce role-based access control.
 */
export interface PermissionChecker {
  canApprove(userId: string, baseline: VisualBaseline): boolean | Promise<boolean>;
  canReject(userId: string, baseline: VisualBaseline): boolean | Promise<boolean>;
}

/** Default permissive checker — allows all actions. Replace in production. */
const allowAllPermissions: PermissionChecker = {
  canApprove: () => true,
  canReject: () => true,
};

// ─── Allowed Transitions ──────────────────────────────────────────────────────

/** Valid status transitions for the approval workflow state machine. */
const ALLOWED_TRANSITIONS: Record<BaselineStatus, BaselineStatus[]> = {
  pending: ['approved', 'rejected', 'auto-approved'],
  rejected: ['approved'],
  approved: ['rejected'],
  'auto-approved': ['rejected', 'approved'],
};

function assertValidTransition(
  from: BaselineStatus,
  to: BaselineStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidStatusTransitionError(from, to);
  }
}

// ─── Diff Viewer Data Helpers ─────────────────────────────────────────────────

/** Determines which view modes are available based on the baseline's diff data. */
function resolveAvailableViewModes(baseline: VisualBaseline): DiffViewMode[] {
  const modes: DiffViewMode[] = ['side-by-side'];
  if (baseline.diff?.diffImageUrl) {
    modes.push('overlay', 'diff-highlight');
  }
  if (baseline.actual) {
    modes.push('slider');
  }
  return modes;
}

// ─── ApprovalWorkflow ─────────────────────────────────────────────────────────

/**
 * Core service for the visual regression approval workflow.
 *
 * Accepts a {@link BaselineRepository} to decouple from the database, enabling
 * easy unit testing with mock repositories.
 *
 * @example
 * ```ts
 * const workflow = new ApprovalWorkflow(prismaRepository);
 *
 * // Approve a single baseline
 * const updated = await workflow.approve('baseline-id', {
 *   userId: 'user-123',
 *   comment: 'Looks good!',
 * });
 * ```
 */
export class ApprovalWorkflow {
  private readonly repo: BaselineRepository;
  private readonly permissions: PermissionChecker;

  constructor(
    repo: BaselineRepository,
    permissions: PermissionChecker = allowAllPermissions,
  ) {
    this.repo = repo;
    this.permissions = permissions;
  }

  // ─── Single Operations ──────────────────────────────────────────────────────

  /**
   * Approve a single baseline diff.
   *
   * @throws {BaselineNotFoundError} If the baseline does not exist.
   * @throws {InvalidStatusTransitionError} If the current status cannot transition to approved.
   * @throws {InsufficientPermissionsError} If the user lacks permission.
   */
  async approve(
    baselineId: string,
    input: ApproveBaselineInput,
  ): Promise<VisualBaseline> {
    const baseline = await this.requireBaseline(baselineId);

    if (!(await this.permissions.canApprove(input.userId, baseline))) {
      throw new InsufficientPermissionsError(input.userId, 'approve');
    }

    const previousStatus = baseline.status;
    const newStatus: BaselineStatus = 'approved';
    assertValidTransition(previousStatus, newStatus);

    const updated = await this.repo.update(baselineId, { status: newStatus });

    await this.repo.createApprovalRecord({
      baselineId,
      action: 'approved',
      userId: input.userId,
      userName: input.userName,
      comment: input.comment,
      previousStatus,
      newStatus,
      version: baseline.version,
    });

    return updated;
  }

  /**
   * Reject a single baseline diff.
   *
   * @throws {BaselineNotFoundError} If the baseline does not exist.
   * @throws {InvalidStatusTransitionError} If the current status cannot transition to rejected.
   * @throws {InsufficientPermissionsError} If the user lacks permission.
   */
  async reject(
    baselineId: string,
    input: RejectBaselineInput,
  ): Promise<VisualBaseline> {
    const baseline = await this.requireBaseline(baselineId);

    if (!(await this.permissions.canReject(input.userId, baseline))) {
      throw new InsufficientPermissionsError(input.userId, 'reject');
    }

    const previousStatus = baseline.status;
    const newStatus: BaselineStatus = 'rejected';
    assertValidTransition(previousStatus, newStatus);

    const updated = await this.repo.update(baselineId, { status: newStatus });

    await this.repo.createApprovalRecord({
      baselineId,
      action: 'rejected',
      userId: input.userId,
      userName: input.userName,
      comment: input.reason,
      previousStatus,
      newStatus,
      version: baseline.version,
    });

    return updated;
  }

  // ─── Batch Operations ───────────────────────────────────────────────────────

  /**
   * Approve or reject multiple baselines in a single call.
   *
   * Processes each baseline independently; failures do not abort the batch.
   * Returns a detailed result for each item.
   */
  async batchProcess(input: BatchApprovalInput): Promise<BatchApprovalResult> {
    const results = await Promise.allSettled(
      input.baselineIds.map((id) =>
        input.action === 'approve'
          ? this.approve(id, {
              userId: input.userId,
              userName: input.userName,
              comment: input.comment,
            })
          : this.reject(id, {
              userId: input.userId,
              userName: input.userName,
              reason: input.comment ?? 'Batch rejection',
            }),
      ),
    );

    const itemResults: BatchApprovalItemResult[] = results.map(
      (result, index) => {
        const baselineId = input.baselineIds[index] as string;
        if (result.status === 'fulfilled') {
          return { baselineId, success: true, status: result.value.status };
        }
        return {
          baselineId,
          success: false,
          error:
            result.reason instanceof Error
              ? result.reason.message
              : 'Unknown error',
        };
      },
    );

    const successCount = itemResults.filter((r) => r.success).length;

    return {
      results: itemResults,
      successCount,
      failureCount: itemResults.length - successCount,
    };
  }

  // ─── Auto-Approval ──────────────────────────────────────────────────────────

  /**
   * Check whether a baseline qualifies for auto-approval based on its
   * configured threshold (or the supplied global config), and approve it
   * automatically if so.
   *
   * Returns the (possibly updated) baseline. If auto-approval did not trigger,
   * the baseline is returned unchanged.
   */
  async checkAndAutoApprove(
    baselineId: string,
    globalConfig?: AutoApproveConfig,
  ): Promise<VisualBaseline> {
    const baseline = await this.requireBaseline(baselineId);

    if (baseline.status !== 'pending') {
      return baseline;
    }

    const diffPct = baseline.diff?.diffPercentage;
    if (diffPct === undefined || diffPct === null) {
      return baseline;
    }

    // Resolve effective threshold: per-baseline > global config > disabled
    const threshold = resolveAutoApproveThreshold(baseline, globalConfig);
    if (threshold === null) {
      return baseline;
    }

    if (diffPct <= threshold) {
      const previousStatus = baseline.status;
      const newStatus: BaselineStatus = 'auto-approved';
      const updated = await this.repo.update(baselineId, { status: newStatus });

      await this.repo.createApprovalRecord({
        baselineId,
        action: 'auto-approved',
        userId: 'system',
        comment: `Auto-approved: diff ${diffPct.toFixed(2)}% ≤ threshold ${threshold}%`,
        previousStatus,
        newStatus,
        version: baseline.version,
      });

      return updated;
    }

    return baseline;
  }

  // ─── Diff Viewer Data ───────────────────────────────────────────────────────

  /**
   * Prepare the complete data payload required by the diff viewer UI.
   *
   * @throws {BaselineNotFoundError} If the baseline does not exist.
   * @throws {Error} If actual screenshot data is missing (baseline has no comparison yet).
   */
  async prepareDiffViewerData(baselineId: string): Promise<DiffViewerData> {
    const baseline = await this.requireBaseline(baselineId);

    if (!baseline.actual) {
      throw new Error(
        `Baseline "${baselineId}" has no actual screenshot to compare against.`,
      );
    }

    if (!baseline.diff) {
      throw new Error(
        `Baseline "${baselineId}" has no diff result computed yet.`,
      );
    }

    const diffOverlay = baseline.diff.diffImageUrl
      ? {
          url: baseline.diff.diffImageUrl,
          width: baseline.baseline.width,
          height: baseline.baseline.height,
          capturedAt: baseline.updatedAt,
        }
      : undefined;

    return {
      baselineId: baseline.id,
      componentName: baseline.componentName,
      viewport: baseline.viewport,
      version: baseline.version,
      baseline: baseline.baseline,
      actual: baseline.actual,
      diffOverlay,
      diffResult: baseline.diff,
      status: baseline.status,
      availableViewModes: resolveAvailableViewModes(baseline),
    };
  }

  // ─── History ────────────────────────────────────────────────────────────────

  /**
   * Retrieve the full chronological approval history for a baseline.
   *
   * @throws {BaselineNotFoundError} If the baseline does not exist.
   */
  async getHistory(baselineId: string): Promise<ApprovalRecord[]> {
    await this.requireBaseline(baselineId);
    return this.repo.findApprovalHistory(baselineId);
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  /** List baselines matching the supplied query parameters. */
  async listBaselines(query: BaselineQuery): Promise<VisualBaseline[]> {
    return this.repo.findMany(query);
  }

  /** Retrieve a single baseline by ID. */
  async getBaseline(id: string): Promise<VisualBaseline> {
    return this.requireBaseline(id);
  }

  // ─── Threshold Management ───────────────────────────────────────────────────

  /**
   * Update the per-baseline auto-approve threshold.
   *
   * @param threshold Value between 0 and 100, or null to disable.
   */
  async setAutoApproveThreshold(
    baselineId: string,
    threshold: number | null,
  ): Promise<VisualBaseline> {
    await this.requireBaseline(baselineId);
    if (threshold !== null && (threshold < 0 || threshold > 100)) {
      throw new RangeError('Auto-approve threshold must be between 0 and 100.');
    }
    return this.repo.update(baselineId, { autoApproveThreshold: threshold });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async requireBaseline(id: string): Promise<VisualBaseline> {
    const baseline = await this.repo.findById(id);
    if (!baseline) {
      throw new BaselineNotFoundError(id);
    }
    return baseline;
  }
}

// ─── Free Functions ───────────────────────────────────────────────────────────

/**
 * Resolve the effective auto-approve threshold for a baseline.
 * Per-baseline threshold takes priority over global config.
 * Returns null if auto-approval is disabled.
 */
export function resolveAutoApproveThreshold(
  baseline: VisualBaseline,
  globalConfig?: AutoApproveConfig,
): number | null {
  if (baseline.autoApproveThreshold !== null) {
    return baseline.autoApproveThreshold;
  }
  if (globalConfig?.enabled) {
    return globalConfig.threshold;
  }
  return null;
}

/**
 * Map a raw database baseline row (from Prisma) to the canonical
 * {@link VisualBaseline} domain type used throughout the workflow.
 */
export function mapDbBaselineToVisualBaseline(
  row: RawDbBaseline,
): VisualBaseline {
  return {
    id: row.id,
    projectId: row.projectId,
    componentName: row.componentName,
    viewport: row.viewport,
    version: row.version,
    baseline: {
      url: row.baselineUrl,
      width: row.baselineWidth,
      height: row.baselineHeight,
      capturedAt: row.baselineCapturedAt.toISOString(),
    },
    actual:
      row.actualUrl != null &&
      row.actualWidth != null &&
      row.actualHeight != null &&
      row.actualCapturedAt != null
        ? {
            url: row.actualUrl,
            width: row.actualWidth,
            height: row.actualHeight,
            capturedAt: row.actualCapturedAt.toISOString(),
          }
        : undefined,
    diff:
      row.diffPixels != null &&
      row.totalPixels != null &&
      row.diffPercentage != null
        ? {
            diffPixels: row.diffPixels,
            totalPixels: row.totalPixels,
            diffPercentage: row.diffPercentage,
            diffImageUrl: row.diffImageUrl ?? undefined,
          }
        : undefined,
    status: row.status as BaselineStatus,
    autoApproveThreshold: row.autoApproveThreshold,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Map a raw database approval record row to the canonical
 * {@link ApprovalRecord} domain type.
 */
export function mapDbApprovalRecord(row: RawDbApprovalRecord): ApprovalRecord {
  return {
    id: row.id,
    baselineId: row.baselineId,
    action: row.action as ApprovalAction,
    userId: row.userId,
    userName: row.userName ?? undefined,
    comment: row.comment ?? undefined,
    previousStatus: row.previousStatus as BaselineStatus,
    newStatus: row.newStatus as BaselineStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Raw DB Row Shapes (mirrors Prisma generated types) ──────────────────────

/** Shape of a raw Prisma VisualBaseline row. */
export interface RawDbBaseline {
  id: string;
  projectId: string;
  componentName: string;
  viewport: string;
  version: string;
  baselineUrl: string;
  baselineWidth: number;
  baselineHeight: number;
  baselineCapturedAt: Date;
  actualUrl: string | null;
  actualWidth: number | null;
  actualHeight: number | null;
  actualCapturedAt: Date | null;
  diffImageUrl: string | null;
  diffPixels: number | null;
  totalPixels: number | null;
  diffPercentage: number | null;
  status: string;
  autoApproveThreshold: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape of a raw Prisma ApprovalRecord row. */
export interface RawDbApprovalRecord {
  id: string;
  baselineId: string;
  action: string;
  userId: string;
  userName: string | null;
  comment: string | null;
  previousStatus: string;
  newStatus: string;
  version: string;
  createdAt: Date;
}
