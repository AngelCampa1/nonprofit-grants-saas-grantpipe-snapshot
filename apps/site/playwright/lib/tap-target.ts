import type { Page } from "@playwright/test";

const MIN_TAP_SIZE_PX = 48;

export type TapTargetViolation = {
  selector: string;
  tag: string;
  text: string;
  width: number;
  height: number;
};

/**
 * Returns all interactive elements on the page whose bounding box is smaller
 * than the 48×48 px minimum tap target requirement (WCAG 2.5.5).
 *
 * Excluded:
 * - Elements that are hidden (display:none / visibility:hidden / opacity:0)
 * - Elements whose size is intentionally constrained by a parent scroll container
 *
 * Usage:
 *   const violations = await getTapTargetViolations(page);
 *   expect(violations).toEqual([]);
 */
export async function getTapTargetViolations(page: Page): Promise<TapTargetViolation[]> {
  return page.evaluate((minSize) => {
    const interactiveSelectors = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      '[role="button"]',
      '[role="link"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="menuitem"]',
      '[role="tab"]',
    ].join(",");

    const elements = Array.from(document.querySelectorAll<HTMLElement>(interactiveSelectors));
    const violations: TapTargetViolation[] = [];

    for (const el of elements) {
      const style = getComputedStyle(el);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        parseFloat(style.opacity) === 0
      ) {
        continue;
      }

      if (el.classList.contains("sr-only") && el !== document.activeElement) {
        continue;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        continue;
      }

      if (rect.right <= 0 || rect.bottom <= 0) {
        continue;
      }

      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width < minSize || height < minSize) {
        violations.push({
          selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : ""),
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 60),
          width,
          height,
        });
      }
    }

    return violations;
  }, MIN_TAP_SIZE_PX);
}
