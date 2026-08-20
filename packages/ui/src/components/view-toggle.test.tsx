import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LayoutGrid, List } from "lucide-react";
import { ViewToggle } from "./view-toggle";

const options = [
  { value: "list" as const, label: "List", icon: List },
  { value: "board" as const, label: "Board", icon: LayoutGrid },
];

describe("ViewToggle", () => {
  it("renders all options", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "List" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Board" })).toBeInTheDocument();
  });

  it("active option has aria-checked=true", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
  });

  it("inactive options have aria-checked=false", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "false");
  });

  it("clicking an inactive option calls onChange with that value", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "Board" }));
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("clicking the active option still calls onChange", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="list" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("renders optional icon when provided", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    // Icons are SVGs rendered aria-hidden; verify at least one exists in DOM
    const icons = screen.getAllByRole("radio");
    icons.forEach((btn) => {
      expect(btn.querySelector("svg")).toBeInTheDocument();
    });
  });

  it("renders without icon when not provided", () => {
    const noIconOptions = [
      { value: "a" as const, label: "Alpha" },
      { value: "b" as const, label: "Beta" },
    ];
    render(<ViewToggle options={noIconOptions} value="a" onChange={vi.fn()} />);
    const alphaBtn = screen.getByRole("radio", { name: "Alpha" });
    expect(alphaBtn.querySelector("svg")).not.toBeInTheDocument();
  });

  it("applies custom className to root element", () => {
    render(
      <ViewToggle options={options} value="list" onChange={vi.fn()} className="my-custom-class" />,
    );
    expect(screen.getByRole("radiogroup")).toHaveClass("my-custom-class");
  });

  it("applies aria-label to the group", () => {
    render(
      <ViewToggle
        options={options}
        value="list"
        onChange={vi.fn()}
        aria-label="Toggle view mode"
      />,
    );
    expect(screen.getByRole("radiogroup", { name: "Toggle view mode" })).toBeInTheDocument();
  });

  it("defaults aria-label to 'View toggle'", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radiogroup", { name: "View toggle" })).toBeInTheDocument();
  });

  it("ArrowRight moves to next option and calls onChange", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="list" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "List" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("ArrowLeft moves to previous option and calls onChange", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="board" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Board" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("ArrowRight wraps from last to first", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="board" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "Board" }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("list");
  });

  it("ArrowLeft wraps from first to last", () => {
    const onChange = vi.fn();
    render(<ViewToggle options={options} value="list" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "List" }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith("board");
  });

  it("uses standardized focus ring on option buttons (ring-[3px] ring-ring/50, no ring-offset)", () => {
    render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);

    const listBtn = screen.getByRole("radio", { name: "List" });
    expect(listBtn.className).toMatch(/focus-visible:ring-\[3px\]/);
    expect(listBtn.className).toMatch(/focus-visible:ring-ring\/50/);
    expect(listBtn.className).not.toMatch(/focus-visible:ring-offset/);
  });

  it("updates active state when value prop changes", () => {
    const { rerender } = render(<ViewToggle options={options} value="list" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "false");

    rerender(<ViewToggle options={options} value="board" onChange={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("radio", { name: "Board" })).toHaveAttribute("aria-checked", "true");
  });
});
