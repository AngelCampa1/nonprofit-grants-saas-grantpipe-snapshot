export const PAYWALL_LIMIT_EXCEEDED = "PAYWALL_LIMIT_EXCEEDED";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly errorCode?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string) {
  return new AppError(400, message);
}

export function forbidden(message: string) {
  return new AppError(403, message);
}

export function notFound(message: string) {
  return new AppError(404, message);
}

export function conflict(message: string) {
  return new AppError(409, message);
}

export function paymentRequired(message: string, errorCode: string = PAYWALL_LIMIT_EXCEEDED) {
  return new AppError(402, message, errorCode);
}

export function internalError(message: string) {
  return new AppError(500, message);
}

export function serviceUnavailable(message: string, errorCode?: string) {
  return new AppError(503, message, errorCode);
}
