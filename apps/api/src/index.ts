/**
 * API server entry point.
 *
 * Reads the port from the environment and starts listening.
 */
import { createApp } from './app';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

const app = createApp();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`API server listening on port ${PORT}`);
});
