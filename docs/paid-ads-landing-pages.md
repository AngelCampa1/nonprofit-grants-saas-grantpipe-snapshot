# Paid Ads Landing Pages

Registry of dedicated landing pages built for paid traffic (Bing, Google, LinkedIn, etc.). All live at `/lp/<slug>` and are excluded from the sitemap, the orphan-route contract test, and SEO indexing (`noindex`).

## Conventions

- **Path:** `/lp/<slug>` (always under `/lp/` - that prefix is what excludes the page from `getOrphanedRoutes` in `apps/site/src/lib/marketing-link-graph.ts` and signals "paid only")
- **Source:** `apps/site/src/pages/lp/<slug>.astro`
- **Robots:** `noindex={true}` on `BaseLayout` (set explicitly so the LP does not cannibalize the organic equivalent in search)
- **Trailing slash:** add an entry to `apps/site/public/_redirects` redirecting the no-slash URL to the slash version
- **UTM preservation:** include the inline UTM-rewrite script and tag every signup CTA with `data-preserve-utm`
- **Mobile sticky CTA + skip-link:** copy the working pattern from an existing LP
- **No site nav:** strip `SiteHeader` - replace with minimal `logo + Start 1-month free trial` header to remove escape paths from the funnel
- **Primary CTA:** use the homepage trial language, `Start 1-month free trial`, for every paid LP signup action
- **Secondary CTAs:** add one intent-matched lead-magnet or comparison link for campaigns with weak conversion evidence, and preserve UTM/MSCLKID parameters on it
- **AI-SDR:** keep the marketing AI-SDR widget enabled; paid LP mobile sticky CTA spacing must leave room for the assistant launcher

## Active

| Slug                                | URL                                                         | Target keyword                                                            | Audience                  | Campaign                                     | Launched   |
| ----------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------- | -------------------------------------------- | ---------- |
| `grant-management-software`         | https://grantpipe.com/lp/grant-management-software/         | "grant management software" + nonprofit-modified variants                 | Grants managers           | BING_Search_Grant-Management_Trial_2026-05   | 2026-05-09 |
| `granthub-migration`                | https://grantpipe.com/lp/granthub-migration/                | "granthub alternative" + replacement/migration variants                   | GrantHub evaluators       | BING_Search_GrantHub-Migration_Trial_2026-05 | 2026-05-12 |
| `restricted-fund-tracking`          | https://grantpipe.com/lp/restricted-fund-tracking/          | "restricted fund tracking software" + QuickBooks restricted fund variants | Finance leads             | BING_Search_Restricted-Funds_Trial_2026-05   | 2026-05-12 |
| `grant-compliance-software`         | https://grantpipe.com/lp/grant-compliance-software/         | "grant compliance software" + federal compliance variants                 | Grants and finance teams  | BING_Search_Grant-Compliance_Trial_2026-05   | 2026-05-12 |
| `grant-reporting-software`          | https://grantpipe.com/lp/grant-reporting-software/          | "grant reporting software" + SF-425/SEFA/reporting calendar variants      | Report-heavy grants teams | BING_Search_Grant-Reporting_Trial_2026-05    | 2026-05-12 |
| `run-grants-without-a-second-admin` | https://grantpipe.com/lp/run-grants-without-a-second-admin/ | "grant management" + solo/one-person grants admin variants                | Solo grants admins        | BING_Search_Grants-Solo_Trial_2026-06        | 2026-06-16 |
| `donor-grant-unified`               | https://grantpipe.com/lp/donor-grant-unified/               | "donor and grant management software" + unified fund tracking variants    | Development directors     | BING_Search_Dev-Director_Trial_2026-06       | 2026-06-16 |
| `board-report-in-an-afternoon`      | https://grantpipe.com/lp/board-report-in-an-afternoon/      | "board fundraising report" + board deck + live data variants              | Development directors     | BING_Search_Dev-Director_Trial_2026-06       | 2026-06-16 |
| `grant-pipeline-like-donors`        | https://grantpipe.com/lp/grant-pipeline-like-donors/        | "managing grant pipeline" + moves management + grant prospect variants    | Development directors     | BING_Search_Dev-Director_Trial_2026-06       | 2026-06-16 |
| `donor-retention-rescue`            | https://grantpipe.com/lp/donor-retention-rescue/            | "donor retention rate how to improve" + lapsed donor + pledge variants    | Development directors     | BING_Search_Dev-Director_Trial_2026-06       | 2026-06-16 |
| `donor-crm-with-grants`             | https://grantpipe.com/lp/donor-crm-with-grants/             | "nonprofit CRM with grant tracking" + donor CRM + grants combined intent  | Development directors     | BING_Search_Dev-Director_Trial_2026-06       | 2026-06-16 |
| `answer-any-board-question`         | https://grantpipe.com/lp/answer-any-board-question/         | "nonprofit board report" + ED confidence + live data variants             | Executive directors       | BING_Search_Exec-Director_Trial_2026-06      | 2026-06-16 |
| `nonprofit-crm-no-consultant`       | https://grantpipe.com/lp/nonprofit-crm-no-consultant/       | "nonprofit CRM without consultants" + TCO + self-run variants             | Executive directors       | BING_Search_Exec-Director_Trial_2026-06      | 2026-06-16 |
| `keep-the-org-memory`               | https://grantpipe.com/lp/keep-the-org-memory/               | "nonprofit staff turnover" + key-person risk + org memory variants        | Executive directors       | BING_Search_Exec-Director_Trial_2026-06      | 2026-06-16 |
| `salesforce-blackbaud-alternative`  | https://grantpipe.com/lp/salesforce-blackbaud-alternative/  | "Salesforce nonprofit alternative" + Blackbaud alternative variants       | Executive directors       | BING_Search_Exec-Director_Trial_2026-06      | 2026-06-16 |
| `one-system-not-four`               | https://grantpipe.com/lp/one-system-not-four/               | "nonprofit software consolidation" + all-in-one + patchwork stack         | Executive directors       | BING_Search_Exec-Director_Trial_2026-06      | 2026-06-16 |
| `fund-accounting-without-the-price` | https://grantpipe.com/lp/fund-accounting-without-the-price/ | "nonprofit fund accounting software" + affordable + Sage Intacct alternative | Finance and operations staff | BING_Search_Finance-Ops_Trial_2026-06     | 2026-06-16 |
| `audit-prep-in-days`                | https://grantpipe.com/lp/audit-prep-in-days/                | "nonprofit audit prep" + grant file + Single Audit variants               | Finance and operations staff | BING_Search_Finance-Ops_Trial_2026-06     | 2026-06-16 |
| `match-every-drawdown`              | https://grantpipe.com/lp/match-every-drawdown/              | "drawdown reconciliation" + federal cash management + 2 CFR 200.305       | Finance and operations staff | BING_Search_Finance-Ops_Trial_2026-06     | 2026-06-16 |
| `split-payroll-across-grants`       | https://grantpipe.com/lp/split-payroll-across-grants/       | "grant payroll allocation" + split payroll across grants + effort documentation | Finance and operations staff | BING_Search_Finance-Ops_Trial_2026-06 | 2026-06-16 |

## Retired

_(none yet)_

## Adding a new LP

1. Copy an existing LP from `apps/site/src/pages/lp/` and rename.
2. Update H1, FAQs, stats, and proof card to match the new persona - read the persona doc first (`packages/shared/src/knowledge/marketing/content/personas/<slug>.md`).
3. Add a trailing-slash redirect to `apps/site/public/_redirects`.
4. Confirm the page uses `Start 1-month free trial` as `primaryCta`. Add an `exitLeadMagnet` object for the softer conversion path and include explore-anchor links where needed. Do NOT add a `secondaryCta` — the contract test asserts it is absent from the page source.
5. Run `pnpm --filter @grantpipe/site test` - the orphan-route test should pass without modification because the `/lp/` prefix is auto-exempted.
6. Add a row to the **Active** table above with the campaign name and launch date.
7. Deploy with `pnpm run deploy:site`.
