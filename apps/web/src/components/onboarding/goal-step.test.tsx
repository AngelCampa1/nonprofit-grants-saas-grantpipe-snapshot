import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OnboardingGoal } from "@grantpipe/shared";
import { GoalStep } from "./goal-step";

describe("GoalStep", () => {
  // 1. Renders all three cards with their headings
  it("renders all three card headings", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Track donors and gifts")).toBeInTheDocument();
    expect(screen.getByText("Manage grants and funds")).toBeInTheDocument();
    expect(screen.getByText("Stay audit-ready")).toBeInTheDocument();
  });

  // 2. The card matching `selected` has the selected ARIA state; others do not
  it("marks the donors card as checked when selected is 'donors'", () => {
    render(<GoalStep selected="donors" onSelect={vi.fn()} />);

    const donorsCard = screen.getByRole("radio", { name: /track donors and gifts/i });
    const grantsCard = screen.getByRole("radio", { name: /manage grants and funds/i });
    const complianceCard = screen.getByRole("radio", { name: /stay audit-ready/i });

    expect(donorsCard).toHaveAttribute("aria-checked", "true");
    expect(grantsCard).toHaveAttribute("aria-checked", "false");
    expect(complianceCard).toHaveAttribute("aria-checked", "false");
  });

  it("marks the grants card as checked when selected is 'grants'", () => {
    render(<GoalStep selected="grants" onSelect={vi.fn()} />);

    const donorsCard = screen.getByRole("radio", { name: /track donors and gifts/i });
    const grantsCard = screen.getByRole("radio", { name: /manage grants and funds/i });
    const complianceCard = screen.getByRole("radio", { name: /stay audit-ready/i });

    expect(donorsCard).toHaveAttribute("aria-checked", "false");
    expect(grantsCard).toHaveAttribute("aria-checked", "true");
    expect(complianceCard).toHaveAttribute("aria-checked", "false");
  });

  it("marks the compliance card as checked when selected is 'compliance'", () => {
    render(<GoalStep selected="compliance" onSelect={vi.fn()} />);

    const donorsCard = screen.getByRole("radio", { name: /track donors and gifts/i });
    const grantsCard = screen.getByRole("radio", { name: /manage grants and funds/i });
    const complianceCard = screen.getByRole("radio", { name: /stay audit-ready/i });

    expect(donorsCard).toHaveAttribute("aria-checked", "false");
    expect(grantsCard).toHaveAttribute("aria-checked", "false");
    expect(complianceCard).toHaveAttribute("aria-checked", "true");
  });

  // 3. Clicking each card calls onSelect with the correct goal value
  it("calls onSelect with 'donors' when the donors card is clicked", async () => {
    const onSelect = vi.fn();
    render(<GoalStep selected={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("radio", { name: /track donors and gifts/i }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("donors" satisfies OnboardingGoal);
  });

  it("calls onSelect with 'grants' when the grants card is clicked", async () => {
    const onSelect = vi.fn();
    render(<GoalStep selected={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("radio", { name: /manage grants and funds/i }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("grants" satisfies OnboardingGoal);
  });

  it("calls onSelect with 'compliance' when the compliance card is clicked", async () => {
    const onSelect = vi.fn();
    render(<GoalStep selected={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("radio", { name: /stay audit-ready/i }));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith("compliance" satisfies OnboardingGoal);
  });

  // 4. When selected is null, no card is in the selected state
  it("marks no card as checked when selected is null", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
    for (const radio of radios) {
      expect(radio).toHaveAttribute("aria-checked", "false");
    }
  });

  // 5. The radiogroup/radio roles are present
  it("renders a radiogroup container with the correct aria-label", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    expect(
      screen.getByRole("radiogroup", { name: "What do you want to do first?" }),
    ).toBeInTheDocument();
  });

  it("renders exactly three radio buttons", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  // Additional: cards render their descriptions
  it("renders all three card descriptions", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    expect(screen.getByText("Keep every donor and gift in one place.")).toBeInTheDocument();
    expect(screen.getByText("Watch grant deadlines and restricted funds.")).toBeInTheDocument();
    expect(screen.getByText("Build reports funders and auditors ask for.")).toBeInTheDocument();
  });

  // Cards appear in the correct order: donors, grants, compliance
  it("renders cards in the correct order: donors, grants, compliance", () => {
    render(<GoalStep selected={null} onSelect={vi.fn()} />);

    const radios = screen.getAllByRole("radio");
    expect(radios[0]).toHaveAccessibleName(/track donors and gifts/i);
    expect(radios[1]).toHaveAccessibleName(/manage grants and funds/i);
    expect(radios[2]).toHaveAccessibleName(/stay audit-ready/i);
  });
});
