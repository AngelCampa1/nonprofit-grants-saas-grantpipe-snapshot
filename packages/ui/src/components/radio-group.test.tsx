import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RadioGroup, RadioGroupItem } from "./radio-group";

describe("RadioGroup", () => {
  it("renders a radio group with items", () => {
    render(
      <RadioGroup defaultValue="option-a" aria-label="Plan">
        <RadioGroupItem value="option-a" aria-label="Option A" />
        <RadioGroupItem value="option-b" aria-label="Option B" />
      </RadioGroup>,
    );
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
  });

  it("renders RadioGroup with correct data-slot", () => {
    render(
      <RadioGroup aria-label="Group">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "Group" });
    expect(group).toHaveAttribute("data-slot", "radio-group");
  });

  it("renders RadioGroupItem with correct data-slot", () => {
    render(
      <RadioGroup aria-label="Test group">
        <RadioGroupItem value="x" aria-label="X option" />
      </RadioGroup>,
    );
    const item = screen.getByRole("radio", { name: "X option" });
    expect(item).toHaveAttribute("data-slot", "radio-group-item");
  });

  it("selects the default value on mount", () => {
    render(
      <RadioGroup defaultValue="b" aria-label="Options">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "B" })).toHaveAttribute("data-state", "checked");
    expect(screen.getByRole("radio", { name: "A" })).toHaveAttribute("data-state", "unchecked");
  });

  it("fires onValueChange when a different item is clicked", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup defaultValue="a" onValueChange={onValueChange} aria-label="Choose">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>,
    );
    fireEvent.click(screen.getByRole("radio", { name: "B" }));
    expect(onValueChange).toHaveBeenCalledWith("b");
  });

  it("renders disabled RadioGroupItem", () => {
    render(
      <RadioGroup aria-label="Choices">
        <RadioGroupItem value="disabled-opt" aria-label="Disabled option" disabled />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "Disabled option" })).toBeDisabled();
  });

  it("merges custom className on RadioGroup", () => {
    render(
      <RadioGroup className="custom-group" aria-label="G">
        <RadioGroupItem value="x" aria-label="X" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radiogroup", { name: "G" })).toHaveClass("custom-group");
  });

  it("merges custom className on RadioGroupItem", () => {
    render(
      <RadioGroup aria-label="G">
        <RadioGroupItem value="x" aria-label="X" className="custom-item" />
      </RadioGroup>,
    );
    expect(screen.getByRole("radio", { name: "X" })).toHaveClass("custom-item");
  });

  it("renders item indicator inside each radio item", () => {
    render(
      <RadioGroup defaultValue="a" aria-label="G">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    const indicator = document.querySelector("[data-slot='radio-group-indicator']");
    expect(indicator).toBeInTheDocument();
  });

  it("renders with vertical layout by default", () => {
    render(
      <RadioGroup aria-label="G">
        <RadioGroupItem value="a" aria-label="A" />
      </RadioGroup>,
    );
    const group = screen.getByRole("radiogroup", { name: "G" });
    // Should have flex-col or similar vertical layout class
    expect(group.className).toMatch(/flex/);
  });
});
