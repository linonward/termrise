import { defineConfig } from "vitest/config";

// .agents/skills links to .claude/skills for Codex: run those tests once.
const exclude = [
  "**/node_modules/**",
  "**/tests/e2e/**",
  "**/.next/**",
  ".agents/**",
];

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Only used with --coverage (pnpm test:coverage). E2E is not counted.
    coverage: {
      provider: "v8",
      include: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
      // Generated files, test helpers, and config/startup files are not app code.
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/.next/**",
        "**/tests/setup/**",
        "packages/db/src/testing/**",
        "**/*.config.ts",
        "**/instrumentation*.ts",
      ],
      reporter: ["text-summary", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          // .test.mjs: the scripts of project skills in .claude/skills/.
          include: ["**/*.test.ts", "**/*.test.mjs"],
          exclude: [...exclude, "**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["**/*.int.test.ts"],
          exclude,
          globalSetup: ["packages/db/src/testing/global-db.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
