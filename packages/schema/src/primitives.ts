import { z } from "zod";

export const SCHEMA_VERSION = "1.0.0" as const;

export const IdSchema = z
  .string()
  .min(1)
  .max(96)
  .regex(/^[a-zA-Z0-9_-]+$/, "ID must be alphanumeric with underscores or hyphens");

export const HexColorSchema = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Expected #RRGGBB or #RRGGBBAA hex color");

export const AspectRatioSchema = z.enum(["9:16", "16:9", "1:1", "custom"]);
export type AspectRatio = z.infer<typeof AspectRatioSchema>;

export const ResolutionPresetSchema = z.enum(["360p", "720p", "1080p", "2k", "4k", "custom"]);
export type ResolutionPreset = z.infer<typeof ResolutionPresetSchema>;

export const FpsSchema = z.union([z.literal(24), z.literal(30), z.literal(60)]);
export type Fps = z.infer<typeof FpsSchema>;

export const QualityPresetSchema = z.enum(["draft", "standard", "high", "master", "custom"]);
export type QualityPreset = z.infer<typeof QualityPresetSchema>;

export const VideoEncoderSchema = z.enum([
  "auto",
  "h264_nvenc",
  "hevc_nvenc",
  "av1_nvenc",
  "libx264",
  "libx265",
]);
export type VideoEncoder = z.infer<typeof VideoEncoderSchema>;

export const BlendModeSchema = z.enum(["normal", "add", "multiply", "screen", "overlay"]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

export const ScaleModeSchema = z.enum(["linear", "nearest"]);
export type ScaleMode = z.infer<typeof ScaleModeSchema>;

/**
 * Normalized 2D vector relative to virtual canvas dimensions:
 * (0,0) = top-left, (0.5, 0.5) = center, (1,1) = bottom-right.
 * Values outside [0, 1] are permitted for smooth off-screen entrances/exits.
 */
export const Vec2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});
export type Vec2 = z.infer<typeof Vec2Schema>;

/**
 * Anchor / pivot point in local element coordinates:
 * (0.5, 0.5) = center, (0.5, 1.0) = feet/bottom-center (ideal for characters).
 */
export const AnchorSchema = z.object({
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.5),
});
export type Anchor = z.infer<typeof AnchorSchema>;

export const TransformSchema = z.object({
  x: z.number().finite().default(0.5),
  y: z.number().finite().default(0.5),
  anchor: AnchorSchema.default({ x: 0.5, y: 0.5 }),
  scaleX: z.number().finite().min(0.01).max(20).default(1),
  scaleY: z.number().finite().min(0.01).max(20).default(1),
  rotation: z.number().finite().default(0), // degrees
  opacity: z.number().min(0).max(1).default(1),
  flipX: z.boolean().default(false),
  flipY: z.boolean().default(false),
});
export type Transform = z.infer<typeof TransformSchema>;

export const CanvasConfigSchema = z.object({
  aspectRatio: AspectRatioSchema.default("9:16"),
  resolution: ResolutionPresetSchema.default("1080p"),
  customWidth: z.number().int().min(128).max(7680).optional(),
  customHeight: z.number().int().min(128).max(7680).optional(),
  fps: FpsSchema.default(30),
  backgroundColor: HexColorSchema.default("#0a0d16"),
  pixelGrid: z.object({
    enabled: z.boolean().default(false),
    virtualHeight: z.number().int().min(90).max(720).default(270),
    snapTransforms: z.boolean().default(true),
  }).default({ enabled: false, virtualHeight: 270, snapTransforms: true }),
});
export type CanvasConfig = z.infer<typeof CanvasConfigSchema>;

export interface CanvasDimensions {
  width: number;
  height: number;
  aspectNumeric: number;
}

const SHORT_SIDE_BY_PRESET: Record<Exclude<ResolutionPreset, "custom">, number> = {
  "360p": 360,
  "720p": 720,
  "1080p": 1080,
  "2k": 1440,
  "4k": 2160,
};

function makeEven(n: number): number {
  const rounded = Math.max(2, Math.round(n));
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

export function resolveCanvasDimensions(config: {
  aspectRatio: AspectRatio;
  resolution: ResolutionPreset;
  customWidth?: number;
  customHeight?: number;
}): CanvasDimensions {
  if (config.aspectRatio === "custom" || config.resolution === "custom") {
    const width = makeEven(config.customWidth ?? 1080);
    const height = makeEven(config.customHeight ?? 1920);
    return { width, height, aspectNumeric: width / height };
  }

  const shortSide = SHORT_SIDE_BY_PRESET[config.resolution];
  if (config.aspectRatio === "9:16") {
    const width = makeEven(shortSide);
    const height = makeEven((shortSide * 16) / 9);
    return { width, height, aspectNumeric: width / height };
  }
  if (config.aspectRatio === "16:9") {
    const height = makeEven(shortSide);
    const width = makeEven((shortSide * 16) / 9);
    return { width, height, aspectNumeric: width / height };
  }
  // 1:1
  const side = makeEven(shortSide);
  return { width: side, height: side, aspectNumeric: 1 };
}

export interface SafeZoneBox {
  id: string;
  label: string;
  /** Normalized margins [0..1] */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Platform-calibrated safe zones for Shorts/Reels/TikTok (9:16), YouTube (16:9), and Square (1:1).
 */
export function resolveSafeZones(aspectRatio: AspectRatio): SafeZoneBox[] {
  if (aspectRatio === "9:16") {
    return [
      { id: "action", label: "Action Safe", top: 0.08, right: 0.06, bottom: 0.14, left: 0.06 },
      { id: "social_ui", label: "Reels / Shorts / TikTok UI Safe", top: 0.14, right: 0.16, bottom: 0.24, left: 0.08 },
    ];
  }
  if (aspectRatio === "16:9") {
    return [
      { id: "action", label: "Broadcast Action Safe (90%)", top: 0.05, right: 0.05, bottom: 0.05, left: 0.05 },
      { id: "title", label: "YouTube Title & Controls Safe", top: 0.08, right: 0.08, bottom: 0.14, left: 0.08 },
    ];
  }
  return [
    { id: "action", label: "Square Action Safe", top: 0.06, right: 0.06, bottom: 0.08, left: 0.06 },
    { id: "title", label: "Square Title Safe", top: 0.10, right: 0.10, bottom: 0.14, left: 0.10 },
  ];
}

export const QUALITY_PRESET_DEFAULTS: Record<
  Exclude<QualityPreset, "custom">,
  { crf: number; nvencPreset: string; x264Preset: string; audioBitrateKbps: number }
> = {
  draft: { crf: 27, nvencPreset: "p2", x264Preset: "veryfast", audioBitrateKbps: 128 },
  standard: { crf: 21, nvencPreset: "p4", x264Preset: "medium", audioBitrateKbps: 160 },
  high: { crf: 17, nvencPreset: "p6", x264Preset: "slow", audioBitrateKbps: 192 },
  master: { crf: 13, nvencPreset: "p7", x264Preset: "veryslow", audioBitrateKbps: 320 },
};
