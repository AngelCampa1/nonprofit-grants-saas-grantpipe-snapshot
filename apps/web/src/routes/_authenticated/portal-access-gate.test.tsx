import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../lib/http-response";

const {
  mockUseSession,
  mockUseSessions,
  mockUseReviewers,
  mockUseAuditEvents,
  mockUseSessionMutations,
  mockUseReviewerMutations,
} = vi.hoisted(() => ({
  mockUseSession: vi.fn(),
  mockUseSessions: vi.fn(),
  mockUseReviewers: vi.fn(),
  mockUseAuditEvents: vi.fn(),
  mockUseSessionMutations: vi.fn(),
  mockUseReviewerMutations: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: (path: string) => (config: { component: unknown }) => ({ ...config, path }),
  Link: ({ children, to, hash }: { children: React.ReactNode; to: string; hash?: string }) => (
    <a href={hash ? `${to}#${hash}` : to}>{children}</a>
  ),
}));

vi.mock("../../hooks/use-session", () => ({
  useSession: mockUseSession,
}));

vi.mock("../../hooks/use-external-reviewers", () => ({
  useSessions: mockUseSessions,
  useReviewers: mockUseReviewers,
  useAuditEvents: mockUseAuditEvents,
  useSessionMutations: mockUseSessionMutations,
  useReviewerMutations: mockUseReviewerMutations,
}));

import { PortalAccessSettingsPage } from "./settings.portal-access";

describe("PortalAccessSettingsPage plan gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ memberRole: "admin" });
    mockUseSessionMutations.mockReturnValue({});
    mockUseReviewerMutations.mockReturnValue({});
  });

  it("renders one Audit-Ready upgrade state for reviewer 402s instead of raw alerts", () => {
    const gateError = new ApiError("Upgrade required", 402, "insufficient_plan");
    mockUseSessions.mockReturnValue({ isLoading: false, isError: true, error: gateError });
    mockUseReviewers.mockReturnValue({ isLoading: false, isError: true, error: gateError });
    mockUseAuditEvents.mockReturnValue({ isLoading: false, isError: true, error: gateError });

    render(<PortalAccessSettingsPage />);

    expect(screen.getByText("Audit-Ready plan required")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open billing settings" })).toHaveAttribute(
      "href",
      "/settings#billing",
    );
    expect(screen.queryByText(/Failed to load sessions: 402/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load reviewers: 402/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Failed to load audit events: 402/i)).not.toBeInTheDocument();
  });
});
