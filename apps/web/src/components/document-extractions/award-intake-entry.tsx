import { type FormEvent, useId, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, FilePicker } from "@grantpipe/ui";
import { Sparkles } from "lucide-react";
import { useUploadDocument } from "../../hooks/use-documents";
import { useStartDocumentExtraction } from "../../hooks/use-document-extractions";
import { useSession } from "../../hooks/use-session";

type AwardIntakeEntryProps = {
  compact?: boolean;
};

export function AwardIntakeEntry({ compact = false }: AwardIntakeEntryProps) {
  const { orgId } = useSession();

  if (!orgId) return null;

  return <AwardIntakeEnabledForm compact={compact} orgId={orgId} />;
}

function AwardIntakeEnabledForm({ compact, orgId }: { compact: boolean; orgId: string }) {
  const inputId = useId();
  const navigate = useNavigate();
  const upload = useUploadDocument("award_intake", orgId);
  const startExtraction = useStartDocumentExtraction();
  const [file, setFile] = useState<File | null>(null);
  const uploadedDocumentId = useRef<string | null>(null);
  const attemptId = useRef(crypto.randomUUID());

  function handleFileChange(nextFile: File | null) {
    setFile(nextFile);
    uploadedDocumentId.current = null;
    attemptId.current = crypto.randomUUID();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    try {
      const documentId = uploadedDocumentId.current ?? (await upload.mutateAsync(file)).id;
      uploadedDocumentId.current = documentId;
      const extraction = await startExtraction.mutateAsync({
        documentId,
        attemptId: attemptId.current,
      });
      await navigate({
        to: "/award-intake/$extractionId",
        params: { extractionId: extraction.id },
      });
    } catch {
      // Failure is surfaced via upload.isError / startExtraction.isError below;
      // keep the selected file so the user can retry without re-picking it.
    }
  }

  return (
    <form className={compact ? "space-y-2" : "space-y-3"} onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="text-sm font-medium">
        Create from award document
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <FilePicker
          id={inputId}
          accept=".pdf,.doc,.docx,.txt,image/*"
          onFileChange={handleFileChange}
          className="sm:flex-1"
        />
        <Button type="submit" disabled={!file || upload.isPending || startExtraction.isPending}>
          <Sparkles className="mr-2 h-4 w-4" />
          Start intake
        </Button>
      </div>
      {(upload.isError || startExtraction.isError) && (
        <p className="text-sm text-destructive">
          {upload.error instanceof Error
            ? upload.error.message
            : startExtraction.error instanceof Error
              ? startExtraction.error.message
              : "Unable to start award intake."}
        </p>
      )}
    </form>
  );
}
