import { v4 as uuidv4 } from 'uuid';
import cronParser from 'cron-parser';
import type {
  Profile,
  ProfileVersion,
  ProfileSettingsSnapshot,
  CreateProfileInput,
  UpdateProfileInput,
  DuplicateProfileInput,
  ProfileQueryParams,
  ProfileListResponse,
  ProfileTemplateType,
  TestCategoryConfig,
  NotificationPreferences,
  AutoRunTriggers,
} from '@semkiest/shared-types';
import { AppError } from '../middleware/error-handler';
import { getProfileTemplate, listProfileTemplates } from './templates/default-profiles';
import type { ProfileTemplate } from './templates/default-profiles';

// ---------------------------------------------------------------------------
// Repository interface — decoupled from persistence layer
// Replace the in-memory implementation with a Prisma-backed one when
// the database (SEM-37) migrations are in place.
// ---------------------------------------------------------------------------

export interface ProfileRepository {
  findById(id: string): Promise<Profile | null>;
  findAll(query: ProfileQueryParams): Promise<{ profiles: Profile[]; total: number }>;
  save(profile: Profile): Promise<Profile>;
  delete(id: string): Promise<boolean>;
  saveVersion(version: ProfileVersion): Promise<void>;
  findVersions(profileId: string): Promise<ProfileVersion[]>;
  findVersion(profileId: string, versionId: string): Promise<ProfileVersion | null>;
}

// ---------------------------------------------------------------------------
// In-memory repository (development / test)
// ---------------------------------------------------------------------------

class InMemoryProfileRepository implements ProfileRepository {
  private readonly profiles = new Map<string, Profile>();
  private readonly versions = new Map<string, ProfileVersion[]>();

  async findById(id: string): Promise<Profile | null> {
    return this.profiles.get(id) ?? null;
  }

  async findAll(query: ProfileQueryParams): Promise<{ profiles: Profile[]; total: number }> {
    let results = Array.from(this.profiles.values());

    if (query.projectId !== undefined) {
      results = results.filter((p) => p.projectId === query.projectId);
    }

    if (query.isDefault !== undefined) {
      results = results.filter((p) => p.isDefault === query.isDefault);
    }

    if (query.isTemplate !== undefined) {
      results = results.filter((p) => p.isTemplate === query.isTemplate);
    }

    if (query.templateType !== undefined) {
      results = results.filter((p) => p.templateType === query.templateType);
    }

    if (query.tags !== undefined && query.tags.trim().length > 0) {
      const filterTags = query.tags.split(',').map((t) => t.trim().toLowerCase());
      results = results.filter((p) =>
        filterTags.some((tag) => p.tags.map((t) => t.toLowerCase()).includes(tag)),
      );
    }

    if (query.search !== undefined && query.search.trim().length > 0) {
      const term = query.search.trim().toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          (p.description?.toLowerCase().includes(term) ?? false) ||
          p.tags.some((t) => t.toLowerCase().includes(term)) ||
          (p.templateType?.toLowerCase().includes(term) ?? false),
      );
    }

    const total = results.length;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    const paged = results.slice(start, start + limit);

    return { profiles: paged, total };
  }

  async save(profile: Profile): Promise<Profile> {
    this.profiles.set(profile.id, profile);
    return profile;
  }

  async delete(id: string): Promise<boolean> {
    return this.profiles.delete(id);
  }

  async saveVersion(version: ProfileVersion): Promise<void> {
    const existing = this.versions.get(version.profileId) ?? [];
    this.versions.set(version.profileId, [...existing, version]);
  }

  async findVersions(profileId: string): Promise<ProfileVersion[]> {
    return (this.versions.get(profileId) ?? []).sort((a, b) => b.version - a.version);
  }

  async findVersion(profileId: string, versionId: string): Promise<ProfileVersion | null> {
    const list = this.versions.get(profileId) ?? [];
    return list.find((v) => v.id === versionId) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validates a 5-field standard cron expression using cron-parser.
 * Returns an error message string, or null if valid.
 */
export function validateCronExpression(expression: string): string | null {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return 'Cron expression must not be empty';
  }

  try {
    cronParser.parseExpression(trimmed, { iterator: false });
    return null;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return `Invalid cron expression: ${message}`;
  }
}

/**
 * Validates notification endpoint URLs (Slack webhook, custom webhooks).
 * Returns an array of validation error messages.
 */
export function validateNotificationEndpoints(
  prefs: Partial<NotificationPreferences>,
): string[] {
  const errors: string[] = [];

  if (prefs.slack?.enabled && prefs.slack.webhookUrl !== undefined) {
    try {
      const u = new URL(prefs.slack.webhookUrl);
      if (u.protocol !== 'https:') {
        errors.push('Slack webhook URL must use HTTPS');
      }
    } catch {
      errors.push(`Invalid Slack webhook URL: "${prefs.slack.webhookUrl}"`);
    }
  }

  if (prefs.webhooks !== undefined) {
    prefs.webhooks.forEach((wh, idx) => {
      if (!wh.enabled) return;
      try {
        const u = new URL(wh.url);
        if (u.protocol !== 'https:') {
          errors.push(`Webhook[${idx}] URL must use HTTPS`);
        }
      } catch {
        errors.push(`Invalid webhook URL at index ${idx}: "${wh.url}"`);
      }
    });
  }

  if (prefs.email?.enabled) {
    const recipients = prefs.email.recipients ?? [];
    if (recipients.length === 0) {
      errors.push('Email notifications require at least one recipient address');
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    recipients.forEach((addr, idx) => {
      if (!emailRegex.test(addr)) {
        errors.push(`Invalid email address at recipients[${idx}]: "${addr}"`);
      }
    });
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Default value builders
// ---------------------------------------------------------------------------

function buildDefaultTestCategories(): TestCategoryConfig {
  return {
    smoke: { enabled: false },
    regression: {
      enabled: false,
      browsers: ['chromium'],
      viewports: [{ width: 1280, height: 720, name: 'desktop' }],
    },
    performance: {
      enabled: false,
      concurrentUsers: 1,
      rampUpSeconds: 0,
      holdSeconds: 60,
      thresholds: { p95ResponseTimeMs: 2000, errorRatePercent: 5, requestsPerSecond: 1 },
    },
    accessibility: { enabled: false, wcagLevel: 'AA', includeWarnings: false },
  };
}

function buildDefaultNotificationPreferences(): NotificationPreferences {
  return {
    email: { enabled: false, recipients: [], onSuccess: false, onFailure: true },
    slack: { enabled: false, webhookUrl: '', channel: '', onSuccess: false, onFailure: true },
    webhooks: [],
  };
}

function buildDefaultAutoRunTriggers(): AutoRunTriggers {
  return {
    onDeploy: false,
    onPullRequest: false,
    onSchedule: false,
    deployEnvironments: [],
    pullRequestBranches: [],
  };
}

/**
 * Deep-merges partial test category config on top of a base config.
 * Handles nested objects without losing unspecified keys.
 */
function mergeTestCategories(
  base: TestCategoryConfig,
  overrides: Partial<TestCategoryConfig>,
): TestCategoryConfig {
  return {
    smoke: { ...base.smoke, ...overrides.smoke },
    regression: { ...base.regression, ...overrides.regression },
    performance: {
      ...base.performance,
      ...overrides.performance,
      thresholds: {
        ...base.performance.thresholds,
        ...overrides.performance?.thresholds,
      },
    },
    accessibility: { ...base.accessibility, ...overrides.accessibility },
  };
}

function mergeNotificationPreferences(
  base: NotificationPreferences,
  overrides: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    email: { ...base.email, ...overrides.email },
    slack: { ...base.slack, ...overrides.slack },
    webhooks: overrides.webhooks ?? base.webhooks,
  };
}

function mergeAutoRunTriggers(
  base: AutoRunTriggers,
  overrides: Partial<AutoRunTriggers>,
): AutoRunTriggers {
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// Snapshot helper
// ---------------------------------------------------------------------------

function snapshotSettings(profile: Profile): ProfileSettingsSnapshot {
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    id: _id,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    createdAt: _createdAt,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updatedAt: _updatedAt,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    version: _version,
    ...snapshot
  } = profile;
  return snapshot;
}

// ---------------------------------------------------------------------------
// Profile service
// ---------------------------------------------------------------------------

export class ProfileService {
  constructor(private readonly repo: ProfileRepository = new InMemoryProfileRepository()) {}

  // -------------------------------------------------------------------------
  // CRUD
  // -------------------------------------------------------------------------

  async listProfiles(query: ProfileQueryParams): Promise<ProfileListResponse> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const { profiles, total } = await this.repo.findAll({ ...query, page, limit });
    return { profiles, total, page, limit };
  }

  async getProfile(id: string): Promise<Profile> {
    const profile = await this.repo.findById(id);
    if (profile === null) {
      throw new AppError(404, `Profile not found: ${id}`, 'PROFILE_NOT_FOUND');
    }
    return profile;
  }

  async createProfile(input: CreateProfileInput): Promise<Profile> {
    // Validate cron expression if provided
    if (input.cronExpression !== undefined && input.cronExpression.trim().length > 0) {
      const cronError = validateCronExpression(input.cronExpression);
      if (cronError !== null) {
        throw new AppError(422, cronError, 'INVALID_CRON_EXPRESSION');
      }
    }

    // Validate notification endpoints if provided
    if (input.notificationPreferences !== undefined) {
      const notifErrors = validateNotificationEndpoints(input.notificationPreferences);
      if (notifErrors.length > 0) {
        throw new AppError(422, notifErrors.join('; '), 'INVALID_NOTIFICATION_CONFIG', notifErrors);
      }
    }

    const baseCategories = buildDefaultTestCategories();
    const baseNotifications = buildDefaultNotificationPreferences();
    const baseTriggers = buildDefaultAutoRunTriggers();

    const now = new Date().toISOString();
    const profile: Profile = {
      id: uuidv4(),
      projectId: input.projectId,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      isDefault: input.isDefault ?? false,
      isTemplate: input.isTemplate ?? false,
      templateType: input.templateType ?? null,
      tags: input.tags ?? [],
      testCategories:
        input.testCategories !== undefined
          ? mergeTestCategories(baseCategories, input.testCategories)
          : baseCategories,
      cronExpression: input.cronExpression?.trim() ?? null,
      notificationPreferences:
        input.notificationPreferences !== undefined
          ? mergeNotificationPreferences(baseNotifications, input.notificationPreferences)
          : null,
      autoRunTriggers:
        input.autoRunTriggers !== undefined
          ? mergeAutoRunTriggers(baseTriggers, input.autoRunTriggers)
          : null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    // If this profile is the new default for the project, clear other defaults
    if (profile.isDefault) {
      await this.clearProjectDefault(profile.projectId, profile.id);
    }

    const saved = await this.repo.save(profile);

    // Record initial version
    await this.repo.saveVersion({
      id: uuidv4(),
      profileId: saved.id,
      version: 1,
      settings: snapshotSettings(saved),
      changedBy: null,
      changeNote: input.changeNote ?? 'Initial version',
      createdAt: now,
    });

    return saved;
  }

  async updateProfile(id: string, input: UpdateProfileInput): Promise<Profile> {
    const existing = await this.getProfile(id);

    // Validate cron if being changed
    if (input.cronExpression !== undefined && input.cronExpression !== null) {
      const cronError = validateCronExpression(input.cronExpression);
      if (cronError !== null) {
        throw new AppError(422, cronError, 'INVALID_CRON_EXPRESSION');
      }
    }

    // Validate notification endpoints if being changed
    if (input.notificationPreferences !== undefined && input.notificationPreferences !== null) {
      const notifErrors = validateNotificationEndpoints(input.notificationPreferences);
      if (notifErrors.length > 0) {
        throw new AppError(422, notifErrors.join('; '), 'INVALID_NOTIFICATION_CONFIG', notifErrors);
      }
    }

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const updated: Profile = {
      ...existing,
      name: input.name !== undefined ? input.name.trim() : existing.name,
      description:
        input.description !== undefined ? (input.description?.trim() ?? null) : existing.description,
      isDefault: input.isDefault ?? existing.isDefault,
      tags: input.tags ?? existing.tags,
      testCategories:
        input.testCategories !== undefined
          ? mergeTestCategories(existing.testCategories, input.testCategories)
          : existing.testCategories,
      cronExpression:
        input.cronExpression !== undefined ? (input.cronExpression?.trim() ?? null) : existing.cronExpression,
      notificationPreferences:
        input.notificationPreferences !== undefined
          ? input.notificationPreferences === null
            ? null
            : mergeNotificationPreferences(
                existing.notificationPreferences ?? buildDefaultNotificationPreferences(),
                input.notificationPreferences,
              )
          : existing.notificationPreferences,
      autoRunTriggers:
        input.autoRunTriggers !== undefined
          ? input.autoRunTriggers === null
            ? null
            : mergeAutoRunTriggers(
                existing.autoRunTriggers ?? buildDefaultAutoRunTriggers(),
                input.autoRunTriggers,
              )
          : existing.autoRunTriggers,
      version: newVersion,
      updatedAt: now,
    };

    if (updated.isDefault && !existing.isDefault) {
      await this.clearProjectDefault(updated.projectId, updated.id);
    }

    const saved = await this.repo.save(updated);

    // Record version snapshot
    await this.repo.saveVersion({
      id: uuidv4(),
      profileId: id,
      version: newVersion,
      settings: snapshotSettings(saved),
      changedBy: null,
      changeNote: input.changeNote ?? null,
      createdAt: now,
    });

    return saved;
  }

  async deleteProfile(id: string): Promise<void> {
    const exists = await this.repo.findById(id);
    if (exists === null) {
      throw new AppError(404, `Profile not found: ${id}`, 'PROFILE_NOT_FOUND');
    }
    await this.repo.delete(id);
  }

  // -------------------------------------------------------------------------
  // Version history
  // -------------------------------------------------------------------------

  async getProfileVersions(profileId: string): Promise<ProfileVersion[]> {
    // Ensure profile exists
    await this.getProfile(profileId);
    return this.repo.findVersions(profileId);
  }

  async revertToVersion(profileId: string, versionId: string): Promise<Profile> {
    const current = await this.getProfile(profileId);
    const targetVersion = await this.repo.findVersion(profileId, versionId);

    if (targetVersion === null) {
      throw new AppError(
        404,
        `Version ${versionId} not found for profile ${profileId}`,
        'VERSION_NOT_FOUND',
      );
    }

    const now = new Date().toISOString();
    const newVersion = current.version + 1;

    const reverted: Profile = {
      ...targetVersion.settings,
      id: profileId,
      version: newVersion,
      createdAt: current.createdAt,
      updatedAt: now,
    };

    const saved = await this.repo.save(reverted);

    await this.repo.saveVersion({
      id: uuidv4(),
      profileId,
      version: newVersion,
      settings: snapshotSettings(saved),
      changedBy: null,
      changeNote: `Reverted to version ${targetVersion.version}`,
      createdAt: now,
    });

    return saved;
  }

  // -------------------------------------------------------------------------
  // Profile duplication across projects
  // -------------------------------------------------------------------------

  async duplicateProfile(sourceId: string, input: DuplicateProfileInput): Promise<Profile> {
    const source = await this.getProfile(sourceId);

    const substitutions = input.variableSubstitutions ?? {};
    const applySubstitutions = (text: string): string =>
      Object.entries(substitutions).reduce(
        (acc, [from, to]) => acc.replaceAll(from, to),
        text,
      );

    // Apply substitutions to string fields and nested URLs
    const duplicatedNotifications =
      source.notificationPreferences !== null
        ? applySubstitutionsToNotifications(source.notificationPreferences, applySubstitutions)
        : null;

    const now = new Date().toISOString();
    const newProfile: Profile = {
      id: uuidv4(),
      projectId: input.targetProjectId,
      name: (input.name ?? `${source.name} (copy)`).trim(),
      description: source.description !== null ? applySubstitutions(source.description) : null,
      isDefault: false, // duplicated profiles are never default by default
      isTemplate: source.isTemplate,
      templateType: source.templateType,
      tags: source.tags,
      testCategories: source.testCategories,
      cronExpression: source.cronExpression,
      notificationPreferences: duplicatedNotifications,
      autoRunTriggers: source.autoRunTriggers,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.repo.save(newProfile);

    await this.repo.saveVersion({
      id: uuidv4(),
      profileId: saved.id,
      version: 1,
      settings: snapshotSettings(saved),
      changedBy: null,
      changeNote: `Duplicated from profile ${sourceId} in project ${source.projectId}`,
      createdAt: now,
    });

    return saved;
  }

  // -------------------------------------------------------------------------
  // Template-based creation
  // -------------------------------------------------------------------------

  async createFromTemplate(
    templateType: ProfileTemplateType,
    projectId: string,
    overrides?: Partial<Omit<CreateProfileInput, 'projectId' | 'templateType'>>,
  ): Promise<Profile> {
    const template = getProfileTemplate(templateType);
    if (template === undefined) {
      throw new AppError(400, `Unknown template type: ${templateType}`, 'UNKNOWN_TEMPLATE');
    }

    return this.createProfile({
      projectId,
      name: overrides?.name ?? template.name,
      description: overrides?.description ?? template.description,
      isDefault: overrides?.isDefault ?? false,
      isTemplate: false,
      templateType,
      tags: overrides?.tags ?? template.tags,
      testCategories: overrides?.testCategories ?? template.testCategories,
      cronExpression:
        overrides?.cronExpression ?? template.suggestedCronExpression ?? undefined,
      notificationPreferences:
        overrides?.notificationPreferences ?? template.notificationPreferences,
      autoRunTriggers: overrides?.autoRunTriggers ?? template.autoRunTriggers,
      changeNote: `Created from template: ${template.name}`,
    });
  }

  /**
   * Returns all available profile templates (not persisted profiles).
   */
  listTemplates(): ProfileTemplate[] {
    return listProfileTemplates();
  }

  // -------------------------------------------------------------------------
  // Default profile management
  // -------------------------------------------------------------------------

  async getDefaultProfile(projectId: string): Promise<Profile | null> {
    const { profiles } = await this.repo.findAll({ projectId, isDefault: true, limit: 1 });
    return profiles[0] ?? null;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async clearProjectDefault(projectId: string, excludeId: string): Promise<void> {
    const { profiles } = await this.repo.findAll({ projectId, isDefault: true, limit: 100 });
    for (const p of profiles) {
      if (p.id === excludeId) continue;
      await this.repo.save({ ...p, isDefault: false, updatedAt: new Date().toISOString() });
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: apply variable substitutions to notification URLs
// ---------------------------------------------------------------------------

function applySubstitutionsToNotifications(
  prefs: NotificationPreferences,
  apply: (text: string) => string,
): NotificationPreferences {
  return {
    email: prefs.email,
    slack: {
      ...prefs.slack,
      webhookUrl: apply(prefs.slack.webhookUrl),
      channel: apply(prefs.slack.channel),
    },
    webhooks: prefs.webhooks.map((wh) => ({ ...wh, url: apply(wh.url) })),
  };
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const profileService = new ProfileService();
