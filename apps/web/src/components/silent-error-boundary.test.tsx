import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { SilentErrorBoundary } from "./silent-error-boundary";

vi.mock("../lib/sentry", () => ({
  captureReactBoundaryError: vi.fn(),
}));

import { captureReactBoundaryError } from "../lib/sentry";

const mockCapture = captureReactBoundaryError as ReturnType<typeof vi.fn>;

function getLastCall(): unknown[] {
  const calls = mockCapture.mock.calls as unknown[][];
  const last = calls[calls.length - 1];
  if (!last) throw new Error("captureReactBoundaryError was not called");
  return last;
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error("boom");
  return <div>child content</div>;
}

describe("SilentErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress React error console noise for throwing tests
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("renders children when no error", () => {
    render(
      <SilentErrorBoundary>
        <div>hello</div>
      </SilentErrorBoundary>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("renders null fallback and does not rethrow when child throws", () => {
    const { container } = render(
      <SilentErrorBoundary>
        <Bomb shouldThrow />
      </SilentErrorBoundary>,
    );
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it("calls captureReactBoundaryError with the source when child throws", () => {
    render(
      <SilentErrorBoundary source="test-widget">
        <Bomb shouldThrow />
      </SilentErrorBoundary>,
    );
    expect(mockCapture).toHaveBeenCalledTimes(1);
    const call = getLastCall();
    expect(call[0]).toBeInstanceOf(Error);
    expect(call[2]).toBe("test-widget");
  });

  it("uses default source 'silent-boundary' when source is not provided", () => {
    render(
      <SilentErrorBoundary>
        <Bomb shouldThrow />
      </SilentErrorBoundary>,
    );
    expect(getLastCall()[2]).toBe("silent-boundary");
  });

  it("renders custom fallback when provided and child throws", () => {
    render(
      <SilentErrorBoundary fallback={<div>fallback ui</div>}>
        <Bomb shouldThrow />
      </SilentErrorBoundary>,
    );
    expect(screen.getByText("fallback ui")).toBeInTheDocument();
    expect(screen.queryByText("child content")).not.toBeInTheDocument();
  });

  it("normalizes non-Error throws to Error before reporting", () => {
    function StringBomb(): React.ReactNode {
      throw "string error";
    }
    render(
      <SilentErrorBoundary source="test-widget">
        <StringBomb />
      </SilentErrorBoundary>,
    );
    const call = getLastCall();
    expect(call[0]).toBeInstanceOf(Error);
    expect((call[0] as Error).message).toBe("string error");
  });

  it("does not rethrow even if captureReactBoundaryError throws", () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error("reporting failure");
    });
    expect(() =>
      render(
        <SilentErrorBoundary>
          <Bomb shouldThrow />
        </SilentErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it("invokes the optional onError callback with the error and info when a child throws", () => {
    const onError = vi.fn();
    render(
      <SilentErrorBoundary source="test-widget" onError={onError}>
        <Bomb shouldThrow />
      </SilentErrorBoundary>,
    );
    // Sentry capture still happens...
    expect(mockCapture).toHaveBeenCalledTimes(1);
    // ...and the extra hook fires so callers can add their own reporting (e.g. PostHog).
    expect(onError).toHaveBeenCalledTimes(1);
    const [err, info] = onError.mock.calls[0]!;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("boom");
    expect(info).toHaveProperty("componentStack");
  });

  it("does not rethrow even if the onError callback throws", () => {
    const onError = vi.fn(() => {
      throw new Error("callback failure");
    });
    expect(() =>
      render(
        <SilentErrorBoundary onError={onError}>
          <Bomb shouldThrow />
        </SilentErrorBoundary>,
      ),
    ).not.toThrow();
    // Sentry capture is unaffected by the callback throwing.
    expect(mockCapture).toHaveBeenCalledTimes(1);
  });
});
