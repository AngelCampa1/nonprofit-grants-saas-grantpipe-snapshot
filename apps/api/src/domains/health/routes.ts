import { Hono } from "hono";
import { sql } from "drizzle-orm";
import type { AppEnv } from "../../types";

export const healthRoutes = new Hono<AppEnv>()
  .get("/", (c) => {
    return c.json({ status: "ok" });
  })
  .get("/db", async (c) => {
    if (c.env.CUTOVER_DB_HEALTH_ENABLED !== "1") {
      return c.json({ error: "Not Found" }, 404);
    }
    const expectedSecret = c.env.CUTOVER_DB_HEALTH_SECRET;
    if (!expectedSecret || c.req.header("x-grantpipe-cutover-secret") !== expectedSecret) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const db = c.get("db");
    const result = await db.execute(sql`
    select
      current_database() as database,
      current_schema() as schema_name
  `);
    const rows = Array.isArray(result) ? result : result.rows;
    const row = rows[0] as { database?: unknown; schema_name?: unknown } | undefined;
    const connectionString = c.env.HYPERDRIVE?.connectionString ?? c.env.DATABASE_URL;
    const host = new URL(connectionString).hostname;

    return c.json({
      status: "ok",
      database: typeof row?.database === "string" ? row.database : null,
      schema: typeof row?.schema_name === "string" ? row.schema_name : null,
      connection: {
        host,
        mode: c.env.HYPERDRIVE ? "hyperdrive" : "direct",
      },
    });
  });
