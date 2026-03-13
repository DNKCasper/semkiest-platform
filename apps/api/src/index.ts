import express from 'express';
import { jiraRouter } from './routes/integrations/jira.js';

const app = express();

// Parse JSON bodies; also expose raw body for webhook signature verification.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody: Buffer }).rawBody = buf;
    },
  }),
);

// Routes
app.use('/api/integrations/jira', jiraRouter);

// Basic health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env['PORT'] ?? 3001;
const host = process.env['HOST'] ?? '0.0.0.0';

app.listen(Number(port), host, () => {
  console.info(`API server listening on http://${host}:${port}`);
});

export default app;
