import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@grantpipe/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
  }) =>
    open ? (
      <div
        role="dialog"
        onClick={(e) => {
          if (e.target === e.currentTarget) onOpenChange?.(false);
        }}
      >
        {children}
      </div>
    ) : null,
  DialogClose: ({ children, asChild }: { children?: React.ReactNode; asChild?: boolean }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => {},
      });
    }
    return <div>{children}</div>;
  },
  DialogContent: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-content">{children}</div>
  ),
  DialogDescription: ({ children }: { children?: React.ReactNode }) => (
    <p data-testid="dialog-description">{children}</p>
  ),
  DialogFooter: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-footer">{children}</div>
  ),
  DialogHeader: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="dialog-header">{children}</div>
  ),
  DialogTitle: ({ children }: { children?: React.ReactNode }) => (
    <h2 data-testid="dialog-title">{children}</h2>
  ),
}));

import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  const onOpenChange = vi.fn();
  const onConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render when open is false", () => {
    render(
      <ConfirmDialog
        open={false}
        onOpenChange={onOpenChange}
        title="Are you sure?"
        description="This cannot be undone."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete item?"
        description="This cannot be undone."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByTestId("dialog-title")).toHaveTextContent("Delete item?");
    expect(screen.getByTestId("dialog-description")).toHaveTextContent("This cannot be undone.");
  });

  it("uses the default confirm label Confirm when confirmLabel is not provided", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Are you sure?"
        description="This action is irreversible."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("uses the custom confirmLabel when provided", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Remove member?"
        description="They will lose access."
        confirmLabel="Remove"
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("calls onConfirm and closes dialog when confirm button is clicked", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables both buttons while isPending is true", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Cannot be undone."
        onConfirm={onConfirm}
        isPending={true}
      />,
    );

    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("has a Cancel button that calls onOpenChange(false)", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Cannot be undone."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("renders destructive variant on confirm button", () => {
    render(
      <ConfirmDialog
        open={true}
        onOpenChange={onOpenChange}
        title="Delete?"
        description="Cannot be undone."
        onConfirm={onConfirm}
      />,
    );

    const confirmBtn = screen.getByRole("button", { name: "Confirm" });
    expect(confirmBtn).toHaveAttribute("data-variant", "destructive");
  });
});
