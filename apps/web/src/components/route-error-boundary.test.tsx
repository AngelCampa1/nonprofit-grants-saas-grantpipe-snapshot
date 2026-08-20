import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCaptureException } = vi.hoisted(() => ({
  mockCaptureException: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: (...args: unknown[]) => {
    mockCaptureException(...args);
  },
}));

vi.mock("lucide-react", () => ({
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) =>
    React.createElement("svg", { "data-testid": "icon-alert", ...props }),
}));

vi.mock("@grantpipe/ui", () => ({
  Button: ({
    children,
    onClick,
    type,
  }: {
    children?: React.ReactNode;
    onClick?: () => void;
    type?: "button" | "submit" | "reset";
  }) => React.createElement("button", { type: type ?? "button", onClick }, children),
}));

import { RouteErrorBoundary } from "./route-error-boundary";

function renderBoundary(overrides?: { error?: unknown; reset?: () => void; source?: string }) {
  const error = (overrides?.error ?? new Error("Boom")) as Error;
  const reset = overrides?.reset ?? vi.fn();
  // ErrorComponentProps requires info, but we don't use it in the boundary.
  return {
    reset,
    ...render(
      <RouteErrorBoundary
        error={error}
        reset={reset}
        info={{ componentStack: "" }}
        source={overrides?.source}
      />,
    ),
  };
}

describe("RouteErrorBoundary", () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders the error card with the error message", () => {
    renderBoundary({ error: new Error("Database offline") });
    expect(screen.getByTestId("route-error-boundary")).toBeDefined();
    expect(screen.getByText("Database offline")).toBeDefined();
    expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
  });

  it("uses a fallback message when the error has no message", () => {
    renderBoundary({ error: new Error("") });
    expect(screen.getByText(/something went wrong/i)).toBeDefined();
  });

  it("uses fallback message for non-Error throws", () => {
    renderBoundary({ error: "string error" });
    expect(screen.getByText(/something went wrong/i)).toBeDefined();
  });

  it("invokes reset when the Try again button is clicked", () => {
    const reset = vi.fn();
    renderBoundary({ reset });
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("captures the exception via Sentry with the source tag", () => {
    renderBoundary({ source: "my-route" });
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { source: "my-route" },
    });
  });

  it("falls back to a default source tag", () => {
    renderBoundary();
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: { source: "route-error-boundary" },
    });
  });

  it("swallows Sentry capture failures", () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("Sentry offline");
    });
    expect(() => renderBoundary()).not.toThrow();
    expect(screen.getByTestId("route-error-boundary")).toBeDefined();
  });
});
