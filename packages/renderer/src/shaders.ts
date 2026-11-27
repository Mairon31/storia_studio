import { Filter, GlProgram, UniformGroup } from "pixi.js";
import type { PostProcessing } from "@storia/schema";
import { clamp, hexToRgbNorm } from "./color.js";
import type { StyleShaderProfile } from "./styleEngine.js";
import type { EvaluatedEffectClip } from "./types.js";

// IMPORTANT: Declare `precision highp float;` in BOTH vertex and fragment shaders so
// shared uniforms (`uInputSize`, `uOutputFrame`) always match precision in WebGL2.
const DEFAULT_FILTER_VERT = `
precision highp float;

in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const POSTFX_FRAG = `
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;

uniform float uTime;
uniform float uFrame;
uniform float uPixelateOn;
uniform float uVirtualHeight;
uniform float uColorLevels;
uniform float uDitherStrength;
uniform float uScanlines;
uniform float uNtscBleed;
uniform float uHalationStrength;
uniform float uHalationThreshold;
uniform vec3  uHalationTint;
uniform float uChromaPx;
uniform float uGrainStrength;
uniform float uVignetteStrength;
uniform float uVignetteSoftness;
uniform float uNoirStrength;
uniform float uSepiaStrength;
uniform float uNeonStrength;
uniform float uGlitchStrength;
uniform float uBlurPx;
uniform float uFlashStrength;
uniform vec3  uFlashColor;
uniform float uBoilStrength;
uniform float uLetterbox;
uniform float uPaperStrength;
uniform float uCelContrast;

float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

// 4x4 Bayer ordered dithering matrix (classic PSX / pixel-art hardware look)
float bayer4(vec2 px) {
    int x = int(mod(floor(px.x), 4.0));
    int y = int(mod(floor(px.y), 4.0));
    int idx = y * 4 + x;
    if (idx == 0)  return 0.0  / 16.0;
    if (idx == 1)  return 8.0  / 16.0;
    if (idx == 2)  return 2.0  / 16.0;
    if (idx == 3)  return 10.0 / 16.0;
    if (idx == 4)  return 12.0 / 16.0;
    if (idx == 5)  return 4.0  / 16.0;
    if (idx == 6)  return 14.0 / 16.0;
    if (idx == 7)  return 6.0  / 16.0;
    if (idx == 8)  return 3.0  / 16.0;
    if (idx == 9)  return 11.0 / 16.0;
    if (idx == 10) return 1.0  / 16.0;
    if (idx == 11) return 9.0  / 16.0;
    if (idx == 12) return 15.0 / 16.0;
    if (idx == 13) return 7.0  / 16.0;
    if (idx == 14) return 13.0 / 16.0;
    return 5.0 / 16.0;
}

void main(void) {
    vec2 outPx = max(uOutputFrame.zw, vec2(1.0));
    vec2 uvMax = max(uOutputFrame.zw * uInputSize.zw, vec2(0.0001));
    vec2 normUv = clamp(vTextureCoord / uvMax, 0.0, 1.0);

    // 0. Hand-drawn animation boil effect (stepped UV micro-wobble)
    if (uBoilStrength > 0.005) {
        float stepT = floor(uTime * 12.0);
        vec2 wobble = vec2(
            sin(normUv.y * 42.0 + stepT * 3.1),
            cos(normUv.x * 38.0 + stepT * 2.7)
        ) * uBoilStrength * 0.0022;
        normUv = clamp(normUv + wobble, 0.0, 1.0);
    }

    // 0b. VHS / Glitch horizontal slice displacement
    if (uGlitchStrength > 0.01) {
        float sliceY = floor(normUv.y * 28.0);
        float rnd = hash12(vec2(sliceY, floor(uTime * 18.0)));
        if (rnd > 0.72) {
            float shift = (rnd - 0.85) * 0.14 * uGlitchStrength;
            normUv.x = fract(normUv.x + shift);
        }
    }

    vec2 sampleNorm = normUv;
    vec2 pixelGridPx = normUv * outPx;

    // 1. Optional PSX / Pixel-Art virtual resolution grid snap (crisp nearest blocks)
    if (uPixelateOn > 0.5 && uVirtualHeight > 16.0) {
        float aspect = outPx.x / outPx.y;
        vec2 grid = vec2(max(16.0, floor(uVirtualHeight * aspect + 0.5)), uVirtualHeight);
        pixelGridPx = floor(normUv * grid);
        sampleNorm = (pixelGridPx + 0.5) / grid;
    }

    vec2 uv = sampleNorm * uvMax;
    vec4 col = texture(uTexture, uv);

    // 1b. Optional Dreamy Blur
    if (uBlurPx > 0.25) {
        vec2 off = uInputSize.zw * uBlurPx;
        vec4 b = col * 0.24;
        b += texture(uTexture, clamp(uv + vec2( off.x,  0.0), vec2(0.0), uvMax)) * 0.12;
        b += texture(uTexture, clamp(uv + vec2(-off.x,  0.0), vec2(0.0), uvMax)) * 0.12;
        b += texture(uTexture, clamp(uv + vec2( 0.0,  off.y), vec2(0.0), uvMax)) * 0.12;
        b += texture(uTexture, clamp(uv + vec2( 0.0, -off.y), vec2(0.0), uvMax)) * 0.12;
        b += texture(uTexture, clamp(uv + vec2( off.x,  off.y) * 0.75, vec2(0.0), uvMax)) * 0.07;
        b += texture(uTexture, clamp(uv + vec2(-off.x,  off.y) * 0.75, vec2(0.0), uvMax)) * 0.07;
        b += texture(uTexture, clamp(uv + vec2( off.x, -off.y) * 0.75, vec2(0.0), uvMax)) * 0.07;
        b += texture(uTexture, clamp(uv + vec2(-off.x, -off.y) * 0.75, vec2(0.0), uvMax)) * 0.07;
        col = b;
    }

    // 2. Chromatic aberration + NTSC horizontal chroma bleed + Glitch RGB split
    float totalShiftPx = uChromaPx + uNtscBleed * 2.5 + uGlitchStrength * 9.0;
    if (totalShiftPx > 0.05) {
        vec2 shiftUv = vec2(totalShiftPx * uInputSize.z, 0.0);
        float rS = texture(uTexture, clamp(uv + shiftUv, vec2(0.0), uvMax)).r;
        float bS = texture(uTexture, clamp(uv - shiftUv, vec2(0.0), uvMax)).b;
        float mixAmt = clamp(uChromaPx / 8.0 + uNtscBleed * 0.45 + uGlitchStrength * 0.55, 0.0, 0.9);
        col.r = mix(col.r, rS, mixAmt);
        col.b = mix(col.b, bS, mixAmt);
    }

    // 3. Soft warm Halation bloom around bright highlights
    if (uHalationStrength > 0.01) {
        vec2 texel = uInputSize.zw * 5.0;
        vec3 acc = vec3(0.0);
        acc += texture(uTexture, clamp(uv + vec2( texel.x,  0.0), vec2(0.0), uvMax)).rgb;
        acc += texture(uTexture, clamp(uv + vec2(-texel.x,  0.0), vec2(0.0), uvMax)).rgb;
        acc += texture(uTexture, clamp(uv + vec2( 0.0,  texel.y), vec2(0.0), uvMax)).rgb;
        acc += texture(uTexture, clamp(uv + vec2( 0.0, -texel.y), vec2(0.0), uvMax)).rgb;
        acc += texture(uTexture, clamp(uv + vec2( texel.x,  texel.y) * 1.4, vec2(0.0), uvMax)).rgb;
        acc += texture(uTexture, clamp(uv + vec2(-texel.x, -texel.y) * 1.4, vec2(0.0), uvMax)).rgb;
        acc /= 6.0;
        float lum = dot(acc, vec3(0.299, 0.587, 0.114));
        float hi = max(0.0, lum - uHalationThreshold) / max(0.05, 1.0 - uHalationThreshold);
        col.rgb += acc * uHalationTint * hi * uHalationStrength * 0.85;
    }

    // 4. Aesthetic Color Grades (Noir / Sepia / Cyberpunk Neon)
    if (uNoirStrength > 0.01) {
        float g = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        vec3 noir = vec3(clamp((g - 0.5) * 1.24 + 0.5, 0.0, 1.0));
        col.rgb = mix(col.rgb, noir, clamp(uNoirStrength, 0.0, 1.0));
    }
    if (uSepiaStrength > 0.01) {
        vec3 sep = vec3(
            dot(col.rgb, vec3(0.393, 0.769, 0.189)),
            dot(col.rgb, vec3(0.349, 0.686, 0.168)),
            dot(col.rgb, vec3(0.272, 0.534, 0.131))
        );
        col.rgb = mix(col.rgb, clamp(sep, 0.0, 1.0), clamp(uSepiaStrength, 0.0, 1.0));
    }
    if (uNeonStrength > 0.01) {
        vec3 cBoost = clamp((col.rgb - 0.45) * (1.0 + uNeonStrength * 0.55) + 0.45, 0.0, 1.0);
        cBoost.r += uNeonStrength * 0.08 * cBoost.r;
        cBoost.b += uNeonStrength * 0.14 * (1.0 - cBoost.g * 0.4);
        col.rgb = mix(col.rgb, clamp(cBoost, 0.0, 1.0), clamp(uNeonStrength, 0.0, 1.0));
    }

    // 4b. Stylized cel-shading contrast & vibrance boost (3D Clay / Kurzgesagt / Anime Cel)
    if (uCelContrast > 0.005) {
        float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
        vec3 sat = mix(vec3(lum), col.rgb, 1.0 + uCelContrast * 0.45);
        vec3 ctr = clamp((sat - 0.5) * (1.0 + uCelContrast * 0.34) + 0.5, 0.0, 1.0);
        col.rgb = mix(col.rgb, ctr, clamp(uCelContrast * 1.4, 0.0, 0.85));
    }

    // 5. Ordered Bayer dithering & color quantization (PSX 15-bit / Pixel Art palette feel)
    if (uColorLevels > 1.5 && uColorLevels < 250.0) {
        float b = bayer4(pixelGridPx) - 0.5;
        vec3 dithered = col.rgb + (b / uColorLevels) * uDitherStrength;
        col.rgb = floor(clamp(dithered, 0.0, 1.0) * uColorLevels + 0.5) / uColorLevels;
    }

    // 6. Subtle CRT scanlines (PSX / CRT mode)
    if (uScanlines > 0.005) {
        float sl = 0.5 + 0.5 * sin(normUv.y * max(uVirtualHeight, 240.0) * 3.14159265);
        col.rgb *= 1.0 - uScanlines * 0.34 * (1.0 - sl);
    }

    // 7. Animated stepped film/paper grain + tactile craft-paper fiber weave
    if (uGrainStrength > 0.005) {
        float n = hash12(floor(normUv * outPx * 0.5) + vec2(uFrame * 17.3, uFrame * 9.7)) - 0.5;
        col.rgb += n * uGrainStrength * 0.45;
    }
    if (uPaperStrength > 0.005) {
        vec2 pPx = floor(normUv * outPx * 0.5);
        float fiberA = hash12(pPx * vec2(1.0, 0.35)) - 0.5;
        float fiberB = hash12(pPx * vec2(0.35, 1.0) + vec2(19.1, 7.3)) - 0.5;
        float weave = (fiberA + fiberB) * 0.5;
        col.rgb += vec3(weave * 0.14, weave * 0.125, weave * 0.105) * uPaperStrength;
    }

    // 8. Impact Flash overlay
    if (uFlashStrength > 0.005) {
        col.rgb = mix(col.rgb, uFlashColor, clamp(uFlashStrength, 0.0, 0.95));
    }

    // 9. Cinematic vignette
    if (uVignetteStrength > 0.005) {
        vec2 d = (normUv - 0.5);
        float dist = length(d) * 1.41421356;
        float vig = smoothstep(1.0 - uVignetteSoftness * 0.65, 1.05, dist);
        col.rgb *= 1.0 - vig * clamp(uVignetteStrength, 0.0, 1.0);
    }

    // 10. Optional cinematic Letterbox bars
    if (uLetterbox > 0.005) {
        float barH = uLetterbox * 0.12;
        if (normUv.y < barH || normUv.y > 1.0 - barH) {
            col.rgb = vec3(0.02, 0.02, 0.03);
        }
    }

    finalColor = vec4(clamp(col.rgb, 0.0, 1.0), col.a);
}
`;

export interface PostFxShaderUniforms {
  pixelateOn: number;
  virtualHeight: number;
  colorLevels: number;
  ditherStrength: number;
  scanlines: number;
  ntscBleed: number;
  halationStrength: number;
  halationThreshold: number;
  halationTint: [number, number, number];
  chromaPx: number;
  grainStrength: number;
  vignetteStrength: number;
  vignetteSoftness: number;
  noirStrength: number;
  sepiaStrength: number;
  neonStrength: number;
  glitchStrength: number;
  blurPx: number;
  flashStrength: number;
  flashColor: [number, number, number];
  boilStrength: number;
  letterbox: number;
  paperStrength: number;
  celContrast: number;
}

export interface ShaderPresetPlugin {
  id: string;
  label: string;
  description: string;
  apply: (pp: PostProcessing) => Partial<PostFxShaderUniforms>;
}

/**
 * Modular shader plugin registry (OpenCut/OpenReel-inspired):
 * easy to extend with new retro/editorial looks without touching the core renderer.
 */
export const SHADER_PRESET_PLUGINS: Record<string, ShaderPresetPlugin> = {
  clean: {
    id: "clean",
    label: "Clean 2D",
    description: "Sharp vector/2D mastering with optional vignette & halation.",
    apply: () => ({ pixelateOn: 0, colorLevels: 255, scanlines: 0, ntscBleed: 0, noirStrength: 0 }),
  },
  psx: {
    id: "psx",
    label: "PSX 1998",
    description: "240p virtual grid, 5-bit Bayer dithering, NTSC chroma bleed & subtle scanlines.",
    apply: (pp) => ({
      pixelateOn: 1,
      virtualHeight: pp.psx.internalHeight || 240,
      colorLevels: Math.pow(2, Math.max(3, Math.min(8, pp.psx.colorBits || 5))) - 1,
      ditherStrength: pp.psx.ditherStrength,
      scanlines: pp.psx.scanlines,
      ntscBleed: pp.psx.ntscBleed,
    }),
  },
  pixel_art: {
    id: "pixel_art",
    label: "Pixel Art",
    description: "Crisp nearest-neighbor virtual pixel grid with controlled color quantization.",
    apply: (pp) => ({
      pixelateOn: 1,
      virtualHeight: pp.pixelArt.pixelHeight || 270,
      colorLevels: Math.max(6, Math.min(64, Math.round(Math.cbrt(pp.pixelArt.paletteSize || 32) * 3))),
      ditherStrength: 0.25,
      scanlines: 0,
      ntscBleed: 0,
    }),
  },
  cinematic: {
    id: "cinematic",
    label: "Cinematic Film",
    description: "Warm highlight halation, fine grain, subtle chromatic aberration & vignette.",
    apply: () => ({
      pixelateOn: 0,
      halationStrength: 0.42,
      halationThreshold: 0.68,
      grainStrength: 0.11,
      vignetteStrength: 0.34,
      chromaPx: 1.4,
    }),
  },
  noir: {
    id: "noir",
    label: "Noir Graphic",
    description: "High-contrast monochrome film grain and strong vignette.",
    apply: () => ({
      pixelateOn: 0,
      noirStrength: 0.92,
      grainStrength: 0.16,
      vignetteStrength: 0.48,
    }),
  },
};

export function resolvePostFxUniforms(
  pp: PostProcessing,
  chromaticBurst = 0,
  activeEffects: readonly EvaluatedEffectClip[] = [],
  extra?: {
    pixelateProgress?: number;
    glitchProgress?: number;
    blurPx?: number;
    flash?: number;
    flashColor?: string;
    styleShader?: StyleShaderProfile;
  },
): PostFxShaderUniforms {
  const base: PostFxShaderUniforms = {
    pixelateOn: 0,
    virtualHeight: 240,
    colorLevels: 255,
    ditherStrength: 0,
    scanlines: 0,
    ntscBleed: 0,
    halationStrength: pp.halation.enabled ? pp.halation.strength : 0,
    halationThreshold: pp.halation.threshold,
    halationTint: hexToRgbNorm(pp.halation.tint, [1, 0.5, 0.35]),
    chromaPx:
      (pp.chromaticAberration.enabled ? pp.chromaticAberration.strength * pp.chromaticAberration.maxPixels : 0) +
      chromaticBurst * 9,
    grainStrength: pp.filmGrain.enabled ? pp.filmGrain.strength : 0,
    vignetteStrength: pp.vignette.enabled ? pp.vignette.strength : 0,
    vignetteSoftness: pp.vignette.softness,
    noirStrength: 0,
    sepiaStrength: 0,
    neonStrength: 0,
    glitchStrength: extra?.glitchProgress ?? 0,
    blurPx: extra?.blurPx ?? 0,
    flashStrength: extra?.flash ?? 0,
    flashColor: hexToRgbNorm(extra?.flashColor, [1, 1, 1]),
    boilStrength: 0,
    letterbox: 0,
    paperStrength: 0,
    celContrast: 0,
  };

  const plugin = SHADER_PRESET_PLUGINS[pp.preset];
  if (plugin) {
    Object.assign(base, plugin.apply(pp));
  }

  // Merge Animation Style shader profile so every style transforms the entire rendered frame
  const st = extra?.styleShader;
  if (st) {
    if (st.pixelateOn && st.pixelateOn > 0.5) {
      base.pixelateOn = 1;
      if (st.virtualHeight) base.virtualHeight = st.virtualHeight;
    }
    if (st.colorLevels !== undefined) base.colorLevels = Math.min(base.colorLevels, st.colorLevels);
    if (st.ditherStrength !== undefined) base.ditherStrength = Math.max(base.ditherStrength, st.ditherStrength);
    if (st.scanlines !== undefined) base.scanlines = Math.max(base.scanlines, st.scanlines);
    if (st.ntscBleed !== undefined) base.ntscBleed = Math.max(base.ntscBleed, st.ntscBleed);
    if (st.boilStrength !== undefined) base.boilStrength = Math.max(base.boilStrength, st.boilStrength);
    if (st.paperStrength !== undefined) base.paperStrength = Math.max(base.paperStrength, st.paperStrength);
    if (st.celContrast !== undefined) base.celContrast = Math.max(base.celContrast, st.celContrast);
    if (st.halationStrength !== undefined) {
      base.halationStrength = Math.max(base.halationStrength, st.halationStrength);
      if (st.halationTint && !pp.halation.enabled) {
        base.halationTint = st.halationTint;
      }
    }
    if (st.grainStrength !== undefined) base.grainStrength = Math.max(base.grainStrength, st.grainStrength);
    if (st.sepiaStrength !== undefined) base.sepiaStrength = Math.max(base.sepiaStrength, st.sepiaStrength);
    if (st.noirStrength !== undefined) base.noirStrength = Math.max(base.noirStrength, st.noirStrength);
    if (st.neonStrength !== undefined) base.neonStrength = Math.max(base.neonStrength, st.neonStrength);
    if (st.chromaPx !== undefined) base.chromaPx = Math.max(base.chromaPx, st.chromaPx);
    if (st.vignetteStrength !== undefined && !pp.vignette.enabled) {
      base.vignetteStrength = st.vignetteStrength;
    }
  }

  if (pp.psx.enabled) {
    base.pixelateOn = 1;
    base.virtualHeight = pp.psx.internalHeight;
    base.colorLevels = Math.pow(2, pp.psx.colorBits) - 1;
    base.ditherStrength = pp.psx.ditherStrength;
    base.scanlines = pp.psx.scanlines;
    base.ntscBleed = pp.psx.ntscBleed;
  } else if (pp.pixelArt.enabled) {
    base.pixelateOn = 1;
    base.virtualHeight = pp.pixelArt.pixelHeight;
    base.colorLevels = Math.max(6, Math.min(64, Math.round(Math.cbrt(pp.pixelArt.paletteSize) * 3)));
    base.ditherStrength = 0.22;
  }

  // Layer timed CapCut-style video/retro effect clips on top
  for (const eff of activeEffects) {
    const w = eff.weight;
    if (w <= 0.005) continue;
    switch (eff.clip.effectType) {
      case "psx":
        base.pixelateOn = 1;
        base.virtualHeight = Math.max(120, Math.round(280 - w * 50));
        base.colorLevels = Math.min(base.colorLevels, 31);
        base.ditherStrength = Math.max(base.ditherStrength, 0.65 * w);
        base.scanlines = Math.max(base.scanlines, 0.22 * w);
        base.ntscBleed = Math.max(base.ntscBleed, 0.28 * w);
        break;
      case "pixel_art":
        base.pixelateOn = 1;
        base.virtualHeight = Math.max(96, Math.round(320 - w * 110));
        base.colorLevels = Math.min(base.colorLevels, 24);
        base.ditherStrength = Math.max(base.ditherStrength, 0.25 * w);
        break;
      case "vhs_glitch":
        base.glitchStrength = Math.max(base.glitchStrength, clamp(w * 0.9, 0, 1.5));
        base.scanlines = Math.max(base.scanlines, 0.35 * w);
        base.ntscBleed = Math.max(base.ntscBleed, 0.45 * w);
        break;
      case "rgb_split":
        base.chromaPx += 9 * w;
        break;
      case "halation":
        base.halationStrength = Math.max(base.halationStrength, 0.55 * w);
        base.halationTint = hexToRgbNorm(eff.clip.color, base.halationTint);
        break;
      case "film_grain":
        base.grainStrength = Math.max(base.grainStrength, 0.22 * w);
        break;
      case "noir":
        base.noirStrength = Math.max(base.noirStrength, clamp(w, 0, 1));
        base.vignetteStrength = Math.max(base.vignetteStrength, 0.42 * w);
        break;
      case "sepia":
        base.sepiaStrength = Math.max(base.sepiaStrength, clamp(w, 0, 1));
        break;
      case "cyberpunk_neon":
        base.neonStrength = Math.max(base.neonStrength, clamp(w, 0, 1.2));
        base.chromaPx += 3 * w;
        break;
      case "dream_blur":
        base.blurPx = Math.max(base.blurPx, 7 * w);
        base.halationStrength = Math.max(base.halationStrength, 0.32 * w);
        break;
      case "boil":
        base.boilStrength = Math.max(base.boilStrength, w);
        break;
      case "vignette_pulse": {
        const pulse = 0.5 + 0.5 * Math.sin(eff.localTime * eff.clip.speed * Math.PI * 2);
        base.vignetteStrength = Math.max(base.vignetteStrength, clamp((0.35 + 0.4 * pulse) * w, 0, 0.95));
        break;
      }
      case "flash_impact": {
        const decay = Math.pow(1 - eff.progress, 2);
        base.flashStrength = Math.max(base.flashStrength, clamp(decay * w * 0.85, 0, 0.92));
        base.flashColor = hexToRgbNorm(eff.clip.color, [1, 1, 1]);
        break;
      }
      case "letterbox":
        base.letterbox = Math.max(base.letterbox, clamp(w, 0, 1));
        break;
      case "crt_scanlines":
        base.scanlines = Math.max(base.scanlines, clamp(0.45 * w, 0, 1));
        base.ntscBleed = Math.max(base.ntscBleed, 0.2 * w);
        break;
      case "vintage_8mm":
        base.sepiaStrength = Math.max(base.sepiaStrength, clamp(0.55 * w, 0, 1));
        base.grainStrength = Math.max(base.grainStrength, 0.28 * w);
        base.vignetteStrength = Math.max(base.vignetteStrength, 0.48 * w);
        base.boilStrength = Math.max(base.boilStrength, 0.35 * w);
        break;
      case "thermal_vision":
        base.neonStrength = Math.max(base.neonStrength, clamp(1.35 * w, 0, 1.5));
        base.halationStrength = Math.max(base.halationStrength, 0.6 * w);
        base.halationTint = hexToRgbNorm(eff.clip.color || "#ff3b1f", [1, 0.25, 0.12]);
        break;
      case "comic_halftone":
        base.colorLevels = Math.min(base.colorLevels, 14);
        base.ditherStrength = Math.max(base.ditherStrength, 0.72 * w);
        base.vignetteStrength = Math.max(base.vignetteStrength, 0.25 * w);
        break;
      case "golden_hour":
        base.halationStrength = Math.max(base.halationStrength, 0.65 * w);
        base.halationTint = [1.0, 0.72, 0.34];
        base.sepiaStrength = Math.max(base.sepiaStrength, 0.28 * w);
        break;
      case "cold_cinema":
        base.halationStrength = Math.max(base.halationStrength, 0.4 * w);
        base.halationTint = [0.35, 0.72, 1.0];
        base.vignetteStrength = Math.max(base.vignetteStrength, 0.38 * w);
        base.grainStrength = Math.max(base.grainStrength, 0.1 * w);
        break;
      case "prism_refract":
        base.chromaPx += 13 * w;
        base.halationStrength = Math.max(base.halationStrength, 0.45 * w);
        break;
      case "strobe_flash": {
        const strobe = Math.sin(eff.localTime * eff.clip.speed * Math.PI * 12) > 0.45 ? 1 : 0;
        base.flashStrength = Math.max(base.flashStrength, clamp(strobe * 0.72 * w, 0, 0.85));
        base.flashColor = hexToRgbNorm(eff.clip.color, [1, 1, 1]);
        break;
      }
    }
  }

  // Pixelate transition override
  if (extra?.pixelateProgress && extra.pixelateProgress > 0.02) {
    base.pixelateOn = 1;
    base.virtualHeight = Math.max(24, Math.round(280 - extra.pixelateProgress * 245));
  }

  return base;
}

export class StoriaPostFxFilter extends Filter {
  private readonly fxUniforms: UniformGroup;

  constructor() {
    const fxUniforms = new UniformGroup({
      uTime: { value: 0, type: "f32" },
      uFrame: { value: 0, type: "f32" },
      uPixelateOn: { value: 0, type: "f32" },
      uVirtualHeight: { value: 240, type: "f32" },
      uColorLevels: { value: 255, type: "f32" },
      uDitherStrength: { value: 0, type: "f32" },
      uScanlines: { value: 0, type: "f32" },
      uNtscBleed: { value: 0, type: "f32" },
      uHalationStrength: { value: 0, type: "f32" },
      uHalationThreshold: { value: 0.72, type: "f32" },
      uHalationTint: { value: new Float32Array([1, 0.5, 0.35]), type: "vec3<f32>" },
      uChromaPx: { value: 0, type: "f32" },
      uGrainStrength: { value: 0, type: "f32" },
      uVignetteStrength: { value: 0.25, type: "f32" },
      uVignetteSoftness: { value: 0.65, type: "f32" },
      uNoirStrength: { value: 0, type: "f32" },
      uSepiaStrength: { value: 0, type: "f32" },
      uNeonStrength: { value: 0, type: "f32" },
      uGlitchStrength: { value: 0, type: "f32" },
      uBlurPx: { value: 0, type: "f32" },
      uFlashStrength: { value: 0, type: "f32" },
      uFlashColor: { value: new Float32Array([1, 1, 1]), type: "vec3<f32>" },
      uBoilStrength: { value: 0, type: "f32" },
      uLetterbox: { value: 0, type: "f32" },
      uPaperStrength: { value: 0, type: "f32" },
      uCelContrast: { value: 0, type: "f32" },
    });

    const glProgram = GlProgram.from({
      vertex: DEFAULT_FILTER_VERT,
      fragment: POSTFX_FRAG,
      name: "storia-postfx-filter",
    });

    super({
      glProgram,
      resources: {
        fxUniforms,
      },
    });
    this.fxUniforms = fxUniforms;
  }

  updateFromConfig(
    pp: PostProcessing,
    timeSec: number,
    frameIndex: number,
    chromaticBurst = 0,
    activeEffects: readonly EvaluatedEffectClip[] = [],
    extra?: {
      pixelateProgress?: number;
      glitchProgress?: number;
      blurPx?: number;
      flash?: number;
      flashColor?: string;
      styleShader?: StyleShaderProfile;
    },
  ): boolean {
    const resolved = resolvePostFxUniforms(pp, chromaticBurst, activeEffects, extra);
    const u = this.fxUniforms.uniforms;
    const step = Math.max(1, pp.filmGrain.stepFrames || 2);
    u.uTime = timeSec;
    u.uFrame = Math.floor(frameIndex / step);
    u.uPixelateOn = resolved.pixelateOn;
    u.uVirtualHeight = resolved.virtualHeight;
    u.uColorLevels = resolved.colorLevels;
    u.uDitherStrength = resolved.ditherStrength;
    u.uScanlines = resolved.scanlines;
    u.uNtscBleed = resolved.ntscBleed;
    u.uHalationStrength = resolved.halationStrength;
    u.uHalationThreshold = resolved.halationThreshold;
    const tintArr = u.uHalationTint as Float32Array;
    tintArr[0] = resolved.halationTint[0];
    tintArr[1] = resolved.halationTint[1];
    tintArr[2] = resolved.halationTint[2];
    u.uChromaPx = resolved.chromaPx;
    u.uGrainStrength = resolved.grainStrength;
    u.uVignetteStrength = resolved.vignetteStrength;
    u.uVignetteSoftness = resolved.vignetteSoftness;
    u.uNoirStrength = resolved.noirStrength;
    u.uSepiaStrength = resolved.sepiaStrength;
    u.uNeonStrength = resolved.neonStrength;
    u.uGlitchStrength = resolved.glitchStrength;
    u.uBlurPx = resolved.blurPx;
    u.uFlashStrength = resolved.flashStrength;
    const flashArr = u.uFlashColor as Float32Array;
    flashArr[0] = resolved.flashColor[0];
    flashArr[1] = resolved.flashColor[1];
    flashArr[2] = resolved.flashColor[2];
    u.uBoilStrength = resolved.boilStrength;
    u.uLetterbox = resolved.letterbox;
    u.uPaperStrength = resolved.paperStrength;
    u.uCelContrast = resolved.celContrast;

    return (
      resolved.pixelateOn > 0.5 ||
      (resolved.colorLevels > 1.5 && resolved.colorLevels < 250) ||
      resolved.scanlines > 0.005 ||
      resolved.ntscBleed > 0.005 ||
      resolved.halationStrength > 0.01 ||
      resolved.chromaPx > 0.05 ||
      resolved.grainStrength > 0.005 ||
      resolved.vignetteStrength > 0.005 ||
      resolved.noirStrength > 0.01 ||
      resolved.sepiaStrength > 0.01 ||
      resolved.neonStrength > 0.01 ||
      resolved.glitchStrength > 0.01 ||
      resolved.blurPx > 0.25 ||
      resolved.flashStrength > 0.005 ||
      resolved.boilStrength > 0.005 ||
      resolved.letterbox > 0.005 ||
      resolved.paperStrength > 0.005 ||
      resolved.celContrast > 0.005
    );
  }
}
