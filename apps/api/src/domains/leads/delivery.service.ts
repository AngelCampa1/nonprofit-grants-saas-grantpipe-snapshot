import type { Bindings, D1DatabaseBinding } from "../../types";
import { captureBackgroundException } from "../../lib/sentry";
import {
  buildDownloadUrl,
  createNurtureEmailRequestFingerprint,
  isNurtureEmailConfigured,
  NurtureEmailConfigurationError,
  sendNurtureEmail,
} from "./emails";
import {
  createLeadNurtureEnrollmentRequestFingerprint,
  createLeadNurtureRequestFingerprint,
  enrollLeadNurtureContact,
  isSequencerConfigured,
  SequencerConfigurationError,
  SequencerResponseError,
  unsubscribeLeadNurture,
  upsertLeadNurtureContact,
} from "./sequencer";
import { runSettledWithConcurrency } from "../../lib/bounded-concurrency";

export type LeadDeliveryIntent = {
  downloadId: string;
  leadId: string;
  email: string;
  firstName: string | null;
  magnetSlug: string;
  sourcePage: string | null;
  emailAttempt: number;
  emailAttemptStartedAt: string | null;
  emailClaimedAt: string;
  sequencerAttempt: number;
  sequencerClaimedAt: string;
  emailOnly: boolean;
  emailPending: boolean;
  sequencerPending: boolean;
  emailRequestFingerprint: string | null;
  sequencerRequestFingerprint: string | null;
  sequencerContactId: string | null;
  sequencerEnrollmentRequestFingerprint: string | null;
};

export type LeadEmailResendResult = "opened" | "in_progress" | "ambiguous" | "unavailable";

export interface LeadDeliveryStore {
  claim(downloadId: string, options?: { emailOnly?: boolean }): Promise<LeadDeliveryIntent | null>;
  isEligible(downloadId: string): Promise<boolean>;
  suppress(downloadId: string): Promise<void>;
  authorizeEmailSend(
    downloadId: string,
    attempt: number,
    claimedAt: string,
  ): Promise<string | null>;
  markEmailSent(downloadId: string, attempt: number, claimedAt: string): Promise<boolean>;
  markEmailUnavailable(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markEmailRetryable(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markEmailAmbiguous(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markEmailQuarantined(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  saveEmailRequestFingerprint(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    fingerprint: string,
  ): Promise<boolean>;
  requestEmailResend(downloadId: string): Promise<LeadEmailResendResult>;
  authorizeSequencerSend(
    downloadId: string,
    attempt: number,
    claimedAt: string,
  ): Promise<string | null>;
  confirmSequencerSend(downloadId: string, attempt: number, claimedAt: string): Promise<boolean>;
  markSequencerSent(downloadId: string, attempt: number, claimedAt: string): Promise<boolean>;
  markSequencerUnavailable(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markSequencerRetryable(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markSequencerAmbiguous(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  markSequencerQuarantined(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    error: string,
  ): Promise<boolean>;
  saveSequencerRequestFingerprint(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    fingerprint: string,
  ): Promise<boolean>;
  saveSequencerEnrollmentRequest(
    downloadId: string,
    attempt: number,
    claimedAt: string,
    contactId: string,
    fingerprint: string,
  ): Promise<boolean>;
}

function safeError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error";
}

function isPermanentEmailRejection(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const match = /^Resend returned (\d{3}):/.exec(error.message);
  if (!match) return false;
  const status = Number(match[1]);
  return status >= 400 && status < 500 && ![408, 425, 429].includes(status);
}

function isPermanentSequencerRejection(error: unknown): boolean {
  return (
    error instanceof SequencerResponseError &&
    error.status >= 400 &&
    error.status < 500 &&
    ![408, 425, 429].includes(error.status)
  );
}

function isTransientSequencerRejection(error: unknown): boolean {
  return (
    error instanceof SequencerConfigurationError ||
    (error instanceof SequencerResponseError && error.status >= 300 && error.status < 400)
  );
}

const DOWNLOAD_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_AUTOMATIC_DELIVERY_ATTEMPTS = 3;

async function ensureEligible(store: LeadDeliveryStore, downloadId: string): Promise<boolean> {
  try {
    if (await store.isEligible(downloadId)) return true;
    await recordDeliveryState(() => store.suppress(downloadId), "lead-magnet-suppression-state");
    return false;
  } catch (error) {
    captureBackgroundException(error, "leads", { step: "lead-magnet-delivery-eligibility" });
    return false;
  }
}

async function recordDeliveryState(operation: () => Promise<void>, step: string): Promise<void> {
  try {
    await operation();
  } catch {
    captureBackgroundException(new Error("Lead delivery state persistence failed"), "leads", {
      step,
    });
  }
}

async function ignoreChanged(operation: Promise<boolean>): Promise<void> {
  await operation;
}

function captureQuarantine(reason: string, step: string): void {
  captureBackgroundException(new Error(reason), "leads", { step });
}

async function compensateSequencerIfUnsubscribed(
  store: LeadDeliveryStore,
  bindings: Bindings,
  downloadId: string,
  email: string,
): Promise<void> {
  let eligible = false;
  try {
    eligible = await store.isEligible(downloadId);
  } catch {
    captureBackgroundException(new Error("Sequencer compensation eligibility failed"), "leads", {
      step: "lead-magnet-sequencer-compensation-eligibility",
    });
  }
  if (eligible) return;
  try {
    await unsubscribeLeadNurture(bindings, { email });
  } catch {
    captureBackgroundException(new Error("Sequencer compensation failed"), "leads", {
      step: "lead-magnet-sequencer-compensation",
    });
  }
}

async function fingerprintWriteSucceeded(operation: () => Promise<boolean>): Promise<boolean> {
  try {
    return await operation();
  } catch {
    return false;
  }
}

export async function dispatchLeadDelivery(
  store: LeadDeliveryStore,
  bindings: Bindings,
  downloadId: string,
  options: { emailOnly?: boolean } = {},
): Promise<void> {
  let intent: LeadDeliveryIntent | null;
  try {
    intent = await store.claim(downloadId, options);
  } catch (error) {
    captureBackgroundException(error, "leads", { step: "lead-magnet-delivery-claim" });
    return;
  }
  if (!intent) return;
  if (options.emailOnly || intent.emailOnly) {
    intent = { ...intent, sequencerPending: false };
  }
  if (!(await ensureEligible(store, downloadId))) return;

  if (intent.emailPending) {
    let emailProviderTouched = false;
    try {
      if (!isNurtureEmailConfigured(bindings)) {
        throw new NurtureEmailConfigurationError(
          "RESEND_API_KEY is required for nurture email delivery",
        );
      }
      const emailAttemptStartedAt = await store.authorizeEmailSend(
        downloadId,
        intent.emailAttempt,
        intent.emailClaimedAt,
      );
      if (!emailAttemptStartedAt) return;
      const downloadUrl = await buildDownloadUrl(
        intent.leadId,
        intent.magnetSlug,
        bindings,
        new Date(emailAttemptStartedAt).getTime() + DOWNLOAD_LINK_TTL_MS,
      );
      const params = {
        leadId: intent.leadId,
        email: intent.email,
        firstName: intent.firstName,
        step: 0,
        magnetSlug: intent.magnetSlug,
        downloadUrl,
        idempotencyKey: `lead-magnet/${downloadId}/${intent.emailAttempt}`,
      };
      const fingerprint = await createNurtureEmailRequestFingerprint(bindings, params);
      if (intent.emailRequestFingerprint && intent.emailRequestFingerprint !== fingerprint) {
        const reason = "Lead email request changed before retry";
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailQuarantined(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                reason,
              ),
            ),
          "lead-magnet-email-state",
        );
        captureQuarantine(reason, "lead-magnet-email-request-drift");
      } else if (
        !intent.emailRequestFingerprint &&
        !(await fingerprintWriteSucceeded(() =>
          store.saveEmailRequestFingerprint(
            downloadId,
            intent.emailAttempt,
            intent.emailClaimedAt,
            fingerprint,
          ),
        ))
      ) {
        const reason = "Lead email request fingerprint could not be persisted";
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailQuarantined(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                reason,
              ),
            ),
          "lead-magnet-email-state",
        );
        captureQuarantine(reason, "lead-magnet-email-fingerprint-persistence");
      } else {
        emailProviderTouched = true;
        await sendNurtureEmail(bindings, params);
        await store.markEmailSent(downloadId, intent.emailAttempt, intent.emailClaimedAt);
      }
    } catch (error) {
      const message = safeError(error);
      if (error instanceof NurtureEmailConfigurationError) {
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailUnavailable(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                message,
              ),
            ),
          "lead-magnet-email-state",
        );
      } else if (!emailProviderTouched) {
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailRetryable(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                message,
              ),
            ),
          "lead-magnet-email-state",
        );
      } else if (isPermanentEmailRejection(error)) {
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailQuarantined(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                message,
              ),
            ),
          "lead-magnet-email-state",
        );
      } else {
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markEmailAmbiguous(
                downloadId,
                intent.emailAttempt,
                intent.emailClaimedAt,
                message,
              ),
            ),
          "lead-magnet-email-state",
        );
      }
      captureBackgroundException(error, "leads", { step: "lead-magnet-email-delivery" });
    }
  }

  if (intent.sequencerPending) {
    if (!(await ensureEligible(store, downloadId))) return;
    let sequencerProviderTouched = false;
    try {
      if (!isSequencerConfigured(bindings)) {
        throw new SequencerConfigurationError("Sequencer is not configured");
      }
      if (
        !(await store.authorizeSequencerSend(
          downloadId,
          intent.sequencerAttempt,
          intent.sequencerClaimedAt,
        ))
      )
        return;
      const input = {
        email: intent.email,
        firstName: intent.firstName,
        magnetSlug: intent.magnetSlug,
        sourcePage: intent.sourcePage,
        idempotencyKey: `lead-magnet/${downloadId}/${intent.sequencerAttempt}`,
      };
      const fingerprint = await createLeadNurtureRequestFingerprint(bindings, input);
      if (
        intent.sequencerRequestFingerprint &&
        intent.sequencerRequestFingerprint !== fingerprint
      ) {
        const reason = "Lead Sequencer request changed before retry";
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markSequencerQuarantined(
                downloadId,
                intent.sequencerAttempt,
                intent.sequencerClaimedAt,
                reason,
              ),
            ),
          "lead-magnet-sequencer-state",
        );
        captureQuarantine(reason, "lead-magnet-sequencer-request-drift");
      } else if (
        !intent.sequencerRequestFingerprint &&
        !(await fingerprintWriteSucceeded(() =>
          store.saveSequencerRequestFingerprint(
            downloadId,
            intent.sequencerAttempt,
            intent.sequencerClaimedAt,
            fingerprint,
          ),
        ))
      ) {
        const reason = "Lead Sequencer request fingerprint could not be persisted";
        await recordDeliveryState(
          () =>
            ignoreChanged(
              store.markSequencerQuarantined(
                downloadId,
                intent.sequencerAttempt,
                intent.sequencerClaimedAt,
                reason,
              ),
            ),
          "lead-magnet-sequencer-state",
        );
        captureQuarantine(reason, "lead-magnet-sequencer-fingerprint-persistence");
      } else {
        sequencerProviderTouched = true;
        const contactId =
          intent.sequencerContactId ?? (await upsertLeadNurtureContact(bindings, input));
        const enrollmentFingerprint = await createLeadNurtureEnrollmentRequestFingerprint(
          bindings,
          input,
          contactId,
        );
        if (
          intent.sequencerEnrollmentRequestFingerprint &&
          intent.sequencerEnrollmentRequestFingerprint !== enrollmentFingerprint
        ) {
          const reason = "Lead Sequencer enrollment request changed before retry";
          await recordDeliveryState(
            () =>
              ignoreChanged(
                store.markSequencerQuarantined(
                  downloadId,
                  intent.sequencerAttempt,
                  intent.sequencerClaimedAt,
                  reason,
                ),
              ),
            "lead-magnet-sequencer-state",
          );
          captureQuarantine(reason, "lead-magnet-sequencer-enrollment-drift");
        } else if (
          !intent.sequencerEnrollmentRequestFingerprint &&
          !(await fingerprintWriteSucceeded(() =>
            store.saveSequencerEnrollmentRequest(
              downloadId,
              intent.sequencerAttempt,
              intent.sequencerClaimedAt,
              contactId,
              enrollmentFingerprint,
            ),
          ))
        ) {
          const reason = "Lead Sequencer enrollment request could not be persisted";
          await recordDeliveryState(
            () =>
              ignoreChanged(
                store.markSequencerQuarantined(
                  downloadId,
                  intent.sequencerAttempt,
                  intent.sequencerClaimedAt,
                  reason,
                ),
              ),
            "lead-magnet-sequencer-state",
          );
          captureQuarantine(reason, "lead-magnet-sequencer-enrollment-persistence");
          await compensateSequencerIfUnsubscribed(store, bindings, downloadId, intent.email);
        } else {
          if (
            !(await store.confirmSequencerSend(
              downloadId,
              intent.sequencerAttempt,
              intent.sequencerClaimedAt,
            ))
          ) {
            await compensateSequencerIfUnsubscribed(store, bindings, downloadId, intent.email);
            return;
          }
          await enrollLeadNurtureContact(bindings, input, contactId);
          sequencerProviderTouched = true;
          const recorded = await store.markSequencerSent(
            downloadId,
            intent.sequencerAttempt,
            intent.sequencerClaimedAt,
          );
          if (!recorded) {
            await compensateSequencerIfUnsubscribed(store, bindings, downloadId, intent.email);
          }
        }
      }
    } catch (error) {
      const message = safeError(error);
      await recordDeliveryState(
        () =>
          error instanceof SequencerConfigurationError
            ? ignoreChanged(
                store.markSequencerUnavailable(
                  downloadId,
                  intent.sequencerAttempt,
                  intent.sequencerClaimedAt,
                  message,
                ),
              )
            : !sequencerProviderTouched || isTransientSequencerRejection(error)
              ? ignoreChanged(
                  store.markSequencerRetryable(
                    downloadId,
                    intent.sequencerAttempt,
                    intent.sequencerClaimedAt,
                    message,
                  ),
                )
              : isPermanentSequencerRejection(error)
                ? ignoreChanged(
                    store.markSequencerQuarantined(
                      downloadId,
                      intent.sequencerAttempt,
                      intent.sequencerClaimedAt,
                      message,
                    ),
                  )
                : ignoreChanged(
                    store.markSequencerAmbiguous(
                      downloadId,
                      intent.sequencerAttempt,
                      intent.sequencerClaimedAt,
                      message,
                    ),
                  ),
        "lead-magnet-sequencer-state",
      );
      if (sequencerProviderTouched) {
        await compensateSequencerIfUnsubscribed(store, bindings, downloadId, intent.email);
      }
      captureBackgroundException(error, "leads", { step: "lead-magnet-sequencer-delivery" });
    }
  }
}

const LEASE_MS = 5 * 60 * 1000;
const AMBIGUITY_MS = 23 * 60 * 60 * 1000;
const DELIVERY_RECOVERY_CONCURRENCY = 3;

export function createD1LeadDeliveryStore(db: D1DatabaseBinding): LeadDeliveryStore {
  const update = async (sql: string, ...values: unknown[]) => {
    await db
      .prepare(sql)
      .bind(...values)
      .run();
  };
  const updateChanged = async (sql: string, ...values: unknown[]) => {
    const result = await db
      .prepare(sql)
      .bind(...values)
      .run();
    return ((result as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0) === 1;
  };
  const findEligibleLead = (leadId: string) =>
    db
      .prepare(
        "SELECT email, first_name FROM leads WHERE id = ? AND unsubscribed_at IS NULL LIMIT 1",
      )
      .bind(leadId)
      .first<{ email: string; first_name: string | null }>();
  return {
    async claim(downloadId, options = {}) {
      const now = new Date();
      const staleAt = new Date(now.getTime() - LEASE_MS).toISOString();
      const quarantineAt = new Date(now.getTime() - AMBIGUITY_MS).toISOString();
      await update(
        `UPDATE lead_magnet_downloads SET email_status = 'quarantined', email_only = 0
         WHERE id = ? AND email_status IN ('processing','sending','ambiguous')
           AND email_attempt_started_at IS NOT NULL
           AND email_attempt_started_at < ?`,
        downloadId,
        quarantineAt,
      );
      if (options.emailOnly) {
        const row = await db
          .prepare(
            `UPDATE lead_magnet_downloads
             SET delivery_started_at = COALESCE(delivery_started_at, ?),
                 email_claimed_at = CASE
                   WHEN email_status IN ('pending','failed')
                     OR (email_status IN ('processing','sending') AND email_claimed_at < ?)
                     OR (email_status = 'ambiguous' AND email_claimed_at < ?
                       AND email_attempt_started_at > ?)
                   THEN ? ELSE email_claimed_at END,
                 email_attempt = CASE
                   WHEN email_status = 'failed'
                   THEN email_attempt + 1 ELSE email_attempt END,
                  email_attempt_started_at = CASE
                   WHEN email_status = 'failed'
                   THEN NULL
                   ELSE email_attempt_started_at END,
                 email_request_fingerprint = CASE
                   WHEN email_status = 'failed'
                   THEN NULL ELSE email_request_fingerprint END,
                 email_status = CASE
                   WHEN email_status IN ('pending','failed')
                     OR (email_status IN ('processing','sending') AND email_claimed_at < ?)
                     OR (email_status = 'ambiguous' AND email_claimed_at < ?
                       AND email_attempt_started_at > ?)
                   THEN 'processing' ELSE email_status END
             WHERE id = ? AND email_only = 1
               AND EXISTS (
                 SELECT 1 FROM leads
                 WHERE leads.id = lead_magnet_downloads.lead_id
                   AND leads.unsubscribed_at IS NULL
               )
               AND (email_status IN ('pending','failed')
                 OR (email_claimed_at < ? AND email_status IN ('processing','sending','ambiguous')))
             RETURNING id, lead_id, magnet_slug, source_page, email_attempt,
               email_attempt_started_at,
               email_claimed_at, email_only, email_status, email_request_fingerprint`,
          )
          .bind(
            now.toISOString(),
            staleAt,
            staleAt,
            quarantineAt,
            now.toISOString(),
            staleAt,
            staleAt,
            quarantineAt,
            downloadId,
            staleAt,
          )
          .first<{
            id: string;
            lead_id: string;
            magnet_slug: string;
            source_page: string | null;
            email_attempt: number;
            email_attempt_started_at: string | null;
            email_claimed_at: string;
            email_only: number;
            email_status: string;
            email_request_fingerprint: string | null;
          }>();
        if (!row) return null;
        const lead = await findEligibleLead(row.lead_id);
        if (!lead) throw new Error("Lead delivery dependency is missing");
        return {
          downloadId: row.id,
          leadId: row.lead_id,
          email: lead.email,
          firstName: lead.first_name,
          magnetSlug: row.magnet_slug,
          sourcePage: row.source_page,
          emailAttempt: row.email_attempt,
          emailAttemptStartedAt: row.email_attempt_started_at,
          emailClaimedAt: row.email_claimed_at,
          sequencerAttempt: 0,
          sequencerClaimedAt: "",
          emailOnly: true,
          emailPending: row.email_status === "processing",
          sequencerPending: false,
          emailRequestFingerprint: row.email_request_fingerprint,
          sequencerRequestFingerprint: null,
          sequencerContactId: null,
          sequencerEnrollmentRequestFingerprint: null,
        };
      }
      await update(
        `UPDATE lead_magnet_downloads SET sequencer_status = 'quarantined'
         WHERE id = ? AND sequencer_status IN ('processing','sending','ambiguous')
           AND sequencer_attempt_started_at IS NOT NULL
           AND sequencer_attempt_started_at < ?`,
        downloadId,
        quarantineAt,
      );
      const row = await db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET delivery_started_at = COALESCE(delivery_started_at, ?),
               email_claimed_at = CASE
                 WHEN email_status IN ('pending','failed')
                   OR (email_status IN ('processing','sending') AND email_claimed_at < ?)
                   OR (email_status = 'ambiguous' AND email_claimed_at < ?
                      AND email_attempt_started_at > ?)
                 THEN ? ELSE email_claimed_at END,
               email_attempt = CASE
                 WHEN email_status = 'failed'
                 THEN email_attempt + 1 ELSE email_attempt END,
                email_attempt_started_at = CASE
                  WHEN email_status = 'failed'
                  THEN NULL
                  ELSE email_attempt_started_at END,
               email_request_fingerprint = CASE
                 WHEN email_status = 'failed'
                 THEN NULL ELSE email_request_fingerprint END,
               email_status = CASE
                 WHEN email_status IN ('pending','failed')
                   OR (email_status IN ('processing','sending') AND email_claimed_at < ?)
                   OR (email_status = 'ambiguous' AND email_claimed_at < ?
                      AND email_attempt_started_at > ?)
                 THEN 'processing' ELSE email_status END,
               sequencer_attempt = CASE
                 WHEN sequencer_status = 'failed'
                 THEN sequencer_attempt + 1 ELSE sequencer_attempt END,
               sequencer_claimed_at = CASE
                 WHEN sequencer_status IN ('pending','failed')
                   OR (sequencer_status IN ('processing','sending') AND sequencer_claimed_at < ?)
                   OR (sequencer_status = 'ambiguous' AND sequencer_claimed_at < ?
                      AND sequencer_attempt_started_at > ?)
                 THEN ? ELSE sequencer_claimed_at END,
                sequencer_attempt_started_at = CASE
                  WHEN sequencer_status = 'failed'
                  THEN NULL
                  ELSE sequencer_attempt_started_at END,
               sequencer_request_fingerprint = CASE
                 WHEN sequencer_status = 'failed'
                 THEN NULL ELSE sequencer_request_fingerprint END,
               sequencer_contact_id = CASE
                 WHEN sequencer_status = 'failed'
                 THEN NULL ELSE sequencer_contact_id END,
               sequencer_enrollment_request_fingerprint = CASE
                 WHEN sequencer_status = 'failed'
                 THEN NULL ELSE sequencer_enrollment_request_fingerprint END,
               sequencer_status = CASE
                 WHEN sequencer_status IN ('pending','failed')
                   OR (sequencer_status IN ('processing','sending') AND sequencer_claimed_at < ?)
                   OR (sequencer_status = 'ambiguous' AND sequencer_claimed_at < ?
                      AND sequencer_attempt_started_at > ?)
                 THEN 'processing' ELSE sequencer_status END
           WHERE id = ?
             AND EXISTS (
               SELECT 1 FROM leads
               WHERE leads.id = lead_magnet_downloads.lead_id
                 AND leads.unsubscribed_at IS NULL
             )
             AND (email_status IN ('pending','failed')
               OR sequencer_status IN ('pending','failed')
               OR (email_claimed_at < ? AND email_status IN ('processing','sending','ambiguous'))
               OR (sequencer_claimed_at < ? AND sequencer_status IN ('processing','sending','ambiguous')))
           RETURNING id, lead_id, magnet_slug, source_page, email_attempt, sequencer_attempt,
              email_attempt_started_at,
             email_claimed_at, sequencer_claimed_at,
             email_only, email_status, sequencer_status,
             email_request_fingerprint, sequencer_request_fingerprint,
             sequencer_contact_id, sequencer_enrollment_request_fingerprint`,
        )
        .bind(
          now.toISOString(),
          staleAt,
          staleAt,
          quarantineAt,
          now.toISOString(),
          staleAt,
          staleAt,
          quarantineAt,
          staleAt,
          staleAt,
          quarantineAt,
          now.toISOString(),
          staleAt,
          staleAt,
          quarantineAt,
          downloadId,
          staleAt,
          staleAt,
        )
        .first<{
          id: string;
          lead_id: string;
          magnet_slug: string;
          source_page: string | null;
          email_attempt: number;
          sequencer_attempt: number;
          email_attempt_started_at: string | null;
          email_claimed_at: string;
          sequencer_claimed_at: string;
          email_only: number;
          email_status: string;
          sequencer_status: string;
          email_request_fingerprint: string | null;
          sequencer_request_fingerprint: string | null;
          sequencer_contact_id: string | null;
          sequencer_enrollment_request_fingerprint: string | null;
        }>();
      if (!row) return null;
      const lead = await findEligibleLead(row.lead_id);
      if (!lead) throw new Error("Lead delivery dependency is missing");
      return {
        downloadId: row.id,
        leadId: row.lead_id,
        email: lead.email,
        firstName: lead.first_name,
        magnetSlug: row.magnet_slug,
        sourcePage: row.source_page,
        emailAttempt: row.email_attempt,
        emailAttemptStartedAt: row.email_attempt_started_at,
        emailClaimedAt: row.email_claimed_at,
        sequencerAttempt: row.sequencer_attempt,
        sequencerClaimedAt: row.sequencer_claimed_at,
        emailOnly: row.email_only === 1,
        emailPending: row.email_status === "processing",
        sequencerPending: row.sequencer_status === "processing",
        emailRequestFingerprint: row.email_request_fingerprint,
        sequencerRequestFingerprint: row.sequencer_request_fingerprint,
        sequencerContactId: row.sequencer_contact_id,
        sequencerEnrollmentRequestFingerprint: row.sequencer_enrollment_request_fingerprint,
      };
    },
    async isEligible(downloadId) {
      const row = await db
        .prepare(
          `SELECT 1 AS eligible
           FROM lead_magnet_downloads d
           JOIN leads l ON l.id = d.lead_id
           WHERE d.id = ? AND l.unsubscribed_at IS NULL
           LIMIT 1`,
        )
        .bind(downloadId)
        .first<{ eligible: number }>();
      return row?.eligible === 1;
    },
    suppress: (id) =>
      update(
        `UPDATE lead_magnet_downloads
         SET email_status = CASE WHEN email_status = 'sent' THEN email_status ELSE 'suppressed' END,
             sequencer_status = CASE WHEN sequencer_status = 'sent' THEN sequencer_status ELSE 'suppressed' END,
             email_only = 0,
             delivery_error = NULL
         WHERE id = ?`,
        id,
      ),
    async authorizeEmailSend(id, attempt, claimedAt) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `UPDATE lead_magnet_downloads
         SET email_status = 'sending',
             email_attempt_started_at = COALESCE(email_attempt_started_at, ?)
         WHERE id = ? AND email_attempt = ? AND email_status = 'processing'
            AND email_claimed_at = ?
            AND EXISTS (
              SELECT 1 FROM leads
              WHERE leads.id = lead_magnet_downloads.lead_id
                AND leads.unsubscribed_at IS NULL
            )
         RETURNING email_attempt_started_at`,
        )
        .bind(now, id, attempt, claimedAt)
        .first<{ email_attempt_started_at: string }>();
      return row?.email_attempt_started_at ?? null;
    },
    markEmailSent: (id, attempt, claimedAt) =>
      updateChanged(
        `UPDATE lead_magnet_downloads
         SET email_status = 'sent', email_only = 0, email_sent_at = ?, delivery_error = NULL
         WHERE id = ? AND email_attempt = ? AND email_status = 'sending'
           AND email_claimed_at = ?
           AND EXISTS (
             SELECT 1 FROM leads
             WHERE leads.id = lead_magnet_downloads.lead_id
               AND leads.unsubscribed_at IS NULL
           )`,
        new Date().toISOString(),
        id,
        attempt,
        claimedAt,
      ),
    markEmailUnavailable: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads
         SET email_status = 'pending', email_attempt_started_at = NULL,
             email_request_fingerprint = NULL, delivery_error = ?
         WHERE id = ? AND email_attempt = ? AND email_status IN ('processing','sending')
           AND email_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markEmailRetryable: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET email_status = '${
          attempt >= MAX_AUTOMATIC_DELIVERY_ATTEMPTS ? "quarantined" : "failed"
        }', ${attempt >= MAX_AUTOMATIC_DELIVERY_ATTEMPTS ? "email_only = 0, " : ""}delivery_error = ?
         WHERE id = ? AND email_attempt = ? AND email_status IN ('processing','sending')
           AND email_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markEmailAmbiguous: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET email_status = 'ambiguous', delivery_error = ?
         WHERE id = ? AND email_attempt = ? AND email_status IN ('processing','sending')
           AND email_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markEmailQuarantined: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads
         SET email_status = 'quarantined', email_only = 0, delivery_error = ?
         WHERE id = ? AND email_attempt = ? AND email_status IN ('processing','sending')
           AND email_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    async saveEmailRequestFingerprint(id, attempt, claimedAt, fingerprint) {
      const result = await db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET email_request_fingerprint = ?
            WHERE id = ? AND email_attempt = ? AND email_status = 'sending'
              AND email_claimed_at = ?
              AND email_request_fingerprint IS NULL`,
        )
        .bind(fingerprint, id, attempt, claimedAt)
        .run();
      return ((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1;
    },
    async requestEmailResend(id) {
      const result = await db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET email_status = 'pending',
               email_attempt = email_attempt + 1,
               email_attempt_started_at = NULL,
               email_claimed_at = NULL,
               email_only = 1,
               email_request_fingerprint = NULL,
               delivery_error = NULL
           WHERE id = ?
             AND email_status IN ('sent','failed','quarantined')
             AND EXISTS (SELECT 1 FROM leads
               WHERE leads.id = lead_magnet_downloads.lead_id
                 AND leads.unsubscribed_at IS NULL)`,
        )
        .bind(id)
        .run();
      if (((result as { meta?: { changes?: number } }).meta?.changes ?? 0) > 0) {
        return "opened";
      }
      const row = await db
        .prepare("SELECT email_status FROM lead_magnet_downloads WHERE id = ? LIMIT 1")
        .bind(id)
        .first<{ email_status: string }>();
      if (row?.email_status === "ambiguous") return "ambiguous";
      return row && ["pending", "processing", "sending"].includes(row.email_status)
        ? "in_progress"
        : "unavailable";
    },
    async authorizeSequencerSend(id, attempt, claimedAt) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `UPDATE lead_magnet_downloads
         SET sequencer_status = 'sending',
             sequencer_attempt_started_at = COALESCE(sequencer_attempt_started_at, ?)
         WHERE id = ? AND sequencer_attempt = ?
            AND sequencer_status = 'processing'
            AND sequencer_claimed_at = ?
            AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
              AND leads.unsubscribed_at IS NULL)
         RETURNING sequencer_attempt_started_at`,
        )
        .bind(now, id, attempt, claimedAt)
        .first<{ sequencer_attempt_started_at: string }>();
      return row?.sequencer_attempt_started_at ?? null;
    },
    confirmSequencerSend: (id, attempt, claimedAt) =>
      updateChanged(
        `UPDATE lead_magnet_downloads
         SET sequencer_status = 'sending'
         WHERE id = ? AND sequencer_attempt = ? AND sequencer_status = 'sending'
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        id,
        attempt,
        claimedAt,
      ),
    markSequencerSent: (id, attempt, claimedAt) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET sequencer_status = 'sent', sequencer_sent_at = ?
         WHERE id = ? AND sequencer_attempt = ? AND sequencer_status = 'sending'
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        new Date().toISOString(),
        id,
        attempt,
        claimedAt,
      ),
    markSequencerUnavailable: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads
         SET sequencer_status = 'pending', sequencer_attempt_started_at = NULL,
             sequencer_request_fingerprint = NULL, sequencer_contact_id = NULL,
             sequencer_enrollment_request_fingerprint = NULL, delivery_error = ?
         WHERE id = ? AND sequencer_attempt = ?
           AND sequencer_status IN ('processing','sending')
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markSequencerRetryable: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET sequencer_status = '${
          attempt >= MAX_AUTOMATIC_DELIVERY_ATTEMPTS ? "quarantined" : "failed"
        }', delivery_error = ?
         WHERE id = ? AND sequencer_attempt = ?
           AND sequencer_status IN ('processing','sending')
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markSequencerAmbiguous: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET sequencer_status = 'ambiguous', delivery_error = ?
         WHERE id = ? AND sequencer_attempt = ?
           AND sequencer_status IN ('processing','sending')
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    markSequencerQuarantined: (id, attempt, claimedAt, error) =>
      updateChanged(
        `UPDATE lead_magnet_downloads SET sequencer_status = 'quarantined', delivery_error = ?
         WHERE id = ? AND sequencer_attempt = ?
           AND sequencer_status IN ('processing','sending')
           AND sequencer_claimed_at = ?
           AND EXISTS (SELECT 1 FROM leads WHERE leads.id = lead_magnet_downloads.lead_id
             AND leads.unsubscribed_at IS NULL)`,
        error,
        id,
        attempt,
        claimedAt,
      ),
    async saveSequencerRequestFingerprint(id, attempt, claimedAt, fingerprint) {
      const result = await db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET sequencer_request_fingerprint = ?
            WHERE id = ? AND sequencer_attempt = ? AND sequencer_status = 'sending'
              AND sequencer_claimed_at = ?
              AND sequencer_request_fingerprint IS NULL`,
        )
        .bind(fingerprint, id, attempt, claimedAt)
        .run();
      return ((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1;
    },
    async saveSequencerEnrollmentRequest(id, attempt, claimedAt, contactId, fingerprint) {
      const result = await db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET sequencer_contact_id = ?,
               sequencer_enrollment_request_fingerprint = ?
            WHERE id = ? AND sequencer_attempt = ? AND sequencer_status = 'sending'
              AND sequencer_claimed_at = ?
              AND sequencer_contact_id IS NULL
             AND sequencer_enrollment_request_fingerprint IS NULL`,
        )
        .bind(contactId, fingerprint, id, attempt, claimedAt)
        .run();
      return ((result as { meta?: { changes?: number } }).meta?.changes ?? 0) === 1;
    },
  };
}

export async function redispatchPendingLeadDeliveries(bindings: Bindings): Promise<void> {
  if (!bindings.MARKETING_DB || typeof bindings.MARKETING_DB.prepare !== "function") return;
  const result = await bindings.MARKETING_DB.prepare(
    `SELECT id, email_only FROM lead_magnet_downloads
     WHERE email_status IN ('pending','failed','processing','sending','ambiguous')
        OR sequencer_status IN ('pending','failed','processing','sending','ambiguous')
     ORDER BY CASE
       WHEN email_status IN ('pending','failed','processing','sending','ambiguous')
         AND sequencer_status IN ('pending','failed','processing','sending','ambiguous')
       THEN MIN(COALESCE(email_claimed_at, ''), COALESCE(sequencer_claimed_at, ''))
       WHEN email_status IN ('pending','failed','processing','sending','ambiguous')
       THEN COALESCE(email_claimed_at, '')
       ELSE COALESCE(sequencer_claimed_at, '')
     END ASC
     LIMIT 100`,
  ).all<{ id: string; email_only: number }>();
  const store = createD1LeadDeliveryStore(bindings.MARKETING_DB);
  await runSettledWithConcurrency(result.results, DELIVERY_RECOVERY_CONCURRENCY, (row) =>
    dispatchLeadDelivery(store, bindings, row.id, { emailOnly: row.email_only === 1 }),
  );
}
