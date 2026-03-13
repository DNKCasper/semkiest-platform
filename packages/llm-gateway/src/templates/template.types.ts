/** A variable definition within a prompt template */
export interface TemplateVariable {
  /** Variable name used in the template (without delimiters) */
  name: string;
  /** Human-readable description */
  description?: string;
  /** Whether the variable is required */
  required: boolean;
  /** Default value if not provided */
  defaultValue?: string;
}

/** A loaded and parsed prompt template */
export interface PromptTemplate {
  /** Unique template identifier */
  id: string;
  /** Semantic version string (e.g. "1.0.0") */
  version: string;
  /** Human-readable template name */
  name: string;
  /** Optional description */
  description?: string;
  /** Raw template content with variable placeholders */
  content: string;
  /** Declared variables */
  variables: TemplateVariable[];
  /** Absolute file path the template was loaded from */
  filePath: string;
  /** ISO timestamp of when the file was last modified */
  lastModified: string;
}

/** Input variables for template rendering */
export type TemplateVariables = Record<string, string>;

/** Result of rendering a template */
export interface RenderedTemplate {
  templateId: string;
  templateVersion: string;
  content: string;
}

/** Error thrown when template rendering fails */
export class TemplateError extends Error {
  constructor(
    message: string,
    public readonly templateId?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TemplateError';
  }
}
