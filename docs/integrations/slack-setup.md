# Slack Integration Setup

Connect the SemkiEst Platform to Slack to receive real-time notifications about test results, failures, and system events.

## Prerequisites

- Slack workspace with permission to install apps
- Admin or App Manager role (to install the app to the workspace)

## Step 1: Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App**
2. Choose **From scratch**
3. Enter app name `SemkiEst` and select your workspace, then click **Create App**

## Step 2: Configure Incoming Webhooks

1. In the app settings, navigate to **Incoming Webhooks**
2. Toggle **Activate Incoming Webhooks** to **On**
3. Click **Add New Webhook to Workspace**
4. Select the channel to post to (e.g., `#alerts` or `#testing`) and click **Allow**
5. Copy the **Webhook URL** (format: `https://hooks.slack.com/services/T.../B.../...`)

## Step 3: (Optional) Configure Bot Token for Advanced Features

For features like interactive buttons and reading channel history, configure a Bot Token:

1. In the app settings, go to **OAuth & Permissions**
2. Under **Bot Token Scopes**, add:
   - `chat:write` — post messages
   - `channels:read` — list channels
   - `files:write` — upload report attachments
3. Click **Install to Workspace** and approve the permissions
4. Copy the **Bot User OAuth Token** (starts with `xoxb-`)

## Step 4: Configure Environment Variables

```env
# Slack Integration — Incoming Webhook (required for notifications)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...

# Slack Bot Token (optional — required for advanced features)
SLACK_BOT_TOKEN=xoxb-your-bot-token

# Default channel for notifications (with or without #)
SLACK_DEFAULT_CHANNEL=#alerts

# Signing secret for verifying Slack event payloads
SLACK_SIGNING_SECRET=your_slack_signing_secret
```

| Variable | Required | Description |
|----------|----------|-------------|
| `SLACK_WEBHOOK_URL` | Yes | Incoming webhook URL from Step 2 |
| `SLACK_BOT_TOKEN` | No | Bot OAuth token for advanced features |
| `SLACK_DEFAULT_CHANNEL` | No | Default channel name (default: `#general`) |
| `SLACK_SIGNING_SECRET` | If using Events API | For verifying webhook payloads |

## Step 5: Verify the Connection

```bash
curl -H "Authorization: Bearer $YOUR_JWT" \
  http://localhost:3001/api/integrations/slack/verify
```

Expected response:

```json
{
  "connected": true,
  "channel": "#alerts",
  "workspace": "your-workspace"
}
```

## Step 6: Configure Notification Rules

In the dashboard under **Settings → Integrations → Slack**:

| Notification | Description |
|-------------|-------------|
| **Test run failed** | Alert when any test in a run fails |
| **Test run passed** | Notify when a previously failing run passes (recovery) |
| **Test run started** | Notify when a scheduled run begins |
| **All tests passed** | Daily/weekly summary when all runs are green |
| **New project created** | Notify when a team member creates a new project |

You can configure notifications per project and route different projects to different channels.

## Notification Message Format

Test failure notifications look like:

```
🔴 Test Run Failed — Production API (production)

❌ 3 tests failed out of 47 total (93.6% pass rate)

Failed tests:
• POST /api/projects — Expected 201, got 500
• GET /api/projects/:id — Timeout after 5000ms
• DELETE /api/projects/:id — Expected 204, got 403

View run: https://app.semkiest.com/runs/clx1a2b3c
```

## Setting Up the Events API (Optional)

To handle interactive Slack events (slash commands, button clicks):

1. In the Slack app settings, go to **Event Subscriptions**
2. Enable events and set Request URL to `https://api.semkiest.com/api/webhooks/slack`
3. Subscribe to Bot Events: `message.channels`, `app_mention`
4. Save changes

The URL must respond to Slack's URL verification challenge — ensure `SLACK_SIGNING_SECRET` is set.

## Troubleshooting

### Notifications not being received

- Verify `SLACK_WEBHOOK_URL` is correct and the channel still exists
- Test the webhook directly: `curl -X POST -d '{"text":"Test"}' $SLACK_WEBHOOK_URL`
- Check if the app has been removed from the channel

### `invalid_auth` error

- The webhook URL is workspace-specific — ensure it matches the correct workspace
- If the installing user leaves the workspace, regenerate the webhook

### `channel_not_found` error

- Ensure the bot has been invited to the channel: `/invite @SemkiEst` in Slack

### Duplicate notifications

- Check if multiple webhook URLs are configured (both the app and a legacy webhook)
- Review the notification rules — a single run can trigger multiple rules if not carefully scoped
