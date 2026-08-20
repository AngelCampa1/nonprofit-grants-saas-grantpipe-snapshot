import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: Record<string, unknown>) => config,
  createLazyFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ grantId: "grant-1", termId: "term-1" }),
  }),
}));

vi.mock("../../../components/restrictions/restriction-lifecycle-panel", () => ({
  RestrictionLifecyclePanel: ({
    grantId,
    highlightTermId,
  }: {
    grantId?: string;
    highlightTermId?: string;
  }) => (
    <section
      aria-label="Restriction lifecycle"
      data-grant-id={grantId}
      data-highlight-term={highlightTermId}
    />
  ),
}));

import { Route as RouteShell } from "./$grantId_.restrictions.$termId";
import { GrantRestrictionTermPage } from "./$grantId_.restrictions.$termId.lazy";

describe("GrantRestrictionTermPage", () => {
  it("keeps the generated route shell free of eager component imports", () => {
    expect(RouteShell).toEqual({});
  });

  it("locates the exact restriction term under its owning grant", () => {
    render(<GrantRestrictionTermPage />);

    expect(screen.getByRole("region", { name: "Restriction lifecycle" })).toHaveAttribute(
      "data-grant-id",
      "grant-1",
    );
    expect(screen.getByRole("region", { name: "Restriction lifecycle" })).toHaveAttribute(
      "data-highlight-term",
      "term-1",
    );
  });
});
