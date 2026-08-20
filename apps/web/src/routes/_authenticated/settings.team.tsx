import { createFileRoute } from "@tanstack/react-router";
import {
  Alert,
  Badge,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@grantpipe/ui";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  ENTITY_FEATURE_AREAS,
  ENTITY_ROLES,
  FEATURE_AREAS,
  PERMISSION_LEVELS,
  ROLES,
  getDefaultPermissionsForRole,
  resolveEffectivePermissions,
  type EntityFeatureArea,
  type EntityPermissionOverrides,
  type EntityRole,
  type FeatureArea,
  type PermissionLevel,
  type PermissionOverrides,
  type Role,
} from "@grantpipe/shared";
import { useState } from "react";
import {
  useOrgEntities,
  useOrgSettingsMutations,
  useOrgTeam,
  type OrgEntity,
} from "../../hooks/use-org-settings";
import { useSession } from "../../hooks/use-session";
import { buildInviteUrl } from "../../lib/invite-links";
import { humanizeEnum } from "../../lib/format";
import { captureAppException } from "../../lib/sentry";

export const Route = createFileRoute("/_authenticated/settings/team")({
  component: TeamSettingsPage,
});

type InviteMode = "shareable" | "email";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function updatePermission(
  permissions: PermissionOverrides,
  feature: FeatureArea,
  level: PermissionLevel,
) {
  return { ...permissions, [feature]: level };
}

function getActiveEntities(entities: OrgEntity[] | undefined): OrgEntity[] {
  return (entities ?? []).filter((entity) => entity.status === "active");
}

export function TeamSettingsPage() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";
  const team = useOrgTeam({ enabled: isAdmin });
  const entities = useOrgEntities({ enabled: isAdmin });
  const { assignEntityAccess, createInvite, revokeEntityAccess, updateEntityAccess, updateMember } =
    useOrgSettingsMutations();
  const [inviteMode, setInviteMode] = useState<InviteMode>("shareable");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("viewer");
  const [inviteEntityId, setInviteEntityId] = useState("org-wide");
  const [invitePermissions, setInvitePermissions] = useState<PermissionOverrides>(
    getDefaultPermissionsForRole("viewer"),
  );
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null);

  const memberToRemove = (team.data ?? []).find((m) => m.id === confirmRemoveMemberId);
  const activeEntities = getActiveEntities(entities.data?.data);

  function handleInviteRoleChange(role: Role) {
    setInviteRole(role);
    setInvitePermissions(getDefaultPermissionsForRole(role));
  }

  async function handleCreateInvite() {
    setInviteError(null);
    try {
      const result = await createInvite.mutateAsync({
        mode: inviteMode,
        email: inviteMode === "email" ? inviteEmail : undefined,
        role: inviteRole,
        permissions: invitePermissions,
        entityId: inviteEntityId === "org-wide" ? undefined : inviteEntityId,
      });
      setInviteLink(buildInviteUrl(result.token, window.location.origin));
      setInviteCopied(false);
    } catch (error) {
      setInviteError(getErrorMessage(error));
    }
  }

  async function handleCopyInviteLink() {
    if (!inviteLink) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setInviteError(null);
    } catch (error) {
      setInviteError(getErrorMessage(error));
      setInviteCopied(false);
      captureAppException(
        new Error("Invite link copy failed"),
        {
          tags: { feature: "team", operation: "copy_invite_link" },
        },
        { sanitize: true },
      );
    }
  }

  async function handleUpdateMemberPermissions(
    memberId: string,
    feature: FeatureArea,
    level: PermissionLevel,
    current: PermissionOverrides | null | undefined,
  ) {
    try {
      await updateMember.mutateAsync({
        memberId,
        data: {
          permissions: updatePermission(current ?? {}, feature, level),
        },
      });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleUpdateMemberRole(memberId: string, role: Role) {
    try {
      await updateMember.mutateAsync({
        memberId,
        data: { role, permissions: getDefaultPermissionsForRole(role) },
      });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      await updateMember.mutateAsync({ memberId, data: { active: false } });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleAssignEntityAccess(memberId: string, entityId: string) {
    try {
      await assignEntityAccess.mutateAsync({
        memberId,
        data: {
          entityId,
          role: "viewer",
        },
      });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleUpdateEntityAccessRole(
    memberId: string,
    entityId: string,
    role: EntityRole,
  ) {
    try {
      await updateEntityAccess.mutateAsync({
        memberId,
        entityId,
        data: { role },
      });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleUpdateEntityAccessPermission(
    memberId: string,
    entityId: string,
    feature: EntityFeatureArea,
    level: PermissionLevel,
    current: EntityPermissionOverrides | null | undefined,
  ) {
    try {
      await updateEntityAccess.mutateAsync({
        memberId,
        entityId,
        data: {
          permissions: {
            ...(current ?? {}),
            [feature]: level,
          },
        },
      });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  async function handleRevokeEntityAccess(memberId: string, entityId: string) {
    try {
      await revokeEntityAccess.mutateAsync({ memberId, entityId });
      setMemberError(null);
    } catch (error) {
      setMemberError(getErrorMessage(error));
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="team-settings-heading">
      <h2
        id="team-settings-heading"
        className="font-heading text-base font-semibold text-foreground"
      >
        Team &amp; permissions
      </h2>
      <Separator className="mb-6 mt-2" />

      {!isAdmin ? (
        <Alert title="Admin access required">Only organization admins can manage the team.</Alert>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <section className="space-y-5" aria-labelledby="invite-settings-heading">
            <div>
              <h2
                id="invite-settings-heading"
                className="font-heading text-base font-semibold text-foreground"
              >
                Invite settings
              </h2>
              <Separator className="mt-2" />
            </div>

            <div className="grid gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-type">Invite type</Label>
                  <Select
                    value={inviteMode}
                    onValueChange={(value) => setInviteMode(value as InviteMode)}
                  >
                    <SelectTrigger id="invite-type" aria-label="Invite type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="shareable">Shareable link</SelectItem>
                      <SelectItem value="email">Specific email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">Base role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => handleInviteRoleChange(value as Role)}
                  >
                    <SelectTrigger id="invite-role" aria-label="Invite role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {humanizeEnum(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2 xl:col-span-1 2xl:col-span-2">
                  <Label htmlFor="invite-entity-scope">Entity scope</Label>
                  <Select value={inviteEntityId} onValueChange={setInviteEntityId}>
                    <SelectTrigger id="invite-entity-scope" aria-label="Invite entity scope">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="org-wide">Organization-wide</SelectItem>
                      {activeEntities.map((entity) => (
                        <SelectItem key={entity.id} value={entity.id}>
                          {entity.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {inviteMode === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.org"
                  />
                </div>
              ) : null}

              <PermissionMatrix
                labelPrefix="Invite"
                permissions={invitePermissions}
                locked={inviteRole === "admin"}
                onChange={(feature, level) =>
                  setInvitePermissions((current) => updatePermission(current, feature, level))
                }
              />

              <Button disabled={createInvite.isPending} onClick={() => void handleCreateInvite()}>
                Create invite
              </Button>

              {inviteLink ? (
                <Alert variant="success" title="Invite ready">
                  <div className="space-y-3">
                    <Input aria-label="Invite link" readOnly value={inviteLink} />
                    <Button variant="outline" onClick={() => void handleCopyInviteLink()}>
                      {inviteCopied ? "Copied" : "Copy invite link"}
                    </Button>
                  </div>
                </Alert>
              ) : null}
              {inviteError ? <Alert variant="destructive">{inviteError}</Alert> : null}
            </div>
          </section>

          <section className="space-y-5" aria-labelledby="members-heading">
            <div>
              <h2
                id="members-heading"
                className="font-heading text-base font-semibold text-foreground"
              >
                Members
              </h2>
              <Separator className="mt-2" />
            </div>

            {team.isLoading ? <Alert>Loading team settings…</Alert> : null}
            {team.isError || (!team.isLoading && !team.data) ? (
              <Alert variant="destructive" title="Unable to load team settings.">
                {getErrorMessage(team.error)}
              </Alert>
            ) : null}
            {memberError ? <Alert variant="destructive">{memberError}</Alert> : null}

            <div className="space-y-4">
              {(team.data ?? []).map((member) => (
                <div key={member.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-foreground">
                        {member.user?.name ?? member.user?.email ?? member.id}
                      </p>
                      <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                    </div>
                    <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                      {humanizeEnum(member.role)}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`member-role-${member.id}`}>Role</Label>
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          void handleUpdateMemberRole(member.id, value as Role)
                        }
                      >
                        <SelectTrigger
                          id={`member-role-${member.id}`}
                          aria-label={`${member.user?.name ?? member.id} role`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {humanizeEnum(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Admins keep full access. You can narrow or expand other roles by feature.
                    </p>
                    {member.role === "admin" ? null : (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={
                          updateMember.isPending && updateMember.variables?.memberId === member.id
                        }
                        onClick={() => setConfirmRemoveMemberId(member.id)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>

                  <div className="mt-4">
                    <PermissionMatrix
                      labelPrefix={member.user?.name ?? member.id}
                      permissions={resolveEffectivePermissions(
                        member.role as Role,
                        member.permissions,
                      )}
                      locked={member.role === "admin"}
                      onChange={(feature, level) =>
                        void handleUpdateMemberPermissions(
                          member.id,
                          feature,
                          level,
                          member.permissions,
                        )
                      }
                    />
                  </div>

                  <EntityAccessMatrix
                    memberId={member.id}
                    memberEntityAccess={member.entityAccess ?? []}
                    entities={activeEntities}
                    isPending={
                      assignEntityAccess.isPending &&
                      assignEntityAccess.variables?.memberId === member.id
                    }
                    onAssign={(entityId) => void handleAssignEntityAccess(member.id, entityId)}
                    onRevoke={(entityId) => void handleRevokeEntityAccess(member.id, entityId)}
                    onUpdatePermission={(entityId, feature, level, permissions) =>
                      void handleUpdateEntityAccessPermission(
                        member.id,
                        entityId,
                        feature,
                        level,
                        permissions,
                      )
                    }
                    onUpdateRole={(entityId, role) =>
                      void handleUpdateEntityAccessRole(member.id, entityId, role)
                    }
                    revokePending={
                      revokeEntityAccess.isPending &&
                      revokeEntityAccess.variables?.memberId === member.id
                    }
                    updatePending={
                      updateEntityAccess.isPending &&
                      updateEntityAccess.variables?.memberId === member.id
                    }
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog
        open={confirmRemoveMemberId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveMemberId(null);
        }}
        title={`Remove ${memberToRemove?.user?.name ?? memberToRemove?.user?.email ?? "member"}?`}
        description={`${memberToRemove?.user?.name ?? memberToRemove?.user?.email ?? "This member"} will lose access right away. Their audit log entries stay on file.`}
        confirmLabel="Remove"
        isPending={updateMember.isPending}
        onConfirm={() => {
          if (confirmRemoveMemberId) void handleRemoveMember(confirmRemoveMemberId);
        }}
      />
    </section>
  );
}

type MemberEntityAccess = {
  entityId: string;
  entityName: string;
  role: EntityRole;
  permissions?: EntityPermissionOverrides | null;
};

type EntityAccessMatrixProps = {
  memberId: string;
  memberEntityAccess: MemberEntityAccess[];
  entities: OrgEntity[];
  isPending: boolean;
  onAssign: (entityId: string) => void;
  onRevoke: (entityId: string) => void;
  onUpdatePermission: (
    entityId: string,
    feature: EntityFeatureArea,
    level: PermissionLevel,
    permissions: EntityPermissionOverrides | null | undefined,
  ) => void;
  onUpdateRole: (entityId: string, role: EntityRole) => void;
  revokePending: boolean;
  updatePending: boolean;
};

function EntityAccessMatrix({
  memberId,
  memberEntityAccess,
  entities,
  isPending,
  onAssign,
  onRevoke,
  onUpdatePermission,
  onUpdateRole,
  revokePending,
  updatePending,
}: EntityAccessMatrixProps) {
  const [confirmRevokeEntityId, setConfirmRevokeEntityId] = useState<string | null>(null);

  if (entities.length === 0) return null;

  const accessByEntityId = new Map(memberEntityAccess.map((access) => [access.entityId, access]));
  const entityToRevoke = entities.find((entity) => entity.id === confirmRevokeEntityId);

  return (
    <div className="mt-4 space-y-3 border-t border-border pt-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Entity access</h3>
        <p className="text-sm text-muted-foreground">
          Scope this member to the entities they work on.
        </p>
      </div>
      <div className="grid gap-2">
        {entities.map((entity) => {
          const access = accessByEntityId.get(entity.id);
          return (
            <div
              key={entity.id}
              className="grid gap-3 rounded-lg border border-border px-3 py-2 sm:grid-cols-[minmax(140px,1fr)_auto] sm:items-center"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{entity.name}</p>
                <p className="text-xs text-muted-foreground">
                  {access ? humanizeEnum(access.role) : "No access"}
                </p>
              </div>
              {access ? (
                <div className="grid gap-3 sm:min-w-[280px]">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${memberId}-${entity.id}-entity-role`}>Entity role</Label>
                      <Select
                        value={access.role}
                        disabled={updatePending}
                        onValueChange={(value) => onUpdateRole(entity.id, value as EntityRole)}
                      >
                        <SelectTrigger
                          id={`${memberId}-${entity.id}-entity-role`}
                          aria-label={`${entity.name} entity role`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ENTITY_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {humanizeEnum(role)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="rounded-full"
                      size="sm"
                      variant="outline"
                      disabled={revokePending}
                      onClick={() => setConfirmRevokeEntityId(entity.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                  <EntityPermissionMatrix
                    entityName={entity.name}
                    permissions={access.permissions ?? {}}
                    disabled={updatePending}
                    onChange={(feature, level) =>
                      onUpdatePermission(entity.id, feature, level, access.permissions)
                    }
                  />
                </div>
              ) : (
                <Button
                  className="rounded-full"
                  size="sm"
                  variant="outline"
                  disabled={isPending}
                  onClick={() => onAssign(entity.id)}
                >
                  Grant {entity.name} access
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <ConfirmDialog
        open={confirmRevokeEntityId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRevokeEntityId(null);
        }}
        title={`Revoke access to ${entityToRevoke?.name ?? "this entity"}?`}
        description={`This member will lose access to ${entityToRevoke?.name ?? "this entity"} right away. You can grant it back later.`}
        confirmLabel="Revoke access"
        isPending={revokePending}
        onConfirm={() => {
          if (confirmRevokeEntityId) onRevoke(confirmRevokeEntityId);
        }}
      />
    </div>
  );
}

type EntityPermissionMatrixProps = {
  entityName: string;
  permissions: EntityPermissionOverrides;
  disabled: boolean;
  onChange: (feature: EntityFeatureArea, level: PermissionLevel) => void;
};

function EntityPermissionMatrix({
  entityName,
  permissions,
  disabled,
  onChange,
}: EntityPermissionMatrixProps) {
  return (
    <div className="grid gap-2">
      {ENTITY_FEATURE_AREAS.map((feature) => (
        <div
          key={feature}
          className="grid gap-2 sm:grid-cols-[minmax(120px,1fr)_150px] sm:items-center"
        >
          <p className="text-xs font-medium text-muted-foreground">{humanizeEnum(feature)}</p>
          <Select
            value={permissions[feature] ?? "none"}
            disabled={disabled}
            onValueChange={(value) => onChange(feature, value as PermissionLevel)}
          >
            <SelectTrigger aria-label={`${entityName} ${humanizeEnum(feature)} permission`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {humanizeEnum(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

type PermissionMatrixProps = {
  labelPrefix: string;
  permissions: PermissionOverrides;
  locked: boolean;
  onChange: (feature: FeatureArea, level: PermissionLevel) => void;
};

function PermissionMatrix({ labelPrefix, permissions, locked, onChange }: PermissionMatrixProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {FEATURE_AREAS.map((feature) => (
        <div
          key={feature}
          className="grid gap-3 border-b border-border px-3 py-2 last:border-b-0 sm:grid-cols-[minmax(120px,1fr)_180px] sm:items-center"
        >
          <div>
            <p className="text-sm font-medium text-foreground">{humanizeEnum(feature)}</p>
          </div>
          <Select
            value={locked ? "manage" : (permissions[feature] ?? "none")}
            disabled={locked}
            onValueChange={(value) => onChange(feature, value as PermissionLevel)}
          >
            <SelectTrigger aria-label={`${labelPrefix} ${humanizeEnum(feature)} permission`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERMISSION_LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {humanizeEnum(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
