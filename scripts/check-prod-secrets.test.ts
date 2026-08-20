import { describe, expect, it, vi } from "vitest";
import {
  PROD_API_SECRETS,
  SCRIPT_PATH,
  auditProdSecrets,
  formatAuditReport,
  isEntrypoint,
  listProdApiSecrets,
  parseWranglerSecretList,
  runCli,
} from "./check-prod-secrets";

const execSyncMock = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ execSync: execSyncMock }));

describe("PROD_API_SECRETS", () => {
  it("declares the secrets that were silently lost in the 2026 wind-down", () => {
    const names = PROD_API_SECRETS.map((s) => s.name);
    for (const expected of [
      "BETTER_AUTH_SECRET",
      "SENTRY_DSN",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "AI_CS_CONTEXT_SECRET",
      "SEQUENCER_CLIENT_SECRET",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("does not require DATABASE_URL (prod runs off the Hyperdrive binding)", () => {
    expect(PROD_API_SECRETS.map((s) => s.name)).not.toContain("DATABASE_URL");
  });

  it("classifies fallback-backed secrets as optional", () => {
    const byName = new Map(PROD_API_SECRETS.map((s) => [s.name, s]));
    expect(byName.get("DOWNLOAD_LINK_SECRET")?.tier).toBe("optional");
    expect(byName.get("LEAD_UNSUBSCRIBE_SECRET")?.tier).toBe("optional");
  });
});

describe("parseWranglerSecretList", () => {
  it("extracts secret names from `wrangler secret list` JSON", () => {
    const json = JSON.stringify([
      { name: "BETTER_AUTH_SECRET", type: "secret_text" },
      { name: "SENTRY_DSN", type: "secret_text" },
    ]);
    expect(parseWranglerSecretList(json)).toEqual(["BETTER_AUTH_SECRET", "SENTRY_DSN"]);
  });

  it("tolerates leading noise before the JSON array (wrangler banner)", () => {
    const json = `⛅️ wrangler 4.80.0\n[\n  { "name": "RESEND_API_KEY", "type": "secret_text" }\n]`;
    expect(parseWranglerSecretList(json)).toEqual(["RESEND_API_KEY"]);
  });

  it("throws on unparseable output", () => {
    expect(() => parseWranglerSecretList("not json at all")).toThrow();
  });

  it("throws when wrangler returns valid JSON that is not an array", () => {
    // e.g. an auth error page: never treat this as "zero secrets present".
    expect(() => parseWranglerSecretList('{"error":"unauthorized"}')).toThrow();
  });
});

describe("auditProdSecrets", () => {
  it("reports the tiers of missing secrets", () => {
    const audit = auditProdSecrets(["BETTER_AUTH_SECRET", "RESEND_API_KEY"]);
    const missingNames = audit.missing.map((s) => s.name);
    expect(missingNames).toContain("SENTRY_DSN");
    expect(missingNames).toContain("STRIPE_SECRET_KEY");
    expect(missingNames).not.toContain("BETTER_AUTH_SECRET");
    expect(audit.hasFeatureGap).toBe(true);
  });

  it("flags a critical gap when BETTER_AUTH_SECRET is absent", () => {
    const audit = auditProdSecrets([]);
    expect(audit.hasCriticalGap).toBe(true);
    expect(audit.missingByTier.critical.map((s) => s.name)).toContain("BETTER_AUTH_SECRET");
  });

  it("is clean when every non-optional secret is present", () => {
    const present = PROD_API_SECRETS.filter((s) => s.tier !== "optional").map((s) => s.name);
    const audit = auditProdSecrets(present);
    expect(audit.hasCriticalGap).toBe(false);
    expect(audit.hasFeatureGap).toBe(false);
    // optional secrets may still be missing but must not count as a gap
    expect(audit.missing.every((s) => s.tier === "optional")).toBe(true);
  });
});

describe("formatAuditReport", () => {
  it("names each missing secret and its impact", () => {
    const report = formatAuditReport(auditProdSecrets(["BETTER_AUTH_SECRET"]));
    expect(report).toContain("SENTRY_DSN");
    expect(report).toContain("wrangler secret put");
  });

  it("reports all-clear when every known secret is present", () => {
    const report = formatAuditReport(auditProdSecrets(PROD_API_SECRETS.map((s) => s.name)));
    expect(report).toContain("All known secrets are present");
    expect(report).not.toContain("wrangler secret put");
  });
});

describe("listProdApiSecrets", () => {
  it("parses secret names from the wrangler invocation", () => {
    execSyncMock.mockReturnValueOnce(
      '[{"name":"BETTER_AUTH_SECRET","type":"secret_text"},{"name":"SENTRY_DSN","type":"secret_text"}]',
    );
    expect(listProdApiSecrets()).toEqual(["BETTER_AUTH_SECRET", "SENTRY_DSN"]);
    expect(execSyncMock).toHaveBeenCalledWith(
      expect.stringContaining("wrangler secret list --env production"),
      expect.objectContaining({ encoding: "utf8" }),
    );
  });
});

describe("isEntrypoint", () => {
  it("is false when there is no argv entry", () => {
    expect(isEntrypoint(SCRIPT_PATH, undefined)).toBe(false);
  });
});

describe("runCli", () => {
  it("exits non-zero in strict mode when a non-optional secret is missing", () => {
    const exit = vi.fn();
    const logError = vi.fn();
    const log = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH, "--strict"],
      listSecrets: () => ["BETTER_AUTH_SECRET"],
      exit,
      log,
      logError,
    });

    expect(exit).toHaveBeenCalledWith(1);
    expect(logError).toHaveBeenCalled();
  });

  it("does not exit non-zero in advisory (default) mode even with gaps", () => {
    const exit = vi.fn();
    const log = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      listSecrets: () => ["BETTER_AUTH_SECRET"],
      exit,
      log,
      logError: vi.fn(),
    });

    expect(exit).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });

  it("reports all clear in strict mode when non-optional secrets are present", () => {
    const exit = vi.fn();
    const log = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH, "--strict"],
      listSecrets: () => PROD_API_SECRETS.filter((s) => s.tier !== "optional").map((s) => s.name),
      exit,
      log,
      logError: vi.fn(),
    });

    expect(exit).not.toHaveBeenCalled();
  });

  it("does nothing when not invoked as the entrypoint", () => {
    const listSecrets = vi.fn(() => [] as string[]);
    const exit = vi.fn();

    runCli({ argv: ["node", "some-other-script.ts"], listSecrets, exit, log: vi.fn() });

    expect(listSecrets).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits non-zero when the secret lister fails", () => {
    const exit = vi.fn();
    const logError = vi.fn();

    runCli({
      argv: ["node", SCRIPT_PATH],
      listSecrets: () => {
        throw new Error("wrangler not authenticated");
      },
      exit,
      log: vi.fn(),
      logError,
    });

    expect(logError).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
