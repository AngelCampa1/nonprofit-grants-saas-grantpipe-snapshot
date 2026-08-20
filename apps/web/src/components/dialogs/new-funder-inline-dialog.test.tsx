import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateFunderMutateAsync = vi.fn();
const mockUseCreateFunder = vi.fn();

vi.mock("../../hooks/use-grants", () => ({
  useCreateFunder: () => mockUseCreateFunder(),
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
    }) => (
      <SelectCtx.Provider value={{ value, onValueChange }}>
        <button type="button" aria-label="change type" onClick={() => onValueChange("government")}>
          change type
        </button>
        {children}
      </SelectCtx.Provider>
    ),
    SelectTrigger: ({
      "aria-label": ariaLabel,
      id,
      children: _children,
    }: {
      "aria-label"?: string;
      id?: string;
      children?: React.ReactNode;
    }) => (
      <button type="button" aria-label={ariaLabel} id={id}>
        trigger
      </button>
    ),
    SelectValue: () => <span>value</span>,
    SelectContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  };
});

import { NewFunderInlineDialog } from "./new-funder-inline-dialog";

function renderDialog(overrides: Partial<React.ComponentProps<typeof NewFunderInlineDialog>> = {}) {
  const onOpenChange = vi.fn();
  const onCreated = vi.fn();
  render(
    <NewFunderInlineDialog open onOpenChange={onOpenChange} onCreated={onCreated} {...overrides} />,
  );
  return { onOpenChange, onCreated };
}

describe("NewFunderInlineDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateFunderMutateAsync.mockReset();
    mockUseCreateFunder.mockReturnValue({
      mutateAsync: mockCreateFunderMutateAsync,
      isPending: false,
    });
  });

  it("disables Add funder until a name is entered", () => {
    renderDialog();
    const save = screen.getByRole("button", { name: /add funder/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Ford Foundation" },
    });
    expect(save).toBeEnabled();
  });

  it("shows the pending label while the funder is being created", () => {
    mockUseCreateFunder.mockReturnValue({
      mutateAsync: mockCreateFunderMutateAsync,
      isPending: true,
    });
    renderDialog();
    const save = screen.getByRole("button", { name: /adding funder/i });
    expect(save).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^add funder$/i })).not.toBeInTheDocument();
  });

  it("keeps Add funder disabled for whitespace-only names", () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /add funder/i })).toBeDisabled();
  });

  it("creates the funder and reports it back to the caller", async () => {
    mockCreateFunderMutateAsync.mockResolvedValue({ id: "f1", name: "Ford Foundation" });
    const { onCreated, onOpenChange } = renderDialog();

    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Ford Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add funder/i }));

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ id: "f1", name: "Ford Foundation" }),
    );
    expect(mockCreateFunderMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Ford Foundation", type: "foundation" }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("surfaces a human error when the website is invalid", async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Ford Foundation" },
    });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByRole("button", { name: /add funder/i }));

    expect(
      await screen.findByText("Enter a valid website URL, including https://"),
    ).toBeInTheDocument();
    expect(mockCreateFunderMutateAsync).not.toHaveBeenCalled();
  });

  it("surfaces the API error message when creation fails", async () => {
    mockCreateFunderMutateAsync.mockRejectedValue(new Error("Funder already exists"));
    renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Ford Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add funder/i }));

    expect(await screen.findByText("Funder already exists")).toBeInTheDocument();
  });

  it("updates the funder type from the select", async () => {
    mockCreateFunderMutateAsync.mockResolvedValue({ id: "f2", name: "State Arts Council" });
    renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "State Arts Council" },
    });
    fireEvent.click(screen.getByRole("button", { name: "change type" }));
    fireEvent.click(screen.getByRole("button", { name: /add funder/i }));

    await waitFor(() =>
      expect(mockCreateFunderMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ type: "government" }),
      ),
    );
  });

  it("falls back to a generic message when the failure is not an Error", async () => {
    mockCreateFunderMutateAsync.mockRejectedValue("boom");
    renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), {
      target: { value: "Ford Foundation" },
    });
    fireEvent.click(screen.getByRole("button", { name: /add funder/i }));

    expect(await screen.findByText("Unable to add funder.")).toBeInTheDocument();
  });

  it("resets fields when cancelled", () => {
    const { onOpenChange } = renderDialog();
    fireEvent.change(screen.getByLabelText("Funder name"), { target: { value: "Temp" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
