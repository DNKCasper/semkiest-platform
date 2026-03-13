/**
 * Types for Slack slash command and interactive payload handling.
 * Based on the Slack API specification for slash commands and block interactions.
 */

/** Payload received from Slack when a slash command is invoked. */
export interface SlackSlashCommandPayload {
  token: string;
  team_id: string;
  team_domain: string;
  channel_id: string;
  channel_name: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  api_app_id: string;
  is_enterprise_install: string;
  response_url: string;
  trigger_id: string;
}

/** Parsed arguments for the /semkiest run command. */
export interface RunCommandArgs {
  project: string;
  profile: string;
}

/** Parsed arguments for the /semkiest status command. */
export interface StatusCommandArgs {
  project: string;
}

/** Parsed result of a slash command. */
export type ParsedCommand =
  | { type: 'run'; args: RunCommandArgs }
  | { type: 'status'; args: StatusCommandArgs }
  | { type: 'help' }
  | { type: 'unknown'; input: string };

/** Result of triggering a test run via the SemkiEst API. */
export interface TestRunResult {
  runId: string;
  project: string;
  profile: string;
  status: 'queued' | 'running';
  dashboardUrl: string;
}

/** Quality status returned by the SemkiEst API. */
export interface QualityStatus {
  project: string;
  lastRunAt: string | null;
  passRate: number;
  totalTests: number;
  failedTests: number;
  status: 'passing' | 'failing' | 'no_data';
  dashboardUrl: string;
}

/** Slack Block Kit block element. */
export type Block = Record<string, unknown>;

/** Immediate response body returned to Slack from a slash command endpoint. */
export interface SlackCommandResponse {
  response_type: 'in_channel' | 'ephemeral';
  text?: string;
  blocks?: Block[];
}

/** Action IDs used in interactive button payloads. */
export const SLACK_ACTION_IDS = {
  VIEW_REPORT: 'semkiest_view_report',
  RERUN_TESTS: 'semkiest_rerun_tests',
  CREATE_BUG_TICKET: 'semkiest_create_bug_ticket',
} as const;

export type SlackActionId = (typeof SLACK_ACTION_IDS)[keyof typeof SLACK_ACTION_IDS];

/** A single action within an interactive payload. */
export interface SlackInteractiveAction {
  action_id: string;
  block_id: string;
  type: string;
  value?: string;
  action_ts: string;
}

/** Payload received from Slack when a user clicks an interactive button. */
export interface SlackInteractivePayload {
  type: 'block_actions';
  api_app_id: string;
  token: string;
  trigger_id: string;
  response_url: string;
  team: { id: string; domain: string };
  channel: { id: string; name: string };
  user: { id: string; username: string; name: string; team_id: string };
  message: {
    ts: string;
    text: string;
    blocks?: Block[];
  };
  actions: SlackInteractiveAction[];
}
