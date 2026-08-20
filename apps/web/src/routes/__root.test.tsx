import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mockCaptureAppException = vi.fn();
vi.mock("../lib/analytics", () => ({
  initAnalytics: vi.fn(),
  identifyUser: vi.fn(),
  resetAnalytics: vi.fn(),
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

const hoisted = vi.hoisted(() => ({
  mockCreateRootRoute: vi.fn(
    (config: {
      component: React.ComponentType;
      notFoundComponent: React.ComponentType;
      errorComponent: React.ComponentType;
    }) => ({
      component: config.component,
      notFoundComponent: config.notFoundComponent,
      errorComponent: config.errorComponent,
    }),
  ),
}));

const mockLocation = { href: "/dashboard" };

vi.mock("@tanstack/react-router", () => ({
  createRootRoute: hoisted.mockCreateRootRoute,
  Outlet: () => <div data-testid="root-outlet" />,
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
  useLocation: () => mockLocation,
}));

const mockEmptyStateLinkProvider = vi.fn(
  ({ children }: { children: React.ReactNode; component: unknown }) =>
    React.createElement("div", { "data-testid": "empty-state-link-provider" }, children),
);

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    EmptyStateLinkProvider: mockEmptyStateLinkProvider,
    Skeleton: () => React.createElement("div", { "data-testid": "skeleton" }),
  };
});

vi.mock("../components/router-empty-state-link", () => ({
  RouterEmptyStateLink: () => React.createElement("span"),
}));

const mockAiUsageCapProvider = vi.fn(({ children }: { children: React.ReactNode }) =>
  React.createElement("div", { "data-testid": "ai-usage-cap-provider" }, children),
);
vi.mock("../components/dialogs/ai-usage-cap-provider", () => ({
  AiUsageCapProvider: mockAiUsageCapProvider,
}));

vi.mock("../components/error-fallback", () => ({
  ErrorFallback: ({ error, onReset }: { error: unknown; onReset?: () => void }) => (
    <div>
      <h1>Something went wrong</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      {onReset && (
        <button type="button" onClick={onReset}>
          Try again
        </button>
      )}
    </div>
  ),
}));

const originalConsoleError = console.error;
beforeEach(() => {
  vi.resetModules();
  hoisted.mockCreateRootRoute.mockClear();
  mockCaptureAppException.mockClear();
  mockLocation.href = "/dashboard";
  console.error = vi.fn();
});
afterEach(() => {
  console.error = originalConsoleError;
});

describe("RootLayout", () => {
  it("registers component, notFoundComponent, and errorComponent", async () => {
    const { RootLayout, NotFoundPage, RootErrorPage } = await import("./__root");

    expect(hoisted.mockCreateRootRoute).toHaveBeenCalledWith({
      component: RootLayout,
      notFoundComponent: NotFoundPage,
      errorComponent: RootErrorPage,
    });
  });

  it("renders the root shell container and outlet placeholder", async () => {
    const { RootLayout } = await import("./__root");

    render(React.createElement(RootLayout));

    expect(
      document.querySelector(".min-h-screen.bg-background.text-foreground.font-body"),
    ).not.toBeNull();
    expect(screen.getByTestId("root-outlet")).toBeInTheDocument();
  });

  it("wraps the outlet with EmptyStateLinkProvider", async () => {
    mockEmptyStateLinkProvider.mockClear();
    const { RootLayout } = await import("./__root");

    render(React.createElement(RootLayout));

    expect(mockEmptyStateLinkProvider).toHaveBeenCalled();
    // Provider should wrap the outlet
    const provider = screen.getByTestId("empty-state-link-provider");
    expect(provider).toBeInTheDocument();
    expect(screen.getByTestId("root-outlet")).toBeInTheDocument();
  });

  it("wraps the outlet with AiUsageCapProvider so usage-cap dialogs render inside router context", async () => {
    mockAiUsageCapProvider.mockClear();
    const { RootLayout } = await import("./__root");

    render(React.createElement(RootLayout));

    // The provider mounts the usage-cap dialog, which calls useNavigate(); it must
    // live inside the router tree (root route), not above RouterProvider in main.tsx.
    expect(mockAiUsageCapProvider).toHaveBeenCalled();
    const provider = screen.getByTestId("ai-usage-cap-provider");
    expect(provider).toBeInTheDocument();
    expect(provider).toContainElement(screen.getByTestId("empty-state-link-provider"));
    expect(screen.getByTestId("root-outlet")).toBeInTheDocument();
  });

  it("passes RouterEmptyStateLink as the component prop to EmptyStateLinkProvider", async () => {
    mockEmptyStateLinkProvider.mockClear();
    const { RouterEmptyStateLink } = await import("../components/router-empty-state-link");
    const { RootLayout } = await import("./__root");

    render(React.createElement(RootLayout));

    const callArgs = mockEmptyStateLinkProvider.mock.calls[0]?.[0] as
      | { component: unknown }
      | undefined;
    expect(callArgs?.component).toBe(RouterEmptyStateLink);
  });
});

describe("RootErrorPage", () => {
  it("renders the error fallback with the error message", async () => {
    const { RootErrorPage } = await import("./__root");
    const error = new Error("route crashed");
    const reset = vi.fn();

    render(React.createElement(RootErrorPage, { error, reset }));

    expect(screen.getByRole("heading", { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.getByText("route crashed")).toBeInTheDocument();
  });

  it("calls reset when try again is clicked", async () => {
    const { RootErrorPage } = await import("./__root");
    const reset = vi.fn();

    render(React.createElement(RootErrorPage, { error: new Error("boom"), reset }));

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("logs the error to console.error via useEffect", async () => {
    const { RootErrorPage } = await import("./__root");
    const error = new Error("effect error");

    await act(async () => {
      render(React.createElement(RootErrorPage, { error, reset: vi.fn() }));
    });

    expect(console.error).toHaveBeenCalledWith("[RootErrorPage] Route render error:", error);
  });

  it("calls captureAppException when an Error is thrown", async () => {
    const { RootErrorPage } = await import("./__root");
    const error = new Error("posthog test");

    await act(async () => {
      render(React.createElement(RootErrorPage, { error, reset: vi.fn() }));
    });

    expect(mockCaptureAppException).toHaveBeenCalledWith(error, {
      tags: { source: "root-route-error" },
    });
  });

  it("passes non-Error thrown values to captureAppException", async () => {
    const { RootErrorPage } = await import("./__root");

    await act(async () => {
      render(
        React.createElement(RootErrorPage, { error: "string error" as never, reset: vi.fn() }),
      );
    });

    expect(mockCaptureAppException).toHaveBeenCalledWith("string error", {
      tags: { source: "root-route-error" },
    });
  });

  it("does not throw when captureAppException itself throws", async () => {
    mockCaptureAppException.mockImplementationOnce(() => {
      throw new Error("posthog internal failure");
    });

    const { RootErrorPage } = await import("./__root");
    const error = new Error("safe test");

    await expect(
      act(async () => {
        render(React.createElement(RootErrorPage, { error, reset: vi.fn() }));
      }),
    ).resolves.not.toThrow();
  });
});

describe("NotFoundPage", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders 404 heading and description", async () => {
    const { NotFoundPage } = await import("./__root");

    render(React.createElement(NotFoundPage));

    expect(screen.getByRole("heading", { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByText("404")).toBeInTheDocument();
    expect(screen.getByText(/the page you are looking for does not exist/i)).toBeInTheDocument();
  });

  it("renders a link back to the dashboard", async () => {
    const { NotFoundPage } = await import("./__root");

    render(React.createElement(NotFoundPage));

    const link = screen.getByRole("link", { name: /back to dashboard/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/dashboard");
  });
});
