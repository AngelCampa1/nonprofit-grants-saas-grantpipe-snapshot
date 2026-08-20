type ErrorPayload = {
  error?: string;
  message?: string;
  errorCode?: string;
};

type JsonResponse<T> = {
  json: () => Promise<T>;
  ok?: boolean;
  status?: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly errorCode?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function extractMessage(payload: unknown) {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const candidate = payload as ErrorPayload;
  if (typeof candidate.error === "string" && candidate.error.length > 0) {
    return candidate.error;
  }
  if (typeof candidate.message === "string" && candidate.message.length > 0) {
    return candidate.message;
  }

  return null;
}

function extractErrorCode(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const candidate = payload as ErrorPayload;
  return typeof candidate.errorCode === "string" && candidate.errorCode.length > 0
    ? candidate.errorCode
    : undefined;
}

async function readFailurePayload(response: JsonResponse<unknown>) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

export async function readResponseOrThrow<T>(response: JsonResponse<T>): Promise<T> {
  const isFailure = typeof response.ok === "boolean" && !response.ok;

  // 204 No Content has no body. Parsing JSON would throw. When the response is
  // ok (or the status is unknown), return undefined without touching json().
  // Failed 204 responses still fall through to the error path so callers see
  // the underlying problem rather than a silent success.
  if (response.status === 204 && !isFailure) {
    return undefined as T;
  }

  const payload = await response.json();

  if (isFailure) {
    throw new ApiError(
      extractMessage(payload) ?? "Request failed",
      response.status ?? 0,
      extractErrorCode(payload),
      payload ?? undefined,
    );
  }

  return payload;
}

export async function throwIfNotOk(response?: JsonResponse<unknown> | null) {
  if (!response || response.ok) {
    return;
  }

  const payload = await readFailurePayload(response);
  throw new ApiError(
    extractMessage(payload) ?? "Request failed",
    response.status ?? 0,
    extractErrorCode(payload),
    payload ?? undefined,
  );
}
