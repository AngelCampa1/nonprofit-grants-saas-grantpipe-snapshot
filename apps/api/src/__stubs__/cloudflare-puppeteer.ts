/**
 * Vitest stub for @cloudflare/puppeteer.
 * This file is only used during unit tests (aliased via vitest.config.ts).
 * The real @cloudflare/puppeteer only works inside Cloudflare Workers.
 */
const puppeteer = {
  launch: () => Promise.resolve(null),
};

export default puppeteer;
