import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

// Design-system guardrails (Phase 6): forbid raw hex, [var(--color|surface|shadow|radius|animate|font-*)]
// brackets, and raw Tailwind palette classes in JSX class/className attributes.
//
// Allowed (for legitimate remaining usage): [var(--transition-*)], [var(--component-gap-*)],
// [var(--section-py-*)], [var(--icon-*)], [var(--content-measure-*)], [var(--card-hover-*)], [var(--scrim)].
//
// Raw palette block excludes `primary-*`, `accent-*`, `neutral-*`, `success-*`, `warning-*`, `info-*`,
// `destructive-*`, and `stage-*` — those ARE the design-system tokens.
const designSystemRestrictedSyntax = [
  {
    selector:
      "JSXAttribute[name.name=/^(class|className)$/] Literal[value=/\\[var\\(--(color|surface|shadow|radius|animate|font)-/]",
    message:
      "Use the semantic Tailwind utility (e.g. bg-surface-primary, text-success-600) instead of arbitrary [var(--color|surface|shadow|radius|animate|font-*)] syntax. See packages/ui/src/globals.css.",
  },
  {
    selector:
      "JSXAttribute[name.name=/^(class|className)$/] Literal[value=/\\[#[0-9a-fA-F]{3,8}\\]/]",
    message:
      "Use a semantic color token from packages/ui/src/globals.css instead of an arbitrary hex class.",
  },
  {
    selector:
      "JSXAttribute[name.name=/^(class|className)$/] Literal[value=/\\b(bg|text|border|ring|fill|stroke|decoration|outline|from|to|via)-(amber|blue|green|rose|red|slate|gray|zinc|yellow|orange|indigo|violet|purple|pink|cyan|teal|emerald|lime|sky|fuchsia)-[0-9]+/]",
    message:
      "Use semantic variants (success/warning/info/destructive/stage-*) or design-system scales (primary-*, accent-*, neutral-*) instead of raw Tailwind palette classes.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/dist/",
      "**/node_modules/",
      "**/.wrangler/",
      "**/.turbo/",
      "**/routeTree.gen.ts",
      // Vendored, minified third-party bundle used only by video compositions.
      "docs/**/production/assets/gsap.min.js",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/ui/src/site/**/*.{ts,tsx}"],
    ignores: [
      // Token definitions and design-system primitives can define raw colors:
      "packages/ui/src/components/**",
      // These files contain legitimate brand-logo hex colors (Google logo) and
      // user-configured tag/pipeline colors — covered by the grep script allowlist too.
      "apps/web/src/routes/login.tsx",
      "apps/web/src/routes/signup.tsx",
      "apps/web/src/components/donors/pipeline-board.tsx",
      "apps/web/src/components/donors/tag-picker.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", ...designSystemRestrictedSyntax],
    },
  },
  {
    files: [
      "scripts/**/*.{mjs,js,ts}",
      "docs/**/production/**/*.{mjs,js,ts}",
      "docs/**/_lib/**/*.{mjs,js,ts}",
      // Real-app screen-capture harnesses: Node scripts that also inject
      // browser code (document/window) via Playwright addInitScript.
      "docs/**/_capture/**/*.{mjs,js,ts}",
    ],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        window: "readonly",
        document: "readonly",
      },
    },
  },
  prettierConfig,
);
