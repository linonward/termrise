import { expect, it } from "vitest";

import { buildKeywordBrief, keywordBriefFileName } from "./pool-brief";
import type { PoolCheck, PoolKeyword } from "./pool-service";

const at = new Date("2026-10-31T09:00:00Z");
const keyword = {
  id: "k",
  phrase: "cipher decoder",
  sources: ["ranked:convertcase.net"],
  status: "selected",
  reasons: [],
  searchVolume: 14800,
  keywordDifficulty: 14,
  cpcMicros: 2_000_000,
  variants: ["decoder cipher", "ciphertext decoder"],
  variantCount: 107,
  strongCompetitors: 0,
  innerPages: 7,
  trend: {
    result: "pass",
    months: 60,
    ratio: 1.88,
    yoy: -0.08,
    recentChange: -0.16,
    baseline: { term: "converter", change: -0.1 },
    relativeChange: -0.07,
    categoryDeclining: false,
    rising: false,
    fails: [],
  },
  monetization: "广告；付费功能：批量解码",
  compliance: null,
  aiAngle: null,
  firstSeenAt: at,
  lastCheckedAt: at,
  nextCheckAt: null,
  updatedAt: at,
} satisfies PoolKeyword;
const check = (
  kind: PoolCheck["kind"],
  status: PoolCheck["status"],
  data = {},
): PoolCheck => ({
  id: kind,
  keywordId: "k",
  roundId: null,
  kind,
  status,
  reasons: [],
  data,
  rules: "tool-site-v1",
  reviewerId: null,
  createdAt: at,
});

it("writes the site-starter brief from saved data and says what is still open", () => {
  const md = buildKeywordBrief(
    keyword,
    [
      check("review", "selected"),
      check("deep", "candidate", {
        serp: {
          results: [
            {
              rank: 1,
              site: "Reddit",
              url: "https://google.com/goto?url=x",
              title: "r/cryptography",
              traffic: null,
            },
            {
              rank: 2,
              site: "cipherdecipher.com",
              url: "https://www.cipherdecipher.com",
              title: "Cipher Decipher | cipher decoder",
              traffic: 419,
            },
          ],
          strongSites: [],
        },
      }),
      check("screen", "queued", { kdRange: [14, 34] }),
    ],
    "2026-11-01",
  );
  expect(md).toContain("# 选词简报：cipher decoder");
  expect(md).toContain("选定日期：2026-10-31");
  expect(md).toContain("| 美国月搜索量 | 14,800 |");
  expect(md).toContain("相对 -7%");
  expect(md).toContain("（KD 14 到 34）");
  expect(md).toContain(
    "| 2 | cipherdecipher.com（月流量约 419） | 首页 | 是 | 否 |",
  );
  expect(md).toContain("- 合规（H7）还没回答");
  expect(md).toContain("- AI 改造点（S4）还没填写");
  expect(md).not.toContain("变现（H4）还没回答");
  expect(keywordBriefFileName(keyword)).toBe("keyword-brief-cipher-decoder.md");
});
