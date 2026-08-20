import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  loadIgnoredRootEnv,
  runDashboardReadonlyProof,
  runDashboardReadonlyProofCli,
} from "./verify-dashboard-prod-readonly";

describe("runDashboardReadonlyProof", () => {
  it("loads proof configuration from the ignored root env file", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "grantpipe-dashboard-proof-"));
    const previous = process.env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID;
    delete process.env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID;
    writeFileSync(join(rootDir, ".env"), "GRANTPIPE_DASHBOARD_PROOF_ORG_ID=org-from-ignored-env\n");

    try {
      loadIgnoredRootEnv({ rootDir });
      expect(process.env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID).toBe("org-from-ignored-env");
    } finally {
      if (previous === undefined) {
        delete process.env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID;
      } else {
        process.env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID = previous;
      }
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it("loads ignored env and runs the dashboard using only internal target IDs", async () => {
    const env: NodeJS.ProcessEnv = {
      GRANTPIPE_DASHBOARD_PROOF_ENV_ROOT: "/repo/grantpipe",
    };
    const close = vi.fn().mockResolvedValue(undefined);
    const db = { query: {} };
    const loadEnv = vi.fn(() => {
      env.DATABASE_URL = "postgresql://ignored";
      env.GRANTPIPE_DASHBOARD_PROOF_ORG_ID = "org-internal";
      env.GRANTPIPE_DASHBOARD_PROOF_ENTITY_ID = "entity-internal";
      return {};
    });
    const openDatabase = vi.fn().mockResolvedValue({ db, close });
    const getDashboard = vi.fn().mockResolvedValue({ recentActivity: [] });
    const write = vi.fn();

    await runDashboardReadonlyProof({
      env,
      loadEnv,
      openDatabase,
      getDashboard,
      write,
    });

    expect(loadEnv).toHaveBeenCalledWith({
      env,
      rootDir: "/repo/grantpipe",
    });
    expect(openDatabase).toHaveBeenCalledWith("postgresql://ignored");
    expect(getDashboard).toHaveBeenCalledWith(db, {
      orgId: "org-internal",
      entityId: "entity-internal",
    });
    expect(write).toHaveBeenCalledWith("PROD_READ_ONLY_DASHBOARD_OK\n");
    expect(close).toHaveBeenCalledOnce();
  });

  it("fails before opening a database when proof configuration is missing", async () => {
    const openDatabase = vi.fn();

    await expect(
      runDashboardReadonlyProof({
        env: {},
        loadEnv: vi.fn(() => ({})),
        openDatabase,
        getDashboard: vi.fn(),
        write: vi.fn(),
      }),
    ).rejects.toThrow("Dashboard proof configuration is missing");

    expect(openDatabase).not.toHaveBeenCalled();
  });

  it("closes the read-only database handle when dashboard verification fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDashboardReadonlyProof({
        env: {
          DATABASE_URL: "postgresql://ignored",
          GRANTPIPE_DASHBOARD_PROOF_ORG_ID: "org-internal",
          GRANTPIPE_DASHBOARD_PROOF_ENTITY_ID: "entity-internal",
        },
        loadEnv: vi.fn(() => ({})),
        openDatabase: vi.fn().mockResolvedValue({ db: {}, close }),
        getDashboard: vi.fn().mockRejectedValue(new Error("query failed")),
        write: vi.fn(),
      }),
    ).rejects.toThrow("query failed");

    expect(close).toHaveBeenCalledOnce();
  });

  it("rejects a dashboard response outside the expected contract", async () => {
    const close = vi.fn().mockResolvedValue(undefined);

    await expect(
      runDashboardReadonlyProof({
        env: {
          DATABASE_URL: "postgresql://ignored",
          GRANTPIPE_DASHBOARD_PROOF_ORG_ID: "org-internal",
          GRANTPIPE_DASHBOARD_PROOF_ENTITY_ID: "entity-internal",
        },
        loadEnv: vi.fn(() => ({})),
        openDatabase: vi.fn().mockResolvedValue({ db: {}, close }),
        getDashboard: vi.fn().mockResolvedValue({ recentActivity: null }),
        write: vi.fn(),
      }),
    ).rejects.toThrow("Dashboard proof contract failed");

    expect(close).toHaveBeenCalledOnce();
  });

  it("uses stdout for the success sentinel by default", async () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await runDashboardReadonlyProof({
      env: {
        DATABASE_URL: "postgresql://ignored",
        GRANTPIPE_DASHBOARD_PROOF_ORG_ID: "org-internal",
        GRANTPIPE_DASHBOARD_PROOF_ENTITY_ID: "entity-internal",
      },
      loadEnv: vi.fn(() => ({})),
      openDatabase: vi.fn().mockResolvedValue({
        db: {},
        close: vi.fn().mockResolvedValue(undefined),
      }),
      getDashboard: vi.fn().mockResolvedValue({ recentActivity: [] }),
    });

    expect(write).toHaveBeenCalledWith("PROD_READ_ONLY_DASHBOARD_OK\n");
    write.mockRestore();
  });

  it("returns a generic failure sentinel without leaking the query error", async () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runDashboardReadonlyProofCli({
      run: vi.fn().mockRejectedValue(new Error("sensitive query detail")),
    });

    expect(exitCode).toBe(1);
    expect(write).toHaveBeenCalledWith("PROD_READ_ONLY_DASHBOARD_FAILED\n");
    write.mockRestore();
  });

  it("returns zero after a successful CLI proof", async () => {
    const run = vi.fn().mockResolvedValue(undefined);

    await expect(runDashboardReadonlyProofCli({ run })).resolves.toBe(0);
    expect(run).toHaveBeenCalledOnce();
  });
});
