---
title: "Nonprofit Software Security and Compliance: What to Demand from Your Vendors"
description: "Most nonprofit software security failures don't come from sophisticated attacks - they come from weak vendor practices, misconfigured access, and donor data"
seoTitle: "Nonprofit Software Security and Compliance Guide"
seoDescription: "What security and compliance practices nonprofit software vendors should provide - encryption, SOC 2, access controls, donor data, and PII handling."
targetKeyword: "nonprofit software security compliance"
publishedAt: "2026-04-29"
updatedAt: "2026-04-29"
lastReviewedAt: "2026-04-29"
buyerStage: "mofu"
contentIntent: "category"
topicCluster: "nonprofit-crm"
schema: "Article"
bluf: "Nonprofit data - donor PII, gift histories, restricted-fund detail, federal grant compliance documentation - is regulated, sensitive, and increasingly targeted. The 2024 NTEN report found that fewer than half of nonprofits have documented security policies, and most security failures trace to vendor weakness, misconfigured access, or staff handling data outside policy. The minimum vendor checklist: SOC 2 Type II report or equivalent, encryption in transit and at rest, role-based access controls, audit logging, documented data residency, and incident response process. The minimum internal practice: written security policy, annual access review, MFA on every system that touches donor data, and explicit handling rules for federal grant compliance documentation."
faqs:
  - q: "What security certifications should a nonprofit software vendor have?"
    a: "SOC 2 Type II is the standard for SaaS vendors handling sensitive data. The Type II report covers a 6-12 month observation period and verifies that the vendor's security controls are actually operating, not just designed on paper. ISO 27001 is also acceptable. Vendors that can produce neither - or that point to a 'security page' on their website as a substitute - are not appropriate for nonprofits handling donor data, payment information, or federal grant documentation."
  - q: "Do nonprofits need to comply with HIPAA or other regulations?"
    a: "Most nonprofits don't handle PHI and aren't HIPAA-covered entities. Healthcare nonprofits, behavioral health programs, and some social service providers do - and need vendors with documented HIPAA compliance and signed Business Associate Agreements. PCI-DSS applies to any organization processing credit card payments (almost all nonprofits with online giving). State data-protection laws - California's CCPA/CPRA, Virginia's VCDPA, Colorado's CPA, and others - apply based on donor location, not organization location. The practical implication: if your donors live in those states, the laws apply to you."
  - q: "How should nonprofits handle donor PII?"
    a: "Five rules. Collect only what you need, store it in systems with documented security controls, restrict access by role (not everyone needs to see everything), maintain an audit log of access, and have a written deletion policy for data that is no longer needed. Names and addresses get less restrictive handling than financial detail and giving capacity scores. Federal grant compliance documentation may require additional handling under specific award terms - check the terms and conditions before assuming generic policy is sufficient."
  - q: "What is SOC 2 and why does it matter?"
    a: "SOC 2 is an audit report on a vendor's security controls, performed by an independent CPA firm. Type I reports describe controls at a point in time; Type II reports describe whether those controls operated effectively over a 6-12 month period. Type II is the credible standard. The report covers areas like access controls, encryption, change management, incident response, and vendor management. For nonprofits, asking 'do you have a SOC 2 Type II report?' is the single most useful security question to ask any prospective vendor."
  - q: "What goes in a nonprofit security policy?"
    a: "At minimum: acceptable use of organizational systems and data, password and authentication requirements (MFA on everything that touches donor data), access provisioning and deprovisioning when staff arrive or leave, vendor evaluation requirements before signing new SaaS contracts, incident response process, data classification (what's public, what's internal, what's confidential), and a defined annual review cadence. The policy doesn't need to be long - 6-10 pages is plenty for most mid-sized organizations - but it does need to exist, be approved by the board, and be enforced."
  - q: "What is the most common nonprofit security failure?"
    a: "Two patterns dominate. First, account compromise through phishing - usually targeting the Executive Director or Finance lead - followed by wire fraud or donor data theft. MFA on everything is the single most effective defense. Second, vendor weakness - a third-party tool that holds donor data has a breach, and the nonprofit inherits the consequences. The defense is vendor evaluation discipline before signing contracts, not after the breach."
relatedPages:
  - "/resources/guides/donor-management-software-mistakes"
  - "/resources/guides/nonprofit-technology-stack-guide"
  - "/resources/guides/donor-crm-migration-preparation"
  - "/resources/guides/restricted-fund-accounting-software-for-nonprofits"
sourceUrls:
  - "https://www.nten.org/publication/2024-state-of-nonprofit-technology"
  - "https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2"
  - "https://www.pcisecuritystandards.org/"
  - "https://oag.ca.gov/privacy/ccpa"
statistics:
  - stat: "Fewer than half of nonprofits have documented security policies in place."
    source: "NTEN 2024 State of Nonprofit Technology Report"
    sourceUrl: "https://www.nten.org/publication/2024-state-of-nonprofit-technology"
  - stat: "PCI-DSS applies to any organization that stores, processes, or transmits credit card data, including nonprofits with online giving."
    source: "PCI Security Standards Council"
    sourceUrl: "https://www.pcisecuritystandards.org/"
  - stat: "California's CCPA/CPRA applies to organizations handling personal information of California residents above defined thresholds, regardless of where the organization is located."
    source: "California Office of the Attorney General"
    sourceUrl: "https://oag.ca.gov/privacy/ccpa"
tags:
  - "guide"
  - "security"
  - "compliance"
  - "vendor evaluation"
targetPersona:
  - "executive-director"
  - "operations-director"
  - "development-director"
---

A nonprofit holds three categories of regulated, sensitive data: donor information (names, addresses, email, giving history, often financial detail), payment data (card numbers and bank information for recurring gifts), and program data (which may include health information, immigration status, beneficiary identifiers, or federal grant compliance documentation depending on the program). Most mid-sized nonprofits handle all three with security practices designed for none of them.

This guide is for Executive Directors and Operations leaders who need a working framework for evaluating nonprofit software vendors and establishing internal practices that protect the organization from the failure modes that actually happen.

## What Goes Wrong

Three categories of incident account for the bulk of nonprofit security failures:

**1. Account compromise.** A staff member - usually senior - has their account compromised through phishing, credential reuse, or weak passwords. The attacker uses the access to steal donor data, redirect wire transfers, or pivot into other systems. This is the single most common nonprofit security incident. MFA prevents most of it.

**2. Vendor breach.** A SaaS tool that holds donor data has a security incident. The nonprofit's data is exposed not through any failure of the nonprofit's own practices, but through inheritance from a vendor whose security was inadequate. The defense is vendor evaluation - and most nonprofits don't do it.

**3. Data handling drift.** Donor lists exported to personal Gmail accounts. Spreadsheets with bank details emailed unencrypted. Federal grant compliance documents stored on personal cloud drives. None of these are sophisticated attacks. All of them are policy failures that lead to real exposure.

The 2024 NTEN State of Nonprofit Technology Report found that fewer than half of nonprofits have documented security policies. That number is the leading indicator for everything that follows.

## Vendor Evaluation: The Minimum Checklist

Before signing a contract with any software vendor that will hold donor data, payment data, or program data, ask for the following. If the vendor cannot produce them, the answer is no - there are alternatives in every category.

**SOC 2 Type II report.** Not Type I, which describes controls at a point in time. Type II covers a 6-12 month observation period and shows that the controls actually operated. Vendors will share the report under NDA. Vendors who substitute a "security page" on their website are not at the bar required for nonprofit data.

**Encryption in transit and at rest.** TLS 1.2 or higher in transit, AES-256 or equivalent at rest. This is table stakes. A vendor that cannot articulate this clearly is signaling something.

**Role-based access controls.** The ability to grant staff differentiated access - Admin, Editor, Viewer at minimum, with finer-grained controls for sensitive fields like wealth scores or compliance documentation. Vendors who only offer "everyone has full access" are not appropriate for organizations with more than three staff.

**Audit logging.** Every meaningful action - login, record change, data export, permission change - logged with timestamp and user. Logs retained for at least one year. This is not optional for organizations subject to single audits or with formal donor-privacy commitments.

**Documented data residency.** Where is the data stored? US? EU? What about backups? Some funders and some donors care about this; the vendor should be able to answer immediately, in writing.

**Incident response process.** What does the vendor do when they detect a breach? When and how will they notify customers? What are their legal commitments around notification timing? "We'll let you know if anything happens" is not an answer.

**Subprocessor list.** Most SaaS vendors use other vendors - cloud hosting, email delivery, analytics. The list should be public or available on request, with the security posture of each documented. Your data security is only as strong as the weakest link in the subprocessor chain.

**Contractual data ownership and exit terms.** When the contract ends, you get your data in a usable format, and the vendor deletes their copies within a defined timeframe. Read the contract before signing - some vendors retain "anonymized" data indefinitely in ways that don't match donor expectations.

For mid-sized nonprofits, this checklist eliminates roughly 30-40% of vendors who pitch the sector. That's the point. The vendors who clear it are the ones whose security operations match the obligations you're taking on.

## Internal Security Practices

Vendor selection is half the work. The other half is what your organization does with the tools you've chosen.

### Authentication

**MFA on every system that touches donor data.** Not optional, not "for senior staff only," not "we'll add it later." Every account, every day. The cost is roughly 30 seconds per login. The benefit is that account compromise - the most common nonprofit security incident - becomes much harder.

**Single sign-on (SSO) where possible.** Google Workspace or Microsoft 365 SSO into the major SaaS tools centralizes authentication and makes deprovisioning fast when staff leave. SSO is increasingly available on nonprofit-tier pricing; it used to be a Salesforce-tier feature only.

**Password managers required.** 1Password, Bitwarden, or equivalent. Personal passwords are the vector for credential reuse attacks; password managers eliminate the entire category of risk for the cost of a small subscription.

### Access Management

**Annual access review.** Every named user, every system, every permission level. Pull the list, review it, remove access that is no longer appropriate. This work takes 4-8 hours per year for a mid-sized nonprofit and prevents the slow accumulation of orphan accounts and over-privileged staff.

**Deprovisioning on departure.** When a staff member leaves, access is removed within hours, not weeks. This is a process problem more than a technology problem - but it requires HR and IT/Operations to coordinate explicitly.

**Least privilege as default.** Staff get access to what they need to do their job, not access to everything that might be useful someday. This is uncomfortable for small organizations where everyone wears multiple hats, but it is enforceable through role-based controls in modern SaaS tools.

### Data Handling

**Written data classification policy.** Public, internal, confidential, restricted. Each category has rules - who can access it, how it can be shared, where it can be stored. Without classification, every piece of data gets treated according to whoever happens to be handling it.

**Donor PII handling rules.** Names and addresses are confidential. Giving capacity, wealth scores, and major-donor notes are restricted. Financial detail (bank info, full card numbers) requires additional protection and ideally never sits in your CRM at all - the payment processor holds it. Federal grant compliance documents may have specific handling requirements under the award terms.

**Email discipline.** Donor lists are not emailed to personal accounts. Sensitive documents are not attached to email; they are linked from access-controlled storage. This is enforced through training, not through technical controls - most nonprofits cannot lock down email enough to make policy unnecessary.

### Compliance Documentation

For organizations with federal awards above the $1M single-audit threshold, security and compliance overlap directly. Auditors will expect to see:

- Documented access controls on systems holding grant compliance data
- Audit logs showing who accessed what and when
- Vendor documentation (SOC 2, BAA, or equivalent) for any SaaS tool holding compliance data
- Incident response process that covers grant compliance data specifically
- Data retention policies that align with the three-year retention requirement under 2 CFR 200.334

Organizations that handle grant compliance documentation in personal Google Drives, shared inboxes, or unmanaged file shares are setting up audit findings. The fix is not necessarily software - but it is a system with the controls auditors expect to see.

For more on the underlying compliance picture, see our [restricted fund accounting software guide](/resources/guides/restricted-fund-accounting-software-for-nonprofits) and the related [donor management software mistakes](/resources/guides/donor-management-software-mistakes).

## Specific Regulations Worth Knowing

**PCI-DSS.** If your nonprofit accepts credit card gifts, you are subject to PCI-DSS. Most nonprofits achieve compliance by not touching card data - the payment processor handles it, and the nonprofit's CRM stores only tokens or last-four digits. This is the right pattern. The wrong pattern is storing full card numbers in spreadsheets, CRM custom fields, or emailed gift forms.

**HIPAA.** Applies to healthcare nonprofits, behavioral health programs, and some social service providers handling Protected Health Information. Vendors handling PHI must sign a Business Associate Agreement (BAA). Generic CRM tools are usually not HIPAA-eligible without specific configuration.

**State privacy laws.** California (CCPA/CPRA), Virginia (VCDPA), Colorado (CPA), Connecticut (CTDPA), and others. Apply based on resident location, not organizational location. A New York nonprofit with California donors needs to honor California rights, including data access and deletion requests.

**GDPR.** Applies if your organization markets to or serves EU residents. Most US nonprofits don't, but organizations with international programs or international donors may.

**State charitable registration.** Not strictly a security regulation, but related - most states require charitable registration before soliciting donations from their residents, and registration interacts with data-handling expectations.

The right posture for most mid-sized nonprofits: assume CCPA-equivalent practices as a baseline (because California donors are common), maintain PCI-compliant payment handling through processor tokenization, and verify HIPAA applicability with counsel if your programs touch healthcare or behavioral health data.

## What This Looks Like in Practice

A $3M nonprofit with 12 staff and a SaaS-heavy stack should expect to invest:

- 16-24 hours of leadership time per year on security policy review and annual access reviews
- 4-8 hours per major vendor evaluation, with security documentation review
- 1-2 hours per staff member per year on security training (phishing awareness, password hygiene, data handling)
- Roughly $30-60 per user per year on password manager subscriptions
- Roughly $5-15 per user per month for SSO, if not already included in core productivity tools

The cumulative cost is well under 1% of operating budget for a typical mid-sized nonprofit. The cost of a single significant incident - wire fraud, donor data breach, or an audit finding tied to weak compliance data handling - is materially larger, both financially and in terms of donor trust.

For organizations preparing for a CRM or grant management migration, security and vendor evaluation should be part of the [migration preparation work](/resources/guides/donor-crm-migration-preparation), not an afterthought once the system is selected.

The honest summary: nonprofit security failures don't come from sophisticated attacks. They come from absent policy, weak vendor practices, and data handled outside the rules - usually because there are no rules. The fix is not exotic. Documented policy, MFA, annual reviews, and SOC 2-grade vendors cover the realistic risk for the realistic cost. The work is in actually doing it, consistently, year after year.
