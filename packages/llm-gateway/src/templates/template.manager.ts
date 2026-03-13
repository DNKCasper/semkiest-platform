import * as fs from 'fs';
import * as path from 'path';
import type {
  PromptTemplate,
  RenderedTemplate,
  TemplateVariable,
  TemplateVariables,
} from './template.types.js';
import { TemplateError } from './template.types.js';

/**
 * Template file format
 * -----------------------
 * Templates are plain text files with an optional YAML-like frontmatter block.
 *
 * Example file (my-template.v1.txt):
 * ```
 * ---
 * name: Code Review Template
 * description: Reviews code for quality and bugs
 * variables:
 *   - name: language
 *     description: Programming language
 *     required: true
 *   - name: context
 *     description: Additional context
 *     required: false
 *     default: "No additional context"
 * ---
 * Please review the following {{language}} code:
 *
 * {{code}}
 *
 * Context: {{context}}
 * ```
 *
 * File naming convention: `{id}.v{major}.txt` or `{id}.v{major}.{minor}.{patch}.txt`
 * If no version in filename, defaults to "1.0.0".
 */

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
const VARIABLE_PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;
const VARIABLE_LINE_RE = /^\s*-\s+name:\s+(\w+)/;
const DESCRIPTION_LINE_RE = /^\s+description:\s+(.+)/;
const REQUIRED_LINE_RE = /^\s+required:\s+(true|false)/;
const DEFAULT_LINE_RE = /^\s+default:\s+"?([^"]+)"?/;

export interface TemplateManagerOptions {
  /**
   * Directories to scan for template files.
   * Files are searched in order; the first match wins.
   */
  templateDirs: string[];
  /**
   * File extensions to treat as template files.
   * Defaults to ['.txt', '.md', '.prompt'].
   */
  fileExtensions?: string[];
  /**
   * Enable in-memory caching of loaded templates.
   * Set to false to always reload from disk (useful in development).
   * Defaults to true.
   */
  cache?: boolean;
}

/**
 * Manages prompt templates: loading from disk, parsing, versioning,
 * and variable interpolation.
 */
export class TemplateManager {
  private readonly templateDirs: string[];
  private readonly fileExtensions: string[];
  private readonly cacheEnabled: boolean;
  private readonly templateCache = new Map<string, PromptTemplate>();

  constructor(options: TemplateManagerOptions) {
    this.templateDirs = options.templateDirs;
    this.fileExtensions = options.fileExtensions ?? ['.txt', '.md', '.prompt'];
    this.cacheEnabled = options.cache ?? true;
  }

  /**
   * Load a template by ID.
   *
   * If multiple versions exist, the latest version is returned unless
   * `version` is specified explicitly.
   *
   * @param id - Template identifier (without version suffix)
   * @param version - Specific version to load (optional)
   * @throws {TemplateError} if the template cannot be found or parsed
   */
  async load(id: string, version?: string): Promise<PromptTemplate> {
    const cacheKey = `${id}@${version ?? 'latest'}`;

    if (this.cacheEnabled && this.templateCache.has(cacheKey)) {
      return this.templateCache.get(cacheKey)!;
    }

    const filePath = this.resolveFilePath(id, version);
    if (!filePath) {
      throw new TemplateError(
        `Template not found: ${id}${version ? `@${version}` : ''}`,
        id,
      );
    }

    const template = await this.parseFile(id, filePath);

    if (this.cacheEnabled) {
      this.templateCache.set(cacheKey, template);
      this.templateCache.set(`${id}@latest`, template); // also cache as latest
    }

    return template;
  }

  /**
   * Render a template by substituting all `{{variable}}` placeholders.
   *
   * @param id - Template identifier
   * @param variables - Values to substitute
   * @param version - Template version (defaults to latest)
   * @throws {TemplateError} if required variables are missing
   */
  async render(
    id: string,
    variables: TemplateVariables,
    version?: string,
  ): Promise<RenderedTemplate> {
    const template = await this.load(id, version);
    const content = this.interpolate(template, variables);

    return {
      templateId: template.id,
      templateVersion: template.version,
      content,
    };
  }

  /**
   * List all available template IDs across all configured directories.
   */
  listAvailable(): string[] {
    const ids = new Set<string>();

    for (const dir of this.templateDirs) {
      if (!fs.existsSync(dir)) continue;

      for (const file of fs.readdirSync(dir)) {
        const ext = path.extname(file);
        if (!this.fileExtensions.includes(ext)) continue;

        const id = this.extractTemplateId(file);
        if (id) ids.add(id);
      }
    }

    return [...ids].sort();
  }

  /**
   * List all versions available for a given template ID.
   */
  listVersions(id: string): string[] {
    const versions: string[] = [];

    for (const dir of this.templateDirs) {
      if (!fs.existsSync(dir)) continue;

      for (const file of fs.readdirSync(dir)) {
        const ext = path.extname(file);
        if (!this.fileExtensions.includes(ext)) continue;

        const fileId = this.extractTemplateId(file);
        if (fileId !== id) continue;

        const version = this.extractVersion(file);
        versions.push(version);
      }
    }

    return versions.sort(compareVersions);
  }

  /** Clear the in-memory template cache */
  clearCache(): void {
    this.templateCache.clear();
  }

  // ─── private helpers ────────────────────────────────────────────────────────

  private resolveFilePath(id: string, version?: string): string | null {
    for (const dir of this.templateDirs) {
      if (!fs.existsSync(dir)) continue;

      const files = fs.readdirSync(dir);
      const candidates = files
        .filter((f) => {
          const ext = path.extname(f);
          if (!this.fileExtensions.includes(ext)) return false;
          const fileId = this.extractTemplateId(f);
          return fileId === id;
        })
        .filter((f) => {
          if (!version) return true;
          return this.extractVersion(f) === version;
        });

      if (candidates.length === 0) continue;

      // Pick the latest version if multiple exist
      const sorted = candidates.sort((a, b) =>
        compareVersions(this.extractVersion(b), this.extractVersion(a)),
      );

      return path.join(dir, sorted[0]!);
    }

    return null;
  }

  private async parseFile(id: string, filePath: string): Promise<PromptTemplate> {
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      throw new TemplateError(`Failed to read template file: ${filePath}`, id, err);
    }

    const stat = fs.statSync(filePath);
    const version = this.extractVersion(path.basename(filePath));

    const match = FRONTMATTER_RE.exec(content);
    if (!match) {
      // No frontmatter: treat entire file as content
      return {
        id,
        version,
        name: id,
        content: content.trim(),
        variables: extractPlaceholderVariables(content),
        filePath,
        lastModified: stat.mtime.toISOString(),
      };
    }

    const frontmatter = match[1]!;
    const body = match[2]!.trim();

    const name = extractFrontmatterValue(frontmatter, 'name') ?? id;
    const description = extractFrontmatterValue(frontmatter, 'description');
    const variables = parseFrontmatterVariables(frontmatter);

    // Merge with any undeclared placeholders found in body
    const undeclaredVars = extractPlaceholderVariables(body).filter(
      (v) => !variables.some((declared) => declared.name === v.name),
    );

    return {
      id,
      version,
      name,
      description,
      content: body,
      variables: [...variables, ...undeclaredVars],
      filePath,
      lastModified: stat.mtime.toISOString(),
    };
  }

  private interpolate(template: PromptTemplate, variables: TemplateVariables): string {
    // Validate required variables
    for (const variable of template.variables) {
      if (variable.required && !(variable.name in variables) && variable.defaultValue === undefined) {
        throw new TemplateError(
          `Missing required variable "${variable.name}" for template "${template.id}"`,
          template.id,
        );
      }
    }

    // Build the resolved variable map (user values > defaults)
    const resolved: Record<string, string> = {};
    for (const variable of template.variables) {
      resolved[variable.name] =
        variables[variable.name] ?? variable.defaultValue ?? '';
    }

    // Apply all user-provided variables (even undeclared ones)
    for (const [key, value] of Object.entries(variables)) {
      resolved[key] = value;
    }

    return template.content.replace(VARIABLE_PLACEHOLDER_RE, (_, varName: string) => {
      return resolved[varName] ?? `{{${varName}}}`;
    });
  }

  private extractTemplateId(filename: string): string | null {
    const base = path.basename(filename, path.extname(filename));
    // Strip version suffix: myTemplate.v1 -> myTemplate, myTemplate.v1.2.3 -> myTemplate
    return base.replace(/\.v\d+(\.\d+)*$/, '');
  }

  private extractVersion(filename: string): string {
    const base = path.basename(filename, path.extname(filename));
    const match = /\.v(\d+(?:\.\d+)*)$/.exec(base);
    if (!match) return '1.0.0';
    const parts = match[1]!.split('.');
    // Normalise to semver
    while (parts.length < 3) parts.push('0');
    return parts.join('.');
  }
}

// ─── parsing helpers ──────────────────────────────────────────────────────────

function extractFrontmatterValue(frontmatter: string, key: string): string | undefined {
  const re = new RegExp(`^${key}:\\s*(.+)`, 'm');
  const match = re.exec(frontmatter);
  return match?.[1]?.trim();
}

function parseFrontmatterVariables(frontmatter: string): TemplateVariable[] {
  const lines = frontmatter.split('\n');
  const variablesStartIdx = lines.findIndex((l) => /^variables:\s*$/.test(l.trim()));
  if (variablesStartIdx === -1) return [];

  const variables: TemplateVariable[] = [];
  let current: Partial<TemplateVariable> | null = null;

  for (let i = variablesStartIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    const nameMatch = VARIABLE_LINE_RE.exec(line);
    if (nameMatch) {
      if (current?.name) variables.push(finaliseVariable(current));
      current = { name: nameMatch[1], required: true };
      continue;
    }
    if (!current) continue;

    const descMatch = DESCRIPTION_LINE_RE.exec(line);
    if (descMatch) { current.description = descMatch[1]!.trim(); continue; }

    const reqMatch = REQUIRED_LINE_RE.exec(line);
    if (reqMatch) { current.required = reqMatch[1] === 'true'; continue; }

    const defMatch = DEFAULT_LINE_RE.exec(line);
    if (defMatch) { current.defaultValue = defMatch[1]!.trim(); continue; }
  }

  if (current?.name) variables.push(finaliseVariable(current));
  return variables;
}

function finaliseVariable(partial: Partial<TemplateVariable>): TemplateVariable {
  return {
    name: partial.name!,
    description: partial.description,
    required: partial.required ?? true,
    defaultValue: partial.defaultValue,
  };
}

/** Extract all `{{placeholder}}` names from template content */
function extractPlaceholderVariables(content: string): TemplateVariable[] {
  const names = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(VARIABLE_PLACEHOLDER_RE.source, 'g');

  while ((match = re.exec(content)) !== null) {
    names.add(match[1]!);
  }

  return [...names].map((name) => ({ name, required: false }));
}

/** Compare semantic version strings (descending: higher = better) */
function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split('.').map(Number);
  const [aParts, bParts] = [parse(a), parse(b)];
  const len = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
