import { createStorageProvider, createStorageProviderFromEnv } from '../src/index.js';
import type { StorageFile } from '../src/types.js';

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn().mockResolvedValue({
    Contents: [
      {
        Key: 'proj/run/result/screenshots/file.png',
        Size: 1024,
        LastModified: new Date('2024-01-01'),
        ETag: '"abc123"',
      },
    ],
    NextContinuationToken: undefined,
  });

  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    GetObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    DeleteObjectCommand: jest.fn().mockImplementation((params) => ({ input: params })),
    ListObjectsV2Command: jest.fn().mockImplementation((params) => ({ input: params })),
    __mockSend: mockSend,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/signed-url?token=abc'),
}));

// Mock MinIO SDK
const mockPutObject = jest.fn().mockResolvedValue({ etag: '"def456"' });
const mockPresignedGetObject = jest.fn().mockResolvedValue('http://localhost:9000/signed-url?token=xyz');
const mockRemoveObject = jest.fn().mockResolvedValue(undefined);

jest.mock('minio', () => {
  const EventEmitter = require('events');

  class MockMinioClient {
    putObject = mockPutObject;
    presignedGetObject = mockPresignedGetObject;
    removeObject = mockRemoveObject;

    listObjects(_bucket: string, _prefix: string, _recursive: boolean) {
      const emitter = new EventEmitter();
      process.nextTick(() => {
        emitter.emit('data', {
          name: 'proj/baselines/login.png',
          size: 2048,
          lastModified: new Date('2024-01-02'),
          etag: '"ghi789"',
        });
        emitter.emit('end');
      });
      return emitter;
    }
  }

  return { Client: MockMinioClient };
});

const sampleFile: StorageFile = {
  buffer: Buffer.from('fake-image-data'),
  mimeType: 'image/png',
  size: 15,
  originalName: 'screenshot.png',
};

describe('S3Provider', () => {
  const provider = createStorageProvider('s3', {
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  });

  describe('uploadScreenshot', () => {
    it('returns a storage key with correct path structure', async () => {
      const key = await provider.uploadScreenshot('proj-1', 'run-1', 'result-1', sampleFile);
      expect(key).toMatch(/^proj-1\/run-1\/result-1\/screenshots\/screenshot\.png$/);
    });

    it('generates a unique filename when originalName is not provided', async () => {
      const fileWithoutName: StorageFile = { ...sampleFile, originalName: undefined };
      const key = await provider.uploadScreenshot('proj-1', 'run-1', 'result-1', fileWithoutName);
      expect(key).toMatch(/^proj-1\/run-1\/result-1\/screenshots\/.+\.png$/);
    });
  });

  describe('uploadBaseline', () => {
    it('returns a storage key with baseline path structure', async () => {
      const key = await provider.uploadBaseline('proj-1', 'login-page.png', sampleFile);
      expect(key).toBe('proj-1/baselines/login-page.png');
    });
  });

  describe('uploadReport', () => {
    it('accepts string content and returns key with report path', async () => {
      const key = await provider.uploadReport('run-1', 'html', '<html><body>Report</body></html>');
      expect(key).toMatch(/^reports\/run-1\/html\/report-.+\.html$/);
    });

    it('accepts Buffer content', async () => {
      const key = await provider.uploadReport('run-1', 'json', Buffer.from('{"tests": []}'));
      expect(key).toMatch(/^reports\/run-1\/json\/report-.+\.json$/);
    });
  });

  describe('getSignedUrl', () => {
    it('returns a presigned URL string', async () => {
      const url = await provider.getSignedUrl('proj-1/run-1/result-1/screenshots/file.png');
      expect(url).toMatch(/^https?:\/\//);
    });

    it('accepts custom expiration seconds', async () => {
      const { getSignedUrl: awsGetSignedUrl } = jest.requireMock('@aws-sdk/s3-request-presigner');
      await provider.getSignedUrl('some/key', 7200);
      expect(awsGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 7200 }),
      );
    });
  });

  describe('deleteObject', () => {
    it('completes without error', async () => {
      await expect(provider.deleteObject('proj-1/run-1/result-1/screenshots/file.png')).resolves.toBeUndefined();
    });
  });

  describe('listObjects', () => {
    it('returns array of storage objects', async () => {
      const objects = await provider.listObjects('proj-1/run-1');
      expect(objects).toHaveLength(1);
      expect(objects[0]).toMatchObject({
        key: 'proj/run/result/screenshots/file.png',
        size: 1024,
        etag: '"abc123"',
      });
    });
  });
});

describe('MinioProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const provider = createStorageProvider('minio', {
    bucket: 'test-bucket',
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin',
    endpoint: 'http://localhost:9000',
    useSSL: false,
  });

  describe('uploadScreenshot', () => {
    it('returns a storage key with correct path structure', async () => {
      const key = await provider.uploadScreenshot('proj-2', 'run-2', 'result-2', sampleFile);
      expect(key).toMatch(/^proj-2\/run-2\/result-2\/screenshots\/screenshot\.png$/);
      expect(mockPutObject).toHaveBeenCalledWith(
        'test-bucket',
        expect.stringContaining('screenshots'),
        sampleFile.buffer,
        sampleFile.size,
        expect.objectContaining({ 'Content-Type': 'image/png' }),
      );
    });
  });

  describe('uploadBaseline', () => {
    it('returns baseline storage key', async () => {
      const key = await provider.uploadBaseline('proj-2', 'home.png', sampleFile);
      expect(key).toBe('proj-2/baselines/home.png');
    });
  });

  describe('uploadReport', () => {
    it('uploads string report content', async () => {
      const key = await provider.uploadReport('run-2', 'json', '{"status":"pass"}');
      expect(key).toMatch(/^reports\/run-2\/json\//);
    });
  });

  describe('getSignedUrl', () => {
    it('returns a presigned URL', async () => {
      const url = await provider.getSignedUrl('proj-2/baselines/home.png');
      expect(url).toBe('http://localhost:9000/signed-url?token=xyz');
      expect(mockPresignedGetObject).toHaveBeenCalledWith(
        'test-bucket',
        'proj-2/baselines/home.png',
        3600,
      );
    });

    it('uses custom expiration when provided', async () => {
      await provider.getSignedUrl('some/key', 900);
      expect(mockPresignedGetObject).toHaveBeenCalledWith('test-bucket', 'some/key', 900);
    });
  });

  describe('deleteObject', () => {
    it('completes without error', async () => {
      await expect(provider.deleteObject('proj-2/baselines/home.png')).resolves.toBeUndefined();
      expect(mockRemoveObject).toHaveBeenCalledWith('test-bucket', 'proj-2/baselines/home.png');
    });
  });

  describe('listObjects', () => {
    it('returns array of storage objects from stream', async () => {
      const objects = await provider.listObjects('proj-2/baselines');
      expect(objects).toHaveLength(1);
      expect(objects[0]).toMatchObject({
        key: 'proj/baselines/login.png',
        size: 2048,
      });
    });
  });
});

describe('createStorageProviderFromEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      S3_PROVIDER: 's3',
      S3_BUCKET: 'env-bucket',
      AWS_ACCESS_KEY_ID: 'env-key',
      AWS_SECRET_ACCESS_KEY: 'env-secret',
      AWS_REGION: 'eu-west-1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('creates a provider from environment variables', () => {
    const provider = createStorageProviderFromEnv();
    expect(provider).toBeDefined();
  });

  it('throws when required environment variable is missing', () => {
    delete process.env['S3_BUCKET'];
    expect(() => createStorageProviderFromEnv()).toThrow(
      'Required environment variable "S3_BUCKET" is not set',
    );
  });
});

describe('createStorageProvider', () => {
  it('creates an S3 provider when type is "s3"', () => {
    const provider = createStorageProvider('s3', {
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
    });
    expect(provider).toBeDefined();
  });

  it('creates a MinIO provider when type is "minio"', () => {
    const provider = createStorageProvider('minio', {
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
    });
    expect(provider).toBeDefined();
  });

  it('uses S3_PROVIDER env var when type is undefined', () => {
    const originalEnv = process.env['S3_PROVIDER'];
    process.env['S3_PROVIDER'] = 'minio';
    const provider = createStorageProvider(undefined, {
      bucket: 'b',
      accessKeyId: 'k',
      secretAccessKey: 's',
    });
    expect(provider).toBeDefined();
    process.env['S3_PROVIDER'] = originalEnv;
  });
});
