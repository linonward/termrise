// Checks seo/matrix.json against seo/keywords.csv, seo/briefs/ and the site's
// pages (docs/product/ux.md#keyword-matrix). pnpm test runs the same check.
//   pnpm seo:validate
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { parseMatrix, validateMatrix } from "@repo/seo/keyword-matrix";

import { BLOG_SLUGS } from "@/components/blog/posts";

const SEO_DIR = new URL("../../../seo/", import.meta.url);
const BRIEFS_DIR = new URL("briefs/", SEO_DIR);

// The public pages a cluster can map to, as in src/app/sitemap.ts.
const PAGES = ["/", "/pricing", ...BLOG_SLUGS.map((slug) => `/blog/${slug}`)];

// First column of seo/keywords.csv. A keyword with a comma is quoted in the
// file and is reported as missing; search queries almost never have one.
function readKeywords() {
  const [, ...rows] = readFileSync(new URL("keywords.csv", SEO_DIR), "utf8")
    .trim()
    .split(/\r?\n/);
  return rows.map((row) => row.split(",", 1)[0]!);
}

export function checkRepo() {
  const matrix = parseMatrix(
    JSON.parse(readFileSync(new URL("matrix.json", SEO_DIR), "utf8")),
  );
  const briefs = existsSync(BRIEFS_DIR)
    ? readdirSync(BRIEFS_DIR)
        .filter((file) => file.endsWith(".md"))
        .map((file) => file.slice(0, -".md".length))
    : [];
  return validateMatrix(matrix, {
    keywords: readKeywords(),
    pages: PAGES,
    briefs,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const errors = checkRepo();
  for (const error of errors) console.error(error);
  if (errors.length > 0) process.exit(1);
  console.log("seo/matrix.json is valid");
}
