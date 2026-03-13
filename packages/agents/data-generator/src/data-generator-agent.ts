import { BaseAgent, AgentConfig, AgentContext, AgentResult } from '@semkiest/agent-base';
import { FakerGenerator, FieldType, GeneratorOptions, UserProfile } from './faker-generator';
import {
  EdgeCaseGenerator,
  EdgeCase,
  EdgeCaseCategory,
  EdgeCaseOptions,
} from './edge-case-generator';
import { DataLibrary, Dataset, DataRow, ImportOptions, ImportResult } from './data-library';

// ---------------------------------------------------------------------------
// Public input / output types
// ---------------------------------------------------------------------------

/** Describes a single form field for context-aware generation. */
export interface FormField {
  /** The field name or HTML `name` attribute. */
  name: string;
  /** Optional explicit type override (bypasses inference). */
  type?: FieldType;
  /** Generation constraints (min, max, minLength, maxLength). */
  options?: GeneratorOptions;
}

/** Describes the kind of data generation to perform. */
export type GenerationMode =
  | 'userProfiles'
  | 'fieldValues'
  | 'edgeCases'
  | 'datasetSample'
  | 'fullSuite';

/** Input payload for DataGeneratorAgent.execute(). */
export interface DataGeneratorInput {
  /** What to generate. Defaults to `'userProfiles'`. */
  mode?: GenerationMode;

  // --- userProfiles mode ---
  /** Number of user profiles to generate. Defaults to 1. */
  profileCount?: number;

  // --- fieldValues mode ---
  /** Fields to generate values for. Required for `'fieldValues'` mode. */
  fields?: FormField[];
  /** Number of values to generate per field. Defaults to 1. */
  valuesPerField?: number;

  // --- edgeCases mode ---
  /** Edge-case categories to include. Defaults to `['all']`. */
  edgeCaseCategories?: EdgeCaseCategory[];
  /** Options forwarded to EdgeCaseGenerator. */
  edgeCaseOptions?: EdgeCaseOptions;

  // --- datasetSample mode ---
  /** ID of the dataset to sample from (must be pre-loaded). */
  datasetId?: string;
  /** Number of rows to sample. Defaults to 10. */
  sampleCount?: number;

  // --- Dataset import (available in any mode) ---
  /** Import a CSV string before generating. */
  importCsv?: { content: string; options: ImportOptions };
  /** Import a JSON array string before generating. */
  importJson?: { content: string; options: ImportOptions };
}

/** Structured output from DataGeneratorAgent.execute(). */
export interface DataGeneratorOutput {
  /** Synthetic user profiles (populated in `userProfiles` / `fullSuite` modes). */
  userProfiles?: UserProfile[];
  /** Field-by-field generated values (populated in `fieldValues` / `fullSuite` modes). */
  fieldValues?: Record<string, Array<string | number | boolean>>;
  /** Edge-case values (populated in `edgeCases` / `fullSuite` modes). */
  edgeCases?: EdgeCase[];
  /** Sampled rows from a dataset (populated in `datasetSample` mode). */
  datasetRows?: DataRow[];
  /** Result of any dataset import that was requested. */
  importResult?: ImportResult;
}

// ---------------------------------------------------------------------------
// DataGeneratorAgentConfig
// ---------------------------------------------------------------------------

/** Extended configuration for DataGeneratorAgent. */
export interface DataGeneratorAgentConfig extends AgentConfig {
  /** Faker.js seed for reproducible output. */
  seed?: number;
  /** Default locale for Faker.js. */
  locale?: string;
  /** Default edge-case options applied if not overridden per-request. */
  defaultEdgeCaseOptions?: EdgeCaseOptions;
}

// ---------------------------------------------------------------------------
// DataGeneratorAgent
// ---------------------------------------------------------------------------

/**
 * AI-powered test data generator agent.
 *
 * Extends {@link BaseAgent} and orchestrates three specialist generators:
 * - {@link FakerGenerator}  – realistic, locale-aware synthetic data
 * - {@link EdgeCaseGenerator} – boundary / injection / Unicode edge cases
 * - {@link DataLibrary}     – importable CSV / JSON dataset management
 *
 * ## Quick start
 * ```ts
 * const agent = new DataGeneratorAgent({ name: 'DataGen', version: '1.0.0' });
 * await agent.initialize();
 *
 * const result = await agent.execute<DataGeneratorOutput>(
 *   { projectId: 'proj-1' },
 *   { mode: 'userProfiles', profileCount: 5 },
 * );
 *
 * if (result.success) {
 *   console.log(result.data?.userProfiles);
 * }
 * ```
 */
export class DataGeneratorAgent extends BaseAgent {
  private fakerGenerator!: FakerGenerator;
  private edgeCaseGenerator!: EdgeCaseGenerator;
  private readonly dataLibrary: DataLibrary;
  private readonly agentConfig: DataGeneratorAgentConfig;

  constructor(config: DataGeneratorAgentConfig) {
    super(config);
    this.agentConfig = config;
    // DataLibrary is stateful — create it eagerly so datasets survive re-inits.
    this.dataLibrary = new DataLibrary();
  }

  // ---- BaseAgent implementation --------------------------------------------

  protected async onInitialize(): Promise<void> {
    this.fakerGenerator = new FakerGenerator({
      seed: this.agentConfig.seed,
      locale: this.agentConfig.locale,
    });

    this.edgeCaseGenerator = new EdgeCaseGenerator(
      this.agentConfig.defaultEdgeCaseOptions,
    );
  }

  /**
   * Execute a data-generation request.
   *
   * @param context - Execution context (projectId, sessionId, …).
   * @param input   - Generation parameters.
   */
  async execute<T = DataGeneratorOutput>(
    context: AgentContext,
    input: DataGeneratorInput = {},
  ): Promise<AgentResult<T>> {
    if (!this.isInitialized()) {
      return this.failure<T>('Agent has not been initialized. Call initialize() first.');
    }

    try {
      const output = await this.runGeneration(context, input);
      return this.success<T>(output as T);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.failure<T>(`Data generation failed: ${message}`);
    }
  }

  // ---- Dataset management (public API) ------------------------------------

  /**
   * Import a CSV file into this agent's data library.
   * The dataset is scoped to the given project.
   */
  async importCsv(csvContent: string, options: ImportOptions): Promise<ImportResult> {
    return this.dataLibrary.importCsv(csvContent, options);
  }

  /**
   * Import a JSON array into this agent's data library.
   */
  async importJson(
    jsonContent: string | DataRow[],
    options: ImportOptions,
  ): Promise<ImportResult> {
    return this.dataLibrary.importJson(jsonContent, options);
  }

  /**
   * Retrieve a dataset by ID.
   */
  getDataset(id: string): Dataset | undefined {
    return this.dataLibrary.getDataset(id);
  }

  /**
   * List all datasets, optionally filtered by project.
   */
  listDatasets(projectId?: string): Dataset[] {
    return this.dataLibrary.listDatasets(projectId ? { projectId } : {});
  }

  // ---- Context-aware field analysis ----------------------------------------

  /**
   * Analyse a list of form field names and return the inferred FieldType for
   * each one.
   *
   * @param fieldNames - Array of field name strings to analyse.
   */
  analyzeFields(fieldNames: string[]): Record<string, FieldType> {
    const result: Record<string, FieldType> = {};
    for (const name of fieldNames) {
      result[name] = this.fakerGenerator.inferFieldType(name);
    }
    return result;
  }

  // ---- Private generation logic -------------------------------------------

  private async runGeneration(
    context: AgentContext,
    input: DataGeneratorInput,
  ): Promise<DataGeneratorOutput> {
    const output: DataGeneratorOutput = {};

    // Handle inline dataset imports first.
    if (input.importCsv) {
      output.importResult = await this.dataLibrary.importCsv(
        input.importCsv.content,
        input.importCsv.options,
      );
    }

    if (input.importJson && !output.importResult) {
      output.importResult = await this.dataLibrary.importJson(
        input.importJson.content,
        input.importJson.options,
      );
    }

    const mode: GenerationMode = input.mode ?? 'userProfiles';

    switch (mode) {
      case 'userProfiles':
        output.userProfiles = this.generateProfiles(input);
        break;

      case 'fieldValues':
        output.fieldValues = this.generateFieldValues(input);
        break;

      case 'edgeCases':
        output.edgeCases = this.generateEdgeCases(input);
        break;

      case 'datasetSample':
        output.datasetRows = this.sampleDataset(input, context);
        break;

      case 'fullSuite':
        output.userProfiles = this.generateProfiles(input);
        output.fieldValues = this.generateFieldValues(input);
        output.edgeCases = this.generateEdgeCases(input);
        break;

      default:
        throw new Error(`Unknown generation mode: ${String(mode)}`);
    }

    return output;
  }

  private generateProfiles(input: DataGeneratorInput): UserProfile[] {
    const count = input.profileCount ?? 1;
    return this.fakerGenerator.generateUserProfiles(count);
  }

  private generateFieldValues(
    input: DataGeneratorInput,
  ): Record<string, Array<string | number | boolean>> {
    const fields = input.fields ?? [];
    const count = input.valuesPerField ?? 1;
    const result: Record<string, Array<string | number | boolean>> = {};

    for (const field of fields) {
      if (field.type) {
        result[field.name] = Array.from({ length: count }, () =>
          this.fakerGenerator.generateForFieldType(field.type as FieldType, field.options ?? {}),
        );
      } else {
        result[field.name] = this.fakerGenerator.generateForField(
          field.name,
          count,
          field.options ?? {},
        );
      }
    }

    return result;
  }

  private generateEdgeCases(input: DataGeneratorInput): EdgeCase[] {
    const categories = input.edgeCaseCategories ?? ['all'];

    if (input.edgeCaseOptions) {
      const gen = new EdgeCaseGenerator(input.edgeCaseOptions);
      return gen.generateForCategories(categories);
    }

    return this.edgeCaseGenerator.generateForCategories(categories);
  }

  private sampleDataset(input: DataGeneratorInput, _context: AgentContext): DataRow[] {
    if (!input.datasetId) {
      return [];
    }
    return this.dataLibrary.sampleRows(input.datasetId, input.sampleCount ?? 10);
  }
}
