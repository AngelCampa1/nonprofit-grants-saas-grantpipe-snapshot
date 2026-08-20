import { useEffect, useState } from "react";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { captureSiteFetchFailure } from "../lib/sentry-client";

type Status = "loading" | "success" | "error" | "invalid" | "server-error";

export interface UnsubscribeHandlerProps {
  apiUrl: string;
  token: string;
}

/**
 * Calls POST {apiUrl}/api/public/leads/unsubscribe with the provided token and
 * renders a status message. If the token is empty the request is skipped and
 * an "invalid link" message is shown. Token failures keep the invalid-link
 * copy; server and network failures use a transient retry message.
 */
export function UnsubscribeHandler({ apiUrl, token }: UnsubscribeHandlerProps) {
  const [status, setStatus] = useState<Status>(token ? "loading" : "invalid");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${apiUrl}/api/public/leads/unsubscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (!res.ok) {
          captureSiteFetchFailure(null, {
            source: "unsubscribe",
            status: res.status,
          });
          setStatus(res.status === 429 || res.status >= 500 ? "server-error" : "error");
          return;
        }
        const data = (await res.json().catch(() => ({ ok: false }))) as { ok?: boolean };
        setStatus(data.ok ? "success" : "error");
      } catch (error) {
        captureSiteFetchFailure(error, {
          source: "unsubscribe",
          status: undefined,
        });
        if (!cancelled) setStatus("server-error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [apiUrl, token]);

  if (status === "loading") {
    return (
      <p role="status" className="text-neutral-600">
        Updating your preferences…
      </p>
    );
  }

  if (status === "success") {
    return (
      <p role="status" className="text-brand-text">
        You&apos;ve been unsubscribed from GrantPipe marketing and nurture emails.
      </p>
    );
  }

  if (status === "invalid") {
    return (
      <p role="alert" className="text-neutral-700">
        Invalid unsubscribe link. Please use the link from a recent GrantPipe email.
      </p>
    );
  }

  if (status === "server-error") {
    return (
      <p role="alert" className="text-neutral-700">
        We couldn't update your preferences right now. Please try again, or contact
        {marketingKnowledge.contact.publicEmail} if it keeps happening.
      </p>
    );
  }

  return (
    <p role="alert" className="text-neutral-700">
      This unsubscribe link has expired or is invalid. Please use the link from a recent GrantPipe
      email, or contact {marketingKnowledge.contact.publicEmail}.
    </p>
  );
}

export interface UnsubscribePageProps {
  apiUrl: string;
}

/**
 * Page-level island for the static unsubscribe page. Defers reading the
 * `token` query param until after hydration so the server and first client
 * render stay identical. Delegates rendering to {@link UnsubscribeHandler}.
 */
export function UnsubscribePage({ apiUrl }: UnsubscribePageProps) {
  const [token, setToken] = useState<string | undefined>(undefined);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        setToken(new URLSearchParams(window.location.search).get("token") ?? "");
      } catch {
        setToken("");
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (token === undefined) {
    return (
      <p role="status" className="text-neutral-600">
        Checking your preferences...
      </p>
    );
  }

  return <UnsubscribeHandler apiUrl={apiUrl} token={token} />;
}
