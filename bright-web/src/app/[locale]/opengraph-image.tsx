import { ImageResponse } from "next/og";
import { markGeometry } from "@/lib/mark";
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
  const tile = 46;
  const { sun, bar } = markGeometry(tile);

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

        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              position: "relative",
              display: "flex",
              width: tile,
              height: tile,
              borderRadius: 11,
              border: "1px solid #2c2c32",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: sun.left,
                top: sun.top,
                width: sun.width,
                height: sun.height,
                background: "#fafafa",
                borderRadius: `${sun.radius}px ${sun.radius}px 0 0`,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: bar.left,
                top: bar.top,
                width: bar.width,
                height: bar.height,
                background: "#fafafa",
                borderRadius: bar.radius,
              }}
            />
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
