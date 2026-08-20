import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { SCRIPT_PATH, cleanSiteDist, isEntrypoint, isRetryableCleanError } from "./clean-dist";

const sitePackageJson = JSON.stringify({ name: "@grantpipe/site" });

describe("cleanSiteDist", () => {
  it("uses the current site package and real filesystem helpers by default", () => {
    const previousCwd = process.cwd();
    const siteDir = mkdtempSync(path.join(tmpdir(), "grantpipe-site-clean-"));

    try {
      writeFileSync(path.join(siteDir, "package.json"), sitePackageJson);
      mkdirSync(path.join(siteDir, "dist", "client", "stale"), { recursive: true });
      writeFileSync(path.join(siteDir, "dist", "client", "stale", "index.html"), "old");

      process.chdir(siteDir);
      cleanSiteDist();

      expect(existsSync(path.join(siteDir, "dist", "client"))).toBe(true);
      expect(existsSync(path.join(siteDir, "dist", "client", "stale"))).toBe(false);
    } finally {
      process.chdir(previousCwd);
      rmSync(siteDir, { recursive: true, force: true });
    }
  });

  it("cleans and recreates the client directory on the first attempt", () => {
    const rm = vi.fn();
    const mkdir = vi.fn();
    const sleep = vi.fn();

    cleanSiteDist({
      siteDir: "C:/repo/apps/site",
      rm,
      mkdir,
      readFile: () => sitePackageJson,
      sleep,
    });

    expect(rm).toHaveBeenCalledWith(
      expect.stringContaining("dist"),
      expect.objectContaining({ recursive: true, force: true }),
    );
    expect(mkdir).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries transient Windows directory cleanup failures before recreating client", () => {
    const rm = vi
      .fn()
      .mockImplementationOnce(() => {
        const error = new Error("directory not empty") as NodeJS.ErrnoException;
        error.code = "ENOTEMPTY";
        throw error;
      })
      .mockImplementationOnce(() => undefined);
    const mkdir = vi.fn();
    const sleep = vi.fn();

    cleanSiteDist({
      siteDir: "C:/repo/apps/site",
      rm,
      mkdir,
      readFile: () => sitePackageJson,
      sleep,
    });

    expect(rm).toHaveBeenCalledTimes(2);
    expect(mkdir).toHaveBeenCalledWith(
      expect.stringContaining("dist"),
      expect.objectContaining({ recursive: true }),
    );
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("uses the default synchronous retry delay when no sleep override is provided", () => {
    const rm = vi
      .fn()
      .mockImplementationOnce(() => {
        const error = new Error("directory not empty") as NodeJS.ErrnoException;
        error.code = "ENOTEMPTY";
        throw error;
      })
      .mockImplementationOnce(() => undefined);

    cleanSiteDist({
      siteDir: "C:/repo/apps/site",
      rm,
      mkdir: vi.fn(),
      readFile: () => sitePackageJson,
    });

    expect(rm).toHaveBeenCalledTimes(2);
  });

  it("uses default package reading and directory creation when only rm is overridden", () => {
    const rm = vi.fn();

    cleanSiteDist({ rm });

    expect(rm).toHaveBeenCalledOnce();
  });

  it("fails fast when invoked outside the site package", () => {
    expect(() =>
      cleanSiteDist({
        siteDir: "C:/repo/apps/web",
        rm: vi.fn(),
        mkdir: vi.fn(),
        readFile: () => JSON.stringify({ name: "@grantpipe/web" }),
        sleep: vi.fn(),
      }),
    ).toThrow("Refusing to clean dist outside @grantpipe/site");
  });

  it("throws immediately for non-retryable cleanup failures", () => {
    const error = new Error("permission denied") as NodeJS.ErrnoException;
    error.code = "EACCES";
    const rm = vi.fn(() => {
      throw error;
    });
    const sleep = vi.fn();

    expect(() =>
      cleanSiteDist({
        siteDir: "C:/repo/apps/site",
        rm,
        mkdir: vi.fn(),
        readFile: () => sitePackageJson,
        sleep,
      }),
    ).toThrow(error);
    expect(rm).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("throws the retryable cleanup error after the final attempt", () => {
    const error = new Error("directory busy") as NodeJS.ErrnoException;
    error.code = "EBUSY";
    const rm = vi.fn(() => {
      throw error;
    });
    const sleep = vi.fn();

    expect(() =>
      cleanSiteDist({
        siteDir: "C:/repo/apps/site",
        maxAttempts: 2,
        rm,
        mkdir: vi.fn(),
        readFile: () => sitePackageJson,
        sleep,
      }),
    ).toThrow(error);
    expect(rm).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledOnce();
  });
});

describe("isRetryableCleanError", () => {
  it("treats common Windows filesystem races as retryable", () => {
    for (const code of ["ENOTEMPTY", "EBUSY", "EPERM"]) {
      expect(isRetryableCleanError({ code })).toBe(true);
    }
  });

  it("does not retry unrelated errors", () => {
    expect(isRetryableCleanError({ code: "ENOENT" })).toBe(false);
    expect(isRetryableCleanError(null)).toBe(false);
    expect(isRetryableCleanError("EBUSY")).toBe(false);
    expect(isRetryableCleanError({ message: "busy" })).toBe(false);
  });
});

describe("isEntrypoint", () => {
  it("detects direct script execution", () => {
    expect(isEntrypoint(pathToFileURL(SCRIPT_PATH).href, SCRIPT_PATH)).toBe(true);
  });

  it("ignores imports and other entrypoints", () => {
    expect(isEntrypoint(import.meta.url)).toBe(false);
    expect(isEntrypoint(import.meta.url, "C:/repo/apps/site/other.ts")).toBe(false);
  });
});
