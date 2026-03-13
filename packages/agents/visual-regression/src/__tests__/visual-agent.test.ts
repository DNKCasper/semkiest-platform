import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { VisualRegressionAgent } from '../visual-agent.js';
import type { Baseline, S3Config, Sitemap, SitemapPage, VisualRegressionInput } from '../types.js';
import { VIEWPORTS } from '../types.js';

// ---------------------------------------------------------------------------
// Dependency mocks
// ---------------------------------------------------------------------------

const mockCapturePages = jest.fn<() => Promise<import('../types.js').CaptureResult[]>>();
const mockCaptureInit = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockCaptureClose = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.mock('../screenshot-capture.js', () => ({
  ScreenshotCapture: jest.fn().mockImplementation(() => ({
    init: mockCaptureInit,
    close: mockCaptureClose,
    capturePages: mockCapturePages,
  })),
}));

const mockCreateBaseline = jest.fn<() => Promise<Baseline>>();
const mockUpdateBaseline = jest.fn<() => Promise<Baseline>>();

jest.mock('../baseline-manager.js', () => ({
  BaselineManager: jest.fn().mockImplementation(() => ({
    createBaseline: mockCreateBaseline,
    updateBaseline: mockUpdateBaseline,
  })),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const s3Config: S3Config = {
  bucket: 'test-bucket',
  region: 'us-east-1',
  accessKeyId: 'test-key',
  secretAccessKey: 'test-secret',
};

const makeBaseline = (page: string, viewport: string): Baseline => ({
  key: { project: 'semkiest', page, viewport },
  s3Key: `semkiest/${page}/${viewport}.png`,
  s3Bucket: 'test-bucket',
  status: 'pending',
  version: 1,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  checksum: 'abc123',
});

const makeCaptureResult = (page: string, viewport: import('../types.js').Viewport) => ({
  url: `https://example.com/${page}`,
  page,
  viewport,
  screenshot: Buffer.from('fake-png'),
  capturedAt: new Date(),
});

const pages: SitemapPage[] = [
  { url: 'https://example.com/dashboard', name: 'dashboard' },
  { url: 'https://example.com/settings', name: 'settings' },
];

const sitemap: Sitemap = {
  project: 'semkiest',
  baseUrl: 'https://example.com',
  pages,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VisualRegressionAgent', () => {
  let agent: VisualRegressionAgent;

  beforeEach(() => {
    agent = new VisualRegressionAgent({ s3: s3Config });
    jest.clearAllMocks();
    mockCaptureInit.mockResolvedValue(undefined);
    mockCaptureClose.mockResolvedValue(undefined);
  });

  describe('run() lifecycle', () => {
    it('returns success result', async () => {
      mockCapturePages.mockResolvedValue([]);

      const result = await agent.run({
        project: 'semkiest',
        pages,
        operation: 'capture',
      });

      expect(result.success).toBe(true);
      expect(result.agentName).toBe('VisualRegressionAgent');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('closes browser even when execute throws', async () => {
      mockCapturePages.mockRejectedValue(new Error('Playwright crash'));

      const result = await agent.run({ project: 'semkiest', pages });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Playwright crash');
      expect(mockCaptureClose).toHaveBeenCalled();
    });

    it('initializes browser during run', async () => {
      mockCapturePages.mockResolvedValue([]);
      await agent.run({ project: 'semkiest', pages, operation: 'capture' });
      expect(mockCaptureInit).toHaveBeenCalled();
    });
  });

  describe('execute() — capture operation', () => {
    it('returns empty baselines when operation is capture', async () => {
      const captures = [makeCaptureResult('dashboard', VIEWPORTS.desktop)];
      mockCapturePages.mockResolvedValue(captures);

      const result = await agent.run({
        project: 'semkiest',
        pages,
        operation: 'capture',
      });

      expect(result.data?.baselines).toHaveLength(0);
      expect(result.data?.capturedPages).toBe(2);
    });

    it('does not call baseline manager for capture operation', async () => {
      mockCapturePages.mockResolvedValue([]);
      await agent.run({ project: 'semkiest', pages, operation: 'capture' });
      expect(mockCreateBaseline).not.toHaveBeenCalled();
      expect(mockUpdateBaseline).not.toHaveBeenCalled();
    });
  });

  describe('execute() — create-baselines operation', () => {
    it('creates baselines for all captures', async () => {
      const captures = [
        makeCaptureResult('dashboard', VIEWPORTS.desktop),
        makeCaptureResult('settings', VIEWPORTS.desktop),
      ];
      mockCapturePages.mockResolvedValue(captures);
      mockCreateBaseline
        .mockResolvedValueOnce(makeBaseline('dashboard', 'desktop'))
        .mockResolvedValueOnce(makeBaseline('settings', 'desktop'));

      const result = await agent.run({
        project: 'semkiest',
        pages,
        operation: 'create-baselines',
      });

      expect(result.data?.baselines).toHaveLength(2);
      expect(mockCreateBaseline).toHaveBeenCalledTimes(2);
    });

    it('records errors without throwing when individual baseline fails', async () => {
      const captures = [makeCaptureResult('dashboard', VIEWPORTS.desktop)];
      mockCapturePages.mockResolvedValue(captures);
      mockCreateBaseline.mockRejectedValue(new Error('Baseline already exists'));

      const result = await agent.run({
        project: 'semkiest',
        pages,
        operation: 'create-baselines',
      });

      expect(result.success).toBe(true);
      expect(result.data?.errors).toHaveLength(1);
      expect(result.data?.errors[0]).toContain('Baseline already exists');
    });
  });

  describe('execute() — update-baselines operation', () => {
    it('calls updateBaseline for each capture', async () => {
      const captures = [makeCaptureResult('dashboard', VIEWPORTS.desktop)];
      mockCapturePages.mockResolvedValue(captures);
      mockUpdateBaseline.mockResolvedValue(makeBaseline('dashboard', 'desktop'));

      await agent.run({
        project: 'semkiest',
        pages,
        operation: 'update-baselines',
      });

      expect(mockUpdateBaseline).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute() — sitemap integration', () => {
    it('uses sitemap pages when provided', async () => {
      mockCapturePages.mockResolvedValue([]);

      const input: VisualRegressionInput = {
        project: 'semkiest',
        sitemap,
        operation: 'capture',
      };

      await agent.run(input);

      expect(mockCapturePages).toHaveBeenCalledWith(
        sitemap.pages,
        expect.objectContaining({}),
      );
    });

    it('prefers sitemap over explicit pages when both provided', async () => {
      mockCapturePages.mockResolvedValue([]);

      const input: VisualRegressionInput = {
        project: 'semkiest',
        sitemap,
        pages: [{ url: 'https://other.com', name: 'other' }],
        operation: 'capture',
      };

      await agent.run(input);

      expect(mockCapturePages).toHaveBeenCalledWith(sitemap.pages, expect.anything());
    });
  });

  describe('execute() — empty input', () => {
    it('returns zero captures when no pages or sitemap provided', async () => {
      const result = await agent.run({ project: 'semkiest' });

      expect(result.success).toBe(true);
      expect(result.data?.capturedPages).toBe(0);
      expect(result.data?.baselines).toHaveLength(0);
      expect(mockCapturePages).not.toHaveBeenCalled();
    });
  });

  describe('execute() — viewport configuration', () => {
    it('passes custom viewports to capture when configured', async () => {
      mockCapturePages.mockResolvedValue([]);

      await agent.run({
        project: 'semkiest',
        pages,
        operation: 'capture',
        captureOptions: {
          viewports: [VIEWPORTS.mobile, VIEWPORTS.desktop],
        },
      });

      expect(mockCapturePages).toHaveBeenCalledWith(
        pages,
        expect.objectContaining({
          viewports: [VIEWPORTS.mobile, VIEWPORTS.desktop],
        }),
      );
    });

    it('uses all viewports by default', async () => {
      mockCapturePages.mockResolvedValue([]);

      await agent.run({
        project: 'semkiest',
        pages,
        operation: 'capture',
      });

      expect(mockCapturePages).toHaveBeenCalledWith(
        pages,
        expect.objectContaining({
          viewports: Object.values(VIEWPORTS),
        }),
      );
    });
  });
});
