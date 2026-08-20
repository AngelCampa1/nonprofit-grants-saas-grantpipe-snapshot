import React from "react";
import { FileTextIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { cn } from "@grantpipe/ui";
import type { OnboardingGoal } from "@grantpipe/shared";

export interface GoalStepProps {
  /** Currently selected goal, or null if none chosen yet. */
  selected: OnboardingGoal | null;
  /** Called with the goal when the user picks a card. */
  onSelect: (goal: OnboardingGoal) => void;
}

interface GoalOption {
  goal: OnboardingGoal;
  heading: string;
  description: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const GOAL_OPTIONS: GoalOption[] = [
  {
    goal: "donors",
    heading: "Track donors and gifts",
    description: "Keep every donor and gift in one place.",
    Icon: UsersIcon,
  },
  {
    goal: "grants",
    heading: "Manage grants and funds",
    description: "Watch grant deadlines and restricted funds.",
    Icon: FileTextIcon,
  },
  {
    goal: "compliance",
    heading: "Stay audit-ready",
    description: "Build reports funders and auditors ask for.",
    Icon: ShieldCheckIcon,
  },
];

export function GoalStep({ selected, onSelect }: GoalStepProps): React.JSX.Element {
  return (
    <div role="radiogroup" aria-label="What do you want to do first?" className="grid gap-3">
      {GOAL_OPTIONS.map(({ goal, heading, description, Icon }) => {
        const isSelected = selected === goal;
        return (
          <button
            key={goal}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(goal)}
            className={cn(
              "flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-colors motion-reduce:transition-none",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isSelected
                ? "border-primary bg-primary/5 ring-2 ring-primary"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl",
                isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-6" aria-hidden />
            </span>
            <span className="flex flex-col gap-1">
              <span
                className={cn(
                  "text-lg font-semibold",
                  isSelected ? "text-primary" : "text-foreground",
                )}
              >
                {heading}
              </span>
              <span className="text-base leading-relaxed text-muted-foreground">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
