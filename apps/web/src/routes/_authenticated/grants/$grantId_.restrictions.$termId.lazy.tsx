import { createLazyFileRoute } from "@tanstack/react-router";
import { PageShell } from "@grantpipe/ui";
import { RestrictionLifecyclePanel } from "../../../components/restrictions/restriction-lifecycle-panel";

export const Route = createLazyFileRoute("/_authenticated/grants/$grantId_/restrictions/$termId")({
  component: GrantRestrictionTermPage,
});

export function GrantRestrictionTermContent({
  grantId,
  termId,
}: {
  grantId: string;
  termId: string;
}) {
  return (
    <PageShell>
      <RestrictionLifecyclePanel grantId={grantId} highlightTermId={termId} />
    </PageShell>
  );
}

export function GrantRestrictionTermPage() {
  const { grantId, termId } = Route.useParams();
  return <GrantRestrictionTermContent grantId={grantId} termId={termId} />;
}
