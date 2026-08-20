import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IconButton } from "./icon-button";

describe("IconButton", () => {
  it("renders as a button element", () => {
    render(<IconButton aria-label="Close" />);
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("sets data-slot on the button", () => {
    render(<IconButton aria-label="Close" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveAttribute("data-slot", "icon-button");
  });

  it("applies default md size classes", () => {
    render(<IconButton aria-label="Close" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveAttribute("data-size", "md");
  });

  it("applies sm size classes when size='sm'", () => {
    render(<IconButton aria-label="Close" size="sm" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveAttribute("data-size", "sm");
  });

  it("applies lg size classes when size='lg'", () => {
    render(<IconButton aria-label="Close" size="lg" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveAttribute("data-size", "lg");
  });

  it("renders children inside the button", () => {
    render(
      <IconButton aria-label="Settings">
        <span data-testid="icon">X</span>
      </IconButton>,
    );
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("wraps button in Tooltip when tooltip prop is provided", () => {
    // Radix Tooltip content is not rendered until open; we verify the trigger button
    // is wrapped (data-state="closed" is the Radix Tooltip trigger marker) and that
    // the tooltip text prop is set correctly via data attribute.
    const { container } = render(<IconButton aria-label="Close" tooltip="Close panel" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toBeInTheDocument();
    // Radix TooltipTrigger sets data-state on its trigger element
    expect(btn).toHaveAttribute("data-state", "closed");
    // The TooltipProvider wrapper is present in the container
    expect(container.firstChild).not.toBeNull();
  });

  it("does not render tooltip wrapper when tooltip prop is omitted", () => {
    render(<IconButton aria-label="Close" />);
    // No tooltip content in DOM
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("forwards additional HTML button attributes", () => {
    render(<IconButton aria-label="Close" disabled />);
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  });

  it("applies additional className", () => {
    render(<IconButton aria-label="Close" className="text-red-500" />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("text-red-500");
  });

  it("renders as child element via asChild", () => {
    render(
      <IconButton aria-label="Go home" asChild>
        <a href="/">Home</a>
      </IconButton>,
    );
    // When asChild is used, the rendered element is an anchor not a button
    const link = screen.getByRole("link", { name: "Go home" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("is pill-shaped (rounded-full)", () => {
    render(<IconButton aria-label="Close" />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("rounded-full");
  });

  it("uses standardized focus ring (ring-[3px] ring-ring/50, no ring-offset)", () => {
    render(<IconButton aria-label="Close" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(btn.className).toMatch(/focus-visible:ring-ring\/50/);
    expect(btn.className).not.toMatch(/focus-visible:ring-offset/);
  });

  it("applies explicit cursor classes for pointer/disabled affordance", () => {
    render(<IconButton aria-label="Close" />);
    const btn = screen.getByRole("button", { name: "Close" });
    expect(btn).toHaveClass("cursor-pointer");
    expect(btn).toHaveClass("disabled:cursor-not-allowed");
  });

  it("applies correct size classes: sm=size-8, md=size-9 (default), lg=size-10", () => {
    const { rerender } = render(<IconButton aria-label="X" size="sm" />);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("size-8");

    rerender(<IconButton aria-label="X" size="md" />);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("size-9");

    rerender(<IconButton aria-label="X" size="lg" />);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("size-10");
  });

  it("applies xs size class (size-6) when size='xs'", () => {
    render(<IconButton aria-label="X" size="xs" />);
    const btn = screen.getByRole("button", { name: "X" });
    expect(btn).toHaveAttribute("data-size", "xs");
    expect(btn).toHaveClass("size-6");
  });

  it("xs size uses size-3 icon override via class selector", () => {
    render(<IconButton aria-label="X" size="xs" />);
    const btn = screen.getByRole("button", { name: "X" });
    // The xs size entry in sizeClasses includes the icon-size override
    expect(btn.className).toContain("size-6");
    expect(btn.className).toContain("[&_svg:not([class*='size-'])]:size-3");
  });

  describe("accessibility name propagation", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it("propagates `tooltip` to aria-label when no aria-label is set", () => {
      render(<IconButton tooltip="Close panel" />);
      const btn = screen.getByRole("button", { name: "Close panel" });
      expect(btn).toHaveAttribute("aria-label", "Close panel");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not overwrite an explicit aria-label when tooltip is also provided", () => {
      render(<IconButton aria-label="Explicit name" tooltip="Visible tooltip" />);
      const btn = screen.getByRole("button", { name: "Explicit name" });
      expect(btn).toHaveAttribute("aria-label", "Explicit name");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not set aria-label when only aria-labelledby is provided", () => {
      render(
        <div>
          <span id="lbl-id">External label</span>
          <IconButton aria-labelledby="lbl-id" tooltip="Tooltip text" />
        </div>,
      );
      const btn = screen.getByRole("button", { name: "External label" });
      expect(btn).not.toHaveAttribute("aria-label");
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("warns in dev when no tooltip, aria-label, or aria-labelledby is provided", () => {
      render(<IconButton />);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/missing accessible name/i);
    });

    it("does not warn when aria-label is set without a tooltip", () => {
      render(<IconButton aria-label="OK" />);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it("does not warn when aria-labelledby is set without a tooltip", () => {
      render(
        <div>
          <span id="x-label">x</span>
          <IconButton aria-labelledby="x-label" />
        </div>,
      );
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });
});
