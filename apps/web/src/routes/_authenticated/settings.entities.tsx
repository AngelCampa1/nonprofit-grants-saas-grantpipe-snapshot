import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Skeleton,
} from "@grantpipe/ui";
import type {
  CreateEntityInput,
  EntityKind,
  FiscalSponsorModel,
  UpdateEntityInput,
} from "@grantpipe/shared";
import {
  type OrgEntity,
  useOrgEntities,
  useOrgSettingsMutations,
} from "../../hooks/use-org-settings";
import { useSession } from "../../hooks/use-session";

export const Route = createFileRoute("/_authenticated/settings/entities")({
  component: EntitiesSettingsPage,
});

const CREATE_ENTITY_KINDS: Array<{ value: EntityKind; label: string }> = [
  { value: "legal_entity", label: "Related legal entity" },
  { value: "sponsored_project", label: "Sponsored project" },
  { value: "agency_client", label: "Managed entity" },
];

const FISCAL_SPONSOR_OPTIONS: Array<{ value: FiscalSponsorModel; label: string }> = [
  { value: "model_a", label: "Model A" },
  { value: "model_c", label: "Model C" },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function entityKindLabel(kind: EntityKind): string {
  return (
    CREATE_ENTITY_KINDS.find((option) => option.value === kind)?.label ??
    (kind === "root" ? "Default entity" : kind)
  );
}

function entityStatusLabel(status: OrgEntity["status"]): string {
  return status === "archived" ? "Archived" : "Active";
}

function getEntityPayload(params: {
  name: string;
  kind: EntityKind;
  parentEntityId: string;
  fiscalSponsorModel: FiscalSponsorModel;
}): CreateEntityInput {
  return {
    name: params.name.trim(),
    kind: params.kind,
    fiscalSponsorModel: params.kind === "sponsored_project" ? params.fiscalSponsorModel : "none",
    parentEntityId: params.parentEntityId || null,
  };
}

export function EntitiesSettingsPage() {
  const { memberRole } = useSession();
  const isAdmin = memberRole === "admin";
  const entities = useOrgEntities({ enabled: isAdmin });
  const { createEntity, updateEntity, archiveEntity } = useOrgSettingsMutations();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EntityKind>("legal_entity");
  const [parentEntityId, setParentEntityId] = useState("");
  const [fiscalSponsorModel, setFiscalSponsorModel] = useState<FiscalSponsorModel>("model_a");
  const [formError, setFormError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const activeEntities = useMemo(
    () => (entities.data?.data ?? []).filter((entity) => entity.status === "active"),
    [entities.data?.data],
  );
  const hasEntities = (entities.data?.data.length ?? 0) > 0;

  function handleKindChange(value: EntityKind) {
    setKind(value);
    if (value !== "sponsored_project") {
      setFiscalSponsorModel("model_a");
    }
  }

  async function handleCreateEntity() {
    setFormError(null);
    setSavedMessage(null);
    const payload = getEntityPayload({
      name,
      kind,
      parentEntityId,
      fiscalSponsorModel,
    });

    try {
      await createEntity.mutateAsync(payload);
      setName("");
      setKind("legal_entity");
      setParentEntityId("");
      setFiscalSponsorModel("model_a");
      setSavedMessage("Entity added.");
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  async function handleUpdateEntity(entity: OrgEntity, data: UpdateEntityInput) {
    setFormError(null);
    setSavedMessage(null);
    try {
      await updateEntity.mutateAsync({ entityId: entity.id, data });
      setSavedMessage("Entity saved.");
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  async function handleArchiveEntity(entity: OrgEntity) {
    setFormError(null);
    setSavedMessage(null);
    try {
      await archiveEntity.mutateAsync({ entityId: entity.id });
      setSavedMessage("Entity archived.");
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <section className="space-y-6" aria-labelledby="entity-settings-heading">
      <div>
        <h2
          id="entity-settings-heading"
          className="font-heading text-base font-semibold text-foreground"
        >
          Entities
        </h2>
        <Separator className="mt-2" />
      </div>

      {!isAdmin ? (
        <Alert title="Admin access required">Only admins can manage entities.</Alert>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[minmax(320px,420px)_1fr]">
          <section className="space-y-4" aria-labelledby="add-entity-heading">
            <div>
              <h3
                id="add-entity-heading"
                className="font-heading text-sm font-semibold text-foreground"
              >
                Add entity
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Your org starts with one default entity. Add more for legal entities, sponsored
                projects, or managed entities.
              </p>
            </div>

            <div className="grid gap-4 rounded-2xl border border-border bg-card p-4">
              <div className="space-y-1.5">
                <Label htmlFor="entity-name">Entity name</Label>
                <Input
                  id="entity-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Westside Youth Fund"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="entity-type">Entity type</Label>
                <Select
                  value={kind}
                  onValueChange={(value) => handleKindChange(value as EntityKind)}
                >
                  <SelectTrigger id="entity-type" aria-label="Entity type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CREATE_ENTITY_KINDS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="parent-entity">Parent entity</Label>
                <Select
                  value={parentEntityId || "none"}
                  onValueChange={(value) => setParentEntityId(value === "none" ? "" : value)}
                  disabled={activeEntities.length === 0}
                >
                  <SelectTrigger id="parent-entity" aria-label="Parent entity">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {activeEntities.map((entity) => (
                      <SelectItem key={entity.id} value={entity.id}>
                        {entity.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {kind === "sponsored_project" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="fiscal-sponsor-model">Fiscal sponsor model</Label>
                  <Select
                    value={fiscalSponsorModel}
                    onValueChange={(value) => setFiscalSponsorModel(value as FiscalSponsorModel)}
                  >
                    <SelectTrigger id="fiscal-sponsor-model" aria-label="Fiscal sponsor model">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FISCAL_SPONSOR_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <Button
                className="w-fit rounded-full"
                disabled={createEntity.isPending || name.trim().length === 0}
                onClick={() => void handleCreateEntity()}
              >
                Add entity
              </Button>
            </div>
          </section>

          <section className="space-y-4" aria-labelledby="entities-list-heading">
            <h3
              id="entities-list-heading"
              className="font-heading text-sm font-semibold text-foreground"
            >
              Active entities
            </h3>

            {entities.isLoading ? (
              <div className="space-y-3" data-testid="entities-loading">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={`entity-skeleton-${index}`} className="h-20 w-full" />
                ))}
              </div>
            ) : null}

            {entities.isError ? (
              <Alert variant="destructive" title="Unable to load entities.">
                {getErrorMessage(entities.error)}
              </Alert>
            ) : null}

            {!entities.isLoading && !entities.isError && !hasEntities ? (
              <Alert title="One default entity">
                Your org starts with one default entity. Add more for legal entities, sponsored
                projects, or managed entities.
              </Alert>
            ) : null}

            {savedMessage ? <Alert variant="success">{savedMessage}</Alert> : null}
            {formError ? <Alert variant="destructive">{formError}</Alert> : null}

            <div className="space-y-3">
              {(entities.data?.data ?? []).map((entity) => (
                <div key={entity.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground" title={entity.name}>
                        {entity.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {entityKindLabel(entity.kind)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={entity.status === "active" ? "default" : "secondary"}>
                        {entityStatusLabel(entity.status)}
                      </Badge>
                      {entity.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                    <div className="space-y-1.5">
                      <Label htmlFor={`entity-name-${entity.id}`}>Name</Label>
                      <Input
                        id={`entity-name-${entity.id}`}
                        defaultValue={entity.name}
                        onBlur={(event) => {
                          const nextName = event.target.value.trim();
                          if (nextName && nextName !== entity.name) {
                            void handleUpdateEntity(entity, { name: nextName });
                          }
                        }}
                      />
                    </div>
                    <Button
                      className="rounded-full"
                      variant="outline"
                      disabled={
                        entity.isDefault || entity.status !== "active" || archiveEntity.isPending
                      }
                      onClick={() => void handleArchiveEntity(entity)}
                    >
                      Archive
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
