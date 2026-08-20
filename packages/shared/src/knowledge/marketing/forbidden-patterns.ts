export const FORBIDDEN_PATTERNS: ReadonlyArray<{ name: string; pattern: RegExp; reason: string }> =
  [
    {
      name: "grantpipe-fabricated-user-count",
      pattern:
        /\b(?:GrantPipe(?:\s+is)?\s+(?:used|trusted|loved|chosen|preferred)\s+by|GrantPipe\s+customers\s+include|GrantPipe\s+(?:already\s+)?serves|Join(?:ed)?\s+(?:the\s+)?GrantPipe\s+(?:community|customers|users)(?:\s+of)?)\s+(?:\d{1,3}(?:[,\d]{0,7})?)\s+(?:nonprofits?|organizations?|customers?|users?|orgs?|teams?)/i,
      reason:
        "GrantPipe-specific 'trusted by N nonprofits' / 'used by N orgs' claim without a verifiable count. Competitor characterizations are not matched.",
    },
    {
      name: "grantpipe-testimonial-quote",
      pattern:
        /"[^"\n]{20,}"\s{0,3}[—–-]\s{0,3}(?:Executive Director|Development Director|CFO|Grants Manager|ED|Director of Development)[\s,]/i,
      reason:
        "Customer testimonial attributed to a nonprofit role — CLAUDE.md forbids fabricated testimonials.",
    },
    {
      name: "first-person-sector-experience",
      pattern:
        /\b(?:as|after|during|throughout)\s+(?:my|our)\s+\d{1,3}\s+years?\s+(?:as|at|running|leading|in|of)\s+(?:a\s+)?(?:nonprofit|fundraising|grants?\s+manag|development\s+direct)/i,
      reason:
        "First-person nonprofit sector experience — CLAUDE.md forbids claiming sector experience.",
    },
    {
      name: "first-person-grant-achievement",
      pattern:
        /\b(?:I[' ]?ve|we[' ]?ve)\s+(?:personally\s+)?(?:written|managed|run|raised|secured|won|awarded)\s+(?:[\w$]+\s+){0,5}(?:grants?|nonprofits?|in\s+funding|in\s+awards?)\b/i,
      reason:
        "First-person achievement claim about grants/fundraising — CLAUDE.md forbids fabricated experience.",
    },
    {
      name: "old-operating-system-positioning",
      pattern:
        /(?<!not a )(?<!not an )\b(?:compliance|restricted-fund|post-award|grant-funded nonprofit|donor-plus-grant)\s+operating system\b|\boperating[- ]system\s+(?:for\s+restricted funds|problem)\b|\b(?:inside|into)\s+the\s+operating system\b/i,
      reason:
        "Retired GrantPipe category phrasing; use compliance-first grant management system/software instead.",
    },
    {
      name: "grantpipe-operating-system-positioning",
      pattern: /\bGrantPipe\b[\s\S]{0,160}\boperating system\b/i,
      reason: "GrantPipe should not be positioned as an operating system in public copy.",
    },
    {
      name: "generic-operating-system-hook",
      pattern: /\b(?:your|same|one)\s+operating system\b/i,
      reason: "Reusable hooks and public copy should avoid generic operating-system positioning.",
    },
  ] as const;

export type ForbiddenPattern = (typeof FORBIDDEN_PATTERNS)[number];
