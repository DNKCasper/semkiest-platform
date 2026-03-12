import express, { type Express } from 'express';

const app: Express = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: '@semkiest/api' });
});

app.listen(PORT, () => {
  console.info(`[api] Server listening on port ${PORT}`);
});

export default app;
