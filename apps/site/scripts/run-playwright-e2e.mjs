/* global console, fetch, process, setTimeout, URL */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 4321;
const BASE_URL = `http://${HOST}:${PORT}`;

const env = {
  ...process.env,
  SKIP_TURNSTILE_GUARD: process.env.SKIP_TURNSTILE_GUARD ?? "1",
};

const siteRoot = fileURLToPath(new URL("..", import.meta.url));

function resolvePnpmCommand() {
  if (process.platform !== "win32") {
    return { command: "pnpm", args: [] };
  }

  const pnpmExecPath = process.env.npm_execpath?.endsWith("pnpm.cjs")
    ? process.env.npm_execpath
    : undefined;
  const appDataPnpmPath = process.env.APPDATA
    ? join(process.env.APPDATA, "npm", "node_modules", "pnpm", "bin", "pnpm.cjs")
    : undefined;
  const pnpmCli = [pnpmExecPath, appDataPnpmPath].find(
    (candidate) => candidate && existsSync(candidate),
  );

  if (!pnpmCli) {
    throw new Error("Unable to locate pnpm.cjs for the Playwright E2E runner.");
  }

  return { command: process.execPath, args: [pnpmCli] };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: siteRoot,
    env,
    shell: false,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function assertPreviewPortAvailable() {
  await new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      reject(
        new Error(
          error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE"
            ? `Port ${PORT} is already in use on ${HOST}; refusing to run E2E tests against a stale server.`
            : `Unable to check preview port ${PORT}: ${
                error instanceof Error ? error.message : String(error)
              }`,
        ),
      );
    });

    server.once("listening", () => {
      server.close(resolve);
    });

    server.listen(PORT, HOST);
  });
}

async function waitForPreview(preview) {
  const deadline = Date.now() + 30_000;
  let lastError;
  let previewExit;

  preview.once("exit", (code, signal) => {
    previewExit = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
  });

  preview.once("error", (error) => {
    previewExit = error instanceof Error ? error.message : String(error);
  });

  while (Date.now() < deadline) {
    const previousExit = preview.signalCode
      ? `signal ${preview.signalCode}`
      : preview.exitCode !== null
        ? `exit code ${preview.exitCode}`
        : undefined;

    if (previewExit || previousExit) {
      throw new Error(
        `Preview server stopped before it was ready (${previewExit ?? previousExit}).`,
      );
    }

    try {
      const response = await fetch(BASE_URL);
      if (response.ok) return;
      lastError = new Error(`Preview returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw lastError ?? new Error("Preview server did not start.");
}

function stopPreview(preview) {
  if (!preview.killed) {
    preview.kill("SIGTERM");
  }

  if (process.platform === "win32" && preview.pid) {
    spawnSync("taskkill", ["/PID", String(preview.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  }
}

function runAsync(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: siteRoot,
      env,
      shell: false,
      stdio: "inherit",
      ...options,
    });

    child.once("exit", (status, signal) => {
      if (status !== null) {
        resolve(status);
        return;
      }

      resolve(signal === "SIGINT" ? 130 : 1);
    });

    child.once("error", (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      resolve(1);
    });
  });
}

const pnpm = resolvePnpmCommand();

run(pnpm.command, [...pnpm.args, "run", "build"]);

await assertPreviewPortAvailable();

const preview = spawn(
  process.execPath,
  [
    join(siteRoot, "node_modules", "astro", "bin", "astro.mjs"),
    "preview",
    "--host",
    HOST,
    "--port",
    String(PORT),
  ],
  {
    cwd: siteRoot,
    env,
    shell: false,
    stdio: "inherit",
  },
);

let exitCode;

function cleanupAndExit(signal) {
  stopPreview(preview);
  process.exit(signal === "SIGINT" ? 130 : 143);
}

process.once("SIGINT", () => cleanupAndExit("SIGINT"));
process.once("SIGTERM", () => cleanupAndExit("SIGTERM"));

try {
  await waitForPreview(preview);
  const testEnv = { ...env, PLAYWRIGHT_BASE_URL: BASE_URL };
  exitCode = await runAsync(pnpm.command, [...pnpm.args, "exec", "playwright", "test"], {
    env: testEnv,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  exitCode = 1;
} finally {
  stopPreview(preview);
}

process.exit(exitCode);
