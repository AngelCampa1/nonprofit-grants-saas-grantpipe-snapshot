import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { AppError } from "../lib/app-error";
import { captureApiException } from "../lib/sentry";
import type { AppEnv } from "../types";

function getOptionalContextValue<T>(
  c: Parameters<ErrorHandler>[1],
  key: keyof AppEnv["Variables"],
) {
  try {
    return c.get(key) as T | undefined;
  } catch {
    return undefined;
  }
}

function shouldCaptureEntityScopedAppError(err: AppError, c: Parameters<ErrorHandler>[1]): boolean {
  if (err.status !== 403) return false;
  const entityId = getOptionalContextValue<string | null>(c, "entityId");
  if (!entityId) return false;
  const routePath = c.req.routePath || c.req.path;
  return isGrantsRoutePath(routePath) || isGrantsRoutePath(c.req.path);
}

function isGrantsRoutePath(path: string): boolean {
  return (
    path === "/grants" ||
    path.startsWith("/grants/") ||
    path === "/api/grants" ||
    path.startsWith("/api/grants/")
  );
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  if (err instanceof AppError) {
    if (err.status >= 500) {
      console.error("Unhandled application error:", err);
      captureApiException(err, c, { status: err.status });
    } else if (shouldCaptureEntityScopedAppError(err, c)) {
      captureApiException(err, c, {
        status: err.status,
        sanitizedMessage: "Entity-scoped grants access failure",
      });
    }
    const body: Record<string, unknown> = { error: err.message };
    if (err.errorCode) body.errorCode = err.errorCode;
    if (err.details) Object.assign(body, err.details);
    return c.json(body, { status: err.status as 400 | 402 | 403 | 404 | 409 | 500 });
  }
  console.error("Unhandled error:", err);
  captureApiException(err, c, { status: 500 });
  return c.json({ error: "Internal Server Error" }, 500);
};
