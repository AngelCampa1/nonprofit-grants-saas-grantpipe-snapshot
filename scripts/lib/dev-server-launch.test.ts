import { describe, expect, it } from "vitest";
import { closeSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDetachedLogStdio, buildDevServerLaunch } from "./dev-server-launch";

describe("buildDevServerLaunch", () => {
  it("uses cmd.exe on Windows so pnpm scripts can be detached safely", () => {
    const launch = buildDevServerLaunch("win32", ["--dir", "apps/api", "exec", "wrangler", "dev"]);

    expect(launch.command).toBe("cmd.exe");
    expect(launch.args).toEqual([
      "/d",
      "/s",
      "/c",
      "pnpm",
      "--dir",
      "apps/api",
      "exec",
      "wrangler",
      "dev",
    ]);
  });

  it("uses the native pnpm executable on non-Windows platforms", () => {
    const launch = buildDevServerLaunch("linux", ["--dir", "apps/web", "exec", "vite"]);

    expect(launch.command).toBe("pnpm");
    expect(launch.args).toEqual(["--dir", "apps/web", "exec", "vite"]);
  });

  it("opens file-backed stdio descriptors for detached server logs", () => {
    const logPath = join(tmpdir(), `grantpipe-dev-server-${Date.now()}.log`);
    const stdio = buildDetachedLogStdio(logPath);
    const stdoutFd = stdio[1];
    const stderrFd = stdio[2];

    expect(stdio[0]).toBe("ignore");
    expect(typeof stdoutFd).toBe("number");
    expect(stdoutFd).toBe(stderrFd);

    closeSync(stdoutFd as number);

    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, "utf8")).toBe("");
  });
});
