import { createDbHandle } from "@grantpipe/db";
import type { AppEnv } from "../../types";
import { captureQueueException } from "../../lib/sentry";
import { processAwardIntakeJob } from "./service";

type QueueBatch = {
  messages: ReadonlyArray<{ body: unknown }>;
};

function isAwardIntakeMessage(body: unknown): body is { extractionId: string; orgId: string } {
  return (
    body !== null &&
    typeof body === "object" &&
    "extractionId" in body &&
    "orgId" in body &&
    typeof body.extractionId === "string" &&
    typeof body.orgId === "string"
  );
}

export async function processAwardIntakeQueue(batch: QueueBatch, env: AppEnv["Bindings"]) {
  const messages = batch.messages.map((message) => message.body).filter(isAwardIntakeMessage);
  if (messages.length === 0) return;

  const handle = await createDbHandle(env.DATABASE_URL, env.HYPERDRIVE);
  try {
    // Process every message independently. A failure on one message must not
    // skip the rest of the batch — Cloudflare redelivers the whole batch on a
    // thrown error, and each job is idempotent (it only claims pending/stale
    // rows), so already-processed messages are safely no-ops on retry. We
    // rethrow the first error so the batch is redelivered for the failed jobs.
    //
    // The first error is rethrown and captured by the withSentry queue wrapper,
    // so we do NOT capture it here (that would produce a duplicate event).
    // Errors on messages 2..N are never rethrown, so without an explicit capture
    // they would be lost — capture those.
    let firstError: unknown;
    for (const message of messages) {
      try {
        await processAwardIntakeJob(handle.db, env, {
          extractionId: message.extractionId,
          orgId: message.orgId,
        });
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
        } else {
          captureQueueException(error, "award-intake", { org_id: message.orgId });
        }
      }
    }
    if (firstError !== undefined) throw firstError;
  } finally {
    await handle.close();
  }
}
