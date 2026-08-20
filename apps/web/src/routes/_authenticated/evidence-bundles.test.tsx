import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
  }),
  Outlet: () => <div data-testid="evidence-bundles-outlet" />,
  Link: ({ children }: { children?: React.ReactNode }) => <a>{children}</a>,
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: () => ({ memberRole: "admin" }),
}));

vi.mock("../../hooks/use-external-reviewers", () => ({
  useBundles: () => ({ data: { data: [] }, isLoading: false, isError: false }),
  useBundleMutations: () => ({
    createBundle: { mutateAsync: vi.fn(), isPending: false },
  }),
}));

import { EvidenceBundlesRoute } from "./evidence-bundles";

describe("EvidenceBundlesRoute", () => {
  it("renders the nested evidence bundle outlet", () => {
    render(<EvidenceBundlesRoute />);

    expect(screen.getByTestId("evidence-bundles-outlet")).toBeVisible();
  });
});
