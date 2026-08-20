import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockUseSampleDataStatus: vi.fn(),
  mockUseSeedSampleData: vi.fn(),
}));

vi.mock("../hooks/use-sample-data", () => ({
  useSampleDataStatus: hoisted.mockUseSampleDataStatus,
  useSeedSampleData: hoisted.mockUseSeedSampleData,
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Button: ({
      children,
      disabled,
      onClick,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button disabled={disabled} onClick={onClick} {...props}>
        {children}
      </button>
    ),
  };
});

import { ExploreSampleDataCta } from "./explore-sample-data-cta";

function makeSeed(
  overrides: Partial<{ isPending: boolean; mutateAsync: () => Promise<void> }> = {},
) {
  return {
    isPending: false,
    mutateAsync: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("ExploreSampleDataCta", () => {
  beforeEach(() => {
    hoisted.mockUseSampleDataStatus.mockReset();
    hoisted.mockUseSeedSampleData.mockReset();
  });

  it("returns null while status is loading", () => {
    hoisted.mockUseSampleDataStatus.mockReturnValue({ isLoading: true, data: undefined });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed());

    const { container } = render(<ExploreSampleDataCta />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when sample data is already seeded", () => {
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: true, recordCount: 10 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed());

    const { container } = render(<ExploreSampleDataCta />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the CTA and button when not seeded and not loading", () => {
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed());

    render(<ExploreSampleDataCta />);

    expect(screen.getByTestId("explore-sample-data-cta")).toBeInTheDocument();
    expect(screen.getByText("Not sure where to start?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explore sample data" })).toBeInTheDocument();
  });

  it("aligns content to the start of the cross axis so it composes cleanly inside a left-aligned footer slot", () => {
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed());

    render(<ExploreSampleDataCta />);

    const root = screen.getByTestId("explore-sample-data-cta");
    expect(root).toHaveClass("items-start");
    expect(root).not.toHaveClass("items-center");
  });

  it("calls seed.mutateAsync once when the button is clicked", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed({ mutateAsync }));

    render(<ExploreSampleDataCta />);
    await userEvent.click(screen.getByRole("button", { name: "Explore sample data" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
  });

  it("disables the button and shows pending label while seeding", () => {
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed({ isPending: true }));

    render(<ExploreSampleDataCta />);

    const btn = screen.getByRole("button", { name: "Adding sample data…" });
    expect(btn).toBeDisabled();
  });

  it("shows inline error alert when seed rejects", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error("network"));
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed({ mutateAsync }));

    render(<ExploreSampleDataCta />);
    await userEvent.click(screen.getByRole("button", { name: "Explore sample data" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("That didn't work. Try again.");
    });
  });

  it("clears the error flag at the start of a new attempt", async () => {
    let callCount = 0;
    const mutateAsync = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error("fail"));
      return Promise.resolve();
    });
    hoisted.mockUseSampleDataStatus.mockReturnValue({
      isLoading: false,
      data: { seeded: false, recordCount: 0 },
    });
    hoisted.mockUseSeedSampleData.mockReturnValue(makeSeed({ mutateAsync }));

    render(<ExploreSampleDataCta />);

    // First click → error appears
    await userEvent.click(screen.getByRole("button", { name: "Explore sample data" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    // Second click → error disappears before the promise resolves
    await userEvent.click(screen.getByRole("button", { name: "Explore sample data" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
