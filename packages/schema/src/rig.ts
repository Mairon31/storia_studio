import { z } from "zod";
import { HexColorSchema, IdSchema, ScaleModeSchema } from "./primitives.js";
import { CharacterRenderStyleSchema } from "./styles.js";

export const CharacterPoseSchema = z.enum([
  "idle",
  "present",
  "present_both",
  "point",
  "point_up",
  "shrug",
  "think",
  "wave",
  "wave_both",
  "celebrate",
  "victory",
  "lean",
  "sad",
  "shock",
  "reach",
  "hug",
  "comfort",
  "despair",
  "protect",
  "cower",
  "run",
  "walk",
  "sit",
  "kneel",
  "look_up",
  "hold_hands",
  "arms_crossed",
  "hands_on_hips",
  "salute",
  "bow",
  "dance",
  "typing",
  "phone_call",
  "fighting",
  "custom",
]);
export type CharacterPose = z.infer<typeof CharacterPoseSchema>;

export const CharacterExpressionSchema = z.enum([
  "neutral",
  "calm",
  "happy",
  "laugh",
  "proud",
  "relieved",
  "worried",
  "angry",
  "sly",
  "smug",
  "suspicious",
  "think",
  "sad",
  "shock",
  "determined",
  "confused",
  "love",
  "awe",
  "fear",
  "cry",
  "guilt",
  "exhausted",
]);
export type CharacterExpression = z.infer<typeof CharacterExpressionSchema>;

export const CharacterAgeSchema = z.enum(["toddler", "boy", "girl", "teen", "adult", "elder"]);
export type CharacterAge = z.infer<typeof CharacterAgeSchema>;

export const FaceShapeSchema = z.enum(["soft", "round", "square", "long", "heart"]);
export type FaceShape = z.infer<typeof FaceShapeSchema>;

export const EyeStyleSchema = z.enum(["open", "almond", "round"]);
export type EyeStyle = z.infer<typeof EyeStyleSchema>;

export const HatStyleSchema = z.enum([
  "none",
  "cap",
  "fedora",
  "beret",
  "crown",
  "beanie",
  "police_cap",
  "tricorn",
  "officer_cap",
  "helmet",
  "fire_helmet",
  "chef_hat",
  "astronaut_helmet",
  "tophat",
  "wizard_hat",
  "knight_helm",
  "sailor_cap",
  "work_cap",
  "pith_helmet",
  "headband",
  "ninja_hood",
  // Expanded headwear variety
  "cowboy_hat",
  "sombrero",
  "bucket_hat",
  "sun_hat",
  "laurel_wreath",
  "tiara",
  "graduation_cap",
  "samurai_kabuto",
  "headphones",
]);
export type HatStyle = z.infer<typeof HatStyleSchema>;

export const HairStyleSchema = z.enum([
  // Classic / unisex
  "short",
  "curly",
  "bob",
  "long",
  "ponytail",
  "braids",
  "updo",
  "bald",
  "parted",
  "wavy",
  // Men's & structured cuts
  "pompadour",
  "undercut",
  "spiky",
  "buzz",
  "slick_back",
  "side_sweep",
  "afro",
  "mohawk",
  // Women's & expressive cuts
  "long_layered",
  "twin_tails",
  "pixie",
  "side_bun",
  "messy_bun",
  "bangs_long",
  "half_up",
  "dreadlocks",
]);
export type HairStyle = z.infer<typeof HairStyleSchema>;

export const FacialHairStyleSchema = z.enum([
  "none",
  "stubble",
  "mustache",
  "beard",
  "handlebar",
  "chevron",
  "goatee",
  "van_dyke",
  "full_beard",
  "wizard_beard",
  "mutton_chops",
  "soul_patch",
]);
export type FacialHairStyle = z.infer<typeof FacialHairStyleSchema>;

export const OutfitStyleSchema = z.enum([
  "classic",
  "hoodie",
  "turtleneck",
  "suit",
  "trench_coat",
  "leather_jacket",
  "kimono",
  "toga",
  "sport_jersey",
  "sweater",
  "denim_jacket",
  "medieval_tunic",
]);
export type OutfitStyle = z.infer<typeof OutfitStyleSchema>;

export const PantsStyleSchema = z.enum([
  "trousers",
  "jeans",
  "shorts",
  "pleated_skirt",
  "pencil_skirt",
  "cargo",
]);
export type PantsStyle = z.infer<typeof PantsStyleSchema>;

export const GlassesStyleSchema = z.enum([
  "none",
  "classic",
  "round",
  "cat_eye",
  "sunglasses",
  "monocle",
  "eyepatch",
]);
export type GlassesStyle = z.infer<typeof GlassesStyleSchema>;

export const RigPartOverrideSchema = z.object({
  assetId: IdSchema,
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  scale: z.number().min(0.1).max(10).default(1),
  pivotX: z.number().min(0).max(1).default(0.5),
  pivotY: z.number().min(0).max(1).default(0.5),
  scaleMode: ScaleModeSchema.default("linear"),
});
export type RigPartOverride = z.infer<typeof RigPartOverrideSchema>;

export const ArmActionSchema = z.enum(["rest", "reach", "offer", "receive", "retract"]);
export type ArmAction = z.infer<typeof ArmActionSchema>;

export const ArmTrackSegmentSchema = z.object({
  action: ArmActionSchema,
  start: z.number().min(0),
  end: z.number().positive(),
  phaseStart: z.number().min(0).max(1).default(0),
  phaseEnd: z.number().min(0).max(1).default(1),
});
export type ArmTrackSegment = z.infer<typeof ArmTrackSegmentSchema>;

export const ReactionNodSchema = z.object({
  start: z.number().min(0),
  attack: z.number().positive().max(2).default(0.1),
  settle: z.number().positive().max(3).default(0.22),
  angleDeg: z.number().min(-20).max(20).default(4),
});
export type ReactionNod = z.infer<typeof ReactionNodSchema>;

export const ArmRigConstraintsSchema = z.object({
  /** Allowed upper-arm angle range in degrees relative to vertical-down (+Y). */
  upperAngleRangeDeg: z.tuple([z.number(), z.number()]).default([-165, 165]),
  /** Allowed elbow bend magnitude in degrees (prevents hyperextension/flips). */
  elbowBendRangeDeg: z.tuple([z.number().min(0), z.number().max(175)]).default([4, 152]),
  /** Fixed elbow pole direction (+1 or -1) to guarantee pole continuity without flips. */
  pole: z.union([z.literal(1), z.literal(-1)]).default(-1),
  /** Max allowed world/local IK offset from nominal pose before flagging unreachable. */
  maxIkOffset: z.number().positive().default(180),
  /** Max allowed joint displacement per frame as fraction of upper+lower arm length. */
  maxJointStepRatio: z.number().positive().max(1).default(0.32),
  /** Optional cuff/sleeve outlet offset relative to default shoulder socket. */
  cuffOutletOffset: z.object({ x: z.number().default(0), y: z.number().default(0) }).default({ x: 0, y: 0 }),
});
export type ArmRigConstraints = z.infer<typeof ArmRigConstraintsSchema>;

export const NeckAttachmentSchema = z.object({
  /** Vertical offset from shoulder line to rigid neck rotation pivot (px in rig space). */
  anchorOffsetY: z.number().default(-10),
  /** Maximum rigid head rotation angle in degrees (b6-puppet/1 default: ±20°). */
  maxAngleDeg: z.number().min(1).max(45).default(20),
  /** Maximum per-frame head rotation step in degrees (b6-puppet/1 default: 7°/frame). */
  maxDegPerFrame: z.number().min(1).max(25).default(7),
  /** Keep head at uniform scale without non-uniform squash/stretch distortion. */
  rigidScale: z.boolean().default(true),
});
export type NeckAttachment = z.infer<typeof NeckAttachmentSchema>;

export const CharacterRigProfileSchema = z.object({
  /** Arm rendering mode: 'segmented' (tapered 2-bone Storia sleeves) or 'continuous_ink' (single quadratic Bezier stroke with sag). */
  armRenderMode: z.enum(["segmented", "continuous_ink"]).default("segmented"),
  /** Quadratic curve sag in rig px when armRenderMode === 'continuous_ink' (bounded to 0..25% of arm reach). */
  inkSag: z.number().min(0).max(45).default(12),
  /** Rigid neck attachment & rotation safety limits. */
  neckAttachment: NeckAttachmentSchema.default({
    anchorOffsetY: -10,
    maxAngleDeg: 20,
    maxDegPerFrame: 7,
    rigidScale: true,
  }),
  /** Bounded 2-bone IK constraints for anatomical left (back) & right (front) arms. */
  leftArm: ArmRigConstraintsSchema.optional(),
  rightArm: ArmRigConstraintsSchema.optional(),
});
export type CharacterRigProfile = z.infer<typeof CharacterRigProfileSchema>;

export const ContactPropBindingSchema = z.object({
  assetId: IdSchema.optional(),
  label: z.string().max(64).optional(),
  widthNorm: z.number().min(0.04).max(1.2).default(0.16),
  state: z.enum(["owner", "shared", "release"]).default("owner"),
  holderArm: z.enum(["left", "right"]).default("right"),
  offsetX: z.number().default(0),
  offsetY: z.number().default(0),
  rotationDeg: z.number().default(0),
});
export type ContactPropBinding = z.infer<typeof ContactPropBindingSchema>;

export const CharacterWardrobeSchema = z.object({
  bodyShape: z.enum(["slim", "average", "athletic", "stocky", "curvy"]).default("average"),
  faceShape: FaceShapeSchema.default("soft"),
  eyeStyle: EyeStyleSchema.default("open"),
  outfitStyle: OutfitStyleSchema.default("classic"),
  pantsStyle: PantsStyleSchema.default("trousers"),
  dress: z.boolean().default(false),
  dressStyle: z.enum(["a_line", "pinafore", "wrap"]).default("a_line"),
  skirt: z.boolean().default(false),
  vestColor: HexColorSchema.optional(),
  tieColor: HexColorSchema.optional(),
  bowtie: z.boolean().default(false),
  scarfColor: HexColorSchema.optional(),
  apronColor: HexColorSchema.optional(),
  sashColor: HexColorSchema.optional(),
  capeColor: HexColorSchema.optional(),
  hatColor: HexColorSchema.optional(),
  shirtPattern: z.enum(["solid", "stripes", "pinstripe", "checks", "dots", "plaid", "colorblock"]).default("solid"),
  earrings: z.enum(["none", "stud", "hoop", "drop"]).default("none"),
  necklace: z.enum(["none", "chain", "pearls", "beaded"]).default("none"),
  hairBow: z.boolean().default(false),
  shoeStyle: z.enum(["classic", "boots", "flats", "heels", "sneakers", "oxford"]).default("classic"),
  eyeColor: HexColorSchema.optional(),
  /** Strength multiplier for deterministic Verlet hair/cape/scarf physics (0 = off, 1 = natural). */
  secondaryMotion: z.number().min(0).max(2).default(1),
  // Role-specific uniform & editorial details (ported & expanded from Storia character_wardrobe)
  badge: z.boolean().default(false),
  epaulettes: z.boolean().default(false),
  medals: z.boolean().default(false),
  crossBelt: z.boolean().default(false),
  stethoscope: z.boolean().default(false),
  labCoat: z.boolean().default(false),
  longcoat: z.boolean().default(false),
  overalls: z.boolean().default(false),
  suspenders: z.boolean().default(false),
  toolBelt: z.boolean().default(false),
  sailorCollar: z.boolean().default(false),
  reflectiveStripes: z.boolean().default(false),
  armorPlate: z.boolean().default(false),
  judgeRobe: z.boolean().default(false),
  pocketSquare: z.boolean().default(false),
  watchChain: z.boolean().default(false),
  tunic: z.boolean().default(false),
  feather: z.boolean().default(false),
  spaceSuit: z.boolean().default(false),
});
export type CharacterWardrobe = z.infer<typeof CharacterWardrobeSchema>;

export const CharacterDefinitionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  kind: z.enum(["procedural", "modular_sprites", "full_sprite"]).default("procedural"),
  age: CharacterAgeSchema.default("adult"),
  genderPresentation: z.enum(["neutral", "masculine", "feminine"]).default("neutral"),
  role: z.string().max(64).default("casual"),
  /** Overrides project animationStyle character look when not "auto". */
  renderStyle: CharacterRenderStyleSchema.default("auto"),
  palette: z.object({
    skin: HexColorSchema.default("#e6be9a"),
    hair: HexColorSchema.default("#1e1a1c"),
    shirt: HexColorSchema.default("#eceef2"),
    jacket: HexColorSchema.optional(),
    pants: HexColorSchema.default("#232833"),
    shoes: HexColorSchema.default("#141418"),
    accent: HexColorSchema.default("#f7c8d6"),
  }).default({
    skin: "#e6be9a",
    hair: "#1e1a1c",
    shirt: "#eceef2",
    pants: "#232833",
    shoes: "#141418",
    accent: "#f7c8d6",
  }),
  hairStyle: HairStyleSchema.default("short"),
  accessories: z.object({
    glasses: GlassesStyleSchema.default("none"),
    hat: HatStyleSchema.default("none"),
    facialHair: FacialHairStyleSchema.default("none"),
  }).default({ glasses: "none", hat: "none", facialHair: "none" }),
  wardrobe: CharacterWardrobeSchema.optional(),
  /** Bounded IK, continuous ink-path, and rigid neck-attachment rig contract (b6-puppet/1 inspired). */
  rigProfile: CharacterRigProfileSchema.optional(),
  /** Optional custom sprite attachments for modular (`modular_sprites`) or full-body rigs. */
  parts: z.object({
    fullBody: RigPartOverrideSchema.optional(),
    head: RigPartOverrideSchema.optional(),
    /** Expression-specific head SVG/PNG variants (e.g. happy, shock, angry, sad). */
    headVariants: z.record(z.string(), RigPartOverrideSchema).optional(),
    torso: RigPartOverrideSchema.optional(),
    leftArm: RigPartOverrideSchema.optional(),
    rightArm: RigPartOverrideSchema.optional(),
    leftHand: RigPartOverrideSchema.optional(),
    rightHand: RigPartOverrideSchema.optional(),
    leftLeg: RigPartOverrideSchema.optional(),
    rightLeg: RigPartOverrideSchema.optional(),
    leftFoot: RigPartOverrideSchema.optional(),
    rightFoot: RigPartOverrideSchema.optional(),
    hat: RigPartOverrideSchema.optional(),
    prop: RigPartOverrideSchema.optional(),
  }).default({}),
});
export type CharacterDefinition = z.infer<typeof CharacterDefinitionSchema>;

export const PoseCueSchema = z.object({
  t: z.number().min(0),
  pose: CharacterPoseSchema,
  blendDuration: z.number().min(0).max(3).default(0.35),
});

export const ExpressionCueSchema = z.object({
  t: z.number().min(0),
  expression: CharacterExpressionSchema,
  blendDuration: z.number().min(0).max(2).default(0.25),
});

export const BoneAngleOverrideSchema = z.object({
  head: z.number().optional(),
  torso: z.number().optional(),
  leftUpperArm: z.number().optional(),
  leftForearm: z.number().optional(),
  rightUpperArm: z.number().optional(),
  rightForearm: z.number().optional(),
  leftThigh: z.number().optional(),
  leftShin: z.number().optional(),
  rightThigh: z.number().optional(),
  rightShin: z.number().optional(),
});
export type BoneAngleOverride = z.infer<typeof BoneAngleOverrideSchema>;
