import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiError } from "../../lib/http-response";

const { mockCaptureEvent, mockCaptureAppException } = vi.hoisted(() => ({
  mockCaptureEvent: vi.fn(),
  mockCaptureAppException: vi.fn(),
}));

vi.mock("../../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("../../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@grantpipe/ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/ui")>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="cap-dialog">{children}</div> : null,
    DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) => (
      <button onClick={onClick} className={className}>
        {children}
      </button>
    ),
  };
});

import { AiUsageCapProvider, useReportAiUsageCap } from "./ai-usage-cap-provider";

function TestConsumer() {
  const reportCap = useReportAiUsageCap();
  return (
    <button
      onClick={() => {
        const err = new ApiError("ai_usage_cap_reached", 402, "ai_usage_cap_reached");
        (err as ApiError & { details: unknown }).details = {
          error: "ai_usage_cap_reached",
          feature: "award_intake",
          cap: 5,
          used: 5,
          currentPlan: "starter",
          upgradeToPlan: "growth",
        };
        reportCap(err);
      }}
    >
      trigger cap
    </button>
  );
}

function TestConsumerNonCap() {
  const reportCap = useReportAiUsageCap();
  return (
    <button
      onClick={() => {
        reportCap(new Error("some other error"));
      }}
    >
      trigger normal error
    </button>
  );
}

describe("AiUsageCapProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens dialog when a cap error is reported", () => {
    render(
      <AiUsageCapProvider>
        <TestConsumer />
      </AiUsageCapProvider>,
    );
    expect(screen.queryByTestId("cap-dialog")).toBeNull();
    act(() => {
      screen.getByText("trigger cap").click();
    });
    expect(screen.getByTestId("cap-dialog")).toBeDefined();
  });

  it("returns true when the error is a cap error", () => {
    let result: boolean | undefined;
    function ResultConsumer() {
      const reportCap = useReportAiUsageCap();
      return (
        <button
          onClick={() => {
            const err = new ApiError("ai_usage_cap_reached", 402, "ai_usage_cap_reached");
            (err as ApiError & { details: unknown }).details = {
              error: "ai_usage_cap_reached",
              feature: "award_intake",
              cap: 5,
              used: 5,
              currentPlan: "starter",
              upgradeToPlan: "growth",
            };
            result = reportCap(err);
          }}
        >
          go
        </button>
      );
    }
    render(
      <AiUsageCapProvider>
        <ResultConsumer />
      </AiUsageCapProvider>,
    );
    act(() => {
      screen.getByText("go").click();
    });
    expect(result).toBe(true);
  });

  it("returns false and does not open dialog for a normal error", () => {
    let result: boolean | undefined;
    function ResultConsumer() {
      const reportCap = useReportAiUsageCap();
      return (
        <button
          onClick={() => {
            result = reportCap(new Error("something else"));
          }}
        >
          go
        </button>
      );
    }
    render(
      <AiUsageCapProvider>
        <ResultConsumer />
      </AiUsageCapProvider>,
    );
    act(() => {
      screen.getByText("go").click();
    });
    expect(result).toBe(false);
    expect(screen.queryByTestId("cap-dialog")).toBeNull();
  });

  it("does not open dialog on non-cap ApiError", () => {
    render(
      <AiUsageCapProvider>
        <TestConsumerNonCap />
      </AiUsageCapProvider>,
    );
    act(() => {
      screen.getByText("trigger normal error").click();
    });
    expect(screen.queryByTestId("cap-dialog")).toBeNull();
  });
});
