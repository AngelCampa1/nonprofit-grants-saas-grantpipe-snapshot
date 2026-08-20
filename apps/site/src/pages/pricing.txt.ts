import type { APIContext } from "astro";
import { siteConfig } from "@/config/site";
import { buildPricingTxt } from "@/lib/pricing-txt";

export const prerender = true;

export async function GET(_context: APIContext) {
  return new Response(buildPricingTxt(siteConfig), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
