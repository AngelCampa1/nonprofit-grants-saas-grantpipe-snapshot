# GrantPipe Security Baseline Design

**Date:** 2026-04-07
**Status:** Draft - pending review

---

## 1. Purpose

This document defines the application-code security baseline for GrantPipe V1.

It is not a general security checklist. It is the standing design contract for how GrantPipe should secure:

- authentication and session handling
- multi-tenant data isolation
- business-route authorization
- object reference validation
- browser-facing protections
- abuse resistance for app-owned routes
- sensitive data handling in logs and errors
- security regression testing for future work

This spec is intentionally scoped to code in this repository. Cloudflare account configuration, Neon network policy, CI secrets scanning, vendor dashboards, and incident response operations are out of scope except where they are direct dependencies of app-code behavior.

---

## 2. Goals and Non-Goals

### 2.1 Goals

- Define the minimum acceptable security posture for GrantPipe V1 application code.
- Make tenant isolation explicit and testable.
- Prevent insecure direct object reference patterns across all domain services.
- Define which protections are required in app code and which may be enforced at the edge.
- Give implementation planning a clean phase order: immediate risk closure first, baseline hardening second.

### 2.2 Non-Goals

- This spec does not attempt full SOC 2, HIPAA, or nonprofit-sector compliance mapping.
- This spec does not cover infrastructure administration outside repo-controlled code.
- This spec does not replace future threat modeling for new high-risk features such as document uploads, billing webhooks, or exports.

---

## 3. Trust Boundaries and Protected Assets

### 3.1 Primary trust boundaries

GrantPipe crosses these boundaries in V1:

1. Browser to API via cookie-authenticated requests
2. Auth framework routes to app-owned business routes
3. Tenant-scoped business logic to shared Postgres tables
4. User-supplied IDs and payloads to service-layer relationship writes
5. App responses to browser execution context

### 3.2 Protected assets

The application must treat these as protected:

- session identifiers and auth state
- tenant-scoped donor, donation, grant, fund, and organization data
- role and membership assignments
- invite tokens and onboarding state
- audit-relevant activity and communication history
- any sensitive identifiers that allow linking or cross-tenant lookup

### 3.3 Security model assumption

GrantPipe is a multi-tenant SaaS. A valid authenticated user from one organization must be treated as an attacker relative to every other organization. Security design must therefore assume:

- foreign IDs may become known
- route authorization alone is insufficient
- service-level ownership checks are mandatory on every cross-record mutation or lookup

---

## 4. Security Baseline by Domain

## 4.1 Auth and Session Security

GrantPipe will continue using Better Auth for authentication and session issuance. Better Auth-owned routes are allowed to rely on the framework's built-in origin and CSRF protections, provided the project does not disable or weaken them.

For app-owned routes, the contract is:

- session state is cookie-based and ambient
- no app route may assume "authenticated" is the same as "safe"
- app-owned state-changing routes must have an explicit cross-site safety story
- session tokens must never be intentionally exposed to the client
- client-side auth state must not be stored in `localStorage` or `sessionStorage`

Required baseline:

- Better Auth protections remain enabled
- app-owned routes do not serialize session token values
- any future custom auth-adjacent route documents whether it inherits framework protections or adds its own
- auth/session logging must redact sensitive values

Current delta:

- Better Auth appears to enforce origin and CSRF checks for its own endpoints
- app-owned cookie-backed routes do not yet have a documented cross-site request protection standard
- server context still carries a `session.token` field, which increases accidental exposure risk even if it is not currently returned intentionally

## 4.2 Multi-Tenant Data Isolation

Tenant isolation is the highest-priority security rule in GrantPipe.

Route middleware may attach `orgId`, but service methods must still prove tenant ownership when:

- reading a referenced record
- writing a referenced foreign key
- mutating a junction table
- deleting or re-linking relationships

Required baseline:

- every service method that accepts record IDs must validate same-org ownership before mutation
- every relationship write must validate both sides belong to the same `orgId`, unless cross-org relationships are intentionally designed and separately authorized
- every secondary lookup from an already-authorized record must still apply `orgId` filtering before data is returned
- junction-table mutations must be org-safe by design, not merely by convention

Current delta:

- donor tag assignment/removal is not tenant-scoped strongly enough
- tag deletion deletes junction rows before proving org ownership
- affiliated contact resolution can return a foreign-tenant contact if a foreign ID is stored

## 4.3 Input Validation and Object Reference Safety

Zod validation at the route layer is necessary but not sufficient. Structural validation does not prove authorization or ownership.

GrantPipe will distinguish between:

- payload shape validation
- business invariant validation
- tenant ownership validation

Required baseline:

- route validators confirm type and structure
- service methods confirm the referenced records exist in the caller's tenant and are not soft-deleted
- generic string IDs are never trusted as valid object references without lookup
- error handling should avoid confirming foreign-tenant existence beyond normal application semantics

Current delta:

- some validators accept foreign key IDs that are persisted without same-org verification
- some read paths later resolve those IDs without `orgId` constraints

## 4.4 Authorization and Role Enforcement

GrantPipe uses three roles: `admin`, `editor`, and `viewer`. Route-level role middleware is the first authorization gate, not the only one.

Required baseline:

- route-level `requireRole()` remains in place for coarse access control
- service methods must still verify target-resource ownership and allowed state
- frontend role checks are treated as UX only and must never be considered security controls
- future domain services should converge on reusable authorization helpers instead of scattered inline checks

Current delta:

- role middleware exists and is correctly used as a first pass
- downstream donor operations still trust some resource IDs more than they should

## 4.5 Browser and Client Protections

GrantPipe is a React SPA and should define a browser-defense baseline, even if final enforcement happens at Cloudflare.

Required baseline:

- CSP must be defined and deployable for the SPA
- clickjacking protection must be defined through `frame-ancestors` or equivalent header posture
- `X-Content-Type-Options: nosniff` must be set
- a deliberate `Referrer-Policy` must be set
- a minimal `Permissions-Policy` must be set
- no raw HTML rendering without vetted sanitization
- external origins must be explicitly inventoried so the CSP can stay narrow

Current delta:

- no visible CSP or related security-header posture exists in repo-controlled app code
- web entrypoint currently loads external Google Fonts, which must be accounted for if CSP is added

## 4.6 Abuse Resistance and Rate Limiting

GrantPipe must not leave high-value or high-cost routes unprotected from brute-force and abusive request volume.

Required baseline:

- authentication endpoints must have rate limiting
- invite redemption must have rate limiting
- future expensive routes such as uploads, exports, and report generation must declare an abuse-control strategy
- rate limiting should prefer Cloudflare enforcement first, with app-level telemetry and fallback controls where useful

Current delta:

- no visible auth or invite rate limiting is present in app code
- no current code-level pattern exists for abuse-sensitive routes

## 4.7 Secrets, Logging, and Sensitive Data Handling

Application logs are part of the attack surface. Sensitive operational values should not be emitted to logs or error responses.

Required baseline:

- secrets remain server-only
- cookies, session tokens, and raw auth artifacts are never logged
- error responses sent to clients remain generic
- security-relevant events should be structured enough to support investigation
- the activity log is a product audit feature and must not be confused with security-event logging

Current delta:

- no critical logging leak was confirmed during this review
- the spec should still explicitly forbid logging session token values and raw cookie material

## 4.8 Security Testing Requirements

Security regressions in GrantPipe should be caught by normal product tests, not deferred to ad hoc review.

Required baseline:

- every touched security-sensitive file must include both allowed and denied tests
- tenant isolation tests must exist for same-org success and cross-org failure cases
- role-enforcement tests must verify both authorized and forbidden paths
- future middleware for rate limiting or browser hardening must ship with tests where practical
- new features that write relationships by ID must include tenant-boundary tests by default

Current delta:

- tests are generally strong for happy paths
- adversarial tenant-boundary tests are not yet consistently part of the default pattern

---

## 5. Phased Remediation Roadmap

## 5.1 Phase 1 - Tenant-Boundary Closure

Objective: close concrete cross-tenant read/write risks already identified.

Scope:

- donor tag assignment/removal ownership checks
- tag deletion side-effect containment
- affiliated contact same-org validation on create/update
- affiliated contact same-org filtering on read
- adjacent donor-domain relationship checks discovered while making these fixes

Exit criteria:

- a user from org A cannot read or mutate org B donor-domain data using foreign IDs
- regression tests prove both allowed and denied cases

## 5.2 Phase 2 - App-Route Security Contract

Objective: define and implement the safety contract for app-owned HTTP routes.

Scope:

- explicit standard for cookie-backed non-auth business routes
- abuse controls on auth-adjacent and invite routes
- documented expectations for future state-changing endpoints

Exit criteria:

- auth and invite surfaces have defined abuse controls
- business-route security assumptions are explicit rather than implicit

## 5.3 Phase 3 - Browser Hardening Baseline

Objective: define and apply the browser-facing security header posture.

Scope:

- CSP
- framing policy
- `nosniff`
- referrer policy
- permissions policy
- external origin inventory needed to support the policy

Exit criteria:

- a deployment has a documented, verifiable browser hardening baseline
- required external origins are known and intentional

## 5.4 Phase 4 - Security Regression Standards

Objective: make the preceding controls durable as the codebase grows.

Scope:

- default test expectations for tenant isolation and authorization
- contribution guidance for relationship writes and cross-record lookups
- review checklist for future security-sensitive features

Exit criteria:

- the project has standing rules that reduce recurrence of the same bug classes

---

## 6. Verification and Acceptance Criteria

This security baseline is accepted when:

- all high-severity tenant-isolation deltas are closed
- app-owned routes have a written security contract for cookie-backed state changes
- a browser hardening posture is defined and can be verified in deployment
- security-sensitive tests cover both success and denial paths
- future implementation plans can trace each security task back to one of the domains in this spec

Verification should include:

- service-layer tests proving foreign IDs are rejected
- route tests proving role and tenant enforcement remain intact
- deployment/runtime checks for required headers once browser hardening is implemented

---

## 7. Out of Scope but Relevant Dependencies

The following are not part of this code-only spec, but they directly affect the real security posture and should be handled separately:

- Cloudflare WAF and rate-limit rules
- Cloudflare response-header transforms
- Neon network and credential posture
- vendor account configuration for Stripe, Resend, PostHog, and Sentry
- CI secret scanning and dependency governance
- incident response and operational runbooks

These should be documented independently if the project later expands from a code-only baseline to a full-stack security program.
