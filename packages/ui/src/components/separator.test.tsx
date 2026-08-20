import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders with data-slot='separator'", () => {
    const { container } = render(<Separator />);
    const el = container.querySelector("[data-slot='separator']");
    expect(el).toBeInTheDocument();
  });

  it("defaults to horizontal orientation", () => {
    const { container } = render(<Separator />);
    const el = container.querySelector("[data-slot='separator']");
    expect(el).toHaveAttribute("data-orientation", "horizontal");
  });

  it("renders with vertical orientation when specified", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.querySelector("[data-slot='separator']");
    expect(el).toHaveAttribute("data-orientation", "vertical");
  });

  it("is decorative by default and has no accessible role", () => {
    render(<Separator />);
    // When decorative=true Radix does not assign role="separator", so queryByRole returns null
    const el = screen.queryByRole("separator");
    expect(el).toBeNull();
  });

  it("is not aria-hidden when decorative=false", () => {
    render(<Separator decorative={false} aria-label="section divider" />);
    const el = screen.getByRole("separator");
    expect(el).not.toHaveAttribute("aria-hidden", "true");
  });

  it("applies custom className", () => {
    const { container } = render(<Separator className="my-separator" />);
    const el = container.querySelector("[data-slot='separator']");
    expect(el).toHaveClass("my-separator");
  });

  it("forwards additional props to the root element", () => {
    const { container } = render(<Separator data-testid="sep" />);
    const el = container.querySelector("[data-testid='sep']");
    expect(el).toBeInTheDocument();
  });
});
