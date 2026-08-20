import type { FaqItem } from "@grantpipe/ui/site";

export const hubFaqs: Record<string, FaqItem[]> = {
  "/compare": [
    {
      q: "How does GrantPipe compare to donor CRMs like Bloomerang or DonorPerfect?",
      a: "Donor CRMs track relationships and giving history, but grants are usually a side feature. GrantPipe keeps donors and grants in one system with restricted fund tracking and FASB ASC 958 fund accounting built in, so your team is not reconciling grant spending across a spreadsheet and a separate accounting tool.",
    },
    {
      q: "What makes grant management software different from general nonprofit accounting tools?",
      a: "General accounting tools like QuickBooks track revenue and expenses but do not enforce grant restrictions at the transaction level. Grant management software separates restricted funds by award, flags when spending exceeds approved budget categories, and generates funder-ready reports, tasks that take a lot of manual work in a general accounting system.",
    },
    {
      q: "Is GrantPipe a replacement for Salesforce Nonprofit Success Pack?",
      a: "GrantPipe is an alternative to NPSP for teams whose hardest problem is grant compliance, not enterprise CRM customization. NPSP can take a large implementation project before staff see value. GrantPipe is aimed at mid-sized nonprofits that need donors and grants managed with a staff-led setup path.",
    },
    {
      q: "How do I evaluate nonprofit software before committing?",
      a: "Focus on three questions: Does the tool track restricted funds at the transaction level? Can it generate the specific reports your funders require? What is the total cost of ownership, including implementation, training, and annual fees? Those three questions separate tools that fit nonprofit compliance work from general CRMs that treat grants as an afterthought.",
    },
  ],
  "/compare/alternatives": [
    {
      q: "What should I look for when comparing grant management software alternatives?",
      a: "Check whether each tool handles restricted fund accounting natively, which report formats it supports, and how much setup work it needs. Many products built for larger organizations come with implementation costs that exceed a mid-sized nonprofit's annual subscription budget.",
    },
    {
      q: "Are Salesforce NPSP alternatives significantly cheaper?",
      a: "Most purpose-built grant management tools cost far less than Salesforce NPSP, which can require a large implementation project before the first user logs in. Tools built for nonprofits in the $500K-$10M revenue range are usually priced around $99-$499 per month with simpler setup.",
    },
    {
      q: "Do smaller nonprofits need the same features as large ones when switching software?",
      a: "No. Large nonprofits with dedicated grants teams often need workflow routing, multi-department approvals, and deeper CRM integration. Mid-sized nonprofits with one or two development staff usually need reliable restricted fund tracking, deadline alerts, and clean financial exports. Buying for enterprise scale adds cost and complexity without adding much value.",
    },
  ],
  "/compare/versus": [
    {
      q: "How do I run a fair head-to-head comparison of nonprofit software tools?",
      a: "Test each tool against your real grant portfolio. Can it track your mix of restricted government grants and foundation awards separately? Can it get through a mock report for your most compliance-heavy grant? That workflow tells you more than any feature checklist.",
    },
    {
      q: "What comparison criteria matter most when evaluating nonprofit software?",
      a: "Restricted fund accounting accuracy, funder report generation, deadline tracking, and implementation cost. Integrations, mobile access, and polish matter less than whether the tool prevents restricted funds from getting mixed together and helps your team produce clean compliance records.",
    },
    {
      q: "Should I compare nonprofit software on user count or revenue volume?",
      a: "Revenue and grant portfolio complexity are more useful than user count. A three-person development team using a donor CRM, grant pipeline, and compliance calendar has very different needs than a 20-person team running large-scale donor operations. Evaluate based on the complexity of your funding mix, not headcount alone.",
    },
  ],
  "/compare/pricing": [
    {
      q: "What does grant management software actually cost for a mid-sized nonprofit?",
      a: "Purpose-built grant management tools for nonprofits in the $500K-$10M range typically cost $99-$499 per month. Enterprise platforms can add implementation work before the subscription fee. Total cost matters more than the monthly line item.",
    },
    {
      q: "Are there hidden costs in nonprofit software pricing?",
      a: "Common extra costs include per-user pricing that grows as your team expands, implementation and onboarding charges, migration fees, and premium support tiers. Ask every vendor for the total first-year cost, not just the monthly subscription.",
    },
    {
      q: "Is free nonprofit software a viable option for grant management?",
      a: "Free tools are rarely built to handle restricted fund accounting at the level government and foundation funders expect. Free CRM tiers often cap users, limit reporting, or skip the audit trail features grant compliance requires. For organizations managing restricted grants, a paid tool with proper fund accounting is usually worth it.",
    },
  ],
  "/resources": [
    {
      q: "What resources help nonprofits evaluate grant management software?",
      a: "Start with your compliance requirements: which grants have federal Uniform Guidance obligations, what report formats your funders require, and whether your current system can produce a clean restricted-fund report. That scope tells you which features matter before you look at software.",
    },
    {
      q: "How do development directors learn which nonprofit software fits their organization?",
      a: "Peer organizations with a similar budget and funding mix are usually the best source. Ask your community foundation program officer which tools their grantees use. Sector-specific convenings and capacity-building providers also tend to have practical recommendations based on direct experience.",
    },
    {
      q: "Are nonprofit software guides written for the organization's size or the industry?",
      a: "Most published guides target either very small nonprofits using free tools or large nonprofits with dedicated IT staff. Mid-sized organizations with $500K-$10M budgets and one or two development staff sit in the middle. Evaluate guides based on whether they actually speak to your revenue tier and staffing reality.",
    },
  ],
  "/resources/best": [
    {
      q: "How do I identify the best grant management software for a nonprofit under $5M?",
      a: "The best fit for a sub-$5M nonprofit combines restricted fund tracking, basic funder reporting, and a price point that does not need a board-level exception. Eliminate tools that require implementation consultants or per-seat pricing that keeps climbing as your team grows.",
    },
    {
      q: "What separates a ranked grant management software list from a paid placement list?",
      a: "Independent rankings evaluate tools against actual nonprofit compliance needs, restricted fund accounting, and reporting requirements, not just vendor marketing claims. Look for lists that say whether the software was tested directly or whether the comparison came from vendor material.",
    },
    {
      q: "Are software roundups for nonprofits relevant to grant-focused organizations?",
      a: "Many nonprofit software roundups focus on donor management instead of grant compliance. If grants make up a meaningful share of your revenue, look for lists that evaluate restricted fund tracking and federal compliance features, not just constituent relationship management.",
    },
  ],
  "/resources/guides": [
    {
      q: "What guides help nonprofits understand grant compliance software requirements?",
      a: "The most useful guides explain federal Uniform Guidance (2 CFR 200) in operational terms: what records your software must produce, what audit trail you need, and how to structure your chart of accounts for multi-grant tracking. The regulation text alone does not tell you what the system has to do day to day.",
    },
    {
      q: "Where do development directors learn about grant management best practices?",
      a: "Grant Professionals Association resources, state nonprofit associations, and capacity-building organizations publish grant management practice guides. They are usually more useful than generic vendor content because they are written from the perspective of the people doing the compliance work.",
    },
    {
      q: "How do I use software guides to prepare for a grant audit?",
      a: "A useful audit guide should show what auditors look for in grant files: spending matched to approved budget categories, time-and-effort records for personnel costs, procurement records for larger purchases, and a clear restricted-fund trail. If your current software cannot produce those records cleanly, that is the standard to use when evaluating a replacement.",
    },
  ],
  "/resources/topics": [
    {
      q: "How is this different from a regular search results page?",
      a: "Each topic brings together the explanatory, evaluative, and comparison pages around one decision, so you can move from framing the problem to comparing tools without running multiple searches.",
    },
    {
      q: "Which topic should a grant-funded nonprofit start with?",
      a: "Match the current pressure point. Start with Nonprofit CRM if you're replacing a donor system, Donor Operations if stewardship and gift workflows are messy, Grant Management if grant workflow is breaking down, Grant Compliance if the pressure shows up after awards are active, and Restricted Fund Accounting if finance and development can't agree on balances or reporting.",
    },
    {
      q: "Can I skip straight to the software comparisons?",
      a: "Yes. Each topic includes direct head-to-head comparisons and alternatives pages. If you already know what you're evaluating, those are the fastest path.",
    },
  ],
  "/resources/topics/nonprofit-crm": [
    {
      q: "What makes nonprofit CRM selection harder for grant-funded teams?",
      a: "The harder question is not only donor management depth. Grant-funded teams also need to understand whether the CRM can stay coherent when grants, restricted funds, and reporting workflow start affecting the same records and decisions.",
    },
    {
      q: "Should a mid-sized nonprofit optimize for CRM depth or implementation simplicity?",
      a: "Usually both, but implementation simplicity becomes more important when the organization does not have a dedicated admin or consulting budget. A slightly narrower product that staff can actually operate is often a better fit than a broader platform that adds permanent overhead.",
    },
  ],
  "/resources/topics/grant-management": [
    {
      q: "What is the difference between grant management and grant compliance?",
      a: "Grant management covers the broader workflow from prospecting and applications through awards and reporting. Grant compliance is the narrower post-award discipline of meeting funder terms, documenting spending, and staying audit-ready.",
    },
    {
      q: "Does GrantPipe support pre-award grant work, or just post-award?",
      a: "GrantPipe's core strength is post-award: restricted fund tracking, compliance documentation, and reporting. These pages cover the full lifecycle so you can see where pre-award discovery tools end and where post-award workflow software (like GrantPipe) begins.",
    },
  ],
  "/resources/topics/donor-operations": [
    {
      q: "What belongs in a donor-operations topic hub?",
      a: "Donor operations covers the recurring work after fundraising activity happens: clean donor records, gift processing, retention, stewardship, acknowledgments, pledge follow-up, and development reporting.",
    },
    {
      q: "Why include donor operations in a grant-funded nonprofit resource library?",
      a: "Grant-funded nonprofits still need reliable donor data and stewardship habits. The donor side often affects restricted gifts, board reporting, campaign planning, and the same finance-development handoffs that show up in grant work.",
    },
  ],
  "/resources/topics/grant-compliance": [
    {
      q: "Who is this grant-compliance hub written for?",
      a: "It is written for nonprofits receiving grants and managing the operational burden after award. It is not written for foundations or grantmakers designing applicant portals.",
    },
    {
      q: "What should a compliance-focused buyer verify first?",
      a: "Verify whether the current stack can maintain a clean line from award terms to spending documentation to reporting output. If that chain still depends on spreadsheets and side files, the software question is already commercial, not theoretical.",
    },
  ],
  "/resources/topics/restricted-fund-accounting": [
    {
      q: "Why separate restricted-fund accounting into its own topic hub?",
      a: "Because restricted-fund work sits between finance and fundraising. It is often buried inside broader accounting or grant guides even though it is one of the clearest reasons nonprofits outgrow generic systems and spreadsheet-led workflows.",
    },
    {
      q: "What is the key buying mistake in restricted-fund software evaluations?",
      a: "Treating classes, tags, or custom fields as if they automatically produce a usable fund workflow. The real question is whether staff can explain balances, linked spending, and reporting status without rebuilding the answer outside the system.",
    },
  ],
  "/free": [],
};
