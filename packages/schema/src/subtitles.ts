import { z } from "zod";
import { HexColorSchema, IdSchema, Vec2Schema } from "./primitives.js";

export const WordEmphasisSchema = z.enum(["normal", "highlight", "accent", "alert"]);
export type WordEmphasis = z.infer<typeof WordEmphasisSchema>;

export const SubtitleAnimationSchema = z.enum([
  "none",
  "fade",
  "pop",
  "slide_up",
  "slide_down",
  "slide_left",
  "slide_right",
  "typewriter",
  "slam",
  "bounce",
  "spring_drop",
  "elastic_drop",
  "elastic_stretch",
  "glitch",
  "zoom_punch",
  "blur_in",
  "wave",
  "neon_flicker",
  "stamp",
  "flip_x",
  "flip_y",
  "rotate_in",
  "float_in",
  "swing",
  "spin_pop",
  "squeeze",
  "unfold",
  "rise_fade",
  "slide_fade",
  "karaoke_wipe",
  "kinetic_split",
  "skew_snap",
  "spiral_in",
  "curtain_reveal",
  "rubber_band",
  "heartbeat_in",
  "whip_in",
]);
export type SubtitleAnimation = z.infer<typeof SubtitleAnimationSchema>;

export const ActiveWordEffectSchema = z.enum([
  "none",
  "color",
  "pop",
  "glow",
  "underline",
  "box",
  "pill_solid",
  "neon",
  "shake",
  "bounce",
  "highlight_sweep",
  "extrude_3d",
  "fire_badge",
  "rainbow_wave",
  "zoom_glow",
  "marker_circle",
  "wave_lift",
  "glitch_word",
  "gradient_pill",
  "outline_flash",
  "rainbow_shift",
  "laser_underline",
  "comic_burst",
]);
export type ActiveWordEffect = z.infer<typeof ActiveWordEffectSchema>;

export const KeywordFxSchema = z.enum([
  "none",
  "glow",
  "pill",
  "underline_sweep",
  "impact_shake",
  "scale_pop",
  "sparkle",
  "neon_pulse",
  "strike_box",
  "double_underline",
  "halo_ring",
  "fire_aura",
  "chromatic_pop",
  "comic_star",
  "tilt_punch",
  "gold_badge",
]);
export type KeywordFx = z.infer<typeof KeywordFxSchema>;

export const SubtitleOverlayStyleSchema = z.enum([
  "none",
  "glass_card",
  "solid_pill",
  "comic_box",
  "neon_frame",
  "gradient_ribbon",
  "tape_highlight",
  "editorial_bar",
  "highlighter_block",
  "brush_stroke",
  "retro_terminal",
  "cinema_blur_bar",
  "retro_window",
  "cyber_bracket",
  "torn_paper",
  "news_ticker",
  "cinema_letterbox",
  "polaroid_strip",
  "gradient_glass",
  "comic_burst_box",
]);
export type SubtitleOverlayStyle = z.infer<typeof SubtitleOverlayStyleSchema>;

export const SubtitleVfxInSchema = z.enum([
  "none",
  "flash",
  "chromatic",
  "spark_burst",
  "zoom_blur",
  "glitch_slice",
  "gold_shimmer",
  "shockwave_ring",
  "neon_sweep",
  "fire_flare",
  "ink_splatter",
  "lens_flare",
  "pixel_dissolve",
  "rgb_pulse",
  "laser_scan",
  "star_trail",
  "smoke_puff",
  "electric_arc",
]);
export type SubtitleVfxIn = z.infer<typeof SubtitleVfxInSchema>;

export const SubtitleVfxOutSchema = z.enum([
  "none",
  "fade_blur",
  "zoom_out",
  "glitch_out",
  "drop",
  "shatter",
  "vaporize",
  "whip_out",
  "pixel_out",
  "flash_out",
  "shrink_spin",
  "slice_split",
  "neon_off",
  "slide_fade",
]);
export type SubtitleVfxOut = z.infer<typeof SubtitleVfxOutSchema>;

export const SubtitleStyleSchema = z.object({
  presetId: z.string().max(64).optional(),
  fontFamily: z.string().min(1).max(120).default("Figtree"),
  fontSource: z.enum(["system", "local", "google"]).default("google"),
  fontAssetId: IdSchema.optional(),
  fontWeight: z.number().int().min(100).max(900).default(800),
  /** Size in px at 1080p short-side reference; scales proportionally across 360p..4K. */
  fontSize: z.number().min(12).max(240).default(62),
  lineHeight: z.number().min(0.8).max(2.2).default(1.15),
  letterSpacing: z.number().min(-6).max(24).default(0.5),
  uppercase: z.boolean().default(true),
  align: z.enum(["left", "center", "right"]).default("center"),
  color: HexColorSchema.default("#ffffff"),
  activeWordColor: HexColorSchema.default("#ffd447"),
  accentWordColor: HexColorSchema.default("#4ce6c8"),
  alertWordColor: HexColorSchema.default("#ff5c5c"),
  strokeColor: HexColorSchema.default("#0b0d14"),
  strokeWidth: z.number().min(0).max(28).default(8),
  /** CapCut-grade 3D comic/block extrusion depth & color. */
  extrudeDepth: z.number().min(0).max(18).default(0),
  extrudeColor: HexColorSchema.default("#000000"),
  /** Outer neon/bloom glow intensity & tint. */
  glowIntensity: z.number().min(0).max(2).default(0),
  glowColor: HexColorSchema.default("#ffd447"),
  /** Slight kinetic angle in degrees (-15..15) for dynamic comic/viral captions. */
  tiltDeg: z.number().min(-15).max(15).default(0),
  /** Rich multi-layered CapCut container overlay style. */
  overlayStyle: SubtitleOverlayStyleSchema.default("none"),
  shadow: z.object({
    enabled: z.boolean().default(true),
    color: HexColorSchema.default("#000000cc"),
    blur: z.number().min(0).max(60).default(14),
    offsetX: z.number().min(-40).max(40).default(0),
    offsetY: z.number().min(-40).max(40).default(6),
  }).default({
    enabled: true,
    color: "#000000cc",
    blur: 14,
    offsetX: 0,
    offsetY: 6,
  }),
  backgroundBox: z.object({
    enabled: z.boolean().default(false),
    color: HexColorSchema.default("#0c101b"),
    opacity: z.number().min(0).max(1).default(0.76),
    paddingX: z.number().min(0).max(80).default(22),
    paddingY: z.number().min(0).max(60).default(12),
    borderRadius: z.number().min(0).max(60).default(14),
  }).default({
    enabled: false,
    color: "#0c101b",
    opacity: 0.76,
    paddingX: 22,
    paddingY: 12,
    borderRadius: 14,
  }),
  position: Vec2Schema.default({ x: 0.5, y: 0.78 }),
  maxWidth: z.number().min(0.2).max(0.96).default(0.84),
  maxWordsPerWindow: z.number().int().min(1).max(12).default(3),
  animationIn: SubtitleAnimationSchema.default("pop"),
  animationOut: SubtitleAnimationSchema.default("fade"),
  activeWordEffect: ActiveWordEffectSchema.default("pop"),
  /** Dedicated FX applied to marked keywords (`highlight`, `accent`, `alert`). */
  keywordFx: KeywordFxSchema.default("scale_pop"),
  /** Dedicated CapCut-style visual VFX triggered on cue entrance / exit. */
  vfxIn: SubtitleVfxInSchema.default("none"),
  vfxOut: SubtitleVfxOutSchema.default("none"),
});
export type SubtitleStyle = z.infer<typeof SubtitleStyleSchema>;

export const SubtitleWordOverrideSchema = z.object({
  color: HexColorSchema.optional(),
  scale: z.number().min(0.5).max(2.5).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  fx: KeywordFxSchema.optional(),
  boxColor: HexColorSchema.optional(),
  glow: z.boolean().optional(),
  italic: z.boolean().optional(),
});
export type SubtitleWordOverride = z.infer<typeof SubtitleWordOverrideSchema>;

export const SubtitleWordSchema = z.object({
  id: IdSchema,
  text: z.string().min(1).max(80),
  start: z.number().min(0).finite(),
  end: z.number().min(0).finite(),
  emphasis: WordEmphasisSchema.default("normal"),
  styleOverride: SubtitleWordOverrideSchema.optional(),
}).refine((w) => w.end >= w.start, {
  message: "Subtitle word end time must be >= start time",
});
export type SubtitleWord = z.infer<typeof SubtitleWordSchema>;

export const SubtitleCueSchema = z.object({
  id: IdSchema,
  start: z.number().min(0).finite(),
  end: z.number().min(0).finite(),
  text: z.string().min(1).max(600),
  speaker: z.string().max(64).optional(),
  words: z.array(SubtitleWordSchema).default([]),
  positionOverride: Vec2Schema.optional(),
  styleOverride: SubtitleStyleSchema.partial().optional(),
}).refine((cue) => cue.end > cue.start, {
  message: "Subtitle cue end time must be > start time",
});
export type SubtitleCue = z.infer<typeof SubtitleCueSchema>;

export const SubtitleTrackSchema = z.object({
  enabled: z.boolean().default(true),
  language: z.string().min(2).max(12).default("es"),
  style: SubtitleStyleSchema.default({}),
  cues: z.array(SubtitleCueSchema).default([]),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrackSchema>;
