import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FilterBar } from "./filter-bar";

describe("FilterBar", () => {
  it("renders children correctly", () => {
    render(
      <FilterBar>
        <span>Filter A</span>
        <span>Filter B</span>
      </FilterBar>,
    );

    expect(screen.getByText("Filter A")).toBeInTheDocument();
    expect(screen.getByText("Filter B")).toBeInTheDocument();
  });

  it("applies the data-slot attribute", () => {
    const { container } = render(<FilterBar />);

    expect(container.querySelector("[data-slot='filter-bar']")).toBeInTheDocument();
  });

  it("merges custom className with base classes", () => {
    const { container } = render(<FilterBar className="custom-class" />);

    const el = container.querySelector("[data-slot='filter-bar']");
    expect(el).toHaveClass("flex");
    expect(el).toHaveClass("flex-wrap");
    expect(el).toHaveClass("items-center");
    expect(el).toHaveClass("gap-2");
    expect(el).toHaveClass("custom-class");
  });

  it("renders without children", () => {
    const { container } = render(<FilterBar />);

    const el = container.querySelector("[data-slot='filter-bar']");
    expect(el).toBeInTheDocument();
    expect(el?.childNodes.length).toBe(0);
  });
});
