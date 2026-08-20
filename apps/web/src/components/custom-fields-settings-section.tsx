import React, { useState } from "react";
import {
  CUSTOM_FIELD_ENTITY_TYPE_LABELS,
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPE_LABELS,
  CUSTOM_FIELD_TYPES,
  createCustomFieldDefinitionSchema,
  type CreateCustomFieldDefinitionInput,
  type CustomFieldEntityType,
  type CustomFieldType,
} from "@grantpipe/shared";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  InlineError,
  Input,
  InsetPanel,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPanel,
  SurfaceSection,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@grantpipe/ui";
import {
  useCreateCustomFieldDefinition,
  useCustomFieldDefinitions,
  useDeleteCustomFieldDefinition,
  useUpdateCustomFieldDefinition,
  type CustomFieldDefinition,
} from "../hooks/use-custom-field-definitions";

function pluralEntityLabel(entityType: CustomFieldEntityType): string {
  return `${CUSTOM_FIELD_ENTITY_TYPE_LABELS[entityType]}s`;
}

function requiresOptions(fieldType: CustomFieldType) {
  return fieldType === "single_select" || fieldType === "multi_select";
}

function parseOptions(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

type DefinitionsListProps = {
  entityType: CustomFieldEntityType;
};

function DefinitionsList({ entityType }: DefinitionsListProps) {
  const query = useCustomFieldDefinitions(entityType);
  const updateMutation = useUpdateCustomFieldDefinition();
  const deleteMutation = useDeleteCustomFieldDefinition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);

  function startEdit(def: CustomFieldDefinition) {
    setEditingId(def.id);
    setDeleteConfirmId(null);
    setEditName(def.name);
    setMutationError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setMutationError(null);
  }

  async function handleSaveEdit(def: CustomFieldDefinition) {
    const trimmed = editName.trim();
    if (trimmed.length === 0) {
      setMutationError("Name is required.");
      return;
    }
    try {
      await updateMutation.mutateAsync({
        definitionId: def.id,
        entityType: def.entityType,
        data: { name: trimmed },
      });
      cancelEdit();
    } catch (error) {
      setMutationError(getErrorMessage(error));
    }
  }

  function startDelete(def: CustomFieldDefinition) {
    setDeleteConfirmId(def.id);
    setMutationError(null);
  }

  function cancelDelete() {
    setDeleteConfirmId(null);
    setMutationError(null);
  }

  async function handleDelete(def: CustomFieldDefinition) {
    try {
      await deleteMutation.mutateAsync({
        definitionId: def.id,
        entityType: def.entityType,
      });
      setDeleteConfirmId(null);
      setMutationError(null);
    } catch (error) {
      setMutationError(getErrorMessage(error));
    }
  }

  if (query.isLoading) {
    return <StatusPanel variant="loading">Loading custom fields…</StatusPanel>;
  }

  if (query.isError) {
    return (
      <StatusPanel variant="error" title="Unable to load custom fields.">
        {getErrorMessage(query.error)}
      </StatusPanel>
    );
  }

  const definitions = query.data ?? [];

  if (definitions.length === 0) {
    return (
      <StatusPanel variant="empty">
        No custom fields for {pluralEntityLabel(entityType).toLowerCase()} yet.
      </StatusPanel>
    );
  }

  return (
    <div className="space-y-3">
      {mutationError ? <StatusPanel variant="error">{mutationError}</StatusPanel> : null}
      {definitions.map((def) => {
        const isEditing = editingId === def.id;
        return (
          <InsetPanel
            key={def.id}
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex-1">
              {isEditing ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Label htmlFor={`edit-name-${def.id}`} className="sr-only">
                    Custom field name
                  </Label>
                  <Input
                    id={`edit-name-${def.id}`}
                    aria-label="Custom field name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                  />
                </div>
              ) : (
                <>
                  <p className="font-medium text-foreground">{def.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {CUSTOM_FIELD_TYPE_LABELS[def.fieldType]}
                    {def.options && def.options.length > 0 ? `: ${def.options.join(", ")}` : ""}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {isEditing ? (
                <>
                  <Button
                    size="sm"
                    disabled={updateMutation.isPending}
                    onClick={() => void handleSaveEdit(def)}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelEdit}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={() => startEdit(def)}>
                    Edit
                  </Button>
                  <Dialog
                    open={deleteConfirmId === def.id}
                    onOpenChange={(open) => {
                      if (open) {
                        startDelete(def);
                      } else {
                        cancelDelete();
                      }
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          deleteMutation.isPending &&
                          deleteMutation.variables?.definitionId === def.id
                        }
                      >
                        Delete
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Delete "{def.name}"?</DialogTitle>
                        <DialogDescription>
                          This removes the field definition from future data entry.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={cancelDelete}>
                          Cancel delete
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteMutation.isPending}
                          onClick={() => void handleDelete(def)}
                        >
                          Delete custom field
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>
          </InsetPanel>
        );
      })}
    </div>
  );
}

type AddCustomFieldDialogProps = {
  entityType: CustomFieldEntityType;
};

function AddCustomFieldDialog({ entityType }: AddCustomFieldDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const createMutation = useCreateCustomFieldDefinition();

  function reset() {
    setName("");
    setFieldType("text");
    setOptionsText("");
    setFormError(null);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const payload: CreateCustomFieldDefinitionInput = {
      entityType,
      name: name.trim(),
      fieldType,
      sortOrder: 0,
      ...(requiresOptions(fieldType) ? { options: parseOptions(optionsText) } : {}),
    };

    const parsed = createCustomFieldDefinitionSchema.safeParse(payload);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Unable to save custom field.");
      return;
    }

    try {
      await createMutation.mutateAsync(parsed.data);
      handleOpenChange(false);
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">Add custom field</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add custom field</DialogTitle>
          <DialogDescription>
            Attach a new field to {pluralEntityLabel(entityType).toLowerCase()}. Admins only.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {formError ? <InlineError className="rounded-2xl">{formError}</InlineError> : null}
          <div className="space-y-1">
            <Label htmlFor="custom-field-name">Name</Label>
            <Input
              id="custom-field-name"
              value={name}
              onChange={(event) => {
                setFormError(null);
                setName(event.target.value);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="custom-field-type">Field type</Label>
            <Select
              value={fieldType}
              onValueChange={(val) => {
                setFormError(null);
                setFieldType(val as CustomFieldType);
              }}
            >
              <SelectTrigger id="custom-field-type" aria-label="Field type">
                <SelectValue placeholder="Select field type" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {CUSTOM_FIELD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {requiresOptions(fieldType) ? (
            <div className="space-y-1">
              <Label htmlFor="custom-field-options">Options</Label>
              <Input
                id="custom-field-options"
                placeholder="Comma-separated values"
                value={optionsText}
                onChange={(event) => {
                  setFormError(null);
                  setOptionsText(event.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Enter at least one option, separated by commas.
              </p>
            </div>
          ) : null}
          <Button
            className="w-full"
            type="submit"
            disabled={createMutation.isPending || name.trim().length === 0}
          >
            Save custom field
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomFieldsSettingsSection() {
  const [tab, setTab] = useState<CustomFieldEntityType>("contact");

  return (
    <SurfaceSection
      title="Custom fields"
      description="Define additional fields that appear on contacts, donations, and grants."
    >
      <Tabs value={tab} onValueChange={(value) => setTab(value as CustomFieldEntityType)}>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            {CUSTOM_FIELD_ENTITY_TYPES.map((entity) => (
              <TabsTrigger key={entity} value={entity}>
                {pluralEntityLabel(entity)}
              </TabsTrigger>
            ))}
          </TabsList>
          <AddCustomFieldDialog entityType={tab} />
        </div>
        {CUSTOM_FIELD_ENTITY_TYPES.map((entity) => (
          <TabsContent key={entity} value={entity} className="mt-4">
            <DefinitionsList entityType={entity} />
          </TabsContent>
        ))}
      </Tabs>
    </SurfaceSection>
  );
}
