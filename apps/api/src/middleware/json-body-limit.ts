import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";

export function jsonBodyLimit(maxBytes: number) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const declaredSize = Number(c.req.header("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      return c.json({ error: "Payload too large" }, 413);
    }
    const body = c.req.raw.body;
    if (!body) return next();

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return c.json({ error: "Payload too large" }, 413);
      }
      chunks.push(value);
    }

    const buffered = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      buffered.set(chunk, offset);
      offset += chunk.byteLength;
    }
    c.req.raw = new Request(c.req.raw, {
      body: buffered,
      duplex: "half",
    } as RequestInit);
    await next();
  });
}
