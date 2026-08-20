import {
  QuestionnaireShell,
  type QuestionnaireQuestion,
  type QuestionnaireResult,
} from "./questionnaire-shell";

const QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: "cash-reserves",
    prompt: "How many months of operating cash reserves do you hold?",
    options: [
      { label: "6 months or more", score: 10 },
      { label: "3 – 6 months", score: 7 },
      { label: "1 – 3 months", score: 3 },
      { label: "Less than 1 month", score: 0 },
    ],
  },
  {
    id: "diversification",
    prompt: "What share of revenue comes from your single largest source?",
    options: [
      { label: "Less than 25%", score: 10 },
      { label: "25 – 40%", score: 7 },
      { label: "40 – 60%", score: 4 },
      { label: "More than 60%", score: 1 },
    ],
  },
  {
    id: "restricted-balance",
    prompt: "What share of net assets is unrestricted (vs. donor-restricted)?",
    options: [
      { label: "More than 50%", score: 10 },
      { label: "30 – 50%", score: 7 },
      { label: "15 – 30%", score: 4 },
      { label: "Less than 15%", score: 1 },
    ],
  },
  {
    id: "audit",
    prompt: "What was the result of your most recent audit?",
    options: [
      { label: "Unqualified opinion, no findings", score: 10 },
      { label: "Unqualified, immaterial findings", score: 7 },
      { label: "Material weakness or significant deficiency", score: 3 },
      { label: "We haven't had an audit in 3+ years", score: 0 },
    ],
  },
  {
    id: "indirect",
    prompt: "Do you recover indirect costs on your grants?",
    options: [
      { label: "Negotiated NICRA, fully recovered", score: 10 },
      { label: "15% de minimis, applied consistently", score: 7 },
      { label: "We recover what funders allow without strategy", score: 4 },
      { label: "No indirect recovery", score: 1 },
    ],
  },
  {
    id: "debt",
    prompt: "What is your debt-to-asset ratio?",
    options: [
      { label: "Below 20%", score: 10 },
      { label: "20 – 40%", score: 6 },
      { label: "40 – 60%", score: 3 },
      { label: "Above 60% or unknown", score: 0 },
    ],
  },
  {
    id: "budget-variance",
    prompt: "How tightly does your actual performance track your annual budget?",
    options: [
      { label: "Within 5% on revenue and expense", score: 10 },
      { label: "Within 10%", score: 7 },
      { label: "Within 20%", score: 4 },
      { label: "Greater than 20% variance or untracked", score: 0 },
    ],
  },
  {
    id: "board-finance",
    prompt: "Does your board's finance committee review financials at least quarterly?",
    options: [
      { label: "Yes, with documented minutes", score: 10 },
      { label: "Yes, but minutes are sparse", score: 6 },
      { label: "Annually", score: 3 },
      { label: "No structured review", score: 0 },
    ],
  },
  {
    id: "ar-aging",
    prompt: "Are receivables (pledges, grants, contracts) aged and reviewed monthly?",
    options: [
      { label: "Yes, with aging report and follow-up", score: 10 },
      { label: "Reviewed quarterly", score: 6 },
      { label: "Reviewed at year-end", score: 3 },
      { label: "Not formally tracked", score: 0 },
    ],
  },
  {
    id: "controls",
    prompt:
      "How recently were your fiscal policies (procurement, conflict of interest, gift acceptance) updated?",
    options: [
      { label: "Within 12 months", score: 10 },
      { label: "Within 24 months", score: 7 },
      { label: "Older than 2 years", score: 3 },
      { label: "No formal policies", score: 0 },
    ],
  },
];

function resolveResult(score: number, max: number): QuestionnaireResult {
  const pct = (score / max) * 100;
  let grade: "A" | "B" | "C" | "D" | "F";
  let summary: string;
  if (pct >= 90) {
    grade = "A";
    summary =
      "Your financial position is strong and your controls are documented. Focus on long-horizon strategy: reserves build, planned giving, and capital readiness.";
  } else if (pct >= 75) {
    grade = "B";
    summary =
      "You're in solid shape, with a few specific gaps. Most often these are around revenue concentration or audit follow-through. Address them before they become structural.";
  } else if (pct >= 55) {
    grade = "C";
    summary =
      "You're functioning, but you have meaningful exposure. Reserves, revenue concentration, and indirect cost recovery are the typical pressure points. Build a 12-month strengthening plan.";
  } else if (pct >= 35) {
    grade = "D";
    summary =
      "Multiple weaknesses compound your risk. Start with a written cash forecast, an audit prep timeline, and a written gift acceptance and procurement policy.";
  } else {
    grade = "F";
    summary =
      "Your organization is in a fragile position. Stabilize cash and controls before pursuing growth. Consider engaging a fractional CFO or auditor for a one-time diagnostic.";
  }
  return {
    heading: `Financial health grade: ${grade} — ${score} / ${max}`,
    summary,
    links: [
      {
        title: "Nonprofit Financial Report Template",
        href: "/free/nonprofit-financial-report-template",
      },
      { title: "Grant Compliance Cost Audit", href: "/free/grant-compliance-cost-audit" },
      {
        title: "Indirect Cost Rate Negotiation Worksheet",
        href: "/free/indirect-cost-rate-negotiation-worksheet",
      },
      { title: "Single Audit Prep Timeline", href: "/free/single-audit-prep-timeline" },
      { title: "Cost Allocation Plan Worksheet", href: "/free/cost-allocation-plan-worksheet" },
    ],
  };
}

export interface NonprofitFinancialHealthScorecardProps {
  apiUrl: string;
  appUrl?: string;
}

export function NonprofitFinancialHealthScorecard({
  apiUrl,
  appUrl,
}: NonprofitFinancialHealthScorecardProps) {
  return (
    <QuestionnaireShell
      introTitle="Start the Financial Health Scorecard"
      introBlurb="Ten questions, about four minutes. Your result is graded A through F with linked guides for each weak area."
      questions={QUESTIONS}
      resolveResult={resolveResult}
      apiUrl={apiUrl}
      appUrl={appUrl}
      magnetSlug="nonprofit-financial-health-scorecard"
      sourcePage="/free/nonprofit-financial-health-scorecard"
    />
  );
}
