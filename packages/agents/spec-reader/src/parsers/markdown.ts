import { readFile } from 'fs/promises';
import { DocumentFormat, DocumentSection, ParsedDocument, SectionType } from '../types';
import { normalizeText, countWords } from './utils';

// ---------------------------------------------------------------------------
// Section-type classification patterns
// ---------------------------------------------------------------------------

/**
 * Ordered list of [SectionType, RegExp] pairs used to classify a heading+content
 * combination into a semantic section type.
 *
 * Evaluated top-to-bottom; the first match wins.
 */
const CLASSIFICATION_RULES: Array<[SectionType, RegExp]> = [
  ['acceptance-criteria', /acceptance\s+criteria|given\s+.+\s+when\s+.+\s+then|as\s+a\s+.+,?\s+i\s+want/i],
  ['user-story', /user\s+stor(?:y|ies)|as\s+an?\s+\w+/i],
  ['requirement', /requirement[s]?[:\s]|shall\s*:|must\s*:/i],
  ['feature', /feature[s]?[:\s]/i],
  ['non-functional-req', /non[- ]functional|performance\s+req|security\s+req|scalability|availability\s+req/i],
  ['functional-spec', /functional\s+spec|functional\s+req/i],
];

function classifySectionType(heading: string, content: string): SectionType {
  const text = `${heading} ${content}`;
  for (const [type, pattern] of CLASSIFICATION_RULES) {
    if (pattern.test(text)) return type;
  }
  return 'paragraph';
}

// ---------------------------------------------------------------------------
// Internal block representation
// ---------------------------------------------------------------------------

type BlockType = 'heading' | 'code-block' | 'table' | 'list' | 'paragraph';

interface Block {
  type: BlockType;
  level?: number; // headings only
  content: string;
  items?: string[]; // lists only
}

// ---------------------------------------------------------------------------
// Block-level markdown tokeniser
// ---------------------------------------------------------------------------

/**
 * Tokenise markdown into a flat list of structural blocks.
 * Handles: ATX headings, fenced code blocks, tables, lists,
 * and fall-through paragraphs.
 */
function tokenise(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ATX heading: # ... ###### ...
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        content: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: 'code-block', content: codeLines.join('\n') });
      continue;
    }

    // GFM table: line containing `|` followed by a separator row `|---|`
    if (line.includes('|') && i + 1 < lines.length && /^\|?[\s\-:|]+\|/.test(lines[i + 1])) {
      const tableLines: string[] = [line];
      i++;
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'table', content: tableLines.join('\n') });
      continue;
    }

    // Unordered or ordered list
    if (/^[ \t]*[-*+]\s+/.test(line) || /^[ \t]*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (
        i < lines.length &&
        (/^[ \t]*[-*+]\s+/.test(lines[i]) || /^[ \t]*\d+\.\s+/.test(lines[i]))
      ) {
        items.push(lines[i].replace(/^[ \t]*(?:[-*+]|\d+\.)\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'list', content: items.join('\n'), items });
      continue;
    }

    // Empty line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect lines until blank line or next structural element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,6}\s+/.test(lines[i]) &&
      !/^(`{3,}|~{3,})/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paraLines.join(' ').trim() });
    }
  }

  return blocks;
}

// ---------------------------------------------------------------------------
// Blocks → DocumentSections
// ---------------------------------------------------------------------------

function blocksToSections(blocks: Block[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let currentHeading = '';

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        currentHeading = block.content;
        sections.push({
          type: 'heading',
          level: block.level,
          title: block.content,
          content: block.content,
        });
        break;

      case 'code-block':
        sections.push({ type: 'code-block', content: block.content });
        break;

      case 'table':
        sections.push({ type: 'table', content: block.content });
        break;

      case 'list':
        sections.push({
          type: classifySectionType(currentHeading, block.content),
          title: currentHeading || undefined,
          content: block.content,
          items: block.items,
        });
        break;

      case 'paragraph': {
        const sectionType = classifySectionType(currentHeading, block.content);
        sections.push({
          type: sectionType,
          title: currentHeading || undefined,
          content: block.content,
        });
        break;
      }
    }
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read a Markdown file from disk and return a fully parsed document.
 *
 * @param source - Absolute or relative path to the `.md` file.
 */
export async function parseMarkdownFile(source: string): Promise<ParsedDocument> {
  const raw = await readFile(source, 'utf-8');
  return parseMarkdownContent(raw, source);
}

/**
 * Parse raw Markdown text (already loaded into memory).
 *
 * @param raw    - Raw Markdown string.
 * @param source - The originating path or identifier (used in metadata).
 */
export function parseMarkdownContent(raw: string, source: string): ParsedDocument {
  const content = normalizeText(raw);
  const blocks = tokenise(content);
  const sections = blocksToSections(blocks);

  const h1 = blocks.find((b) => b.type === 'heading' && b.level === 1);

  return {
    format: 'markdown' as DocumentFormat,
    title: h1?.content,
    content,
    sections,
    metadata: {
      source,
      format: 'markdown',
      wordCount: countWords(content),
      characterCount: content.length,
      parsedAt: new Date(),
    },
  };
}
