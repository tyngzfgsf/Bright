import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Bright — a step for your brighter future";

/**
 * Social card, generated at request time. Latin text on purpose: the generator
 * has no Korean face bundled. Swap in a real screenshot (public/og.png +
 * `openGraph.images`) when there's one worth showing.
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
          background: "#060607",
          color: "#fafafa",
          padding: 76,
          position: "relative",
        }}
      >
        {/* Hairline frame — the same structure the site uses. */}
        <div
          style={{
            position: "absolute",
            inset: 40,
            border: "1px solid #2c2c32",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
            {[14, 22, 30].map((height) => (
              <div
                key={height}
                style={{
                  width: 7,
                  height,
                  borderRadius: 4,
                  background: "#fafafa",
                }}
              />
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 27, letterSpacing: 5, opacity: 0.62 }}>
            AI EMERGENCY-SCENARIO TRAINING
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 168,
              letterSpacing: -8,
              lineHeight: 1,
              fontWeight: 600,
            }}
          >
            {site.name}
          </div>
          <div style={{ marginTop: 22, fontSize: 42, opacity: 0.72 }}>
            {site.slogan}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 25,
            opacity: 0.5,
          }}
        >
          <span>Android · free · built in the open</span>
          <span>github.com/tyngzfgsf/Bright-app</span>
        </div>
      </div>
    ),
    size,
  );
}
