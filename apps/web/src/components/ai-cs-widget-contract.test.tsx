import { render, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A11y / behavior contract for the in-app AI-CS support widget.
 *
 * The launcher/panel/focus code lives in the vendored `@ventora/ai-cs` package,
 * not in GrantPipe source, so this renders the REAL widget (un-mocked) and locks
 * in the behaviors GrantPipe depends on. It is the in-app counterpart to the
 * marketing-site AI-SDR contract test, and it guards against a vendor bump
 * silently regressing:
 *   - a single launcher and a single panel (no stray/duplicate panel),
 *   - `aria-expanded` reflecting open state synchronously (no lag behind an
 *     async session-create),
 *   - focus returning to the launcher on every close path (Escape, close button).
 *
 * Only the app's own side-effect modules are mocked (router, Sentry, analytics)
 * plus `fetch` (so the deferred session-create never hits the network); the
 * widget's own launcher/panel/focus logic runs for real.
 */

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mockNavigate }));
vi.mock("../lib/sentry", () => ({ captureAppException: vi.fn() }));
vi.mock("../lib/analytics", () => ({ captureEvent: vi.fn() }));

import { AiCsSupportWidget } from "./ai-cs-support-widget";

function renderWidget() {
  return render(<AiCsSupportWidget userId="user-1" orgId="org-1" currentPath="/dashboard" />);
}

function launcher(): HTMLButtonElement {
  const el = document.querySelector("[data-aics-launcher]");
  if (!el) throw new Error("AI-CS launcher not found");
  return el as HTMLButtonElement;
}

function panels(): Element[] {
  return Array.from(document.querySelectorAll("[data-aics-panel]"));
}

beforeEach(() => {
  // jsdom lacks matchMedia; the widget reads it for mobile-viewport behavior.
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  // Session creation is deferred until the panel opens; keep it pending so it
  // never resolves/rejects during the test and can't drive extra state changes.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AI-CS widget a11y contract (real @ventora/ai-cs)", () => {
  it("renders exactly one launcher, collapsed, with no panel until opened", () => {
    renderWidget();
    expect(document.querySelectorAll("[data-aics-launcher]")).toHaveLength(1);
    expect(launcher().getAttribute("aria-expanded")).toBe("false");
    expect(panels()).toHaveLength(0);
  });

  it("marks the launcher expanded and shows a single dialog panel the moment it opens (no lag)", () => {
    renderWidget();
    const btn = launcher();
    btn.focus();
    fireEvent.click(btn);

    // aria-expanded flips true synchronously with the click — it is bound to the
    // open state, not gated on the async session-create request.
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    // Exactly one panel, and it is a dialog.
    const open = panels();
    expect(open).toHaveLength(1);
    expect(open[0]!.getAttribute("role")).toBe("dialog");
  });

  it("closes on Escape, collapses aria-expanded, and returns focus to the launcher", () => {
    renderWidget();
    const btn = launcher();
    btn.focus();
    fireEvent.click(btn);
    expect(panels()).toHaveLength(1);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(panels()).toHaveLength(0);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("closes via the panel close button, collapses aria-expanded, and restores launcher focus", () => {
    renderWidget();
    const btn = launcher();
    btn.focus();
    fireEvent.click(btn);

    const closeBtn = document.querySelector("[data-aics-close]");
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn as Element);

    expect(panels()).toHaveLength(0);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("still renders exactly one launcher and one panel after an unmount/remount", () => {
    // The vendor guards against a second instance with a module-global registry.
    // Unmounting must de-register so a remount (route change, StrictMode) shows a
    // single launcher again — never zero (over-suppressed) or a stale duplicate
    // panel behind the live one. Exercise that registry directly in one test.
    const first = renderWidget();
    expect(document.querySelectorAll("[data-aics-launcher]")).toHaveLength(1);
    first.unmount();
    expect(document.querySelectorAll("[data-aics-launcher]")).toHaveLength(0);

    renderWidget();
    expect(document.querySelectorAll("[data-aics-launcher]")).toHaveLength(1);
    fireEvent.click(launcher());
    expect(panels()).toHaveLength(1);
  });
});
