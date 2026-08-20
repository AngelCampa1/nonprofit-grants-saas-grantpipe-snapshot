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
      <span data-testid="topResult">{props.resolveResult(1000, 1000).heading}</span>
      <span data-testid="bResult">{props.resolveResult(800, 1000).heading}</span>
      <span data-testid="cResult">{props.resolveResult(600, 1000).heading}</span>
      <span data-testid="dResult">{props.resolveResult(400, 1000).heading}</span>
      <span data-testid="lowResult">{props.resolveResult(0, 1000).heading}</span>
    </div>
  ),
}));

import { NonprofitFinancialHealthScorecard } from "./nonprofit-financial-health-scorecard";

describe("NonprofitFinancialHealthScorecard", () => {
  it("renders shell with correct props", () => {
    render(<NonprofitFinancialHealthScorecard apiUrl="https://api.test" />);
    expect(screen.getByTestId("apiUrl").textContent).toBe("https://api.test");
    expect(screen.getByTestId("magnet").textContent).toBe("nonprofit-financial-health-scorecard");
    expect(screen.getByTestId("source").textContent).toBe(
      "/free/nonprofit-financial-health-scorecard",
    );
  });

  it("has 10 questions", () => {
    render(<NonprofitFinancialHealthScorecard apiUrl="https://api.test" />);
    expect(screen.getByTestId("count").textContent).toBe("10");
  });

  it("maps thresholds to letter grades", () => {
    render(<NonprofitFinancialHealthScorecard apiUrl="https://api.test" />);
    expect(screen.getByTestId("topResult").textContent).toContain("Financial health grade: A");
    expect(screen.getByTestId("bResult").textContent).toContain("Financial health grade: B");
    expect(screen.getByTestId("cResult").textContent).toContain("Financial health grade: C");
    expect(screen.getByTestId("dResult").textContent).toContain("Financial health grade: D");
    expect(screen.getByTestId("lowResult").textContent).toContain("Financial health grade: F");
  });

  it("threads appUrl to the shell when provided", () => {
    render(
      <NonprofitFinancialHealthScorecard
        apiUrl="https://api.test"
        appUrl="https://app.grantpipe.com/signup"
      />,
    );
    expect(screen.getByTestId("appUrl").textContent).toBe("https://app.grantpipe.com/signup");
  });

  it("omits appUrl from the shell when not provided", () => {
    render(<NonprofitFinancialHealthScorecard apiUrl="https://api.test" />);
    expect(screen.getByTestId("appUrl").textContent).toBe("");
  });
});
