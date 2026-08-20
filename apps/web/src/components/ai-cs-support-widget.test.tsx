import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { mockNavigate, mockCaptureAppException, mockCaptureEvent, widgetProps } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockCaptureAppException: vi.fn(),
  mockCaptureEvent: vi.fn(),
  widgetProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../lib/sentry", () => ({
  captureAppException: mockCaptureAppException,
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: mockCaptureEvent,
}));

vi.mock("@ventora/ai-cs/react", () => ({
  AiCsWidget: (props: Record<string, unknown>) => {
    widgetProps.push(props);
    return <div data-testid="ventora-ai-cs-widget" />;
  },
}));

import { AiCsSupportWidget } from "./ai-cs-support-widget";
import { reportAiCsWidgetLoadFailure } from "../lib/ai-cs-analytics";

type NavigateTarget = { url: string; path: string; label: string };

type SseEvent = { event: string; data: Record<string, unknown> };

function renderWidget(orgId: string | null = "org-1") {
  widgetProps.length = 0;
  mockNavigate.mockClear();
  mockCaptureAppException.mockClear();
  mockCaptureEvent.mockClear();
  render(<AiCsSupportWidget userId="user-1" currentPath="/dashboard" orgId={orgId} />);
  return widgetProps[0]!;
}

describe("AiCsSupportWidget", () => {
  it("passes GrantPipe copy and routes navigation suggestions through TanStack Router", () => {
    const props = renderWidget();

    expect(widgetProps).toHaveLength(1);

    expect(props.copy).toMatchObject({
      title: "GrantPipe help",
      subtitle: "Answers fit your role and page",
      launcher: "Questions?",
      placeholder: "Ask about this page",
      emptyBody: "Ask about this page. Find the next step.",
      emptySuggestions: ["How do I add a grant?", "Where are reports?"],
    });
    expect(props.session).toMatchObject({ metadata: { orgId: "org-1" } });

    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;
    onNavigate({ url: "/grants", path: "/grants", label: "Grants" });

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/grants" });
  });

  it("omits org metadata when no orgId and ignores non-relative navigation targets", () => {
    const props = renderWidget(null);

    // orgId falsy -> session carries no metadata key at all.
    expect(props.session).not.toHaveProperty("metadata");

    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;
    // A target that is not an in-app absolute path must be ignored, never
    // forwarded to the router (guards against off-site/external redirects).
    onNavigate({ url: "", path: "https://evil.example/phish", label: "Phish" });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("parses path#hash targets into { to, hash } so TanStack Router resolves them", () => {
    const props = renderWidget();
    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;

    onNavigate({ url: "/settings#team", path: "/settings#team", label: "Team" });

    expect(mockNavigate).toHaveBeenCalledWith({ to: "/settings", hash: "team" });
  });

  it("parses path?search#hash targets into { to, search, hash }", () => {
    const props = renderWidget();
    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;

    onNavigate({
      url: "/grants?status=active#summary",
      path: "/grants?status=active#summary",
      label: "Active grants",
    });

    expect(mockNavigate).toHaveBeenCalledWith({
      to: "/grants",
      search: { status: "active" },
      hash: "summary",
    });
  });

  it("rejects protocol-relative targets like //evil.com", () => {
    const props = renderWidget();
    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;

    onNavigate({ url: "//evil.com/phish", path: "//evil.com/phish", label: "Phish" });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("rejects javascript: and http(s): scheme targets", () => {
    const props = renderWidget();
    const onNavigate = props.onNavigate as (target: NavigateTarget) => void;

    for (const path of [
      "javascript:alert(1)",
      "http://evil.com",
      "https://evil.com",
      "",
      "relative/path",
    ]) {
      onNavigate({ url: path, path, label: "x" });
    }

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("forwards only privacy-safe SSE events to product analytics", () => {
    const props = renderWidget();
    const onEvent = props.onEvent as (event: SseEvent) => void;

    onEvent({ event: "session.created", data: { sessionId: "sess-1" } });
    onEvent({ event: "message.done", data: { messageId: "msg-1" } });
    onEvent({
      event: "navigation.suggestion",
      data: { target: { label: "Grants", path: "/grants/abc-123" } },
    });
    onEvent({
      event: "support.escalation.requested",
      data: { escalationId: "esc-1", reason: "Donor asked about restricted funds" },
    });
    onEvent({
      event: "error",
      data: { code: "stream_error", message: "upstream 502 for org acme" },
    });

    const calls = mockCaptureEvent.mock.calls;
    const names = calls.map((c) => c[0]);
    expect(names).toEqual([
      "ai_cs_session_started",
      "ai_cs_answer_completed",
      "ai_cs_navigation_suggested",
      "ai_cs_escalation_requested",
      "ai_cs_failed",
    ]);

    // Only a machine error code rides along; never the free-form error message.
    const failedCall = calls.find((c) => c[0] === "ai_cs_failed");
    expect(failedCall?.[1]).toEqual({ code: "stream_error" });

    // No event payload may carry donor/funder text, the suggested entity path,
    // the escalation reason, or any other free-form string.
    const serialized = JSON.stringify(calls);
    expect(serialized).not.toContain("/grants/abc-123");
    expect(serialized).not.toContain("restricted funds");
    expect(serialized).not.toContain("upstream 502");
    expect(serialized).not.toContain("Grants");
  });

  it("never forwards message text, sources, or other unsafe SSE payloads", () => {
    const props = renderWidget();
    const onEvent = props.onEvent as (event: SseEvent) => void;

    onEvent({ event: "message.delta", data: { messageId: "m", delta: "Donor Jane gave $5,000" } });
    onEvent({ event: "source", data: { source: { id: "s", title: "Restricted fund policy" } } });
    onEvent({ event: "cta", data: { cta: { label: "Email us", url: "mailto:x@y.com" } } });
    onEvent({
      event: "workflow.step",
      data: { step: { id: "w", label: "Add a grant", status: "current" } },
    });
    onEvent({ event: "heartbeat", data: { timestamp: "2026-06-20T00:00:00Z" } });

    expect(mockCaptureEvent).not.toHaveBeenCalled();
  });

  it("reports widget errors to the app Sentry capture helper", () => {
    const props = renderWidget();
    const onError = props.onError as (error: Error) => void;

    const error = new Error("ai-cs boom");
    onError(error);

    expect(mockCaptureAppException).toHaveBeenCalledWith(error, {
      tags: { source: "ai-cs-support-widget" },
    });
  });

  it("reports a widget load/mount failure to product analytics without any user data", () => {
    mockCaptureEvent.mockClear();

    reportAiCsWidgetLoadFailure();

    // A mount/lazy-load crash reaches Sentry via the error boundary; this
    // captures the same failure in PostHog so it shows up in product analytics,
    // mirroring the AI-SDR widget's load-failure event.
    expect(mockCaptureEvent).toHaveBeenCalledTimes(1);
    const [name, props] = mockCaptureEvent.mock.calls[0]!;
    expect(name).toBe("ai_cs_widget_error");
    // Only fixed enum values — never a user id, org id, path, or error text.
    expect(props).toEqual({ stage: "load", surface: "app" });
  });
});
