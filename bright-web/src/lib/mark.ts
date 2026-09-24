/**
 * The launcher icon's geometry, in the 108-unit viewport of
 * `ic_launcher_foreground.xml`: a sun of radius 16 sitting on y=48, and a
 * horizon stroke 4.5 thick from x=28 to x=80 at y=62.
 *
 * `app/icon.tsx` and the OG card can't use SVG paths, so they rebuild the same
 * shapes out of boxes — these numbers keep every copy in step.
 */
const SUN_RADIUS = 16;
const SUN_BASE_Y = 48;
const BAR_FROM_X = 28;
const BAR_TO_X = 80;
const BAR_Y = 62;
const BAR_THICKNESS = 4.5;

/** The crop the iOS AppIcon uses, so the tile matches the phone. */
const FRAME = { x: 24, y: 18, size: 60 };

export function markGeometry(tileSize: number) {
  const k = tileSize / FRAME.size;
  const at = (value: number, axis: "x" | "y") =>
    (value - (axis === "x" ? FRAME.x : FRAME.y)) * k;

  return {
    sun: {
      width: SUN_RADIUS * 2 * k,
      height: SUN_RADIUS * k,
      left: at(54 - SUN_RADIUS, "x"),
      top: at(SUN_BASE_Y - SUN_RADIUS, "y"),
      radius: SUN_RADIUS * k,
    },
    bar: {
      width: (BAR_TO_X - BAR_FROM_X) * k + BAR_THICKNESS * k,
      height: BAR_THICKNESS * k,
      left: at(BAR_FROM_X - BAR_THICKNESS / 2, "x"),
      top: at(BAR_Y - BAR_THICKNESS / 2, "y"),
      radius: (BAR_THICKNESS * k) / 2,
    },
  };
}
