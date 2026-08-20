// ---------------------------------------------------------------------------
// Better Auth endpoint rate limiting
//
// The Better Auth handler is mounted at /api/auth/better/* and is fully public
// (no session). Its abuse-sensitive email endpoints include:
//   - sign-in/email      → credential stuffing
//   - forget-password /  → password-reset email bombing against real accounts
//     request-password-reset
// Better Auth ships an in-memory rate limiter by default, which does not work
// across Cloudflare Worker isolates. Rather than wire a Better Auth storage
// adapter, we apply an IP-keyed fixed-window throttle in front of the handler.
// Production counters are serialized by Durable Object storage transactions;
// local development uses the in-memory fallback below.
// ---------------------------------------------------------------------------

import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";
import { hmacSha256Hex } from "./hmac";

export type AuthRateLimitKind = "sign-in" | "sign-up" | "password-reset";
export type PublicRateLimitKind =
  | "feedback-ip"
  | "feedback-email"
  | "leads-ip"
  | "leads-email"
  | "portal-auth"
  | "public-analytics";
export type RateLimitKind = AuthRateLimitKind | PublicRateLimitKind;

interface RateLimitRule {
  windowMs: number;
  max: number;
}

const RULES: Record<RateLimitKind, RateLimitRule> = {
  // Generous enough for fat-fingered logins; restrictive against stuffing.
  "sign-in": { windowMs: 600_000, max: 10 },
  // Each successful attempt can create an organization and start a trial.
  "sign-up": { windowMs: 600_000, max: 5 },
  // Tighter: each call sends an email, so cap the email-bombing blast radius.
  "password-reset": { windowMs: 600_000, max: 5 },
  "feedback-ip": { windowMs: 60_000, max: 5 },
  "feedback-email": { windowMs: 600_000, max: 3 },
  "leads-ip": { windowMs: 60_000, max: 10 },
  "leads-email": { windowMs: 600_000, max: 3 },
  "portal-auth": { windowMs: 600_000, max: 10 },
  "public-analytics": { windowMs: 60_000, max: 120 },
};

/**
 * Minimal KV-like interface for rate-limit storage. Cloudflare KV satisfies this
 * shape directly; the in-memory fallback below implements it for dev/test where
 * no KV binding is configured.
 */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
}

export interface AtomicRateLimitStore {
  take(key: string, kind: RateLimitKind): Promise<boolean>;
}

type AuthRateLimitStore = RateLimitStore | AtomicRateLimitStore;

type AuthRateLimitCounter = {
  count: number;
  resetAt: number;
};

type AuthRateLimitTransaction = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(scheduledTime: number | Date): Promise<void>;
};

type AuthRateLimitTransactionStorage = {
  transaction<T>(callback: (transaction: AuthRateLimitTransaction) => Promise<T>): Promise<T>;
};

const localStoreTails = new Map<string, Promise<void>>();
let missingBindingReported = false;

export class MemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl: number }): Promise<void> {
    const expirationTtl = options?.expirationTtl ?? 60;
    this.store.set(key, { value, expiresAt: Date.now() + expirationTtl * 1000 });
  }

  clear(): void {
    this.store.clear();
  }
}

export const authMemoryFallback = new MemoryRateLimitStore();

export function _resetAuthRateLimit(): void {
  authMemoryFallback.clear();
  localStoreTails.clear();
  missingBindingReported = false;
}

export function reportMissingAuthRateLimiter(onMissing: () => void): void {
  if (missingBindingReported) return;
  missingBindingReported = true;
  try {
    onMissing();
  } catch {
    // Telemetry must not change the fail-open fallback.
  }
}

/**
 * Decide whether an incoming Better Auth request should be throttled, and under
 * which rule. Returns null for requests that are not abuse-sensitive.
 */
export function classifyAuthRateLimit(method: string, path: string): AuthRateLimitKind | null {
  if (method !== "POST") return null;
  if (path.endsWith("/sign-in/email")) return "sign-in";
  if (path.endsWith("/sign-up/email")) return "sign-up";
  if (path.endsWith("/forget-password") || path.endsWith("/request-password-reset")) {
    return "password-reset";
  }
  return null;
}

export function shouldBypassAuthRateLimit(env: {
  APP_URL?: string;
  INTEGRATION_MODE?: string;
}): boolean {
  if (env.INTEGRATION_MODE !== "mock" || !env.APP_URL) {
    return false;
  }

  try {
    const appUrl = new URL(env.APP_URL);
    return appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

export async function checkAuthRateLimit(
  store: AuthRateLimitStore,
  ip: string,
  kind: AuthRateLimitKind,
  onError?: (error: unknown) => void,
): Promise<boolean> {
  const key = `auth:${kind}:${ip}`;
  return checkRateLimit(store, key, kind, onError);
}

export async function checkRateLimit(
  store: AuthRateLimitStore,
  key: string,
  kind: RateLimitKind,
  onError?: (error: unknown) => void,
): Promise<boolean> {
  const rule = RULES[kind];
  const ttlSeconds = rule.windowMs / 1000;
  try {
    if ("take" in store) {
      return await store.take(key, kind);
    }

    const previous = localStoreTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    localStoreTails.set(key, current);
    await previous;

    try {
      const raw = await store.get(key);
      if (raw === null) {
        await store.put(key, "1", { expirationTtl: ttlSeconds });
        return true;
      }
      const count = Number(raw);
      if (!Number.isFinite(count) || count >= rule.max) {
        return false;
      }
      await store.put(key, String(count + 1), { expirationTtl: ttlSeconds });
      return true;
    } finally {
      release();
      if (localStoreTails.get(key) === current) {
        localStoreTails.delete(key);
      }
    }
  } catch (error) {
    try {
      onError?.(error);
    } catch {
      // Telemetry must not change the established fail-open auth behavior.
    }
    // Fail open: a storage outage (KV unavailable / binding misconfigured) must
    // not take down the entire public auth surface, which all routes through
    // this handler. Availability beats throttling for transient storage faults.
    return true;
  }
}

export async function hashRateLimitIdentity(value: string, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `rate-limit:${value.trim().toLowerCase()}`);
}

export async function consumeAuthRateLimitTransaction(
  storage: AuthRateLimitTransactionStorage,
  key: string,
  kind: RateLimitKind,
  now = Date.now(),
): Promise<boolean> {
  const rule = RULES[kind];
  return storage.transaction(async (transaction) => {
    const current = await transaction.get<AuthRateLimitCounter>(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + rule.windowMs;
      await transaction.put<AuthRateLimitCounter>(key, {
        count: 1,
        resetAt,
      });
      await transaction.setAlarm(resetAt);
      return true;
    }
    if (!Number.isFinite(current.count) || current.count >= rule.max) {
      return false;
    }
    await transaction.put<AuthRateLimitCounter>(key, {
      ...current,
      count: current.count + 1,
    });
    return true;
  });
}

export function createDurableObjectRateLimitStore(
  namespace: DurableObjectNamespace,
): AtomicRateLimitStore {
  return {
    take: async (key, kind) => {
      // One object per counter key keeps unrelated IPs independent while the
      // object transaction serializes every attempt for this exact key.
      const stub = namespace.get(namespace.idFromName(key));
      const response = await stub.fetch("https://auth-rate-limiter.internal/take", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, kind }),
      });
      if (!response.ok) {
        throw new Error(`Auth rate limiter returned HTTP ${response.status}`);
      }
      const result = (await response.json()) as { allowed?: unknown };
      if (typeof result.allowed !== "boolean") {
        throw new Error("Auth rate limiter returned an invalid response");
      }
      return result.allowed;
    },
  };
}

export const createDurableObjectAuthRateLimitStore = createDurableObjectRateLimitStore;

export class AuthRateLimiter {
  private static readonly COUNTER_KEY = "counter";

  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const input = (await request.json()) as {
      key?: unknown;
      kind?: unknown;
    };
    if (typeof input.key !== "string" || typeof input.kind !== "string" || !(input.kind in RULES)) {
      return Response.json({ error: "Invalid rate-limit request" }, { status: 400 });
    }
    const kind = input.kind as RateLimitKind;
    const allowed = await consumeAuthRateLimitTransaction(
      this.state.storage,
      AuthRateLimiter.COUNTER_KEY,
      kind,
    );
    return Response.json({ allowed });
  }

  async alarm(): Promise<void> {
    const counter = await this.state.storage.get<AuthRateLimitCounter>(AuthRateLimiter.COUNTER_KEY);
    if (!counter || counter.resetAt <= Date.now()) {
      await this.state.storage.deleteAll();
      return;
    }
    // If a request reset the window while the old alarm was already queued,
    // preserve the new counter and move cleanup to its actual expiry.
    await this.state.storage.setAlarm(counter.resetAt);
  }
}
