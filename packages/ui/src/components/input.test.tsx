import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("renders an input element with data-slot='input'", () => {
    render(<Input />);
    const el = document.querySelector("[data-slot='input']");
    expect(el).toBeInTheDocument();
    expect(el?.tagName).toBe("INPUT");
  });

  it("renders with a placeholder", () => {
    render(<Input placeholder="Enter value" />);
    expect(screen.getByPlaceholderText("Enter value")).toBeInTheDocument();
  });

  it("renders with a default value", () => {
    render(<Input defaultValue="hello" />);
    expect(screen.getByDisplayValue("hello")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Input disabled />);
    expect(document.querySelector("input")).toBeDisabled();
  });

  it("forwards additional HTML attributes", () => {
    render(<Input data-testid="my-input" maxLength={20} />);
    const el = screen.getByTestId("my-input");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("maxLength", "20");
  });

  it("renders as aria-invalid when aria-invalid prop is set", () => {
    render(<Input aria-invalid="true" />);
    expect(document.querySelector("input")).toHaveAttribute("aria-invalid", "true");
  });

  it("applies custom className in addition to base classes", () => {
    render(<Input className="my-custom" />);
    expect(document.querySelector("input")).toHaveClass("my-custom");
  });

  it("is pill-shaped (rounded-full)", () => {
    render(<Input />);
    expect(document.querySelector("input")).toHaveClass("rounded-full");
  });

  it("uses standardized focus ring", () => {
    render(<Input />);
    const el = document.querySelector("input");
    expect(el?.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(el?.className).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("defaults to size 'default' with h-9 and px-4", () => {
    render(<Input />);
    const el = document.querySelector("input");
    expect(el).toHaveAttribute("data-size", "default");
    expect(el).toHaveClass("h-9");
    expect(el).toHaveClass("px-4");
  });

  it("applies xs size: h-6 px-3", () => {
    render(<Input inputSize="xs" />);
    const el = document.querySelector("input");
    expect(el).toHaveAttribute("data-size", "xs");
    expect(el).toHaveClass("h-6");
    expect(el).toHaveClass("px-3");
  });

  it("applies sm size: h-8 px-4", () => {
    render(<Input inputSize="sm" />);
    const el = document.querySelector("input");
    expect(el).toHaveAttribute("data-size", "sm");
    expect(el).toHaveClass("h-8");
    expect(el).toHaveClass("px-4");
  });

  it("applies lg size: h-10 px-4", () => {
    render(<Input inputSize="lg" />);
    const el = document.querySelector("input");
    expect(el).toHaveAttribute("data-size", "lg");
    expect(el).toHaveClass("h-10");
    expect(el).toHaveClass("px-4");
  });

  it("forwards type attribute correctly", () => {
    render(<Input type="email" />);
    expect(document.querySelector("input")).toHaveAttribute("type", "email");
  });

  it("styles the native file-selector button as a secondary pill", () => {
    render(<Input type="file" />);
    const el = document.querySelector("input");
    // Kill the native UA button chrome so it does not render as a gray 3D button.
    expect(el?.className).toMatch(/file:appearance-none/);
    // Match the secondary pill button look from the Button component.
    expect(el?.className).toMatch(/file:rounded-full/);
    expect(el?.className).toMatch(/file:bg-secondary/);
    expect(el?.className).toMatch(/file:text-secondary-foreground/);
    expect(el?.className).toMatch(/hover:file:bg-secondary\/80/);
    expect(el?.className).toMatch(/file:cursor-pointer/);
  });
});
