import { PLAN_ENTITLEMENTS } from "../../constants";
import type { FeatureKnowledge } from "./types";

// AI feature limits are owned by PLAN_ENTITLEMENTS (the single source of truth).
// Interpolate them so teaching copy can never drift from the enforced caps.
const STARTER_AWARD_INTAKE_CAP = PLAN_ENTITLEMENTS.starter.awardIntakeMonthlyCap;

export const FEATURE_KNOWLEDGE: FeatureKnowledge[] = [
  {
    key: "grants",
    route: "/grants",
    title: "Grants",
    what: "The Grants screen is your home for grant work. You find new grants here. You track the ones you are going after. You manage the ones you won.",
    why: "Use Grants for money from funders that comes with rules or a report. Keep plain gifts in Donors. When grant money can only be spent one way, connect it to a Fund.",
    how: [
      {
        label: "Opportunities",
        action: "Open the Opportunities tab to look for new grants to apply for.",
      },
      {
        label: "Live Grants.gov",
        action:
          "Stay on Live Grants.gov to search real federal listings. Switch to Tracked/imported to see grants you added yourself.",
      },
      {
        label: "Add grant",
        action:
          "Choose Add grant to start a record for a grant you are applying for or already won.",
      },
      {
        label: "Pipeline",
        action: "Open the Pipeline tab to drag each grant through its stages, like a board.",
      },
      {
        label: "Portfolio",
        action:
          "Open the Portfolio tab to see every grant in a list and filter by status or funder.",
      },
    ],
    uiLabels: [
      "Grants",
      "Opportunities",
      "Pipeline",
      "Portfolio",
      "Live Grants.gov",
      "Tracked/imported",
      "Add grant",
      "Add to pipeline",
      "Save",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["funds", "budget_sentinel"],
    notFeatures: ["Plain donations from individuals go in Donors instead."],
  },
  {
    key: "donors",
    route: "/donors",
    title: "Donors",
    what: "The Donors screen is your list of every person and group that gives to your nonprofit.",
    why: "Use Donors for gifts from people and companies. It tracks who gives, how much, and when. Grant money that comes with funder rules goes in Grants, not here.",
    how: [
      {
        label: "Add donor",
        action: "Choose Add donor to add a new person or group who gives.",
      },
      {
        label: "Individual",
        action: "Pick Individual for a person, or Organization for a company or group.",
      },
      {
        label: "Save segment",
        action: "Use Save segment to keep a filtered list you want to open again later.",
      },
    ],
    uiLabels: [
      "Donors",
      "Add donor",
      "Individual",
      "Organization",
      "Save segment",
      "Segment name",
      "All tags",
      "All types",
    ],
    roles: ["admin", "editor", "viewer"],
    related: ["pledges", "donor_email"],
    notFeatures: ["Grant money with funder rules goes in Grants instead."],
  },
  {
    key: "pledges",
    route: "/donors/pledges",
    title: "Pledges",
    what: "The Pledges screen tracks gifts a donor promised but has not paid yet.",
    why: "A pledge is a promise to give. It shows what is still owed. It records each payment. It follows the accounting rules for promised money.",
    how: [
      {
        label: "Add pledge",
        action: "Choose Add pledge to write down a gift a donor promised.",
      },
      {
        label: "Record payment",
        action: "Use Record payment each time the donor pays part of the pledge.",
      },
      {
        label: "Write off pledge",
        action: "Use Write off pledge when a promise will not be paid.",
      },
    ],
    uiLabels: [
      "Pledges",
      "Add pledge",
      "Record payment",
      "Write off pledge",
      "Set allowance for uncollectible",
      "Installment schedule",
    ],
    roles: ["admin", "editor", "viewer"],
    related: ["donors"],
  },
  {
    key: "at_risk_donors",
    route: "/donors/at-risk",
    title: "At-Risk Donors",
    what: "The At-Risk Donors screen shows past givers who may be slipping away.",
    why: "It flags donors who have not given in a while. You can reach out before you lose them.",
    how: [
      {
        label: "Last gift",
        action: "Look at Last gift to see when each donor gave last.",
      },
      {
        label: "Lifetime giving",
        action: "Check Lifetime giving to see how much a donor has given in all.",
      },
    ],
    uiLabels: ["At-Risk Donors", "Last gift", "Lifetime giving", "Days since"],
    roles: ["admin", "editor", "viewer"],
    related: ["donors", "donor_email"],
  },
  {
    key: "donor_email",
    route: "/donors/email",
    title: "Donor Email",
    what: "The Donor Email screen lets you write and send an email to your donors.",
    why: "Use it to thank donors or share news without leaving GrantPipe.",
    how: [
      {
        label: "Recipients",
        action: "Pick your Recipients to choose who gets the email.",
      },
      {
        label: "Subject",
        action: "Write a short Subject so donors know what the email is about.",
      },
      {
        label: "Message",
        action: "Type your note in the Message box.",
      },
      {
        label: "Send",
        action: "Choose Send to email everyone you picked.",
      },
    ],
    uiLabels: ["Donor Email", "Recipients", "Subject", "Message", "Send", "Stage"],
    roles: ["admin", "editor", "viewer"],
    related: ["donors", "at_risk_donors"],
  },
  {
    key: "grants_pipeline",
    route: "/grants/pipeline",
    title: "Grant Pipeline",
    what: "The Grant Pipeline is a board. Each grant shows up as a card. The cards sit in columns by stage.",
    why: "It shows at a glance where every grant stands, and lets you move one forward as the work changes.",
    how: [
      {
        label: "Grant Pipeline",
        action:
          "On the Grant Pipeline board, drag a grant card from one column to the next. That moves it to its next stage.",
      },
      {
        label: "Discovery",
        action:
          "A grant starts in Discovery when it is just an opportunity your team is looking into.",
      },
      {
        label: "List",
        action: "Choose List to switch from the board back to the full grant list.",
      },
    ],
    uiLabels: ["Grant Pipeline", "Discovery", "Application", "Awarded", "List"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants"],
  },
  {
    key: "funds",
    route: "/funds",
    title: "Funds",
    what: "The Funds screen tracks restricted money. Use it for one purpose or program.",
    why: "When a gift or grant has spending rules, you make a Fund. The Fund keeps that money separate. You always know what is left, and that you followed the rules.",
    how: [
      {
        label: "Add fund",
        action: "Choose Add fund to make a new fund for money that has spending rules.",
      },
      {
        label: "Fund name",
        action: "Give the fund a clear Fund name so your team knows what it is for.",
      },
      {
        label: "Open Budget Sentinel",
        action: "Use Open Budget Sentinel to check spending against the fund's limits.",
      },
    ],
    uiLabels: [
      "Funds",
      "Add fund",
      "Fund name",
      "Open Budget Sentinel",
      "All fund types",
      "Description",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "programs"],
    notFeatures: ["Plain unrestricted gifts just go in Donors."],
  },
  {
    key: "funders",
    route: "/funders",
    title: "Funders",
    what: "The Funders screen is your list of the foundations, companies, and government offices that give grants.",
    why: "It keeps each funder's details in one place. You learn who to ask and what they like to fund.",
    how: [
      {
        label: "Add funder",
        action: "Choose Add funder to add a new foundation, company, or government office.",
      },
      {
        label: "Funding priorities",
        action: "Write the funder's Funding priorities so you remember what they like to fund.",
      },
    ],
    uiLabels: [
      "Funders",
      "Add funder",
      "Funder name",
      "Funding priorities",
      "Foundation",
      "Government",
      "Corporate",
      "Website",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants"],
  },
  {
    key: "programs",
    route: "/programs",
    title: "Programs",
    what: "The Programs screen tracks the real work your nonprofit does, like a tutoring class or a food bank.",
    why: "A program is what the money pays for. This screen shows each program's budget and how much it has spent.",
    how: [
      {
        label: "Add program",
        action: "Choose Add program to set up a new program you run.",
      },
      {
        label: "Budget vs actual",
        action: "Check Budget vs actual to compare planned money against what was really spent.",
      },
    ],
    uiLabels: [
      "Programs",
      "Add program",
      "Budget vs actual",
      "Code",
      "Owner",
      "All statuses",
      "Active",
      "Archived",
    ],
    roles: ["admin", "editor", "viewer"],
    related: ["funds", "grants"],
  },
  {
    key: "import",
    route: "/import",
    title: "Import",
    what: "Import is where you bring your old data into GrantPipe from a spreadsheet.",
    why: "If your donors or grants live in another tool, bring them here all at once. That beats typing each one by hand.",
    how: [
      {
        label: "Use template",
        action:
          "Choose Use template to download a spreadsheet already set up with the right columns.",
      },
      {
        label: "Generic CSV",
        action: "Pick Generic CSV if you are bringing in your own spreadsheet file.",
      },
      {
        label: "Rows needing attention",
        action: "Check Rows needing attention to fix any lines that did not import cleanly.",
      },
    ],
    uiLabels: [
      "Import",
      "Use template",
      "Generic CSV",
      "Rows needing attention",
      "CSV is just a spreadsheet file format.",
    ],
    roles: ["admin", "editor"],
    related: ["donors", "grants"],
  },
  {
    key: "award_intake",
    route: "/award-intake/$extractionId",
    title: "AI Award Intake",
    what: `AI Award Intake reads your award letter for you. It pulls out the grant details and fills them in. You start it from the New grant flow on the Grants screen. It comes with every paid plan.`,
    why: `It saves you from typing each field by hand. The AI does a first pass. Then you check every field and confirm before it saves. Starter gives you ${STARTER_AWARD_INTAKE_CAP} award intakes each month. Growth and up give you unlimited intakes.`,
    how: [
      {
        label: "AI Award Intake",
        action:
          "Upload your award letter from the New grant flow. The AI reads it and opens this AI Award Intake review screen.",
      },
      {
        label: "Save edit",
        action:
          "Check each field the AI filled in. Fix anything that looks wrong, then use Save edit.",
      },
      {
        label: "Commit reviewed setup",
        action:
          "When every field looks right, choose Commit reviewed setup to create the grant record.",
      },
    ],
    uiLabels: ["AI Award Intake", "Save edit", "Commit reviewed setup"],
    roles: ["admin", "editor"],
    related: ["grants", "import"],
    notFeatures: [
      "Bulk spreadsheet imports go through Import instead.",
      "The AI never saves a grant on its own. You confirm every field first.",
    ],
  },
  {
    key: "accounting_home",
    route: "/accounting",
    title: "Accounting",
    what: "The Accounting screen is the home base for your books. It shows your cash, your open period, and your latest journal entries.",
    why: "It puts the money side of your nonprofit in one place. You can see where you stand. Your books stay ready for an audit.",
    how: [
      {
        label: "New journal entry",
        action: "Choose New journal entry to record money moving in or out.",
      },
      {
        label: "View all",
        action: "Use View all to open the full list of journal entries.",
      },
      {
        label: "Enable Double-Entry Accounting",
        action:
          "If your books are not set up yet, choose Enable Double-Entry Accounting to turn on full bookkeeping.",
      },
    ],
    uiLabels: [
      "Accounting",
      "New journal entry",
      "Recent Journal Entries",
      "View all",
      "Cash Balance",
      "Open Fiscal Period",
      "Bank Accounts",
      "Net Assets",
      "Enable Double-Entry Accounting",
      "Preview & enable",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["journal", "chart_of_accounts", "bank_accounts"],
  },
  {
    key: "account_ledger",
    route: "/accounting/ledger",
    title: "Account Ledger",
    what: "The Account Ledger shows every entry for one account. Think of it as a bank statement for that line in your books.",
    why: "It lets you check the full history of one account. You can prove each number, which is what auditors want.",
    how: [
      {
        label: "Account",
        action: "Use the Account picker to choose which account you want to see.",
      },
      {
        label: "From",
        action: "Set the From date to pick where the list starts.",
      },
      {
        label: "Export CSV",
        action: "Choose Export CSV to download the entries as a spreadsheet.",
      },
    ],
    uiLabels: ["Account Ledger", "Account", "From", "To", "Export CSV", "Pick an account"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["chart_of_accounts", "trial_balance"],
  },
  {
    key: "trial_balance",
    route: "/accounting/trial-balance",
    title: "Trial Balance",
    what: "The Trial Balance lists every account with its total, so you can check that debits and credits match.",
    why: "When the two columns are equal, your books are in balance. This is a quick health check before you close a period or run reports.",
    how: [
      {
        label: "As of date",
        action: "Set the As of date to pick the day you want totals for.",
      },
      {
        label: "Export CSV",
        action: "Choose Export CSV to save the trial balance as a spreadsheet.",
      },
    ],
    uiLabels: [
      "Trial Balance",
      "As of date",
      "Export CSV",
      "Code",
      "Name",
      "Debit Balance",
      "Credit Balance",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["account_ledger", "statement_of_financial_position"],
  },
  {
    key: "chart_of_accounts",
    route: "/accounting/chart-of-accounts",
    title: "Chart of Accounts",
    what: "The Chart of Accounts is the list of all the buckets your money goes into, like cash, grants, and payroll.",
    why: "Every entry in your books points to one of these accounts. A clean list keeps your reports clear and correct.",
    how: [
      {
        label: "Add account",
        action: "Choose Add account to make a new bucket for your books.",
      },
    ],
    uiLabels: ["Chart of Accounts", "Add account", "Go to dashboard"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["journal", "account_ledger"],
  },
  {
    key: "journal",
    route: "/accounting/journal",
    title: "Journal",
    what: "The Journal is the running list of every entry you record in your books, in order.",
    why: "It is the first place money is written down. Each entry here flows into your accounts and your reports.",
    how: [
      {
        label: "New Entry",
        action: "Choose New Entry to record money moving in or out.",
      },
      {
        label: "View chart of accounts",
        action: "Use View chart of accounts to see the buckets your entries can use.",
      },
    ],
    uiLabels: ["Journal", "New Entry", "New entry", "View chart of accounts"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["chart_of_accounts", "fiscal_periods"],
  },
  {
    key: "fiscal_periods",
    route: "/accounting/periods",
    title: "Fiscal Periods",
    what: "Fiscal Periods are the time blocks your books are split into, like quarters or a budget year.",
    why: "Closing a period locks its numbers so they cannot change. This keeps your past reports steady and audit-ready.",
    how: [
      {
        label: "Add period",
        action: "Choose Add period to add a new block of time for your books.",
      },
      {
        label: "Pre-close checklist",
        action: "Read the Pre-close checklist before you close a period to catch any problems.",
      },
    ],
    uiLabels: [
      "Fiscal Periods",
      "Add period",
      "Pre-close checklist",
      "Add fiscal period",
      "Edit fiscal period",
      "Name",
      "Start Date",
      "End Date",
      "Status",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["journal", "accounting_home"],
  },
  {
    key: "recurring_templates",
    route: "/accounting/recurring",
    title: "Recurring Templates",
    what: "Recurring Templates save journal entries you make over and over, like monthly rent.",
    why: "Instead of typing the same entry each month, you set it once and reuse it. That saves time and avoids slips.",
    how: [
      {
        label: "Add template",
        action: "Choose Add template to save an entry you will use again and again.",
      },
    ],
    uiLabels: ["Recurring Templates", "Add template"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["journal"],
  },
  {
    key: "bank_accounts",
    route: "/accounting/bank",
    title: "Bank Accounts",
    what: "The Bank Accounts screen lists the bank accounts you have added to GrantPipe.",
    why: "Match your bank statement against your books. Then you can spot anything that does not line up.",
    how: [
      {
        label: "Add account",
        action: "Choose Add account to add a bank account. Then upload a statement to match it.",
      },
    ],
    uiLabels: ["Bank Accounts", "Add account", "Add bank account"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["accounting_home"],
  },
  {
    key: "accounting_integrations",
    route: "/accounting/integrations",
    title: "Accounting Integrations",
    what: "This screen is off right now.",
    why: "GrantPipe has its own books. It does not link to outside accounting apps right now.",
    how: [
      {
        label: "QuickBooks Online is not currently available",
        action: "Use GrantPipe accounting for your records. Keep outside books separate for now.",
      },
    ],
    uiLabels: ["QuickBooks Online is not currently available"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["accounting_home"],
  },
  {
    key: "anomaly_detector",
    route: "/accounting/anomalies",
    title: "Anomaly Detector",
    what: "The Anomaly Detector watches your books. It flags entries that look odd. An example is a number far bigger than usual.",
    why: "It catches mistakes and risks early. It finds them before an audit does. This feature needs the Audit-Ready plan.",
    how: [
      {
        label: "Anomaly Detector",
        action: "Open the Anomaly Detector to review any entries it has flagged.",
      },
    ],
    uiLabels: ["Anomaly Detector", "Audit-Ready plan required", "No anomalies found"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["accounting_home"],
  },
  {
    key: "statement_of_activities",
    route: "/accounting/reports/activities",
    title: "Statement of Activities",
    what: "The Statement of Activities is the nonprofit version of an income statement. It shows money in and money out over a span of time.",
    why: "Boards, funders, and auditors expect this report. GrantPipe builds it straight from your books.",
    how: [
      {
        label: "Generate report",
        action: "Choose Generate report to build the statement for the dates you pick.",
      },
      {
        label: "Statement of activities help",
        action: "Open Statement of activities help if you are not sure what a line means.",
      },
    ],
    uiLabels: ["Statement of Activities", "Generate report", "Statement of activities help"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["statement_of_financial_position", "statement_of_functional_expenses"],
  },
  {
    key: "statement_of_financial_position",
    route: "/accounting/reports/financial-position",
    title: "Statement of Financial Position",
    what: "The Statement of Financial Position is the nonprofit version of a balance sheet. It shows what you own and what you owe on one day.",
    why: "It tells your board and funders how healthy your nonprofit is. GrantPipe builds it from your books.",
    how: [
      {
        label: "Generate report",
        action: "Choose Generate report to build the statement as of the date you pick.",
      },
    ],
    uiLabels: ["Statement of Financial Position", "Generate report"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["statement_of_activities", "trial_balance"],
  },
  {
    key: "statement_of_functional_expenses",
    route: "/accounting/reports/functional-expenses",
    title: "Statement of Functional Expenses",
    what: "The Statement of Functional Expenses sorts your spending by purpose, like programs, fundraising, and admin.",
    why: "Funders and the IRS Form 990 want to see this split. GrantPipe builds it from your books.",
    how: [
      {
        label: "Generate report",
        action: "Choose Generate report to build the statement for the dates you pick.",
      },
      {
        label: "Functional expenses help",
        action: "Open Functional expenses help to learn how the buckets work.",
      },
    ],
    uiLabels: ["Statement of Functional Expenses", "Generate report", "Functional expenses help"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["statement_of_activities"],
  },
  {
    key: "dashboard",
    route: "/dashboard",
    title: "Dashboard",
    what: "The Dashboard is your home screen. It shows what needs doing, your key numbers, and what is coming up.",
    why: "It gives you one quick read on your nonprofit each morning, so you know where to start.",
    how: [
      {
        label: "Actions",
        action: "Open the Actions tab to see tasks that need your attention.",
      },
      {
        label: "Metrics",
        action: "Open the Metrics tab to check your key numbers.",
      },
      {
        label: "Agenda",
        action: "Open the Agenda tab to see what is due soon.",
      },
    ],
    uiLabels: [
      "Dashboard",
      "Actions",
      "Metrics",
      "Agenda",
      "Manage donors",
      "Manage grants",
      "Manage funds",
      "Journal entry",
    ],
    roles: ["admin", "editor", "viewer"],
    related: ["calendar", "deadline_radar"],
  },
  {
    key: "activity_log",
    route: "/activity",
    title: "Activity Log",
    what: "The Activity Log is a running record of every change made in GrantPipe, and who made it.",
    why: "It is your audit trail. When you need to know what changed and when, this is where you look.",
    how: [
      {
        label: "Filters",
        action: "Use Filters to narrow the log to the changes you care about.",
      },
      {
        label: "Entity type",
        action: "Pick an Entity type to see changes for just donors, grants, or funds.",
      },
    ],
    uiLabels: ["Activity Log", "Filters", "Entity type", "All types"],
    roles: ["admin", "editor", "viewer"],
    related: ["dashboard"],
  },
  {
    key: "calendar",
    route: "/deadlines/calendar",
    title: "Calendar",
    what: "The Calendar shows your tasks and deadlines laid out by date.",
    why: "It helps you see what is due and when, so nothing slips past you.",
    how: [
      {
        label: "Upcoming",
        action: "Check Upcoming to see tasks that are still ahead.",
      },
      {
        label: "Overdue",
        action: "Check Overdue to find anything you missed.",
      },
    ],
    uiLabels: ["Calendar", "Upcoming", "Overdue", "Complete"],
    roles: ["admin", "editor", "viewer"],
    related: ["deadline_radar", "dashboard"],
  },
  {
    key: "notifications",
    route: "/notifications",
    title: "Notifications",
    what: "The Notifications screen is your inbox for alerts from GrantPipe, like a deadline coming up.",
    why: "It keeps important news in one spot so you do not miss it.",
    how: [
      {
        label: "Inbox",
        action: "Open the Inbox to read your latest alerts.",
      },
      {
        label: "Preferences",
        action: "Use Preferences to choose which alerts you want.",
      },
    ],
    uiLabels: ["Notifications", "Inbox", "Unread", "Read", "Preferences"],
    roles: ["admin", "editor", "viewer"],
    related: ["dashboard"],
  },
  {
    key: "deadline_radar",
    route: "/deadlines",
    title: "Deadline Radar",
    what: "The Deadline Radar gathers every deadline across your grants and compliance into one list.",
    why: "Missing a grant or report deadline can cost you money. The radar keeps each one in view.",
    how: [
      {
        label: "Overdue",
        action: "Check Overdue first to handle anything you missed.",
      },
      {
        label: "Due today",
        action: "Check Due today to see what needs doing now.",
      },
      {
        label: "Upcoming",
        action: "Check Upcoming to plan ahead.",
      },
    ],
    uiLabels: ["Deadline Radar", "All", "Overdue", "Due today", "Upcoming"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["calendar", "grants"],
  },
  {
    key: "reports",
    route: "/reports",
    title: "Reports",
    what: "The Reports screen builds the reports your board and funders ask for. Think fundraising totals or fund balances.",
    why: "It turns your data into clean reports in a few clicks, so you do not build them by hand in a spreadsheet.",
    how: [
      {
        label: "Generate your first report",
        action: "Choose Generate your first report to start a new report.",
      },
      {
        label: "How reports work",
        action: "Open How reports work if you are new to this screen.",
      },
    ],
    uiLabels: [
      "Reports",
      "Generate your first report",
      "How reports work",
      "Executive snapshot",
      "Fundraising",
      "Grant pipeline",
      "Fund balances",
      "Compliance deadlines",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["report_builder", "report_drafts"],
  },
  {
    key: "report_builder",
    route: "/reports/builder",
    title: "Report Builder",
    what: "The Report Builder lets you pick the exact columns and filters you want, then save it as your own report.",
    why: "When a stock report is not enough, you build the one you need. This feature needs the Enterprise plan.",
    how: [
      {
        label: "Columns",
        action: "Use Columns to choose what shows up in your report.",
      },
      {
        label: "Custom fields",
        action: "Add Custom fields to include data you track yourself.",
      },
    ],
    uiLabels: ["Report Builder", "Columns", "Custom fields"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["reports"],
  },
  {
    key: "report_drafts",
    route: "/reports/drafts",
    title: "Proposal and Report Drafts",
    what: "This screen drafts grant writing for you, like a proposal or a report to a funder.",
    why: "It gives you a strong first draft built from your own grant data. You start writing faster.",
    how: [
      {
        label: "Proposal narrative",
        action: "Choose Proposal narrative to draft a pitch for a new grant.",
      },
      {
        label: "Interim report",
        action: "Choose Interim report to draft a mid-grant update.",
      },
      {
        label: "Final report",
        action: "Choose Final report to draft a wrap-up for a funder.",
      },
    ],
    uiLabels: [
      "Proposal and Report Drafts",
      "Proposal narrative",
      "Interim report",
      "Final report",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "reports"],
  },
  {
    key: "ask_ledger",
    route: "/reports/ask-ledger",
    title: "Ask Ledger",
    what: "Ask Ledger lets you type a money question. It pulls the answer from your books. This AI tool is on Growth plans and up.",
    why: "You get a sourced answer without building a report. Each number links back to its source. Check Sources before you use the answer. Growth and up have unlimited questions. Starter includes AI award intake instead.",
    how: [
      {
        label: "Ask Ledger",
        action: "Type your question, then choose Ask Ledger to get an answer.",
      },
      {
        label: "Sources",
        action: "Check the Sources under the answer to see where each number came from.",
      },
    ],
    uiLabels: ["Ask Ledger", "Answer", "Sources", "Safeguards", "Grounded answer"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["reports", "accounting_home"],
    notFeatures: ["It does not change your books. It only reads them to answer."],
  },
  {
    key: "events",
    route: "/events",
    title: "Events",
    what: "The Events screen plans your fundraisers and gatherings, like a gala or a donor lunch.",
    why: "It keeps each event and its donors in one place. You see what your events bring in.",
    how: [
      {
        label: "Add event",
        action: "Choose Add event to plan a new event.",
      },
      {
        label: "How events work",
        action: "Open How events work if this screen is new to you.",
      },
    ],
    uiLabels: ["Events", "Add event", "Add your first event", "How events work"],
    roles: ["admin", "editor", "viewer"],
    related: ["donors"],
  },
  {
    key: "cash",
    route: "/payments",
    title: "Payments",
    what: "The Payments screen handles payment requests, like asking a funder to send the next round of grant money.",
    why: "It tracks each request from draft to paid, so you know what money is on the way. Growth plans and up include indirect cost rules and reimbursement evidence packets.",
    how: [
      {
        label: "Add your first request",
        action: "Choose Add your first request to ask for a payment.",
      },
      {
        label: "How payment requests work",
        action: "Open How payment requests work to learn the steps.",
      },
    ],
    uiLabels: [
      "Payments",
      "Add your first request",
      "Draft",
      "Approved",
      "Paid",
      "Submitted",
      "Rejected",
      "Closed",
      "How payment requests work",
    ],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "funds"],
  },
  {
    key: "evidence_bundles",
    route: "/evidence-bundles",
    title: "Evidence Bundles",
    what: "Evidence Bundles gather the documents that prove how you spent grant money. They keep it all in one package.",
    why: "Sometimes a funder or auditor asks for proof. You hand them a ready bundle instead of searching through files.",
    how: [
      {
        label: "Add bundle",
        action: "Choose Add bundle to start a new package of proof.",
      },
    ],
    uiLabels: ["Evidence Bundles", "Add bundle"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "subrecipients"],
  },
  {
    key: "subrecipients",
    route: "/subrecipients",
    title: "Subrecipient Monitoring",
    what: "Subrecipient Monitoring tracks other groups you pass grant money to, and checks they follow the rules.",
    why: "When you share federal money, you must watch how the other group spends it. This screen keeps that on record.",
    how: [
      {
        label: "Add subrecipient",
        action: "Choose Add subrecipient to add a group you fund.",
      },
      {
        label: "Clear filters",
        action: "Use Clear filters to reset the list to everyone.",
      },
    ],
    uiLabels: ["Subrecipient Monitoring", "Add subrecipient", "Clear filters"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "evidence_bundles"],
  },
  {
    key: "settings",
    route: "/settings",
    title: "Settings",
    what: "Settings is where you set up your nonprofit's account, your team, your plan, and your custom fields.",
    why: "It is the control room for how GrantPipe works for your whole organization.",
    how: [
      {
        label: "Organization",
        action: "Open Organization to set your nonprofit's name and details.",
      },
      {
        label: "Team",
        action: "Open Team to invite people and set what they can do.",
      },
      {
        label: "Billing",
        action: "Open Billing to manage your plan and payments.",
      },
    ],
    uiLabels: ["Settings", "Organization", "Team", "Portal access", "Billing", "Custom fields"],
    roles: ["admin"],
    related: ["settings_team", "settings_entities", "settings_portal_access"],
  },
  {
    key: "settings_team",
    route: "/settings/team",
    title: "Team",
    what: "The Team settings let you invite coworkers and choose what each person is allowed to do.",
    why: "Roles keep your data safe. A viewer can read, an editor can change records, and an admin runs the account.",
    how: [
      {
        label: "Invite settings",
        action: "Open the Invite settings section to start a new invite.",
      },
      {
        label: "Invite type",
        action:
          "Pick the Invite type. Choose Shareable link for a link you can send. Choose Specific email to invite one email address.",
      },
      {
        label: "Base role",
        action:
          "Set the Base role to choose what the new person can do. A viewer can read. An editor can change records. An admin runs the account.",
      },
    ],
    uiLabels: [
      "Invite settings",
      "Invite type",
      "Shareable link",
      "Specific email",
      "Base role",
      "Email",
      "Invite link",
    ],
    roles: ["admin"],
    related: ["settings"],
  },
  {
    key: "settings_entities",
    route: "/settings/entities",
    title: "Entities",
    what: "Entities are the legal groups, sponsored projects, or managed groups your nonprofit tracks inside one GrantPipe account.",
    why: "Use this when one org needs clean records for more than one entity. It keeps grant, fund, and accounting work tied to the right part of the org.",
    how: [
      {
        label: "Add entity",
        action:
          "Choose Add entity to add a related legal entity, sponsored project, or managed entity.",
      },
      {
        label: "Entity type",
        action: "Pick the Entity type that matches the group you are adding.",
      },
      {
        label: "Parent entity",
        action: "Use Parent entity when this new entity sits under another entity in your org.",
      },
      {
        label: "Fiscal sponsor model",
        action: "For a sponsored project, pick the Fiscal sponsor model before you save.",
      },
      {
        label: "Archive",
        action: "Use Archive to hide an active non-default entity you no longer need.",
      },
    ],
    uiLabels: [
      "Entities",
      "Add entity",
      "Entity name",
      "Entity type",
      "Parent entity",
      "Fiscal sponsor model",
      "Active entities",
      "Archive",
      "Related legal entity",
      "Sponsored project",
      "Managed entity",
    ],
    roles: ["admin"],
    related: ["settings", "settings_team"],
    notFeatures: ["Only admins can manage entities."],
  },
  {
    key: "settings_portal_access",
    route: "/settings/portal-access",
    title: "Portal Access",
    what: "Portal Access lets you give an outside auditor a safe, read-only link into just the records they need.",
    why: "Auditors can check your work without a full account and without seeing everything. You stay in control of what they view.",
    how: [
      {
        label: "Invite a reviewer",
        action: "Choose Invite a reviewer to set up an outside auditor.",
      },
      {
        label: "Portal link",
        action: "Share the Portal link with your reviewer so they can sign in.",
      },
    ],
    uiLabels: ["Portal link", "Invite a reviewer", "Reviewer", "Email", "Name"],
    roles: ["admin"],
    related: ["settings", "activity_log"],
  },
  {
    key: "budget_sentinel",
    route: "/grants/sentinel",
    title: "Budget Sentinel",
    what: "Budget Sentinel watches each grant budget for spending that drifts off track.",
    why: "It warns you when a line gets close to its limit. You can fix the problem before a funder sees it. Starter plans and up include budget exports.",
    how: [
      {
        label: "Severity",
        action: "Read the Severity tag to see how urgent each warning is.",
      },
      {
        label: "Amount at risk",
        action: "Check Amount at risk to see how much money the issue could cost.",
      },
    ],
    uiLabels: ["Budget Sentinel", "Compliance", "Severity", "Amount at risk"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["grants", "grants_pipeline"],
  },
  {
    key: "journal_entry_new",
    route: "/accounting/journal/new",
    title: "New Journal Entry",
    what: "This screen is where you add a journal entry by hand.",
    why: "Most entries post on their own. Use this when you need to record one yourself. Each entry must balance before you can post it.",
    how: [
      {
        label: "Add Line",
        action: "Choose Add Line to add a row for each account.",
      },
      {
        label: "Post entry",
        action: "Choose Post entry once your debits and credits match.",
      },
    ],
    uiLabels: ["New Journal Entry", "Line Items", "Add Line", "Post entry"],
    roles: ["admin", "editor"],
    related: ["journal", "chart_of_accounts"],
  },
  {
    key: "expense_allocation_studio",
    route: "/accounting/studios/functional-expense-allocation",
    title: "Expense Allocation Studio",
    what: "The Expense Allocation Studio splits shared costs across your programs.",
    why: "Some bills help more than one program at once. This tool spreads each cost in a fair way. That keeps your functional expense report correct.",
    how: [
      {
        label: "Add allocation base",
        action: "Choose Add allocation base to set a rule for how to split a cost.",
      },
      {
        label: "Bind account",
        action: "Choose Bind account to tie an expense account to that rule.",
      },
    ],
    uiLabels: [
      "Expense Allocation Studio",
      "Functional class",
      "Add allocation base",
      "Bind account",
    ],
    roles: ["admin", "editor"],
    related: ["journal", "chart_of_accounts"],
  },
  {
    key: "help_center",
    route: "/help",
    title: "Help",
    what: "The Help center is where you learn to use GrantPipe.",
    why: "You can watch a short tour and read quick guides. You can also search for the exact task you need.",
    how: [
      {
        label: "Watch product tour",
        action: "Choose Watch product tour to see the whole app once.",
      },
      {
        label: "Search help",
        action: "Use Search help to find a guide by a word like import.",
      },
      {
        label: "Email support",
        action: "Choose Email support when you still need a person.",
      },
    ],
    uiLabels: ["Help", "Help center", "Watch product tour", "Search help", "Email support"],
    roles: ["admin", "editor", "viewer", "auditor"],
    related: ["dashboard"],
  },
];
