export function hexToNumber(hex: string | undefined, fallback = 0xffffff): number {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 6 || clean.length === 8) {
    const num = Number.parseInt(clean.slice(0, 6), 16);
    return Number.isFinite(num) ? num : fallback;
  }
  return fallback;
}

export function hexAlpha(hex: string | undefined, fallback = 1): number {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 8) {
    const a = Number.parseInt(clean.slice(6, 8), 16);
    return Number.isFinite(a) ? a / 255 : fallback;
  }
  return fallback;
}

export function hexToRgbNorm(hex: string | undefined, fallback: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const n = hexToNumber(hex, -1);
  if (n < 0) return fallback;
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

export function shadeColor(hex: string | number | undefined, factor: number): number {
  const n = typeof hex === "number" ? hex : hexToNumber(hex, 0x808080);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 0xff) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 0xff) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((n & 0xff) * factor)));
  return (r << 16) | (g << 8) | b;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Fast deterministic PRNG (Mulberry32) so particles & procedural sets match 1:1 on export. */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
