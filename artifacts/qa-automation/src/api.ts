/**
 * Minimal typed HTTP client for the QAPulse API, mirroring how the frontend
 * calls it (Bearer JWT, same-origin /api prefix). Built on Node's global
 * fetch so specs can make API calls without a browser context.
 */

export interface LoginResponse {
  user: {
    id: number;
    name: string;
    email: string;
    role: string;
    mustChangePassword?: boolean;
    [key: string]: unknown;
  };
  token: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    method: string,
    path: string,
  ) {
    super(`${method} ${path} → ${status}: ${JSON.stringify(body).slice(0, 300)}`);
    this.name = "ApiError";
  }
}

export class Api {
  readonly apiUrl: string;

  constructor(
    readonly baseUrl: string,
    public token: string | null = null,
  ) {
    this.apiUrl = `${baseUrl.replace(/\/$/, "")}/api`;
  }

  /** Raw request — returns the Response so tests can assert on status codes. */
  async raw(
    method: string,
    path: string,
    body?: unknown,
    tokenOverride?: string | null,
  ): Promise<Response> {
    const token = tokenOverride === undefined ? this.token : tokenOverride;
    return fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  /** Request that must succeed — throws ApiError on any non-2xx status. */
  async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON body (e.g. sendStatus) — keep raw text */
    }
    if (!res.ok) throw new ApiError(res.status, parsed, method, path);
    return parsed as T;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.call<T>("GET", path);
  }
  post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.call<T>("POST", path, body);
  }
  patch<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.call<T>("PATCH", path, body);
  }
  put<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.call<T>("PUT", path, body);
  }
  delete<T = unknown>(path: string): Promise<T> {
    return this.call<T>("DELETE", path);
  }

  /** Login and bind the returned token to this client. */
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await this.call<LoginResponse>("POST", "/auth/login", { email, password });
    this.token = res.token;
    return res;
  }
}
