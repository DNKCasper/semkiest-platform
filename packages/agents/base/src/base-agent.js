"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseAgent = void 0;
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
/**
 * Creates a structured console logger scoped to the agent name.
 */
function createLogger(agentName, level) {
    const minLevel = LOG_LEVELS[level];
    const emit = (lvl, fn, message, meta) => {
        if (LOG_LEVELS[lvl] >= minLevel) {
            const entry = {
                timestamp: new Date().toISOString(),
                level: lvl,
                agent: agentName,
                message,
            };
            if (meta !== undefined) {
                entry['meta'] = meta;
            }
            fn(JSON.stringify(entry));
        }
    };
    return {
        debug: (msg, meta) => emit('debug', (s) => process.stdout.write(`${String(s)}\n`), msg, meta),
        info: (msg, meta) => emit('info', (s) => process.stdout.write(`${String(s)}\n`), msg, meta),
        warn: (msg, meta) => emit('warn', (s) => process.stderr.write(`${String(s)}\n`), msg, meta),
        error: (msg, meta) => emit('error', (s) => process.stderr.write(`${String(s)}\n`), msg, meta),
    };
}
/**
 * Abstract base class for all SemkiEst agents.
 *
 * Subclasses must implement `execute()`. The `run()` method orchestrates
 * initialization, execution, and cleanup, returning a typed `AgentResult`.
 *
 * @example
 * ```ts
 * class MyAgent extends BaseAgent<MyInput, MyOutput> {
 *   async execute(input: MyInput): Promise<MyOutput> {
 *     // implementation
 *   }
 * }
 * ```
 */
class BaseAgent {
    name;
    logger;
    _status = 'idle';
    constructor(config) {
        this.name = config.name;
        this.logger = createLogger(config.name, config.logLevel ?? 'info');
    }
    /**
     * Orchestrates the full agent lifecycle: initialize → execute → cleanup.
     * Always returns an `AgentResult`; never throws.
     */
    async run(input) {
        const start = Date.now();
        this._status = 'running';
        this.logger.info('Agent starting');
        try {
            await this.initialize();
            const data = await this.execute(input);
            this._status = 'completed';
            this.logger.info('Agent completed successfully');
            return {
                success: true,
                data,
                duration: Date.now() - start,
                agentName: this.name,
            };
        }
        catch (err) {
            this._status = 'failed';
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error('Agent execution failed', { error: message });
            return {
                success: false,
                error: message,
                duration: Date.now() - start,
                agentName: this.name,
            };
        }
        finally {
            await this.safeCleanup();
        }
    }
    /** Override to run setup before execute(). */
    async initialize() {
        this.logger.debug('Initializing agent');
    }
    /** Override to run teardown after execute() (called in finally block). */
    async cleanup() {
        this.logger.debug('Cleaning up agent');
    }
    /** Current lifecycle status of the agent. */
    get status() {
        return this._status;
    }
    async safeCleanup() {
        try {
            await this.cleanup();
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.warn('Cleanup failed', { error: message });
        }
    }
}
exports.BaseAgent = BaseAgent;
//# sourceMappingURL=base-agent.js.map