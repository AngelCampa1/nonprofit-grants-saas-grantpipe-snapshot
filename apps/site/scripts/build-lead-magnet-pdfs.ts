import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { marked } from "marked";
import puppeteer from "puppeteer";
import {
  LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
  leadMagnetAsset,
  type LeadMagnetAssetType,
} from "@grantpipe/shared";
import { getMarketingContentCollectionBase } from "@grantpipe/shared/public-kb";
import {
  renderPdfHtml,
  PDF_FOOTER_TEMPLATE,
  PDF_HEADER_TEMPLATE,
  PDF_TEMPLATE_VERSION,
} from "./lead-magnet-pdf-template.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, "..", "..", "..");
export const OUTPUT_DIR_NAME = ".lead-magnet-pdfs";
export const MANIFEST_FILENAME = "manifest.json";
/**
 * Directory holding committed, pre-built non-PDF lead magnet assets (e.g. the
 * Excel spreadsheet deliverable). These are copied verbatim into the build
 * output rather than rendered with puppeteer.
 */
export const SHEET_ASSET_DIR = join(REPO_ROOT, "apps", "site", "src", "assets", "lead-magnets");
const WINDOWS_BROWSER_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
] as const;
const DARWIN_BROWSER_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
] as const;
const LINUX_BROWSER_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
] as const;
const FONT_READY_TIMEOUT_MS = 15_000;
const BROWSER_LAUNCH_TIMEOUT_MS = 120_000;

const BROWSER_LAUNCH_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"] as const;

const BROWSER_DISCONNECT_PATTERN = /Target closed|Protocol error|Connection closed/i;

type BrowserExecutablePathOptions = {
  env?: { PUPPETEER_EXECUTABLE_PATH?: string | undefined };
  platform?: NodeJS.Platform;
  pathExists?: (path: string) => boolean;
};

export interface LeadMagnetPdfManifestEntry {
  slug: string;
  title: string;
  /**
   * For PDF deliverables this is the markdown source. For sheet deliverables
   * this is the committed `.xlsx` source asset that is copied to the output.
   */
  sourcePath: string;
  outputPath: string;
  fileName: string;
  r2Key: string;
  assetType: LeadMagnetAssetType;
  publishedAt?: string;
  promoted: boolean;
  contentHash: string;
}

/** Maps a content `deliverableType` to a deliverable asset type. */
const DELIVERABLE_ASSET_TYPES: Record<string, LeadMagnetAssetType> = {
  pdf: "pdf",
  sheet: "xlsx",
};

export function computeContentHash(rawMarkdown: string): string {
  return createHash("sha256")
    .update(`${rawMarkdown}\n---template:${PDF_TEMPLATE_VERSION}`)
    .digest("hex");
}

type PuppeteerBrowser = Awaited<ReturnType<typeof puppeteer.launch>>;
type PuppeteerLaunchOptions = NonNullable<Parameters<typeof puppeteer.launch>[0]>;

export function resolvePromotedLeadMagnetSlugs(): string[] {
  return [...PROMOTED_PDF_LEAD_MAGNET_SLUGS];
}

export function buildManifestEntries(
  filenames: string[],
  contentDir: string,
  outputDir: string,
  readFile: (path: string, encoding: BufferEncoding) => string = readFileSync,
): LeadMagnetPdfManifestEntry[] {
  const promotedSlugs = new Set(resolvePromotedLeadMagnetSlugs());
  const entries: LeadMagnetPdfManifestEntry[] = [];

  for (const filename of filenames.filter((candidate) => candidate.endsWith(".md"))) {
    const mdPath = join(contentDir, filename);
    const rawContent = readFile(mdPath, "utf-8");
    const deliverableType = parseFrontmatterField(rawContent, "deliverableType") ?? "";
    const assetType = DELIVERABLE_ASSET_TYPES[deliverableType];

    if (!assetType) {
      continue;
    }

    const slug = basename(filename, ".md");
    const asset = leadMagnetAsset(slug);
    // PDFs render from the markdown source; sheets copy a committed binary asset.
    const sourcePath =
      assetType === "xlsx" ? join(SHEET_ASSET_DIR, `${slug}.${asset.extension}`) : mdPath;

    entries.push({
      slug,
      title: parseFrontmatterField(rawContent, "title") ?? slug,
      sourcePath,
      outputPath: join(outputDir, `${slug}.${asset.extension}`),
      fileName: `${slug}.${asset.extension}`,
      r2Key: asset.r2Key,
      assetType,
      publishedAt: parseFrontmatterField(rawContent, "publishedAt"),
      promoted: promotedSlugs.has(slug),
      contentHash: computeContentHash(rawContent),
    });
  }

  const availableSlugs = new Set(entries.map((entry) => entry.slug));
  const missingPromotedSlugs = resolvePromotedLeadMagnetSlugs().filter(
    (slug) => !availableSlugs.has(slug),
  );
  const missingSupportedSlugs = LEAD_MAGNET_SLUGS.filter((slug) => !availableSlugs.has(slug));

  if (missingPromotedSlugs.length > 0) {
    throw new Error(
      `Missing PDF lead magnets for promoted slugs: ${missingPromotedSlugs.join(", ")}`,
    );
  }

  if (missingSupportedSlugs.length > 0) {
    throw new Error(
      `Missing PDF lead magnets for supported slugs: ${missingSupportedSlugs.join(", ")}`,
    );
  }

  return entries;
}

export function writeManifest(
  outputDir: string,
  entries: LeadMagnetPdfManifestEntry[],
  writeFile: (path: string, data: string) => void = writeFileSync,
): string {
  const manifestPath = join(outputDir, MANIFEST_FILENAME);
  writeFile(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
  return manifestPath;
}

export function getBrowserExecutablePath(
  options: BrowserExecutablePathOptions = {},
): string | undefined {
  const envPath = options.env?.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (envPath) {
    return envPath;
  }

  const platform = options.platform ?? process.platform;
  const pathExists = options.pathExists ?? existsSync;
  const candidates =
    platform === "win32"
      ? WINDOWS_BROWSER_PATHS
      : platform === "darwin"
        ? DARWIN_BROWSER_PATHS
        : LINUX_BROWSER_PATHS;

  return candidates.find((path) => pathExists(path));
}

export function buildBrowserLaunchOptions(env = process.env): PuppeteerLaunchOptions {
  const executablePath = getBrowserExecutablePath({ env });

  return {
    args: [...BROWSER_LAUNCH_ARGS],
    headless: true,
    pipe: true,
    timeout: BROWSER_LAUNCH_TIMEOUT_MS,
    ...(executablePath ? { executablePath } : {}),
  };
}

export function stripFrontmatter(content: string): string {
  // Only strip frontmatter if the content starts with ---
  if (!content.startsWith("---")) {
    return content;
  }
  // Find the closing --- after the opening one
  const closingIdx = content.indexOf("---", 3);
  if (closingIdx === -1) {
    return content;
  }
  // Return content after the closing --- and optional trailing newline
  return content.slice(closingIdx + 3).replace(/^\n/, "");
}

/**
 * Extract a scalar field value from YAML frontmatter.
 * Supports quoted (single or double) and unquoted values on a single line.
 * Returns undefined if the field is not found or there is no frontmatter.
 */
export function parseFrontmatterField(content: string, field: string): string | undefined {
  if (!content.startsWith("---")) {
    return undefined;
  }
  const closingIdx = content.indexOf("---", 3);
  if (closingIdx === -1) {
    return undefined;
  }
  const frontmatter = content.slice(3, closingIdx);
  // Match: field: "value", field: 'value', or field: value
  const pattern = new RegExp(`^${field}:\\s*(?:"([^"]*)"|'([^']*)'|(\\S.*?))\\s*$`, "m");
  const match = pattern.exec(frontmatter);
  if (!match) {
    return undefined;
  }
  return match[1] ?? match[2] ?? match[3];
}

async function waitForFonts(page: Awaited<ReturnType<PuppeteerBrowser["newPage"]>>): Promise<void> {
  await page.evaluate((timeoutMs) => {
    const fonts = document.fonts;
    if (!fonts) {
      return Promise.resolve();
    }

    return Promise.race([
      fonts.ready.then(() => undefined),
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      }),
    ]);
  }, FONT_READY_TIMEOUT_MS);
}

const PDF_RETRY_ATTEMPTS = 3;
const PDF_RETRY_BASE_DELAY_MS = 250;

function isEnoentError(err: unknown): boolean {
  if (err instanceof Error) {
    return (err as NodeJS.ErrnoException).code === "ENOENT" || err.message.includes("ENOENT");
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function buildPdf(
  sourcePath: string,
  outputPath: string,
  title: string,
  bluf: string,
  publishedAt?: string,
  existingBrowser?: PuppeteerBrowser,
): Promise<void> {
  const rawContent = readFileSync(sourcePath, "utf-8");
  const stripped = stripFrontmatter(rawContent);
  const bodyHtml = await marked(stripped);
  const slug = basename(outputPath, ".pdf");

  const html = renderPdfHtml({ title, bluf, slug, bodyHtml, publishedAt });
  const browser = existingBrowser ?? (await puppeteer.launch(buildBrowserLaunchOptions()));
  try {
    let lastError: unknown;
    for (let attempt = 1; attempt <= PDF_RETRY_ATTEMPTS; attempt++) {
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: "domcontentloaded" });
        await waitForFonts(page);
        const pdfBuffer = await page.pdf({
          path: outputPath,
          format: "A4",
          displayHeaderFooter: true,
          headerTemplate: PDF_HEADER_TEMPLATE,
          footerTemplate: PDF_FOOTER_TEMPLATE,
          margin: { top: "20mm", bottom: "20mm", left: "25mm", right: "25mm" },
          printBackground: true,
        });
        const sizeKb = Math.round(pdfBuffer.length / 1024);
        console.log(`PDF generated: ${outputPath} (${sizeKb} KB)`);
        return;
      } catch (err) {
        await page.close();
        if (!isEnoentError(err)) {
          throw err;
        }
        lastError = err;
        if (attempt < PDF_RETRY_ATTEMPTS) {
          await sleep(PDF_RETRY_BASE_DELAY_MS * attempt);
        }
      }
    }
    throw lastError;
  } finally {
    if (!existingBrowser) {
      await browser.close();
    }
  }
}

function loadPreviousManifest(outputDir: string): Map<string, LeadMagnetPdfManifestEntry> {
  const manifestPath = join(outputDir, MANIFEST_FILENAME);
  if (!existsSync(manifestPath)) {
    return new Map();
  }
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const entries = JSON.parse(raw) as LeadMagnetPdfManifestEntry[];
    return new Map(entries.map((e) => [e.slug, e]));
  } catch {
    return new Map();
  }
}

function isBrowserDisconnectError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return BROWSER_DISCONNECT_PATTERN.test(message);
}

function isForcedRebuild(): boolean {
  return process.env.FORCE_PDF_REBUILD === "1";
}

async function launchBrowser(): Promise<PuppeteerBrowser> {
  return puppeteer.launch(buildBrowserLaunchOptions());
}

export async function run(): Promise<void> {
  const outputDir = join(REPO_ROOT, "apps", "site", OUTPUT_DIR_NAME);
  const contentDir = join(
    REPO_ROOT,
    "apps",
    "site",
    getMarketingContentCollectionBase("lead-magnets"),
  );

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
  }

  const files = readdirSync(contentDir) as string[];
  const manifestEntries = buildManifestEntries(files, contentDir, outputDir);

  const forceRebuild = isForcedRebuild();
  const previousManifest = forceRebuild ? new Map() : loadPreviousManifest(outputDir);

  let browser = await launchBrowser();
  try {
    for (const entry of manifestEntries) {
      const previous = previousManifest.get(entry.slug);
      const outputExists = existsSync(entry.outputPath);

      if (!forceRebuild && previous?.contentHash === entry.contentHash && outputExists) {
        console.log(`PDF unchanged: ${entry.outputPath}`);
        continue;
      }

      // Sheet deliverables are copied verbatim from their committed source
      // asset; they are not rendered through puppeteer.
      if (entry.assetType !== "pdf") {
        const assetBytes = readFileSync(entry.sourcePath);
        writeFileSync(entry.outputPath, assetBytes);
        const sizeKb = Math.round(assetBytes.length / 1024);
        console.log(`Sheet copied: ${entry.outputPath} (${sizeKb} KB)`);
        continue;
      }

      const rawContent = readFileSync(entry.sourcePath, "utf-8");
      const bluf =
        parseFrontmatterField(rawContent, "bluf") ??
        parseFrontmatterField(rawContent, "description") ??
        "";

      try {
        await buildPdf(
          entry.sourcePath,
          entry.outputPath,
          entry.title,
          bluf,
          entry.publishedAt,
          browser,
        );
      } catch (err) {
        if (isBrowserDisconnectError(err) || !browser.connected) {
          console.warn(
            `Browser disconnected while building ${entry.slug}. Relaunching and retrying once.`,
          );
          try {
            await browser.close();
          } catch {
            // already dead — ignore
          }
          browser = await launchBrowser();
          await buildPdf(
            entry.sourcePath,
            entry.outputPath,
            entry.title,
            bluf,
            entry.publishedAt,
            browser,
          );
        } else {
          throw err;
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifestPath = writeManifest(outputDir, manifestEntries);
  console.log(`Lead magnet manifest written: ${manifestPath}`);
}
