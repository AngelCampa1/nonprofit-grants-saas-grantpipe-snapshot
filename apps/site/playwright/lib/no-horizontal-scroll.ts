import type { Page } from "@playwright/test";

/**
 * Returns true if the page has horizontal overflow (i.e. the document width
 * exceeds the viewport width by more than 1px to account for rounding).
 *
 * Usage in a test:
 *   const hasOverflow = await hasHorizontalScroll(page);
 *   expect(hasOverflow).toBe(false);
 */
export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  });
}
