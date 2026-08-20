import type { Bindings } from "../../types";
import { resolveLeadMagnetSequence } from "@grantpipe/shared";
import { hmacSha256Hex } from "../../lib/hmac";

const PRODUCT_ID = "grantpipe";

export class SequencerResponseError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SequencerResponseError";
  }
}

export class SequencerConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SequencerConfigurationError";
  }
}

type SequencerContactResponse = {
  id?: string;
  contact?: {
    id?: string;
  };
};

export type SequencerLeadInput = {
  email: string;
  firstName?: string | null;
  magnetSlug: string;
  sourcePage?: string | null;
  idempotencyKey?: string;
};

export type SequencerLifecycleInput = {
  email: string;
  event: string;
  idempotencyKey: string;
  properties?: Record<string, unknown>;
};

export function isSequencerConfigured(bindings: Bindings): boolean {
  return Boolean(
    bindings.SEQUENCER_BASE_URL &&
    ((bindings.SEQUENCER_CF_ACCESS_CLIENT_ID && bindings.SEQUENCER_CF_ACCESS_CLIENT_SECRET) ||
      bindings.SEQUENCER_CLIENT_SECRET),
  );
}

function normalizeSecretHeader(value: string | undefined): string {
  return value?.replace(/^\uFEFF/, "").trim() ?? "";
}

function sequencerHeaders(bindings: Bindings): Record<string, string> {
  if (bindings.SEQUENCER_CLIENT_SECRET) {
    return {
      "Content-Type": "application/json",
      "X-Sequencer-Product": PRODUCT_ID,
      "X-Sequencer-Client-Secret": bindings.SEQUENCER_CLIENT_SECRET,
    };
  }

  return {
    "Content-Type": "application/json",
    "CF-Access-Client-Id": normalizeSecretHeader(bindings.SEQUENCER_CF_ACCESS_CLIENT_ID),
    "CF-Access-Client-Secret": normalizeSecretHeader(bindings.SEQUENCER_CF_ACCESS_CLIENT_SECRET),
  };
}

type SequencerRequestDescriptor = {
  url: string;
  init: {
    method: "POST";
    redirect: "manual";
    headers: Record<string, string>;
    body: string;
  };
};

function sequencerUrl(bindings: Bindings, path: string): string {
  const baseUrl = bindings.SEQUENCER_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) throw new Error("SEQUENCER_BASE_URL is required");
  const apiPath = bindings.SEQUENCER_CLIENT_SECRET
    ? path.replace(/^\/api\/v1/, "/api/client/v1")
    : path;
  return `${baseUrl}${apiPath}`;
}

function buildSequencerRequest(
  bindings: Bindings,
  path: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): SequencerRequestDescriptor {
  return {
    url: sequencerUrl(bindings, path),
    init: {
      method: "POST",
      redirect: "manual",
      headers: { ...sequencerHeaders(bindings), ...headers },
      body: JSON.stringify(body),
    },
  };
}

function buildLeadNurtureRequestPlan(
  bindings: Bindings,
  input: SequencerLeadInput,
  contactId: string,
): { contact: SequencerRequestDescriptor; enrollment: SequencerRequestDescriptor } {
  const sequence = resolveLeadMagnetSequence(input.magnetSlug);
  const sharedProperties = {
    magnetSlug: input.magnetSlug,
    sourcePage: input.sourcePage ?? undefined,
    sequenceFamily: sequence.family,
    buyerStage: sequence.buyerStage,
    topicCluster: sequence.topicCluster,
    expectedSequenceSlug: sequence.sequenceSlug,
    cadence: sequence.cadence,
    nextStepGoal: sequence.nextStepGoal,
    stopCondition: sequence.stopCondition,
  };
  return {
    contact: buildSequencerRequest(bindings, "/api/v1/contacts", {
      product: PRODUCT_ID,
      email: input.email,
      first_name: input.firstName ?? undefined,
      properties: sharedProperties,
    }),
    enrollment: buildSequencerRequest(
      bindings,
      "/api/v1/enrollments",
      {
        product: PRODUCT_ID,
        email: input.email,
        sequence_slug: sequence.enrollmentSequenceSlug,
        source: `lead_magnet:${input.magnetSlug}`,
        properties: {
          contactId,
          ...sharedProperties,
          firstFollowUpAngle: sequence.firstFollowUpAngle,
        },
      },
      input.idempotencyKey ? { "Idempotency-Key": input.idempotencyKey } : {},
    ),
  };
}

export async function createLeadNurtureRequestFingerprint(
  bindings: Bindings,
  input: SequencerLeadInput,
): Promise<string> {
  const plan = buildLeadNurtureRequestPlan(bindings, input, "<provider-contact-id>");
  return hmacSha256Hex(
    bindings.BETTER_AUTH_SECRET,
    JSON.stringify(canonicalSequencerRequestIdentity(plan.contact)),
  );
}

export async function createLeadNurtureEnrollmentRequestFingerprint(
  bindings: Bindings,
  input: SequencerLeadInput,
  contactId: string,
): Promise<string> {
  return hmacSha256Hex(
    bindings.BETTER_AUTH_SECRET,
    JSON.stringify(
      canonicalSequencerRequestIdentity(
        buildLeadNurtureRequestPlan(bindings, input, contactId).enrollment,
      ),
    ),
  );
}

function canonicalSequencerRequestIdentity(request: SequencerRequestDescriptor) {
  return {
    method: request.init.method,
    url: request.url,
    body: request.init.body,
    contentType: request.init.headers["Content-Type"],
    idempotencyKey: request.init.headers["Idempotency-Key"] ?? null,
  };
}

async function sequencerFetch(
  bindings: Bindings,
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit },
): Promise<Response> {
  return fetch(sequencerUrl(bindings, path), {
    ...init,
    // Do not follow redirects: an unauthenticated request to the Sequencer
    // hostname is 302'd by Cloudflare Access to its login page (HTML, 200).
    // Following it would let an auth challenge masquerade as a success.
    redirect: "manual",
    headers: {
      ...sequencerHeaders(bindings),
      ...(init.headers ?? {}),
    },
  });
}

async function assertOk(response: Response, action: string): Promise<void> {
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("Location") ?? "";
    throw new SequencerResponseError(
      response.status,
      `Sequencer ${action} was redirected (${response.status}) to "${location}". ` +
        "This usually means the Cloudflare Access service token is invalid or expired.",
    );
  }
  if (response.ok) {
    return;
  }
  const body = await response.text().catch(() => "");
  throw new SequencerResponseError(
    response.status,
    `Sequencer ${action} failed with ${response.status}: ${body}`,
  );
}

async function parseSequencerJson<T>(response: Response, action: string): Promise<T> {
  const body = await response.text().catch(() => "");
  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get("Content-Type") ?? "unknown";
    const snippet = body.slice(0, 200);
    throw new Error(
      `Sequencer ${action} returned a non-JSON response ` +
        `(status ${response.status}, content-type ${contentType}): ${snippet}`,
    );
  }
}

export async function upsertLeadNurtureContact(
  bindings: Bindings,
  input: SequencerLeadInput,
): Promise<string> {
  const initialPlan = buildLeadNurtureRequestPlan(bindings, input, "<provider-contact-id>");
  const contactResponse = await fetch(initialPlan.contact.url, initialPlan.contact.init);
  await assertOk(contactResponse, "contact upsert");

  const contactPayload = await parseSequencerJson<SequencerContactResponse>(
    contactResponse,
    "contact upsert",
  );
  const contactId = contactPayload.id ?? contactPayload.contact?.id;
  if (!contactId) {
    throw new Error("Sequencer contact upsert did not return id");
  }
  return contactId;
}

export async function enrollLeadNurtureContact(
  bindings: Bindings,
  input: SequencerLeadInput,
  contactId: string,
): Promise<void> {
  const enrollment = buildLeadNurtureRequestPlan(bindings, input, contactId).enrollment;
  const enrollmentResponse = await fetch(enrollment.url, enrollment.init);
  await assertOk(enrollmentResponse, "enrollment");
}

export async function enrollLeadNurture(
  bindings: Bindings,
  input: SequencerLeadInput,
): Promise<void> {
  const contactId = await upsertLeadNurtureContact(bindings, input);
  await enrollLeadNurtureContact(bindings, input, contactId);
}

export async function unsubscribeLeadNurture(
  bindings: Bindings,
  input: { email: string },
): Promise<void> {
  const response = await sequencerFetch(bindings, "/api/v1/unsubscribe", {
    method: "POST",
    body: JSON.stringify({
      product: PRODUCT_ID,
      email: input.email,
      scope: "product",
    }),
  });
  await assertOk(response, "unsubscribe");
}

export async function recordSignupCompleted(
  bindings: Bindings,
  input: {
    email: string;
    userId: string;
    orgId: string;
    source?: string;
  },
): Promise<void> {
  const response = await sequencerFetch(bindings, "/api/v1/events", {
    method: "POST",
    headers: {
      "Idempotency-Key": `signup_completed:${PRODUCT_ID}:user:${input.userId}`,
    },
    body: JSON.stringify({
      product: PRODUCT_ID,
      email: input.email,
      event: "signup_completed",
      properties: {
        userId: input.userId,
        orgId: input.orgId,
        source: input.source ?? "better_auth",
      },
    }),
  });
  await assertOk(response, "signup event");
}

export async function recordLifecycleEvent(
  bindings: Bindings,
  input: SequencerLifecycleInput,
): Promise<void> {
  const response = await sequencerFetch(bindings, "/api/v1/events", {
    method: "POST",
    headers: {
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      product: PRODUCT_ID,
      email: input.email,
      event: input.event,
      properties: input.properties ?? {},
    }),
  });
  await assertOk(response, `${input.event} event`);
}
