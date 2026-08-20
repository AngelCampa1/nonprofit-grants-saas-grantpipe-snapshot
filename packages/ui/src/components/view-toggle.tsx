import * as React from "react";
import { cn } from "../lib/utils";

export interface ViewToggleOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

export interface ViewToggleProps<T extends string = string> {
  options: ViewToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  "aria-label"?: string;
}

export function ViewToggle<T extends string = string>({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel = "View toggle",
}: ViewToggleProps<T>) {
  const buttonRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-muted p-0.5 gap-0.5",
        className,
      )}
    >
      {options.map((option, idx) => {
        const Icon = option.icon;
        const isActive = option.value === value;
        return (
          // Raw <button role="radio"> — intentional. This is the primitive for the
          // radiogroup keyboard widget; no Button component abstraction is appropriate
          // here because the entire toggle is the single UI component.
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            onClick={() => onChange(option.value)}
            onKeyDown={(e) => {
              const currentIndex = options.findIndex((o) => o.value === option.value);
              let nextIndex: number | null = null;
              if (e.key === "ArrowRight") {
                nextIndex = (currentIndex + 1) % options.length;
              } else if (e.key === "ArrowLeft") {
                nextIndex = (currentIndex - 1 + options.length) % options.length;
              }
              if (nextIndex !== null) {
                e.preventDefault();
                const nextOption = options[nextIndex];
                if (nextOption) {
                  onChange(nextOption.value);
                  buttonRefs.current[nextIndex]?.focus();
                }
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-all outline-none",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {Icon ? <Icon aria-hidden className="size-3.5" /> : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
