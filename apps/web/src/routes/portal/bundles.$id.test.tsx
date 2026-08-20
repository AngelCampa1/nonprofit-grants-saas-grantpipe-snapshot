import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mockUsePortalBundle = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    useParams: () => ({ id: "bundle-1" }),
  }),
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
}));

vi.mock("../../hooks/use-portal-session", () => ({
  usePortalBundle: (id: string) => mockUsePortalBundle(id),
}));

vi.mock("../../lib/format", () => ({
  humanizeEnum: (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "),
  formatUtcCalendarDate: (value: string | null | undefined) =>
    !value
      ? "--"
      : new Intl.DateTimeFormat("en-US", {
          timeZone: "UTC",
          year: "numeric",
          month: "short",
          day: "numeric",
        }).format(new Date(value)),
}));

import { PortalBundlePage } from "./bundles.$id";

function makeQuery(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: undefined,
    data: {
      bundle: {
        title: "Q3 Evidence",
        purpose: "annual_audit",
        periodStart: "2026-01-01T00:00:00.000Z",
        periodEnd: "2026-03-31T00:00:00.000Z",
        description: "Supporting documentation",
      },
      items: [],
    },
    ...overrides,
  };
}

describe("PortalBundlePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePortalBundle.mockReturnValue(makeQuery());
  });

  it("passes the route id to the query", () => {
    render(<PortalBundlePage />);
    expect(mockUsePortalBundle).toHaveBeenCalledWith("bundle-1");
  });

  describe("loading state", () => {
    it("renders the loading text", () => {
      mockUsePortalBundle.mockReturnValue(makeQuery({ isLoading: true, data: undefined }));
      render(<PortalBundlePage />);
      expect(screen.getByText(/Loading bundle/)).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows the Error message when error is an Error", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({ isError: true, error: new Error("Token expired"), data: undefined }),
      );
      render(<PortalBundlePage />);
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });

    it("shows the fallback message when error is not an Error", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({ isError: true, error: "boom", data: undefined }),
      );
      render(<PortalBundlePage />);
      expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();
    });
  });

  describe("empty data", () => {
    it("renders nothing when there is no bundle and not loading/error", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({ isLoading: false, isError: false, data: undefined }),
      );
      const { container } = render(<PortalBundlePage />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("loaded — header", () => {
    it("renders the bundle title", () => {
      render(<PortalBundlePage />);
      expect(screen.getByText("Q3 Evidence")).toBeInTheDocument();
    });

    it("renders the humanized purpose", () => {
      render(<PortalBundlePage />);
      expect(screen.getByText("Annual audit")).toBeInTheDocument();
    });

    it("renders the period range", () => {
      render(<PortalBundlePage />);
      expect(screen.getByText(/Jan 1, 2026 to Mar 31, 2026/)).toBeInTheDocument();
    });

    it("renders the description", () => {
      render(<PortalBundlePage />);
      expect(screen.getByText("Supporting documentation")).toBeInTheDocument();
    });

    it("falls back to 'Evidence bundle' and omits optional fields when absent", () => {
      mockUsePortalBundle.mockReturnValue(makeQuery({ data: { bundle: {}, items: [] } }));
      render(<PortalBundlePage />);
      expect(screen.getByText("Evidence bundle")).toBeInTheDocument();
      expect(screen.queryByText("Supporting documentation")).not.toBeInTheDocument();
    });

    it("supports a raw bundle payload without a wrapping 'bundle' key", () => {
      mockUsePortalBundle.mockReturnValue(makeQuery({ data: { title: "Flat Bundle" } }));
      render(<PortalBundlePage />);
      expect(screen.getByText("Flat Bundle")).toBeInTheDocument();
    });
  });

  describe("items", () => {
    it("renders the empty-items message when items is an empty array", () => {
      render(<PortalBundlePage />);
      expect(screen.getByText("This bundle has no items.")).toBeInTheDocument();
    });

    it("treats a null items field as empty", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({ data: { bundle: { title: "X" }, items: null } }),
      );
      render(<PortalBundlePage />);
      expect(screen.getByText("This bundle has no items.")).toBeInTheDocument();
    });

    it("links grant items to the grant detail route", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [{ id: "i1", itemType: "grant", itemId: "grant-abcdefgh1", sortOrder: 0 }],
          },
        }),
      );
      render(<PortalBundlePage />);
      const link = screen.getByRole("link", { name: /Grant/ });
      expect(link).toHaveAttribute("href", "/portal/grants/$id/grant-abcdefgh1");
    });

    it("links program items (regression: previously dead-ended at home)", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [{ id: "i2", itemType: "program", itemId: "prog-1", sortOrder: 0 }],
          },
        }),
      );
      render(<PortalBundlePage />);
      const link = screen.getByRole("link", { name: /Program/ });
      expect(link).toHaveAttribute("href", "/portal/programs/$id/prog-1");
    });

    it("links restriction_term items (regression: previously dead-ended at home)", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [{ id: "i3", itemType: "restriction_term", itemId: "term-1", sortOrder: 0 }],
          },
        }),
      );
      render(<PortalBundlePage />);
      const link = screen.getByRole("link", { name: /Restriction term/ });
      expect(link).toHaveAttribute("href", "/portal/restriction-terms/$id/term-1");
    });

    it("renders a disabled card for scope types with no portal route", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [{ id: "i4", itemType: "subrecipient", itemId: "sub-1", sortOrder: 0 }],
          },
        }),
      );
      render(<PortalBundlePage />);
      expect(screen.getByTestId("portal-bundle-item-disabled-subrecipient")).toBeInTheDocument();
      expect(screen.getByText("Not available in portal")).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: /Subrecipient/ })).not.toBeInTheDocument();
    });

    it("does not render a truncated itemId fragment (Family-8 regression)", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [{ id: "i6", itemType: "grant", itemId: "grant-abcdefgh1", sortOrder: 0 }],
          },
        }),
      );
      render(<PortalBundlePage />);
      expect(screen.queryByText(/#grant-ab/)).not.toBeInTheDocument();
    });

    it("renders an item caption when present", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [
              {
                id: "i5",
                itemType: "document",
                itemId: "doc-1",
                caption: "Signed award letter",
                sortOrder: 0,
              },
            ],
          },
        }),
      );
      render(<PortalBundlePage />);
      expect(screen.getByText("Signed award letter")).toBeInTheDocument();
    });

    it("sorts items by sortOrder", () => {
      mockUsePortalBundle.mockReturnValue(
        makeQuery({
          data: {
            bundle: { title: "B" },
            items: [
              { id: "b", itemType: "grant", itemId: "grant-second", sortOrder: 2 },
              { id: "a", itemType: "fund", itemId: "fund-first", sortOrder: 1 },
            ],
          },
        }),
      );
      render(<PortalBundlePage />);
      const links = screen.getAllByRole("link").filter((el) => el.getAttribute("href") !== null);
      const itemLinks = links.filter((el) => el.getAttribute("href")?.includes("/portal/"));
      // First rendered item link should be the fund (sortOrder 1)
      const fundIndex = itemLinks.findIndex((el) =>
        el.getAttribute("href")?.includes("fund-first"),
      );
      const grantIndex = itemLinks.findIndex((el) =>
        el.getAttribute("href")?.includes("grant-second"),
      );
      expect(fundIndex).toBeLessThan(grantIndex);
    });
  });
});
