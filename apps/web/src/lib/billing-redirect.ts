const ALLOWED_BILLING_HOSTS = ["checkout.stripe.com", "billing.stripe.com"];

export function isAllowedBillingUrl(url: string): boolean {
  try {
    const baseOrigin = window.location.origin;
    const parsed = new URL(url, baseOrigin);
    const isSameOrigin = parsed.origin === baseOrigin;
    const isAllowedStripeHost =
      parsed.protocol === "https:" && ALLOWED_BILLING_HOSTS.includes(parsed.hostname);

    return isSameOrigin || isAllowedStripeHost;
  } catch {
    return false;
  }
}
