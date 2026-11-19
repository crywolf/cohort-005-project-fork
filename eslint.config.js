import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Flat config. Repo standards (see CODING_STANDARDS.md): no `any`, no non-null
// `!` assertions — both covered by tseslint's recommended set, along with
// no-unused-vars. Not type-aware on purpose: type-aware linting needs a
// project service and is much slower in CI.
export default tseslint.config(
  {
    ignores: [
      "build/**",
      "node_modules/**",
      ".cache/**",
      ".react-router/**", // react-router typegen output
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Only the two classic rules — not the v7 recommended set, whose
      // set-state-in-effect / refs rules would flag the whole existing app.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Upstream scaffold tooling, not app code: full of `any` by design.
  {
    files: ["request-logger/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);
