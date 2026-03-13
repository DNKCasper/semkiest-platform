import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { BaselineManager } from '../baseline-manager.js';
import type { BaselineKey, S3Config } from '../types.js';

// ---------------------------------------------------------------------------
// AWS SDK mock
// ---------------------------------------------------------------------------

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'PutObjectCommand' })),
    GetObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'GetObjectCommand' })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'HeadObjectCommand' })),
    ListObjectsV2Command: jest.fn().mockImplementation((input) => ({ input, _type: 'ListObjectsV2Command' })),
    DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input, _type: 'DeleteObjectCommand' })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const s3Config: S3Config = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

const testKey: BaselineKey = {
  project: 'semkiest',
  page: 'dashboard',
  viewport: 'desktop',
};

const testKeyWithElement: BaselineKey = {
  project: 'semkiest',
  page: 'dashboard',
  viewport: 'desktop',
  element: '#header',
};

const testScreenshot = Buffer.from('fake-png-data');

function makeMetadataBody(overrides: Partial<{
  status: string;
  version: number;
  element: string | undefined;
}> = {}): { Body: AsyncIterable<Buffer> } {
  const metadata = {
    key: testKey,
    status: overrides.status ?? 'pending',
    version: overrides.version ?? 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    checksum: 'abc123',
  };
  const body = Buffer.from(JSON.stringify(metadata));
  return {
    Body: (async function* () { yield body; })(),
  };
}

function makeImageBody(): { Body: AsyncIterable<Buffer> } {
  return {
    Body: (async function* () { yield testScreenshot; })(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BaselineManager', () => {
  let manager: BaselineManager;

  beforeEach(() => {
    manager = new BaselineManager(s3Config);
    jest.clearAllMocks();
  });

  describe('createBaseline', () => {
    it('creates a baseline when none exists', async () => {
      // getBaseline returns null (metadata GET throws)
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      // uploadImage and uploadMetadata succeed
      mockSend.mockResolvedValue({});

      const baseline = await manager.createBaseline(testKey, testScreenshot);

      expect(baseline.key).toEqual(testKey);
      expect(baseline.status).toBe('pending');
      expect(baseline.version).toBe(1);
      expect(baseline.s3Bucket).toBe('test-bucket');
      expect(baseline.checksum).toBeTruthy();
    });

    it('throws when a baseline already exists', async () => {
      // getBaseline returns existing metadata
      mockSend.mockResolvedValueOnce(makeMetadataBody());

      await expect(manager.createBaseline(testKey, testScreenshot)).rejects.toThrow(
        'Baseline already exists',
      );
    });
  });

  describe('getBaseline', () => {
    it('returns null when no baseline exists', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      const result = await manager.getBaseline(testKey);
      expect(result).toBeNull();
    });

    it('returns baseline metadata when it exists', async () => {
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 2, status: 'approved' }));
      const result = await manager.getBaseline(testKey);
      expect(result).not.toBeNull();
      expect(result?.version).toBe(2);
      expect(result?.status).toBe('approved');
    });

    it('returns null when S3 returns unexpected error', async () => {
      mockSend.mockRejectedValueOnce(new Error('AccessDenied'));
      const result = await manager.getBaseline(testKey);
      expect(result).toBeNull();
    });
  });

  describe('updateBaseline', () => {
    it('increments the version and archives the previous image', async () => {
      // getBaseline: returns existing (v1)
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 1 }));
      // archiveVersion: download image
      mockSend.mockResolvedValueOnce(makeImageBody());
      // archiveVersion: upload archived image
      mockSend.mockResolvedValueOnce({});
      // archiveVersion: download current metadata
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 1 }));
      // archiveVersion: upload archived metadata
      mockSend.mockResolvedValueOnce({});
      // upload new image
      mockSend.mockResolvedValueOnce({});
      // upload new metadata
      mockSend.mockResolvedValueOnce({});

      const baseline = await manager.updateBaseline(testKey, testScreenshot);

      expect(baseline.version).toBe(2);
      expect(baseline.status).toBe('pending');
    });

    it('creates a new baseline when none exists (version 1)', async () => {
      // getBaseline returns null
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      // upload image
      mockSend.mockResolvedValueOnce({});
      // upload metadata
      mockSend.mockResolvedValueOnce({});

      const baseline = await manager.updateBaseline(testKey, testScreenshot);

      expect(baseline.version).toBe(1);
    });
  });

  describe('approveBaseline', () => {
    it('transitions status to approved', async () => {
      // downloadMetadata
      mockSend.mockResolvedValueOnce(makeMetadataBody({ status: 'pending' }));
      // uploadMetadata
      mockSend.mockResolvedValueOnce({});

      const baseline = await manager.approveBaseline(testKey);
      expect(baseline.status).toBe('approved');
    });
  });

  describe('rejectBaseline', () => {
    it('transitions status to rejected', async () => {
      // downloadMetadata
      mockSend.mockResolvedValueOnce(makeMetadataBody({ status: 'pending' }));
      // uploadMetadata
      mockSend.mockResolvedValueOnce({});

      const baseline = await manager.rejectBaseline(testKey);
      expect(baseline.status).toBe('rejected');
    });
  });

  describe('listBaselines', () => {
    it('returns all baselines for a project', async () => {
      // ListObjectsV2
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'semkiest/dashboard/desktop.json' },
          { Key: 'semkiest/dashboard/mobile.json' },
          { Key: 'semkiest/dashboard/desktop/history/1.json' }, // excluded
        ],
        NextContinuationToken: undefined,
      });
      // GetObject for first metadata
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 1 }));
      // GetObject for second metadata (different viewport)
      mockSend.mockResolvedValueOnce(
        makeMetadataBody({ version: 1 }),
      );

      const baselines = await manager.listBaselines('semkiest');
      // Only 2 non-history json files
      expect(baselines.length).toBe(2);
    });

    it('handles pagination via continuation token', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'semkiest/page1/desktop.json' }],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({
          Contents: [{ Key: 'semkiest/page2/desktop.json' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce(makeMetadataBody())
        .mockResolvedValueOnce(makeMetadataBody());

      const baselines = await manager.listBaselines('semkiest');
      expect(baselines.length).toBe(2);
    });
  });

  describe('getBaselineHistory', () => {
    it('returns history entries sorted by version', async () => {
      mockSend.mockResolvedValueOnce({
        Contents: [
          { Key: 'semkiest/dashboard/desktop/history/2.json' },
          { Key: 'semkiest/dashboard/desktop/history/1.json' },
          { Key: 'semkiest/dashboard/desktop/history/1.png' }, // filtered out
          { Key: 'semkiest/dashboard/desktop/history/2.png' }, // filtered out
        ],
        NextContinuationToken: undefined,
      });
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 2 }));
      mockSend.mockResolvedValueOnce(makeMetadataBody({ version: 1 }));

      const history = await manager.getBaselineHistory(testKey);
      expect(history.length).toBe(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
    });
  });

  describe('S3 key structure', () => {
    it('creates correct key path for page-level baseline', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      mockSend.mockResolvedValue({});

      await manager.createBaseline(testKey, testScreenshot);

      // Second call uploads the image — verify key format
      const putCalls = mockSend.mock.calls as Array<[{ input: { Key: string } }]>;
      const imageUpload = putCalls.find(
        ([cmd]) => cmd?.input?.Key?.endsWith('.png'),
      );
      expect(imageUpload?.[0].input.Key).toBe('semkiest/dashboard/desktop.png');
    });

    it('creates correct key path for element-level baseline', async () => {
      mockSend.mockRejectedValueOnce(new Error('NoSuchKey'));
      mockSend.mockResolvedValue({});

      await manager.createBaseline(testKeyWithElement, testScreenshot);

      const putCalls = mockSend.mock.calls as Array<[{ input: { Key: string } }]>;
      const imageUpload = putCalls.find(
        ([cmd]) => cmd?.input?.Key?.endsWith('.png'),
      );
      expect(imageUpload?.[0].input.Key).toBe('semkiest/dashboard/desktop/_header.png');
    });
  });

  describe('MinIO configuration', () => {
    it('passes endpoint and forcePathStyle to S3Client', () => {
      const { S3Client: MockedS3Client } = jest.mocked(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('@aws-sdk/client-s3') as { S3Client: jest.Mock },
      );

      new BaselineManager({
        ...s3Config,
        endpoint: 'http://localhost:9000',
        forcePathStyle: true,
      });

      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
        }),
      );
    });
  });
});
