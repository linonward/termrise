import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Architecture boundaries in eslint.config.mjs (docs/architecture/overview.md#monorepo).
const eslint = new ESLint();

async function boundaryErrors(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter(
      (m) =>
        m.ruleId === "no-restricted-imports" ||
        m.ruleId === "@typescript-eslint/no-restricted-imports" ||
        m.ruleId === "no-restricted-properties" ||
        m.ruleId === "no-restricted-syntax",
    )
    .map((m) => m.ruleId);
}

describe("packages", () => {
  const file = "packages/credits/src/example.ts";

  it.each([
    'import { x } from "@/server/auth/auth";',
    'import product from "@product";',
    'import { x } from "../../../apps/web/src/lib/poll";',
    'import { headers } from "next/headers";',
    'import { NextResponse } from "next/server";',
    'import { serverEnv } from "@repo/config/env";',
  ])("reject %s", async (code) => {
    expect(await boundaryErrors(file, `${code}\nexport {};\n`)).toEqual([
      "no-restricted-imports",
    ]);
  });

  it("reject process.env", async () => {
    expect(
      await boundaryErrors(file, "export const url = process.env.X;\n"),
    ).toEqual(["no-restricted-properties"]);
  });

  it("allow declared packages and React", async () => {
    const code =
      'import { useState } from "react";\nimport { db } from "@repo/db/client";\nexport { db, useState };\n';
    expect(await boundaryErrors(file, code)).toEqual([]);
    expect(
      await boundaryErrors(
        "packages/ui/src/components/x.tsx",
        'import { useState } from "react";\nexport { useState };\n',
      ),
    ).toEqual([]);
  });

  // A package imports only the @repo packages in its package.json.
  it.each([
    ["packages/credits/src/x.ts", "@repo/billing/billing-service"],
    ["packages/observability/src/x.ts", "@repo/credits/credit-service"],
    ["packages/db/src/x.ts", "@repo/storage/types"],
    ["packages/ui/src/components/x.tsx", "@repo/db/client"],
  ])("reject an undeclared package in %s: %s", async (path, source) => {
    expect(
      await boundaryErrors(
        path,
        `import { x } from "${source}";\nexport { x };\n`,
      ),
    ).toEqual(["no-restricted-imports"]);
  });

  it.each([
    ["packages/billing/src/x.ts", "@repo/credits/credit-service"],
    ["packages/storage/src/x.ts", "@repo/storage/types"],
  ])("allow a declared package in %s: %s", async (path, source) => {
    expect(
      await boundaryErrors(
        path,
        `import { x } from "${source}";\nexport { x };\n`,
      ),
    ).toEqual([]);
  });

  it.each([
    "packages/config/src/env.ts",
    "packages/db/src/client.ts",
    "packages/db/src/testing/test-database.ts",
    "packages/db/drizzle.config.ts",
  ])("allow process.env in %s", async (path) => {
    expect(
      await boundaryErrors(path, "export const url = process.env.X;\n"),
    ).toEqual([]);
  });
});

describe("web data access", () => {
  it.each([
    "apps/web/src/app/(dashboard)/billing/page.tsx",
    "apps/web/src/app/admin/actions.ts",
    "apps/web/src/components/billing/x.tsx",
    "apps/web/src/features/tasks/task-panel.tsx",
    "apps/web/src/server/api/api.ts",
    "apps/web/src/server/product.ts",
    "apps/web/src/lib/x.test.ts",
  ])("reject database and service code in %s", async (path) => {
    for (const code of [
      'import { db } from "@repo/db/client";',
      'import { tasks } from "@repo/db/schema";',
      'import { eq } from "drizzle-orm";',
      'import { createTaskService } from "@repo/tasks/task-service";',
      'import { createR2Storage } from "@repo/storage/adapters/r2";',
    ])
      expect(await boundaryErrors(path, `${code}\nexport {};\n`)).toEqual([
        "@typescript-eslint/no-restricted-imports",
      ]);
  });

  it("allow types, DTO helpers and rules from packages", async () => {
    const code = [
      'import type { createAdminService } from "@repo/admin/admin-service";',
      'import type { TaskDto } from "@repo/tasks/task-dto";',
      'import { TASK_CREDIT_COST } from "@repo/tasks/credit-cost";',
      'import { createSessionClient } from "@repo/auth/session-client";',
      "export type { createAdminService, TaskDto };",
      "export { TASK_CREDIT_COST, createSessionClient };",
    ].join("\n");
    expect(
      await boundaryErrors("apps/web/src/app/admin/users/x.tsx", code),
    ).toEqual([]);
  });

  it("reject route handlers other than /api/health", async () => {
    const code = "export const GET = () => new Response();\n";
    expect(
      await boundaryErrors("apps/web/src/app/api/tasks/route.ts", code),
    ).toEqual(["no-restricted-syntax"]);
    expect(
      await boundaryErrors("apps/web/src/app/api/health/route.ts", code),
    ).toEqual([]);
  });
});

describe("web platform code", () => {
  const feature =
    'import { TaskPanel } from "@/features/tasks/task-panel";\nexport { TaskPanel };\n';

  it.each([
    "apps/web/src/server/api/api.ts",
    "apps/web/src/components/billing/pricing-plans.tsx",
    "apps/web/src/lib/poll.ts",
    "apps/web/src/i18n/request.ts",
    "apps/web/scripts/indexnow.ts",
  ])("reject feature imports in %s", async (path) => {
    expect(await boundaryErrors(path, feature)).toEqual([
      "no-restricted-imports",
    ]);
  });

  it.each([
    "apps/web/src/server/product.ts",
    "apps/web/src/features/tasks/task-panel.tsx",
    "apps/web/src/app/(dashboard)/dashboard/page.tsx",
  ])("allow feature imports in %s", async (path) => {
    expect(await boundaryErrors(path, feature)).toEqual([]);
  });
});
