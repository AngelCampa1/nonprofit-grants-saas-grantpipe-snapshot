import { vi } from "vitest";

interface TurnstileRenderOptions {
  callback: (token: string) => void;
  "expired-callback"?: () => void;
}

export function installMockTurnstile() {
  const readyQueue: Array<() => void> = [];
  const renderOptions: TurnstileRenderOptions[] = [];
  const reset = vi.fn();
  const turnstile = {
    render: vi.fn((_element: HTMLElement, options: TurnstileRenderOptions) => {
      renderOptions.push(options);
      return `widget-${renderOptions.length}`;
    }),
    remove: vi.fn(),
    reset,
    ready: vi.fn((callback: () => void) => readyQueue.push(callback)),
  };

  (window as unknown as { turnstile: typeof turnstile }).turnstile = turnstile;

  return {
    turnstile,
    renderOptions,
    flush() {
      readyQueue.splice(0).forEach((callback) => callback());
    },
  };
}
