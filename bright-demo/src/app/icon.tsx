import { ImageResponse } from "next/og";
import { markGeometry } from "@/lib/mark";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Browser-tab icon: the app's launcher icon, same sun and horizon on black.
 * Built from boxes rather than SVG paths because that's what the generator
 * renders reliably — `src/lib/mark.ts` holds the shared measurements.
 */
export default function Icon() {
  const { sun, bar } = markGeometry(size.width);

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#000000",
          borderRadius: 14,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: sun.left,
            top: sun.top,
            width: sun.width,
            height: sun.height,
            background: "#ffffff",
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
            background: "#ffffff",
            borderRadius: bar.radius,
          }}
        />
      </div>
    ),
    size,
  );
}
