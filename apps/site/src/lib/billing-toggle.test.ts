import { describe, expect, it, vi } from "vitest";

import { activateBillingPeriod, initBillingToggle } from "./billing-toggle";

type Listener = (event: KeyboardEvent) => void;

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(name: string, force?: boolean) {
    if (force) {
      this.values.add(name);
      return true;
    }
    this.values.delete(name);
    return false;
  }

  contains(name: string) {
    return this.values.has(name);
  }
}

class FakeElement {
  readonly dataset: Record<string, string | undefined> = {};
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  readonly listeners: Record<string, Listener[]> = {};
  readonly attributes: Record<string, string> = {};
  hidden = false;
  href = "";
  tabIndex = -1;
  focused = false;

  constructor(dataset: Record<string, string | undefined> = {}) {
    Object.assign(this.dataset, dataset);
  }

  append(...children: FakeElement[]) {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    if (name === "data-billing-toggle-page") {
      return this.dataset.billingTogglePage ?? null;
    }
    return this.attributes[name] ?? null;
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  click() {
    for (const listener of this.listeners.click ?? []) {
      listener({ key: "", preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
  }

  keydown(key: string) {
    for (const listener of this.listeners.keydown ?? []) {
      listener({ key, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
  }

  focus() {
    this.focused = true;
  }

  querySelector<T extends Element>(selector: string): T | null {
    return (this.querySelectorAll(selector)[0] ?? null) as T | null;
  }

  querySelectorAll<T extends Element>(selector: string): T[] {
    const matches: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      if (node.matches(selector)) {
        matches.push(node);
      }
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches as unknown as T[];
  }

  private matches(selector: string) {
    switch (selector) {
      case "[data-billing-controller]":
        return this.dataset.billingController !== undefined;
      case "[data-billing-btn]":
        return this.dataset.billingBtn !== undefined;
      case "[data-billing-toggle-page]":
        return this.dataset.billingTogglePage !== undefined;
      case "[data-show]":
        return this.dataset.show !== undefined;
      case "[data-annual-href][data-monthly-href]":
        return this.dataset.annualHref !== undefined && this.dataset.monthlyHref !== undefined;
      default:
        return false;
    }
  }
}

function createBillingFixture() {
  const root = new FakeElement();
  const controller = new FakeElement({ billingController: "annual" });
  const toggle = new FakeElement({ billingTogglePage: "/pricing/" });
  const annualButton = new FakeElement({ billingBtn: "annual" });
  const monthlyButton = new FakeElement({ billingBtn: "monthly" });
  const annualPanel = new FakeElement({ show: "annual" });
  const monthlyPanel = new FakeElement({ show: "monthly" });
  const cta = new FakeElement({
    annualHref: "https://app.grantpipe.com/signup?plan=growth&cycle=annual",
    monthlyHref: "https://app.grantpipe.com/signup?plan=growth&cycle=monthly",
    ctaTarget: "https://app.grantpipe.com/signup?plan=growth&cycle=annual",
  });

  annualButton.tabIndex = 0;
  annualButton.setAttribute("aria-checked", "true");
  monthlyButton.setAttribute("aria-checked", "false");
  cta.href = cta.dataset.annualHref ?? "";
  controller.append(annualPanel, monthlyPanel, cta);
  root.append(controller, toggle, annualButton, monthlyButton);

  return { root, controller, annualButton, monthlyButton, annualPanel, monthlyPanel, cta };
}

describe("billing toggle behavior", () => {
  it("does nothing when the billing controller is missing", () => {
    const root = new FakeElement();
    const track = vi.fn();

    expect(() =>
      activateBillingPeriod(root as unknown as ParentNode, "monthly", "/pricing/", track),
    ).not.toThrow();
    expect(track).not.toHaveBeenCalled();
  });

  it("updates price state, links, aria state, roving tabindex, and tracking", () => {
    const { root, controller, annualButton, monthlyButton, annualPanel, monthlyPanel, cta } =
      createBillingFixture();
    const track = vi.fn();

    activateBillingPeriod(root as unknown as ParentNode, "monthly", "/pricing/", track);

    expect(controller.dataset.billingController).toBe("monthly");
    expect(annualPanel.hidden).toBe(true);
    expect(monthlyPanel.hidden).toBe(false);
    expect(annualButton.getAttribute("aria-checked")).toBe("false");
    expect(monthlyButton.getAttribute("aria-checked")).toBe("true");
    expect(annualButton.tabIndex).toBe(-1);
    expect(monthlyButton.tabIndex).toBe(0);
    expect(monthlyButton.classList.contains("gp-billing-toggle__btn--active")).toBe(true);
    expect(cta.href).toBe("https://app.grantpipe.com/signup?plan=growth&cycle=monthly");
    expect(cta.dataset.ctaTarget).toBe(
      "https://app.grantpipe.com/signup?plan=growth&cycle=monthly",
    );
    expect(track).toHaveBeenCalledWith("monthly", "/pricing/");
  });

  it("wires click and arrow-key interactions", () => {
    const { root, controller, annualButton, monthlyButton } = createBillingFixture();

    initBillingToggle(root as unknown as ParentNode);
    monthlyButton.click();

    expect(controller.dataset.billingController).toBe("monthly");

    monthlyButton.keydown("ArrowLeft");

    expect(controller.dataset.billingController).toBe("annual");
    expect(annualButton.focused).toBe(true);
  });

  it("ignores unrelated keys and invalid billing targets", () => {
    const { root, controller, annualButton, monthlyButton } = createBillingFixture();

    initBillingToggle(root as unknown as ParentNode);
    annualButton.keydown("Tab");

    expect(controller.dataset.billingController).toBe("annual");

    monthlyButton.dataset.billingBtn = "weekly";
    annualButton.keydown("ArrowRight");

    expect(controller.dataset.billingController).toBe("annual");
  });
});
