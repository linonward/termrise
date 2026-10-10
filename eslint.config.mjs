import { readdirSync, readFileSync } from "node:fs";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// The web app reads and writes data only through apps/api (docs/adr/012-api-modular-monolith.md):
// no database, services or provider adapters. Types from them are fine.
const NO_SERVER_CODE = {
  group: [
    "@repo/db",
    "@repo/db/*",
    "drizzle-orm",
    "drizzle-orm/*",
    "@repo/*/*-service",
    "@repo/*/adapters/*",
    "@repo/tasks/user-data",
    "@repo/auth/create-auth",
  ],
  message: "The web app reads and writes data through apps/api.",
  allowTypeImports: true,
};
const NO_FEATURES = {
  group: ["@/features/*"],
  message: "Reach the product feature through @/server/product.",
};

const PACKAGES = readdirSync(new URL("./packages", import.meta.url), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// What a package may not import; @repo packages missing from its package.json included.
function packageImports(name) {
  const pkg = JSON.parse(
    readFileSync(
      new URL(`./packages/${name}/package.json`, import.meta.url),
      "utf8",
    ),
  );
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const undeclared = PACKAGES.filter(
    (other) => other !== name && !declared.includes(`@repo/${other}`),
  ).map((other) => `@repo/${other}/*`);
  // @repo/config/env has its own message in `paths`; report it once. Packages have
  // no root entry (only subpaths), so `@repo/<name>/*` covers every import.
  if (undeclared.length) undeclared.push("!@repo/config/env");
  return {
    paths: [
      { name: "@product", message: "Pass product data as a parameter." },
      { name: "next", message: "Packages do not depend on Next.js." },
      {
        name: "@repo/config/env",
        message: "Apps read env and pass values to packages.",
      },
    ],
    patterns: [
      {
        group: ["@/*", "**/apps/**"],
        message: "Packages do not depend on apps.",
      },
      { group: ["next/*"], message: "Packages do not depend on Next.js." },
      ...(undeclared.length
        ? [
            {
              group: undeclared,
              message:
                "Add the package to package.json first; dependencies point down.",
            },
          ]
        : []),
    ],
  };
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // The Next.js plugin looks for pages in the web app.
  { settings: { next: { rootDir: "apps/web" }, react: { version: "19" } } },
  // Import order: Node built-ins, packages, workspace packages and aliases, relative paths.
  {
    rules: {
      "import/order": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
          ],
          pathGroups: [
            { pattern: "@repo/**", group: "internal", position: "before" },
            { pattern: "@product", group: "internal" },
            { pattern: "@/**", group: "internal" },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },
  // Server logs go through the structured logger.
  {
    files: ["apps/*/src/**/*.{ts,tsx}", "packages/*/src/**/*.{ts,tsx}"],
    ignores: ["**/logger.ts", "**/*.test.ts"],
    rules: { "no-console": "error" },
  },
  // Package boundaries (docs/architecture/overview.md#monorepo): no app code,
  // no Next.js, no env reads, and only the @repo packages in package.json.
  // Tested in eslint-boundaries.test.ts; package-graph.test.ts keeps that graph a DAG.
  ...PACKAGES.map((name) => ({
    files: [`packages/${name}/**/*.{ts,tsx}`],
    rules: {
      "no-restricted-imports": ["error", packageImports(name)],
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message: "Apps read env and pass values to packages.",
        },
      ],
    },
  })),
  // The listed exceptions that read env.
  {
    files: [
      "packages/config/src/env.ts",
      "packages/db/src/client.ts",
      "packages/db/src/testing/**",
      "packages/db/drizzle.config.ts",
    ],
    rules: { "no-restricted-properties": "off" },
  },
  // The web app has no database access (docs/architecture/overview.md#architecture-rules).
  // A separate rule from the feature boundary below, so neither replaces the other.
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        { patterns: [NO_SERVER_CODE] },
      ],
    },
  },
  // apps/api serves the API; the web app keeps only /api/health for uptime monitors.
  {
    files: ["apps/web/src/app/**/route.{ts,tsx}"],
    ignores: ["apps/web/src/app/api/health/route.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program",
          message: "Add API routes to apps/api, not to the web app.",
        },
      ],
    },
  },
  // Platform code reaches the replaceable feature only through server/product.ts
  // (docs/architecture/overview.md#repository-structure).
  {
    files: [
      "apps/web/src/components/**",
      "apps/web/src/server/**",
      "apps/web/src/lib/**",
      "apps/web/src/i18n/**",
      "apps/web/scripts/**",
    ],
    ignores: ["apps/web/src/server/product.ts", "**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [NO_FEATURES] }],
    },
  },
  globalIgnores([
    "**/.next/**",
    // wrangler dev bundle of apps/api.
    "**/.wrangler/**",
    "**/dist/**",
    ".turbo/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
]);

export default eslintConfig;
