# Asana Integration Setup

Connect the SemkiEst Platform to Asana to automatically create tasks from test failures and track their resolution.

## Prerequisites

- Asana workspace with at least one project
- Asana account with permission to create tasks in the target project
- Asana Personal Access Token (or OAuth app credentials)

## Step 1: Create an Asana Personal Access Token

1. Go to [app.asana.com/0/my-apps](https://app.asana.com/0/my-apps)
2. Click **New access token**
3. Enter a name (e.g., `SemkiEst`) and click **Create token**
4. Copy the token immediately — it is shown only once

## Step 2: Find Your Workspace and Project GIDs

Asana identifies workspaces and projects by numeric GIDs.

**Find workspace GID:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://app.asana.com/api/1.0/workspaces | jq '.data[].gid'
```

**Find project GID:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "https://app.asana.com/api/1.0/projects?workspace=YOUR_WORKSPACE_GID" \
  | jq '.data[] | {name: .name, gid: .gid}'
```

## Step 3: Configure Environment Variables

```env
# Asana Integration
ASANA_ACCESS_TOKEN=your_asana_personal_access_token
ASANA_WORKSPACE_GID=123456789012345
ASANA_PROJECT_GID=987654321098765
ASANA_ASSIGNEE_GID=111222333444555
```

| Variable | Required | Description |
|----------|----------|-------------|
| `ASANA_ACCESS_TOKEN` | Yes | Personal Access Token from Step 1 |
| `ASANA_WORKSPACE_GID` | Yes | Numeric workspace GID |
| `ASANA_PROJECT_GID` | Yes | Numeric project GID where tasks are created |
| `ASANA_ASSIGNEE_GID` | No | Default task assignee GID (leave blank to leave unassigned) |

## Step 4: Verify the Connection

```bash
curl -H "Authorization: Bearer $YOUR_JWT" \
  http://localhost:3001/api/integrations/asana/verify
```

Expected response:

```json
{
  "connected": true,
  "workspace": "Your Workspace",
  "project": "SemkiEst Bug Tracking"
}
```

## Step 5: Configure Integration Behavior

In the dashboard under **Settings → Integrations → Asana**:

| Option | Description |
|--------|-------------|
| **Create task on failure** | Automatically create an Asana task when a test run fails |
| **Auto-complete task on pass** | Mark the Asana task complete when the test starts passing |
| **Assign to section** | Route tasks to a specific Asana project section (e.g., "Bugs") |
| **Custom fields** | Map SemkiEst fields (environment, project name) to Asana custom fields |
| **Due date offset** | Automatically set a due date N days from the failure date |

## Task Format

Created tasks include:

- **Name:** `[SemkiEst] Test failure: <Project Name> (<environment>)`
- **Description:** List of failing tests with URLs and error messages
- **Notes:** Link to the SemkiEst test run for full details
- **Tags:** `semkiest`, `automated`, environment name

## Troubleshooting

### `401 Unauthorized`

- Verify `ASANA_ACCESS_TOKEN` is correct and not expired
- Personal Access Tokens do not expire, but they can be revoked in app settings

### `403 Forbidden` when creating tasks

- The token owner must have access to `ASANA_PROJECT_GID`
- Check project membership in Asana: **Project → Members**

### Tasks created in wrong workspace

- GIDs are globally unique — the project GID implicitly determines the workspace
- Verify the project GID using the API call in Step 2

### `404 Not Found` for project GID

- Ensure the project has not been archived or deleted
- Re-run the project GID lookup command to get the current list
