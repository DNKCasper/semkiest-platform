import { OpenAIProvider, OPENAI_MODELS } from './openai';
import { LLMProvider, ProviderConfig } from '../types';

// ---------------------------------------------------------------------------
// Mock the openai SDK
// ---------------------------------------------------------------------------

const mockCreate = jest.fn();

jest.mock('openai', () => {
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  // Attach APIError so the provider can detect it
  class APIError extends Error {
    status: number;
    constructor(message: string, status = 500) {
      super(message);
      this.name = 'APIError';
      this.status = status;
    }
  }
  (MockOpenAI as unknown as Record<string, unknown>).APIError = APIError;

  return { default: MockOpenAI };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig: ProviderConfig = {
  provider: LLMProvider.OPENAI,
  apiKey: 'test-api-key',
  defaultModel: 'gpt-4o',
};

function makeProvider(cfg: Partial<ProviderConfig> = {}): OpenAIProvider {
  return new OpenAIProvider({ ...baseConfig, ...cfg });
}

function makeMockResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-test',
    model: 'gpt-4o',
    choices: [
      {
        message: { role: 'assistant', content: 'Hello, world!' },
        finish_reason: 'stop',
        index: 0,
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAIProvider', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe('getProvider', () => {
    it('returns LLMProvider.OPENAI', () => {
      expect(makeProvider().getProvider()).toBe(LLMProvider.OPENAI);
    });
  });

  describe('getDefaultModel', () => {
    it('returns the configured default model', () => {
      expect(makeProvider().getDefaultModel()).toBe('gpt-4o');
    });

    it('falls back to gpt-4o when no default is configured', () => {
      const provider = makeProvider({ defaultModel: undefined });
      expect(provider.getDefaultModel()).toBe('gpt-4o');
    });
  });

  describe('OPENAI_MODELS constant', () => {
    it('contains all supported models', () => {
      expect(OPENAI_MODELS).toContain('gpt-4o');
      expect(OPENAI_MODELS).toContain('gpt-4-turbo');
      expect(OPENAI_MODELS).toContain('gpt-3.5-turbo');
    });
  });

  describe('complete', () => {
    it('calls the OpenAI API with correct parameters', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      const provider = makeProvider();
      await provider.complete({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: 'Hello' }),
          ]),
        }),
      );
    });

    it('returns a properly shaped LLMResponse', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      const response = await makeProvider().complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response).toMatchObject({
        content: 'Hello, world!',
        model: 'gpt-4o',
        provider: LLMProvider.OPENAI,
        finishReason: 'stop',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
      });
    });

    it('injects systemPrompt as a system message', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      await makeProvider().complete({
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompt: 'You are a helpful assistant.',
      });

      const call = mockCreate.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
      expect(call.messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });

    it('echoes metadata from the request', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      const response = await makeProvider().complete({
        messages: [{ role: 'user', content: 'Hi' }],
        metadata: { projectId: 'proj-1', agentType: 'summarizer' },
      });

      expect(response.metadata).toEqual({ projectId: 'proj-1', agentType: 'summarizer' });
    });

    it('uses default model when none is specified in request', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      await makeProvider({ defaultModel: 'gpt-3.5-turbo' }).complete({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      const call = mockCreate.mock.calls[0][0] as { model: string };
      expect(call.model).toBe('gpt-3.5-turbo');
    });

    it('throws a descriptive error for unsupported models', async () => {
      await expect(
        makeProvider().complete({
          messages: [{ role: 'user', content: 'Hi' }],
          model: 'claude-3-5-sonnet-20241022' as never,
        }),
      ).rejects.toThrow(/\[OpenAIProvider\] Unsupported model/);
    });

    it('throws a descriptive error when no messages are provided', async () => {
      await expect(
        makeProvider().complete({ messages: [] }),
      ).rejects.toThrow(/\[OpenAIProvider\] At least one message is required/);
    });

    it('wraps API errors with provider prefix', async () => {
      const OpenAI = (await import('openai')).default as unknown as {
        APIError: new (message: string, status?: number) => Error & { status: number };
      };
      const apiError = new OpenAI.APIError('Rate limit exceeded', 429);
      mockCreate.mockRejectedValue(apiError);

      await expect(
        makeProvider().complete({ messages: [{ role: 'user', content: 'Hi' }] }),
      ).rejects.toThrow(/\[OpenAIProvider\] API error 429/);
    });

    it('includes estimated cost in usage', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      const response = await makeProvider().complete({
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
      });

      expect(response.usage.estimatedCostUsd).toBeDefined();
      expect(typeof response.usage.estimatedCostUsd).toBe('number');
    });

    it('handles all supported models', async () => {
      for (const model of OPENAI_MODELS) {
        mockCreate.mockResolvedValue(makeMockResponse({ model }));

        const response = await makeProvider().complete({
          messages: [{ role: 'user', content: 'ping' }],
          model,
        });

        expect(response.provider).toBe(LLMProvider.OPENAI);
      }
    });
  });

  describe('checkHealth', () => {
    it('returns healthy status when API responds', async () => {
      mockCreate.mockResolvedValue(makeMockResponse());

      const status = await makeProvider().checkHealth();

      expect(status.healthy).toBe(true);
      expect(status.provider).toBe(LLMProvider.OPENAI);
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      expect(status.checkedAt).toBeInstanceOf(Date);
    });

    it('returns unhealthy status when API throws', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const status = await makeProvider().checkHealth();

      expect(status.healthy).toBe(false);
      expect(status.error).toContain('Network error');
      expect(status.checkedAt).toBeInstanceOf(Date);
    });
  });
});
