/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SENTRY_DSN?: string;
  readonly PUBLIC_SENTRY_ENVIRONMENT?: string;
  readonly PUBLIC_SENTRY_RELEASE?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface CloudflareEnv {
  STATS_SECRET?: string;
  AI_SDR_CLIENT_ASSERTION_SECRET?: string;
  AI_SDR_CONTEXT_SECRET?: string;
}

// Astro v6 removed `Astro.locals.runtime.env`; the Cloudflare adapter exposes
// the worker environment via the `cloudflare:workers` virtual module instead.
declare module "cloudflare:workers" {
  export const env: CloudflareEnv;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: CloudflareEnv;
      ctx: ExecutionContext;
    };
  }
}
