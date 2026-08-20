import { afterEach, describe, expect, it, vi } from "vitest";

describe("run-build-lead-magnet-pdfs", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("skips without importing the PDF builder in Cloudflare Pages", async () => {
    vi.stubEnv("CF_PAGES", "1");
    const exitSignal = new Error("exit-0");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw code === 0 ? exitSignal : new Error(`unexpected exit ${code}`);
    }) as typeof process.exit);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    let builderImported = false;

    vi.doMock("./build-lead-magnet-pdfs.js", () => {
      builderImported = true;
      return {
        run: vi.fn(),
      };
    });

    await expect(import("./run-build-lead-magnet-pdfs.ts")).rejects.toBe(exitSignal);

    expect(builderImported).toBe(false);
    expect(logSpy).toHaveBeenCalledWith(
      "CF_PAGES detected - skipping PDF generation (R2 delivery handles this).",
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("does not skip the PDF builder in Cloudflare Pages when strict mode is enabled", async () => {
    vi.stubEnv("CF_PAGES", "1");
    vi.stubEnv("REQUIRE_LEAD_MAGNET_PDF_BUILD", "1");
    const exitSignal = new Error("exit-1");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null | undefined,
    ) => {
      throw code === 1 ? exitSignal : new Error(`unexpected exit ${code}`);
    }) as typeof process.exit);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runSpy = vi.fn().mockRejectedValue(new Error("strict builder failure"));

    vi.doMock("./build-lead-magnet-pdfs.js", () => ({
      run: runSpy,
    }));

    await expect(import("./run-build-lead-magnet-pdfs.ts")).rejects.toBe(exitSignal);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalledWith(
      "CF_PAGES detected - skipping PDF generation (R2 delivery handles this).",
    );
    expect(errorSpy).toHaveBeenCalledWith("PDF build failed:", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("imports the PDF builder and runs it outside Cloudflare Pages", async () => {
    vi.stubEnv("CF_PAGES", "0");
    const runSpy = vi.fn().mockResolvedValue(undefined);

    vi.doMock("./build-lead-magnet-pdfs.js", () => ({
      run: runSpy,
    }));

    await import("./run-build-lead-magnet-pdfs.ts");

    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it("skips with a warning when Chrome is unavailable and strict mode is off", async () => {
    vi.stubEnv("CF_PAGES", "0");
    const exitSignal = new Error("exit-0");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw code === 0 ? exitSignal : new Error(`unexpected exit ${code}`);
    }) as typeof process.exit);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.doMock("./build-lead-magnet-pdfs.js", () => ({
      run: vi
        .fn()
        .mockRejectedValue(
          new Error("Could not find Chrome (ver. 131.0.6778.204). Install it first."),
        ),
    }));

    await expect(import("./run-build-lead-magnet-pdfs.ts")).rejects.toBe(exitSignal);

    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping lead magnet PDF generation because a Chrome/Chromium binary is unavailable.",
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("fails hard on missing Chrome when strict mode is enabled", async () => {
    vi.stubEnv("CF_PAGES", "0");
    vi.stubEnv("REQUIRE_LEAD_MAGNET_PDF_BUILD", "1");
    const exitSignal = new Error("exit-1");
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw code === 1 ? exitSignal : new Error(`unexpected exit ${code}`);
    }) as typeof process.exit);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    vi.doMock("./build-lead-magnet-pdfs.js", () => ({
      run: vi
        .fn()
        .mockRejectedValue(
          new Error("Could not find Chrome (ver. 131.0.6778.204). Install it first."),
        ),
    }));

    await expect(import("./run-build-lead-magnet-pdfs.ts")).rejects.toBe(exitSignal);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith("PDF build failed:", expect.any(Error));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
