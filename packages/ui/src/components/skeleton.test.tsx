import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("renders with default rounded-lg class", () => {
    render(<Skeleton data-testid="sk" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveAttribute("data-slot", "skeleton");
    expect(el).toHaveClass("rounded-lg");
    expect(el).toHaveClass("animate-pulse");
    expect(el).toHaveClass("bg-accent");
  });

  it("allows callers to override the rounded class", () => {
    render(<Skeleton data-testid="sk" className="rounded-none" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveClass("rounded-none");
  });

  it("merges additional className props", () => {
    render(<Skeleton data-testid="sk" className="w-24 h-4" />);
    const el = screen.getByTestId("sk");
    expect(el).toHaveClass("w-24");
    expect(el).toHaveClass("h-4");
    expect(el).toHaveClass("rounded-lg");
  });

  it("passes through arbitrary HTML attributes", () => {
    render(<Skeleton data-testid="sk" aria-label="Loading content" />);
    expect(screen.getByLabelText("Loading content")).toBeInTheDocument();
  });
});
