import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http-response";
import { ACTIVE_ORG_STORAGE_KEY } from "./org-context";
import {
  downloadGeneratedCsv,
  downloadViaOrgFetch,
  filenameFromContentDisposition,
} from "./download";

vi.mock("./sentry", () => ({
  captureAppException: vi.fn(),
}));

import { captureAppException } from "./sentry";

describe("filenameFromContentDisposition", () => {
  it("returns null when the header is missing", () => {
    expect(filenameFromContentDisposition(null)).toBeNull();
  });

  it("returns null when no filename token is present", () => {
    expect(filenameFromContentDisposition("attachment")).toBeNull();
  });

  it("parses RFC 5987 filename*=UTF-8'' values", () => {
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''appeal%20letter.pdf")).toBe(
      "appeal letter.pdf",
    );
  });

  it("prefers filename* over a plain filename", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''real%20name.pdf",
      ),
    ).toBe("real name.pdf");
  });

  it("parses a quoted plain filename", () => {
    expect(filenameFromContentDisposition('attachment; filename="report.pdf"')).toBe("report.pdf");
  });

  it("parses an unquoted plain filename", () => {
    expect(filenameFromContentDisposition("attachment; filename=report.pdf")).toBe("report.pdf");
  });

  it("falls back to the plain filename when filename* cannot be decoded", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"safe.pdf\"; filename*=UTF-8''%E0%A4%A.pdf",
      ),
    ).toBe("safe.pdf");
  });

  it("returns null when filename* cannot be decoded and no plain filename exists", () => {
    expect(filenameFromContentDisposition("attachment; filename*=UTF-8''%E0%A4%A.pdf")).toBeNull();
  });
});

describe("downloadViaOrgFetch", () => {
  const createObjectURL = vi.fn(() => "blob:mock-url");
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendedAnchors: HTMLAnchorElement[];
  let removeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.mocked(captureAppException).mockClear();
    localStorage.clear();

    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

    clickSpy = vi.fn();
    removeSpy = vi.fn();
    appendedAnchors = [];
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
      const anchor = node as unknown as HTMLAnchorElement;
      anchor.click = clickSpy;
      anchor.remove = removeSpy;
      appendedAnchors.push(anchor);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(response: Partial<Response> & { ok: boolean }) {
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("downloads the file and applies the Content-Disposition filename with org header", async () => {
    localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, "org-42");
    const blob = new Blob(["data"], { type: "application/pdf" });
    const fetchMock = mockFetch({
      ok: true,
      status: 200,
      headers: new Headers({ "content-disposition": 'attachment; filename="server.pdf"' }),
      blob: () => Promise.resolve(blob),
    } as Partial<Response> & { ok: boolean });

    await downloadViaOrgFetch("/api/documents/doc-1/download", "fallback.pdf");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe("/api/documents/doc-1/download");
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-Org-Id"]).toBe("org-42");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    const anchor = appendedAnchors[0];
    expect(anchor).toBeDefined();
    expect(anchor?.download).toBe("server.pdf");
    expect(anchor?.href).toContain("blob:mock-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("uses the fallback filename when the header is absent", async () => {
    const blob = new Blob(["data"], { type: "application/pdf" });
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: () => Promise.resolve(blob),
    } as Partial<Response> & { ok: boolean });

    await downloadViaOrgFetch("/api/documents/doc-2/download", "fallback.pdf");

    const anchor = appendedAnchors[0];
    expect(anchor?.download).toBe("fallback.pdf");
  });

  it("throws ApiError with the parsed message on a non-ok JSON response", async () => {
    mockFetch({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: () => Promise.resolve({ error: "Document not found" }),
    } as Partial<Response> & { ok: boolean });

    await expect(
      downloadViaOrgFetch("/api/documents/missing/download", "fallback.pdf"),
    ).rejects.toMatchObject({ message: "Document not found", status: 404 });
    await expect(
      downloadViaOrgFetch("/api/documents/missing/download", "fallback.pdf"),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError using the message field when error is absent", async () => {
    mockFetch({
      ok: false,
      status: 403,
      headers: new Headers(),
      json: () => Promise.resolve({ message: "Forbidden" }),
    } as Partial<Response> & { ok: boolean });

    await expect(
      downloadViaOrgFetch("/api/documents/forbidden/download", "fallback.pdf"),
    ).rejects.toMatchObject({ message: "Forbidden", status: 403 });
  });

  it("throws ApiError with the default message when JSON has no usable fields", async () => {
    mockFetch({
      ok: false,
      status: 422,
      headers: new Headers(),
      json: () => Promise.resolve({ unrelated: true }),
    } as Partial<Response> & { ok: boolean });

    await expect(
      downloadViaOrgFetch("/api/documents/weird/download", "fallback.pdf"),
    ).rejects.toMatchObject({ message: "Unable to download file.", status: 422 });
  });

  it("throws ApiError with the default message when the body is not JSON", async () => {
    mockFetch({
      ok: false,
      status: 500,
      headers: new Headers(),
      json: () => Promise.reject(new Error("not json")),
    } as Partial<Response> & { ok: boolean });

    await expect(
      downloadViaOrgFetch("/api/documents/boom/download", "fallback.pdf"),
    ).rejects.toMatchObject({ message: "Unable to download file.", status: 500 });
    expect(captureAppException).toHaveBeenCalledWith(
      expect.any(ApiError),
      {
        tags: {
          feature: "download",
          operation: "download_via_org_fetch",
          status: "500",
        },
      },
      { sanitize: true },
    );
  });

  it("reports client-side object URL failures without path or filename context", async () => {
    const error = new Error("createObjectURL failed");
    createObjectURL.mockImplementationOnce(() => {
      throw error;
    });
    mockFetch({
      ok: true,
      status: 200,
      headers: new Headers(),
      blob: () => Promise.resolve(new Blob(["data"], { type: "application/pdf" })),
    } as Partial<Response> & { ok: boolean });

    await expect(
      downloadViaOrgFetch("/api/documents/private-doc/download", "secret.pdf"),
    ).rejects.toThrow("createObjectURL failed");
    expect(captureAppException).toHaveBeenCalledWith(
      error,
      {
        tags: {
          feature: "download",
          operation: "download_via_org_fetch",
        },
      },
      { sanitize: true },
    );
    expect(JSON.stringify(vi.mocked(captureAppException).mock.calls)).not.toContain("private-doc");
    expect(JSON.stringify(vi.mocked(captureAppException).mock.calls)).not.toContain("secret.pdf");
  });
});

describe("downloadGeneratedCsv", () => {
  const createObjectURL = vi.fn(() => "blob:generated-url");
  const revokeObjectURL = vi.fn();
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendedAnchors: HTMLAnchorElement[];
  let removeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    vi.mocked(captureAppException).mockClear();

    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, configurable: true });

    clickSpy = vi.fn();
    removeSpy = vi.fn();
    appendedAnchors = [];
    vi.spyOn(document.body, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
      const anchor = node as unknown as HTMLAnchorElement;
      anchor.click = clickSpy;
      anchor.remove = removeSpy;
      appendedAnchors.push(anchor);
      return node;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads generated CSV content with the provided filename", () => {
    downloadGeneratedCsv("Header\nValue", "ledger-secret-account.csv", {
      feature: "accounting",
      operation: "ledger_export_csv",
    });

    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    const anchor = appendedAnchors[0];
    expect(anchor?.download).toBe("ledger-secret-account.csv");
    expect(anchor?.href).toContain("blob:generated-url");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:generated-url");
    expect(captureAppException).not.toHaveBeenCalled();
  });

  it("reports generated CSV failures without content or filename context", () => {
    const error = new Error("object URL failed for ledger-secret-account.csv");
    createObjectURL.mockImplementationOnce(() => {
      throw error;
    });

    expect(() =>
      downloadGeneratedCsv("Secret Donor,1000", "ledger-secret-account.csv", {
        feature: "accounting",
        operation: "ledger_export_csv",
      }),
    ).toThrow("object URL failed");

    expect(captureAppException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        tags: {
          feature: "accounting",
          operation: "ledger_export_csv",
        },
      },
      { sanitize: true },
    );
    const calls = JSON.stringify(vi.mocked(captureAppException).mock.calls);
    expect(calls).not.toContain("Secret Donor");
    expect(calls).not.toContain("ledger-secret-account.csv");
  });
});
