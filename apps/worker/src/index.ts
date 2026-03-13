/**
 * Worker process entry point.
 *
 * Starts BullMQ workers for all configured agent queues and wires up
 * graceful shutdown on SIGTERM / SIGINT.
 */
import { config } from './config';
import { Logger } from './logger';
import { closeQueues } from './queue';
import { startWorkers, stopWorkers } from './worker';

const logger = new Logger(config.logLevel, { service: 'worker:main' });

async function main(): Promise<void> {
  logger.info('Starting worker process', {
    env: config.env,
    concurrency: config.worker.concurrency,
    queues: config.worker.queues ?? 'all',
  });

  startWorkers();

  logger.info('Worker process ready');
}

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutdown signal received — draining workers', { signal });

  try {
    // Allow in-flight jobs to finish (max 30 s grace period)
    await stopWorkers(false);
    await closeQueues();
    logger.info('Worker process stopped cleanly');
    process.exit(0);
  } catch (err) {
    logger.error('Error during shutdown', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.fatal('Uncaught exception — shutting down', { error: err.message, stack: err.stack });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  logger.fatal('Unhandled promise rejection — shutting down', { error: message });
  void shutdown('unhandledRejection');
});

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.fatal('Worker failed to start', { error: message });
  process.exit(1);
});
