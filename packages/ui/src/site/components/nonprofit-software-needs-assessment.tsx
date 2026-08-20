import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";
import { PLAN_LABELS, type PlanTier } from "@grantpipe/shared";

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "budget",
    prompt: "What is your annual operating budget?",
    options: [
      { label: "Under $500K", score: 2 },
      { label: "$500K – $1M", score: 4 },
      { label: "$1M – $2.5M", score: 6 },
      { label: "$2.5M – $5M", score: 8 },
      { label: "$5M – $10M", score: 10 },
      { label: "Over $10M", score: 10 },
    ],
  },
  {
    id: "donors",
    prompt: "How many active donor records do you maintain?",
    options: [
      { label: "Fewer than 250", score: 2 },
      { label: "250 – 1,000", score: 4 },
      { label: "1,000 – 5,000", score: 6 },
      { label: "5,000 – 20,000", score: 9 },
      { label: "More than 20,000", score: 10 },
    ],
  },
  {
    id: "grants",
    prompt: "How many active grants do you manage at once?",
    options: [
      { label: "0 – 2", score: 2 },
      { label: "3 – 6", score: 5 },
      { label: "7 – 15", score: 8 },
      { label: "More than 15", score: 10 },
    ],
  },
  {
    id: "restricted",
    prompt: "Do you track restricted funds separately from unrestricted?",
    options: [
      { label: "Yes, by purpose and time restriction", score: 10 },
      { label: "Yes, but informally", score: 6 },
      { label: "We need to but don't yet", score: 4 },
      { label: "Not relevant", score: 2 },
    ],
  },
  {
    id: "current-system",
    prompt: "What do you use today?",
    options: [
      { label: "Spreadsheets and email", score: 3 },
      { label: "Bloomerang / DonorPerfect / Little Green Light", score: 6 },
      { label: "Salesforce NPSP", score: 8 },
      { label: "Blackbaud Raiser's Edge NXT", score: 9 },
      { label: "Multiple disconnected systems", score: 8 },
    ],
  },
  {
    id: "integrations",
    prompt: "Which integrations do you need?",
    options: [
      { label: "Accounting only (QuickBooks, Sage)", score: 4 },
      { label: "Accounting + email marketing", score: 6 },
      { label: "Accounting + email + payment processor", score: 8 },
      { label: "Multiple, including custom internal systems", score: 10 },
    ],
  },
  {
    id: "team-size",
    prompt: "How many staff will use the system regularly?",
    options: [
      { label: "1 – 2", score: 3 },
      { label: "3 – 5", score: 6 },
      { label: "6 – 10", score: 8 },
      { label: "More than 10", score: 10 },
    ],
  },
  {
    id: "compliance",
    prompt: "How critical is grant compliance reporting to your funders?",
    options: [
      { label: "Federal awards — required", score: 10 },
      { label: "Foundation-heavy with formal reports", score: 8 },
      { label: "Mostly individual donors", score: 4 },
      { label: "Light reporting", score: 3 },
    ],
  },
  {
    id: "reporting",
    prompt: "How do you currently produce funder reports?",
    options: [
      { label: "Manual spreadsheet assembly each cycle", score: 8 },
      { label: "From the CRM with cleanup", score: 5 },
      { label: "Automated from the system", score: 3 },
      { label: "Outsourced to a consultant", score: 9 },
    ],
  },
  {
    id: "growth",
    prompt: "What is your growth trajectory over the next 3 years?",
    options: [
      { label: "Doubling revenue", score: 10 },
      { label: "Adding programs", score: 8 },
      { label: "Stable", score: 5 },
      { label: "Contracting", score: 3 },
    ],
  },
];

function planHeading(tier: PlanTier): string {
  return `Recommended tier: GrantPipe ${PLAN_LABELS[tier]}`;
}

function resolveResult(score: number, max: number): QuestionnaireResult {
  const pct = (score / max) * 100;
  if (pct < 45) {
    return {
      heading: planHeading("starter"),
      summary:
        "Your scope fits a focused, low-overhead system. Starter covers donor records, basic grant tracking, and standard reports without administrator overhead.",
      links: [
        { title: "Nonprofit CRM Cost Calculator", href: "/free/nonprofit-crm-cost-calculator" },
        { title: "CRM Evaluation Scorecard", href: "/free/nonprofit-crm-evaluation-scorecard" },
        { title: "Donor Retention Playbook", href: "/free/donor-retention-playbook" },
      ],
    };
  }
  if (pct < 75) {
    return {
      heading: planHeading("growth"),
      summary:
        "You have enough complexity — restricted funds, a real grant pipeline, multiple staff — to warrant the Growth tier. It adds restricted fund accounting, multi-grant pipeline, and integration depth without enterprise overhead.",
      links: [
        { title: "CRM Evaluation Scorecard", href: "/free/nonprofit-crm-evaluation-scorecard" },
        { title: "Grant Software ROI Calculator", href: "/free/grant-software-roi-calculator" },
        {
          title: "Restricted Fund Tracking Spreadsheet",
          href: "/free/restricted-fund-tracking-spreadsheet",
        },
        { title: "CRM Migration Data Map Template", href: "/free/crm-migration-data-map-template" },
      ],
    };
  }
  return {
    heading: planHeading("audit_ready"),
    summary:
      "Your grants, federal reports, and system links need more proof. Audit-Ready adds subrecipient monitoring, audit records, and accounting outputs. You get that without a Salesforce-style consultant project.",
    links: [
      { title: "Grant Compliance Checklist", href: "/free/grant-compliance-checklist" },
      { title: "2 CFR 200 Audit Prep Checklist", href: "/free/2-cfr-200-audit-prep-checklist" },
      { title: "SEFA Prep Worksheet", href: "/free/sefa-prep-worksheet" },
      {
        title: "Subrecipient Monitoring Checklist",
        href: "/free/subrecipient-monitoring-checklist",
      },
      { title: "Salesforce NPSP Migration Map", href: "/free/salesforce-npsp-migration-map" },
    ],
  };
}

export interface NonprofitSoftwareNeedsAssessmentProps {
  apiUrl: string;
  appUrl?: string;
}

export function NonprofitSoftwareNeedsAssessment({
  apiUrl,
  appUrl,
}: NonprofitSoftwareNeedsAssessmentProps) {
  return (
    <QuestionnaireShell
      introTitle="Start the Software Needs Assessment"
      introBlurb="Ten questions, about four minutes. Your answers map you to the GrantPipe tier - Starter, Growth, or Audit-Ready - that best fits your scale and compliance footprint."
      questions={QUESTIONS}
      resolveResult={resolveResult}
      apiUrl={apiUrl}
      appUrl={appUrl}
      magnetSlug="nonprofit-software-needs-assessment"
      sourcePage="/free/nonprofit-software-needs-assessment"
    />
  );
}
