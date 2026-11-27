import { z } from "zod";
import { KeyframeTrackMapSchema } from "./keyframes.js";
import {
  AspectRatioSchema,
  BlendModeSchema,
  CanvasConfigSchema,
  FpsSchema,
  HexColorSchema,
  IdSchema,
  QualityPresetSchema,
  ResolutionPresetSchema,
  SCHEMA_VERSION,
  ScaleModeSchema,
  TransformSchema,
  Vec2Schema,
  VideoEncoderSchema,
} from "./primitives.js";
import {
  ArmTrackSegmentSchema,
  BoneAngleOverrideSchema,
  CharacterDefinitionSchema,
  CharacterExpressionSchema,
  CharacterPoseSchema,
  ContactPropBindingSchema,
  ExpressionCueSchema,
  PoseCueSchema,
  ReactionNodSchema,
} from "./rig.js";
import { AnimationStyleIdSchema } from "./styles.js";
import { SubtitleTrackSchema } from "./subtitles.js";

// ============================================================================
// ASSETS
// ============================================================================

export const AssetKindSchema = z.enum([
  "image",
  "svg",
  "pixel_art",
  "audio",
  "font",
  "character_sheet",
  "video",
]);
export type AssetKind = z.infer<typeof AssetKindSchema>;

export const AssetSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(160),
  kind: AssetKindSchema,
  /** Relative path inside project assets folder or resolvable asset URI. */
  src: z.string().min(1).max(512),
  mimeType: z.string().max(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().min(0).optional(),
  /** Crisp nearest-neighbor sampling for pixel art assets. */
  scaleMode: ScaleModeSchema.default("linear"),
  tags: z.array(z.string().max(48)).default([]),
  provenance: z.object({
    source: z.enum(["local", "imported_legacy", "generated", "openverse", "svgrepo", "google_fonts"]).default("local"),
    license: z.string().max(120).optional(),
    author: z.string().max(120).optional(),
    url: z.string().max(512).optional(),
  }).default({ source: "local" }),
});
export type Asset = z.infer<typeof AssetSchema>;

// ============================================================================
// POST-PROCESSING / RETRO SHADERS
// ============================================================================

export const PostProcessingSchema = z.object({
  preset: z.enum(["clean", "psx", "pixel_art", "cinematic", "noir", "custom"]).default("clean"),
  psx: z.object({
    enabled: z.boolean().default(false),
    internalHeight: z.number().int().min(144).max(540).default(240),
    colorBits: z.number().int().min(3).max(8).default(5),
    ditherStrength: z.number().min(0).max(1).default(0.65),
    vertexSnap: z.number().min(0).max(8).default(2),
    scanlines: z.number().min(0).max(1).default(0.18),
    ntscBleed: z.number().min(0).max(1).default(0.22),
  }).default({
    enabled: false,
    internalHeight: 240,
    colorBits: 5,
    ditherStrength: 0.65,
    vertexSnap: 2,
    scanlines: 0.18,
    ntscBleed: 0.22,
  }),
  pixelArt: z.object({
    enabled: z.boolean().default(false),
    pixelHeight: z.number().int().min(90).max(540).default(270),
    paletteSize: z.number().int().min(4).max(256).default(32),
    preserveInk: z.boolean().default(true),
  }).default({
    enabled: false,
    pixelHeight: 270,
    paletteSize: 32,
    preserveInk: true,
  }),
  halation: z.object({
    enabled: z.boolean().default(false),
    strength: z.number().min(0).max(1.5).default(0.35),
    threshold: z.number().min(0).max(1).default(0.72),
    radius: z.number().min(1).max(48).default(14),
    tint: HexColorSchema.default("#ff7a59"),
  }).default({
    enabled: false,
    strength: 0.35,
    threshold: 0.72,
    radius: 14,
    tint: "#ff7a59",
  }),
  chromaticAberration: z.object({
    enabled: z.boolean().default(false),
    strength: z.number().min(0).max(1).default(0.15),
    maxPixels: z.number().min(0).max(24).default(8),
  }).default({
    enabled: false,
    strength: 0.15,
    maxPixels: 8,
  }),
  filmGrain: z.object({
    enabled: z.boolean().default(false),
    mode: z.enum(["film", "paper", "vhs"]).default("paper"),
    strength: z.number().min(0).max(1).default(0.08),
    stepFrames: z.number().int().min(1).max(8).default(2),
  }).default({
    enabled: false,
    mode: "paper",
    strength: 0.08,
    stepFrames: 2,
  }),
  vignette: z.object({
    enabled: z.boolean().default(true),
    strength: z.number().min(0).max(1).default(0.28),
    softness: z.number().min(0.1).max(1).default(0.65),
  }).default({
    enabled: true,
    strength: 0.28,
    softness: 0.65,
  }),
});
export type PostProcessing = z.infer<typeof PostProcessingSchema>;

// ============================================================================
// CAMERA & TRANSITIONS
// ============================================================================

export const CameraFramingSchema = z.enum([
  "default",
  "establishing",
  "wide",
  "medium",
  "closeup",
  "extreme_closeup",
  "low_angle",
  "over_shoulder",
]);
export type CameraFraming = z.infer<typeof CameraFramingSchema>;

export const CameraImpulseSchema = z.object({
  t: z.number().min(0),
  intensity: z.number().min(0).max(3).default(0.45),
  duration: z.number().min(0.05).max(3).default(0.35),
  chromaticBurst: z.number().min(0).max(1).default(0),
});

export const CameraConfigSchema = z.object({
  framing: CameraFramingSchema.default("default"),
  framingTargetLayerId: IdSchema.optional(),
  x: z.number().finite().default(0.5),
  y: z.number().finite().default(0.5),
  zoom: z.number().min(0.25).max(6).default(1),
  rotation: z.number().min(-45).max(45).default(0), // Dutch angle in degrees
  handheld: z.object({
    enabled: z.boolean().default(false),
    intensity: z.number().min(0).max(2).default(0.22),
    frequency: z.number().min(0.1).max(5).default(1.0),
  }).default({ enabled: false, intensity: 0.22, frequency: 1.0 }),
  parallaxStrength: z.number().min(0).max(2).default(1.0),
  impulses: z.array(CameraImpulseSchema).default([]),
  keyframes: KeyframeTrackMapSchema.default({}),
});
export type CameraConfig = z.infer<typeof CameraConfigSchema>;

export const TransitionTypeSchema = z.enum([
  "cut",
  "fade",
  "dissolve",
  "fade_white",
  "flash",
  "snap_zoom",
  "zoom_through",
  "zoom_pupil",
  "zoom_rotate",
  "spin_left",
  "spin_right",
  "whip_left",
  "whip_right",
  "whip_up",
  "whip_down",
  "slide_left",
  "slide_right",
  "slide_up",
  "slide_down",
  "wipe_left",
  "wipe_right",
  "wipe_up",
  "wipe_down",
  "liquid_wipe",
  "iris",
  "diamond_iris",
  "clock_wipe",
  "blinds_h",
  "blinds_v",
  "split_h",
  "split_v",
  "curtain_open",
  "shutter_blink",
  "glitch",
  "rgb_split",
  "light_leak",
  "film_burn",
  "match_cut",
  "morph",
  "pixelate",
]);
export type TransitionType = z.infer<typeof TransitionTypeSchema>;

export const TransitionSfxPresetSchema = z.enum([
  "none",
  "whoosh",
  "whoosh_deep",
  "whip",
  "zoom_whoosh",
  "glitch",
  "flash",
  "shimmer_gold",
  "impact",
]);
export type TransitionSfxPreset = z.infer<typeof TransitionSfxPresetSchema>;

export const TransitionConfigSchema = z.object({
  type: TransitionTypeSchema.default("cut"),
  duration: z.number().min(0).max(3).default(0.35),
  accentColor: HexColorSchema.optional(),
  sfxPreset: TransitionSfxPresetSchema.optional(),
  sfxAssetId: IdSchema.optional(),
  sfxVolume: z.number().min(0).max(1.5).optional(),
});
export type TransitionConfig = z.infer<typeof TransitionConfigSchema>;

// ============================================================================
// LAYER COLOR ADJUSTMENTS & MOTION ANIMATIONS
// ============================================================================

export const LayerColorAdjustSchema = z.object({
  brightness: z.number().min(0.2).max(2.2).default(1),
  contrast: z.number().min(0.2).max(2.2).default(1),
  saturation: z.number().min(0).max(2.5).default(1),
  hue: z.number().min(-180).max(180).default(0),
  blur: z.number().min(0).max(32).default(0),
  grayscale: z.number().min(0).max(1).default(0),
  sepia: z.number().min(0).max(1).default(0),
});
export type LayerColorAdjust = z.infer<typeof LayerColorAdjustSchema>;

export const LayerEnterAnimSchema = z.enum([
  "none",
  "fade",
  "pop",
  "slide_up",
  "slide_down",
  "slide_left",
  "slide_right",
  "zoom_in",
  "zoom_out",
  "slam",
  "elastic",
  "glitch",
  "bounce_in",
  "drop_in",
  "flip_x",
  "flip_y",
  "spin_in",
  "swing_in",
  "squeeze_in",
  "rubber_band",
  "zoom_punch",
  "whip_left",
  "whip_right",
  "whip_up",
  "whip_down",
  "blur_in",
  "stamp",
  "tilt_pop",
  "unfold_x",
  "unfold_y",
  "rise_spring",
  "spiral_in",
]);
export type LayerEnterAnim = z.infer<typeof LayerEnterAnimSchema>;

export const LayerExitAnimSchema = z.enum([
  "none",
  "fade",
  "pop",
  "slide_up",
  "slide_down",
  "slide_left",
  "slide_right",
  "zoom_out",
  "zoom_in",
  "slam_out",
  "bounce_out",
  "flip_x",
  "flip_y",
  "spin_out",
  "whip_left",
  "whip_right",
  "blur_out",
  "glitch_out",
  "drop_out",
  "shrink_spin",
]);
export type LayerExitAnim = z.infer<typeof LayerExitAnimSchema>;

export const LayerLoopMotionSchema = z.enum([
  "none",
  "float",
  "breathe",
  "bounce",
  "wiggle",
  "spin",
  "pulse",
  "shake",
  "ken_burns",
  "pendulum",
  "orbit",
  "jitter",
  "heartbeat",
  "sway_x",
  "sway_y",
  "flicker",
  "zoom_breathe",
  "tilt_rock",
  "hover_drift",
  "rubber_pulse",
]);
export type LayerLoopMotion = z.infer<typeof LayerLoopMotionSchema>;

export const LayerMotionSchema = z.object({
  enter: LayerEnterAnimSchema.default("none"),
  enterDuration: z.number().min(0.05).max(3).default(0.35),
  exit: LayerExitAnimSchema.default("none"),
  exitDuration: z.number().min(0.05).max(3).default(0.25),
  loop: LayerLoopMotionSchema.default("none"),
  loopAmplitude: z.number().min(0).max(2).default(0.5),
  loopSpeed: z.number().min(0.1).max(6).default(1.2),
});
export type LayerMotion = z.infer<typeof LayerMotionSchema>;

export const LayerShadowSchema = z.object({
  enabled: z.boolean().default(false),
  color: HexColorSchema.default("#000000"),
  blur: z.number().min(0).max(48).default(12),
  offsetX: z.number().min(-64).max(64).default(0),
  offsetY: z.number().min(-64).max(64).default(6),
  alpha: z.number().min(0).max(1).default(0.55),
});
export type LayerShadow = z.infer<typeof LayerShadowSchema>;

// ============================================================================
// LAYERS (DISCRIMINATED UNION)
// ============================================================================

export const BaseLayerSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  /** Start and end time relative to the owning scene (seconds). */
  start: z.number().min(0).default(0),
  /** Optional explicit duration; if omitted, lasts until scene end. */
  duration: z.number().positive().optional(),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  zIndex: z.number().int().default(0),
  /** 0 = fixed HUD, 0.8 = distant BG, 1.0 = main stage, 1.2 = close foreground. */
  parallaxDepth: z.number().min(0).max(3).default(1.0),
  blendMode: BlendModeSchema.default("normal"),
  transform: TransformSchema.default({}),
  keyframes: KeyframeTrackMapSchema.default({}),
  motion: LayerMotionSchema.optional(),
});

export const ProceduralSetSchema = z.enum([
  "solid",
  "gradient",
  "living_room",
  "dining_family",
  "childhood_room",
  "city_crosswalk",
  "memory_corridor",
  "sunset_hill",
  "cafe",
  "park",
  "street",
  "studio",
  "observatory",
  "library",
  "hospital",
  "forest",
  // Stickman Video Director animation style environments
  "minimal_dark_a1",
  "minimal_light_a1",
  "studio_tech_a2",
  "cave_prehistoric_a3",
  "amber_noir_a6",
  "vintage_cartoon_a7",
  "ghibli_sky_a8",
  "paper_grid_b1",
  "paper_warm_b2",
  "retro_tv_b3",
  "pixel_stage_b7",
  "mythic_temple_b8",
  "stylized_3d_stage",
  "kurzgesagt_cosmos",
  "anime_sky_cel",
  "retro_psx_arena",
  "paper_cutout_stage",
]);

export const BackgroundLayerSchema = BaseLayerSchema.extend({
  type: z.literal("background"),
  sourceType: z.enum(["solid", "gradient", "procedural", "asset"]).default("gradient"),
  color: HexColorSchema.default("#121622"),
  gradientTop: HexColorSchema.default("#1a2036"),
  gradientBottom: HexColorSchema.default("#0a0d16"),
  proceduralSet: ProceduralSetSchema.optional(),
  mood: z.enum(["day", "dusk", "gold", "night", "ice", "noir"]).default("dusk"),
  seed: z.number().int().default(1),
  assetId: IdSchema.optional(),
  fit: z.enum(["cover", "contain", "stretch"]).default("cover"),
  scaleMode: ScaleModeSchema.default("linear"),
  driftX: z.number().default(0),
  driftY: z.number().default(0),
  dimOverlay: z.number().min(0).max(0.9).optional(),
  washColor: HexColorSchema.optional(),
  washOpacity: z.number().min(0).max(0.85).optional(),
  colorAdjust: LayerColorAdjustSchema.optional(),
});

export const SpriteLayerSchema = BaseLayerSchema.extend({
  type: z.literal("sprite"),
  assetId: IdSchema.optional(),
  proceduralProp: z.string().max(64).optional(),
  /** Normalized width relative to canvas short side (e.g. 0.42 = 42% of width on 9:16). */
  widthNorm: z.number().min(0.02).max(4).default(0.4),
  scaleMode: ScaleModeSchema.default("linear"),
  pixelSnap: z.boolean().default(false),
  tint: HexColorSchema.optional(),
  bobAmplitude: z.number().min(0).max(0.2).default(0),
  bobSpeed: z.number().min(0).max(10).default(1.2),
  colorAdjust: LayerColorAdjustSchema.optional(),
  shadow: LayerShadowSchema.optional(),
});

export const CharacterLayerSchema = BaseLayerSchema.extend({
  type: z.literal("character"),
  characterId: IdSchema,
  pose: CharacterPoseSchema.default("idle"),
  expression: CharacterExpressionSchema.default("neutral"),
  poseCues: z.array(PoseCueSchema).default([]),
  expressionCues: z.array(ExpressionCueSchema).default([]),
  boneOverrides: BoneAngleOverrideSchema.default({}),
  /** Independent per-arm action tracks (b6_actions.py: rest -> reach -> offer/receive -> retract). */
  armTracks: z
    .object({
      left: z.array(ArmTrackSegmentSchema).optional(),
      right: z.array(ArmTrackSegmentSchema).optional(),
    })
    .optional(),
  /** Bounded 2-bone IK wrist targets in rig-local coordinates (px relative to hip/feet root, facing right). */
  wristTargets: z
    .object({
      left: z.object({ x: z.number(), y: z.number() }).optional(),
      right: z.object({ x: z.number(), y: z.number() }).optional(),
    })
    .optional(),
  /** Planted ankle targets in rig-local coordinates (clamped to 92%-108% leg stance envelope). */
  ankleTargets: z
    .object({
      left: z.object({ x: z.number(), y: z.number() }).optional(),
      right: z.object({ x: z.number(), y: z.number() }).optional(),
    })
    .optional(),
  /** Rigid head rotation angle in degrees around neck_attachment pivot (bounded to ±20°). */
  headAngleDeg: z.number().min(-45).max(45).optional(),
  /** Deterministic reaction nods (one-shot attack/settle rigid head turns). */
  reactionNods: z.array(ReactionNodSchema).optional(),
  /** Declare which limbs render in front of a held prop (e.g. ["right_forearm", "left_forearm"]). */
  frontLimbParts: z.array(z.enum(["left_forearm", "right_forearm", "left_arm", "right_arm"])).optional(),
  /** Optional prop bound directly to a character's wrist/hand contact point. */
  contactProp: ContactPropBindingSchema.optional(),
  lookAtLayerId: IdSchema.optional(),
  lookAtPoint: Vec2Schema.optional(),
  lipSyncTrackId: IdSchema.optional(),
  talkWindows: z.array(z.tuple([z.number().min(0), z.number().min(0)])).default([]),
  silhouette: z.boolean().default(false),
  tint: HexColorSchema.optional(),
  autoWalkOnMove: z.boolean().default(true),
  /** Optional imported/library SVG or PNG overriding this character instance visually. */
  customSpriteAssetId: IdSchema.optional(),
  scaleMode: ScaleModeSchema.default("linear"),
  colorAdjust: LayerColorAdjustSchema.optional(),
});

export const TextLayerSchema = BaseLayerSchema.extend({
  type: z.literal("text"),
  variant: z.enum(["free", "kinetic_title", "tag", "callout", "stat_pop"]).default("free"),
  text: z.string().min(1).max(400),
  subtitle: z.string().max(240).optional(),
  kicker: z.string().max(120).optional(),
  fontFamily: z.string().min(1).max(120).default("Figtree"),
  fontWeight: z.number().int().min(100).max(900).default(800),
  fontSize: z.number().min(10).max(280).default(56),
  color: HexColorSchema.default("#ffffff"),
  accentColor: HexColorSchema.default("#f7c8d6"),
  strokeColor: HexColorSchema.default("#0a0d16"),
  strokeWidth: z.number().min(0).max(24).default(5),
  align: z.enum(["left", "center", "right"]).default("center"),
  maxWidth: z.number().min(0.1).max(1).default(0.84),
  letterSpacing: z.number().min(-10).max(40).optional(),
  lineHeight: z.number().min(0.8).max(2.5).optional(),
  uppercase: z.boolean().optional(),
  italic: z.boolean().optional(),
  shadow: LayerShadowSchema.optional(),
  colorAdjust: LayerColorAdjustSchema.optional(),
  backgroundBox: z.object({
    enabled: z.boolean().default(false),
    color: HexColorSchema.default("#0c101b"),
    opacity: z.number().min(0).max(1).default(0.72),
    paddingX: z.number().min(0).max(80).default(24),
    paddingY: z.number().min(0).max(60).default(14),
    borderRadius: z.number().min(0).max(80).default(16),
  }).optional(),
});

export const ShapeKindSchema = z.enum([
  "rect",
  "rounded_rect",
  "circle",
  "ring",
  "line",
  "polygon",
  "star",
  "triangle",
  "arrow",
  "callout",
  "pie",
  "heart",
  "spark",
]);
export type ShapeKind = z.infer<typeof ShapeKindSchema>;

export const ShapeLayerSchema = BaseLayerSchema.extend({
  type: z.literal("shape"),
  shape: ShapeKindSchema.default("rounded_rect"),
  widthNorm: z.number().min(0.01).max(3).default(0.35),
  heightNorm: z.number().min(0.01).max(3).default(0.2),
  fillColor: HexColorSchema.optional(),
  strokeColor: HexColorSchema.optional(),
  strokeWidth: z.number().min(0).max(40).default(0),
  borderRadius: z.number().min(0).max(200).default(16),
  /** Number of points/sides for star, polygon, or spark (Remotion shapes). */
  points: z.number().int().min(3).max(24).default(5),
  /** Inner-to-outer radius ratio for star and spark shapes. */
  innerRadiusRatio: z.number().min(0.1).max(0.95).default(0.45),
  /** Progress 0..1 for animated pie wedges or draw-on stroke reveal (`evolvePath`). */
  progress: z.number().min(0).max(1).default(1),
  /** When true, animates the shape's stroke progressively from 0% to `progress` during enter/time. */
  drawOn: z.boolean().default(false),
  /** Tail direction for `callout` speech bubbles. */
  tailDirection: z.enum(["left", "right", "bottom"]).default("bottom"),
  /** Relative head size for `arrow` shapes. */
  arrowHeadSize: z.number().min(0.15).max(0.65).default(0.32),
  colorAdjust: LayerColorAdjustSchema.optional(),
});

export const VfxLayerSchema = BaseLayerSchema.extend({
  type: z.literal("vfx"),
  effect: z.enum([
    "rain",
    "snow",
    "embers",
    "dust",
    "god_rays",
    "speed_lines",
    "impact_burst",
    "light_leak",
  ]),
  intensity: z.number().min(0).max(2).default(0.8),
  color: HexColorSchema.default("#ffd447"),
  seed: z.number().int().default(7),
});

export const PipLayerSchema = BaseLayerSchema.extend({
  type: z.literal("pip"),
  shape: z.enum(["rounded", "polaroid", "circle", "rift"]).default("polaroid"),
  widthNorm: z.number().min(0.15).max(0.95).default(0.52),
  heightNorm: z.number().min(0.12).max(0.8).default(0.24),
  borderColor: HexColorSchema.default("#ffd447"),
  label: z.string().max(80).optional(),
  /** Referenced scene ID rendered live inside the PiP frame. */
  sourceSceneId: IdSchema.optional(),
  sourceTimeOffset: z.number().default(0),
  /** Optional image/SVG asset displayed inside the PiP window. */
  assetId: IdSchema.optional(),
  scaleMode: ScaleModeSchema.default("linear"),
  colorAdjust: LayerColorAdjustSchema.optional(),
});

export const LayerSchema = z.discriminatedUnion("type", [
  BackgroundLayerSchema,
  SpriteLayerSchema,
  CharacterLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
  VfxLayerSchema,
  PipLayerSchema,
]);
export type Layer = z.infer<typeof LayerSchema>;

// ============================================================================
// SCENES
// ============================================================================

export const SplitLayoutSchema = z.object({
  enabled: z.boolean().default(false),
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
  gutterPx: z.number().min(0).max(48).default(10),
  dividerColor: HexColorSchema.default("#ffd447"),
  panels: z.array(z.object({
    id: IdSchema,
    label: z.string().max(80).optional(),
    weight: z.number().positive().default(1),
    layerIds: z.array(IdSchema).default([]),
  })).default([]),
});

export const SceneSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  duration: z.number().min(0.1).max(3600).default(4),
  mood: z.enum(["day", "dusk", "gold", "night", "ice", "noir"]).default("dusk"),
  camera: CameraConfigSchema.default({}),
  transitionIn: TransitionConfigSchema.default({ type: "cut", duration: 0 }),
  transitionOut: TransitionConfigSchema.default({ type: "cut", duration: 0 }),
  splitLayout: SplitLayoutSchema.optional(),
  postProcessingOverride: PostProcessingSchema.partial().optional(),
  layers: z.array(LayerSchema).default([]),
  notes: z.string().max(1000).optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

// ============================================================================
// TIMED EFFECT CLIPS (CAPCUT-STYLE VIDEO / MOTION / OVERLAY EFFECTS TRACK)
// ============================================================================

export const EffectClipCategorySchema = z.enum(["video", "motion", "overlay", "retro"]);
export type EffectClipCategory = z.infer<typeof EffectClipCategorySchema>;

export const EffectClipTypeSchema = z.enum([
  // Video / Retro / Aesthetic GPU Shaders
  "psx",
  "pixel_art",
  "vhs_glitch",
  "rgb_split",
  "halation",
  "film_grain",
  "noir",
  "sepia",
  "cyberpunk_neon",
  "dream_blur",
  "boil",
  "vignette_pulse",
  "flash_impact",
  "letterbox",
  "crt_scanlines",
  "vintage_8mm",
  "thermal_vision",
  "comic_halftone",
  "golden_hour",
  "cold_cinema",
  "prism_refract",
  "strobe_flash",
  // Motion / Camera Effects
  "camera_shake",
  "handheld_drift",
  "punch_zoom",
  "dolly_zoom",
  "dutch_sway",
  "ken_burns",
  "beat_pulse",
  "whip_pan_loop",
  "zoom_breathe",
  "earthquake_heavy",
  "orbit_drift",
  "vertigo_tilt",
  // Visual / Atmospheric Overlays
  "speed_lines",
  "light_leaks",
  "spotlight",
  "embers",
  "rain",
  "snow",
  "dust",
  "god_rays",
  "impact_burst",
  "confetti",
  "bokeh_lights",
  "matrix_rain",
  "lens_flare_sweep",
  "fireflies",
  "starfield",
]);
export type EffectClipType = z.infer<typeof EffectClipTypeSchema>;

export const EffectClipSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  category: EffectClipCategorySchema.default("video"),
  effectType: EffectClipTypeSchema,
  /** Global timeline start time in seconds. */
  start: z.number().min(0),
  duration: z.number().min(0.1).max(3600),
  enabled: z.boolean().default(true),
  intensity: z.number().min(0).max(2).default(0.85),
  speed: z.number().min(0.1).max(6).default(1),
  color: HexColorSchema.default("#ffd447"),
  fadeIn: z.number().min(0).max(3).default(0.15),
  fadeOut: z.number().min(0).max(3).default(0.15),
});
export type EffectClip = z.infer<typeof EffectClipSchema>;

// ============================================================================
// AUDIO TRACKS
// ============================================================================

export const AudioFadeCurveSchema = z.enum(["linear", "smooth", "exp", "log"]);
export type AudioFadeCurve = z.infer<typeof AudioFadeCurveSchema>;

export const AudioClipSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  assetId: IdSchema,
  /** Global timeline start time in seconds. */
  start: z.number().min(0),
  duration: z.number().positive(),
  trimStart: z.number().min(0).default(0),
  gainDb: z.number().min(-60).max(24).default(0),
  pan: z.number().min(-1).max(1).default(0),
  fadeIn: z.number().min(0).max(30).default(0),
  fadeOut: z.number().min(0).max(30).default(0),
  fadeCurve: AudioFadeCurveSchema.default("smooth"),
  loop: z.boolean().default(false),
});
export type AudioClip = z.infer<typeof AudioClipSchema>;

export const AudioTrackSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  role: z.enum(["voice", "music", "sfx", "ambience"]),
  volume: z.number().min(0).max(2).default(1),
  muted: z.boolean().default(false),
  solo: z.boolean().default(false),
  /** Optional sidechain ducking under another track (e.g. music ducking under voice). */
  duckUnderTrackId: IdSchema.optional(),
  duckAmountDb: z.number().min(-36).max(0).default(-10),
  clips: z.array(AudioClipSchema).default([]),
});
export type AudioTrack = z.infer<typeof AudioTrackSchema>;

// ============================================================================
// EXPORT SETTINGS & ROOT PROJECT
// ============================================================================

export const ExportSettingsSchema = z.object({
  aspectRatio: AspectRatioSchema.default("9:16"),
  resolution: ResolutionPresetSchema.default("1080p"),
  customWidth: z.number().int().min(128).max(7680).optional(),
  customHeight: z.number().int().min(128).max(7680).optional(),
  fps: FpsSchema.default(30),
  quality: QualityPresetSchema.default("high"),
  crf: z.number().int().min(0).max(51).optional(),
  videoBitrateKbps: z.number().int().min(250).max(200_000).optional(),
  encoder: VideoEncoderSchema.default("auto"),
  audioBitrateKbps: z.number().int().min(64).max(512).default(192),
  loudnessLufs: z.number().min(-30).max(-6).default(-16),
  truePeakDbtp: z.number().min(-10).max(-0.5).default(-2),
  burnSubtitles: z.boolean().default(true),
  exportSrt: z.boolean().default(true),
  /** Parallel Chromium render workers (0 = auto based on CPU cores, 1..8 explicit). Inspired by Remotion renderer concurrency. */
  concurrency: z.number().int().min(0).max(8).default(0),
  /** Sub-frame Motion Blur samples per frame (1 = off, 2..16 = cinematic shutter accumulation). Inspired by @remotion/motion-blur. */
  motionBlurSamples: z.number().int().min(1).max(16).default(1),
  /** Motion Blur shutter angle in degrees (default 180° = classic 1/2-frame cinema shutter). */
  shutterAngle: z.number().min(0).max(360).default(180),
  /** Optional partial export range start (seconds). */
  startTimeSec: z.number().min(0).finite().optional(),
  /** Optional partial export range end (seconds). */
  endTimeSec: z.number().min(0.1).finite().optional(),
});
export type ExportSettings = z.infer<typeof ExportSettingsSchema>;

export const TimelineMarkerSchema = z.object({
  id: IdSchema,
  t: z.number().min(0).finite(),
  label: z.string().max(80).default("Marcador"),
  color: HexColorSchema.default("#ffd447"),
});
export type TimelineMarker = z.infer<typeof TimelineMarkerSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION).default(SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1).max(160),
  description: z.string().max(1000).default(""),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  canvas: CanvasConfigSchema.default({}),
  /** Global animation style pack (Storia Editorial + A1-A8 + B1-B8 Stickman Director styles). */
  animationStyle: AnimationStyleIdSchema.default("storia_editorial"),
  cast: z.array(CharacterDefinitionSchema).default([]),
  assets: z.array(AssetSchema).default([]),
  scenes: z.array(SceneSchema).min(1),
  effectClips: z.array(EffectClipSchema).default([]),
  audioTracks: z.array(AudioTrackSchema).default([]),
  subtitles: SubtitleTrackSchema.default({}),
  markers: z.array(TimelineMarkerSchema).default([]),
  postProcessing: PostProcessingSchema.default({}),
  exportSettings: ExportSettingsSchema.default({}),
  metadata: z.object({
    brand: z.string().max(80).optional(),
    tags: z.array(z.string().max(48)).default([]),
    sourceManifest: z.string().max(512).optional(),
  }).default({ tags: [] }),
});
export type Project = z.infer<typeof ProjectSchema>;

/** Compute total timeline duration from ordered scenes. */
export function getProjectDuration(project: Pick<Project, "scenes">): number {
  return project.scenes.reduce((acc, s) => acc + s.duration, 0);
}

/** Return the scene and local scene timestamp at a given global timeline second. */
export function resolveSceneAtTime(
  project: Pick<Project, "scenes">,
  globalTimeSec: number,
): { scene: Scene; sceneIndex: number; sceneStart: number; localTime: number } | null {
  if (project.scenes.length === 0) return null;
  const clamped = Math.max(0, globalTimeSec);
  let cursor = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i]!;
    const end = cursor + scene.duration;
    if (clamped < end || i === project.scenes.length - 1) {
      return {
        scene,
        sceneIndex: i,
        sceneStart: cursor,
        localTime: Math.min(scene.duration, Math.max(0, clamped - cursor)),
      };
    }
    cursor = end;
  }
  return null;
}
