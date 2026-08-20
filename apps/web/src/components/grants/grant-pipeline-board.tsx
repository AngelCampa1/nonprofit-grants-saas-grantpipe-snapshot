import { Link } from "@tanstack/react-router";
import { GRANT_STATUSES, type UpdateGrantInput } from "@grantpipe/shared";
import {
  Badge,
  Button,
  HelpTooltip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusPanel,
} from "@grantpipe/ui";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useState } from "react";
import { useGrantPipeline, useUpdateGrantStage } from "../../hooks/use-grants";
import { useSession } from "../../hooks/use-session";
import { canAccessFeature } from "../../lib/access-control";
import { GRANT_PIPELINE_PHASES, getGrantStageInfo } from "../../lib/grant-stages";

type GrantPipelineData = Record<
  string,
  { count: number; grants: Array<{ id: string; name: string }> }
>;

export function GrantPipelineBoard() {
  const { memberRole, memberPermissions } = useSession();
  const canEdit = canAccessFeature(memberRole, memberPermissions, "grants", "edit");
  const pipelineQuery = useGrantPipeline();
  const updateGrantStage = useUpdateGrantStage();
  const data = (pipelineQuery.data ?? {}) as GrantPipelineData;
  const [archiveOpen, setArchiveOpen] = useState(false);
  const activeCount = GRANT_PIPELINE_PHASES.reduce(
    (total, phase) =>
      total +
      phase.statuses.reduce((phaseTotal, status) => phaseTotal + (data[status]?.count ?? 0), 0),
    0,
  );
  const declined = data.declined ?? { count: 0, grants: [] };

  if (pipelineQuery.isLoading && !pipelineQuery.data) {
    return (
      <StatusPanel variant="loading" title="Loading pipeline…">
        Fetching your pipeline data.
      </StatusPanel>
    );
  }

  if (pipelineQuery.isError && !pipelineQuery.data) {
    return (
      <StatusPanel variant="error" title="Unable to load pipeline.">
        Refresh the page and try again.
      </StatusPanel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-background px-4 py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Pipeline overview</h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Work left to right by phase. Each row shows the next action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <Badge variant="outline">
              {activeCount} active grant{activeCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">Declined archived below</Badge>
          </div>
        </div>
      </div>

      {pipelineQuery.isError ? (
        <StatusPanel variant="error" title="Grant pipeline may be stale.">
          <p>
            {pipelineQuery.error instanceof Error
              ? pipelineQuery.error.message
              : "Refresh the page and try again."}
          </p>
          <Button className="mt-3" variant="outline" onClick={() => void pipelineQuery.refetch()}>
            Retry
          </Button>
        </StatusPanel>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-4">
        {GRANT_PIPELINE_PHASES.map((phase) => {
          const phaseCount = phase.statuses.reduce(
            (total, status) => total + (data[status]?.count ?? 0),
            0,
          );

          return (
            <section
              key={phase.id}
              className="rounded-2xl border border-border bg-background"
              aria-labelledby={`${phase.id}-phase`}
            >
              <div className="border-b border-border px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id={`${phase.id}-phase`} className="text-base font-semibold">
                      {phase.label}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {phase.description}
                    </p>
                  </div>
                  <Badge variant="outline">{phaseCount}</Badge>
                </div>
              </div>
              <div className="divide-y divide-border">
                {phase.statuses.map((status) => {
                  const stage = getGrantStageInfo(status);
                  const grants = data[status]?.grants ?? [];

                  return (
                    <section key={status} className="px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {stage.label}{" "}
                            <span className="font-normal normal-case text-muted-foreground">
                              {data[status]?.count ?? 0}
                            </span>
                          </h3>
                          <HelpTooltip label={`What ${stage.label} means`}>
                            <span>{stage.moveWhen}</span>
                            <span className="mt-1 block text-muted-foreground">
                              {stage.nextAction}
                            </span>
                          </HelpTooltip>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {grants.map((grant) => (
                          <GrantPipelineRow
                            key={grant.id}
                            canEdit={canEdit}
                            grant={grant}
                            nextAction={stage.nextAction}
                            status={status}
                            updateGrantStage={updateGrantStage.mutateAsync}
                          />
                        ))}
                        {grants.length === 0 ? (
                          <p className="text-sm text-muted-foreground">{stage.emptyMessage}</p>
                        ) : null}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-muted/20">
        <Button
          type="button"
          variant="ghost"
          className="flex h-auto w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium"
          aria-expanded={archiveOpen}
          onClick={() => setArchiveOpen((open) => !open)}
        >
          <span className="flex items-center gap-2">
            {archiveOpen ? (
              <ChevronDownIcon className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            )}
            Archived / declined
          </span>
          <Badge variant="outline">{declined.count}</Badge>
        </Button>
        {archiveOpen ? (
          <div className="space-y-2 border-t border-border px-4 py-3">
            {declined.grants.map((grant) => (
              <GrantPipelineRow
                key={grant.id}
                canEdit={canEdit}
                grant={grant}
                nextAction={getGrantStageInfo("declined").nextAction}
                status="declined"
                updateGrantStage={updateGrantStage.mutateAsync}
              />
            ))}
            {declined.grants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {getGrantStageInfo("declined").emptyMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

type GrantPipelineRowProps = {
  canEdit: boolean;
  grant: { id: string; name: string };
  nextAction: string;
  status: NonNullable<UpdateGrantInput["status"]>;
  updateGrantStage: (input: {
    grantId: string;
    status: NonNullable<UpdateGrantInput["status"]>;
  }) => Promise<unknown>;
};

function GrantPipelineRow({
  canEdit,
  grant,
  nextAction,
  status,
  updateGrantStage,
}: GrantPipelineRowProps) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2 text-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Link
          to="/grants/$grantId"
          params={{ grantId: grant.id }}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {grant.name}
        </Link>
        <Select
          value={status}
          disabled={!canEdit}
          onValueChange={(value) => {
            void updateGrantStage({
              grantId: grant.id,
              status: value as NonNullable<UpdateGrantInput["status"]>,
            });
          }}
        >
          <SelectTrigger
            aria-label={`Move ${grant.name} to another stage`}
            className="h-7 w-full py-1 text-xs sm:w-36"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GRANT_STATUSES.map((option) => {
              const optionLabel = getGrantStageInfo(option).label;
              return (
                <SelectItem key={option} value={option}>
                  {optionLabel}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{nextAction}</p>
    </div>
  );
}
