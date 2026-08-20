import type { SiteConfig } from "@grantpipe/ui/site";
import { getMarketedCapabilities } from "./marketed-capabilities";

interface HomepageProofPoint {
  label: string;
  value: string;
  detail: string;
}

interface HomepageProductProof {
  title: string;
  body: string;
}

interface HomepageEditorialSection {
  title: string;
  body: string;
}

interface HomepageResourceLink {
  title: string;
  href: string;
  description: string;
}

interface GrantPipeHomepageContent {
  intro: string;
  proofPoints: HomepageProofPoint[];
  productProof: HomepageProductProof[];
  editorialSections: HomepageEditorialSection[];
  resourceLinks: HomepageResourceLink[];
}

function formatStartingPrice(config: SiteConfig): string {
  const firstTier = config.pricingTiers?.[0];
  const rawPrice = firstTier?.price ?? config.product.price;
  return rawPrice.replace("/mo", "/month");
}

export function buildGrantPipeHomepageContent(config: SiteConfig): GrantPipeHomepageContent {
  const capabilities = getMarketedCapabilities();
  const startingPrice = formatStartingPrice(config);

  return {
    intro:
      "GrantPipe gives grant-funded nonprofits the same answer for funders, the board, audit prep, and finance review without rebuilding it across disconnected tools.",
    proofPoints: [
      {
        label: "What breaks",
        value: "Answers split across tools",
        detail:
          "The donor CRM, grant tracker, restricted-fund spreadsheet, accounting file, and shared drive all tell part of the story. Reporting week turns into reconciliation instead of review.",
      },
      {
        label: "How GrantPipe fixes it",
        value: "One connected record",
        detail:
          "Donor context, Grants.gov and non-federal opportunities, grant deadlines, supporting documents, restricted funds, ledger activity, and report outputs stay connected to the same record.",
      },
      {
        label: "Who it is for",
        value: "Grant-funded teams",
        detail:
          "GrantPipe is for nonprofit finance, development, grants, and leadership teams that need one shared view without a dedicated system admin or consultant project.",
      },
      {
        label: "What teams can test",
        value: "Real workflow fit",
        detail: `Teams can test Grants.gov search, non-federal opportunity tracking, donor and grant records, deadlines, restricted-fund visibility, reporting output, and source-backed AI intake starting at ${startingPrice}.`,
      },
    ],
    productProof: capabilities.map((section) => ({
      title: section.title,
      body: section.supportText,
    })),
    editorialSections: [
      {
        title: "What GrantPipe solves",
        body: "GrantPipe solves the recurring moment when the team has to answer a funder, board, auditor, or finance question and the answer is scattered across a CRM, grant spreadsheet, accounting export, and shared drive.",
      },
      {
        title: "How the workflow stays connected",
        body: "The product keeps donor history, Grants.gov search, non-federal opportunity tracking, award work, deadlines, documents, restricted funds, ledger activity, and reports close enough that staff can review the same story instead of translating between tools.",
      },
      {
        title: "Who should evaluate it",
        body: "GrantPipe is built for grant-funded nonprofits where finance, development, grants, and leadership all touch the same reporting cycle and need software the existing team can operate.",
      },
    ],
    resourceLinks: [
      {
        title: "Explore the full product overview",
        href: "/product",
        description:
          "See how donor records, grant work, deadlines, funds, and reports stay connected.",
      },
      {
        title: "See pricing through the product lens",
        href: "/pricing",
        description:
          "Match each tier to the amount of reporting, deadline, and audit pressure your team carries.",
      },
      {
        title: "Read the evaluation guides",
        href: "/resources",
        description:
          "Compare grant, compliance, and restricted-fund workflows before moving live data.",
      },
    ],
  };
}
