import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { trackEvent } from "../lib/analytics";
import { captureException } from "../lib/sentry-client";

interface TurnstileAPI {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset?: (widgetId: string) => void;
  ready: (cb: () => void) => void;
}

export interface TurnstileWidgetHandle {
  /** Discards the current token and re-runs the challenge to mint a fresh one. */
  reset: () => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileAPI;
    onloadTurnstileCallback?: () => void;
  }
}

// Module-level dedup flag so the script is only injected once per page load.
// Tests reset this via `(globalThis as Record<string,unknown>).__turnstileScriptLoaded`.
function isTurnstileScriptLoaded(): boolean {
  return (globalThis as Record<string, unknown>).__turnstileScriptLoaded === true;
}

function markTurnstileScriptLoaded(): void {
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = true;
}

function clearTurnstileScriptLoaded(): void {
  (globalThis as Record<string, unknown>).__turnstileScriptLoaded = false;
}

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onloadTurnstileCallback";
const TURNSTILE_SCRIPT_MAX_RETRIES = 2;
const TURNSTILE_SCRIPT_RETRY_DELAY_MS = 250;
const TURNSTILE_SCRIPT_ERROR_EVENT = "grantpipe:turnstile-script-error";
const pendingTurnstileRenderCallbacks = new Set<() => void>();
let turnstileOnloadDispatcher: (() => void) | undefined;
let previousTurnstileOnloadCallback: (() => void) | undefined;

function registerTurnstileRenderCallback(callback: () => void): () => void {
  pendingTurnstileRenderCallbacks.add(callback);
  if (!turnstileOnloadDispatcher || window.onloadTurnstileCallback !== turnstileOnloadDispatcher) {
    const previousCallback = window.onloadTurnstileCallback;
    const dispatcher = () => {
      previousCallback?.();
      for (const pendingCallback of [...pendingTurnstileRenderCallbacks]) {
        pendingCallback();
      }
    };
    previousTurnstileOnloadCallback = previousCallback;
    turnstileOnloadDispatcher = dispatcher;
    window.onloadTurnstileCallback = dispatcher;
  }

  return () => {
    pendingTurnstileRenderCallbacks.delete(callback);
    if (
      pendingTurnstileRenderCallbacks.size === 0 &&
      window.onloadTurnstileCallback === turnstileOnloadDispatcher
    ) {
      window.onloadTurnstileCallback = previousTurnstileOnloadCallback;
      turnstileOnloadDispatcher = undefined;
      previousTurnstileOnloadCallback = undefined;
    }
  };
}

function trackTurnstileFailure(failureType: "challenge_error" | "script_load_error"): void {
  trackEvent("turnstile_widget_failed", {
    failure_type: failureType,
  });
}

interface TurnstileWidgetProps {
  siteKey?: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onToken, onExpire, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const [scriptAttempt, setScriptAttempt] = useState(0);
    const scriptAttemptRef = useRef(0);
    const retryTimerRef = useRef<number | undefined>(undefined);
    // Keep refs for callbacks so the render effect's closure is always current
    // without re-rendering the widget. Synced in an effect so we never mutate a
    // ref during render.
    const onTokenRef = useRef(onToken);
    const onExpireRef = useRef(onExpire);
    useEffect(() => {
      onTokenRef.current = onToken;
      onExpireRef.current = onExpire;
    }, [onToken, onExpire]);

    useEffect(() => {
      if (!siteKey) return;
      const scheduleRetry = () => {
        const attempt = scriptAttemptRef.current;
        if (attempt >= TURNSTILE_SCRIPT_MAX_RETRIES || retryTimerRef.current !== undefined) {
          return;
        }
        retryTimerRef.current = window.setTimeout(
          () => {
            retryTimerRef.current = undefined;
            const nextAttempt = scriptAttemptRef.current + 1;
            scriptAttemptRef.current = nextAttempt;
            setScriptAttempt(nextAttempt);
          },
          TURNSTILE_SCRIPT_RETRY_DELAY_MS * (attempt + 1),
        );
      };
      window.addEventListener(TURNSTILE_SCRIPT_ERROR_EVENT, scheduleRetry);
      return () => {
        window.removeEventListener(TURNSTILE_SCRIPT_ERROR_EVENT, scheduleRetry);
        if (retryTimerRef.current !== undefined) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = undefined;
        }
      };
    }, [siteKey]);

    useImperativeHandle(
      ref,
      () => ({
        reset() {
          // Turnstile tokens are single-use. Resetting discards the spent token
          // and re-runs the challenge, which fires the callback with a fresh one.
          onTokenRef.current("");
          if (widgetIdRef.current && window.turnstile?.reset) {
            window.turnstile.reset(widgetIdRef.current);
          }
        },
      }),
      [],
    );

    useEffect(() => {
      if (!siteKey) return;

      const container = containerRef.current!;

      function renderWidget() {
        if (!window.turnstile) {
          captureException(new Error("Turnstile API unavailable after script load"), {
            tags: { source: "turnstile", failure_type: "api_unavailable" },
          });
          return;
        }
        try {
          widgetIdRef.current = window.turnstile.render(container, {
            sitekey: siteKey!,
            callback: (token: string) => onTokenRef.current(token),
            "expired-callback": () => {
              if (onExpireRef.current) {
                onExpireRef.current();
              }
            },
            "error-callback": () => {
              onTokenRef.current("");
              trackTurnstileFailure("challenge_error");
            },
          });
        } catch (error) {
          onTokenRef.current("");
          captureException(error, {
            tags: { source: "turnstile", failure_type: "render_error" },
          });
        }
      }

      let unregisterRenderCallback: (() => void) | undefined;

      if (window.turnstile) {
        // Turnstile is already loaded — enqueue via ready() for consistent async behaviour
        window.turnstile.ready(renderWidget);
      } else {
        unregisterRenderCallback = registerTurnstileRenderCallback(renderWidget);
      }

      if (!isTurnstileScriptLoaded()) {
        markTurnstileScriptLoaded();
        const script = document.createElement("script");
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = false;
        script.onerror = () => {
          clearTurnstileScriptLoaded();
          script.remove();
          onTokenRef.current("");
          trackTurnstileFailure("script_load_error");
          window.dispatchEvent(new Event(TURNSTILE_SCRIPT_ERROR_EVENT));
        };
        document.head.appendChild(script);
      }

      return () => {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
        unregisterRenderCallback?.();
      };
    }, [siteKey, scriptAttempt]);

    if (!siteKey) {
      return null;
    }

    return <div ref={containerRef} className={className} />;
  },
);
