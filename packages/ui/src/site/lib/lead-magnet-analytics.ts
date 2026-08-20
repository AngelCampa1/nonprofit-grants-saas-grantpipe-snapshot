import { trackEvent } from "./analytics";

type LeadMagnetDeliverySuppressedSource = "gated_content" | "lead_magnet_inline" | "exit_popup";

interface LeadMagnetDeliverySuppressedProperties {
  source: LeadMagnetDeliverySuppressedSource;
  sourcePage: string;
  magnetSlug?: string;
}

export function trackLeadMagnetDeliverySuppressed({
  source,
  sourcePage,
  magnetSlug,
}: LeadMagnetDeliverySuppressedProperties): void {
  trackEvent("lead_magnet_delivery_suppressed", {
    source,
    source_page: sourcePage,
    ...(magnetSlug ? { magnet_slug: magnetSlug } : {}),
    delivery_context: "initial_submit",
  });
}
