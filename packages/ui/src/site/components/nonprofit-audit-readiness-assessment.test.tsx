import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./questionnaire-shell", () => ({
  QuestionnaireShell: (props: {
    apiUrl: string;
    appUrl?: string;
    magnetSlug: string;
    sourcePage: string;
    questions: { id: string }[];
    resolveResult: (
      score: number,
      max: number,
    ) => { heading: string; summary: string; links: { title: string; href: string }[] };
  }) => (
    <div data-testid="shell">
      <span data-testid="apiUrl">{props.apiUrl}</span>
      <span data-testid="appUrl">{props.appUrl ?? ""}</span>
      <span data-testid="magnet">{props.magnetSlug}</span>
      <span data-testid="source">{props.sourcePage}</span>
      <span data-testid="count">{props.questions.length}</span>
      <span data-testid="topResult">{props.resolveResult(1000, 1000).heading}</span>
      <span data-testid="midResult">{props.resolveResult(700, 1000).heading}</span>
      <span data-testid="lowResult">{props.resolveResult(0, 1000).heading}</span>
    </div>
  ),
}));

import { NonprofitAuditReadinessAssessment } from "./nonprofit-audit-readiness-assessment";

describe("NonprofitAuditReadinessAssessment", () => {
  it("renders shell with correct props", () => {
    render(<NonprofitAuditReadinessAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("apiUrl").textContent).toBe("https://api.test");
    expect(screen.getByTestId("magnet").textContent).toBe("nonprofit-audit-readiness-assessment");
    expect(screen.getByTestId("source").textContent).toBe(
      "/free/nonprofit-audit-readiness-assessment",
    );
  });

  it("has 12 questions", () => {
    render(<NonprofitAuditReadinessAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("count").textContent).toBe("12");
  });

  it("maps thresholds to expected verdict tiers", () => {
    render(<NonprofitAuditReadinessAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("topResult").textContent).toMatch(/Audit-ready/);
    expect(screen.getByTestId("midResult").textContent).toMatch(/At risk/);
    expect(screen.getByTestId("lowResult").textContent).toMatch(/Not audit-ready/);
  });

  it("threads appUrl to the shell when provided", () => {
    render(
      <NonprofitAuditReadinessAssessment
        apiUrl="https://api.test"
        appUrl="https://app.grantpipe.com/signup"
      />,
    );
    expect(screen.getByTestId("appUrl").textContent).toBe("https://app.grantpipe.com/signup");
  });

  it("omits appUrl from the shell when not provided", () => {
    render(<NonprofitAuditReadinessAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("appUrl").textContent).toBe("");
  });
});
