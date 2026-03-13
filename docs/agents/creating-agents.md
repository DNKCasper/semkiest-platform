# Creating New Agent Types

This guide explains how to add a new agent type to the SemkiEst worker process. Agents are typed job handlers that run in the BullMQ worker and perform specific background tasks.

## Overview

The worker (`apps/worker`) processes jobs dispatched by the API. Each job type maps to an agent — a self-contained module that knows how to handle one category of work.

```
API enqueues job  →  Redis queue  →  Worker dispatches to agent  →  Agent executes task
```

## Anatomy of an Agent

An agent is a TypeScript module that exports:

1. **A queue name constant** — identifies the BullMQ queue
2. **A payload type** — defines the job's input data
3. **A processor function** — performs the actual work

### Minimal Agent Example

```typescript
// apps/worker/src/agents/sendEmail.agent.ts
import type { Job } from 'bullmq';

/** The BullMQ queue this agent consumes. */
export const QUEUE_NAME = 'email';

/** Input payload for an email job. */
export interface SendEmailPayload {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
  variables?: Record<string, string>;
}

/** Result returned on success. */
export interface SendEmailResult {
  messageId: string;
  sentAt: string;
}

/**
 * Sends a transactional email.
 * Must be idempotent — may be retried on failure.
 */
export async function processSendEmail(
  job: Job<SendEmailPayload>,
): Promise<SendEmailResult> {
  const { to, subject, body } = job.data;

  // 1. Validate inputs
  if (!to || !subject) {
    throw new Error('Missing required email fields');
  }

  // 2. Call the email service
  const result = await emailService.send({ to, subject, body });

  // 3. Report progress (optional, enables real-time UI updates)
  await job.updateProgress(100);

  return {
    messageId: result.id,
    sentAt: new Date().toISOString(),
  };
}
```

### Advanced Agent with Progress Reporting

```typescript
// apps/worker/src/agents/runTests.agent.ts
import type { Job } from 'bullmq';

export const QUEUE_NAME = 'test-runs';

export interface RunTestsPayload {
  projectId: string;
  testRunId: string;
  urls: string[];
  environment: string;
}

export interface RunTestsResult {
  testRunId: string;
  passedTests: number;
  failedTests: number;
}

export async function processRunTests(
  job: Job<RunTestsPayload>,
): Promise<RunTestsResult> {
  const { projectId, testRunId, urls } = job.data;
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];

    // Report progress so the UI can show a progress bar
    const progress = Math.round(((i + 1) / urls.length) * 100);
    await job.updateProgress(progress);

    try {
      await testRunner.run(url);
      passed++;
    } catch {
      failed++;
    }
  }

  // Notify the API that the test run is complete
  await apiClient.patch(`/api/test-runs/${testRunId}`, {
    status: failed === 0 ? 'passed' : 'failed',
    passedTests: passed,
    failedTests: failed,
    completedAt: new Date().toISOString(),
  });

  return { testRunId, passedTests: passed, failedTests: failed };
}
```

## Step-by-Step: Adding a New Agent

### Step 1: Create the Agent File

Create `apps/worker/src/agents/<name>.agent.ts` following the pattern above.

Guidelines:
- Export `QUEUE_NAME` as a constant string
- Define typed `Payload` and `Result` interfaces
- Name the processor function `process<AgentName>` in PascalCase
- Make the processor **idempotent** — BullMQ guarantees at-least-once delivery

### Step 2: Register the Agent in the Worker Entry Point

```typescript
// apps/worker/src/index.ts
import { Worker } from 'bullmq';
import { redis } from './connections/redis';
import { processSendEmail, QUEUE_NAME as EMAIL_QUEUE } from './agents/sendEmail.agent';
import { processRunTests, QUEUE_NAME as TEST_QUEUE } from './agents/runTests.agent';

const workers = [
  new Worker(EMAIL_QUEUE, processSendEmail, { connection: redis, concurrency: 5 }),
  new Worker(TEST_QUEUE, processRunTests, { connection: redis, concurrency: 2 }),
];

// Attach error handlers
workers.forEach((w) => {
  w.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });
});
```

### Step 3: Add an Enqueue Helper in the API

```typescript
// apps/api/src/queues/email.queue.ts
import { Queue } from 'bullmq';
import { redis } from '../connections/redis';
import type { SendEmailPayload } from '@semkiest/worker/agents/sendEmail.agent';

export const emailQueue = new Queue<SendEmailPayload>('email', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

export function enqueueEmail(payload: SendEmailPayload) {
  return emailQueue.add('send-email', payload);
}
```

### Step 4: Write Tests

```typescript
// apps/worker/src/agents/sendEmail.agent.test.ts
import { processSendEmail } from './sendEmail.agent';
import type { Job } from 'bullmq';

const mockJob = (data: object) =>
  ({ data, updateProgress: jest.fn() }) as unknown as Job;

describe('processSendEmail', () => {
  it('sends an email and returns a message ID', async () => {
    jest.spyOn(emailService, 'send').mockResolvedValue({ id: 'msg_123' });

    const result = await processSendEmail(
      mockJob({ to: 'user@example.com', subject: 'Hello', body: 'World' }),
    );

    expect(result.messageId).toBe('msg_123');
  });

  it('throws when required fields are missing', async () => {
    await expect(
      processSendEmail(mockJob({ to: '', subject: '' })),
    ).rejects.toThrow('Missing required email fields');
  });
});
```

## Idempotency Guidelines

BullMQ can retry failed jobs and may deliver a job more than once. Every agent must handle duplicate delivery gracefully:

- **Use database upserts** instead of inserts when recording results
- **Check for existing records** before performing side effects (e.g., check if the email was already sent by looking up the `messageId`)
- **Use idempotency keys** when calling external APIs that support them
- **Avoid non-reversible side effects** in retry paths (e.g., don't send a notification twice)

## Error Handling

- **Throw an error** to signal a retryable failure (BullMQ will retry up to `maxAttempts`)
- For **permanent failures** (e.g., invalid payload), use `UnrecoverableError` from BullMQ to skip retries:

```typescript
import { UnrecoverableError } from 'bullmq';

if (!isValidEmail(payload.to)) {
  throw new UnrecoverableError(`Invalid email address: ${payload.to}`);
}
```

## Queue Configuration Reference

| Option | Description | Recommended Default |
|--------|-------------|---------------------|
| `attempts` | Max retry attempts | `3` |
| `backoff.type` | Retry delay strategy | `exponential` |
| `backoff.delay` | Initial delay (ms) | `2000` |
| `removeOnComplete.count` | Completed jobs to retain | `100` |
| `removeOnFail.count` | Failed jobs to retain | `500` |
| `concurrency` | Jobs processed in parallel per worker | Varies by job type |

## Available Queue Names

| Queue | Agent | Description |
|-------|-------|-------------|
| `test-runs` | `runTests.agent` | Execute automated test suites |
| `email` | `sendEmail.agent` | Send transactional emails |
| `notifications` | `sendNotification.agent` | Slack / webhook notifications |
| `exports` | `exportReport.agent` | Generate and upload reports to S3 |
| `integrations` | `syncIntegration.agent` | Sync data with Jira/Asana/GitHub |
