export function requireProductionUrl(
  value: string,
  expectedHost: string,
  label: string,
  env: Partial<Pick<NodeJS.ProcessEnv, "ALLOW_NON_PROD_E2E_TARGET">> = process.env,
): string {
  const parsed = new URL(value);
  if (parsed.hostname === expectedHost) {
    return value;
  }

  if (env.ALLOW_NON_PROD_E2E_TARGET === "1") {
    return value;
  }

  throw new Error(
    `${label} must target ${expectedHost}. Set ALLOW_NON_PROD_E2E_TARGET=1 only for explicit non-production rehearsals.`,
  );
}
