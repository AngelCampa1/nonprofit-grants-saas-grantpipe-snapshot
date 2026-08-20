import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders with required title only", () => {
    render(<EmptyState title="No records found" />);
    const el = screen.getByRole("region", { name: "No records found" });
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-slot", "empty-state");
    expect(screen.getByText("No records found")).toBeInTheDocument();
  });

  it("renders icon when provided", () => {
    render(<EmptyState title="No data" icon={<span data-testid="custom-icon">icon</span>} />);
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("does not render icon slot when icon is not provided", () => {
    render(<EmptyState title="No data" />);
    expect(screen.queryByTestId("empty-state-icon")).not.toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<EmptyState title="No data" description="Try adding something first." />);
    expect(screen.getByText("Try adding something first.")).toBeInTheDocument();
  });

  it("does not render description paragraph when not provided", () => {
    const { container } = render(<EmptyState title="No data" />);
    expect(
      container.querySelector("[data-slot='empty-state-description']"),
    ).not.toBeInTheDocument();
  });

  it("renders primary action when provided", () => {
    render(<EmptyState title="No data" action={<button type="button">Add item</button>} />);
    expect(screen.getByRole("button", { name: "Add item" })).toBeInTheDocument();
  });

  it("renders secondary action when provided", () => {
    render(<EmptyState title="No data" secondaryAction={<a href="/docs">Learn more</a>} />);
    expect(screen.getByRole("link", { name: "Learn more" })).toBeInTheDocument();
  });

  it("renders both actions together", () => {
    render(
      <EmptyState
        title="No data"
        action={<button type="button">Primary</button>}
        secondaryAction={<button type="button">Secondary</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Secondary" })).toBeInTheDocument();
  });

  it("merges custom className", () => {
    render(<EmptyState title="No data" className="my-custom-class" />);
    expect(screen.getByRole("region", { name: "No data" })).toHaveClass("my-custom-class");
  });

  it("renders icon container with correct data-slot", () => {
    render(<EmptyState title="No data" icon={<svg data-testid="svg-icon" />} />);
    const iconWrapper = screen.getByTestId("empty-state-icon-wrapper");
    expect(iconWrapper).toHaveAttribute("data-slot", "empty-state-icon");
  });

  it("renders title with data-slot attribute", () => {
    render(<EmptyState title="Empty here" />);
    const title = screen.getByText("Empty here");
    expect(title).toHaveAttribute("data-slot", "empty-state-title");
  });

  it("renders description with data-slot attribute", () => {
    render(<EmptyState title="No data" description="Nothing here yet." />);
    const desc = screen.getByText("Nothing here yet.");
    expect(desc).toHaveAttribute("data-slot", "empty-state-description");
  });
});
