import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@grantpipe/ui";
import { ExternalLink, FilePenLine, ShieldCheck } from "lucide-react";
import type { DraftingAssistantDraftType, DraftingAssistantResponse } from "@grantpipe/shared";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { reportsTabs } from "../../../config/page-tabs";
import { useGenerateDraft } from "../../../hooks/use-drafting-assistant";
import { useReportGrantOptions } from "../../../hooks/use-reports";
import { captureAppException } from "../../../lib/sentry";

export const Route = createFileRoute("/_authenticated/reports/drafts")({
  component: DraftsPage,
});

const DRAFT_TYPE_OPTIONS: Array<{ value: DraftingAssistantDraftType; label: string }> = [
  { value: "proposal_narrative", label: "Proposal narrative" },
  { value: "interim_report", label: "Interim report" },
  { value: "final_report", label: "Final report" },
];

type EditableDraftSection = {
  heading: string;
  body: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function draftText(draft: DraftingAssistantResponse, sections: EditableDraftSection[]) {
  return [
    draft.draftTitle,
    "",
    ...sections.flatMap((section) => [section.heading, section.body, ""]),
    "Human review notes:",
    ...draft.safeguards.map((safeguard) => `- ${safeguard}`),
  ].join("\n");
}

export function DraftsPage() {
  const grantOptionsQuery = useReportGrantOptions();
  const generateDraft = useGenerateDraft();
  const [grantId, setGrantId] = useState("");
  const [draftType, setDraftType] = useState<DraftingAssistantDraftType>("proposal_narrative");
  const [prompt, setPrompt] = useState(
    "Draft a concise narrative from the selected grant records.",
  );
  const [draft, setDraft] = useState<DraftingAssistantResponse | null>(null);
  const [draftSections, setDraftSections] = useState<EditableDraftSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const grantOptions = grantOptionsQuery.data ?? [];
  const selectedGrant = grantOptions.find((grant) => grant.id === grantId);
  const canGenerate = grantId.length > 0 && prompt.trim().length >= 12 && !generateDraft.isPending;
  const canUseDraft = Boolean(draft && reviewed);

  async function handleGenerate() {
    if (!canGenerate) return;
    try {
      setError(null);
      setReviewed(false);
      const result = await generateDraft.mutateAsync({
        grantId,
        draftType,
        userPrompt: prompt,
      });
      setDraft(result);
      setDraftSections(result.sections);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function handleCopy() {
    if (!draft || !reviewed) return;
    try {
      setError(null);
      await navigator.clipboard.writeText(draftText(draft, draftSections));
    } catch (error) {
      setError("Unable to copy draft. Please select the text and copy it manually.");
      captureAppException(
        error,
        {
          tags: {
            feature: "reports",
            operation: "copy_draft",
            surface: "drafting_assistant",
          },
        },
        { sanitize: true },
      );
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        variant="workbench"
        kicker="Reporting & Compliance"
        title="Proposal and Report Drafts"
        description="Create editable drafts from one grant record. Review every source before using the text."
      />
      <AppPageTabs groupId="reports" items={reportsTabs} />

      <section className="grid gap-5 rounded-lg border border-border bg-card p-5 shadow-sm lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="draft-grant">Grant</Label>
              <Select
                value={grantId}
                onValueChange={(value) => {
                  setGrantId(value);
                  setDraft(null);
                  setDraftSections([]);
                  setReviewed(false);
                  setError(null);
                }}
              >
                <SelectTrigger id="draft-grant" aria-label="Grant">
                  <SelectValue placeholder="Select a grant" />
                </SelectTrigger>
                <SelectContent>
                  {grantOptions.map((grant) => (
                    <SelectItem key={grant.id} value={grant.id}>
                      {grant.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="draft-type">Draft type</Label>
              <Select
                value={draftType}
                onValueChange={(value) => {
                  setDraftType(value as DraftingAssistantDraftType);
                  setDraft(null);
                  setDraftSections([]);
                  setReviewed(false);
                  setError(null);
                }}
              >
                <SelectTrigger id="draft-type" aria-label="Draft type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRAFT_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="draft-prompt">Instructions</Label>
            <Textarea
              id="draft-prompt"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                setDraft(null);
                setDraftSections([]);
                setReviewed(false);
                setError(null);
              }}
              rows={4}
            />
            <p className="text-right text-xs text-muted-foreground">{prompt.length} characters</p>
          </div>
          <Button type="button" onClick={() => void handleGenerate()} disabled={!canGenerate}>
            <FilePenLine className="size-4" aria-hidden="true" />
            Generate editable draft
          </Button>
        </div>
        <aside className="space-y-3 rounded-lg border border-border bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
            Draft rules
          </div>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>GrantPipe drafts text only. It never submits to a funder.</li>
            <li>Use only cited GrantPipe sources.</li>
            <li>Missing data should stay visible in the draft.</li>
          </ul>
          {selectedGrant ? (
            <Alert title="Selected source">{selectedGrant.name}</Alert>
          ) : (
            <Alert title="Choose a grant">Drafting starts from one grant record.</Alert>
          )}
        </aside>
      </section>

      {grantOptionsQuery.isError ? (
        <Alert variant="destructive" title="Unable to load grants.">
          {getErrorMessage(grantOptionsQuery.error)}
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive" title="Unable to generate draft.">
          {error}
        </Alert>
      ) : null}

      <section className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Draft</h2>
            <p className="text-sm text-muted-foreground">
              Review the text and sources before you copy it.
            </p>
          </div>
          {draft ? <Badge variant="outline">{draft.modelId}</Badge> : null}
        </header>
        {generateDraft.isPending ? (
          <p className="text-sm text-muted-foreground">Building a source-backed draft…</p>
        ) : null}
        {!draft && !generateDraft.isPending ? (
          <p className="text-sm text-muted-foreground">
            Select a grant and generate a draft to review it here.
          </p>
        ) : null}
        {draft ? (
          <div className="space-y-5">
            <Alert title="Human review required">
              This is an editable draft. GrantPipe does not submit proposals or reports.
            </Alert>
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{draft.draftTitle}</h3>
              {draftSections.map((section, index) => (
                <article key={`${section.heading}-${index}`} className="space-y-2">
                  <h4 className="text-sm font-semibold">{section.heading}</h4>
                  <Textarea
                    aria-label={`${section.heading} draft body`}
                    value={section.body}
                    onChange={(event) => {
                      const nextSections = [...draftSections];
                      nextSections[index] = {
                        ...section,
                        body: event.target.value,
                      };
                      setDraftSections(nextSections);
                      setReviewed(false);
                    }}
                    rows={6}
                  />
                </article>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Sources</h3>
              <div className="grid gap-2">
                {draft.citations.map((citation, index) => (
                  <a
                    key={`${citation.href}-${index}`}
                    href={citation.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-4 py-3 text-sm hover:border-primary"
                  >
                    <span>
                      <span className="block font-medium">{citation.label}</span>
                      {citation.value ? (
                        <span className="text-muted-foreground">{citation.value}</span>
                      ) : null}
                    </span>
                    <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
                  </a>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Safeguards</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {draft.safeguards.map((safeguard) => (
                  <li key={safeguard}>{safeguard}</li>
                ))}
              </ul>
            </div>
            <label
              htmlFor="draft-reviewed"
              className="flex cursor-pointer items-start gap-2 text-sm"
            >
              <Checkbox
                id="draft-reviewed"
                checked={reviewed}
                onCheckedChange={(checked) => setReviewed(checked === true)}
              />
              <span>I reviewed the draft and its sources.</span>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCopy()}
              disabled={!canUseDraft}
            >
              Copy reviewed draft
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
