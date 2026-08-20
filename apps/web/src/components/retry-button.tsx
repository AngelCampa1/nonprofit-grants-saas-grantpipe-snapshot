import type { UseQueryResult } from "@tanstack/react-query";
import { Button } from "@grantpipe/ui";

interface RetryButtonProps {
  query: Pick<UseQueryResult, "refetch" | "isFetching">;
  className?: string;
}

export function RetryButton({ query, className }: RetryButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={query.isFetching}
      onClick={() => {
        void query.refetch();
      }}
      className={className}
    >
      {query.isFetching ? "Retrying…" : "Retry"}
    </Button>
  );
}
