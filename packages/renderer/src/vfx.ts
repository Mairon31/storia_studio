import { Graphics } from "pixi.js";
import type { Layer } from "@storia/schema";
import { clamp, createSeededRng, hexToNumber } from "./color.js";

type VfxLayer = Extract<Layer, { type: "vfx" }>;

export type OverlayVfxEffect =
  | VfxLayer["effect"]
  | "light_leaks"
  | "spotlight"
  | "confetti"
  | "bokeh_lights"
  | "matrix_rain"
  | "lens_flare_sweep"
  | "fireflies"
  | "starfield";

/**
 * Shared deterministic VFX painter used both by Scene VFX layers and by timed EffectClips.
 */
export function drawVfxEffect(
  g: Graphics,
  params: {
    effect: OverlayVfxEffect;
    intensity: number;
    color: string;
    seed: number;
    speed?: number;
  },
  w: number,
  h: number,
  timeSec: number,
  clearFirst = true,
): void {
  if (clearFirst) g.clear();
  const rng = createSeededRng(params.seed * 131 + 17);
  const col = hexToNumber(params.color, 0xffd447);
  const strength = params.intensity;
  const spd = params.speed ?? 1;
  const t = timeSec * spd;

  switch (params.effect) {
    case "embers":
    case "dust": {
      const count = Math.round(45 * strength);
      for (let i = 0; i < count; i++) {
        const bx = rng();
        const by = rng();
        const sp = 0.04 + rng() * 0.09;
        const r = (params.effect === "embers" ? 2.2 : 1.6) + rng() * 3.2;
        const y = ((by - t * sp) % 1 + 1) % 1;
        const x = (bx + Math.sin(t * 1.4 + i) * 0.025 + 1) % 1;
        const alpha = (0.3 + 0.65 * Math.sin(y * Math.PI)) * Math.min(1, strength);
        g.circle(x * w, y * h, r).fill({ color: col, alpha });
      }
      break;
    }

    case "rain": {
      const count = Math.round(80 * strength);
      for (let i = 0; i < count; i++) {
        const bx = rng();
        const by = rng();
        const sp = 0.9 + rng() * 0.6;
        const y = ((by + t * sp) % 1) * h;
        const x = (((bx - t * 0.12) % 1) + 1) % 1 * w;
        const len = 18 + rng() * 24;
        g.moveTo(x, y).lineTo(x - len * 0.22, y + len).stroke({
          color: 0xaad8ff,
          width: 1.5,
          alpha: 0.38 * Math.min(1, strength),
        });
      }
      break;
    }

    case "snow": {
      const count = Math.round(60 * strength);
      for (let i = 0; i < count; i++) {
        const bx = rng();
        const by = rng();
        const sp = 0.06 + rng() * 0.08;
        const y = ((by + t * sp) % 1) * h;
        const x = (((bx + Math.sin(t * 1.2 + i) * 0.03) % 1) + 1) % 1 * w;
        g.circle(x, y, 2 + rng() * 3.5).fill({ color: 0xffffff, alpha: 0.65 * Math.min(1, strength) });
      }
      break;
    }

    case "god_rays": {
      const count = 5;
      for (let i = 0; i < count; i++) {
        const spread = (i - 2) * 0.16 + Math.sin(t * 0.4 + i) * 0.02;
        const topX = w * (0.5 + spread * 0.4);
        const botX = w * (0.5 + spread * 1.5);
        const bw = w * 0.12;
        g.poly([topX - bw * 0.3, 0, topX + bw * 0.3, 0, botX + bw, h, botX - bw, h]).fill({
          color: col,
          alpha: 0.065 * Math.min(1.5, strength),
        });
      }
      break;
    }

    case "speed_lines": {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const maxR = Math.hypot(w, h) * 0.65;
      const count = Math.round(28 * strength);
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.sin(Math.floor(t * 12) + i) * 0.05;
        const innerR = maxR * (0.56 + rng() * 0.18);
        g.moveTo(cx + Math.cos(ang) * innerR, cy + Math.sin(ang) * innerR)
          .lineTo(cx + Math.cos(ang) * maxR, cy + Math.sin(ang) * maxR)
          .stroke({ color: col, width: 2 + rng() * 3, alpha: 0.45 * Math.min(1, strength) });
      }
      break;
    }

    case "impact_burst": {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const pulse = (t * 1.5) % 1;
      const rad = Math.min(w, h) * (0.14 + pulse * 0.24);
      const alpha = (1 - pulse) * 0.8 * Math.min(1, strength);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g.moveTo(cx + Math.cos(a) * rad * 0.45, cy + Math.sin(a) * rad * 0.45)
          .lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad)
          .stroke({ color: col, width: 4, alpha, cap: "round" });
      }
      break;
    }

    case "light_leak":
    case "light_leaks": {
      const shift = Math.sin(t * 0.8) * w * 0.15;
      g.circle(w * 0.12 + shift, h * 0.25, Math.min(w, h) * 0.42).fill({ color: col, alpha: 0.18 * strength });
      g.circle(w * 0.88 - shift, h * 0.72, Math.min(w, h) * 0.36).fill({ color: 0xf7c8d6, alpha: 0.14 * strength });
      // Anamorphic horizontal streak
      g.rect(0, h * 0.32 + Math.sin(t) * 14, w, Math.max(8, h * 0.025)).fill({ color: col, alpha: 0.12 * strength });
      break;
    }

    case "spotlight": {
      const cx = w * 0.5 + Math.sin(t * 0.6) * w * 0.05;
      const cy = h * 0.44;
      const r = Math.min(w, h) * 0.42;
      // Soft dark border bands framing the spotlight center
      const alpha = Math.min(0.68, 0.42 * strength);
      g.rect(0, 0, w, Math.max(0, cy - r)).fill({ color: 0x05070e, alpha });
      g.rect(0, Math.min(h, cy + r), w, Math.max(0, h - (cy + r))).fill({ color: 0x05070e, alpha });
      g.circle(cx, cy, r * 1.05).fill({ color: col, alpha: 0.11 * Math.min(1.3, strength) });
      break;
    }

    case "confetti": {
      const palette = [col, 0xffd447, 0x4ce6c8, 0xff5c8a, 0x60a5fa, 0xa855f7];
      const count = Math.round(48 * Math.min(2, strength));
      for (let i = 0; i < count; i++) {
        const bx = rng() * w;
        const by = rng() * h;
        const vy = 75 + rng() * 145;
        const sway = Math.sin(t * (2.5 + rng() * 3) + i) * 28;
        const x = ((bx + sway) % w + w) % w;
        const y = (by + t * vy) % (h + 24) - 12;
        const cw = 6 + rng() * 8;
        const ch = 4 + rng() * 5;
        const flip = Math.abs(Math.cos(t * 5 + i * 1.3));
        g.rect(x - cw * 0.5, y - ch * 0.5, cw, Math.max(1.5, ch * flip)).fill({
          color: palette[i % palette.length]!,
          alpha: Math.min(0.92, 0.72 * strength),
        });
      }
      break;
    }

    case "bokeh_lights": {
      const count = Math.round(22 * Math.min(2, strength));
      for (let i = 0; i < count; i++) {
        const bx = rng() * w;
        const by = rng() * h;
        const r = (18 + rng() * 52) * (Math.min(w, h) / 1080);
        const x = bx + Math.sin(t * (0.4 + rng() * 0.6) + i) * 32;
        const y = ((by - t * (12 + rng() * 20)) % (h + r * 2) + (h + r * 2)) % (h + r * 2) - r;
        const pulse = 0.55 + 0.45 * Math.sin(t * 1.8 + i * 2.1);
        g.circle(x, y, r).fill({ color: i % 3 === 0 ? 0xffffff : col, alpha: 0.14 * pulse * Math.min(1.4, strength) });
        g.circle(x, y, r).stroke({ color: col, width: 1.5, alpha: 0.22 * pulse * Math.min(1.4, strength) });
      }
      break;
    }

    case "matrix_rain": {
      const cols = Math.max(18, Math.round(w / 28));
      const dropH = Math.max(10, h * 0.022);
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * (w / cols);
        const speed = 160 + rng() * 240;
        const startY = rng() * h;
        const headY = (startY + t * speed) % (h + 180) - 90;
        const trailLen = 6 + Math.floor(rng() * 8);
        for (let k = 0; k < trailLen; k++) {
          const y = headY - k * (dropH * 0.9);
          if (y < -20 || y > h + 20) continue;
          const a = (1 - k / trailLen) * 0.52 * Math.min(1.5, strength);
          g.rect(x - 3, y, 6, dropH * 0.65).fill({ color: k === 0 ? 0xdcfce7 : col, alpha: a });
        }
      }
      break;
    }

    case "lens_flare_sweep": {
      const sweepX = ((t * 0.35) % 1.4 - 0.2) * w;
      const cy = h * 0.36;
      const r = Math.min(w, h) * 0.22;
      g.circle(sweepX, cy, r * 1.2).fill({ color: col, alpha: 0.16 * Math.min(1.4, strength) });
      g.circle(sweepX, cy, r * 0.45).fill({ color: 0xffffff, alpha: 0.28 * Math.min(1.4, strength) });
      // Anamorphic horizontal light bar
      g.rect(0, cy - 4, w, 8).fill({ color: col, alpha: 0.22 * Math.min(1.4, strength) });
      g.rect(0, cy - 1.5, w, 3).fill({ color: 0xffffff, alpha: 0.4 * Math.min(1.4, strength) });
      // Secondary ghost rings opposite center
      const gx = w - sweepX;
      g.circle(gx, h - cy, r * 0.36).stroke({ color: col, width: 3, alpha: 0.22 * strength });
      break;
    }

    case "fireflies": {
      const count = Math.round(30 * Math.min(2, strength));
      for (let i = 0; i < count; i++) {
        const bx = rng() * w;
        const by = rng() * h;
        const x = bx + Math.sin(t * (0.9 + rng() * 1.1) + i * 2.4) * 44;
        const y = by + Math.cos(t * (0.8 + rng() * 0.9) + i * 1.7) * 32;
        const blink = Math.pow(0.5 + 0.5 * Math.sin(t * (2.5 + rng() * 3.5) + i * 3.1), 2);
        const r = (2.5 + rng() * 3.5) * (Math.min(w, h) / 1080);
        g.circle(x, y, r * 3.2).fill({ color: col, alpha: 0.22 * blink * strength });
        g.circle(x, y, r).fill({ color: 0xffffff, alpha: 0.85 * blink * Math.min(1.2, strength) });
      }
      break;
    }

    case "starfield": {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const maxR = Math.hypot(cx, cy);
      const count = Math.round(64 * Math.min(2, strength));
      for (let i = 0; i < count; i++) {
        const angle = rng() * Math.PI * 2;
        const phase = (rng() + t * (0.35 + rng() * 0.45)) % 1;
        const dist = Math.pow(phase, 2) * maxR;
        const prevDist = Math.max(0, dist - (14 + phase * 36));
        const x1 = cx + Math.cos(angle) * prevDist;
        const y1 = cy + Math.sin(angle) * prevDist;
        const x2 = cx + Math.cos(angle) * dist;
        const y2 = cy + Math.sin(angle) * dist;
        g.moveTo(x1, y1).lineTo(x2, y2).stroke({
          color: i % 4 === 0 ? col : 0xffffff,
          width: Math.max(1, phase * 3),
          alpha: clamp(phase * 0.9 * strength, 0, 0.95),
        });
      }
      break;
    }
  }
}

export function drawVfxLayer(
  g: Graphics,
  layer: VfxLayer,
  w: number,
  h: number,
  timeSec: number,
): void {
  drawVfxEffect(
    g,
    {
      effect: layer.effect,
      intensity: layer.intensity,
      color: layer.color,
      seed: layer.seed,
    },
    w,
    h,
    timeSec,
    true,
  );
}

/**
 * Built-in procedural vector props for instant staging even before custom SVGs are uploaded.
 */
export function drawProceduralProp(g: Graphics, propName: string, sizePx: number, timeSec: number): void {
  g.clear();
  const r = sizePx * 0.45;
  const key = propName.toLowerCase();

  if (key.includes("watch") || key.includes("clock")) {
    g.circle(0, -r * 1.15, r * 0.22).stroke({ color: 0xd9a13b, width: r * 0.1 });
    g.circle(0, 0, r).fill(0xd9a13b).stroke({ color: 0x2b1606, width: 4 });
    g.circle(0, 0, r * 0.84).fill(0xf5ead2).stroke({ color: 0x6b4214, width: 2.5 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.moveTo(Math.cos(a) * r * 0.68, Math.sin(a) * r * 0.68)
        .lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78)
        .stroke({ color: 0x26180d, width: i % 3 === 0 ? 3.5 : 1.8 });
    }
    const minAng = timeSec * 0.8 - Math.PI / 2;
    const hrAng = timeSec * 0.12 - Math.PI / 2;
    g.moveTo(0, 0).lineTo(Math.cos(hrAng) * r * 0.46, Math.sin(hrAng) * r * 0.46).stroke({ color: 0x1b3254, width: 5, cap: "round" });
    g.moveTo(0, 0).lineTo(Math.cos(minAng) * r * 0.66, Math.sin(minAng) * r * 0.66).stroke({ color: 0x1b3254, width: 3.5, cap: "round" });
    g.circle(0, 0, r * 0.08).fill(0xd92b45);
    return;
  }

  if (key.includes("heart")) {
    g.moveTo(0, r * 0.85)
      .bezierCurveTo(-r * 1.15, r * 0.15, -r * 1.05, -r * 0.95, 0, -r * 0.32)
      .bezierCurveTo(r * 1.05, -r * 0.95, r * 1.15, r * 0.15, 0, r * 0.85)
      .fill(0xd9587a)
      .stroke({ color: 0x2d0b17, width: 4 });
    g.moveTo(0, -r * 0.3).lineTo(-r * 0.14, r * 0.1).lineTo(r * 0.14, r * 0.38).lineTo(0, r * 0.82)
      .stroke({ color: 0xffd447, width: 5, cap: "round" });
    return;
  }

  if (key.includes("hourglass")) {
    g.roundRect(-r * 0.75, -r, r * 1.5, r * 0.16, 6).fill(0xd99c38).stroke({ color: 0x2b1506, width: 3 });
    g.roundRect(-r * 0.75, r * 0.84, r * 1.5, r * 0.16, 6).fill(0xd99c38).stroke({ color: 0x2b1506, width: 3 });
    g.poly([-r * 0.6, -r * 0.84, r * 0.6, -r * 0.84, 0, 0, r * 0.6, r * 0.84, -r * 0.6, r * 0.84, 0, 0])
      .fill({ color: 0x182b47, alpha: 0.75 })
      .stroke({ color: 0xfff0c4, width: 3 });
    g.poly([-r * 0.42, r * 0.8, r * 0.42, r * 0.8, 0, r * 0.32]).fill(0xffcf52);
    return;
  }

  // Default: luminous crystal emblem
  g.poly([0, -r, r * 0.75, 0, 0, r, -r * 0.75, 0])
    .fill({ color: 0x4ce6c8, alpha: 0.85 })
    .stroke({ color: 0xffffff, width: 3.5 });
}
