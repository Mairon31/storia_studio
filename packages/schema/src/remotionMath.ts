import { z } from "zod";

/**
 * Remotion-inspired deterministic animation math, spring physics, color interpolation,
 * and seeded 2D/3D Simplex Noise — 100% pure, deterministic, and shared across
 * WebGL2 live preview, headless capture, and multi-worker FFmpeg export.
 */

export const SpringConfigSchema = z.object({
  damping: z.number().min(0.1).max(200).default(10),
  mass: z.number().min(0.1).max(50).default(1),
  stiffness: z.number().min(1).max(2000).default(100),
  overshootClamping: z.boolean().default(false),
});
export type SpringConfig = z.infer<typeof SpringConfigSchema>;

export const DEFAULT_SPRING_CONFIG: SpringConfig = {
  damping: 10,
  mass: 1,
  stiffness: 100,
  overshootClamping: false,
};

export const SPRING_PRESETS: Record<
  "smooth" | "snappy" | "bouncy" | "heavy" | "gentle",
  SpringConfig
> = {
  smooth: { damping: 200, mass: 1, stiffness: 100, overshootClamping: false },
  snappy: { damping: 20, mass: 0.8, stiffness: 220, overshootClamping: false },
  bouncy: { damping: 8, mass: 1, stiffness: 140, overshootClamping: false },
  heavy: { damping: 15, mass: 2, stiffness: 80, overshootClamping: false },
  gentle: { damping: 14, mass: 1, stiffness: 90, overshootClamping: false },
};

/**
 * Closed-form analytical solution for a damped harmonic oscillator (mass-spring-damper)
 * transitioning from 0 -> 1 at time `tSec >= 0`.
 * Supports underdamped (zeta < 1), critically damped (zeta === 1), and overdamped (zeta > 1).
 */
export function evaluateSpringPhysics(
  tSec: number,
  config: Partial<SpringConfig> = {},
): { value: number; velocity: number } {
  const c = Math.max(0.01, config.damping ?? DEFAULT_SPRING_CONFIG.damping);
  const m = Math.max(0.01, config.mass ?? DEFAULT_SPRING_CONFIG.mass);
  const k = Math.max(0.01, config.stiffness ?? DEFAULT_SPRING_CONFIG.stiffness);
  const overshootClamping = config.overshootClamping ?? DEFAULT_SPRING_CONFIG.overshootClamping;

  if (tSec <= 0) return { value: 0, velocity: 0 };

  const zeta = c / (2 * Math.sqrt(k * m));
  const omega0 = Math.sqrt(k / m);

  let value: number;
  let velocity: number;

  if (zeta < 0.9999) {
    // Underdamped (oscillatory)
    const omega1 = omega0 * Math.sqrt(1 - zeta * zeta);
    const env = Math.exp(-zeta * omega0 * tSec);
    const cos1 = Math.cos(omega1 * tSec);
    const sin1 = Math.sin(omega1 * tSec);
    const frag = env * (cos1 + ((zeta * omega0) / omega1) * sin1);
    value = 1 - frag;
    velocity = env * ((omega0 * omega0) / omega1) * sin1;
  } else if (zeta <= 1.0001) {
    // Critically damped
    const env = Math.exp(-omega0 * tSec);
    value = 1 - env * (1 + omega0 * tSec);
    velocity = env * omega0 * omega0 * tSec;
  } else {
    // Overdamped
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -omega0 * (zeta - s);
    const r2 = -omega0 * (zeta + s);
    const c1 = r2 / (r2 - r1);
    const c2 = -r1 / (r2 - r1);
    const e1 = Math.exp(r1 * tSec);
    const e2 = Math.exp(r2 * tSec);
    value = 1 - (c1 * e1 + c2 * e2);
    velocity = -(c1 * r1 * e1 + c2 * r2 * e2);
  }

  if (overshootClamping && value > 1) {
    return { value: 1, velocity: 0 };
  }
  return { value, velocity };
}

const naturalDurationCache = new Map<string, number>();

/**
 * Measures the natural duration (in frames) until a spring settles within `threshold` of 1.0.
 * Mirrors Remotion's `measureSpring({ fps, config, threshold })`.
 */
export function measureSpring(opts: {
  fps: number;
  config?: Partial<SpringConfig>;
  threshold?: number;
}): number {
  const fps = Math.max(1, opts.fps);
  const threshold = Math.max(1e-4, opts.threshold ?? 0.005);
  const c = opts.config?.damping ?? DEFAULT_SPRING_CONFIG.damping;
  const m = opts.config?.mass ?? DEFAULT_SPRING_CONFIG.mass;
  const k = opts.config?.stiffness ?? DEFAULT_SPRING_CONFIG.stiffness;
  const clampFlag = opts.config?.overshootClamping ? 1 : 0;
  const key = `${fps}|${c}|${m}|${k}|${clampFlag}|${threshold}`;

  const cached = naturalDurationCache.get(key);
  if (cached !== undefined) return cached;

  const maxFrames = Math.ceil(fps * 15);
  let settledFrames = 0;
  let result = Math.max(1, Math.round(fps * 0.5));

  for (let frame = 1; frame <= maxFrames; frame++) {
    const { value, velocity } = evaluateSpringPhysics(frame / fps, opts.config);
    if (Math.abs(1 - value) <= threshold && Math.abs(velocity) <= threshold * 2) {
      settledFrames++;
      if (settledFrames >= 3) {
        result = Math.max(1, frame - 2);
        break;
      }
    } else {
      settledFrames = 0;
    }
    if (frame === maxFrames) {
      result = maxFrames;
    }
  }

  if (naturalDurationCache.size > 256) {
    const oldest = naturalDurationCache.keys().next().value;
    if (oldest !== undefined) naturalDurationCache.delete(oldest);
  }
  naturalDurationCache.set(key, result);
  return result;
}

/**
 * Remotion-compatible `spring()` animation function.
 */
export function spring(opts: {
  frame: number;
  fps: number;
  config?: Partial<SpringConfig>;
  from?: number;
  to?: number;
  durationInFrames?: number;
  durationRestThreshold?: number;
  delay?: number;
  reverse?: boolean;
}): number {
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const delay = opts.delay ?? 0;
  const reverse = opts.reverse ?? false;
  const fps = Math.max(1, opts.fps);

  const needsDuration = reverse || opts.durationInFrames !== undefined;
  const naturalFrames = needsDuration
    ? measureSpring({
        fps,
        config: opts.config,
        threshold: opts.durationRestThreshold,
      })
    : undefined;

  const targetFrames = opts.durationInFrames ?? naturalFrames ?? fps;
  const reverseProcessed = reverse ? targetFrames - opts.frame : opts.frame;
  const delayProcessed = reverseProcessed + (reverse ? delay : -delay);

  if (delayProcessed <= 0) return from;
  if (opts.durationInFrames !== undefined && delayProcessed >= opts.durationInFrames) {
    return to;
  }

  const stretchedFrame =
    opts.durationInFrames !== undefined && naturalFrames !== undefined
      ? delayProcessed * (naturalFrames / Math.max(1e-6, opts.durationInFrames))
      : delayProcessed;

  const { value } = evaluateSpringPhysics(stretchedFrame / fps, opts.config);
  return from + (to - from) * value;
}

export type ExtrapolateType = "clamp" | "extend" | "identity";

export interface InterpolateOptions {
  extrapolateLeft?: ExtrapolateType;
  extrapolateRight?: ExtrapolateType;
  easing?: (t: number) => number;
  posterize?: number;
}

/**
 * Remotion-compatible multi-segment `interpolate(input, inputRange, outputRange, options)`.
 */
export function interpolate(
  input: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
  options: InterpolateOptions = {},
): number {
  if (inputRange.length < 2 || inputRange.length !== outputRange.length) {
    throw new Error("interpolate() requires inputRange and outputRange of equal length >= 2");
  }

  const extrapolateLeft = options.extrapolateLeft ?? "extend";
  const extrapolateRight = options.extrapolateRight ?? "extend";

  let val = input;
  if (options.posterize && options.posterize > 0) {
    val = Math.floor(val * options.posterize) / options.posterize;
  }

  const n = inputRange.length;
  if (val < inputRange[0]!) {
    if (extrapolateLeft === "identity") return val;
    if (extrapolateLeft === "clamp") return outputRange[0]!;
  }
  if (val > inputRange[n - 1]!) {
    if (extrapolateRight === "identity") return val;
    if (extrapolateRight === "clamp") return outputRange[n - 1]!;
  }

  // Locate segment
  let seg = 0;
  for (let i = 1; i < n - 1; i++) {
    if (val >= inputRange[i]!) seg = i;
  }

  const inMin = inputRange[seg]!;
  const inMax = inputRange[seg + 1]!;
  const outMin = outputRange[seg]!;
  const outMax = outputRange[seg + 1]!;

  if (Math.abs(inMax - inMin) < 1e-9) return outMax;

  let t = (val - inMin) / (inMax - inMin);
  if (options.easing) {
    t = options.easing(t);
  }
  return outMin + (outMax - outMin) * t;
}

function parseColorRgba(input: string): [number, number, number, number] {
  const s = input.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex && hex[1]) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const r = parseInt(h[0]! + h[0]!, 16);
      const g = parseInt(h[1]! + h[1]!, 16);
      const b = parseInt(h[2]! + h[2]!, 16);
      const a = h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1;
      return [r, g, b, a];
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [r, g, b, a];
  }

  const rgba = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgba) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] !== undefined ? Number(rgba[4]) : 1,
    ];
  }
  return [255, 255, 255, 1];
}

function byteHex(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
}

/**
 * Remotion-compatible `interpolateColors(input, inputRange, outputColors)`.
 */
export function interpolateColors(
  input: number,
  inputRange: readonly number[],
  outputColors: readonly string[],
  options: Pick<InterpolateOptions, "easing" | "posterize"> = {},
): string {
  const parsed = outputColors.map(parseColorRgba);
  const r = interpolate(input, inputRange, parsed.map((c) => c[0]), {
    ...options,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const g = interpolate(input, inputRange, parsed.map((c) => c[1]), {
    ...options,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const b = interpolate(input, inputRange, parsed.map((c) => c[2]), {
    ...options,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const a = interpolate(input, inputRange, parsed.map((c) => c[3]), {
    ...options,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (a >= 0.999) {
    return `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`;
  }
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(a.toFixed(3))})`;
}

/**
 * Deterministic PRNG (`seededRandom`, equivalent to Remotion's `random(seed)`).
 * Always returns a value in [0, 1) for a given string or numeric seed.
 */
export function seededRandom(seed: string | number): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Mulberry32 finalizer
  h = (h + 0x6d2b79f5) >>> 0;
  let t = Math.imul(h ^ (h >>> 15), 1 | h);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ============================================================================
// SELF-CONTAINED DETERMINISTIC SIMPLEX NOISE 2D & 3D (modeled on @remotion/noise)
// ============================================================================

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRAD3: readonly [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

interface NoiseTables {
  perm: Uint8Array;
  permMod12: Uint8Array;
}

const noiseTableCache = new Map<string, NoiseTables>();

function getNoiseTables(seed: string | number): NoiseTables {
  const key = String(seed);
  const existing = noiseTableCache.get(key);
  if (existing) return existing;

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let state = Math.floor(seededRandom(key) * 0xffffffff) >>> 0;
  const nextRand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 255; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    const tmp = p[i]!;
    p[i] = p[j]!;
    p[j] = tmp;
  }

  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255]!;
    permMod12[i] = perm[i]! % 12;
  }

  const tables: NoiseTables = { perm, permMod12 };
  if (noiseTableCache.size > 32) {
    const oldest = noiseTableCache.keys().next().value;
    if (oldest !== undefined) noiseTableCache.delete(oldest);
  }
  noiseTableCache.set(key, tables);
  return tables;
}

/**
 * Deterministic 2D Simplex Noise in [-1, 1] (compatible with `@remotion/noise` `noise2D`).
 */
export function noise2D(seed: string | number, x: number, y: number): number {
  const { perm, permMod12 } = getNoiseTables(seed);
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2;
  const y2 = y0 - 1 + 2 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const g0 = GRAD3[permMod12[ii + perm[jj]!]!]!;
    t0 *= t0;
    n0 = t0 * t0 * (g0[0] * x0 + g0[1] * y0);
  }

  let n1 = 0;
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const g1 = GRAD3[permMod12[ii + i1 + perm[jj + j1]!]!]!;
    t1 *= t1;
    n1 = t1 * t1 * (g1[0] * x1 + g1[1] * y1);
  }

  let n2 = 0;
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const g2 = GRAD3[permMod12[ii + 1 + perm[jj + 1]!]!]!;
    t2 *= t2;
    n2 = t2 * t2 * (g2[0] * x2 + g2[1] * y2);
  }

  return 70 * (n0 + n1 + n2);
}

/**
 * Deterministic 3D Simplex Noise in [-1, 1] (compatible with `@remotion/noise` `noise3D`).
 */
export function noise3D(seed: string | number, x: number, y: number, z: number): number {
  const { perm, permMod12 } = getNoiseTables(seed);
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);
  const t = (i + j + k) * G3;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const z0 = z - (k - t);

  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;

  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else {
    if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  const contrib = (dx: number, dy: number, dz: number, gi: number): number => {
    let tc = 0.6 - dx * dx - dy * dy - dz * dz;
    if (tc < 0) return 0;
    const g = GRAD3[gi]!;
    tc *= tc;
    return tc * tc * (g[0] * dx + g[1] * dy + g[2] * dz);
  };

  const n0 = contrib(x0, y0, z0, permMod12[ii + perm[jj + perm[kk]!]!]!);
  const n1 = contrib(x1, y1, z1, permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]!]!]!);
  const n2 = contrib(x2, y2, z2, permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]!]!]!);
  const n3 = contrib(x3, y3, z3, permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]!]!]!);

  return 32 * (n0 + n1 + n2 + n3);
}
