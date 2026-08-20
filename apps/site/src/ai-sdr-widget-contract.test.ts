// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function readBaseLayout(): string {
  // The shared base layout lives in packages/ui, two levels up from apps/site
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const layoutPath = resolve(thisDir, "../../../packages/ui/src/site/layouts/base-layout.astro");
  return readFileSync(layoutPath, "utf8");
}

function readWidgetInlineScript(): string {
  const source = readBaseLayout();
  const match = source.match(/<script is:inline>\s*([\s\S]*?widgetScriptSrc[\s\S]*?)\s*<\/script>/);

  if (!match?.[1]) {
    throw new Error("AI SDR widget inline script was not found.");
  }

  return match[1];
}

function installWidgetShell(): void {
  document.documentElement.innerHTML =
    '<head></head><body><div id="ventora-ai-sdr-root" data-product-id="grantpipe"></div></body>';
  new Function(readWidgetInlineScript())();
}

function captureSdkScriptAppends(): HTMLScriptElement[] {
  const sdkScripts: HTMLScriptElement[] = [];
  const appendChild = document.head.appendChild.bind(document.head);

  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    if (node instanceof HTMLScriptElement && node.src.includes("ai-sdr.global.js")) {
      sdkScripts.push(node);
      return node;
    }

    return appendChild(node);
  });

  return sdkScripts;
}

interface MockWidget {
  open: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isOpen: ReturnType<typeof vi.fn>;
}

function installMockSdk(
  options: {
    openRejects?: boolean;
    deferOpen?: boolean;
    deferClose?: boolean;
    closeMode?: "hidden" | "exiting";
  } = {},
): {
  widget: MockWidget;
  createAiSdrWidget: ReturnType<typeof vi.fn>;
  getPanel: () => HTMLElement | null;
  resolveOpen: () => void;
  resolveClose: () => void;
} {
  let openState = false;
  let panel: HTMLElement | null = null;
  let pendingResolve: (() => void) | null = null;
  // Mirror the worker bundle: createAiSdrWidget mounts a [data-ai-sdr-panel] into
  // the host target, and open/close flip its hidden + data-state attributes. This
  // lets the embed's MutationObserver (which syncs aria-expanded on worker-driven
  // close) be exercised.
  const widget: MockWidget = {
    open: vi.fn().mockImplementation(() => {
      if (options.openRejects) {
        return Promise.reject(new Error("session create failed"));
      }
      // The worker renders/shows its panel synchronously; the promise resolves only
      // after session creation. deferOpen models that gap so a test can assert the
      // launcher reflects open intent before open() settles.
      openState = true;
      if (panel) {
        panel.hidden = false;
        panel.dataset.state = "open";
      }
      if (options.deferOpen) {
        return new Promise<void>((res) => {
          pendingResolve = res;
        });
      }
      return Promise.resolve(undefined);
    }),
    close: vi.fn().mockImplementation(() => {
      if (options.deferClose) {
        // Model the real worker: the panel hides / animates out at once, but the
        // handle keeps reporting open (isOpen() === true) until its exit settles.
        // "hidden" models the settled hidden panel; "exiting" models the mid-animation
        // state where the panel is still in the DOM but data-state === "exiting".
        if (panel) {
          if (options.closeMode === "exiting") {
            panel.dataset.state = "exiting";
          } else {
            panel.hidden = true;
            delete panel.dataset.state;
          }
        }
        return;
      }
      openState = false;
      if (panel) {
        panel.hidden = true;
        delete panel.dataset.state;
      }
    }),
    isOpen: vi.fn().mockImplementation(() => openState),
  };
  const createAiSdrWidget = vi.fn((opts: { target?: HTMLElement }) => {
    panel = document.createElement("div");
    panel.setAttribute("data-ai-sdr-panel", "");
    panel.hidden = true;
    opts?.target?.append(panel);
    return widget;
  });
  (window as typeof window & { VentoraAiSdr: unknown }).VentoraAiSdr = { createAiSdrWidget };
  return {
    widget,
    createAiSdrWidget,
    getPanel: () => panel,
    resolveOpen: () => {
      pendingResolve?.();
      pendingResolve = null;
    },
    resolveClose: () => {
      openState = false;
      if (panel) {
        panel.hidden = true;
        delete panel.dataset.state;
      }
    },
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AI SDR widget contract — base-layout.astro", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.documentElement.innerHTML = "<head></head><body></body>";
    delete (window as typeof window & { VentoraAiSdr?: unknown }).VentoraAiSdr;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("widget baseUrl points to same-origin BFF /api/ai-sdr", () => {
    const source = readBaseLayout();
    expect(source).toContain('baseUrl: "/api/ai-sdr"');
  });

  it("widget baseUrl does NOT point directly at the upstream worker", () => {
    const source = readBaseLayout();
    expect(source).not.toContain(
      'baseUrl: "https://ventora-ai-sdr-worker.example-account.workers.dev"',
    );
  });

  it("keeps the worker-hosted JS bundle URL available for click-time loading", () => {
    const source = readBaseLayout();
    expect(source).toContain(
      "https://ventora-ai-sdr-worker.example-account.workers.dev/client/ai-sdr.global.js",
    );
    expect(source).toContain('document.createElement("script")');
    expect(source).toContain("script.defer = true");
    expect(source).toContain("waitForWidgetScript");
  });

  it("does not eagerly request the worker-hosted JS bundle before the widget opens", () => {
    const source = readBaseLayout();
    expect(source).not.toContain(
      '<script is:inline src="https://ventora-ai-sdr-worker.example-account.workers.dev/client/ai-sdr.global.js"',
    );
  });

  it("renders a single panel: no site-owned wrapper panel/target that could sit behind the widget", () => {
    const source = readBaseLayout();
    // The old embed built its own panel + mount target that stranded an empty
    // white panel behind the worker's self-contained fixed panel. The worker now
    // owns the only panel.
    expect(source).not.toContain('id="ventora-ai-sdr-panel"');
    expect(source).not.toContain('id="ventora-ai-sdr-target"');
    expect(source).not.toContain('id="ventora-ai-sdr-head"');
  });

  it("suppresses the worker's own launcher and the founder-handoff pill via injected CSS", () => {
    const source = readBaseLayout();
    expect(source).toContain("[data-ai-sdr-launcher]");
    expect(source).toContain("[data-ai-sdr-handoff-button]");
    // Both suppressions must actually hide the elements.
    expect(source).toMatch(/\[data-ai-sdr-launcher\]\{display:none/);
    expect(source).toMatch(/\[data-ai-sdr-handoff-button\]\{display:none/);
  });

  it("drops the 'Talk to founder' suggestion chip via the copy override", () => {
    const source = readBaseLayout();
    expect(source).toContain(
      'emptySuggestions: ["Track a restricted fund", "Prep for a report deadline"]',
    );
    // The widget block must not reintroduce the founder chip.
    const inlineScript = readWidgetInlineScript();
    expect(inlineScript).not.toContain("Talk to founder");
  });

  it("keeps the Ask GrantPipe toggle visible when the SDK fails to load", () => {
    const source = readBaseLayout();
    expect(source).not.toContain('toggle.style.display = "none"');
  });

  it("loads the external SDK only after Ask GrantPipe is clicked, then opens the widget", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();

    const toggle = document.getElementById("ventora-ai-sdr-toggle");
    expect(toggle?.textContent).toBe("Ask GrantPipe");
    expect(sdkScripts).toHaveLength(0);

    toggle?.click();

    expect(sdkScripts).toHaveLength(1);
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");

    const { widget, createAiSdrWidget } = installMockSdk();

    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();

    expect(createAiSdrWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        target: document.getElementById("ventora-ai-sdr-root"),
        api: { baseUrl: "/api/ai-sdr" },
        session: expect.objectContaining({ productId: "grantpipe" }),
        copy: expect.objectContaining({
          emptySuggestions: ["Track a restricted fund", "Prep for a report deadline"],
        }),
      }),
    );
    // The copy override must not carry "Talk to founder".
    const call = createAiSdrWidget.mock.calls[0]?.[0] as {
      copy?: { emptySuggestions?: string[] };
    };
    expect(call.copy?.emptySuggestions).not.toContain("Talk to founder");
    expect(widget.open).toHaveBeenCalledTimes(1);

    // A second toggle click closes the open widget (driven via the handle).
    toggle?.click();
    await flushPromises();
    expect(widget.close).toHaveBeenCalledTimes(1);
  });

  it("keeps the toggle visible and shows an error when the SDK load fails", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();

    document.getElementById("ventora-ai-sdr-toggle")?.click();

    expect(sdkScripts).toHaveLength(1);
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    sdkScript.onerror?.call(sdkScript, new Event("error"));
    await flushPromises();

    const toggle = document.getElementById("ventora-ai-sdr-toggle");
    expect(toggle?.style.display).not.toBe("none");
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Assistant failed to load");
    // No stranded site-owned panel behind anything.
    expect(document.getElementById("ventora-ai-sdr-panel")).toBeNull();
  });

  it("reflects the widget's open/closed state on the toggle's aria-expanded", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { widget } = installMockSdk();
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();

    // Opened: aria-expanded should now be "true".
    expect(widget.open).toHaveBeenCalledTimes(1);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // Closed via the toggle: back to "false".
    toggle?.click();
    await flushPromises();
    expect(widget.close).toHaveBeenCalledTimes(1);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the launcher expanded as soon as the panel opens, before open() resolves", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle");

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    // open() stays pending: the panel is shown but session creation hasn't settled.
    const { widget, resolveOpen } = installMockSdk({ deferOpen: true });
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();

    // aria-expanded must already be "true" even though open() has not resolved,
    // so screen readers don't see a collapsed launcher over a visible panel.
    expect(widget.open).toHaveBeenCalledTimes(1);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // Once open() settles, it stays "true".
    resolveOpen();
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  });

  it("syncs aria-expanded and restores focus when the widget is closed from within the panel", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { widget } = installMockSdk();
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // Simulate the user closing via the worker's OWN close button / Escape: the
    // widget handle closes and flips the panel attributes, but the site's onToggle
    // never runs. The MutationObserver must still sync aria-expanded and refocus.
    if (document.body) document.body.focus();
    widget.close();
    await flushPromises();

    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("syncs aria-expanded to false when the worker hides the panel while its handle still reports open", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    // deferClose: closing hides the panel but keeps isOpen() true through the
    // worker's exit animation, reproducing the live ~1s aria-expanded lag on close.
    const { widget } = installMockSdk({ deferClose: true });
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // Worker-driven close (its own close button / Escape): the panel hides at once
    // but the handle still reports open. aria-expanded must follow the hidden panel,
    // not the stale isOpen(), or a screen reader hears an open dialog over nothing.
    if (document.body) document.body.focus();
    widget.close();
    await flushPromises();

    expect(widget.isOpen()).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("treats a worker 'exiting' panel state as closed for aria-expanded", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { widget } = installMockSdk({ deferClose: true, closeMode: "exiting" });
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    // Mid-animation: the panel is still in the DOM (not yet hidden) but marked
    // data-state="exiting"; the launcher must already advertise collapsed.
    widget.close();
    await flushPromises();

    expect(widget.isOpen()).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on Escape, collapsing aria-expanded immediately and restoring focus", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { widget } = installMockSdk({ deferClose: true });
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    if (document.body) document.body.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();

    expect(widget.close).toHaveBeenCalledTimes(1);
    // Optimistic close: aria flips false at once even though the deferred-close
    // handle still reports open.
    expect(widget.isOpen()).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("syncs aria-expanded on a worker-driven close that happens before open() resolves", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    // open() stays pending (session creation not settled). The worker renders and
    // shows its panel synchronously, so the launcher is already "true", but the
    // user can close (Escape / the worker's in-panel close button) during this gap.
    const { widget, getPanel } = installMockSdk({ deferOpen: true });
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(widget.open).toHaveBeenCalledTimes(1);

    // Worker hides its panel while open() is still pending. aria-expanded must sync
    // NOW — the panel observer has to be watching from open time, not only after
    // open() resolves (otherwise the launcher advertises an open dialog over an
    // invisible panel until session creation finally settles, ~1s+ later).
    const panel = getPanel();
    if (!panel) throw new Error("Expected the worker panel to exist.");
    if (document.body) document.body.focus();
    panel.hidden = true;
    delete panel.dataset.state;
    await flushPromises();

    expect(widget.isOpen()).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("does not double-boot when the toggle is clicked repeatedly before the SDK loads", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle");

    // Three rapid clicks while the bundle is still loading.
    toggle?.click();
    toggle?.click();
    toggle?.click();

    // Only one SDK script tag should have been appended (booting guard).
    expect(sdkScripts).toHaveLength(1);
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { createAiSdrWidget, widget } = installMockSdk();
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();

    // Exactly one widget created and opened despite the repeated clicks.
    expect(createAiSdrWidget).toHaveBeenCalledTimes(1);
    expect(widget.open).toHaveBeenCalledTimes(1);
  });

  it("shows an error, refocuses the toggle, and keeps aria-expanded false when open() rejects", async () => {
    installWidgetShell();
    const sdkScripts = captureSdkScriptAppends();
    const toggle = document.getElementById("ventora-ai-sdr-toggle") as HTMLButtonElement | null;

    toggle?.click();
    const sdkScript = sdkScripts[0];
    if (!sdkScript) throw new Error("Expected the AI SDR SDK script to be appended.");
    const { widget } = installMockSdk({ openRejects: true });
    if (document.body) document.body.focus();
    sdkScript.onload?.call(sdkScript, new Event("load"));
    await flushPromises();

    expect(widget.open).toHaveBeenCalledTimes(1);
    const alert = document.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Assistant failed to load");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});
