import * as React from "react";

import { cn } from "../lib/utils";

type InputSize = "xs" | "sm" | "default" | "lg";

const inputSizeClasses: Record<InputSize, string> = {
  xs: "h-6 px-3 text-xs",
  sm: "h-8 px-4 text-sm",
  default: "h-9 px-4 py-1 text-base md:text-sm",
  lg: "h-10 px-4 text-base",
};

interface InputProps extends React.ComponentProps<"input"> {
  inputSize?: InputSize;
}

function Input({ className, type, inputSize = "default", ...props }: InputProps) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={inputSize}
      className={cn(
        "w-full min-w-0 rounded-full border border-input bg-transparent shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:mr-3 file:inline-flex file:h-7 file:cursor-pointer file:appearance-none file:items-center file:rounded-full file:border-0 file:bg-secondary file:px-4 file:text-sm file:font-medium file:text-secondary-foreground hover:file:bg-secondary/80 placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        inputSizeClasses[inputSize],
        className,
      )}
      {...props}
    />
  );
}

export { Input };
export type { InputProps, InputSize };
