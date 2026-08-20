import { buildAppUrl } from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import type { Bindings } from "../types";
import { renderEmailLayout, renderCtaButton } from "./email-layout";
import { captureBackgroundException } from "./sentry";

export interface PasswordResetEmailParams {
  env: Bindings;
  userEmail: string;
  userName: string;
  token: string;
  appUrl: string;
}

export function buildPasswordResetEmail(params: {
  userEmail: string;
  userName: string;
  resetUrl: string;
  marketingUrl?: string;
}): { subject: string; html: string; text: string } {
  const { userName, resetUrl, marketingUrl } = params;
  const displayName = userName.trim() || "there";

  const subject = "Reset your GrantPipe password";

  const body = `<p style="margin: 0 0 16px;">Hi ${escapeHtml(displayName)},</p>
<p style="margin: 0 0 24px;">Use the link below to choose a new password for your GrantPipe account. This link expires in 1 hour.</p>
${renderCtaButton(resetUrl, "Reset password")}
<p style="margin: 0; color: #475569; font-size: 14px;">If you did not request a password reset, you can ignore this email. Your password will not change.</p>`;

  const html = renderEmailLayout({ body, marketingUrl });

  const text = [
    `Hi ${displayName},`,
    "",
    "Use the link below to choose a new password for your GrantPipe account.",
    "This link expires in 1 hour.",
    "",
    resetUrl,
    "",
    "If you did not request a password reset, you can ignore this email.",
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendPasswordResetEmail(params: PasswordResetEmailParams): Promise<void> {
  const { env, userEmail, userName, token, appUrl } = params;

  const resetUrl = buildAppUrl(appUrl, `/reset-password?token=${encodeURIComponent(token)}`);
  const { subject, html, text } = buildPasswordResetEmail({
    userEmail,
    userName,
    resetUrl,
    marketingUrl: env.MARKETING_URL,
  });

  if (!env.RESEND_API_KEY) {
    const error = new Error("Password reset email is not configured");
    captureBackgroundException(error, "auth", {
      step: "password_reset_email_config",
    });
    throw error;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: marketingKnowledge.contact.transactionalSender,
      to: [userEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send password reset email: ${response.status}`);
  }
}
