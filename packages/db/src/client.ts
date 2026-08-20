import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const WORKER_PG_POOL_MAX = 5;
// Bounded connect deadline so remote Postgres startup failures surface as
// rejected queries instead of hanging the Worker until the wall clock kills it.
const WORKER_PG_CONNECT_TIMEOUT_MS = 25_000;

function isLocalDatabaseUrl(databaseUrl: string): boolean {
  const hostname = new URL(databaseUrl).hostname;

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "host.docker.internal"
  );
}

export async function createDbHandle(
  databaseUrl: string,
  hyperdrive?: { connectionString: string },
) {
  const url = hyperdrive?.connectionString ?? databaseUrl;

  // Hyperdrive exposes a standard Postgres TCP endpoint via nodejs_compat
  // sockets, so the Worker runtime uses node-postgres for both Hyperdrive and
  // direct provider-neutral Postgres URLs.
  //
  // We use pg.Pool (not pg.Client) so concurrent consumers lazily open up to
  // WORKER_PG_POOL_MAX backend connections as queries arrive, rather than
  // forcing N parallel `connect()` calls up front. One shared pool avoids a
  // connect-time thundering herd and leaves Hyperdrive to pool the origin side.
  if (hyperdrive || !isLocalDatabaseUrl(url)) {
    const pool = new Pool({
      connectionString: url,
      max: WORKER_PG_POOL_MAX,
      connectionTimeoutMillis: WORKER_PG_CONNECT_TIMEOUT_MS,
      idleTimeoutMillis: 0,
    });
    return {
      db: drizzleNodePostgres(pool, { schema }),
      close: () => pool.end(),
    };
  }

  // Local dev talks to a colocated Postgres (docker/host), so the remote
  // connect-timeout guard is not needed here.
  const pool = new Pool({ connectionString: url, max: WORKER_PG_POOL_MAX });
  return {
    db: drizzleNodePostgres(pool, { schema }),
    close: () => pool.end(),
  };
}

// TransactionDatabase covers both the full Database and the transaction object
// passed inside db.transaction(async (tx) => {...}). Both extend PgDatabase so
// they share the same insert/update/select/query surface.
//
// We derive the transaction type from the schema-aware drizzle instance so the
// transaction's TFullSchema matches the full schema, not Record<string, unknown>.
type NodeDbWithSchema = ReturnType<typeof drizzleNodePostgres<typeof schema, Pool>>;
export type Database = NodeDbWithSchema;
type NodeTx = Parameters<NodeDbWithSchema["transaction"]>[0] extends (
  tx: infer T,
) => Promise<unknown>
  ? T
  : never;
export type TransactionDatabase = Database | NodeTx;
