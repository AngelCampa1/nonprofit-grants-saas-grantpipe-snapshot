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
      <span data-testid="strongResult">{props.resolveResult(800, 1000).heading}</span>
      <span data-testid="developingResult">{props.resolveResult(600, 1000).heading}</span>
      <span data-testid="foundationalResult">{props.resolveResult(400, 1000).heading}</span>
      <span data-testid="lowResult">{props.resolveResult(0, 1000).heading}</span>
    </div>
  ),
}));

import { DonorManagementMaturityAssessment } from "./donor-management-maturity-assessment";

describe("DonorManagementMaturityAssessment", () => {
  it("renders shell with correct props", () => {
    render(<DonorManagementMaturityAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("apiUrl").textContent).toBe("https://api.test");
    expect(screen.getByTestId("magnet").textContent).toBe("donor-management-maturity-assessment");
    expect(screen.getByTestId("source").textContent).toBe(
      "/free/donor-management-maturity-assessment",
    );
  });

  it("has 12 questions", () => {
    render(<DonorManagementMaturityAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("count").textContent).toBe("12");
  });

  it("maps thresholds to maturity levels", () => {
    render(<DonorManagementMaturityAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("topResult").textContent).toContain("Maturity level 5");
    expect(screen.getByTestId("strongResult").textContent).toContain("Maturity level 4");
    expect(screen.getByTestId("developingResult").textContent).toContain("Maturity level 3");
    expect(screen.getByTestId("foundationalResult").textContent).toContain("Maturity level 2");
    expect(screen.getByTestId("lowResult").textContent).toContain("Maturity level 1");
  });

  it("threads appUrl to the shell when provided", () => {
    render(
      <DonorManagementMaturityAssessment
        apiUrl="https://api.test"
        appUrl="https://app.grantpipe.com/signup"
      />,
    );
    expect(screen.getByTestId("appUrl").textContent).toBe("https://app.grantpipe.com/signup");
  });

  it("omits appUrl from the shell when not provided", () => {
    render(<DonorManagementMaturityAssessment apiUrl="https://api.test" />);
    expect(screen.getByTestId("appUrl").textContent).toBe("");
  });
});
