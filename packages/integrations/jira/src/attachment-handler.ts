import https from 'https';
import http from 'http';
import { URL } from 'url';
import path from 'path';
import type { JiraClient } from './jira-client';

/** Result of a single attachment upload attempt. */
export interface AttachmentUploadResult {
  /** True if the upload succeeded. */
  success: boolean;
  /** File name that was uploaded. */
  fileName: string;
  /** Error message if the upload failed. */
  error?: string;
}

/**
 * Derives the MIME type from a file extension.
 * Falls back to "application/octet-stream" for unknown extensions.
 *
 * @param filePath - File path or name with extension.
 */
export function mimeTypeFromExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.log': 'text/plain',
    '.har': 'application/json',
    '.zip': 'application/zip',
  };

  return mimeMap[ext] ?? 'application/octet-stream';
}

/**
 * Derives a sensible attachment filename from a URL.
 *
 * If the URL path has a recognisable filename, that is used. Otherwise a
 * default of "screenshot.png" is returned.
 *
 * @param screenshotUrl - Full URL pointing to the screenshot resource.
 */
export function fileNameFromUrl(screenshotUrl: string): string {
  try {
    const parsed = new URL(screenshotUrl);
    const basename = path.basename(parsed.pathname);
    return basename.length > 0 && basename !== '/' ? basename : 'screenshot.png';
  } catch {
    return 'screenshot.png';
  }
}

/**
 * Downloads a file from a URL into a Buffer.
 * Follows a single redirect if one is returned.
 *
 * @param url - Absolute URL (http or https).
 * @returns Buffer containing the file contents.
 */
export function downloadFile(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    transport
      .get(url, (response) => {
        // Follow one redirect.
        if (
          (response.statusCode === 301 || response.statusCode === 302) &&
          response.headers.location
        ) {
          downloadFile(response.headers.location).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download file from ${url}: HTTP ${response.statusCode ?? 'unknown'}`,
            ),
          );
          return;
        }

        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      })
      .on('error', reject);
  });
}

/**
 * Downloads a screenshot from a URL and attaches it to a Jira issue.
 *
 * @param client - Configured JiraClient instance.
 * @param issueKey - Jira issue key to attach the screenshot to, e.g. "SEM-42".
 * @param screenshotUrl - Publicly accessible URL (S3 pre-signed URL or CDN link).
 * @param overrideFileName - Optional filename override; defaults to the URL basename.
 * @returns Result indicating success or failure with an optional error message.
 */
export async function attachScreenshotToIssue(
  client: JiraClient,
  issueKey: string,
  screenshotUrl: string,
  overrideFileName?: string,
): Promise<AttachmentUploadResult> {
  const fileName = overrideFileName ?? fileNameFromUrl(screenshotUrl);
  const mimeType = mimeTypeFromExtension(fileName);

  try {
    const fileBuffer = await downloadFile(screenshotUrl);
    await client.addAttachment(issueKey, fileName, fileBuffer, mimeType);
    return { success: true, fileName };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, fileName, error: message };
  }
}

/**
 * Attaches multiple screenshots to a Jira issue, continuing on individual failures.
 *
 * @param client - Configured JiraClient instance.
 * @param issueKey - Jira issue key, e.g. "SEM-42".
 * @param screenshotUrls - Array of screenshot URLs to attach.
 * @returns Array of results, one per URL.
 */
export async function attachScreenshotsToIssue(
  client: JiraClient,
  issueKey: string,
  screenshotUrls: string[],
): Promise<AttachmentUploadResult[]> {
  const results: AttachmentUploadResult[] = [];

  for (const url of screenshotUrls) {
    const result = await attachScreenshotToIssue(client, issueKey, url);
    results.push(result);
  }

  return results;
}
