/**
 * The icon set, one file. All 24-grid, 1.6 stroke, drawn in `currentColor` so
 * they take the weight of whatever text they sit next to.
 */

type IconProps = { className?: string };

function Stroke({
  className = "size-[17px]",
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 5v14M5 12h14" />
    </Stroke>
  );
}

export function SidebarIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3.2" y="4.2" width="17.6" height="15.6" rx="3" />
      <path d="M9.6 4.2v15.6" />
    </Stroke>
  );
}

export function SettingsIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.2 14.2a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.74 2.74l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47v.16a1.94 1.94 0 0 1-3.88 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06A1.94 1.94 0 1 1 4.54 16.1l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97h-.16a1.94 1.94 0 1 1 0-3.88h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A1.94 1.94 0 1 1 7.2 3.8l.06.06a1.6 1.6 0 0 0 1.77.32h.08a1.6 1.6 0 0 0 .97-1.47v-.16a1.94 1.94 0 1 1 3.88 0v.09a1.6 1.6 0 0 0 .97 1.46 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.74 2.74l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97h.16a1.94 1.94 0 1 1 0 3.88h-.09a1.6 1.6 0 0 0-1.46.97Z" />
    </Stroke>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="8.4" r="3.7" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </Stroke>
  );
}

export function KeyIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="8" cy="12" r="3.4" />
      <path d="M11.4 12H20M17.5 12v3M14.5 12v2.2" />
    </Stroke>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M4.6 6.6h14.8M9.5 6.6V5a1.4 1.4 0 0 1 1.4-1.4h2.2A1.4 1.4 0 0 1 14.5 5v1.6M6.5 6.6l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12" />
    </Stroke>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Stroke>
  );
}

export function ChevronIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M6.5 9.5 12 15l5.5-5.5" />
    </Stroke>
  );
}

export function ArrowUpIcon({ className = "size-[16px]" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function StopIcon({ className = "size-[17px]" }: IconProps) {
  return (
    <Stroke className={className}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.4" />
    </Stroke>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M5 12.6 9.6 17 19 7" />
    </Stroke>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </Stroke>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
    </Stroke>
  );
}

export function MonitorIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <rect x="3" y="4.4" width="18" height="12.2" rx="2.2" />
      <path d="M9 20h6M12 16.6V20" />
    </Stroke>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <Stroke {...props}>
      <path d="M12 3.5c.9 4 1.6 4.7 5.6 5.6-4 .9-4.7 1.6-5.6 5.6-.9-4-1.6-4.7-5.6-5.6 4-.9 4.7-1.6 5.6-5.6Z" />
      <path d="M18 15.4c.4 1.8.7 2.1 2.5 2.5-1.8.4-2.1.7-2.5 2.5-.4-1.8-.7-2.1-2.5-2.5 1.8-.4 2.1-.7 2.5-2.5Z" />
    </Stroke>
  );
}

/** Google's mark, in its own colours — the one place colour is allowed in. */
export function GoogleIcon({ className = "size-[18px]" }: IconProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8a10.1 10.1 0 0 1-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3Z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7A22 22 0 0 0 24 46Z"
      />
      <path
        fill="#FBBC05"
        d="M11.8 28.3a13.2 13.2 0 0 1 0-8.6v-5.7H4.5a22 22 0 0 0 0 20l7.3-5.7Z"
      />
      <path
        fill="#EA4335"
        d="M24 9.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3 29.9 1 24 1A22 22 0 0 0 4.5 14l7.3 5.7c1.7-5.2 6.5-9.2 12.2-9.2Z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------- transport --
   Chill mode's controls. Play, pause and the skips are filled rather than
   stroked: at 14px a stroked triangle reads as an outline of nothing, and
   these sit on the one solid button in the player.                          */

export function PlayIcon({ className = "size-[15px]" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M8.2 5.4a1 1 0 0 1 1.53-.85l9.1 6.6a1 1 0 0 1 0 1.7l-9.1 6.6a1 1 0 0 1-1.53-.85Z" />
    </svg>
  );
}

export function PauseIcon({ className = "size-[15px]" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="7" y="5" width="3.6" height="14" rx="1.4" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.4" />
    </svg>
  );
}

export function PrevIcon({ className = "size-[16px]" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="5" y="6" width="2.4" height="12" rx="1.2" />
      <path d="M19 7.3a1 1 0 0 0-1.54-.84l-7 4.7a1 1 0 0 0 0 1.68l7 4.7a1 1 0 0 0 1.54-.84Z" />
    </svg>
  );
}

export function NextIcon({ className = "size-[16px]" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M5 7.3a1 1 0 0 1 1.54-.84l7 4.7a1 1 0 0 1 0 1.68l-7 4.7A1 1 0 0 1 5 16.7Z" />
      <rect x="16.6" y="6" width="2.4" height="12" rx="1.2" />
    </svg>
  );
}

export function VolumeIcon({ className = "size-[15px]" }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M11.2 4.8 6.8 8.4H4.2a.9.9 0 0 0-.9.9v5.4a.9.9 0 0 0 .9.9h2.6l4.4 3.6Z" />
      <path d="M15.3 9.4a3.6 3.6 0 0 1 0 5.2M18 6.9a7.2 7.2 0 0 1 0 10.2" />
    </Stroke>
  );
}

export function MuteIcon({ className = "size-[15px]" }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M11.2 4.8 6.8 8.4H4.2a.9.9 0 0 0-.9.9v5.4a.9.9 0 0 0 .9.9h2.6l4.4 3.6Z" />
      <path d="m15.4 10 4.4 4.4M19.8 10l-4.4 4.4" />
    </Stroke>
  );
}

/** The chill-mode toggle: a small waveform, quiet when nothing is playing. */
export function WaveIcon({ className = "size-[17px]" }: IconProps) {
  return (
    <Stroke className={className}>
      <path d="M4 11.2v1.6M8 8v8M12 4.8v14.4M16 8v8M20 11.2v1.6" />
    </Stroke>
  );
}
