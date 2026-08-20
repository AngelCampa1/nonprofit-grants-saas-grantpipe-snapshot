import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("renders a textarea element with data-slot='textarea'", () => {
    render(<Textarea />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveAttribute("data-slot", "textarea");
    expect(el.tagName).toBe("TEXTAREA");
  });

  it("renders with a placeholder", () => {
    render(<Textarea placeholder="Enter notes here" />);
    expect(screen.getByPlaceholderText("Enter notes here")).toBeInTheDocument();
  });

  it("renders with a default value", () => {
    render(<Textarea defaultValue="Initial content" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveValue("Initial content");
  });

  it("applies custom className in addition to base classes", () => {
    render(<Textarea className="custom-class" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveClass("custom-class");
  });

  it("is disabled when the disabled prop is set", () => {
    render(<Textarea disabled />);
    const el = screen.getByRole("textbox");
    expect(el).toBeDisabled();
  });

  it("forwards additional HTML attributes", () => {
    render(<Textarea data-testid="my-textarea" rows={5} />);
    const el = screen.getByTestId("my-textarea");
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("rows", "5");
  });

  it("renders as aria-invalid when aria-invalid prop is set", () => {
    render(<Textarea aria-invalid="true" />);
    const el = screen.getByRole("textbox");
    expect(el).toHaveAttribute("aria-invalid", "true");
  });

  it("uses rounded-2xl for multi-line pill-like appearance", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox")).toHaveClass("rounded-2xl");
  });

  it("uses standardized focus ring", () => {
    render(<Textarea />);
    const el = screen.getByRole("textbox");
    expect(el.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(el.className).toMatch(/focus-visible:ring-ring\/50/);
  });

  it("has px-4 horizontal padding", () => {
    render(<Textarea />);
    expect(screen.getByRole("textbox")).toHaveClass("px-4");
  });
});
