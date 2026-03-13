import { SlackClient } from '../slack-client';

// Mock the Slack WebClient
jest.mock('@slack/web-api', () => {
  const mockPostMessage = jest.fn();
  const mockAuthTest = jest.fn();
  const mockConversationsList = jest.fn();

  const MockWebClient = jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
    auth: { test: mockAuthTest },
    conversations: { list: mockConversationsList },
  }));

  return {
    WebClient: MockWebClient,
    LogLevel: { ERROR: 'error', WARN: 'warn' },
    __mockPostMessage: mockPostMessage,
    __mockAuthTest: mockAuthTest,
    __mockConversationsList: mockConversationsList,
  };
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slackMocks = jest.requireMock('@slack/web-api') as any;

describe('SlackClient', () => {
  let client: SlackClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new SlackClient({ botToken: 'xoxb-test-token' });
  });

  describe('postBlocks', () => {
    it('returns ok=true on successful API call', async () => {
      slackMocks.__mockPostMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.000001',
        channel: 'C012AB3CD',
      });

      const result = await client.postBlocks(
        'C012AB3CD',
        'Fallback text',
        [],
      );

      expect(result.ok).toBe(true);
      expect(result.ts).toBe('1234567890.000001');
      expect(result.channel).toBe('C012AB3CD');
    });

    it('returns ok=false when API throws an error', async () => {
      slackMocks.__mockPostMessage.mockRejectedValue(
        new Error('channel_not_found'),
      );

      const result = await client.postBlocks('INVALID', 'text', []);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('channel_not_found');
    });

    it('passes channel, text, and blocks to chat.postMessage', async () => {
      slackMocks.__mockPostMessage.mockResolvedValue({ ok: true, ts: '1' });

      const blocks = [{ type: 'section' as const, text: { type: 'mrkdwn' as const, text: 'hello' } }];
      await client.postBlocks('#general', 'hello', blocks);

      expect(slackMocks.__mockPostMessage).toHaveBeenCalledWith({
        channel: '#general',
        text: 'hello',
        blocks,
      });
    });
  });

  describe('postText', () => {
    it('returns ok=true on successful API call', async () => {
      slackMocks.__mockPostMessage.mockResolvedValue({
        ok: true,
        ts: '1234567890.000001',
        channel: 'C012AB3CD',
      });

      const result = await client.postText('C012AB3CD', 'Hello world');
      expect(result.ok).toBe(true);
    });

    it('returns ok=false on API error', async () => {
      slackMocks.__mockPostMessage.mockRejectedValue(new Error('not_in_channel'));

      const result = await client.postText('C0000000', 'Hello');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not_in_channel');
    });

    it('passes mrkdwn: true to chat.postMessage', async () => {
      slackMocks.__mockPostMessage.mockResolvedValue({ ok: true });

      await client.postText('#test', 'Hello *world*');

      expect(slackMocks.__mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({ mrkdwn: true }),
      );
    });
  });

  describe('verifyAuth', () => {
    it('returns userId and teamName on success', async () => {
      slackMocks.__mockAuthTest.mockResolvedValue({
        ok: true,
        user_id: 'U012AB3CD',
        team: 'SemkiEst Workspace',
      });

      const result = await client.verifyAuth();
      expect(result.userId).toBe('U012AB3CD');
      expect(result.teamName).toBe('SemkiEst Workspace');
    });

    it('throws when auth.test returns ok=false', async () => {
      slackMocks.__mockAuthTest.mockResolvedValue({
        ok: false,
        error: 'invalid_auth',
      });

      await expect(client.verifyAuth()).rejects.toThrow('invalid_auth');
    });
  });

  describe('listJoinedChannels', () => {
    it('returns a list of channels', async () => {
      slackMocks.__mockConversationsList.mockResolvedValue({
        ok: true,
        channels: [
          { id: 'C001', name: 'general', is_member: true },
          { id: 'C002', name: 'dev-alerts', is_member: true },
          { id: 'C003', name: 'random', is_member: false },
        ],
      });

      const channels = await client.listJoinedChannels();
      expect(channels).toHaveLength(3);
      expect(channels[0]).toEqual({
        id: 'C001',
        name: 'general',
        isMember: true,
      });
    });

    it('returns an empty array when API returns no channels', async () => {
      slackMocks.__mockConversationsList.mockResolvedValue({
        ok: false,
        channels: undefined,
      });

      const channels = await client.listJoinedChannels();
      expect(channels).toEqual([]);
    });
  });
});
