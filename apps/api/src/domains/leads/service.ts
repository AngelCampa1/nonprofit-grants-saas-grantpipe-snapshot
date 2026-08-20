import type { LeadDeliveryState, LeadSignupInputRaw } from "@grantpipe/shared";
import type { Bindings } from "../../types";
import { sendNurtureEmail, buildDownloadUrl, verifyUnsubscribeToken } from "./emails";
import { enrollLeadNurture, isSequencerConfigured, unsubscribeLeadNurture } from "./sequencer";
import type { MarketingLead, MarketingStore } from "./marketing-store";
import { captureBackgroundException } from "../../lib/sentry";
import { createD1LeadDeliveryStore, dispatchLeadDelivery } from "./delivery.service";

export interface UpsertLeadResult {
  lead: MarketingLead;
  alreadySubscribed: boolean;
  deliveryState?: LeadDeliveryState;
}

function isEmailDeliveryConfigurationError(error: unknown): boolean {
  return error instanceof Error && /RESEND_API_KEY is required/.test(error.message);
}

/**
 * Upserts a lead by email. On lead magnet requests, records the download, sends
 * the immediate delivery email, and enrolls follow-up nurture in Sequencer.
 */
export async function upsertLead(
  store: MarketingStore,
  bindings: Bindings,
  input: LeadSignupInputRaw,
  defer?: (promise: Promise<void>) => void,
): Promise<UpsertLeadResult> {
  const existing = await store.findLeadByEmail(input.email);

  if (existing) {
    // Unsubscribed: do nothing, do not resubscribe, do not resend.
    if (existing.unsubscribedAt) {
      return { lead: existing, alreadySubscribed: true, deliveryState: "unsubscribed" };
    }
    let deliveryState: LeadDeliveryState | undefined;
    // Still subscribed: record download if slug provided; bump updatedAt.
    if (input.magnetSlug) {
      const magnetSlug = input.magnetSlug;
      // Gate delivery on the atomic INSERT OR IGNORE result rather than a
      // separate pre-read: two concurrent submits for the same (lead, magnet)
      // could both read "no download" and both send a duplicate email. Only the
      // request that actually inserted the row (downloadInserted === true) sends.
      const candidateDownloadId = crypto.randomUUID();
      const downloadInserted = await store.insertDownload(
        candidateDownloadId,
        existing.id,
        magnetSlug,
        new Date(),
        input.sourcePage ?? null,
      );

      const downloadId = downloadInserted
        ? candidateDownloadId
        : await store.findDownloadId?.(existing.id, magnetSlug);
      if (downloadId && bindings.MARKETING_DB?.prepare) {
        const deliveryStore = createD1LeadDeliveryStore(bindings.MARKETING_DB);
        if (input.resendDelivery && !downloadInserted) {
          const resendResult = await deliveryStore.requestEmailResend(downloadId);
          if (resendResult !== "opened") {
            await store.updateLeadTimestamp(existing.id, new Date());
            return {
              lead: existing,
              alreadySubscribed: true,
              deliveryState:
                resendResult === "in_progress"
                  ? "in_progress"
                  : resendResult === "ambiguous"
                    ? "ambiguous"
                    : "resend_unavailable",
            };
          }
        }
        const delivery =
          input.resendDelivery && !downloadInserted
            ? dispatchLeadDelivery(deliveryStore, bindings, downloadId, { emailOnly: true })
            : dispatchLeadDelivery(deliveryStore, bindings, downloadId);
        if (defer) defer(delivery);
        else await delivery;
        await store.updateLeadTimestamp(existing.id, new Date());
        return { lead: existing, alreadySubscribed: true, deliveryState: "queued" };
      }

      if (downloadInserted) {
        try {
          const downloadUrl = await buildDownloadUrl(existing.id, magnetSlug, bindings);
          await sendNurtureEmail(bindings, {
            leadId: existing.id,
            email: existing.email,
            firstName: existing.firstName,
            step: 0,
            magnetSlug,
            downloadUrl,
          });
          await enrollLeadInSequencer(bindings, existing, magnetSlug, input.sourcePage ?? null);
          deliveryState = "sent";
        } catch (err) {
          console.error("[leads] step-0 delivery failed for existing lead", {
            leadId: existing.id,
            magnetSlug,
            error: err instanceof Error ? err.message : String(err),
          });
          if (isEmailDeliveryConfigurationError(err)) {
            throw err;
          }
          // Non-configuration failures (Resend down, transient HTTP) are swallowed
          // so signup is never blocked — capture them so they are not lost.
          captureBackgroundException(err, "leads", { step: "step-0-email" });
          deliveryState = "ambiguous";
        }
      }

      if (!downloadInserted && input.resendDelivery) {
        try {
          const downloadUrl = await buildDownloadUrl(existing.id, magnetSlug, bindings);
          await sendNurtureEmail(bindings, {
            leadId: existing.id,
            email: existing.email,
            firstName: existing.firstName,
            step: 0,
            magnetSlug,
            downloadUrl,
          });
          deliveryState = "sent";
        } catch (err) {
          console.error("[leads] step-0 resend failed for existing lead", {
            leadId: existing.id,
            magnetSlug,
            error: err instanceof Error ? err.message : String(err),
          });
          if (isEmailDeliveryConfigurationError(err)) {
            throw err;
          }
          // Non-configuration failures (Resend down, transient HTTP) are swallowed
          // so signup is never blocked — capture them so they are not lost.
          captureBackgroundException(err, "leads", { step: "step-0-email" });
          deliveryState = "ambiguous";
        }
      }
    }
    await store.updateLeadTimestamp(existing.id, new Date());

    return { lead: existing, alreadySubscribed: true, deliveryState };
  }

  // New lead.
  const candidateLeadId = crypto.randomUUID();
  const created = await store.createLead({
    id: candidateLeadId,
    email: input.email,
    firstName: input.firstName ?? null,
    sourcePage: input.sourcePage ?? null,
    firstMagnetSlug: input.magnetSlug ?? null,
    utm: input.utm ?? null,
    now: new Date(),
  });
  const inserted = created.lead;
  const racedExistingLead = !created.created;
  if (racedExistingLead && inserted.unsubscribedAt) {
    return { lead: inserted, alreadySubscribed: true, deliveryState: "unsubscribed" };
  }

  if (input.magnetSlug) {
    const magnetSlug = input.magnetSlug;
    const downloadId = crypto.randomUUID();
    const downloadInserted = await store.insertDownload(
      downloadId,
      inserted.id,
      magnetSlug,
      new Date(),
      input.sourcePage ?? null,
    );
    const canonicalDownloadId = downloadInserted
      ? downloadId
      : await store.findDownloadId?.(inserted.id, magnetSlug);

    if (canonicalDownloadId && bindings.MARKETING_DB?.prepare) {
      const delivery = dispatchLeadDelivery(
        createD1LeadDeliveryStore(bindings.MARKETING_DB),
        bindings,
        canonicalDownloadId,
      );
      if (defer) defer(delivery);
      else await delivery;
      return { lead: inserted, alreadySubscribed: racedExistingLead, deliveryState: "queued" };
    }

    // Fire-and-forget step-0 delivery email. Errors here must not block signup.
    let deliveryState: LeadDeliveryState = "sent";
    try {
      const downloadUrl = await buildDownloadUrl(inserted.id, magnetSlug, bindings);
      await sendNurtureEmail(bindings, {
        leadId: inserted.id,
        email: inserted.email,
        firstName: inserted.firstName,
        step: 0,
        magnetSlug,
        downloadUrl,
      });
      await enrollLeadInSequencer(bindings, inserted, magnetSlug, input.sourcePage ?? null);
    } catch (err) {
      console.error("[leads] step-0 delivery failed", {
        leadId: inserted.id,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isEmailDeliveryConfigurationError(err)) {
        throw err;
      }
      // Non-configuration failures (Resend down, transient HTTP) are swallowed
      // so signup is never blocked — capture them so they are not lost.
      captureBackgroundException(err, "leads", { step: "step-0-email" });
      deliveryState = "ambiguous";
    }
    return { lead: inserted, alreadySubscribed: racedExistingLead, deliveryState };
  }

  return { lead: inserted, alreadySubscribed: racedExistingLead };
}

export interface UnsubscribeResult {
  ok: boolean;
}

/**
 * Verifies the unsubscribe token and marks the lead as unsubscribed. Idempotent:
 * unsubscribing an already-unsubscribed lead returns ok=true without error.
 */
export async function unsubscribeLead(
  store: MarketingStore,
  token: string,
  secret: string,
  bindings?: Bindings,
): Promise<UnsubscribeResult> {
  const leadId = await verifyUnsubscribeToken(token, secret);
  if (!leadId) return { ok: false };

  const lead = await store.findLeadById(leadId);
  if (!lead) return { ok: true };
  if (lead.unsubscribedAt) return { ok: true };

  await store.markLeadUnsubscribed(leadId, new Date());
  if (bindings && isSequencerConfigured(bindings)) {
    await unsubscribeLeadNurture(bindings, { email: lead.email }).catch((error) => {
      console.error("[leads] sequencer unsubscribe failed", {
        leadId,
        error: error instanceof Error ? error.message : String(error),
      });
      captureBackgroundException(error, "leads", { step: "sequencer-unsubscribe" });
    });
  }
  return { ok: true };
}

async function enrollLeadInSequencer(
  bindings: Bindings,
  lead: Pick<MarketingLead, "email" | "firstName">,
  magnetSlug: string,
  sourcePage: string | null,
): Promise<void> {
  if (!isSequencerConfigured(bindings)) {
    console.error("[leads] sequencer not configured; skipping central nurture enrollment", {
      magnetSlug,
    });
    captureBackgroundException(new Error("Sequencer is not configured"), "leads", {
      step: "sequencer-config-missing",
    });
    return;
  }

  await enrollLeadNurture(bindings, {
    email: lead.email,
    firstName: lead.firstName,
    magnetSlug,
    sourcePage,
  }).catch((error) => {
    console.error("[leads] sequencer enrollment failed", {
      magnetSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    captureBackgroundException(error, "leads", { step: "sequencer-enroll" });
  });
}
