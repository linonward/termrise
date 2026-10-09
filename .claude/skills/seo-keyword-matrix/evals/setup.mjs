// Prepares a throwaway copy of the repository for one eval: writes the eval's
// starting state, copies its input files to eval-input/ and commits, so the
// grader can tell what the run changed.
//   node .claude/skills/seo-keyword-matrix/evals/setup.mjs <eval-name> <repo-dir>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = fileURLToPath(new URL("files/", import.meta.url));
const [name, dir] = process.argv.slice(2);

/** @param {string} from Relative to files/. @param {string} to Relative to the repo. */
function copy(from, to) {
  mkdirSync(join(dir, to, ".."), { recursive: true });
  copyFileSync(join(FILES, from), join(dir, to));
}

// A new product: its own product.md and an empty seo/.
function newProduct() {
  copy("clipo/product.md", "docs/product/product.md");
  rmSync(join(dir, "seo"), { recursive: true, force: true });
  mkdirSync(join(dir, "seo/briefs"), { recursive: true });
  writeFileSync(
    join(dir, "seo/keywords.csv"),
    "keyword,volume,difficulty,source\n",
  );
  writeFileSync(join(dir, "seo/matrix.json"), '{ "clusters": [] }\n');
}

const SETUPS = {
  "matrix-from-exports": () => {
    newProduct();
    copy("clipo/ahrefs-export.csv", "eval-input/ahrefs-export.csv");
    copy("clipo/serp-export.csv", "eval-input/serp-export.csv");
  },
  "briefs-for-first-batch": () => {
    newProduct();
    // The matrix as the first eval should leave it, with figures imported.
    execFileSync(
      "node",
      [
        ".claude/skills/seo-keyword-matrix/scripts/import.mjs",
        join(FILES, "clipo/ahrefs-export.csv"),
        "--source=ahrefs",
        "--keyword=Keyword",
        "--volume=Volume",
        "--difficulty=Keyword Difficulty",
      ],
      { cwd: dir, stdio: "inherit" },
    );
    copy("clipo/matrix.json", "seo/matrix.json");
  },
  // The starter's own example data after launch.
  "search-console-review": () => {
    copy("gsc/search-analytics.csv", "eval-input/search-analytics.csv");
  },
};

const setup = name && SETUPS[/** @type {keyof typeof SETUPS} */ (name)];
if (!setup || !dir) {
  console.error(
    `Usage: setup.mjs <${Object.keys(SETUPS).join(" | ")}> <repo-dir>`,
  );
  process.exit(1);
}
setup();
execFileSync("git", ["-C", dir, "add", "-A"]);
// A throwaway commit in a throwaway checkout: hooks would only format fixtures.
execFileSync("git", [
  "-C",
  dir,
  "-c",
  "core.hooksPath=/dev/null",
  "commit",
  "-q",
  "-m",
  `chore: eval setup ${name}`,
]);
