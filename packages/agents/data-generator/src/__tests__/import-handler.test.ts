import { ImportHandler } from '../import-handler';
import type { CsvRow } from '../types';

describe('ImportHandler', () => {
  let handler: ImportHandler;

  beforeEach(() => {
    handler = new ImportHandler();
  });

  // ── CSV ────────────────────────────────────────────────────────────────────

  describe('importCSV', () => {
    it('parses a simple CSV with header row', () => {
      const csv = 'name,email,age\nAlice,alice@example.com,30\nBob,bob@example.com,25';
      const result = handler.importCSV(csv);

      expect(result.format).toBe('CSV');
      expect(result.rowCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
      expect(result.data).toEqual<CsvRow[]>([
        { name: 'Alice', email: 'alice@example.com', age: '30' },
        { name: 'Bob', email: 'bob@example.com', age: '25' },
      ]);
    });

    it('handles CRLF line endings', () => {
      const csv = 'a,b\r\n1,2\r\n3,4';
      const result = handler.importCSV(csv);
      expect(result.rowCount).toBe(2);
      expect((result.data as CsvRow[])[0]).toEqual({ a: '1', b: '2' });
    });

    it('handles quoted fields containing commas', () => {
      const csv = 'name,address\n"Smith, John","123 Main St, Apt 4"';
      const result = handler.importCSV(csv);
      const rows = result.data as CsvRow[];
      expect(rows[0]).toEqual({ name: 'Smith, John', address: '123 Main St, Apt 4' });
    });

    it('handles escaped double quotes inside quoted fields', () => {
      const csv = 'text\n"say ""hello"""';
      const result = handler.importCSV(csv);
      expect((result.data as CsvRow[])[0]).toEqual({ text: 'say "hello"' });
    });

    it('applies field mapping to rename columns', () => {
      const csv = 'first_name,last_name\nJane,Doe';
      const result = handler.importCSV(csv, {
        fieldMapping: { first_name: 'firstName', last_name: 'lastName' },
      });
      expect((result.data as CsvRow[])[0]).toEqual({ firstName: 'Jane', lastName: 'Doe' });
    });

    it('drops columns mapped to null', () => {
      const csv = 'id,secret,name\n1,topsecret,Alice';
      const result = handler.importCSV(csv, {
        fieldMapping: { id: 'id', secret: null, name: 'name' },
      });
      const row = (result.data as CsvRow[])[0];
      expect(row).toHaveProperty('id', '1');
      expect(row).toHaveProperty('name', 'Alice');
      expect(row).not.toHaveProperty('secret');
    });

    it('uses custom delimiter', () => {
      const tsv = 'a\tb\tc\n1\t2\t3';
      const result = handler.importCSV(tsv, { delimiter: '\t' });
      expect((result.data as CsvRow[])[0]).toEqual({ a: '1', b: '2', c: '3' });
    });

    it('accepts custom headers when hasHeader is false', () => {
      const csv = '1,Alice,alice@test.com';
      const result = handler.importCSV(csv, {
        hasHeader: false,
        headers: ['id', 'name', 'email'],
      });
      expect((result.data as CsvRow[])[0]).toEqual({
        id: '1',
        name: 'Alice',
        email: 'alice@test.com',
      });
    });

    it('emits a warning for rows with mismatched column count', () => {
      const csv = 'a,b,c\n1,2';
      const result = handler.importCSV(csv);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toMatch(/padding/i);
    });

    it('returns empty data for blank input', () => {
      const result = handler.importCSV('');
      expect(result.rowCount).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  // ── JSON ───────────────────────────────────────────────────────────────────

  describe('importJSON', () => {
    it('parses a JSON array and reports row count', () => {
      const json = JSON.stringify([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const result = handler.importJSON(json);

      expect(result.format).toBe('JSON');
      expect(result.rowCount).toBe(3);
      expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
      expect(result.warnings).toHaveLength(0);
    });

    it('parses a JSON object with rowCount 1', () => {
      const json = JSON.stringify({ key: 'value' });
      const result = handler.importJSON(json);
      expect(result.rowCount).toBe(1);
      expect(result.data).toEqual({ key: 'value' });
    });

    it('preserves nested structures', () => {
      const data = { users: [{ id: 1, roles: ['admin', 'user'] }] };
      const result = handler.importJSON(JSON.stringify(data));
      expect(result.data).toEqual(data);
    });

    it('throws for invalid JSON', () => {
      expect(() => handler.importJSON('{ bad json }')).toThrow(/invalid json/i);
    });
  });

  // ── SQL ────────────────────────────────────────────────────────────────────

  describe('importSQL', () => {
    it('accepts INSERT statements by default', () => {
      const sql = `INSERT INTO users (name) VALUES ('Alice');
INSERT INTO users (name) VALUES ('Bob');`;
      const result = handler.importSQL(sql);

      expect(result.format).toBe('SQL');
      expect(result.rowCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
    });

    it('rejects DDL statements by default', () => {
      const sql = `CREATE TABLE foo (id INT); INSERT INTO foo VALUES (1);`;
      const result = handler.importSQL(sql);

      expect(result.rowCount).toBe(1);
      expect(result.warnings.some((w) => /DDL/i.test(w))).toBe(true);
    });

    it('allows DDL when allowDdl is true', () => {
      const sql = `CREATE TABLE foo (id INT); INSERT INTO foo VALUES (1);`;
      const result = handler.importSQL(sql, { allowDdl: true });

      expect(result.rowCount).toBe(2);
      expect(result.warnings).toHaveLength(0);
    });

    it('strips line comments', () => {
      const sql = `-- this is a comment
INSERT INTO t VALUES (1);`;
      const result = handler.importSQL(sql);
      expect(result.rowCount).toBe(1);
    });

    it('strips block comments', () => {
      const sql = `/* block comment */ INSERT INTO t VALUES (2);`;
      const result = handler.importSQL(sql);
      expect(result.rowCount).toBe(1);
    });

    it('returns empty for blank input', () => {
      const result = handler.importSQL('  ');
      expect(result.rowCount).toBe(0);
      expect(result.data).toEqual([]);
    });
  });

  // ── Generic dispatch ───────────────────────────────────────────────────────

  describe('import (dispatcher)', () => {
    it('dispatches to importCSV for CSV format', () => {
      const result = handler.import('CSV', 'a,b\n1,2');
      expect(result.format).toBe('CSV');
    });

    it('dispatches to importJSON for JSON format', () => {
      const result = handler.import('JSON', '{"x":1}');
      expect(result.format).toBe('JSON');
    });

    it('dispatches to importSQL for SQL format', () => {
      const result = handler.import('SQL', 'INSERT INTO t VALUES (1);');
      expect(result.format).toBe('SQL');
    });
  });
});
