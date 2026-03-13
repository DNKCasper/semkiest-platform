/**
 * @semkiest/slack-integration
 *
 * Slack integration for SemkiEst providing:
 * - Slash command handling (/semkiest run, /semkiest status, /semkiest help)
 * - Interactive button handling (view report, re-run tests, create bug ticket)
 * - Slack request signature verification
 */

export { verifySlackRequest } from './verify-request';

export {
  parseCommand,
  handleSlashCommand,
  validateProjectIdentifier,
  validateProfileName,
  type CommandHandlerOptions,
} from './command-handler';

export {
  handleInteractivePayload,
  sendResponseUrl,
  type InteractiveHandlerOptions,
} from './interactive-handler';

export type {
  SlackSlashCommandPayload,
  SlackInteractivePayload,
  SlackInteractiveAction,
  SlackCommandResponse,
  ParsedCommand,
  RunCommandArgs,
  StatusCommandArgs,
  TestRunResult,
  QualityStatus,
  Block,
  SlackActionId,
} from './types';

export { SLACK_ACTION_IDS } from './types';
