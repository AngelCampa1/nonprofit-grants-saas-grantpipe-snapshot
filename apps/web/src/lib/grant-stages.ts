import { GRANT_STATUSES, type GrantStatus } from "@grantpipe/shared";

export type GrantStageInfo = {
  status: GrantStatus;
  label: string;
  meaning: string;
  moveWhen: string;
  nextAction: string;
  emptyMessage: string;
};

export type GrantPipelinePhase = {
  id: "pre-award" | "award-setup" | "active-delivery" | "completion";
  label: string;
  description: string;
  statuses: GrantStatus[];
};

const GRANT_STAGE_INFO = {
  discovery: {
    label: "Discovery",
    meaning: "You found a possible grant and are deciding if it is worth pursuing.",
    moveWhen: "Move it here when the grant is only an opportunity your team is researching.",
    nextAction: "Next: confirm fit, deadline, funder requirements, and whether to apply.",
    emptyMessage: "No grants you are still researching.",
  },
  application: {
    label: "Application",
    meaning: "You are building the proposal, budget, and attachments.",
    moveWhen: "Move it here when your team is building the grant application.",
    nextAction: "Next: finish the proposal package and submit it before the deadline.",
    emptyMessage: "No applications being prepared.",
  },
  submitted: {
    label: "Submitted",
    meaning: "The application has been sent and you are waiting for a decision.",
    moveWhen: "Move it here after the application has been sent to the funder.",
    nextAction: "Next: watch for the decision date and keep funder follow-up notes current.",
    emptyMessage: "No submitted applications waiting on a decision.",
  },
  awarded: {
    label: "Awarded",
    meaning: "The funder approved it. Set up award details before spending.",
    moveWhen: "Move it here after the award is approved but before setup is done.",
    nextAction: "Next: enter award amount, dates, restrictions, and linked funds.",
    emptyMessage: "No newly awarded grants waiting for setup.",
  },
  active: {
    label: "Active",
    meaning: "The grant is underway. Track spending, outcomes, and restrictions.",
    moveWhen: "Move it here when setup is done and grant work has started.",
    nextAction: "Next: keep expenses, restricted funds, and outcome notes current.",
    emptyMessage: "No grants currently underway.",
  },
  reporting: {
    label: "Reporting",
    meaning: "A report is due or your team is drafting one for the funder.",
    moveWhen: "Move it here when a funder report needs attention or is in draft.",
    nextAction: "Next: gather spending, outcomes, narrative updates, and attachments.",
    emptyMessage: "No grants currently in reporting.",
  },
  closeout: {
    label: "Closeout",
    meaning: "You are finishing final reports and wrapping up documents.",
    moveWhen: "Move it here when grant work is ending and you are checking final documents.",
    nextAction: "Next: finish final reports, reconcile balances, and store closeout documents.",
    emptyMessage: "No grants being closed out.",
  },
  renewal: {
    label: "Renewal",
    meaning: "Your team is deciding whether to renew or reapply for this grant.",
    moveWhen: "Move it here when your team is deciding whether to renew or reapply.",
    nextAction: "Next: review past performance and prepare the renewal application.",
    emptyMessage: "No grants being renewed or reapplied for.",
  },
  declined: {
    label: "Declined",
    meaning: "The funder said no or your team stopped pursuing this grant.",
    moveWhen: "Move it here when the funder says no or your team stops pursuing it.",
    nextAction: "Next: record the reason and keep useful notes for future applications.",
    emptyMessage: "No declined or cancelled grants.",
  },
} satisfies Record<GrantStatus, Omit<GrantStageInfo, "status">>;

export const GRANT_STAGE_DETAILS = GRANT_STATUSES.map((status) => ({
  status,
  ...GRANT_STAGE_INFO[status],
})) satisfies GrantStageInfo[];

export const GRANT_PIPELINE_PHASES = [
  {
    id: "pre-award",
    label: "Pre-award",
    description: "Research, prepare, and submit opportunities before a funding decision.",
    statuses: ["discovery", "application", "submitted"],
  },
  {
    id: "award-setup",
    label: "Award setup",
    description: "Set up approved awards with restrictions and linked funds.",
    statuses: ["awarded"],
  },
  {
    id: "active-delivery",
    label: "Active delivery",
    description: "Track spending, outcomes, and funder reports during the award.",
    statuses: ["active", "reporting"],
  },
  {
    id: "completion",
    label: "Completion / next cycle",
    description: "Wrap up final reports and decide whether to renew.",
    statuses: ["closeout", "renewal"],
  },
] satisfies GrantPipelinePhase[];

export function getGrantStageInfo(status: GrantStatus): GrantStageInfo {
  return {
    status,
    ...GRANT_STAGE_INFO[status],
  };
}

export const GRANT_STATUS_BADGE_VARIANTS = {
  discovery: "gs-discovery",
  application: "gs-application",
  submitted: "gs-submitted",
  awarded: "gs-awarded",
  active: "gs-active",
  reporting: "gs-reporting",
  closeout: "gs-closeout",
  renewal: "gs-renewal",
  declined: "gs-declined",
} as const satisfies Record<GrantStatus, string>;
