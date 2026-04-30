// Minimal ESLint flat config. Goal is to surface real bugs (undeclared globals,
// unused vars, accidental fall-throughs) without bikeshedding style. Style is
// deliberately not enforced here — pick that up later if needed.
//
// Run with `npm run lint`.

import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      // The minified renderer bundle and any other dist output.
      "dist/**",
      // Patch scripts intentionally mangle minified code and use literal
      // strings that no linter can usefully reason about.
      "patches/**",
      // Snapshot output and the on-disk archive of pre-cleanup artifacts.
      "tests/__snapshots__/**",
      ".archive/**",
      // Versioned releases.
      "releases/**",
      // Native module build output.
      "electron/native/ndi-sender/build/**",
      "electron/native/ndi-sender/node_modules/**",
      // Browser-injected overlay; runs in a sandboxed <script> with its own
      // globals (window.__LT_VERSION etc.). Treat separately if needed.
      "server/overlay/**",
    ],
  },

  // Default for everything: ESM + Node + browser-style globals where applicable.
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Tests and routes have lots of "_unused" args by convention. Permit them.
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      // `try { ... } catch { /* best-effort */ }` is an idiom in this codebase
      // for fire-and-forget IO. Allow empty catches; everywhere else still flagged.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // CommonJS-only globals get tripped up by ESM lint runs; we override
      // these in the CJS overrides below.
      "no-undef": "error",
    },
  },

  // CommonJS files (.cjs) need require/module/__dirname etc.
  {
    files: ["**/*.cjs"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
  },

  // Test files: vitest globals (describe/it/expect/vi).
  {
    files: ["tests/**/*.{js,cjs}"],
    languageOptions: {
      globals: {
        ...globals.node,
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
      },
    },
  },
];
