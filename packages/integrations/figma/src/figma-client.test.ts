import axios from 'axios';
import {
  FigmaClient,
  parseFigmaUrl,
  encryptToken,
  decryptToken,
  createFigmaClientFromEnv,
} from './figma-client';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// axios.create returns a fresh instance — we need to intercept both the
// factory and the instance's .get method.
const mockGet = jest.fn();
mockedAxios.create.mockReturnValue({
  get: mockGet,
  defaults: { timeout: 30_000 },
} as unknown as ReturnType<typeof axios.create>);

// axios.get (used for downloadImage) also needs to be mocked.
mockedAxios.get = jest.fn();

// ---------------------------------------------------------------------------
// parseFigmaUrl
// ---------------------------------------------------------------------------

describe('parseFigmaUrl', () => {
  it('parses a /file/ URL with no node-id', () => {
    const result = parseFigmaUrl('https://www.figma.com/file/aBcDeFgH/My-Design');
    expect(result).toEqual({ fileKey: 'aBcDeFgH', nodeId: undefined });
  });

  it('parses a /design/ URL with no node-id', () => {
    const result = parseFigmaUrl('https://www.figma.com/design/XyZ123/Title');
    expect(result).toEqual({ fileKey: 'XyZ123', nodeId: undefined });
  });

  it('parses a URL with a node-id and converts hyphens to colons', () => {
    const result = parseFigmaUrl(
      'https://www.figma.com/file/aBcDeFgH/My-Design?node-id=123-456',
    );
    expect(result).toEqual({ fileKey: 'aBcDeFgH', nodeId: '123:456' });
  });

  it('parses a /design/ URL with a node-id', () => {
    const result = parseFigmaUrl(
      'https://www.figma.com/design/KEY123/Name?node-id=10-20',
    );
    expect(result).toEqual({ fileKey: 'KEY123', nodeId: '10:20' });
  });

  it('throws for a non-Figma URL', () => {
    expect(() => parseFigmaUrl('https://example.com/something')).toThrow(
      /does not match a Figma file\/design path/,
    );
  });

  it('throws for an invalid URL string', () => {
    expect(() => parseFigmaUrl('not-a-url')).toThrow(/invalid URL/);
  });
});

// ---------------------------------------------------------------------------
// encryptToken / decryptToken
// ---------------------------------------------------------------------------

describe('encryptToken / decryptToken', () => {
  const key = 'a'.repeat(64); // 32 bytes as hex

  it('round-trips a token successfully', () => {
    const token = 'figd_super-secret-access-token';
    const encrypted = encryptToken(token, key);
    const decrypted = decryptToken(encrypted, key);
    expect(decrypted).toBe(token);
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const token = 'some-token';
    const enc1 = encryptToken(token, key);
    const enc2 = encryptToken(token, key);
    expect(enc1).not.toBe(enc2);
  });

  it('throws when the encryption key is the wrong length', () => {
    expect(() => encryptToken('token', 'tooshort')).toThrow(/32-byte hex string/);
  });

  it('throws when decrypting with the wrong key', () => {
    const token = 'secret';
    const encrypted = encryptToken(token, key);
    const wrongKey = 'b'.repeat(64);
    expect(() => decryptToken(encrypted, wrongKey)).toThrow();
  });

  it('throws for invalid encrypted JSON', () => {
    expect(() => decryptToken('not-valid-json', key)).toThrow(/invalid encrypted token JSON/);
  });
});

// ---------------------------------------------------------------------------
// FigmaClient constructor
// ---------------------------------------------------------------------------

describe('FigmaClient constructor', () => {
  it('throws when accessToken is empty', () => {
    expect(() => new FigmaClient({ accessToken: '' })).toThrow(/accessToken is required/);
  });

  it('constructs successfully with a valid token', () => {
    expect(() => new FigmaClient({ accessToken: 'figd_token' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// FigmaClient.getFile
// ---------------------------------------------------------------------------

describe('FigmaClient.getFile', () => {
  const client = new FigmaClient({ accessToken: 'figd_test' });

  beforeEach(() => jest.clearAllMocks());

  it('calls the correct endpoint and returns data', async () => {
    const mockData = { name: 'My File', document: { id: '0:0', name: 'Document', type: 'DOCUMENT' } };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await client.getFile('fileKey123');
    expect(mockGet).toHaveBeenCalledWith('/files/fileKey123', { params: undefined });
    expect(result).toEqual(mockData);
  });

  it('throws when fileKey is empty', async () => {
    await expect(client.getFile('')).rejects.toThrow(/fileKey is required/);
  });

  it('retries on 429 and eventually succeeds', async () => {
    const mockData = { name: 'File' };
    const rateLimitError = { response: { status: 429, data: 'rate limited' }, message: 'Request failed' };

    mockGet
      .mockRejectedValueOnce(rateLimitError)
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({ data: mockData });

    const fastClient = new FigmaClient({
      accessToken: 'token',
      maxRetries: 3,
      retryDelayMs: 1, // fast for tests
    });

    const result = await fastClient.getFile('key');
    expect(result).toEqual(mockData);
    expect(mockGet).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries', async () => {
    const serverError = { response: { status: 500, data: 'internal error' }, message: 'Request failed' };
    mockGet.mockRejectedValue(serverError);

    const fastClient = new FigmaClient({
      accessToken: 'token',
      maxRetries: 2,
      retryDelayMs: 1,
    });

    await expect(fastClient.getFile('key')).rejects.toThrow(/Figma API error 500/);
  });
});

// ---------------------------------------------------------------------------
// FigmaClient.getFileNodes
// ---------------------------------------------------------------------------

describe('FigmaClient.getFileNodes', () => {
  const client = new FigmaClient({ accessToken: 'figd_test' });

  beforeEach(() => jest.clearAllMocks());

  it('calls the correct endpoint with comma-joined IDs', async () => {
    const mockData = { nodes: {} };
    mockGet.mockResolvedValueOnce({ data: mockData });

    await client.getFileNodes('fileKey', ['1:2', '3:4']);
    expect(mockGet).toHaveBeenCalledWith('/files/fileKey/nodes', {
      params: { ids: '1:2,3:4' },
    });
  });

  it('throws when nodeIds array is empty', async () => {
    await expect(client.getFileNodes('fileKey', [])).rejects.toThrow(/at least one nodeId/);
  });
});

// ---------------------------------------------------------------------------
// FigmaClient.getImageExports
// ---------------------------------------------------------------------------

describe('FigmaClient.getImageExports', () => {
  const client = new FigmaClient({ accessToken: 'figd_test' });

  beforeEach(() => jest.clearAllMocks());

  it('calls the images endpoint with correct params', async () => {
    const mockData = { err: null, images: { '1:2': 'https://cdn.figma.com/img.png' } };
    mockGet.mockResolvedValueOnce({ data: mockData });

    const result = await client.getImageExports('fileKey', ['1:2'], 2);
    expect(mockGet).toHaveBeenCalledWith('/images/fileKey', {
      params: { ids: '1:2', scale: '2', format: 'png' },
    });
    expect(result).toEqual(mockData);
  });
});

// ---------------------------------------------------------------------------
// FigmaClient.downloadImage
// ---------------------------------------------------------------------------

describe('FigmaClient.downloadImage', () => {
  const client = new FigmaClient({ accessToken: 'figd_test' });

  beforeEach(() => jest.clearAllMocks());

  it('returns a Buffer from the CDN response', async () => {
    const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    (mockedAxios.get as jest.Mock).mockResolvedValueOnce({
      data: imageBytes.buffer,
    });

    const result = await client.downloadImage('https://cdn.figma.com/img.png');
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it('throws when imageUrl is empty', async () => {
    await expect(client.downloadImage('')).rejects.toThrow(/imageUrl is required/);
  });
});

// ---------------------------------------------------------------------------
// createFigmaClientFromEnv
// ---------------------------------------------------------------------------

describe('createFigmaClientFromEnv', () => {
  it('creates a client from plain-text FIGMA_ACCESS_TOKEN', () => {
    const env = { FIGMA_ACCESS_TOKEN: 'figd_plain' } as NodeJS.ProcessEnv;
    expect(() => createFigmaClientFromEnv(env)).not.toThrow();
  });

  it('creates a client from encrypted token', () => {
    const key = 'a'.repeat(64);
    const encrypted = encryptToken('figd_secret', key);
    const env = {
      FIGMA_ACCESS_TOKEN_ENCRYPTED: encrypted,
      FIGMA_ENCRYPTION_KEY: key,
    } as NodeJS.ProcessEnv;
    expect(() => createFigmaClientFromEnv(env)).not.toThrow();
  });

  it('throws when encrypted token is present but encryption key is missing', () => {
    const env = { FIGMA_ACCESS_TOKEN_ENCRYPTED: 'enc' } as NodeJS.ProcessEnv;
    expect(() => createFigmaClientFromEnv(env)).toThrow(/FIGMA_ENCRYPTION_KEY is required/);
  });

  it('throws when neither token nor encrypted token is set', () => {
    expect(() => createFigmaClientFromEnv({} as NodeJS.ProcessEnv)).toThrow(
      /FIGMA_ACCESS_TOKEN.*FIGMA_ACCESS_TOKEN_ENCRYPTED/,
    );
  });

  it('prefers encrypted token over plain-text token', () => {
    const key = 'c'.repeat(64);
    const encrypted = encryptToken('figd_encrypted', key);
    const env = {
      FIGMA_ACCESS_TOKEN: 'figd_plain',
      FIGMA_ACCESS_TOKEN_ENCRYPTED: encrypted,
      FIGMA_ENCRYPTION_KEY: key,
    } as NodeJS.ProcessEnv;
    // Should not throw — encrypted takes precedence.
    expect(() => createFigmaClientFromEnv(env)).not.toThrow();
  });
});
