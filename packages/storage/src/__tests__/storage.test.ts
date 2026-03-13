import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock external SDKs before importing the providers under test
// ---------------------------------------------------------------------------

const mockS3Send = vi.fn();
const mockGetSignedUrl = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(() => ({ send: mockS3Send })),
    PutObjectCommand: vi.fn().mockImplementation((input) => ({ input, _name: 'PutObjectCommand' })),
    GetObjectCommand: vi.fn().mockImplementation((input) => ({ input, _name: 'GetObjectCommand' })),
    DeleteObjectCommand: vi.fn().mockImplementation((input) => ({ input, _name: 'DeleteObjectCommand' })),
    ListObjectsV2Command: vi.fn().mockImplementation((input) => ({ input, _name: 'ListObjectsV2Command' })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

const mockPresignedGetObject = vi.fn();
const mockRemoveObject = vi.fn();
const mockPutObject = vi.fn();
const mockListObjects = vi.fn();

vi.mock('minio', () => {
  const { EventEmitter } = require('events');

  class MockClient {
    presignedGetObject = mockPresignedGetObject;
    removeObject = mockRemoveObject;
    putObject = mockPutObject;
    listObjects = mockListObjects;
  }

  return { Client: MockClient, default: { Client: MockClient }, EventEmitter };
});

vi.mock('@semkiest/shared-utils', () => ({
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  retry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => ({
    value: await fn(),
    attempts: 1,
  })),
}));

vi.mock('@semkiest/shared-config/env/s3', () => ({
  parseS3Env: vi.fn().mockReturnValue({
    S3_BUCKET: 'test-bucket',
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'test-key',
    S3_SECRET_ACCESS_KEY: 'test-secret',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_FORCE_PATH_STYLE: true,
  }),
}));

// ---------------------------------------------------------------------------
// Import providers after mocks are established
// ---------------------------------------------------------------------------

import { S3Provider } from '../s3-provider.js';
import { MinioProvider } from '../minio-provider.js';
import { createStorageProvider } from '../index.js';
import type { StorageConfig, UploadFileInput } from '../types.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_CONFIG: StorageConfig = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
  endpoint: 'http://localhost:9000',
  forcePathStyle: true,
};

const TEST_FILE: UploadFileInput = {
  buffer: Buffer.from('fake-image-data'),
  contentType: 'image/png',
  size: 15,
  metadata: { source: 'test-runner' },
};

// ---------------------------------------------------------------------------
// S3Provider tests
// ---------------------------------------------------------------------------

describe('S3Provider', () => {
  let provider: S3Provider;

  beforeEach(() => {
    provider = new S3Provider(TEST_CONFIG);
    mockS3Send.mockResolvedValue({});
    mockGetSignedUrl.mockResolvedValue('https://s3.example.com/signed-url?token=abc');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadScreenshot', () => {
    it('returns a storage key with expected path segments', async () => {
      const key = await provider.uploadScreenshot('proj-1', 'run-1', 'result-1', TEST_FILE);

      expect(key).toMatch(/^proj-1\/run-1\/screenshots\/result-1\/\d+\.png$/);
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });

    it('includes content-type and metadata in the put command', async () => {
      await provider.uploadScreenshot('proj-1', 'run-1', 'result-1', TEST_FILE);

      const [command] = mockS3Send.mock.calls[0] as [{ input: Record<string, unknown> }][];
      expect(command.input['ContentType']).toBe('image/png');
      expect(command.input['Metadata']).toEqual({ source: 'test-runner' });
    });
  });

  describe('uploadBaseline', () => {
    it('returns a storage key under the baselines prefix', async () => {
      const key = await provider.uploadBaseline('proj-1', 'login-page.png', TEST_FILE);

      expect(key).toBe('proj-1/baselines/login-page.png');
      expect(mockS3Send).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadReport', () => {
    it('returns a storage key under the reports prefix for html format', async () => {
      const key = await provider.uploadReport('run-1', 'html', '<html></html>');

      expect(key).toMatch(/^run-1\/reports\/html\/\d+-report\.html$/);
    });

    it('accepts a Buffer as content', async () => {
      const content = Buffer.from('{"pass":true}');
      const key = await provider.uploadReport('run-1', 'json', content);

      expect(key).toMatch(/^run-1\/reports\/json\/\d+-report\.json$/);
    });
  });

  describe('getSignedUrl', () => {
    it('returns the pre-signed URL from the SDK', async () => {
      const url = await provider.getSignedUrl('proj-1/run-1/screenshots/result-1/img.png');

      expect(url).toBe('https://s3.example.com/signed-url?token=abc');
      expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('uses the default expiration of 3600 seconds', async () => {
      await provider.getSignedUrl('some/key');

      const [, , options] = mockGetSignedUrl.mock.calls[0] as [unknown, unknown, { expiresIn: number }][];
      expect(options.expiresIn).toBe(3600);
    });

    it('honours a custom expiration', async () => {
      await provider.getSignedUrl('some/key', 900);

      const [, , options] = mockGetSignedUrl.mock.calls[0] as [unknown, unknown, { expiresIn: number }][];
      expect(options.expiresIn).toBe(900);
    });
  });

  describe('deleteObject', () => {
    it('sends a DeleteObjectCommand for the given key', async () => {
      await provider.deleteObject('proj-1/run-1/screenshots/result-1/img.png');

      const [command] = mockS3Send.mock.calls[0] as [{ _name: string; input: Record<string, unknown> }][];
      expect(command._name).toBe('DeleteObjectCommand');
      expect(command.input['Key']).toBe('proj-1/run-1/screenshots/result-1/img.png');
    });
  });

  describe('listObjects', () => {
    it('returns an empty array when S3 returns no contents', async () => {
      mockS3Send.mockResolvedValueOnce({ Contents: [], NextContinuationToken: undefined });

      const results = await provider.listObjects('proj-1/');
      expect(results).toEqual([]);
    });

    it('maps S3 objects to StorageObject shape', async () => {
      const now = new Date();
      mockS3Send.mockResolvedValueOnce({
        Contents: [
          { Key: 'proj-1/run-1/img.png', Size: 1024, LastModified: now, ETag: '"abc123"' },
        ],
        NextContinuationToken: undefined,
      });

      const results = await provider.listObjects('proj-1/');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        key: 'proj-1/run-1/img.png',
        size: 1024,
        lastModified: now,
        etag: 'abc123',
      });
    });

    it('handles pagination by following NextContinuationToken', async () => {
      const now = new Date();
      mockS3Send
        .mockResolvedValueOnce({
          Contents: [{ Key: 'proj-1/a.png', Size: 10, LastModified: now, ETag: '"e1"' }],
          NextContinuationToken: 'token-2',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'proj-1/b.png', Size: 20, LastModified: now, ETag: '"e2"' }],
          NextContinuationToken: undefined,
        });

      const results = await provider.listObjects('proj-1/');

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.key)).toEqual(['proj-1/a.png', 'proj-1/b.png']);
    });
  });
});

// ---------------------------------------------------------------------------
// MinioProvider tests
// ---------------------------------------------------------------------------

describe('MinioProvider', () => {
  let provider: MinioProvider;

  beforeEach(() => {
    provider = new MinioProvider(TEST_CONFIG);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadScreenshot', () => {
    it('returns a storage key with expected path segments', async () => {
      mockPutObject.mockResolvedValue(undefined);

      const key = await provider.uploadScreenshot('proj-2', 'run-2', 'result-2', TEST_FILE);

      expect(key).toMatch(/^proj-2\/run-2\/screenshots\/result-2\/\d+\.png$/);
      expect(mockPutObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadBaseline', () => {
    it('returns the expected baseline key', async () => {
      mockPutObject.mockResolvedValue(undefined);

      const key = await provider.uploadBaseline('proj-2', 'homepage.png', TEST_FILE);

      expect(key).toBe('proj-2/baselines/homepage.png');
    });
  });

  describe('uploadReport', () => {
    it('returns a report key for json format', async () => {
      mockPutObject.mockResolvedValue(undefined);

      const key = await provider.uploadReport('run-2', 'json', '{"result":"ok"}');

      expect(key).toMatch(/^run-2\/reports\/json\/\d+-report\.json$/);
    });
  });

  describe('getSignedUrl', () => {
    it('delegates to presignedGetObject and returns the URL', async () => {
      mockPresignedGetObject.mockResolvedValue('http://minio.local/signed?token=xyz');

      const url = await provider.getSignedUrl('proj-2/run-2/img.png');

      expect(url).toBe('http://minio.local/signed?token=xyz');
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'proj-2/run-2/img.png', 3600);
    });

    it('passes custom expiration seconds', async () => {
      mockPresignedGetObject.mockResolvedValue('http://minio.local/signed?token=xyz');

      await provider.getSignedUrl('proj-2/run-2/img.png', 600);

      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'proj-2/run-2/img.png', 600);
    });
  });

  describe('deleteObject', () => {
    it('calls removeObject with bucket and key', async () => {
      mockRemoveObject.mockResolvedValue(undefined);

      await provider.deleteObject('proj-2/run-2/img.png');

      expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', 'proj-2/run-2/img.png');
    });
  });

  describe('listObjects', () => {
    it('collects items from the listObjects stream', async () => {
      const { EventEmitter } = await import('events');
      const emitter = new EventEmitter();

      mockListObjects.mockReturnValue(emitter);

      const resultPromise = provider.listObjects('proj-2/');

      // Emit data then end
      const now = new Date();
      process.nextTick(() => {
        emitter.emit('data', { name: 'proj-2/run-2/img.png', size: 512, lastModified: now, etag: '"et1"' });
        emitter.emit('end');
      });

      const results = await resultPromise;

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        key: 'proj-2/run-2/img.png',
        size: 512,
        lastModified: now,
      });
    });

    it('rejects when the stream emits an error', async () => {
      const { EventEmitter } = await import('events');
      const emitter = new EventEmitter();

      mockListObjects.mockReturnValue(emitter);

      const resultPromise = provider.listObjects('proj-2/');

      process.nextTick(() => {
        emitter.emit('error', new Error('stream error'));
      });

      await expect(resultPromise).rejects.toThrow('stream error');
    });
  });
});

// ---------------------------------------------------------------------------
// createStorageProvider factory tests
// ---------------------------------------------------------------------------

describe('createStorageProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns a MinioProvider by default when S3_PROVIDER is not set', () => {
    vi.stubEnv('S3_PROVIDER', '');
    const provider = createStorageProvider();
    expect(provider).toBeInstanceOf(MinioProvider);
  });

  it('returns a MinioProvider when S3_PROVIDER=minio', () => {
    vi.stubEnv('S3_PROVIDER', 'minio');
    const provider = createStorageProvider();
    expect(provider).toBeInstanceOf(MinioProvider);
  });

  it('returns an S3Provider when S3_PROVIDER=s3', () => {
    vi.stubEnv('S3_PROVIDER', 's3');
    const provider = createStorageProvider();
    expect(provider).toBeInstanceOf(S3Provider);
  });

  it('respects an explicit overrideType argument', () => {
    const provider = createStorageProvider('s3');
    expect(provider).toBeInstanceOf(S3Provider);
  });
});
