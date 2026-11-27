import { BlurFilter, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { KeywordFx, SubtitleStyle, SubtitleTrack, SubtitleWord } from "@storia/schema";
import { evaluateEasing, noise2D, seededRandom } from "@storia/schema";
import { clamp, hexToNumber } from "./color.js";
import type { EvaluatedSubtitleState } from "./types.js";

function drawSparkleStar(g: Graphics, cx: number, cy: number, r: number, color: number, alpha: number): void {
  const ir = r * 0.28;
  g.moveTo(cx, cy - r);
  g.lineTo(cx + ir, cy - ir);
  g.lineTo(cx + r, cy);
  g.lineTo(cx + ir, cy + ir);
  g.lineTo(cx, cy + r);
  g.lineTo(cx - ir, cy + ir);
  g.lineTo(cx - r, cy);
  g.lineTo(cx - ir, cy - ir);
  g.closePath();
  g.fill({ color, alpha });
}

function drawOverlayContainer(
  row: Container,
  style: SubtitleStyle,
  totalW: number,
  maxH: number,
  scaleRef: number,
  enterProgress: number,
  globalTimeSec: number,
): void {
  const padX = style.backgroundBox.paddingX * scaleRef;
  const padY = style.backgroundBox.paddingY * scaleRef;
  const rad = style.backgroundBox.borderRadius * scaleRef;
  const x = -totalW * 0.5 - padX;
  const y = -maxH * 0.5 - padY;
  const bw = totalW + padX * 2;
  const bh = maxH + padY * 2;

  const overlay = style.overlayStyle ?? "none";

  if (overlay === "glass_card") {
    const g = new Graphics();
    g.roundRect(x, y, bw, bh, Math.max(14 * scaleRef, rad)).fill({
      color: hexToNumber(style.backgroundBox.color, 0x0f172a),
      alpha: 0.68,
    });
    // Top specular highlight edge (Apple/Liquid Glass feel)
    g.roundRect(x, y, bw, bh, Math.max(14 * scaleRef, rad)).stroke({
      color: 0xffffff,
      width: 2 * scaleRef,
      alpha: 0.28,
    });
    g.roundRect(x + 6 * scaleRef, y + 2 * scaleRef, Math.max(10, bw - 12 * scaleRef), Math.max(4, bh * 0.28), 10 * scaleRef).fill({
      color: 0xffffff,
      alpha: 0.08,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "solid_pill") {
    const g = new Graphics();
    const pillRad = bh * 0.5;
    g.roundRect(x, y, bw, bh, pillRad).fill({
      color: hexToNumber(style.backgroundBox.color, 0x101222),
      alpha: Math.max(0.75, style.backgroundBox.opacity),
    });
    g.roundRect(x, y, bw, bh, pillRad).stroke({
      color: hexToNumber(style.activeWordColor, 0x7c3aed),
      width: 2.5 * scaleRef,
      alpha: 0.55,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "comic_box") {
    const g = new Graphics();
    const offset = 8 * scaleRef;
    // Hard comic offset shadow
    g.roundRect(x + offset, y + offset, bw, bh, 10 * scaleRef).fill({ color: 0x090910, alpha: 0.96 });
    // Paper fill
    g.roundRect(x, y, bw, bh, 10 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0xfffdf0),
      alpha: 1,
    });
    // Thick ink border
    g.roundRect(x, y, bw, bh, 10 * scaleRef).stroke({ color: 0x090910, width: 5 * scaleRef });
    row.addChild(g);
    return;
  }

  if (overlay === "neon_frame") {
    const pulse = 0.78 + 0.22 * Math.sin(globalTimeSec * 7.5);
    const neonCol = hexToNumber(style.glowColor || style.activeWordColor, 0x00f5ff);
    const g = new Graphics();
    g.roundRect(x, y, bw, bh, 14 * scaleRef).fill({ color: 0x050914, alpha: 0.76 });
    // Outer soft bloom stroke + crisp inner neon stroke
    g.roundRect(x - 3 * scaleRef, y - 3 * scaleRef, bw + 6 * scaleRef, bh + 6 * scaleRef, 16 * scaleRef).stroke({
      color: neonCol,
      width: 9 * scaleRef,
      alpha: 0.24 * pulse,
    });
    g.roundRect(x, y, bw, bh, 14 * scaleRef).stroke({
      color: neonCol,
      width: 3 * scaleRef,
      alpha: 0.92 * pulse,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "gradient_ribbon") {
    const g = new Graphics();
    const baseCol = hexToNumber(style.backgroundBox.color, 0x191229);
    const goldCol = hexToNumber(style.activeWordColor, 0xffd166);
    g.roundRect(x, y, bw, bh, 14 * scaleRef).fill({ color: baseCol, alpha: 0.86 });
    // Subtle top/bottom luxury gold shimmer rules
    const sweep = clamp(evaluateEasing(enterProgress, "easeOutCubic"), 0, 1);
    const ruleW = bw * 0.88 * sweep;
    g.rect(-ruleW * 0.5, y + 2 * scaleRef, ruleW, 2.5 * scaleRef).fill({ color: goldCol, alpha: 0.85 });
    g.rect(-ruleW * 0.5, y + bh - 4.5 * scaleRef, ruleW, 2.5 * scaleRef).fill({ color: goldCol, alpha: 0.85 });
    row.addChild(g);
    return;
  }

  if (overlay === "tape_highlight") {
    const g = new Graphics();
    const skew = 7 * scaleRef;
    // Slight irregular hand-torn paper tape polygon
    g.poly([
      x + skew, y,
      x + bw, y - 2 * scaleRef,
      x + bw - skew, y + bh,
      x, y + bh + 2 * scaleRef,
    ]).fill({ color: hexToNumber(style.backgroundBox.color, 0xfff7e2), alpha: 0.96 });
    g.poly([
      x + skew, y,
      x + bw, y - 2 * scaleRef,
      x + bw - skew, y + bh,
      x, y + bh + 2 * scaleRef,
    ]).stroke({ color: 0x151821, width: 2.5 * scaleRef, alpha: 0.85 });
    row.addChild(g);
    return;
  }

  if (overlay === "editorial_bar") {
    const g = new Graphics();
    g.roundRect(x, y, bw, bh, 6 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x090b10),
      alpha: 0.78,
    });
    // Left vertical accent bar
    g.roundRect(x, y, 6 * scaleRef, bh, 3 * scaleRef).fill({
      color: hexToNumber(style.activeWordColor, 0xf3c969),
      alpha: 0.95,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "highlighter_block") {
    const g = new Graphics();
    const sweep = clamp(evaluateEasing(enterProgress, "easeOutCubic"), 0.08, 1);
    const curW = bw * sweep;
    g.roundRect(x, y + 2 * scaleRef, curW, bh - 4 * scaleRef, 8 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0xfef08a),
      alpha: 0.96,
    });
    g.roundRect(x, y + bh - 6 * scaleRef, curW, 4 * scaleRef, 2 * scaleRef).fill({
      color: hexToNumber(style.activeWordColor, 0xeab308),
      alpha: 0.65,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "brush_stroke") {
    const g = new Graphics();
    const skew = 14 * scaleRef;
    const col = hexToNumber(style.backgroundBox.color, 0x140812);
    const accent = hexToNumber(style.activeWordColor, 0xff2e63);
    g.poly([
      x + skew, y - 3 * scaleRef,
      x + bw + 6 * scaleRef, y + 2 * scaleRef,
      x + bw - skew, y + bh + 3 * scaleRef,
      x - 6 * scaleRef, y + bh - 2 * scaleRef,
    ]).fill({ color: col, alpha: 0.9 });
    g.poly([
      x + skew * 0.5, y + bh - 5 * scaleRef,
      x + bw - skew * 0.5, y + bh - 2 * scaleRef,
      x + bw - skew, y + bh + 4 * scaleRef,
      x, y + bh + 1 * scaleRef,
    ]).fill({ color: accent, alpha: 0.92 });
    row.addChild(g);
    return;
  }

  if (overlay === "retro_terminal") {
    const g = new Graphics();
    const termCol = hexToNumber(style.activeWordColor, 0x39ff14);
    g.roundRect(x, y, bw, bh, 6 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x041108),
      alpha: 0.92,
    });
    g.roundRect(x, y, bw, bh, 6 * scaleRef).stroke({
      color: termCol,
      width: 2.5 * scaleRef,
      alpha: 0.85,
    });
    // Subtle retro scanlines inside terminal box
    for (let sy = y + 6 * scaleRef; sy < y + bh - 4 * scaleRef; sy += 7 * scaleRef) {
      g.rect(x + 3 * scaleRef, sy, bw - 6 * scaleRef, 1.5 * scaleRef).fill({
        color: termCol,
        alpha: 0.1,
      });
    }
    row.addChild(g);
    return;
  }

  if (overlay === "cinema_blur_bar") {
    const g = new Graphics();
    g.roundRect(x - 10 * scaleRef, y, bw + 20 * scaleRef, bh, 10 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x05060a),
      alpha: 0.64,
    });
    g.roundRect(x - 10 * scaleRef, y, bw + 20 * scaleRef, bh, 10 * scaleRef).stroke({
      color: 0xffffff,
      width: 1.5 * scaleRef,
      alpha: 0.14,
    });
    row.addChild(g);
    return;
  }

  if (overlay === "retro_window") {
    const g = new Graphics();
    const titleH = 14 * scaleRef;
    const wy = y - titleH;
    const wh = bh + titleH;
    g.rect(x + 4 * scaleRef, wy + 4 * scaleRef, bw, wh).fill({ color: 0x000000, alpha: 0.55 });
    g.rect(x, wy, bw, wh).fill({ color: hexToNumber(style.backgroundBox.color, 0xd4d0c8), alpha: 1 });
    g.rect(x, wy, bw, wh).stroke({ color: 0x1f2937, width: 2.5 * scaleRef });
    g.rect(x + 2 * scaleRef, wy + 2 * scaleRef, Math.max(8, bw - 4 * scaleRef), titleH - 2 * scaleRef).fill({
      color: hexToNumber(style.activeWordColor, 0x1d4ed8),
      alpha: 1,
    });
    const btnSz = Math.max(6, titleH - 6 * scaleRef);
    g.rect(x + bw - btnSz - 4 * scaleRef, wy + 4 * scaleRef, btnSz, btnSz).fill({ color: 0xe5e7eb, alpha: 1 });
    row.addChild(g);
    return;
  }

  if (overlay === "cyber_bracket") {
    const g = new Graphics();
    const col = hexToNumber(style.glowColor || style.activeWordColor, 0x00f5ff);
    const arm = Math.min(24 * scaleRef, bw * 0.16);
    g.roundRect(x, y, bw, bh, 6 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x050d18),
      alpha: 0.78,
    });
    g.moveTo(x + arm, y).lineTo(x, y).lineTo(x, y + bh).lineTo(x + arm, y + bh)
      .stroke({ color: col, width: 3.5 * scaleRef, alpha: 0.95 });
    g.moveTo(x + bw - arm, y).lineTo(x + bw, y).lineTo(x + bw, y + bh).lineTo(x + bw - arm, y + bh)
      .stroke({ color: col, width: 3.5 * scaleRef, alpha: 0.95 });
    row.addChild(g);
    return;
  }

  if (overlay === "torn_paper") {
    const g = new Graphics();
    const col = hexToNumber(style.backgroundBox.color, 0xfaf6ec);
    const teeth = 10;
    const pts: number[] = [];
    for (let i = 0; i <= teeth; i++) {
      pts.push(x + (bw * i) / teeth, y + (i % 2 === 0 ? -2 : 2.5) * scaleRef);
    }
    for (let i = teeth; i >= 0; i--) {
      pts.push(x + (bw * i) / teeth, y + bh + (i % 2 === 0 ? 2.5 : -2) * scaleRef);
    }
    g.poly(pts).fill({ color: col, alpha: 0.97 });
    g.poly(pts).stroke({ color: 0x1a1c24, width: 2 * scaleRef, alpha: 0.35 });
    row.addChild(g);
    return;
  }

  if (overlay === "news_ticker") {
    const g = new Graphics();
    const accentCol = hexToNumber(style.activeWordColor, 0xef4444);
    g.roundRect(x, y, bw, bh, 5 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x111827),
      alpha: 0.92,
    });
    // Left live red badge bar + bottom accent rule
    g.roundRect(x, y, 10 * scaleRef, bh, 3 * scaleRef).fill({ color: accentCol, alpha: 1 });
    g.rect(x, y + bh - 3.5 * scaleRef, bw, 3.5 * scaleRef).fill({ color: accentCol, alpha: 0.92 });
    row.addChild(g);
    return;
  }

  if (overlay === "cinema_letterbox") {
    const g = new Graphics();
    const padWide = 28 * scaleRef;
    g.rect(x - padWide, y, bw + padWide * 2, bh).fill({
      color: hexToNumber(style.backgroundBox.color, 0x050608),
      alpha: 0.84,
    });
    g.rect(x - padWide, y, bw + padWide * 2, 1.5 * scaleRef).fill({ color: 0xffffff, alpha: 0.16 });
    g.rect(x - padWide, y + bh - 1.5 * scaleRef, bw + padWide * 2, 1.5 * scaleRef).fill({ color: 0xffffff, alpha: 0.16 });
    row.addChild(g);
    return;
  }

  if (overlay === "polaroid_strip") {
    const g = new Graphics();
    const extraBottom = 10 * scaleRef;
    g.roundRect(x + 4 * scaleRef, y + 6 * scaleRef, bw, bh + extraBottom, 4 * scaleRef).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(x, y, bw, bh + extraBottom, 4 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0xfffdf8),
      alpha: 0.98,
    });
    g.roundRect(x, y, bw, bh + extraBottom, 4 * scaleRef).stroke({ color: 0xd6d3cd, width: 2 * scaleRef });
    row.addChild(g);
    return;
  }

  if (overlay === "gradient_glass") {
    const g = new Graphics();
    const accentCol = hexToNumber(style.activeWordColor, 0xfb7185);
    g.roundRect(x, y, bw, bh, 18 * scaleRef).fill({
      color: hexToNumber(style.backgroundBox.color, 0x16192b),
      alpha: 0.78,
    });
    g.roundRect(x + 3 * scaleRef, y + 3 * scaleRef, Math.max(8, bw - 6 * scaleRef), bh * 0.45, 14 * scaleRef).fill({
      color: accentCol,
      alpha: 0.16,
    });
    g.roundRect(x, y, bw, bh, 18 * scaleRef).stroke({ color: accentCol, width: 2 * scaleRef, alpha: 0.55 });
    row.addChild(g);
    return;
  }

  if (overlay === "comic_burst_box") {
    const g = new Graphics();
    const accentCol = hexToNumber(style.activeWordColor, 0xffe600);
    const spikes = 16;
    const cx = x + bw * 0.5;
    const cy = y + bh * 0.5;
    const rx = bw * 0.58;
    const ry = bh * 0.68;
    const pts: number[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const ang = (i / (spikes * 2)) * Math.PI * 2;
      const mult = i % 2 === 0 ? 1.08 : 0.88;
      pts.push(cx + Math.cos(ang) * rx * mult, cy + Math.sin(ang) * ry * mult);
    }
    g.poly(pts).fill({ color: hexToNumber(style.backgroundBox.color, 0x14091f), alpha: 0.9 });
    g.poly(pts).stroke({ color: accentCol, width: 3.5 * scaleRef, alpha: 0.95 });
    row.addChild(g);
    return;
  }

  if (style.backgroundBox.enabled) {
    const bg = new Graphics();
    bg.roundRect(x, y, bw, bh, rad).fill({
      color: hexToNumber(style.backgroundBox.color, 0x0c101b),
      alpha: style.backgroundBox.opacity,
    });
    row.addChild(bg);
  }
}

/**
 * Recursively disposes transient per-frame PixiJS v8 display objects created by renderSubtitles
 * (frees GPU Canvas textures generated by Text nodes, Graphics contexts, and BlurFilters).
 */
export function disposeSubtitleChildren(container: Container): void {
  const children = container.removeChildren();
  for (const child of children) {
    if (child.filters) {
      for (const f of Array.isArray(child.filters) ? child.filters : [child.filters]) {
        try {
          f?.destroy?.();
        } catch {
          // Ignore already-destroyed filter
        }
      }
      child.filters = null;
    }
    if (child instanceof Text) {
      child.destroy({ children: true, texture: true, textureSource: true });
    } else if (child instanceof Graphics) {
      child.destroy({ children: true, context: true });
    } else {
      disposeSubtitleChildren(child);
      child.destroy({ children: false, texture: false, textureSource: false });
    }
  }
}

/**
 * Renders CapCut-grade word-level subtitles onto a dedicated screen-space PixiJS Container.
 * Supports individual cue style overrides, global styles, 8 container overlays, 14 entrance/exit
 * animations, 3D extrusion, neon bloom, 13 active word effects, 9 keyword FX, and VFX in/out.
 * 100% deterministic across 60 FPS WebGL2 preview, capture_frame, and parallel FFmpeg export.
 */
export function renderSubtitles(
  container: Container,
  track: SubtitleTrack,
  state: EvaluatedSubtitleState | null,
  canvasW: number,
  canvasH: number,
  options?: { lowMemoryMode?: boolean },
): void {
  disposeSubtitleChildren(container);
  if (!state || !track.enabled || state.windowWords.length === 0) return;

  const style: SubtitleStyle = {
    ...track.style,
    ...(state.cue.styleOverride ?? {}),
    shadow: {
      ...track.style.shadow,
      ...(state.cue.styleOverride?.shadow ?? {}),
    },
    backgroundBox: {
      ...track.style.backgroundBox,
      ...(state.cue.styleOverride?.backgroundBox ?? {}),
    },
  };

  const shortSide = Math.min(canvasW, canvasH);
  const scaleRef = shortSide / 1080;
  const fontSize = Math.max(12, Math.round(style.fontSize * scaleRef));
  const strokeWidth = Math.max(0, style.strokeWidth * scaleRef);
  const pos = state.cue.positionOverride ?? style.position;
  const t = state.globalTimeSec;
  const ep = state.enterProgress;
  const xp = state.exitProgress;

  const row = new Container();
  let rowAlpha = state.fadeAlpha;
  let offsetX = 0;
  let offsetY = 0;
  let enterScaleX = 1;
  let enterScaleY = 1;
  let extraRotDeg = style.tiltDeg ?? 0;
  let rowBlurPx = 0;

  // 1. Entrance animation (24 CapCut-grade motions powered by Remotion spring math)
  switch (style.animationIn) {
    case "slide_up":
      offsetY = (1 - evaluateEasing(ep, "springSmooth")) * 34 * scaleRef;
      break;
    case "slide_down":
      offsetY = -(1 - evaluateEasing(ep, "springSmooth")) * 34 * scaleRef;
      break;
    case "slide_left":
      offsetX = (1 - evaluateEasing(ep, "springSmooth")) * 56 * scaleRef;
      break;
    case "slide_right":
      offsetX = -(1 - evaluateEasing(ep, "springSmooth")) * 56 * scaleRef;
      break;
    case "spring_drop":
    case "elastic_drop": {
      const k = evaluateEasing(ep, "springBouncy");
      offsetY = -(1 - k) * 68 * scaleRef;
      enterScaleY = 0.85 + 0.15 * k;
      break;
    }
    case "elastic_stretch":
    case "squeeze": {
      const k = evaluateEasing(ep, "springBouncy");
      enterScaleX = 1.45 - 0.45 * k;
      enterScaleY = 0.62 + 0.38 * k;
      break;
    }
    case "flip_x": {
      const k = evaluateEasing(ep, "springSmooth");
      enterScaleY = Math.max(0.06, k);
      break;
    }
    case "flip_y": {
      const k = evaluateEasing(ep, "springSmooth");
      enterScaleX = Math.max(0.06, k);
      break;
    }
    case "rotate_in":
    case "spin_pop": {
      const k = evaluateEasing(ep, "springSnappy");
      enterScaleX = 0.45 + 0.55 * k;
      enterScaleY = enterScaleX;
      extraRotDeg += (1 - k) * -26;
      break;
    }
    case "swing": {
      const k = evaluateEasing(ep, "springBouncy");
      extraRotDeg += (1 - k) * 18;
      offsetY = -(1 - k) * 16 * scaleRef;
      break;
    }
    case "unfold": {
      const k = evaluateEasing(ep, "easeOutCubic");
      enterScaleX = Math.max(0.08, k);
      enterScaleY = 0.85 + 0.15 * k;
      break;
    }
    case "float_in":
    case "rise_fade": {
      const k = evaluateEasing(ep, "easeOutCubic");
      offsetY = (1 - k) * 20 * scaleRef + (style.animationIn === "float_in" ? Math.sin(t * 3.2) * 3 * scaleRef : 0);
      enterScaleX = 0.94 + 0.06 * k;
      enterScaleY = 0.94 + 0.06 * k;
      break;
    }
    case "pop": {
      const k = evaluateEasing(ep, "springSnappy");
      enterScaleX = 0.72 + 0.28 * k;
      enterScaleY = enterScaleX;
      break;
    }
    case "slam": {
      const k = evaluateEasing(ep, "springBouncy");
      enterScaleX = 1.65 - 0.65 * k;
      enterScaleY = enterScaleX;
      if (ep < 0.45) {
        offsetX += noise2D("sub-slam", t * 40, 1) * 8 * scaleRef * (1 - ep / 0.45);
        offsetY += noise2D("sub-slam", t * 40, 5) * 8 * scaleRef * (1 - ep / 0.45);
      }
      break;
    }
    case "bounce": {
      const k = evaluateEasing(ep, "springBouncy");
      enterScaleX = 0.55 + 0.45 * k;
      enterScaleY = enterScaleX;
      offsetY = (1 - k) * 28 * scaleRef;
      break;
    }
    case "zoom_punch": {
      const k = evaluateEasing(ep, "springSnappy");
      enterScaleX = 0.35 + 0.65 * k;
      enterScaleY = enterScaleX;
      break;
    }
    case "stamp": {
      const k = evaluateEasing(ep, "easeOutCubic");
      enterScaleX = 2.1 - 1.1 * k;
      enterScaleY = enterScaleX;
      extraRotDeg += (1 - k) * -10;
      break;
    }
    case "blur_in": {
      const k = evaluateEasing(ep, "easeOutCubic");
      rowBlurPx = Math.max(rowBlurPx, (1 - k) * 9 * scaleRef);
      enterScaleX = 0.92 + 0.08 * k;
      enterScaleY = enterScaleX;
      break;
    }
    case "glitch": {
      if (ep < 0.85) {
        const gAmp = (1 - ep / 0.85) * 18 * scaleRef;
        offsetX += noise2D("sub-glitch-in", Math.floor(t * 28), 1.7) * gAmp;
        offsetY += noise2D("sub-glitch-in", Math.floor(t * 28), 4.3) * gAmp * 0.35;
      }
      break;
    }
    case "neon_flicker": {
      if (ep < 0.9) {
        const flick = seededRandom(`nf-${Math.floor(t * 26)}`);
        rowAlpha *= flick > 0.28 ? 1 : 0.2;
      }
      break;
    }
    case "skew_snap": {
      const k = evaluateEasing(ep, "springSnappy");
      offsetX = (1 - k) * -44 * scaleRef;
      extraRotDeg += (1 - k) * -9;
      enterScaleX = 1.25 - 0.25 * k;
      break;
    }
    case "spiral_in": {
      const k = evaluateEasing(ep, "springSnappy");
      enterScaleX = 0.2 + 0.8 * k;
      enterScaleY = enterScaleX;
      extraRotDeg += (1 - k) * -360;
      break;
    }
    case "curtain_reveal": {
      const k = evaluateEasing(ep, "easeOutCubic");
      enterScaleX = Math.max(0.05, k);
      break;
    }
    case "rubber_band": {
      const osc = Math.sin(ep * Math.PI * 2.5) * (1 - ep) * 0.38;
      enterScaleX = 1 + osc;
      enterScaleY = Math.max(0.45, 1 - osc);
      break;
    }
    case "heartbeat_in": {
      const pulse = Math.sin(ep * Math.PI * 3) * (1 - ep) * 0.26;
      const k = evaluateEasing(ep, "easeOutCubic");
      enterScaleX = 0.75 + 0.25 * k + Math.abs(pulse);
      enterScaleY = enterScaleX;
      break;
    }
    case "whip_in": {
      const k = evaluateEasing(ep, "springSmooth");
      offsetX = (1 - k) * 95 * scaleRef;
      rowBlurPx = Math.max(rowBlurPx, (1 - k) * 6 * scaleRef);
      break;
    }
    case "slide_fade": {
      const k = evaluateEasing(ep, "easeOutCubic");
      offsetY = (1 - k) * 22 * scaleRef;
      rowAlpha *= k;
      break;
    }
    case "wave":
    case "karaoke_wipe":
    case "kinetic_split":
    case "typewriter":
    case "fade":
    case "none":
      break;
  }

  // 2. Exit animation & VFX Out
  if (xp < 1) {
    const outK = 1 - evaluateEasing(xp, "easeOutCubic");
    if (style.animationOut === "slide_up") offsetY -= outK * 24 * scaleRef;
    else if (style.animationOut === "slide_down" || style.vfxOut === "drop") offsetY += outK * 36 * scaleRef;
    else if (style.animationOut === "slide_left" || style.animationOut === "whip_in" || style.vfxOut === "whip_out") {
      offsetX -= outK * 75 * scaleRef;
      rowBlurPx = Math.max(rowBlurPx, outK * 5 * scaleRef);
    } else if (style.animationOut === "slide_right") offsetX += outK * 56 * scaleRef;
    else if (style.animationOut === "slide_fade" || style.vfxOut === "slide_fade") {
      offsetY += outK * 24 * scaleRef;
      rowAlpha *= 1 - outK * 0.8;
    } else if (style.animationOut === "flip_x") enterScaleY *= Math.max(0.08, 1 - outK);
    else if (style.animationOut === "flip_y") enterScaleX *= Math.max(0.08, 1 - outK);
    else if (style.animationOut === "glitch" || style.vfxOut === "glitch_out" || style.vfxOut === "shatter" || style.vfxOut === "slice_split") {
      offsetX += noise2D("sub-glitch-out", Math.floor(t * 32), 2.1) * outK * 26 * scaleRef;
      if (style.vfxOut === "shatter") {
        extraRotDeg += outK * 14;
        enterScaleX *= 1 + outK * 0.25;
      }
    } else if (style.vfxOut === "shrink_spin") {
      const z = Math.max(0.12, 1 - outK * 0.85);
      enterScaleX *= z;
      enterScaleY *= z;
      extraRotDeg += outK * 140;
    } else if (style.vfxOut === "neon_off") {
      const flick = seededRandom(`noff-${Math.floor(t * 28)}`);
      rowAlpha *= flick > outK ? 1 : 0.1;
    } else if (style.vfxOut === "vaporize") {
      offsetY -= outK * 28 * scaleRef;
      rowBlurPx = Math.max(rowBlurPx, outK * 10 * scaleRef);
      enterScaleX *= 1 + outK * 0.18;
    }
    if (style.vfxOut === "zoom_out" || style.animationOut === "zoom_punch") {
      const z = Math.max(0.4, 1 - outK * 0.45);
      enterScaleX *= z;
      enterScaleY *= z;
    }
    if (style.vfxOut === "fade_blur" || style.vfxOut === "pixel_out") rowBlurPx = Math.max(rowBlurPx, outK * 8 * scaleRef);
  }

  // 3. VFX In (zoom_blur, pixel_dissolve, smoke_puff)
  if (ep < 0.75 && (style.vfxIn === "zoom_blur" || style.vfxIn === "smoke_puff" || style.vfxIn === "pixel_dissolve")) {
    rowBlurPx = Math.max(rowBlurPx, (1 - ep / 0.75) * 8 * scaleRef);
  }

  row.alpha = clamp(rowAlpha, 0, 1);

  interface BuiltWord {
    word: SubtitleWord;
    wordIdx: number;
    rawLabel: string;
    isActive: boolean;
    isKeyword: boolean;
    fillHex: string;
    effectiveKwFx: KeywordFx;
    wordScale: number;
    textStyle: TextStyle;
    text: Text;
    width: number;
    height: number;
  }

  const builtWords: BuiltWord[] = [];

  // Typewriter reveals words progressively across cue
  const visibleCount =
    style.animationIn === "typewriter"
      ? Math.max(1, Math.ceil(state.windowWords.length * clamp(state.enterProgress * 1.4, 0.1, 1)))
      : state.windowWords.length;

  for (let i = 0; i < state.windowWords.length; i++) {
    const w = state.windowWords[i]!;
    const isActive = w.id === state.activeWordId;
    const isKeyword = w.emphasis !== "normal" || Boolean(w.styleOverride?.fx && w.styleOverride.fx !== "none");
    const effectiveKwFx: KeywordFx = w.styleOverride?.fx ?? (isKeyword ? style.keywordFx : "none");
    const rawLabel = style.uppercase ? w.text.toUpperCase() : w.text;

    let fillHex = style.color;
    const rainbowPalette = ["#ff4ecd", "#ffd447", "#38ef7d", "#00f5ff", "#a78bfa", "#ff6b6b"];
    if (w.styleOverride?.color) {
      fillHex = w.styleOverride.color;
    } else if (isActive && (style.activeWordEffect === "rainbow_wave" || style.activeWordEffect === "rainbow_shift")) {
      const idxR = Math.floor(t * 10 + i) % rainbowPalette.length;
      fillHex = rainbowPalette[idxR]!;
    } else if (isActive && (style.activeWordEffect === "pill_solid" || style.activeWordEffect === "gradient_pill")) {
      // On solid colored pill, keep crisp white text for maximum CapCut legibility
      fillHex = "#ffffff";
    } else if (isActive && style.activeWordEffect !== "none") {
      if (w.emphasis === "alert") fillHex = style.alertWordColor;
      else if (w.emphasis === "accent") fillHex = style.accentWordColor;
      else fillHex = style.activeWordColor;
    } else if (w.emphasis === "alert") {
      fillHex = style.alertWordColor;
    } else if (w.emphasis === "accent") {
      fillHex = style.accentWordColor;
    } else if (w.emphasis === "highlight") {
      fillHex = style.activeWordColor;
    }

    // Dynamic per-word scale for active word & keyword FX
    let activeScale = 1.0;
    if (isActive) {
      const wp = state.activeWordProgress;
      const springPop = evaluateEasing(clamp(wp * 2.4, 0, 1), "springBouncy");
      if (
        style.activeWordEffect === "pop" ||
        style.activeWordEffect === "extrude_3d" ||
        style.activeWordEffect === "fire_badge" ||
        style.activeWordEffect === "comic_burst" ||
        style.activeWordEffect === "outline_flash"
      ) {
        activeScale = 1.0 + 0.18 * springPop;
      } else if (style.activeWordEffect === "zoom_glow") {
        activeScale = 1.0 + 0.22 * springPop;
      } else if (style.activeWordEffect === "rainbow_wave" || style.activeWordEffect === "rainbow_shift") {
        activeScale = 1.1 + 0.12 * Math.sin(t * 14 + i);
      } else if (style.activeWordEffect === "glow" || style.activeWordEffect === "neon" || style.activeWordEffect === "laser_underline") {
        activeScale = 1.12;
      } else if (style.activeWordEffect === "bounce" || style.activeWordEffect === "wave_lift") {
        activeScale = 1.08 + Math.sin(wp * Math.PI) * 0.12;
      } else if (style.activeWordEffect === "pill_solid" || style.activeWordEffect === "gradient_pill") {
        activeScale = 1.06;
      }
    }
    if (isKeyword && (effectiveKwFx === "scale_pop" || effectiveKwFx === "tilt_punch" || effectiveKwFx === "comic_star")) {
      activeScale *= 1.12;
    }

    const wordScale = (w.styleOverride?.scale ?? 1) * activeScale;
    const hasGlow =
      (style.glowIntensity ?? 0) > 0.05 ||
      Boolean(w.styleOverride?.glow) ||
      (isActive && (style.activeWordEffect === "glow" || style.activeWordEffect === "neon" || style.activeWordEffect === "zoom_glow" || style.activeWordEffect === "rainbow_wave" || style.activeWordEffect === "rainbow_shift" || style.activeWordEffect === "outline_flash" || style.activeWordEffect === "laser_underline")) ||
      (isKeyword && (effectiveKwFx === "glow" || effectiveKwFx === "neon_pulse" || effectiveKwFx === "fire_aura" || effectiveKwFx === "halo_ring" || effectiveKwFx === "gold_badge"));

    const glowColHex =
      w.styleOverride?.color ??
      (isActive ? style.activeWordColor : style.glowColor || style.activeWordColor);

    const dropShadow = hasGlow
      ? {
          color: hexToNumber(glowColHex, 0xffd447),
          alpha: clamp(0.65 + (style.glowIntensity ?? 0.5) * 0.35, 0.4, 1),
          blur: Math.max(14, 20 * (style.glowIntensity || 0.9)) * scaleRef,
          distance: 0,
          angle: 0,
        }
      : style.shadow.enabled
        ? {
            color: hexToNumber(style.shadow.color, 0x000000),
            alpha: 0.82,
            blur: style.shadow.blur * scaleRef,
            distance: Math.hypot(style.shadow.offsetX, style.shadow.offsetY) * scaleRef,
            angle: Math.atan2(style.shadow.offsetY, style.shadow.offsetX),
          }
        : undefined;

    const textStyle = new TextStyle({
      fontFamily: `${style.fontFamily}, "Figtree", "Inter", system-ui, sans-serif`,
      fontSize,
      fontWeight: String(w.styleOverride?.fontWeight ?? style.fontWeight) as TextStyle["fontWeight"],
      fontStyle: w.styleOverride?.italic ? "italic" : "normal",
      letterSpacing: style.letterSpacing * scaleRef,
      fill: hexToNumber(fillHex, 0xffffff),
      stroke:
        strokeWidth > 0
          ? { color: hexToNumber(style.strokeColor, 0x0a0d16), width: strokeWidth, join: "round" }
          : undefined,
      dropShadow,
    });

    const node = new Text({ text: rawLabel, style: textStyle });
    node.anchor.set(0.5, 0.5);
    node.scale.set(wordScale);
    if (i >= visibleCount) {
      node.alpha = 0;
    }

    builtWords.push({
      word: w,
      wordIdx: i,
      rawLabel,
      isActive,
      isKeyword,
      fillHex,
      effectiveKwFx,
      wordScale,
      textStyle,
      text: node,
      width: node.width,
      height: node.height,
    });
  }

  const gap = Math.round(fontSize * 0.32);
  const totalW =
    builtWords.reduce((acc, n) => acc + n.width, 0) + gap * Math.max(0, builtWords.length - 1);
  const maxH = builtWords.reduce((acc, n) => Math.max(acc, n.height), fontSize);
  const maxAllowedW = canvasW * style.maxWidth;
  const fitScale = totalW > maxAllowedW ? maxAllowedW / Math.max(1, totalW) : 1;

  // 4. Render CapCut Container Overlay behind words
  drawOverlayContainer(row, style, totalW, maxH, scaleRef, ep, t);

  // 5. Render each word with 3D extrude, active-word FX, keyword FX, wave/shake motion, and VFX ghosts
  let cursorX = -totalW * 0.5;
  for (const item of builtWords) {
    const cx = cursorX + item.width * 0.5;
    let wx = cx;
    let wy = 0;

    // Kinetic wave / karaoke_wipe / kinetic_split entrance, bounce, shake
    if (style.animationIn === "wave") {
      const waveLocal = clamp(ep * 1.6 - item.wordIdx * 0.22, 0, 1);
      const wk = evaluateEasing(waveLocal, "springBouncy");
      wy += (1 - wk) * 28 * scaleRef;
      item.text.alpha *= clamp(waveLocal * 2, 0, 1);
    } else if (style.animationIn === "karaoke_wipe") {
      const wipeLocal = clamp(ep * 1.8 - item.wordIdx * 0.25, 0, 1);
      item.text.alpha *= evaluateEasing(wipeLocal, "easeOutCubic");
      wx -= (1 - wipeLocal) * 14 * scaleRef;
    } else if (style.animationIn === "kinetic_split") {
      const spK = evaluateEasing(ep, "springSmooth");
      const midIdx = (builtWords.length - 1) * 0.5;
      const dir = item.wordIdx < midIdx ? -1 : item.wordIdx > midIdx ? 1 : 0;
      wx += dir * (1 - spK) * 42 * scaleRef;
    }
    if (item.isActive && (style.activeWordEffect === "bounce" || style.activeWordEffect === "rainbow_wave" || style.activeWordEffect === "wave_lift")) {
      wy -= Math.sin(state.activeWordProgress * Math.PI) * 14 * scaleRef;
    }
    if (
      (item.isActive && (style.activeWordEffect === "shake" || style.activeWordEffect === "glitch_word")) ||
      (item.isKeyword && item.effectiveKwFx === "impact_shake")
    ) {
      const shakeAmp = (item.isActive ? 5.5 : 3.2) * scaleRef;
      wx += noise2D(`w-shake-${item.word.id}`, t * 34, 1.1) * shakeAmp;
      wy += noise2D(`w-shake-${item.word.id}`, t * 34, 6.7) * shakeAmp;
    }
    if (item.isKeyword && item.effectiveKwFx === "tilt_punch") {
      item.text.rotation = -0.09;
    }

    const accentHex =
      item.word.styleOverride?.boxColor ??
      (item.word.emphasis === "alert"
        ? style.alertWordColor
        : item.word.emphasis === "accent"
          ? style.accentWordColor
          : style.activeWordColor);
    const accentNum = hexToNumber(accentHex, 0xffd447);

    // Background word effects (pill_solid, gradient_pill, box, highlight_sweep, fire_badge, comic_burst, keyword badges)
    if (item.isActive && (style.activeWordEffect === "pill_solid" || style.activeWordEffect === "gradient_pill")) {
      const pill = new Graphics();
      const px = 14 * scaleRef;
      const py = 7 * scaleRef;
      pill
        .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, item.height + py * 2, 14 * scaleRef)
        .fill({ color: accentNum, alpha: 0.96 });
      if (style.activeWordEffect === "gradient_pill") {
        pill
          .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, (item.height + py * 2) * 0.45, 14 * scaleRef)
          .fill({ color: 0xffffff, alpha: 0.22 });
      }
      row.addChild(pill);
    } else if (
      (item.isActive && (style.activeWordEffect === "box" || style.activeWordEffect === "outline_flash")) ||
      (item.isKeyword && (item.effectiveKwFx === "pill" || item.effectiveKwFx === "gold_badge"))
    ) {
      const box = new Graphics();
      const px = 12 * scaleRef;
      const py = 6 * scaleRef;
      const bCol = item.effectiveKwFx === "gold_badge" ? 0xf59e0b : accentNum;
      box
        .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, item.height + py * 2, 12 * scaleRef)
        .fill({ color: bCol, alpha: item.isActive ? 0.34 : 0.24 });
      box
        .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, item.height + py * 2, 12 * scaleRef)
        .stroke({ color: bCol, width: 2.5 * scaleRef, alpha: 0.9 });
      row.addChild(box);
    } else if (
      (item.isActive && style.activeWordEffect === "comic_burst") ||
      (item.isKeyword && item.effectiveKwFx === "halo_ring")
    ) {
      const g = new Graphics();
      if (item.isActive && style.activeWordEffect === "comic_burst") {
        const spikes = 10;
        const pts: number[] = [];
        for (let s = 0; s < spikes * 2; s++) {
          const ang = (s / (spikes * 2)) * Math.PI * 2;
          const mult = s % 2 === 0 ? 1.15 : 0.85;
          pts.push(wx + Math.cos(ang) * (item.width * 0.62) * mult, wy + Math.sin(ang) * (item.height * 0.72) * mult);
        }
        g.poly(pts).fill({ color: accentNum, alpha: 0.32 });
        g.poly(pts).stroke({ color: accentNum, width: 2.5 * scaleRef, alpha: 0.92 });
      } else {
        g.ellipse(wx, wy, item.width * 0.6, item.height * 0.62).stroke({
          color: accentNum,
          width: 3 * scaleRef,
          alpha: 0.85,
        });
      }
      row.addChild(g);
    } else if (
      (item.isActive && style.activeWordEffect === "highlight_sweep") ||
      (item.isKeyword && item.effectiveKwFx === "strike_box")
    ) {
      const sweepP = item.isActive ? evaluateEasing(clamp(state.activeWordProgress * 2.2, 0, 1), "easeOutCubic") : 1;
      const hl = new Graphics();
      const px = 8 * scaleRef;
      const hW = (item.width + px * 2) * sweepP;
      hl.roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.32, hW, item.height * 0.72, 6 * scaleRef).fill({
        color: accentNum,
        alpha: 0.88,
      });
      row.addChild(hl);
    } else if (item.isActive && style.activeWordEffect === "marker_circle") {
      const circ = new Graphics();
      const rx = item.width * 0.58 + 10 * scaleRef;
      const ry = item.height * 0.58 + 6 * scaleRef;
      circ.ellipse(wx, wy, rx, ry).stroke({
        color: accentNum,
        width: 4 * scaleRef,
        alpha: 0.92,
      });
      circ.ellipse(wx + 2 * scaleRef, wy - 1.5 * scaleRef, rx * 0.97, ry * 0.95).stroke({
        color: accentNum,
        width: 2 * scaleRef,
        alpha: 0.55,
      });
      row.addChild(circ);
    } else if (
      (item.isActive && style.activeWordEffect === "fire_badge") ||
      (item.isKeyword && item.effectiveKwFx === "fire_aura")
    ) {
      const pulse = 0.85 + 0.15 * Math.sin(t * 22);
      const fire = new Graphics();
      const px = 14 * scaleRef;
      const py = 8 * scaleRef;
      fire
        .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, item.height + py * 2, 14 * scaleRef)
        .fill({ color: 0xff2e1f, alpha: 0.35 * pulse });
      fire
        .roundRect(wx - item.width * 0.5 - px, wy - item.height * 0.5 - py, item.width + px * 2, item.height + py * 2, 14 * scaleRef)
        .stroke({ color: 0xff8c24, width: 3 * scaleRef, alpha: 0.95 });
      row.addChild(fire);
    }

    // Underline, laser_underline, underline_sweep & double_underline
    if (
      (item.isActive && (style.activeWordEffect === "underline" || style.activeWordEffect === "laser_underline")) ||
      (item.isKeyword && (item.effectiveKwFx === "underline_sweep" || item.effectiveKwFx === "double_underline"))
    ) {
      const sweepP = item.isActive ? evaluateEasing(clamp(state.activeWordProgress * 2.4, 0, 1), "easeOutCubic") : 1;
      const ul = new Graphics();
      const fullW = item.width * 0.96;
      ul.roundRect(wx - fullW * 0.5, wy + item.height * 0.44, fullW * sweepP, 6 * scaleRef, 3 * scaleRef).fill(accentNum);
      if (style.activeWordEffect === "laser_underline") {
        ul.roundRect(wx - fullW * 0.5, wy + item.height * 0.45, fullW * sweepP, 2.5 * scaleRef, 2 * scaleRef).fill(0xffffff);
      }
      if (item.isKeyword && item.effectiveKwFx === "double_underline") {
        ul.roundRect(wx - fullW * 0.42, wy + item.height * 0.54, fullW * 0.84 * sweepP, 3.5 * scaleRef, 2 * scaleRef).fill({
          color: accentNum,
          alpha: 0.72,
        });
      }
      row.addChild(ul);
    }

    // 3D Block Extrusion (CapCut / MrBeast / Hormozi look)
    const extrudeDepth =
      (style.extrudeDepth ?? 0) + (item.isActive && style.activeWordEffect === "extrude_3d" ? 5 : 0);
    if (extrudeDepth > 0 && item.text.alpha > 0.05) {
      const steps = Math.min(8, Math.max(2, Math.round(extrudeDepth * 0.6)));
      const extCol = hexToNumber(style.extrudeColor, 0x000000);
      const extStyle = new TextStyle({
        fontFamily: item.textStyle.fontFamily,
        fontSize,
        fontWeight: item.textStyle.fontWeight,
        fontStyle: item.textStyle.fontStyle,
        letterSpacing: style.letterSpacing * scaleRef,
        fill: extCol,
        stroke: strokeWidth > 0 ? { color: extCol, width: strokeWidth, join: "round" } : undefined,
      });
      for (let s = steps; s >= 1; s--) {
        const ratio = s / steps;
        const ext = new Text({ text: item.rawLabel, style: extStyle });
        ext.anchor.set(0.5, 0.5);
        ext.scale.set(item.wordScale);
        ext.position.set(wx + extrudeDepth * 0.35 * ratio * scaleRef, wy + extrudeDepth * ratio * scaleRef);
        row.addChild(ext);
      }
    }

    // Chromatic / Glitch RGB ghost split on vfxIn, activeWordEffect, keywordFx, or vfxOut
    const chromaticBurst =
      (ep < 0.75 &&
        (style.vfxIn === "chromatic" ||
          style.vfxIn === "glitch_slice" ||
          style.vfxIn === "rgb_pulse" ||
          style.vfxIn === "electric_arc")) ||
      (item.isActive && style.activeWordEffect === "glitch_word") ||
      (item.isKeyword && item.effectiveKwFx === "chromatic_pop") ||
      (xp < 0.75 && (style.vfxOut === "glitch_out" || style.vfxOut === "slice_split"));
    if (chromaticBurst && item.text.alpha > 0.05) {
      const intensity = ep < 0.7 ? 1 - ep / 0.7 : 1 - xp / 0.75;
      const shift = (6 + intensity * 12) * scaleRef;
      const ghostL = new Text({
        text: item.rawLabel,
        style: new TextStyle({
          fontFamily: item.textStyle.fontFamily,
          fontSize,
          fontWeight: item.textStyle.fontWeight,
          letterSpacing: style.letterSpacing * scaleRef,
          fill: 0x00f5ff,
        }),
      });
      ghostL.anchor.set(0.5, 0.5);
      ghostL.scale.set(item.wordScale);
      ghostL.alpha = 0.52 * intensity;
      ghostL.position.set(wx - shift, wy);

      const ghostR = new Text({
        text: item.rawLabel,
        style: new TextStyle({
          fontFamily: item.textStyle.fontFamily,
          fontSize,
          fontWeight: item.textStyle.fontWeight,
          letterSpacing: style.letterSpacing * scaleRef,
          fill: 0xff2a85,
        }),
      });
      ghostR.anchor.set(0.5, 0.5);
      ghostR.scale.set(item.wordScale);
      ghostR.alpha = 0.52 * intensity;
      ghostR.position.set(wx + shift, wy);

      row.addChild(ghostL, ghostR);
    }

    // Main word text node
    item.text.position.set(wx, wy);
    row.addChild(item.text);

    // Sparkle / Comic Star / Star Trail ornaments for keywords & VFX In
    if (
      (item.isKeyword && (item.effectiveKwFx === "sparkle" || item.effectiveKwFx === "comic_star")) ||
      (item.isActive && (style.vfxIn === "spark_burst" || style.vfxIn === "star_trail") && ep < 0.85)
    ) {
      const sp = new Graphics();
      const twinkle = 0.55 + 0.45 * Math.sin(t * 14 + item.wordIdx * 2.1);
      const r1 = (7 + 4 * twinkle) * scaleRef;
      drawSparkleStar(sp, wx - item.width * 0.46, wy - item.height * 0.45, r1, accentNum, 0.95);
      drawSparkleStar(sp, wx + item.width * 0.48, wy - item.height * 0.28, r1 * 0.72, 0xffffff, 0.9);
      row.addChild(sp);
    }

    cursorX += item.width + gap;
  }

  // Entrance & Exit VFX Overlays (flash, gold_shimmer, shockwave_ring, neon_sweep, laser_scan, fire_flare, lens_flare, ink_splatter, flash_out)
  if ((style.vfxIn === "flash" || style.vfxIn === "fire_flare") && ep < 0.48) {
    const fl = new Graphics();
    const flAlpha = (1 - ep / 0.48) * 0.48;
    const flCol = style.vfxIn === "fire_flare" ? 0xff7b24 : 0xffffff;
    fl.roundRect(-totalW * 0.55, -maxH * 0.65, totalW * 1.1, maxH * 1.3, 18 * scaleRef).fill({
      color: flCol,
      alpha: flAlpha,
    });
    row.addChild(fl);
  } else if (style.vfxIn === "shockwave_ring" && ep < 0.85) {
    const ring = new Graphics();
    const k = evaluateEasing(ep / 0.85, "easeOutCubic");
    const r = (totalW * 0.25 + k * totalW * 0.55);
    ring.ellipse(0, 0, r, maxH * (0.6 + k * 0.85)).stroke({
      color: hexToNumber(style.activeWordColor, 0xffd447),
      width: Math.max(1.5, (1 - k) * 6 * scaleRef),
      alpha: (1 - k) * 0.85,
    });
    row.addChild(ring);
  } else if ((style.vfxIn === "gold_shimmer" || style.vfxIn === "neon_sweep" || style.vfxIn === "laser_scan" || style.vfxIn === "lens_flare") && ep < 0.92) {
    const sweep = new Graphics();
    const k = ep / 0.92;
    const sx = -totalW * 0.6 + k * totalW * 1.2;
    const barCol =
      style.vfxIn === "gold_shimmer"
        ? 0xffd166
        : style.vfxIn === "laser_scan"
          ? 0xff2a5f
          : hexToNumber(style.activeWordColor, 0x00f5ff);
    const barW = style.vfxIn === "laser_scan" ? 5 * scaleRef : 26 * scaleRef;
    sweep.roundRect(sx - barW * 0.5, -maxH * 0.65, barW, maxH * 1.3, 4 * scaleRef).fill({
      color: barCol,
      alpha: Math.sin(k * Math.PI) * 0.65,
    });
    row.addChild(sweep);
  } else if (style.vfxIn === "ink_splatter" && ep < 0.8) {
    const ink = new Graphics();
    const k = 1 - ep / 0.8;
    const col = hexToNumber(style.activeWordColor, 0xff2e63);
    for (let d = 0; d < 6; d++) {
      const ang = (d / 6) * Math.PI * 2 + 0.4;
      const dist = (24 + (1 - k) * 44) * scaleRef;
      ink.circle(Math.cos(ang) * dist, Math.sin(ang) * dist * 0.55, (4 + (d % 3) * 2) * scaleRef).fill({
        color: col,
        alpha: k * 0.78,
      });
    }
    row.addChild(ink);
  }
  if (style.vfxOut === "flash_out" && xp < 0.5) {
    const fl = new Graphics();
    fl.roundRect(-totalW * 0.55, -maxH * 0.65, totalW * 1.1, maxH * 1.3, 18 * scaleRef).fill({
      color: 0xffffff,
      alpha: (1 - xp / 0.5) * 0.5,
    });
    row.addChild(fl);
  }

  if (rowBlurPx > 0.35 && !options?.lowMemoryMode) {
    row.filters = [new BlurFilter({ strength: rowBlurPx, quality: 1 })];
  }

  row.position.set(pos.x * canvasW + offsetX, pos.y * canvasH + offsetY);
  row.scale.set(fitScale * enterScaleX, fitScale * enterScaleY);
  row.rotation = (extraRotDeg * Math.PI) / 180;
  container.addChild(row);
}
