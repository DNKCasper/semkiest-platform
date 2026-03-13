import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateManager } from '../../templates/template.manager';
import { TemplateError } from '../../templates/template.types';

/** Create a temporary directory with template files for testing */
function createTempTemplateDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-templates-'));
  return dir;
}

function writeTemplate(dir: string, filename: string, content: string): void {
  fs.writeFileSync(path.join(dir, filename), content);
}

afterEach(() => {
  // Clean up temp dirs (handled by OS, but mark for clarity)
});

describe('TemplateManager', () => {
  describe('load()', () => {
    it('loads a simple template without frontmatter', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'hello.v1.txt', 'Hello, {{name}}!');

      const manager = new TemplateManager({ templateDirs: [dir] });
      const template = await manager.load('hello');

      expect(template.id).toBe('hello');
      expect(template.version).toBe('1.0.0');
      expect(template.content).toBe('Hello, {{name}}!');
      expect(template.variables).toContainEqual(expect.objectContaining({ name: 'name' }));
    });

    it('loads a template with frontmatter metadata', async () => {
      const dir = createTempTemplateDir();
      const content = `---
name: Code Review
description: Reviews code for quality
variables:
  - name: language
    description: Programming language
    required: true
  - name: context
    description: Additional context
    required: false
    default: "No context"
---
Review this {{language}} code.
Context: {{context}}`;

      writeTemplate(dir, 'code-review.v1.txt', content);

      const manager = new TemplateManager({ templateDirs: [dir] });
      const template = await manager.load('code-review');

      expect(template.name).toBe('Code Review');
      expect(template.description).toBe('Reviews code for quality');
      expect(template.variables).toHaveLength(2);

      const langVar = template.variables.find((v) => v.name === 'language');
      expect(langVar?.required).toBe(true);
      expect(langVar?.description).toBe('Programming language');

      const ctxVar = template.variables.find((v) => v.name === 'context');
      expect(ctxVar?.required).toBe(false);
      expect(ctxVar?.defaultValue).toBe('No context');
    });

    it('loads the latest version when multiple versions exist', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'greeting.v1.txt', 'Hello v1, {{name}}!');
      writeTemplate(dir, 'greeting.v2.txt', 'Hello v2, {{name}}!');
      writeTemplate(dir, 'greeting.v1.5.txt', 'Hello v1.5, {{name}}!');

      const manager = new TemplateManager({ templateDirs: [dir], cache: false });
      const template = await manager.load('greeting');

      expect(template.content).toBe('Hello v2, {{name}}!');
      expect(template.version).toBe('2.0.0');
    });

    it('loads a specific version when requested', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'greeting.v1.txt', 'Hello v1, {{name}}!');
      writeTemplate(dir, 'greeting.v2.txt', 'Hello v2, {{name}}!');

      const manager = new TemplateManager({ templateDirs: [dir], cache: false });
      const template = await manager.load('greeting', '1.0.0');

      expect(template.content).toBe('Hello v1, {{name}}!');
      expect(template.version).toBe('1.0.0');
    });

    it('throws TemplateError when template is not found', async () => {
      const dir = createTempTemplateDir();
      const manager = new TemplateManager({ templateDirs: [dir] });

      await expect(manager.load('nonexistent')).rejects.toThrow(TemplateError);
    });

    it('uses in-memory cache on repeated loads', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'cached.v1.txt', 'Cached content');

      const manager = new TemplateManager({ templateDirs: [dir], cache: true });

      const first = await manager.load('cached');
      const second = await manager.load('cached');

      expect(first).toBe(second); // same object reference (cached)
    });
  });

  describe('render()', () => {
    it('interpolates all variables', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'greet.v1.txt', 'Hello, {{firstName}} {{lastName}}!');

      const manager = new TemplateManager({ templateDirs: [dir] });
      const result = await manager.render('greet', { firstName: 'Jane', lastName: 'Doe' });

      expect(result.content).toBe('Hello, Jane Doe!');
      expect(result.templateId).toBe('greet');
      expect(result.templateVersion).toBe('1.0.0');
    });

    it('applies default values for optional variables', async () => {
      const dir = createTempTemplateDir();
      const content = `---
name: Greet
variables:
  - name: greeting
    required: false
    default: "Hello"
---
{{greeting}}, world!`;

      writeTemplate(dir, 'greet2.v1.txt', content);

      const manager = new TemplateManager({ templateDirs: [dir] });
      const result = await manager.render('greet2', {});

      expect(result.content).toBe('Hello, world!');
    });

    it('throws TemplateError when a required variable is missing', async () => {
      const dir = createTempTemplateDir();
      const content = `---
name: Strict Template
variables:
  - name: requiredVar
    required: true
---
Value: {{requiredVar}}`;

      writeTemplate(dir, 'strict.v1.txt', content);

      const manager = new TemplateManager({ templateDirs: [dir] });

      await expect(manager.render('strict', {})).rejects.toThrow(TemplateError);
      await expect(manager.render('strict', {})).rejects.toThrow(/requiredVar/);
    });

    it('leaves unresolved placeholders as-is for undeclared optional variables', async () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'partial.v1.txt', 'Known: {{known}}. Unknown: {{unknown}}.');

      const manager = new TemplateManager({ templateDirs: [dir] });
      // Only provide 'known'; 'unknown' is not declared and not provided
      const result = await manager.render('partial', { known: 'value' });

      expect(result.content).toContain('Known: value');
      expect(result.content).toContain('{{unknown}}');
    });
  });

  describe('listAvailable()', () => {
    it('returns unique template IDs from configured directories', () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'alpha.v1.txt', 'Alpha');
      writeTemplate(dir, 'beta.v1.txt', 'Beta');
      writeTemplate(dir, 'beta.v2.txt', 'Beta v2'); // same ID, different version

      const manager = new TemplateManager({ templateDirs: [dir] });
      const ids = manager.listAvailable();

      expect(ids).toEqual(['alpha', 'beta']);
    });

    it('returns empty array when directory does not exist', () => {
      const manager = new TemplateManager({ templateDirs: ['/nonexistent/path'] });
      expect(manager.listAvailable()).toEqual([]);
    });
  });

  describe('listVersions()', () => {
    it('returns all versions sorted ascending', () => {
      const dir = createTempTemplateDir();
      writeTemplate(dir, 'multi.v3.txt', 'v3');
      writeTemplate(dir, 'multi.v1.txt', 'v1');
      writeTemplate(dir, 'multi.v2.txt', 'v2');

      const manager = new TemplateManager({ templateDirs: [dir] });
      const versions = manager.listVersions('multi');

      expect(versions).toEqual(['1.0.0', '2.0.0', '3.0.0']);
    });
  });

  describe('clearCache()', () => {
    it('forces reload from disk after cache is cleared', async () => {
      const dir = createTempTemplateDir();
      const filePath = path.join(dir, 'dynamic.v1.txt');
      fs.writeFileSync(filePath, 'Original content');

      const manager = new TemplateManager({ templateDirs: [dir], cache: true });

      const before = await manager.load('dynamic');
      expect(before.content).toBe('Original content');

      // Simulate file change
      fs.writeFileSync(filePath, 'Updated content');
      manager.clearCache();

      const after = await manager.load('dynamic');
      expect(after.content).toBe('Updated content');
    });
  });
});
