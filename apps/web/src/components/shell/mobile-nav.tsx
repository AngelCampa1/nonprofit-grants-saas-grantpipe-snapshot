import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@grantpipe/ui";
import type { ReactNode } from "react";
import type { PermissionMap, PermissionOverrides } from "@grantpipe/shared";

import type { AppRole } from "../../config/nav";
import { AppSidebar } from "./app-sidebar";

interface MobileNavProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userRole?: AppRole;
  userPermissions?: PermissionMap | PermissionOverrides | null;
  userId?: string;
  footer?: ReactNode;
}

export function MobileNav({
  open,
  onOpenChange,
  userRole,
  userPermissions,
  userId,
  footer,
}: MobileNavProps) {
  const close = () => onOpenChange(false);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="w-[min(var(--spacing-layout-mobile-nav),calc(100vw-3rem))] border-r-0 bg-transparent p-0 md:hidden"
        data-slot="mobile-nav"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Primary navigation links for GrantPipe.</SheetDescription>
        </SheetHeader>
        <AppSidebar
          userRole={userRole}
          userPermissions={userPermissions}
          userId={userId}
          onNavigate={close}
          footer={footer}
          className="h-full w-full"
        />
      </SheetContent>
    </Sheet>
  );
}
