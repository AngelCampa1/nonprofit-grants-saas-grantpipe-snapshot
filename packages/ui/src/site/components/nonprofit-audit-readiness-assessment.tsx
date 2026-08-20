import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "sefa",
    prompt:
      "Do you maintain a current Schedule of Expenditures of Federal Awards (SEFA) reconciled to your general ledger?",
    helper: "Required for any organization expending $1M+ in federal awards in a fiscal year.",
    options: [
      { label: "Yes, reconciled monthly", score: 10 },
      { label: "Yes, but only at year-end", score: 6 },
      { label: "We start it when the auditor asks", score: 2 },
      { label: "Not sure what a SEFA is", score: 0 },
    ],
  },
  {
    id: "time-effort",
    prompt:
      "Are time-and-effort certifications signed by every employee charged to a federal award?",
    options: [
      { label: "Yes, signed semiannually or each pay period as required", score: 10 },
      { label: "Some staff sign, some don't", score: 4 },
      { label: "We rely on annual job descriptions instead", score: 2 },
      { label: "We don't collect them", score: 0 },
    ],
  },
  {
    id: "indirect-cost",
    prompt:
      "Do you have documentation supporting your indirect cost rate (NICRA, de minimis election, or cost allocation plan)?",
    options: [
      { label: "Negotiated rate agreement on file", score: 10 },
      { label: "Cost allocation plan with workpapers", score: 9 },
      { label: "15% de minimis elected in writing", score: 7 },
      { label: "We charge indirects without written basis", score: 0 },
    ],
  },
  {
    id: "subrecipient",
    prompt:
      "If you pass federal funds to subrecipients, do you complete annual risk assessments and monitoring?",
    options: [
      { label: "Yes, with documented risk and monitoring file", score: 10 },
      { label: "We monitor but don't risk-rate formally", score: 6 },
      { label: "We don't pass funds to subrecipients", score: 10 },
      { label: "We pass funds but don't monitor", score: 0 },
    ],
  },
  {
    id: "internal-controls",
    prompt: "Are your internal controls over federal awards documented in writing?",
    options: [
      { label: "Yes, reviewed within the last 12 months", score: 10 },
      { label: "Yes, but they're outdated", score: 5 },
      { label: "We have an old fiscal policy manual that mentions them", score: 3 },
      { label: "Not documented", score: 0 },
    ],
  },
  {
    id: "board-review",
    prompt:
      "Does your board's finance or audit committee review financial statements at least quarterly?",
    options: [
      { label: "Yes, with documented minutes", score: 10 },
      { label: "Yes, but minutes are sparse", score: 6 },
      { label: "Annually", score: 3 },
      { label: "No structured review", score: 0 },
    ],
  },
  {
    id: "prior-findings",
    prompt: "Have you fully resolved findings from your most recent audit?",
    options: [
      { label: "No findings, or all resolved with corrective action documented", score: 10 },
      { label: "Resolved, but no written corrective action plan", score: 5 },
      { label: "Some findings still open", score: 2 },
      { label: "We've never tracked corrective actions", score: 0 },
    ],
  },
  {
    id: "segregation",
    prompt: "Is there segregation of duties between authorization, recording, and custody of cash?",
    options: [
      { label: "Yes, with compensating controls documented", score: 10 },
      { label: "Mostly, with one or two overlap points", score: 6 },
      { label: "One person handles most of it", score: 1 },
      { label: "Not addressed", score: 0 },
    ],
  },
  {
    id: "drawdowns",
    prompt: "Are federal drawdowns reconciled to actual obligated expenses before each request?",
    options: [
      { label: "Yes, with reconciliation workpaper", score: 10 },
      { label: "Reconciled monthly", score: 8 },
      { label: "We draw on a budget basis and reconcile later", score: 3 },
      { label: "No formal reconciliation", score: 0 },
    ],
  },
  {
    id: "procurement",
    prompt:
      "Do your procurement files document the basis for selection, cost analysis, and conflict-of-interest review?",
    options: [
      { label: "Yes, on every purchase above the micro-purchase threshold", score: 10 },
      { label: "Yes, on large purchases only", score: 6 },
      { label: "We keep invoices but not selection memos", score: 2 },
      { label: "No procurement file at all", score: 0 },
    ],
  },
  {
    id: "policies",
    prompt:
      "Are your written policies (procurement, travel, allowability, conflict of interest) current within 24 months?",
    options: [
      { label: "Yes, all current", score: 10 },
      { label: "Most current", score: 6 },
      { label: "Older than 2 years", score: 3 },
      { label: "We rely on the original 501(c)(3) packet", score: 0 },
    ],
  },
  {
    id: "ffata",
    prompt: "If you have subawards over $30,000, are you reporting them in FSRS / FFATA on time?",
    options: [
      { label: "Yes, by the end of the month after award", score: 10 },
      { label: "Late but reported", score: 5 },
      { label: "Not aware of the requirement", score: 0 },
      { label: "No subawards over $30K", score: 10 },
    ],
  },
];

function resolveResult(score: number, max: number): QuestionnaireResult {
  const pct = (score / max) * 100;
  if (pct >= 80) {
    return {
      heading: `Audit-ready — ${score} / ${max}`,
      summary:
        "Your documentation, internal controls, and reporting cadence put you in a defensible position. Use the remaining time before fieldwork to tighten file completeness.",
      links: [
        { title: "Single Audit Prep Timeline", href: "/free/single-audit-prep-timeline" },
        { title: "Grant File Audit Checklist", href: "/free/grant-file-audit-checklist" },
      ],
    };
  }
  if (pct >= 55) {
    return {
      heading: `At risk — ${score} / ${max}`,
      summary:
        "Most controls are in place, but specific files and policies need work before fieldwork. Address the gaps below in the next 60 days.",
      links: [
        { title: "2 CFR 200 Audit Prep Checklist", href: "/free/2-cfr-200-audit-prep-checklist" },
        {
          title: "Time and Effort Certification Template",
          href: "/free/time-and-effort-certification-template",
        },
        {
          title: "Subrecipient Monitoring Checklist",
          href: "/free/subrecipient-monitoring-checklist",
        },
      ],
    };
  }
  return {
    heading: `Not audit-ready — ${score} / ${max}`,
    summary:
      "Multiple control areas are unaddressed. Start with SEFA, time-and-effort, and procurement files. Plan on a 90-day remediation sprint with weekly board updates.",
    links: [
      { title: "SEFA Prep Worksheet", href: "/free/sefa-prep-worksheet" },
      { title: "2 CFR 200 Audit Prep Checklist", href: "/free/2-cfr-200-audit-prep-checklist" },
      { title: "Cost Allocation Plan Worksheet", href: "/free/cost-allocation-plan-worksheet" },
      {
        title: "Indirect Cost Rate Negotiation Worksheet",
        href: "/free/indirect-cost-rate-negotiation-worksheet",
      },
    ],
  };
}

export interface NonprofitAuditReadinessAssessmentProps {
  apiUrl: string;
  appUrl?: string;
}

export function NonprofitAuditReadinessAssessment({
  apiUrl,
  appUrl,
}: NonprofitAuditReadinessAssessmentProps) {
  return (
    <QuestionnaireShell
      introTitle="Start the Audit Readiness Assessment"
      introBlurb="Twelve questions, about five minutes. We'll email your scored result and a remediation roadmap."
      questions={QUESTIONS}
      resolveResult={resolveResult}
      apiUrl={apiUrl}
      appUrl={appUrl}
      magnetSlug="nonprofit-audit-readiness-assessment"
      sourcePage="/free/nonprofit-audit-readiness-assessment"
    />
  );
}
