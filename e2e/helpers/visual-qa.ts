import { expect, type Page, type TestInfo } from "@playwright/test";

export const AUTH_VISUAL_VIEWPORTS = [
  { name: "desktop", width: 1366, height: 900 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "mobile", width: 390, height: 844 },
  { name: "narrow-mobile", width: 320, height: 568 },
] as const;

export type AuthVisualViewport = (typeof AUTH_VISUAL_VIEWPORTS)[number];

interface PageQualityMonitor {
  waitForQuietNetwork(): Promise<void>;
  assertClean(): void;
}

interface LayoutIssue {
  kind: "document-overflow" | "text-overflow" | "clipped-control";
  selector: string;
  text: string;
  clientWidth?: number;
  scrollWidth?: number;
  clientHeight?: number;
  scrollHeight?: number;
}

const IGNORED_CONSOLE_PATTERNS = ["failed to load resource", "favicon", "sentry", "posthog"];
const BROKEN_RESOURCE_TYPES = new Set(["document", "script", "stylesheet", "image", "font"]);
const QUIET_NETWORK_TIMEOUT_MS = 30_000;

export function installPageQualityMonitor(page: Page): PageQualityMonitor {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const pageErrors: string[] = [];
  const activeDataRequests = new Set<string>();
  let requestSequence = 0;

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORED_CONSOLE_PATTERNS.some((pattern) => text.toLowerCase().includes(pattern))) {
      return;
    }
    consoleErrors.push(text);
  });

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  page.on("request", (request) => {
    if (!isDataRequest(request.resourceType())) return;
    if (isTelemetryRequest(request.url())) return;
    requestSequence += 1;
    activeDataRequests.add(`${requestSequence.toString()} ${request.url()}`);
  });

  page.on("requestfailed", (request) => {
    markDataRequestComplete(request.url());
    const failureText = request.failure()?.errorText ?? "request failed";
    if (isIgnorableRequestFailure(request.url(), request.resourceType(), failureText)) {
      return;
    }
    requestFailures.push(`${request.method()} ${request.url()}: ${failureText}`);
  });

  page.on("response", (response) => {
    markDataRequestComplete(response.url());

    if (response.status() >= 500) {
      requestFailures.push(`${response.status().toString()} ${response.url()}`);
      return;
    }

    if (response.status() === 404 && BROKEN_RESOURCE_TYPES.has(response.request().resourceType())) {
      requestFailures.push(`${response.status().toString()} ${response.url()}`);
    }
  });

  return {
    async waitForQuietNetwork() {
      await expect
        .poll(() => activeDataRequests.size, {
          message: `Pending data requests:\n${Array.from(activeDataRequests).join("\n")}`,
          timeout: QUIET_NETWORK_TIMEOUT_MS,
        })
        .toBe(0);

      await page.waitForLoadState("networkidle", { timeout: 2_000 }).catch(() => {});
    },
    assertClean() {
      expect(consoleErrors, `Unexpected console errors:\n${consoleErrors.join("\n")}`).toHaveLength(
        0,
      );
      expect(pageErrors, `Unexpected page errors:\n${pageErrors.join("\n")}`).toHaveLength(0);
      expect(requestFailures, `Request failures:\n${requestFailures.join("\n")}`).toHaveLength(0);
    },
  };

  function markDataRequestComplete(url: string) {
    for (const requestKey of activeDataRequests) {
      if (requestKey.endsWith(url)) {
        activeDataRequests.delete(requestKey);
        return;
      }
    }
  }

  function isDataRequest(resourceType: string) {
    return resourceType === "fetch" || resourceType === "xhr";
  }
}

function isTelemetryRequest(url: string) {
  try {
    const hostname = new URL(url).hostname;
    // Sentry envelopes are keepalive fetches often fired right before a route
    // navigation — the response event never reaches the abandoned page, so
    // tracking them leaves a permanently "pending" entry. Telemetry is out of
    // scope for the quiet-network gate, same as PostHog.
    return (
      hostname === "us.i.posthog.com" ||
      hostname.endsWith(".posthog.com") ||
      hostname.endsWith(".sentry.io")
    );
  } catch {
    return false;
  }
}

export function isIgnorableRequestFailure(url: string, resourceType: string, failureText: string) {
  if (!failureText.includes("net::ERR_ABORTED")) {
    return false;
  }

  if (!BROKEN_RESOURCE_TYPES.has(resourceType)) {
    return true;
  }

  return isViteRouteSplitModule(url) || isLocalViteSourceModule(url);
}

function isViteRouteSplitModule(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === "localhost" &&
      parsedUrl.pathname.startsWith("/src/routes/") &&
      parsedUrl.searchParams.has("tsr-split")
    );
  } catch {
    return false;
  }
}

function isLocalViteSourceModule(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === "localhost" &&
      parsedUrl.pathname.startsWith("/src/") &&
      /\.(css|jsx?|tsx?)$/.test(parsedUrl.pathname)
    );
  } catch {
    return false;
  }
}

export async function assertNoLayoutOverflow(page: Page, routeLabel: string) {
  const issues = await collectLayoutIssues(page);
  expect(issues, formatLayoutIssues(routeLabel, issues)).toHaveLength(0);
}

export async function captureRouteScreenshot(
  page: Page,
  testInfo: TestInfo,
  routeLabel: string,
  viewport: AuthVisualViewport,
) {
  const normalizedRoute = routeLabel.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(`${viewport.name}-${normalizedRoute}.png`),
  });
}

async function collectLayoutIssues(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate(() => {
    const issues: LayoutIssue[] = [];
    const documentElement = document.documentElement;
    const documentOverflow = documentElement.scrollWidth - documentElement.clientWidth;

    if (documentOverflow > 1) {
      issues.push({
        kind: "document-overflow",
        selector: "html",
        text: describeDocumentOverflow(documentElement.clientWidth),
        clientWidth: documentElement.clientWidth,
        scrollWidth: documentElement.scrollWidth,
      });
    }

    const controlsSelector = [
      "button",
      "a[href]",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='combobox']",
    ].join(",");

    Array.from(document.querySelectorAll<HTMLElement>("body *")).forEach((element) => {
      if (!isVisibleElement(element) || shouldIgnoreElement(element)) return;

      const text = (element.textContent ?? "").trim().replace(/\s+/g, " ");
      const style = window.getComputedStyle(element);
      const allowsHorizontalScroll = style.overflowX === "auto" || style.overflowX === "scroll";
      const allowsVerticalScroll = style.overflowY === "auto" || style.overflowY === "scroll";
      const allowsTextClipping = isIntentionalTextClipping(element, style);

      const clippedChild = findClippedChild(element, style);
      if (clippedChild) {
        issues.push({
          kind: "clipped-control",
          selector: describeElement(element),
          text: clippedChild.text,
          clientWidth: Math.round(clippedChild.containerWidth),
          scrollWidth: Math.round(clippedChild.childRight - clippedChild.containerLeft),
          clientHeight: Math.round(clippedChild.containerHeight),
          scrollHeight: Math.round(clippedChild.childBottom - clippedChild.containerTop),
        });
      }

      if (shouldSkipElementOverflow(element)) return;

      if (
        text.length > 0 &&
        !allowsHorizontalScroll &&
        !allowsTextClipping &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        issues.push({
          kind: "text-overflow",
          selector: describeElement(element),
          text: text.slice(0, 120),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        });
      }

      if (
        text.length > 0 &&
        !allowsVerticalScroll &&
        !allowsTextClipping &&
        element.scrollHeight > element.clientHeight + 1 &&
        style.overflowY === "hidden"
      ) {
        issues.push({
          kind: "text-overflow",
          selector: describeElement(element),
          text: text.slice(0, 120),
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
        });
      }

      if (element.matches(controlsSelector)) {
        const rect = element.getBoundingClientRect();
        const clippedHorizontally =
          !allowsHorizontalScroll &&
          !allowsTextClipping &&
          element.scrollWidth > element.clientWidth + 1;
        const clippedVertically =
          !allowsVerticalScroll &&
          !allowsTextClipping &&
          element.scrollHeight > element.clientHeight + 1 &&
          style.overflowY === "hidden";

        if (rect.width < 1 || rect.height < 1 || clippedHorizontally || clippedVertically) {
          issues.push({
            kind: "clipped-control",
            selector: describeElement(element),
            text: text.slice(0, 120),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            clientHeight: element.clientHeight,
            scrollHeight: element.scrollHeight,
          });
        }
      }
    });

    return issues.slice(0, 25);

    function isVisibleElement(element: HTMLElement) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        element.getAttribute("aria-hidden") !== "true"
      );
    }

    function describeDocumentOverflow(viewportWidth: number) {
      return Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((element) => !shouldIgnoreElement(element) && isVisibleElement(element))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            selector: describeElement(element),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          };
        })
        .filter((element) => element.right > viewportWidth + 1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5)
        .map(
          (element) =>
            `${element.selector} right=${element.right.toString()} width=${element.width.toString()} text=${element.text}`,
        )
        .join(" | ");
    }

    function shouldIgnoreElement(element: HTMLElement) {
      const tagName = element.tagName.toLowerCase();
      if (["body", "html", "script", "style", "svg", "path"].includes(tagName)) {
        return true;
      }
      return Boolean(element.closest("[data-visual-qa-ignore]"));
    }

    function shouldSkipElementOverflow(element: HTMLElement) {
      return element.children.length > 0 && element.matches("main, section, article, div");
    }

    function findClippedChild(element: HTMLElement, style: CSSStyleDeclaration) {
      if (!isPotentialClippingContainer(element, style)) return null;

      const containerRect = element.getBoundingClientRect();
      const candidates = Array.from(
        element.querySelectorAll<HTMLElement>(
          [
            "button",
            "a[href]",
            "input",
            "select",
            "textarea",
            "[role]",
            "[data-slot]",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "p",
            "span",
            "td",
            "th",
          ].join(","),
        ),
      );

      for (const child of candidates) {
        if (child === element || !isVisibleElement(child)) continue;
        if (isIntentionalTextClipping(child, window.getComputedStyle(child))) continue;
        if (hasScrollableAncestorWithin(element, child)) continue;

        const childRect = child.getBoundingClientRect();
        const clippedHorizontally =
          (style.overflowX === "hidden" || style.overflowX === "clip") &&
          (childRect.left < containerRect.left - 2 || childRect.right > containerRect.right + 2);
        const clippedVertically =
          (style.overflowY === "hidden" || style.overflowY === "clip") &&
          (childRect.top < containerRect.top - 2 || childRect.bottom > containerRect.bottom + 2);

        if (clippedHorizontally || clippedVertically) {
          return {
            text: (child.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 120),
            containerLeft: containerRect.left,
            containerTop: containerRect.top,
            containerWidth: containerRect.width,
            containerHeight: containerRect.height,
            childRight: childRect.right,
            childBottom: childRect.bottom,
          };
        }
      }

      return null;
    }

    function hasScrollableAncestorWithin(container: HTMLElement, child: HTMLElement) {
      let current = child.parentElement;

      while (current && current !== container) {
        const style = window.getComputedStyle(current);
        if (
          style.overflowX === "auto" ||
          style.overflowX === "scroll" ||
          style.overflowY === "auto" ||
          style.overflowY === "scroll"
        ) {
          return true;
        }
        current = current.parentElement;
      }

      return false;
    }

    function isPotentialClippingContainer(element: HTMLElement, style: CSSStyleDeclaration) {
      if (element.children.length === 0) return false;
      if (
        style.overflowX !== "hidden" &&
        style.overflowX !== "clip" &&
        style.overflowY !== "hidden" &&
        style.overflowY !== "clip"
      ) {
        return false;
      }

      return element.matches(
        [
          "[class*='overflow-hidden']",
          "[class*='overflow-clip']",
          "[data-slot]",
          "[role='dialog']",
          "[role='table']",
          "[role='row']",
          "[role='cell']",
          "td",
          "th",
        ].join(","),
      );
    }

    function isIntentionalTextClipping(element: HTMLElement, style: CSSStyleDeclaration) {
      const classList = Array.from(element.classList);
      return (
        element.hasAttribute("data-visual-qa-allow-truncation") ||
        classList.includes("sr-only") ||
        isScreenReaderOnlyElement(style) ||
        style.textOverflow === "ellipsis" ||
        style.webkitLineClamp !== "none" ||
        classList.includes("truncate") ||
        classList.some((className) => className.startsWith("line-clamp-"))
      );
    }

    function isScreenReaderOnlyElement(style: CSSStyleDeclaration) {
      return (
        style.position === "absolute" &&
        style.width === "1px" &&
        style.height === "1px" &&
        style.overflow === "hidden" &&
        style.clip !== "auto"
      );
    }

    function describeElement(element: HTMLElement) {
      const tagName = element.tagName.toLowerCase();
      const testId = element.getAttribute("data-testid");
      const slot = element.getAttribute("data-slot");
      const role = element.getAttribute("role");
      const id = element.id;

      if (testId) return `${tagName}[data-testid="${testId}"]`;
      if (slot) return `${tagName}[data-slot="${slot}"]`;
      if (role) return `${tagName}[role="${role}"]`;
      if (id) return `${tagName}#${id}`;
      return tagName;
    }
  });
}

function formatLayoutIssues(routeLabel: string, issues: LayoutIssue[]) {
  if (issues.length === 0) return `${routeLabel} has no layout issues`;

  return [
    `${routeLabel} layout issues:`,
    ...issues.map((issue) => {
      const dimensions =
        issue.clientWidth == null
          ? ""
          : ` (${issue.clientWidth.toString()}x${(issue.clientHeight ?? 0).toString()} client, ${
              issue.scrollWidth?.toString() ?? "?"
            }x${issue.scrollHeight?.toString() ?? "?"} scroll)`;
      return `${issue.kind} ${issue.selector}${dimensions}: ${issue.text}`;
    }),
  ].join("\n");
}
