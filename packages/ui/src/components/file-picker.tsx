import * as React from "react";
import { Upload } from "lucide-react";

import { cn } from "../lib/utils";
import { buttonVariants } from "./button";

interface FilePickerProps extends Omit<React.ComponentProps<"input">, "type" | "onChange"> {
  /** Called with the selected File, or null when the selection is cleared. */
  onFileChange: (file: File | null) => void;
  /** Controlled label for the selected file. When provided, overrides the internal selection name. */
  fileName?: string;
  /** Trigger button text. */
  buttonLabel?: string;
  /** Shown, muted, when no file is selected. */
  placeholder?: string;
}

/**
 * A styled file input. The native control is visually hidden but kept focusable,
 * so the chrome ("Choose File / No file chosen", which differs per browser/OS) is
 * replaced by an on-brand secondary pill trigger plus the selected file name in the
 * app's own typography.
 */
function FilePicker({
  id,
  className,
  accept,
  disabled,
  onFileChange,
  fileName,
  buttonLabel = "Choose file",
  placeholder = "No file selected",
  "aria-invalid": ariaInvalid,
  ...props
}: FilePickerProps) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const [internalName, setInternalName] = React.useState<string | null>(null);

  const displayName = fileName !== undefined ? fileName : internalName;
  const hasFile = Boolean(displayName);

  return (
    <div data-slot="file-picker" className={cn("flex items-center gap-3", className)}>
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        className="peer sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setInternalName(file?.name ?? null);
          // Clear the native value so picking the same file again still fires change.
          // The displayed name is tracked in state, so it survives this reset.
          event.target.value = "";
          onFileChange(file);
        }}
        {...props}
      />
      <label
        htmlFor={inputId}
        data-slot="file-picker-trigger"
        className={cn(
          buttonVariants({ variant: "secondary", size: "sm" }),
          "cursor-pointer",
          "peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
          "peer-disabled:pointer-events-none peer-disabled:opacity-50",
          "peer-aria-invalid:border-destructive peer-aria-invalid:ring-destructive/20",
        )}
      >
        <Upload className="size-4" />
        {buttonLabel}
      </label>
      <span
        data-slot="file-picker-filename"
        className={cn(
          "min-w-0 flex-1 truncate text-sm",
          hasFile ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {hasFile ? displayName : placeholder}
      </span>
    </div>
  );
}

export { FilePicker };
export type { FilePickerProps };
