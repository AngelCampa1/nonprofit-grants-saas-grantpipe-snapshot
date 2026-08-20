export const GRANTPIPE_OS_CATEGORY = "Compliance-first grant management system.";

export const GRANTPIPE_OS_MODULES = [
  "Compliance calendar",
  "Evidence trail",
  "Restricted funds",
  "Grant pipeline",
  "Donor CRM",
  "Multi-source grant pipeline",
  "Fund accounting",
  "Auditor and funder portal",
] as const;

export const GRANTPIPE_OS_PLAN_LANGUAGE =
  "GrantPipe spans eight connected areas of work; the pricing page shows what each plan includes.";

export const GRANTPIPE_OS_BOILERPLATE =
  "GrantPipe is a compliance-first grant management system. It helps nonprofits manage awards, deadlines, restricted funds, evidence, reports, donor context, and audit trails in one workspace.";

export function getGrantPipeOsModuleList(): string {
  const modules = [...GRANTPIPE_OS_MODULES];
  const last = modules.pop();
  return `${modules.join(", ")}, and ${last}`;
}
