import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    CommandDialog: ({
      open,
      onOpenChange,
      children,
      title,
      description: _description,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      children: React.ReactNode;
      title?: string;
      description?: string;
    }) =>
      open
        ? React.createElement(
            "div",
            {
              role: "dialog",
              "aria-label": title ?? "Command palette",
              "data-testid": "command-dialog",
            },
            React.createElement(
              "button",
              { onClick: () => onOpenChange(false), "aria-label": "Close" },
              "✕",
            ),
            children,
          )
        : null,
    CommandInput: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("input", {
        role: "combobox",
        placeholder,
        "data-testid": "command-input",
        "aria-autocomplete": "list",
      }),
    CommandList: ({ children }: { children: React.ReactNode }) =>
      React.createElement("ul", { role: "listbox", "data-testid": "command-list" }, children),
    CommandEmpty: ({ children }: { children: React.ReactNode }) =>
      React.createElement("li", { "data-testid": "command-empty" }, children),
    CommandGroup: ({ children, heading }: { children: React.ReactNode; heading?: string }) =>
      React.createElement(
        "li",
        { "data-testid": "command-group" },
        heading
          ? React.createElement("span", { "data-testid": "command-group-heading" }, heading)
          : null,
        React.createElement("ul", {}, children),
      ),
    CommandItem: ({
      children,
      onSelect,
      value,
    }: {
      children: React.ReactNode;
      onSelect?: () => void;
      value?: string;
    }) =>
      React.createElement(
        "li",
        {
          role: "option",
          "data-testid": "command-item",
          "data-value": value,
          onClick: onSelect,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter") onSelect?.();
          },
        },
        children,
      ),
    CommandSeparator: () => React.createElement("hr", { "data-testid": "command-separator" }),
  };
});

import { captureEvent } from "../../lib/analytics";
import { CommandPalette } from "./command-palette";

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNavigate.mockResolvedValue(undefined);
  });

  it("renders nothing when closed", () => {
    render(<CommandPalette open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByTestId("command-dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open=true", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("command-dialog")).toBeInTheDocument();
  });

  it("renders the command input when open", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByTestId("command-input")).toBeInTheDocument();
  });

  it("renders nav item labels in the command list", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Help")).toBeInTheDocument();
    // "Donors" and "Grants" are both nav-row item labels AND page-tabs group
    // headings ("Donors"/"Grants" tab groups), so assert via the command-item
    // itself rather than a bare text match, which would be ambiguous.
    const donorsItem = screen
      .getAllByTestId("command-item")
      .find((item) => item.getAttribute("data-value")?.startsWith("Fundraising Donors "));
    expect(donorsItem).toBeTruthy();
    const grantsItem = screen
      .getAllByTestId("command-item")
      .find((item) => item.getAttribute("data-value")?.startsWith("Grants & Funding Grants "));
    expect(grantsItem).toBeTruthy();
  });

  it("keeps every formerly-top-level destination findable by search after consolidation", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="admin" />);
    expect(screen.getByText("At-Risk")).toBeInTheDocument();
    expect(screen.getByText("Budget Sentinel")).toBeInTheDocument();
    expect(screen.getByText("Ask Ledger")).toBeInTheDocument();
    expect(screen.getByText("Evidence Bundles")).toBeInTheDocument();
    expect(screen.getByText("Pledges")).toBeInTheDocument();
    expect(screen.getByText("Chart of Accounts")).toBeInTheDocument();
    expect(screen.getByText("Entities")).toBeInTheDocument();
  });

  it("renders an aria-hidden icon on every navigation destination row", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="admin" />);
    const navigationItems = screen
      .getAllByTestId("command-item")
      .filter((item) => !item.getAttribute("data-value")?.match(/^(create|log)\s/));
    expect(navigationItems.length).toBeGreaterThan(0);
    for (const item of navigationItems) {
      expect(item.querySelector("svg[aria-hidden]")).not.toBeNull();
    }
  });

  it("groups destinations under their source group heading", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="admin" />);
    const headings = screen.getAllByTestId("command-group-heading").map((el) => el.textContent);
    expect(headings).toContain("Donors");
    expect(headings).toContain("Accounting");
    expect(headings).toContain("Workspace");
  });

  it("shows Settings for admin role", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="admin" />);
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("hides Settings for editor role", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="editor" />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides Settings for viewer role", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="viewer" />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("hides Import and Settings for auditor role but still shows Budget Sentinel (grants:view)", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="auditor" />);
    expect(screen.queryByText("Import")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.getByText("Budget Sentinel")).toBeInTheDocument();
  });

  it("calls onOpenChange(false) and navigates when a command item is selected", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} />);

    const dashboardItem = screen.getByText("Dashboard").closest("[data-testid='command-item']");
    expect(dashboardItem).toBeTruthy();
    fireEvent.click(dashboardItem!);

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/dashboard" });
    expect(captureEvent).toHaveBeenCalledWith("command_palette_command_selected", {
      command_type: "navigation",
      command_target: "/dashboard",
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Dashboard");
  });

  it("renders command group headings (section labels)", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    const headings = screen.getAllByTestId("command-group-heading");
    expect(headings.length).toBeGreaterThan(0);
  });

  it("renders separators between sections", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    const separators = screen.getAllByTestId("command-separator");
    expect(separators.length).toBeGreaterThan(0);
  });

  it("does NOT render separator before the first section", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} />);
    // Number of separators = number of groups - 1 (no separator before the first nav group,
    // but one extra separator before the Actions group)
    const separators = screen.getAllByTestId("command-separator");
    const groups = screen.getAllByTestId("command-group");
    // sections (nav groups) + Actions = groups.length; separators = groups.length - 1
    expect(separators.length).toBe(groups.length - 1);
  });

  it("renders the Actions group with create actions", () => {
    render(<CommandPalette open={true} onOpenChange={vi.fn()} userRole="editor" />);
    expect(screen.getByText("Add donor")).toBeInTheDocument();
    expect(screen.getByText("Add grant")).toBeInTheDocument();
    expect(screen.queryByText("Toggle theme")).not.toBeInTheDocument();
  });

  it("navigates to /donors when 'Add donor' is selected", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} userRole="editor" />);
    const item = screen.getByText("Add donor").closest("[data-testid='command-item']");
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/donors" });
    expect(captureEvent).toHaveBeenCalledWith("command_palette_command_selected", {
      command_type: "action",
      action_key: "create_donor",
      command_target: "/donors",
    });
    expect(JSON.stringify(vi.mocked(captureEvent).mock.calls)).not.toContain("Add donor");
  });

  it("navigates to /grants when 'Add grant' is selected", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} userRole="editor" />);
    const item = screen.getByText("Add grant").closest("[data-testid='command-item']");
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/grants" });
    expect(captureEvent).toHaveBeenCalledWith("command_palette_command_selected", {
      command_type: "action",
      action_key: "create_grant",
      command_target: "/grants",
    });
  });

  it("renders 'Go to Donors to log a gift' command for editors and navigates to /donors", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open={true} onOpenChange={onOpenChange} userRole="editor" />);
    expect(screen.getByText("Go to Donors to log a gift")).toBeInTheDocument();
    const item = screen
      .getByText("Go to Donors to log a gift")
      .closest("[data-testid='command-item']");
    expect(item).toBeTruthy();
    fireEvent.click(item!);
    expect(mockNavigate).toHaveBeenCalledWith({ to: "/donors" });
    expect(captureEvent).toHaveBeenCalledWith("command_palette_command_selected", {
      command_type: "action",
      action_key: "log_gift",
      command_target: "/donors",
    });
  });
});
