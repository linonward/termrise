import { cn } from "@repo/ui/utils";

// Termrise mark (viewBox 0 0 240 240): a rising line in brand colour from a dot in the
// foreground colour (docs/design/design-system.md#logo).
export const LOGO_RISE_PATH =
  "M221.76 48.54l-62.28 17.7c-0.48 0.12-0.6 0.66-0.24 0.96l15.18 14.88-43.08 42.54-24.72-23.7c-6.3-5.76-16.08-5.76-22.2 0.12l-46.62 46.02c-4.02 3.96-4.08 10.56-0.06 14.28l5.76 5.4c4.2 3.9 10.74 4.02 14.76 0l37.38-36.72 24.42 23.4c6.42 5.94 16.38 6.24 22.2 0.3l52.32-51.96 15.06 14.82c0.42 0.36 0.96 0.18 1.02-0.3l11.82-67.02c0.12-0.48-0.3-0.84-0.72-0.72z";
export const LOGO_DOT_PATH = "M8 188a16 16 0 1 0 32 0a16 16 0 1 0-32 0z";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path d={LOGO_RISE_PATH} className="fill-brand" />
      <path d={LOGO_DOT_PATH} className="fill-foreground" />
    </svg>
  );
}
