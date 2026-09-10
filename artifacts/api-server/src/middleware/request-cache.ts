import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestHandler } from "express";

/**
 * Per-request memoisation for pure-read lookups that several handlers (and
 * several loop iterations inside one handler) repeat with identical
 * arguments.
 *
 * The access helpers are the motivating case: `scopeToUserProjects` and
 * `getModuleScope` each re-query `roles` and `project_members`, and a single
 * list endpoint calls them once per distinct project — so one page load was
 * issuing the same two queries dozens of times.
 *
 * Scope is deliberately one request, not a TTL cache: an access grant
 * revoked in the admin UI still takes effect on the very next request, so
 * this cannot introduce a window where stale permissions are honoured.
 */
const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

export const requestCache: RequestHandler = (_req, _res, next) => {
  storage.run(new Map(), () => next());
};

export function cachedForRequest<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const store = storage.getStore();
  // Outside a request (startup tasks, scripts) there is nothing to scope to,
  // so fall through to the real lookup.
  if (!store) return fn();

  const hit = store.get(key) as Promise<T> | undefined;
  if (hit) return hit;

  const pending = fn();
  store.set(key, pending);
  // Don't let one failure poison the rest of the request — a retry within
  // the same request should get a fresh attempt.
  pending.catch(() => store.delete(key));
  return pending;
}
