// Scripted checks for the seo-keyword-matrix evals: reads the repository a run
// left behind and prints the expectations in skill-creator's grading.json form
// ({ text, passed, evidence }). Expectations about the reply (what the agent
// told or asked the maintainer) are in evals.json and are graded by reading
// the transcript.
//   node .claude/skills/seo-keyword-matrix/evals/grade.mjs <eval-name> <repo-dir>
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { readKeywordsCsv } from "../scripts/keywords.mjs";

const FILES = new URL("files/", import.meta.url);

/**
 * @typedef {object} State
 * @property {{ keyword: string; source: string }[]} keywords
 * @property {{ clusters: any[] }} matrix
 * @property {Record<string, string>} briefs Brief text by cluster id.
 * @property {string[]} changed Paths changed since the eval setup commit.
 * @property {{ ok: boolean; output: string }} validate
 */

/**
 * @param {string} text
 * @param {boolean} passed
 * @param {string} evidence
 */
const expect = (text, passed, evidence) => ({ text, passed, evidence });

/** @param {State} state */
function common(state) {
  const outside = state.changed.filter((path) => !path.startsWith("seo/"));
  return [
    expect(
      "pnpm seo:validate passes",
      state.validate.ok,
      state.validate.output.trim().split("\n").slice(-5).join(" | "),
    ),
    expect(
      "Only files under seo/ changed",
      outside.length === 0,
      outside.length === 0
        ? `changed: ${state.changed.join(", ") || "none"}`
        : `outside seo/: ${outside.join(", ")}`,
    ),
  ];
}

/** @param {State} state */
function clusterOf(state) {
  /** @type {Map<string, any[]>} */
  const owners = new Map();
  for (const cluster of state.matrix.clusters)
    for (const keyword of cluster.keywords)
      owners.set(keyword, [...(owners.get(keyword) ?? []), cluster]);
  return owners;
}

/**
 * @param {string[][]} pairs
 * @param {Map<string, any[]>} owners
 * @param {boolean} same
 */
function pairsFailing(pairs, owners, same) {
  return pairs.filter(([a, b]) => {
    const ca = owners.get(a)?.[0]?.id;
    const cb = owners.get(b)?.[0]?.id;
    return ca === undefined || cb === undefined || (ca === cb) !== same;
  });
}

/** @type {Record<string, (state: State) => ReturnType<typeof expect>[]>} */
export const GRADERS = {
  "matrix-from-exports": (state) => {
    const expected = JSON.parse(
      readFileSync(new URL("clipo/expected.json", FILES), "utf8"),
    );
    const listed = new Set(state.keywords.map((k) => k.keyword));
    const missing = expected.keywords.filter((k) => !listed.has(k));
    const owners = clusterOf(state);
    const unclustered = expected.keywords.filter((k) => !owners.has(k));
    const multi = [...owners].filter(([, cs]) => cs.length > 1).map(([k]) => k);
    const apartFails = pairsFailing(expected.apart, owners, false);
    const togetherFails = pairsFailing(expected.together, owners, true);
    const notRejected = expected.rejected.filter(
      (k) => owners.get(k)?.[0]?.status !== "rejected",
    );
    const competitorPlanned = expected.competitor.filter((k) =>
      ["planned", "published"].includes(owners.get(k)?.[0]?.status),
    );
    const decided = state.matrix.clusters.filter((c) =>
      ["planned", "published"].includes(c.status),
    );
    const briefs = Object.keys(state.briefs);
    return [
      expect(
        "All 18 keywords from the Ahrefs export are in seo/keywords.csv",
        missing.length === 0,
        missing.length
          ? `missing: ${missing.join(", ")}`
          : `${listed.size} keywords`,
      ),
      expect(
        "Every keyword is in exactly one cluster",
        unclustered.length === 0 && multi.length === 0,
        `not in a cluster: ${unclustered.join(", ") || "none"}; in several: ${multi.join(", ") || "none"}`,
      ),
      expect(
        "Keywords that share search results are in the same cluster",
        togetherFails.length === 0,
        togetherFails.length
          ? `split: ${togetherFails.map((p) => p.join(" / ")).join("; ")}`
          : `${expected.together.length} pairs together`,
      ),
      expect(
        "Keywords with different intent are in different clusters",
        apartFails.length === 0,
        apartFails.length
          ? `merged: ${apartFails.map((p) => p.join(" / ")).join("; ")}`
          : `${expected.apart.length} pairs apart`,
      ),
      expect(
        "Out-of-scope keywords (timeline editor, avatars) are rejected",
        notRejected.length === 0,
        notRejected.length
          ? `not rejected: ${notRejected.join(", ")}`
          : "rejected",
      ),
      expect(
        "Competitor keywords are not planned or published",
        competitorPlanned.length === 0,
        competitorPlanned.length
          ? `planned: ${competitorPlanned.join(", ")}`
          : "not planned",
      ),
      expect(
        "No cluster is planned or published and no brief is written: the maintainer picks the first batch",
        decided.length === 0 && briefs.length === 0,
        `planned/published: ${decided.map((c) => c.id).join(", ") || "none"}; briefs: ${briefs.join(", ") || "none"}`,
      ),
      ...common(state),
    ];
  },

  "briefs-for-first-batch": (state) => {
    const chosen = ["how-to-make-product-videos", "etsy-listing-video"];
    const before = JSON.parse(
      readFileSync(new URL("clipo/matrix.json", FILES), "utf8"),
    ).clusters;
    const headings = [
      "Reader question",
      "Outline",
      "Facts to use",
      "Not in this page",
      "Internal links",
    ];
    const missingBriefs = chosen.filter((id) => !state.briefs[id]);
    const missingHeadings = chosen.flatMap((id) =>
      headings
        .filter(
          (h) => !new RegExp(`^## ${h}`, "m").test(state.briefs[id] ?? ""),
        )
        .map((h) => `${id}: ${h}`),
    );
    const status = new Map(state.matrix.clusters.map((c) => [c.id, c.status]));
    const notPlanned = chosen.filter((id) => status.get(id) !== "planned");
    const changedOthers = before
      .filter((c) => !chosen.includes(c.id) && status.get(c.id) !== c.status)
      .map((c) => `${c.id}: ${c.status} → ${status.get(c.id)}`);
    return [
      expect(
        "A brief exists for each chosen cluster",
        missingBriefs.length === 0,
        `briefs: ${Object.keys(state.briefs).join(", ") || "none"}`,
      ),
      expect(
        "Each brief has the template sections",
        missingHeadings.length === 0,
        missingHeadings.length
          ? `missing: ${missingHeadings.join("; ")}`
          : "all sections",
      ),
      expect(
        "The chosen clusters are planned",
        notPlanned.length === 0,
        notPlanned.length ? `not planned: ${notPlanned.join(", ")}` : "planned",
      ),
      expect(
        "Other clusters keep their status",
        changedOthers.length === 0,
        changedOthers.join("; ") || "unchanged",
      ),
      ...common(state),
    ];
  },

  "search-console-review": (state) => {
    // The prompt asks for a review, so importing is optional; if the run
    // imports the new queries, they must say where they came from.
    const fresh = ["do ai credits expire", "ai credits refund", "acme pricing"];
    const bySource = new Map(state.keywords.map((k) => [k.keyword, k.source]));
    const imported = fresh.filter((k) => bySource.has(k));
    const wrongSource = imported.filter((k) => bySource.get(k) !== "gsc");
    return [
      expect(
        "Search Console queries imported into seo/keywords.csv have source gsc",
        wrongSource.length === 0,
        wrongSource.length
          ? `wrong source: ${wrongSource.join(", ")}`
          : `imported: ${imported.join(", ") || "none"}`,
      ),
      ...common(state),
    ];
  },
};

/** @param {string} dir */
export function readState(dir) {
  const seo = join(dir, "seo");
  const briefsDir = join(seo, "briefs");
  const briefs = existsSync(briefsDir)
    ? Object.fromEntries(
        readdirSync(briefsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => [
            f.slice(0, -3),
            readFileSync(join(briefsDir, f), "utf8"),
          ]),
      )
    : {};
  const changed = execFileSync(
    "git",
    ["-C", dir, "status", "--porcelain", "--untracked-files=all"],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
  let validate;
  try {
    const output = execFileSync("pnpm", ["seo:validate"], {
      cwd: dir,
      encoding: "utf8",
      stdio: "pipe",
    });
    validate = { ok: true, output };
  } catch (error) {
    const { stdout = "", stderr = "" } = /** @type {any} */ (error);
    validate = { ok: false, output: `${stdout}${stderr}` };
  }
  return {
    keywords: readKeywordsCsv(readFileSync(join(seo, "keywords.csv"), "utf8")),
    matrix: JSON.parse(readFileSync(join(seo, "matrix.json"), "utf8")),
    briefs,
    changed,
    validate,
  };
}

if (
  import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? ".")).href
) {
  const [name, dir] = process.argv.slice(2);
  const grader = name && GRADERS[name];
  if (!grader || !dir) {
    console.error(
      `Usage: grade.mjs <${Object.keys(GRADERS).join(" | ")}> <repo-dir>`,
    );
    process.exit(1);
  }
  const expectations = grader(readState(dir));
  console.log(JSON.stringify({ expectations }, null, 2));
}
