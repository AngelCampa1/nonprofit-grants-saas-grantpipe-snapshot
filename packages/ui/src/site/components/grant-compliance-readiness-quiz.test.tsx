import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./questionnaire-shell", () => ({
  QuestionnaireShell: (props: {
    apiUrl: string;
    magnetSlug: string;
    sourcePage: string;
    questions: { id: string }[];
    resolveResult: (score: number, max: number) => { heading: string };
  }) => (
    <div>
      <span data-testid="apiUrl">{props.apiUrl}</span>
      <span data-testid="magnet">{props.magnetSlug}</span>
      <span data-testid="source">{props.sourcePage}</span>
      <span data-testid="count">{props.questions.length}</span>
      <span data-testid="topResult">{props.resolveResult(1000, 1000).heading}</span>
      <span data-testid="managedResult">{props.resolveResult(800, 1000).heading}</span>
      <span data-testid="definedResult">{props.resolveResult(600, 1000).heading}</span>
      <span data-testid="reactiveResult">{props.resolveResult(400, 1000).heading}</span>
      <span data-testid="lowResult">{props.resolveResult(0, 1000).heading}</span>
    </div>
  ),
}));

import { GrantComplianceReadinessQuiz } from "./grant-compliance-readiness-quiz";

describe("GrantComplianceReadinessQuiz", () => {
  it("renders shell with correct props", () => {
    render(<GrantComplianceReadinessQuiz apiUrl="https://api.test" />);
    expect(screen.getByTestId("apiUrl").textContent).toBe("https://api.test");
    expect(screen.getByTestId("magnet").textContent).toBe("grant-compliance-readiness-quiz");
    expect(screen.getByTestId("source").textContent).toBe("/free/grant-compliance-readiness-quiz");
  });

  it("has 10 questions", () => {
    render(<GrantComplianceReadinessQuiz apiUrl="https://api.test" />);
    expect(screen.getByTestId("count").textContent).toBe("10");
  });

  it("maps thresholds to maturity levels", () => {
    render(<GrantComplianceReadinessQuiz apiUrl="https://api.test" />);
    expect(screen.getByTestId("topResult").textContent).toContain("Maturity level 5");
    expect(screen.getByTestId("managedResult").textContent).toContain("Maturity level 4");
    expect(screen.getByTestId("definedResult").textContent).toContain("Maturity level 3");
    expect(screen.getByTestId("reactiveResult").textContent).toContain("Maturity level 2");
    expect(screen.getByTestId("lowResult").textContent).toContain("Maturity level 1");
  });
});
