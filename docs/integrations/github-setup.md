# GitHub Integration Setup

Connect the SemkiEst Platform to GitHub to trigger test runs from pull request events and post test results as commit statuses and PR comments.

## Prerequisites

- GitHub organization or personal account
- Repository admin access (to configure webhooks and install GitHub Apps)
- A GitHub App or Personal Access Token

## Option A: GitHub App (Recommended)

A GitHub App is the recommended approach for production — it provides granular permissions and does not depend on a personal user account.

### Step 1: Create a GitHub App

1. Go to **GitHub → Settings → Developer Settings → GitHub Apps**
2. Click **New GitHub App**
3. Configure:
   - **App name:** `SemkiEst`
   - **Homepage URL:** `https://app.semkiest.com`
   - **Webhook URL:** `https://api.semkiest.com/api/webhooks/github`
   - **Webhook secret:** Generate a random secret and save it
4. Under **Repository permissions**, grant:
   - **Commit statuses:** Read & write
   - **Pull requests:** Read & write
   - **Contents:** Read
5. Subscribe to **Webhook events:**
   - `pull_request`
   - `push`
   - `check_run`
6. Click **Create GitHub App**
7. After creation, go to the app settings and click **Generate a private key** — save the `.pem` file

### Step 2: Install the App

1. On the GitHub App page, click **Install App**
2. Choose the organization or personal account
3. Select **All repositories** or specific repositories
4. Click **Install**
5. Note the **Installation ID** from the URL: `https://github.com/settings/installations/<INSTALLATION_ID>`

### Step 3: Configure Environment Variables

```env
# GitHub App (recommended)
GITHUB_APP_ID=123456
GITHUB_APP_INSTALLATION_ID=789012
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
...your private key contents...
-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_signing_secret
```

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | Yes | Numeric App ID from the GitHub App settings page |
| `GITHUB_APP_INSTALLATION_ID` | Yes | Numeric installation ID from Step 2 |
| `GITHUB_APP_PRIVATE_KEY` | Yes | Contents of the `.pem` private key file |
| `GITHUB_WEBHOOK_SECRET` | Yes | Secret used to sign webhook payloads |

## Option B: Personal Access Token

Simpler to set up for personal projects, but tied to a specific user account.

### Step 1: Create a Token

1. Go to **GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens**
2. Click **Generate new token**
3. Set repository access and grant:
   - **Commit statuses:** Read & write
   - **Pull requests:** Read & write
4. Click **Generate token** and copy it

### Step 2: Configure Environment Variables

```env
# GitHub Personal Access Token
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_WEBHOOK_SECRET=your_webhook_signing_secret
```

## Step 4: Configure Webhooks

If you are using a Personal Access Token instead of a GitHub App, manually configure webhooks:

1. In the repository, go to **Settings → Webhooks → Add webhook**
2. Set **Payload URL** to `https://api.semkiest.com/api/webhooks/github`
3. Set **Content type** to `application/json`
4. Enter the **Secret** (same value as `GITHUB_WEBHOOK_SECRET`)
5. Select **Let me select individual events** and check:
   - Pull requests
   - Pushes
6. Click **Add webhook**

## Step 5: Link a Project to a Repository

In the SemkiEst dashboard:

1. Open a project's settings
2. Navigate to **Integrations → GitHub**
3. Enter the repository in `owner/repo` format (e.g., `semkiest/platform`)
4. Enable desired triggers:

| Trigger | Description |
|---------|-------------|
| **On pull request opened/updated** | Run tests when a PR is opened or a new commit is pushed |
| **On push to main** | Run tests after every merge to the main branch |
| **Post commit status** | Update the GitHub commit status check with pass/fail |
| **Post PR comment** | Add a summary comment to the pull request |

## How Commit Statuses Work

When a test run is triggered by a GitHub event, SemkiEst posts a commit status:

```
✅ SemkiEst / production — All 47 tests passed (12.3s)
```

or

```
❌ SemkiEst / production — 3 tests failed (see details)
```

The status links back to the SemkiEst test run for details.

## Pull Request Comment Format

```markdown
## SemkiEst Test Results

| Environment | Tests | Passed | Failed | Pass Rate |
|-------------|-------|--------|--------|-----------|
| production  | 47    | 44     | 3      | 93.6%     |
| staging     | 47    | 47     | 0      | 100%      |

**3 failing tests in production:**
- `POST /api/projects` — Expected 201, got 500
- `GET /api/projects/:id` — Timeout after 5000ms
- `DELETE /api/projects/:id` — Expected 204, got 403

[View full results →](https://app.semkiest.com/runs/clx1a2b3c)
```

## Troubleshooting

### Webhook events not being received

- Confirm the webhook URL is publicly accessible
- Check webhook delivery logs in GitHub: **Repository → Settings → Webhooks → Recent Deliveries**
- Ensure `GITHUB_WEBHOOK_SECRET` matches the secret set in GitHub

### `401 Unauthorized` from GitHub API

- For Personal Access Tokens: verify the token has not expired and has the required scopes
- For GitHub Apps: ensure the private key matches the App ID and the installation is active

### Commit status not appearing on PR

- The status is posted to the commit SHA, not the PR — verify the PR has the correct commit
- Check that the GitHub App or token has **Commit statuses: Read & write** permission

### `422 Unprocessable Entity` when posting status

- The SHA must be a full 40-character commit SHA
- The `context` field must be consistent across updates to the same check
