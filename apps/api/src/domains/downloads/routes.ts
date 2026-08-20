import { Hono } from "hono";
import { isLeadMagnetSlug, leadMagnetAsset } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { verifyDownloadToken } from "../../lib/r2";

/**
 * Public download routes — no authentication required.
 *
 * Two access paths exist:
 *   - `/file/:slug` — ungated, deterministic, public download by lead-magnet
 *     slug. Used for static campaign links that point recipients straight at
 *     the asset. No token, no expiry.
 *   - `/:token` — signed, per-lead, expiring HMAC token. Used by the lead
 *     form / email delivery flow. Possession of a valid, non-expired token is
 *     sufficient proof that the download was legitimately granted.
 *
 * The literal `/file/:slug` route is registered first and uses a static path
 * segment, so Hono's router matches it ahead of the `/:token` param route and
 * the two never collide.
 */
export const downloadsRoutes = new Hono<AppEnv>()
  .get("/file/:slug", async (c) => {
    const slug = c.req.param("slug");

    // Only serve known lead-magnet slugs. Everything else is a 404 so this
    // route can never be used to probe arbitrary R2 keys.
    if (!isLeadMagnetSlug(slug)) {
      return c.json({ error: "File not found" }, 404);
    }

    const asset = leadMagnetAsset(slug);

    const r2 = c.env.R2;
    const object = r2 ? await r2.get(asset.r2Key) : null;

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    return new Response(object.body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        // `inline` so browsers preview the asset; the slug is a known-safe
        // value (validated by isLeadMagnetSlug) so no sanitization is needed.
        "Content-Disposition": `inline; filename="${slug}.${asset.extension}"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  })
  .get("/:token", async (c) => {
    const token = c.req.param("token");
    const secret = c.env.DOWNLOAD_LINK_SECRET ?? c.env.BETTER_AUTH_SECRET;

    const verified = await verifyDownloadToken(token, secret);
    if (!verified) {
      return c.json({ error: "Invalid or expired download link" }, 401);
    }

    const { magnetSlug } = verified;
    const asset = leadMagnetAsset(magnetSlug);
    const key = asset.r2Key;

    const r2 = c.env.R2;
    const object = r2 ? await r2.get(key) : null;

    if (!object) {
      return c.json({ error: "File not found" }, 404);
    }

    // Sanitize magnetSlug before embedding in the Content-Disposition header to
    // prevent header injection via characters that are special in that context.
    const safeSlug = magnetSlug.replace(/["\\/\r\n;]/g, "-");

    return new Response(object.body as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": asset.contentType,
        "Content-Disposition": `attachment; filename="${safeSlug}.${asset.extension}"`,
        "X-Robots-Tag": "noindex, nofollow, noarchive",
        "Cache-Control": "private, no-store",
      },
    });
  });
