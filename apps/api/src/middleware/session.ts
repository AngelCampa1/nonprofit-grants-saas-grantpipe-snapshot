import { createMiddleware } from "hono/factory";

type SessionUser = { id: string; email: string; name: string };
type SessionData = { id: string; userId: string };
type AuthSessionData = SessionData & { token: string };
type GetSession = (
  headers: Headers,
) => Promise<{ user: SessionUser; session: AuthSessionData } | null>;

// Better Auth's getSession hits Postgres (Hyperdrive caching is disabled in
// prod to keep read-your-writes correct), so a single database blip surfaces as
// `APIError: Failed to get session` 500s across every in-flight request for
// the affected user. One transparent retry absorbs the dominant single-blip
// pattern without masking real outages — the second throw still propagates.
export async function getSessionWithRetry(
  getSession: GetSession,
  headers: Headers,
): Promise<Awaited<ReturnType<GetSession>>> {
  try {
    return await getSession(headers);
  } catch {
    return await getSession(headers);
  }
}

export function sessionMiddleware(getSession: GetSession) {
  return createMiddleware<{
    Variables: {
      user: SessionUser;
      session: SessionData;
    };
  }>(async (c, next) => {
    const result = await getSessionWithRetry(getSession, c.req.raw.headers);

    if (result === null) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", result.user);
    c.set("session", { id: result.session.id, userId: result.session.userId });

    await next();
  });
}
