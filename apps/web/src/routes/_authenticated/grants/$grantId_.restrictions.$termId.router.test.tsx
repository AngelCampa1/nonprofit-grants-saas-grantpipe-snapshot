import React from "react";
import { render, screen } from "@testing-library/react";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { describe, expect, it, vi } from "vitest";

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

import { GrantRestrictionTermContent } from "./$grantId_.restrictions.$termId.lazy";

describe("grant restriction route matching", () => {
  it("renders the exact restriction page instead of the legacy grant detail page", async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const grantDetailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "grants/$grantId",
      component: () => <div>Legacy grant detail</div>,
    });
    const restrictionRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "grants/$grantId/restrictions/$termId",
      component: function RestrictionRouteComponent() {
        const { grantId, termId } = restrictionRoute.useParams();
        return <GrantRestrictionTermContent grantId={grantId} termId={termId} />;
      },
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([grantDetailRoute, restrictionRoute]),
      history: createMemoryHistory({
        initialEntries: ["/grants/grant-1/restrictions/term-1"],
      }),
    });

    await router.load();
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole("region", { name: "Restriction lifecycle" })).toHaveAttribute(
      "data-grant-id",
      "grant-1",
    );
    expect(screen.getByRole("region", { name: "Restriction lifecycle" })).toHaveAttribute(
      "data-highlight-term",
      "term-1",
    );
    expect(screen.queryByText("Legacy grant detail")).not.toBeInTheDocument();
  });
});
