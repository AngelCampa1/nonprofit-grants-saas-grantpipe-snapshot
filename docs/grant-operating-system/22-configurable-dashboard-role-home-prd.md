# Feature #15: Configurable Dashboard and Role Home

Status: in build. Roadmap ref: `docs/feature-opportunities-2026-06.md` Tier 3 #15.

## Problem

The dashboard is useful, but every role starts from the same fixed view.

GrantPipe already has signals for grants, funds, reporting, donors, payments,
agenda items, and activity. The missing slice is a saved first screen that fits
the user. Leaders, grants staff, finance staff, development staff, viewers, and
auditors should not have to scan the same home view.

This feature is a surfacing layer. It does not create new computations.

## Scope

1. Add a saved dashboard preference per organization and user.
2. Store a pinned widget list for the dashboard home.
3. Add shared widget validation and role-safe defaults.
4. Return the saved or default dashboard layout from the overview API.
5. Add an API route to save the dashboard home preference.
6. Add a dashboard customize panel in the web app.
7. Keep auditor homes away from donor, payment, quick action, and recent
   activity widgets.
8. Add a public feature page.

## Non-goals

- Drag-and-drop layout editing.
- New dashboard calculations.
- New alert rules.
- Email or Slack notifications.
- Organization-wide dashboard templates.
- Admin override of another user's home.
- A dashboard builder for arbitrary reports.

Those can be added later if the saved home proves useful.

## Data model

Add `dashboard_home_preferences`.

Fields:

- `id`
- `org_id`
- `user_id`
- `layout`
- `created_at`
- `updated_at`

The first layout shape is:

- `pinnedWidgetIds`: string array

The table has a unique constraint on `(org_id, user_id)`.

## API

Extend:

- `GET /api/overview/dashboard`

The response includes:

- `dashboardLayout.pinnedWidgetIds`
- `dashboardLayout.source`: `default` or `saved`

Add:

- `PUT /api/overview/dashboard/preferences`

Request:

- `pinnedWidgetIds`: array of supported widget ids

Behavior:

- require an authenticated member
- validate widget ids with the shared schema
- normalize against widgets allowed for the user's role
- upsert one row for the active organization and user
- return the saved layout

## Web

Add a Customize home control on the dashboard.

The panel should:

- show allowed widgets for the current role
- use pill-shaped toggle buttons
- keep at least one widget selected
- save the pinned widget list
- show the saved home first on reload
- keep Metrics and Agenda tabs working as they do today

## Marketing

Add `/features/configurable-dashboard-role-home`.

The page must:

- explain that each user can save dashboard widgets
- explain that role defaults set the starting view
- say auditor defaults omit donor widgets
- say the feature uses existing dashboard data
- avoid claims about drag-and-drop editing, new alerts, email, or new
  calculations

## Acceptance criteria

- A dashboard layout is returned for every authenticated dashboard request.
- Users with no saved preference get role-based defaults.
- Saving a preference stores it for the active organization and user.
- Saved widget ids are normalized against role permissions.
- Auditors cannot save donor metrics, donor pipeline, payments, quick actions,
  or recent activity.
- The web dashboard renders pinned widgets in the Actions view.
- The customize panel saves and refreshes the dashboard overview.
- Metrics and Agenda views keep their existing behavior.
- The public feature page exists and passes site contracts.
