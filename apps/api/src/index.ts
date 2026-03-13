import express from 'express';
import { asanaRouter } from './routes/integrations/asana';

const app = express();

// Parse JSON bodies. For webhook routes we also need the raw body — that is
// handled per-route via express.raw() before express.json().
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Integration routes
// ---------------------------------------------------------------------------
app.use('/integrations/asana', asanaRouter);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

app.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on http://${HOST}:${PORT}`);
});

export { app };
