import { afterEach, describe, expect, it, vi } from "vitest";

import { buildBingUetScript } from "./bing-uet";

type FakeScriptElement = {
  async?: number;
  onload?: ((this: FakeScriptElement) => void) | null;
  onreadystatechange?: ((this: FakeScriptElement) => void) | null;
  readyState?: string;
  src?: string;
};

type FakeUetInstance = {
  push: ReturnType<typeof vi.fn>;
};

type FakeWindow = {
  setTimeout: typeof setTimeout;
  UET?: new (options: {
    enableAutoSpaTracking?: boolean;
    q?: unknown[];
    ti: string;
    ts?: number;
  }) => FakeUetInstance;
  uetq?: FakeUetInstance | unknown[];
};

function runGeneratedScript() {
  const scriptElement: FakeScriptElement = {};
  const anchorElement = {
    parentNode: {
      insertBefore: vi.fn(),
    },
  };
  const fakeDocument = {
    createElement: vi.fn(() => scriptElement),
    getElementsByTagName: vi.fn(() => [anchorElement]),
  };
  const fakeWindow: FakeWindow = {
    setTimeout,
  };

  vi.stubGlobal("document", fakeDocument);
  vi.stubGlobal("window", fakeWindow);

  const runScript = new Function(buildBingUetScript());
  runScript();

  return { fakeWindow, scriptElement };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("buildBingUetScript", () => {
  it("uses the bundled default tag id when none is provided", () => {
    const script = buildBingUetScript();
    expect(script).toContain('ti: "343248795"');
    expect(script).toContain("enableAutoSpaTracking: true");
    expect(script).toContain("https://bat.bing.net/bat.js");
  });

  it("uses the provided tag id when supplied", () => {
    const script = buildBingUetScript("777777777");
    expect(script).toContain('ti: "777777777"');
    expect(script).not.toContain('ti: "343248795"');
  });

  it("falls back to the default when the provided value is whitespace only", () => {
    const script = buildBingUetScript("   ");
    expect(script).toContain('ti: "343248795"');
  });

  it("falls back to the default when the provided value is undefined", () => {
    const script = buildBingUetScript(undefined);
    expect(script).toContain('ti: "343248795"');
  });

  it("safely escapes the tag id through JSON serialization", () => {
    const script = buildBingUetScript('"); window.evil=1; ("');
    expect(script).toContain('"\\"); window.evil=1; (\\""');
    expect(script).not.toContain('window.evil=1; ("');
  });

  it("triggers a UET pageLoad once UET is constructed", () => {
    const script = buildBingUetScript();
    expect(script).toContain('w[u].push("pageLoad")');
  });

  it("does not throw when window.UET is missing on script load", () => {
    const { scriptElement } = runGeneratedScript();

    expect(() => scriptElement.onload?.call(scriptElement)).not.toThrow();
  });

  it("retries and constructs UET once window.UET becomes available", () => {
    vi.useFakeTimers();
    const { fakeWindow, scriptElement } = runGeneratedScript();
    const pushedEvents: unknown[][] = [];
    const UetCtor = vi.fn(function Uet(
      this: FakeUetInstance,
      _options: {
        enableAutoSpaTracking?: boolean;
        q?: unknown[];
        ti: string;
        ts?: number;
      },
    ) {
      this.push = vi.fn((...event: unknown[]) => {
        pushedEvents.push(event);
      });
    });

    scriptElement.onload?.call(scriptElement);
    expect(UetCtor).not.toHaveBeenCalled();

    fakeWindow.UET = UetCtor;
    vi.advanceTimersByTime(100);

    expect(UetCtor).toHaveBeenCalledTimes(1);
    expect(UetCtor).toHaveBeenCalledWith(
      expect.objectContaining({
        enableAutoSpaTracking: true,
        q: expect.any(Array),
        ti: "343248795",
      }),
    );
    expect(pushedEvents).toEqual([["pageLoad"]]);
  });

  it("constructs UET once when load handlers both fire before UET is ready", () => {
    vi.useFakeTimers();
    const { fakeWindow, scriptElement } = runGeneratedScript();
    const UetCtor = vi.fn(function Uet(this: FakeUetInstance) {
      this.push = vi.fn();
    });

    scriptElement.onload?.call(scriptElement);
    scriptElement.onreadystatechange?.call(scriptElement);

    fakeWindow.UET = UetCtor;
    vi.advanceTimersByTime(100);

    expect(UetCtor).toHaveBeenCalledTimes(1);
  });

  it("swallows UET constructor errors", () => {
    const { fakeWindow, scriptElement } = runGeneratedScript();
    fakeWindow.UET = vi.fn(function Uet() {
      throw new Error("blocked");
    });

    expect(() => scriptElement.onload?.call(scriptElement)).not.toThrow();
  });
});
