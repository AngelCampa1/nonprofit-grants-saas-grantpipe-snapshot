type PublicTurnstileEnv = {
  PUBLIC_TURNSTILE_SITE_KEY?: string;
};

type ImportMetaWithEnv = ImportMeta & {
  env?: PublicTurnstileEnv;
};

export function getPublicTurnstileSiteKey(env?: PublicTurnstileEnv): string | undefined {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env;
  const candidate =
    env?.PUBLIC_TURNSTILE_SITE_KEY ??
    importMetaEnv?.PUBLIC_TURNSTILE_SITE_KEY ??
    globalThis.process?.env?.PUBLIC_TURNSTILE_SITE_KEY;
  const value = candidate?.trim();
  return value && value.length > 0 ? value : undefined;
}
