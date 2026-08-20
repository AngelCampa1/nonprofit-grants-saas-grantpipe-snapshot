import { createFileRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Button,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
} from "@grantpipe/ui";
import { CustomFieldsSettingsSection } from "../../components/custom-fields-settings-section";
import { SettingsBillingPanel } from "../../components/settings-billing-panel";
import { useOrgProfile, useOrgSettingsMutations } from "../../hooks/use-org-settings";
import { useSession } from "../../hooks/use-session";
import { api } from "../../lib/api-client";
import { signOut } from "../../lib/auth-client";
import { ORG_TIMEZONES, type OrgTimezone } from "../../lib/timezones";
import { captureAppException } from "../../lib/sentry";

export const settingsSearchSchema = z.object({
  cycle: z.string().optional().catch(undefined),
  checkout: z.string().optional().catch(undefined),
  plan: z.string().optional().catch(undefined),
  portal: z.string().optional().catch(undefined),
  promo: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: settingsSearchSchema,
  component: SettingsRoute,
});

export { isAllowedBillingUrl } from "../../lib/billing-redirect";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function getTimezoneOptions(currentTimezone?: string) {
  if (!currentTimezone || ORG_TIMEZONES.includes(currentTimezone as OrgTimezone)) {
    return ORG_TIMEZONES;
  }

  return [currentTimezone, ...ORG_TIMEZONES];
}

const SIDEBAR_SECTIONS = [
  { id: "organization", label: "Organization" },
  { id: "team", label: "Team", href: "/settings/team" },
  { id: "entities", label: "Entities", href: "/settings/entities" },
  { id: "portal-access", label: "Portal access", href: "/settings/portal-access" },
  { id: "billing", label: "Billing" },
  { id: "custom-fields", label: "Custom fields" },
] as const;

const ADMIN_SECTION_IDS = new Set([
  "team",
  "entities",
  "portal-access",
  "billing",
  "custom-fields",
]);
type SettingsSectionId = (typeof SIDEBAR_SECTIONS)[number]["id"];

export function SettingsRoute() {
  return <SettingsPage />;
}

function normalizeHashSection(hashSection?: string): string {
  return hashSection?.replace(/^#/, "") ?? "";
}

export function getHashSection(): string {
  return typeof window === "undefined" ? "" : normalizeHashSection(window.location.hash);
}

function resolveActiveSection(
  hashSection: string,
  visibleSections: readonly (typeof SIDEBAR_SECTIONS)[number][],
): SettingsSectionId {
  const visibleIds = new Set(visibleSections.map((section) => section.id));
  return visibleIds.has(hashSection as SettingsSectionId)
    ? (hashSection as SettingsSectionId)
    : "organization";
}

export function getRouteSection(pathname: string): SettingsSectionId | null {
  switch (pathname.replace(/\/+$/, "") || "/settings") {
    case "/settings/team":
      return "team";
    case "/settings/entities":
      return "entities";
    case "/settings/portal-access":
      return "portal-access";
    case "/settings/billing":
      return "billing";
    default:
      return null;
  }
}

export function getDeleteAccountConfirmationError(deleteConfirmation: string): string | null {
  return deleteConfirmation !== "DELETE" ? "Type DELETE to confirm account deletion." : null;
}

function useActiveSettingsSection(
  visibleSections: readonly (typeof SIDEBAR_SECTIONS)[number][],
  routerHashSection: string,
): [SettingsSectionId, (section: SettingsSectionId) => void] {
  const getCurrentSection = useCallback(
    () => resolveActiveSection(routerHashSection || getHashSection(), visibleSections),
    [routerHashSection, visibleSections],
  );
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(() => getCurrentSection());

  useEffect(() => {
    const syncHashSection = () => {
      setActiveSection(getCurrentSection());
    };

    syncHashSection();
    window.addEventListener("hashchange", syncHashSection);
    return () => window.removeEventListener("hashchange", syncHashSection);
  }, [getCurrentSection]);

  return [activeSection, setActiveSection];
}

export function SettingsPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname.replace(/\/+$/, "") || "/settings";
  const routeSection = getRouteSection(pathname);
  const search = Route.useSearch();
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";
  const profile = useOrgProfile();
  const { updateProfile } = useOrgSettingsMutations();
  const [draft, setDraft] = useState<{ name?: string; timezone?: string }>({});
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const profileSavedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (profileSavedTimeout.current) {
        clearTimeout(profileSavedTimeout.current);
      }
    };
  }, []);

  const name = draft.name ?? profile.data?.name ?? "";
  const timezone = draft.timezone ?? profile.data?.timezone ?? "";
  const timezoneOptions = getTimezoneOptions(profile.data?.timezone);

  async function handleSaveProfile() {
    try {
      await updateProfile.mutateAsync({
        name,
        fiscalYearStartMonth: profile.data?.fiscalYearStartMonth ?? 1,
        timezone,
        ein: profile.data?.ein ?? null,
        logoUrl: profile.data?.logoUrl ?? null,
        address: profile.data?.address ?? null,
      });
      setProfileError(null);
      setProfileSaved(true);
      if (profileSavedTimeout.current) {
        clearTimeout(profileSavedTimeout.current);
      }
      profileSavedTimeout.current = setTimeout(() => setProfileSaved(false), 3000);
    } catch (error) {
      setProfileError(getErrorMessage(error));
      setProfileSaved(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmationError = getDeleteAccountConfirmationError(deleteConfirmation);
    if (confirmationError) {
      setDeleteError(confirmationError);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      const response = await api.api.auth.account.$delete({
        json: { confirmation: deleteConfirmation },
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? "Account deletion failed. Please contact support.");
      }
      await signOut();
      await navigate({ to: "/login", replace: true });
    } catch (error) {
      setDeleteError(getErrorMessage(error));
      captureAppException(
        error,
        {
          tags: {
            feature: "account_settings",
            operation: "delete_account",
          },
        },
        { sanitize: true },
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }

  const visibleSections = useMemo(
    () =>
      isAdmin ? SIDEBAR_SECTIONS : SIDEBAR_SECTIONS.filter((s) => !ADMIN_SECTION_IDS.has(s.id)),
    [isAdmin],
  );
  const [activeSection, setActiveSection] = useActiveSettingsSection(
    visibleSections,
    normalizeHashSection(location.hash),
  );
  const displayedSection = routeSection ?? activeSection;

  useEffect(() => {
    if (!routeSection && activeSection === "team") {
      void navigate({ to: "/settings/team", replace: true });
    }
  }, [routeSection, activeSection, navigate]);

  const navLinkClassName = (sectionId: SettingsSectionId) =>
    `block rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground ${
      displayedSection === sectionId
        ? "bg-muted font-medium text-foreground"
        : "text-muted-foreground"
    }`;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader variant="workbench" kicker="Account" title="Settings" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        {/* Sidebar nav */}
        <nav aria-label="Settings sections" className="space-y-1 lg:sticky lg:top-6 lg:self-start">
          {visibleSections.map((s) => {
            const href = "href" in s ? s.href : undefined;
            if (href) {
              return (
                <Link
                  key={s.id}
                  to={href as "/settings/team" | "/settings/entities" | "/settings/portal-access"}
                  aria-current={displayedSection === s.id ? "page" : undefined}
                  className={navLinkClassName(s.id)}
                >
                  {s.label}
                </Link>
              );
            }
            return (
              <Link
                key={s.id}
                to="/settings"
                hash={s.id}
                aria-current={displayedSection === s.id ? "page" : undefined}
                className={navLinkClassName(s.id)}
                onClick={() => setActiveSection(s.id)}
              >
                {s.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          {routeSection ? (
            <Outlet />
          ) : activeSection === "organization" ? (
            <section id="organization" aria-labelledby="section-organization">
              <h2
                id="section-organization"
                className="font-heading text-base font-semibold text-foreground"
              >
                Organization profile
              </h2>
              <Separator className="mb-6 mt-2" />

              {profile.isLoading ? (
                <div className="grid gap-3 md:grid-cols-2" data-testid="org-profile-loading">
                  {Array.from({ length: 2 }).map((_, index) => (
                    <div key={`org-profile-field-skeleton-${index}`} className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  ))}
                </div>
              ) : !profile.data ? (
                <Alert variant="destructive" title="Unable to load organization profile.">
                  {getErrorMessage(profile.error)}
                </Alert>
              ) : (
                <>
                  {profile.isError ? (
                    <Alert
                      variant="destructive"
                      className="mb-4"
                      title="Organization profile may be stale."
                    >
                      {getErrorMessage(profile.error)}
                    </Alert>
                  ) : null}
                  <div className="grid gap-3 md:grid-cols-[minmax(20rem,1fr)_max-content]">
                    <div className="min-w-0 space-y-1">
                      <Label htmlFor="org-name">Organization name</Label>
                      <Input
                        id="org-name"
                        className="min-w-0"
                        value={name}
                        onChange={(event) => {
                          setDraft((current) => ({ ...current, name: event.target.value }));
                          setProfileError(null);
                          setProfileSaved(false);
                        }}
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <Label>Timezone</Label>
                      <Select
                        value={timezone}
                        onValueChange={(val) => {
                          setDraft((current) => ({ ...current, timezone: val }));
                          setProfileError(null);
                          setProfileSaved(false);
                        }}
                        disabled={!isAdmin}
                      >
                        <SelectTrigger aria-label="Timezone">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          {timezoneOptions.map((tz) => (
                            <SelectItem key={tz} value={tz}>
                              {tz}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {profileSaved ? (
                    <Alert variant="success" className="mt-4">
                      Organization profile saved.
                    </Alert>
                  ) : null}
                  {profileError ? (
                    <Alert variant="destructive" className="mt-4">
                      {profileError}
                    </Alert>
                  ) : null}
                  {isAdmin ? (
                    <div className="mt-4">
                      <Button
                        disabled={updateProfile.isPending}
                        onClick={() => void handleSaveProfile()}
                      >
                        Save profile
                      </Button>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Organization profile edits are available to admins only.
                    </p>
                  )}
                  <div
                    className="mt-8 rounded-2xl border border-destructive/40 bg-destructive/5 p-6"
                    data-testid="danger-zone-card"
                  >
                    <h3 className="font-heading text-sm font-semibold text-destructive">
                      Danger zone
                    </h3>
                    <h4 className="mt-4 font-heading text-sm font-semibold text-destructive">
                      Delete account
                    </h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      This will delete your account for good. GrantPipe blocks deletion if the
                      account has org records tied to it. This includes audit history, documents,
                      and memberships.
                    </p>
                    <div className="mt-4 max-w-sm space-y-2">
                      <Label htmlFor="delete-account-confirmation">Type DELETE to confirm</Label>
                      <Input
                        id="delete-account-confirmation"
                        value={deleteConfirmation}
                        onChange={(event) => {
                          setDeleteConfirmation(event.target.value);
                          setDeleteError(null);
                        }}
                        autoComplete="off"
                      />
                    </div>
                    {deleteError ? (
                      <Alert variant="destructive" className="mt-4">
                        {deleteError}
                      </Alert>
                    ) : null}
                    <Button
                      className="mt-4"
                      variant="destructive"
                      disabled={deleteConfirmation !== "DELETE" || isDeletingAccount}
                      onClick={() => void handleDeleteAccount()}
                    >
                      {isDeletingAccount ? "Deleting…" : "Delete account"}
                    </Button>
                  </div>
                </>
              )}
            </section>
          ) : null}

          {isAdmin && !routeSection ? (
            <>
              {/* ----------------------------------------------------------------
                  Billing
              ---------------------------------------------------------------- */}
              {activeSection === "billing" ? <SettingsBillingPanel search={search} /> : null}

              {/* ----------------------------------------------------------------
                  Custom fields
              ---------------------------------------------------------------- */}
              {activeSection === "custom-fields" ? (
                <section id="custom-fields" aria-labelledby="section-custom-fields">
                  <h2
                    id="section-custom-fields"
                    className="font-heading text-base font-semibold text-foreground"
                  >
                    Custom fields
                  </h2>
                  <Separator className="mb-6 mt-2" />
                  <CustomFieldsSettingsSection />
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
