// Skip in Cloudflare Pages builds: puppeteer's Chromium isn't available there.
// PDFs are served from R2 via the API; the R2 sync is run manually
// (apps/api/src/scripts/sync-lead-magnets-to-r2.ts).
function isStrictPdfBuildRequired(): boolean {
  return process.env.REQUIRE_LEAD_MAGNET_PDF_BUILD === "1";
}

if (process.env.CF_PAGES === "1" && !isStrictPdfBuildRequired()) {
  console.log("CF_PAGES detected - skipping PDF generation (R2 delivery handles this).");
  process.exit(0);
}

export {};

const MISSING_BROWSER_PATTERNS = [
  /Could not find Chrome/i,
  /Could not find Chromium/i,
  /Browser was not found/i,
];

function shouldSkipMissingBrowserError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);

  return MISSING_BROWSER_PATTERNS.some((pattern) => pattern.test(message));
}

const { run } = await import("./build-lead-magnet-pdfs.js");

try {
  await run();
} catch (err: unknown) {
  if (!isStrictPdfBuildRequired() && shouldSkipMissingBrowserError(err)) {
    console.warn(
      "Skipping lead magnet PDF generation because a Chrome/Chromium binary is unavailable.",
    );
    process.exit(0);
  }

  console.error("PDF build failed:", err);
  process.exit(1);
}
