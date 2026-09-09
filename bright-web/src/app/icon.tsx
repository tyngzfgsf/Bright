import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/**
 * Favicon: three ascending bars — the "step" in the slogan. Drawn with shapes
 * rather than a letter so it stays crisp at 16px and needs no font.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 6,
          background: "#08080a",
          borderRadius: 14,
          padding: 14,
        }}
      >
        {[16, 26, 36].map((height) => (
          <div
            key={height}
            style={{
              width: 8,
              height,
              borderRadius: 4,
              background: "#fafafa",
            }}
          />
        ))}
      </div>
    ),
    size,
  );
}
