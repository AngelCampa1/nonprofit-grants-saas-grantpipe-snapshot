import { captureBackgroundException } from "./sentry";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warnedOnce = false;

/**
 * Verifies a Cloudflare Turnstile token against the siteverify API.
 *
 * Fail-closed: any error, non-OK status, or missing token returns false.
 * Bypass: if `secret` is unset or empty outside real/production mode, returns
 * true for intentional local/mock development. Protected modes fail closed.
 */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string | undefined,
  remoteIp?: string,
  integrationMode?: "mock" | "real",
  environment?: string,
): Promise<boolean> {
  const isTest = typeof process !== "undefined" && process.env.NODE_ENV === "test";

  if (!secret) {
    if (integrationMode === "real" || environment === "production") {
      captureBackgroundException(
        new Error("Turnstile secret is missing in a protected environment"),
        "turnstile",
        { reason: "missing_secret_protected_environment" },
      );
      return false;
    }
    if (!isTest && !warnedOnce) {
      warnedOnce = true;
      console.warn(
        "[turnstile] TURNSTILE_SECRET_KEY is not configured — Turnstile verification is bypassed. Set this secret in production.",
      );
    }
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", token);
    if (remoteIp) {
      body.set("remoteip", remoteIp);
    }

    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      captureBackgroundException(new Error("Turnstile siteverify returned non-OK"), "turnstile", {
        reason: "siteverify_non_ok",
        status: String(response.status),
      });
      return false;
    }

    const data = (await response.json()) as unknown;
    if (
      typeof data === "object" &&
      data !== null &&
      "success" in data &&
      (data as { success: unknown }).success === true
    ) {
      return true;
    }
    if (
      !(
        typeof data === "object" &&
        data !== null &&
        "success" in data &&
        (data as { success: unknown }).success === false
      )
    ) {
      captureBackgroundException(
        new Error("Turnstile siteverify returned a malformed response"),
        "turnstile",
        { reason: "siteverify_malformed_response" },
      );
    }
    return false;
  } catch (error) {
    captureBackgroundException(error, "turnstile", {
      reason: "siteverify_exception",
    });
    return false;
  }
}
