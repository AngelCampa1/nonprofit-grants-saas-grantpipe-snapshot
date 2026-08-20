import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RestrictionBalanceCard } from "./restriction-balance-card";

describe("RestrictionBalanceCard", () => {
  it("renders every balance row with its label", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={100000}
        additionsCents={50000}
        releasesCents={25000}
        endingBalanceCents={125000}
      />,
    );

    expect(screen.getByText("Restricted balance")).toBeInTheDocument();
    expect(screen.getByText("Beginning")).toBeInTheDocument();
    expect(screen.getByText("Additions")).toBeInTheDocument();
    expect(screen.getByText("Releases")).toBeInTheDocument();
    expect(screen.getByText("Ending")).toBeInTheDocument();
  });

  it("shows exact cents — never rounds a balance that has a remainder", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={123456}
        additionsCents={50050}
        releasesCents={25025}
        endingBalanceCents={148481}
      />,
    );

    // Compliance software must show exact amounts, not silently rounded dollars.
    expect(screen.getByText("$1,234.56")).toBeInTheDocument();
    expect(screen.getByText("$500.50")).toBeInTheDocument();
    expect(screen.getByText("$250.25")).toBeInTheDocument();
    expect(screen.getByText("$1,484.81")).toBeInTheDocument();
    // The old truncating formatter would have rendered these instead.
    expect(screen.queryByText("$1,235")).not.toBeInTheDocument();
    expect(screen.queryByText("$1,485")).not.toBeInTheDocument();
  });

  it("hides cents when every amount is a whole dollar", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={100000}
        additionsCents={0}
        releasesCents={0}
        endingBalanceCents={100000}
      />,
    );

    expect(screen.getAllByText("$1,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0").length).toBeGreaterThan(0);
  });

  it("labels a healthy balance as Current", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={100000}
        additionsCents={0}
        releasesCents={0}
        endingBalanceCents={100000}
      />,
    );

    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.queryByText("At risk")).not.toBeInTheDocument();
  });

  it("flags a negative ending balance as At risk with destructive styling", () => {
    render(
      <RestrictionBalanceCard
        beginningBalanceCents={100000}
        additionsCents={0}
        releasesCents={150000}
        endingBalanceCents={-50000}
      />,
    );

    const badge = screen.getByText("At risk");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("text-destructive");
    expect(screen.getByText("-$500")).toBeInTheDocument();
  });
});
