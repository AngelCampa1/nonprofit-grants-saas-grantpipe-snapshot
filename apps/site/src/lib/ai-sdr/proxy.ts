import { isAllowedOrigin, WORKER_BASE_URL } from "./config.js";
import { buildHmacPayload, hmacHex, randomNonce } from "./signing.js";

export interface ProxyEnv {
  AI_SDR_CLIENT_ASSERTION_SECRET?: string;
  PUBLIC_SENTRY_DSN?: string;
  SENTRY_DSN?: string;
  PUBLIC_SENTRY_ENVIRONMENT?: string;
}

type ProxyFailureMetadata = {
  feature: "ai-sdr";
  upstreamPath: "/v1/sessions" | "/v1/chat" | "/v1/handoff";
  failureType: "network" | "upstream-status";
  status?: string;
};

type ProxyFailureReporter = (
  error: unknown,
  metadata: ProxyFailureMetadata,
) => void | Promise<void>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildSentryEnvelope({
  dsn,
  environment,
  error,
  metadata,
}: {
  dsn: string;
  environment?: string;
  error: unknown;
  metadata: ProxyFailureMetadata;
}): string {
  const timestamp = new Date().toISOString();
  const event = {
    timestamp,
    platform: "javascript",
    level: "error",
    message: `AI-SDR proxy ${metadata.failureType}`,
    environment,
    exception: {
      values: [
        {
          type: error instanceof Error ? error.name : "Error",
          value: getErrorMessage(error),
        },
      ],
    },
    tags: {
      feature: metadata.feature,
      upstream_path: metadata.upstreamPath,
      failure_type: metadata.failureType,
      status: metadata.status ?? "none",
    },
  };
  return `${JSON.stringify({ sent_at: timestamp, dsn })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}\n`;
}

function getSentryEnvelopeUrl(dsn: string): string | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.split("/").filter(Boolean).at(-1);
    if (!projectId) return null;
    return `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
  } catch {
    return null;
  }
}

export async function reportAiSdrProxyFailure(
  error: unknown,
  metadata: ProxyFailureMetadata,
  env?: ProxyEnv,
): Promise<void> {
  const dsn = env?.SENTRY_DSN?.trim() || env?.PUBLIC_SENTRY_DSN?.trim();
  const envelopeUrl = dsn ? getSentryEnvelopeUrl(dsn) : null;
  if (dsn && envelopeUrl) {
    try {
      const sentryResponse = await fetch(envelopeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-sentry-envelope" },
        body: buildSentryEnvelope({
          dsn,
          environment: env?.PUBLIC_SENTRY_ENVIRONMENT,
          error,
          metadata,
        }),
      });
      if (sentryResponse.ok) {
        return;
      }
    } catch {
      // Fall through to runtime logs so failures are still visible.
    }
  }

  console.error("[ai-sdr] proxy failure", {
    ...metadata,
    error: getErrorMessage(error),
  });
}

export function createAiSdrProxyFailureReporter(env: ProxyEnv): ProxyFailureReporter {
  return (error, metadata) => reportAiSdrProxyFailure(error, metadata, env);
}

async function notifyProxyFailure(
  reportFailure: ProxyFailureReporter,
  error: unknown,
  metadata: ProxyFailureMetadata,
): Promise<void> {
  try {
    await reportFailure(error, metadata);
  } catch (reportError) {
    console.error("[ai-sdr] proxy failure reporter failed", {
      feature: metadata.feature,
      upstreamPath: metadata.upstreamPath,
      failureType: metadata.failureType,
      status: metadata.status,
      error: getErrorMessage(reportError),
    });
  }
}

export async function handleAiSdrProxy(options: {
  request: Request;
  env: ProxyEnv;
  upstreamPath: "/v1/sessions" | "/v1/chat" | "/v1/handoff";
  reportFailure?: ProxyFailureReporter;
}): Promise<Response> {
  const { request, env, upstreamPath, reportFailure = reportAiSdrProxyFailure } = options;

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const origin = request.headers.get("Origin") ?? "";
  if (!isAllowedOrigin(origin)) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }

  const secret = env.AI_SDR_CLIENT_ASSERTION_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "AI assistant unavailable" }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const timestamp = new Date().toISOString();
  const nonce = randomNonce();
  const path = upstreamPath;
  const payload = await buildHmacPayload({ timestamp, nonce, method: "POST", path, body });
  const signature = await hmacHex(payload, secret);

  let upstream: Response;
  try {
    upstream = await fetch(`${WORKER_BASE_URL}${upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "X-Ventora-Timestamp": timestamp,
        "X-Ventora-Nonce": nonce,
        "X-Ventora-Signature": signature,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    await notifyProxyFailure(reportFailure, error, {
      feature: "ai-sdr",
      upstreamPath,
      failureType: "network",
    });
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }

  if (upstream.status >= 500) {
    await notifyProxyFailure(
      reportFailure,
      new Error(`AI-SDR upstream returned ${upstream.status}`),
      {
        feature: "ai-sdr",
        upstreamPath,
        failureType: "upstream-status",
        status: String(upstream.status),
      },
    );
  }

  const responseHeaders = new Headers();
  const upstreamContentType = upstream.headers.get("Content-Type");
  if (upstreamContentType) {
    responseHeaders.set("Content-Type", upstreamContentType);
  }

  if (upstreamPath === "/v1/chat") {
    responseHeaders.set("Cache-Control", "no-store");
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
