import express from 'express';
import { WebClient } from '@slack/web-api';
import { parseApiEnv } from '@semkiest/shared-config/env/api';
import { parseSlackEnv } from '@semkiest/shared-config/env/slack';
import { createSlackRouter } from './routes/integrations/slack';

const apiEnv = parseApiEnv();
const slackEnv = parseSlackEnv();

const app = express();

// Global middleware
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Slack integration routes
const slackClient = new WebClient(slackEnv.SLACK_BOT_TOKEN);

app.use(
  '/integrations/slack',
  createSlackRouter({
    signingSecret: slackEnv.SLACK_SIGNING_SECRET,
    slackClient,
    apiBaseUrl: slackEnv.SEMKIEST_API_URL,
    internalApiKey: slackEnv.SEMKIEST_INTERNAL_API_KEY,
  }),
);

app.listen(apiEnv.PORT, apiEnv.HOST, () => {
  console.info(`[API] Server listening on http://${apiEnv.HOST}:${apiEnv.PORT}`);
});

export default app;
