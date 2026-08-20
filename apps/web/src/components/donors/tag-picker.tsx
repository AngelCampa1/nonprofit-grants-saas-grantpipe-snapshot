import { useState } from "react";
import { CheckIcon, TagIcon } from "lucide-react";
import {
  Button,
  Input,
  Popover,
  PopoverTrigger,
  PopoverContent,
  Command,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@grantpipe/ui";
import { useTags } from "../../hooks/use-donors";

interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

interface TagPickerProps {
  selectedTagIds: string[];
  onToggle: (tagId: string) => void;
  onCreateTag: (name: string, color?: string) => void | Promise<void>;
  isCreatingTag?: boolean;
}

export function TagPicker({
  selectedTagIds,
  onToggle,
  onCreateTag,
  isCreatingTag = false,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { data: tags, isLoading } = useTags();

  async function handleCreateTag() {
    const trimmed = newTagName.trim();
    // Guard the full parent operation (which may chain create + assign) and the
    // Enter-key path so a fast second trigger can't create a duplicate tag.
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onCreateTag(trimmed, undefined);
      setNewTagName("");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleNewTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateTag();
    }
  }

  const selectedCount = selectedTagIds.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Tags" type="button">
          <TagIcon className="mr-1 size-4" />
          {selectedCount > 0 ? `${selectedCount} selected` : "Tags"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandList>
            {isLoading ? (
              <CommandEmpty>Loading tags…</CommandEmpty>
            ) : !tags || tags.length === 0 ? (
              <CommandEmpty>No tags yet. Create one below.</CommandEmpty>
            ) : (
              <CommandGroup>
                {(tags as Tag[]).map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <CommandItem
                      key={tag.id}
                      value={tag.name}
                      aria-selected={isSelected}
                      onSelect={() => onToggle(tag.id)}
                    >
                      <span
                        className="mr-2 flex size-4 items-center justify-center rounded-lg border"
                        style={tag.color ? { backgroundColor: tag.color } : undefined}
                      >
                        {isSelected && <CheckIcon className="size-3 text-white" />}
                      </span>
                      {tag.name}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            <CommandSeparator />
            <CommandGroup heading="Create new">
              <div className="flex items-center gap-1 px-2 py-1">
                <Input
                  inputSize="xs"
                  className="flex-1"
                  placeholder="New tag name"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={handleNewTagKeyDown}
                  aria-label="New tag name"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleCreateTag()}
                  disabled={!newTagName.trim() || isCreatingTag || isSubmitting}
                >
                  {isCreatingTag || isSubmitting ? "Adding…" : "Add"}
                </Button>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
