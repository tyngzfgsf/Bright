import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Bright — a step for your brighter future";

/**
 * Placeholder OG card, generated at build time. Kept to Latin text on purpose:
 * the default renderer has no Korean face bundled. Swap in a real screenshot
 * (public/og.png + `openGraph.images`) when there's one worth showing.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#08080a",
          color: "#f7f7f8",
          padding: 80,
          fontSize: 40,
        }}
      >
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, opacity: 0.6 }}>
          AI EMERGENCY-SCENARIO TRAINING
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 160, letterSpacing: -6, lineHeight: 1 }}>
            {site.name}
          </div>
          <div style={{ marginTop: 24, fontSize: 44, opacity: 0.75 }}>
            {site.slogan}
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 26, opacity: 0.55 }}>
          Android · free · github.com/tyngzfgsf/Bright-app
        </div>
      </div>
    ),
    size,
  );
}
