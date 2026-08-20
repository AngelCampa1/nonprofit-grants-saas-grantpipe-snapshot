import { buildAppUrl } from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";

type Plan = "starter" | "growth" | "audit_ready" | "enterprise";
type Cycle = "monthly" | "annual";

const DEFAULT_APP_URL = marketingKnowledge.brand.appUrl;

export function getAppBaseUrl(env?: { PUBLIC_APP_URL?: string }): string {
  // Priority: explicit env override > import.meta.env (Astro/Cloudflare Pages build-time
  // inlining) > process.env (Node.js / vitest fallback).
  const candidate =
    env?.PUBLIC_APP_URL ??
    import.meta.env?.PUBLIC_APP_URL ??
    globalThis.process?.env?.PUBLIC_APP_URL;
  const value = candidate?.trim();
  return value && value.length > 0 ? value.replace(/\/$/, "") : DEFAULT_APP_URL;
}

export function buildAppPath(
  path: string,
  options: { plan?: Plan; cycle?: Cycle; promo?: string; env?: { PUBLIC_APP_URL?: string } } = {},
): string {
  const base = getAppBaseUrl(options.env);
  const appUrl = buildAppUrl(base, path);
  const params = new URLSearchParams();
  if (options.plan) params.set("plan", options.plan);
  if (options.cycle) params.set("cycle", options.cycle);
  if (options.promo) {
    const sanitized = options.promo
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9._-]/g, "")
      .slice(0, 40);
    if (sanitized.length > 0) params.set("promo", sanitized);
  }
  const query = params.toString();
  return query ? `${appUrl}?${query}` : appUrl;
}

export function buildSignupUrl(
  options: { plan?: Plan; cycle?: Cycle; promo?: string; env?: { PUBLIC_APP_URL?: string } } = {},
): string {
  return buildAppPath(marketingKnowledge.brand.signupPath, options);
}

export function getAppLoginUrl(env?: { PUBLIC_APP_URL?: string }): string {
  return buildAppPath("/login", { env });
}
