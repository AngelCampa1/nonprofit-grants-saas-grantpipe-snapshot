import { describe, expect, it, vi } from "vitest";
import {
  DEPLOY_API_STEPS,
  assertSupabaseHyperdrivePreflight,
  deployApi,
  isEntrypoint,
  isSupabaseDatabaseUrl,
  runCli,
  runDeployCommand,
  warnOnMissingProdSecrets,
  type DeployApiStep,
} from "./deploy-api";

describe("DEPLOY_API_STEPS", () => {
  it("runs database migrations before deploying the Worker", () => {
    expect(DEPLOY_API_STEPS.map((step) => step.command)).toEqual([
      "pnpm --filter @grantpipe/db run migrate",
      "pnpm --filter @grantpipe/api exec wrangler d1 migrations apply grantpipe-db --env production --remote",
      "pnpm --filter @grantpipe/api exec wrangler deploy --env production",
    ]);
  });
});

describe("deployApi", () => {
  it("executes every API deploy step in order", () => {
    const exec = vi.fn();

    deployApi({ exec });

    expect(exec).toHaveBeenCalledTimes(3);
    expect(exec.mock.calls.map(([step]: [DeployApiStep]) => step.command)).toEqual(
      DEPLOY_API_STEPS.map((step) => step.command),
    );
  });
});

describe("assertSupabaseHyperdrivePreflight", () => {
  it("does not require Supabase Hyperdrive details for non-Supabase deploys", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          DATABASE_URL: "postgres://user:pass@old.neon.tech/app",
        },
        () => 'id = "048a27bd483549d2b9def7cf44ce25c3"',
      ),
    ).not.toThrow();
  });

  it("rejects a Neon deploy when wrangler.toml is already bound to Supabase", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          DATABASE_URL: "postgres://user:pass@old.neon.tech/app",
        },
        () => 'id = "11111111111111111111111111111111"',
      ),
    ).toThrow("wrangler.toml no longer contains the old Neon Hyperdrive ID");
  });

  it("requires an explicit Supabase Hyperdrive ID for Supabase deploys", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          DATABASE_URL: "postgres://postgres:pass@db.project.supabase.co/postgres",
        },
        () => "",
      ),
    ).toThrow("SUPABASE_HYPERDRIVE_ID is required");
  });

  it("rejects the old Neon Hyperdrive ID during Supabase deploys", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          CUTOVER_DEPLOY_TARGET: "supabase",
          SUPABASE_HYPERDRIVE_ID: "048a27bd483549d2b9def7cf44ce25c3",
        },
        () => 'id = "048a27bd483549d2b9def7cf44ce25c3"',
      ),
    ).toThrow("must not be the old Neon Hyperdrive ID");
  });

  it("requires wrangler.toml to contain the expected Supabase Hyperdrive ID", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          CUTOVER_DEPLOY_TARGET: "supabase",
          SUPABASE_HYPERDRIVE_ID: "supabase-hyperdrive-id",
        },
        () => 'id = "different-id"',
      ),
    ).toThrow("does not contain SUPABASE_HYPERDRIVE_ID");
  });

  it("passes when Supabase deploy settings are unambiguous", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          CUTOVER_DEPLOY_TARGET: "supabase",
          SUPABASE_HYPERDRIVE_ID: "supabase-hyperdrive-id",
        },
        () => 'id = "supabase-hyperdrive-id"',
      ),
    ).not.toThrow();
  });

  it("does not treat an expected future provider as the active deploy target by itself", () => {
    expect(() =>
      assertSupabaseHyperdrivePreflight(
        {
          EXPECTED_PROD_DB_PROVIDER: "supabase",
          DATABASE_URL: "postgres://user:pass@old.neon.tech/app",
        },
        () => 'id = "048a27bd483549d2b9def7cf44ce25c3"',
      ),
    ).not.toThrow();
  });
});

describe("isSupabaseDatabaseUrl", () => {
  it("recognizes direct and pooler Supabase hostnames", () => {
    expect(isSupabaseDatabaseUrl("postgres://postgres:pass@db.project.supabase.co/postgres")).toBe(
      true,
    );
    expect(
      isSupabaseDatabaseUrl(
        "postgres://postgres:pass@aws-0-us-east-1.pooler.supabase.com/postgres",
      ),
    ).toBe(true);
    expect(isSupabaseDatabaseUrl("postgres://postgres:pass@old.neon.tech/postgres")).toBe(false);
  });
});

describe("runDeployCommand", () => {
  it("does not require locally exported Stripe bindings before deploying the Worker", () => {
    const exec = vi.fn();
    const env = { PATH: "test-path" };

    runDeployCommand(DEPLOY_API_STEPS.at(-1)!, {
      exec,
      loadEnv: vi.fn(),
      env,
    });

    expect(exec).toHaveBeenCalledOnce();
    expect(exec).toHaveBeenCalledWith(DEPLOY_API_STEPS.at(-1)!.command, {
      stdio: "inherit",
      env,
      cwd: expect.stringContaining("grantpipe"),
    });
  });

  it("loads root .env before executing the command", () => {
    const loadEnv = vi.fn((env: NodeJS.ProcessEnv) => {
      env.DATABASE_URL = "postgres://postgres:pass@db.project.supabase.co/postgres";
      env.SUPABASE_HYPERDRIVE_ID = "11111111111111111111111111111111";
    });
    const exec = vi.fn();
    const step = DEPLOY_API_STEPS[0]!;

    runDeployCommand(step, { exec, loadEnv, env: { PATH: "test-path" } });

    expect(loadEnv).toHaveBeenCalledWith({
      PATH: "test-path",
      DATABASE_URL: "postgres://postgres:pass@db.project.supabase.co/postgres",
      SUPABASE_HYPERDRIVE_ID: "11111111111111111111111111111111",
    });
    expect(exec).toHaveBeenCalledWith(step.command, {
      stdio: "inherit",
      env: {
        PATH: "test-path",
        DATABASE_URL: "postgres://postgres:pass@db.project.supabase.co/postgres",
        SUPABASE_HYPERDRIVE_ID: "11111111111111111111111111111111",
      },
      cwd: expect.stringContaining("grantpipe"),
    });
  });
});

describe("runCli", () => {
  it("executes and runs the post-deploy secret audit when invoked as the entrypoint", () => {
    const execute = vi.fn();
    const postDeploy = vi.fn();
    const exit = vi.fn();

    runCli({
      argv: ["node", "C:\\repo\\scripts\\deploy-api.ts"],
      scriptPath: "C:\\repo\\scripts\\deploy-api.ts",
      execute,
      postDeploy,
      exit,
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(postDeploy).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it("reports errors and exits non-zero, skipping the post-deploy audit", () => {
    const exit = vi.fn();
    const logError = vi.fn();
    const postDeploy = vi.fn();

    runCli({
      argv: ["node", "C:\\repo\\scripts\\deploy-api.ts"],
      scriptPath: "C:\\repo\\scripts\\deploy-api.ts",
      execute: () => {
        throw new Error("deploy failed");
      },
      postDeploy,
      exit,
      logError,
    });

    expect(logError).toHaveBeenCalledWith("deploy failed");
    expect(exit).toHaveBeenCalledWith(1);
    expect(postDeploy).not.toHaveBeenCalled();
  });
});

describe("warnOnMissingProdSecrets", () => {
  it("warns with the audit report when secrets are missing", () => {
    const warn = vi.fn();

    warnOnMissingProdSecrets({ listSecrets: () => ["BETTER_AUTH_SECRET"], warn });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("SENTRY_DSN");
  });

  it("stays quiet when nothing is missing", () => {
    const warn = vi.fn();
    // Provide a superset so no known secret is reported missing.
    const everything = [
      "BETTER_AUTH_SECRET",
      "SENTRY_DSN",
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_STARTER_MONTHLY",
      "STRIPE_PRICE_STARTER_ANNUAL",
      "STRIPE_PRICE_GROWTH_MONTHLY",
      "STRIPE_PRICE_GROWTH_ANNUAL",
      "STRIPE_PRICE_AUDIT_READY_MONTHLY",
      "STRIPE_PRICE_AUDIT_READY_ANNUAL",
      "RESEND_API_KEY",
      "OPENROUTER_API_KEY",
      "TURNSTILE_SECRET_KEY",
      "AI_CS_CLIENT_ASSERTION_SECRET",
      "AI_CS_CONTEXT_SECRET",
      "SEQUENCER_CLIENT_SECRET",
      "DOWNLOAD_LINK_SECRET",
      "LEAD_UNSUBSCRIBE_SECRET",
    ];

    warnOnMissingProdSecrets({ listSecrets: () => everything, warn });

    expect(warn).not.toHaveBeenCalled();
  });

  it("never throws when the secret lister fails", () => {
    const warn = vi.fn();

    expect(() =>
      warnOnMissingProdSecrets({
        listSecrets: () => {
          throw new Error("wrangler not authenticated");
        },
        warn,
      }),
    ).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isEntrypoint", () => {
  it("matches direct tsx invocation on Windows-style paths", () => {
    expect(
      isEntrypoint("file:///C:/repo/scripts/deploy-api.ts", "C:\\repo\\scripts\\deploy-api.ts"),
    ).toBe(true);
  });
});
