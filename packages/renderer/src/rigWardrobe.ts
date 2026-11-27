import { Graphics } from "pixi.js";
import type { CharacterWardrobe, OutfitStyle, PantsStyle } from "@storia/schema";
import { shadeColor } from "./color.js";

export interface OutfitOverlayParams {
  g: Graphics;
  outfitStyle: OutfitStyle;
  pantsStyle: PantsStyle;
  shirtPattern: CharacterWardrobe["shirtPattern"];
  shHalfW: number;
  waistHalfW: number;
  hipHalfW: number;
  uShoulderY: number;
  uWaistY: number;
  torsoBotY: number;
  shirt: number;
  jacket?: number;
  pants: number;
  accent: number;
  outline: number;
  isFemale: boolean;
  isSilhouette: boolean;
}

/**
 * Draws fabric patterns (stripes, pinstripe, checks, dots, plaid, colorblock) cleanly within the torso bounds.
 */
export function drawShirtPattern(p: OutfitOverlayParams): void {
  const { g, shirtPattern, shHalfW, hipHalfW, uShoulderY, torsoBotY, shirt, accent, isSilhouette } = p;
  if (isSilhouette || shirtPattern === "solid") return;

  const patCol = shadeColor(shirt, 0.72);
  const halfW = Math.min(shHalfW, hipHalfW) * 0.84;

  if (shirtPattern === "stripes") {
    for (let y = uShoulderY + 24; y < torsoBotY - 6; y += 18) {
      g.rect(-halfW, y, halfW * 2, 5.5).fill({ color: patCol, alpha: 0.42 });
    }
  } else if (shirtPattern === "pinstripe") {
    for (let x = -halfW + 6; x < halfW - 4; x += 12) {
      g.moveTo(x, uShoulderY + 14).lineTo(x, torsoBotY - 4).stroke({ color: patCol, width: 1.5, alpha: 0.48 });
    }
  } else if (shirtPattern === "checks" || shirtPattern === "plaid") {
    for (let y = uShoulderY + 24; y < torsoBotY - 6; y += 20) {
      g.rect(-halfW, y, halfW * 2, shirtPattern === "plaid" ? 7 : 4).fill({ color: patCol, alpha: 0.3 });
    }
    for (let x = -halfW + 8; x < halfW - 6; x += 18) {
      g.rect(x, uShoulderY + 14, shirtPattern === "plaid" ? 6 : 4, torsoBotY - uShoulderY - 18).fill({
        color: shirtPattern === "plaid" ? accent : patCol,
        alpha: 0.25,
      });
    }
  } else if (shirtPattern === "dots") {
    for (let y = uShoulderY + 24; y < torsoBotY - 8; y += 18) {
      const offset = Math.round((y - uShoulderY) / 18) % 2 === 0 ? 0 : 9;
      for (let x = -halfW + 10 + offset; x < halfW - 8; x += 18) {
        g.circle(x, y, 3.0).fill({ color: accent, alpha: 0.52 });
      }
    }
  } else if (shirtPattern === "colorblock") {
    g.rect(-halfW, uShoulderY + 20, halfW * 2, 34).fill({ color: accent, alpha: 0.72 });
  }
}

/**
 * Draws the 12 rich outfit styles (hoodie, turtleneck, suit, trench_coat, leather_jacket,
 * kimono, toga, sport_jersey, sweater, denim_jacket, medieval_tunic) over the base torso.
 */
export function drawOutfitOverlay(p: OutfitOverlayParams): void {
  const {
    g,
    outfitStyle,
    shHalfW,
    waistHalfW,
    hipHalfW,
    uShoulderY,
    uWaistY,
    torsoBotY,
    shirt,
    jacket,
    accent,
    outline,
    isSilhouette,
  } = p;

  if (isSilhouette || outfitStyle === "classic") return;

  const coatCol = jacket ?? shadeColor(shirt, 0.72);
  const coatShade = shadeColor(coatCol, 0.8);

  if (outfitStyle === "hoodie") {
    // Soft hood cowl around collar + kangaroo front pocket + white drawstrings
    g.moveTo(-shHalfW * 0.62, uShoulderY + 2)
      .quadraticCurveTo(0, uShoulderY + 34, shHalfW * 0.62, uShoulderY + 2)
      .quadraticCurveTo(0, uShoulderY - 12, -shHalfW * 0.62, uShoulderY + 2)
      .closePath()
      .fill(shadeColor(shirt, 0.86))
      .stroke({ color: outline, width: 2.4, join: "round" });
    // Drawstrings
    for (const side of [-1, 1]) {
      g.moveTo(side * 9, uShoulderY + 18)
        .lineTo(side * 10, uShoulderY + 56)
        .stroke({ color: 0xf5f5f7, width: 2.6, cap: "round" });
    }
    // Kangaroo pocket + ribbed bottom hem
    g.moveTo(-waistHalfW * 0.68, torsoBotY - 10)
      .lineTo(-waistHalfW * 0.48, uWaistY + 12)
      .lineTo(waistHalfW * 0.48, uWaistY + 12)
      .lineTo(waistHalfW * 0.68, torsoBotY - 10)
      .closePath()
      .fill(shadeColor(shirt, 0.88))
      .stroke({ color: outline, width: 2.0, join: "round" });
    g.roundRect(-hipHalfW, torsoBotY - 8, hipHalfW * 2, 11, 4)
      .fill(shadeColor(shirt, 0.8))
      .stroke({ color: outline, width: 2.0 });
  } else if (outfitStyle === "turtleneck") {
    // High folded ribbed knit neck
    g.roundRect(-22, uShoulderY - 22, 44, 28, 7)
      .fill(shadeColor(shirt, 0.9))
      .stroke({ color: outline, width: 2.6 });
    for (let x = -14; x <= 14; x += 7) {
      g.moveTo(x, uShoulderY - 19).lineTo(x, uShoulderY + 3).stroke({ color: shadeColor(shirt, 0.72), width: 1.5, alpha: 0.6 });
    }
  } else if (outfitStyle === "sweater") {
    // Ribbed crew neck + waist rib hem + knit chevron stripe
    g.ellipse(0, uShoulderY + 8, 22, 10).stroke({ color: shadeColor(shirt, 0.72), width: 6 });
    g.moveTo(-waistHalfW * 0.88, uShoulderY + 46)
      .lineTo(-waistHalfW * 0.45, uShoulderY + 58)
      .lineTo(0, uShoulderY + 46)
      .lineTo(waistHalfW * 0.45, uShoulderY + 58)
      .lineTo(waistHalfW * 0.88, uShoulderY + 46)
      .stroke({ color: accent, width: 5.5, join: "round", cap: "round" });
    g.roundRect(-hipHalfW, torsoBotY - 9, hipHalfW * 2, 12, 4)
      .fill(shadeColor(shirt, 0.78))
      .stroke({ color: outline, width: 2.0 });
  } else if (outfitStyle === "sport_jersey") {
    // Athletic V-neck trim + shoulder stripes + chest badge number block
    g.moveTo(-20, uShoulderY + 4)
      .lineTo(0, uShoulderY + 28)
      .lineTo(20, uShoulderY + 4)
      .stroke({ color: accent, width: 5.5, join: "round", cap: "round" });
    for (const side of [-1, 1]) {
      g.rect(side === -1 ? -hipHalfW + 3 : hipHalfW - 11, uShoulderY + 24, 8, torsoBotY - uShoulderY - 30)
        .fill(accent);
    }
    g.roundRect(-16, uShoulderY + 44, 32, 26, 4).fill({ color: 0xffffff, alpha: 0.85 }).stroke({ color: outline, width: 1.8 });
    g.rect(-10, uShoulderY + 51, 20, 4).fill(accent);
    g.rect(-6, uShoulderY + 59, 12, 4).fill(accent);
  } else if (outfitStyle === "leather_jacket") {
    // Biker jacket with asymmetric silver zipper, notched lapels & waist belt
    for (const side of [-1, 1]) {
      g.moveTo(side * (shHalfW + 2), uShoulderY + 6)
        .lineTo(side * (shHalfW * 0.42), uShoulderY + 2)
        .lineTo(side * 12, uShoulderY + 54)
        .lineTo(side * 12, torsoBotY + 2)
        .lineTo(side * (hipHalfW + 3), torsoBotY)
        .closePath()
        .fill(side === 1 ? 0x1a1c24 : 0x242733)
        .stroke({ color: outline, width: 2.9, join: "round" });
      // Wide notched biker lapel + silver studs
      g.poly([side * (shHalfW * 0.42), uShoulderY + 3, side * (shHalfW * 0.72), uShoulderY + 30, side * 14, uShoulderY + 52])
        .fill(0x323646)
        .stroke({ color: outline, width: 2.0, join: "round" });
      g.circle(side * (shHalfW * 0.6), uShoulderY + 26, 2.5).fill(0xd8e0ec);
    }
    // Diagonal silver zipper
    g.moveTo(11, uShoulderY + 50).lineTo(15, torsoBotY).stroke({ color: 0xd8e0ec, width: 2.8 });
    // Leather belt + buckle
    g.rect(-hipHalfW - 2, torsoBotY - 12, hipHalfW * 2 + 4, 10).fill(0x14161c).stroke({ color: outline, width: 1.8 });
    g.roundRect(-8, torsoBotY - 13, 16, 12, 2).fill(0xd8e0ec).stroke({ color: outline, width: 1.5 });
  } else if (outfitStyle === "denim_jacket") {
    const denim = jacket ?? 0x3b6594;
    const denimShade = shadeColor(denim, 0.82);
    for (const side of [-1, 1]) {
      g.moveTo(side * (shHalfW + 2), uShoulderY + 6)
        .lineTo(side * (shHalfW * 0.36), uShoulderY + 2)
        .lineTo(side * 12, uShoulderY + 42)
        .lineTo(side * 12, torsoBotY + 2)
        .lineTo(side * (hipHalfW + 3), torsoBotY)
        .closePath()
        .fill(side === 1 ? denimShade : denim)
        .stroke({ color: outline, width: 2.8, join: "round" });
      // Chest pocket flap + copper button
      g.roundRect(side === -1 ? -shHalfW * 0.78 : shHalfW * 0.28, uShoulderY + 42, shHalfW * 0.48, 22, 3)
        .fill(shadeColor(denim, 1.08))
        .stroke({ color: 0xd99b4e, width: 1.6 });
      g.circle(side === -1 ? -shHalfW * 0.54 : shHalfW * 0.52, uShoulderY + 50, 2.4).fill(0xe0a958);
    }
  } else if (outfitStyle === "trench_coat") {
    const coatBot = 78;
    for (const side of [-1, 1]) {
      g.moveTo(side * (shHalfW + 3), uShoulderY + 6)
        .lineTo(side * (shHalfW * 0.38), uShoulderY + 2)
        .lineTo(side * 16, uShoulderY + 66)
        .lineTo(side * 14, coatBot)
        .lineTo(side * (hipHalfW + 15), coatBot - 2)
        .bezierCurveTo(side * (waistHalfW + 4), uWaistY, side * (shHalfW + 4), uShoulderY + 46, side * (shHalfW + 3), uShoulderY + 6)
        .closePath()
        .fill(side === 1 ? coatShade : coatCol)
        .stroke({ color: outline, width: 2.9, join: "round" });
    }
    // Double-breasted buttons + tied waist belt
    for (const side of [-1, 1]) {
      for (const by of [uShoulderY + 56, uShoulderY + 80]) {
        g.circle(side * 18, by, 3.2).fill(0x3a2a1e);
      }
    }
    g.roundRect(-waistHalfW - 4, uWaistY - 5, waistHalfW * 2 + 8, 12, 4)
      .fill(shadeColor(coatCol, 0.76))
      .stroke({ color: outline, width: 2.2 });
    g.roundRect(-8, uWaistY - 6, 16, 14, 2).fill(0x523924).stroke({ color: outline, width: 1.6 });
  } else if (outfitStyle === "kimono") {
    // Traditional Y-shaped crossover robe + wide Obi sash
    const robeBot = 68;
    g.moveTo(-shHalfW - 2, uShoulderY + 6)
      .lineTo(shHalfW + 2, uShoulderY + 6)
      .lineTo(hipHalfW + 12, robeBot)
      .quadraticCurveTo(0, robeBot + 10, -hipHalfW - 12, robeBot)
      .closePath()
      .fill(shirt)
      .stroke({ color: outline, width: 3.0, join: "round" });
    // Left-over-right crossover collar lapels
    g.moveTo(-shHalfW * 0.52, uShoulderY + 4)
      .lineTo(waistHalfW * 0.32, uWaistY)
      .stroke({ color: shadeColor(shirt, 0.72), width: 11, cap: "butt" });
    g.moveTo(shHalfW * 0.52, uShoulderY + 4)
      .lineTo(-waistHalfW * 0.32, uWaistY)
      .stroke({ color: 0xfaf7f0, width: 11, cap: "butt" });
    // Wide Obi waist sash
    g.roundRect(-waistHalfW - 4, uWaistY - 12, waistHalfW * 2 + 8, 28, 4)
      .fill(accent)
      .stroke({ color: outline, width: 2.5 });
    g.moveTo(-waistHalfW - 4, uWaistY + 2).lineTo(waistHalfW + 4, uWaistY + 2).stroke({ color: 0xf4e2a6, width: 3.2 });
  } else if (outfitStyle === "toga") {
    // Classical Greco-Roman draped toga + golden border trim
    const togaBot = 62;
    g.moveTo(-shHalfW - 2, uShoulderY + 6)
      .lineTo(shHalfW + 2, uShoulderY + 6)
      .lineTo(hipHalfW + 10, togaBot)
      .quadraticCurveTo(0, togaBot + 12, -hipHalfW - 10, togaBot)
      .closePath()
      .fill(0xf5ebd6)
      .stroke({ color: outline, width: 2.9, join: "round" });
    g.moveTo(-shHalfW * 0.85, uShoulderY + 8)
      .lineTo(hipHalfW * 0.78, uWaistY + 22)
      .stroke({ color: accent, width: 16, cap: "butt" });
    g.rect(-hipHalfW - 8, togaBot - 14, hipHalfW * 2 + 16, 9)
      .fill(0xe5b84b)
      .stroke({ color: outline, width: 1.8 });
  } else if (outfitStyle === "medieval_tunic") {
    const tunBot = 52;
    g.moveTo(-shHalfW - 1, uShoulderY + 6)
      .lineTo(shHalfW + 1, uShoulderY + 6)
      .lineTo(hipHalfW + 10, tunBot)
      .lineTo(0, tunBot + 6)
      .lineTo(-hipHalfW - 10, tunBot)
      .closePath()
      .fill(shirt)
      .stroke({ color: outline, width: 2.9, join: "round" });
    // Laced neckline + thick leather belt
    g.moveTo(0, uShoulderY + 8).lineTo(0, uShoulderY + 42).stroke({ color: outline, width: 2.4 });
    for (const ly of [uShoulderY + 18, uShoulderY + 27, uShoulderY + 36]) {
      g.moveTo(-8, ly).lineTo(8, ly).stroke({ color: 0xe6d5b8, width: 2.2 });
    }
    g.roundRect(-waistHalfW - 3, uWaistY - 5, waistHalfW * 2 + 6, 13, 3)
      .fill(0x52341e)
      .stroke({ color: outline, width: 2.2 });
    g.roundRect(-9, uWaistY - 6, 18, 15, 3).fill(0xd9a841).stroke({ color: outline, width: 1.8 });
  } else if (outfitStyle === "suit") {
    // Crisp tailored suit jacket when user picks outfitStyle="suit" even without setting palette.jacket
    for (const side of [-1, 1]) {
      g.moveTo(side * (shHalfW + 2), uShoulderY + 7)
        .lineTo(side * (shHalfW * 0.42), uShoulderY + 3)
        .lineTo(side * 18, uShoulderY + 74)
        .lineTo(side * 15, 18)
        .lineTo(side * (hipHalfW + 3), 16)
        .closePath()
        .fill(side === 1 ? coatShade : coatCol)
        .stroke({ color: outline, width: 2.9, join: "round" });
    }
  }
}

/**
 * Draws optional pleated or pencil skirt cleanly over hips when `pantsStyle` is skirt or `wSpec.skirt` is true.
 */
export function drawSkirtOverlay(opts: {
  g: Graphics;
  pantsStyle: PantsStyle;
  waistHalfW: number;
  hipHalfW: number;
  uWaistY: number;
  pants: number;
  outline: number;
  isSilhouette: boolean;
}): void {
  const { g, pantsStyle, waistHalfW, hipHalfW, uWaistY, pants, outline, isSilhouette } = opts;
  if (pantsStyle !== "pleated_skirt" && pantsStyle !== "pencil_skirt") return;

  const isPleated = pantsStyle === "pleated_skirt";
  const hemY = isPleated ? 64 : 76;
  const hemHalfW = isPleated ? hipHalfW * 1.48 : hipHalfW * 0.96;

  g.moveTo(-waistHalfW - 1, uWaistY + 12)
    .lineTo(waistHalfW + 1, uWaistY + 12)
    .lineTo(hemHalfW, hemY)
    .quadraticCurveTo(0, hemY + 10, -hemHalfW, hemY)
    .closePath()
    .fill(pants)
    .stroke({ color: outline, width: 2.8, join: "round" });

  if (!isSilhouette && isPleated) {
    const pleatCol = shadeColor(pants, 0.76);
    for (let i = -3; i <= 3; i++) {
      const topX = (i / 3.5) * waistHalfW;
      const botX = (i / 3.5) * hemHalfW;
      g.moveTo(topX, uWaistY + 14).lineTo(botX, hemY + 3).stroke({ color: pleatCol, width: 2.0, alpha: 0.7 });
    }
  }
}
