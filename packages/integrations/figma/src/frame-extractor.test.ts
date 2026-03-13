import { FrameExtractor, collectAllFrames } from './frame-extractor';
import { FigmaClient } from './figma-client';
import type { FigmaNode, FigmaFileResponse, FigmaNodesResponse } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFrame(id: string, name: string, width = 100, height = 100): FigmaNode {
  return {
    id,
    name,
    type: 'FRAME',
    absoluteBoundingBox: { x: 0, y: 0, width, height },
    children: [],
  };
}

function makeDocument(frames: FigmaNode[]): FigmaNode {
  return {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: [
      {
        id: '0:1',
        name: 'Page 1',
        type: 'CANVAS',
        children: frames,
      },
    ],
  };
}

function makeFileResponse(frames: FigmaNode[]): FigmaFileResponse {
  return {
    name: 'Test File',
    lastModified: '2024-01-01T00:00:00Z',
    thumbnailUrl: '',
    version: '1',
    document: makeDocument(frames),
    components: {
      compKey: { key: 'compKey', name: 'ButtonPrimary', description: '' },
    },
  };
}

// ---------------------------------------------------------------------------
// collectAllFrames
// ---------------------------------------------------------------------------

describe('collectAllFrames', () => {
  it('returns an empty array for a document with no frames', () => {
    const doc: FigmaNode = {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [{ id: '0:1', name: 'Page 1', type: 'CANVAS', children: [] }],
    };
    expect(collectAllFrames(doc)).toEqual([]);
  });

  it('collects top-level frames from canvases', () => {
    const frame1 = makeFrame('1:1', 'Frame A');
    const frame2 = makeFrame('1:2', 'Frame B');
    const doc = makeDocument([frame1, frame2]);
    const frames = collectAllFrames(doc);
    expect(frames).toHaveLength(2);
    expect(frames.map((f) => f.id)).toEqual(['1:1', '1:2']);
  });

  it('collects nested frames recursively', () => {
    const inner = makeFrame('2:1', 'Inner Frame');
    const outer: FigmaNode = {
      id: '1:1',
      name: 'Outer Frame',
      type: 'FRAME',
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 200 },
      children: [inner],
    };
    const doc = makeDocument([outer]);
    const frames = collectAllFrames(doc);
    // Both outer and inner are FRAME nodes.
    expect(frames).toHaveLength(2);
  });

  it('includes COMPONENT nodes', () => {
    const comp: FigmaNode = {
      id: '3:1',
      name: 'Button',
      type: 'COMPONENT',
      absoluteBoundingBox: { x: 0, y: 0, width: 80, height: 40 },
    };
    const doc = makeDocument([comp]);
    const frames = collectAllFrames(doc);
    expect(frames).toHaveLength(1);
    expect(frames[0].type).toBe('COMPONENT');
  });

  it('does not include non-frame nodes', () => {
    const text: FigmaNode = { id: '4:1', name: 'Label', type: 'TEXT' };
    const doc = makeDocument([text]);
    expect(collectAllFrames(doc)).toHaveLength(0);
  });

  it('handles a document with no children', () => {
    const doc: FigmaNode = { id: '0:0', name: 'Document', type: 'DOCUMENT' };
    expect(collectAllFrames(doc)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FrameExtractor
// ---------------------------------------------------------------------------

describe('FrameExtractor', () => {
  let mockClient: jest.Mocked<Pick<FigmaClient, 'getFile' | 'getFileNodes' | 'getImageExports' | 'downloadImage'>>;
  let extractor: FrameExtractor;

  beforeEach(() => {
    mockClient = {
      getFile: jest.fn(),
      getFileNodes: jest.fn(),
      getImageExports: jest.fn(),
      downloadImage: jest.fn(),
    };
    extractor = new FrameExtractor(mockClient as unknown as FigmaClient);
  });

  // -------------------------------------------------------------------------
  // extractFromFile
  // -------------------------------------------------------------------------

  describe('extractFromFile', () => {
    it('returns empty array when file has no frames', async () => {
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([]));
      const result = await extractor.extractFromFile('fileKey');
      expect(result).toEqual([]);
      expect(mockClient.getImageExports).not.toHaveBeenCalled();
    });

    it('exports frames at default scales [1, 2]', async () => {
      const frame = makeFrame('1:1', 'Hero', 1440, 900);
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports
        .mockResolvedValueOnce({ err: null, images: { '1:1': 'https://cdn.figma.com/1x.png' } })
        .mockResolvedValueOnce({ err: null, images: { '1:1': 'https://cdn.figma.com/2x.png' } });

      const result = await extractor.extractFromFile('fileKey');
      expect(result).toHaveLength(2); // one per scale
      expect(result[0].scale).toBe(1);
      expect(result[1].scale).toBe(2);
      expect(result[0].imageUrl).toBe('https://cdn.figma.com/1x.png');
    });

    it('exports at a single requested scale', async () => {
      const frame = makeFrame('1:1', 'Card', 320, 240);
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports.mockResolvedValueOnce({
        err: null,
        images: { '1:1': 'https://cdn.figma.com/1x.png' },
      });

      const result = await extractor.extractFromFile('fileKey', { scales: [1] });
      expect(result).toHaveLength(1);
      expect(mockClient.getImageExports).toHaveBeenCalledTimes(1);
    });

    it('downloads image bytes when downloadImages is true', async () => {
      const frame = makeFrame('1:1', 'Splash', 800, 600);
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports.mockResolvedValueOnce({
        err: null,
        images: { '1:1': 'https://cdn.figma.com/1x.png' },
      });
      const fakeBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      mockClient.downloadImage.mockResolvedValueOnce(fakeBytes);

      const result = await extractor.extractFromFile('fileKey', {
        scales: [1],
        downloadImages: true,
      });
      expect(result[0].imageData).toEqual(fakeBytes);
    });

    it('throws when the export response contains an error', async () => {
      const frame = makeFrame('1:1', 'Frame');
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports.mockResolvedValueOnce({
        err: 'export_failed',
        images: {},
      });

      await expect(extractor.extractFromFile('fileKey')).rejects.toThrow(
        /Figma image export error/,
      );
    });

    it('skips frames where the images map returns null', async () => {
      const frame = makeFrame('1:1', 'Ghost');
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports
        .mockResolvedValueOnce({ err: null, images: { '1:1': null } })
        .mockResolvedValueOnce({ err: null, images: { '1:1': null } });

      const result = await extractor.extractFromFile('fileKey');
      expect(result).toHaveLength(0);
    });

    it('populates frame metadata correctly', async () => {
      const frame = makeFrame('5:10', 'Dashboard', 1280, 800);
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([frame]));
      mockClient.getImageExports.mockResolvedValue({
        err: null,
        images: { '5:10': 'https://cdn.figma.com/img.png' },
      });

      const result = await extractor.extractFromFile('myFileKey', { scales: [1] });
      const metadata = result[0].metadata;
      expect(metadata.id).toBe('5:10');
      expect(metadata.name).toBe('Dashboard');
      expect(metadata.width).toBe(1280);
      expect(metadata.height).toBe(800);
      expect(metadata.fileKey).toBe('myFileKey');
    });
  });

  // -------------------------------------------------------------------------
  // extractByNodeIds
  // -------------------------------------------------------------------------

  describe('extractByNodeIds', () => {
    it('fetches specific nodes and exports them', async () => {
      const frame = makeFrame('2:5', 'Login', 375, 812);
      mockClient.getFileNodes.mockResolvedValueOnce({
        name: 'File',
        lastModified: '2024-01-01T00:00:00Z',
        thumbnailUrl: '',
        version: '1',
        nodes: {
          '2:5': { document: frame, components: {} },
        },
      } as FigmaNodesResponse);
      mockClient.getImageExports.mockResolvedValue({
        err: null,
        images: { '2:5': 'https://cdn.figma.com/img.png' },
      });

      const result = await extractor.extractByNodeIds('fileKey', ['2:5'], { scales: [2] });
      expect(mockClient.getFileNodes).toHaveBeenCalledWith('fileKey', ['2:5']);
      expect(result).toHaveLength(1);
      expect(result[0].scale).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // extractByUrl
  // -------------------------------------------------------------------------

  describe('extractByUrl', () => {
    it('delegates to extractByNodeIds when URL contains node-id', async () => {
      mockClient.getFileNodes.mockResolvedValueOnce({
        name: 'File',
        lastModified: '',
        thumbnailUrl: '',
        version: '1',
        nodes: {},
      } as FigmaNodesResponse);

      await extractor.extractByUrl(
        'https://www.figma.com/file/aBcDeF/Name?node-id=10-20',
        { scales: [1] },
      );
      expect(mockClient.getFileNodes).toHaveBeenCalledWith('aBcDeF', ['10:20']);
      expect(mockClient.getFile).not.toHaveBeenCalled();
    });

    it('delegates to extractFromFile when URL has no node-id', async () => {
      mockClient.getFile.mockResolvedValueOnce(makeFileResponse([]));

      await extractor.extractByUrl('https://www.figma.com/file/aBcDeF/Name');
      expect(mockClient.getFile).toHaveBeenCalledWith('aBcDeF');
      expect(mockClient.getFileNodes).not.toHaveBeenCalled();
    });
  });
});
