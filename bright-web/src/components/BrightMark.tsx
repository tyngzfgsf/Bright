/**
 * The app's icon as an inline glyph.
 *
 * Geometry is taken verbatim from `app/src/main/res/drawable/ic_launcher_foreground.xml`
 * — a rising sun over a horizon — and the viewBox crops to the same framing the
 * iOS AppIcon uses, so the site mark, the favicon and the launcher icon are one
 * shape. It draws in `currentColor` rather than white-on-black so it works on
 * either theme next to the wordmark; the tile version lives in `app/icon.tsx`.
 */
export default function BrightMark({
  className = "",
  sunClassName = "",
}: {
  className?: string;
  /** Applied to the sun alone, so it can move without the horizon. */
  sunClassName?: string;
}) {
  return (
    <svg
      viewBox="24 18 60 60"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M54,32 A16,16 0 0 1 70,48 L38,48 A16,16 0 0 1 54,32 Z"
        fill="currentColor"
        className={sunClassName}
      />
      <path
        d="M28,62 L80,62"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
