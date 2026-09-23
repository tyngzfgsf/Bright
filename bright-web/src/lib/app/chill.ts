/**
 * Chill mode's sound: four ambient pieces, synthesised in the browser.
 *
 * There are no audio files in this repo and nothing is fetched — every piece
 * is a pink-noise bed under a slow chord pad, built out of WebAudio nodes and
 * pushed around by very slow LFOs. That keeps the demo self-contained (it
 * works offline, on a fresh clone, with no account and no licensing) and it
 * gives the player a real signal to draw: the visualiser reads the same
 * analyser the speakers do, so the artwork is actually moving with the sound.
 *
 * Browsers won't let an AudioContext make noise until a gesture has happened,
 * so nothing here is built until `play()` is called from a click.
 */

export type ChillTrack = {
  id: string;
  title: { en: string; ko: string };
  /** Sits where an artist name would; these are moods, not people. */
  artist: { en: string; ko: string };
  /** Nominal length. The piece itself never ends — this is when we move on. */
  seconds: number;
  /** Root of the pad, Hz. */
  root: number;
  /** Semitones above the root, played together and held. */
  chord: number[];
  /** Where the noise bed is filtered down to, Hz. */
  tone: number;
  /** How much noise bed sits under the pad, 0–1. */
  noise: number;
  /** Speed of the filter sweep, Hz — all of these are well under one cycle. */
  drift: number;
  /** Occasional single notes over the pad. */
  bells?: boolean;
  /** Drawing hints for the artwork, so each piece looks like itself. */
  art: { rings: number; spin: number };
};

export const TRACKS: ChillTrack[] = [
  {
    id: "ward",
    title: { en: "Ward at 3am", ko: "새벽 3시 병동" },
    artist: { en: "Night shift", ko: "야간 근무" },
    seconds: 300,
    root: 110,
    chord: [0, 7, 12, 19],
    tone: 520,
    noise: 0.34,
    drift: 0.035,
    art: { rings: 4, spin: 54 },
  },
  {
    id: "lamp",
    title: { en: "Paper Lamp", ko: "종이 등" },
    artist: { en: "Slow room", ko: "느린 방" },
    seconds: 264,
    root: 130.81,
    chord: [0, 5, 12, 17],
    tone: 720,
    noise: 0.2,
    drift: 0.05,
    bells: true,
    art: { rings: 6, spin: -38 },
  },
  {
    id: "rain",
    title: { en: "Rain on Glass", ko: "유리창의 비" },
    artist: { en: "Weather", ko: "날씨" },
    seconds: 330,
    root: 98,
    chord: [0, 7, 12, 15],
    tone: 1500,
    noise: 0.52,
    drift: 0.09,
    art: { rings: 3, spin: 26 },
  },
  {
    id: "exhale",
    title: { en: "Long Exhale", ko: "긴 날숨" },
    artist: { en: "Breathing", ko: "호흡" },
    seconds: 288,
    root: 87.31,
    chord: [0, 7, 12, 14],
    tone: 420,
    noise: 0.16,
    drift: 0.025,
    bells: true,
    art: { rings: 5, spin: -20 },
  },
];

export function formatTime(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
}

/** One track's graph. `out` is its own fader, so pieces can cross over. */
type Voice = {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  bell?: number;
};

const FADE_IN = 1.6;
const FADE_OUT = 0.9;
/** Long enough that the pad's tail lands before the context goes quiet. */
const PAUSE_FADE = 0.45;

function semitone(root: number, steps: number): number {
  return root * Math.pow(2, steps / 12);
}

/** Pink noise, six seconds of it, looped. Kellet's filter over white. */
function pinkNoise(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 6);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      const value = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = value * 0.1;
    }
  }

  return buffer;
}

/** A cheap room: decaying noise as an impulse response. */
function room(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 2.6);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
    }
  }

  return buffer;
}

export class ChillEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private reverbIn: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voice: Voice | null = null;
  // Typed on ArrayBuffer, not ArrayBufferLike: the analyser's readers won't
  // take a view that might sit on a SharedArrayBuffer.
  private spectrum: Uint8Array<ArrayBuffer> | null = null;
  private wave: Uint8Array<ArrayBuffer> | null = null;
  private volume = 0.6;
  private suspendTimer: number | undefined;

  /** Builds the shared graph on the first play, and not before: an
      AudioContext made outside a gesture starts suspended and some browsers
      log about it. */
  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();

    const master = ctx.createGain();
    master.gain.value = 0;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.82;

    const convolver = ctx.createConvolver();
    convolver.buffer = room(ctx);
    const reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    reverbIn.connect(convolver);
    convolver.connect(master);

    master.connect(analyser);
    analyser.connect(ctx.destination);

    this.ctx = ctx;
    this.master = master;
    this.analyser = analyser;
    this.reverbIn = reverbIn;
    this.noise = pinkNoise(ctx);
    this.spectrum = new Uint8Array(analyser.frequencyBinCount);
    this.wave = new Uint8Array(analyser.fftSize);

    return ctx;
  }

  private build(track: ChillTrack): Voice {
    const ctx = this.ensure();
    const master = this.master!;
    const reverbIn = this.reverbIn!;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(master);

    const send = ctx.createGain();
    send.gain.value = 0.55;
    out.connect(send);
    send.connect(reverbIn);

    const sources: AudioScheduledSourceNode[] = [];

    // --- the bed: pink noise, filtered down and swept very slowly ----------
    const bed = ctx.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;

    const bedFilter = ctx.createBiquadFilter();
    bedFilter.type = "lowpass";
    bedFilter.frequency.value = track.tone;
    bedFilter.Q.value = 0.7;

    const bedGain = ctx.createGain();
    bedGain.gain.value = track.noise;

    const sweep = ctx.createOscillator();
    sweep.type = "sine";
    sweep.frequency.value = track.drift;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = track.tone * 0.45;
    sweep.connect(sweepDepth);
    sweepDepth.connect(bedFilter.frequency);

    bed.connect(bedFilter);
    bedFilter.connect(bedGain);
    bedGain.connect(out);

    bed.start();
    sweep.start();
    sources.push(bed, sweep);

    // --- the pad: the chord, held, each note breathing on its own clock ----
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 1400;
    padFilter.Q.value = 0.6;
    padFilter.connect(out);

    track.chord.forEach((steps, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "sine" : "triangle";
      osc.frequency.value = semitone(track.root, steps);
      osc.detune.value = (i % 2 === 0 ? 1 : -1) * (3 + i * 2);

      const level = ctx.createGain();
      level.gain.value = 0.075 / Math.sqrt(track.chord.length);

      // Each note swells on a different very slow cycle, so the chord never
      // sits still and never lines up with itself.
      const breath = ctx.createOscillator();
      breath.type = "sine";
      breath.frequency.value = 0.02 + i * 0.017;
      const breathDepth = ctx.createGain();
      breathDepth.gain.value = level.gain.value * 0.75;
      breath.connect(breathDepth);
      breathDepth.connect(level.gain);

      osc.connect(level);
      level.connect(padFilter);
      osc.start();
      breath.start();
      sources.push(osc, breath);
    });

    const voice: Voice = { out, sources };

    if (track.bells) this.scheduleBell(voice, track, padFilter);

    return voice;
  }

  /** A single note over the pad every so often, never on a grid. */
  private scheduleBell(voice: Voice, track: ChillTrack, dest: AudioNode) {
    const ctx = this.ctx!;

    const ring = () => {
      const steps = track.chord[Math.floor(Math.random() * track.chord.length)];
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = semitone(track.root, steps + 24);

      const env = ctx.createGain();
      const now = ctx.currentTime;
      env.gain.setValueAtTime(0, now);
      env.gain.linearRampToValueAtTime(0.06, now + 0.04);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 4);

      osc.connect(env);
      env.connect(dest);
      osc.start(now);
      osc.stop(now + 4.2);
      osc.onended = () => env.disconnect();

      voice.bell = window.setTimeout(ring, 7000 + Math.random() * 11000);
    };

    voice.bell = window.setTimeout(ring, 2500 + Math.random() * 6000);
  }

  private release(voice: Voice, seconds: number) {
    const ctx = this.ctx!;
    const now = ctx.currentTime;

    window.clearTimeout(voice.bell);
    voice.out.gain.cancelScheduledValues(now);
    voice.out.gain.setValueAtTime(voice.out.gain.value, now);
    voice.out.gain.linearRampToValueAtTime(0, now + seconds);

    // Stopping mid-fade would click; the tail finishes first, and the reverb
    // it already fed carries on decaying after the sources are gone.
    window.setTimeout(
      () => {
        voice.sources.forEach((source) => {
          try {
            source.stop();
          } catch {
            // Already stopped — nothing to undo.
          }
          source.disconnect();
        });
        voice.out.disconnect();
      },
      seconds * 1000 + 120,
    );
  }

  /** Starts a piece, crossfading out of whatever was playing. */
  async play(track: ChillTrack) {
    const ctx = this.ensure();
    window.clearTimeout(this.suspendTimer);
    if (ctx.state === "suspended") await ctx.resume();

    if (this.voice) this.release(this.voice, FADE_OUT);

    const voice = this.build(track);
    const now = ctx.currentTime;
    voice.out.gain.setValueAtTime(0, now);
    voice.out.gain.linearRampToValueAtTime(1, now + FADE_IN);
    this.voice = voice;

    const master = this.master!;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(this.volume, now + 0.4);
  }

  /** Fades out and lets the context idle — a suspended context stops costing
      anything, and resuming it is instant. */
  pause() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + PAUSE_FADE);

    window.clearTimeout(this.suspendTimer);
    this.suspendTimer = window.setTimeout(() => {
      void ctx.suspend();
    }, PAUSE_FADE * 1000 + 60);
  }

  /** Picks up the piece that's already built, rather than starting a new one. */
  async resume() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.voice) return false;

    window.clearTimeout(this.suspendTimer);
    if (ctx.state === "suspended") await ctx.resume();

    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(this.volume, now + 0.35);
    return true;
  }

  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== "running") return;
    // A ramp, not a jump: dragging the rail shouldn't step the level.
    master.gain.setTargetAtTime(this.volume, ctx.currentTime, 0.04);
  }

  /** Overall loudness right now, 0–1 — what the artwork breathes on. */
  level(): number {
    const analyser = this.analyser;
    const wave = this.wave;
    if (!analyser || !wave || this.ctx?.state !== "running") return 0;

    analyser.getByteTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) {
      const v = (wave[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / wave.length) * 4.5);
  }

  /** `count` bands across the spectrum, 0–1 each, for the meter. */
  bands(count: number): number[] {
    const analyser = this.analyser;
    const spectrum = this.spectrum;
    if (!analyser || !spectrum || this.ctx?.state !== "running") {
      return new Array(count).fill(0);
    }

    analyser.getByteFrequencyData(spectrum);
    // Only the bottom eighth carries anything here — everything above it is
    // filtered away, and a linear split would draw eight dead bars.
    const usable = Math.floor(spectrum.length / 8);
    const width = Math.max(1, Math.floor(usable / count));

    return Array.from({ length: count }, (_, i) => {
      let sum = 0;
      for (let j = 0; j < width; j++) sum += spectrum[i * width + j];
      return Math.min(1, sum / width / 190);
    });
  }

  dispose() {
    window.clearTimeout(this.suspendTimer);
    if (this.voice) this.release(this.voice, 0.15);
    this.voice = null;
    const ctx = this.ctx;
    this.ctx = null;
    window.setTimeout(() => void ctx?.close(), 400);
  }
}
