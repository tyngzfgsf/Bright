"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import Magnetic from "./Magnetic";
import { MuteIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, VolumeIcon, WaveIcon } from "./Icons";
import type { Copy } from "@/lib/copy";
import { EASE, GLIDE, PRESS } from "@/lib/motion";
import { ChillEngine, TRACKS, formatTime } from "@/lib/chill";
import type { Language } from "@/lib/prompt";
import { STORAGE, readJson, writeJson } from "@/lib/storage";

/**
 * Chill mode: something to put on in the background while you drill, built
 * like a Connect panel — one piece playing on one device, with the transport
 * and the loudness under it, and artwork that moves with what you're hearing.
 *
 * The sound is generated (`@/lib/chill`), so the artwork isn't decoration:
 * the rings breathe on the analyser's RMS and the meter is the real spectrum.
 * The piece and the volume are remembered; playing is not, because a browser
 * won't start audio on a page load without a gesture anyway.
 */

type Saved = { index: number; volume: number };

const BARS = 15;
const TICK_MS = 250;

/** Direction-aware: a skip forwards throws the old piece out to the left. */
const SLIDE = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 26, filter: "blur(5px)" }),
  center: { opacity: 1, x: 0, filter: "blur(0px)" },
  exit: (dir: number) => ({ opacity: 0, x: dir * -26, filter: "blur(5px)" }),
};

export default function ChillPlayer({
  t,
  language,
  onPlayingChange,
}: {
  t: Copy;
  language: Language;
  /** Lets the shell put the ambient wash behind the transcript. */
  onPlayingChange: (playing: boolean) => void;
}) {
  const reduced = useReducedMotion();

  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(0);
  const [volume, setVolume] = useState(0.6);
  const [elapsed, setElapsed] = useState(0);
  const [dir, setDir] = useState(1);

  const engineRef = useRef<ChillEngine | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const meter = useRef<(HTMLSpanElement | null)[]>([]);
  const lastVolume = useRef(0.6);
  /** The engine is built on the first click, which can be long after the
      saved volume was read — it takes the level from here, not from a
      closure that was current when the component mounted. */
  const volumeRef = useRef(0.6);

  const track = TRACKS[index];
  const title = track.title[language];
  const artist = track.artist[language];

  // The artwork's pulse. A motion value, not state: it updates every frame.
  const level = useMotionValue(0);
  const breath = useSpring(level, { stiffness: 110, damping: 22, mass: 0.5 });
  const artScale = useTransform(breath, [0, 1], [1, 1.09]);
  const artGlow = useTransform(breath, [0, 1], [0.35, 0.85]);

  function engine(): ChillEngine {
    if (!engineRef.current) {
      engineRef.current = new ChillEngine();
      engineRef.current.setVolume(volumeRef.current);
    }
    return engineRef.current;
  }

  useEffect(() => {
    const saved = readJson<Partial<Saved>>(STORAGE.chill, {});
    if (typeof saved.index === "number" && TRACKS[saved.index]) setIndex(saved.index);
    if (typeof saved.volume === "number") {
      const v = Math.min(1, Math.max(0, saved.volume));
      setVolume(v);
      volumeRef.current = v;
      if (v > 0) lastVolume.current = v;
    }
  }, []);

  useEffect(() => onPlayingChange(playing), [playing, onPlayingChange]);

  // Everything stops with the component — an AudioContext left running keeps
  // the tab marked as playing audio.
  useEffect(() => () => engineRef.current?.dispose(), []);

  const remember = useCallback((patch: Partial<Saved>) => {
    const saved = readJson<Partial<Saved>>(STORAGE.chill, {});
    writeJson(STORAGE.chill, { ...saved, ...patch });
  }, []);

  const go = useCallback(
    (delta: number) => {
      const next = (index + delta + TRACKS.length) % TRACKS.length;
      setDir(delta >= 0 ? 1 : -1);
      setIndex(next);
      setElapsed(0);
      remember({ index: next });
      // Paused, a skip only moves the card; the next play picks up what the
      // card is showing.
      if (playing) void engine().play(TRACKS[next]);
    },
    [index, playing, remember],
  );

  async function toggle() {
    if (playing) {
      engine().pause();
      setPlaying(false);
      return;
    }
    // Resume keeps the piece that's already built; a first play has to make
    // one. Either way this is inside the click, which is what unlocks audio.
    const resumed = await engine().resume();
    if (!resumed) await engine().play(track);
    setPlaying(true);
  }

  function changeVolume(next: number) {
    const v = Math.min(1, Math.max(0, next));
    setVolume(v);
    volumeRef.current = v;
    if (v > 0) lastVolume.current = v;
    engine().setVolume(v);
    remember({ volume: v });
  }

  const muted = volume === 0;

  // The clock.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(
      () => setElapsed((current) => current + TICK_MS / 1000),
      TICK_MS,
    );
    return () => window.clearInterval(id);
  }, [playing]);

  // What ends a piece: the sound itself would go on forever, so the nominal
  // length is what moves us on. It runs after the clock has committed rather
  // than inside its updater — a skip is three state changes and a crossfade,
  // and none of that belongs in the middle of one.
  useEffect(() => {
    if (playing && elapsed >= track.seconds) go(1);
  }, [playing, elapsed, track.seconds, go]);

  // One frame loop for both the pulse and the meter. The bars are written
  // straight to the DOM: nine springs of React state at 60fps is not worth it.
  useEffect(() => {
    if (!playing || reduced) {
      level.set(0);
      meter.current.forEach((bar) => {
        if (bar) bar.style.transform = "scaleY(0.12)";
      });
      return;
    }

    let frame = 0;
    const draw = () => {
      const chill = engineRef.current;
      if (chill) {
        level.set(chill.level());
        const bands = chill.bands(BARS);
        meter.current.forEach((bar, i) => {
          if (bar) bar.style.transform = `scaleY(${0.12 + bands[i] * 0.88})`;
        });
      }
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [playing, reduced, level]);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const progress = Math.min(1, elapsed / track.seconds);

  return (
    <div ref={root} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.chill}
        aria-expanded={open}
        title={t.chill}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        transition={PRESS}
        className={`grid size-9 place-items-center rounded-[0.65rem] transition-colors duration-200 hover:bg-raised hover:text-ink ${
          playing || open ? "text-ink" : "text-ink-faint"
        }`}
      >
        {playing ? <PlayingBars /> : <WaveIcon className="size-[17px]" />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.24, ease: EASE }}
            role="group"
            aria-label={t.chill}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-[19rem] max-w-[calc(100vw-1.5rem)] rounded-[1.25rem] border border-line bg-paper p-3.5 shadow-float"
          >
            <div className="flex items-center justify-between px-0.5 pb-3">
              <span className="eyebrow-sm text-ink-faint">{t.chill}</span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                <motion.span
                  aria-hidden="true"
                  animate={playing && !reduced ? { opacity: [1, 0.25, 1] } : { opacity: 0.35 }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="size-1.5 rounded-full bg-ink"
                />
                {playing ? t.chillDevice : elapsed > 0 ? t.chillPaused : t.chillIdle}
              </span>
            </div>

            {/* ------------------------------------------------ artwork -- */}
            <div className="relative h-[8.5rem] overflow-hidden rounded-[0.95rem] border border-line-subtle bg-sunken">
              <AnimatePresence custom={dir} initial={false} mode="popLayout">
                <motion.div
                  key={track.id}
                  custom={dir}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.42, ease: EASE }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <motion.div style={{ scale: artScale }} className="relative size-[7rem]">
                    {Array.from({ length: track.art.rings }).map((_, ring) => {
                      const inset = ring * (46 / track.art.rings);
                      return (
                        <motion.span
                          key={ring}
                          aria-hidden="true"
                          animate={
                            playing && !reduced
                              ? { rotate: track.art.spin > 0 ? 360 : -360 }
                              : { rotate: 0 }
                          }
                          transition={{
                            duration: (900 / Math.abs(track.art.spin)) * (ring + 1.4),
                            repeat: Infinity,
                            ease: "linear",
                          }}
                          style={{ inset: `${inset}%` }}
                          className="absolute rounded-full border border-ink/15"
                        />
                      );
                    })}
                    <motion.span
                      aria-hidden="true"
                      style={{ opacity: artGlow }}
                      className="absolute inset-[30%] rounded-full bg-[radial-gradient(circle_at_35%_30%,var(--ink),transparent_72%)]"
                    />
                  </motion.div>
                </motion.div>
              </AnimatePresence>

              {/* The real spectrum, along the bottom of the art. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[26px] items-end justify-center gap-[4px] px-3 pb-2.5">
                {Array.from({ length: BARS }).map((_, i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      meter.current[i] = el;
                    }}
                    aria-hidden="true"
                    className="h-full w-[3px] origin-bottom rounded-full bg-ink/30"
                    style={{ transform: "scaleY(0.12)" }}
                  />
                ))}
              </div>
            </div>

            {/* -------------------------------------------------- title -- */}
            <div className="relative mt-3 h-[2.6rem] overflow-hidden px-0.5">
              <AnimatePresence custom={dir} initial={false} mode="popLayout">
                <motion.div
                  key={track.id}
                  custom={dir}
                  variants={SLIDE}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.34, ease: EASE }}
                  className="absolute inset-x-0"
                >
                  <p className="truncate text-[14px] font-medium tracking-[-0.01em]">{title}</p>
                  <p className="truncate text-[12px] text-ink-faint">{artist}</p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* ----------------------------------------------- progress -- */}
            <div className="px-0.5 pt-1">
              <div className="h-[3px] overflow-hidden rounded-full bg-line">
                <motion.div
                  animate={{ scaleX: progress }}
                  initial={false}
                  transition={{ duration: TICK_MS / 1000, ease: "linear" }}
                  style={{ transformOrigin: "left" }}
                  className="h-full w-full rounded-full bg-ink"
                />
              </div>
              <div className="tnum flex justify-between pt-1.5 text-[10.5px] text-ink-faint">
                <span>{formatTime(elapsed)}</span>
                <span>{formatTime(track.seconds)}</span>
              </div>
            </div>

            {/* ---------------------------------------------- transport -- */}
            <div className="flex items-center justify-center gap-2 pt-1.5">
              <TransportButton label={t.prevTrack} onClick={() => go(-1)}>
                <PrevIcon />
              </TransportButton>

              <Magnetic strength={0.3}>
                <motion.button
                  type="button"
                  onClick={toggle}
                  aria-label={playing ? t.pause : t.play}
                  title={playing ? t.pause : t.play}
                  whileHover={{ scale: 1.07 }}
                  whileTap={{ scale: 0.9 }}
                  transition={PRESS}
                  className="relative grid size-11 place-items-center rounded-full bg-ink text-paper"
                >
                  {/* A ring leaving the button, once per breath, while it plays. */}
                  {playing && !reduced && (
                    <motion.span
                      aria-hidden="true"
                      initial={{ opacity: 0.35, scale: 1 }}
                      animate={{ opacity: 0, scale: 1.65 }}
                      transition={{ duration: 2.6, repeat: Infinity, ease: "easeOut" }}
                      className="absolute inset-0 rounded-full border border-ink"
                    />
                  )}
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={playing ? "pause" : "play"}
                      initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
                      transition={{ duration: 0.16, ease: EASE }}
                      className="grid place-items-center"
                    >
                      {playing ? <PauseIcon /> : <PlayIcon className="ml-[2px] size-[15px]" />}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              </Magnetic>

              <TransportButton label={t.nextTrack} onClick={() => go(1)}>
                <NextIcon />
              </TransportButton>
            </div>

            {/* ------------------------------------------------ loudness -- */}
            <div className="flex items-center gap-2.5 px-0.5 pt-3.5">
              <motion.button
                type="button"
                onClick={() => changeVolume(muted ? lastVolume.current || 0.6 : 0)}
                aria-label={muted ? t.unmute : t.mute}
                title={muted ? t.unmute : t.mute}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                transition={PRESS}
                className="grid size-7 shrink-0 place-items-center rounded-[0.55rem] text-ink-faint transition-colors duration-200 hover:bg-raised hover:text-ink"
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={muted ? "mute" : "on"}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.14 }}
                    className="grid place-items-center"
                  >
                    {muted ? <MuteIcon /> : <VolumeIcon />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>

              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => changeVolume(Number(e.target.value))}
                aria-label={t.volume}
                style={{ ["--fill" as string]: `${volume * 100}%` }}
                className="rail min-w-0 flex-1"
              />

              <span className="tnum w-8 shrink-0 text-right text-[10.5px] text-ink-faint">
                {Math.round(volume * 100)}
              </span>
            </div>

            <p className="px-0.5 pt-3 text-[11px] leading-relaxed text-ink-faint">
              {t.chillNote}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransportButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      whileHover={{ scale: 1.12 }}
      whileTap={{ scale: 0.88 }}
      transition={PRESS}
      className="grid size-9 place-items-center rounded-full text-ink-muted transition-colors duration-200 hover:bg-raised hover:text-ink"
    >
      {children}
    </motion.button>
  );
}

/** The toggle's own indicator: four bars, the way a device that's playing is
    marked everywhere else. Off the analyser would mean a frame loop running
    for a 17px icon, so these run on their own. */
function PlayingBars() {
  const reduced = useReducedMotion();
  const heights = [0.45, 1, 0.65, 0.85];

  return (
    <span aria-hidden="true" className="flex h-[15px] items-end gap-[2px]">
      {heights.map((peak, i) => (
        <motion.span
          key={i}
          animate={reduced ? { height: "40%" } : { height: [`${peak * 30}%`, `${peak * 100}%`, `${peak * 45}%`] }}
          transition={{
            duration: 1.1 + i * 0.23,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
          }}
          className="w-[2.5px] rounded-full bg-current"
          style={{ height: "40%" }}
        />
      ))}
    </span>
  );
}
