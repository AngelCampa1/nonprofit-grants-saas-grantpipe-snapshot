import { Link, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings as SettingsIcon, Building2, Check, CalendarClock } from "lucide-react";
import { ANALYTICS_EVENTS, FOUNDER_BOOKING_URLS } from "@grantpipe/shared";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from "@grantpipe/ui";
import { ACTIVE_ORG_STORAGE_KEY } from "../../lib/api-client";
import { useUserMemberships } from "../../hooks/use-org-settings";
import { queryClient } from "../../main";
import { ACTIVE_ENTITY_STORAGE_KEY, clearActiveEntitySelection } from "../../lib/org-context";
import { captureEvent } from "../../lib/analytics";
import { captureAppException } from "../../lib/sentry";
import { useEffect } from "react";

interface UserMenuProps {
  name: string;
  email: string;
  onSignOut: () => void;
  showSettings?: boolean;
  currentOrgId?: string;
  activeEntityId?: string;
  compact?: boolean;
  availableEntities?: ReadonlyArray<{
    id: string;
    name: string;
  }>;
}

export function UserMenu({
  name,
  email,
  onSignOut,
  showSettings = true,
  currentOrgId,
  activeEntityId,
  compact = false,
  availableEntities = [],
}: UserMenuProps) {
  const initials =
    name
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const { data: membershipsData } = useUserMemberships();
  const memberships = membershipsData?.data ?? [];
  const showOrgSwitcher = memberships.length > 1;
  const showEntitySwitcher = availableEntities.length > 1;
  const navigate = useNavigate();

  /* v8 ignore start -- SSR fallback is not reachable in the happy-dom test environment. */
  const activeOrgId =
    typeof window !== "undefined"
      ? (localStorage.getItem(ACTIVE_ORG_STORAGE_KEY) ?? currentOrgId)
      : currentOrgId;
  const storedActiveEntityId =
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_ENTITY_STORAGE_KEY) : null;
  /* v8 ignore stop */
  const resolvedActiveEntityId = storedActiveEntityId ?? activeEntityId;

  function clearStorageItem(storageKey: string) {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Best-effort cleanup only. The original switch failure is reported below.
    }
  }

  useEffect(() => {
    if (!resolvedActiveEntityId || availableEntities.length === 0) return;
    if (availableEntities.some((entity) => entity.id === resolvedActiveEntityId)) return;

    captureEvent(ANALYTICS_EVENTS.entitySwitchDenied, {
      org_id: currentOrgId,
      active_entity_id: resolvedActiveEntityId,
      available_entity_ids: availableEntities.map((entity) => entity.id),
    });
    captureAppException(
      new Error("Active entity selection is unavailable"),
      {
        tags: { feature: "entity_switcher", operation: "validate_active_entity" },
        extra: {
          org_id: currentOrgId,
          active_entity_id: resolvedActiveEntityId,
          available_entity_ids: availableEntities.map((entity) => entity.id),
        },
      },
      { includeExpected: true, sanitize: true },
    );
    clearActiveEntitySelection();
  }, [availableEntities, currentOrgId, resolvedActiveEntityId]);

  async function handleSwitchOrg(orgId: string) {
    if (orgId === activeOrgId) {
      return;
    }
    try {
      localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, orgId);
      clearActiveEntitySelection();
      queryClient.clear();
      await navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      try {
        if (activeOrgId) {
          localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, activeOrgId);
        } else {
          clearStorageItem(ACTIVE_ORG_STORAGE_KEY);
        }
      } catch {
        clearStorageItem(ACTIVE_ORG_STORAGE_KEY);
      }
      captureAppException(
        error,
        {
          tags: { feature: "org_switcher", operation: "switch_org" },
          extra: {
            previous_org_id: activeOrgId,
            requested_org_id: orgId,
          },
        },
        { includeExpected: true, sanitize: true },
      );
    }
  }

  async function handleSwitchEntity(entityId: string) {
    if (entityId === resolvedActiveEntityId) {
      return;
    }
    const previousStoredEntityId = storedActiveEntityId;
    try {
      localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, entityId);
      queryClient.clear();
      await navigate({ to: "/dashboard", replace: true });
      captureEvent(ANALYTICS_EVENTS.entitySwitchCompleted, {
        org_id: currentOrgId,
        previous_entity_id: resolvedActiveEntityId,
        active_entity_id: entityId,
      });
    } catch (error) {
      try {
        if (previousStoredEntityId) {
          localStorage.setItem(ACTIVE_ENTITY_STORAGE_KEY, previousStoredEntityId);
        } else {
          clearStorageItem(ACTIVE_ENTITY_STORAGE_KEY);
        }
      } catch {
        clearStorageItem(ACTIVE_ENTITY_STORAGE_KEY);
      }
      captureEvent(ANALYTICS_EVENTS.entitySwitchDenied, {
        org_id: currentOrgId,
        previous_entity_id: resolvedActiveEntityId,
        requested_entity_id: entityId,
      });
      captureAppException(
        error,
        {
          tags: { feature: "entity_switcher", operation: "switch_entity" },
          extra: {
            org_id: currentOrgId,
            previous_entity_id: resolvedActiveEntityId,
            requested_entity_id: entityId,
          },
        },
        { includeExpected: true, sanitize: true },
      );
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "inline-flex w-full items-center gap-2 rounded-full px-2 py-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          compact && "size-9 w-9 flex-none justify-center gap-0 p-0",
        )}
      >
        <Avatar size="sm">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <span className={cn("min-w-0 flex-1", compact && "hidden")}>
          <span className="block truncate text-sm font-medium text-foreground" title={name}>
            {name}
          </span>
          <span className="block truncate text-xs text-muted-foreground" title={email}>
            {email}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate" title={name}>
            {name}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground" title={email}>
            {email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {showSettings ? (
          <DropdownMenuItem asChild>
            <Link to="/settings" className="cursor-pointer">
              <SettingsIcon aria-hidden className="mr-2 size-4" />
              Settings
            </Link>
          </DropdownMenuItem>
        ) : null}
        {showOrgSwitcher ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Building2 aria-hidden className="size-3" />
                Switch organization
              </span>
            </DropdownMenuLabel>
            {memberships.map((m) => (
              <DropdownMenuItem
                key={m.orgId}
                onSelect={() => void handleSwitchOrg(m.orgId)}
                className="cursor-pointer"
              >
                <Check
                  aria-hidden
                  className={`mr-2 size-4 ${m.orgId === activeOrgId ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate" title={m.orgName}>
                  {m.orgName}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        {showEntitySwitcher ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>
              <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <Building2 aria-hidden className="size-3" />
                Switch entity
              </span>
            </DropdownMenuLabel>
            {availableEntities.map((entity) => (
              <DropdownMenuItem
                key={entity.id}
                onSelect={() => void handleSwitchEntity(entity.id)}
                className="cursor-pointer"
              >
                <Check
                  aria-hidden
                  className={`mr-2 size-4 ${
                    entity.id === resolvedActiveEntityId ? "opacity-100" : "opacity-0"
                  }`}
                />
                <span className="truncate" title={entity.name}>
                  {entity.name}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuItem asChild>
          <a
            href={FOUNDER_BOOKING_URLS.discoveryCall}
            target="_blank"
            rel="noopener noreferrer"
            className="cursor-pointer"
          >
            <CalendarClock aria-hidden className="mr-2 size-4" />
            Book a call
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSignOut} className="cursor-pointer">
          <LogOut aria-hidden className="mr-2 size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
