import { defineMiddleware } from "astro:middleware";

import { resolveCanonicalHostRedirect } from "./lib/canonical-host";
import { resolveLegacyPositioningRedirect } from "./lib/legacy-positioning-redirects";

export function resolveSiteMiddlewareRedirect(url: URL): URL | null {
  return resolveCanonicalHostRedirect(url) ?? resolveLegacyPositioningRedirect(url);
}

export const onRequest = defineMiddleware((context, next) => {
  const requestUrl = new URL(context.request.url);
  const redirectUrl = resolveSiteMiddlewareRedirect(requestUrl);

  if (redirectUrl) {
    return Response.redirect(redirectUrl, 301);
  }

  return next();
});
