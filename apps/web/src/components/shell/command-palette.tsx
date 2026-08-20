import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@grantpipe/ui";
import { FileText, Gift, UserPlus } from "lucide-react";
import type { PermissionMap, PermissionOverrides } from "@grantpipe/shared";

import { isNavItemVisible, type AppRole } from "../../config/nav";
import { buildDestinations } from "../../config/destinations";
import { canAccessFeature } from "../../lib/access-control";
import { captureEvent } from "../../lib/analytics";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: AppRole;
  userPermissions?: PermissionMap | PermissionOverrides | null;
}

export function CommandPalette({
  open,
  onOpenChange,
  userRole,
  userPermissions,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const visibleDestinations = buildDestinations().filter((destination) =>
    isNavItemVisible(destination, userRole, userPermissions),
  );
  const groupedDestinations = new Map<string, typeof visibleDestinations>();
  for (const destination of visibleDestinations) {
    const existing = groupedDestinations.get(destination.group);
    if (existing) {
      existing.push(destination);
    } else {
      groupedDestinations.set(destination.group, [destination]);
    }
  }
  const destinationGroups = Array.from(groupedDestinations.entries());
  const canCreateDonors =
    userRole === undefined ? true : canAccessFeature(userRole, userPermissions, "donors", "edit");
  const canCreateGrants =
    userRole === undefined ? true : canAccessFeature(userRole, userPermissions, "grants", "edit");

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  const selectNavigationCommand = (to: string) => {
    captureEvent("command_palette_command_selected", {
      command_type: "navigation",
      command_target: to,
    });
    go(to);
  };

  const selectActionCommand = (
    actionKey: "create_donor" | "log_gift" | "create_grant",
    to: string,
  ) => {
    captureEvent("command_palette_command_selected", {
      command_type: "action",
      action_key: actionKey,
      command_target: to,
    });
    go(to);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Quick navigation"
    >
      <CommandInput placeholder="Search pages…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {destinationGroups.map(([group, groupDestinations], idx) => (
          <div key={group}>
            {idx > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={group}>
              {groupDestinations.map((destination) => {
                const Icon = destination.icon;
                return (
                  <CommandItem
                    key={destination.to}
                    value={`${group} ${destination.label} ${destination.to}`}
                    onSelect={() => selectNavigationCommand(destination.to)}
                  >
                    <Icon aria-hidden className="mr-2 size-4" />
                    <span>{destination.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </div>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          {canCreateDonors ? (
            <CommandItem
              value="create donor new contact"
              onSelect={() => {
                selectActionCommand("create_donor", "/donors");
              }}
            >
              <UserPlus aria-hidden className="mr-2 size-4" />
              <span>Add donor</span>
            </CommandItem>
          ) : null}
          {canCreateDonors ? (
            <CommandItem
              value="log gift donation record go to donors"
              onSelect={() => {
                selectActionCommand("log_gift", "/donors");
              }}
            >
              <Gift aria-hidden className="mr-2 size-4" />
              <span>Go to Donors to log a gift</span>
            </CommandItem>
          ) : null}
          {canCreateGrants ? (
            <CommandItem
              value="create grant new grant"
              onSelect={() => {
                selectActionCommand("create_grant", "/grants");
              }}
            >
              <FileText aria-hidden className="mr-2 size-4" />
              <span>Add grant</span>
            </CommandItem>
          ) : null}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
