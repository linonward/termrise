// Runs the evals in evals.json with `claude -p`, each in a throwaway git
// worktree of HEAD (commit first: uncommitted changes are not in the run), and
// writes skill-creator's workspace layout:
//   .claude/skills/seo-keyword-matrix-workspace/iteration-<n>/eval-<id>-<name>/
//     eval_metadata.json
//     with_skill/run-1/ | without_skill/run-1/
//       outputs/ (seo/, reply.md, diff.patch)  transcript.jsonl  timing.json  grading.json
// grading.json holds the scripted checks (grade.mjs); the expectations in
// evals.json about the reply are graded afterwards from transcript.jsonl.
// The agent may edit files in the worktree (acceptEdits) and run only the
// commands in ALLOWED_TOOLS; anything else (git push, rm, network) is denied.
//   node .claude/skills/seo-keyword-matrix/evals/run.mjs [--eval <name>]… [--baseline] [--iteration <n>] [--keep]
import { execFile, execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";

import { GRADERS, readState } from "./grade.mjs";

const run = promisify(execFile);
const EVALS_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO = execFileSync(
  "git",
  ["-C", EVALS_DIR, "rev-parse", "--show-toplevel"],
  {
    encoding: "utf8",
  },
).trim();
const WORKSPACE = join(REPO, ".claude/skills/seo-keyword-matrix-workspace");
const ALLOWED_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Edit",
  "Write",
  "Skill",
  "WebFetch",
  "WebSearch",
  "Bash(node:*)",
  "Bash(pnpm:*)",
  "Bash(ls:*)",
  "Bash(cat:*)",
  "Bash(head:*)",
  "Bash(wc:*)",
  "Bash(git status:*)",
  "Bash(git diff:*)",
];
const SKILL_DIRS = [
  ".claude/skills/seo-keyword-matrix",
  ".agents/skills/seo-keyword-matrix",
];

const { values } = parseArgs({
  options: {
    eval: { type: "string", multiple: true },
    baseline: { type: "boolean", default: false },
    iteration: { type: "string" },
    keep: { type: "boolean", default: false },
  },
});

const { evals } = JSON.parse(
  readFileSync(join(EVALS_DIR, "evals.json"), "utf8"),
);
const selected = evals.filter(
  (e) => !values.eval || values.eval.includes(e.name),
);
const iteration =
  values.iteration ??
  String(
    (existsSync(WORKSPACE)
      ? readdirSync(WORKSPACE).filter((d) => d.startsWith("iteration-")).length
      : 0) + 1,
  );
const configs = values.baseline
  ? ["with_skill", "without_skill"]
  : ["with_skill"];

/**
 * grading.json as skill-creator's aggregate_benchmark.py reads it.
 * @param {{ passed: boolean }[]} expectations
 */
function withSummary(expectations) {
  const passed = expectations.filter((e) => e.passed).length;
  const total = expectations.length;
  return {
    expectations,
    summary: {
      passed,
      failed: total - passed,
      total,
      pass_rate: total ? passed / total : 0,
    },
  };
}

/** @param {string} dir @param {string[]} args */
const git = (dir, ...args) =>
  execFileSync("git", ["-C", dir, ...args], { stdio: "pipe" });

/** @param {any} item @param {string} config */
async function runOne(item, config) {
  const evalDir = join(
    WORKSPACE,
    `iteration-${iteration}`,
    `eval-${item.id}-${item.name}`,
  );
  const out = join(evalDir, config, "run-1");
  mkdirSync(join(out, "outputs"), { recursive: true });
  writeFileSync(
    join(evalDir, "eval_metadata.json"),
    JSON.stringify(
      {
        eval_id: item.id,
        eval_name: item.name,
        prompt: item.prompt,
        assertions: item.expectations,
      },
      null,
      2,
    ),
  );
  const dir = join(tmpdir(), `seo-eval-${item.name}-${config}-${Date.now()}`);
  execFileSync("git", [
    "-C",
    REPO,
    "worktree",
    "add",
    "-q",
    "--detach",
    dir,
    "HEAD",
  ]);
  try {
    execFileSync(
      "pnpm",
      ["install", "--frozen-lockfile", "--prefer-offline", "--silent"],
      {
        cwd: dir,
        stdio: "pipe",
      },
    );
    execFileSync("node", [join(EVALS_DIR, "setup.mjs"), item.name, dir], {
      stdio: "pipe",
    });
    if (config === "without_skill") {
      for (const path of SKILL_DIRS)
        rmSync(join(dir, path), { recursive: true, force: true });
      git(dir, "add", "-A");
      git(
        dir,
        "-c",
        "core.hooksPath=/dev/null",
        "commit",
        "-q",
        "-m",
        "chore: remove skill",
      );
    }
    const started = Date.now();
    const { stdout } = await run(
      "claude",
      [
        "-p",
        item.prompt,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ...ALLOWED_TOOLS,
        "--output-format",
        "stream-json",
        "--verbose",
      ],
      { cwd: dir, maxBuffer: 256 * 1024 * 1024, timeout: 45 * 60 * 1000 },
    );
    writeFileSync(join(out, "transcript.jsonl"), stdout);
    const result = stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .findLast((event) => event.type === "result");
    writeFileSync(join(out, "outputs", "reply.md"), result?.result ?? "");
    const usage = result?.usage ?? {};
    const tokens = Object.values(usage).reduce(
      (sum, value) => sum + (typeof value === "number" ? value : 0),
      0,
    );
    writeFileSync(
      join(out, "timing.json"),
      JSON.stringify(
        {
          total_tokens: tokens,
          duration_ms: result?.duration_ms ?? Date.now() - started,
          total_duration_seconds:
            (result?.duration_ms ?? Date.now() - started) / 1000,
          cost_usd: result?.total_cost_usd,
        },
        null,
        2,
      ),
    );
    const expectations = GRADERS[item.name](readState(dir));
    writeFileSync(
      join(out, "grading.json"),
      JSON.stringify(withSummary(expectations), null, 2),
    );
    cpSync(join(dir, "seo"), join(out, "outputs", "seo"), { recursive: true });
    writeFileSync(join(out, "outputs", "diff.patch"), git(dir, "diff", "HEAD"));
    const passed = expectations.filter((e) => e.passed).length;
    console.log(
      `${item.name} ${config}: ${passed}/${expectations.length} scripted checks`,
    );
  } finally {
    if (values.keep) console.log(`  kept ${dir}`);
    else git(REPO, "worktree", "remove", "--force", dir);
  }
}

const results = await Promise.allSettled(
  selected.flatMap((item) => configs.map((config) => runOne(item, config))),
);
for (const result of results)
  if (result.status === "rejected") console.error(String(result.reason));
console.log(`Results: ${join(WORKSPACE, `iteration-${iteration}`)}`);
