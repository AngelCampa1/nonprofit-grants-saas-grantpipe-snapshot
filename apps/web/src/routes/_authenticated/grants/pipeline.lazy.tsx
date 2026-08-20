import { Link, createLazyFileRoute } from "@tanstack/react-router";
import { PageHeader, PageShell, SurfaceSection } from "@grantpipe/ui";
import { GrantPipelineBoard } from "../../../components/grants/grant-pipeline-board";
import { AppPageTabs } from "../../../components/shell/page-tabs";
import { grantsTabs } from "../../../config/page-tabs";

export const Route = createLazyFileRoute("/_authenticated/grants/pipeline")({
  component: GrantPipelinePage,
});

export function GrantPipelinePage() {
  return (
    <PageShell>
      <PageHeader
        variant="workbench"
        kicker="Grants & Funding"
        title="Grant Pipeline"
        actions={
          <Link
            to="/grants"
            className="rounded-full border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            List
          </Link>
        }
      />
      <AppPageTabs groupId="grants" items={grantsTabs} />

      <SurfaceSection>
        <GrantPipelineBoard />
      </SurfaceSection>
    </PageShell>
  );
}
