import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: () => ({ extractionId: "extraction-1" }),
  }),
}));

vi.mock("@grantpipe/ui", () => ({
  PageShell: ({ children }: { children?: React.ReactNode }) => (
    <div data-slot="page-shell">{children}</div>
  ),
  PageHeader: ({
    title,
    description,
    kicker,
    variant: _variant,
  }: {
    title: string;
    description?: string;
    kicker?: string;
    variant?: string;
  }) => (
    <header>
      {kicker ? <p>{kicker}</p> : null}
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
    </header>
  ),
}));

vi.mock("../../../components/document-extractions/extraction-review", () => ({
  ExtractionReview: ({ extractionId }: { extractionId: string }) => (
    <div data-testid="extraction-review">{extractionId}</div>
  ),
}));

import { AwardIntakeReviewPage } from "./$extractionId";

describe("AwardIntakeReviewPage", () => {
  it("passes the route extraction id to the review component", () => {
    render(<AwardIntakeReviewPage />);

    expect(screen.getByRole("heading", { name: "AI Award Intake" })).toBeVisible();
    expect(screen.getByTestId("extraction-review")).toHaveTextContent("extraction-1");
  });
});
