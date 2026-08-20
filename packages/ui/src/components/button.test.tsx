import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders a button element with default variant and size metadata", () => {
    render(<Button>Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("data-slot", "button");
    expect(button).toHaveAttribute("data-variant", "default");
    expect(button).toHaveAttribute("data-size", "default");
  });

  it("renders child elements when used asChild", () => {
    render(
      <Button asChild variant="secondary" size="sm">
        <a href="/reports">Reports</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Reports" });
    expect(link).toHaveAttribute("href", "/reports");
    expect(link).toHaveAttribute("data-variant", "secondary");
    expect(link).toHaveAttribute("data-size", "sm");
  });

  it("is pill-shaped (rounded-full)", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("rounded-full");
  });

  it("applies correct height for each size variant", () => {
    const { rerender } = render(<Button size="xs">X</Button>);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("h-6");

    rerender(<Button size="sm">X</Button>);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("h-8");

    rerender(<Button size="default">X</Button>);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("h-9");

    rerender(<Button size="lg">X</Button>);
    expect(screen.getByRole("button", { name: "X" })).toHaveClass("h-10");
  });

  it("applies bumped horizontal padding (px-5) on default size", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveClass("px-5");
  });

  it("uses standardized focus ring classes", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(button.className).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("renders icon-only square variants with correct sizes", () => {
    const { rerender } = render(<Button size="icon">i</Button>);
    expect(screen.getByRole("button", { name: "i" })).toHaveClass("size-9");

    rerender(<Button size="icon-sm">i</Button>);
    expect(screen.getByRole("button", { name: "i" })).toHaveClass("size-8");

    rerender(<Button size="icon-lg">i</Button>);
    expect(screen.getByRole("button", { name: "i" })).toHaveClass("size-10");
  });

  it("applies explicit cursor classes for pointer/disabled affordance", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("cursor-pointer");
    expect(button).toHaveClass("disabled:cursor-not-allowed");
  });

  it("renders all variant styles without error", () => {
    const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>Test</Button>);
      expect(screen.getByRole("button", { name: "Test" })).toHaveAttribute("data-variant", variant);
      unmount();
    }
  });
});
