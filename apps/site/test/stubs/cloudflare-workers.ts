// Test stub for the `cloudflare:workers` virtual module (provided only by the
// Cloudflare adapter at build/runtime). Vitest aliases the import here so route
// modules that read `env` can be unit-tested in a plain Node environment.
//
// The AI-SDR route wrappers are exercised for their pre-secret branches
// (405 / 403 / 404), which never read these values, so an empty object is
// sufficient. Tests that need populated secrets mutate this object directly.
export const env: { AI_SDR_CLIENT_ASSERTION_SECRET?: string; AI_SDR_CONTEXT_SECRET?: string } = {};
