import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { handleAiSdrContext } from "../../../lib/ai-sdr/context.js";

export const prerender = false;

export const GET: APIRoute = ({ request }) =>
  handleAiSdrContext({
    request,
    env,
  });
