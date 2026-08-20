import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PipelineStageSelect } from "./pipeline-stage-select";

vi.mock("../../hooks/use-donors", () => ({}));

describe("PipelineStageSelect", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    mockOnChange.mockClear();
  });

  it("renders the select trigger", () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("displays the current stage value", () => {
    render(<PipelineStageSelect value="cultivation" onChange={mockOnChange} />);
    expect(screen.getByText(/cultivation/i)).toBeInTheDocument();
  });

  it("shows all 4 pipeline stages when opened", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /prospect/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /cultivation/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /solicitation/i })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: /stewardship/i })).toBeInTheDocument();
    });
  });

  it("calls onChange with the selected stage", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: /stewardship/i }));
    fireEvent.click(screen.getByRole("option", { name: /stewardship/i }));
    expect(mockOnChange).toHaveBeenCalledWith("stewardship");
  });

  it("calls onChange with solicitation stage", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: /solicitation/i }));
    fireEvent.click(screen.getByRole("option", { name: /solicitation/i }));
    expect(mockOnChange).toHaveBeenCalledWith("solicitation");
  });

  it("renders badge elements for stages", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      const badges = document.querySelectorAll("[data-slot='badge']");
      expect(badges.length).toBeGreaterThanOrEqual(4);
    });
  });

  it("applies token-based CSS classes for each pipeline stage badge", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} />);
    fireEvent.click(screen.getByRole("combobox"));

    await waitFor(() => screen.getByRole("option", { name: /prospect/i }));

    const badges = document.querySelectorAll("[data-slot='badge']");
    const classStrings = Array.from(badges).map((b) => b.className);

    // prospect: muted tokens
    expect(
      classStrings.some((c) => c.includes("bg-muted") && c.includes("text-muted-foreground")),
    ).toBe(true);
    // cultivation: primary tokens
    expect(
      classStrings.some((c) => c.includes("bg-primary/10") && c.includes("text-primary")),
    ).toBe(true);
    // solicitation: accent tokens
    expect(classStrings.some((c) => c.includes("bg-accent/15") && c.includes("text-accent"))).toBe(
      true,
    );
    // stewardship: primary tokens
    expect(
      classStrings.some((c) => c.includes("bg-primary/20") && c.includes("text-primary")),
    ).toBe(true);
    // donor: primary tokens
    expect(
      classStrings.some((c) => c.includes("bg-primary/30") && c.includes("text-primary")),
    ).toBe(true);
    // lapsed: destructive tokens
    expect(
      classStrings.some((c) => c.includes("bg-destructive/10") && c.includes("text-destructive")),
    ).toBe(true);

    // No hardcoded Tailwind palette colors
    const allClasses = classStrings.join(" ");
    expect(allClasses).not.toMatch(/bg-blue-|bg-amber-|bg-green-|bg-emerald-|bg-rose-/);
    expect(allClasses).not.toMatch(
      /text-blue-|text-amber-|text-green-[0-9]|text-emerald-|text-rose-/,
    );
  });

  it("shows All stages option when showAllOption is true", async () => {
    render(<PipelineStageSelect value={undefined} onChange={mockOnChange} showAllOption />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /all stages/i })).toBeInTheDocument();
    });
  });

  it("calls onChange with empty string when All stages option is selected", async () => {
    render(<PipelineStageSelect value="prospect" onChange={mockOnChange} showAllOption />);
    fireEvent.click(screen.getByRole("combobox"));
    await waitFor(() => screen.getByRole("option", { name: /all stages/i }));
    fireEvent.click(screen.getByRole("option", { name: /all stages/i }));
    expect(mockOnChange).toHaveBeenCalledWith("");
  });

  it("renders without crashing when value is undefined", () => {
    render(<PipelineStageSelect value={undefined} onChange={mockOnChange} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("displays solicitation as current stage", () => {
    render(<PipelineStageSelect value="solicitation" onChange={mockOnChange} />);
    expect(screen.getByText(/solicitation/i)).toBeInTheDocument();
  });

  it("displays stewardship as current stage", () => {
    render(<PipelineStageSelect value="stewardship" onChange={mockOnChange} />);
    expect(screen.getByText(/stewardship/i)).toBeInTheDocument();
  });

  it("associates an external label with the trigger via the id prop", () => {
    render(
      <>
        <label htmlFor="donor-pipeline-stage">Pipeline Stage</label>
        <PipelineStageSelect id="donor-pipeline-stage" value="prospect" onChange={mockOnChange} />
      </>,
    );
    expect(screen.getByLabelText("Pipeline Stage")).toBe(screen.getByRole("combobox"));
  });
});
