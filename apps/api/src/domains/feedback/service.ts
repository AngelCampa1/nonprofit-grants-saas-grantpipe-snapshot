import type { Database } from "@grantpipe/db";
import type { SubmitFeedbackInput } from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { internalError } from "../../lib/app-error";
import { recordActivityLogBestEffort } from "../../lib/activity-log";
import { renderEmailBrandHeader } from "../../lib/email-brand";
import type { Bindings } from "../../types";

export interface FeedbackContext {
  orgId?: string;
  orgName?: string;
  planTier?: string;
  userId?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateForSubject(message: string, maxLength = 60): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}…`;
}

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

function buildEmail(
  input: SubmitFeedbackInput,
  context?: FeedbackContext,
  marketingUrl?: string,
): BuiltEmail {
  const subject = `[GrantPipe Feedback · ${input.category}] ${truncateForSubject(input.message)}`;

  const lines: Array<[string, string]> = [];
  if (input.reporterEmail) lines.push(["Reporter email", input.reporterEmail]);
  if (input.reporterName) lines.push(["Reporter name", input.reporterName]);
  if (context?.orgName) lines.push(["Organization", context.orgName]);
  if (context?.orgId) lines.push(["Organization ID", context.orgId]);
  if (context?.planTier) lines.push(["Plan tier", context.planTier]);
  if (context?.userId) lines.push(["User ID", context.userId]);
  if (input.pageUrl) lines.push(["Page URL", input.pageUrl]);
  if (input.userAgent) lines.push(["User agent", input.userAgent]);
  lines.push(["Category", input.category]);

  const text = [...lines.map(([k, v]) => `${k}: ${v}`), "", "Message:", input.message].join("\n");

  const htmlRows = lines
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#64748b;font-weight:600;">${escapeHtml(k)}</td><td style="padding:4px 0;color:#0f172a;">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
${renderEmailBrandHeader(marketingUrl)}
<h2 style="margin:0 0 12px;">New GrantPipe feedback</h2>
<table style="border-collapse:collapse;margin-bottom:16px;">${htmlRows}</table>
<h3 style="margin:16px 0 8px;">Message</h3>
<div style="white-space:pre-wrap;padding:12px;background:#f1f5f9;border-radius:8px;border:1px solid #e2e8f0;">${escapeHtml(input.message)}</div>
</body></html>`;

  return { subject, html, text };
}

export async function sendFeedbackEmail(
  bindings: Bindings,
  input: SubmitFeedbackInput,
  context?: FeedbackContext,
  db?: Database,
): Promise<void> {
  if (!bindings.RESEND_API_KEY || bindings.RESEND_API_KEY.length === 0) {
    throw internalError("RESEND_API_KEY is not configured");
  }
  if (!bindings.FEEDBACK_RECIPIENT_EMAIL || bindings.FEEDBACK_RECIPIENT_EMAIL.length === 0) {
    throw internalError("FEEDBACK_RECIPIENT_EMAIL is not configured");
  }

  const { subject, html, text } = buildEmail(input, context, bindings.MARKETING_URL);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bindings.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: marketingKnowledge.contact.feedbackSender,
      to: [bindings.FEEDBACK_RECIPIENT_EMAIL],
      reply_to: input.reporterEmail || undefined,
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    throw internalError("Failed to send feedback email");
  }

  if (db && context?.orgId && context?.userId) {
    await recordActivityLogBestEffort(db, {
      orgId: context.orgId,
      actorId: context.userId,
      action: "feedback.submitted",
      entityType: "feedback",
      entityId: crypto.randomUUID(),
      changes: { category: input.category },
    });
  }
}
