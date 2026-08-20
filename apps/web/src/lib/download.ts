import { ApiError } from "./http-response";
import { createOrgRequestInit } from "./org-context";
import { captureAppException } from "./sentry";

/**
 * Parse a filename out of a Content-Disposition header, preferring the
 * RFC 5987 `filename*=UTF-8''…` form over a plain `filename="…"`. Returns null
 * when no usable filename can be extracted.
 */
export function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) {
    return null;
  }

  const extendedMatch = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (extendedMatch?.[1]) {
    const raw = extendedMatch[1].trim().replace(/^"|"$/g, "");
    try {
      const decoded = decodeURIComponent(raw);
      if (decoded.length > 0) {
        return decoded;
      }
    } catch {
      // Fall through to the plain filename below when decoding fails.
    }
  }

  const plainMatch = /filename=("?)([^";]+)\1/i.exec(header);
  if (plainMatch?.[2]) {
    const value = plainMatch[2].trim();
    if (value.length > 0) {
      return value;
    }
  }

  return null;
}

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as unknown;
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        return record.error;
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        return record.message;
      }
    }
  } catch {
    // Body was not JSON; fall back to the default message below.
  }

  return "Unable to download file.";
}

function reportDownloadFailure(error: unknown): void {
  if (error instanceof ApiError && error.status < 500) {
    return;
  }

  captureAppException(
    error,
    {
      tags: {
        feature: "download",
        operation: "download_via_org_fetch",
        ...(error instanceof ApiError ? { status: String(error.status) } : {}),
      },
    },
    { sanitize: true },
  );
}

type GeneratedDownloadContext = {
  feature: string;
  operation: string;
};

function reportGeneratedDownloadFailure(context: GeneratedDownloadContext): void {
  captureAppException(
    new Error("Generated CSV download failed"),
    {
      tags: {
        feature: context.feature,
        operation: context.operation,
      },
    },
    { sanitize: true },
  );
}

export function downloadGeneratedCsv(
  content: string,
  filename: string,
  context: GeneratedDownloadContext,
): void {
  try {
    const blob = new Blob([content], { type: "text/csv" });
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    reportGeneratedDownloadFailure(context);
    throw error;
  }
}

/**
 * Download an authenticated file while sending the active-org context header.
 * A bare `<a href>` navigation cannot carry the `X-Org-Id` header, so multi-org
 * users would otherwise resolve the wrong org. This fetches the blob with the
 * org-scoped request init and triggers a client-side download.
 */
export async function downloadViaOrgFetch(path: string, fallbackFilename: string): Promise<void> {
  try {
    const response = await fetch(path, createOrgRequestInit({ method: "GET" }));

    if (!response.ok) {
      throw new ApiError(await parseErrorMessage(response), response.status);
    }

    const blob = await response.blob();
    const filename =
      filenameFromContentDisposition(response.headers.get("content-disposition")) ??
      fallbackFilename;

    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    reportDownloadFailure(error);
    throw error;
  }
}
