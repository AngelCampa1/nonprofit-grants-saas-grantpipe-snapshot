import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import * as React from "react";
import { TurnstileWidget, type TurnstileWidgetHandle } from "./turnstile-widget";

vi.mock("../lib/sentry-client", () => ({
  captureException: vi.fn(),
}));

vi.mock("../lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

import { captureException } from "../lib/sentry-client";
import { trackEvent } from "../lib/analytics";

// A minimal mock of the Turnstile global API
interface MockTurnstile {
  render: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  ready: (cb: () => void) => void;
  _readyQueue: (() => void)[];
  _flush: () => void;
}

function makeMockTurnstile(): MockTurnstile {
  const mock: MockTurnstile = {
    render: vi.fn(() => "widget-id-1"),
    remove: vi.fn(),
    reset: vi.fn(),
    _readyQueue: [],
    ready(cb) {
      mock._readyQueue.push(cb);
    },
    _flush() {
      for (const cb of mock._readyQueue) cb();
      mock._readyQueue = [];
    },
  };
  return mock;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Remove any existing turnstile script tags
  document.querySelectorAll('script[src*="turnstile"]').forEach((el) => el.remove());
  // Clear the module-level dedup flag between tests
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
  delete (window as Record<string, unknown>).turnstile;
  // Clear any accumulated onload callbacks from previous tests
  delete (window as Record<string, unknown>).onloadTurnstileCallback;
  vi.mocked(captureException).mockClear();
  vi.mocked(trackEvent).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TurnstileWidget", () => {
  it("renders nothing when siteKey is not provided", () => {
    const { container } = render(<TurnstileWidget onToken={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when siteKey is an empty string", () => {
    const { container } = render(<TurnstileWidget siteKey="" onToken={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("injects the Turnstile script tag once when siteKey is provided", () => {
    render(<TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />);
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBe(1);
    expect((scripts[0] as HTMLScriptElement).src).toContain("challenges.cloudflare.com/turnstile");
  });

  it("loads the Turnstile script without async or defer when using turnstile.ready", () => {
    render(<TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />);

    const script = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    expect(script).not.toBeNull();
    expect(script!.hasAttribute("async")).toBe(false);
    expect(script!.hasAttribute("defer")).toBe(false);
    expect(script!.async).toBe(false);
    expect(script!.defer).toBe(false);
  });

  it("does not inject a second script tag when two widgets mount with the same siteKey", () => {
    render(
      <>
        <TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />
        <TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />
      </>,
    );
    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBe(1);
  });

  it("calls window.turnstile.render with the correct sitekey when turnstile is ready", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    expect(mockTurnstile.render).toHaveBeenCalledOnce();
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(callArgs[1]).toMatchObject({ sitekey: "0xABC123" });
  });

  it("invokes onToken callback when Turnstile fires its success callback", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    // Simulate the Turnstile callback
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    const callback = callArgs[1].callback as (token: string) => void;
    callback("test-token-abc");

    expect(onToken).toHaveBeenCalledWith("test-token-abc");
  });

  it("invokes onExpire callback when Turnstile fires its expired-callback", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    const onExpire = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} onExpire={onExpire} />);

    act(() => {
      mockTurnstile._flush();
    });

    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    const expiredCallback = callArgs[1]["expired-callback"] as () => void;
    expiredCallback();

    expect(onExpire).toHaveBeenCalledOnce();
  });

  it("tracks but does not report to Sentry when Turnstile fires its error-callback", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    const errorCallback = callArgs[1]["error-callback"] as () => void;
    errorCallback();

    expect(onToken).toHaveBeenCalledWith("");
    expect(trackEvent).toHaveBeenCalledWith("turnstile_widget_failed", {
      failure_type: "challenge_error",
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("tracks but does not report to Sentry when the Turnstile script fails to load", () => {
    render(<TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />);
    const script = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    expect(script).not.toBeNull();
    act(() => {
      script!.dispatchEvent(new Event("error"));
    });

    expect(trackEvent).toHaveBeenCalledWith("turnstile_widget_failed", {
      failure_type: "script_load_error",
    });
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reinjects after a failed script load and renders only the remounted widget", () => {
    const firstToken = vi.fn();
    const first = render(<TurnstileWidget siteKey="0xSITEKEY" onToken={firstToken} />);
    const failedScript = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    expect(failedScript).not.toBeNull();
    act(() => {
      failedScript!.dispatchEvent(new Event("error"));
    });
    first.unmount();

    const nextToken = vi.fn();
    render(<TurnstileWidget siteKey="0xSITEKEY" onToken={nextToken} />);
    const replacementScripts = document.querySelectorAll<HTMLScriptElement>(
      'script[src*="turnstile"]',
    );
    expect(replacementScripts).toHaveLength(1);
    expect(replacementScripts[0]).not.toBe(failedScript);

    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;
    act(() => {
      window.onloadTurnstileCallback!();
    });

    expect(mockTurnstile.render).toHaveBeenCalledOnce();
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    act(() => {
      (callArgs[1].callback as (token: string) => void)("replacement-token");
    });
    expect(firstToken).toHaveBeenCalledOnce();
    expect(firstToken).toHaveBeenCalledWith("");
    expect(nextToken).toHaveBeenCalledWith("replacement-token");
  });

  it("retries a transient script failure while the same widget remains mounted", () => {
    vi.useFakeTimers();
    const onToken = vi.fn();
    const mounted = render(<TurnstileWidget siteKey="0xSITEKEY" onToken={onToken} />);
    const failedScript = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    act(() => {
      failedScript!.dispatchEvent(new Event("error"));
      vi.advanceTimersByTime(300);
    });

    const replacement = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(failedScript);

    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;
    act(() => {
      window.onloadTurnstileCallback!();
    });
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    act(() => {
      (callArgs[1].callback as (token: string) => void)("recovered-token");
    });

    expect(onToken).toHaveBeenCalledWith("recovered-token");
    mounted.unmount();
    vi.useRealTimers();
  });

  it("bounds automatic script retries and stops after the retry budget", () => {
    vi.useFakeTimers();
    const mounted = render(<TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />);

    for (const delay of [250, 500]) {
      const script = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
      act(() => {
        script!.dispatchEvent(new Event("error"));
        vi.advanceTimersByTime(delay);
      });
      expect(document.querySelector('script[src*="turnstile"]')).not.toBeNull();
    }

    const finalScript = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');
    act(() => {
      finalScript!.dispatchEvent(new Event("error"));
      vi.advanceTimersByTime(1_000);
    });

    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
    mounted.unmount();
    vi.useRealTimers();
  });

  it("cancels a pending script retry when the widget unmounts", () => {
    vi.useFakeTimers();
    const mounted = render(<TurnstileWidget siteKey="0xSITEKEY" onToken={vi.fn()} />);
    const script = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    act(() => {
      script!.dispatchEvent(new Event("error"));
    });
    mounted.unmount();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
    vi.useRealTimers();
  });

  it("lets another mounted widget recover when the original script owner unmounts", () => {
    vi.useFakeTimers();
    const ownerToken = vi.fn();
    const survivorToken = vi.fn();
    const mounted = render(
      <>
        <TurnstileWidget key="owner" siteKey="0xSITEKEY" onToken={ownerToken} />
        <TurnstileWidget key="survivor" siteKey="0xSITEKEY" onToken={survivorToken} />
      </>,
    );
    const failedScript = document.querySelector<HTMLScriptElement>('script[src*="turnstile"]');

    act(() => {
      failedScript!.dispatchEvent(new Event("error"));
    });
    mounted.rerender(
      <TurnstileWidget key="survivor" siteKey="0xSITEKEY" onToken={survivorToken} />,
    );
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(document.querySelector('script[src*="turnstile"]')).not.toBeNull();
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;
    act(() => {
      window.onloadTurnstileCallback!();
    });
    expect(mockTurnstile.render).toHaveBeenCalledOnce();
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    act(() => {
      (callArgs[1].callback as (token: string) => void)("survivor-token");
    });
    expect(ownerToken).toHaveBeenCalledTimes(1);
    expect(ownerToken).toHaveBeenCalledWith("");
    expect(survivorToken).toHaveBeenCalledWith("survivor-token");
    mounted.unmount();
    vi.useRealTimers();
  });

  it("reports when Turnstile render throws", () => {
    const renderError = new Error("render failed");
    const mockTurnstile = makeMockTurnstile();
    mockTurnstile.render.mockImplementation(() => {
      throw renderError;
    });
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    expect(() => render(<TurnstileWidget siteKey="0xABC123" onToken={vi.fn()} />)).not.toThrow();

    act(() => {
      mockTurnstile._flush();
    });

    expect(captureException).toHaveBeenCalledWith(renderError, {
      tags: { source: "turnstile", failure_type: "render_error" },
    });
  });

  it("calls turnstile.remove on unmount", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    const { unmount } = render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    unmount();

    expect(mockTurnstile.remove).toHaveBeenCalledWith("widget-id-1");
  });

  it("applies className to the container element when provided", () => {
    const { container } = render(
      <TurnstileWidget siteKey="0xABC123" onToken={vi.fn()} className="my-class" />,
    );
    expect(container.firstChild).not.toBeNull();
    expect((container.firstChild as HTMLElement).className).toContain("my-class");
  });

  it("uses the onload callback path when window.turnstile is not yet loaded", () => {
    // Ensure turnstile is NOT present so the else-branch fires
    delete (window as Record<string, unknown>).turnstile;

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    // onloadTurnstileCallback must be set
    expect(typeof window.onloadTurnstileCallback).toBe("function");

    // Simulate Turnstile loading: set window.turnstile then call the callback
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    act(() => {
      window.onloadTurnstileCallback!();
    });

    // render should have been called
    expect(mockTurnstile.render).toHaveBeenCalledOnce();
    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(callArgs[1]).toMatchObject({ sitekey: "0xABC123" });
  });

  it("chains an existing onloadTurnstileCallback when one is already set", () => {
    delete (window as Record<string, unknown>).turnstile;

    const existingCallback = vi.fn();
    window.onloadTurnstileCallback = existingCallback;

    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    act(() => {
      window.onloadTurnstileCallback!();
    });

    // Both the existing callback AND the widget render should have been called
    expect(existingCallback).toHaveBeenCalledOnce();
    expect(mockTurnstile.render).toHaveBeenCalledOnce();
  });

  it("does not call onExpire when expired-callback fires and no onExpire prop was given", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    // No onExpire prop provided
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    const callArgs = mockTurnstile.render.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    const expiredCallback = callArgs[1]["expired-callback"] as () => void;

    // Should not throw even though onExpireRef.current is undefined
    expect(() => expiredCallback()).not.toThrow();
    // onToken should NOT have been called (only error-callback calls it)
    expect(onToken).not.toHaveBeenCalled();
  });

  it("does not call turnstile.remove on unmount when widgetIdRef is null (render not yet called)", () => {
    // window.turnstile is present so the ready() path runs, but we never flush
    // so render() is never called, leaving widgetIdRef.current as null
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const { unmount } = render(<TurnstileWidget siteKey="0xABC123" onToken={vi.fn()} />);
    // Do NOT flush — widgetIdRef.current stays null

    unmount();

    // remove must NOT be called since there is no widget id
    expect(mockTurnstile.remove).not.toHaveBeenCalled();
  });

  it("does not inject a second script tag when dedup flag is already set", () => {
    // Pre-set the dedup flag as if a prior component already injected the script
    (globalThis as Record<string, unknown>).__turnstileScriptLoaded = true;

    render(<TurnstileWidget siteKey="0xNEW" onToken={vi.fn()} />);

    const scripts = document.querySelectorAll('script[src*="turnstile"]');
    expect(scripts.length).toBe(0);
  });

  it("reset() clears the token and re-runs the rendered widget challenge", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    const ref = React.createRef<TurnstileWidgetHandle>();
    render(<TurnstileWidget ref={ref} siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      mockTurnstile._flush();
    });

    act(() => {
      ref.current!.reset();
    });

    // Discards the spent token and asks Turnstile to mint a new one.
    expect(onToken).toHaveBeenCalledWith("");
    expect(mockTurnstile.reset).toHaveBeenCalledWith("widget-id-1");
  });

  it("reset() clears the token but does not call turnstile.reset before the widget has rendered", () => {
    const mockTurnstile = makeMockTurnstile();
    (window as Record<string, unknown>).turnstile = mockTurnstile;

    const onToken = vi.fn();
    const ref = React.createRef<TurnstileWidgetHandle>();
    // Do NOT flush — widgetIdRef.current stays null
    render(<TurnstileWidget ref={ref} siteKey="0xABC123" onToken={onToken} />);

    act(() => {
      ref.current!.reset();
    });

    expect(onToken).toHaveBeenCalledWith("");
    expect(mockTurnstile.reset).not.toHaveBeenCalled();
  });

  it("renderWidget returns early when window.turnstile is still undefined when onload fires", () => {
    // window.turnstile is NOT set — onloadTurnstileCallback gets registered
    const onToken = vi.fn();
    render(<TurnstileWidget siteKey="0xABC123" onToken={onToken} />);

    expect(typeof window.onloadTurnstileCallback).toBe("function");

    // Call the callback WITHOUT setting window.turnstile first → renderWidget returns early
    act(() => {
      window.onloadTurnstileCallback!();
    });

    // No render call since window.turnstile was absent
    // The callback fires but nothing breaks
    expect(onToken).not.toHaveBeenCalled();
  });
});
