import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Label } from "./label";

describe("Label", () => {
  it("renders as a label element with data-slot='label'", () => {
    render(<Label>Email</Label>);
    const el = screen.getByText("Email");
    expect(el.tagName).toBe("LABEL");
    expect(el).toHaveAttribute("data-slot", "label");
  });

  it("links to a form control via htmlFor", () => {
    render(
      <div>
        <Label htmlFor="email-input">Email</Label>
        <input id="email-input" />
      </div>,
    );
    const label = screen.getByText("Email");
    expect(label).toHaveAttribute("for", "email-input");
  });

  it("applies default typography classes (text-sm, font-medium, leading-none)", () => {
    render(<Label>x</Label>);
    const el = screen.getByText("x");
    expect(el).toHaveClass("text-sm");
    expect(el).toHaveClass("font-medium");
    expect(el).toHaveClass("leading-none");
  });

  it("merges custom className with defaults", () => {
    render(<Label className="custom-color">x</Label>);
    const el = screen.getByText("x");
    expect(el).toHaveClass("custom-color");
    expect(el).toHaveClass("text-sm");
  });

  it("applies disabled-state class for peer-disabled selectors", () => {
    render(<Label>x</Label>);
    const el = screen.getByText("x");
    // peer-disabled & group-data-[disabled=true] selectors are applied as
    // utility classes; the literal class string contains them.
    expect(el.className).toContain("peer-disabled:cursor-not-allowed");
    expect(el.className).toContain("peer-disabled:opacity-50");
    expect(el.className).toContain("group-data-[disabled=true]:opacity-50");
  });

  it("forwards arbitrary attributes", () => {
    render(<Label data-testid="lbl">x</Label>);
    expect(screen.getByTestId("lbl")).toBeInTheDocument();
  });
});
