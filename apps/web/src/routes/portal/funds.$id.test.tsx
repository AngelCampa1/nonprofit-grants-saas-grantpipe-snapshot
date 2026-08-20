import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mockUsePortalFund = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (_path: string) => (config: { component: React.ComponentType }) => ({
    ...config,
    useParams: () => ({ id: "fund-1" }),
  }),
  Link: ({
    children,
    to,
    className,
  }: {
    children: React.ReactNode;
    to: string;
    className?: string;
  }) => React.createElement("a", { href: to, className }, children),
}));

vi.mock("../../hooks/use-portal-session", () => ({
  usePortalFund: (id: string) => mockUsePortalFund(id),
}));

vi.mock("../../lib/format", () => ({
  humanizeEnum: (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "),
}));

import { PortalFundPage } from "./funds.$id";

function makeQuery(overrides: Record<string, unknown> = {}) {
  return {
    isLoading: false,
    isError: false,
    error: undefined,
    data: {
      id: "fund-1",
      name: "Youth Programs Fund",
      type: "restricted",
      description: "Supports the after-school program.",
    },
    ...overrides,
  };
}

describe("PortalFundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePortalFund.mockReturnValue(makeQuery());
  });

  it("passes the route id to the query", () => {
    render(<PortalFundPage />);
    expect(mockUsePortalFund).toHaveBeenCalledWith("fund-1");
  });

  describe("loading state", () => {
    it("renders the loading skeleton", () => {
      mockUsePortalFund.mockReturnValue(makeQuery({ isLoading: true, data: undefined }));
      render(<PortalFundPage />);
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  describe("error state", () => {
    it("shows the Error message when error is an Error", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ isError: true, error: new Error("Token expired"), data: undefined }),
      );
      render(<PortalFundPage />);
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });

    it("shows the fallback message when error is not an Error", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ isError: true, error: "boom", data: undefined }),
      );
      render(<PortalFundPage />);
      expect(screen.getByText("You may not have access to this record.")).toBeInTheDocument();
    });
  });

  describe("empty data", () => {
    it("renders nothing when there is no fund and not loading/error", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ isLoading: false, isError: false, data: undefined }),
      );
      const { container } = render(<PortalFundPage />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("loaded — raw fund row contract", () => {
    it("renders the fund name", () => {
      render(<PortalFundPage />);
      expect(screen.getByText("Youth Programs Fund")).toBeInTheDocument();
    });

    it("renders the humanized fund type using the raw 'type' column, not 'fundType'", () => {
      render(<PortalFundPage />);
      expect(screen.getByText("Restricted")).toBeInTheDocument();
    });

    it("renders the description", () => {
      render(<PortalFundPage />);
      expect(screen.getByText("Supports the after-school program.")).toBeInTheDocument();
    });

    it("does not render any balance labels, since the raw fund row has no balance columns", () => {
      render(<PortalFundPage />);
      expect(screen.queryByText("Balance")).not.toBeInTheDocument();
      expect(screen.queryByText("Initial balance")).not.toBeInTheDocument();
    });

    it("falls back to 'Fund' when name is absent", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ data: { id: "fund-2", type: "unrestricted" } }),
      );
      render(<PortalFundPage />);
      expect(screen.getByText("Fund")).toBeInTheDocument();
    });

    it("omits the type line when type is absent", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ data: { id: "fund-2", name: "No Type Fund" } }),
      );
      render(<PortalFundPage />);
      expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
    });

    it("omits the description block when description is absent", () => {
      mockUsePortalFund.mockReturnValue(
        makeQuery({ data: { id: "fund-2", name: "No Description Fund", type: "restricted" } }),
      );
      render(<PortalFundPage />);
      expect(screen.queryByText("Description")).not.toBeInTheDocument();
    });
  });
});
