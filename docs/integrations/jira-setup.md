# Jira Integration Setup

Connect the SemkiEst Platform to Jira to automatically create and update Jira issues from test results.

## Prerequisites

- Jira Cloud or Jira Data Center instance
- Jira project administrator access
- An Atlassian account with API token access

## Step 1: Create an Atlassian API Token

1. Go to [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click **Create API token**
3. Enter a label (e.g., `SemkiEst Platform`) and click **Create**
4. Copy the token — you will not be able to see it again

## Step 2: Identify Your Jira Project

You will need:
- **Jira base URL**: e.g., `https://your-org.atlassian.net`
- **Project key**: the short code prefix on your issue IDs (e.g., `SEM` from `SEM-123`)
- **Issue type ID** (optional): to control what type of issue is created (e.g., Bug, Task)

To find your project key, navigate to your Jira project — it appears in every issue ID.

## Step 3: Configure Environment Variables

Add the following to your `.env` file:

```env
# Jira Integration
JIRA_BASE_URL=https://your-org.atlassian.net
JIRA_USER_EMAIL=your-email@company.com
JIRA_API_TOKEN=your_atlassian_api_token
JIRA_PROJECT_KEY=SEM
JIRA_ISSUE_TYPE=Bug
```

| Variable | Required | Description |
|----------|----------|-------------|
| `JIRA_BASE_URL` | Yes | Your Atlassian instance URL (no trailing slash) |
| `JIRA_USER_EMAIL` | Yes | Email associated with the API token |
| `JIRA_API_TOKEN` | Yes | API token from Step 1 |
| `JIRA_PROJECT_KEY` | Yes | Project key where issues will be created |
| `JIRA_ISSUE_TYPE` | No | Issue type name (default: `Bug`) |

## Step 4: Verify the Connection

After starting the application:

```bash
curl -H "Authorization: Bearer $YOUR_JWT" \
  http://localhost:3001/api/integrations/jira/verify
```

A successful response:

```json
{
  "connected": true,
  "project": "SEM",
  "user": "your-email@company.com"
}
```

## Step 5: Configure Integration Behavior

In the SemkiEst web dashboard:

1. Navigate to **Settings → Integrations → Jira**
2. Enable **Create issue on test failure** — automatically opens a Jira issue when a test run fails
3. Enable **Comment on existing issue** — adds a comment to an open issue when the same test fails again
4. Enable **Close issue on test pass** — transitions the Jira issue to "Done" when the test starts passing
5. Set **Minimum severity** — only create issues for runs with more than N failures

## How It Works

```
Test run fails
      │
      ▼
Worker enqueues integration job
      │
      ▼
Integration agent calls Jira API
      │
      ├── No existing open issue for this test → CREATE issue
      │
      └── Open issue already exists → ADD comment with latest failure details
```

Each created Jira issue includes:
- Project name and environment
- List of failing test cases
- Link back to the SemkiEst test run
- Failure timestamps and duration

## Jira Webhook (Optional)

To receive status updates from Jira in SemkiEst (e.g., when a Jira issue is closed manually):

1. In Jira, go to **Settings → System → WebHooks**
2. Click **Create a WebHook**
3. Set the URL to `https://api.semkiest.com/api/webhooks/jira`
4. Select events: **Issue updated**, **Issue deleted**
5. Click **Create**

The webhook URL must be publicly accessible (not `localhost`).

## Troubleshooting

### `401 Unauthorized` from Jira API

- Verify `JIRA_USER_EMAIL` matches the account that created the API token
- Re-generate the API token and update `JIRA_API_TOKEN`
- Ensure the token has not expired (Atlassian tokens do not expire by default)

### `403 Forbidden` when creating issues

- The Jira user must have **Create Issues** permission in the target project
- Ask your Jira project administrator to check project role assignments

### Issues created in wrong project

- Double-check `JIRA_PROJECT_KEY` — it must exactly match the project's key in Jira

### Webhook events not received

- Ensure the webhook URL is accessible from the internet
- Check `JIRA_WEBHOOK_SECRET` matches the secret configured in Jira
- Review webhook delivery logs in Jira: **Settings → System → WebHooks → Delivery logs**
