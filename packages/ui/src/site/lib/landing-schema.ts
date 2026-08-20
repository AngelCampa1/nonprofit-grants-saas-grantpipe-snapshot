import type { SiteConfig } from "../types";

interface LandingSchemaInput {
  canonicalUrl: string;
  imageUrl: string;
  offersUrl?: string;
}

export function buildLandingSoftwareApplicationProps(
  config: SiteConfig,
  { canonicalUrl, imageUrl, offersUrl }: LandingSchemaInput,
): {
  name: string;
  description: string;
  url: string;
  image: string;
  brand: { name: string };
  featureList?: string[];
  applicationCategory: "BusinessApplication";
  operatingSystem: "Web";
  offers: { price: string; url: string };
} {
  return {
    name: config.name,
    description: config.tagline,
    url: canonicalUrl,
    image: imageUrl,
    brand: { name: config.name },
    featureList: config.pricingTiers?.[0]?.features,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers:
      config.pricingTiers && config.pricingTiers.length > 0
        ? {
            price: config.pricingTiers[0].price,
            url: offersUrl ?? `${canonicalUrl}#pricing`,
          }
        : {
            price: config.product.price,
            url: offersUrl ?? `${canonicalUrl}#pricing`,
          },
  };
}
