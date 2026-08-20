import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import type { LeadMagnetSlug } from "@grantpipe/shared";
import type { Bindings } from "../../types";
import { hmacSha256Hex, signUnsubscribeToken } from "../../lib/hmac";
import { signDownloadToken } from "../../lib/r2";
import { makeDeliveryStep, magnetTitle } from "./nurture-copy";

export { signUnsubscribeToken, verifyUnsubscribeToken } from "../../lib/hmac";

export class NurtureEmailConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NurtureEmailConfigurationError";
  }
}

export function isNurtureEmailConfigured(bindings: Bindings): boolean {
  return Boolean(bindings.RESEND_API_KEY?.trim());
}

export function buildUnsubscribeUrl(bindings: Bindings, token: string): string {
  const base = bindings.MARKETING_URL ?? marketingKnowledge.brand.siteUrl;
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

export async function buildDownloadUrl(
  leadId: string,
  magnetSlug: string | null | undefined,
  bindings: Bindings,
  expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000,
): Promise<string> {
  const secret = bindings.DOWNLOAD_LINK_SECRET ?? bindings.BETTER_AUTH_SECRET;
  const slug = magnetSlug ?? "resource";
  const token = await signDownloadToken(leadId, slug, expiresAt, secret);
  const appUrl = bindings.APP_URL ?? marketingKnowledge.brand.appUrl;
  return `${appUrl}/api/public/downloads/${token}`;
}

export interface SendNurtureEmailParams {
  leadId: string;
  email: string;
  firstName?: string | null;
  step: number;
  magnetSlug?: string | null;
  downloadUrl?: string;
  idempotencyKey?: string;
}

type NurtureEmailRequest = {
  url: string;
  init: {
    method: "POST";
    headers: Record<string, string>;
    body: string;
  };
};

async function buildNurtureEmailRequest(
  bindings: Bindings,
  params: SendNurtureEmailParams,
): Promise<NurtureEmailRequest> {
  if (params.step !== 0) {
    throw new Error(`Invalid local delivery step: ${params.step}`);
  }

  const secret = bindings.LEAD_UNSUBSCRIBE_SECRET ?? bindings.BETTER_AUTH_SECRET;
  const token = await signUnsubscribeToken(params.leadId, secret);
  const unsubscribeUrl = buildUnsubscribeUrl(bindings, token);
  const appUrl = bindings.APP_URL ?? marketingKnowledge.brand.appUrl;
  const marketingUrl = bindings.MARKETING_URL ?? marketingKnowledge.brand.siteUrl;
  const title = magnetTitle(params.magnetSlug);
  const deliveryStep = makeDeliveryStep(
    title,
    params.magnetSlug as LeadMagnetSlug | null | undefined,
  );
  const downloadUrl =
    params.downloadUrl ?? (await buildDownloadUrl(params.leadId, params.magnetSlug, bindings));

  return {
    url: "https://api.resend.com/emails",
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bindings.RESEND_API_KEY ?? ""}`,
        "Content-Type": "application/json",
        ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: marketingKnowledge.contact.transactionalSender,
        to: [params.email],
        subject: `Your ${title} from GrantPipe`,
        html: deliveryStep.html(appUrl, unsubscribeUrl, downloadUrl, marketingUrl),
        text: deliveryStep.text(appUrl, unsubscribeUrl, downloadUrl),
        headers: {
          "List-Unsubscribe": `<${unsubscribeUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    },
  };
}

export async function createNurtureEmailRequestFingerprint(
  bindings: Bindings,
  params: SendNurtureEmailParams,
): Promise<string> {
  const request = await buildNurtureEmailRequest(bindings, params);
  return hmacSha256Hex(
    bindings.BETTER_AUTH_SECRET,
    JSON.stringify({
      method: request.init.method,
      url: request.url,
      body: request.init.body,
      contentType: request.init.headers["Content-Type"],
      idempotencyKey: request.init.headers["Idempotency-Key"] ?? null,
    }),
  );
}

export async function sendNurtureEmail(
  bindings: Bindings,
  params: SendNurtureEmailParams,
): Promise<void> {
  if (!isNurtureEmailConfigured(bindings)) {
    throw new NurtureEmailConfigurationError(
      "RESEND_API_KEY is required for nurture email delivery",
    );
  }
  const request = await buildNurtureEmailRequest(bindings, params);
  const response = await fetch(request.url, request.init);

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${body}`);
  }
}
