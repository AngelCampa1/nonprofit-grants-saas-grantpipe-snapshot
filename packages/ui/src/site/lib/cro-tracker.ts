import { trackEvent } from "./analytics";
import { destinationPathFromHref } from "./analytics-destination";
import { buildCtaClickEventProperties, getCtaAnalyticsContext } from "./cta-analytics";

const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const;
const ENGAGED_TIME_MILESTONES = [15, 30, 60, 120, 300] as const;
const MAX_MILESTONE_SECONDS = 300;

export function setupScrollDepthTracking(): () => void {
  const firedThresholds = new Set<number>();

  function checkThresholds(): void {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollY = window.scrollY;
    const innerHeight = window.innerHeight;
    const ratio = (scrollY + innerHeight) / scrollHeight;

    for (const threshold of SCROLL_THRESHOLDS) {
      if (!firedThresholds.has(threshold) && ratio >= threshold / 100) {
        firedThresholds.add(threshold);
        trackEvent("scroll_depth_reached", {
          threshold,
          page_path: location.pathname,
        });
      }
    }
  }

  // Edge case: page fits in viewport
  if (document.documentElement.scrollHeight <= window.innerHeight) {
    for (const threshold of SCROLL_THRESHOLDS) {
      firedThresholds.add(threshold);
      trackEvent("scroll_depth_reached", {
        threshold,
        page_path: location.pathname,
      });
    }
  }

  window.addEventListener("scroll", checkThresholds);

  return () => {
    window.removeEventListener("scroll", checkThresholds);
  };
}

export function setupSectionVisibilityTracking(): () => void {
  const sections = document.querySelectorAll("[data-section]");

  if (sections.length === 0) {
    return () => {};
  }

  const pageLoadTime = Date.now();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        trackEvent("section_viewed", {
          section: el.dataset.section,
          time_to_view_ms: Date.now() - pageLoadTime,
          page_path: location.pathname,
        });
        observer.unobserve(el);
      }
    },
    { threshold: 0.3 },
  );

  for (const section of sections) {
    observer.observe(section);
  }

  return () => {
    observer.disconnect();
  };
}

export function setupEngagedTimeTracking(): () => void {
  let seconds = 0;
  const firedMilestones = new Set<number>();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  intervalId = setInterval(() => {
    if (document.visibilityState !== "visible") return;

    seconds += 1;

    for (const milestone of ENGAGED_TIME_MILESTONES) {
      if (!firedMilestones.has(milestone) && seconds >= milestone) {
        firedMilestones.add(milestone);
        trackEvent("engaged_time_reached", {
          milestone_seconds: milestone,
          page_path: location.pathname,
        });
      }
    }

    if (seconds >= MAX_MILESTONE_SECONDS && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }, 1000);

  return () => {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

export function setupFaqExpansionTracking(): () => void {
  const faqSection = document.querySelector("[data-faq-section]");
  if (!faqSection) return () => {};

  const detailsElements = faqSection.querySelectorAll("details");
  const handlers: Array<{ el: HTMLDetailsElement; handler: () => void }> = [];

  detailsElements.forEach((el, index) => {
    const detailsEl = el as HTMLDetailsElement;
    const handler = (): void => {
      if (!detailsEl.open) return;

      trackEvent("faq_expanded", {
        faq_id: detailsEl.dataset.faqId || `faq-${index}`,
        question_index: index,
        page_path: location.pathname,
      });
    };

    detailsEl.addEventListener("toggle", handler);
    handlers.push({ el: detailsEl, handler });
  });

  return () => {
    for (const { el, handler } of handlers) {
      el.removeEventListener("toggle", handler);
    }
  };
}

function findCtaElement(target: EventTarget | null): HTMLElement | null {
  let el = target as HTMLElement | null;
  let depth = 0;

  while (el && depth <= 3) {
    if (el === document.body) return null;

    const isAnchorHash = el.tagName === "A" && (el.getAttribute("href") ?? "").startsWith("#");
    const isCtaButton = el.hasAttribute("data-cta-button");
    const isBtnPrimary = el.classList.contains("btn-primary");
    const isBtnSecondary = el.classList.contains("btn-secondary");
    const isMarketingButton = el.classList.contains("gp-mkt-btn");

    if (isAnchorHash || isCtaButton || isBtnPrimary || isBtnSecondary || isMarketingButton) {
      return el;
    }

    el = el.parentElement;
    depth += 1;
  }

  return null;
}

function currentPagePath(): string {
  return window.location.pathname;
}

function isLegacyCtaElement(element: HTMLElement): boolean {
  const isAnchorHash =
    element.tagName === "A" && (element.getAttribute("href") ?? "").startsWith("#");
  return (
    isAnchorHash ||
    element.hasAttribute("data-cta-button") ||
    element.classList.contains("btn-primary") ||
    element.classList.contains("btn-secondary")
  );
}

function getCtaElementPosition(element: HTMLElement): number {
  const selector = isLegacyCtaElement(element)
    ? "a[href^='#'], [data-cta-button], .btn-primary, .btn-secondary"
    : "a[href^='#'], [data-cta-button], .btn-primary, .btn-secondary, .gp-mkt-btn";
  const ctas = Array.from(document.body.querySelectorAll<HTMLElement>(selector));
  return Math.max(ctas.indexOf(element), 0);
}

function findNavigationLink(target: EventTarget | null): HTMLAnchorElement | null {
  let el = target as HTMLElement | null;
  let depth = 0;

  while (el && depth <= 3) {
    if (el instanceof HTMLAnchorElement && el.closest("[data-site-nav]")) {
      return el;
    }

    el = el.parentElement;
    depth += 1;
  }

  return null;
}

function getNavigationLinkPosition(link: HTMLAnchorElement): number {
  const scope = link.closest("[data-site-nav-group]") ?? link.closest("[data-site-nav]");
  const links = Array.from(scope?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? []);
  return links.indexOf(link);
}

function getNavigationGroupId(link: HTMLAnchorElement): string | undefined {
  const group = link.closest("[data-site-nav-group]") as HTMLElement | null;
  if (!group) return undefined;
  if (group.dataset.siteNavGroup) return group.dataset.siteNavGroup;
  const groups = Array.from(
    group.closest("[data-site-nav]")?.querySelectorAll<HTMLElement>("[data-site-nav-group]") ?? [],
  );
  const groupIndex = groups.indexOf(group);
  return `group-${Math.max(groupIndex, 0)}`;
}

function getNavigationItemId(link: HTMLAnchorElement): string {
  return link.dataset.navItemId || `nav-${Math.max(getNavigationLinkPosition(link), 0)}`;
}

function findResourceCardLink(target: EventTarget | null): HTMLAnchorElement | null {
  let el = target as HTMLElement | null;
  let depth = 0;

  while (el && depth <= 3) {
    if (el instanceof HTMLAnchorElement && el.hasAttribute("data-resource-card")) {
      return el;
    }

    el = el.parentElement;
    depth += 1;
  }

  return null;
}

function getResourceCardPosition(link: HTMLAnchorElement): number {
  const cards = Array.from(
    document.body.querySelectorAll<HTMLAnchorElement>("[data-resource-card]"),
  );
  return Math.max(cards.indexOf(link), 0);
}

function getResourceCardId(link: HTMLAnchorElement): string {
  return link.dataset.resourceCardId || `resource-${getResourceCardPosition(link)}`;
}

function buildSignupAttributionHref(element: HTMLElement, href: string, section: string): string {
  if (!href) return href;

  try {
    const isAbsolute = /^https?:\/\//i.test(href);
    const baseUrl =
      typeof window.location.origin === "string" && window.location.origin.length > 0
        ? window.location.origin
        : "https://grantpipe.com";
    const url = new URL(href, baseUrl);
    const isSignupPath = url.pathname.replace(/\/+$/, "") === "/signup";
    const isAppSignup = url.hostname === "app.grantpipe.com" || !isAbsolute;

    if (!isSignupPath || !isAppSignup) {
      return href;
    }

    const context = getCtaAnalyticsContext(element);
    url.searchParams.set("landing_page", location.pathname);
    url.searchParams.set("source_section", section);

    if (context.pageFamily) {
      url.searchParams.set("cta_page_family", context.pageFamily);
    }
    if (context.buyerStage) {
      url.searchParams.set("cta_buyer_stage", context.buyerStage);
    }
    if (context.placement) {
      url.searchParams.set("cta_placement", context.placement);
    }
    if (context.intent) {
      url.searchParams.set("cta_intent", context.intent);
    }

    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function enrichSignupAttributionLinks(): void {
  const links = document.querySelectorAll("a[href]");

  for (const link of links) {
    const ctaEl = findCtaElement(link);
    if (!ctaEl) continue;

    const sectionEl = ctaEl.closest("[data-section]") as HTMLElement | null;
    const section = sectionEl?.dataset.section ?? "unknown";
    const currentHref = ctaEl.getAttribute("href") ?? "";
    const href = buildSignupAttributionHref(ctaEl, currentHref, section);

    // Only write when the value actually changes. The MutationObserver in
    // setupCtaClickTracking watches `href`, so an unconditional setAttribute
    // (even with an identical value) would emit a mutation record, refire the
    // observer, and loop forever — freezing the page's main thread.
    if (href && href !== currentHref) {
      ctaEl.setAttribute("href", href);
    }
  }
}

export function setupCtaClickTracking(): () => void {
  enrichSignupAttributionLinks();
  const observer =
    typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          enrichSignupAttributionLinks();
        });

  observer?.observe(document.body, {
    attributes: true,
    attributeFilter: [
      "href",
      "data-cta-page-family",
      "data-cta-buyer-stage",
      "data-cta-placement",
      "data-cta-intent",
    ],
    childList: true,
    subtree: true,
  });

  function onClick(event: Event): void {
    const ctaEl = findCtaElement(event.target);
    if (!ctaEl) return;

    const buttonText = (ctaEl.textContent ?? "").trim().slice(0, 100);
    const sectionEl = ctaEl.closest("[data-section]") as HTMLElement | null;
    const section = sectionEl?.dataset.section ?? "unknown";
    const href = buildSignupAttributionHref(ctaEl, ctaEl.getAttribute("href") ?? "", section);

    if (href) {
      ctaEl.setAttribute("href", href);
    }

    trackEvent(
      "cta_clicked",
      buildCtaClickEventProperties(ctaEl, {
        buttonText,
        href,
        section,
        pagePath: location.pathname,
        index: getCtaElementPosition(ctaEl),
      }),
    );
  }

  document.body.addEventListener("click", onClick);

  return () => {
    observer?.disconnect();
    document.body.removeEventListener("click", onClick);
  };
}

export function setupNavigationClickTracking(): () => void {
  function onClick(event: Event): void {
    const link = findNavigationLink(event.target);
    if (!link) return;

    const navGroupId = getNavigationGroupId(link);
    trackEvent("site_nav_link_clicked", {
      nav_area: navGroupId ? "header_megamenu" : "header",
      nav_item_id: getNavigationItemId(link),
      ...(navGroupId ? { nav_group_id: navGroupId } : {}),
      destination_path: destinationPathFromHref(link.href),
      page_path: currentPagePath(),
      link_position: getNavigationLinkPosition(link),
    });
  }

  document.body.addEventListener("click", onClick);

  return () => {
    document.body.removeEventListener("click", onClick);
  };
}

export function setupResourceCardClickTracking(): () => void {
  function onClick(event: Event): void {
    const link = findResourceCardLink(event.target);
    if (!link) return;

    trackEvent("resource_card_clicked", {
      resource_card_id: getResourceCardId(link),
      page_family: link.dataset.resourceCardFamily || "resource",
      buyer_stage: link.dataset.resourceCardStage || "unknown",
      featured: link.dataset.resourceCardFeatured === "true",
      destination_path: destinationPathFromHref(link.href),
      page_path: currentPagePath(),
      card_position: getResourceCardPosition(link),
    });
  }

  document.body.addEventListener("click", onClick);

  return () => {
    document.body.removeEventListener("click", onClick);
  };
}

export function initCroTracking(): void {
  setupScrollDepthTracking();
  setupSectionVisibilityTracking();
  setupEngagedTimeTracking();
  setupFaqExpansionTracking();
  setupCtaClickTracking();
  setupNavigationClickTracking();
  setupResourceCardClickTracking();
}
