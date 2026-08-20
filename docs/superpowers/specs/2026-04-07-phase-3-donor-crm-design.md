# Phase 3: Donor CRM - Design Specification

**Date:** 2026-04-07
**Status:** Approved
**Depends on:** Phase 2 (Database & Auth) - complete
**Spec:** Derived from `docs/superpowers/specs/2026-04-07-grantpipe-v1-design.md` sections 4.2, 5, 7

---

## 1. Scope

Full Donor CRM: contact management, donation tracking, tags, pipeline stages (with kanban), communication log, saved segments, giving history, and donor retention analytics. API + frontend.

**Schema already exists** from Phase 2: `contacts`, `donations`, `tags`, `contact_tags`, `communication_log`, `saved_segments`. No migrations needed.

**Not in scope:** Documents (Phase 7), activity log (Phase 7), custom fields (Phase 7), events/volunteers (Phase 6).

---

## 2. API Routes

Single domain at `domains/donors/` mounted at `/api/donors` in `app.ts`.

### 2.1 Contacts

| Method                    | Path   | Role                                            | Description |
| ------------------------- | ------ | ----------------------------------------------- | ----------- |
| `GET /`                   | viewer | List contacts (paginated, filterable, sortable) |
| `GET /:contactId`         | viewer | Get contact detail with computed giving stats   |
| `POST /`                  | editor | Create contact                                  |
| `PATCH /:contactId`       | editor | Update contact                                  |
| `DELETE /:contactId`      | admin  | Soft delete contact                             |
| `PATCH /:contactId/stage` | editor | Update pipeline stage (kanban drag)             |

### 2.2 Donations

| Method                                     | Path   | Role                                     | Description |
| ------------------------------------------ | ------ | ---------------------------------------- | ----------- |
| `GET /:contactId/donations`                | viewer | List donations for a contact (paginated) |
| `POST /:contactId/donations`               | editor | Create donation                          |
| `PATCH /:contactId/donations/:donationId`  | editor | Update donation                          |
| `DELETE /:contactId/donations/:donationId` | admin  | Soft delete donation                     |

### 2.3 Tags

| Method                           | Path   | Role                    | Description |
| -------------------------------- | ------ | ----------------------- | ----------- |
| `GET /tags`                      | viewer | List all org tags       |
| `POST /tags`                     | editor | Create tag              |
| `PATCH /tags/:tagId`             | editor | Update tag              |
| `DELETE /tags/:tagId`            | admin  | Delete tag              |
| `POST /:contactId/tags`          | editor | Add tag(s) to contact   |
| `DELETE /:contactId/tags/:tagId` | editor | Remove tag from contact |

### 2.4 Communications

| Method                            | Path   | Role                                       | Description |
| --------------------------------- | ------ | ------------------------------------------ | ----------- |
| `GET /:contactId/communications`  | viewer | List communication log entries (paginated) |
| `POST /:contactId/communications` | editor | Log a communication                        |

### 2.5 Segments

| Method                        | Path   | Role                 | Description |
| ----------------------------- | ------ | -------------------- | ----------- |
| `GET /segments`               | viewer | List saved segments  |
| `POST /segments`              | editor | Create saved segment |
| `PATCH /segments/:segmentId`  | editor | Update saved segment |
| `DELETE /segments/:segmentId` | admin  | Delete saved segment |

### 2.6 Stats & Pipeline

| Method                 | Path   | Role                                                                              | Description |
| ---------------------- | ------ | --------------------------------------------------------------------------------- | ----------- |
| `GET /stats`           | viewer | Aggregate stats (total donors, new this FY, retention rate, total giving this FY) |
| `GET /stats/retention` | viewer | Retention rate per fiscal year (last 5 FYs) for trend chart                       |
| `GET /pipeline`        | viewer | Contacts grouped by pipeline stage (for kanban view)                              |

---

## 3. Service Layer

### 3.1 File Structure

```
apps/api/src/domains/donors/
â”œâ”€â”€ routes.ts                 # All route definitions, composes services
â”œâ”€â”€ contact.service.ts        # Contact CRUD + listing with filters
â”œâ”€â”€ donation.service.ts       # Donation CRUD + giving stats per contact
â”œâ”€â”€ tag.service.ts            # Tag CRUD + contact-tag associations
â”œâ”€â”€ communication.service.ts  # Communication log entries
â”œâ”€â”€ segment.service.ts        # Saved segment CRUD
â””â”€â”€ stats.service.ts          # Aggregate stats, retention calculations, pipeline grouping
```

### 3.2 Contact Listing

`GET /` accepts query params: `search` (fuzzy match on first name, last name, email, organization name), `pipelineStage`, `tagId`, `type` (individual/organization), `sortBy` (name/createdAt/lastDonationDate/totalGiving), `sortOrder` (asc/desc), plus standard pagination.

All filters combine with AND logic. `isNull(deletedAt)` always applied. Scoped by `orgId`.

For `sortBy=lastDonationDate` and `sortBy=totalGiving`, use a subquery join to compute the aggregate from donations, then sort on the computed column.

For `tagId` filter, join through `contact_tags` to filter contacts that have the specified tag.

For `search`, use `ILIKE` with `%search%` across `firstName`, `lastName`, `email`, `organizationName`.

### 3.3 Contact Detail Enrichment

`GET /:contactId` returns the contact record plus computed giving stats in a single response:

- `totalLifetimeGiving` - sum of all donation `amountCents` (excluding soft-deleted)
- `totalThisFY` - sum of donations in the current fiscal year
- `totalLastFY` - sum of donations in the previous fiscal year
- `firstGiftDate` - earliest donation date
- `lastGiftDate` - most recent donation date
- `averageGiftAmount` - average `amountCents` across all donations
- `donationCount` - total number of donations

Fiscal year boundaries derived from the org's `fiscalYearStartMonth`. Computed via SQL aggregates in a single query joined to donations.

Also returns: associated tags (joined from `contact_tags` + `tags`), affiliated organization contact (if `affiliatedOrgId` set).

### 3.4 Pipeline Kanban

`GET /pipeline` returns contacts grouped by pipeline stage:

```typescript
{
  prospect: { contacts: Contact[], count: number },
  cultivation: { contacts: Contact[], count: number },
  solicitation: { contacts: Contact[], count: number },
  stewardship: { contacts: Contact[], count: number },
}
```

Each contact includes: `id`, `firstName`, `lastName`, `organizationName`, `email`, `type`, `tags` (with names and colors), `lastDonationDate`, `totalGiving`.

Limited to 50 contacts per stage (most recently updated first). `count` reflects the total in that stage (may exceed 50). Users click through to the list view filtered by stage for the full set.

### 3.5 Stage Update

`PATCH /:contactId/stage` accepts `{ stage: DonorPipelineStage }`. Separate from the general `PATCH /:contactId` so the kanban drag-and-drop fires a lightweight, focused call. Updates `pipelineStage` and `updatedAt`.

### 3.6 Retention Calculation

`GET /stats/retention` computes fiscal-year-over-fiscal-year donor retention for the last 5 fiscal years.

Uses the org's `fiscalYearStartMonth` to determine FY boundaries. For each consecutive FY pair (A â†’ B):

- `donorCount` = count of distinct `contactId` values with at least one donation in FY A
- `retainedCount` = count of distinct `contactId` values with donations in both FY A and FY B
- `retentionRate` = `retainedCount / donorCount` (0 if no donors in FY A)

Returns:

```typescript
{ fiscalYear: string, retentionRate: number, donorCount: number, retainedCount: number }[]
```

Ordered chronologically. Excludes soft-deleted donations and contacts.

### 3.7 Aggregate Stats

`GET /stats` returns:

- `totalDonors` - count of distinct contacts with at least one non-deleted donation
- `newDonorsThisFY` - count of contacts whose earliest donation date falls within the current fiscal year
- `retentionRate` - current FY vs previous FY (same formula as 3.6, single pair)
- `totalGivingThisFY` - sum of `amountCents` for donations in the current fiscal year

All scoped by `orgId`. Excludes soft-deleted donations and contacts.

### 3.8 Saved Segments

Filters stored as JSONB on `saved_segments.filters`, matching the contact list filter shape:

```typescript
{
  pipelineStage?: DonorPipelineStage,
  tagId?: string,
  type?: ContactType,
  search?: string,
}
```

When a user loads a segment, the client reads the stored filters and applies them as query params to `GET /`. Segments are not evaluated server-side - they're saved filter presets.

---

## 4. Validators

New file: `packages/shared/src/validators/donors.ts`

### 4.1 Contact Schemas

**`createContactSchema`**

- `type` - required, enum: `individual | organization`
- `firstName` - optional string
- `lastName` - optional string
- `organizationName` - optional string
- `email` - optional, valid email format
- `phone` - optional string
- `address` - optional string
- `pipelineStage` - optional, enum from `DONOR_PIPELINE_STAGES`, defaults to `"prospect"`
- `affiliatedOrgId` - optional string (UUID)
- `notes` - optional string
- Refinement: if `type === "individual"`, `firstName` is required. If `type === "organization"`, `organizationName` is required.

**`updateContactSchema`** - all fields from create, all optional. No type-based refinement (partial update).

**`updatePipelineStageSchema`** - `{ stage: DonorPipelineStage }`

**`contactListSchema`** - extends `paginationSchema` with:

- `search` - optional string
- `pipelineStage` - optional, enum from `DONOR_PIPELINE_STAGES`
- `tagId` - optional string
- `type` - optional, enum from `CONTACT_TYPES`
- `sortBy` - optional, enum: `name | createdAt | lastDonationDate | totalGiving`, defaults to `name`. When `sortBy=name`, sort by `lastName, firstName` for individuals and `organizationName` for organizations (use a `COALESCE(lastName, organizationName)` expression).
- `sortOrder` - optional, enum: `asc | desc`, defaults to `asc`

### 4.2 Donation Schemas

**`createDonationSchema`**

- `amountCents` - required, positive integer
- `currency` - optional, defaults to `"USD"`
- `date` - required, ISO 8601 date string
- `type` - required, enum from `DONATION_TYPES`
- `restriction` - optional, enum from `RESTRICTION_TYPES`, defaults to `"unrestricted"`
- `fundId` - optional string
- `grantId` - optional string
- `paymentMethod` - optional string
- `notes` - optional string

**`updateDonationSchema`** - all fields optional.

### 4.3 Tag Schemas

**`createTagSchema`** - `name` (required, non-empty string), `color` (optional, hex color string like `#e07a5f`)

**`updateTagSchema`** - `name` optional, `color` optional

**`addTagsSchema`** - `{ tagIds: string[] }` (non-empty array)

### 4.4 Communication Schemas

**`createCommunicationSchema`**

- `type` - required, enum from `COMMUNICATION_TYPES`
- `subject` - optional string
- `body` - optional string
- Refinement: at least one of `subject` or `body` must be provided.

### 4.5 Segment Schemas

**`createSegmentSchema`**

- `name` - required, non-empty string
- `filters` - required object: `{ pipelineStage?, tagId?, type?, search? }` (all optional within, but the object is required)

**`updateSegmentSchema`** - `name` optional, `filters` optional.

---

## 5. Frontend

### 5.1 Route Structure

```
apps/web/src/routes/_authenticated/
â”œâ”€â”€ donors/
â”‚   â”œâ”€â”€ index.tsx          # Donor list view
â”‚   â”œâ”€â”€ pipeline.tsx       # Kanban pipeline view
â”‚   â””â”€â”€ $contactId.tsx     # Contact detail (tabbed)
```

### 5.2 Donor List View (`donors/index.tsx`)

**Stats bar** at top displaying: total donors, new donors this FY, retention rate (percentage), total giving this FY (formatted currency), and a small retention trend sparkline chart (last 5 FYs).

**View toggle** - links between list view (`/donors`) and pipeline view (`/donors/pipeline`).

**DataTable** (Shadcn) with columns:

- Name (linked to detail view) - displays `firstName lastName` for individuals, `organizationName` for organizations
- Email
- Type (individual/organization badge)
- Pipeline stage (colored badge)
- Tags (color dot chips)
- Last donation date
- Total giving (formatted currency)

**Filter bar:** search text input, pipeline stage dropdown, tag dropdown, contact type dropdown. Filters applied as query params to `GET /`.

**Sort** by clicking column headers (name, createdAt, lastDonationDate, totalGiving).

**Pagination** at bottom.

**"Add contact" button** - opens a create contact modal. Visible to editor+ roles only.

**Saved segments** - dropdown to select a saved segment (populates filters), "Save segment" button to save current filter state.

### 5.3 Pipeline View (`donors/pipeline.tsx`)

Same stats bar and view toggle as list view.

**Four kanban columns:** Prospect, Cultivation, Solicitation, Stewardship. Each column header shows stage name and count.

**Cards** display: contact name, email, tag chips, last donation date, total giving.

**Drag-and-drop** between columns using `@dnd-kit/core`. On drop, fires `PATCH /:contactId/stage` with the target stage. Optimistic update - card moves immediately, reverts on error.

**"50 shown" label** per column when count exceeds 50, with "View all" link navigating to list view filtered by that stage.

### 5.4 Contact Detail (`donors/$contactId.tsx`)

**Header area:**

- Contact name (large)
- Type badge (individual/organization)
- Pipeline stage - dropdown to change stage inline
- Tag chips - with add/remove functionality via `TagPicker`
- Edit button - opens edit modal with `ContactForm`
- Delete button - admin only, soft deletes with confirmation dialog

**Three tabs:**

**Overview tab:**

- Giving stats cards: lifetime total, this FY, last FY, average gift, first gift date, last gift date, donation count
- Notes section: editable inline (auto-saves on blur)
- Affiliated organization: link to the affiliated contact (if `affiliatedOrgId` set)
- Volunteer badge (if `isVolunteer` is true)

**Donations tab:**

- DataTable: date, amount (formatted), type badge, restriction badge, fund name (if linked), payment method, notes
- "Add donation" button - opens `DonationForm` modal
- Edit/delete actions per row (edit = modal, delete = admin only with confirmation)
- Paginated

**Communications tab:**

- Timeline layout: type icon (note/email/call/meeting), subject (bold), body (preview, expandable), logged by (user name), timestamp
- "Log communication" button - opens `CommunicationForm` modal
- Paginated, newest first

### 5.5 Components

Built in `apps/web/src/components/donors/`:

| Component             | Purpose                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `ContactForm`         | Create/edit contact form. Used in modal (create from list) and modal (edit from detail). Conditional fields based on type (individual vs org). |
| `DonationForm`        | Create/edit donation form. Amount input in dollars, converted to cents on submit. Date picker. Type and restriction dropdowns.                 |
| `CommunicationForm`   | Log communication. Type dropdown, subject input, body textarea.                                                                                |
| `TagPicker`           | Tag selection with color swatches. Shows existing tags with checkboxes, "create new" inline.                                                   |
| `PipelineStageSelect` | Dropdown for pipeline stage. Colored badges per stage.                                                                                         |
| `RetentionChart`      | Small line chart for retention trend (last 5 FYs). Uses Recharts.                                                                              |
| `StatsBar`            | Horizontal row of metric cards with the retention sparkline.                                                                                   |
| `PipelineBoard`       | Kanban board with @dnd-kit columns and cards.                                                                                                  |

### 5.6 Data Fetching

TanStack Query hooks in `apps/web/src/hooks/use-donors.ts`:

| Hook                           | Endpoint                         | Notes                             |
| ------------------------------ | -------------------------------- | --------------------------------- |
| `useContacts(filters)`         | `GET /`                          | Paginated list with filter params |
| `useContact(contactId)`        | `GET /:contactId`                | Single contact with giving stats  |
| `useDonations(contactId)`      | `GET /:contactId/donations`      | Paginated                         |
| `useTags()`                    | `GET /tags`                      | All org tags                      |
| `useCommunications(contactId)` | `GET /:contactId/communications` | Paginated                         |
| `useSegments()`                | `GET /segments`                  | All saved segments                |
| `useDonorStats()`              | `GET /stats`                     | Aggregate metrics                 |
| `useRetentionStats()`          | `GET /stats/retention`           | FY retention trend                |
| `usePipeline()`                | `GET /pipeline`                  | Kanban data                       |

Mutations: `useCreateContact`, `useUpdateContact`, `useDeleteContact`, `useUpdatePipelineStage`, `useCreateDonation`, `useUpdateDonation`, `useDeleteDonation`, `useCreateTag`, `useUpdateTag`, `useDeleteTag`, `useAddContactTags`, `useRemoveContactTag`, `useCreateCommunication`, `useCreateSegment`, `useUpdateSegment`, `useDeleteSegment`.

All mutations invalidate relevant queries on success. `useUpdatePipelineStage` uses optimistic update for responsive kanban feel.

### 5.7 Dependencies

- `@dnd-kit/core` + `@dnd-kit/sortable` - kanban drag-and-drop
- `recharts` - retention trend chart

Both installed in `apps/web`.

---

## 6. Testing Strategy

All services tested with Vitest. 95% coverage per file.

**Service tests:** Each service file gets a corresponding test file. Mock the database layer (Drizzle query builder). Test: CRUD operations, org scoping, soft delete behavior, filter combinations, sort variations, pagination, fiscal year boundary calculations, retention math, edge cases (no donations, no contacts, zero-division).

**Route tests:** Test middleware integration - role enforcement (viewer/editor/admin), request validation (invalid inputs rejected), response shapes. Use Hono test client.

**Validator tests:** Already in `packages/shared` pattern. Test each schema: valid inputs pass, invalid inputs fail with correct error messages, refinements work (individual requires firstName, org requires organizationName, communication requires subject or body).

**Frontend tests:** React Testing Library + Vitest. Test: component rendering, form validation, user interactions (filter changes, form submission, tag add/remove), loading/error states. Mock TanStack Query hooks. Test kanban drag interactions via dnd-kit test utilities.
