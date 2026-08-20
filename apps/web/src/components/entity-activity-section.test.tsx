import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUseEntityActivity = vi.fn();

vi.mock("../hooks/use-activity", () => ({
  useEntityActivity: (...args: unknown[]) => mockUseEntityActivity(...args),
}));

import { EntityActivitySection } from "./entity-activity-section";

describe("EntityActivitySection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEntityActivity.mockReturnValue({
      data: {
        data: [
          {
            id: "activity-1",
            action: "updated",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              status: "active",
              amountCents: 100000,
              applicationDeadline: "2026-04-15T00:00:00.000Z",
            },
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
  });

  it("renders the activity timeline", () => {
    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    expect(screen.getByText("Activity")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();
    expect(screen.getByText(/Status/)).toBeInTheDocument();
    expect(screen.getByText("$1,000")).toBeInTheDocument();
    // "amountCents" should display as "Amount" — not "Amount Cents"
    expect(screen.getByText("Amount")).toBeInTheDocument();
    expect(screen.queryByText("Amount Cents")).not.toBeInTheDocument();
    expect(screen.getByText(/Application Deadline/)).toBeInTheDocument();
    expect(screen.getByText("Apr 15, 2026")).toBeInTheDocument();
  });

  it("shows exact cents on an amount change — never rounds the audit trail", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-money",
            action: "updated",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              amountCents: 50050,
            },
            createdAt: "2026-04-01T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    // The audit trail must record the exact amount, not a silently rounded dollar.
    expect(screen.getByText("$500.50")).toBeInTheDocument();
    expect(screen.queryByText("$500")).not.toBeInTheDocument();
  });

  it("renders human-friendly change values and entries without change details", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-2",
            action: "created",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              funderType: "corporate",
              tags: ["major_donor", "board_member"],
              recurring: true,
            },
            createdAt: "2026-04-02T00:00:00.000Z",
          },
          {
            id: "activity-3",
            action: "deleted",
            entityType: "grant",
            entityId: "grant-1",
            changes: null,
            createdAt: "2026-04-03T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    expect(screen.getByText("Funder Type")).toBeInTheDocument();
    expect(screen.getByText("Corporate")).toBeInTheDocument();
    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText("Major Donor, Board Member")).toBeInTheDocument();
    expect(screen.getByText("Recurring")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
  });

  it("hides internal ids and empty values from the activity summary", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-4",
            action: "created",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              orgId: "org-1",
              funderId: "funder-1",
              startDate: null,
              status: "active",
            },
            createdAt: "2026-04-04T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    expect(screen.queryByText(/orgId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/funderId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/null/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Status/)).toBeInTheDocument();
  });

  it("keeps relationship ids that matter to the audit trail", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-5",
            action: "linked",
            entityType: "event",
            entityId: "event-1",
            changes: {
              contactId: "contact-99",
              grantId: "grant-42",
            },
            createdAt: "2026-04-05T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="event" entityId="event-1" />);

    expect(screen.getByText("Contact Id")).toBeInTheDocument();
    expect(screen.getByText("contact-99")).toBeInTheDocument();
    expect(screen.getByText("Grant Id")).toBeInTheDocument();
    expect(screen.getByText("grant-42")).toBeInTheDocument();
  });

  it("filters empty-string change values and serializes object values as JSON", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-6",
            action: "updated",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              // empty string should be filtered out
              description: "   ",
              // object value should be JSON.stringified and shown
              metadata: { region: "midwest" },
              // array with a non-primitive item should JSON.stringify the item
              attachments: [{ name: "doc.pdf" }],
            },
            createdAt: "2026-04-06T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    // Empty-string value should not appear
    expect(screen.queryByText("Description")).not.toBeInTheDocument();
    // Object value should be serialized
    expect(screen.getByText(/\{.*midwest.*\}/)).toBeInTheDocument();
    // Array with non-primitive items — item should be JSON-stringified
    expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument();
  });

  it("preserves raw string values that look like emails or URLs", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: {
        data: [
          {
            id: "activity-7",
            action: "updated",
            entityType: "grant",
            entityId: "grant-1",
            changes: {
              // email address — not an id key but contains @, should be preserved as-is
              contactEmail: "grant@example.org",
              // URL — should be preserved as-is
              reportUrl: "https://example.org/report",
            },
            createdAt: "2026-04-07T00:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
    });

    render(<EntityActivitySection entityType="grant" entityId="grant-1" />);

    expect(screen.getByText("grant@example.org")).toBeInTheDocument();
    expect(screen.getByText("https://example.org/report")).toBeInTheDocument();
  });

  it("renders loading, empty, and error states", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { rerender } = render(<EntityActivitySection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("Loading activity…")).toBeInTheDocument();

    mockUseEntityActivity.mockReturnValueOnce({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    rerender(<EntityActivitySection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("No activity yet")).toBeInTheDocument();

    mockUseEntityActivity.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Activity failed"),
    });
    rerender(<EntityActivitySection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("Activity failed")).toBeInTheDocument();

    mockUseEntityActivity.mockReturnValueOnce({
      data: undefined,
      isLoading: false,
      isError: true,
      error: "unknown",
    });
    rerender(<EntityActivitySection entityType="grant" entityId="grant-1" />);
    expect(screen.getByText("Unable to load activity.")).toBeInTheDocument();
  });

  it("renders styled loading and empty panels instead of plain text", () => {
    mockUseEntityActivity.mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    const { container, rerender } = render(
      <EntityActivitySection entityType="funder" entityId="funder-1" />,
    );

    expect(container.querySelector("[data-slot='activity-loading']")).toBeInTheDocument();

    mockUseEntityActivity.mockReturnValueOnce({
      data: { data: [] },
      isLoading: false,
      isError: false,
    });
    rerender(<EntityActivitySection entityType="funder" entityId="funder-1" />);

    expect(screen.getByText("No activity yet")).toBeInTheDocument();
    expect(screen.getByText("Changes to this record will show up here.")).toBeInTheDocument();
    expect(container.querySelector("[data-slot='activity-empty']")).toHaveClass(
      "rounded-2xl",
      "border",
      "border-dashed",
      "bg-muted/40",
    );
  });
});
