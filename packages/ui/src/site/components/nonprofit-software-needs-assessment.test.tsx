import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./questionnaire-shell", () => ({
  QuestionnaireShell: (props: {
    apiUrl: string;
    appUrl?: string;
    magnetSlug: string;
    sourcePage: string;
    questions: { id: string }[];
    resolveResult: (score: number, max: number) => { heading: string };
  }) => (
    <div>
      <span data-testid="apiUrl">{props.apiUrl}</span>
      <span data-testid="appUrl">{props.appUrl ?? ""}</span>
      <span data-testid="magnet">{props.magnetSlug}</span>
      <span data-testid="source">{props.sourcePage}</span>
      <span data-testid="count">{props.questions.length}</span>
      <span data-testid="starter">{props.resolveResult(0, 1000).heading}</span>
      <span data-testid="growth">{props.resolveResult(600, 1000).heading}</span>
      <span data-testid="audit-ready">{props.resolveResult(900, 1000).heading}</span>
    </div>
  ),
}));

import { NonprofitSoftwareNeedsAssessment } from "./nonprofit-software-needs-assessment";

describe("NonprofitSoftwareNeedsAssessment", () => {
  it("renders shell with correct props", () => {
    render(<NonprofitSoftwareNeedsAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("apiUrl").textContent).toBe("https://api.test");
    expect(screen.getByTestId("magnet").textContent).toBe("nonprofit-software-needs-assessment");
    expect(screen.getByTestId("source").textContent).toBe(
      "/free/nonprofit-software-needs-assessment",
    );
  });

  it("has 10 questions", () => {
    render(<NonprofitSoftwareNeedsAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("count").textContent).toBe("10");
  });

  it("maps thresholds to Starter / Growth / Audit-Ready tiers", () => {
    render(<NonprofitSoftwareNeedsAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("starter").textContent).toMatch(/Starter/);
    expect(screen.getByTestId("growth").textContent).toMatch(/Growth/);
    expect(screen.getByTestId("audit-ready").textContent).toMatch(/Audit-Ready/);
    expect(screen.getByTestId("audit-ready").textContent).not.toMatch(/Pro/);
  });

  it("threads appUrl to the shell when provided", () => {
    render(
      <NonprofitSoftwareNeedsAssessment
        apiUrl="https://api.test"
        appUrl="https://app.grantpipe.com/signup"
      />,
    );
    expect(screen.getByTestId("appUrl").textContent).toBe("https://app.grantpipe.com/signup");
  });

  it("omits appUrl from the shell when not provided", () => {
    render(<NonprofitSoftwareNeedsAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("appUrl").textContent).toBe("");
  });
});
