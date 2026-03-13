import {
  ProfileService,
  validateCronExpression,
  validateNotificationEndpoints,
  type ProfileRepository,
} from './profile-service';
import { AppError } from '../middleware/error-handler';
import type {
  Profile,
  ProfileVersion,
  ProfileQueryParams,
  CreateProfileInput,
} from '@semkiest/shared-types';

// ---------------------------------------------------------------------------
// Test repository stub
// ---------------------------------------------------------------------------

function makeRepo(): ProfileRepository & {
  _profiles: Map<string, Profile>;
  _versions: Map<string, ProfileVersion[]>;
} {
  const profiles = new Map<string, Profile>();
  const versions = new Map<string, ProfileVersion[]>();

  return {
    _profiles: profiles,
    _versions: versions,
    async findById(id) {
      return profiles.get(id) ?? null;
    },
    async findAll(query: ProfileQueryParams) {
      let results = Array.from(profiles.values());
      if (query.projectId !== undefined) {
        results = results.filter((p) => p.projectId === query.projectId);
      }
      if (query.isDefault !== undefined) {
        results = results.filter((p) => p.isDefault === query.isDefault);
      }
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const total = results.length;
      const start = (page - 1) * limit;
      return { profiles: results.slice(start, start + limit), total };
    },
    async save(profile) {
      profiles.set(profile.id, profile);
      return profile;
    },
    async delete(id) {
      return profiles.delete(id);
    },
    async saveVersion(v) {
      const list = versions.get(v.profileId) ?? [];
      versions.set(v.profileId, [...list, v]);
    },
    async findVersions(profileId) {
      return (versions.get(profileId) ?? []).sort((a, b) => b.version - a.version);
    },
    async findVersion(profileId, versionId) {
      return (versions.get(profileId) ?? []).find((v) => v.id === versionId) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// validateCronExpression
// ---------------------------------------------------------------------------

describe('validateCronExpression', () => {
  it('accepts valid 5-field cron expressions', () => {
    expect(validateCronExpression('0 2 * * *')).toBeNull();
    expect(validateCronExpression('*/15 * * * *')).toBeNull();
    expect(validateCronExpression('0 0 1 1 *')).toBeNull();
    expect(validateCronExpression('0 3 * * 0')).toBeNull();
  });

  it('rejects empty expressions', () => {
    expect(validateCronExpression('')).not.toBeNull();
    expect(validateCronExpression('   ')).not.toBeNull();
  });

  it('rejects invalid cron expressions', () => {
    expect(validateCronExpression('not-a-cron')).not.toBeNull();
    expect(validateCronExpression('99 99 99 99 99')).not.toBeNull();
    expect(validateCronExpression('* * *')).not.toBeNull(); // too few fields
  });
});

// ---------------------------------------------------------------------------
// validateNotificationEndpoints
// ---------------------------------------------------------------------------

describe('validateNotificationEndpoints', () => {
  it('returns empty array for valid https webhook', () => {
    const errors = validateNotificationEndpoints({
      webhooks: [{ enabled: true, url: 'https://example.com/hook', onSuccess: true, onFailure: true }],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects http (non-https) webhook', () => {
    const errors = validateNotificationEndpoints({
      webhooks: [{ enabled: true, url: 'http://example.com/hook', onSuccess: false, onFailure: true }],
    });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/HTTPS/i);
  });

  it('rejects invalid webhook URL', () => {
    const errors = validateNotificationEndpoints({
      webhooks: [{ enabled: true, url: 'not-a-url', onSuccess: false, onFailure: true }],
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects enabled slack with http URL', () => {
    const errors = validateNotificationEndpoints({
      slack: { enabled: true, webhookUrl: 'http://hooks.slack.com/xxx', channel: '#test', onSuccess: false, onFailure: true },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects enabled email with no recipients', () => {
    const errors = validateNotificationEndpoints({
      email: { enabled: true, recipients: [], onSuccess: false, onFailure: true },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid email address', () => {
    const errors = validateNotificationEndpoints({
      email: { enabled: true, recipients: ['not-an-email'], onSuccess: false, onFailure: true },
    });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('skips disabled webhooks', () => {
    const errors = validateNotificationEndpoints({
      webhooks: [{ enabled: false, url: 'http://bad-url', onSuccess: false, onFailure: false }],
    });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ProfileService CRUD
// ---------------------------------------------------------------------------

function makeService(): { service: ProfileService; repo: ReturnType<typeof makeRepo> } {
  const repo = makeRepo();
  const service = new ProfileService(repo);
  return { service, repo };
}

const baseInput: CreateProfileInput = {
  projectId: '00000000-0000-0000-0000-000000000001',
  name: 'My Profile',
  description: 'A test profile',
  tags: ['ci', 'fast'],
};

describe('ProfileService.createProfile', () => {
  it('creates a profile with version 1', async () => {
    const { service } = makeService();
    const profile = await service.createProfile(baseInput);
    expect(profile.name).toBe('My Profile');
    expect(profile.version).toBe(1);
    expect(profile.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(profile.projectId).toBe(baseInput.projectId);
  });

  it('records an initial version snapshot', async () => {
    const { service, repo } = makeService();
    const profile = await service.createProfile(baseInput);
    const versionList = await repo.findVersions(profile.id);
    expect(versionList).toHaveLength(1);
    expect(versionList[0]?.version).toBe(1);
  });

  it('rejects an invalid cron expression', async () => {
    const { service } = makeService();
    await expect(
      service.createProfile({ ...baseInput, cronExpression: 'bad cron' }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('accepts a valid cron expression', async () => {
    const { service } = makeService();
    const profile = await service.createProfile({ ...baseInput, cronExpression: '0 2 * * *' });
    expect(profile.cronExpression).toBe('0 2 * * *');
  });

  it('rejects invalid notification endpoint', async () => {
    const { service } = makeService();
    await expect(
      service.createProfile({
        ...baseInput,
        notificationPreferences: {
          webhooks: [{ enabled: true, url: 'http://not-https.com', onSuccess: true, onFailure: true }],
        },
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('clears other defaults when isDefault is true', async () => {
    const { service, repo } = makeService();
    const first = await service.createProfile({ ...baseInput, name: 'First', isDefault: true });
    expect(first.isDefault).toBe(true);
    const second = await service.createProfile({ ...baseInput, name: 'Second', isDefault: true });
    // first should no longer be default
    const updatedFirst = await repo.findById(first.id);
    expect(updatedFirst?.isDefault).toBe(false);
    expect(second.isDefault).toBe(true);
  });
});

describe('ProfileService.getProfile', () => {
  it('returns the profile when found', async () => {
    const { service } = makeService();
    const created = await service.createProfile(baseInput);
    const fetched = await service.getProfile(created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('throws 404 for unknown id', async () => {
    const { service } = makeService();
    await expect(service.getProfile('nonexistent-id')).rejects.toThrow(AppError);
  });
});

describe('ProfileService.updateProfile', () => {
  it('increments version on update', async () => {
    const { service } = makeService();
    const profile = await service.createProfile(baseInput);
    const updated = await service.updateProfile(profile.id, { name: 'Renamed' });
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('Renamed');
  });

  it('creates a version snapshot on update', async () => {
    const { service, repo } = makeService();
    const profile = await service.createProfile(baseInput);
    await service.updateProfile(profile.id, { name: 'Renamed', changeNote: 'Test rename' });
    const versions = await repo.findVersions(profile.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.changeNote).toBe('Test rename');
  });

  it('clears cron expression when set to null', async () => {
    const { service } = makeService();
    const profile = await service.createProfile({ ...baseInput, cronExpression: '0 2 * * *' });
    const updated = await service.updateProfile(profile.id, { cronExpression: null });
    expect(updated.cronExpression).toBeNull();
  });
});

describe('ProfileService.deleteProfile', () => {
  it('deletes an existing profile', async () => {
    const { service } = makeService();
    const profile = await service.createProfile(baseInput);
    await expect(service.deleteProfile(profile.id)).resolves.toBeUndefined();
    await expect(service.getProfile(profile.id)).rejects.toThrow(AppError);
  });

  it('throws 404 when deleting unknown id', async () => {
    const { service } = makeService();
    await expect(service.deleteProfile('ghost-id')).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// Version history & revert
// ---------------------------------------------------------------------------

describe('ProfileService version history', () => {
  it('returns versions in descending order', async () => {
    const { service } = makeService();
    const profile = await service.createProfile(baseInput);
    await service.updateProfile(profile.id, { name: 'v2' });
    await service.updateProfile(profile.id, { name: 'v3' });
    const versions = await service.getProfileVersions(profile.id);
    expect(versions[0]?.version).toBe(3);
    expect(versions[2]?.version).toBe(1);
  });

  it('reverts to a previous version', async () => {
    const { service } = makeService();
    const profile = await service.createProfile({ ...baseInput, name: 'Original' });
    await service.updateProfile(profile.id, { name: 'Changed' });
    const versions = await service.getProfileVersions(profile.id);
    const v1 = versions.find((v) => v.version === 1);
    expect(v1).toBeDefined();

    const reverted = await service.revertToVersion(profile.id, v1!.id);
    expect(reverted.name).toBe('Original');
    expect(reverted.version).toBe(3);
  });

  it('throws 404 when reverting to unknown version', async () => {
    const { service } = makeService();
    const profile = await service.createProfile(baseInput);
    await expect(service.revertToVersion(profile.id, 'bad-version-id')).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// Duplication
// ---------------------------------------------------------------------------

describe('ProfileService.duplicateProfile', () => {
  it('duplicates to another project', async () => {
    const { service } = makeService();
    const source = await service.createProfile({
      ...baseInput,
      name: 'Source',
      notificationPreferences: {
        webhooks: [{ enabled: true, url: 'https://staging.example.com/hook', onSuccess: true, onFailure: true }],
      },
    });

    const dup = await service.duplicateProfile(source.id, {
      targetProjectId: '00000000-0000-0000-0000-000000000099',
      variableSubstitutions: { 'staging.example.com': 'prod.example.com' },
    });

    expect(dup.projectId).toBe('00000000-0000-0000-0000-000000000099');
    expect(dup.id).not.toBe(source.id);
    expect(dup.isDefault).toBe(false);
    // Webhook URL should have substitution applied
    expect(dup.notificationPreferences?.webhooks[0]?.url).toBe('https://prod.example.com/hook');
  });

  it('uses provided name override', async () => {
    const { service } = makeService();
    const source = await service.createProfile(baseInput);
    const dup = await service.duplicateProfile(source.id, {
      targetProjectId: '00000000-0000-0000-0000-000000000099',
      name: 'My Copy',
    });
    expect(dup.name).toBe('My Copy');
  });

  it('throws 404 when source not found', async () => {
    const { service } = makeService();
    await expect(
      service.duplicateProfile('ghost-id', { targetProjectId: 'some-project' }),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// Template-based creation
// ---------------------------------------------------------------------------

describe('ProfileService.createFromTemplate', () => {
  it('creates a smoke-test profile from template', async () => {
    const { service } = makeService();
    const profile = await service.createFromTemplate('smoke-test', baseInput.projectId);
    expect(profile.templateType).toBe('smoke-test');
    expect(profile.testCategories.smoke.enabled).toBe(true);
    expect(profile.testCategories.performance.enabled).toBe(false);
  });

  it('creates a full-regression profile from template', async () => {
    const { service } = makeService();
    const profile = await service.createFromTemplate('full-regression', baseInput.projectId);
    expect(profile.templateType).toBe('full-regression');
    expect(profile.testCategories.regression.enabled).toBe(true);
    expect(profile.testCategories.performance.enabled).toBe(true);
    expect(profile.testCategories.accessibility.enabled).toBe(true);
  });

  it('allows name override', async () => {
    const { service } = makeService();
    const profile = await service.createFromTemplate('smoke-test', baseInput.projectId, {
      name: 'Custom Smoke',
    });
    expect(profile.name).toBe('Custom Smoke');
  });

  it('throws on unknown template type', async () => {
    const { service } = makeService();
    await expect(
      service.createFromTemplate('unknown-type' as never, baseInput.projectId),
    ).rejects.toBeInstanceOf(AppError);
  });
});

// ---------------------------------------------------------------------------
// listTemplates
// ---------------------------------------------------------------------------

describe('ProfileService.listTemplates', () => {
  it('returns all 4 built-in templates', () => {
    const { service } = makeService();
    const templates = service.listTemplates();
    expect(templates).toHaveLength(4);
    const types = templates.map((t) => t.templateType);
    expect(types).toContain('smoke-test');
    expect(types).toContain('full-regression');
    expect(types).toContain('performance-only');
    expect(types).toContain('accessibility-audit');
  });
});

// ---------------------------------------------------------------------------
// listProfiles — search / filter
// ---------------------------------------------------------------------------

describe('ProfileService.listProfiles', () => {
  it('filters by projectId', async () => {
    const { service } = makeService();
    await service.createProfile({ ...baseInput, projectId: 'proj-a', name: 'A' });
    await service.createProfile({ ...baseInput, projectId: 'proj-b', name: 'B' });
    const result = await service.listProfiles({ projectId: 'proj-a' });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]?.name).toBe('A');
  });

  it('filters by search term (name match)', async () => {
    const { service } = makeService();
    await service.createProfile({ ...baseInput, name: 'Nightly Smoke' });
    await service.createProfile({ ...baseInput, name: 'Performance Baseline' });
    const result = await service.listProfiles({ search: 'smoke' });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]?.name).toBe('Nightly Smoke');
  });

  it('filters by tags', async () => {
    const { service } = makeService();
    await service.createProfile({ ...baseInput, name: 'Tagged', tags: ['nightly', 'regression'] });
    await service.createProfile({ ...baseInput, name: 'Untagged', tags: ['quick'] });
    const result = await service.listProfiles({ tags: 'nightly' });
    expect(result.profiles).toHaveLength(1);
  });

  it('paginates results', async () => {
    const { service } = makeService();
    for (let i = 0; i < 5; i++) {
      await service.createProfile({ ...baseInput, name: `Profile ${i}` });
    }
    const page1 = await service.listProfiles({ limit: 2, page: 1 });
    expect(page1.profiles).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);

    const page3 = await service.listProfiles({ limit: 2, page: 3 });
    expect(page3.profiles).toHaveLength(1);
  });
});
