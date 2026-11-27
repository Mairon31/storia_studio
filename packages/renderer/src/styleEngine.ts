import type { AnimationStyleId } from "@storia/schema";

export type SpriteStyleTreatment =
  | "none"
  | "pixel"
  | "psx"
  | "stylized_3d"
  | "kurzgesagt"
  | "anime_cel"
  | "paper_cutout"
  | "handdrawn"
  | "retro_tv"
  | "vintage_1930s"
  | "noir_thriller";

export type ShapeStyleTreatment =
  | "clean"
  | "stylized_3d"
  | "kurzgesagt"
  | "anime_cel"
  | "pixel"
  | "psx"
  | "handdrawn"
  | "paper_cutout"
  | "neon_glow"
  | "comic_ink";

export type TextStyleTreatment =
  | "clean"
  | "extrude_3d"
  | "kurzgesagt"
  | "anime_cel"
  | "pixel_crisp"
  | "psx_retro"
  | "paper_sticker"
  | "retro_glow"
  | "comic_pop";

export interface StyleShaderProfile {
  pixelateOn?: number;
  virtualHeight?: number;
  colorLevels?: number;
  ditherStrength?: number;
  scanlines?: number;
  ntscBleed?: number;
  boilStrength?: number;
  paperStrength?: number;
  celContrast?: number;
  halationStrength?: number;
  halationTint?: [number, number, number];
  grainStrength?: number;
  sepiaStrength?: number;
  noirStrength?: number;
  neonStrength?: number;
  chromaPx?: number;
  vignetteStrength?: number;
}

export interface StyleRenderProfile {
  id: AnimationStyleId;
  /** Forces nearest-neighbor sampling on textures (sprites, backgrounds, PiP, character parts). */
  forceNearestSampling: boolean;
  /** Applies the GPU post-processing shader to the entire stage (including HUD text & subtitles). */
  applyPostFxToHudAndSubtitles: boolean;
  /** Optional virtual pixel grid step height for snapping transforms (0 = off). */
  pixelSnapVirtualHeight: number;
  /** Style-aware treatment applied to sprites, imported images, and procedural props. */
  spriteTreatment: SpriteStyleTreatment;
  /** Style-aware treatment applied to procedural shapes. */
  shapeTreatment: ShapeStyleTreatment;
  /** Style-aware treatment applied to text layers. */
  textTreatment: TextStyleTreatment;
  /** Style-level color & material accent for auto-harmonized outlines/shadows/rims. */
  inkColor: string;
  accentColor: string;
  paperBorderColor: string;
  /** GPU post-processing shader overrides merged automatically for this animation style. */
  shader: StyleShaderProfile;
}

const DEFAULT_PROFILE: StyleRenderProfile = {
  id: "storia_editorial",
  forceNearestSampling: false,
  applyPostFxToHudAndSubtitles: false,
  pixelSnapVirtualHeight: 0,
  spriteTreatment: "none",
  shapeTreatment: "clean",
  textTreatment: "clean",
  inkColor: "#0f1422",
  accentColor: "#ffd447",
  paperBorderColor: "#fffdf8",
  shader: {},
};

const STYLE_PROFILES: Partial<Record<AnimationStyleId, Partial<StyleRenderProfile>>> = {
  storia_editorial: {
    spriteTreatment: "none",
    shapeTreatment: "clean",
    textTreatment: "clean",
    inkColor: "#141622",
    accentColor: "#ffd447",
    shader: { celContrast: 0.08 },
  },

  c1_stylized_3d: {
    spriteTreatment: "stylized_3d",
    shapeTreatment: "stylized_3d",
    textTreatment: "extrude_3d",
    inkColor: "#0c1324",
    accentColor: "#38bdf8",
    shader: {
      celContrast: 0.22,
      halationStrength: 0.28,
      halationTint: [0.42, 0.78, 1.0],
      vignetteStrength: 0.22,
    },
  },

  c2_kurzgesagt: {
    spriteTreatment: "kurzgesagt",
    shapeTreatment: "kurzgesagt",
    textTreatment: "kurzgesagt",
    inkColor: "#080e28",
    accentColor: "#00e5ff",
    shader: {
      celContrast: 0.26,
      halationStrength: 0.32,
      halationTint: [0.15, 0.88, 1.0],
      vignetteStrength: 0.18,
    },
  },

  c3_anime_cel: {
    spriteTreatment: "anime_cel",
    shapeTreatment: "anime_cel",
    textTreatment: "anime_cel",
    inkColor: "#141a2e",
    accentColor: "#ff477e",
    shader: {
      celContrast: 0.3,
      halationStrength: 0.36,
      halationTint: [1.0, 0.72, 0.56],
      chromaPx: 0.9,
      vignetteStrength: 0.2,
    },
  },

  c4_retro_psx: {
    forceNearestSampling: true,
    applyPostFxToHudAndSubtitles: true,
    pixelSnapVirtualHeight: 240,
    spriteTreatment: "psx",
    shapeTreatment: "psx",
    textTreatment: "psx_retro",
    inkColor: "#060814",
    accentColor: "#22d3ee",
    shader: {
      pixelateOn: 1,
      virtualHeight: 240,
      colorLevels: 31,
      ditherStrength: 0.68,
      scanlines: 0.24,
      ntscBleed: 0.26,
      chromaPx: 1.4,
      vignetteStrength: 0.34,
    },
  },

  c5_paper_cutout: {
    applyPostFxToHudAndSubtitles: true,
    spriteTreatment: "paper_cutout",
    shapeTreatment: "paper_cutout",
    textTreatment: "paper_sticker",
    inkColor: "#221c16",
    accentColor: "#e05a47",
    paperBorderColor: "#fbf7ef",
    shader: {
      paperStrength: 0.32,
      boilStrength: 0.18,
      grainStrength: 0.08,
      vignetteStrength: 0.18,
    },
  },

  b7_pixel_theater: {
    forceNearestSampling: true,
    applyPostFxToHudAndSubtitles: true,
    pixelSnapVirtualHeight: 270,
    spriteTreatment: "pixel",
    shapeTreatment: "pixel",
    textTreatment: "pixel_crisp",
    inkColor: "#0b0e1c",
    accentColor: "#ffd447",
    shader: {
      pixelateOn: 1,
      virtualHeight: 270,
      colorLevels: 20,
      ditherStrength: 0.28,
      scanlines: 0.06,
      vignetteStrength: 0.24,
    },
  },

  b3_retro_tv: {
    applyPostFxToHudAndSubtitles: true,
    spriteTreatment: "retro_tv",
    shapeTreatment: "neon_glow",
    textTreatment: "retro_glow",
    inkColor: "#080b14",
    accentColor: "#60a5fa",
    shader: {
      scanlines: 0.32,
      ntscBleed: 0.22,
      chromaPx: 1.8,
      halationStrength: 0.36,
      halationTint: [0.42, 0.68, 1.0],
      vignetteStrength: 0.42,
    },
  },

  b1_minimal_handdrawn: {
    applyPostFxToHudAndSubtitles: true,
    spriteTreatment: "handdrawn",
    shapeTreatment: "handdrawn",
    textTreatment: "clean",
    inkColor: "#181a1f",
    accentColor: "#e11d48",
    shader: {
      paperStrength: 0.22,
      boilStrength: 0.28,
      vignetteStrength: 0,
    },
  },

  b2_colorful_handdrawn: {
    applyPostFxToHudAndSubtitles: true,
    spriteTreatment: "handdrawn",
    shapeTreatment: "handdrawn",
    textTreatment: "clean",
    inkColor: "#24201c",
    accentColor: "#d97757",
    shader: {
      paperStrength: 0.28,
      boilStrength: 0.24,
      vignetteStrength: 0.08,
    },
  },

  b5_avatar_explainer: {
    spriteTreatment: "handdrawn",
    shapeTreatment: "handdrawn",
    textTreatment: "comic_pop",
    inkColor: "#19191f",
    accentColor: "#dc2626",
    shader: {
      paperStrength: 0.16,
      boilStrength: 0.14,
      vignetteStrength: 0.06,
    },
  },

  b6_dynamic_meme: {
    spriteTreatment: "handdrawn",
    shapeTreatment: "comic_ink",
    textTreatment: "comic_pop",
    inkColor: "#111116",
    accentColor: "#f97316",
    shader: {
      celContrast: 0.18,
      boilStrength: 0.15,
    },
  },

  a7_rubber_hose: {
    applyPostFxToHudAndSubtitles: true,
    spriteTreatment: "vintage_1930s",
    shapeTreatment: "handdrawn",
    textTreatment: "comic_pop",
    inkColor: "#1b1a18",
    accentColor: "#b84a39",
    shader: {
      paperStrength: 0.26,
      sepiaStrength: 0.24,
      grainStrength: 0.16,
      boilStrength: 0.34,
      vignetteStrength: 0.38,
    },
  },

  a8_ghibli: {
    spriteTreatment: "none",
    shapeTreatment: "clean",
    textTreatment: "clean",
    inkColor: "#1e2e3d",
    accentColor: "#f6c968",
    shader: {
      paperStrength: 0.14,
      halationStrength: 0.44,
      halationTint: [1.0, 0.84, 0.56],
      celContrast: 0.14,
      vignetteStrength: 0.2,
    },
  },

  a6_amber_noir: {
    spriteTreatment: "noir_thriller",
    shapeTreatment: "clean",
    textTreatment: "clean",
    inkColor: "#0c0a0e",
    accentColor: "#f59e0b",
    shader: {
      halationStrength: 0.46,
      halationTint: [1.0, 0.62, 0.18],
      grainStrength: 0.15,
      vignetteStrength: 0.5,
      celContrast: 0.2,
    },
  },

  b4_survival_thriller: {
    spriteTreatment: "noir_thriller",
    shapeTreatment: "comic_ink",
    textTreatment: "extrude_3d",
    inkColor: "#090b10",
    accentColor: "#ef4444",
    shader: {
      noirStrength: 0.35,
      grainStrength: 0.18,
      chromaPx: 1.5,
      vignetteStrength: 0.52,
      celContrast: 0.24,
    },
  },

  a2_modern_pop: {
    spriteTreatment: "kurzgesagt",
    shapeTreatment: "neon_glow",
    textTreatment: "kurzgesagt",
    inkColor: "#141824",
    accentColor: "#06b6d4",
    shader: {
      celContrast: 0.15,
      vignetteStrength: 0,
    },
  },

  a1_classic_dark: {
    spriteTreatment: "none",
    shapeTreatment: "neon_glow",
    textTreatment: "clean",
    inkColor: "#ffffff",
    accentColor: "#38bdf8",
    shader: {
      halationStrength: 0.18,
      halationTint: [0.35, 0.78, 1.0],
      vignetteStrength: 0.12,
    },
  },

  a1_classic_light: {
    spriteTreatment: "handdrawn",
    shapeTreatment: "handdrawn",
    textTreatment: "clean",
    inkColor: "#111111",
    accentColor: "#ef4444",
    shader: {
      vignetteStrength: 0,
    },
  },

  a3_prehistoric: {
    spriteTreatment: "handdrawn",
    shapeTreatment: "handdrawn",
    textTreatment: "comic_pop",
    inkColor: "#1c1008",
    accentColor: "#ff7a2e",
    shader: {
      paperStrength: 0.2,
      halationStrength: 0.42,
      halationTint: [1.0, 0.52, 0.2],
      grainStrength: 0.14,
      vignetteStrength: 0.42,
    },
  },

  a4_cozy: {
    spriteTreatment: "none",
    shapeTreatment: "clean",
    textTreatment: "clean",
    inkColor: "#241b2b",
    accentColor: "#f4a261",
    shader: {
      halationStrength: 0.34,
      halationTint: [1.0, 0.74, 0.5],
      grainStrength: 0.08,
      vignetteStrength: 0.24,
    },
  },

  a5_historical: {
    spriteTreatment: "none",
    shapeTreatment: "comic_ink",
    textTreatment: "clean",
    inkColor: "#18141c",
    accentColor: "#e0b64e",
    shader: {
      paperStrength: 0.14,
      sepiaStrength: 0.12,
      celContrast: 0.16,
      grainStrength: 0.1,
      vignetteStrength: 0.3,
    },
  },

  b8_greek_mythology: {
    spriteTreatment: "anime_cel",
    shapeTreatment: "comic_ink",
    textTreatment: "extrude_3d",
    inkColor: "#2a180d",
    accentColor: "#e5b84b",
    shader: {
      paperStrength: 0.18,
      celContrast: 0.24,
      halationStrength: 0.34,
      halationTint: [1.0, 0.78, 0.34],
      vignetteStrength: 0.32,
    },
  },
};

export function getStyleRenderProfile(styleId?: AnimationStyleId): StyleRenderProfile {
  const id = styleId ?? "storia_editorial";
  const override = STYLE_PROFILES[id];
  if (!override) return { ...DEFAULT_PROFILE, id };
  return {
    ...DEFAULT_PROFILE,
    ...override,
    id,
    shader: {
      ...DEFAULT_PROFILE.shader,
      ...(override.shader ?? {}),
    },
  };
}
