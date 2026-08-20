import { and, eq, isNull } from "drizzle-orm";
import { orgMembers, user as userTable } from "@grantpipe/db";
import type { TransactionDatabase } from "@grantpipe/db";
import { buildAppUrl } from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { renderEmailLayout, renderCtaButton } from "../../lib/email-layout";

export interface OrgEmailCtx {
  id: string;
  name: string;
}

export interface SendTrialEndingEmailParams {
  resendApiKey: string;
  /** The organization this email is for — used to greet by name. */
  org: OrgEmailCtx;
  /** Where to send it — typically the admin's email. */
  toEmail: string;
  /** Base URL of the web app (e.g. https://app.grantpipe.com) — billing portal link. */
  appUrl: string;
  /** Base URL of the marketing site, used for email-safe brand assets. */
  marketingUrl?: string;
}

export interface EmailResult {
  ok: boolean;
  error?: string;
}

export type OrgAdminRecipient = {
  userId: string;
  email: string | null;
};

export async function findOrgAdminRecipient(
  db: TransactionDatabase,
  orgId: string,
): Promise<OrgAdminRecipient | null> {
  const row = await db
    .select({ userId: orgMembers.userId, email: userTable.email })
    .from(orgMembers)
    .innerJoin(userTable, eq(orgMembers.userId, userTable.id))
    .where(
      and(eq(orgMembers.orgId, orgId), eq(orgMembers.role, "admin"), isNull(orgMembers.deletedAt)),
    )
    .orderBy(orgMembers.joinedAt, orgMembers.userId)
    .limit(1);
  const first = row[0];
  if (!first) return null;
  return {
    userId: first.userId,
    email: typeof first.email === "string" && first.email.length > 0 ? first.email : null,
  };
}

/**
 * Finds the email of the earliest-joined active admin member of an org.
 * Returns null when the org has no admin member or that member has no
 * email on record. The query is deterministic (orders by joinedAt asc)
 * so repeat calls resolve the same admin even if multiple exist.
 */
export async function findOrgAdminEmail(
  db: TransactionDatabase,
  orgId: string,
): Promise<string | null> {
  return (await findOrgAdminRecipient(db, orgId))?.email ?? null;
}

/**
 * Sends the "trial ends in 3 days" transactional email via Resend.
 * Returns {ok:false, error} on failure rather than throwing so the
 * webhook handler can log and continue without breaking the txn.
 */
export async function sendTrialEndingEmail(
  params: SendTrialEndingEmailParams,
): Promise<EmailResult> {
  const subject = "Your GrantPipe trial ends in 3 days";
  const billingUrl = buildAppUrl(params.appUrl, "/settings/billing");
  const orgName = escapeHtml(params.org.name);

  const body = `<p>Hello ${orgName} team,</p>
<p>
  Your GrantPipe free trial ends in <strong>3 days</strong>. At the end of
  the trial, your account will lock unless you choose a plan or add billing
  details.
</p>
<p>
  If you'd like to choose a plan, add billing details, or cancel before the
  trial ends, visit your billing settings:
</p>
${renderCtaButton(billingUrl, "Manage billing")}
<p>Thanks for giving GrantPipe a try,<br/>Angel Campa, founder</p>`;

  const html = renderEmailLayout({ body, marketingUrl: params.marketingUrl });
  const text = `Hello ${params.org.name} team,

Your GrantPipe free trial ends in 3 days. At the end of the trial, your account will lock unless you choose a plan or add billing details.

Manage billing: ${billingUrl}

Thanks for giving GrantPipe a try,
Angel Campa, founder`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: marketingKnowledge.contact.transactionalSender,
      to: [params.toEmail],
      subject,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return { ok: false, error: `resend_status_${response.status}:${body}` };
  }
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
