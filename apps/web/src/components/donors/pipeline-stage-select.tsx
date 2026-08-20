import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Badge,
} from "@grantpipe/ui";
import {
  DONOR_PIPELINE_STAGE_LABELS,
  DONOR_PIPELINE_STAGES,
  type DonorPipelineStage,
} from "@grantpipe/shared";

const STAGE_COLORS: Record<DonorPipelineStage, string> = {
  prospect: "bg-muted text-muted-foreground",
  cultivation: "bg-primary/10 text-primary",
  solicitation: "bg-accent/15 text-accent",
  stewardship: "bg-primary/20 text-primary",
  donor: "bg-primary/30 text-primary",
  lapsed: "bg-destructive/10 text-destructive",
};

interface PipelineStageSelectProps {
  value: DonorPipelineStage | undefined;
  onChange: (stage: DonorPipelineStage | "") => void;
  name?: string;
  /** Sets the trigger's id so an external <Label htmlFor> can associate with it */
  id?: string;
  /** When true, adds an "All stages" option at the top that clears the filter */
  showAllOption?: boolean;
}

const ALL_STAGES_SENTINEL = "__all__";

export function PipelineStageSelect({
  value,
  onChange,
  name,
  id,
  showAllOption,
}: PipelineStageSelectProps) {
  return (
    <Select
      value={value ?? (showAllOption ? ALL_STAGES_SENTINEL : undefined)}
      onValueChange={(v) => onChange(v === ALL_STAGES_SENTINEL ? "" : (v as DonorPipelineStage))}
      name={name}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Select stage" />
      </SelectTrigger>
      <SelectContent>
        {showAllOption && (
          <SelectItem value={ALL_STAGES_SENTINEL}>
            <span className="text-muted-foreground">All stages</span>
          </SelectItem>
        )}
        {DONOR_PIPELINE_STAGES.map((stage) => (
          <SelectItem key={stage} value={stage}>
            <Badge className={STAGE_COLORS[stage]} variant="outline">
              {DONOR_PIPELINE_STAGE_LABELS[stage]}
            </Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
