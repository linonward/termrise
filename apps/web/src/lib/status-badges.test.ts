import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleX,
  FlaskConical,
  Hourglass,
  LoaderCircle,
  OctagonX,
  PencilLine,
  Rocket,
  ShieldCheck,
  Sprout,
  TriangleAlert,
} from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  buildAdviceBadge,
  experimentBadge,
  lifecycleBadge,
  needsReviewBadge,
  opportunityBadge,
  productBadge,
  researchBadge,
  revenueSourceBadge,
  runBadge,
} from "./status-badges";

// The tone and icon of each status (docs/design/design-system.md#status).
describe("status badges", () => {
  it("maps research project statuses", () => {
    expect(researchBadge("draft")).toEqual({
      tone: "neutral",
      icon: PencilLine,
    });
    for (const status of [
      "collecting",
      "expanding",
      "enriching",
      "clustering",
      "auditing",
      "evaluating",
    ] as const)
      expect(researchBadge(status)).toEqual({
        tone: "info",
        icon: LoaderCircle,
      });
    expect(researchBadge("completed")).toEqual({
      tone: "success",
      icon: CircleCheck,
    });
    expect(researchBadge("partial")).toEqual({
      tone: "neutral",
      icon: CircleDashed,
    });
    expect(researchBadge("budget_exhausted")).toEqual({
      tone: "danger",
      icon: CircleX,
    });
    expect(researchBadge("cancelled")).toEqual({ tone: "neutral", icon: Ban });
  });

  it("maps run statuses", () => {
    expect(runBadge("pending")).toEqual({ tone: "info", icon: Hourglass });
    expect(runBadge("running")).toEqual({ tone: "info", icon: LoaderCircle });
    expect(runBadge("completed")).toEqual({
      tone: "success",
      icon: CircleCheck,
    });
    expect(runBadge("failed")).toEqual({ tone: "danger", icon: CircleX });
  });

  it("maps opportunity statuses and the review flag", () => {
    expect(opportunityBadge("unreviewed")).toEqual({
      tone: "neutral",
      icon: CircleDashed,
    });
    expect(opportunityBadge("needs_validation")).toEqual({
      tone: "info",
      icon: FlaskConical,
    });
    expect(opportunityBadge("go").tone).toBe("success");
    expect(opportunityBadge("no_go").tone).toBe("danger");
    expect(needsReviewBadge).toEqual({ tone: "warning", icon: TriangleAlert });
  });

  it("maps build advice, radar trend, product, experiment and revenue source", () => {
    expect(buildAdviceBadge("new_site").tone).toBe("success");
    expect(buildAdviceBadge("inner_page").tone).toBe("info");
    expect(buildAdviceBadge("weak_demand").tone).toBe("neutral");
    expect(lifecycleBadge("emerging")).toEqual({ tone: "info", icon: Sprout });
    expect(lifecycleBadge("breakout").tone).toBe("success");
    expect(productBadge("launched")).toEqual({ tone: "success", icon: Rocket });
    expect(productBadge("building").tone).toBe("info");
    expect(experimentBadge("stopped")).toEqual({
      tone: "neutral",
      icon: OctagonX,
    });
    expect(experimentBadge("passed").tone).toBe("success");
    expect(experimentBadge("failed").tone).toBe("danger");
    expect(revenueSourceBadge("payment_verified")).toEqual({
      tone: "success",
      icon: ShieldCheck,
    });
    expect(revenueSourceBadge("manual")).toBeNull();
  });
});
