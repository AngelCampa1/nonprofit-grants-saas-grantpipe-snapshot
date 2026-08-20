import {
  formatMinimumPlanLabelForFeatures,
  AI_USAGE_CAP_REACHED,
  PLAN_TIERS,
  type AiUsageCapPayload,
  type AiCappedFeature,
} from "@grantpipe/shared";
import { ApiError } from "./http-response";

const AI_CAPPED_FEATURES: Set<string> = new Set<AiCappedFeature>([
  "award_intake",
  "ask_your_ledger",
]);

export function getAiUsageCapPayload(error: unknown): AiUsageCapPayload | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 402) return null;
  if (error.errorCode !== AI_USAGE_CAP_REACHED) return null;

  const d = error.details;
  if (d === null || typeof d !== "object") return null;

  const details = d as Record<string, unknown>;
  const feature = details["feature"];
  const cap = details["cap"];
  const used = details["used"];
  const currentPlan = details["currentPlan"];
  const upgradeToPlan = details["upgradeToPlan"];

  if (typeof feature !== "string" || !AI_CAPPED_FEATURES.has(feature)) return null;
  if (typeof cap !== "number" || !Number.isFinite(cap)) return null;
  if (typeof used !== "number" || !Number.isFinite(used)) return null;
  if (typeof currentPlan !== "string") return null;
  if (!(PLAN_TIERS as readonly string[]).includes(currentPlan)) return null;
  if (upgradeToPlan !== null && typeof upgradeToPlan !== "string") return null;
  if (upgradeToPlan !== null && !(PLAN_TIERS as readonly string[]).includes(upgradeToPlan))
    return null;

  return {
    error: AI_USAGE_CAP_REACHED,
    feature: feature as AiCappedFeature,
    cap,
    used,
    currentPlan: currentPlan as AiUsageCapPayload["currentPlan"],
    upgradeToPlan: (upgradeToPlan ?? null) as AiUsageCapPayload["upgradeToPlan"],
  };
}

const AUDITOR_FUNDER_PORTAL_MIN_PLAN_LABEL = formatMinimumPlanLabelForFeatures([
  "hasAuditorFunderPortal",
]);

export const AUDIT_READY_PLAN_GATE_TITLE = `${AUDITOR_FUNDER_PORTAL_MIN_PLAN_LABEL} plan required`;
export const AUDIT_READY_PLAN_GATE_MESSAGE = `External reviewer access and evidence bundles are on the ${AUDITOR_FUNDER_PORTAL_MIN_PLAN_LABEL} plan. Go to Billing to upgrade.`;

export function isApiErrorStatus(error: unknown, status: number): error is ApiError {
  return error instanceof ApiError && error.status === status;
}

export function isAuditReadyPlanGate(error: unknown): error is ApiError {
  return (
    isApiErrorStatus(error, 402) &&
    (error.errorCode === "insufficient_plan" ||
      error.errorCode === "INSUFFICIENT_PLAN" ||
      error.message === "insufficient_plan")
  );
}
