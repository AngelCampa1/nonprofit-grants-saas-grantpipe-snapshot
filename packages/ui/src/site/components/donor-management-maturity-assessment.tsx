import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "retention",
    prompt: "Do you measure your donor retention rate annually?",
    options: [
      { label: "Yes, with first-time vs. repeat segmentation", score: 10 },
      { label: "Yes, single rate", score: 6 },
      { label: "We've calculated it once", score: 3 },
      { label: "We don't measure it", score: 0 },
    ],
  },
  {
    id: "segmentation",
    prompt: "How do you segment your donor file?",
    options: [
      { label: "Recency, frequency, monetary, plus engagement", score: 10 },
      { label: "Giving level only", score: 5 },
      { label: "We send the same appeal to everyone", score: 1 },
      { label: "Not sure", score: 0 },
    ],
  },
  {
    id: "stewardship",
    prompt: "Do you have a written stewardship plan that distinguishes by donor tier?",
    options: [
      { label: "Yes, with documented touch counts per tier", score: 10 },
      { label: "Informal plan in someone's head", score: 4 },
      { label: "Same touches for every donor", score: 2 },
      { label: "No plan", score: 0 },
    ],
  },
  {
    id: "ack-time",
    prompt: "What is your typical time from gift receipt to acknowledgment?",
    options: [
      { label: "Within 48 hours", score: 10 },
      { label: "Within 7 days", score: 7 },
      { label: "Within 14 days", score: 4 },
      { label: "Longer than 14 days or inconsistent", score: 0 },
    ],
  },
  {
    id: "major-donor",
    prompt: "Do you have a defined major donor program with moves management?",
    options: [
      { label: "Yes, with portfolio assignments and tracked moves", score: 10 },
      { label: "Yes, but not formally tracked", score: 5 },
      { label: "No major donor program", score: 0 },
    ],
  },
  {
    id: "monthly-giving",
    prompt: "Do you have a monthly giving program?",
    options: [
      { label: "Yes, with dedicated stewardship", score: 10 },
      { label: "Yes, but no separate stewardship", score: 6 },
      { label: "We accept recurring gifts but don't promote them", score: 3 },
      { label: "No", score: 0 },
    ],
  },
  {
    id: "data-hygiene",
    prompt: "How often do you clean and update donor records?",
    options: [
      { label: "Continuous, with NCOA and dedup quarterly", score: 10 },
      { label: "Annually", score: 6 },
      { label: "When something breaks", score: 2 },
      { label: "Not at all", score: 0 },
    ],
  },
  {
    id: "appeals",
    prompt: "How do you decide what appeals to send?",
    options: [
      { label: "Annual calendar tied to segments and goals", score: 10 },
      { label: "Calendar without segment-level targeting", score: 6 },
      { label: "Ad hoc based on need", score: 2 },
      { label: "We don't run appeals", score: 0 },
    ],
  },
  {
    id: "renewal",
    prompt: "Do you have a documented renewal cadence for lapsed donors?",
    options: [
      { label: "Yes, multi-touch sequence by lapse stage", score: 10 },
      { label: "One annual renewal letter", score: 5 },
      { label: "Nothing structured", score: 0 },
    ],
  },
  {
    id: "board",
    prompt: "Are board members actively involved in donor cultivation?",
    options: [
      { label: "Yes, each board member has a portfolio", score: 10 },
      { label: "Some are, most aren't", score: 5 },
      { label: "Board reviews lists but doesn't engage", score: 3 },
      { label: "No board involvement", score: 0 },
    ],
  },
  {
    id: "metrics",
    prompt: "Which metrics does your development team track monthly?",
    options: [
      { label: "Retention, average gift, donor count, LYBUNT, SYBUNT", score: 10 },
      { label: "Revenue and donor count", score: 6 },
      { label: "Revenue only", score: 3 },
      { label: "We pull numbers when asked", score: 0 },
    ],
  },
  {
    id: "planning",
    prompt: "Do you have a written annual development plan with goals by source?",
    options: [
      { label: "Yes, with monthly variance tracking", score: 10 },
      { label: "Yes, reviewed quarterly", score: 7 },
      { label: "Plan exists but isn't tracked", score: 3 },
      { label: "No written plan", score: 0 },
    ],
  },
];

function resolveResult(score: number, max: number): QuestionnaireResult {
  const pct = (score / max) * 100;
  let level: number;
  let label: string;
  let summary: string;
  if (pct >= 90) {
    level = 5;
    label = "Best-in-class";
    summary =
      "Your development operation runs on documented systems, segmented stewardship, and disciplined metrics. Focus on planned giving and capacity tests.";
  } else if (pct >= 75) {
    level = 4;
    label = "Strong";
    summary =
      "Most fundraising disciplines are in place. The remaining gains come from tighter segmentation, monthly giving stewardship, and board portfolio activation.";
  } else if (pct >= 55) {
    level = 3;
    label = "Developing";
    summary =
      "Core fundamentals exist but execution is inconsistent. Codify your stewardship plan and start tracking retention as a first-class metric.";
  } else if (pct >= 30) {
    level = 2;
    label = "Foundational";
    summary =
      "You have donors but not a development operation. Start with retention measurement, a stewardship plan, and a clean segment table.";
  } else {
    level = 1;
    label = "Reactive";
    summary =
      "Fundraising is reactive, not planned. The biggest near-term wins come from a written annual plan, faster acknowledgments, and a basic donor segment structure.";
  }
  return {
    heading: `Maturity level ${level}: ${label} — ${score} / ${max}`,
    summary,
    links: [
      { title: "Donor Retention Playbook", href: "/free/donor-retention-playbook" },
      { title: "Major Donor Cultivation Playbook", href: "/free/major-donor-cultivation-playbook" },
      { title: "Donor Stewardship Plan Template", href: "/free/donor-stewardship-plan-template" },
      {
        title: "Monthly Giving Program Launch Checklist",
        href: "/free/monthly-giving-program-launch-checklist",
      },
      {
        title: "Donor Retention Dashboard Template",
        href: "/free/donor-retention-dashboard-template",
      },
      {
        title: "Donor Thank-You Letter Template Pack",
        href: "/free/donor-thank-you-letter-template-pack",
      },
    ],
  };
}

export interface DonorManagementMaturityAssessmentProps {
  apiUrl: string;
  appUrl?: string;
}

export function DonorManagementMaturityAssessment({
  apiUrl,
  appUrl,
}: DonorManagementMaturityAssessmentProps) {
  return (
    <QuestionnaireShell
      introTitle="Start the Donor Management Maturity Assessment"
      introBlurb="Twelve questions, about five minutes. Your result places you on a 1–5 maturity scale with linked playbooks for each gap."
      questions={QUESTIONS}
      resolveResult={resolveResult}
      apiUrl={apiUrl}
      appUrl={appUrl}
      magnetSlug="donor-management-maturity-assessment"
      sourcePage="/free/donor-management-maturity-assessment"
    />
  );
}
