import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { renderEmailBrandHeader } from "../../lib/email-brand";
import { escapeEmailHtmlText, sanitizeEmailHref } from "../../lib/email-layout";

const FROM_ADDRESS = marketingKnowledge.contact.transactionalSender;

export interface SendReviewerInviteEmailParams {
  to: string;
  reviewerName: string;
  inviterName: string;
  orgName: string;
  purpose: string;
  portalUrl: string;
  expiresAt: Date;
  resendKey: string;
  idempotencyKey?: string;
}

export interface SendSessionExtendedEmailParams {
  to: string;
  reviewerName: string;
  orgName: string;
  purpose: string;
  newExpiresAt: Date;
  portalUrl: string;
  resendKey: string;
  idempotencyKey?: string;
}

export interface SendSessionRevokedEmailParams {
  to: string;
  reviewerName: string;
  orgName: string;
  purpose: string;
  resendKey: string;
}

/**
 * Formats a Date as a human-readable string: "May 15, 2026 at 3:00 PM UTC".
 */
function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

/**
 * Sends a portal invitation email to an external reviewer via Resend.
 *
 * Includes the portal access link, session purpose, inviter name, and expiry.
 */
export type ReviewerInviteEmailRequestPayload = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
};

export function buildReviewerInviteEmailRequest(
  params: Omit<SendReviewerInviteEmailParams, "resendKey" | "idempotencyKey">,
): ReviewerInviteEmailRequestPayload {
  const { to, reviewerName, inviterName, orgName, purpose, portalUrl, expiresAt } = params;

  const formattedExpiry = formatDate(expiresAt);
  const subject = `${inviterName} has invited you to review materials from ${orgName}`;
  const safeReviewerName = escapeEmailHtmlText(reviewerName);
  const safeInviterName = escapeEmailHtmlText(inviterName);
  const safeOrgName = escapeEmailHtmlText(orgName);
  const safePurpose = escapeEmailHtmlText(purpose);
  const safePortalUrl = sanitizeEmailHref(portalUrl);
  const safeFormattedExpiry = escapeEmailHtmlText(formattedExpiry);
  const safeSubject = escapeEmailHtmlText(subject);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${safeSubject}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  ${renderEmailBrandHeader()}
  <h1 style="font-size:20px;font-weight:600;margin-bottom:16px">You've been invited to review materials</h1>
  <p>Hi ${safeReviewerName},</p>
  <p>${safeInviterName} from <strong>${safeOrgName}</strong> has invited you to access a secure review portal.</p>
  <p><strong>Purpose:</strong> ${safePurpose}</p>
  <p>Your access link expires on <strong>${safeFormattedExpiry}</strong>. Use it to view the materials shared with you.</p>
  <p style="margin:24px 0">
    <a href="${safePortalUrl}" data-cta="true" style="background:#059669;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Open review portal</a>
  </p>
  <p style="color:#666;font-size:14px">If the button above does not work, copy and paste this link into your browser:</p>
  <p style="word-break:break-all;font-size:14px;color:#666">${safePortalUrl}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:12px">This invitation was sent by ${safeOrgName} via GrantPipe. If you did not expect this email, you may ignore it.</p>
</body>
</html>`;

  const text = `You've been invited to review materials

Hi ${reviewerName},

${inviterName} from ${orgName} has invited you to access a secure review portal.

Purpose: ${purpose}

Your access link expires on ${formattedExpiry}.

Access the portal here:
${portalUrl}

This invitation was sent by ${orgName} via GrantPipe. If you did not expect this email, you may ignore it.`;

  return {
    from: FROM_ADDRESS,
    to: [to],
    subject,
    html,
    text,
  };
}

export async function sendReviewerInviteEmail(
  params: SendReviewerInviteEmailParams,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendKey}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
    },
    body: JSON.stringify(buildReviewerInviteEmailRequest(params)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${body}`);
  }
}

/**
 * Sends a session-extended notification email to an external reviewer via Resend.
 *
 * Informs the reviewer that their portal access has been extended with the new expiry.
 */
export function buildSessionExtendedEmailRequest(
  params: Omit<SendSessionExtendedEmailParams, "resendKey" | "idempotencyKey">,
): ReviewerInviteEmailRequestPayload {
  const { to, reviewerName, orgName, purpose, newExpiresAt, portalUrl } = params;

  const formattedExpiry = formatDate(newExpiresAt);
  const subject = `Your review portal access has been extended — ${orgName}`;
  const safeReviewerName = escapeEmailHtmlText(reviewerName);
  const safeOrgName = escapeEmailHtmlText(orgName);
  const safePurpose = escapeEmailHtmlText(purpose);
  const safePortalUrl = sanitizeEmailHref(portalUrl);
  const safeFormattedExpiry = escapeEmailHtmlText(formattedExpiry);
  const safeSubject = escapeEmailHtmlText(subject);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${safeSubject}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  ${renderEmailBrandHeader()}
  <h1 style="font-size:20px;font-weight:600;margin-bottom:16px">Your portal access has been extended</h1>
  <p>Hi ${safeReviewerName},</p>
  <p>Your access to the <strong>${safeOrgName}</strong> review portal has been extended.</p>
  <p><strong>Purpose:</strong> ${safePurpose}</p>
  <p>Your access is now valid until <strong>${safeFormattedExpiry}</strong>.</p>
  <p style="margin:24px 0">
    <a href="${safePortalUrl}" data-cta="true" style="background:#059669;color:#fff;padding:12px 24px;border-radius:9999px;text-decoration:none;font-weight:600">Open review portal</a>
  </p>
  <p style="color:#666;font-size:14px">If the button above does not work, copy and paste this link into your browser:</p>
  <p style="word-break:break-all;font-size:14px;color:#666">${safePortalUrl}</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:12px">This message was sent by ${safeOrgName} via GrantPipe.</p>
</body>
</html>`;

  const text = `Your portal access has been extended

Hi ${reviewerName},

Your access to the ${orgName} review portal has been extended.

Purpose: ${purpose}

Your access is now valid until ${formattedExpiry}.

Access the portal here:
${portalUrl}

This message was sent by ${orgName} via GrantPipe.`;

  return { from: FROM_ADDRESS, to: [to], subject, html, text };
}

export async function sendSessionExtendedEmail(
  params: SendSessionExtendedEmailParams,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendKey}`,
      "Content-Type": "application/json",
      ...(params.idempotencyKey ? { "Idempotency-Key": params.idempotencyKey } : {}),
    },
    body: JSON.stringify(buildSessionExtendedEmailRequest(params)),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${body}`);
  }
}

/**
 * Sends a session-revoked notification email to an external reviewer via Resend.
 *
 * Informs the reviewer that their portal access has been revoked.
 */
export async function sendSessionRevokedEmail(
  params: SendSessionRevokedEmailParams,
): Promise<void> {
  const { to, reviewerName, orgName, purpose, resendKey } = params;

  const subject = `Your review portal access has been revoked — ${orgName}`;
  const safeReviewerName = escapeEmailHtmlText(reviewerName);
  const safeOrgName = escapeEmailHtmlText(orgName);
  const safePurpose = escapeEmailHtmlText(purpose);
  const safeSubject = escapeEmailHtmlText(subject);

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${safeSubject}</title></head>
<body style="font-family:sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:24px">
  ${renderEmailBrandHeader()}
  <h1 style="font-size:20px;font-weight:600;margin-bottom:16px">Your portal access has been revoked</h1>
  <p>Hi ${safeReviewerName},</p>
  <p>Your access to the <strong>${safeOrgName}</strong> review portal has been revoked.</p>
  <p><strong>Purpose:</strong> ${safePurpose}</p>
  <p>Your portal link is no longer active. If you believe this is an error, please contact the organization directly.</p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
  <p style="color:#999;font-size:12px">This message was sent by ${safeOrgName} via GrantPipe.</p>
</body>
</html>`;

  const text = `Your portal access has been revoked

Hi ${reviewerName},

Your access to the ${orgName} review portal has been revoked.

Purpose: ${purpose}

Your portal link is no longer active. If you believe this is an error, please contact the organization directly.

This message was sent by ${orgName} via GrantPipe.`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend returned ${response.status}: ${body}`);
  }
}
