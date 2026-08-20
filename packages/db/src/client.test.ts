import { beforeEach, describe, expect, it, vi } from "vitest";

const drizzleNodePostgresMock = vi.fn();
const pgClientMock = vi.fn();
const pgPoolMock = vi.fn();
const schemaMock = {
  organizations: { _: "organizations-table" },
};

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: drizzleNodePostgresMock,
}));

vi.mock("pg", () => ({
  Client: pgClientMock,
  Pool: pgPoolMock,
}));

vi.mock("./schema", () => schemaMock);

describe("createDbHandle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a closeable node-postgres handle for remote database URLs", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = { end, query: vi.fn() };
    const dbClient = { select: vi.fn() };
    pgPoolMock.mockReturnValue(pool);
    drizzleNodePostgresMock.mockReturnValue(dbClient);

    const { createDbHandle } = await import("./client");

    const result = await createDbHandle(
      "postgres://postgres.project:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    );

    expect(result.db).toBe(dbClient);
    expect(pgPoolMock).toHaveBeenCalledWith({
      connectionString:
        "postgres://postgres.project:pass@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
      max: 5,
      connectionTimeoutMillis: 25_000,
      idleTimeoutMillis: 0,
    });
    expect(drizzleNodePostgresMock).toHaveBeenCalledWith(pool, {
      schema: schemaMock,
    });
    await result.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("creates a closeable node-postgres handle for localhost database URLs", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const sqlClient = { end };
    const dbClient = { select: vi.fn() };
    pgPoolMock.mockReturnValue(sqlClient);
    drizzleNodePostgresMock.mockReturnValue(dbClient);

    const { createDbHandle } = await import("./client");

    const result = await createDbHandle("postgres://postgres:postgres@localhost:54329/grantpipe");

    expect(result.db).toBe(dbClient);
    expect(pgPoolMock).toHaveBeenCalledWith({
      connectionString: "postgres://postgres:postgres@localhost:54329/grantpipe",
      max: 5,
    });
    expect(drizzleNodePostgresMock).toHaveBeenCalledWith(sqlClient, {
      schema: schemaMock,
    });
    await result.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("creates a pooled node-postgres handle for Hyperdrive with bounded max and connect timeout", async () => {
    // Per systematic-debugging Phase 4.5: the prior Client-per-invocation
    // pattern caused 4 parallel scheduled jobs to each call pg.Client.connect()
    // simultaneously through Hyperdrive, thundering-herding on the
    // connection-setup window and all timing out together
    // ("error: Timed out while creating a new server connection.").
    //
    // The Hyperdrive branch now uses pg.Pool with max=WORKER_PG_POOL_MAX and
    // a real connectionTimeoutMillis so (a) pool members open lazily as each
    // concurrent query issues its first statement, (b) only one connection
    // pays connection setup cost, and (c) a genuine Postgres connect failure
    // surfaces as a timed-out error instead of hanging the whole invocation.
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = { end, query: vi.fn() };
    const dbClient = { select: vi.fn() };
    pgPoolMock.mockReturnValue(pool);
    drizzleNodePostgresMock.mockReturnValue(dbClient);

    const { createDbHandle } = await import("./client");

    const result = await createDbHandle("postgres://user:pass@db.example.com:5432/grantpipe", {
      connectionString: "postgres://hyperdrive-proxy:5432/grantpipe",
    });

    expect(result.db).toBe(dbClient);
    expect(pgPoolMock).toHaveBeenCalledWith({
      connectionString: "postgres://hyperdrive-proxy:5432/grantpipe",
      max: 5,
      connectionTimeoutMillis: 25_000,
      idleTimeoutMillis: 0,
    });
    expect(pgClientMock).not.toHaveBeenCalled();
    expect(drizzleNodePostgresMock).toHaveBeenCalledWith(pool, {
      schema: schemaMock,
    });
    await result.close();
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("falls back to databaseUrl when hyperdrive is not provided", async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = { end, query: vi.fn() };
    const dbClient = { select: vi.fn() };
    pgPoolMock.mockReturnValue(pool);
    drizzleNodePostgresMock.mockReturnValue(dbClient);

    const { createDbHandle } = await import("./client");

    const result = await createDbHandle("postgres://user:pass@db.example.com:5432/grantpipe");

    expect(pgPoolMock).toHaveBeenCalledWith({
      connectionString: "postgres://user:pass@db.example.com:5432/grantpipe",
      max: 5,
      connectionTimeoutMillis: 25_000,
      idleTimeoutMillis: 0,
    });
    expect(drizzleNodePostgresMock).toHaveBeenCalledWith(pool, {
      schema: schemaMock,
    });
    expect(result.db).toBe(dbClient);
    await result.close();
  });

  it("uses the hyperdrive pg.Pool path even when the Hyperdrive connection string points at localhost", async () => {
    // Hyperdrive proxy URLs commonly use a localhost hostname. The isLocalDatabaseUrl
    // branch only applies when there's no Hyperdrive binding; with Hyperdrive we
    // always take the pooled node-postgres path so Hyperdrive can pool the origin.
    const end = vi.fn().mockResolvedValue(undefined);
    const pool = { end, query: vi.fn() };
    const dbClient = { select: vi.fn() };
    pgPoolMock.mockReturnValue(pool);
    drizzleNodePostgresMock.mockReturnValue(dbClient);

    const { createDbHandle } = await import("./client");

    const result = await createDbHandle("postgres://user:pass@db.neon.tech:5432/grantpipe", {
      connectionString: "postgres://user:pass@localhost:5432/grantpipe",
    });

    expect(pgPoolMock).toHaveBeenCalledWith({
      connectionString: "postgres://user:pass@localhost:5432/grantpipe",
      max: 5,
      connectionTimeoutMillis: 25_000,
      idleTimeoutMillis: 0,
    });
    expect(pgClientMock).not.toHaveBeenCalled();
    expect(drizzleNodePostgresMock).toHaveBeenCalledWith(pool, {
      schema: schemaMock,
    });
    expect(result.db).toBe(dbClient);
    await result.close();
    expect(end).toHaveBeenCalledTimes(1);
  });
});
