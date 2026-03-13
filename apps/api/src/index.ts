import { createApp } from './app';

const PORT = Number(process.env['PORT'] ?? 3001);
const HOST = process.env['HOST'] ?? '0.0.0.0';

const app = createApp();

app.listen(PORT, HOST, () => {
  console.info(`API server listening on http://${HOST}:${PORT}`);
});
