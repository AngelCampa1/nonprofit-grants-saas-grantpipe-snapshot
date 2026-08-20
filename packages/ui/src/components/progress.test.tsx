import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Progress } from "./progress";

describe("Progress", () => {
  it("renders a progressbar role", () => {
    const { getByRole } = render(<Progress value={50} />);
    expect(getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders data-slot=progress attribute", () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[data-slot="progress"]')).toBeInTheDocument();
  });

  it("renders the indicator with data-slot=progress-indicator", () => {
    const { container } = render(<Progress value={50} />);
    expect(container.querySelector('[data-slot="progress-indicator"]')).toBeInTheDocument();
  });

  it("sets aria-valuenow to the provided value", () => {
    const { getByRole } = render(<Progress value={75} />);
    expect(getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
  });

  it("sets aria-valuenow to 0 when value is 0", () => {
    const { getByRole } = render(<Progress value={0} />);
    expect(getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("sets aria-valuenow to 100 when value is 100", () => {
    const { getByRole } = render(<Progress value={100} />);
    expect(getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("renders with undefined value (indeterminate state)", () => {
    const { getByRole } = render(<Progress />);
    // Radix sets aria-valuenow when value is provided; undefined is indeterminate
    expect(getByRole("progressbar")).toBeInTheDocument();
  });

  it("merges custom className", () => {
    const { container } = render(<Progress value={50} className="custom-progress" />);
    expect(container.querySelector('[data-slot="progress"]')).toHaveClass("custom-progress");
  });

  it("applies translateX style on the indicator based on value", () => {
    const { container } = render(<Progress value={40} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    // The indicator should have a transform style to reflect the progress value
    expect(indicator.style.transform).toContain("translateX");
  });

  it("indicator translateX is -100% when value is 0", () => {
    const { container } = render(<Progress value={0} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.transform).toContain("-100%");
  });

  it("indicator translateX is 0% when value is 100", () => {
    const { container } = render(<Progress value={100} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(0%)");
  });

  it("indicator translateX is -50% when value is 50", () => {
    const { container } = render(<Progress value={50} />);
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-50%)");
  });
});
