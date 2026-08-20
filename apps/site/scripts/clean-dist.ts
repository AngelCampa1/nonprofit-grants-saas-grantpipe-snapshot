import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_URL = import.meta.url;

type CleanSiteDistOptions = {
  siteDir?: string;
  maxAttempts?: number;
  rm?: typeof rmSync;
  mkdir?: typeof mkdirSync;
  readFile?: (path: string, encoding: BufferEncoding) => string;
  sleep?: (milliseconds: number) => void;
};

type PackageJson = {
  name?: string;
};

const retryableCleanErrorCodes = new Set(["ENOTEMPTY", "EBUSY", "EPERM"]);

export function isRetryableCleanError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    retryableCleanErrorCodes.has(String(error.code))
  );
}

function sleepSync(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function assertSitePackage(
  siteDir: string,
  readFile: (path: string, encoding: BufferEncoding) => string,
): void {
  const packageJsonPath = path.join(siteDir, "package.json");
  const packageJson = JSON.parse(String(readFile(packageJsonPath, "utf8"))) as PackageJson;

  if (packageJson.name !== "@grantpipe/site") {
    throw new Error("Refusing to clean dist outside @grantpipe/site");
  }
}

export function cleanSiteDist(options: CleanSiteDistOptions = {}): void {
  const siteDir = path.resolve(options.siteDir ?? process.cwd());
  const maxAttempts = options.maxAttempts ?? 8;
  const rm = options.rm ?? rmSync;
  const mkdir = options.mkdir ?? mkdirSync;
  const readFile = options.readFile ?? readFileSync;
  const sleep = options.sleep ?? sleepSync;
  const distDir = path.join(siteDir, "dist");
  const clientDir = path.join(distDir, "client");

  assertSitePackage(siteDir, readFile);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      rm(distDir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 250,
      });
      mkdir(clientDir, { recursive: true });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableCleanError(error) || attempt === maxAttempts) {
        throw error;
      }
      sleep(attempt * 250);
    }
  }

  /* v8 ignore next -- maxAttempts is normalized by callers to a positive default. */
  throw lastError;
}

export function isEntrypoint(importMetaUrl: string, argvEntry?: string): boolean {
  return Boolean(argvEntry && importMetaUrl === pathToFileURL(argvEntry).href);
}

/* v8 ignore next 3 -- exercised only by direct CLI execution. */
if (isEntrypoint(SCRIPT_URL, process.argv[1])) {
  cleanSiteDist();
}
