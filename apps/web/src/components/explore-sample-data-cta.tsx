import React, { useState } from "react";
import { Button } from "@grantpipe/ui";
import { useSampleDataStatus, useSeedSampleData } from "../hooks/use-sample-data";

// Analytics and Sentry are already wired inside useSeedSampleData — no additional
// instrumentation needed here.

export function ExploreSampleDataCta(): React.JSX.Element | null {
  const status = useSampleDataStatus();
  const seed = useSeedSampleData();
  const [hasError, setHasError] = useState(false);

  if (status.isLoading || status.data?.seeded === true) {
    return null;
  }

  async function handleClick() {
    setHasError(false);
    try {
      await seed.mutateAsync();
    } catch {
      setHasError(true);
    }
  }

  return (
    <div data-testid="explore-sample-data-cta" className="flex flex-col items-start gap-2 py-2">
      <p className="text-sm text-muted-foreground">Not sure where to start?</p>
      <Button
        variant="outline"
        size="sm"
        disabled={seed.isPending}
        onClick={() => void handleClick()}
      >
        {seed.isPending ? "Adding sample data…" : "Explore sample data"}
      </Button>
      {hasError ? (
        <p role="alert" className="text-sm text-destructive">
          That didn't work. Try again.
        </p>
      ) : null}
    </div>
  );
}
