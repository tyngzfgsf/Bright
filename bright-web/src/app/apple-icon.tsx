import { ImageResponse } from "next/og";
import { markGeometry } from "@/lib/mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the launcher icon, square (iOS applies its own mask). */
export default function AppleIcon() {
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
