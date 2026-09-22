export function getApiUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const origin = window.location.origin;
  const basePath = base.replace(/\/$/, "");
  return `${origin}${basePath}/api`;
}

// The JWT lives in localStorage when "Remember Me" is on, sessionStorage
// otherwise. CR049 — raw fetch() callers must send it now that every route
// is authenticated; use this so they don't each re-read storage.
export function getAuthToken(): string | null {
  return localStorage.getItem("qa_pulse_token") ?? sessionStorage.getItem("qa_pulse_token");
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAuthToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(extra ?? {}),
  };
}
