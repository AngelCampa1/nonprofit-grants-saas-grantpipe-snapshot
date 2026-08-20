import { describe, expect, it, vi } from "vitest";
import {
  isDrizzleFailedQueryWrapperError,
  isRetryableScheduledDbError,
  isTransientDbError,
  withDbRetry,
} from "./db-retry";

describe("isTransientDbError", () => {
  it("matches the managed Postgres 'Control plane request failed' surface", () => {
    expect(isTransientDbError(new Error("error: Control plane request failed"))).toBe(true);
  });

  it("matches a drizzle-wrapped 'Failed query' whose cause carries the transient message", () => {
    const inner = new Error("Control plane request failed");
    const outer = new Error("Failed query: select 1");
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(isTransientDbError(outer)).toBe(true);
  });

  it("matches a 'connection terminated unexpectedly' error", () => {
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
  });

  it("matches a Workers 'fetch failed' error", () => {
    expect(isTransientDbError(new Error("fetch failed"))).toBe(true);
  });

  it("matches pg connect-timeout messages for pre-warm behavior", () => {
    expect(isTransientDbError(new Error("Timed out while creating a new server connection."))).toBe(
      true,
    );
  });

  it("returns false for unrelated errors", () => {
    expect(isTransientDbError(new Error("syntax error at or near 'WHERE'"))).toBe(false);
  });

  it("returns false for null / undefined / non-Error values", () => {
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
    expect(isTransientDbError(42)).toBe(false);
  });

  it("matches when the value is a raw transient string (some runtimes reject with strings)", () => {
    expect(isTransientDbError("Control plane request failed")).toBe(true);
    expect(isTransientDbError("nope")).toBe(false);
  });

  it.each([
    ["08006", "connection_failure"],
    ["08001", "sqlclient_unable_to_establish_sqlconnection"],
    ["08003", "connection_does_not_exist"],
    ["08004", "sqlserver_rejected_establishment_of_sqlconnection"],
    ["08007", "transaction_resolution_unknown"],
  ])("matches pg SQLSTATE %s on Error.code (transient connection class)", (code) => {
    const error = Object.assign(new Error("terminating connection due to administrator command"), {
      code,
    });
    expect(isTransientDbError(error)).toBe(true);
  });

  it("matches pg SQLSTATE on a wrapped cause.code (drizzle wraps the pg error)", () => {
    const inner = Object.assign(new Error("terminating connection"), { code: "08006" });
    const outer = new Error("Failed query: select 1");
    (outer as Error & { cause?: unknown }).cause = inner;
    expect(isTransientDbError(outer)).toBe(true);
  });

  it.each(["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"])(
    "matches Node socket code %s on Error.code",
    (code) => {
      const error = Object.assign(new Error("socket hang up"), { code });
      expect(isTransientDbError(error)).toBe(true);
    },
  );

  it("does not retry on non-transient pg SQLSTATE codes (e.g., syntax 42601)", () => {
    const error = Object.assign(new Error('syntax error at or near "WHERE"'), { code: "42601" });
    expect(isTransientDbError(error)).toBe(false);
  });
});

describe("scheduled DB retry classification", () => {
  it("matches wrapper-only Drizzle failed-query errors", () => {
    const error = new Error('Failed query: select "id" from "trial_email_schedule"\nparams: ');
    expect(isDrizzleFailedQueryWrapperError(error)).toBe(true);
    expect(isRetryableScheduledDbError(error)).toBe(true);
  });

  it("does not match unrelated query or non-Error values as Drizzle wrapper errors", () => {
    expect(isDrizzleFailedQueryWrapperError(new Error('syntax error at or near "WHERE"'))).toBe(
      false,
    );
    expect(isDrizzleFailedQueryWrapperError("Failed query: select 1")).toBe(false);
  });

  it("does not match Drizzle failed-query wrappers that expose non-transient SQL metadata", () => {
    const syntaxCause = Object.assign(new Error('syntax error at or near "WHERE"'), {
      code: "42601",
    });
    const wrappedSyntax = new Error("Failed query: select broken\nparams: ", {
      cause: syntaxCause,
    });
    const wrappedCode = Object.assign(new Error("Failed query: select broken\nparams: "), {
      code: "42501",
    });

    expect(isDrizzleFailedQueryWrapperError(wrappedSyntax)).toBe(false);
    expect(isRetryableScheduledDbError(wrappedSyntax)).toBe(false);
    expect(isDrizzleFailedQueryWrapperError(wrappedCode)).toBe(false);
    expect(isRetryableScheduledDbError(wrappedCode)).toBe(false);
  });

  it("retries a real Drizzle wrapper whose cause is an unrecognized infra error (GRANTPIPE-API-17)", () => {
    // In production, drizzle-orm's PgPreparedQuery.queryWithCache ALWAYS wraps the
    // underlying driver error: `new DrizzleQueryError(query, params, cause)` sets
    // `cause` to the original pg error. So a "Failed query:" wrapper with
    // `cause == null` never occurs at runtime — the prior gate made the predicate
    // dead in production. The spend-down cron failed with exactly this shape: a
    // wrapper whose pg cause was not one of our known transient strings/codes
    // (and Sentry never serialized it). It must still be retried, because the
    // wrapped query is an idempotent scheduled read.
    const pgCause = Object.assign(new Error("Error connecting to database."), {
      // a connection-class Postgres failure (57P03 cannot_connect_now) that is NOT
      // in the positive transient pattern/code lists
      code: "57P03",
    });
    const wrapper = new Error('Failed query: select "grants"."id" from "grants"\nparams: 1,0', {
      cause: pgCause,
    });

    expect(isDrizzleFailedQueryWrapperError(wrapper)).toBe(true);
    expect(isRetryableScheduledDbError(wrapper)).toBe(true);
  });

  it("retries a Drizzle wrapper whose cause carries no SQLSTATE at all (e.g. transport drop)", () => {
    const opaqueCause = new Error("the database connection closed unexpectedly");
    const wrapper = new Error("Failed query: select 1\nparams: ", { cause: opaqueCause });

    expect(isDrizzleFailedQueryWrapperError(wrapper)).toBe(true);
    expect(isRetryableScheduledDbError(wrapper)).toBe(true);
  });

  it("preserves transient DB matching for scheduled retry classification", () => {
    const wrappedTransient = new Error("Failed query: select 1\nparams: ", {
      cause: new Error("Control plane request failed"),
    });

    expect(isRetryableScheduledDbError(new Error("Control plane request failed"))).toBe(true);
    expect(isRetryableScheduledDbError(wrappedTransient)).toBe(true);
    expect(isRetryableScheduledDbError(new Error('syntax error at or near "WHERE"'))).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("returns the value on the first attempt", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const delay = vi.fn();
    await expect(withDbRetry(fn, { delay })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("retries once on a transient error and succeeds", async () => {
    const transient = new Error("Control plane request failed");
    const fn = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue("ok");
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(withDbRetry(fn, { backoffMs: [10, 20], delay })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(10);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it("retries once when a custom predicate classifies the error as retryable", async () => {
    const wrapperOnly = new Error("Failed query: select 1\nparams: ");
    const fn = vi.fn().mockRejectedValueOnce(wrapperOnly).mockResolvedValue("ok");
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(
      withDbRetry(fn, {
        backoffMs: [10, 20],
        delay,
        isRetryable: (error) =>
          error instanceof Error && error.message.startsWith("Failed query: select 1"),
      }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(10);
    expect(delay).toHaveBeenCalledTimes(1);
  });

  it("retries each transient failure with the next backoff and surfaces the last error after exhausting attempts", async () => {
    const transient = new Error("Control plane request failed");
    const fn = vi.fn().mockRejectedValue(transient);
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(withDbRetry(fn, { backoffMs: [10, 20], delay })).rejects.toBe(transient);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenNthCalledWith(1, 10);
    expect(delay).toHaveBeenNthCalledWith(2, 20);
    expect(delay).toHaveBeenCalledTimes(2);
  });

  it("rethrows non-transient errors immediately without sleeping", async () => {
    const fatal = new Error("syntax error at or near 'WHERE'");
    const fn = vi.fn().mockRejectedValue(fatal);
    const delay = vi.fn();

    await expect(withDbRetry(fn, { backoffMs: [10, 20], delay })).rejects.toBe(fatal);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delay).not.toHaveBeenCalled();
  });

  it("uses the default backoff when none is provided", async () => {
    const transient = new Error("Control plane request failed");
    const fn = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue("ok");
    const delay = vi.fn().mockResolvedValue(undefined);

    await expect(withDbRetry(fn, { delay })).resolves.toBe("ok");
    expect(delay).toHaveBeenCalledWith(250);
  });

  it("uses the default setTimeout-based delay when no options are provided", async () => {
    vi.useFakeTimers();
    const transient = new Error("Control plane request failed");
    const fn = vi.fn().mockRejectedValueOnce(transient).mockResolvedValue("ok");
    const promise = withDbRetry(fn);
    await vi.advanceTimersByTimeAsync(250);
    await expect(promise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
