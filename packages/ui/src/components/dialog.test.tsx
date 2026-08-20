import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

describe("Dialog", () => {
  it("renders dialog content and close controls when opened", () => {
    render(
      <Dialog>
        <DialogTrigger>Open dialog</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export report</DialogTitle>
            <DialogDescription>Download the latest report package.</DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <button type="button">Run export</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));

    expect(screen.getByRole("dialog")).toHaveAttribute("data-slot", "dialog-content");
    expect(screen.getByText("Download the latest report package.")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(2);
  });

  it("omits the close button when showCloseButton is false", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Readonly dialog</DialogTitle>
            <DialogDescription>There is nothing to edit here.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("DialogContent has large container rounding (rounded-2xl)", () => {
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rounded dialog</DialogTitle>
            <DialogDescription>Check rounding.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toHaveClass("rounded-2xl");
  });

  it("caps its height and scrolls so tall content can reach its footer on small viewports", () => {
    // Without a height cap + internal scroll, a modal taller than the viewport
    // (e.g. the donor edit form on a phone) pushes its footer below the fold
    // with no way to scroll to the primary action. The content must cap at the
    // viewport height and scroll internally.
    render(
      <Dialog defaultOpen>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tall dialog</DialogTitle>
            <DialogDescription>Many fields.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    );
    const content = screen.getByRole("dialog");
    expect(content).toHaveClass("overflow-y-auto");
    expect(content).toHaveClass("max-h-[calc(100dvh-2rem)]");
  });

  it("renders portal and close wrappers directly", () => {
    render(
      <Dialog defaultOpen>
        <DialogPortal>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Direct wrappers</DialogTitle>
              <DialogDescription>Exercise exported dialog wrappers.</DialogDescription>
            </DialogHeader>
            <DialogClose>Dismiss dialog</DialogClose>
          </DialogContent>
        </DialogPortal>
      </Dialog>,
    );

    expect(screen.getByText("Direct wrappers")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dismiss dialog" })).toHaveAttribute(
      "data-slot",
      "dialog-close",
    );
  });
});
