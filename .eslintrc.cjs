module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
  ],
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  ignorePatterns: ["dist", "node_modules", ".next", "supabase/.temp"],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      // Forbid server-only DB imports inside files that opt-in to client rendering.
      // Detection is structural: scan for "use client" directive at top of file.
      files: ["apps/web/**/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/lib/db", "**/lib/db", "@supabase/supabase-js"],
                message:
                  "Service-role DB access is server-only. Do not import from a client component.",
              },
            ],
          },
        ],
      },
    },
  ],
};
