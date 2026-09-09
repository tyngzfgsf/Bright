import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon: the same step mark, sized for iOS (which adds the mask). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 16,
          background: "#08080a",
          padding: 42,
        }}
      >
        {[44, 72, 100].map((height) => (
          <div
            key={height}
            style={{
              width: 22,
              height,
              borderRadius: 11,
              background: "#fafafa",
            }}
          />
        ))}
      </div>
    ),
    size,
  );
}
