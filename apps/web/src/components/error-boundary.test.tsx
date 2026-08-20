import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCaptureReactBoundaryError, mockCaptureEvent } = vi.hoisted(() => ({
  mockCaptureReactBoundaryError: vi.fn(),
  mockCaptureEvent: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureReactBoundaryError: mockCaptureReactBoundaryError,
  getUserFacingErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "An unexpected error occurred.",
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) =>
    React.createElement("a", { href: to, ...rest }, children),
}));

// Suppress expected console.error output during tests
const originalConsoleError = console.error;
beforeEach(() => {
  console.error = vi.fn();
  mockCaptureReactBoundaryError.mockClear();
  mockCaptureEvent.mockClear();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error("test render error");
  return <div>ok</div>;
}

import { ErrorBoundary } from "./error-boundary";

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders the error fallback when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText("test render error")).toBeInTheDocument();
  });

  it("logs the error to console.error", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });

  it("calls captureReactBoundaryError when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(mockCaptureReactBoundaryError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
      "error-boundary",
    );
  });

  it("still renders fallback when error reporting throws", () => {
    mockCaptureReactBoundaryError.mockImplementationOnce(() => {
      throw new Error("capture failed");
    });

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
  });

  it("renders children again after reset", () => {
    // Use a ref-controlled component so the child stops throwing before reset triggers re-render
    const shouldThrowRef = { current: true };
    function DynamicBoom() {
      if (shouldThrowRef.current) throw new Error("test render error");
      return <div>ok</div>;
    }

    render(
      <ErrorBoundary>
        <DynamicBoom />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();

    // Stop throwing before clicking reset so the re-render succeeds
    shouldThrowRef.current = false;
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("renders a link back to dashboard", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });

  it("fires error_boundary_triggered with component_stack_present when a child throws", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(mockCaptureEvent).toHaveBeenCalledWith("error_boundary_triggered", {
      component_stack_present: true,
    });
  });

  it("does not include raw error message or stack in captureEvent payload", () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(mockCaptureEvent).toHaveBeenCalled();
    for (const call of mockCaptureEvent.mock.calls) {
      const payload = JSON.stringify(call);
      expect(payload).not.toContain("test render error");
    }
  });

  it("wraps a non-Error thrown value in an Error before capturing", () => {
    // Throw a plain string (non-Error) from the child
    function StringThrower(): React.ReactElement {
      throw "plain string error";
    }

    render(
      <ErrorBoundary>
        <StringThrower />
      </ErrorBoundary>,
    );

    // componentDidCatch wraps string in new Error(String(error))
    expect(mockCaptureReactBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "plain string error" }),
      expect.anything(),
      "error-boundary",
    );
  });
});
