import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../lib/sentry-client", () => ({ captureException: vi.fn() }));

import { IslandBoundary } from "./island-boundary";
import { captureException } from "../lib/sentry-client";

const originalConsoleError = console.error;
beforeEach(() => {
  vi.clearAllMocks();
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

function Boom({ shouldThrow = true }: { shouldThrow?: boolean }) {
  if (shouldThrow) throw new Error("island render error");
  return <div>island content</div>;
}

describe("IslandBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <IslandBoundary>
        <Boom shouldThrow={false} />
      </IslandBoundary>,
    );
    expect(screen.getByText("island content")).toBeInTheDocument();
  });

  it("renders the inline fallback when a child throws", () => {
    render(
      <IslandBoundary>
        <Boom />
      </IslandBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/this section failed to load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("calls captureException with the caught error", () => {
    render(
      <IslandBoundary>
        <Boom />
      </IslandBoundary>,
    );
    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
    const calledWith = (captureException as ReturnType<typeof vi.fn>).mock.calls[0][0] as Error;
    expect(calledWith.message).toBe("island render error");
  });

  it("logs the error to console.error", () => {
    render(
      <IslandBoundary>
        <Boom />
      </IslandBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });

  it("calls window.location.reload when Reload is clicked", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(
      <IslandBoundary>
        <Boom />
      </IslandBoundary>,
    );

    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reloadMock).toHaveBeenCalledOnce();
  });
});
