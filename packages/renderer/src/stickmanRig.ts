import { Container, Graphics } from "pixi.js";
import type {
  CharacterDefinition,
  CharacterPose,
  CharacterRenderStyle,
  Layer,
} from "@storia/schema";
import { clamp, hexToNumber, lerp, shadeColor } from "./color.js";
import { drawFacialHair, drawHeadwear } from "./rigHairAndAccessories.js";
import { solveGroundedLegIK, solvePendulumSway } from "./rigKinematics.js";

type CharacterLayer = Extract<Layer, { type: "character" }>;

export interface StickmanPoseSnapshot {
  activePose?: CharacterPose;
  ba1: number;
  ba2: number;
  fa1: number;
  fa2: number;
  torsoTilt?: number;
  sit?: number;
  kneel?: number;
  run?: number;
  walk?: number;
  dance?: number;
}

export interface StickmanExprSnapshot {
  browIn: number;
  browOut: number;
  browLift: number;
  eyeOpen: number;
  smile: number;
  mouthStyle: "line" | "open_smile" | "laugh" | "gasp" | "smirk" | "frown";
  blush: number;
  tears: number;
  tilt: number;
}

/**
 * Dedicated multi-style character renderer implementing all 10 Stickman Video Director
 * drawing grammars (A1 Dark/Light, A2 Modern Beanie, B1/B2/B5 Hand-Drawn, B3 Retro TV,
 * B4 Survival Thriller, A7 Rubber Hose, B6 Dynamic Meme, B7 Pixel Theater, B8 Greek Mythology).
 */
export function renderStyledStickmanCharacter(
  container: Container,
  renderStyle: Exclude<CharacterRenderStyle, "auto" | "editorial">,
  def: CharacterDefinition,
  layer: CharacterLayer,
  pose: StickmanPoseSnapshot,
  expr: StickmanExprSnapshot,
  localTime: number,
  globalTime: number,
  walkSpeed: number,
  faceLeft: boolean,
): void {
  container.removeChildren();
  const root = new Container();

  const ageScale =
    def.age === "toddler" ? 0.62 :
    def.age === "boy" || def.age === "girl" ? 0.78 :
    def.age === "teen" ? 0.9 : 1.0;

  root.scale.set(faceLeft ? -ageScale : ageScale, ageScale);
  container.addChild(root);

  const g = new Graphics();
  root.addChild(g);

  const ph = (def.id.charCodeAt(0) + def.id.length * 7) * 0.73;
  const runW = pose.run ?? 0;
  const sitW = pose.sit ?? 0;
  const kneelW = pose.kneel ?? 0;
  const danceW = pose.dance ?? 0;
  const walkW = clamp(walkSpeed + (pose.walk ?? 0) + runW * 0.92, 0, 1);

  const walkCycle = globalTime * (runW > 0.2 ? 12.2 : 7.6) + ph;
  const walkBounce = Math.abs(Math.sin(walkCycle)) * (runW > 0.2 ? 12 : 6) * walkW;
  const danceBounce = Math.abs(Math.sin(globalTime * 6.4 + ph)) * 9 * danceW;
  const rubberBounce = renderStyle === "rubber_hose" ? Math.abs(Math.sin(globalTime * 5.2 + ph)) * 8 : 0;
  const idleBob = Math.sin(globalTime * 2.2 + ph) * 2.0 + rubberBounce;

  const isPixel = renderStyle === "pixel_theater";
  const snap = (v: number) => (isPixel ? Math.round(v / 8) * 8 : v);

  // Limb angles with live motion (driven by resolved `activePose`, so poseCues work!)
  const activePose = pose.activePose ?? layer.pose;
  let ba1 = pose.ba1;
  let ba2 = pose.ba2;
  let fa1 = pose.fa1;
  let fa2 = pose.fa2;
  if (activePose === "wave" || activePose === "wave_both") {
    const osc = Math.sin(globalTime * 8.2 + ph) * 0.34;
    fa2 += osc;
    if (activePose === "wave_both") ba2 -= osc;
  }
  if (activePose === "celebrate" || activePose === "victory") {
    const pulse = Math.sin(globalTime * 6.4 + ph) * 0.1;
    ba1 += pulse;
    fa1 -= pulse;
  }
  if (activePose === "typing") {
    ba2 += Math.sin(globalTime * 18 + ph) * 0.08;
    fa2 += Math.cos(globalTime * 19 + ph) * 0.08;
  }
  if (danceW > 0.05) {
    const dOsc = Math.sin(globalTime * 6.4 + ph) * 0.48 * danceW;
    ba1 += dOsc;
    fa1 += dOsc;
  }
  if (walkW > 0.02 && sitW < 0.2) {
    const sw = Math.sin(walkCycle) * (runW > 0.2 ? 0.68 : 0.44) * walkW;
    ba1 += sw;
    fa1 -= sw;
  }

  const legh = renderStyle === "handdrawn" ? 210 : 196;
  const torsoH = renderStyle === "handdrawn" ? 132 : 124;
  const hipY = snap(-legh + 54 * sitW + 72 * kneelW - walkBounce * 0.45 - danceBounce * 0.5);
  const shY = snap(hipY - torsoH + idleBob * 0.5);
  const headR =
    renderStyle === "meme" ? 44 :
    renderStyle === "pixel_theater" ? 40 :
    renderStyle === "greek_mythology" ? 42 :
    renderStyle === "handdrawn" ? 34 : 38;
  const headY = snap(shY - headR - 14);
  const ua = renderStyle === "handdrawn" ? 74 : 68;
  const fa = renderStyle === "handdrawn" ? 68 : 62;

  const isSilhouette = layer.silhouette;
  const silCol = hexToNumber(layer.tint ?? "#0f1526", 0x0f1526);

  // Palette per style
  const strokeCol = isSilhouette
    ? silCol
    : renderStyle === "classic_dark"
      ? 0xffffff
      : renderStyle === "retro_tv"
        ? 0xf4f7ff
        : renderStyle === "greek_mythology"
          ? 0x2e1b11
          : 0x16161c;

  const strokeW =
    renderStyle === "meme" ? 12 :
    renderStyle === "retro_tv" ? 13 :
    renderStyle === "classic_dark" || renderStyle === "classic_light" ? 7.5 :
    renderStyle === "rubber_hose" ? 7.2 :
    renderStyle === "handdrawn" ? 5.6 : 8.2;

  const accentCol = isSilhouette ? silCol : hexToNumber(def.palette.accent, 0xe11d48);
  const shirtCol = isSilhouette ? silCol : hexToNumber(def.palette.shirt, 0xfacc15);
  const skinCol = isSilhouette ? silCol : hexToNumber(def.palette.skin, 0xe8be98);

  // Ground shadow
  if (renderStyle !== "classic_dark" && renderStyle !== "classic_light") {
    g.ellipse(0, 8, 54, 10).fill({
      color: renderStyle === "retro_tv" ? 0x60a5fa : 0x000000,
      alpha: renderStyle === "retro_tv" ? 0.16 : 0.22,
    });
  }

  // Helper: draw 2-segment stick or elastic rubber-hose limb
  const drawLimb = (
    x0: number,
    y0: number,
    a1: number,
    a2: number,
    l1: number,
    l2: number,
    col: number,
    width: number,
    endCap: "none" | "oval" | "white_glove" | "shoe" | "mitten",
  ) => {
    const jx = snap(x0 + Math.sin(a1) * l1);
    const jy = snap(y0 + Math.cos(a1) * l1);
    const ex = snap(jx + Math.sin(a1 + a2) * l2);
    const ey = snap(jy + Math.cos(a1 + a2) * l2);

    if (isPixel) {
      // Crisp blocky pixel segments
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const px = snap(lerp(x0, jx, u));
        const py = snap(lerp(y0, jy, u));
        g.rect(px - 6, py - 6, 12, 12).fill(col);
      }
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const px = snap(lerp(jx, ex, u));
        const py = snap(lerp(jy, ey, u));
        g.rect(px - 6, py - 6, 12, 12).fill(col);
      }
      if (endCap === "shoe") g.rect(ex - 6, ey - 4, 22, 12).fill(0x161824);
      return;
    }

    if (renderStyle === "rubber_hose") {
      // Smooth elastic curved Bezier limb (no rigid elbow kink!)
      g.moveTo(x0, y0)
        .quadraticCurveTo(jx, jy, ex, ey)
        .stroke({ color: col, width, cap: "round" });
    } else {
      g.moveTo(x0, y0)
        .lineTo(jx, jy)
        .lineTo(ex, ey)
        .stroke({ color: col, width, cap: "round", join: "round" });
    }

    if (endCap === "white_glove") {
      g.circle(ex, ey, width * 1.45).fill(0xffffff).stroke({ color: strokeCol, width: 3.0 });
    } else if (endCap === "oval") {
      g.ellipse(ex, ey, width * 0.95, width * 0.72).fill(col);
    } else if (endCap === "mitten") {
      g.circle(ex, ey, width * 1.15).fill(renderStyle === "greek_mythology" ? skinCol : col).stroke({ color: strokeCol, width: 2.4 });
    } else if (endCap === "shoe") {
      if (renderStyle === "rubber_hose") {
        g.ellipse(ex + 9, ey + 3, 18, 9).fill(0x141312);
      } else if (renderStyle === "modern_beanie") {
        g.roundRect(ex - 8, ey - 5, 26, 12, 5).fill(0x181a24).stroke({ color: 0xffffff, width: 1.8 });
      } else if (renderStyle === "greek_mythology") {
        g.roundRect(ex - 10, ey - 4, 24, 11, 4).fill(0x7c4d2b).stroke({ color: strokeCol, width: 2.2 });
      } else if (renderStyle !== "classic_dark" && renderStyle !== "classic_light") {
        g.ellipse(ex + 7, ey + 2, 13, 6).fill(col);
      }
    }
  };

  // --------------------------------------------------------------------------
  // 1. GROUNDED 2-BONE IK LEGS
  // --------------------------------------------------------------------------
  const legSpread = renderStyle === "greek_mythology" || renderStyle === "modern_beanie" ? 15 : 8;
  const ov = layer.boneOverrides;
  for (let i = 0; i < 2; i++) {
    const lx = i === 0 ? -legSpread : legSpread;
    const solvedLeg = solveGroundedLegIK({
      hipX: lx,
      hipY,
      legLen: legh,
      sideIndex: i as 0 | 1,
      walkCycle,
      walkWeight: walkW,
      runWeight: runW,
      sitWeight: sitW,
      kneelWeight: kneelW,
      danceWeight: danceW,
      globalTime,
      phaseOffset: ph,
      overrideThigh: i === 0 ? ov.leftThigh : ov.rightThigh,
      overrideShin: i === 0 ? ov.leftShin : ov.rightShin,
    });
    drawLimb(lx, hipY, solvedLeg.thighAng, solvedLeg.kneeAng, legh * 0.51, legh * 0.49, strokeCol, strokeW, "shoe");
  }

  // Upper body container for lean / tilt / dance
  const upper = new Container();
  upper.position.set(0, hipY);
  upper.rotation =
    (pose.torsoTilt ?? 0) +
    (danceW > 0.05 ? Math.sin(globalTime * 6.4 + ph) * 0.08 * danceW : 0);
  root.addChild(upper);
  const ug = new Graphics();
  upper.addChild(ug);

  const uShY = shY - hipY;
  const uHeadY = headY - hipY;

  // Helper bound to ug for upper limbs
  const drawUpperLimb = (
    x0: number,
    y0: number,
    a1: number,
    a2: number,
    l1: number,
    l2: number,
    col: number,
    width: number,
    endCap: "none" | "oval" | "white_glove" | "mitten",
  ) => {
    const jx = snap(x0 + Math.sin(a1) * l1);
    const jy = snap(y0 + Math.cos(a1) * l1);
    const ex = snap(jx + Math.sin(a1 + a2) * l2);
    const ey = snap(jy + Math.cos(a1 + a2) * l2);

    if (isPixel) {
      for (let i = 0; i <= 5; i++) {
        const u = i / 5;
        ug.rect(snap(lerp(x0, jx, u)) - 6, snap(lerp(y0, jy, u)) - 6, 12, 12).fill(col);
        ug.rect(snap(lerp(jx, ex, u)) - 6, snap(lerp(jy, ey, u)) - 6, 12, 12).fill(col);
      }
      return;
    }

    if (renderStyle === "rubber_hose") {
      ug.moveTo(x0, y0).quadraticCurveTo(jx, jy, ex, ey).stroke({ color: col, width, cap: "round" });
    } else {
      ug.moveTo(x0, y0).lineTo(jx, jy).lineTo(ex, ey).stroke({ color: col, width, cap: "round", join: "round" });
    }

    if (endCap === "white_glove") {
      ug.circle(ex, ey, width * 1.48).fill(0xffffff).stroke({ color: strokeCol, width: 2.8 });
    } else if (endCap === "oval") {
      ug.ellipse(ex, ey, width * 0.9, width * 0.68).fill(col);
    } else if (endCap === "mitten") {
      ug.circle(ex, ey, width * 1.15).fill(renderStyle === "greek_mythology" ? skinCol : col).stroke({ color: strokeCol, width: 2.4 });
    }
  };

  const handStyle: "none" | "oval" | "white_glove" | "mitten" =
    renderStyle === "thriller" || renderStyle === "rubber_hose"
      ? "white_glove"
      : renderStyle === "classic_dark" || renderStyle === "classic_light"
        ? "none"
        : renderStyle === "greek_mythology"
          ? "mitten"
          : "oval";

  const shoulderOffsetX =
    renderStyle === "modern_beanie" || renderStyle === "greek_mythology" || renderStyle === "pixel_theater" ? 28 : 4;

  // Back arm
  drawUpperLimb(-shoulderOffsetX, uShY + 12, ba1, ba2, ua, fa, strokeCol, strokeW, handStyle);

  // --------------------------------------------------------------------------
  // 2. TORSO PER STYLE
  // --------------------------------------------------------------------------
  if (renderStyle === "modern_beanie") {
    // Signature A2 bright yellow t-shirt + dark shorts
    ug.moveTo(-30, uShY + 4)
      .lineTo(30, uShY + 4)
      .lineTo(26, -12)
      .lineTo(-26, -12)
      .closePath()
      .fill(0xfacc15)
      .stroke({ color: 0x16161c, width: 4.0, join: "round" });
    ug.roundRect(-24, -14, 48, 22, 4).fill(0x1f2430).stroke({ color: 0x16161c, width: 3.4 });
  } else if (renderStyle === "greek_mythology") {
    // B8 draped Greek chiton / toga + gold meander trim + shoulder sash
    const toga = 0xf5ebd6;
    ug.moveTo(-36, uShY + 4)
      .lineTo(36, uShY + 4)
      .lineTo(44, 34)
      .quadraticCurveTo(0, 44, -44, 34)
      .closePath()
      .fill(toga)
      .stroke({ color: strokeCol, width: 3.8, join: "round" });
    // Cel-shade side fold
    ug.poly([12, uShY + 4, 36, uShY + 4, 44, 34, 16, 38]).fill({ color: 0xd9c5a3, alpha: 0.65 });
    // Crimson/gold sash drape
    ug.moveTo(-32, uShY + 6).lineTo(34, 14).stroke({ color: accentCol, width: 14, cap: "butt" });
    ug.rect(-42, 22, 84, 9).fill(0xe5b84b).stroke({ color: strokeCol, width: 2.0 });
  } else if (renderStyle === "pixel_theater") {
    // B7 blocky 16-bit character torso
    ug.rect(-24, uShY, 48, Math.abs(uShY) + 8).fill(shirtCol).stroke({ color: 0x0b0e1c, width: 4 });
    ug.rect(-24, -16, 48, 20).fill(0x283259).stroke({ color: 0x0b0e1c, width: 4 });
  } else if (renderStyle === "retro_tv") {
    // B3 rounded white luminous body pill
    ug.roundRect(-18, uShY + 4, 36, Math.abs(uShY) + 4, 18)
      .fill(0xf4f7ff)
      .stroke({ color: 0x93c5fd, width: 2.6, alpha: 0.65 });
  } else {
    // Classic A1 / Hand-Drawn B1-B2-B5 / Thriller B4 / Rubber Hose A7 / Meme B6: expressive single-line spine
    ug.moveTo(0, uShY)
      .quadraticCurveTo(renderStyle === "rubber_hose" ? 10 : 0, uShY * 0.5, 0, 0)
      .stroke({ color: strokeCol, width: strokeW * 1.12, cap: "round" });
  }

  // --------------------------------------------------------------------------
  // 3. HEAD & FACE PER STYLE
  // --------------------------------------------------------------------------
  const headGroup = new Container();
  headGroup.position.set(0, uHeadY);
  const headRot = (ov.head ?? 0) + expr.tilt + Math.sin(globalTime * 1.4 + ph) * 0.025;
  headGroup.rotation = headRot;
  upper.addChild(headGroup);
  const hg = new Graphics();
  headGroup.addChild(hg);

  const stickPendulum = solvePendulumSway({
    timeSec: globalTime,
    phaseOffset: ph,
    walkCycle,
    walkWeight: walkW,
    runWeight: runW,
    danceWeight: danceW,
    headTilt: headRot,
    torsoTilt: upper.rotation,
    strength: def.wardrobe?.secondaryMotion ?? 1.0,
  });

  const isTalking = layer.talkWindows.some(([a, b]) => localTime >= a && localTime <= b);
  const talkAmt = isTalking ? 0.35 + 0.65 * Math.abs(Math.sin(globalTime * 15)) : 0;
  const blink = (globalTime + ph) % 4.0 > 3.86;

  if (isPixel) {
    // B7 Pixel Theater blocky white head + pixel eyes
    hg.rect(-headR, -headR, headR * 2, headR * 2).fill(0xf7f8fc).stroke({ color: 0x0b0e1c, width: 4 });
    if (!blink) {
      hg.rect(-18, -8, 10, 12).fill(0x121420);
      hg.rect(8, -8, 10, 12).fill(0x121420);
    } else {
      hg.rect(-18, -2, 10, 4).fill(0x121420);
      hg.rect(8, -2, 10, 4).fill(0x121420);
    }
    hg.rect(-10, 14, 20, talkAmt > 0.3 ? 10 : 5).fill(0x121420);
  } else if (renderStyle === "classic_dark" || renderStyle === "classic_light") {
    // A1 Classic Minimalist: hollow circle head (no fill!) + optional ultra-minimal expression
    hg.circle(0, 0, headR)
      .fill(renderStyle === "classic_dark" ? 0x06070a : 0xffffff)
      .stroke({ color: strokeCol, width: strokeW });
    // Minimal line expression only when non-neutral
    if (layer.expression !== "neutral") {
      if (!blink) {
        hg.circle(-12, -4, 3.6).fill(strokeCol);
        hg.circle(12, -4, 3.6).fill(strokeCol);
      }
      hg.moveTo(-10, 12)
        .quadraticCurveTo(0, 12 + expr.smile * 1.3, 10, 12)
        .stroke({ color: strokeCol, width: 3.2, cap: "round" });
    }
  } else {
    // Filled cartoon head (white paper for B1-B6/A2/A7, warm skin for B8 Greek Mythology)
    const headFill =
      renderStyle === "greek_mythology"
        ? skinCol
        : renderStyle === "retro_tv"
          ? 0xf4f7ff
          : 0xfdfcfa;

    hg.circle(0, 0, headR).fill(headFill).stroke({
      color: renderStyle === "retro_tv" ? 0x93c5fd : strokeCol,
      width: renderStyle === "meme" ? 7.5 : renderStyle === "retro_tv" ? 3.2 : 4.2,
    });

    const faceInk = renderStyle === "retro_tv" ? 0x0b0e16 : strokeCol;

    // A7 Rubber Hose: signature two fine curved hair tufts + pie-cut eyes
    if (renderStyle === "rubber_hose") {
      hg.moveTo(-6, -headR)
        .quadraticCurveTo(-18, -headR - 22, -2, -headR - 18)
        .stroke({ color: faceInk, width: 3.4, cap: "round" });
      hg.moveTo(4, -headR)
        .quadraticCurveTo(18, -headR - 24, 16, -headR - 12)
        .stroke({ color: faceInk, width: 3.4, cap: "round" });
    }

    // B8 Greek Mythology: hair, laurel wreath & beard
    if (renderStyle === "greek_mythology") {
      const hairCol = hexToNumber(def.palette.hair, 0x3b2618);
      hg.arc(0, -6, headR + 2, Math.PI * 1.05, Math.PI * 1.95).fill(hairCol).stroke({ color: strokeCol, width: 3.2 });
      // Golden Greek laurel leaves
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          hg.ellipse(side * (16 + k * 9), -headR + 4 + k * 5, 7, 3.5)
            .fill(0xe5b84b)
            .stroke({ color: strokeCol, width: 1.5 });
        }
      }
      if (def.accessories.facialHair !== "none") {
        drawFacialHair({
          g: hg,
          style: def.accessories.facialHair,
          hair: hairCol,
          hairDark: shadeColor(hairCol, 0.72),
          outline: strokeCol,
          fs: headR / 41,
          pendulum: stickPendulum,
        });
      } else if (def.age === "elder") {
        drawFacialHair({
          g: hg,
          style: "full_beard",
          hair: hairCol,
          hairDark: shadeColor(hairCol, 0.72),
          outline: strokeCol,
          fs: headR / 41,
          pendulum: stickPendulum,
        });
      }
    }

    // Optional facial hair & hats on expressive non-minimalist stickman styles
    if (
      renderStyle !== "greek_mythology" &&
      renderStyle !== "modern_beanie" &&
      def.accessories.facialHair !== "none"
    ) {
      const hairCol = hexToNumber(def.palette.hair, 0x1e1a1c);
      drawFacialHair({
        g: hg,
        style: def.accessories.facialHair,
        hair: hairCol,
        hairDark: shadeColor(hairCol, 0.72),
        outline: faceInk,
        fs: headR / 41,
        pendulum: stickPendulum,
      });
    }
    if (
      renderStyle !== "modern_beanie" &&
      def.accessories.hat !== "none"
    ) {
      drawHeadwear({
        g: hg,
        hat: def.accessories.hat,
        hatCol: hexToNumber(def.wardrobe?.hatColor ?? def.palette.accent, accentCol),
        accent: accentCol,
        outline: faceInk,
        fs: headR / 41,
        feather: Boolean(def.wardrobe?.feather),
        pendulum: stickPendulum,
      });
    }

    // B6 Meme: asymmetric short side-part tuft
    if (renderStyle === "meme") {
      hg.moveTo(-26, -headR + 10)
        .quadraticCurveTo(-6, -headR - 16, 22, -headR + 6)
        .stroke({ color: faceInk, width: 6.5, cap: "round" });
    }

    // Eyes
    const eyeY = -4;
    const eyeDx = renderStyle === "handdrawn" ? 13 : 14;
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (blink || expr.mouthStyle === "laugh") {
        const dy = expr.mouthStyle === "laugh" ? -5 : 3;
        hg.moveTo(ex - 7, eyeY).quadraticCurveTo(ex, eyeY + dy, ex + 7, eyeY).stroke({ color: faceInk, width: 3.5, cap: "round" });
      } else if (renderStyle === "rubber_hose") {
        // 1930s classic oval pie-cut eyes
        hg.ellipse(ex, eyeY, 5.5, 9.5).fill(faceInk);
        hg.poly([ex, eyeY, ex + 6, eyeY - 5, ex + 6, eyeY + 1]).fill(headFill);
      } else if (renderStyle === "greek_mythology") {
        // B8 standard: dark eye shape with single crisp white dot
        hg.ellipse(ex, eyeY, 5.8, 7.2 * expr.eyeOpen).fill(0x141010);
        hg.circle(ex - 1.5, eyeY - 2.2, 2.0).fill(0xffffff);
      } else if (renderStyle === "modern_beanie") {
        // A2 minimal dot eyes (anti-bug-eye rule)
        hg.circle(ex, eyeY, 4.2).fill(faceInk);
      } else {
        // Expressive cartoon oval eyes
        hg.ellipse(ex, eyeY, 4.8, 6.8 * expr.eyeOpen).fill(faceInk);
        if (renderStyle === "meme" || renderStyle === "handdrawn") {
          hg.circle(ex - 1.2, eyeY - 2, 1.5).fill(0xffffff);
        }
      }

      // Expressive eyebrows (stronger in B1, B6 Meme, B8)
      if (renderStyle !== "modern_beanie") {
        const by = -18 + expr.browLift;
        hg.moveTo(ex - side * 8, by + expr.browIn)
          .lineTo(ex + side * 9, by + expr.browOut)
          .stroke({ color: faceInk, width: renderStyle === "meme" ? 5.0 : 3.2, cap: "round" });
      }
    }

    // Blush / Tears
    if (expr.blush > 0.2 && renderStyle !== "retro_tv") {
      hg.ellipse(-20, 9, 7, 3.8).fill({ color: 0xf43f5e, alpha: expr.blush * 0.45 });
      hg.ellipse(20, 9, 7, 3.8).fill({ color: 0xf43f5e, alpha: expr.blush * 0.45 });
    }
    if (expr.tears > 0.1) {
      for (const side of [-1, 1]) {
        const dropU = (globalTime * 0.9 + (side < 0 ? 0 : 0.45)) % 1;
        hg.ellipse(side * eyeDx, eyeY + 9 + dropU * 22, 3, 4.5).fill({ color: 0x38bdf8, alpha: 0.85 });
      }
    }

    // Mouth
    const my = 15;
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      const mh = expr.mouthStyle === "laugh" ? 11 : expr.mouthStyle === "gasp" ? 9 : lerp(4, 10, talkAmt);
      hg.ellipse(0, my, 10, mh * 0.72).fill(faceInk);
    } else if (expr.mouthStyle === "open_smile") {
      hg.moveTo(-12, my - 1).quadraticCurveTo(0, my + 12, 12, my - 1).closePath().fill(faceInk);
    } else {
      hg.moveTo(-11, my)
        .quadraticCurveTo(0, my + expr.smile * 1.6, 11, my)
        .stroke({ color: faceInk, width: renderStyle === "meme" ? 4.8 : 3.2, cap: "round" });
    }

    // A2 Modern Beanie: signature smooth rounded red beanie (no pom-pom!)
    if (renderStyle === "modern_beanie") {
      hg.moveTo(-headR - 2, -12)
        .bezierCurveTo(-headR, -headR * 1.55, headR, -headR * 1.55, headR + 2, -12)
        .closePath()
        .fill(0xe11d48)
        .stroke({ color: 0x16161c, width: 3.6, join: "round" });
      hg.roundRect(-headR - 4, -18, headR * 2 + 8, 12, 6)
        .fill(shadeColor(0xe11d48, 0.84))
        .stroke({ color: 0x16161c, width: 3.2 });
    }
  }

  // Front arm
  drawUpperLimb(shoulderOffsetX, uShY + 12, fa1, fa2, ua, fa, strokeCol, strokeW, handStyle);
}
