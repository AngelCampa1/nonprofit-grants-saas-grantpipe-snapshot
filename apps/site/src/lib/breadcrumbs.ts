import type { BreadcrumbItem } from "@grantpipe/ui/site";
import { buildVersusComparisonLabel } from "./page-helpers";

export function buildAlternativeBreadcrumbs(
  competitorName: string,
  competitorSlug: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare" },
    { label: "Alternatives", href: "/compare/alternatives" },
    {
      label: `${competitorName} Alternative`,
      href: `/compare/alternatives/${competitorSlug}`,
    },
  ];
}

export function buildVersusBreadcrumbs(
  competitorA: { slug: string; name: string },
  competitorB: { slug: string; name: string },
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare" },
    { label: "Head-to-Head", href: "/compare/versus" },
    {
      label: buildVersusComparisonLabel(competitorA, competitorB),
      href: canonicalPath,
    },
  ];
}

export function buildPricingBreadcrumbs(
  competitorName: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Compare", href: "/compare" },
    { label: "Pricing", href: "/compare/pricing" },
    { label: `${competitorName} Pricing`, href: canonicalPath },
  ];
}

export function buildGuideBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources" },
    { label: "Guides", href: "/resources/guides" },
    { label: title, href: canonicalPath },
  ];
}

export function buildListicleBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources" },
    { label: "Software Roundups", href: "/resources/best" },
    { label: title, href: canonicalPath },
  ];
}

export function buildStateBreadcrumbs(state: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Nonprofit Software", href: "/nonprofit-software" },
    { label: state, href: canonicalPath },
  ];
}

export function buildCityBreadcrumbs(
  city: string,
  state: string,
  stateSlug: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Nonprofit Software", href: "/nonprofit-software" },
    { label: state, href: `/nonprofit-software/${stateSlug}` },
    { label: city, href: canonicalPath },
  ];
}

export function buildVerticalBreadcrumbs(
  verticalType: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Solutions", href: "/solutions" },
    { label: verticalType, href: canonicalPath },
  ];
}

export function buildPersonaBreadcrumbs(role: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "For", href: "/for" },
    { label: role, href: canonicalPath },
  ];
}

export function buildWorkflowBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Workflows", href: "/workflows" },
    { label: title, href: canonicalPath },
  ];
}

export function buildGlossaryBreadcrumbs(term: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Glossary", href: "/glossary" },
    { label: term, href: canonicalPath },
  ];
}

export function buildFeatureBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Features", href: "/features" },
    { label: title, href: canonicalPath },
  ];
}

export function buildIntegrationBreadcrumbs(
  title: string,
  canonicalPath: string,
): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Integrations", href: "/integrations" },
    { label: title, href: canonicalPath },
  ];
}

export function buildFaqHubBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources" },
    { label: "FAQ", href: "/resources/faq" },
    { label: title, href: canonicalPath },
  ];
}

export function buildBenchmarkBreadcrumbs(title: string, canonicalPath: string): BreadcrumbItem[] {
  return [
    { label: "Home", href: "/" },
    { label: "Resources", href: "/resources" },
    { label: "Benchmarks", href: "/resources/benchmarks" },
    { label: title, href: canonicalPath },
  ];
}
