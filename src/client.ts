const DEFAULT_API_URL = 'https://api.domainpilot.io';

export class DomainPilotClient {
  private apiUrl: string;
  private token: string;

  constructor() {
    this.token = process.env.DOMAINPILOT_API_TOKEN || '';
    this.apiUrl = process.env.DOMAINPILOT_API_URL || DEFAULT_API_URL;

    if (!this.token) {
      throw new Error(
        'DOMAINPILOT_API_TOKEN is required. Generate one at your Domain Pilot settings page.'
      );
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ApiError(response.status, this.formatError(response.status, error));
    }

    const text = await response.text();
    return text ? JSON.parse(text) : ({} as T);
  }

  private formatError(status: number, error: Record<string, unknown>): string {
    switch (status) {
      case 401:
        return 'Your Domain Pilot API token is invalid or expired. Generate a new one at your Domain Pilot settings page.';
      case 403:
        return (error.error as string) || "You don't have permission to access this resource.";
      case 404:
        return 'Resource not found. Check the domain name and try again.';
      case 422: {
        if (error.errors) {
          return Object.entries(error.errors as Record<string, string[]>)
            .map(([k, v]) => `${k}: ${v.join(', ')}`)
            .join('; ');
        }
        return (error.error as string) || 'Invalid request.';
      }
      case 429:
        return 'Rate limit exceeded. Please wait a moment and try again.';
      default:
        return (error.error as string) || `API error (${status})`;
    }
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
