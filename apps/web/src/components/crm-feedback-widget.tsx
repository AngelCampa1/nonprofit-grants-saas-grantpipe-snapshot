import { useEffect } from "react";
import { captureEvent } from "../lib/analytics";

const DEFAULT_LOADER_URL = "https://crm.ventoralabs.com/w/v1.js";

function getLoaderOrigin(url: string): string {
  try {
    return new URL(url, window.location.href).hostname;
  } catch {
    return "unknown";
  }
}

/**
 * Injects the Ventora CRM feedback-button widget loader into the page.
 *
 * The loader is env-gated: when VITE_CRM_WIDGET_KEY is unset (blank) this
 * component renders/injects nothing.  The CRM enforces an origin allowlist
 * server-side, so the widget only becomes active on the production origin
 * (https://app.grantpipe.com); on any other host the loader fetch is a
 * silent no-op — that is expected.
 *
 * NOTE: if a Content-Security-Policy is ever tightened, the following
 * origins must be allowed:
 *   script-src  https://crm.ventoralabs.com
 *   connect-src https://crm.ventoralabs.com
 */
export function CrmFeedbackWidget() {
  const key = import.meta.env.VITE_CRM_WIDGET_KEY as string | undefined;
  const url = (import.meta.env.VITE_CRM_LOADER_URL as string | undefined) || DEFAULT_LOADER_URL;

  useEffect(() => {
    if (!key) {
      captureEvent("feedback_widget_unavailable", {
        reason: "missing_key",
      });
      return;
    }

    const selector = `script[data-product="${key}"][data-widget="feedback-button"]`;
    if (document.querySelector(selector)) {
      captureEvent("feedback_widget_loader_skipped", {
        reason: "already_injected",
      });
      return;
    }

    const loaderOrigin = getLoaderOrigin(url);

    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.setAttribute("data-product", key);
    script.setAttribute("data-widget", "feedback-button");
    script.addEventListener("load", () => {
      captureEvent("feedback_widget_loader_ready", {
        loader_origin: loaderOrigin,
      });
    });
    script.addEventListener("error", () => {
      captureEvent("feedback_widget_loader_failed", {
        loader_origin: loaderOrigin,
      });
    });
    document.body.appendChild(script);
    captureEvent("feedback_widget_loader_injected", {
      loader_origin: loaderOrigin,
    });

    return () => {
      script.remove();
      captureEvent("feedback_widget_loader_removed", {
        loader_origin: loaderOrigin,
      });
    };
  }, [key, url]);

  return null;
}
