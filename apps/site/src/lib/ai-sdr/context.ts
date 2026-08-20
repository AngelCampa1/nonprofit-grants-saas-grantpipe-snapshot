import {
  buildGrantPipeAiSdrProductContext,
  GRANTPIPE_AI_SDR_PRODUCT_ID,
} from "@grantpipe/shared/public-kb";
import { buildHmacPayload, hmacHex, randomNonce, verifyHmacSignature } from "./signing.js";

export interface ContextEnv {
  AI_SDR_CONTEXT_SECRET?: string;
}

export async function handleAiSdrContext(options: {
  request: Request;
  env: ContextEnv;
}): Promise<Response> {
  const { request, env } = options;

  const productId = new URL(request.url).searchParams.get("productId");
  if (productId !== GRANTPIPE_AI_SDR_PRODUCT_ID) {
    return Response.json({ error: "Unknown product" }, { status: 404 });
  }

  const secret = env.AI_SDR_CONTEXT_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "Product context unavailable" }, { status: 503 });
  }

  const timestamp = request.headers.get("X-Ventora-Timestamp");
  const nonce = request.headers.get("X-Ventora-Nonce");
  const signature = request.headers.get("X-Ventora-Signature");

  if (!timestamp || !nonce || !signature) {
    return Response.json({ error: "Missing signature" }, { status: 401 });
  }

  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;

  const requestPayload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId },
  });

  const valid = await verifyHmacSignature({
    payload: requestPayload,
    signature,
    secret,
    timestamp,
  });

  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const body = buildGrantPipeAiSdrProductContext();

  const responseTimestamp = new Date().toISOString();
  const responseNonce = randomNonce();
  const responsePayload = await buildHmacPayload({
    timestamp: responseTimestamp,
    nonce: responseNonce,
    method: "GET",
    path,
    body,
  });

  const responseSig = await hmacHex(responsePayload, secret);

  return Response.json(body, {
    status: 200,
    headers: {
      "Cache-Control": "private, max-age=300",
      "X-Ventora-Timestamp": responseTimestamp,
      "X-Ventora-Nonce": responseNonce,
      "X-Ventora-Signature": responseSig,
    },
  });
}
