import { WebClient } from '@slack/web-api';
import {
  Block,
  SLACK_ACTION_IDS,
  SlackActionId,
  SlackCommandResponse,
  SlackInteractiveAction,
  SlackInteractivePayload,
} from './types';

/** Options accepted by the interactive handler. */
export interface InteractiveHandlerOptions {
  /** Slack Web API client (authenticated with SLACK_BOT_TOKEN). */
  slackClient: WebClient;
  /** Base URL of the SemkiEst API server. */
  apiBaseUrl: string;
  /** Optional internal API key for authenticating requests to the API server. */
  internalApiKey?: string;
}

/** Parsed action value stored in button metadata. */
interface ActionValue {
  project?: string;
  profile?: string;
  runId?: string;
}

/**
 * Handles incoming Slack interactive component payloads (button clicks).
 *
 * Per Slack's guidelines this function must respond immediately (within 3 s)
 * by returning a 200 OK to the original request. Long-running operations are
 * performed asynchronously and the result is delivered via the response_url.
 *
 * @param payload - The parsed interactive payload from Slack.
 * @param options - Configuration options including the Slack client and API URL.
 */
export async function handleInteractivePayload(
  payload: SlackInteractivePayload,
  options: InteractiveHandlerOptions,
): Promise<void> {
  const action = payload.actions[0];

  if (!action) {
    return;
  }

  const actionId = action.action_id as SlackActionId;

  switch (actionId) {
    case SLACK_ACTION_IDS.VIEW_REPORT:
      await handleViewReport(action, payload, options);
      break;

    case SLACK_ACTION_IDS.RERUN_TESTS:
      await handleRerunTests(action, payload, options);
      break;

    case SLACK_ACTION_IDS.CREATE_BUG_TICKET:
      await handleCreateBugTicket(action, payload, options);
      break;

    default:
      await sendResponseUrl(payload.response_url, {
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:grey_question: Unknown action: \`${action.action_id}\``,
            },
          },
        ],
      });
  }
}

/**
 * Handles the "View Report" button action.
 * Sends a direct link to the test run report back to the user.
 */
async function handleViewReport(
  action: SlackInteractiveAction,
  payload: SlackInteractivePayload,
  options: InteractiveHandlerOptions,
): Promise<void> {
  const value = parseActionValue(action.value);

  if (!value?.project) {
    await sendResponseUrl(payload.response_url, buildErrorBlock('Missing project in action value.'));
    return;
  }

  // Send an acknowledgement with loading state first.
  await sendResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    blocks: [loadingBlock('Opening report...')],
  });

  const runSegment = value.runId ? `/runs/${value.runId}` : '';
  const reportUrl = `${options.apiBaseUrl.replace('/api', '')}/dashboard/projects/${value.project}${runSegment}`;

  await sendResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:bar_chart: *Report ready* — <${reportUrl}|Open dashboard for \`${value.project}\`>`,
        },
      },
    ] satisfies Block[],
  });
}

/**
 * Handles the "Re-run Tests" button action.
 * Triggers a new test run for the same project and profile, then posts the result.
 */
async function handleRerunTests(
  action: SlackInteractiveAction,
  payload: SlackInteractivePayload,
  options: InteractiveHandlerOptions,
): Promise<void> {
  const value = parseActionValue(action.value);

  if (!value?.project) {
    await sendResponseUrl(payload.response_url, buildErrorBlock('Missing project in action value.'));
    return;
  }

  const profile = value.profile ?? 'default';

  // Acknowledge immediately with loading state.
  await sendResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    blocks: [loadingBlock(`Queuing test run for \`${value.project}\` (profile: \`${profile}\`)...`)],
  });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.internalApiKey) {
    headers['X-API-Key'] = options.internalApiKey;
  }

  const response = await fetch(`${options.apiBaseUrl}/api/runs`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ project: value.project, profile }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    await sendResponseUrl(payload.response_url, buildErrorBlock(`Failed to trigger run: ${errorText}`));
    return;
  }

  const data = (await response.json()) as { id: string; status: string };
  const dashboardUrl = `${options.apiBaseUrl.replace('/api', '')}/dashboard/projects/${value.project}/runs/${data.id}`;

  await sendResponseUrl(payload.response_url, {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `:rocket: *Re-run triggered by <@${payload.user.id}>!*`,
            `*Project:* \`${value.project}\``,
            `*Profile:* \`${profile}\``,
            `*Run ID:* \`${data.id}\``,
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
            value: JSON.stringify({ runId: data.id, project: value.project }),
            url: dashboardUrl,
          },
        ],
      },
    ] satisfies Block[],
  });
}

/**
 * Handles the "Create Bug Ticket" button action.
 * Posts an acknowledgement and a link to the project's new issue creation flow.
 */
async function handleCreateBugTicket(
  action: SlackInteractiveAction,
  payload: SlackInteractivePayload,
  options: InteractiveHandlerOptions,
): Promise<void> {
  const value = parseActionValue(action.value);

  if (!value?.project) {
    await sendResponseUrl(payload.response_url, buildErrorBlock('Missing project in action value.'));
    return;
  }

  // Acknowledge with loading state.
  await sendResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    blocks: [loadingBlock('Preparing bug ticket...')],
  });

  const createTicketUrl = `${options.apiBaseUrl.replace('/api', '')}/dashboard/projects/${value.project}/bugs/new`;

  await sendResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:bug: <${createTicketUrl}|Create a bug ticket> for project \`${value.project}\`. ` +
                'The form is pre-filled with the latest test run details.',
        },
      },
    ] satisfies Block[],
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parses the JSON string stored in a button's value field.
 * Returns null if the string is missing or malformed.
 */
function parseActionValue(value: string | undefined): ActionValue | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as ActionValue;
  } catch {
    return null;
  }
}

/**
 * Posts a follow-up message to a Slack response_url.
 * This is used to send deferred responses after the initial 3-second window.
 */
export async function sendResponseUrl(
  responseUrl: string,
  body: SlackCommandResponse,
): Promise<void> {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Builds a loading/spinner block for acknowledging interactive actions. */
function loadingBlock(message: string): Block {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `:hourglass_flowing_sand: ${message}` },
  };
}

/** Builds a generic error block for interactive action failures. */
function buildErrorBlock(message: string): SlackCommandResponse {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `:x: *Error:* ${message}` },
      },
    ],
  };
}
