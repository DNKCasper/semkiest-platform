import {
  Block,
  ParsedCommand,
  QualityStatus,
  RunCommandArgs,
  SLACK_ACTION_IDS,
  SlackCommandResponse,
  SlackSlashCommandPayload,
  TestRunResult,
} from './types';

/** Text for the /semkiest help message. */
const HELP_TEXT = `*SemkiEst Slash Commands*

\`/semkiest run <project> [profile]\` — Trigger a test run for the given project.
• \`project\` — required: project identifier (e.g. \`my-app\`)
• \`profile\` — optional: test profile to use (e.g. \`smoke\`, \`regression\`). Defaults to \`default\`.

\`/semkiest status <project>\` — Get the current quality status for a project.
• \`project\` — required: project identifier.

\`/semkiest help\` — Show this help message.`;

/**
 * Parses the text portion of a slash command into a structured command object.
 *
 * @param text - The raw text following the /semkiest command.
 * @returns A typed ParsedCommand describing the sub-command and its arguments.
 */
export function parseCommand(text: string): ParsedCommand {
  const trimmed = text.trim();

  if (!trimmed || trimmed === 'help') {
    return { type: 'help' };
  }

  const parts = trimmed.split(/\s+/);
  const subCommand = parts[0]?.toLowerCase();

  if (subCommand === 'run') {
    const project = parts[1];
    if (!project) {
      return { type: 'unknown', input: trimmed };
    }
    const profile = parts[2] ?? 'default';
    return { type: 'run', args: { project, profile } };
  }

  if (subCommand === 'status') {
    const project = parts[1];
    if (!project) {
      return { type: 'unknown', input: trimmed };
    }
    return { type: 'status', args: { project } };
  }

  return { type: 'unknown', input: trimmed };
}

/**
 * Validates a project identifier string.
 * Project identifiers must be 1–64 characters containing only
 * alphanumeric characters, hyphens, and underscores.
 */
export function validateProjectIdentifier(project: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(project);
}

/**
 * Validates a profile name string.
 * Profile names must be 1–64 characters containing only
 * alphanumeric characters, hyphens, and underscores.
 */
export function validateProfileName(profile: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(profile);
}

/** Builds a Slack Block Kit response for the help command. */
function buildHelpResponse(): SlackCommandResponse {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: HELP_TEXT },
      },
    ],
  };
}

/** Builds a Slack Block Kit error response with a given message. */
function buildErrorResponse(message: string): SlackCommandResponse {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:x: *Error:* ${message}\n\nType \`/semkiest help\` for usage information.`,
        },
      },
    ],
  };
}

/** Builds a Slack Block Kit response for a successfully triggered test run. */
function buildRunQueuedResponse(result: TestRunResult): SlackCommandResponse {
  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `:rocket: *Test run queued!*`,
            `*Project:* \`${result.project}\``,
            `*Profile:* \`${result.profile}\``,
            `*Run ID:* \`${result.runId}\``,
            `*Status:* ${result.status}`,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: ':bar_chart: View Report', emoji: true },
            style: 'primary',
            action_id: SLACK_ACTION_IDS.VIEW_REPORT,
            value: JSON.stringify({ runId: result.runId, project: result.project }),
            url: result.dashboardUrl,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: ':repeat: Re-run Tests', emoji: true },
            action_id: SLACK_ACTION_IDS.RERUN_TESTS,
            value: JSON.stringify({ project: result.project, profile: result.profile }),
          },
        ],
      },
    ] satisfies Block[],
  };
}

/** Builds a Slack Block Kit response for the /semkiest status command. */
function buildStatusResponse(status: QualityStatus): SlackCommandResponse {
  const statusEmoji =
    status.status === 'passing' ? ':white_check_mark:' :
    status.status === 'failing' ? ':x:' :
    ':grey_question:';

  const passRateText =
    status.status === 'no_data'
      ? 'No data available'
      : `${status.passRate.toFixed(1)}% pass rate (${status.totalTests - status.failedTests}/${status.totalTests} passing)`;

  const lastRunText =
    status.lastRunAt
      ? `Last run: <!date^${Math.floor(new Date(status.lastRunAt).getTime() / 1000)}^{date_short_pretty} at {time}|${status.lastRunAt}>`
      : 'No runs yet';

  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `${statusEmoji} *Quality Status — \`${status.project}\`*`,
            passRateText,
            lastRunText,
          ].join('\n'),
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: ':bar_chart: View Dashboard', emoji: true },
            style: 'primary',
            action_id: SLACK_ACTION_IDS.VIEW_REPORT,
            value: JSON.stringify({ project: status.project }),
            url: status.dashboardUrl,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: ':repeat: Run Tests Now', emoji: true },
            action_id: SLACK_ACTION_IDS.RERUN_TESTS,
            value: JSON.stringify({ project: status.project, profile: 'default' }),
          },
          ...(status.status === 'failing'
            ? [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: ':bug: Create Bug Ticket', emoji: true },
                  style: 'danger',
                  action_id: SLACK_ACTION_IDS.CREATE_BUG_TICKET,
                  value: JSON.stringify({ project: status.project }),
                },
              ]
            : []),
        ],
      },
    ] satisfies Block[],
  };
}

/** Options accepted by the SlashCommandHandler. */
export interface CommandHandlerOptions {
  /** Base URL of the SemkiEst API server. */
  apiBaseUrl: string;
  /** Optional internal API key for authenticating requests to the API server. */
  internalApiKey?: string;
}

/**
 * Handles an incoming /semkiest slash command payload and returns the
 * appropriate Slack Block Kit response.
 *
 * This is the main entry point for slash command processing. It parses,
 * validates, calls the SemkiEst API when needed, and formats the response.
 *
 * @param payload - The parsed slash command payload from Slack.
 * @param options - Configuration including API base URL and optional API key.
 * @returns A Slack response object ready to be sent back to Slack.
 */
export async function handleSlashCommand(
  payload: SlackSlashCommandPayload,
  options: CommandHandlerOptions,
): Promise<SlackCommandResponse> {
  const parsed = parseCommand(payload.text);

  switch (parsed.type) {
    case 'help':
      return buildHelpResponse();

    case 'unknown':
      return buildErrorResponse(
        `Unknown command: \`${parsed.input}\`. Did you mean \`/semkiest run\` or \`/semkiest status\`?`,
      );

    case 'run':
      return handleRunCommand(parsed.args, options);

    case 'status':
      return handleStatusCommand(parsed.args.project, options);
  }
}

/** Handles the 'run' sub-command: validates args and triggers a test run. */
async function handleRunCommand(
  args: RunCommandArgs,
  options: CommandHandlerOptions,
): Promise<SlackCommandResponse> {
  if (!validateProjectIdentifier(args.project)) {
    return buildErrorResponse(
      `Invalid project identifier: \`${args.project}\`. ` +
        'Project names must be 1–64 characters (letters, numbers, hyphens, underscores).',
    );
  }

  if (!validateProfileName(args.profile)) {
    return buildErrorResponse(
      `Invalid profile name: \`${args.profile}\`. ` +
        'Profile names must be 1–64 characters (letters, numbers, hyphens, underscores).',
    );
  }

  const result = await triggerTestRun(args.project, args.profile, options);
  return buildRunQueuedResponse(result);
}

/** Handles the 'status' sub-command: validates the project and fetches quality status. */
async function handleStatusCommand(
  project: string,
  options: CommandHandlerOptions,
): Promise<SlackCommandResponse> {
  if (!validateProjectIdentifier(project)) {
    return buildErrorResponse(
      `Invalid project identifier: \`${project}\`. ` +
        'Project names must be 1–64 characters (letters, numbers, hyphens, underscores).',
    );
  }

  const status = await fetchQualityStatus(project, options);
  return buildStatusResponse(status);
}

/**
 * Calls the SemkiEst API to trigger a test run.
 * Corresponds to the SEM-52 (Test Coordinator) API endpoint.
 */
async function triggerTestRun(
  project: string,
  profile: string,
  options: CommandHandlerOptions,
): Promise<TestRunResult> {
  const url = `${options.apiBaseUrl}/api/runs`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (options.internalApiKey) {
    headers['X-API-Key'] = options.internalApiKey;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ project, profile }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    id: string;
    project: string;
    profile: string;
    status: string;
  };

  return {
    runId: data.id,
    project: data.project,
    profile: data.profile,
    status: data.status === 'running' ? 'running' : 'queued',
    dashboardUrl: `${options.apiBaseUrl.replace('/api', '')}/dashboard/projects/${project}/runs/${data.id}`,
  };
}

/**
 * Calls the SemkiEst API to fetch the current quality status for a project.
 */
async function fetchQualityStatus(
  project: string,
  options: CommandHandlerOptions,
): Promise<QualityStatus> {
  const url = `${options.apiBaseUrl}/api/projects/${encodeURIComponent(project)}/status`;
  const headers: Record<string, string> = {};

  if (options.internalApiKey) {
    headers['X-API-Key'] = options.internalApiKey;
  }

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    throw new Error(`Project \`${project}\` not found.`);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    project: string;
    lastRunAt: string | null;
    passRate: number;
    totalTests: number;
    failedTests: number;
    status: string;
  };

  return {
    project: data.project,
    lastRunAt: data.lastRunAt,
    passRate: data.passRate ?? 0,
    totalTests: data.totalTests ?? 0,
    failedTests: data.failedTests ?? 0,
    status:
      data.status === 'passing' ? 'passing' :
      data.status === 'failing' ? 'failing' :
      'no_data',
    dashboardUrl: `${options.apiBaseUrl.replace('/api', '')}/dashboard/projects/${project}`,
  };
}
