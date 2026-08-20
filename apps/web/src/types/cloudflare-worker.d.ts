declare global {
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
  }
}

export {};
