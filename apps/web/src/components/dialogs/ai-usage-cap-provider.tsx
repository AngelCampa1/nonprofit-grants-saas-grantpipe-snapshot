import { createContext, useCallback, useContext, useState } from "react";
import type { AiUsageCapPayload } from "@grantpipe/shared";
import { getAiUsageCapPayload } from "../../lib/api-errors";
import { AiUsageCapDialog } from "./ai-usage-cap-dialog";

type ReportAiUsageCap = (error: unknown) => boolean;

const AiUsageCapContext = createContext<ReportAiUsageCap>(() => false);

interface AiUsageCapProviderProps {
  children: React.ReactNode;
}

export function AiUsageCapProvider({ children }: AiUsageCapProviderProps) {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<AiUsageCapPayload | null>(null);

  const reportCap = useCallback((error: unknown): boolean => {
    const capPayload = getAiUsageCapPayload(error);
    if (capPayload === null) return false;
    setPayload(capPayload);
    setOpen(true);
    return true;
  }, []);

  return (
    <AiUsageCapContext.Provider value={reportCap}>
      {children}
      <AiUsageCapDialog open={open} onOpenChange={setOpen} payload={payload} />
    </AiUsageCapContext.Provider>
  );
}

export function useReportAiUsageCap(): ReportAiUsageCap {
  return useContext(AiUsageCapContext);
}
