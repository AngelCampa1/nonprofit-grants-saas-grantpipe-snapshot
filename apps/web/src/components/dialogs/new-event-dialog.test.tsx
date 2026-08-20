import React from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMutateAsync = vi.fn();
const mockUseCreateEvent = vi.fn();

vi.mock("../../hooks/use-events", () => ({
  useCreateEvent: () => mockUseCreateEvent(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  const SelectCtx = React.createContext<{
    value: string;
    onValueChange: (v: string) => void;
  }>({ value: "", onValueChange: () => {} });

  return {
    ...actual,
    Select: ({
      value = "",
      onValueChange = (_v: string) => {},
      children,
    }: {
      value?: string;
      onValueChange?: (v: string) => void;
      children?: React.ReactNode;
    }) => <SelectCtx.Provider value={{ value, onValueChange }}>{children}</SelectCtx.Provider>,
    SelectTrigger: ({
      "aria-label": ariaLabel,
      id,
      children: _children,
    }: {
      "aria-label"?: string;
      id?: string;
      children?: React.ReactNode;
    }) => {
      const { value, onValueChange } = React.useContext(SelectCtx);
      return (
        <input
          role="combobox"
          id={id}
          aria-label={ariaLabel ?? id}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          readOnly={false}
        />
      );
    },
    SelectValue: () => null,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    SelectItem: ({ value, children }: { value: string; children?: React.ReactNode }) => {
      const { onValueChange } = React.useContext(SelectCtx);
      return (
        <span
          role="option"
          aria-selected={false}
          data-slot="select-item"
          onClick={() => onValueChange(value)}
        >
          {children}
        </span>
      );
    },
  };
});

import { NewEventDialog } from "./new-event-dialog";

describe("NewEventDialog source contracts", () => {
  it("derives event type labels from shared constants", () => {
    const source = readFileSync(join(__dirname, "new-event-dialog.tsx"), "utf8");

    expect(source).toContain("EVENT_TYPE_LABELS");
    expect(source).not.toContain("const EVENT_TYPE_LABELS");
  });
});

function setupDefaultMocks() {
  mockUseCreateEvent.mockReturnValue({
    mutateAsync: mockMutateAsync,
    isPending: false,
  });
}

describe("NewEventDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it("renders when open=true", () => {
    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add event" })).toBeInTheDocument();
  });

  it("does not render when open=false", () => {
    render(<NewEventDialog open={false} onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows all expected fields", () => {
    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByLabelText(/Event name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Type$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Revenue goal/i)).toBeInTheDocument();
  });

  it("submit button is disabled when name is empty", () => {
    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);
    const submitBtn = screen.getByRole("button", { name: /^Add$/i });
    expect(submitBtn).toBeDisabled();
  });

  it("submit button is enabled when name is filled", () => {
    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Spring Gala" } });
    const submitBtn = screen.getByRole("button", { name: /^Add$/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it("Cancel button calls onOpenChange(false)", () => {
    const onOpenChange = vi.fn();
    render(<NewEventDialog open={true} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("successful submit calls mutation with correct data", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "evt-1" });

    render(<NewEventDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Annual Gala" } });

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Annual Gala",
          type: "gala",
        }),
      );
    });
  });

  it("closes dialog on successful submit", async () => {
    const onOpenChange = vi.fn();
    mockMutateAsync.mockResolvedValue({ id: "evt-1" });

    render(<NewEventDialog open={true} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Spring Gala" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("resets form after successful submit", async () => {
    let isOpen = true;
    const onOpenChange = vi.fn((v: boolean) => {
      isOpen = v;
    });
    mockMutateAsync.mockResolvedValue({ id: "evt-1" });

    const { rerender } = render(<NewEventDialog open={isOpen} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Summer Gala" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // Reopen — dialog's handleOpenChange(false) already reset state
    rerender(<NewEventDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Event name/i)).toHaveValue("");
    });
  });

  it("resets form when dialog is closed via Cancel", async () => {
    let isOpen = true;
    const onOpenChange = vi.fn((v: boolean) => {
      isOpen = v;
    });

    const { rerender } = render(<NewEventDialog open={isOpen} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Draft Event" } });
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));

    // Reopen — dialog's handleOpenChange(false) already reset state
    rerender(<NewEventDialog open={true} onOpenChange={onOpenChange} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Event name/i)).toHaveValue("");
    });
  });

  it("shows Alert on mutation error", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Event creation failed"));

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Broken Event" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Event creation failed/i)).toBeInTheDocument();
    });
  });

  it("shows generic error when mutation throws non-Error value", async () => {
    mockMutateAsync.mockRejectedValue("something bad");

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Error Event" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to add event.")).toBeInTheDocument();
    });
  });

  it("submits with optional date as ISO datetime", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-2" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Dated Event" } });
    fireEvent.change(screen.getByLabelText(/Date/i), { target: { value: "2024-09-15" } });

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          date: new Date("2024-09-15T12:00:00.000Z").toISOString(),
        }),
      );
    });
  });

  it("submits with optional location and description", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-3" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), {
      target: { value: "Conference Event" },
    });
    fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: "City Hall" } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Annual conference" },
    });

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          location: "City Hall",
          description: "Annual conference",
        }),
      );
    });
  });

  it("submits with revenue goal converted to cents", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-4" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "Fundraiser" } });
    fireEvent.change(screen.getByLabelText(/Revenue goal/i), { target: { value: "5000" } });

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          revenueGoalCents: 500000,
        }),
      );
    });
  });

  it("does not include revenueGoalCents when revenue goal is empty", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-5" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "No Goal Event" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      const call = mockMutateAsync.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.revenueGoalCents).toBeUndefined();
    });
  });

  it("does not include date when date is empty", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-6" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), { target: { value: "No Date Event" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      const call = mockMutateAsync.mock.calls[0]![0] as Record<string, unknown>;
      expect(call.date).toBeUndefined();
    });
  });

  it("submits with type changed to fundraiser", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-7" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), {
      target: { value: "Fundraiser Event" },
    });
    fireEvent.change(screen.getByLabelText(/^Type$/i), { target: { value: "fundraiser" } });

    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "fundraiser",
        }),
      );
    });
  });

  it("shows all EVENT_TYPES as select options", () => {
    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);
    expect(screen.getByRole("option", { name: /Gala/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Fundraiser/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Campaign/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Meeting/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Other/i })).toBeInTheDocument();
  });

  it("trims leading/trailing whitespace from name before submitting", async () => {
    mockMutateAsync.mockResolvedValue({ id: "evt-8" });

    render(<NewEventDialog open={true} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/Event name/i), {
      target: { value: "  Trimmed Event  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Trimmed Event",
        }),
      );
    });
  });
});
