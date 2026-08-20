import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { createAiSdrProxyFailureReporter, handleAiSdrProxy } from "../../../../lib/ai-sdr/proxy.js";

export const prerender = false;

export const POST: APIRoute = ({ request }) =>
  handleAiSdrProxy({
    request,
    env,
    upstreamPath: "/v1/sessions",
    reportFailure: createAiSdrProxyFailureReporter(env),
  });
