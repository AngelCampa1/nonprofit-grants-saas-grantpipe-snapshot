# Security Best Practices Report

Date: 2026-04-07

> ## Resolution status: RESOLVED
>
> This is the original, unedited report from a security review run on 2026-04-07, kept in the
> repository as a record. **Both high-severity findings and both hardening gaps named in the
> executive summary were fixed.** Verified against the current tree:
>
> | Finding                                                                  | Status | Evidence in current code                                                                                                                                                                      |
> | ------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | `GP-SEC-001`: contact-tag routes accepted tag IDs without tenant scoping | Fixed  | `apps/api/src/domains/donors/routes.ts:543,553` now pass `orgId` into `addContactTags` / `removeContactTag`; `tag.service.ts` scopes every query with `eq(tags.orgId, params.orgId)`          |
> | `GP-SEC-002`: contact writes accepted foreign affiliated-org IDs         | Fixed  | `apps/api/src/domains/donors/contact.service.ts` now calls `assertAffiliatedOrgInTenant(db, orgId, affiliatedOrgId)` before write                                                             |
> | No rate limiting on auth endpoints                                       | Fixed  | `apps/api/src/lib/auth-rate-limit.ts`, wired in `apps/api/src/app.ts`                                                                                                                         |
> | No CSP or browser security headers                                       | Fixed  | `apps/api/src/middleware/security-headers.ts` sets `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, applied globally at `app.ts:340` via `.use("*", securityHeaders())` |
>
> The medium- and low-severity findings below (`GP-SEC-003` through `GP-SEC-005`) have not been
> re-verified against the current tree and should be read as of the original review date.
>
> More broadly, tenant isolation moved out of individual call sites and into middleware
> (`apps/api/src/middleware/org-context.ts`), which is the structural fix for the class of bug
> `GP-SEC-001` and `GP-SEC-002` both belonged to.

## Executive Summary

This review found two high-confidence multi-tenant isolation issues in the donor domain. Both can let one authenticated tenant affect or read another tenant's data if they obtain valid foreign IDs. Those are the highest-priority fixes.

Separately, the app is missing visible hardening at the edge/application layer: there is no visible rate limiting on authentication endpoints, and no visible CSP or related browser security headers in app code. Better Auth's own auth endpoints do appear to include origin and CSRF protections in the installed package, so that specific area is not reported as a finding here.

## High Severity

### GP-SEC-001

- Rule ID: `GP-SEC-001`
- Severity: High
- Location:
  - `apps/api/src/domains/donors/routes.ts:288`
  - `apps/api/src/domains/donors/routes.ts:295`
  - `apps/api/src/domains/donors/tag.service.ts:37`
  - `apps/api/src/domains/donors/tag.service.ts:53`
  - `packages/db/src/schema/contacts.ts:87`
- Evidence:

```ts
// apps/api/src/domains/donors/routes.ts:288-299
.post("/:contactId/tags", requireRole("editor"), zValidator("json", addTagsSchema), async (c) => {
  const db = c.get("db");
  const { tagIds } = c.req.valid("json");
  const contactId = c.req.param("contactId");
  await addContactTags(db, { contactId, tagIds });
  return c.body(null, 204);
})
.delete("/:contactId/tags/:tagId", requireRole("editor"), async (c) => {
  const db = c.get("db");
  const contactId = c.req.param("contactId");
  const tagId = c.req.param("tagId");
  await removeContactTag(db, { contactId, tagId });
  return c.body(null, 204);
})
```

```ts
// apps/api/src/domains/donors/tag.service.ts:41-47
await db.delete(contactTags).where(eq(contactTags.tagId, params.tagId));

const [deleted] = await db
  .delete(tags)
  .where(and(eq(tags.id, params.tagId), eq(tags.orgId, params.orgId)))
  .returning();
```

```ts
// apps/api/src/domains/donors/tag.service.ts:53-70
export async function addContactTags(
  db: Database,
  params: { contactId: string; tagIds: string[] },
): Promise<void> {
  const rows = params.tagIds.map((tagId) => ({
    contactId: params.contactId,
    tagId,
  }));
  await db.insert(contactTags).values(rows).onConflictDoNothing();
}

export async function removeContactTag(
  db: Database,
  params: { contactId: string; tagId: string },
): Promise<void> {
  await db
    .delete(contactTags)
    .where(and(eq(contactTags.contactId, params.contactId), eq(contactTags.tagId, params.tagId)));
}
```

```ts
// packages/db/src/schema/contacts.ts:87-98
export const contactTags = pgTable(
  "contact_tags",
  {
    contactId: text("contact_id")
      .notNull()
      .references(() => contacts.id),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.contactId, table.tagId] })],
);
```

- Impact: An authenticated user can mutate cross-tenant tag relationships if they know a foreign `tagId` or `contactId`. The most serious case is `deleteTag`: it deletes all `contact_tags` rows for the supplied tag before proving the tag belongs to the caller's org, so an admin in org A can strip tag associations from org B without being able to delete the org B tag itself.
- Fix:
  - Pass `orgId` into `addContactTags` and `removeContactTag`.
  - Verify that the contact belongs to `orgId`.
  - Verify every tag belongs to `orgId`.
  - In `deleteTag`, first confirm the tag belongs to `orgId`, then delete only its junction rows.
  - Consider adding org-aware database constraints or moving `org_id` into `contact_tags` if you want defense at the data layer.
- Mitigation: UUIDs reduce casual guessing, but they do not prevent insider abuse or exploitation once IDs are exposed in logs, URLs, exports, or browser traffic.
- False positive notes: This finding depends on an attacker learning foreign IDs, but the authorization bypass in code is concrete.

### GP-SEC-002

- Rule ID: `GP-SEC-002`
- Severity: High
- Location:
  - `packages/shared/src/validators/donors.ts:24`
  - `packages/shared/src/validators/donors.ts:55`
  - `apps/api/src/domains/donors/contact.service.ts:17`
  - `apps/api/src/domains/donors/contact.service.ts:36`
  - `apps/api/src/domains/donors/contact.service.ts:193`
  - `packages/db/src/schema/contacts.ts:32`
- Evidence:

```ts
// packages/shared/src/validators/donors.ts:15-25,46-56
const contactBaseSchema = z.object({
  // ...
  affiliatedOrgId: z.string().optional(),
  // ...
});

export const updateContactSchema = z.object({
  // ...
  affiliatedOrgId: z.string().nullable().optional(),
  // ...
});
```

```ts
// apps/api/src/domains/donors/contact.service.ts:17-20,34-44
const [contact] = await db
  .insert(contacts)
  .values({ orgId, ...data })
  .returning();

const [updated] = await db
  .update(contacts)
  .set({ ...params.data, updatedAt: new Date() })
  .where(
    and(
      eq(contacts.id, params.contactId),
      eq(contacts.orgId, params.orgId),
      isNull(contacts.deletedAt),
    ),
  )
  .returning();
```

```ts
// apps/api/src/domains/donors/contact.service.ts:193-197
if (contact.affiliatedOrgId) {
  affiliatedOrg =
    (await db.query.contacts.findFirst({
      where: and(eq(contacts.id, contact.affiliatedOrgId), isNull(contacts.deletedAt)),
    })) ?? null;
}
```

```ts
// packages/db/src/schema/contacts.ts:31-33
pipelineStage: text("pipeline_stage").notNull().default("prospect"),
affiliatedOrgId: text("affiliated_org_id").references((): AnyPgColumn => contacts.id),
isVolunteer: boolean("is_volunteer").notNull().default(false),
```

- Impact: A user can persist any `affiliatedOrgId` they know. Later, `getContact` resolves and returns that referenced contact without checking `orgId`, which can disclose another tenant's contact record through a normal in-org read flow.
- Fix:
  - Validate `affiliatedOrgId` on create/update and require that it resolves to a non-deleted contact in the same `orgId`.
  - Apply the same-org filter in the `affiliatedOrg` lookup inside `getContact`.
  - If cross-org affiliation is never valid, enforce it at the schema or service layer and reject foreign IDs.
- Mitigation: As above, UUIDs reduce blind enumeration but do not eliminate risk once IDs leak through normal product use.
- False positive notes: If the product intentionally allows cross-org contact references, that needs explicit authorization design and should not be implemented as an unchecked self-FK.

## Medium Severity

### GP-SEC-003

- Rule ID: `GP-SEC-003`
- Severity: Medium
- Location:
  - `apps/api/src/app.ts:14`
  - `apps/api/src/app.ts:33`
- Evidence:

```ts
// apps/api/src/app.ts:14-68
const app = new Hono<AppEnv>()
  .basePath("/api")
  .onError(errorHandler)
  .use("*", async (c, next) => {
    /* CORS */
  })
  .use("*", async (c, next) => {
    /* DB init */
  })
  .route("/health", healthRoutes)
  .on(["POST", "GET"], "/auth/better/*", async (c) => {
    const db = c.get("db");
    const auth = createAuth(db, c.env);
    return auth.handler(c.req.raw);
  });
```

`rg -n "rate.?limit|throttle|limiter|retry-after|429" apps packages` returned no matches.

- Impact: Login and signup endpoints are exposed without visible brute-force or credential-stuffing controls. That raises the risk of password spraying, account lockout abuse, and noisy auth abuse against nonprofit tenants.
- Fix:
  - Add rate limiting on `/api/auth/better/*`, ideally at Cloudflare first and optionally in-app as a second layer.
  - Split limits by IP and by account identifier/email where feasible.
  - Add structured auth failure telemetry and alerting.
- Mitigation: Better Auth handles origin/CSRF on its own endpoints, but that does not address password guessing or abusive request volume.
- False positive notes: If Cloudflare WAF/rate limiting already exists outside the repo, verify it and document it. It is not visible here.

### GP-SEC-004

- Rule ID: `GP-SEC-004`
- Severity: Medium
- Location:
  - `apps/api/src/app.ts:14`
  - `apps/web/index.html:1`
- Evidence:

```ts
// apps/api/src/app.ts:14-24
const app = new Hono<AppEnv>()
  .basePath("/api")
  .onError(errorHandler)
  .use("*", async (c, next) => {
    const corsMiddleware = cors({
      origin: c.env.APP_URL,
      credentials: true,
    });
    return corsMiddleware(c, next);
  });
```

```html
<!-- apps/web/index.html:1-18 -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GrantPipe</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Sora:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
  </head>
</html>
```

- Impact: There is no visible CSP, clickjacking defense, `nosniff`, `Referrer-Policy`, or `Permissions-Policy` in app code. If those are also absent at Cloudflare, the app loses important defense-in-depth against XSS, framing, MIME confusion, and referrer leakage.
- Fix:
  - Set headers centrally in Cloudflare/Worker responses:
    - `Content-Security-Policy`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy`
    - `Permissions-Policy`
    - `frame-ancestors 'none'` or a deliberate framing policy
  - If you cannot set headers at the edge yet, use a temporary CSP meta tag in `index.html`, knowing that `frame-ancestors` still must be header-based.
- Mitigation: Keep third-party resources minimal; right now the page already pulls external fonts, which will need to be reflected in the CSP.
- False positive notes: These controls may exist in Cloudflare config or response transforms; they are just not visible in the repository.

## Low Severity

### GP-SEC-005

- Rule ID: `GP-SEC-005`
- Severity: Low
- Location:
  - Dependency graph from `pnpm audit --prod --json`
- Evidence:

`pnpm audit --prod --json` reported advisory `GHSA-67mh-4wv8-2f99` for `esbuild` via:

`apps__api > better-auth > drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils > esbuild`

- Impact: This advisory affects esbuild's development server CORS behavior, which can expose locally served source/bundles to another website during development. It is not a production Cloudflare Worker runtime issue.
- Fix:
  - Upgrade to an esbuild chain that resolves to `>= 0.25.0` once the dependency path allows it.
  - Treat it as a developer-environment hardening item, not a production blocker.
- Mitigation: Avoid running vulnerable dev servers while browsing untrusted sites.
- False positive notes: Although `pnpm audit --prod` surfaced it, the practical impact here is still development-only based on the advisory itself.

## Non-Finding Notes

- Better Auth's installed package includes origin and CSRF protections for its own auth endpoints. Evidence:

```js
// node_modules/.pnpm/.../better-auth/dist/api/middlewares/origin-check.mjs:91-142
async function validateOrigin(ctx, forceValidate = false) {
  const originHeader = headers.get("origin") || headers.get("referer") || "";
  const useCookies = headers.has("cookie");
  // ...
  if (!trustedOrigins.some((origin) => matchesOriginPattern(originHeader, origin))) {
    throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
  }
}

async function validateFormCsrf(ctx) {
  // ...
  if (headers.has("cookie")) return await validateOrigin(ctx);
  // ...
  if (site === "cross-site" && mode === "navigate") {
    throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.CROSS_SITE_NAVIGATION_LOGIN_BLOCKED);
  }
}
```

- That protection applies to Better Auth's auth routes. It does not automatically harden the app's own business routes.
