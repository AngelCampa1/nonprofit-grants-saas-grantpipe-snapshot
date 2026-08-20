export function createRetryAttemptRegistry() {
  const failedAttempts = new Map<string, string[]>();

  return {
    take(payloadKey: string): string {
      const retries = failedAttempts.get(payloadKey);
      const retry = retries?.shift();
      if (retries?.length === 0) failedAttempts.delete(payloadKey);
      return retry ?? crypto.randomUUID();
    },
    retain(payloadKey: string, attemptId: string): void {
      const retries = failedAttempts.get(payloadKey) ?? [];
      retries.push(attemptId);
      failedAttempts.set(payloadKey, retries);
    },
  };
}
