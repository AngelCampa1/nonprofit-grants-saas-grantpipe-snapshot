import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

describe("Sheet", () => {
  it("opens sheet content when trigger is clicked", () => {
    render(
      <Sheet>
        <SheetTrigger>Open Sheet</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description text.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Sheet" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Sheet Title")).toBeInTheDocument();
    expect(screen.getByText("Sheet description text.")).toBeInTheDocument();
  });

  it("renders data-slot attributes on subcomponents", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Slotted Sheet</SheetTitle>
            <SheetDescription>Testing data-slot.</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <SheetClose>Close</SheetClose>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("data-slot", "sheet-content");
    expect(document.querySelector('[data-slot="sheet-header"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-footer"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-title"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-description"]')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="sheet-close"]')).toBeInTheDocument();
  });

  it("renders sheet with default side=right", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Right Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "right");
  });

  it("renders sheet with side=left", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent side="left">
          <SheetTitle>Left Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "left");
  });

  it("renders sheet with side=top", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent side="top">
          <SheetTitle>Top Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "top");
  });

  it("renders sheet with side=bottom", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent side="bottom">
          <SheetTitle>Bottom Sheet</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveAttribute("data-side", "bottom");
  });

  it("closes sheet when SheetClose is clicked", () => {
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetTitle>Closeable Sheet</SheetTitle>
          <SheetClose>Close Sheet</SheetClose>
        </SheetContent>
      </Sheet>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close Sheet" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders close button with X icon inside content", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>With X button</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    // The sheet includes a built-in close button with sr-only "Close" text
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();
  });

  it("merges custom className on SheetContent", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent className="custom-sheet">
          <SheetTitle>Custom class</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole("dialog")).toHaveClass("custom-sheet");
  });

  it("merges custom className on SheetHeader", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetHeader className="custom-header">
            <SheetTitle>Header</SheetTitle>
          </SheetHeader>
        </SheetContent>
      </Sheet>,
    );

    expect(document.querySelector('[data-slot="sheet-header"]')).toHaveClass("custom-header");
  });

  it("merges custom className on SheetFooter", () => {
    render(
      <Sheet defaultOpen>
        <SheetContent>
          <SheetTitle>Footer test</SheetTitle>
          <SheetFooter className="custom-footer">
            <button type="button">Action</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>,
    );

    expect(document.querySelector('[data-slot="sheet-footer"]')).toHaveClass("custom-footer");
  });
});
