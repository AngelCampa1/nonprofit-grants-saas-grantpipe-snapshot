import type { MiddlewareHandler } from "hono";
import type { AppEnv, Bindings } from "../types";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const READ_ONLY_AUTH_GET_PATHS = new Set(["/api/auth/better/get-session"]);

export function isReadOnlyMaintenanceMode(env: Pick<Bindings, "MAINTENANCE_MODE">): boolean {
  return env.MAINTENANCE_MODE === "read_only";
}

export function maintenanceMode(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const blocksRequest =
      MUTATING_METHODS.has(c.req.method) ||
      (c.req.method === "GET" &&
        c.req.path.startsWith("/api/auth/better/") &&
        !READ_ONLY_AUTH_GET_PATHS.has(c.req.path));

    if (isReadOnlyMaintenanceMode(c.env) && blocksRequest) {
      return c.json(
        {
          error: "GrantPipe is temporarily read-only for database maintenance.",
          errorCode: "MAINTENANCE_READ_ONLY",
        },
        503,
        { "retry-after": "300" },
      );
    }

    await next();
  };
}
