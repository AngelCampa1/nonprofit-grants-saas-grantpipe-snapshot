import { describe, expect, it, vi } from "vitest";

import {
  buildCleanupConfig,
  buildPostHogBulkDeleteRequest,
  cleanupGrantPipeE2EData,
  formatPostCommitStorageCleanupError,
  pnpmExecutableForPlatform,
  runPostHogCleanup,
  shouldRunPnpmThroughShell,
  type CleanupExecutor,
} from "./prod-e2e-cleanup";

describe("buildCleanupConfig", () => {
  it("refuses production cleanup without an explicit confirmation flag", () => {
    expect(() =>
      buildCleanupConfig({
        argv: [],
        env: { DATABASE_URL: "postgres://user:pass@prod.example/db" },
      }),
    ).toThrow("Refusing to clean production data without --yes");
  });

  it("loads the database URL and confirmation flag for confirmed cleanup", () => {
    expect(
      buildCleanupConfig({
        argv: ["--yes"],
        env: {
          DATABASE_URL: "postgres://user:pass@prod.example/db",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://user:pass@prod.example/db",
      confirmed: true,
      dryRun: false,
    });
  });

  it("refuses to use the Supabase rehearsal URL as the production cleanup target", () => {
    expect(() =>
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toThrow("Refusing to use SUPABASE_MIGRATION_DB_URL for production E2E cleanup.");
  });

  it("allows explicit production cleanup URL even when a rehearsal URL is present", () => {
    expect(
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@prod.supabase.co/postgres",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://postgres:pass@prod.supabase.co/postgres",
    });
  });

  it("refuses the rehearsal URL even when provided as the explicit production cleanup URL", () => {
    expect(() =>
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://postgres:pass@prod.supabase.co/postgres",
          SUPABASE_MIGRATION_DB_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@rehearsal.supabase.co/postgres",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toThrow("Refusing to use SUPABASE_MIGRATION_DB_URL for production E2E cleanup.");
  });

  it("requires explicit Supabase production DB targeting after cutover", () => {
    expect(() =>
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://postgres:pass@old.neon.tech/postgres",
          EXPECTED_PROD_DB_PROVIDER: "supabase",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toThrow("GRANTPIPE_PROD_DATABASE_URL is required");

    expect(() =>
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@old.neon.tech/postgres",
          EXPECTED_PROD_DB_PROVIDER: "supabase",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toThrow("Production E2E cleanup target must be a Supabase database URL");

    expect(
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          GRANTPIPE_PROD_DATABASE_URL: "postgres://postgres:pass@db.project.supabase.co/postgres",
          EXPECTED_PROD_DB_PROVIDER: "supabase",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }),
    ).toMatchObject({
      databaseUrl: "postgres://postgres:pass@db.project.supabase.co/postgres",
    });
  });

  it("fails closed when reusable E2E markers are missing", () => {
    expect(() =>
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://user:pass@prod.example/db",
          GRANTPIPE_E2E_EMAIL: "",
          GRANTPIPE_E2E_ORG_NAME: "",
        },
      }),
    ).toThrow("GRANTPIPE_E2E_EMAIL and GRANTPIPE_E2E_ORG_NAME are required");
  });

  it("loads reviewed PostHog person IDs from a CLI flag", () => {
    expect(
      buildCleanupConfig({
        argv: ["--dry-run", "--posthog-person-ids=person-1, person-2,person-1"],
        env: {
          DATABASE_URL: "postgres://user:pass@prod.example/db",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
        },
      }).reviewedPostHogPersonIds,
    ).toEqual(["person-1", "person-2"]);
  });

  it("loads reviewed PostHog person IDs from ignored local env", () => {
    expect(
      buildCleanupConfig({
        argv: ["--dry-run"],
        env: {
          DATABASE_URL: "postgres://user:pass@prod.example/db",
          GRANTPIPE_E2E_EMAIL: "reuse@example.com",
          GRANTPIPE_E2E_ORG_NAME: "Reusable E2E Org",
          POSTHOG_REVIEWED_PERSON_IDS: "person-1,person-2",
        },
      }).reviewedPostHogPersonIds,
    ).toEqual(["person-1", "person-2"]);
  });
});

describe("pnpmExecutableForPlatform", () => {
  it("uses the pnpm command shim on Windows", () => {
    expect(pnpmExecutableForPlatform("win32")).toBe("pnpm.cmd");
    expect(pnpmExecutableForPlatform("linux")).toBe("pnpm");
    expect(shouldRunPnpmThroughShell("win32")).toBe(true);
    expect(shouldRunPnpmThroughShell("linux")).toBe(false);
  });
});

describe("formatPostCommitStorageCleanupError", () => {
  it("includes every deferred R2 key when storage cleanup fails after commit", () => {
    const error = formatPostCommitStorageCleanupError(
      [
        "throwaway-org/sefa/report-1/sefa-2026.csv",
        "throwaway-org/grant/grant-1/document-1-grant-evidence.txt",
      ],
      new Error("wrangler delete failed"),
    );

    expect(error.message).toContain("Storage cleanup failed after DB commit");
    expect(error.message).toContain("throwaway-org/sefa/report-1/sefa-2026.csv");
    expect(error.message).toContain("throwaway-org/grant/grant-1/document-1-grant-evidence.txt");
    expect(error.message).toContain("wrangler delete failed");
  });
});

describe("cleanupGrantPipeE2EData", () => {
  it("deletes only strict E2E marker data and keeps reusable account core rows", async () => {
    const queries: string[] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return {
          rows: [
            { id: "throwaway-user", email: "e2e-123@grantpipe.test" },
            { id: "reusable-user", email: "reuse@example.com" },
          ],
        };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "Reusable E2E Org") {
          return {
            rows: [{ id: "reusable-org", name: "Reusable E2E Org" }],
          };
        }
        return {
          rows: [
            { id: "throwaway-org", name: "GrantPipe E2E Org" },
            { id: "reusable-org", name: "Reusable E2E Org" },
          ],
        };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "activity_log", hasOrgId: true, hasUserId: true },
            { tableName: "contacts", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
            { tableName: "saved_segments", hasOrgId: false, hasUserId: true },
            { tableName: "org_members", hasOrgId: true, hasUserId: true },
            { tableName: "user", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return {
          rows: [
            {
              childTable: "activity_log",
              childColumn: "actor_id",
              parentTable: "user",
              parentColumn: "id",
            },
            {
              childTable: "grant_fund_allocations",
              childColumn: "grant_id",
              parentTable: "grants",
              parentColumn: "id",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
      reusableEmail: "reuse@example.com",
      reusableOrgName: "Reusable E2E Org",
    });

    expect(summary.removableUserIds).toEqual(["throwaway-user"]);
    expect(summary.preservedUserIds).toEqual(["reusable-user"]);
    expect(summary.removableOrgIds).toEqual(["throwaway-org"]);
    expect(summary.preservedOrgIds).toEqual(["reusable-org"]);
    expect(queries.join("\n")).toContain("lower(\"email\") like 'e2e-%@grantpipe.test'");
    expect(queries[2]).not.toContain("GrantPipe E2E%");
    expect(queries.join("\n")).toContain('delete from "contacts"');
    expect(queries.join("\n")).toContain('delete from "saved_segments"');
    expect(queries.join("\n")).toContain('delete from "chart_of_accounts"');
    expect(queries.join("\n")).toContain('delete from "user"');
    expect(queries.join("\n")).not.toContain('"actor_id"');
    expect(queries.join("\n")).not.toContain('"org_id" = any($1::text[]) or "user_id"');
  });

  it("preserves the reusable org name even when the reusable email is unavailable", async () => {
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-123@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "GrantPipe E2E Org") {
          return { rows: [{ id: "reusable-org" }] };
        }
        return {
          rows: [{ id: "reusable-org" }, { id: "old-e2e-org" }],
        };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
      reusableOrgName: "GrantPipe E2E Org",
    });

    expect(summary.preservedOrgIds).toEqual(["reusable-org"]);
    expect(summary.removableOrgIds).toEqual(["old-e2e-org"]);
  });

  it("does not preserve a marked throwaway org just because the reusable user belongs to it", async () => {
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      if (query.includes('from "user"')) {
        return {
          rows: [
            { id: "reusable-user", email: "reuse@example.com" },
            { id: "throwaway-user", email: "e2e-123@grantpipe.test" },
          ],
        };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "Reusable E2E Org") {
          return { rows: [{ id: "reusable-org" }] };
        }
        return {
          rows: [{ id: "reusable-org" }, { id: "shared-throwaway-org" }],
        };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
      reusableEmail: "reuse@example.com",
      reusableOrgName: "Reusable E2E Org",
    });

    expect(summary.preservedUserIds).toEqual(["reusable-user"]);
    expect(summary.preservedOrgIds).toEqual(["reusable-org"]);
    expect(summary.removableOrgIds).toEqual(["shared-throwaway-org"]);
    expect(summary.removableUserIds).toEqual(["throwaway-user"]);
  });

  it("does not remove an unmarked org that is only linked to the reusable user", async () => {
    const orgSelectionUserIds: unknown[][] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      if (query.includes('from "user"')) {
        return {
          rows: [{ id: "reusable-user", email: "reuse@example.com" }],
        };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "Reusable E2E Org") {
          return { rows: [{ id: "reusable-org" }] };
        }
        if (Array.isArray(values[0]) && values[0].length === 0) {
          orgSelectionUserIds.push(values[0]);
          return { rows: [] };
        }
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
      reusableEmail: "reuse@example.com",
      reusableOrgName: "Reusable E2E Org",
    });

    expect(summary.preservedUserIds).toEqual(["reusable-user"]);
    expect(summary.preservedOrgIds).toEqual(["reusable-org"]);
    expect(summary.removableOrgIds).toEqual([]);
    expect(summary.removableUserIds).toEqual([]);
    expect(orgSelectionUserIds).toEqual([[]]);
  });

  it("targets legacy production E2E accounts and explicit smoke-test org markers", async () => {
    const queries: string[] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return {
          rows: [
            { id: "legacy-user", email: "grantpipe.e2e+20260613b@grantpipe.com" },
            { id: "invitee-user", email: "grantpipe.e2e.invitee.abc@example.test" },
          ],
        };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "Reusable E2E Org") return { rows: [] };
        return {
          rows: [
            { id: "legacy-org", name: "GrantPipe Production E2E" },
            { id: "smoke-org", name: "Smoke Test Nonprofit" },
          ],
        };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
      reusableOrgName: "Reusable E2E Org",
    });

    expect(summary.removableUserIds).toEqual(["legacy-user", "invitee-user"]);
    expect(summary.removableOrgIds).toEqual(["legacy-org", "smoke-org"]);
    expect(queries[0]).toContain("grantpipe.e2e");
    expect(queries[1]).toContain("Production E2E");
    expect(queries[1]).not.toContain("Smoke Test%");
    expect(queries[1]).not.toContain("Angel Test%");
    expect(queries[1]).not.toContain("o.\"name\" = 'TEST'");
  });

  it("targets explicit one-off canary, trace, PostHog, and Codex smoke accounts", async () => {
    const queries: string[] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string, values = []) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return {
          rows: [
            {
              id: "codex-smoke-user",
              email: "codex-smoke-20260617161156@example.com",
            },
            {
              id: "posthog-trace-user",
              email: "operator+grantpipe-posthog-f07-20260617@ventoralabs.com",
            },
            {
              id: "url-trace-user",
              email: "operator+grantpipe-url-trace-20260617@ventoralabs.com",
            },
            {
              id: "nettrace-user",
              email: "operator+grantpipe-nettrace-20260617@ventoralabs.com",
            },
            {
              id: "canary-user",
              email: "operator+grantpipe-canary-20260617@ventoralabs.com",
            },
            {
              id: "verify-user",
              email: "gp-verify-20260423@example.com",
            },
            {
              id: "reusable-user",
              email: "grantpipe.e2e+reusable@grantpipe.com",
            },
          ],
        };
      }
      if (query.includes('from "organizations"')) {
        if (!Array.isArray(values[0]) && values[0] === "GrantPipe Sweep W160") {
          return { rows: [{ id: "reusable-org" }] };
        }
        return {
          rows: [
            { id: "codex-smoke-org" },
            { id: "posthog-trace-org" },
            { id: "url-trace-org" },
            { id: "nettrace-org" },
            { id: "canary-org" },
            { id: "verify-org" },
            { id: "reusable-org" },
          ],
        };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
      reusableEmail: "grantpipe.e2e+reusable@grantpipe.com",
      reusableOrgName: "GrantPipe Sweep W160",
    });

    expect(summary.removableUserIds).toEqual([
      "codex-smoke-user",
      "posthog-trace-user",
      "url-trace-user",
      "nettrace-user",
      "canary-user",
      "verify-user",
    ]);
    expect(summary.preservedUserIds).toEqual(["reusable-user"]);
    expect(summary.removableOrgIds).toEqual([
      "codex-smoke-org",
      "posthog-trace-org",
      "url-trace-org",
      "nettrace-org",
      "canary-org",
      "verify-org",
    ]);
    expect(summary.preservedOrgIds).toEqual(["reusable-org"]);
    expect(queries[0]).toContain("operator+grantpipe-posthog-%@ventoralabs.com");
    expect(queries[0]).toContain("operator+grantpipe-url-trace-%@ventoralabs.com");
    expect(queries[0]).toContain("operator+grantpipe-nettrace-%@ventoralabs.com");
    expect(queries[0]).toContain("codex-smoke-%@example.com");
    expect(queries[0]).toContain("gp-verify-%@example.com");
    expect(queries[0]).not.toContain("Smoke Test%");
    expect(queries[0]).not.toContain("Angel Test%");
    expect(queries[0]).not.toContain("PW Test%");
    expect(queries[0]).not.toContain("%PostHog%");
    expect(queries[0]).not.toContain("%URL Trace%");
    expect(queries[0]).not.toContain("%Nettrace%");
    expect(queries[1]).toContain("Codex Smoke%");
    expect(queries[1]).toContain("GrantPipe%Canary''s Organization");
    expect(queries[1]).toContain("Ventora Canary''s Organization");
    expect(queries[1]).toContain("Angel Canary''s Organization");
    expect(queries[1]).not.toContain("%canary-org-%");
    expect(queries[2]).not.toContain("Codex Smoke%");
  });

  it("removes users that only match through an explicit removable test org", async () => {
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      if (query.includes('from "user"')) {
        return { rows: [] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "canary-org" }] };
      }
      if (query.includes('from "org_members"') && query.includes('"user_id"')) {
        return { rows: [{ id: "canary-user" }] };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: true,
    });

    expect(summary.removableOrgIds).toEqual(["canary-org"]);
    expect(summary.removableUserIds).toEqual(["canary-user"]);
  });

  it("deletes generated report R2 objects for removable E2E orgs after DB cleanup", async () => {
    const deleteStorageObjects = vi.fn(async () => undefined);
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-report@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes('from "generated_reports"')) {
        return {
          rows: [{ fileKey: "throwaway-org/sefa/report-1/sefa-2026.csv" }, { fileKey: null }],
        };
      }
      if (query.includes("information_schema.columns")) {
        return { rows: [{ tableName: "generated_reports", hasOrgId: true, hasUserId: true }] };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
      deleteStorageObjects,
    });

    expect(deleteStorageObjects).toHaveBeenCalledWith([
      "throwaway-org/sefa/report-1/sefa-2026.csv",
    ]);
    expect(summary.deletedStorageObjectKeys).toEqual(["throwaway-org/sefa/report-1/sefa-2026.csv"]);
  });

  it("does not delete R2 objects when later DB cleanup fails", async () => {
    const deleteStorageObjects = vi.fn(async () => undefined);
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-report@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes('from "generated_reports"')) {
        return { rows: [{ fileKey: "throwaway-org/sefa/report-1/sefa-2026.csv" }] };
      }
      if (query.includes("information_schema.columns")) {
        return { rows: [{ tableName: "generated_reports", hasOrgId: true, hasUserId: true }] };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      if (query.includes('delete from "documents"')) {
        throw new Error("DB cleanup failed");
      }
      return { rows: [] };
    });

    await expect(
      cleanupGrantPipeE2EData({
        executor,
        dryRun: false,
        deleteStorageObjects,
      }),
    ).rejects.toThrow("DB cleanup failed");

    expect(deleteStorageObjects).not.toHaveBeenCalled();
  });

  it("deletes uploaded document R2 objects for removable E2E orgs after DB cleanup", async () => {
    const queries: string[] = [];
    const deleteStorageObjects = vi.fn(async () => undefined);
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-document@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes('from "generated_reports"')) {
        return { rows: [] };
      }
      if (query.includes('from "documents"')) {
        return {
          rows: [
            {
              fileKey: "throwaway-org/grant/grant-1/document-1-grant-evidence.txt",
            },
            { fileKey: null },
          ],
        };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "documents", hasOrgId: true, hasUserId: false },
            { tableName: "generated_reports", hasOrgId: true, hasUserId: true },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const summary = await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
      deleteStorageObjects,
    });

    expect(deleteStorageObjects).toHaveBeenCalledWith([
      "throwaway-org/grant/grant-1/document-1-grant-evidence.txt",
    ]);
    expect(summary.deletedStorageObjectKeys).toEqual([
      "throwaway-org/grant/grant-1/document-1-grant-evidence.txt",
    ]);

    const documentDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "documents"'),
    );
    const organizationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "organizations"'),
    );

    expect(documentDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(organizationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(documentDeleteIndex).toBeLessThan(organizationDeleteIndex);
  });

  it("explicitly deletes fiscal periods before removable organizations", async () => {
    const queries: string[] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-period@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns") || query.includes("pg_constraint")) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const fiscalPeriodDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "fiscal_periods"'),
    );
    const organizationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "organizations"'),
    );

    expect(fiscalPeriodDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(organizationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(fiscalPeriodDeleteIndex).toBeLessThan(organizationDeleteIndex);
  });

  it("deletes invite links for removable orgs before removable organizations", async () => {
    const queries: string[] = [];
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-team@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "invite_links", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return {
          rows: [
            {
              childTable: "invite_links",
              childColumn: "org_id",
              parentTable: "organizations",
              parentColumn: "id",
            },
          ],
        };
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const inviteLinksDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "invite_links"'),
    );
    const organizationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "organizations"'),
    );

    expect(inviteLinksDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(organizationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(inviteLinksDeleteIndex).toBeLessThan(organizationDeleteIndex);
  });

  it("deletes known donor child rows before hard-deleting contacts", async () => {
    const queries: string[] = [];
    const deletedDonorChildren = new Set<string>();
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-donor@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "contacts", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      for (const tableName of ["communication_log", "contact_tags", "donations"]) {
        if (query.includes(`delete from "${tableName}"`)) {
          deletedDonorChildren.add(tableName);
        }
      }
      if (
        query.includes('delete from "contacts"') &&
        !["communication_log", "contact_tags", "donations"].every((tableName) =>
          deletedDonorChildren.has(tableName),
        )
      ) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const communicationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "communication_log"'),
    );
    const tagDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "contact_tags"'),
    );
    const donationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "donations"'),
    );
    const contactDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "contacts"'),
    );
    const organizationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "organizations"'),
    );

    expect(communicationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(tagDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(donationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(contactDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(organizationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(communicationDeleteIndex).toBeLessThan(contactDeleteIndex);
    expect(tagDeleteIndex).toBeLessThan(contactDeleteIndex);
    expect(donationDeleteIndex).toBeLessThan(contactDeleteIndex);
    expect(contactDeleteIndex).toBeLessThan(organizationDeleteIndex);
  });

  it("deletes restriction evidence links before restriction releases", async () => {
    const queries: string[] = [];
    let evidenceLinksDeleted = false;
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-restrictions@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "restriction_evidence_links", hasOrgId: true, hasUserId: false },
            { tableName: "restriction_releases", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      if (query.includes('delete from "restriction_evidence_links"')) {
        evidenceLinksDeleted = true;
      }
      if (query.includes('delete from "restriction_releases"') && !evidenceLinksDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const evidenceLinkDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "restriction_evidence_links"'),
    );
    const releaseDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "restriction_releases"'),
    );

    expect(evidenceLinkDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(releaseDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(evidenceLinkDeleteIndex).toBeLessThan(releaseDeleteIndex);
  });

  it("deletes restriction allowed categories and programs before restriction terms", async () => {
    const queries: string[] = [];
    let allowedCategoriesDeleted = false;
    let allowedProgramsDeleted = false;
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-restriction-terms@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "restriction_allowed_categories", hasOrgId: true, hasUserId: false },
            { tableName: "restriction_allowed_programs", hasOrgId: true, hasUserId: false },
            { tableName: "restriction_terms", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      if (query.includes('delete from "restriction_allowed_categories"')) {
        allowedCategoriesDeleted = true;
      }
      if (query.includes('delete from "restriction_allowed_programs"')) {
        allowedProgramsDeleted = true;
      }
      if (
        query.includes('delete from "restriction_terms"') &&
        (!allowedCategoriesDeleted || !allowedProgramsDeleted)
      ) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const allowedCategoriesDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "restriction_allowed_categories"'),
    );
    const allowedProgramsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "restriction_allowed_programs"'),
    );
    const termDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "restriction_terms"'),
    );

    expect(allowedCategoriesDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(allowedProgramsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(termDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(allowedCategoriesDeleteIndex).toBeLessThan(termDeleteIndex);
    expect(allowedProgramsDeleteIndex).toBeLessThan(termDeleteIndex);
  });

  it("deletes subrecipient monitoring child rows before grants", async () => {
    const queries: string[] = [];
    let correctiveActionsDeleted = false;
    let findingsDeleted = false;
    let monitoringLogsDeleted = false;
    let monitoringTasksDeleted = false;
    let riskAssessmentsDeleted = false;
    let subawardsDeleted = false;
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-subrecipient@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "subrecipient_corrective_actions", hasOrgId: true, hasUserId: false },
            { tableName: "subrecipient_findings", hasOrgId: true, hasUserId: false },
            { tableName: "subrecipient_monitoring_logs", hasOrgId: true, hasUserId: false },
            { tableName: "subrecipient_monitoring_tasks", hasOrgId: true, hasUserId: false },
            { tableName: "subrecipient_risk_assessments", hasOrgId: true, hasUserId: false },
            { tableName: "subawards", hasOrgId: true, hasUserId: false },
            { tableName: "subrecipients", hasOrgId: true, hasUserId: false },
            { tableName: "grants", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return { rows: [] };
      }
      if (query.includes('delete from "subrecipient_corrective_actions"')) {
        correctiveActionsDeleted = true;
      }
      if (query.includes('delete from "subrecipient_findings"')) {
        findingsDeleted = true;
      }
      if (query.includes('delete from "subrecipient_monitoring_logs"')) {
        monitoringLogsDeleted = true;
      }
      if (query.includes('delete from "subrecipient_monitoring_tasks"')) {
        monitoringTasksDeleted = true;
      }
      if (query.includes('delete from "subrecipient_risk_assessments"')) {
        riskAssessmentsDeleted = true;
      }
      if (
        query.includes('delete from "subawards"') &&
        (!correctiveActionsDeleted ||
          !findingsDeleted ||
          !monitoringLogsDeleted ||
          !monitoringTasksDeleted ||
          !riskAssessmentsDeleted)
      ) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (query.includes('delete from "subawards"')) {
        subawardsDeleted = true;
      }
      if (query.includes('delete from "subrecipients"') && !subawardsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (query.includes('delete from "grants"') && !subawardsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const subawardDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "subawards"'),
    );
    const subrecipientDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "subrecipients"'),
    );
    const grantDeleteIndex = queries.findIndex((query) => query.includes('delete from "grants"'));

    expect(subawardDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(subrecipientDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(grantDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(subawardDeleteIndex).toBeLessThan(subrecipientDeleteIndex);
    expect(subawardDeleteIndex).toBeLessThan(grantDeleteIndex);
  });

  it("deletes import-created grant domain rows before funders, funds, and grants", async () => {
    const queries: string[] = [];
    let expensesDeleted = false;
    let paymentRequestLinesDeleted = false;
    let impactMetricsDeleted = false;
    let outcomeIndicatorsDeleted = false;
    let grantProgramAllocationsDeleted = false;
    let reportingRequirementsDeleted = false;
    let documentExtractionsDeleted = false;
    const executor: CleanupExecutor = vi.fn(async (query: string) => {
      queries.push(query);
      if (query.includes('from "user"')) {
        return { rows: [{ id: "throwaway-user", email: "e2e-import@grantpipe.test" }] };
      }
      if (query.includes('from "organizations"')) {
        return { rows: [{ id: "throwaway-org" }] };
      }
      if (query.includes("information_schema.columns")) {
        return {
          rows: [
            { tableName: "document_extraction_actions", hasOrgId: true, hasUserId: false },
            { tableName: "document_extraction_fields", hasOrgId: true, hasUserId: false },
            { tableName: "document_extraction_sources", hasOrgId: true, hasUserId: false },
            { tableName: "document_extractions", hasOrgId: true, hasUserId: false },
            { tableName: "expenses", hasOrgId: true, hasUserId: false },
            { tableName: "funder_contacts", hasOrgId: true, hasUserId: false },
            { tableName: "funders", hasOrgId: true, hasUserId: false },
            { tableName: "funds", hasOrgId: true, hasUserId: false },
            { tableName: "grant_impact_metrics", hasOrgId: true, hasUserId: false },
            { tableName: "grant_opportunity_actions", hasOrgId: true, hasUserId: true },
            { tableName: "grant_payment_request_adjustments", hasOrgId: true, hasUserId: false },
            { tableName: "grant_payment_request_lines", hasOrgId: true, hasUserId: false },
            { tableName: "grant_payment_requests", hasOrgId: true, hasUserId: false },
            { tableName: "grant_payments", hasOrgId: true, hasUserId: false },
            { tableName: "grant_program_allocations", hasOrgId: true, hasUserId: false },
            { tableName: "grant_reporting_requirements", hasOrgId: true, hasUserId: false },
            { tableName: "grants", hasOrgId: true, hasUserId: false },
            { tableName: "organizations", hasOrgId: false, hasUserId: false },
            { tableName: "outcome_goals", hasOrgId: true, hasUserId: false },
            { tableName: "outcome_indicators", hasOrgId: true, hasUserId: false },
            { tableName: "program_impact_metric_links", hasOrgId: true, hasUserId: false },
            { tableName: "program_reporting_requirement_links", hasOrgId: true, hasUserId: false },
            { tableName: "programs", hasOrgId: true, hasUserId: false },
          ],
        };
      }
      if (query.includes("pg_constraint")) {
        return {
          rows: [
            {
              childTable: "grant_fund_allocations",
              childColumn: "grant_id",
              parentTable: "grants",
              parentColumn: "id",
            },
            {
              childTable: "grant_fund_allocations",
              childColumn: "fund_id",
              parentTable: "funds",
              parentColumn: "id",
            },
          ],
        };
      }
      if (query.includes('delete from "expenses"')) {
        if (!paymentRequestLinesDeleted) {
          const error = new Error("foreign key violation") as Error & { code: string };
          error.code = "23503";
          throw error;
        }
        expensesDeleted = true;
      }
      if (query.includes('delete from "grant_payment_request_lines"')) {
        paymentRequestLinesDeleted = true;
      }
      if (query.includes('delete from "grant_impact_metrics"')) {
        if (!outcomeIndicatorsDeleted) {
          const error = new Error("foreign key violation") as Error & { code: string };
          error.code = "23503";
          throw error;
        }
        impactMetricsDeleted = true;
      }
      if (query.includes('delete from "outcome_indicators"')) {
        outcomeIndicatorsDeleted = true;
      }
      if (query.includes('delete from "grant_program_allocations"')) {
        grantProgramAllocationsDeleted = true;
      }
      if (query.includes('delete from "grant_reporting_requirements"')) {
        reportingRequirementsDeleted = true;
      }
      if (query.includes('delete from "document_extractions"')) {
        documentExtractionsDeleted = true;
      }
      if (query.includes('delete from "grants"') && !documentExtractionsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (query.includes('delete from "grants"') && !impactMetricsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (query.includes('delete from "grants"') && !reportingRequirementsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (query.includes('delete from "grants"') && !grantProgramAllocationsDeleted) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      if (
        (query.includes('delete from "grants"') || query.includes('delete from "funds"')) &&
        !expensesDeleted
      ) {
        const error = new Error("foreign key violation") as Error & { code: string };
        error.code = "23503";
        throw error;
      }
      return { rows: [] };
    });

    await cleanupGrantPipeE2EData({
      executor,
      dryRun: false,
    });

    const grantValueDelete = queries.find(
      (query) =>
        query.includes('delete from "custom_field_values"') && query.includes('from "grants"'),
    );
    const allocationDelete = queries.find((query) =>
      query.includes('delete from "grant_fund_allocations"'),
    );
    const funderContactDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "funder_contacts"'),
    );
    const allocationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_fund_allocations"'),
    );
    const grantProgramAllocationDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_program_allocations"'),
    );
    const expensesDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "expenses"'),
    );
    const paymentRequestLinesDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_payment_request_lines"'),
    );
    const paymentRequestsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_payment_requests"'),
    );
    const impactMetricsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_impact_metrics"'),
    );
    const outcomeIndicatorsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "outcome_indicators"'),
    );
    const outcomeGoalsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "outcome_goals"'),
    );
    const programDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "programs"'),
    );
    const reportingRequirementsDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "grant_reporting_requirements"'),
    );
    const extractionSourceDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "document_extraction_sources"'),
    );
    const extractionActionDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "document_extraction_actions"'),
    );
    const extractionFieldDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "document_extraction_fields"'),
    );
    const extractionDeleteIndex = queries.findIndex((query) =>
      query.includes('delete from "document_extractions"'),
    );
    const grantDeleteIndex = queries.findIndex((query) => query.includes('delete from "grants"'));
    const fundDeleteIndex = queries.findIndex((query) => query.includes('delete from "funds"'));
    const funderDeleteIndex = queries.findIndex((query) => query.includes('delete from "funders"'));

    expect(grantValueDelete).toBeDefined();
    expect(grantValueDelete).toContain('from "grants"');
    expect(grantValueDelete).toContain('from "funds"');
    expect(grantValueDelete).toContain('from "funders"');
    expect(allocationDelete).toContain('"grant_id" in (select "id" from "grants"');
    expect(allocationDelete).toContain('"fund_id" in (select "id" from "funds"');
    expect(funderContactDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(allocationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(grantProgramAllocationDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(paymentRequestLinesDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(paymentRequestsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(expensesDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(impactMetricsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(outcomeIndicatorsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(outcomeGoalsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(programDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(reportingRequirementsDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(extractionSourceDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(extractionActionDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(extractionFieldDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(extractionDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(grantDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(fundDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(funderDeleteIndex).toBeGreaterThanOrEqual(0);
    expect(funderContactDeleteIndex).toBeLessThan(funderDeleteIndex);
    expect(paymentRequestLinesDeleteIndex).toBeLessThan(expensesDeleteIndex);
    expect(paymentRequestLinesDeleteIndex).toBeLessThan(paymentRequestsDeleteIndex);
    expect(expensesDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(expensesDeleteIndex).toBeLessThan(fundDeleteIndex);
    expect(outcomeIndicatorsDeleteIndex).toBeLessThan(impactMetricsDeleteIndex);
    expect(outcomeIndicatorsDeleteIndex).toBeLessThan(outcomeGoalsDeleteIndex);
    expect(impactMetricsDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(reportingRequirementsDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(extractionSourceDeleteIndex).toBeLessThan(extractionFieldDeleteIndex);
    expect(extractionActionDeleteIndex).toBeLessThan(extractionFieldDeleteIndex);
    expect(extractionFieldDeleteIndex).toBeLessThan(extractionDeleteIndex);
    expect(extractionDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(allocationDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(allocationDeleteIndex).toBeLessThan(fundDeleteIndex);
    expect(grantProgramAllocationDeleteIndex).toBeLessThan(grantDeleteIndex);
    expect(grantProgramAllocationDeleteIndex).toBeLessThan(programDeleteIndex);
    expect(outcomeGoalsDeleteIndex).toBeLessThan(programDeleteIndex);
    expect(grantDeleteIndex).toBeLessThan(funderDeleteIndex);
  });
});

describe("PostHog production E2E cleanup", () => {
  it("builds a person bulk-delete request for removable user distinct IDs only", () => {
    const request = buildPostHogBulkDeleteRequest({
      removableUserIds: ["throwaway-user", "reusable-user", "throwaway-user"],
      preservedUserIds: ["reusable-user"],
      removableOrgIds: ["throwaway-org", "reusable-org"],
      preservedOrgIds: ["reusable-org"],
    });

    expect(request).toEqual({
      ids: [],
      distinct_ids: ["throwaway-user", "throwaway-org"],
      delete_events: true,
      delete_recordings: true,
    });
  });

  it("builds a person bulk-delete request for reviewed stranded PostHog person IDs", () => {
    const request = buildPostHogBulkDeleteRequest({
      removableUserIds: [],
      preservedUserIds: [],
      removableOrgIds: [],
      preservedOrgIds: [],
      reviewedPersonIds: ["person-1", "person-2", "person-1"],
    });

    expect(request).toEqual({
      ids: ["person-1", "person-2"],
      distinct_ids: [],
      delete_events: true,
      delete_recordings: true,
    });
  });

  it("does not call PostHog during dry runs", async () => {
    const fetchFn = vi.fn();

    const result = await runPostHogCleanup({
      config: {
        enabled: true,
        host: "https://us.posthog.com",
        projectId: "12345",
        personalApiKey: "phx_secret",
      },
      summary: {
        removableUserIds: ["throwaway-user"],
        preservedUserIds: [],
        removableOrgIds: ["throwaway-org"],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      dryRun: true,
      fetchFn,
    });

    expect(fetchFn).not.toHaveBeenCalled();
    expect(result).toEqual({
      attempted: false,
      candidateIds: [],
      candidateDistinctIds: ["throwaway-user", "throwaway-org"],
    });
  });

  it("bulk deletes PostHog persons with events and recordings for confirmed cleanup", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await runPostHogCleanup({
      config: {
        enabled: true,
        host: "https://us.posthog.com/",
        projectId: "12345",
        personalApiKey: "phx_secret",
      },
      summary: {
        removableUserIds: ["throwaway-user"],
        preservedUserIds: [],
        removableOrgIds: ["throwaway-org"],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      dryRun: false,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://us.posthog.com/api/projects/12345/persons/bulk_delete/",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer phx_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: [],
          distinct_ids: ["throwaway-user", "throwaway-org"],
          delete_events: true,
          delete_recordings: true,
        }),
      },
    );
    expect(result).toEqual({
      attempted: true,
      candidateIds: [],
      candidateDistinctIds: ["throwaway-user", "throwaway-org"],
    });
  });

  it("bulk deletes reviewed PostHog person IDs with events and recordings", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));

    const result = await runPostHogCleanup({
      config: {
        enabled: true,
        host: "https://us.posthog.com/",
        projectId: "12345",
        personalApiKey: "phx_secret",
      },
      summary: {
        removableUserIds: [],
        preservedUserIds: [],
        removableOrgIds: [],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      reviewedPersonIds: ["person-1", "person-2"],
      dryRun: false,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://us.posthog.com/api/projects/12345/persons/bulk_delete/",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer phx_secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: ["person-1", "person-2"],
          distinct_ids: [],
          delete_events: true,
          delete_recordings: true,
        }),
      },
    );
    expect(result).toEqual({
      attempted: true,
      candidateIds: ["person-1", "person-2"],
      candidateDistinctIds: [],
    });
  });

  it("chunks PostHog bulk deletes at the documented 1000 distinct ID limit", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const removableUserIds = Array.from({ length: 1001 }, (_, index) => `user-${index}`);

    const result = await runPostHogCleanup({
      config: {
        enabled: true,
        host: "https://us.posthog.com/",
        projectId: "12345",
        personalApiKey: "phx_secret",
      },
      summary: {
        removableUserIds,
        preservedUserIds: [],
        removableOrgIds: [],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      dryRun: false,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({
      ids: [],
      distinct_ids: removableUserIds.slice(0, 1000),
    });
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toMatchObject({
      ids: [],
      distinct_ids: ["user-1000"],
    });
    expect(result.candidateDistinctIds).toHaveLength(1001);
  });

  it("chunks reviewed PostHog person ID bulk deletes at the documented 1000 ID limit", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const reviewedPersonIds = Array.from({ length: 1001 }, (_, index) => `person-${index}`);

    const result = await runPostHogCleanup({
      config: {
        enabled: true,
        host: "https://us.posthog.com/",
        projectId: "12345",
        personalApiKey: "phx_secret",
      },
      summary: {
        removableUserIds: [],
        preservedUserIds: [],
        removableOrgIds: [],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      reviewedPersonIds,
      dryRun: false,
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body))).toMatchObject({
      ids: reviewedPersonIds.slice(0, 1000),
      distinct_ids: [],
    });
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toMatchObject({
      ids: ["person-1000"],
      distinct_ids: [],
    });
    expect(result.candidateIds).toHaveLength(1001);
  });

  it("throws when PostHog rejects the cleanup request", async () => {
    const fetchFn = vi.fn(async () => new Response("forbidden", { status: 403 }));

    await expect(
      runPostHogCleanup({
        config: {
          enabled: true,
          host: "https://us.posthog.com/",
          projectId: "12345",
          personalApiKey: "phx_secret",
        },
        summary: {
          removableUserIds: ["throwaway-user"],
          preservedUserIds: [],
          removableOrgIds: [],
          preservedOrgIds: [],
          deletedTables: [],
          deletedStorageObjectKeys: [],
        },
        dryRun: false,
        fetchFn,
      }),
    ).rejects.toThrow("PostHog cleanup failed: 403 forbidden");
  });

  it("skips PostHog cleanup (does not abort) when PostHog config is missing", async () => {
    const fetchFn = vi.fn();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await runPostHogCleanup({
      config: {
        enabled: false,
      },
      summary: {
        removableUserIds: ["throwaway-user"],
        preservedUserIds: [],
        removableOrgIds: ["throwaway-org"],
        preservedOrgIds: [],
        deletedTables: [],
        deletedStorageObjectKeys: [],
      },
      dryRun: false,
      fetchFn,
    });

    expect(result).toEqual({
      attempted: false,
      candidateIds: [],
      candidateDistinctIds: ["throwaway-user", "throwaway-org"],
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping PostHog cleanup"));

    warn.mockRestore();
  });
});
