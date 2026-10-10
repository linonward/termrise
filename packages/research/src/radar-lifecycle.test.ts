import { expect, it } from "vitest";

import { lifecycle } from "./radar-lifecycle";

const t0 = new Date("2026-10-10T00:00:00Z");
const at = (hours: number) => new Date(t0.getTime() + hours * 3_600_000);
const obs = (pairs: [number, number | null][]) =>
  pairs.map(([hours, score]) => ({ observedAt: at(hours), score }));
const base = { firstSeenAt: t0, earlierSightings: [] as Date[] };

it("needs enough comparable observations over enough time", () => {
  expect(lifecycle({ ...base, observations: [] })).toBe("insufficient_data");
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 1],
        [1, 300],
      ]),
    }),
  ).toBe("insufficient_data");
  // Three observations, but within 2 hours.
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 1],
        [1, 50],
        [2, 300],
      ]),
    }),
  ).toBe("insufficient_data");
  // Null points do not count.
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 1],
        [2, null],
        [4, null],
        [5, 300],
      ]),
    }),
  ).toBe("insufficient_data");
});

it("measures growth over the last 6 hours", () => {
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 10],
        [2, 60],
        [4, 150],
      ]),
    }),
  ).toBe("breakout");
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 10],
        [2, 20],
        [4, 40],
      ]),
    }),
  ).toBe("emerging");
  // Old growth before the window does not count: from hour 4 (200) to 10 (210).
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 0],
        [4, 200],
        [8, 205],
        [10, 210],
      ]),
    }),
  ).toBe("insufficient_data");
});

it("is sustained when seen for a day without growth", () => {
  expect(
    lifecycle({
      ...base,
      observations: obs([
        [0, 300],
        [12, 305],
        [24, 310],
      ]),
    }),
  ).toBe("sustained");
});

it("is recurring or seasonal when the term was seen before", () => {
  const observations = obs([
    [0, 10],
    [4, 200],
    [5, 300],
  ]);
  // Seen 3 days before: too close, the growth decides.
  expect(
    lifecycle({
      firstSeenAt: t0,
      observations,
      earlierSightings: [new Date("2026-10-07T00:00:00Z")],
    }),
  ).toBe("breakout");
  expect(
    lifecycle({
      firstSeenAt: t0,
      observations,
      earlierSightings: [new Date("2026-08-01T00:00:00Z")],
    }),
  ).toBe("recurring");
  expect(
    lifecycle({
      firstSeenAt: t0,
      observations,
      earlierSightings: [new Date("2025-10-20T00:00:00Z")],
    }),
  ).toBe("seasonal");
});

it("does not measure growth when the scores are not points", () => {
  expect(
    lifecycle({
      ...base,
      measureGrowth: false,
      observations: obs([
        [0, 100],
        [4, 500],
        [5, 1000],
      ]),
    }),
  ).toBe("insufficient_data");
  expect(
    lifecycle({
      firstSeenAt: t0,
      measureGrowth: false,
      observations: [],
      earlierSightings: [new Date("2026-08-01T00:00:00Z")],
    }),
  ).toBe("recurring");
});
