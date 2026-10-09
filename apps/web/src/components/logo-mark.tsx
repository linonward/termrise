import { cn } from "@repo/ui/utils";

// Placeholder logo (viewBox 0 0 240 240); replace with the product logo.
export const LOGO_C_PATH =
  "M188.95 31.74a112 112 0 1 0 0 176.52 31 31 0 0 0-38.17-48.86 50 50 0 1 1 0-78.8 31 31 0 0 0 38.17-48.86z";
export const LOGO_PLAY_PATH =
  "M135.68 79.71q-11.68-5.71-11.68 7.29l0 66q0 13 11.68 7.29l70.64-34.58q11.68-5.71 0-11.42z";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 240"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path d={LOGO_C_PATH} className="fill-brand" />
      <path d={LOGO_PLAY_PATH} className="fill-foreground" />
    </svg>
  );
}
