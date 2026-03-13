import { AsanaConfig } from './types';

const ASANA_BASE_URL = 'https://app.asana.com/api/1.0';

interface AsanaApiResponse<T> {
  data: T;
}

interface AsanaApiError {
  errors: Array<{ message: string; help?: string }>;
}

/**
 * Thin HTTP client wrapping the Asana REST API v1.
 *
 * Uses the native `fetch` API available in Node.js 20+.
 * All methods return the `data` field from the Asana envelope.
 */
export class AsanaClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(config: AsanaConfig, baseUrl: string = ASANA_BASE_URL) {
    this.baseUrl = baseUrl;
    this.headers = {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params);
    const response = await fetch(url, { method: 'GET', headers: this.headers });
    return this.parseResponse<T>(response);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ data: body }),
    });
    return this.parseResponse<T>(response);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({ data: body }),
    });
    return this.parseResponse<T>(response);
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }
    return url.toString();
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const errorBody = JSON.parse(text) as AsanaApiError;
        message = errorBody.errors?.[0]?.message ?? message;
      } catch {
        // use default message
      }
      throw new Error(`Asana API error (${response.status}): ${message}`);
    }

    const parsed = JSON.parse(text) as AsanaApiResponse<T>;
    return parsed.data;
  }
}
