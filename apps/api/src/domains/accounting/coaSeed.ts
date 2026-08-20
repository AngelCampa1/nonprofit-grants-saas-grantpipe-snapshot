import type {
  AccountFunctionalClass,
  AccountNaturalRestriction,
  AccountType,
} from "@grantpipe/shared";

export type CoaSeedEntry = {
  code: string;
  name: string;
  type: AccountType;
  subtype?: string;
  naturalRestriction?: AccountNaturalRestriction;
  functionalClass?: AccountFunctionalClass;
  parentCode?: string;
};

export function getNonprofitCoaSeed(): CoaSeedEntry[] {
  return [
    // Assets
    { code: "1000", name: "Cash and Cash Equivalents", type: "asset", subtype: "current_asset" },
    {
      code: "1010",
      name: "Checking Account",
      type: "asset",
      subtype: "current_asset",
      parentCode: "1000",
    },
    {
      code: "1020",
      name: "Savings Account",
      type: "asset",
      subtype: "current_asset",
      parentCode: "1000",
    },
    { code: "1100", name: "Pledges Receivable", type: "asset", subtype: "current_asset" },
    {
      code: "1150",
      name: "Discount on Pledges Receivable",
      type: "asset",
      subtype: "contra_asset",
      parentCode: "1100",
    },
    {
      code: "1190",
      name: "Allowance for Uncollectible Pledges",
      type: "asset",
      subtype: "contra_asset",
      parentCode: "1100",
    },
    { code: "1200", name: "Prepaid Expenses", type: "asset", subtype: "current_asset" },
    { code: "1500", name: "Fixed Assets", type: "asset", subtype: "fixed_asset" },
    // Liabilities
    { code: "2000", name: "Accounts Payable", type: "liability", subtype: "current_liability" },
    { code: "2100", name: "Deferred Revenue", type: "liability", subtype: "current_liability" },
    { code: "2200", name: "Accrued Expenses", type: "liability", subtype: "current_liability" },
    // Net Assets
    {
      code: "3000",
      name: "Net Assets Without Donor Restrictions",
      type: "net_assets",
      naturalRestriction: "unrestricted",
    },
    {
      code: "3100",
      name: "Net Assets With Donor Restrictions — Temporary",
      type: "net_assets",
      naturalRestriction: "temporarily_restricted",
    },
    {
      code: "3200",
      name: "Net Assets With Donor Restrictions — Permanent",
      type: "net_assets",
      naturalRestriction: "permanently_restricted",
    },
    // Revenue
    {
      code: "4000",
      name: "Contributions — Unrestricted",
      type: "revenue",
      subtype: "contribution",
    },
    {
      code: "4100",
      name: "Contributions — Temporarily Restricted",
      type: "revenue",
      subtype: "contribution",
    },
    {
      code: "4200",
      name: "Contributions — Permanently Restricted",
      type: "revenue",
      subtype: "contribution",
    },
    { code: "4300", name: "Grant Revenue", type: "revenue", subtype: "grant" },
    { code: "4400", name: "Program Service Revenue", type: "revenue", subtype: "program" },
    { code: "4500", name: "Investment Income", type: "revenue", subtype: "investment" },
    { code: "4600", name: "Special Event Revenue", type: "revenue", subtype: "event" },
    // Net asset releases (FASB ASC 958 release-of-restriction mechanism)
    {
      code: "4900",
      name: "Net Assets Released From Restrictions",
      type: "revenue",
      subtype: "release",
    },
    // Expenses — Program
    { code: "5000", name: "Program Expenses", type: "expense", functionalClass: "program" },
    {
      code: "5100",
      name: "Salaries — Program",
      type: "expense",
      functionalClass: "program",
      parentCode: "5000",
    },
    {
      code: "5200",
      name: "Supplies and Materials",
      type: "expense",
      functionalClass: "program",
      parentCode: "5000",
    },
    {
      code: "5300",
      name: "Contracted Services — Program",
      type: "expense",
      functionalClass: "program",
      parentCode: "5000",
    },
    // Expenses — Management & General
    {
      code: "6000",
      name: "Management and General Expenses",
      type: "expense",
      functionalClass: "management",
    },
    {
      code: "6100",
      name: "Salaries — M&G",
      type: "expense",
      functionalClass: "management",
      parentCode: "6000",
    },
    {
      code: "6200",
      name: "Office and Administrative",
      type: "expense",
      functionalClass: "management",
      parentCode: "6000",
    },
    {
      code: "6300",
      name: "Professional Fees",
      type: "expense",
      functionalClass: "management",
      parentCode: "6000",
    },
    {
      code: "6400",
      name: "Depreciation",
      type: "expense",
      functionalClass: "management",
      parentCode: "6000",
    },
    {
      code: "6500",
      name: "Uncollectible Pledge Expense",
      type: "expense",
      functionalClass: "management",
      parentCode: "6000",
    },
    // Expenses — Fundraising
    {
      code: "7000",
      name: "Fundraising Expenses",
      type: "expense",
      functionalClass: "fundraising",
    },
    {
      code: "7100",
      name: "Salaries — Fundraising",
      type: "expense",
      functionalClass: "fundraising",
      parentCode: "7000",
    },
    {
      code: "7200",
      name: "Marketing and Communications",
      type: "expense",
      functionalClass: "fundraising",
      parentCode: "7000",
    },
    {
      code: "7300",
      name: "Special Event Costs",
      type: "expense",
      functionalClass: "fundraising",
      parentCode: "7000",
    },
  ];
}
