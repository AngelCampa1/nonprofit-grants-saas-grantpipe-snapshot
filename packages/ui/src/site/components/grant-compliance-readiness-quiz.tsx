import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "uniform-guidance",
    prompt: "How familiar is your team with 2 CFR 200 (Uniform Guidance)?",
    options: [
      { label: "We reference the regulation in our policies", score: 10 },
      { label: "We've read it but don't reference it directly", score: 6 },
      { label: "Only the finance director has read it", score: 3 },
      { label: "Not familiar", score: 0 },
    ],
  },
  {
    id: "sf-425",
    prompt:
      "Do you have a documented process for preparing and submitting the SF-425 Federal Financial Report?",
    options: [
      { label: "Yes, with reconciliation workpapers archived", score: 10 },
      { label: "Yes, but informal", score: 6 },
      { label: "We figure it out each cycle", score: 2 },
      { label: "No federal awards / not applicable", score: 10 },
    ],
  },
  {
    id: "fed-vs-foundation",
    prompt:
      "Do you distinguish between federal and foundation grant compliance requirements in your tracking system?",
    options: [
      { label: "Yes, separate workflows", score: 10 },
      { label: "Same tracker, different fields", score: 7 },
      { label: "We treat them the same", score: 2 },
      { label: "No tracker", score: 0 },
    ],
  },
  {
    id: "single-audit",
    prompt: "Do you know your federal expenditure threshold for triggering a single audit?",
    options: [
      { label: "Yes — $1M of federal expenditures in a fiscal year", score: 10 },
      { label: "Roughly", score: 6 },
      { label: "No", score: 0 },
    ],
  },
  {
    id: "drawdown",
    prompt: "Do you reconcile drawdowns to actual obligated expenses before each request?",
    options: [
      { label: "Yes, every cycle", score: 10 },
      { label: "Monthly", score: 7 },
      { label: "Quarterly", score: 4 },
      { label: "Not formally", score: 0 },
    ],
  },
  {
    id: "ffata",
    prompt: "If you make subawards over $25,000, do you report them in FSRS / FFATA on time?",
    options: [
      { label: "Yes, on time every cycle", score: 10 },
      { label: "Sometimes late", score: 5 },
      { label: "Not aware of FFATA", score: 0 },
      { label: "No subawards", score: 10 },
    ],
  },
  {
    id: "cost-transfer",
    prompt: "Do you have a written cost transfer policy for federal awards?",
    options: [
      { label: "Yes, with 90-day transfer rule documented", score: 10 },
      { label: "Yes, but not detailed", score: 5 },
      { label: "No written policy", score: 0 },
    ],
  },
  {
    id: "allowability",
    prompt: "How are unallowable cost decisions documented?",
    options: [
      { label: "Memo on file with regulatory basis", score: 10 },
      { label: "Email thread or notes", score: 5 },
      { label: "Verbal between finance and program", score: 1 },
      { label: "Not sure", score: 0 },
    ],
  },
  {
    id: "matching",
    prompt:
      "Are matching and cost-share contributions tracked, valued, and supported with documentation?",
    options: [
      { label: "Yes, with valuation memos", score: 10 },
      { label: "Tracked but not formally valued", score: 5 },
      { label: "Self-reported by program staff", score: 2 },
      { label: "Not applicable", score: 10 },
    ],
  },
  {
    id: "closeout",
    prompt:
      "Do you follow a written checklist for grant closeout (final reports, drawdowns, document retention)?",
    options: [
      { label: "Yes, with sign-offs", score: 10 },
      { label: "Yes, informal", score: 6 },
      { label: "We close grants ad hoc", score: 2 },
      { label: "No closeout process", score: 0 },
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
    label = "Optimized";
    summary =
      "Compliance is institutionalized. Your processes are documented, your team is trained, and you have evidence to defend every decision. Focus on continuous improvement.";
  } else if (pct >= 75) {
    level = 4;
    label = "Managed";
    summary =
      "Most compliance areas are formalized. A few gaps remain — usually around documentation depth or written policies. Tighten those before your next federal audit.";
  } else if (pct >= 55) {
    level = 3;
    label = "Defined";
    summary =
      "You have processes, but they're not all documented. Start codifying procedures and training the second person on every critical workflow.";
  } else if (pct >= 30) {
    level = 2;
    label = "Reactive";
    summary =
      "Compliance work happens, but it's mostly reactive. Build a 90-day plan to write your top three policies and train staff on them.";
  } else {
    level = 1;
    label = "Ad hoc";
    summary =
      "Compliance is handled case by case with no written framework. This is the highest-risk posture for federal grantees. Start with Uniform Guidance familiarity and a written procurement policy.";
  }
  return {
    heading: `Maturity level ${level}: ${label} — ${score} / ${max}`,
    summary,
    links: [
      { title: "Grant Compliance Checklist", href: "/free/grant-compliance-checklist" },
      { title: "2 CFR 200 Audit Prep Checklist", href: "/free/2-cfr-200-audit-prep-checklist" },
      { title: "SF-425 Reporting Checklist", href: "/free/sf-425-reporting-checklist" },
      { title: "Single Audit Prep Timeline", href: "/free/single-audit-prep-timeline" },
      { title: "Grant Closeout Checklist", href: "/free/grant-closeout-checklist" },
    ],
  };
}

export interface GrantComplianceReadinessQuizProps {
  apiUrl: string;
  appUrl?: string;
}

export function GrantComplianceReadinessQuiz({
  apiUrl,
  appUrl,
}: GrantComplianceReadinessQuizProps) {
  return (
    <QuestionnaireShell
      introTitle="Start the Grant Compliance Readiness Quiz"
      introBlurb="Ten questions, about four minutes. Your result places you on a 1–5 maturity scale with linked guides for each gap."
      questions={QUESTIONS}
      resolveResult={resolveResult}
      apiUrl={apiUrl}
      appUrl={appUrl}
      magnetSlug="grant-compliance-readiness-quiz"
      sourcePage="/free/grant-compliance-readiness-quiz"
    />
  );
}
