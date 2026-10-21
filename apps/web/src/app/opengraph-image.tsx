import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { LOGO_DOT_PATH, LOGO_RISE_PATH } from "@/components/logo-mark";
import { messages } from "@/i18n/messages";

// Static share image. The heading font has no Chinese glyphs, so the image shows
// only the mark and the name; the Chinese description is its alt text.
const { meta } = messages;

export const alt = meta.description;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand heading font (Source Serif 4 600, OFL, from Fontsource).
const heading = readFile(
  join(process.cwd(), "src/app/fonts/source-serif-4-600.woff"),
);

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "#FAF8F3",
        color: "#16140F",
      }}
    >
      <svg width={96} height={96} viewBox="0 0 240 240">
        <path d={LOGO_RISE_PATH} fill="#D4401A" />
        <path d={LOGO_DOT_PATH} fill="#16140F" />
      </svg>
      <div
        style={{
          fontSize: 120,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: -3,
        }}
      >
        {meta.title}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Source Serif 4",
          data: await heading,
          weight: 600,
          style: "normal",
        },
      ],
    },
  );
}
