import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mockNavigate = vi.fn();
const mockUsePortalSession = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: { component: React.ComponentType }) => config,
  Link: ({
    children,
    to,
    params,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    params?: Record<string, string>;
    className?: string;
  }) =>
    React.createElement(
      "a",
      { href: `${to}${params ? `/${params.id}` : ""}`, className },
      children,
    ),
  useNavigate: () => mockNavigate,
}));

vi.mock("../../hooks/use-portal-session", () => ({
  usePortalSession: () => mockUsePortalSession(),
}));

vi.mock("../../lib/format", () => ({
  humanizeEnum: (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "),
}));

import { PortalHomePage, getScopeRoute } from "./home";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    data: {
      reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
      session: { id: "s1", purpose: "Annual audit review" },
      scopes: [],
    },
    ...overrides,
  };
}

describe("PortalHomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePortalSession.mockReturnValue(makeSession());
  });

  // FIX 3 — WEB-SHELL-04: loading state must have role=status
  describe("loading state", () => {
    it("renders role=status on the loading container", () => {
      mockUsePortalSession.mockReturnValue(makeSession({ isLoading: true, data: undefined }));

      render(<PortalHomePage />);

      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    it("renders aria-live=polite on the loading container", () => {
      mockUsePortalSession.mockReturnValue(makeSession({ isLoading: true, data: undefined }));

      render(<PortalHomePage />);

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("includes the loading text", () => {
      mockUsePortalSession.mockReturnValue(makeSession({ isLoading: true, data: undefined }));

      render(<PortalHomePage />);

      const matches = screen.getAllByText(/Loading your review materials/);
      expect(matches.length).toBeGreaterThan(0);
    });

    it("renders skeleton placeholder bars while loading", () => {
      mockUsePortalSession.mockReturnValue(makeSession({ isLoading: true, data: undefined }));

      const { container } = render(<PortalHomePage />);

      const skeletons = container.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("error state", () => {
    it("redirects to /portal when session is in error", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({ isError: true, isLoading: false, data: undefined }),
      );

      render(<PortalHomePage />);

      expect(mockNavigate).toHaveBeenCalledWith({ to: "/portal" });
    });
  });

  describe("no data state", () => {
    it("renders nothing when data is undefined and not loading", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({ isLoading: false, isError: false, data: undefined }),
      );

      const { container } = render(<PortalHomePage />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("loaded state", () => {
    it("renders the reviewer welcome heading", () => {
      render(<PortalHomePage />);

      expect(screen.getByText(/Welcome, Jane Doe/)).toBeInTheDocument();
    });

    it("renders a board portal heading for board members", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: {
              id: "r1",
              name: "Maya Board",
              email: "maya@board.example",
              reviewerType: "board",
            },
            session: { id: "s1", purpose: "April board meeting" },
            scopes: [],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByRole("heading", { name: "Board portal" })).toBeInTheDocument();
      expect(screen.getByText("Welcome, Maya Board.")).toBeInTheDocument();
      expect(screen.getByText("April board meeting")).toBeInTheDocument();
    });

    it("pulls board packet reports and board review bundles into a board packet section", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: {
              id: "r1",
              name: "Maya Board",
              email: "maya@board.example",
              reviewerType: "board",
            },
            session: { id: "s1", purpose: "April board meeting" },
            scopes: [
              {
                id: "sc1",
                scopeType: "generated_report",
                scopeId: "report-1",
                scopeName: "April board packet",
              },
              {
                id: "sc2",
                scopeType: "evidence_bundle",
                scopeId: "bundle-1",
                scopeName: "Finance committee files",
              },
              {
                id: "sc3",
                scopeType: "fund",
                scopeId: "fund-1",
                scopeName: "Scholarship Fund",
              },
            ],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByRole("heading", { name: "Board packets" })).toBeInTheDocument();
      expect(screen.getByText("April board packet")).toBeInTheDocument();
      expect(screen.getByText("Finance committee files")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Other shared records" })).toBeInTheDocument();
      expect(screen.getByText("Scholarship Fund")).toBeInTheDocument();
    });

    it("keeps unsupported board portal scopes disabled instead of linking them", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: {
              id: "r1",
              name: "Maya Board",
              email: "maya@board.example",
              reviewerType: "board",
            },
            session: { id: "s1", purpose: "April board meeting" },
            scopes: [
              {
                id: "sc1",
                scopeType: "activity_log",
                scopeId: "event-1",
                scopeName: "Packet approval event",
              },
            ],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByRole("heading", { name: "Other shared records" })).toBeInTheDocument();
      expect(screen.getByText("Packet approval event")).toBeInTheDocument();
      expect(screen.getByTestId("portal-scope-disabled-activity_log")).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("shows session purpose when present", () => {
      render(<PortalHomePage />);

      expect(screen.getByText(/Annual audit review/)).toBeInTheDocument();
    });

    it("renders empty state when scopes array is empty", () => {
      render(<PortalHomePage />);

      expect(screen.getByText("No materials available yet")).toBeInTheDocument();
    });

    it("renders scope links for known scope types", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
            session: { id: "s1", purpose: null },
            scopes: [
              {
                id: "sc1",
                scopeType: "grant",
                scopeId: "grant-abc123",
                scopeName: "Annual Operating Grant",
              },
              { id: "sc2", scopeType: "fund", scopeId: "fund-def456", scopeName: "Building Fund" },
            ],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByText(/Grants/i)).toBeInTheDocument();
      expect(screen.getByText(/Funds/i)).toBeInTheDocument();
    });

    it("shows the resolved entity name and never a truncated UUID", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
            session: { id: "s1", purpose: null },
            scopes: [
              {
                id: "sc1",
                scopeType: "grant",
                scopeId: "grant-abc123def",
                scopeName: "Annual Operating Grant",
              },
            ],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByText("Annual Operating Grant")).toBeInTheDocument();
      expect(screen.queryByText(/#grant-ab/)).not.toBeInTheDocument();
    });

    it("falls back to the humanized type when no entity name is resolved", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
            session: { id: "s1", purpose: null },
            scopes: [{ id: "sc1", scopeType: "grant", scopeId: "grant-xyz", scopeName: null }],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.queryByText(/#grant-xy/)).not.toBeInTheDocument();
      // Section heading "Grants" plus the card fallback "Grant" both render.
      expect(screen.getByText("Grant")).toBeInTheDocument();
    });

    it("never renders the literal '->' text on a scope row with a known route", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
            session: { id: "s1", purpose: null },
            scopes: [
              {
                id: "sc1",
                scopeType: "grant",
                scopeId: "grant-abc123",
                scopeName: "Annual Operating Grant",
              },
            ],
          },
        }),
      );

      const { container } = render(<PortalHomePage />);

      expect(container.textContent).not.toContain("->");
      const scopeLink = screen.getByRole("link", { name: /Annual Operating Grant/ });
      expect(scopeLink.querySelector("svg")).toBeInTheDocument();
    });

    it("renders disabled card for unknown scope types", () => {
      mockUsePortalSession.mockReturnValue(
        makeSession({
          data: {
            reviewer: { id: "r1", name: "Jane Doe", email: "jane@auditor.com" },
            session: { id: "s1", purpose: null },
            scopes: [{ id: "sc3", scopeType: "unknown_type", scopeId: "unk-001" }],
          },
        }),
      );

      render(<PortalHomePage />);

      expect(screen.getByTestId("portal-scope-disabled-unknown_type")).toBeInTheDocument();
      expect(screen.getByText("Coming soon for this scope")).toBeInTheDocument();
    });
  });
});

describe("getScopeRoute", () => {
  it("returns a grant route", () => {
    expect(getScopeRoute("grant", "g1")).toEqual({
      to: "/portal/grants/$id",
      params: { id: "g1" },
    });
  });

  it("returns a fund route", () => {
    expect(getScopeRoute("fund", "f1")).toEqual({
      to: "/portal/funds/$id",
      params: { id: "f1" },
    });
  });

  it("returns a document route", () => {
    expect(getScopeRoute("document", "d1")).toEqual({
      to: "/portal/documents/$id",
      params: { id: "d1" },
    });
  });

  it("returns a generated_report route", () => {
    expect(getScopeRoute("generated_report", "r1")).toEqual({
      to: "/portal/generated-reports/$id",
      params: { id: "r1" },
    });
  });

  it("returns an evidence_bundle route", () => {
    expect(getScopeRoute("evidence_bundle", "b1")).toEqual({
      to: "/portal/bundles/$id",
      params: { id: "b1" },
    });
  });

  it("returns a program route", () => {
    expect(getScopeRoute("program", "p1")).toEqual({
      to: "/portal/programs/$id",
      params: { id: "p1" },
    });
  });

  it("returns a restriction_term route", () => {
    expect(getScopeRoute("restriction_term", "t1")).toEqual({
      to: "/portal/restriction-terms/$id",
      params: { id: "t1" },
    });
  });

  it("returns null for unknown scope types", () => {
    expect(getScopeRoute("something_else", "x1")).toBeNull();
  });
});
