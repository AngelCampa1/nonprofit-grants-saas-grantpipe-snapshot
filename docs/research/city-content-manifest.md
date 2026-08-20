# City Content Manifest - 100 Net-New Pieces

Source of truth for all 100 US-city content pieces. Each row is one deliverable.
Drafting batches pull 10 rows at a time. When a row ships, mark its `Status` column.

## Funnel Distribution

- 40 city overview pages (TOFU) â†’ `city-pages/`
- 20 city Ã— topic guides (MOFU) â†’ `guides/`
- 12 best-of city listicles (MOFU/BOFU) â†’ `listicles/`
- 10 city lead magnets (MOFU, PDF + Resend nurture) â†’ `lead-magnets/`
- 10 city FAQ hubs (TOFU/MOFU) â†’ `faq-hubs/`
- 8 city Ã— vertical pages (MOFU/BOFU) â†’ `vertical-pages/`

## Top-40 Target Cities (by registered nonprofit density)

1. New York City, NY - 2. Los Angeles, CA - 3. Chicago, IL - 4. Houston, TX - 5. Washington, DC - 6. Philadelphia, PA - 7. Phoenix, AZ - 8. San Antonio, TX - 9. San Diego, CA - 10. Dallas, TX - 11. Boston, MA - 12. San Francisco, CA - 13. Seattle, WA - 14. Denver, CO - 15. Austin, TX - 16. Portland, OR - 17. Atlanta, GA - 18. Minneapolis, MN - 19. Miami, FL - 20. Detroit, MI - 21. Pittsburgh, PA - 22. Charlotte, NC - 23. Nashville, TN - 24. Columbus, OH - 25. Indianapolis, IN - 26. Baltimore, MD - 27. Cleveland, OH - 28. Kansas City, MO - 29. Milwaukee, WI - 30. St. Louis, MO - 31. New Orleans, LA - 32. Tampa, FL - 33. Orlando, FL - 34. Sacramento, CA - 35. Las Vegas, NV - 36. Salt Lake City, UT - 37. Albuquerque, NM - 38. Honolulu, HI - 39. Anchorage, AK - 40. San Jose, CA

---

## Section 1 - City Overview Pages (40, TOFU, `city-pages/`)

One per top-40 metro. URL: `/nonprofit-software/[stateSlug]/[citySlug]`.
Frontmatter: `cityPageSchema`. Required: `topFunders` (â‰¥5), `localRegulations` (â‰¥3), `pricingStats` (â‰¥3 cited stats from IRS BMF / NCCS / city/state portals), `relatedPages` (â‰¥6: parent state + 2 sibling cities + 3 topic guides + 1 lead magnet).

| #   | Slug           | Title pattern                                                | Target keyword                    |
| --- | -------------- | ------------------------------------------------------------ | --------------------------------- |
| 1   | new-york-city  | Nonprofit Grant & Donor Management Software in New York City | nonprofit software new york city  |
| 2   | los-angeles    | â€¦in Los Angeles                                            | nonprofit software los angeles    |
| 3   | chicago        | â€¦in Chicago                                                | nonprofit software chicago        |
| 4   | houston        | â€¦in Houston                                                | nonprofit software houston        |
| 5   | washington-dc  | â€¦in Washington, DC                                         | nonprofit software washington dc  |
| 6   | philadelphia   | â€¦in Philadelphia                                           | nonprofit software philadelphia   |
| 7   | phoenix        | â€¦in Phoenix                                                | nonprofit software phoenix        |
| 8   | san-antonio    | â€¦in San Antonio                                            | nonprofit software san antonio    |
| 9   | san-diego      | â€¦in San Diego                                              | nonprofit software san diego      |
| 10  | dallas         | â€¦in Dallas                                                 | nonprofit software dallas         |
| 11  | boston         | â€¦in Boston                                                 | nonprofit software boston         |
| 12  | san-francisco  | â€¦in San Francisco                                          | nonprofit software san francisco  |
| 13  | seattle        | â€¦in Seattle                                                | nonprofit software seattle        |
| 14  | denver         | â€¦in Denver                                                 | nonprofit software denver         |
| 15  | austin         | â€¦in Austin                                                 | nonprofit software austin         |
| 16  | portland       | â€¦in Portland, OR                                           | nonprofit software portland       |
| 17  | atlanta        | â€¦in Atlanta                                                | nonprofit software atlanta        |
| 18  | minneapolis    | â€¦in Minneapolis                                            | nonprofit software minneapolis    |
| 19  | miami          | â€¦in Miami                                                  | nonprofit software miami          |
| 20  | detroit        | â€¦in Detroit                                                | nonprofit software detroit        |
| 21  | pittsburgh     | â€¦in Pittsburgh                                             | nonprofit software pittsburgh     |
| 22  | charlotte      | â€¦in Charlotte                                              | nonprofit software charlotte      |
| 23  | nashville      | â€¦in Nashville                                              | nonprofit software nashville      |
| 24  | columbus       | â€¦in Columbus, OH                                           | nonprofit software columbus       |
| 25  | indianapolis   | â€¦in Indianapolis                                           | nonprofit software indianapolis   |
| 26  | baltimore      | â€¦in Baltimore                                              | nonprofit software baltimore      |
| 27  | cleveland      | â€¦in Cleveland                                              | nonprofit software cleveland      |
| 28  | kansas-city    | â€¦in Kansas City                                            | nonprofit software kansas city    |
| 29  | milwaukee      | â€¦in Milwaukee                                              | nonprofit software milwaukee      |
| 30  | st-louis       | â€¦in St. Louis                                              | nonprofit software st louis       |
| 31  | new-orleans    | â€¦in New Orleans                                            | nonprofit software new orleans    |
| 32  | tampa          | â€¦in Tampa                                                  | nonprofit software tampa          |
| 33  | orlando        | â€¦in Orlando                                                | nonprofit software orlando        |
| 34  | sacramento     | â€¦in Sacramento                                             | nonprofit software sacramento     |
| 35  | las-vegas      | â€¦in Las Vegas                                              | nonprofit software las vegas      |
| 36  | salt-lake-city | â€¦in Salt Lake City                                         | nonprofit software salt lake city |
| 37  | albuquerque    | â€¦in Albuquerque                                            | nonprofit software albuquerque    |
| 38  | honolulu       | â€¦in Honolulu                                               | nonprofit software honolulu       |
| 39  | anchorage      | â€¦in Anchorage                                              | nonprofit software anchorage      |
| 40  | san-jose       | â€¦in San Jose                                               | nonprofit software san jose       |

## Section 2 - City Ã— Topic Guides (20, MOFU, `guides/`)

Each guide picks one major nonprofit topic and applies it to a top metro. Mix funders, registration, federal pass-through, and compliance.

| #   | Slug                                                      | Topic                                                                                 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 41  | nyc-community-foundation-grants-guide                     | NYC community foundation funder map (NY Community Trust, Robin Hood, NYC Found.)      |
| 42  | los-angeles-foundation-grants-guide                       | LA foundation grants (Weingart, Annenberg, Ahmanson, California Community Found.)     |
| 43  | chicago-foundation-grants-guide                           | Chicago foundation grants (MacArthur, Joyce, Chicago Community Trust)                 |
| 44  | bay-area-foundation-grants-guide                          | Bay Area foundation grants (Hewlett, Packard, Silicon Valley Community Found.)        |
| 45  | boston-foundation-grants-guide                            | Boston foundation grants (Boston Foundation, Barr, Klarman)                           |
| 46  | seattle-foundation-grants-guide                           | Seattle foundation grants (Gates, Seattle Foundation, Allen)                          |
| 47  | dc-federal-pass-through-funding-nonprofits-guide          | DC federal pass-through funding for local nonprofits                                  |
| 48  | atlanta-foundation-grants-guide                           | Atlanta foundation grants (Coca-Cola, Woodruff, Community Found. for Greater Atlanta) |
| 49  | minneapolis-foundation-grants-guide                       | Twin Cities foundation grants (McKnight, Bush, Otto Bremer, Minneapolis Found.)       |
| 50  | denver-foundation-grants-guide                            | Denver foundation grants (Helmsley, Daniels Fund, Denver Found.)                      |
| 51  | nyc-charitable-registration-char500-guide                 | NYC + NY State charitable registration (CHAR500, Article 7-A)                         |
| 52  | california-rrf-1-bay-area-nonprofits                      | California RRF-1 deep dive for Bay Area nonprofits                                    |
| 53  | texas-charitable-registration-houston-dallas-austin-guide | TX charitable solicitation for Houston/Dallas/Austin                                  |
| 54  | illinois-ag-501c3-registration-chicago-guide              | IL AG charitable registration for Chicago nonprofits                                  |
| 55  | florida-solicitation-of-contributions-act-guide           | FL Solicitation of Contributions Act (Miami/Tampa/Orlando)                            |
| 56  | nyc-doh-grant-compliance-guide                            | NYC DOHMH grant compliance requirements                                               |
| 57  | la-county-mental-health-grants-compliance-guide           | LA County DMH grant compliance                                                        |
| 58  | chicago-cdbg-pass-through-compliance-guide                | Chicago CDBG pass-through compliance                                                  |
| 59  | boston-cdbg-hud-compliance-guide                          | Boston CDBG/HUD compliance                                                            |
| 60  | dc-medicaid-cms-grant-compliance-guide                    | DC Medicaid/CMS grant compliance for community-based orgs                             |

## Section 3 - Best-of City Listicles (12, MOFU/BOFU, `listicles/`)

| #   | Slug                                                      | Pattern                                                |
| --- | --------------------------------------------------------- | ------------------------------------------------------ |
| 61  | best-donor-management-software-nyc-nonprofits             | Best donor management for NYC nonprofits               |
| 62  | best-grant-management-software-california-nonprofits      | Best grant management for CA nonprofits                |
| 63  | best-nonprofit-crm-chicago                                | Best nonprofit CRM for Chicago orgs                    |
| 64  | best-grant-compliance-software-texas-nonprofits           | Best grant compliance for TX nonprofits                |
| 65  | best-nonprofit-software-dc-federal-grantees               | Best nonprofit software for DC federal grantees        |
| 66  | best-fund-accounting-software-massachusetts-nonprofits    | Best fund accounting for MA nonprofits                 |
| 67  | best-grant-tracking-software-pacific-northwest-nonprofits | Best grant tracking for PNW (Seattle/Portland)         |
| 68  | best-donor-crm-atlanta-nonprofits                         | Best donor CRM for Atlanta nonprofits                  |
| 69  | best-restricted-fund-tracking-twin-cities-nonprofits      | Best restricted fund tracking for Twin Cities          |
| 70  | best-nonprofit-software-florida-grant-funded              | Best nonprofit software for FL grant-funded orgs       |
| 71  | best-grant-software-mountain-west-nonprofits              | Best grant software for Mountain West (Denver/SLC/ABQ) |
| 72  | best-nonprofit-software-rural-alaska-hawaii               | Best nonprofit software for AK/HI rural orgs           |

## Section 4 - City Lead Magnets (10, MOFU, `lead-magnets/` + R2 PDF + Resend sequence)

| #   | Slug (NEW LeadMagnetSlug)                  | Title                                      |
| --- | ------------------------------------------ | ------------------------------------------ |
| 73  | nyc-foundation-funder-map-2026             | NYC Foundation Funder Map 2026             |
| 74  | los-angeles-foundation-funder-map-2026     | Los Angeles Foundation Funder Map 2026     |
| 75  | chicago-foundation-funder-map-2026         | Chicago Foundation Funder Map 2026         |
| 76  | houston-grant-deadline-calendar-2026       | Houston Grant Deadline Calendar 2026       |
| 77  | dc-federal-pass-through-pipeline-worksheet | DC Federal Pass-Through Pipeline Worksheet |
| 78  | philadelphia-grant-deadline-calendar-2026  | Philadelphia Grant Deadline Calendar 2026  |
| 79  | phoenix-foundation-funder-map-2026         | Phoenix Foundation Funder Map 2026         |
| 80  | san-antonio-grant-deadline-calendar-2026   | San Antonio Grant Deadline Calendar 2026   |
| 81  | san-diego-foundation-funder-map-2026       | San Diego Foundation Funder Map 2026       |
| 82  | dallas-foundation-funder-map-2026          | Dallas Foundation Funder Map 2026          |

Each requires: markdown in `apps/site/src/content/lead-magnets/`, slug + title in `packages/shared/src/constants/lead-magnets.ts`, PDF generated by Puppeteer build script, R2 sync, 5-step Resend nurture sequence in `apps/api/src/domains/leads/nurture-copy.ts` (Steps 0+1+2 city-specific; Steps 3+4 reuse `sharedStep3`/`sharedStep4`).

## Section 5 - City FAQ Hubs (10, TOFU/MOFU, `faq-hubs/`)

| #   | Slug                                      | Topic                                      |
| --- | ----------------------------------------- | ------------------------------------------ |
| 83  | faq-nyc-nonprofit-compliance              | FAQ: NYC nonprofit compliance              |
| 84  | faq-california-nonprofit-grant-compliance | FAQ: CA nonprofit grant compliance         |
| 85  | faq-illinois-nonprofit-registration       | FAQ: IL nonprofit registration & reporting |
| 86  | faq-texas-nonprofit-compliance            | FAQ: TX nonprofit compliance               |
| 87  | faq-dc-federal-grant-compliance           | FAQ: DC federal grant compliance           |
| 88  | faq-massachusetts-nonprofit-compliance    | FAQ: MA nonprofit compliance               |
| 89  | faq-florida-nonprofit-solicitation        | FAQ: FL solicitation registration          |
| 90  | faq-washington-state-nonprofit-compliance | FAQ: WA state nonprofit compliance         |
| 91  | faq-georgia-nonprofit-registration        | FAQ: GA nonprofit registration             |
| 92  | faq-minnesota-nonprofit-compliance        | FAQ: MN nonprofit compliance               |

## Section 6 - City Ã— Vertical Pages (8, MOFU/BOFU, `vertical-pages/`)

| #   | Slug                                                 | Topic                                                     |
| --- | ---------------------------------------------------- | --------------------------------------------------------- |
| 93  | affordable-housing-nonprofits-nyc-hud-compliance     | Affordable housing nonprofits in NYC: HUD/CDBG compliance |
| 94  | community-health-centers-los-angeles-hrsa-compliance | LA community health centers: HRSA 330 compliance          |
| 95  | youth-services-chicago-21st-cclc-compliance          | Chicago youth-services 21st CCLC compliance               |
| 96  | workforce-development-houston-doleta-compliance      | Houston workforce development DOLETA compliance           |
| 97  | mental-health-nonprofits-boston-samhsa-compliance    | Boston mental health SAMHSA compliance                    |
| 98  | environmental-nonprofits-bay-area-epa-compliance     | Bay Area environmental EPA compliance                     |
| 99  | refugee-services-seattle-orr-compliance              | Seattle refugee services ORR compliance                   |
| 100 | food-banks-atlanta-usda-tefap-compliance             | Atlanta food banks USDA/TEFAP compliance                  |

---

## Drafting Contract (per piece)

1. **Drafter agent** uses keyword brief from `docs/research/dataforseo-cache/{citySlug}.json`, applies `marketing-skills:copywriting` + `marketing-skills:seo-audit` + `marketing-skills:ai-seo`. Output: full markdown with frontmatter.
2. **Humanizer agent** runs `humanizer` + `stop-slop`. Rewrites AI tells.
3. **Reviewer agent** verifies: schema parse, â‰¥6 `relatedPages`, â‰¥3 cited stats with resolvable `sourceUrls`, no fabricated quotes, â‰¥4 inline body links, AI-SEO blocks present (`definitions`, `answers`, `pricingStats`).
4. **Internal linking**: every city page links â†’ parent state + 2 sibling cities + 3 topic guides + 1 lead magnet + 1 listicle + 1 comparison. Every guide/listicle/lead magnet links back â‰¥3 cities.

## Verification per Batch

```bash
pnpm --filter @grantpipe/site astro check
pnpm --filter @grantpipe/site test
turbo typecheck
```

## Status Tracking

Add a `Status` column when a piece ships: `draft|review|done`. Manifest is the single source of truth across batch sessions.
