import { trackBillingToggle } from "@grantpipe/ui/site/lib/billing-toggle-tracker";

export type BillingPeriod = "annual" | "monthly";

const billingPeriods = new Set<BillingPeriod>(["annual", "monthly"]);

export function isBillingPeriod(value: string | undefined): value is BillingPeriod {
  return value === "annual" || value === "monthly";
}

export function activateBillingPeriod(
  root: ParentNode,
  period: BillingPeriod,
  page: string,
  track: (period: BillingPeriod, page: string) => void = trackBillingToggle,
) {
  const controller = root.querySelector<HTMLElement>("[data-billing-controller]");
  if (!controller) {
    return;
  }

  controller.dataset.billingController = period;

  root.querySelectorAll<HTMLButtonElement>("[data-billing-btn]").forEach((button) => {
    const active = button.dataset.billingBtn === period;
    button.setAttribute("aria-checked", String(active));
    button.classList.toggle("gp-billing-toggle__btn--active", active);
    button.tabIndex = active ? 0 : -1;
  });

  controller.querySelectorAll<HTMLElement>("[data-show]").forEach((panel) => {
    panel.hidden = panel.dataset.show !== period;
  });

  controller
    .querySelectorAll<HTMLAnchorElement>("[data-annual-href][data-monthly-href]")
    .forEach((cta) => {
      const href = period === "annual" ? cta.dataset.annualHref : cta.dataset.monthlyHref;
      if (href) {
        cta.href = href;
        cta.dataset.ctaTarget = href;
      }
    });

  track(period, page);
}

export function initBillingToggle(root: ParentNode = document) {
  const toggle = root.querySelector<HTMLElement>("[data-billing-toggle-page]");
  if (!toggle || toggle.dataset.billingToggleBound === "true") {
    return;
  }
  toggle.dataset.billingToggleBound = "true";

  const btns = Array.from(root.querySelectorAll<HTMLButtonElement>("[data-billing-btn]"));
  const page = toggle.getAttribute("data-billing-toggle-page") ?? "/";

  function handleBillingKeydown(event: KeyboardEvent) {
    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "ArrowUp" &&
      event.key !== "ArrowDown"
    ) {
      return;
    }

    event.preventDefault();
    const currentIndex = btns.findIndex((button) => button.tabIndex === 0);
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (currentIndex + 1) % btns.length
        : (currentIndex - 1 + btns.length) % btns.length;
    const next = btns[nextIndex];
    if (!next || !billingPeriods.has(next.dataset.billingBtn as BillingPeriod)) {
      return;
    }

    activateBillingPeriod(root, next.dataset.billingBtn as BillingPeriod, page);
    next.focus();
  }

  btns.forEach((button) => {
    button.addEventListener("click", () => {
      if (isBillingPeriod(button.dataset.billingBtn)) {
        activateBillingPeriod(root, button.dataset.billingBtn, page);
      }
    });
    button.addEventListener("keydown", handleBillingKeydown);
  });
}
