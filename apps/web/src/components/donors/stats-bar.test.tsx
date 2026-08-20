import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsBar } from "./stats-bar";

vi.mock("./retention-chart", () => ({
  RetentionChart: () => <div data-testid="retention-chart-mock" />,
}));

const defaultStats = {
  totalDonors: 250,
  newDonorsThisFY: 42,
  retentionRate: 0.781,
  totalGivingThisFY: 158340_99,
};

const defaultRetentionData = [
  { fiscalYear: "FY2022", retentionRate: 0.72, donorCount: 150, retainedCount: 108 },
  { fiscalYear: "FY2023", retentionRate: 0.78, donorCount: 175, retainedCount: 136 },
];

describe("StatsBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("loading state", () => {
    it("renders skeleton cards when isLoading is true", () => {
      const { container } = render(
        <StatsBar stats={undefined} retentionData={undefined} isLoading={true} />,
      );
      const skeletons = container.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("does not show metric values while loading", () => {
      render(<StatsBar stats={undefined} retentionData={undefined} isLoading={true} />);
      expect(screen.queryByText("250")).toBeNull();
    });
  });

  describe("with data", () => {
    it("renders all 4 metric cards", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByText("Total Donors")).toBeInTheDocument();
      expect(screen.getByText("New This FY")).toBeInTheDocument();
      expect(screen.getByText("Retention Rate")).toBeInTheDocument();
      expect(screen.getByText("Total Giving This FY")).toBeInTheDocument();
    });

    it("displays total donors count", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByText("250")).toBeInTheDocument();
    });

    it("displays new donors this FY count", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByText("42")).toBeInTheDocument();
    });

    it("formats retention rate as percentage with one decimal", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByText("78.1%")).toBeInTheDocument();
    });

    it("formats total giving as dollars from cents", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByText("$158,340.99")).toBeInTheDocument();
    });

    it("renders the RetentionChart sparkline inside the retention rate card", () => {
      render(
        <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
      );
      expect(screen.getByTestId("retention-chart-mock")).toBeInTheDocument();
    });
  });

  describe("zero values", () => {
    it("handles all-zero stats gracefully", () => {
      const zeroStats = {
        totalDonors: 0,
        newDonorsThisFY: 0,
        retentionRate: 0,
        totalGivingThisFY: 0,
      };
      render(<StatsBar stats={zeroStats} retentionData={[]} isLoading={false} />);
      expect(screen.getByText("0.0%")).toBeInTheDocument();
      expect(screen.getByText("$0")).toBeInTheDocument();
    });
  });

  describe("undefined stats with isLoading false", () => {
    it("shows dashes when stats are undefined but not loading", () => {
      render(<StatsBar stats={undefined} retentionData={undefined} isLoading={false} />);
      const dashes = screen.getAllByText("--");
      expect(dashes.length).toBeGreaterThanOrEqual(4);
    });
  });

  it("uses a responsive grid layout for stat cards", () => {
    render(
      <StatsBar stats={defaultStats} retentionData={defaultRetentionData} isLoading={false} />,
    );

    expect(screen.getByTestId("donor-stats-grid")).toHaveClass("grid-cols-2");
    expect(screen.getByTestId("donor-stats-grid")).toHaveClass("xl:grid-cols-4");
  });
});
