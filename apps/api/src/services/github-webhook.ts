import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

/** GitHub event types supported by this integration. */
export type GitHubEventType =
  | 'deployment_status'
  | 'push'
  | 'pull_request'
  | 'ping';

/** Lifecycle states for a tracked webhook delivery. */
export type WebhookDeliveryStatus =
  | 'received'
  | 'processed'
  | 'failed'
  | 'ignored';

/** Audit record for a single webhook delivery attempt. */
export interface WebhookDelivery {
  id: string;
  deliveryId: string;
  event: string;
  repository: string;
  status: WebhookDeliveryStatus;
  timestamp: Date;
  error?: string;
}

/** Maps a GitHub repository to a SemkiEst project with trigger rules. */
export interface RepoProjectMapping {
  id: string;
  /** Full repository name, e.g. "owner/repo". */
  repositoryFullName: string;
  projectId: string;
  /**
   * Branch name filters. Empty array means all branches are allowed.
   * Supports exact matches and wildcard suffixes, e.g. "staging/*".
   */
  branchFilters: string[];
  /** GitHub event types that this mapping responds to. */
  eventTypes: GitHubEventType[];
  /** When true, matching deployment events automatically trigger a test run. */
  autoTrigger: boolean;
  /**
   * Deployment environment names that qualify for auto-triggering.
   * Substring matching is used, e.g. "staging" matches "staging-pr-42".
   * Empty array means all environments are allowed.
   */
  targetEnvironments: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// GitHub webhook payload shapes
// ---------------------------------------------------------------------------

export interface GitHubDeploymentStatusPayload {
  deployment_status: {
    id: number;
    state: string;
    environment: string;
    environment_url?: string;
    target_url?: string;
    description?: string;
  };
  deployment: {
    id: number;
    ref: string;
    sha: string;
    environment: string;
    payload?: Record<string, unknown>;
  };
  repository: {
    full_name: string;
    name: string;
    html_url: string;
  };
  sender: {
    login: string;
  };
}

export interface GitHubPushPayload {
  ref: string;
  after: string;
  before: string;
  repository: {
    full_name: string;
    name: string;
    html_url: string;
  };
  sender: {
    login: string;
  };
  head_commit?: {
    id: string;
    message: string;
  };
}

export interface GitHubPullRequestPayload {
  action: string;
  number: number;
  pull_request: {
    id: number;
    number: number;
    title: string;
    state: string;
    head: { ref: string; sha: string };
    base: { ref: string };
    html_url: string;
  };
  repository: {
    full_name: string;
    name: string;
    html_url: string;
  };
}

export type GitHubWebhookPayload =
  | GitHubDeploymentStatusPayload
  | GitHubPushPayload
  | GitHubPullRequestPayload
  | Record<string, unknown>;

export interface ProcessedWebhookEvent {
  eventType: string;
  deliveryId: string;
  repository: string;
  payload: GitHubWebhookPayload;
  mapping: RepoProjectMapping;
}

export interface WebhookServiceConfig {
  /** HMAC-SHA256 secret configured in the GitHub webhook settings. */
  secret?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Handles GitHub webhook signature verification, delivery tracking, and
 * repository-to-project mapping management.
 *
 * Deliveries and mappings are stored in-memory. In a production deployment
 * these should be persisted to the database (SEM-52 / Prisma schema).
 */
export class GitHubWebhookService {
  private readonly secret: string | undefined;
  private readonly deliveries: Map<string, WebhookDelivery> = new Map();
  private readonly mappings: Map<string, RepoProjectMapping> = new Map();

  constructor(config: WebhookServiceConfig = {}) {
    this.secret = config.secret;
  }

  /**
   * Verifies the HMAC-SHA256 signature sent by GitHub in the
   * `X-Hub-Signature-256` header.
   *
   * Uses `timingSafeEqual` to prevent timing-based side-channel attacks.
   * Returns `true` (no validation) when no secret is configured.
   */
  verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!this.secret) {
      return true;
    }

    if (!signature?.startsWith('sha256=')) {
      return false;
    }

    const expectedHex = createHmac('sha256', this.secret)
      .update(rawBody)
      .digest('hex');

    const expected = Buffer.from(`sha256=${expectedHex}`);
    const provided = Buffer.from(signature);

    if (expected.length !== provided.length) {
      return false;
    }

    return timingSafeEqual(expected, provided);
  }

  /** Records a new webhook delivery in the audit log. */
  recordDelivery(
    deliveryId: string,
    event: string,
    repository: string,
    status: WebhookDeliveryStatus,
    error?: string,
  ): WebhookDelivery {
    const delivery: WebhookDelivery = {
      id: randomUUID(),
      deliveryId,
      event,
      repository,
      status,
      timestamp: new Date(),
      error,
    };
    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }

  /** Updates the status of an existing delivery record. */
  updateDeliveryStatus(
    id: string,
    status: WebhookDeliveryStatus,
    error?: string,
  ): WebhookDelivery | undefined {
    const delivery = this.deliveries.get(id);
    if (!delivery) return undefined;
    delivery.status = status;
    if (error !== undefined) delivery.error = error;
    return delivery;
  }

  /** Returns recent delivery records, newest first. */
  listDeliveries(limit = 50): WebhookDelivery[] {
    return Array.from(this.deliveries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Mapping management
  // ---------------------------------------------------------------------------

  /** Creates or updates the mapping for a repository. */
  upsertMapping(
    data: Omit<RepoProjectMapping, 'id' | 'createdAt' | 'updatedAt'>,
  ): RepoProjectMapping {
    const existing = Array.from(this.mappings.values()).find(
      (m) => m.repositoryFullName === data.repositoryFullName,
    );

    if (existing) {
      const updated: RepoProjectMapping = {
        ...existing,
        ...data,
        updatedAt: new Date(),
      };
      this.mappings.set(existing.id, updated);
      return updated;
    }

    const mapping: RepoProjectMapping = {
      id: randomUUID(),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.mappings.set(mapping.id, mapping);
    return mapping;
  }

  /** Removes a mapping by its ID. Returns `false` if not found. */
  deleteMapping(id: string): boolean {
    return this.mappings.delete(id);
  }

  /** Returns all registered repository-to-project mappings. */
  listMappings(): RepoProjectMapping[] {
    return Array.from(this.mappings.values());
  }

  /** Looks up the mapping for a given full repository name. */
  findMapping(repositoryFullName: string): RepoProjectMapping | undefined {
    return Array.from(this.mappings.values()).find(
      (m) => m.repositoryFullName === repositoryFullName,
    );
  }

  // ---------------------------------------------------------------------------
  // Event processing
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` when `branch` matches at least one filter.
   *
   * Filter rules:
   * - Exact match: `"main"` matches only `"main"`
   * - Wildcard suffix: `"staging/*"` matches any branch starting with `"staging/"`
   * - Empty filters array: all branches are allowed
   */
  matchesBranchFilter(branch: string, filters: string[]): boolean {
    if (filters.length === 0) return true;

    return filters.some((filter) => {
      if (filter.endsWith('/*')) {
        const prefix = filter.slice(0, -2);
        return branch.startsWith(`${prefix}/`);
      }
      return branch === filter;
    });
  }

  /**
   * Validates and enriches an incoming webhook event against the registered
   * mappings and configured filters.
   *
   * Returns `null` when the event should be silently ignored (no mapping,
   * wrong event type, branch filtered out, etc.).
   */
  processEvent(
    eventType: string,
    deliveryId: string,
    rawPayload: GitHubWebhookPayload,
  ): ProcessedWebhookEvent | null {
    const repository = this.extractRepository(rawPayload);
    if (!repository) return null;

    const mapping = this.findMapping(repository);
    if (!mapping) return null;

    if (!mapping.eventTypes.includes(eventType as GitHubEventType)) return null;

    if (eventType === 'push') {
      const pushPayload = rawPayload as GitHubPushPayload;
      const branch = pushPayload.ref?.replace('refs/heads/', '') ?? '';
      if (!this.matchesBranchFilter(branch, mapping.branchFilters)) return null;
    }

    if (eventType === 'pull_request') {
      const prPayload = rawPayload as GitHubPullRequestPayload;
      const baseBranch = prPayload.pull_request?.base?.ref ?? '';
      if (!this.matchesBranchFilter(baseBranch, mapping.branchFilters)) return null;
    }

    return { eventType, deliveryId, repository, payload: rawPayload, mapping };
  }

  private extractRepository(payload: GitHubWebhookPayload): string | null {
    const p = payload as Record<string, unknown>;
    const repo = p['repository'] as Record<string, unknown> | undefined;
    if (!repo) return null;
    const fullName = repo['full_name'];
    return typeof fullName === 'string' ? fullName : null;
  }
}
