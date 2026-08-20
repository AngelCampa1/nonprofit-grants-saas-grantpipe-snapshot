# Handoff: GrantPipe Full App UI

> [!NOTE]
> The prototype file bundle this document describes (`GrantPipe.html` and the `gp-*.jsx`
> component files) was removed from this snapshot during portfolio curation. They were raw
> React/Babel prototype source, not documentation, and the design-token and component-map
> content below is kept for what it records rather than as an index of files still present.
> The design system it documents shipped into `packages/ui`; that is the real, running
> version of the tokens and components described here.

## Overview

This is a **complete high-fidelity interactive prototype** of the GrantPipe web application — a nonprofit grant and donor management platform. It covers all primary screens, navigation shell, and modal workflows. The goal of this handoff is to give an engineer working in the real `AngelCampa1/grantpipe` codebase a precise spec to implement each screen using existing UI kit components and patterns.

## About the Design Files

The files in this bundle (`GrantPipe.html` + all `gp-*.jsx` files) are **design references built in plain React/Babel HTML** — not production code. They run standalone in a browser for reference, but should not be shipped as-is. The task is to **recreate these designs in the existing `apps/web` app** using:

- The existing `@grantpipe/ui` component library (`packages/ui/`)
- TanStack Router for routing
- Tailwind CSS v4 with the token system in `packages/ui/src/globals.css`
- The existing shell: `AppShell`, `AppSidebar`, `AppTopbar`, `CommandPalette` from `apps/web/src/components/shell/`

## Fidelity

**High-fidelity.** Colors, typography, spacing, component shapes, interaction states, and copy are all intentional and should be matched precisely. Use exact token values from `globals.css`. The prototype uses the real logo SVG and real nav structure from `nav.ts`.

---

## Design Tokens

All from `packages/ui/src/globals.css` — do not invent new values.

### Colors

```
--primary:           oklch(0.42 0.13 165)   /* emerald */
--primary-hover:     oklch(0.38 0.13 165)
--primary-fg:        oklch(0.99 0.006 165)
--primary-soft:      oklch(0.94 0.05 155)
--primary-soft-fg:   oklch(0.35 0.12 155)

--background:        oklch(0.99 0.006 165)
--foreground:        oklch(0.2 0.012 165)
--card:              #ffffff
--muted:             oklch(0.95 0.007 165)
--muted-foreground:  oklch(0.44 0.01 220)
--border:            oklch(0.88 0.008 220)
--accent:            oklch(0.94 0.014 155)
--accent-foreground: oklch(0.22 0.012 155)

--success:           oklch(0.52 0.15 155)
--warning:           oklch(0.72 0.16 75)
--destructive:       oklch(0.52 0.2 25)
--info:              oklch(0.55 0.17 250)

/* Donor stage badges */
--stage-cultivation:   bg #dbeafe / fg #1d4ed8
--stage-solicitation:  bg #fef3c7 / fg #b45309
--stage-stewardship:   bg #dcfce7 / fg #15803d
--stage-donor:         bg #d1fae5 / fg #047857
--stage-lapsed:        bg #ffe4e6 / fg #be123c

/* Grant stage badges */
--gs-research:   bg #f0fdf4 / fg #15803d
--gs-drafting:   bg #eff6ff / fg #1d4ed8
--gs-submitted:  bg #fef3c7 / fg #b45309
--gs-awarded:    bg #d1fae5 / fg #047857
--gs-reporting:  bg #fce7f3 / fg #9d174d
--gs-closed:     bg #f1f5f9 / fg #64748b
```

### Sidebar (dark emerald)

```
background: #0c2318
text:        rgba(255,255,255,0.90)
text-muted:  rgba(255,255,255,0.48)
active-bg:   rgba(16,185,129,0.18)
active-fg:   #6ee7b7
hover-bg:    rgba(255,255,255,0.07)
section-fg:  rgba(255,255,255,0.32)
border:      rgba(255,255,255,0.10)
```

### Typography

```
font-display:  'Sora', system-ui, sans-serif         /* all headings */
font-body:     'IBM Plex Sans', system-ui, sans-serif /* body text */
font-mono:     'IBM Plex Mono', ui-monospace, monospace /* amounts, dates, codes */
```

### Layout

```
sidebar-width:            248px   (var(--spacing-layout-sidebar))
sidebar-width-collapsed:   64px   (var(--spacing-layout-sidebar-collapsed))
topbar-height:             56px   (var(--spacing-layout-topbar-height))
```

### Radii

```
--radius-sm: 4px
--radius:    8px   (cards, inputs, buttons)
--radius-lg: 12px  (modals, sheets)
--radius-xl: 16px
```

### Shadows

```
--shadow-sm: 0 1px 2px rgba(0,0,0,0.06)
--shadow:    0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.08)
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.10)
```

---

## App Shell

### Sidebar (`AppSidebar`)

Already implemented. Ensure the following behavior from the design:

- **Dark background** `#0c2318` — not the default light sidebar
- **Collapse toggle** (chevron button) in the header, top-right of sidebar
- **Active state**: `rgba(16,185,129,0.18)` background, `#6ee7b7` text and icon color
- **Section labels** are collapsible — clicking the label toggles the section items; collapsed sections show a count badge
- **Pinned items** (Help) stay at the bottom regardless of section collapse
- **User footer**: avatar + name + role, "more" icon, hover reveals a dropdown

Nav sections (match `nav.ts` exactly):

1. _(no label)_: Dashboard
2. **Fundraising**: Donors, Grants, Funders, Events, Calendar
3. **Compliance**: Funds, Obligations, Programs, Subrecipients, Reports, Cash, Activity
4. **Accounting** _(collapsed by default)_: Overview, Journal, Ledger, Trial Balance, Fiscal Periods, Bank Accounts, Integrations
5. **Account**: Import, Notifications, Settings — plus Help (pinned)

### Topbar (`AppTopbar`)

- Fixed, 56px tall, white background, 1px bottom border `var(--border)`
- Left: breadcrumb trail (current section > current page), font-size 13px
- Right: page-specific action buttons → Search button (shows ⌘K hint) → notification bell (with unread dot)
- Search button: `var(--muted)` background, border, "Search" label + `⌘K` kbd chip

### Command Palette

- Triggered by ⌘K or clicking the search button
- Full-screen backdrop with blur
- 540px wide panel, centered, top 18% of viewport
- Groups: **Navigate** (all routes) and **Create** (all modal triggers)
- Keyboard navigation: ↑↓ arrows, Enter to run, Esc to close
- Active item: `var(--accent)` background, primary-colored icon

---

## Screens

### 1. Dashboard (`/dashboard`)

Three views selectable via a segmented `ViewToggle` in the top-right:

#### View A — Actions (default)

Layout: `grid-template-columns: 1fr 340px`

**Left column (top → bottom):**

- 4-column stat grid — cards with `Stat` component: Raised YTD, Active grants, Donors, Compliance score
- "Needs attention" card — colored left rail (4px wide, danger/warning/info) per urgency, click row navigates to relevant screen
- "Recent activity" card — 5 rows, `grid-cols: 110px 100px 1fr`, mono timestamp

**Right column (top → bottom):**

- "Fund balances" card — list of 5 funds with name, restriction label, available amount (mono), and a 4px progress bar; bar color: danger if <5%, warning if <50%, primary otherwise
- "Quick actions" card — 5 buttons in a column, `var(--muted)` background, Award intake uses `var(--primary-soft)` highlight

#### View B — Metrics

- 4-column stat grid (same as A but larger padding)
- 3-column sparkline chart cards (SVG polyline, dot per datapoint)
- 2-column bottom: Top donors table + Grants in flight list

#### View C — Agenda

Layout: `grid-template-columns: 1fr 320px`

- Left: date-grouped list — date label col (140px, `var(--muted)` bg) + items col; today row uses `var(--primary-soft)` bg
- Right: Today card (AlertBanner for urgent items) + Period status card (checklist with icons)

---

### 2. Donors (`/donors`)

**List view** (default):

- Filter bar: `Input` (search, 240px) + filter pills (All/Active/Lapsed/Major/Recurring) + `ViewToggle` (List/Board)
- Table columns: Donor (avatar 30px + name + email), Stage (badge), Last gift (mono right-align), Last date, Lifetime (mono right-align), Next action, chevron
- Row click → navigate to `/donors/:id`

**Board/Kanban view:**

- 5 columns: Cultivation, Solicitation, Stewardship, Donor, Lapsed
- Each column: stage badge + count, then donor cards (avatar + name + next action + last gift amount)
- Empty columns: dashed border placeholder

### 3. Donor Detail (`/donors/:id`)

Header: breadcrumb + name + action buttons (Edit, Email, Log gift)

4-column stat row: Lifetime giving (primary color), Last gift + date, Giving years, Stage badge

Tabs: **Overview** | **Gifts** (count) | **Activity** | **Documents** (count)

**Overview tab** — 2-column grid:

- Left: Contact card (icon + label + value rows for email, phone, org, source) + tags
- Right: Next action card (primary-soft banner) + Notes card

**Gifts tab:** Table — Date, Amount (mono right-align), Fund, Method, Type

**Activity tab:** Grid rows — 120px date (mono), 120px actor (bold), 1fr action text

**Documents tab:** EmptyState with upload button

---

### 4. Grants (`/grants`)

Filter bar: Input (search 260px) + `ViewToggle` (Pipeline/List) + action buttons (Award intake, New grant)

**Kanban view** (default):

- 6 columns: Researching, Drafting, Submitted, Awarded, Reporting, Closed
- Column header: stage name (colored per stage), count badge, total value (mono, hidden if $0)
- Grant cards: name (bold), funder (muted), amount (mono bold), due date (danger if reporting)
- `repeat(6, 1fr)` grid with `gap: 10px`

**List view:**

- Table — Grant, Funder (muted), Stage (badge), Amount (mono right), Next deadline, chevron

### 5. Grant Detail (`/grants/:id`)

Layout: `display: flex` — main pane (flex:1, scrollable) + right sidebar (272px, fixed, border-left)

**Main pane:**

- Breadcrumb + title + stage badge + amount in header actions
- **Stage progress strip**: horizontal stepper showing Research→Drafting→Submitted→Awarded→Reporting stages with connector lines; done = filled primary circle + check, active = outlined with ring, future = muted
- Tabs: Overview | Budget | Reports (count) | Documents | Activity

**Overview tab:** AlertBanner if reporting-stage + description card + 2-column (period, reporting requirements)

**Budget tab:**

- 3-column stat row: Award, Spent, Remaining
- Budget vs actual: `grid-cols: 140px 1fr 90px 90px` — category, progress bar (danger if >95%, warning if >75%), actual, budget

**Reports tab:** List of submitted reports with file icon, name, date, status badge, download button

**Right sidebar — Linked context:**

- 4 cards stacked: Fund (name + allocation + link), Funder (avatar + name + cumulative), Program officer (avatar + name + last contact), Matched donors (count + link)
- 1 card: Key dates (Period, Reporting requirements, Restrictions) — label/value rows

---

### 6. Funders (`/funders`)

3-column card grid. Each card:

- Avatar (40px) + name (bold 14.5px) + type badge
- 3-column stat row: Total given (primary, mono), Active grants, Last contact
- Hover → navigate to funder detail

### 7. Funder Detail (`/funders/:id`)

- 4-column stat row: Total given, Active grants, Program officer, Last contact
- Tabs: Overview | Grants (count) | Contacts | Activity

**Overview tab:** 2-column — About card (description + website + address) + Giving history card (horizontal bar chart per year)

**Grants tab:** Table of grants linked to this funder

**Contacts tab:** Contact card with avatar, name, title, last contact, Email/Edit actions

---

### 8. Events (`/events`)

Filter pills (All/Planning/Upcoming/Closed)

3-column card grid. Each card:

- 6px colored top accent bar (per event type)
- Name (bold 15px), date + venue (muted)
- Status badge
- 3-column stats: RSVP / GOAL / RAISED
- Progress bar for task completion (when not closed)

### 9. Event Detail (`/events/:id`)

- 4-column stat row: Date, Venue, RSVP / capacity (with progress bar), Raised / goal (with progress bar)
- Tabs: Overview | Attendees (count) | Tasks (count) | Revenue

**Tasks tab:** Checklist rows with checkbox, label, due date, urgency badge

**Revenue tab:** 2-column — Revenue breakdown card + Expenses card, each with line items + total

---

### 10. Funds (`/funds`)

ViewToggle: Cards / Ledger. New fund button.

**Cards view:** 3-column grid. Each card: name, restriction label (muted 12px), 3-column stats (Balance/Committed/Available), progress bar.

**Ledger view:** Table — Fund, Restriction, Balance (mono right), Committed (mono right), Available (mono right, primary color if >$0), actions menu

---

### 11. Obligations (`/compliance`)

- Header: compliance score badge
- 4-column kanban: **Overdue** (danger) | **At risk** (warning) | **On track** (success) | **Ahead** (muted)
- Column header: colored 8×8 dot + label + count badge
- Background of column: `var(--muted)`, 8px padding, border-radius
- Obligation cards: 3px left accent bar per urgency color, name, category label, owner + due date row
- Click card → opens `ObligationDetail` modal

---

### 12. Programs (`/programs`)

3-column card grid. Each card: name, status badge, budget/grants stats, progress bar, divider, outcomes checklist.

### 13. Subrecipients (`/subrecipients`)

Table — Organization, Linked grant, Amount, Status badge, Next report, Compliance (dot + label)

### 14. Cash (`/payments`)

- 4-column stat row: Cash balance (primary), Unmatched txns (warning badge), Stripe this month, Recurring monthly
- Tabs: Transactions | Stripe | Recurring

**Transactions tab:** Table with Date (mono), Description, Amount (green for positive, normal for negative), Category, Matched/Match badge

**Stripe tab:** Success AlertBanner + 2 stat cards

**Recurring tab:** Table — Donor (avatar+name), Amount, Frequency, Next charge, Status badge

---

### 15. Reports (`/reports`)

4-column card grid. Each card:

- 5px colored top accent bar
- 72px preview placeholder (icon centered on gradient bg)
- Name, desc (muted), period
- Badge (Auditor signed / Ready / Build) + PDF/CSV buttons

---

### 16. Accounting (`/accounting`)

Header actions: Journal entry button + Close period button

Tabs: Overview | Journal | Ledger | Trial balance | Reports | Periods

**Overview tab:** 2-column grid:

- Left: Chart of accounts — `grid-cols: 50px 1fr 120px` rows, header rows have bold + `var(--muted)` bg + bottom border
- Right: Recent journal entries table + "Add entry" button

**Journal tab:** Table — Date, Ref (mono), Memo, Debit (mono right-align), Credit (mono right-align), Account (mono)

---

### 17. Activity (`/activity`)

Filter pills for entity type + date range

Table — When (mono 11.5px), Actor (bold), Action (muted), Subject, Type (badge)

---

### 18. Calendar (`/calendar`)

Full month grid: `grid-cols: repeat(7, 1fr)` × 5 rows

- Day header row: Sun–Sat, uppercase, muted
- Each cell: 100px min-height, day number (right-aligned), event chips (colored bg + fg pill, 11px font)
- Today: `var(--primary-soft)` background

---

### 19. Import (`/import`)

2-column grid of import type cards (Donors, Gifts, Grants, Funds). Each card:

- 40px icon box (primary-soft bg)
- Name + desc
- Mapped field badges
- "Import X" button (full width, outline)

Below: Recent imports table

---

### 20. Notifications (`/notifications`)

Filter: All / Unread (with count badge)

Vertical list of notification cards:

- Unread: `var(--primary-soft)` bg, primary border, unread dot (8px circle, right side)
- Read: `var(--card)` bg
- Left: 34px colored icon circle; Right: title (bold if unread) + body + time (right-aligned muted)

---

### 21. Settings (`/settings`)

Layout: `grid-cols: 240px 1fr`, full height

**Left pane:** Search input + vertical nav list. Active item: `var(--accent)` bg, accent-fg text.

**Right pane content per section:**

- **Team**: Table — Name (avatar+name), Email, Role badge, Last active, actions menu; Invite button
- **Organization**: 2-column form grid with 6 fields
- **Billing**: AlertBanner (success) showing plan status
- Others: coming soon placeholder

---

### 22. Help (`/help`)

3-column topic cards (icon box + title + desc) + contact card at bottom

---

## Modal Workflows

### New Donor (2-step)

Step 1: Name*, Email*, Phone, Stage select
Step 2: Tags input, Notes textarea, optional "Log gift now" button
Progress bar at top of modal body

### New Grant (2-step)

Step 1: Grant name*, Funder*, Amount + Stage (2-col), Linked fund select
Step 2: Period, Reporting requirements, Restrictions

### Award Intake (3-step AI wizard)

Step 1: Drop zone — large dashed border, click to upload PDF; on upload state changes to success
Step 2: Extracted fields list — each row: label (130px), value, confirm checkmark button. Unconfirmed rows get warning bg. "All confirmed" unlocks Continue
Step 3: Summary of what will be created, checklist style

### New Obligation

Single step: Name*, Category select, Owner select, Due date*, Linked fund select, Notes textarea

### Obligation Detail

- Status indicator row (4 buttons: Ahead/On track/At risk/Overdue) — selected = colored bg
- Details text, notes textarea
- Delete (danger outline) + Save buttons

### New Fund

Single step: Fund name\*, Restriction type select, Restriction terms textarea

### Journal Entry

- Date + Reference (2-col)
- Memo field
- Debit/credit table with dynamic rows: Account | Memo | Debit | Credit | Remove
- Add line button
- Balance indicator (green checkmark if balanced, red warning if not)
- Post entry button disabled until balanced

### Period Close (4-step wizard)

Step progress: stepper with check/number circles + connecting lines

Step 1: Reconcile — show 3 bank accounts with book/statement comparison, success AlertBanner
Step 2: Allocate — 2 gift cards each with who/amount/memo + fund selection pills
Step 3: Accruals — 3 rows with description, amount, accounts, Approve button
Step 4: Summary table (5 rows) + lock warning AlertBanner

### Log Gift

Donor (pre-filled if from detail) + Date* + Amount* (2-col) + Fund select + Method select + Notes + info banner about acknowledgment letter

### New Funder

Name\*, Type select, Website + Contact (2-col), Email, Notes

### New Event

Name*, Type + Date* (2-col), Venue, Capacity + Revenue goal (2-col)

### New Program

Name\*, Annual budget, Description textarea

### Add Subrecipient

Name\*, Linked grant select, Amount + Contact (2-col)

### Connect Integration

Step 1: AlertBanner about integration + credential fields (varies by integration)
Step 2: Success confirmation — green checkmark circle, activate button

### Import Wizard (4-step)

Step 1: Drop zone (CSV/Excel)
Step 2: Column mapping — file column → system field select + confirm circle; unconfirmed = warning bg
Step 3: Preview table (first 3 rows) + duplicate count
Step 4: Summary checklist + Import button

### Report Export

Period select + Format toggle (PDF/CSV/XLSX) + Include checkboxes (4 options) + audit-ready banner

---

## Interactions & Behavior

### Navigation

- All sidebar items are clickable and update the main content area
- Detail pages (donor, grant, funder, event) receive an ID param from clicking a list row
- Breadcrumbs are clickable — leftmost item navigates back to list

### ⌘K Command Palette

- Opens on ⌘K or Ctrl+K from any screen; closes on Esc or backdrop click
- Navigate group: jumps to route
- Create group: opens the corresponding modal
- Arrow keys navigate items; Enter executes

### Modals

- Backdrop click closes modal
- X button closes modal
- Multi-step modals: Back disables on step 1 (shows Cancel instead)
- Confirm/submit buttons disabled until required fields filled

### Sidebar collapse

- Toggle button in sidebar header
- When collapsed: 64px wide, icons only (no labels), section labels hidden
- Tooltip on each nav item when collapsed

### Dashboard view toggle

- Segmented control top-right of dashboard header
- Persists within session (not to localStorage)

### Donors/Grants view toggle

- Segmented control (List/Board or Pipeline/List)
- Search and filters apply to both views

### Funds view toggle

- Cards / Ledger — same data, different presentation

### Onboarding overlay (30-day)

- Bottom-right floating panel, 380px wide
- Shows on first dashboard visit only
- Dismiss persists to `localStorage` key `'gp-ob-v1'`
- Shows week 1–4 milestones; active week expanded with sub-tasks

### Compliance board

- Clicking an obligation card opens `ObligationDetail` modal with that obligation pre-loaded
- Status can be changed inside the modal

### Grant detail stage strip

- Pure display (not interactive) — shows current position in lifecycle

### Accounting journal

- "Add entry" opens `JournalEntry` modal
- "Close period" opens `PeriodClose` modal

### Reports

- PDF/CSV buttons open `ReportExport` modal with report pre-selected
- "Build" button on custom reports opens `ReportExport` modal

---

## State Management

The prototype uses a single `useReducer` in the app root with these fields:

```typescript
interface AppState {
  route: string; // current screen
  routeParam: string | null; // donor/grant/funder/event ID
  modal: string | null; // modal key or null
  modalData: any | null; // data passed to modal (obligation, donor, report, etc.)
  sidebarCollapsed: boolean;
  cmdOpen: boolean;
  onboardingDismissed: boolean; // persisted to localStorage 'gp-ob-v1'
}
```

In the real app, routing is handled by TanStack Router — convert `route + routeParam` to proper URL params.

---

## Assets

- **Logo mark SVG**: `apps/web/public/brand/grantpipe-logo-mark.svg` — 64×64, dark emerald facets with ochre ledger rows
- **Logo light SVG**: `apps/web/public/brand/grantpipe-logo-light.svg` — full wordmark for light backgrounds
- **Logo SVG**: `apps/web/public/brand/grantpipe-logo-light.svg` — full wordmark
- **Icons**: Lucide icon set (already used throughout `@grantpipe/ui`) — see `nav.ts` for exact icon names per route

---

## Files in This Bundle

| File                 | Purpose                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GrantPipe.html`     | Entry point — open in browser to preview the full prototype                                                         |
| `gp-ds.jsx`          | Design system primitives (Icon, Btn, Badge, Input, Card, Modal, Table, etc.)                                        |
| `gp-shell.jsx`       | App shell — dark sidebar, topbar, command palette                                                                   |
| `gp-dashboard.jsx`   | Dashboard — 3 view variants                                                                                         |
| `gp-donors.jsx`      | Donors list (list + kanban) + donor detail                                                                          |
| `gp-grants.jsx`      | Grants pipeline (kanban + list) + grant detail with linked sidebar                                                  |
| `gp-compliance.jsx`  | Obligations board, Funds, Accounting, Activity, Settings                                                            |
| `gp-funders.jsx`     | Funders list + funder detail                                                                                        |
| `gp-events.jsx`      | Events list + event detail                                                                                          |
| `gp-programs.jsx`    | Programs, Subrecipients, Cash, Reports, Import, Notifications, Calendar, Help                                       |
| `gp-modals.jsx`      | Core modals: New donor/grant, Award intake, Obligation, Fund, Journal entry, Period close, Onboarding overlay       |
| `gp-more-modals.jsx` | Extended modals: Log gift, New funder/event/program/subrecipient, Connect integration, Import wizard, Report export |
| `gp-app.jsx`         | Root app — state management, routing, modal orchestration                                                           |

---

## Open Questions for Engineering

1. **Onboarding**: Should the 30-day checklist be stored in the DB per user, or only localStorage? The prototype uses localStorage.
2. **Award intake AI**: Which Claude model/prompt runs the PDF extraction? The prototype mocks the extracted values — wire to the real `document-extractions` component in `apps/web/src/components/document-extractions/`.
3. **Compliance "Obligations"**: Is this a new entity type or derived from grants + filings? The prototype treats it as a first-class entity.
4. **Calendar**: Should events, grant deadlines, and compliance deadlines all appear on the same calendar? The prototype shows them merged.
5. **Reports**: Are these generated server-side or client-side? The prototype shows a download button — implement as a server-rendered PDF endpoint.
6. **Sidebar collapse**: Should this preference persist per user in the DB, or per device in localStorage?
7. **Subrecipients**: Is pass-through reporting tracked at the obligation level or as a separate entity?
