import { Graphics } from "pixi.js";
import type { FacialHairStyle, HairStyle, HatStyle } from "@storia/schema";
import { shadeColor } from "./color.js";
import type { SecondaryMotionSample } from "./rigKinematics.js";

export interface HairRenderParams {
  g: Graphics;
  hairStyle: HairStyle;
  hair: number;
  hairDark: number;
  hairLight: number;
  accent: number;
  outline: number;
  /** Head radius scale factor (`hr / 41`). */
  fs: number;
  isFemale: boolean;
  isSilhouette: boolean;
  hairBow: boolean;
  effectiveHat: HatStyle;
  pendulum: SecondaryMotionSample;
}

/**
 * Draws the back-of-head hair silhouette in head-local coordinates (origin = center of head).
 * Placed in a container synchronized with `headContainer`'s position & rotation behind the torso,
 * completely fixing the bug where back hair detached when tilting the head.
 */
export function drawBackHair(p: HairRenderParams): void {
  const { g, hairStyle, hair, hairDark, accent, outline, fs, isSilhouette, effectiveHat, pendulum } = p;
  if (
    isSilhouette ||
    hairStyle === "bald" ||
    hairStyle === "buzz" ||
    effectiveHat === "astronaut_helmet" ||
    effectiveHat === "knight_helm" ||
    effectiveHat === "ninja_hood" ||
    effectiveHat === "samurai_kabuto"
  ) {
    return;
  }

  const hr = 41 * fs;
  const sway = pendulum.swayX * fs;
  const lagY = pendulum.lagY * fs * 0.45;

  if (hairStyle === "long" || hairStyle === "wavy" || hairStyle === "bangs_long") {
    const wave = hairStyle === "wavy" ? 11 * fs : 0;
    g.moveTo(-hr * 0.96, -hr * 0.92)
      .bezierCurveTo(-hr * 1.44 - wave, -hr * 0.15, -hr * 1.38 + sway + wave, hr * 2.15 + lagY, -hr * 0.94 + sway, hr * 3.22 + lagY)
      .quadraticCurveTo(sway * 0.45, hr * 3.55 + lagY, hr * 0.94 + sway, hr * 3.22 + lagY)
      .bezierCurveTo(hr * 1.38 + sway - wave, hr * 2.15 + lagY, hr * 1.44 + wave, -hr * 0.15, hr * 0.96, -hr * 0.92)
      .quadraticCurveTo(0, -hr * 1.42, -hr * 0.96, -hr * 0.92)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.9, join: "round" });
    // Subtle vertical strand depth inside back hair
    for (const dx of [-0.62, 0.62]) {
      g.moveTo(dx * hr, hr * 0.55)
        .quadraticCurveTo(dx * hr * 1.08 + sway * 0.5, hr * 1.85, dx * hr * 0.85 + sway, hr * 2.95 + lagY)
        .stroke({ color: hair, width: 2.2 * fs, alpha: 0.35, cap: "round" });
    }
  } else if (hairStyle === "long_layered") {
    // Rich tiered shoulder-to-mid-back layers connected smoothly from the upper crown
    g.moveTo(-hr * 0.98, -hr * 0.92)
      .bezierCurveTo(-hr * 1.5, -hr * 0.1, -hr * 1.48 + sway * 0.7, hr * 2.0, -hr * 1.18 + sway, hr * 3.38 + lagY)
      .quadraticCurveTo(-hr * 0.55 + sway * 0.7, hr * 3.12 + lagY, 0 + sway * 0.5, hr * 3.6 + lagY)
      .quadraticCurveTo(hr * 0.55 + sway * 0.7, hr * 3.12 + lagY, hr * 1.18 + sway, hr * 3.38 + lagY)
      .bezierCurveTo(hr * 1.48 + sway * 0.7, hr * 2.0, hr * 1.5, -hr * 0.1, hr * 0.98, -hr * 0.92)
      .quadraticCurveTo(0, -hr * 1.44, -hr * 0.98, -hr * 0.92)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.9, join: "round" });
  } else if (hairStyle === "half_up") {
    // Flowing back fall + subtle top gather silhouette
    g.moveTo(-hr * 0.94, -hr * 0.88)
      .bezierCurveTo(-hr * 1.4, -hr * 0.1, -hr * 1.26 + sway, hr * 2.1, -hr * 0.88 + sway, hr * 2.92 + lagY)
      .quadraticCurveTo(sway * 0.4, hr * 3.22 + lagY, hr * 0.88 + sway, hr * 2.92 + lagY)
      .bezierCurveTo(hr * 1.26 + sway, hr * 2.1, hr * 1.4, -hr * 0.1, hr * 0.94, -hr * 0.88)
      .quadraticCurveTo(0, -hr * 1.38, -hr * 0.94, -hr * 0.88)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.8, join: "round" });
  } else if (hairStyle === "bob") {
    g.moveTo(-hr * 0.98, -hr * 0.88)
      .bezierCurveTo(-hr * 1.42, -hr * 0.08, -hr * 1.28 + sway * 0.35, hr * 1.48, -hr * 0.64 + sway * 0.25, hr * 1.44)
      .lineTo(hr * 0.64 + sway * 0.25, hr * 1.44)
      .bezierCurveTo(hr * 1.28 + sway * 0.35, hr * 1.48, hr * 1.42, -hr * 0.08, hr * 0.98, -hr * 0.88)
      .quadraticCurveTo(0, -hr * 1.4, -hr * 0.98, -hr * 0.88)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.8, join: "round" });
  } else if (hairStyle === "braids") {
    for (const side of [-1, 1]) {
      const bx = side * hr * 0.96;
      const tipX = bx + side * 6 * fs + sway * 0.85;
      const tipY = hr * 2.65 + lagY;
      g.moveTo(bx - side * 4 * fs, hr * 0.18)
        .bezierCurveTo(bx + side * 14 * fs, hr * 0.9, bx + side * 16 * fs + sway * 0.5, hr * 1.9, tipX, tipY)
        .bezierCurveTo(bx - side * 8 * fs + sway * 0.4, hr * 1.9, bx - side * 10 * fs, hr * 0.9, bx - side * 4 * fs, hr * 0.18)
        .closePath()
        .fill(hairDark)
        .stroke({ color: outline, width: 2.6, join: "round" });
      for (let k = 0; k < 5; k++) {
        const u = (k + 1) / 6;
        const yy = hr * 0.3 + u * hr * 2.15;
        const xx = bx + sway * u * 0.65;
        g.moveTo(xx - 6 * fs, yy).lineTo(xx + 7 * fs, yy + 6 * fs).stroke({ color: hair, width: 2.4, cap: "round" });
      }
      g.circle(tipX, tipY - 5 * fs, 5.5 * fs).fill(accent).stroke({ color: outline, width: 1.8 });
    }
  } else if (hairStyle === "ponytail") {
    const s = sway * 1.15;
    g.moveTo(-hr * 0.52, -hr * 0.44)
      .bezierCurveTo(-hr * 1.72, -hr * 0.26, -hr * 1.82 + s, hr * 1.15, -hr * 1.15 + s, hr * 2.38 + lagY)
      .bezierCurveTo(-hr * 0.82 + s * 0.45, hr * 1.42, -hr * 1.0, hr * 0.2, -hr * 0.52, -hr * 0.1)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.ellipse(-hr * 0.78, -hr * 0.3, 6.5 * fs, 10 * fs).fill(accent).stroke({ color: outline, width: 2.0 });
  } else if (hairStyle === "twin_tails") {
    for (const side of [-1, 1]) {
      const s = sway * 0.95;
      g.moveTo(side * hr * 0.72, -hr * 0.58)
        .bezierCurveTo(side * hr * 1.68, -hr * 0.35, side * hr * 1.76 + s, hr * 1.05, side * hr * 1.24 + s, hr * 2.45 + lagY)
        .bezierCurveTo(side * hr * 0.86 + s * 0.4, hr * 1.55, side * hr * 1.05, hr * 0.25, side * hr * 0.72, -hr * 0.22)
        .closePath()
        .fill(hairDark)
        .stroke({ color: outline, width: 2.8, join: "round" });
      g.ellipse(side * hr * 0.88, -hr * 0.42, 7 * fs, 9.5 * fs).fill(accent).stroke({ color: outline, width: 2.0 });
    }
  } else if (hairStyle === "side_bun") {
    g.circle(hr * 0.96, -hr * 0.32, 22 * fs).fill(hairDark).stroke({ color: outline, width: 2.8 });
    g.ellipse(hr * 0.8, -hr * 0.32, 6 * fs, 13 * fs).fill(accent).stroke({ color: outline, width: 1.8 });
  } else if (hairStyle === "afro") {
    // Rich voluminous rounded afro halo behind head
    const puffs: [number, number, number][] = [
      [-46, -24, 24],
      [-50, 4, 22],
      [-32, -48, 25],
      [0, -56, 27],
      [32, -48, 25],
      [50, 4, 22],
      [46, -24, 24],
    ];
    for (const [cx, cy, r] of puffs) {
      g.circle(cx * fs, cy * fs, r * fs).fill(hairDark).stroke({ color: outline, width: 2.8 });
    }
  } else if (hairStyle === "dreadlocks") {
    for (let i = -3; i <= 3; i++) {
      const dx = i * 14 * fs;
      const len = (108 + (Math.abs(i) % 2) * 20) * fs;
      g.moveTo(dx, -hr * 0.15)
        .quadraticCurveTo(dx + sway * 0.55, hr * 0.95, dx + sway * 0.95, len + lagY)
        .stroke({ color: outline, width: 13.5 * fs, cap: "round" });
      g.moveTo(dx, -hr * 0.15)
        .quadraticCurveTo(dx + sway * 0.55, hr * 0.95, dx + sway * 0.95, len + lagY)
        .stroke({ color: i % 2 === 0 ? hairDark : hair, width: 8.5 * fs, cap: "round" });
    }
  }
}

/**
 * Draws the front hair crown, sculpted bangs, sideburns/side locks, and specular hair ribbon
 * for all 26 hair styles (men's & women's).
 */
export function drawFrontHair(p: HairRenderParams): void {
  const { g, hairStyle, hair, hairDark, hairLight, accent, outline, fs, isFemale, isSilhouette, hairBow, effectiveHat, pendulum } = p;
  if (
    isSilhouette ||
    hairStyle === "bald" ||
    effectiveHat === "knight_helm" ||
    effectiveHat === "ninja_hood" ||
    effectiveHat === "samurai_kabuto"
  ) {
    return;
  }

  const sway = pendulum.swayX * fs * 0.35;

  if (hairStyle === "buzz") {
    // Tight cropped buzzcut hairline
    g.moveTo(-37 * fs, -22 * fs)
      .bezierCurveTo(-36 * fs, -60 * fs, 36 * fs, -60 * fs, 37 * fs, -22 * fs)
      .quadraticCurveTo(0, -34 * fs, -37 * fs, -22 * fs)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.5, join: "round" });
    return;
  }

  if (hairStyle === "curly") {
    const puffs: [number, number, number][] = [
      [-35, -26, 17],
      [-20, -45, 19],
      [0, -51, 20],
      [20, -45, 19],
      [35, -26, 17],
    ];
    for (const [cx, cy, r] of puffs) {
      g.circle(cx * fs, cy * fs, r * fs).fill(hair).stroke({ color: outline, width: 2.8 });
    }
    g.arc(-10 * fs, -48 * fs, 11 * fs, Math.PI * 1.1, Math.PI * 1.7).stroke({ color: hairLight, width: 2.8, alpha: 0.36, cap: "round" });
  } else if (hairStyle === "afro") {
    g.moveTo(-42 * fs, -18 * fs)
      .bezierCurveTo(-48 * fs, -68 * fs, 48 * fs, -68 * fs, 42 * fs, -18 * fs)
      .quadraticCurveTo(0, -34 * fs, -42 * fs, -18 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.8, join: "round" });
    for (const [cx, cy] of [[-22, -46], [0, -54], [22, -46]] as [number, number][]) {
      g.arc(cx * fs, cy * fs, 9 * fs, Math.PI * 1.0, Math.PI * 1.8).stroke({ color: hairLight, width: 2.4, alpha: 0.32, cap: "round" });
    }
  } else if (hairStyle === "pompadour") {
    // Classic sculptural men's pompadour + clean tapered sides
    g.moveTo(-39 * fs, -16 * fs)
      .bezierCurveTo(-46 * fs, -46 * fs, -30 * fs, -74 * fs, 8 * fs, -72 * fs)
      .bezierCurveTo(38 * fs, -70 * fs, 50 * fs, -46 * fs, 40 * fs, -18 * fs)
      .bezierCurveTo(28 * fs, -34 * fs, 8 * fs, -38 * fs, -14 * fs, -32 * fs)
      .quadraticCurveTo(-30 * fs, -28 * fs, -39 * fs, -16 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 3.0, join: "round" });
    // Pomp swirl highlight
    g.moveTo(-22 * fs, -54 * fs)
      .bezierCurveTo(-2 * fs, -68 * fs, 26 * fs, -62 * fs, 32 * fs, -42 * fs)
      .stroke({ color: hairLight, width: 4.0, alpha: 0.42, cap: "round" });
  } else if (hairStyle === "undercut") {
    // Tapered shaved lower temples (high & clean above ear, never blocky cheek strips) + voluminous swept top quiff
    for (const side of [-1, 1]) {
      g.moveTo(side * 38 * fs, -26 * fs)
        .quadraticCurveTo(side * 40 * fs, -18 * fs, side * 37 * fs, -12 * fs)
        .quadraticCurveTo(side * 34 * fs, -17 * fs, side * 32 * fs, -25 * fs)
        .closePath()
        .fill(shadeColor(hairDark, 0.9))
        .stroke({ color: outline, width: 1.6, join: "round" });
    }
    g.moveTo(-36 * fs, -26 * fs)
      .bezierCurveTo(-40 * fs, -64 * fs, 16 * fs, -72 * fs, 42 * fs, -34 * fs)
      .quadraticCurveTo(18 * fs, -44 * fs, -4 * fs, -34 * fs)
      .quadraticCurveTo(-22 * fs, -32 * fs, -36 * fs, -26 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.8, join: "round" });
    g.moveTo(-18 * fs, -50 * fs).quadraticCurveTo(8 * fs, -58 * fs, 28 * fs, -44 * fs).stroke({ color: hairLight, width: 3.4, alpha: 0.38, cap: "round" });
  } else if (hairStyle === "spiky") {
    // Dynamic multi-spike men's/anime hair crown
    g.moveTo(-40 * fs, -16 * fs)
      .lineTo(-47 * fs, -40 * fs)
      .lineTo(-32 * fs, -44 * fs)
      .lineTo(-34 * fs, -66 * fs)
      .lineTo(-14 * fs, -54 * fs)
      .lineTo(0, -76 * fs)
      .lineTo(14 * fs, -54 * fs)
      .lineTo(34 * fs, -66 * fs)
      .lineTo(32 * fs, -44 * fs)
      .lineTo(47 * fs, -40 * fs)
      .lineTo(40 * fs, -16 * fs)
      .quadraticCurveTo(22 * fs, -34 * fs, 10 * fs, -24 * fs)
      .quadraticCurveTo(0, -36 * fs, -12 * fs, -24 * fs)
      .quadraticCurveTo(-26 * fs, -34 * fs, -40 * fs, -16 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.9, join: "round" });
  } else if (hairStyle === "mohawk") {
    // High punk/warrior central crest
    g.moveTo(-14 * fs, -34 * fs)
      .lineTo(-18 * fs, -80 * fs)
      .lineTo(-4 * fs, -72 * fs)
      .lineTo(4 * fs, -86 * fs)
      .lineTo(16 * fs, -70 * fs)
      .lineTo(14 * fs, -34 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.9, join: "round" });
  } else if (hairStyle === "slick_back") {
    // Combed-back refined executive silhouette with sleek directional ridges
    g.moveTo(-40 * fs, -14 * fs)
      .bezierCurveTo(-44 * fs, -64 * fs, 44 * fs, -64 * fs, 40 * fs, -14 * fs)
      .quadraticCurveTo(26 * fs, -38 * fs, 0, -40 * fs)
      .quadraticCurveTo(-26 * fs, -38 * fs, -40 * fs, -14 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 3.0, join: "round" });
    for (const dx of [-18, -6, 8, 20]) {
      g.moveTo(dx * fs, -40 * fs)
        .quadraticCurveTo((dx + 3) * fs, -54 * fs, (dx - 2) * fs, -58 * fs)
        .stroke({ color: hairLight, width: 2.2, alpha: 0.36, cap: "round" });
    }
  } else if (hairStyle === "side_sweep") {
    // Graceful asymmetric swept curtain fringe cleanly framing eyebrows
    g.moveTo(-39 * fs, -13 * fs)
      .bezierCurveTo(-44 * fs, -38 * fs, -36 * fs, -66 * fs, 0, -66 * fs)
      .bezierCurveTo(36 * fs, -66 * fs, 44 * fs, -38 * fs, 39 * fs, -14 * fs)
      .quadraticCurveTo(35 * fs, -24 * fs, 30 * fs, -28 * fs)
      .bezierCurveTo(16 * fs, -33 * fs, -2 * fs, -26 * fs, -26 * fs, -22 * fs)
      .quadraticCurveTo(-34 * fs, -22 * fs, -39 * fs, -13 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.6, join: "round" });
    g.moveTo(-20 * fs, -45 * fs).quadraticCurveTo(4 * fs, -53 * fs, 24 * fs, -40 * fs).stroke({ color: hairLight, width: 3.4, alpha: 0.36, cap: "round" });
  } else if (hairStyle === "pixie") {
    // Feminine soft feathered pixie crop cleanly framing forehead & cheekbones
    g.moveTo(-39 * fs, -10 * fs)
      .bezierCurveTo(-44 * fs, -36 * fs, -36 * fs, -65 * fs, 0, -65 * fs)
      .bezierCurveTo(36 * fs, -65 * fs, 44 * fs, -36 * fs, 39 * fs, -12 * fs)
      .quadraticCurveTo(35 * fs, -22 * fs, 29 * fs, -26 * fs)
      .bezierCurveTo(16 * fs, -32 * fs, 4 * fs, -29 * fs, -8 * fs, -25 * fs)
      .quadraticCurveTo(-24 * fs, -26 * fs, -34 * fs, -16 * fs)
      .quadraticCurveTo(-37 * fs, -14 * fs, -39 * fs, -10 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.6, join: "round" });
    g.moveTo(-20 * fs, -44 * fs).quadraticCurveTo(0, -53 * fs, 22 * fs, -42 * fs).stroke({ color: hairLight, width: 3.4, alpha: 0.38, cap: "round" });
  } else if (hairStyle === "bangs_long") {
    // Seamless unified silhouette: full crown + airy feathered bangs + integrated face-framing cheek locks (no helmet seam!)
    g.moveTo(-36 * fs + sway * 0.6, 36 * fs)
      .bezierCurveTo(-45 * fs, 14 * fs, -46 * fs, -24 * fs, -41 * fs, -44 * fs)
      .bezierCurveTo(-32 * fs, -69 * fs, 32 * fs, -69 * fs, 41 * fs, -44 * fs)
      .bezierCurveTo(46 * fs, -24 * fs, 45 * fs, 14 * fs, 36 * fs + sway * 0.6, 36 * fs)
      // Inner right cheek taper up to temple
      .bezierCurveTo(37 * fs + sway * 0.3, 12 * fs, 35 * fs, -10 * fs, 32 * fs, -25 * fs)
      // Feathered straight-across bangs cleanly above eyebrows
      .lineTo(18 * fs, -25 * fs)
      .lineTo(15 * fs, -32 * fs)
      .lineTo(12 * fs, -25 * fs)
      .lineTo(-4 * fs, -25 * fs)
      .lineTo(-7 * fs, -31 * fs)
      .lineTo(-10 * fs, -25 * fs)
      .lineTo(-32 * fs, -25 * fs)
      // Inner left cheek taper down to tip
      .bezierCurveTo(-35 * fs, -10 * fs, -37 * fs + sway * 0.3, 12 * fs, -36 * fs + sway * 0.6, 36 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.5, join: "round" });
    // Soft internal crown sheen & flow lines
    g.moveTo(-22 * fs, -45 * fs).quadraticCurveTo(0, -54 * fs, 22 * fs, -45 * fs).stroke({ color: hairLight, width: 3.4, alpha: 0.36, cap: "round" });
    g.moveTo(-20 * fs, -46 * fs).quadraticCurveTo(-18 * fs, -35 * fs, -19 * fs, -27 * fs).stroke({ color: hairDark, width: 1.4, alpha: 0.35, cap: "round" });
    g.moveTo(20 * fs, -46 * fs).quadraticCurveTo(18 * fs, -35 * fs, 19 * fs, -27 * fs).stroke({ color: hairDark, width: 1.4, alpha: 0.35, cap: "round" });
  } else if (
    hairStyle === "long" ||
    hairStyle === "long_layered" ||
    hairStyle === "bob" ||
    hairStyle === "wavy" ||
    hairStyle === "half_up" ||
    hairStyle === "twin_tails" ||
    hairStyle === "braids"
  ) {
    // Cohesive, flowing female hair silhouette: ONE unified path connecting crown, soft curtain-parted bangs, and graceful cheek-framing locks (zero helmet look!)
    const lockLen = hairStyle === "bob" ? 26 * fs : hairStyle === "wavy" ? 38 * fs : 34 * fs;
    const waveOut = hairStyle === "wavy" ? 4 * fs : 0;

    g.moveTo(-32 * fs + sway * 0.55, lockLen)
      .bezierCurveTo(-45 * fs - waveOut, 14 * fs, -46 * fs, -22 * fs, -40 * fs, -44 * fs)
      .bezierCurveTo(-31 * fs, -69 * fs, 31 * fs, -69 * fs, 40 * fs, -44 * fs)
      .bezierCurveTo(46 * fs, -22 * fs, 45 * fs + waveOut, 14 * fs, 32 * fs + sway * 0.55, lockLen)
      // Right inner cheek edge rising smoothly into the right curtain swoop
      .bezierCurveTo(37 * fs + sway * 0.25, lockLen * 0.35, 36 * fs, -10 * fs, 33 * fs, -23 * fs)
      .bezierCurveTo(22 * fs, -26 * fs, 5 * fs, -30 * fs, -7 * fs, -40 * fs)
      // Natural off-center hair part curving smoothly into the left curtain swoop
      .bezierCurveTo(-15 * fs, -30 * fs, -25 * fs, -26 * fs, -33 * fs, -22 * fs)
      .bezierCurveTo(-36 * fs, -10 * fs, -37 * fs + sway * 0.25, lockLen * 0.35, -32 * fs + sway * 0.55, lockLen)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.5, join: "round" });

    // Delicate part-line & flowing inner strand highlights
    g.moveTo(-7 * fs, -40 * fs)
      .quadraticCurveTo(-5 * fs, -51 * fs, -2 * fs, -58 * fs)
      .stroke({ color: hairDark, width: 1.6, alpha: 0.5, cap: "round" });
    g.moveTo(-4 * fs, -42 * fs)
      .quadraticCurveTo(16 * fs, -44 * fs, 32 * fs, -30 * fs)
      .stroke({ color: hairLight, width: 3.0, alpha: 0.34, cap: "round" });
    g.moveTo(-11 * fs, -42 * fs)
      .quadraticCurveTo(-24 * fs, -41 * fs, -33 * fs, -30 * fs)
      .stroke({ color: hairLight, width: 2.5, alpha: 0.28, cap: "round" });
    // Soft cheek strand accent
    for (const side of [-1, 1]) {
      g.moveTo(side * 38 * fs, -10 * fs)
        .quadraticCurveTo(side * 40 * fs + sway * 0.25, lockLen * 0.45, side * 34 * fs + sway * 0.45, lockLen * 0.82)
        .stroke({ color: hairDark, width: 1.4, alpha: 0.35, cap: "round" });
    }

    if (hairStyle === "half_up") {
      g.circle(0, -64 * fs, 14 * fs).fill(hair).stroke({ color: outline, width: 2.6 });
      g.arc(0, -64 * fs, 8 * fs, Math.PI * 1.1, Math.PI * 1.85).stroke({ color: hairLight, width: 2.4, alpha: 0.4, cap: "round" });
    }
  } else if (hairStyle === "updo" || hairStyle === "messy_bun" || hairStyle === "ponytail" || hairStyle === "side_bun") {
    // Sleek pulled-back crown with graceful parted forehead swoop & delicate ear-framing wisps
    g.moveTo(-38 * fs, -12 * fs)
      .bezierCurveTo(-43 * fs, -34 * fs, -36 * fs, -66 * fs, 0, -66 * fs)
      .bezierCurveTo(36 * fs, -66 * fs, 43 * fs, -34 * fs, 38 * fs, -12 * fs)
      .bezierCurveTo(36 * fs, -21 * fs, 34 * fs, -25 * fs, 31 * fs, -27 * fs)
      .bezierCurveTo(18 * fs, -31 * fs, 4 * fs, -33 * fs, -6 * fs, -41 * fs)
      .bezierCurveTo(-15 * fs, -32 * fs, -24 * fs, -29 * fs, -31 * fs, -27 * fs)
      .bezierCurveTo(-34 * fs, -25 * fs, -36 * fs, -21 * fs, -38 * fs, -12 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.5, join: "round" });

    g.moveTo(-20 * fs, -48 * fs).quadraticCurveTo(0, -56 * fs, 20 * fs, -48 * fs).stroke({ color: hairLight, width: 3.2, alpha: 0.36, cap: "round" });

    if (hairStyle === "updo") {
      g.circle(0, -65 * fs, 18 * fs).fill(hair).stroke({ color: outline, width: 2.7 });
      g.arc(0, -65 * fs, 10.5 * fs, Math.PI * 1.1, Math.PI * 1.85).stroke({ color: hairLight, width: 2.6, alpha: 0.42, cap: "round" });
    } else if (hairStyle === "messy_bun") {
      g.circle(-4 * fs, -66 * fs, 17 * fs).fill(hair).stroke({ color: outline, width: 2.6 });
      g.circle(10 * fs, -63 * fs, 12 * fs).fill(hair).stroke({ color: outline, width: 2.3 });
      for (const side of [-1, 1]) {
        g.moveTo(side * 36 * fs, -16 * fs)
          .quadraticCurveTo(side * 40 * fs, 2 * fs, side * 33 * fs + sway, 16 * fs)
          .stroke({ color: hair, width: 3.0 * fs, cap: "round" });
      }
    }
  } else if (hairStyle === "parted") {
    // Classic clean side-parted hair (tailored for men, elders & editorial looks — zero beard-like cheek blocks!)
    g.moveTo(-38 * fs, -12 * fs)
      .bezierCurveTo(-43 * fs, -36 * fs, -36 * fs, -66 * fs, 0, -65 * fs)
      .bezierCurveTo(36 * fs, -64 * fs, 43 * fs, -36 * fs, 38 * fs, -12 * fs)
      // Clean subtle taper at right upper ear
      .quadraticCurveTo(35 * fs, -22 * fs, 32 * fs, -27 * fs)
      // Swept side-part across forehead (cleanly above eyebrows)
      .bezierCurveTo(18 * fs, -31 * fs, 0, -30 * fs, -14 * fs, -38 * fs)
      .bezierCurveTo(-22 * fs, -31 * fs, -30 * fs, -28 * fs, -33 * fs, -26 * fs)
      .quadraticCurveTo(-35 * fs, -21 * fs, -38 * fs, -12 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.5, join: "round" });

    // Clean side-part crease & subtle shine
    g.moveTo(-14 * fs, -38 * fs)
      .quadraticCurveTo(-13 * fs, -48 * fs, -8 * fs, -55 * fs)
      .stroke({ color: hairDark, width: 1.6, alpha: 0.5, cap: "round" });
    g.moveTo(-8 * fs, -46 * fs)
      .quadraticCurveTo(12 * fs, -52 * fs, 27 * fs, -40 * fs)
      .stroke({ color: hairLight, width: 3.2, alpha: 0.34, cap: "round" });
  } else {
    // Clean, sculpted modern short crop / dreadlocks crown (unified temple taper, no blocky sideburns!)
    g.moveTo(-38 * fs, -13 * fs)
      .bezierCurveTo(-43 * fs, -36 * fs, -35 * fs, -65 * fs, 0, -65 * fs)
      .bezierCurveTo(35 * fs, -65 * fs, 43 * fs, -36 * fs, 38 * fs, -13 * fs)
      // Soft natural temple tapers stopping cleanly at upper ear level
      .quadraticCurveTo(35 * fs, -22 * fs, 31 * fs, -27 * fs)
      // Softly textured natural forehead hairline (sits cleanly above eyebrows)
      .bezierCurveTo(18 * fs, -31 * fs, 7 * fs, -27 * fs, 0, -30 * fs)
      .bezierCurveTo(-8 * fs, -27 * fs, -19 * fs, -31 * fs, -31 * fs, -27 * fs)
      .quadraticCurveTo(-35 * fs, -22 * fs, -38 * fs, -13 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.5, join: "round" });

    // Specular hair sheen ribbon
    g.moveTo(-20 * fs, -45 * fs)
      .quadraticCurveTo(0, -53 * fs, 20 * fs, -44 * fs)
      .stroke({ color: hairLight, width: 3.4, alpha: 0.34, cap: "round" });
  }

  if (hairBow) {
    const bx = 24 * fs;
    const by = -44 * fs;
    g.poly([bx - 13 * fs, by - 7 * fs, bx, by, bx - 13 * fs, by + 7 * fs]).fill(accent).stroke({ color: outline, width: 2.0 });
    g.poly([bx + 13 * fs, by - 7 * fs, bx, by, bx + 13 * fs, by + 7 * fs]).fill(accent).stroke({ color: outline, width: 2.0 });
    g.circle(bx, by, 4.5 * fs).fill(shadeColor(accent, 0.85)).stroke({ color: outline, width: 1.8 });
  }
}

/**
 * Draws all 12 expressive facial hair styles (mustaches, goatees, beards, mutton chops, wizard beard).
 */
export function drawFacialHair(opts: {
  g: Graphics;
  style: FacialHairStyle;
  hair: number;
  hairDark: number;
  outline: number;
  fs: number;
  pendulum: SecondaryMotionSample;
}): void {
  const { g, style, hair, hairDark, outline, fs, pendulum } = opts;
  if (style === "none") return;

  const sway = pendulum.swayX * fs * 0.4;

  if (style === "stubble") {
    g.moveTo(-31 * fs, 14 * fs)
      .bezierCurveTo(-28 * fs, 46 * fs, -12 * fs, 54 * fs, 0, 55 * fs)
      .bezierCurveTo(12 * fs, 54 * fs, 28 * fs, 46 * fs, 31 * fs, 14 * fs)
      .quadraticCurveTo(0, 34 * fs, -31 * fs, 14 * fs)
      .closePath()
      .fill({ color: hairDark, alpha: 0.22 });
  } else if (style === "mustache") {
    g.moveTo(-17 * fs, 24 * fs)
      .quadraticCurveTo(-7 * fs, 17 * fs, 0, 21.5 * fs)
      .quadraticCurveTo(7 * fs, 17 * fs, 17 * fs, 24 * fs)
      .stroke({ color: hairDark, width: 5.8 * fs, cap: "round" });
  } else if (style === "chevron") {
    // Classic bold 80s detective/police chevron mustache
    g.moveTo(-18 * fs, 27 * fs)
      .lineTo(-14 * fs, 18 * fs)
      .quadraticCurveTo(0, 16 * fs, 14 * fs, 18 * fs)
      .lineTo(18 * fs, 27 * fs)
      .quadraticCurveTo(0, 23 * fs, -18 * fs, 27 * fs)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.0, join: "round" });
  } else if (style === "handlebar") {
    // Curled vintage gentleman/pirate handlebar mustache
    for (const side of [-1, 1]) {
      g.moveTo(0, 21 * fs)
        .bezierCurveTo(side * 10 * fs, 16 * fs, side * 18 * fs, 26 * fs, side * 24 * fs, 21 * fs)
        .bezierCurveTo(side * 28 * fs, 18 * fs, side * 24 * fs, 13 * fs, side * 20 * fs, 17 * fs)
        .stroke({ color: hairDark, width: 4.8 * fs, cap: "round" });
    }
  } else if (style === "soul_patch") {
    g.poly([-5 * fs, 37 * fs, 5 * fs, 37 * fs, 0, 48 * fs]).fill(hairDark).stroke({ color: outline, width: 1.4 });
  } else if (style === "goatee") {
    g.moveTo(-13 * fs, 35 * fs)
      .bezierCurveTo(-12 * fs, 56 * fs, 12 * fs, 56 * fs, 13 * fs, 35 * fs)
      .quadraticCurveTo(0, 40 * fs, -13 * fs, 35 * fs)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.2, join: "round" });
  } else if (style === "van_dyke") {
    // Pointed chin goatee + neat mustache
    g.moveTo(-16 * fs, 24 * fs)
      .quadraticCurveTo(-6 * fs, 18 * fs, 0, 22 * fs)
      .quadraticCurveTo(6 * fs, 18 * fs, 16 * fs, 24 * fs)
      .stroke({ color: hairDark, width: 4.8 * fs, cap: "round" });
    g.poly([-12 * fs, 37 * fs, 12 * fs, 37 * fs, 0, 58 * fs])
      .fill(hairDark)
      .stroke({ color: outline, width: 2.2, join: "round" });
  } else if (style === "mutton_chops") {
    for (const side of [-1, 1]) {
      g.moveTo(side * 36 * fs, 2 * fs)
        .bezierCurveTo(side * 42 * fs, 22 * fs, side * 34 * fs, 42 * fs, side * 16 * fs, 40 * fs)
        .bezierCurveTo(side * 24 * fs, 30 * fs, side * 28 * fs, 16 * fs, side * 28 * fs, 4 * fs)
        .closePath()
        .fill(hairDark)
        .stroke({ color: outline, width: 2.2, join: "round" });
    }
  } else if (style === "beard") {
    g.moveTo(-33 * fs, 12 * fs)
      .bezierCurveTo(-32 * fs, 54 * fs, 32 * fs, 54 * fs, 33 * fs, 12 * fs)
      .quadraticCurveTo(0, 32 * fs, -33 * fs, 12 * fs)
      .closePath()
      .fill(hairDark)
      .stroke({ color: outline, width: 2.5, join: "round" });
  } else if (style === "full_beard") {
    // Thick, sculpted full beard with connected mustache frame
    g.moveTo(-36 * fs, 4 * fs)
      .bezierCurveTo(-40 * fs, 42 * fs, -24 * fs, 68 * fs, 0, 72 * fs)
      .bezierCurveTo(24 * fs, 68 * fs, 40 * fs, 42 * fs, 36 * fs, 4 * fs)
      .lineTo(28 * fs, 10 * fs)
      .quadraticCurveTo(18 * fs, 24 * fs, 0, 21 * fs)
      .quadraticCurveTo(-18 * fs, 24 * fs, -28 * fs, 10 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.8, join: "round" });
    g.moveTo(-26 * fs, 44 * fs)
      .quadraticCurveTo(0, 64 * fs, 26 * fs, 44 * fs)
      .stroke({ color: hairDark, width: 3.0, alpha: 0.45, cap: "round" });
  } else if (style === "wizard_beard") {
    // Long flowing mythic/wizard beard with pendulum sway
    g.moveTo(-35 * fs, 8 * fs)
      .bezierCurveTo(-40 * fs, 52 * fs, -26 * fs + sway, 98 * fs, sway * 1.15, 118 * fs)
      .bezierCurveTo(26 * fs + sway, 98 * fs, 40 * fs, 52 * fs, 35 * fs, 8 * fs)
      .lineTo(26 * fs, 14 * fs)
      .quadraticCurveTo(0, 24 * fs, -26 * fs, 14 * fs)
      .closePath()
      .fill(hair)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.moveTo(-12 * fs, 44 * fs).quadraticCurveTo(-6 * fs + sway * 0.5, 76 * fs, -2 * fs + sway, 104 * fs).stroke({ color: hairDark, width: 2.2, alpha: 0.45, cap: "round" });
    g.moveTo(12 * fs, 44 * fs).quadraticCurveTo(8 * fs + sway * 0.5, 76 * fs, 4 * fs + sway, 100 * fs).stroke({ color: hairDark, width: 2.2, alpha: 0.45, cap: "round" });
  }
}

/**
 * Draws all 30 headwear & hat silhouettes cleanly anchored to the head crown.
 */
export function drawHeadwear(opts: {
  g: Graphics;
  hat: HatStyle;
  hatCol: number;
  accent: number;
  outline: number;
  fs: number;
  feather: boolean;
  pendulum: SecondaryMotionSample;
}): void {
  const { g, hat, hatCol, accent, outline, fs, feather, pendulum } = opts;
  if (hat === "none") return;

  const fSway = pendulum.swayX * fs * 0.35;

  if (hat === "police_cap" || hat === "officer_cap") {
    g.moveTo(-42 * fs, -36 * fs)
      .lineTo(-50 * fs, -62 * fs)
      .quadraticCurveTo(0, -76 * fs, 50 * fs, -62 * fs)
      .lineTo(42 * fs, -36 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.roundRect(-42 * fs, -42 * fs, 84 * fs, 10 * fs, 3).fill(0x14161e).stroke({ color: outline, width: 2.0 });
    g.ellipse(0, -33 * fs, 44 * fs, 8 * fs).fill(0x101218).stroke({ color: outline, width: 2.4 });
    g.poly([0, -64 * fs, 8 * fs, -56 * fs, 5 * fs, -46 * fs, -5 * fs, -46 * fs, -8 * fs, -56 * fs])
      .fill(0xf0c954)
      .stroke({ color: outline, width: 1.6 });
  } else if (hat === "tricorn") {
    g.moveTo(-64 * fs, -36 * fs)
      .bezierCurveTo(-50 * fs, -82 * fs, 50 * fs, -82 * fs, 64 * fs, -36 * fs)
      .quadraticCurveTo(0, -24 * fs, -64 * fs, -36 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 3.0, join: "round" });
    g.moveTo(-58 * fs, -38 * fs)
      .quadraticCurveTo(0, -62 * fs, 58 * fs, -38 * fs)
      .stroke({ color: 0xe0b64e, width: 3.2 });
    g.circle(0, -52 * fs, 7 * fs).fill(0xf4efe4).stroke({ color: outline, width: 1.8 });
  } else if (hat === "chef_hat") {
    for (const [cx, cy, r] of [[-24, -64, 18], [0, -74, 22], [24, -64, 18]] as [number, number, number][]) {
      g.circle(cx * fs, cy * fs, r * fs).fill(0xffffff).stroke({ color: outline, width: 2.6 });
    }
    g.roundRect(-38 * fs, -56 * fs, 76 * fs, 24 * fs, 6).fill(0xf7f8fa).stroke({ color: outline, width: 2.8 });
  } else if (hat === "fire_helmet") {
    g.moveTo(-48 * fs, -30 * fs)
      .bezierCurveTo(-46 * fs, -76 * fs, 46 * fs, -76 * fs, 48 * fs, -30 * fs)
      .lineTo(58 * fs, -24 * fs)
      .quadraticCurveTo(0, -18 * fs, -58 * fs, -24 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 3.0, join: "round" });
    g.poly([0, -62 * fs, 11 * fs, -50 * fs, 8 * fs, -36 * fs, -8 * fs, -36 * fs, -11 * fs, -50 * fs])
      .fill(0xf0c954)
      .stroke({ color: outline, width: 1.8 });
  } else if (hat === "astronaut_helmet") {
    g.circle(0, -4 * fs, 56 * fs).fill({ color: 0xd8f0ff, alpha: 0.24 }).stroke({ color: 0xe6ecf5, width: 6.5 });
    g.circle(0, -4 * fs, 58 * fs).stroke({ color: outline, width: 2.8 });
    g.arc(-14 * fs, -18 * fs, 32 * fs, Math.PI * 1.12, Math.PI * 1.52).stroke({ color: 0xffffff, width: 5, alpha: 0.65, cap: "round" });
    g.roundRect(-42 * fs, 44 * fs, 84 * fs, 12 * fs, 6).fill(0x8894a8).stroke({ color: outline, width: 2.5 });
  } else if (hat === "wizard_hat") {
    g.ellipse(0, -34 * fs, 62 * fs, 12 * fs).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.poly([-40 * fs, -36 * fs, 6 * fs + fSway, -114 * fs, 40 * fs, -36 * fs])
      .fill(hatCol)
      .stroke({ color: outline, width: 3.0, join: "round" });
    g.roundRect(-36 * fs, -44 * fs, 72 * fs, 10 * fs, 3).fill(0xffd447).stroke({ color: outline, width: 1.8 });
    g.circle(-6 * fs, -72 * fs, 4 * fs).fill(0xffd447);
    g.circle(10 * fs, -58 * fs, 3 * fs).fill(0xffd447);
  } else if (hat === "knight_helm") {
    g.moveTo(-42 * fs, -16 * fs)
      .bezierCurveTo(-44 * fs, -68 * fs, 44 * fs, -68 * fs, 42 * fs, -16 * fs)
      .lineTo(36 * fs, 16 * fs)
      .lineTo(-36 * fs, 16 * fs)
      .closePath()
      .fill(0xb4becd)
      .stroke({ color: outline, width: 3.0, join: "round" });
    g.roundRect(-28 * fs, -10 * fs, 56 * fs, 8 * fs, 3).fill(0x181a24);
    g.moveTo(0, -58 * fs)
      .bezierCurveTo(-18 * fs, -94 * fs, 26 * fs + fSway, -98 * fs, 34 * fs + fSway, -56 * fs)
      .closePath()
      .fill(accent)
      .stroke({ color: outline, width: 2.4 });
  } else if (hat === "ninja_hood") {
    g.moveTo(-42 * fs, -18 * fs)
      .bezierCurveTo(-46 * fs, -66 * fs, 46 * fs, -66 * fs, 42 * fs, -18 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.8 });
    g.moveTo(-39 * fs, 10 * fs)
      .lineTo(39 * fs, 10 * fs)
      .bezierCurveTo(34 * fs, 48 * fs, 12 * fs, 58 * fs, 0, 58 * fs)
      .bezierCurveTo(-12 * fs, 58 * fs, -34 * fs, 48 * fs, -39 * fs, 10 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.8 });
    g.roundRect(-41 * fs, -32 * fs, 82 * fs, 10 * fs, 3).fill(accent).stroke({ color: outline, width: 1.8 });
  } else if (hat === "tophat") {
    g.ellipse(0, -34 * fs, 56 * fs, 10 * fs).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.roundRect(-34 * fs, -92 * fs, 68 * fs, 58 * fs, 6).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.rect(-34 * fs, -48 * fs, 68 * fs, 11 * fs).fill(accent);
  } else if (hat === "helmet" || hat === "work_cap" || hat === "pith_helmet") {
    g.moveTo(-46 * fs, -28 * fs)
      .bezierCurveTo(-44 * fs, -74 * fs, 44 * fs, -74 * fs, 46 * fs, -28 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.ellipse(0, -28 * fs, hat === "pith_helmet" ? 56 * fs : 49 * fs, 8 * fs)
      .fill(shadeColor(hatCol, 0.85))
      .stroke({ color: outline, width: 2.5 });
  } else if (hat === "sailor_cap") {
    g.ellipse(0, -52 * fs, 38 * fs, 14 * fs).fill(0xf4f6f9).stroke({ color: outline, width: 2.8 });
    g.roundRect(-34 * fs, -46 * fs, 68 * fs, 12 * fs, 4).fill(0x1f304d).stroke({ color: outline, width: 2.0 });
  } else if (hat === "headband") {
    g.roundRect(-41 * fs, -36 * fs, 82 * fs, 11 * fs, 4).fill(hatCol).stroke({ color: outline, width: 2.2 });
    if (feather) {
      g.moveTo(26 * fs, -36 * fs)
        .bezierCurveTo(46 * fs + fSway, -66 * fs, 34 * fs + fSway, -86 * fs, 18 * fs + fSway, -74 * fs)
        .bezierCurveTo(22 * fs, -56 * fs, 22 * fs, -44 * fs, 26 * fs, -36 * fs)
        .closePath()
        .fill(0xe8c668)
        .stroke({ color: outline, width: 2.0 });
    }
  } else if (hat === "fedora") {
    g.ellipse(0, -34 * fs, 56 * fs, 10 * fs).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.moveTo(-36 * fs, -36 * fs)
      .bezierCurveTo(-34 * fs, -72 * fs, 34 * fs, -72 * fs, 36 * fs, -36 * fs)
      .closePath()
      .fill(shadeColor(hatCol, 1.12))
      .stroke({ color: outline, width: 2.9 });
    g.roundRect(-35 * fs, -44 * fs, 70 * fs, 8 * fs, 3).fill(accent).stroke({ color: outline, width: 1.8 });
  } else if (hat === "cap") {
    g.arc(0, -32 * fs, 42 * fs, Math.PI, 0).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.ellipse(22 * fs, -32 * fs, 34 * fs, 8 * fs).fill(shadeColor(hatCol, 0.82)).stroke({ color: outline, width: 2.5 });
  } else if (hat === "beret") {
    g.ellipse(-4 * fs, -44 * fs, 46 * fs, 18 * fs).fill(hatCol).stroke({ color: outline, width: 2.9 });
    g.moveTo(0, -62 * fs).lineTo(4 * fs, -70 * fs).stroke({ color: outline, width: 3.2, cap: "round" });
  } else if (hat === "beanie") {
    g.moveTo(-42 * fs, -26 * fs)
      .bezierCurveTo(-40 * fs, -70 * fs, 40 * fs, -70 * fs, 42 * fs, -26 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.9 });
    g.roundRect(-43 * fs, -34 * fs, 86 * fs, 12 * fs, 6).fill(shadeColor(hatCol, 0.84)).stroke({ color: outline, width: 2.5 });
    g.circle(0, -64 * fs, 8 * fs).fill(shadeColor(hatCol, 1.15)).stroke({ color: outline, width: 2.2 });
  } else if (hat === "crown") {
    g.poly([
      -28 * fs, -40 * fs,
      -24 * fs, -68 * fs,
      -9 * fs, -50 * fs,
      0, -74 * fs,
      9 * fs, -50 * fs,
      24 * fs, -68 * fs,
      28 * fs, -40 * fs,
    ])
      .fill(0xffd447)
      .stroke({ color: outline, width: 2.8, join: "round" });
  } else if (hat === "cowboy_hat") {
    // Wide curved-brim Western hat with pinched crown
    g.moveTo(-66 * fs, -42 * fs)
      .quadraticCurveTo(-36 * fs, -22 * fs, 0, -28 * fs)
      .quadraticCurveTo(36 * fs, -22 * fs, 66 * fs, -42 * fs)
      .quadraticCurveTo(34 * fs, -36 * fs, 0, -38 * fs)
      .quadraticCurveTo(-34 * fs, -36 * fs, -66 * fs, -42 * fs)
      .closePath()
      .fill(shadeColor(hatCol, 0.86))
      .stroke({ color: outline, width: 2.8, join: "round" });
    g.moveTo(-36 * fs, -36 * fs)
      .bezierCurveTo(-34 * fs, -76 * fs, -10 * fs, -76 * fs, 0, -64 * fs)
      .bezierCurveTo(10 * fs, -76 * fs, 34 * fs, -76 * fs, 36 * fs, -36 * fs)
      .closePath()
      .fill(hatCol)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.roundRect(-35 * fs, -44 * fs, 70 * fs, 7 * fs, 3).fill(0x52341e).stroke({ color: outline, width: 1.6 });
  } else if (hat === "sombrero") {
    // Festive wide-brimmed Mexican sombrero with zig-zag embroidery
    g.ellipse(0, -34 * fs, 74 * fs, 14 * fs).fill(hatCol).stroke({ color: outline, width: 3.0 });
    g.moveTo(-32 * fs, -36 * fs)
      .bezierCurveTo(-28 * fs, -84 * fs, 28 * fs, -84 * fs, 32 * fs, -36 * fs)
      .closePath()
      .fill(shadeColor(hatCol, 1.08))
      .stroke({ color: outline, width: 2.9 });
    g.roundRect(-32 * fs, -44 * fs, 64 * fs, 9 * fs, 3).fill(accent).stroke({ color: outline, width: 1.6 });
    for (let x = -56; x <= 56; x += 16) {
      g.circle(x * fs, -31 * fs, 2.6 * fs).fill(0xffd447);
    }
  } else if (hat === "bucket_hat") {
    g.moveTo(-54 * fs, -22 * fs)
      .lineTo(-40 * fs, -36 * fs)
      .lineTo(40 * fs, -36 * fs)
      .lineTo(54 * fs, -22 * fs)
      .quadraticCurveTo(0, -16 * fs, -54 * fs, -22 * fs)
      .closePath()
      .fill(shadeColor(hatCol, 0.85))
      .stroke({ color: outline, width: 2.7, join: "round" });
    g.roundRect(-39 * fs, -62 * fs, 78 * fs, 28 * fs, 10).fill(hatCol).stroke({ color: outline, width: 2.8 });
  } else if (hat === "sun_hat") {
    g.ellipse(0, -34 * fs, 68 * fs, 13 * fs).fill(0xe9d29c).stroke({ color: outline, width: 2.7 });
    g.arc(0, -34 * fs, 38 * fs, Math.PI, 0).fill(0xf2dea8).stroke({ color: outline, width: 2.8 });
    g.roundRect(-38 * fs, -42 * fs, 76 * fs, 8 * fs, 3).fill(accent).stroke({ color: outline, width: 1.6 });
  } else if (hat === "laurel_wreath") {
    for (const side of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        g.ellipse(side * (14 + k * 9) * fs, (-48 + k * 7) * fs, 7.5 * fs, 3.8 * fs)
          .fill(0xe5b84b)
          .stroke({ color: outline, width: 1.6 });
      }
    }
  } else if (hat === "tiara") {
    g.poly([
      -26 * fs, -40 * fs,
      -18 * fs, -58 * fs,
      -8 * fs, -48 * fs,
      0, -66 * fs,
      8 * fs, -48 * fs,
      18 * fs, -58 * fs,
      26 * fs, -40 * fs,
    ])
      .fill(0xe8eef8)
      .stroke({ color: outline, width: 2.2, join: "round" });
    g.circle(0, -54 * fs, 4 * fs).fill(accent).stroke({ color: outline, width: 1.2 });
  } else if (hat === "graduation_cap") {
    g.roundRect(-34 * fs, -52 * fs, 68 * fs, 18 * fs, 4).fill(0x1a1e29).stroke({ color: outline, width: 2.5 });
    g.poly([0, -70 * fs, 58 * fs, -54 * fs, 0, -40 * fs, -58 * fs, -54 * fs])
      .fill(0x232836)
      .stroke({ color: outline, width: 2.8, join: "round" });
    // Tassel with pendulum sway
    g.moveTo(0, -54 * fs)
      .lineTo(44 * fs, -52 * fs)
      .lineTo(46 * fs + fSway, -24 * fs)
      .stroke({ color: 0xffd447, width: 3.0, cap: "round" });
    g.circle(46 * fs + fSway, -22 * fs, 4.5 * fs).fill(0xffd447);
  } else if (hat === "samurai_kabuto") {
    g.moveTo(-48 * fs, -24 * fs)
      .bezierCurveTo(-48 * fs, -72 * fs, 48 * fs, -72 * fs, 48 * fs, -24 * fs)
      .lineTo(58 * fs, -10 * fs)
      .lineTo(-58 * fs, -10 * fs)
      .closePath()
      .fill(0x222634)
      .stroke({ color: outline, width: 3.0, join: "round" });
    // Golden crescent maedate crest
    g.moveTo(-34 * fs, -78 * fs)
      .quadraticCurveTo(0, -44 * fs, 34 * fs, -78 * fs)
      .quadraticCurveTo(0, -56 * fs, -34 * fs, -78 * fs)
      .closePath()
      .fill(0xf0c954)
      .stroke({ color: outline, width: 2.0 });
  } else if (hat === "headphones") {
    // Studio over-ear headphones band + earcups
    g.arc(0, -8 * fs, 45 * fs, Math.PI * 1.06, Math.PI * 1.94).stroke({ color: outline, width: 10 * fs, cap: "round" });
    g.arc(0, -8 * fs, 45 * fs, Math.PI * 1.08, Math.PI * 1.92).stroke({ color: hatCol, width: 5.5 * fs, cap: "round" });
    for (const side of [-1, 1]) {
      g.roundRect(side === -1 ? -49 * fs : 36 * fs, -12 * fs, 13 * fs, 30 * fs, 6)
        .fill(hatCol)
        .stroke({ color: outline, width: 2.6 });
      g.roundRect(side === -1 ? -46 * fs : 38 * fs, -7 * fs, 7 * fs, 20 * fs, 3)
        .fill(accent);
    }
  }
}
