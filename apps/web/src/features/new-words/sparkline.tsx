import { linePoints } from "./new-word-format";

/** A small line of a word's interest; decorative, the numbers are next to it. */
export function Sparkline({ values }: { values: number[] }) {
  const points = linePoints(values, 120, 28);
  return (
    <svg
      viewBox="-2 -2 124 32"
      className="h-8 w-30 text-brand"
      aria-hidden="true"
    >
      <polyline
        points={points.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The word's daily interest for the past weeks, with the area under the line. */
export function TrendChart({
  days,
  label,
}: {
  days: { day: string; value: number }[];
  label: string;
}) {
  const width = 1000;
  const height = 240;
  const points = linePoints(
    days.map((d) => d.value),
    width,
    height,
  );
  const line = points.map((p) => p.join(",")).join(" ");
  return (
    <svg
      viewBox={`-4 -4 ${width + 8} ${height + 8}`}
      className="h-60 w-full text-brand"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      {points.length > 1 && (
        <polygon
          points={`0,${height} ${line} ${width},${height}`}
          className="fill-brand/10"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
    </svg>
  );
}
