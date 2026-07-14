import "server-only";

const WINDOW_MS = 15 * 60_000;
const MAXIMUM_ENTRIES = 5_000;
const STORE_NAME = "__bloxRankAdminLoginRateLimit";

interface RateLimitEntry {
  failures: number;
  windowStartedAt: number;
}

interface LoginRateLimitStore {
  entries: Map<string, RateLimitEntry>;
}

type RateLimitGlobal = typeof globalThis & {
  [STORE_NAME]?: LoginRateLimitStore;
};

function store(): LoginRateLimitStore {
  const globalRateLimit = globalThis as RateLimitGlobal;
  globalRateLimit[STORE_NAME] ??= { entries: new Map() };
  return globalRateLimit[STORE_NAME];
}

function limitsForKey(key: string): number {
  if (key.startsWith("ip:")) {
    return 5;
  }
  if (key.startsWith("actor:")) {
    return 10;
  }
  return 10;
}

function prune(now: number): void {
  const entries = store().entries;
  for (const [key, entry] of entries) {
    if (now - entry.windowStartedAt >= WINDOW_MS) {
      entries.delete(key);
    }
  }
  if (entries.size <= MAXIMUM_ENTRIES) {
    return;
  }
  const oldest = [...entries.entries()]
    .sort((left, right) => left[1].windowStartedAt - right[1].windowStartedAt)
    .slice(0, entries.size - MAXIMUM_ENTRIES);
  for (const [key] of oldest) {
    entries.delete(key);
  }
}

function safeClientAddress(value: string | null): string | null {
  const address = value?.trim();
  if (address === undefined || address === "" || address.length > 80) {
    return null;
  }
  return /^[0-9a-f:.]+$/iu.test(address) ? address.toLowerCase() : null;
}

export function loginRateLimitKeys(request: Request, actorDiscordId?: string): string[] {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0] ?? null;
  const address =
    safeClientAddress(request.headers.get("cf-connecting-ip")) ??
    safeClientAddress(request.headers.get("x-real-ip")) ??
    safeClientAddress(forwarded) ??
    "unknown";
  return [
    `ip:${address}`,
    ...(actorDiscordId === undefined ? [] : [`actor:${actorDiscordId}`]),
  ];
}

export function loginRetryAfterSeconds(keys: readonly string[], now = Date.now()): number | null {
  prune(now);
  let retryAfter = 0;
  for (const key of keys) {
    const entry = store().entries.get(key);
    if (entry !== undefined && entry.failures >= limitsForKey(key)) {
      retryAfter = Math.max(
        retryAfter,
        Math.ceil((entry.windowStartedAt + WINDOW_MS - now) / 1_000),
      );
    }
  }
  return retryAfter > 0 ? retryAfter : null;
}

export function recordLoginFailure(keys: readonly string[], now = Date.now()): void {
  prune(now);
  for (const key of keys) {
    const previous = store().entries.get(key);
    if (previous === undefined || now - previous.windowStartedAt >= WINDOW_MS) {
      store().entries.set(key, { failures: 1, windowStartedAt: now });
    } else {
      previous.failures += 1;
    }
  }
}

export function clearSuccessfulLogin(keys: readonly string[]): void {
  for (const key of keys) {
    store().entries.delete(key);
  }
}
