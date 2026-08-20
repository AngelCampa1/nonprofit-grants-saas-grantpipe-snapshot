import { describe, expect, it } from "vitest";
import {
  getServerConfig,
  isOwnedServerCommand,
  normalizeCommandLine,
  type ServerRole,
} from "./dev-server-guards";

// Fixture paths only. These functions are pure string matchers and never touch
// the filesystem, so the values just need to look like absolute Windows paths.
const repoRoot = "C:/repos/grantpipe";

function makeCommandLine(role: ServerRole): string {
  if (role === "web") {
    return `node ${repoRoot}/node_modules/vite/bin/vite.js --host localhost --port 5173 --strictPort ${repoRoot}/apps/web`;
  }

  return `node ${repoRoot}/node_modules/wrangler/bin/wrangler.js dev --ip localhost --port 8789 ${repoRoot}/apps/api`;
}

describe("dev-server guards", () => {
  it("returns the expected web and api server configs", () => {
    expect(getServerConfig("web")).toMatchObject({ port: 5173, cwd: "apps/web" });
    expect(getServerConfig("api")).toMatchObject({ port: 8787, cwd: "apps/api" });
    expect(getServerConfig("api").args).toEqual([
      "--dir",
      "apps/api",
      "exec",
      "wrangler",
      "dev",
      "--ip",
      "localhost",
      "--port",
      "8787",
    ]);
  });

  it("normalizes Windows-style command lines for matching", () => {
    expect(normalizeCommandLine("C:\\repos\\GrantPipe\\apps\\web")).toBe(
      "c:/repos/grantpipe/apps/web",
    );
  });

  it("matches only repo-owned web and api commands", () => {
    expect(isOwnedServerCommand(makeCommandLine("web"), repoRoot, "web")).toBe(true);
    expect(isOwnedServerCommand(makeCommandLine("api"), repoRoot, "api")).toBe(true);

    expect(
      isOwnedServerCommand(
        "node C:/repos/other-app/node_modules/vite/bin/vite.js",
        repoRoot,
        "web",
      ),
    ).toBe(false);
    expect(isOwnedServerCommand(makeCommandLine("web"), repoRoot, "api")).toBe(false);
  });
});
