import { z } from "zod";
import {
  SPRING_PRESETS,
  SpringConfig,
  SpringConfigSchema,
  spring,
} from "./remotionMath.js";

export const EasingTypeSchema = z.enum([
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeOutCubic",
  "easeInOutCubic",
  "easeOutBack",
  "spring",
  "springSmooth",
  "springSnappy",
  "springBouncy",
  "springHeavy",
  "step",
  "cubicBezier",
]);
export type EasingType = z.infer<typeof EasingTypeSchema>;

export const CubicBezierTupleSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(-2).max(3),
  z.number().min(0).max(1),
  z.number().min(-2).max(3),
]);
export type CubicBezierTuple = z.infer<typeof CubicBezierTupleSchema>;

export const AnimatablePropertySchema = z.enum([
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "cameraZoom",
  "cameraX",
  "cameraY",
  "cameraRotation",
  "vfxStrength",
]);
export type AnimatableProperty = z.infer<typeof AnimatablePropertySchema>;

export const KeyframeSchema = z.object({
  id: z.string().min(1).optional(),
  /** Time relative to the owning scene or layer start (in seconds). */
  t: z.number().min(0).finite(),
  value: z.number().finite(),
  easing: EasingTypeSchema.default("easeInOut"),
  bezier: CubicBezierTupleSchema.optional(),
  springConfig: SpringConfigSchema.partial().optional(),
});
export type Keyframe = z.infer<typeof KeyframeSchema>;

export const KeyframeTrackMapSchema = z
  .record(AnimatablePropertySchema, z.array(KeyframeSchema))
  .default({});
export type KeyframeTrackMap = z.infer<typeof KeyframeTrackMapSchema>;

function clamp01(u: number): number {
  return u < 0 ? 0 : u > 1 ? 1 : u;
}

function evalCubicBezier(u: number, [x1, y1, x2, y2]: CubicBezierTuple): number {
  const tClamped = clamp01(u);
  if (tClamped <= 0) return 0;
  if (tClamped >= 1) return 1;

  // Newton-Raphson solve for curve parameter s where Bx(s) == u
  let s = tClamped;
  for (let i = 0; i < 6; i++) {
    const inv = 1 - s;
    const bx = 3 * inv * inv * s * x1 + 3 * inv * s * s * x2 + s * s * s;
    const dbx = 3 * inv * inv * x1 + 6 * inv * s * (x2 - x1) + 3 * s * s * (1 - x2);
    const err = bx - tClamped;
    if (Math.abs(err) < 1e-5 || Math.abs(dbx) < 1e-6) break;
    s = clamp01(s - err / dbx);
  }
  const inv = 1 - s;
  return 3 * inv * inv * s * y1 + 3 * inv * s * s * y2 + s * s * s;
}

export function evaluateEasing(
  uRaw: number,
  easing: EasingType = "easeInOut",
  bezier?: CubicBezierTuple,
  springConfig?: Partial<SpringConfig>,
): number {
  const u = clamp01(uRaw);
  switch (easing) {
    case "linear":
      return u;
    case "step":
      return u >= 1 ? 1 : 0;
    case "easeIn":
      return u * u;
    case "easeOut":
      return 1 - (1 - u) * (1 - u);
    case "easeInOut":
      return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    case "easeOutCubic":
      return 1 - Math.pow(1 - u, 3);
    case "easeInOutCubic":
      return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case "easeOutBack": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
    }
    case "spring":
    case "springSmooth":
    case "springSnappy":
    case "springBouncy":
    case "springHeavy": {
      if (u <= 0) return 0;
      if (u >= 1) return 1;
      const preset =
        easing === "springSmooth"
          ? SPRING_PRESETS.smooth
          : easing === "springSnappy"
            ? SPRING_PRESETS.snappy
            : easing === "springBouncy"
              ? SPRING_PRESETS.bouncy
              : easing === "springHeavy"
                ? SPRING_PRESETS.heavy
                : SPRING_PRESETS.gentle;
      return spring({
        frame: u * 60,
        fps: 60,
        durationInFrames: 60,
        config: { ...preset, ...(springConfig ?? {}) },
      });
    }
    case "cubicBezier":
      return evalCubicBezier(u, bezier ?? [0.42, 0, 0.58, 1]);
  }
}

/**
 * Deterministic keyframe evaluator shared 1:1 by the PixiJS viewport, MCP frame capture, and FFmpeg exporter.
 */
export function evaluateKeyframes(
  keyframes: readonly Keyframe[] | undefined,
  timeSec: number,
  fallbackValue: number,
): number {
  if (!keyframes || keyframes.length === 0) return fallbackValue;
  const sorted = keyframes.length > 1
    ? [...keyframes].sort((a, b) => a.t - b.t)
    : keyframes;

  const first = sorted[0]!;
  if (timeSec <= first.t) return first.value;

  const last = sorted[sorted.length - 1]!;
  if (timeSec >= last.t) return last.value;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (timeSec >= a.t && timeSec <= b.t) {
      const span = b.t - a.t;
      if (span <= 1e-6) return b.value;
      const u = (timeSec - a.t) / span;
      const k = evaluateEasing(u, a.easing, a.bezier, a.springConfig);
      return a.value + (b.value - a.value) * k;
    }
  }
  return last.value;
}
