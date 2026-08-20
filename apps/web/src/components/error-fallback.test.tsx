import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: { to: string; children: React.ReactNode } & React.HTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, ...props }, children),
}));

import { ErrorFallback } from "./error-fallback";
import { ApiError } from "../lib/http-response";

describe("ErrorFallback", () => {
  it("renders the heading and error message when error is an Error instance", () => {
    render(<ErrorFallback error={new Error("Something exploded")} />);
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText("Something exploded")).toBeInTheDocument();
  });

  it("does not render raw internal API error details", () => {
    render(<ErrorFallback error={new ApiError("database password leaked", 500)} />);
    expect(screen.queryByText("database password leaked")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Something went wrong. Try again, or contact support if it keeps happening.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a fallback message when error is not an Error instance", () => {
    render(<ErrorFallback error="raw string error" />);
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders a fallback message when error is null", () => {
    render(<ErrorFallback error={null} />);
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders a fallback message when error is undefined", () => {
    render(<ErrorFallback error={undefined} />);
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders a fallback message when error is a plain object", () => {
    render(<ErrorFallback error={{ code: 500 }} />);
    expect(screen.getByText("An unexpected error occurred.")).toBeInTheDocument();
  });

  it("renders the Try again button when onReset is provided", () => {
    const onReset = vi.fn();
    render(<ErrorFallback error={new Error("oops")} onReset={onReset} />);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls onReset when Try again is clicked", () => {
    const onReset = vi.fn();
    render(<ErrorFallback error={new Error("oops")} onReset={onReset} />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("does not render the Try again button when onReset is not provided", () => {
    render(<ErrorFallback error={new Error("oops")} />);
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("always renders the Back to dashboard link", () => {
    render(<ErrorFallback error={new Error("oops")} />);
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
