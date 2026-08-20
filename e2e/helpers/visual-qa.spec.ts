import { expect, test } from "@playwright/test";
import { assertNoLayoutOverflow, isIgnorableRequestFailure } from "./visual-qa";

test.describe("visual QA overflow helper", () => {
  test("reports visible text overflow", async ({ page }) => {
    await page.setContent(`
      <main>
        <button style="width: 80px; overflow: hidden; white-space: nowrap;">
          Generate the longest report label
        </button>
      </main>
    `);

    await expect(assertNoLayoutOverflow(page, "fixture")).rejects.toThrow(/text-overflow/);
  });

  test("allows intentional truncation and scroll regions", async ({ page }) => {
    await page.setContent(`
      <main>
        <p class="truncate" style="width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          This intentionally truncates inside a dense table cell
        </p>
        <div style="width: 120px; overflow-x: auto;">
          <span style="display: inline-block; width: 300px;">Scrollable table content</span>
        </div>
      </main>
    `);

    await expect(assertNoLayoutOverflow(page, "fixture")).resolves.toBeUndefined();
  });

  test("reports clipped children in overflow-hidden containers", async ({ page }) => {
    await page.setContent(`
      <main>
        <section data-slot="summary-card" style="position: relative; width: 120px; height: 40px; overflow: hidden;">
          <button style="position: absolute; left: 90px; top: 8px; width: 80px; height: 24px;">
            Save
          </button>
        </section>
      </main>
    `);

    await expect(assertNoLayoutOverflow(page, "fixture")).rejects.toThrow(/clipped-control/);
  });

  test("allows clipped card chrome when a nested region scrolls", async ({ page }) => {
    await page.setContent(`
      <main>
        <section data-slot="data-table-surface" style="width: 120px; overflow: hidden;">
          <div style="overflow-x: auto;">
            <table style="width: 320px;">
              <thead>
                <tr><th>Name</th><th>Email</th><th>Total giving</th></tr>
              </thead>
            </table>
          </div>
        </section>
      </main>
    `);

    await expect(assertNoLayoutOverflow(page, "fixture")).resolves.toBeUndefined();
  });

  test("ignores only aborted Vite route split modules", () => {
    expect(
      isIgnorableRequestFailure(
        "http://localhost:5173/src/routes/_authenticated.tsx?tsr-split=component",
        "script",
        "net::ERR_ABORTED",
      ),
    ).toBe(true);
    expect(
      isIgnorableRequestFailure("https://cdn.example.com/app.js", "script", "net::ERR_ABORTED"),
    ).toBe(false);
  });

  test("ignores aborted local Vite source modules during rapid route changes", () => {
    expect(
      isIgnorableRequestFailure(
        "http://localhost:5173/src/components/shell/app-shell.tsx",
        "script",
        "net::ERR_ABORTED",
      ),
    ).toBe(true);
    expect(
      isIgnorableRequestFailure(
        "http://localhost:5173/src/hooks/use-sidebar-collapse.ts",
        "script",
        "net::ERR_ABORTED",
      ),
    ).toBe(true);
    expect(
      isIgnorableRequestFailure(
        "http://localhost:5173/assets/app-shell.js",
        "script",
        "net::ERR_ABORTED",
      ),
    ).toBe(false);
  });
});
