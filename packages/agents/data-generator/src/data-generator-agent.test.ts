import { DataGeneratorAgent } from './data-generator-agent';

const CSV_CONTENT = `name,email,age
Alice,alice@example.com,30
Bob,bob@example.com,25`;

const JSON_CONTENT = JSON.stringify([
  { product: 'Widget', price: '9.99' },
  { product: 'Gadget', price: '19.99' },
  { product: 'Doohickey', price: '4.99' },
]);

async function createInitializedAgent(seed = 42): Promise<DataGeneratorAgent> {
  const agent = new DataGeneratorAgent({
    name: 'DataGeneratorAgent',
    version: '1.0.0',
    description: 'Test data generator for SemkiEst',
    seed,
  });
  await agent.initialize();
  return agent;
}

describe('DataGeneratorAgent', () => {
  // ---- Lifecycle -----------------------------------------------------------

  describe('lifecycle', () => {
    it('is not initialized before initialize() is called', () => {
      const agent = new DataGeneratorAgent({ name: 'Test', version: '1.0.0' });
      expect(agent.isInitialized()).toBe(false);
    });

    it('is initialized after initialize() is called', async () => {
      const agent = await createInitializedAgent();
      expect(agent.isInitialized()).toBe(true);
    });

    it('exposes name and version', async () => {
      const agent = await createInitializedAgent();
      expect(agent.getName()).toBe('DataGeneratorAgent');
      expect(agent.getVersion()).toBe('1.0.0');
    });

    it('returns a failure when execute() is called before initialize()', async () => {
      const agent = new DataGeneratorAgent({ name: 'Test', version: '1.0.0' });
      const result = await agent.execute({ projectId: 'p' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('initialized');
    });
  });

  // ---- userProfiles mode ---------------------------------------------------

  describe("mode: 'userProfiles'", () => {
    it('generates one profile by default', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' }, { mode: 'userProfiles' });

      expect(result.success).toBe(true);
      expect(result.data?.userProfiles).toHaveLength(1);
    });

    it('generates the requested number of profiles', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'userProfiles', profileCount: 5 },
      );

      expect(result.success).toBe(true);
      expect(result.data?.userProfiles).toHaveLength(5);
    });

    it('each profile has required fields', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' }, { mode: 'userProfiles' });
      const profile = result.data?.userProfiles?.[0];

      expect(profile).toHaveProperty('id');
      expect(profile).toHaveProperty('email');
      expect(profile).toHaveProperty('firstName');
      expect(profile).toHaveProperty('lastName');
      expect(profile).toHaveProperty('phone');
      expect(profile).toHaveProperty('address');
    });

    it('defaults to userProfiles mode when no mode is specified', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' });

      expect(result.success).toBe(true);
      expect(result.data?.userProfiles).toBeDefined();
    });
  });

  // ---- fieldValues mode ----------------------------------------------------

  describe("mode: 'fieldValues'", () => {
    it('generates values for each specified field', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        {
          mode: 'fieldValues',
          fields: [{ name: 'email' }, { name: 'firstName' }],
          valuesPerField: 3,
        },
      );

      expect(result.success).toBe(true);
      expect(result.data?.fieldValues?.['email']).toHaveLength(3);
      expect(result.data?.fieldValues?.['firstName']).toHaveLength(3);
    });

    it('respects explicit type override', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        {
          mode: 'fieldValues',
          fields: [{ name: 'myField', type: 'integer', options: { min: 5, max: 5 } }],
          valuesPerField: 2,
        },
      );

      const values = result.data?.fieldValues?.['myField'] ?? [];
      expect(values.every((v) => v === 5)).toBe(true);
    });

    it('returns an empty object when no fields are provided', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'fieldValues', fields: [] },
      );

      expect(result.success).toBe(true);
      expect(result.data?.fieldValues).toEqual({});
    });

    it('defaults to 1 value per field', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'fieldValues', fields: [{ name: 'email' }] },
      );

      expect(result.data?.fieldValues?.['email']).toHaveLength(1);
    });
  });

  // ---- edgeCases mode ------------------------------------------------------

  describe("mode: 'edgeCases'", () => {
    it('generates edge cases', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' }, { mode: 'edgeCases' });

      expect(result.success).toBe(true);
      expect((result.data?.edgeCases ?? []).length).toBeGreaterThan(0);
    });

    it('filters by requested categories', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'edgeCases', edgeCaseCategories: ['sqlInjection'] },
      );

      const categories = (result.data?.edgeCases ?? []).map((ec) => ec.category);
      expect(categories.every((c) => c === 'sqlInjection')).toBe(true);
    });

    it('includes all categories when "all" is specified', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'edgeCases', edgeCaseCategories: ['all'] },
      );

      const categories = new Set((result.data?.edgeCases ?? []).map((ec) => ec.category));
      expect(categories.size).toBeGreaterThan(3);
    });
  });

  // ---- datasetSample mode --------------------------------------------------

  describe("mode: 'datasetSample'", () => {
    it('returns rows from a pre-loaded dataset', async () => {
      const agent = await createInitializedAgent();
      const { datasetId } = await agent.importCsv(CSV_CONTENT, {
        name: 'Users',
        projectId: 'p',
      });

      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'datasetSample', datasetId, sampleCount: 1 },
      );

      expect(result.success).toBe(true);
      expect(result.data?.datasetRows).toHaveLength(1);
    });

    it('returns an empty array when no datasetId is provided', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        { mode: 'datasetSample' },
      );

      expect(result.success).toBe(true);
      expect(result.data?.datasetRows).toHaveLength(0);
    });
  });

  // ---- fullSuite mode ------------------------------------------------------

  describe("mode: 'fullSuite'", () => {
    it('populates userProfiles, fieldValues, and edgeCases', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        {
          mode: 'fullSuite',
          profileCount: 2,
          fields: [{ name: 'email' }],
          edgeCaseCategories: ['empty'],
        },
      );

      expect(result.success).toBe(true);
      expect(result.data?.userProfiles).toHaveLength(2);
      expect(result.data?.fieldValues?.['email']).toHaveLength(1);
      expect((result.data?.edgeCases ?? []).length).toBeGreaterThan(0);
    });
  });

  // ---- Inline dataset import -----------------------------------------------

  describe('inline importCsv in execute()', () => {
    it('returns the import result in the output', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        {
          mode: 'userProfiles',
          importCsv: {
            content: CSV_CONTENT,
            options: { name: 'Inline CSV', projectId: 'p' },
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.data?.importResult?.success).toBe(true);
    });
  });

  describe('inline importJson in execute()', () => {
    it('returns the import result in the output', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute(
        { projectId: 'p' },
        {
          mode: 'userProfiles',
          importJson: {
            content: JSON_CONTENT,
            options: { name: 'Inline JSON', projectId: 'p' },
          },
        },
      );

      expect(result.success).toBe(true);
      expect(result.data?.importResult?.success).toBe(true);
    });
  });

  // ---- Dataset management API ----------------------------------------------

  describe('importCsv() / importJson() public API', () => {
    it('importCsv stores a dataset in the library', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.importCsv(CSV_CONTENT, {
        name: 'Direct CSV',
        projectId: 'proj',
      });

      expect(result.success).toBe(true);
      expect(agent.getDataset(result.datasetId!)).toBeDefined();
    });

    it('importJson stores a dataset in the library', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.importJson(JSON_CONTENT, {
        name: 'Direct JSON',
        projectId: 'proj',
      });

      expect(result.success).toBe(true);
      expect(agent.getDataset(result.datasetId!)).toBeDefined();
    });

    it('listDatasets returns datasets scoped to a project', async () => {
      const agent = await createInitializedAgent();
      await agent.importCsv(CSV_CONTENT, { name: 'A', projectId: 'proj-a' });
      await agent.importJson(JSON_CONTENT, { name: 'B', projectId: 'proj-b' });

      expect(agent.listDatasets('proj-a')).toHaveLength(1);
      expect(agent.listDatasets('proj-b')).toHaveLength(1);
    });
  });

  // ---- analyzeFields -------------------------------------------------------

  describe('analyzeFields()', () => {
    it('returns a map of field names to inferred types', async () => {
      const agent = await createInitializedAgent();
      const analysis = agent.analyzeFields(['email', 'firstName', 'age']);

      expect(analysis['email']).toBe('email');
      expect(analysis['firstName']).toBe('firstName');
      expect(analysis['age']).toBe('integer');
    });

    it('returns an empty object for an empty field list', async () => {
      const agent = await createInitializedAgent();
      expect(agent.analyzeFields([])).toEqual({});
    });
  });

  // ---- Result metadata -----------------------------------------------------

  describe('result metadata', () => {
    it('result includes a timestamp', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' }, { mode: 'userProfiles' });

      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('result.success is true on success', async () => {
      const agent = await createInitializedAgent();
      const result = await agent.execute({ projectId: 'p' }, { mode: 'userProfiles' });
      expect(result.success).toBe(true);
    });
  });
});
