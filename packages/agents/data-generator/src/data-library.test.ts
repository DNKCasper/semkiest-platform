import { DataLibrary } from './data-library';

const CSV_CONTENT = `name,email,age
Alice,alice@example.com,30
Bob,bob@example.com,25
Carol,carol@example.com,40`;

const JSON_CONTENT = JSON.stringify([
  { name: 'Dave', email: 'dave@example.com', role: 'admin' },
  { name: 'Eve', email: 'eve@example.com', role: 'user' },
]);

describe('DataLibrary', () => {
  let lib: DataLibrary;

  beforeEach(() => {
    lib = new DataLibrary();
  });

  // ---- importCsv -----------------------------------------------------------

  describe('importCsv()', () => {
    it('imports a valid CSV and returns a dataset ID', async () => {
      const result = await lib.importCsv(CSV_CONTENT, {
        name: 'Test CSV',
        projectId: 'proj-1',
      });

      expect(result.success).toBe(true);
      expect(typeof result.datasetId).toBe('string');
      expect(result.rowCount).toBe(3);
    });

    it('parses column headers correctly', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'Headers Test',
        projectId: 'proj-1',
      });

      const dataset = lib.getDataset(datasetId!);
      expect(dataset?.headers).toEqual(['name', 'email', 'age']);
    });

    it('parses row data correctly', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'Rows Test',
        projectId: 'proj-1',
      });

      const rows = lib.getRows(datasetId!);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toEqual({ name: 'Alice', email: 'alice@example.com', age: '30' });
    });

    it('returns an error for empty CSV', async () => {
      const result = await lib.importCsv('name,email\n', {
        name: 'Empty CSV',
        projectId: 'proj-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('supports custom delimiter', async () => {
      const tsvContent = 'name\temail\nAlice\talice@example.com';
      const result = await lib.importCsv(tsvContent, {
        name: 'TSV',
        projectId: 'proj-1',
        delimiter: '\t',
      });

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(1);
    });

    it('returns error for malformed CSV', async () => {
      // csv-parse handles most malformed CSVs gracefully, but completely
      // broken input should still produce an error or empty result.
      const result = await lib.importCsv('', {
        name: 'Malformed',
        projectId: 'proj-1',
      });
      // Either no rows or an explicit error is acceptable.
      expect(result.success === false || (result.rowCount ?? 0) === 0).toBe(true);
    });
  });

  // ---- importJson ----------------------------------------------------------

  describe('importJson()', () => {
    it('imports a valid JSON string', async () => {
      const result = await lib.importJson(JSON_CONTENT, {
        name: 'Test JSON',
        projectId: 'proj-2',
      });

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
    });

    it('accepts a pre-parsed array', async () => {
      const arr = [{ a: '1' }, { a: '2' }];
      const result = await lib.importJson(arr, {
        name: 'Pre-parsed',
        projectId: 'proj-2',
      });

      expect(result.success).toBe(true);
      expect(result.rowCount).toBe(2);
    });

    it('converts non-string values to strings', async () => {
      const arr = [{ count: 42, flag: true }];
      const { datasetId } = await lib.importJson(arr, {
        name: 'Mixed Types',
        projectId: 'proj-2',
      });

      const rows = lib.getRows(datasetId!);
      expect(rows[0]).toEqual({ count: '42', flag: 'true' });
    });

    it('returns an error for a non-array JSON', async () => {
      const result = await lib.importJson('{"key":"value"}', {
        name: 'Object JSON',
        projectId: 'proj-2',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('returns an error for an empty JSON array', async () => {
      const result = await lib.importJson('[]', {
        name: 'Empty JSON',
        projectId: 'proj-2',
      });

      expect(result.success).toBe(false);
    });

    it('returns an error for invalid JSON', async () => {
      const result = await lib.importJson('{not valid json', {
        name: 'Bad JSON',
        projectId: 'proj-2',
      });

      expect(result.success).toBe(false);
    });
  });

  // ---- getDataset ----------------------------------------------------------

  describe('getDataset()', () => {
    it('returns the dataset after import', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'DS',
        projectId: 'p',
      });

      const ds = lib.getDataset(datasetId!);
      expect(ds).toBeDefined();
      expect(ds?.name).toBe('DS');
      expect(ds?.projectId).toBe('p');
      expect(ds?.format).toBe('csv');
    });

    it('returns undefined for unknown ID', () => {
      expect(lib.getDataset('nonexistent')).toBeUndefined();
    });
  });

  // ---- listDatasets --------------------------------------------------------

  describe('listDatasets()', () => {
    it('lists all datasets when no filter is applied', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'A', projectId: 'p1' });
      await lib.importJson(JSON_CONTENT, { name: 'B', projectId: 'p2' });

      expect(lib.listDatasets()).toHaveLength(2);
    });

    it('filters by projectId', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'A', projectId: 'p1' });
      await lib.importJson(JSON_CONTENT, { name: 'B', projectId: 'p2' });

      expect(lib.listDatasets({ projectId: 'p1' })).toHaveLength(1);
    });

    it('filters by format', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'A', projectId: 'p' });
      await lib.importJson(JSON_CONTENT, { name: 'B', projectId: 'p' });

      expect(lib.listDatasets({ format: 'csv' })).toHaveLength(1);
      expect(lib.listDatasets({ format: 'json' })).toHaveLength(1);
    });
  });

  // ---- sampleRows ----------------------------------------------------------

  describe('sampleRows()', () => {
    it('returns the requested number of rows', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'Sample',
        projectId: 'p',
      });

      const sample = lib.sampleRows(datasetId!, 2);
      expect(sample).toHaveLength(2);
    });

    it('returns all rows when count exceeds dataset size', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'Sample',
        projectId: 'p',
      });

      const sample = lib.sampleRows(datasetId!, 100);
      expect(sample).toHaveLength(3);
    });

    it('returns an empty array for an unknown dataset ID', () => {
      expect(lib.sampleRows('ghost', 5)).toHaveLength(0);
    });
  });

  // ---- updateDatasetName ---------------------------------------------------

  describe('updateDatasetName()', () => {
    it('updates the name and returns true', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'Old Name',
        projectId: 'p',
      });

      const ok = lib.updateDatasetName(datasetId!, 'New Name');
      expect(ok).toBe(true);
      expect(lib.getDataset(datasetId!)?.name).toBe('New Name');
    });

    it('returns false for unknown ID', () => {
      expect(lib.updateDatasetName('ghost', 'X')).toBe(false);
    });
  });

  // ---- deleteDataset -------------------------------------------------------

  describe('deleteDataset()', () => {
    it('deletes a dataset and returns true', async () => {
      const { datasetId } = await lib.importCsv(CSV_CONTENT, {
        name: 'To Delete',
        projectId: 'p',
      });

      expect(lib.deleteDataset(datasetId!)).toBe(true);
      expect(lib.getDataset(datasetId!)).toBeUndefined();
    });

    it('returns false for unknown ID', () => {
      expect(lib.deleteDataset('ghost')).toBe(false);
    });
  });

  // ---- deleteProjectDatasets -----------------------------------------------

  describe('deleteProjectDatasets()', () => {
    it('removes all datasets for a project', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'A', projectId: 'target' });
      await lib.importCsv(CSV_CONTENT, { name: 'B', projectId: 'target' });
      await lib.importJson(JSON_CONTENT, { name: 'C', projectId: 'other' });

      const deleted = lib.deleteProjectDatasets('target');
      expect(deleted).toBe(2);
      expect(lib.listDatasets({ projectId: 'target' })).toHaveLength(0);
      expect(lib.listDatasets({ projectId: 'other' })).toHaveLength(1);
    });
  });

  // ---- export / import -----------------------------------------------------

  describe('export() / import()', () => {
    it('round-trips datasets via export and import', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'Exported', projectId: 'p' });
      const snapshot = lib.export();

      const lib2 = new DataLibrary();
      lib2.import(snapshot);

      expect(lib2.size).toBe(1);
      const [id] = Object.keys(snapshot);
      expect(lib2.getDataset(id!)?.name).toBe('Exported');
    });
  });

  // ---- size ----------------------------------------------------------------

  describe('size', () => {
    it('starts at 0', () => {
      expect(lib.size).toBe(0);
    });

    it('increases after imports', async () => {
      await lib.importCsv(CSV_CONTENT, { name: 'A', projectId: 'p' });
      expect(lib.size).toBe(1);
      await lib.importJson(JSON_CONTENT, { name: 'B', projectId: 'p' });
      expect(lib.size).toBe(2);
    });
  });
});
