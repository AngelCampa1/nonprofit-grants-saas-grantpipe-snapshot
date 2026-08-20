import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UseQueryResult } from "@tanstack/react-query";
import { RetryButton } from "./retry-button";

type QueryStub = Pick<UseQueryResult, "refetch" | "isFetching">;

function makeQuery(isFetching = false, refetch?: () => Promise<unknown>): QueryStub {
  return {
    refetch: (refetch ?? vi.fn().mockResolvedValue(undefined)) as QueryStub["refetch"],
    isFetching,
  };
}

describe("RetryButton", () => {
  it("renders with 'Retry' label when not fetching", () => {
    render(<RetryButton query={makeQuery()} />);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("renders with 'Retrying...' label when fetching", () => {
    render(<RetryButton query={makeQuery(true)} />);
    expect(screen.getByRole("button", { name: "Retrying…" })).toBeInTheDocument();
  });

  it("is enabled when not fetching", () => {
    render(<RetryButton query={makeQuery(false)} />);
    expect(screen.getByRole("button")).not.toBeDisabled();
  });

  it("is disabled when fetching", () => {
    render(<RetryButton query={makeQuery(true)} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls refetch when clicked", async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    render(<RetryButton query={makeQuery(false, refetch)} />);
    await userEvent.click(screen.getByRole("button"));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("applies className to the button", () => {
    render(<RetryButton query={makeQuery()} className="custom-class" />);
    expect(screen.getByRole("button")).toHaveClass("custom-class");
  });
});
