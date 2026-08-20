const DEFAULT_PUBLIC_API_URL = "https://app.grantpipe.com";

type PublicApiEnv = {
  PUBLIC_APP_URL?: string;
};

type ImportMetaWithEnv = ImportMeta & {
  env?: PublicApiEnv;
};

export function getPublicApiBaseUrl(env?: PublicApiEnv): string {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env;
  const candidate =
    env?.PUBLIC_APP_URL ?? importMetaEnv?.PUBLIC_APP_URL ?? globalThis.process?.env?.PUBLIC_APP_URL;
  const value = candidate?.trim();
  return value && value.length > 0 ? value.replace(/\/$/, "") : DEFAULT_PUBLIC_API_URL;
}
