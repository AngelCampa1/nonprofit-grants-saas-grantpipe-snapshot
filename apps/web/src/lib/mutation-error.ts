import { toast } from "sonner";

export function onMutationError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : "Something went wrong. Please try again.";
  toast.error(message);
}
