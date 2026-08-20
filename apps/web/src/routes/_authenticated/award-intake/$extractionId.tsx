import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, PageShell } from "@grantpipe/ui";
import { ExtractionReview } from "../../../components/document-extractions/extraction-review";

export const Route = createFileRoute("/_authenticated/award-intake/$extractionId")({
  component: AwardIntakeReviewPage,
});

export function AwardIntakeReviewPage() {
  const { extractionId } = Route.useParams();

  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Grant intake"
        title="AI Award Intake"
        description="Review extracted fields before creating grant records."
      />
      <ExtractionReview extractionId={extractionId} />
    </PageShell>
  );
}
