/**
 * CleanupService
 *
 * Resets a test environment to a known baseline state after test execution.
 *
 * Responsibilities:
 *  - Restore the designated baseline data set for a project
 *  - Track cleanup operations in the audit log
 *  - Support transactional rollback of in-progress test runs
 *  - Provide a structured cleanup job result for downstream consumers
 */

import {
  type DataSet,
  type AuditLog,
  type CleanupRepository,
} from './types';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface CleanupResult {
  projectId: string;
  baselineDataSet: DataSet | null;
  wasReset: boolean;
  auditLog: AuditLog;
  executedAt: Date;
}

export interface TransactionRollbackResult {
  transactionId: string;
  rolledBack: boolean;
  auditLog: AuditLog;
  executedAt: Date;
}

/**
 * Represents an in-progress test transaction that may need rollback.
 * Consumers should populate this via their own database or session layer.
 */
export interface TestTransaction {
  id: string;
  projectId: string;
  /** Human-readable description of what the transaction covers. */
  description?: string;
  /** Rollback function provided by the caller's database adapter. */
  rollback: () => Promise<void>;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Manages post-test environment reset and transactional rollback.
 */
export class CleanupService {
  /** In-memory registry of open test transactions keyed by transaction ID. */
  private readonly openTransactions = new Map<string, TestTransaction>();

  constructor(private readonly repo: CleanupRepository) {}

  // ── Environment reset ─────────────────────────────────────────────────────

  /**
   * Resets the test environment for a project to its baseline data set.
   *
   * If no baseline has been designated, the audit log is still written and
   * `wasReset` is set to `false` so the caller can detect the gap.
   *
   * @param projectId - Project whose environment should be reset
   * @param actor     - Optional identity for the audit trail
   */
  async resetToBaseline(
    projectId: string,
    actor?: string,
  ): Promise<CleanupResult> {
    const executedAt = new Date();

    const library = await this.repo.findLibraryByProjectId(projectId);

    let baselineDataSet: DataSet | null = null;
    let wasReset = false;

    if (library !== null) {
      baselineDataSet = await this.repo.findBaselineDataSet(library.id);
      wasReset = baselineDataSet !== null;
    }

    const auditLog = await this.repo.createAuditLog({
      projectId,
      dataSetId: baselineDataSet?.id,
      action: 'CLEANUP_EXECUTE',
      actor,
      after: {
        wasReset,
        baselineDataSetId: baselineDataSet?.id ?? null,
        baselineVersion: baselineDataSet?.version ?? null,
        executedAt: executedAt.toISOString(),
      },
    });

    return {
      projectId,
      baselineDataSet,
      wasReset,
      auditLog,
      executedAt,
    };
  }

  // ── Transactional rollback ────────────────────────────────────────────────

  /**
   * Registers a test transaction so it can be rolled back later.
   *
   * Call this at the start of each test that should be isolated.
   */
  registerTransaction(transaction: TestTransaction): void {
    this.openTransactions.set(transaction.id, transaction);
  }

  /**
   * Rolls back a previously registered test transaction and removes it from
   * the registry.
   *
   * @param transactionId - ID of the transaction to roll back
   * @param actor         - Optional identity for the audit trail
   */
  async rollbackTransaction(
    transactionId: string,
    actor?: string,
  ): Promise<TransactionRollbackResult> {
    const executedAt = new Date();
    const tx = this.openTransactions.get(transactionId);

    if (tx === undefined) {
      throw new Error(
        `Transaction not found in registry: ${transactionId}. ` +
          'Ensure registerTransaction() was called before rollbackTransaction().',
      );
    }

    await tx.rollback();
    this.openTransactions.delete(transactionId);

    const auditLog = await this.repo.createAuditLog({
      projectId: tx.projectId,
      action: 'CLEANUP_ROLLBACK',
      actor,
      after: {
        transactionId,
        description: tx.description ?? null,
        executedAt: executedAt.toISOString(),
      },
    });

    return {
      transactionId,
      rolledBack: true,
      auditLog,
      executedAt,
    };
  }

  /**
   * Rolls back **all** open transactions for a project.
   * Useful when a test suite exits uncleanly.
   *
   * @param projectId - Roll back only transactions belonging to this project.
   *                    Omit to roll back every registered transaction.
   * @param actor     - Optional identity for the audit trail
   */
  async rollbackAll(
    projectId?: string,
    actor?: string,
  ): Promise<TransactionRollbackResult[]> {
    const toRollback: TestTransaction[] = [];

    for (const tx of this.openTransactions.values()) {
      if (projectId === undefined || tx.projectId === projectId) {
        toRollback.push(tx);
      }
    }

    const results: TransactionRollbackResult[] = [];
    for (const tx of toRollback) {
      const result = await this.rollbackTransaction(tx.id, actor);
      results.push(result);
    }

    return results;
  }

  // ── Inspection ────────────────────────────────────────────────────────────

  /**
   * Returns the number of currently open (registered) transactions.
   */
  get openTransactionCount(): number {
    return this.openTransactions.size;
  }

  /**
   * Returns all currently open transaction IDs.
   */
  getOpenTransactionIds(): string[] {
    return Array.from(this.openTransactions.keys());
  }
}
