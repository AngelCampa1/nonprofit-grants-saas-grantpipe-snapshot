import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  it("renders unchecked by default", () => {
    render(<Checkbox aria-label="Accept terms" />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute("data-slot", "checkbox");
    expect(checkbox).toHaveAttribute("aria-checked", "false");
  });

  it("renders checked when defaultChecked is true", () => {
    render(<Checkbox aria-label="Accept" defaultChecked />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept" });
    expect(checkbox).toHaveAttribute("data-state", "checked");
  });

  it("renders disabled state", () => {
    render(<Checkbox aria-label="Disabled" disabled />);
    expect(screen.getByRole("checkbox", { name: "Disabled" })).toBeDisabled();
  });

  it("fires onCheckedChange when clicked", () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="Toggle" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Toggle" }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("merges custom className", () => {
    render(<Checkbox aria-label="Styled" className="my-checkbox" />);
    expect(screen.getByRole("checkbox", { name: "Styled" })).toHaveClass("my-checkbox");
  });

  it("renders with id and can be associated with a label", () => {
    render(
      <>
        <label htmlFor="terms">Accept terms</label>
        <Checkbox id="terms" />
      </>,
    );
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    expect(checkbox).toHaveAttribute("id", "terms");
  });

  it("renders as unchecked when controlled with checked=false", () => {
    render(<Checkbox aria-label="Controlled" checked={false} onCheckedChange={() => {}} />);
    const checkbox = screen.getByRole("checkbox", { name: "Controlled" });
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });
});
