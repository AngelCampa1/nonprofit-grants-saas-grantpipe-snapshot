import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DurableObjectNamespace, DurableObjectState } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  classifyAuthRateLimit,
  checkAuthRateLimit,
  createDurableObjectAuthRateLimitStore,
  AuthRateLimiter,
  _resetAuthRateLimit,
  authMemoryFallback,
  checkRateLimit,
  createDurableObjectRateLimitStore,
  hashRateLimitIdentity,
  reportMissingAuthRateLimiter,
  shouldBypassAuthRateLimit,
  type RateLimitStore,
} from "./auth-rate-limit";
import * as authRateLimitModule from "./auth-rate-limit";

function memoryStore(): RateLimitStore {
  const map = new Map<string, string>();
  return {
    get: async (k) => map.get(k) ?? null,
    put: async (k, v) => {
      map.set(k, v);
    },
  };
}

describe("classifyAuthRateLimit", () => {
  it("classifies POST sign-in/email as the sign-in kind", () => {
    expect(classifyAuthRateLimit("POST", "/api/auth/better/sign-in/email")).toBe("sign-in");
  });

  it("classifies POST sign-up/email as the sign-up kind", () => {
    expect(classifyAuthRateLimit("POST", "/api/auth/better/sign-up/email")).toBe("sign-up");
  });

  it("classifies POST forget-password as the password-reset kind", () => {
    expect(classifyAuthRateLimit("POST", "/api/auth/better/forget-password")).toBe(
      "password-reset",
    );
  });

  it("classifies POST request-password-reset as the password-reset kind", () => {
    expect(classifyAuthRateLimit("POST", "/api/auth/better/request-password-reset")).toBe(
      "password-reset",
    );
  });

  it("does not classify GET requests", () => {
    expect(classifyAuthRateLimit("GET", "/api/auth/better/sign-in/email")).toBeNull();
  });

  it("does not classify unrelated auth paths (e.g. get-session)", () => {
    expect(classifyAuthRateLimit("POST", "/api/auth/better/get-session")).toBeNull();
  });
});

describe("checkAuthRateLimit", () => {
  beforeEach(() => _resetAuthRateLimit());

  it("allows the sign-in cap then blocks", async () => {
    const store = memoryStore();
    for (let i = 0; i < 10; i++) {
      expect(await checkAuthRateLimit(store, "ip-a", "sign-in")).toBe(true);
    }
    expect(await checkAuthRateLimit(store, "ip-a", "sign-in")).toBe(false);
  });

  it("applies a tighter cap to password-reset", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) {
      expect(await checkAuthRateLimit(store, "ip-a", "password-reset")).toBe(true);
    }
    expect(await checkAuthRateLimit(store, "ip-a", "password-reset")).toBe(false);
  });

  it("caps sign-up attempts per durable identity", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) {
      expect(await checkAuthRateLimit(store, "ip-a", "sign-up")).toBe(true);
    }
    expect(await checkAuthRateLimit(store, "ip-a", "sign-up")).toBe(false);
  });

  it("keys sign-in and password-reset independently", async () => {
    const store = memoryStore();
    for (let i = 0; i < 5; i++) {
      await checkAuthRateLimit(store, "ip-a", "password-reset");
    }
    // password-reset is exhausted, but sign-in for the same IP is untouched.
    expect(await checkAuthRateLimit(store, "ip-a", "sign-in")).toBe(true);
  });

  it("keys by IP independently", async () => {
    const store = memoryStore();
    for (let i = 0; i < 10; i++) {
      await checkAuthRateLimit(store, "ip-a", "sign-in");
    }
    expect(await checkAuthRateLimit(store, "ip-b", "sign-in")).toBe(true);
  });

  it("treats a corrupted counter as exhausted", async () => {
    const store: RateLimitStore = {
      get: async () => "not-a-number",
      put: async () => {},
    };
    expect(await checkAuthRateLimit(store, "ip-c", "sign-in")).toBe(false);
  });

  it("fails open when the store throws (storage outage)", async () => {
    const onError = vi.fn();
    const store: RateLimitStore = {
      get: async () => {
        throw new Error("KV unavailable");
      },
      put: async () => {},
    };
    expect(await checkAuthRateLimit(store, "ip-d", "sign-in", onError)).toBe(true);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("stays fail-open when failure telemetry also throws", async () => {
    const store: RateLimitStore = {
      get: async () => {
        throw new Error("coordinator unavailable");
      },
      put: async () => {},
    };

    await expect(
      checkAuthRateLimit(store, "ip-telemetry", "sign-in", () => {
        throw new Error("telemetry unavailable");
      }),
    ).resolves.toBe(true);
  });

  it("delegates checks to an atomic rate-limit store", async () => {
    const take = vi.fn().mockResolvedValue(false);
    expect(await checkAuthRateLimit({ take }, "ip-atomic", "password-reset")).toBe(false);
    expect(take).toHaveBeenCalledWith("auth:password-reset:ip-atomic", "password-reset");
  });

  it("admits only the sign-in cap under concurrent counter reads", async () => {
    let value: string | null = null;
    const store: RateLimitStore = {
      get: async () => {
        const snapshot = value;
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        return snapshot;
      },
      put: async (_key, next) => {
        value = next;
      },
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => checkAuthRateLimit(store, "ip-race", "sign-in")),
    );

    expect(results.filter(Boolean)).toHaveLength(10);
    expect(value).toBe("10");
  });

  it("routes production auth checks through the Durable Object binding", () => {
    const appSource = readFileSync(join(process.cwd(), "src/app.ts"), "utf8");
    const typesSource = readFileSync(join(process.cwd(), "src/types.ts"), "utf8");
    const wranglerSource = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");

    expect(appSource).toContain("c.env.AUTH_RATE_LIMITER");
    expect(typesSource).toContain("AUTH_RATE_LIMITER?: DurableObjectNamespace");
    expect(wranglerSource.match(/name = "AUTH_RATE_LIMITER"/g)).toHaveLength(2);
    expect(wranglerSource).toContain('new_sqlite_classes = ["AuthRateLimiter"]');
  });

  it("uses a transactional counter for the Durable Object concurrency boundary", async () => {
    expect(authRateLimitModule).toHaveProperty("consumeAuthRateLimitTransaction");
    const consume = Reflect.get(authRateLimitModule, "consumeAuthRateLimitTransaction") as (
      storage: unknown,
      key: string,
      kind: "sign-in",
      now: number,
    ) => Promise<boolean>;
    let tail = Promise.resolve();
    let counter: { count: number; resetAt: number } | undefined;
    let alarmAt: number | undefined;
    const storage = {
      transaction: async <T>(
        callback: (transaction: {
          get: () => Promise<typeof counter>;
          put: (_key: string, value: typeof counter) => Promise<void>;
          setAlarm: (scheduledTime: number) => Promise<void>;
        }) => Promise<T>,
      ) => {
        const previous = tail;
        let release = () => {};
        tail = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await callback({
            get: async () => counter,
            put: async (_key, value) => {
              counter = value;
            },
            setAlarm: async (scheduledTime) => {
              alarmAt = scheduledTime;
            },
          });
        } finally {
          release();
        }
      },
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => consume(storage, "auth:sign-in:ip-do", "sign-in", 0)),
    );

    expect(results.filter(Boolean)).toHaveLength(10);
    expect(counter).toEqual({ count: 10, resetAt: 600_000 });
    expect(alarmAt).toBe(600_000);
  });

  it("resets expired transactional counters and rejects corrupted counts", async () => {
    let counter: { count: number; resetAt: number } | undefined = {
      count: 4,
      resetAt: 10,
    };
    const storage = {
      transaction: async <T>(
        callback: (transaction: {
          get: () => Promise<typeof counter>;
          put: (_key: string, value: typeof counter) => Promise<void>;
          setAlarm: () => Promise<void>;
        }) => Promise<T>,
      ) =>
        callback({
          get: async () => counter,
          put: async (_key, value) => {
            counter = value;
          },
          setAlarm: async () => {},
        }),
    };
    const consume = Reflect.get(authRateLimitModule, "consumeAuthRateLimitTransaction") as (
      storage: unknown,
      key: string,
      kind: "password-reset",
      now: number,
    ) => Promise<boolean>;

    expect(await consume(storage, "expired", "password-reset", 11)).toBe(true);
    expect(counter).toEqual({ count: 1, resetAt: 600_011 });
    counter = { count: Number.NaN, resetAt: 700_000 };
    expect(await consume(storage, "corrupt", "password-reset", 12)).toBe(false);
  });

  it("calls the Durable Object stub and validates its response", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ allowed: true }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ allowed: "yes" }));
    const namespace = {
      idFromName: vi.fn(() => "id"),
      get: vi.fn(() => ({ fetch })),
    } as unknown as DurableObjectNamespace;
    const store = createDurableObjectAuthRateLimitStore(namespace);

    await expect(store.take("auth:sign-in:ip", "sign-in")).resolves.toBe(true);
    expect(namespace.idFromName).toHaveBeenCalledWith("auth:sign-in:ip");
    expect(fetch).toHaveBeenCalledWith(
      "https://auth-rate-limiter.internal/take",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ key: "auth:sign-in:ip", kind: "sign-in" }),
      }),
    );
    await expect(store.take("auth:sign-in:ip", "sign-in")).rejects.toThrow("HTTP 503");
    await expect(store.take("auth:sign-in:ip", "sign-in")).rejects.toThrow("invalid response");
  });

  it("serves Durable Object checks and rejects malformed requests", async () => {
    let counter: { count: number; resetAt: number } | undefined;
    const state = {
      storage: {
        deleteAll: vi.fn(),
        get: vi.fn(async () => counter),
        setAlarm: vi.fn(),
        transaction: async <T>(
          callback: (transaction: {
            get: () => Promise<typeof counter>;
            put: (_key: string, value: typeof counter) => Promise<void>;
            setAlarm: () => Promise<void>;
          }) => Promise<T>,
        ) =>
          callback({
            get: async () => counter,
            put: async (_key, value) => {
              counter = value;
            },
            setAlarm: async () => {},
          }),
      },
    } as unknown as DurableObjectState;
    const object = new AuthRateLimiter(state);

    const success = await object.fetch(
      new Request("https://rate-limit.test/take", {
        method: "POST",
        body: JSON.stringify({ key: "auth:sign-in:ip", kind: "sign-in" }),
      }),
    );
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ allowed: true });
    expect((await object.fetch(new Request("https://rate-limit.test"))).status).toBe(405);
    const invalid = await object.fetch(
      new Request("https://rate-limit.test/take", {
        method: "POST",
        body: JSON.stringify({ key: 123, kind: "other" }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(object).toHaveProperty("alarm");
    counter = { count: 1, resetAt: 0 };
    await Reflect.get(object, "alarm").call(object);
    expect(state.storage.deleteAll).toHaveBeenCalledOnce();
    counter = { count: 1, resetAt: Date.now() + 60_000 };
    await Reflect.get(object, "alarm").call(object);
    expect(state.storage.setAlarm).toHaveBeenCalledWith(counter.resetAt);
  });
});

describe("shared public rate limits", () => {
  beforeEach(() => _resetAuthRateLimit());

  it("admits only each public cap under concurrent local counter reads", async () => {
    const cases = [
      ["feedback-ip", 5],
      ["feedback-email", 3],
      ["leads-ip", 10],
      ["leads-email", 3],
      ["portal-auth", 10],
      ["public-analytics", 120],
    ] as const;

    for (const [kind, cap] of cases) {
      const store = memoryStore();
      const results = await Promise.all(
        Array.from({ length: cap + 10 }, () => checkRateLimit(store, `${kind}:same`, kind)),
      );
      expect(results.filter(Boolean), kind).toHaveLength(cap);
    }
  });

  it("keeps public counter kinds and identities isolated", async () => {
    const store = memoryStore();
    for (let index = 0; index < 5; index += 1) {
      await checkRateLimit(store, "feedback-ip:first", "feedback-ip");
    }
    expect(await checkRateLimit(store, "feedback-ip:first", "feedback-ip")).toBe(false);
    expect(await checkRateLimit(store, "feedback-ip:second", "feedback-ip")).toBe(true);
    expect(await checkRateLimit(store, "feedback-email:first", "feedback-email")).toBe(true);
  });

  it("uses keyed hashes without exposing normalized email addresses", async () => {
    const first = await hashRateLimitIdentity(" Person@Example.org ", "secret");
    const normalized = await hashRateLimitIdentity("person@example.org", "secret");
    const otherSecret = await hashRateLimitIdentity("person@example.org", "other-secret");

    expect(first).toBe(normalized);
    expect(first).not.toContain("person@example.org");
    expect(first).not.toBe(otherSecret);
  });

  it("sends public kinds through the existing Durable Object coordinator", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
    const namespace = {
      idFromName: vi.fn(() => "id"),
      get: vi.fn(() => ({ fetch })),
    } as unknown as DurableObjectNamespace;
    const store = createDurableObjectRateLimitStore(namespace);

    await expect(store.take("feedback-ip:hashed", "feedback-ip")).resolves.toBe(true);
    expect(namespace.idFromName).toHaveBeenCalledWith("feedback-ip:hashed");
    expect(fetch).toHaveBeenCalledWith(
      "https://auth-rate-limiter.internal/take",
      expect.objectContaining({
        body: JSON.stringify({ key: "feedback-ip:hashed", kind: "feedback-ip" }),
      }),
    );
  });

  it("reports a missing coordinator once without surfacing telemetry errors", () => {
    const onMissing = vi.fn(() => {
      throw new Error("telemetry unavailable");
    });

    expect(() => reportMissingAuthRateLimiter(onMissing)).not.toThrow();
    reportMissingAuthRateLimiter(onMissing);
    expect(onMissing).toHaveBeenCalledOnce();
  });
});

describe("shouldBypassAuthRateLimit", () => {
  it("bypasses auth throttling for mock-mode localhost E2E runs", () => {
    expect(
      shouldBypassAuthRateLimit({
        INTEGRATION_MODE: "mock",
        APP_URL: "http://localhost:3050",
      }),
    ).toBe(true);
  });

  it("keeps auth throttling enabled for real mode and HTTPS app URLs", () => {
    expect(
      shouldBypassAuthRateLimit({
        INTEGRATION_MODE: "real",
        APP_URL: "http://localhost:3050",
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthRateLimit({
        INTEGRATION_MODE: "mock",
        APP_URL: "https://app.grantpipe.com",
      }),
    ).toBe(false);
    expect(
      shouldBypassAuthRateLimit({
        INTEGRATION_MODE: "mock",
        APP_URL: "not a URL",
      }),
    ).toBe(false);
  });
});

describe("authMemoryFallback (default in-memory store)", () => {
  afterEach(() => {
    vi.useRealTimers();
    _resetAuthRateLimit();
  });

  it("counts and blocks through the shared in-memory store", async () => {
    _resetAuthRateLimit();
    for (let i = 0; i < 5; i++) {
      expect(await checkAuthRateLimit(authMemoryFallback, "ip-mem", "password-reset")).toBe(true);
    }
    expect(await checkAuthRateLimit(authMemoryFallback, "ip-mem", "password-reset")).toBe(false);
  });

  it("expires entries after the window so the limit resets", async () => {
    vi.useFakeTimers();
    _resetAuthRateLimit();
    for (let i = 0; i < 5; i++) {
      await checkAuthRateLimit(authMemoryFallback, "ip-exp", "password-reset");
    }
    expect(await checkAuthRateLimit(authMemoryFallback, "ip-exp", "password-reset")).toBe(false);
    // Advance past the 10-minute window; the stored counter should expire.
    vi.advanceTimersByTime(600_001);
    expect(await checkAuthRateLimit(authMemoryFallback, "ip-exp", "password-reset")).toBe(true);
  });
});
