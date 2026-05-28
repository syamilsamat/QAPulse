export function getApiUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const origin = window.location.origin;
  const basePath = base.replace(/\/$/, "");
  return `${origin}${basePath}/api`;
}
