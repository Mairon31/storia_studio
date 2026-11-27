import { Graphics } from "pixi.js";
import type { Layer } from "@storia/schema";
import { createSeededRng, hexToNumber } from "./color.js";

type BackgroundLayer = Extract<Layer, { type: "background" }>;

function drawVerticalBands(g: Graphics, w: number, h: number, topHex: number, botHex: number, steps = 28): void {
  const tr = (topHex >> 16) & 0xff;
  const tg = (topHex >> 8) & 0xff;
  const tb = topHex & 0xff;
  const br = (botHex >> 16) & 0xff;
  const bg = (botHex >> 8) & 0xff;
  const bb = botHex & 0xff;

  const bandH = h / steps;
  for (let i = 0; i < steps; i++) {
    const k = i / Math.max(1, steps - 1);
    const r = Math.round(tr + (br - tr) * k);
    const gr = Math.round(tg + (bg - tg) * k);
    const b = Math.round(tb + (bb - tb) * k);
    g.rect(0, i * bandH, w, bandH + 1.5).fill((r << 16) | (gr << 8) | b);
  }
}

function drawWindow(g: Graphics, x: number, y: number, ww: number, wh: number, night: boolean, skyCol: number): void {
  g.roundRect(x - 10, y - 10, ww + 20, wh + 20, 8).fill(0x4a382c);
  g.roundRect(x, y, ww, wh, 4).fill(night ? 0x132038 : skyCol);
  if (night) {
    for (let i = 0; i < 8; i++) {
      g.circle(x + ww * (0.14 + ((i * 29) % 72) / 100), y + wh * (0.18 + ((i * 41) % 62) / 100), 2.5).fill({
        color: 0xffe8a3,
        alpha: 0.8,
      });
    }
  }
  g.rect(x + ww * 0.5 - 3, y, 6, wh).fill(0x4a382c);
  g.rect(x, y + wh * 0.5 - 3, ww, 6).fill(0x4a382c);
}

/**
 * Draws Storia's procedural illustrated 2D sets directly into a PixiJS Graphics node.
 * Coordinates scale seamlessly across 9:16, 16:9, and 1:1.
 */
export function drawProceduralBackground(
  g: Graphics,
  layer: BackgroundLayer,
  w: number,
  h: number,
  timeSec: number,
): void {
  g.clear();

  if (layer.sourceType === "solid") {
    g.rect(0, 0, w, h).fill(hexToNumber(layer.color, 0x121622));
    return;
  }

  if (layer.sourceType === "gradient" || !layer.proceduralSet || layer.proceduralSet === "gradient") {
    drawVerticalBands(
      g,
      w,
      h,
      hexToNumber(layer.gradientTop, 0x1a2036),
      hexToNumber(layer.gradientBottom, 0x0a0d16),
    );
    return;
  }

  const set = layer.proceduralSet;
  const mood = layer.mood;
  const night = mood === "night" || mood === "ice" || mood === "noir";
  const warm = mood === "gold" || mood === "dusk";
  const rng = createSeededRng(layer.seed * 997 + set.length * 31);

  if (set === "solid") {
    g.rect(0, 0, w, h).fill(hexToNumber(layer.color, 0x121622));
    return;
  }

  // ============================================================================
  // STICKMAN VIDEO DIRECTOR ANIMATION STYLE BACKGROUNDS (A1-A8, B1-B8)
  // ============================================================================

  if (set === "minimal_dark_a1") {
    g.rect(0, 0, w, h).fill(0x06070a);
    // Subtle baseline horizon line only
    g.moveTo(w * 0.08, h * 0.78).lineTo(w * 0.92, h * 0.78).stroke({ color: 0xffffff, width: 1.5, alpha: 0.14 });
    return;
  }

  if (set === "minimal_light_a1") {
    g.rect(0, 0, w, h).fill(0xffffff);
    g.moveTo(w * 0.08, h * 0.78).lineTo(w * 0.92, h * 0.78).stroke({ color: 0x111111, width: 1.5, alpha: 0.15 });
    return;
  }

  if (set === "studio_tech_a2") {
    drawVerticalBands(g, w, h, 0xffffff, 0xeaf2fb, 20);
    // High-key Apple-style perspective floor grid
    const horizonY = h * 0.68;
    const vx = w * 0.5;
    g.rect(0, horizonY, w, h - horizonY).fill({ color: 0xe2ecf8, alpha: 0.55 });
    g.moveTo(0, horizonY).lineTo(w, horizonY).stroke({ color: 0x38bdf8, width: 1.5, alpha: 0.32 });
    for (let i = -8; i <= 8; i++) {
      const bx = vx + i * (w * 0.14);
      g.moveTo(vx + i * (w * 0.04), horizonY)
        .lineTo(bx, h)
        .stroke({ color: 0x94a3b8, width: 1.2, alpha: 0.25 });
    }
    for (let k = 1; k <= 7; k++) {
      const p = (k / 7) * (k / 7);
      const y = horizonY + p * (h - horizonY);
      g.moveTo(0, y).lineTo(w, y).stroke({ color: 0x94a3b8, width: 1.2, alpha: 0.24 });
    }
    // Floating translucent cyan glass accent cards
    const bob = Math.sin(timeSec * 1.8) * 6;
    g.roundRect(w * 0.08, h * 0.14 + bob, w * 0.24, h * 0.08, 12)
      .fill({ color: 0x38bdf8, alpha: 0.09 })
      .stroke({ color: 0x06b6d4, width: 1.6, alpha: 0.35 });
    g.roundRect(w * 0.68, h * 0.2 - bob, w * 0.24, h * 0.09, 12)
      .fill({ color: 0x3b82f6, alpha: 0.08 })
      .stroke({ color: 0x38bdf8, width: 1.6, alpha: 0.32 });
    return;
  }

  if (set === "paper_grid_b1") {
    // Authentic B1 warm paper #FDFDFC + 64px faint grid + solid bottom caption band
    g.rect(0, 0, w, h).fill(0xfdfdfc);
    const gridLimitY = h * 0.84;
    const step = Math.max(36, Math.round(Math.min(w, h) / 14));
    for (let x = step; x < w; x += step) {
      g.moveTo(x, 0).lineTo(x, gridLimitY).stroke({ color: 0x4c5a69, width: 1.0, alpha: 0.065 });
    }
    for (let y = step; y < gridLimitY; y += step) {
      g.moveTo(0, y).lineTo(w, y).stroke({ color: 0x4c5a69, width: 1.0, alpha: 0.065 });
    }
    g.rect(0, gridLimitY, w, h - gridLimitY).fill(0xfdfdfc);
    return;
  }

  if (set === "paper_warm_b2") {
    drawVerticalBands(g, w, h, 0xfaf4e8, 0xefe5d1, 16);
    // Soft hand-drawn ground horizon stroke
    g.moveTo(w * 0.06, h * 0.77)
      .quadraticCurveTo(w * 0.5, h * 0.762, w * 0.94, h * 0.772)
      .stroke({ color: 0x24201c, width: 2.2, alpha: 0.22 });
    // Subtle botanical/paper warmth circles
    g.circle(w * 0.16, h * 0.18, Math.min(w, h) * 0.16).fill({ color: 0xe9c46a, alpha: 0.12 });
    g.circle(w * 0.84, h * 0.24, Math.min(w, h) * 0.18).fill({ color: 0xd97757, alpha: 0.09 });
    return;
  }

  if (set === "retro_tv_b3") {
    drawVerticalBands(g, w, h, 0x111726, 0x06080f, 18);
    // Subtle radial phosphor glow
    g.circle(w * 0.5, h * 0.45, Math.min(w, h) * 0.48).fill({ color: 0x3b82f6, alpha: 0.08 });
    // Retro TV room floor plane
    g.rect(0, h * 0.76, w, h * 0.24).fill(0x090c14);
    g.moveTo(0, h * 0.76).lineTo(w, h * 0.76).stroke({ color: 0x93c5fd, width: 1.6, alpha: 0.28 });
    // Restrained CRT scanlines
    for (let y = 0; y < h; y += 6) {
      g.rect(0, y, w, 1.5).fill({ color: 0x000000, alpha: 0.22 });
    }
    return;
  }

  if (set === "cave_prehistoric_a3") {
    drawVerticalBands(g, w, h, 0x3b2618, 0x180f09, 20);
    // Cavern stone arch silhouettes
    g.moveTo(0, 0)
      .lineTo(w, 0)
      .lineTo(w, h * 0.34)
      .quadraticCurveTo(w * 0.78, h * 0.14, w * 0.5, h * 0.16)
      .quadraticCurveTo(w * 0.22, h * 0.14, 0, h * 0.36)
      .closePath()
      .fill(0x21140c);
    // Flickering warm campfire glow
    const flick = 0.88 + 0.12 * Math.sin(timeSec * 9.5);
    g.circle(w * 0.5, h * 0.74, Math.min(w, h) * 0.36 * flick).fill({ color: 0xff7a2e, alpha: 0.18 });
    g.circle(w * 0.5, h * 0.76, Math.min(w, h) * 0.18 * flick).fill({ color: 0xfacc15, alpha: 0.14 });
    g.rect(0, h * 0.76, w, h * 0.24).fill(0x24160e);
    return;
  }

  if (set === "amber_noir_a6") {
    drawVerticalBands(g, w, h, 0x1e1512, 0x08070b, 22);
    // Deep city skyline silhouettes + warm amber streetlamp pools
    for (let i = 0; i < 8; i++) {
      const bx = (i / 8) * w;
      const bw = w / 7.5;
      const bh = h * (0.24 + rng() * 0.28);
      g.rect(bx, h * 0.72 - bh, bw, bh).fill(0x100d12);
      for (let wy = 0; wy < 5; wy++) {
        if (rng() > 0.55) {
          g.rect(bx + bw * 0.22, h * 0.72 - bh + 18 + wy * 26, bw * 0.22, 12).fill({ color: 0xf59e0b, alpha: 0.55 });
        }
      }
    }
    g.circle(w * 0.24, h * 0.42, Math.min(w, h) * 0.34).fill({ color: 0xf59e0b, alpha: 0.15 });
    g.rect(0, h * 0.72, w, h * 0.28).fill(0x0c0a0f);
    return;
  }

  if (set === "vintage_cartoon_a7") {
    // 1930s subdued sage-gray / pale ivory ink-and-paint theatrical set
    drawVerticalBands(g, w, h * 0.75, 0xdfdace, 0xc9c4b4, 16);
    // Period wainscoting panels with crisp pen contours
    g.rect(0, h * 0.54, w, h * 0.21).fill(0xb8b4a4).stroke({ color: 0x262421, width: 2.4 });
    const panels = 5;
    for (let i = 0; i < panels; i++) {
      const px = w * (0.05 + i * 0.19);
      g.roundRect(px, h * 0.57, w * 0.15, h * 0.15, 4).stroke({ color: 0x262421, width: 2.0, alpha: 0.65 });
    }
    // Checkered theatrical wood floor
    g.rect(0, h * 0.75, w, h * 0.25).fill(0xa9a392).stroke({ color: 0x262421, width: 2.6 });
    for (let i = -4; i <= 8; i++) {
      g.moveTo(w * 0.5 + i * w * 0.12, h * 0.75)
        .lineTo(w * 0.5 + i * w * 0.22, h)
        .stroke({ color: 0x262421, width: 1.6, alpha: 0.35 });
    }
    return;
  }

  if (set === "ghibli_sky_a8") {
    drawVerticalBands(g, w, h * 0.76, 0x4a90d9, 0xe8d9bc, 26);
    // Painterly drifting summer cumulus clouds
    const drift = (timeSec * 14) % (w + 260);
    for (const [ox, oy, rad] of [
      [0.2, 0.24, 62],
      [0.27, 0.22, 76],
      [0.35, 0.25, 58],
      [0.72, 0.32, 68],
      [0.8, 0.3, 82],
    ] as [number, number, number][]) {
      const cx = ((ox * w + drift) % (w + 220)) - 110;
      g.circle(cx, oy * h, rad).fill({ color: 0xfffcf2, alpha: 0.85 });
      g.circle(cx + rad * 0.2, oy * h + rad * 0.25, rad * 0.78).fill({ color: 0xdbe6f2, alpha: 0.45 });
    }
    // Sunlit meadow hills
    g.ellipse(w * 0.3, h * 0.8, w * 0.65, h * 0.16).fill(0x5da064);
    g.ellipse(w * 0.75, h * 0.84, w * 0.65, h * 0.17).fill(0x3f7d4c);
    g.rect(0, h * 0.8, w, h * 0.2).fill(0x31663c);
    return;
  }

  if (set === "pixel_stage_b7") {
    // Rich 16-bit Pixel-Art Stage: stepped twilight sky, pixel moon, layered mountains, skyline & tiled deck
    const tile = Math.max(12, Math.round(Math.min(w, h) / 40));
    const snap = (v: number) => Math.floor(v / tile) * tile;
    // Banded 16-bit sky
    const skyColors = [0x0f1229, 0x161c3d, 0x1e2854, 0x29366b, 0x354580];
    const bandH = Math.ceil((h * 0.76) / skyColors.length / tile) * tile;
    skyColors.forEach((col, idx) => {
      g.rect(0, idx * bandH, w, bandH + tile).fill(col);
    });
    // Crisp 16-bit pixel moon
    const mx = snap(w * 0.76);
    const my = snap(h * 0.16);
    g.rect(mx - tile * 2, my - tile * 3, tile * 4, tile * 6).fill(0xfff1a8);
    g.rect(mx - tile * 3, my - tile * 2, tile * 6, tile * 4).fill(0xfff1a8);
    g.rect(mx - tile, my - tile * 2, tile * 3, tile * 4).fill(0x161c3d);
    // Twinkling pixel stars
    for (let i = 0; i < 42; i++) {
      const sx = snap(rng() * w);
      const sy = snap(rng() * h * 0.56);
      const blink = Math.sin(timeSec * 3.5 + i) > -0.15 ? 0.92 : 0.28;
      g.rect(sx, sy, tile * 0.5, tile * 0.5).fill({ color: i % 3 === 0 ? 0xffd447 : 0x9ce8ff, alpha: blink });
    }
    // Stepped pixel mountains
    for (let i = 0; i < 7; i++) {
      const cx = snap((i + 0.5) * (w / 6));
      const peakH = snap(h * (0.14 + (i % 3) * 0.05));
      const baseY = snap(h * 0.76);
      for (let step = 0; step < peakH; step += tile) {
        const halfW = snap((step / Math.max(tile, peakH)) * w * 0.16) + tile;
        g.rect(cx - halfW, baseY - peakH + step, halfW * 2, tile).fill(0x1b2342);
      }
    }
    // Blocky horizon buildings with glowing pixel windows
    const cols = Math.max(6, Math.floor(w / (tile * 7)));
    for (let i = 0; i < cols; i++) {
      const bw = tile * 6;
      const bh = snap(h * (0.1 + rng() * 0.18)) + tile * 2;
      const bx = i * tile * 7 + tile;
      const by = snap(h * 0.76) - bh;
      g.rect(bx, by, bw, bh).fill(0x131933);
      g.rect(bx, by, bw, tile * 0.5).fill(0x2e3c6b);
      for (let wy = by + tile; wy < snap(h * 0.74); wy += tile * 2) {
        for (let wx = bx + tile; wx < bx + bw - tile; wx += tile * 2) {
          if (rng() > 0.48) g.rect(wx, wy, tile, tile).fill(0xffd447);
        }
      }
    }
    // Tiled 16-bit foreground deck
    const deckY = snap(h * 0.76);
    g.rect(0, deckY, w, h - deckY).fill(0x232d52);
    g.rect(0, deckY, w, tile).fill(0x4ce6c8);
    g.rect(0, deckY + tile, w, tile * 0.5).fill(0x161d38);
    for (let tx = 0; tx < w; tx += tile * 4) {
      g.rect(tx, deckY + tile * 2, tile * 2, tile).fill({ color: 0x2f3d6b, alpha: 0.65 });
    }
    return;
  }

  if (set === "stylized_3d_stage") {
    // 3D Clay & Toon Studio cyclorama with volumetric dome glow, soft floating clay orbs & glossy stage floor
    drawVerticalBands(g, w, h * 0.75, 0x2c3f70, 0x12192e, 26);
    const shortS = Math.min(w, h);
    // Studio key light dome
    g.circle(w * 0.5, h * 0.36, shortS * 0.56).fill({ color: 0x5682e8, alpha: 0.22 });
    g.circle(w * 0.5, h * 0.34, shortS * 0.32).fill({ color: 0x99c6ff, alpha: 0.14 });
    // Floating 3D clay spheres with specular highlight
    const floatA = Math.sin(timeSec * 1.4) * 14;
    const floatB = Math.cos(timeSec * 1.1) * 16;
    const orbs: [number, number, number, number][] = [
      [w * 0.16, h * 0.22 + floatA, shortS * 0.085, 0x38bdf8],
      [w * 0.84, h * 0.28 + floatB, shortS * 0.105, 0xfb7185],
      [w * 0.78, h * 0.56 - floatA * 0.7, shortS * 0.055, 0xfbbf24],
    ];
    for (const [ox, oy, orad, ocol] of orbs) {
      g.circle(ox, oy, orad).fill({ color: ocol, alpha: 0.92 });
      g.circle(ox + orad * 0.16, oy + orad * 0.18, orad * 0.88).fill({ color: 0x0b1024, alpha: 0.24 });
      g.circle(ox - orad * 0.28, oy - orad * 0.28, orad * 0.32).fill({ color: 0xffffff, alpha: 0.36 });
    }
    // Curved studio cyclorama floor + contact reflection
    g.ellipse(w * 0.5, h * 0.76, w * 0.75, h * 0.09).fill(0x212d52);
    g.rect(0, h * 0.76, w, h * 0.24).fill(0x161f3b);
    g.ellipse(w * 0.5, h * 0.81, w * 0.38, h * 0.04).fill({ color: 0x38bdf8, alpha: 0.16 });
    return;
  }

  if (set === "kurzgesagt_cosmos") {
    // Kurzgesagt Science Vector: lineless vibrant indigo cosmos, ringed planets, orbital arcs & layered neon hills
    drawVerticalBands(g, w, h, 0x101c4d, 0x070b21, 26);
    const shortS = Math.min(w, h);
    // Soft geometric nebula discs
    g.circle(w * 0.22, h * 0.26, shortS * 0.36).fill({ color: 0x7c3aed, alpha: 0.16 });
    g.circle(w * 0.8, h * 0.42, shortS * 0.42).fill({ color: 0x00e5ff, alpha: 0.12 });
    // Orbital ellipses
    g.ellipse(w * 0.5, h * 0.44, shortS * 0.62, shortS * 0.24).stroke({ color: 0x00e5ff, width: 2, alpha: 0.18 });
    g.ellipse(w * 0.5, h * 0.44, shortS * 0.42, shortS * 0.16).stroke({ color: 0xff5c8a, width: 2, alpha: 0.18 });
    // Crisp flat-vector stars & sparkles
    for (let i = 0; i < 48; i++) {
      const sx = rng() * w;
      const sy = rng() * h * 0.68;
      const sr = 1.6 + rng() * 2.8;
      const alpha = 0.45 + 0.45 * Math.sin(timeSec * 2.2 + i);
      g.circle(sx, sy, sr).fill({ color: i % 4 === 0 ? 0xffd166 : i % 3 === 0 ? 0x00e5ff : 0xffffff, alpha });
    }
    // Signature Kurzgesagt ringed planet (lineless, 2-tone shadow crescent)
    const px = w * 0.78;
    const py = h * 0.22 + Math.sin(timeSec * 0.9) * 8;
    const pr = shortS * 0.11;
    g.ellipse(px, py, pr * 1.9, pr * 0.42).stroke({ color: 0xffd166, width: 8, alpha: 0.82 });
    g.circle(px, py, pr).fill(0xff5c8a);
    g.arc(px, py, pr, -Math.PI * 0.35, Math.PI * 0.65).fill({ color: 0xb52459, alpha: 0.55 });
    g.circle(px - pr * 0.3, py - pr * 0.25, pr * 0.22).fill({ color: 0xff9ec0, alpha: 0.55 });
    // Secondary cyan moon
    const mx = w * 0.18;
    const my = h * 0.32 - Math.sin(timeSec * 0.8) * 6;
    g.circle(mx, my, shortS * 0.055).fill(0x00e5ff);
    g.arc(mx, my, shortS * 0.055, -Math.PI * 0.4, Math.PI * 0.6).fill({ color: 0x0088b8, alpha: 0.5 });
    // Lineless layered geometric horizon hills
    g.ellipse(w * 0.25, h * 0.84, w * 0.65, h * 0.16).fill(0x192a6b);
    g.ellipse(w * 0.82, h * 0.87, w * 0.6, h * 0.17).fill(0x121e52);
    g.rect(0, h * 0.84, w, h * 0.16).fill(0x0c143a);
    return;
  }

  if (set === "anime_sky_cel") {
    // Vivid Anime Cel-Shaded Sky: azure-to-coral gradient, hard-shaded cumulus clouds, sunbeams & mountain silhouettes
    drawVerticalBands(g, w, h * 0.78, 0x1d6fe2, 0xf7c59f, 26);
    // Diagonal anime sunbeams
    for (let i = 0; i < 4; i++) {
      const bx = w * (0.1 + i * 0.25);
      g.poly([bx, 0, bx + w * 0.12, 0, bx - w * 0.14, h * 0.82, bx - w * 0.26, h * 0.82]).fill({
        color: 0xfff6d6,
        alpha: 0.085,
      });
    }
    // Radiant sun flare
    g.circle(w * 0.8, h * 0.18, Math.min(w, h) * 0.16).fill({ color: 0xfff4c2, alpha: 0.32 });
    g.circle(w * 0.8, h * 0.18, Math.min(w, h) * 0.07).fill({ color: 0xffffff, alpha: 0.92 });
    // Crisp cel-shaded drifting cumulus clouds (bright white top + cool lavender underside)
    const drift = (timeSec * 12) % (w + 260);
    const puffs: [number, number, number][] = [
      [0.18, 0.28, 66],
      [0.26, 0.25, 84],
      [0.35, 0.29, 60],
      [0.64, 0.36, 72],
      [0.73, 0.33, 88],
      [0.82, 0.37, 62],
    ];
    for (const [ox, oy, rad] of puffs) {
      const cx = ((ox * w + drift) % (w + 240)) - 120;
      g.circle(cx + 8, oy * h + 14, rad * 0.94).fill(0xb9cce8);
      g.circle(cx, oy * h, rad).fill(0xffffff);
    }
    // Distant cobalt mountain range + sunlit green foreground meadow
    g.poly([0, h * 0.78, w * 0.22, h * 0.62, w * 0.48, h * 0.74, w * 0.76, h * 0.58, w, h * 0.76, w, h * 0.82, 0, h * 0.82]).fill(0x2b4578);
    g.ellipse(w * 0.35, h * 0.84, w * 0.7, h * 0.15).fill(0x2f8f5b);
    g.rect(0, h * 0.82, w, h * 0.18).fill(0x216b43);
    return;
  }

  if (set === "retro_psx_arena") {
    // 1998 PlayStation Low-Poly Horizon: banded twilight sky, faceted mountains & perspective retro grid floor
    drawVerticalBands(g, w, h * 0.66, 0x1a103b, 0x5c2459, 12);
    // Banded retro sun
    const sx = w * 0.5;
    const sy = h * 0.44;
    const sr = Math.min(w, h) * 0.18;
    g.circle(sx, sy, sr).fill(0xff6b8b);
    for (let cut = 0; cut < 5; cut++) {
      g.rect(sx - sr, sy + sr * (0.1 + cut * 0.18), sr * 2, 5 + cut * 2).fill(0x3a1847);
    }
    // Faceted low-poly mountains (bright left face / dark right face)
    const peaks: [number, number, number][] = [
      [w * 0.16, h * 0.42, w * 0.22],
      [w * 0.48, h * 0.48, w * 0.26],
      [w * 0.82, h * 0.4, w * 0.24],
    ];
    for (const [px, py, hw] of peaks) {
      g.poly([px - hw, h * 0.66, px, py, px, h * 0.66]).fill(0x2c205c);
      g.poly([px, py, px + hw, h * 0.66, px, h * 0.66]).fill(0x140e30);
    }
    // Perspective tiled floor
    const horizonY = h * 0.66;
    g.rect(0, horizonY, w, h - horizonY).fill(0x0b0e21);
    for (let i = -8; i <= 8; i++) {
      g.moveTo(w * 0.5 + i * w * 0.05, horizonY)
        .lineTo(w * 0.5 + i * w * 0.19, h)
        .stroke({ color: 0x22d3ee, width: 2, alpha: 0.45 });
    }
    const scroll = (timeSec * 0.25) % 1;
    for (let j = 0; j < 8; j++) {
      const u = ((j + scroll) / 8);
      const y = horizonY + u * u * (h - horizonY);
      g.moveTo(0, y).lineTo(w, y).stroke({ color: 0xf472b6, width: 2, alpha: 0.42 });
    }
    return;
  }

  if (set === "paper_cutout_stage") {
    // Paper Cutout Craft: warm tactile cardstock backdrop with layered physical paper-cut hills, clouds & sun
    drawVerticalBands(g, w, h, 0xf7efe0, 0xe7dac2, 14);
    // Cut-out paper sun with shadow
    const sx = w * 0.8;
    const sy = h * 0.18;
    const sr = Math.min(w, h) * 0.095;
    g.circle(sx + 8, sy + 8, sr + 4).fill({ color: 0x000000, alpha: 0.14 });
    g.circle(sx, sy, sr + 5).fill(0xfdfaf3);
    g.circle(sx, sy, sr).fill(0xf2b149);
    // Cut-out paper clouds
    for (const [cx, cy, cw] of [
      [w * 0.22, h * 0.22, Math.min(w, h) * 0.16],
      [w * 0.54, h * 0.3, Math.min(w, h) * 0.13],
    ] as [number, number, number][]) {
      g.roundRect(cx - cw + 7, cy - cw * 0.35 + 7, cw * 2, cw * 0.72, cw * 0.36).fill({ color: 0x000000, alpha: 0.12 });
      g.roundRect(cx - cw, cy - cw * 0.35, cw * 2, cw * 0.72, cw * 0.36).fill(0xfdfaf3);
    }
    // Layered cut-out paper hills with drop shadows & crisp paper edge rims
    const drawHill = (cx: number, cy: number, rx: number, ry: number, col: number) => {
      g.ellipse(cx + 8, cy + 8, rx, ry).fill({ color: 0x000000, alpha: 0.16 });
      g.ellipse(cx, cy - 4, rx + 4, ry + 4).fill(0xfdfaf3);
      g.ellipse(cx, cy, rx, ry).fill(col);
    };
    drawHill(w * 0.26, h * 0.82, w * 0.62, h * 0.17, 0x5c9b8f);
    drawHill(w * 0.78, h * 0.86, w * 0.62, h * 0.17, 0x3b7a72);
    g.rect(0, h * 0.84, w, h * 0.16).fill(0x2d625c);
    return;
  }

  if (set === "mythic_temple_b8") {
    // B8 Greek Mythology: terracotta sunset, marble temple columns & warm gold directional glow
    drawVerticalBands(g, w, h * 0.76, 0x5c3622, 0xd49653, 24);
    g.circle(w * 0.5, h * 0.44, Math.min(w, h) * 0.34).fill({ color: 0xffd978, alpha: 0.22 });
    // Marble fluted Greek columns framing left & right
    const colW = w * 0.085;
    for (const cx of [w * 0.1, w * 0.9 - colW]) {
      g.rect(cx, h * 0.12, colW, h * 0.64).fill(0xeae0cc).stroke({ color: 0x3b2416, width: 3.0 });
      g.rect(cx - 8, h * 0.1, colW + 16, 20).fill(0xf5ecd9).stroke({ color: 0x3b2416, width: 2.6 });
      g.rect(cx - 8, h * 0.73, colW + 16, 18).fill(0xd6c7ae).stroke({ color: 0x3b2416, width: 2.6 });
      for (let f = 1; f <= 3; f++) {
        g.moveTo(cx + (colW * f) / 4, h * 0.14)
          .lineTo(cx + (colW * f) / 4, h * 0.72)
          .stroke({ color: 0x8c6d52, width: 1.5, alpha: 0.5 });
      }
    }
    // Marble temple floor + Greek key gold meander strip
    g.rect(0, h * 0.76, w, h * 0.24).fill(0x3a261a);
    g.rect(0, h * 0.76, w, 12).fill(0xe5b84b).stroke({ color: 0x2c1a10, width: 2.2 });
    return;
  }

  if (set === "observatory") {
    drawVerticalBands(g, w, h, 0x070b18, 0x1c2544);
    // Twinkling stars
    for (let i = 0; i < 65; i++) {
      const sx = rng() * w;
      const sy = rng() * h * 0.68;
      const r = 1.2 + rng() * 2.4;
      const a = 0.4 + 0.5 * Math.sin(timeSec * 2.4 + i);
      g.circle(sx, sy, r).fill({ color: i % 5 === 0 ? 0xffd98a : 0xdceeff, alpha: Math.max(0.1, a) });
    }
    // Celestial dome & brass astrolabe arcs
    const cx = w * 0.5;
    const cy = h * 0.42;
    const rad = Math.min(w, h) * 0.34;
    g.circle(cx, cy, rad).stroke({ color: 0xffd478, width: 2.5, alpha: 0.32 });
    g.circle(cx, cy, rad * 0.72).stroke({ color: 0x4ce6c8, width: 1.8, alpha: 0.28 });
    g.circle(cx, cy, rad * 1.18).stroke({ color: 0xf7c8d6, width: 1.5, alpha: 0.16 });
    // Observatory floor terrace
    g.rect(0, h * 0.76, w, h * 0.24).fill(0x111626);
    g.rect(0, h * 0.755, w, 5).fill(0x8a6d3b);
    return;
  }

  if (set === "living_room") {
    drawVerticalBands(g, w, h * 0.72, night ? 0x242038 : warm ? 0x5c3e4d : 0xd4c3ad, night ? 0x181628 : warm ? 0x3b2735 : 0xb59e86);
    g.rect(0, h * 0.61, w, h * 0.11).fill(night ? 0x2f2438 : warm ? 0x4d323b : 0xc2ad95);
    g.rect(0, h * 0.72, w, h * 0.28).fill(night ? 0x231a18 : warm ? 0x472f26 : 0x76553e);
    drawWindow(g, w * 0.56, h * 0.16, w * 0.34, h * 0.24, night, warm ? 0xd98a5f : 0x87b7dc);

    // Framed family portraits
    const frames = [
      [w * 0.1, h * 0.18, w * 0.14, h * 0.1],
      [w * 0.27, h * 0.16, w * 0.17, h * 0.13],
      [w * 0.13, h * 0.32, w * 0.15, h * 0.09],
    ] as const;
    for (const [fx, fy, fw, fh] of frames) {
      g.roundRect(fx - 6, fy - 6, fw + 12, fh + 12, 6).fill(night ? 0x483c54 : 0x8a6035);
      g.roundRect(fx, fy, fw, fh, 3).fill(night ? 0x32405a : 0xf2e2c6);
      g.circle(fx + fw * 0.38, fy + fh * 0.44, Math.min(fw, fh) * 0.13).fill({ color: 0x5c4340, alpha: 0.75 });
      g.circle(fx + fw * 0.64, fy + fh * 0.46, Math.min(fw, fh) * 0.12).fill({ color: 0x6e4c44, alpha: 0.75 });
    }

    // Sofa
    const sx = w * 0.14;
    const sy = h * 0.56;
    const sw = w * 0.58;
    const sh = h * 0.17;
    const sofaCol = night ? 0x2e4159 : warm ? 0x8d4b44 : 0x547285;
    const sofaDk = night ? 0x1e2c3e : warm ? 0x61302c : 0x3b5261;
    g.roundRect(sx, sy, sw, sh * 0.58, 20).fill(sofaCol);
    g.roundRect(sx - 20, sy + sh * 0.24, 38, sh * 0.72, 14).fill(sofaDk);
    g.roundRect(sx + sw - 18, sy + sh * 0.24, 38, sh * 0.72, 14).fill(sofaDk);
    g.roundRect(sx + 8, sy + sh * 0.45, sw - 16, sh * 0.48, 12).fill(sofaDk);

    // Warm rug
    g.ellipse(w * 0.5, h * 0.85, w * 0.42, h * 0.055).fill({ color: night ? 0x2e3b54 : 0xa85e46, alpha: 0.55 });
    g.ellipse(w * 0.5, h * 0.85, w * 0.32, h * 0.038).fill({ color: night ? 0x465978 : 0xd9a96c, alpha: 0.42 });

    // Glowing floor lamp
    const lx = w * 0.86;
    const ly = h * 0.45;
    const pulse = 0.22 + 0.04 * Math.sin(timeSec * 2.2);
    g.circle(lx, ly + 22, Math.min(w, h) * 0.16).fill({ color: 0xffd27a, alpha: pulse });
    g.rect(lx - 3, ly + 36, 6, h * 0.30).fill(0xc49a52);
    g.roundRect(lx - 28, ly - 14, 56, 48, 8).fill(0xffdf9c);
    return;
  }

  if (set === "dining_family") {
    drawVerticalBands(g, w, h * 0.74, night ? 0x1c192b : 0x4b303f, night ? 0x12101d : 0x2c1b29);
    g.rect(0, h * 0.74, w, h * 0.26).fill(night ? 0x211717 : 0x38231d);
    drawWindow(g, w * 0.26, h * 0.16, w * 0.48, h * 0.23, true, 0x496387);
    g.circle(w * 0.5, h * 0.34, Math.min(w, h) * 0.28).fill({ color: 0xffcc70, alpha: 0.18 + 0.03 * Math.sin(timeSec * 2) });
    g.rect(w * 0.5 - 2, 0, 4, h * 0.12).fill(0x2a1d17);
    g.roundRect(w * 0.5 - 32, h * 0.11, 64, 24, 12).fill(0xffdf9c);
    for (const r of [0.24, 0.42, 0.58, 0.76]) {
      g.roundRect(w * r - 34, h * 0.56, 68, h * 0.12, 10).fill(0x5c3c28);
    }
    const ty = h * 0.66;
    g.roundRect(w * 0.1, ty, w * 0.8, h * 0.042, 10).fill(0x7a4e32);
    g.rect(w * 0.14, ty + h * 0.04, 20, h * 0.18).fill(0x4d301d);
    g.rect(w * 0.86 - 20, ty + h * 0.04, 20, h * 0.18).fill(0x4d301d);
    // Center candle
    g.roundRect(w * 0.5 - 7, ty - 34, 14, 34, 4).fill(0xf7ecd4);
    g.circle(w * 0.5, ty - 42, 7 + Math.sin(timeSec * 8) * 1.6).fill(0xffd452);
    return;
  }

  if (set === "city_crosswalk" || set === "street") {
    drawVerticalBands(g, w, h * 0.62, night ? 0x070c1a : 0x5e92c2, night ? 0x182840 : 0xb7d5eb);
    // Skyline buildings
    for (let i = 0; i < 9; i++) {
      const bx = i * (w / 8.5);
      const bh = h * (0.18 + rng() * 0.22);
      const bw = w * 0.135;
      const by = h * 0.62 - bh;
      g.roundRect(bx, by, bw, bh, 4).fill(night ? 0x0d1629 : 0x4e6680);
      if (night) {
        for (let wy = by + 18; wy < h * 0.58; wy += 28) {
          for (let wx = bx + 12; wx < bx + bw - 16; wx += 22) {
            if (rng() > 0.58) g.rect(wx, wy, 10, 14).fill(0xffd884);
          }
        }
      }
    }
    // Asphalt + zebra stripes
    g.rect(0, h * 0.62, w, h * 0.38).fill(night ? 0x0e1522 : 0x3a424d);
    for (let i = 0; i < 6; i++) {
      const x0 = w * (0.06 + i * 0.155);
      g.poly([x0, h * 0.77, x0 + w * 0.09, h * 0.77, x0 + w * 0.07, h * 0.85, x0 - w * 0.02, h * 0.85]).fill({
        color: 0xe2e8f4,
        alpha: night ? 0.35 : 0.72,
      });
    }
    if (set === "city_crosswalk") {
      const px = w * 0.86;
      const py = h * 0.34;
      g.rect(px - 4, py, 8, h * 0.36).fill(0x263242);
      g.roundRect(px - 20, py, 40, 108, 8).fill(0x151c26);
      const phase = Math.floor(timeSec * 0.6) % 3;
      const cols = [0xff4252, 0xffd045, 0x4ce6a0];
      cols.forEach((c, i) => {
        g.circle(px, py + 22 + i * 32, 10).fill({ color: c, alpha: phase === i ? 0.96 : 0.22 });
      });
    }
    return;
  }

  if (set === "memory_corridor") {
    drawVerticalBands(g, w, h, 0x060814, 0x17132b);
    const vx = w * 0.5;
    const vy = h * 0.46;
    g.circle(vx, vy, Math.min(w, h) * 0.32).fill({ color: mood === "ice" ? 0x4ce6c8 : 0xffd478, alpha: 0.18 });
    for (let k = 1; k <= 7; k++) {
      const p = (k / 7 + ((timeSec * 0.08) % (1 / 7)));
      const s = p * p;
      const rw = w * 0.94 * s;
      const rh = h * 0.86 * s;
      g.roundRect(vx - rw * 0.5, vy - rh * 0.5, rw, rh, 8).stroke({
        color: k % 2 ? 0x4ce6c8 : 0xffd478,
        width: 2.2,
        alpha: 0.65,
      });
    }
    return;
  }

  if (set === "sunset_hill" || set === "park" || set === "forest") {
    drawVerticalBands(
      g,
      w,
      h * 0.76,
      night ? 0x0d1229 : set === "park" ? 0x5ea2d8 : 0x2c1d3d,
      night ? 0x25284c : set === "park" ? 0xc2e2f5 : 0xe38b5b,
    );
    const sy = h * 0.42;
    g.circle(w * 0.5, sy, Math.min(w, h) * 0.22).fill({ color: night ? 0x9ec0ff : 0xffd478, alpha: 0.28 });
    g.circle(w * 0.5, sy, Math.min(w, h) * 0.09).fill({ color: night ? 0xe6f2ff : 0xfff2cc, alpha: 0.9 });
    // Rolling hills
    g.ellipse(w * 0.3, h * 0.78, w * 0.65, h * 0.18).fill(night ? 0x182038 : set === "park" ? 0x3b7a52 : 0x4a304d);
    g.ellipse(w * 0.75, h * 0.82, w * 0.65, h * 0.18).fill(night ? 0x11182c : set === "park" ? 0x2d6140 : 0x2c1f36);
    g.rect(0, h * 0.78, w, h * 0.22).fill(night ? 0x0f1220 : set === "park" ? 0x234c32 : 0x140e1c);
    return;
  }

  // Clean architectural studio fallback (cafe, childhood_room, studio, library, hospital)
  drawVerticalBands(
    g,
    w,
    h * 0.74,
    night ? 0x1a2036 : set === "hospital" ? 0xdbe7ee : 0x4f3d56,
    night ? 0x0e1324 : set === "hospital" ? 0xb8ccd9 : 0x2c2233,
  );
  g.rect(0, h * 0.74, w, h * 0.26).fill(night ? 0x161822 : 0x3c2e28);
  drawWindow(g, w * 0.55, h * 0.18, w * 0.32, h * 0.22, night, 0x8dbce0);
}
