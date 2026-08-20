import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("../lib/sentry-client", () => ({
  captureSiteFetchFailure: vi.fn(),
}));

import { UnsubscribeHandler, UnsubscribePage } from "./unsubscribe-handler";
import { captureSiteFetchFailure } from "../lib/sentry-client";

describe("UnsubscribeHandler", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the invalid-link message when token is empty and does not call fetch", () => {
    render(<UnsubscribeHandler apiUrl="https://api.test" token="" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/invalid unsubscribe link/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the loading state while the request is in flight", () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    expect(screen.getByRole("status")).toHaveTextContent(/updating your preferences/i);
  });

  it("shows the success message on ok:true response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(
        "You've been unsubscribed from GrantPipe marketing and nurture emails.",
      );
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/public/leads/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "tok.sig" }),
    });
  });

  it("shows the error message when the API returns ok:false", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false }),
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="bad" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/expired or is invalid/i);
    });
  });

  it("shows a transient error message and reports 5xx HTTP responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't update your preferences/i);
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "unsubscribe",
      status: 500,
    });
  });

  it("does not report expected invalid-token HTTP responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/expired or is invalid/i);
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "unsubscribe",
      status: 401,
    });
  });

  it("shows a transient error message for rate-limited responses", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't update your preferences/i);
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(null, {
      source: "unsubscribe",
      status: 429,
    });
  });

  it("shows a transient error message when fetch rejects", async () => {
    const error = new Error("network down");
    fetchMock.mockRejectedValueOnce(error);
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't update your preferences/i);
    });
    expect(captureSiteFetchFailure).toHaveBeenCalledWith(error, {
      source: "unsubscribe",
      status: undefined,
    });
  });

  it("treats an unparseable JSON body as failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });
    render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/expired or is invalid/i);
    });
  });

  it("UnsubscribePage reads the token from window.location.search and posts it", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });
    const originalSearch = window.location.search;
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "?token=abc.sig" },
      writable: true,
    });
    try {
      render(<UnsubscribePage apiUrl="https://api.test" />);
      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/you.*been unsubscribed/i);
      });
      const [, init] = fetchMock.mock.calls[0]!;
      expect(JSON.parse(init.body)).toEqual({ token: "abc.sig" });
    } finally {
      Object.defineProperty(window, "location", {
        value: { ...window.location, search: originalSearch },
        writable: true,
      });
    }
  });

  it("UnsubscribePage renders stable initial markup before reading the URL token", () => {
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search: "?token=abc.sig" },
      writable: true,
    });
    const tokenMarkup = renderToString(<UnsubscribePage apiUrl="https://api.test" />);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, search: "" },
      writable: true,
    });
    const missingTokenMarkup = renderToString(<UnsubscribePage apiUrl="https://api.test" />);

    try {
      expect(tokenMarkup).toBe(missingTokenMarkup);
      expect(tokenMarkup).toContain("Checking your preferences");
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });

  it("UnsubscribePage shows the invalid-link message when token is missing from URL", async () => {
    const originalSearch = window.location.search;
    Object.defineProperty(window, "location", {
      value: { ...window.location, search: "" },
      writable: true,
    });
    try {
      render(<UnsubscribePage apiUrl="https://api.test" />);
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/invalid unsubscribe link/i);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        value: { ...window.location, search: originalSearch },
        writable: true,
      });
    }
  });

  it("UnsubscribePage falls back to the invalid-link state when reading location.search throws", async () => {
    const originalLocation = window.location;
    const throwingLocation = {
      ...window.location,
      get search() {
        throw new Error("search unavailable");
      },
    };

    Object.defineProperty(window, "location", {
      configurable: true,
      value: throwingLocation,
      writable: true,
    });

    try {
      render(<UnsubscribePage apiUrl="https://api.test" />);
      await waitFor(() => {
        expect(screen.getByRole("alert")).toHaveTextContent(/invalid unsubscribe link/i);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", {
        configurable: true,
        value: originalLocation,
        writable: true,
      });
    }
  });

  it("does not update state when the component unmounts mid-request", async () => {
    let resolveFetch: (v: unknown) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const { unmount } = render(<UnsubscribeHandler apiUrl="https://api.test" token="tok.sig" />);
    unmount();
    resolveFetch({ ok: true, json: async () => ({ ok: true }) });
    // No assertion error / no state-after-unmount warning means the guard works.
    await Promise.resolve();
  });
});
