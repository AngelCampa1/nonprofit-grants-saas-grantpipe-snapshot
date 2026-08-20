export const ALLOWED_CITATION_HOSTS = [
  "candid.org",
  "irs.gov",
  "urban.org",
  "nccs.urban.org",
  "independentsector.org",
  "givingusa.org",
  "philanthropy.iupui.edu",
  "cof.org",
  "grants.gov",
  "sam.gov",
  "usaspending.gov",
  "ecfr.gov",
  "fasb.org",
  "whitehouse.gov",
  "bls.gov",
  "census.gov",
  "harvester.census.gov",
  "facdissem.census.gov",
  "gao.gov",
  "aicpa-cima.com",
  "aicpa.org",
  "nff.org",
  "councilofnonprofits.org",
  "afpglobal.org",
  "nonprofitleadershipalliance.org",
  "boardsource.org",
  "guidestar.org",
  "fundraisingreport.org",
  "cep.org",
  "stanford.edu",
  "nonprofitfinancefund.org",
  "ofm.wa.gov",
  "treasury.gov",
  "federalregister.gov",
  "oig.hhs.gov",
  "omaticsoftware.com",
  "virtuous.org",
  "grantstation.com",
  "fiftyandfifty.org",
  "salesforce.com",
  "blackbaud.com",
  "sageintacct.com",
  "sage.com",
  "gartner.com",
  "forrester.com",
  "mckinsey.com",
  "bridgespan.org",
] as const;

export type AllowedCitationHost = (typeof ALLOWED_CITATION_HOSTS)[number];

export function isAllowedCitationHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ALLOWED_CITATION_HOSTS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}
