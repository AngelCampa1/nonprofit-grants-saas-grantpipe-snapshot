import { createMiddleware } from "hono/factory";
import {
  resolveEffectivePermissions,
  type PermissionMap,
  type PermissionOverrides,
  type Role,
} from "@grantpipe/shared";

type Membership = {
  orgId: string;
  role: Role;
  permissions?: PermissionOverrides | null;
  deletedAt: Date | null;
};
type FindMember = (userId: string) => Promise<Membership | undefined>;

export function orgContextMiddleware(findMember: FindMember) {
  return createMiddleware<{
    Variables: {
      user: { id: string; email: string; name: string };
      orgId: string;
      memberRole: Role;
      memberPermissions: PermissionMap;
    };
  }>(async (c, next) => {
    const user = c.get("user");
    const membership = await findMember(user.id);

    if (!membership || membership.deletedAt !== null) {
      return c.json({ error: "No organization membership" }, 403);
    }

    c.set("orgId", membership.orgId);
    c.set("memberRole", membership.role);
    c.set(
      "memberPermissions",
      resolveEffectivePermissions(membership.role, membership.permissions),
    );

    await next();
  });
}
