/**
 * sync-lead-magnets-to-r2.ts
 *
 * One-shot admin script - uploads built lead magnet PDFs from the site build
 * manifest to Cloudflare R2 at key prefix lead-magnets/{slug}.pdf.
 *
 * Prerequisites:
 *   1. Authenticate with Wrangler: `wrangler login`
 *   2. Build the PDFs: `pnpm --filter @grantpipe/site build`
 *
 * Run:
 *   pnpm tsx apps/api/src/scripts/sync-lead-magnets-to-r2.ts
 *
 * Optional environment variable:
 *   CLOUDFLARE_R2_BUCKET - R2 bucket name (default: grantpipe-documents)
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
  type LeadMagnetAssetType,
} from "@grantpipe/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
export const LEAD_MAGNET_OUTPUT_DIR = join(REPO_ROOT, "apps", "site", ".lead-magnet-pdfs");
export const LEAD_MAGNET_MANIFEST_PATH = join(LEAD_MAGNET_OUTPUT_DIR, "manifest.json");
const WRANGLER_COMMAND = "pnpm --filter @grantpipe/site exec wrangler";
const MINIMUM_PDF_BYTES = 10 * 1024;

export interface LeadMagnetManifestEntry {
  slug: string;
  title: string;
  sourcePath: string;
  outputPath: string;
  fileName: string;
  r2Key: string;
  assetType: LeadMagnetAssetType;
  publishedAt?: string;
  promoted: boolean;
}

type ReadManifestOptions = {
  manifestPath?: string;
  readFile?: (path: string, encoding: BufferEncoding) => string;
};

type ValidateManifestOptions = {
  fileExists?: (path: string) => boolean;
  promotedSlugs?: string[];
  requiredSlugs?: string[];
};

type SyncLeadMagnetsOptions = {
  bucket: string;
  entries: LeadMagnetManifestEntry[];
  exec?: (command: string) => void;
  maxUploadAttempts?: number;
  readFile?: (path: string) => Buffer;
  wait?: (ms: number) => void;
  waitBetweenAttemptsMs?: number;
};

type VerifyLeadMagnetCommandOptions = {
  bucket: string;
  r2Key: string;
  outputPath: string;
};

type VerifyLeadMagnetsOptions = {
  bucket: string;
  entries: LeadMagnetManifestEntry[];
  exec?: (command: string) => void;
  readFile?: (path: string) => Buffer;
  outputPathForEntry?: (entry: LeadMagnetManifestEntry) => string;
};

type RunOptions = ReadManifestOptions &
  ValidateManifestOptions & {
    bucketName?: string;
    exec?: (command: string) => void;
    verifyOnly?: boolean;
    readBinaryFile?: (path: string) => Buffer;
    outputPathForEntry?: (entry: LeadMagnetManifestEntry) => string;
  };

type RunCliOptions = {
  argv?: string[];
  execute?: () => void;
  exit?: (code: number) => void;
  logError?: (message: unknown) => void;
};

const DEFAULT_UPLOAD_ATTEMPTS = 4;
const DEFAULT_UPLOAD_RETRY_DELAY_MS = 2_000;

export function readLeadMagnetManifest(
  options: ReadManifestOptions = {},
): LeadMagnetManifestEntry[] {
  const manifestPath = options.manifestPath ?? LEAD_MAGNET_MANIFEST_PATH;
  const readFile = options.readFile ?? readFileSync;

  let rawManifest: string;
  try {
    rawManifest = readFile(manifestPath, "utf-8");
  } catch {
    throw new Error(
      `Could not read lead magnet manifest: ${manifestPath}\nRun the PDF build first: pnpm --filter @grantpipe/site build`,
    );
  }

  const parsed = JSON.parse(rawManifest) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`Lead magnet manifest must be an array: ${manifestPath}`);
  }

  return parsed as LeadMagnetManifestEntry[];
}

export function validateManifestEntries(
  entries: LeadMagnetManifestEntry[],
  options: ValidateManifestOptions = {},
): void {
  const fileExists = options.fileExists ?? existsSync;
  const promotedSlugs = options.promotedSlugs ?? PROMOTED_PDF_LEAD_MAGNET_SLUGS;
  const requiredSlugs = options.requiredSlugs ?? LEAD_MAGNET_SLUGS;

  if (entries.length === 0) {
    throw new Error(
      "Lead magnet manifest is empty. Run the PDF build first: pnpm --filter @grantpipe/site build",
    );
  }

  const entrySlugs = new Set(entries.map((entry) => entry.slug));
  const missingRequiredSlugs = requiredSlugs.filter((slug) => !entrySlugs.has(slug));
  if (missingRequiredSlugs.length > 0) {
    throw new Error(`Missing supported PDF manifests: ${missingRequiredSlugs.join(", ")}`);
  }

  const missingPromotedSlugs = promotedSlugs.filter((slug) => !entrySlugs.has(slug));
  if (missingPromotedSlugs.length > 0) {
    throw new Error(`Missing promoted PDF manifests: ${missingPromotedSlugs.join(", ")}`);
  }

  for (const entry of entries) {
    const expectedKey = leadMagnetAsset(entry.slug).r2Key;
    if (entry.r2Key !== expectedKey) {
      throw new Error(
        `Unexpected R2 key for ${entry.slug}: expected ${expectedKey}, received ${entry.r2Key}`,
      );
    }

    if (!fileExists(entry.outputPath)) {
      throw new Error(`Missing local PDF for ${entry.slug}: ${entry.outputPath}`);
    }
  }

  const missingPromoted = entries.filter(
    (entry) => entry.promoted && !fileExists(entry.outputPath),
  );
  if (missingPromoted.length > 0) {
    throw new Error(
      `Missing local PDFs for promoted magnets: ${missingPromoted.map((entry) => entry.slug).join(", ")}`,
    );
  }
}

export function syncLeadMagnetsToR2(options: SyncLeadMagnetsOptions): void {
  const exec = options.exec ?? runWranglerCommand;
  const maxUploadAttempts = options.maxUploadAttempts ?? DEFAULT_UPLOAD_ATTEMPTS;
  const readFile = options.readFile ?? readFileSync;
  const wait = options.wait ?? waitSynchronously;
  const waitBetweenAttemptsMs = options.waitBetweenAttemptsMs ?? DEFAULT_UPLOAD_RETRY_DELAY_MS;

  for (const entry of options.entries) {
    assertAssetBytes(entry, readFile(entry.outputPath), "Local file");
    const { contentType } = leadMagnetAsset(entry.slug);
    console.log(`  Uploading ${entry.r2Key}...`);
    runWithRetries(
      () =>
        exec(
          `${WRANGLER_COMMAND} r2 object put "${options.bucket}/${entry.r2Key}" --file "${entry.outputPath}" --content-type ${contentType} --remote`,
        ),
      {
        commandLabel: `upload ${entry.r2Key}`,
        maxAttempts: maxUploadAttempts,
        wait,
        waitBetweenAttemptsMs,
      },
    );
  }
}

type RetryOptions = {
  commandLabel: string;
  maxAttempts: number;
  wait: (ms: number) => void;
  waitBetweenAttemptsMs: number;
};

function waitSynchronously(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runWithRetries(runCommand: () => void, options: RetryOptions): void {
  if (options.maxAttempts < 1) {
    throw new Error("maxAttempts must be at least 1");
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    try {
      runCommand();
      return;
    } catch (error) {
      lastError = error;

      if (attempt === options.maxAttempts) {
        break;
      }

      const delayMs = options.waitBetweenAttemptsMs * attempt;
      console.warn(
        `  ${options.commandLabel} failed on attempt ${attempt}/${options.maxAttempts}; retrying in ${delayMs}ms.`,
      );
      options.wait(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function buildVerifyLeadMagnetCommand(options: VerifyLeadMagnetCommandOptions): string {
  return `${WRANGLER_COMMAND} r2 object get "${options.bucket}/${options.r2Key}" --remote --file "${options.outputPath}"`;
}

function defaultVerifyOutputPath(entry: LeadMagnetManifestEntry): string {
  return join(tmpdir(), `grantpipe-r2-${entry.fileName}`);
}

const XLSX_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function assertAssetBytes(
  entry: LeadMagnetManifestEntry,
  bytes: Buffer,
  label: "Local file" | "R2 object" = "R2 object",
): void {
  if (entry.assetType === "xlsx") {
    if (!bytes.subarray(0, 4).equals(XLSX_MAGIC_BYTES)) {
      throw new Error(`${label} is not a xlsx: ${entry.r2Key}`);
    }
    if (bytes.length < MINIMUM_PDF_BYTES) {
      throw new Error(`${label} is too small to be a valid resource: ${entry.r2Key}`);
    }
    return;
  }

  const header = bytes.subarray(0, 4).toString("utf-8");
  if (header !== "%PDF") {
    throw new Error(`${label} is not a pdf: ${entry.r2Key}`);
  }
  if (bytes.length < MINIMUM_PDF_BYTES) {
    throw new Error(`${label} is too small to be a valid resource: ${entry.r2Key}`);
  }
  const tail = bytes.subarray(Math.max(0, bytes.length - 1024)).toString("latin1");
  if (!tail.includes("%%EOF")) {
    throw new Error(`${label} is missing an EOF marker: ${entry.r2Key}`);
  }
}

export function verifyLeadMagnetsInR2(options: VerifyLeadMagnetsOptions): void {
  const exec = options.exec ?? runWranglerCommand;
  const readFile = options.readFile ?? readFileSync;
  const outputPathForEntry = options.outputPathForEntry ?? defaultVerifyOutputPath;

  for (const entry of options.entries) {
    const outputPath = outputPathForEntry(entry);
    exec(
      buildVerifyLeadMagnetCommand({
        bucket: options.bucket,
        r2Key: entry.r2Key,
        outputPath,
      }),
    );
    const bytes = readFile(outputPath);
    assertAssetBytes(entry, bytes);
    console.log(`  Verified ${entry.r2Key} (${bytes.length} bytes)`);
  }
}

export function runWranglerCommand(command: string): void {
  execSync(command, { stdio: "inherit" });
}

export function run(options: RunOptions = {}): void {
  const bucketName =
    options.bucketName ?? process.env.CLOUDFLARE_R2_BUCKET ?? "grantpipe-documents";
  if (!/^[a-z0-9-]+$/.test(bucketName)) {
    throw new Error(`Invalid bucket name: ${bucketName}`);
  }

  const entries = readLeadMagnetManifest({
    manifestPath: options.manifestPath,
    readFile: options.readFile,
  });
  validateManifestEntries(entries, {
    fileExists: options.fileExists,
    promotedSlugs: options.promotedSlugs,
    requiredSlugs: options.requiredSlugs,
  });

  if (options.verifyOnly) {
    console.log(`Verifying ${entries.length} PDF file(s) in R2 bucket "${bucketName}"`);
    verifyLeadMagnetsInR2({
      bucket: bucketName,
      entries,
      exec: options.exec,
      readFile: options.readBinaryFile,
      outputPathForEntry: options.outputPathForEntry,
    });
    console.log(`\nVerification complete. ${entries.length} R2 PDF file(s) available.`);
    return;
  }

  console.log(`Found ${entries.length} PDF file(s) to sync to R2 bucket "${bucketName}"`);
  syncLeadMagnetsToR2({
    bucket: bucketName,
    entries,
    exec: options.exec,
    readFile: options.readBinaryFile,
  });
  console.log(`\nSync complete. ${entries.length} file(s) uploaded to R2.`);
}

export function runCli(options: RunCliOptions = {}): void {
  const argv = options.argv ?? process.argv;
  const execute = options.execute ?? (() => run({ verifyOnly: argv.includes("--verify") }));
  const exit = options.exit ?? process.exit;
  const logError = options.logError ?? console.error;

  if (!argv[1] || SCRIPT_PATH !== argv[1]) {
    return;
  }

  try {
    execute();
  } catch (error) {
    logError(error instanceof Error ? error.message : error);
    exit(1);
  }
}

runCli();
