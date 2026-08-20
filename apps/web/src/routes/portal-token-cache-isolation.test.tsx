import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockNavigate, mockParams } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockParams: vi.fn(() => ({ token: "token-b" })),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    path,
    useParams: mockParams,
  }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) =>
    React.createElement("a", { href: to }, children),
  Outlet: () => <div>Portal child route</div>,
  useNavigate: () => mockNavigate,
}));

import { Route as PortalRoute } from "./portal";
import { PortalTokenPage } from "./portal/$token";

const PortalLayout = (PortalRoute as unknown as { component: React.ComponentType })
  .component as React.ComponentType;

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

describe("portal token cache isolation", () => {
  it("does not keep reviewer A identity visible when reviewer B token exchange fails", async () => {
    const client = createClient();
    client.setQueryData(["portal-session"], {
      reviewer: {
        id: "reviewer-a",
        email: "reviewer-a@example.org",
        name: "Reviewer A",
        reviewerType: "auditor",
      },
      session: {
        id: "session-a",
        purpose: "Prior audit",
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        revokedAt: null,
        orgId: "org-1",
      },
      scopes: [],
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Expired link" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );

    render(
      <QueryClientProvider client={client}>
        <PortalLayout />
        <PortalTokenPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Access link invalid")).toBeInTheDocument();
    expect(screen.queryByText("Reviewer A")).not.toBeInTheDocument();
    expect(screen.queryByText("Verified access")).not.toBeInTheDocument();
  });
});
