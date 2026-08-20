# GrantPipe Exploratory Testing Findings

Date: 2026-04-09
Environment: local web + local API against Neon project `grantpipe-e2e-local`
Scope: broad authenticated UI sweep using UI-created data only

## Setup Notes

- Local-environment observation: the local stack must be accessed through `http://localhost:5173`, not `http://127.0.0.1:5173`, because the current local auth configuration rejected the `127.0.0.1` origin.
- Local-environment observation: existing listeners on `5173` and `8787` can cause Playwright to reuse the wrong app unless the GrantPipe servers are started explicitly.

## Findings

### 1. Donor list summary appears inconsistent with the visible contact list

- Severity: High
- Area: `/donors`
- Repro:
  1. Sign up and complete onboarding.
  2. Go to `Donors`.
  3. Create a new individual contact.
  4. Return to the donor list if needed.
- Actual:
  - The contact row appears in the list.
  - The summary cards still show `Total Donors: 0` and `New This FY: 0`.
- Expected:
  - The summary cards should either update to reflect the visible list contents or make it clear that the cards use a narrower metric than the list.
- Evidence:
  - Donor list snapshot showed one row for `Jane Doe` while the stats cards still displayed zeros.

### 2. Empty donor list renders invalid pagination text

- Severity: Medium
- Area: `/donors`
- Repro:
  1. Open a fresh org with no donor records.
  2. Navigate to `Donors`.
- Actual:
  - Pagination reads `Page 1 of 0`.
- Expected:
  - Empty lists should render a sane state such as `Page 1 of 1` or hide pagination entirely.
- Evidence:
  - Observed before creating the first donor in the fresh org.

### 3. Funder contact creation fails for a minimal submission and surfaces no user-facing error

- Severity: High
- Area: `/funders/:funderId`
- Repro:
  1. Create a funder.
  2. Open the funder detail page.
  3. Click `Add contact`.
  4. Fill only `Contact name`.
  5. Leave `Title` and `Email` blank.
  6. Click `Save contact`.
- Actual:
  - Request fails with `400 Bad Request`.
  - No inline validation or user-visible error is shown.
  - The modal effectively stays in a failed state and no contact is created.
- Expected:
  - The form should either accept the submitted payload or explain what is invalid.
- Evidence:
  - Browser console logged `400` on `/api/grants/funders/<id>/contacts`.

### 4. Grant expense form accepts a plain date input but the submitted payload fails

- Severity: High
- Area: `/grants/:grantId` -> `Expenses`
- Repro:
  1. Create a grant.
  2. Open the grant detail page.
  3. Open `Expenses`.
  4. Click `Add expense`.
  5. Enter amount `5000`, date `2026-04-09`, description `Supplies`.
  6. Click `Save expense`.
- Actual:
  - Request fails with `400 Bad Request`.
  - No inline error is shown in the dialog.
- Expected:
  - The form should either validate the entered values before submit or explain the server-side failure.
- Evidence:
  - Browser console logged `400` on `/api/grants/<id>/expenses`.

### 5. Event attendee donation creation fails for a normal manual submission

- Severity: High
- Area: `/events/:eventId`
- Repro:
  1. Create an event.
  2. Add an attendee by existing contact ID.
  3. In the attendee row, enter donation amount `2500` and donation date `2026-04-09`.
  4. Click `Create donation`.
- Actual:
  - Request fails with `400 Bad Request`.
  - No inline validation or visible failure state is shown.
- Expected:
  - The form should either validate the submitted values before send or explain the failure after submit.
- Evidence:
  - Browser console logged `400` on `/api/events/<id>/attendees/<id>/donations`.

### 6. Event volunteer-hour logging fails for a normal manual submission

- Severity: High
- Area: `/events/:eventId`
- Repro:
  1. Open an event detail page.
  2. Enter a valid contact ID, hours `2.5`, and date `2026-04-09`.
  3. Click `Log volunteer hours`.
- Actual:
  - Request fails with `400 Bad Request`.
  - No inline error is shown.
- Expected:
  - The form should either validate the submitted values before send or explain the failure after submit.
- Evidence:
  - Browser console logged `400` on `/api/events/volunteer-hours`.

### 7. Reports page defaults to invalid placeholder IDs and produces server errors

- Severity: High
- Area: `/reports`
- Repro:
  1. Navigate to `Reports` in a fresh org.
  2. Leave the default `Grant ID` value (`grant-1`) untouched.
  3. Click `Generate grant compliance report`.
- Actual:
  - Request fails with `500 Internal Server Error`.
  - The browser console also logged a client-side `Internal Server Error` exception while handling the failed report request.
- Expected:
  - The page should not ship invalid default IDs, and it should show a user-facing validation or empty-state workflow instead of a server error.
- Evidence:
  - Browser console logged `500` on `/api/compliance/reports/compliance/grants/grant-1`.

## Likely Root Causes

- Several UI forms post raw text values that appear to mismatch API validation expectations, especially date fields on grant and event detail pages.
- Some create dialogs send empty strings for optional fields instead of omitting them.
- Several failing mutations do not surface any inline or toast-based error to the user.
- List summaries and pagination states are not derived consistently from the underlying data set.
