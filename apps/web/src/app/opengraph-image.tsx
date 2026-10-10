import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { LOGO_DOT_PATH, LOGO_RISE_PATH } from "@/components/logo-mark";
import { messages } from "@/i18n/messages";

// Static share image; crawlers get the default locale (en).
const { meta } = messages.en;

export const alt = meta.description;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand heading font (Bricolage Grotesque 700, OFL, from Fontsource).
const heading = readFile(
  join(process.cwd(), "src/app/fonts/bricolage-grotesque-700.woff"),
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
        background: "#F7F6F3",
        color: "#111318",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={44} height={44} viewBox="0 0 240 240">
          <path d={LOGO_RISE_PATH} fill="#6D4AFF" />
          <path d={LOGO_DOT_PATH} fill="#111318" />
        </svg>
        <div style={{ fontSize: 40, fontWeight: 700 }}>{meta.title}</div>
      </div>
      <div
        style={{
          fontSize: 72,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: -2,
          maxWidth: 900,
        }}
      >
        {meta.description}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        {
          name: "Bricolage Grotesque",
          data: await heading,
          weight: 700,
          style: "normal",
        },
      ],
    },
  );
}
