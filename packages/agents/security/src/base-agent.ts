import type { ScanTarget, SecurityReport } from './types';

/**
 * Abstract base class for all security testing agents.
 *
 * Agents are **disabled by default** and must be explicitly enabled before
 * running, preventing accidental scans in non-security contexts.
 *
 * @example
 * ```typescript
 * const agent = new SecurityAgent();
 * agent.enable();
 * const report = await agent.run({ url: 'https://example.com' });
 * ```
 */
export abstract class BaseAgent {
  /** Whether this agent is currently active. Always starts as false. */
  private _enabled: boolean = false;

  /** Human-readable name shown in reports and logs. */
  abstract readonly name: string;

  /**
   * Activate this agent so it can perform scans.
   * Must be called before invoking `run()`.
   */
  enable(): void {
    this._enabled = true;
  }

  /**
   * Deactivate this agent. Any in-progress scan will complete,
   * but subsequent calls to `run()` will throw.
   */
  disable(): void {
    this._enabled = false;
  }

  /**
   * Returns `true` when this agent has been explicitly enabled.
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Execute a security scan against the specified target.
   *
   * @param target - The URL and optional configuration to scan.
   * @returns A `SecurityReport` with all findings and remediation guidance.
   * @throws {Error} If the agent is not enabled — call `enable()` first.
   */
  abstract run(target: ScanTarget): Promise<SecurityReport>;
}
