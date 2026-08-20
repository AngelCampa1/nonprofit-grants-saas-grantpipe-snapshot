import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./analytics", () => ({ trackEvent: vi.fn() }));

import { trackEvent } from "./analytics";
import {
  initCroTracking,
  setupScrollDepthTracking,
  setupSectionVisibilityTracking,
  setupEngagedTimeTracking,
  setupFaqExpansionTracking,
  setupCtaClickTracking,
  setupNavigationClickTracking,
  setupResourceCardClickTracking,
} from "./cro-tracker";

const mockTrackEvent = vi.mocked(trackEvent);

// --- IntersectionObserver mock ---
type IntersectionCallback = (entries: IntersectionObserverEntry[]) => void;

class MockIntersectionObserver {
  callback: IntersectionCallback;
  options: IntersectionObserverInit | undefined;
  observed: Set<Element> = new Set();
  disconnected = false;

  constructor(callback: IntersectionCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }

  observe(el: Element): void {
    this.observed.add(el);
  }

  unobserve(el: Element): void {
    this.observed.delete(el);
  }

  disconnect(): void {
    this.disconnected = true;
    this.observed.clear();
  }

  triggerIntersection(entries: Partial<IntersectionObserverEntry>[]): void {
    this.callback(entries as IntersectionObserverEntry[]);
  }

  static instances: MockIntersectionObserver[] = [];
  static reset(): void {
    MockIntersectionObserver.instances = [];
  }
}

// --- helpers ---
function setScrollProps(scrollHeight: number, scrollY: number, innerHeight: number): void {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(window, "scrollY", {
    value: scrollY,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: innerHeight,
    configurable: true,
  });
}

function fireScroll(): void {
  window.dispatchEvent(new Event("scroll"));
}

function preventNavigation(element: Element): void {
  element.addEventListener("click", (event) => event.preventDefault());
}

beforeEach(() => {
  mockTrackEvent.mockClear();
  MockIntersectionObserver.reset();
  Object.defineProperty(window, "IntersectionObserver", {
    value: MockIntersectionObserver,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "location", {
    value: { pathname: "/test-page" },
    configurable: true,
    writable: true,
  });
  document.body.innerHTML = "";
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ============================================================
// setupScrollDepthTracking
// ============================================================
describe("setupScrollDepthTracking", () => {
  it("fires at each threshold as scroll progresses", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // 25%: (scrollY + innerHeight) / scrollHeight >= 0.25 => scrollY >= 0
    setScrollProps(2000, 0, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 25,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 50%: scrollY + 500 = 1000 => scrollY = 500
    setScrollProps(2000, 500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 50,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 75%: scrollY + 500 = 1500 => scrollY = 1000
    setScrollProps(2000, 1000, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 75,
      page_path: "/test-page",
    });

    mockTrackEvent.mockClear();

    // 100%: scrollY + 500 = 2000 => scrollY = 1500
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 100,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not re-fire past same threshold", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // Fire 25% threshold twice
    setScrollProps(2000, 0, 500);
    fireScroll();
    fireScroll();

    const calls25 = mockTrackEvent.mock.calls.filter(
      (c) => c[0] === "scroll_depth_reached" && (c[1] as Record<string, unknown>)?.threshold === 25,
    );
    expect(calls25).toHaveLength(1);

    cleanup();
  });

  it("fires all thresholds immediately when page fits in viewport", () => {
    setScrollProps(500, 0, 800);
    const cleanup = setupScrollDepthTracking();

    expect(mockTrackEvent).toHaveBeenCalledTimes(4);
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 25,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 50,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 75,
      page_path: "/test-page",
    });
    expect(mockTrackEvent).toHaveBeenCalledWith("scroll_depth_reached", {
      threshold: 100,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("cleanup removes scroll listener", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();

    // Fire 25%
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    mockTrackEvent.mockClear();

    cleanup();

    // Further scrolls should not fire
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("page_path is included in properties", () => {
    setScrollProps(2000, 0, 500);
    const cleanup = setupScrollDepthTracking();
    fireScroll();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "scroll_depth_reached",
      expect.objectContaining({ page_path: "/test-page" }),
    );

    cleanup();
  });
});

// ============================================================
// setupSectionVisibilityTracking
// ============================================================
describe("setupSectionVisibilityTracking", () => {
  it("fires section_viewed when element intersects at 30%+", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();

    const observer = MockIntersectionObserver.instances[0]!;
    expect(observer.options?.threshold).toBe(0.3);

    observer.triggerIntersection([
      {
        isIntersecting: true,
        target: el,
        intersectionRatio: 0.35,
      },
    ]);

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "section_viewed",
      expect.objectContaining({
        section: "hero",
        page_path: "/test-page",
      }),
    );

    cleanup();
  });

  it("does not re-fire for same section", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([{ isIntersecting: true, target: el, intersectionRatio: 0.35 }]);
    // Second intersection should not fire because element was unobserved
    expect(observer.observed.has(el)).toBe(false);

    cleanup();
  });

  it("time_to_view_ms is a positive number", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "pricing");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([{ isIntersecting: true, target: el, intersectionRatio: 0.5 }]);

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(typeof props.time_to_view_ms).toBe("number");
    expect(props.time_to_view_ms as number).toBeGreaterThanOrEqual(0);

    cleanup();
  });

  it("handles zero [data-section] elements gracefully", () => {
    const cleanup = setupSectionVisibilityTracking();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    // Should not throw
    cleanup();
  });

  it("cleanup disconnects observer", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    cleanup();
    expect(observer.disconnected).toBe(true);
  });

  it("does not fire when isIntersecting is false", () => {
    const el = document.createElement("div");
    el.setAttribute("data-section", "hero");
    document.body.appendChild(el);

    const cleanup = setupSectionVisibilityTracking();
    const observer = MockIntersectionObserver.instances[0]!;

    observer.triggerIntersection([{ isIntersecting: false, target: el, intersectionRatio: 0.1 }]);

    expect(mockTrackEvent).not.toHaveBeenCalled();
    cleanup();
  });
});

// ============================================================
// setupEngagedTimeTracking
// ============================================================
describe("setupEngagedTimeTracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires at 15s milestone when tab is visible", () => {
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(15_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 15,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("pauses counting when tab is hidden", () => {
    const cleanup = setupEngagedTimeTracking();

    // 10s visible
    vi.advanceTimersByTime(10_000);
    expect(mockTrackEvent).not.toHaveBeenCalled();

    // Tab hidden
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 10 more seconds while hidden
    vi.advanceTimersByTime(10_000);
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("resumes and fires correct milestone after tab returns visible", () => {
    const cleanup = setupEngagedTimeTracking();

    // 10s visible
    vi.advanceTimersByTime(10_000);

    // Hide tab
    Object.defineProperty(document, "visibilityState", {
      value: "hidden",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 20s hidden
    vi.advanceTimersByTime(20_000);

    // Show tab again
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      configurable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));

    // 5 more seconds visible => total 15s visible
    vi.advanceTimersByTime(5_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 15,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("stops interval after 300s", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(300_000);

    expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
      milestone_seconds: 300,
      page_path: "/test-page",
    });

    expect(clearIntervalSpy).toHaveBeenCalled();

    cleanup();
    clearIntervalSpy.mockRestore();
  });

  it("cleanup clears interval", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const cleanup = setupEngagedTimeTracking();

    cleanup();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("fires all milestones in sequence", () => {
    const cleanup = setupEngagedTimeTracking();

    vi.advanceTimersByTime(300_000);

    const milestones = [15, 30, 60, 120, 300];
    for (const ms of milestones) {
      expect(mockTrackEvent).toHaveBeenCalledWith("engaged_time_reached", {
        milestone_seconds: ms,
        page_path: "/test-page",
      });
    }

    cleanup();
  });
});

// ============================================================
// setupFaqExpansionTracking
// ============================================================
describe("setupFaqExpansionTracking", () => {
  it("fires on toggle open", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details>
          <summary>What is CRO?</summary>
          <p>Answer here</p>
        </details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).toHaveBeenCalledWith("faq_expanded", {
      faq_id: "faq-0",
      question_index: 0,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does NOT fire on toggle close", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details open>
          <summary>What is CRO?</summary>
          <p>Answer here</p>
        </details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = false;
    details.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("captures correct question text and index", () => {
    document.body.innerHTML = `
      <div data-faq-section>
        <details><summary>First question</summary><p>A</p></details>
        <details><summary>Second question</summary><p>B</p></details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const allDetails = document.querySelectorAll("details");
    allDetails[1]!.open = true;
    allDetails[1]!.dispatchEvent(new Event("toggle"));

    expect(mockTrackEvent).toHaveBeenCalledWith("faq_expanded", {
      faq_id: "faq-1",
      question_index: 1,
      page_path: "/test-page",
    });

    cleanup();
  });

  it("uses explicit FAQ ids when present", () => {
    const longText = "A".repeat(250);
    document.body.innerHTML = `
      <div data-faq-section>
        <details data-faq-id="pricing-risk"><summary>${longText}</summary><p>A</p></details>
      </div>
    `;

    const cleanup = setupFaqExpansionTracking();

    const details = document.querySelector("details")!;
    details.open = true;
    details.dispatchEvent(new Event("toggle"));

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.faq_id).toBe("pricing-risk");
    expect(props.question_text).toBeUndefined();

    cleanup();
  });

  it("handles no [data-faq-section] elements gracefully", () => {
    const cleanup = setupFaqExpansionTracking();
    expect(mockTrackEvent).not.toHaveBeenCalled();
    cleanup(); // should not throw
  });
});

// ============================================================
// setupCtaClickTracking
// ============================================================
describe("setupCtaClickTracking", () => {
  it("fires cta_clicked when clicking a[href^='#']", () => {
    document.body.innerHTML = `
      <div data-section="pricing">
        <a href="#pricing">Go to pricing</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "pricing:cta-0",
      destination_path: "#pricing",
      section: "pricing",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking [data-cta-button]", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <button data-cta-button>Sign up now</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("button")!;
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "hero:cta-0",
      destination_path: "",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking .btn-primary", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a href="/signup" class="btn-primary">Get Started</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("a")!;
    preventNavigation(btn);
    btn.click();

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    const updatedHref = new URL(btn.getAttribute("href") ?? "", "https://grantpipe.test");
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("footer");
    expect(props).toEqual({
      cta_id: "footer:cta-0",
      destination_path: "/signup",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking .gp-mkt-btn marketing CTAs", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a
          href="https://app.grantpipe.com/signup?plan=growth"
          class="gp-mkt-btn primary lg"
          data-cta-page-family="home"
          data-cta-buyer-stage="bofu"
          data-cta-placement="hero-primary"
          data-cta-intent="start-trial"
        >
          Start trial
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("a")!;
    preventNavigation(btn);
    btn.click();

    const updatedHref = new URL(btn.href);
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("hero");
    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "hero:cta-0",
      destination_path: "/signup",
      section: "hero",
      page_path: "/test-page",
      page_family: "home",
      buyer_stage: "bofu",
      placement: "hero-primary",
      intent: "start-trial",
    });

    cleanup();
  });

  it("tracks .gp-mkt-btn[data-cta-button] once with a stable generated id", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a href="/signup" class="gp-mkt-btn primary" data-cta-button>
          Start trial
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("a")!;
    preventNavigation(btn);
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledTimes(1);
    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "hero:cta-0",
      destination_path: "/signup",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("keeps legacy CTA ids stable when .gp-mkt-btn appears before .btn-primary", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a href="/signup" class="gp-mkt-btn primary">Start trial</a>
      </div>
      <div data-section="footer">
        <a href="/signup" class="btn-primary">Get Started</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const footerBtn = document.querySelectorAll("a")[1]!;
    preventNavigation(footerBtn);
    footerBtn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "footer:cta-0",
      destination_path: "/signup",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("fires cta_clicked when clicking .btn-secondary", () => {
    document.body.innerHTML = `
      <div>
        <button class="btn-secondary">Learn more</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const btn = document.querySelector("button")!;
    btn.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "unknown:cta-0",
      destination_path: "",
      section: "unknown",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("includes correct destination path, CTA id, and section", () => {
    document.body.innerHTML = `
      <div data-section="cta-banner">
        <a href="#demo" data-cta-button>Book a demo</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("a")!.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "cta-banner:cta-0",
      destination_path: "#demo",
      section: "cta-banner",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("includes shared CTA analytics context when present", () => {
    document.body.innerHTML = `
      <div data-section="decision-cta-card">
        <a
          href="/compare/vendors"
          data-cta-button
          data-cta-page-family="comparison"
          data-cta-buyer-stage="mofu"
          data-cta-placement="mid-article-routing"
          data-cta-intent="evaluate"
          data-cta-target="/compare/vendors"
        >
          Compare vendors
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "decision-cta-card:cta-0",
      destination_path: "/compare/vendors",
      section: "decision-cta-card",
      page_path: "/test-page",
      page_family: "comparison",
      buyer_stage: "mofu",
      placement: "mid-article-routing",
      intent: "evaluate",
    });

    cleanup();
  });

  it("adds CTA journey parameters to app signup links before navigation", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a
          href="https://app.grantpipe.com/signup?plan=growth"
          data-cta-button
          data-cta-page-family="home"
          data-cta-buyer-stage="bofu"
          data-cta-placement="hero-primary"
          data-cta-intent="start-trial"
        >
          Start trial
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    const updatedHref = new URL(link.href);
    expect(updatedHref.searchParams.get("plan")).toBe("growth");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("hero");
    expect(updatedHref.searchParams.get("cta_page_family")).toBe("home");
    expect(updatedHref.searchParams.get("cta_buyer_stage")).toBe("bofu");
    expect(updatedHref.searchParams.get("cta_placement")).toBe("hero-primary");
    expect(updatedHref.searchParams.get("cta_intent")).toBe("start-trial");
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "cta_clicked",
      expect.objectContaining({
        cta_id: "hero:cta-0",
        destination_path: "/signup",
        page_path: "/test-page",
        section: "hero",
        page_family: "home",
        buyer_stage: "bofu",
        placement: "hero-primary",
        intent: "start-trial",
      }),
    );

    cleanup();
  });

  it("adds CTA journey parameters to signup hrefs during setup before click", () => {
    document.body.innerHTML = `
      <div data-section="pricing-card">
        <a
          href="/signup?plan=starter"
          data-cta-button
          data-cta-page-family="pricing"
          data-cta-buyer-stage="bofu"
          data-cta-placement="starter-card"
          data-cta-intent="choose-plan"
        >
          Choose Starter
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    const updatedHref = new URL(link.getAttribute("href") ?? "", "https://grantpipe.test");
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("plan")).toBe("starter");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("pricing-card");
    expect(updatedHref.searchParams.get("cta_page_family")).toBe("pricing");
    expect(updatedHref.searchParams.get("cta_buyer_stage")).toBe("bofu");
    expect(updatedHref.searchParams.get("cta_placement")).toBe("starter-card");
    expect(updatedHref.searchParams.get("cta_intent")).toBe("choose-plan");
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("uses window.location.origin when enriching relative signup links", () => {
    Object.defineProperty(window, "location", {
      value: { pathname: "/pricing", origin: "https://grantpipe.com" },
      configurable: true,
      writable: true,
    });

    document.body.innerHTML = `
      <div data-section="pricing-card">
        <a href="/signup" data-cta-button>Choose Starter</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    const updatedHref = new URL(link.getAttribute("href") ?? "", "https://grantpipe.com");
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/pricing");
    expect(updatedHref.searchParams.get("source_section")).toBe("pricing-card");
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("keeps malformed CTA hrefs unchanged", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a href="http://[bad" data-cta-button>Broken CTA</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("http://[bad");

    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "footer:cta-0",
      destination_path: "invalid",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("buckets non-http CTA href schemes without emitting addresses", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a href="mailto:support@grantpipe.com" data-cta-button>Email support</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "footer:cta-0",
      destination_path: "non_http",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not enrich ordinary signup links that are not CTAs", () => {
    document.body.innerHTML = `<a href="/signup">Plain signup link</a>`;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("/signup");
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("enriches dynamically inserted signup CTAs before click", async () => {
    document.body.innerHTML = `<div data-section="dynamic"></div>`;

    const cleanup = setupCtaClickTracking();

    const container = document.querySelector("[data-section='dynamic']")!;
    container.innerHTML = `
      <a href="/signup?plan=growth" data-cta-button data-cta-placement="dynamic-card">
        Start trial
      </a>
    `;

    await Promise.resolve();

    const link = document.querySelector("a")!;
    const updatedHref = new URL(link.getAttribute("href") ?? "", "https://grantpipe.test");
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("plan")).toBe("growth");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("dynamic");
    expect(updatedHref.searchParams.get("cta_placement")).toBe("dynamic-card");
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("enriches signup CTAs when href attributes change after setup", async () => {
    document.body.innerHTML = `
      <div data-section="pricing-card">
        <a href="/pricing" data-cta-button data-cta-intent="choose-plan">
          Choose plan
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    const link = document.querySelector("a")!;
    link.setAttribute("href", "/signup?plan=audit-ready");

    await Promise.resolve();

    const updatedHref = new URL(link.getAttribute("href") ?? "", "https://grantpipe.test");
    expect(updatedHref.pathname).toBe("/signup");
    expect(updatedHref.searchParams.get("plan")).toBe("audit-ready");
    expect(updatedHref.searchParams.get("landing_page")).toBe("/test-page");
    expect(updatedHref.searchParams.get("source_section")).toBe("pricing-card");
    expect(updatedHref.searchParams.get("cta_intent")).toBe("choose-plan");

    cleanup();
  });

  it("tracks CTA anchors without hrefs", () => {
    document.body.innerHTML = `
      <div data-section="footer">
        <a data-cta-button>Contact sales</a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("a")!.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "footer:cta-0",
      destination_path: "",
      section: "footer",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not emit raw button text", () => {
    const longText = "B".repeat(150);
    document.body.innerHTML = `
      <div>
        <button data-cta-button>${longText}</button>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("button")!.click();

    const props = mockTrackEvent.mock.calls[0]![1] as Record<string, unknown>;
    expect(props.button_text).toBeUndefined();
    expect(props.cta_id).toBe("unknown:cta-0");

    cleanup();
  });

  it("cleanup removes click listener", () => {
    document.body.innerHTML = `<a href="#test" data-cta-button>Click</a>`;

    const cleanup = setupCtaClickTracking();
    cleanup();

    document.querySelector("a")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();
  });

  it("walks up to 3 ancestor levels to find a matching element", () => {
    document.body.innerHTML = `
      <div data-section="hero">
        <a href="#pricing" class="btn-primary">
          <span><strong>Click here</strong></span>
        </a>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    // Click the <strong> which is 2 levels deep inside the <a>
    const strong = document.querySelector("strong")!;
    strong.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("cta_clicked", {
      cta_id: "hero:cta-0",
      destination_path: "#pricing",
      section: "hero",
      page_path: "/test-page",
    });

    cleanup();
  });

  it("does not fire for non-CTA elements", () => {
    document.body.innerHTML = `<p>Just a paragraph</p>`;

    const cleanup = setupCtaClickTracking();

    document.querySelector("p")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("stops searching after three ancestor levels for non-CTA trees", () => {
    document.body.innerHTML = `
      <div>
        <div>
          <div>
            <div>
              <span>Deep text</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const cleanup = setupCtaClickTracking();

    document.querySelector("span")!.click();
    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("does not re-write an already-enriched signup href when the mutation observer fires", () => {
    // Regression guard for the MutationObserver feedback loop: the observer
    // watches `href`, and enrichment writes `href`. If enrichment always calls
    // setAttribute (even with an identical value), each write schedules another
    // mutation record, which refires the observer, which writes again — an
    // unbounded loop that freezes the page's main thread in the browser.
    let observerCallback: MutationCallback | null = null;
    const realMutationObserver = globalThis.MutationObserver;

    class CapturingMutationObserver {
      constructor(callback: MutationCallback) {
        observerCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] {
        return [];
      }
    }

    globalThis.MutationObserver = CapturingMutationObserver as unknown as typeof MutationObserver;

    try {
      document.body.innerHTML = `
        <div data-section="hero">
          <a href="https://app.grantpipe.com/signup?plan=growth" class="gp-mkt-btn primary">
            Start trial
          </a>
        </div>
      `;

      const cleanup = setupCtaClickTracking();

      // Initial enrichment runs once on setup and writes the attributed href.
      const link = document.querySelector("a")!;
      const enrichedHref = link.getAttribute("href");
      expect(new URL(enrichedHref ?? "").searchParams.get("landing_page")).toBe("/test-page");

      // Now simulate the observer firing (as it would after the initial write).
      // Enrichment is idempotent, so the href value will not change — and the
      // code MUST NOT call setAttribute again, otherwise the real observer
      // would refire forever.
      const setAttributeSpy = vi.spyOn(link, "setAttribute");
      expect(observerCallback).not.toBeNull();
      observerCallback!([], {} as MutationObserver);
      observerCallback!([], {} as MutationObserver);

      const hrefWrites = setAttributeSpy.mock.calls.filter(([name]) => name === "href");
      expect(hrefWrites).toHaveLength(0);
      expect(link.getAttribute("href")).toBe(enrichedHref);

      cleanup();
    } finally {
      globalThis.MutationObserver = realMutationObserver;
    }
  });
});

// ============================================================
// setupNavigationClickTracking
// ============================================================
describe("setupNavigationClickTracking", () => {
  it("tracks desktop header nav clicks with safe destination paths", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="/resources?token=secret">Resources</a>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("site_nav_link_clicked", {
      nav_area: "header",
      nav_item_id: "nav-0",
      destination_path: "/resources",
      page_path: "/test-page",
      link_position: 0,
    });

    cleanup();
  });

  it("finds navigation links from nested clicked elements", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="/pricing"><span><strong>Pricing</strong></span></a>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();

    const nested = document.querySelector("strong")!;
    preventNavigation(document.querySelector("a")!);
    nested.click();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "site_nav_link_clicked",
      expect.objectContaining({
        nav_item_id: "nav-0",
        destination_path: "/pricing",
      }),
    );

    cleanup();
  });

  it("does not track ordinary links outside the site nav", () => {
    document.body.innerHTML = `<a href="/pricing">Pricing</a>`;

    const cleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).not.toHaveBeenCalled();

    cleanup();
  });

  it("falls back to stripping query strings when nav href parsing fails", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="/broken">Broken</a>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    Object.defineProperty(link, "href", {
      value: "http://[bad?token=secret",
      configurable: true,
    });
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "site_nav_link_clicked",
      expect.objectContaining({
        destination_path: "invalid",
      }),
    );

    cleanup();
  });

  it("buckets non-http navigation href schemes without emitting addresses", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="mailto:support@grantpipe.com">Email support</a>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "site_nav_link_clicked",
      expect.objectContaining({
        destination_path: "non_http",
      }),
    );

    cleanup();
  });

  it("works when MutationObserver is unavailable during combined CRO setup", () => {
    Object.defineProperty(window, "MutationObserver", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="/resources">Resources</a>
      </nav>
    `;

    const cleanup = setupCtaClickTracking();
    const navCleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith(
      "site_nav_link_clicked",
      expect.objectContaining({ destination_path: "/resources" }),
    );

    cleanup();
    navCleanup();
  });

  it("tracks megamenu link clicks with their group label", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <div data-site-nav-group="compare">
          <section>
            <p>Compare</p>
            <a href="/alternatives/blackbaud" data-nav-item-id="blackbaud-alternatives">
              Blackbaud alternatives
            </a>
          </section>
        </div>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("site_nav_link_clicked", {
      nav_area: "header_megamenu",
      nav_group_id: "compare",
      nav_item_id: "blackbaud-alternatives",
      destination_path: "/alternatives/blackbaud",
      page_path: "/test-page",
      link_position: 0,
    });

    cleanup();
  });

  it("removes the navigation click listener during cleanup", () => {
    document.body.innerHTML = `
      <nav data-site-nav aria-label="Main navigation">
        <a href="/pricing">Pricing</a>
      </nav>
    `;

    const cleanup = setupNavigationClickTracking();
    cleanup();

    const link = document.querySelector("a")!;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});

// ============================================================
// setupResourceCardClickTracking
// ============================================================
describe("setupResourceCardClickTracking", () => {
  it("fires resource_card_clicked with stable non-PII card properties", () => {
    document.body.innerHTML = `
      <main>
        <a
          href="/guides/grant-compliance"
          data-resource-card
          data-resource-card-id="grant-compliance"
          data-resource-card-family="guide"
          data-resource-card-stage="mofu"
          data-resource-card-featured="true"
        >
          Grant compliance guide
        </a>
      </main>
    `;
    const link = document.querySelector("[data-resource-card]") as HTMLAnchorElement;
    preventNavigation(link);

    const cleanup = setupResourceCardClickTracking();
    link.click();

    expect(mockTrackEvent).toHaveBeenCalledWith("resource_card_clicked", {
      resource_card_id: "grant-compliance",
      page_family: "guide",
      buyer_stage: "mofu",
      featured: true,
      destination_path: "/guides/grant-compliance",
      page_path: "/test-page",
      card_position: 0,
    });

    cleanup();
  });

  it("does not send content card text when a resource card is clicked", () => {
    document.body.innerHTML = `
      <main>
        <a href="/resources/private" data-resource-card>
          Private Funder Named In Title
        </a>
      </main>
    `;
    const link = document.querySelector("[data-resource-card]") as HTMLAnchorElement;
    preventNavigation(link);

    const cleanup = setupResourceCardClickTracking();
    link.click();

    expect(JSON.stringify(mockTrackEvent.mock.calls)).not.toContain(
      "Private Funder Named In Title",
    );

    cleanup();
  });

  it("removes the resource card click listener during cleanup", () => {
    document.body.innerHTML = `
      <main>
        <a href="/resources/private" data-resource-card>Private card</a>
      </main>
    `;

    const cleanup = setupResourceCardClickTracking();
    cleanup();

    const link = document.querySelector("[data-resource-card]") as HTMLAnchorElement;
    preventNavigation(link);
    link.click();

    expect(mockTrackEvent).not.toHaveBeenCalled();
  });
});

// ============================================================
// initCroTracking
// ============================================================
describe("initCroTracking", () => {
  it("calls all six setup functions", () => {
    setScrollProps(2000, 0, 500);

    // We test by checking that events can be triggered for each tracker
    initCroTracking();

    // Scroll depth should be set up
    setScrollProps(2000, 1500, 500);
    fireScroll();
    expect(mockTrackEvent).toHaveBeenCalledWith(
      "scroll_depth_reached",
      expect.objectContaining({ threshold: 100 }),
    );
  });
});
