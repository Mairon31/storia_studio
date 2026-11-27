import { Container, Graphics } from "pixi.js";
import type { CharacterDefinition, CharacterRenderStyle, Layer } from "@storia/schema";
import { clamp, hexToNumber, lerp, shadeColor } from "./color.js";
import { drawFacialHair, drawHeadwear } from "./rigHairAndAccessories.js";
import { solveGroundedLegIK, solvePendulumSway } from "./rigKinematics.js";
import type { StickmanExprSnapshot, StickmanPoseSnapshot } from "./stickmanRig.js";

type CharacterLayer = Extract<Layer, { type: "character" }>;

export type StylizedCharacterMode =
  | "stylized_3d"
  | "kurzgesagt"
  | "anime_cel"
  | "retro_psx"
  | "paper_cutout"
  | "pixel_theater";

export function isStylizedCharacterMode(style: CharacterRenderStyle): style is StylizedCharacterMode {
  return (
    style === "stylized_3d" ||
    style === "kurzgesagt" ||
    style === "anime_cel" ||
    style === "retro_psx" ||
    style === "paper_cutout" ||
    style === "pixel_theater"
  );
}

/**
 * Draws a smooth 3D-shaded capsule limb (ambient shadow + lit core + specular ridge).
 */
function draw3DCapsuleLimb(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  r: number,
  baseCol: number,
  handCol: number,
  drawHand: boolean,
): void {
  const dark = shadeColor(baseCol, 0.68);
  const light = shadeColor(baseCol, 1.24);
  const spec = shadeColor(baseCol, 1.48);

  // Outer soft shade silhouette
  g.moveTo(x0, y0).lineTo(x1, y1).lineTo(x2, y2).stroke({ color: dark, width: r * 2.18, cap: "round", join: "round" });
  // Main 3D cylinder body
  g.moveTo(x0 - 1.5, y0 - 1.5)
    .lineTo(x1 - 1.5, y1 - 1.5)
    .lineTo(x2 - 1.5, y2 - 1.5)
    .stroke({ color: baseCol, width: r * 1.82, cap: "round", join: "round" });
  // Specular highlight band
  g.moveTo(x0 - r * 0.32, y0 - r * 0.25)
    .lineTo(x1 - r * 0.32, y1 - r * 0.25)
    .lineTo(x2 - r * 0.32, y2 - r * 0.25)
    .stroke({ color: light, width: r * 0.68, cap: "round", join: "round", alpha: 0.72 });
  g.circle(x1 - r * 0.25, y1 - r * 0.25, r * 0.28).fill({ color: spec, alpha: 0.35 });

  if (drawHand) {
    const hDark = shadeColor(handCol, 0.74);
    const hLight = shadeColor(handCol, 1.26);
    g.circle(x2, y2, r * 1.02).fill(hDark);
    g.circle(x2 - 1.5, y2 - 1.5, r * 0.88).fill(handCol);
    g.circle(x2 - r * 0.35, y2 - r * 0.38, r * 0.32).fill({ color: hLight, alpha: 0.75 });
  }
}

/**
 * Draws a chunky 16-bit integer-grid pixel line with dark 1-block outline.
 */
function drawPixelBlockLine(
  g: Graphics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  px: number,
  fillCol: number,
  outlineCol: number,
): void {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (px * 0.75)));
  const snap = (v: number) => Math.round(v / px) * px;
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    pts.push([snap(lerp(x0, x1, u)), snap(lerp(y0, y1, u))]);
  }
  for (const [bx, by] of pts) {
    g.rect(bx - px * 1.1, by - px * 1.1, px * 2.2, px * 2.2).fill(outlineCol);
  }
  for (const [bx, by] of pts) {
    g.rect(bx - px * 0.65, by - px * 0.65, px * 1.3, px * 1.3).fill(fillCol);
  }
}

/**
 * Renders 6 dedicated, full-craft character visual grammars:
 * - `stylized_3d`: Smooth clay/plastic 3D shading with volumetric speculars & contact shadows
 * - `kurzgesagt`: Iconic lineless flat-vector geometric character with two-tone light split
 * - `anime_cel`: Vivid anime cel-shaded character with luminous dual-catchlight eyes & hair halo
 * - `retro_psx`: 1998 PlayStation low-poly faceted character with flat-shaded polygons & vertex jitter
 * - `paper_cutout`: Multi-plane craft-paper stop-motion puppet with white die-cut border & drop shadow
 * - `pixel_theater`: True 16-bit integer-block pixel-art sprite character
 */
export function renderStylizedCharacter(
  container: Container,
  mode: StylizedCharacterMode,
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
    def.age === "toddler" ? 0.64 :
    def.age === "boy" || def.age === "girl" ? 0.78 :
    def.age === "teen" ? 0.9 : 1.0;

  root.scale.set(faceLeft ? -ageScale : ageScale, ageScale);
  container.addChild(root);

  const ph = (def.id.charCodeAt(0) + def.id.length * 7) * 0.73;
  const runW = pose.run ?? 0;
  const sitW = pose.sit ?? 0;
  const kneelW = pose.kneel ?? 0;
  const danceW = pose.dance ?? 0;
  const walkW = clamp(walkSpeed + (pose.walk ?? 0) + runW * 0.92, 0, 1);

  const walkCycle = globalTime * (runW > 0.2 ? 12.0 : 7.4) + ph;
  const walkBounce = Math.abs(Math.sin(walkCycle)) * (runW > 0.2 ? 12 : 6) * walkW;
  const danceBounce = Math.abs(Math.sin(globalTime * 6.2 + ph)) * 9 * danceW;
  const idleBob = Math.sin(globalTime * 2.2 + ph) * 2.2;

  const isPixel = mode === "pixel_theater";
  const isPsx = mode === "retro_psx";
  const px = 8;
  const psxSnap = (v: number) =>
    isPixel ? Math.round(v / px) * px : isPsx ? Math.round(v / 5) * 5 + Math.sin(Math.floor(globalTime * 12) * 3.1 + v) * 0.8 : v;

  const activePose = pose.activePose ?? layer.pose;
  let ba1 = pose.ba1;
  let ba2 = pose.ba2;
  let fa1 = pose.fa1;
  let fa2 = pose.fa2;
  if (activePose === "wave" || activePose === "wave_both") {
    const osc = Math.sin(globalTime * 8.0 + ph) * 0.32;
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
    const dOsc = Math.sin(globalTime * 6.2 + ph) * 0.44 * danceW;
    ba1 += dOsc;
    fa1 += dOsc;
  }
  if (walkW > 0.02 && sitW < 0.2) {
    const sw = Math.sin(walkCycle) * (runW > 0.2 ? 0.65 : 0.42) * walkW;
    ba1 += sw;
    fa1 -= sw;
  }

  const isSil = layer.silhouette;
  const silCol = hexToNumber(layer.tint ?? "#0f1526", 0x0f1526);
  const skinCol = isSil ? silCol : hexToNumber(def.palette.skin, 0xe8be98);
  const hairCol = isSil ? silCol : hexToNumber(def.palette.hair, 0x221c22);
  const shirtCol = isSil ? silCol : hexToNumber(def.palette.shirt, mode === "kurzgesagt" ? 0x00d4ff : 0x5c85ff);
  const jacketCol = isSil ? silCol : def.palette.jacket ? hexToNumber(def.palette.jacket) : undefined;
  const pantsCol = isSil ? silCol : hexToNumber(def.palette.pants, 0x252d44);
  const shoeCol = isSil ? silCol : hexToNumber(def.palette.shoes, 0x161924);
  const accentCol = isSil ? silCol : hexToNumber(def.palette.accent, 0xffd447);
  const torsoMainCol = jacketCol ?? shirtCol;
  const isFemale = def.genderPresentation === "feminine";

  const legH = isPixel ? 168 : mode === "kurzgesagt" ? 172 : 194;
  const torsoH = isPixel ? 116 : mode === "kurzgesagt" ? 124 : 132;
  const hipY = psxSnap(-legH + 50 * sitW + 68 * kneelW - walkBounce * 0.45 - danceBounce * 0.5);
  const shoulderY = psxSnap(hipY - torsoH + idleBob * 0.55);
  const headR = mode === "stylized_3d" ? 46 : mode === "kurzgesagt" ? 45 : mode === "anime_cel" ? 43 : isPixel ? 40 : 42;
  const headY = psxSnap(shoulderY - headR - (mode === "kurzgesagt" ? 8 : 12));
  const armU = isPixel ? 62 : 68;
  const armF = isPixel ? 56 : 62;

  const isTalking = layer.talkWindows.some(([s, e]) => localTime >= s && localTime <= e);
  const talkAmt = isTalking ? 0.35 + 0.65 * Math.abs(Math.sin(globalTime * 15)) : 0;
  const isBlinking = (globalTime + ph) % 4.0 > 3.88;

  // Ground contact shadow
  const shadowG = new Graphics();
  if (mode === "stylized_3d") {
    shadowG.ellipse(0, 10, 68, 16).fill({ color: 0x050814, alpha: 0.34 });
    shadowG.ellipse(0, 10, 44, 9).fill({ color: 0x02040a, alpha: 0.28 });
  } else if (mode === "paper_cutout") {
    shadowG.ellipse(8, 10, 56, 11).fill({ color: 0x1a140e, alpha: 0.24 });
  } else if (isPixel) {
    shadowG.rect(-48, 0, 96, 12).fill({ color: 0x050814, alpha: 0.42 });
  } else {
    shadowG.ellipse(0, 9, 54, 11).fill({ color: 0x060a18, alpha: 0.26 });
  }
  root.addChild(shadowG);

  const legG = new Graphics();
  root.addChild(legG);

  const legSpread = mode === "stylized_3d" || mode === "kurzgesagt" ? 18 : 16;
  const bo = layer.boneOverrides;

  // =========================================================================
  // 1. LEGS (Style-Specific Geometry)
  // =========================================================================
  for (let sideIdx = 0; sideIdx < 2; sideIdx++) {
    const hx = sideIdx === 0 ? -legSpread : legSpread;
    const ik = solveGroundedLegIK({
      hipX: hx,
      hipY,
      legLen: legH,
      sideIndex: sideIdx as 0 | 1,
      walkCycle,
      walkWeight: walkW,
      runWeight: runW,
      sitWeight: sitW,
      kneelWeight: kneelW,
      danceWeight: danceW,
      globalTime,
      phaseOffset: ph,
      overrideThigh: sideIdx === 0 ? bo.leftThigh : bo.rightThigh,
      overrideShin: sideIdx === 0 ? bo.leftShin : bo.rightShin,
    });
    const u1 = legH * 0.51;
    const u2 = legH * 0.49;
    const kx = psxSnap(hx + Math.sin(ik.thighAng) * u1);
    const ky = psxSnap(hipY + Math.cos(ik.thighAng) * u1);
    const fx = psxSnap(kx + Math.sin(ik.thighAng + ik.kneeAng) * u2);
    const fy = psxSnap(ky + Math.cos(ik.thighAng + ik.kneeAng) * u2);
    const pCol = sideIdx === 0 ? shadeColor(pantsCol, 0.88) : pantsCol;

    if (mode === "stylized_3d") {
      draw3DCapsuleLimb(legG, hx, hipY, kx, ky, fx, fy, 12.5, pCol, shoeCol, false);
      // Glossy 3D rounded sneaker/boot
      legG.ellipse(fx + 8, fy + 4, 21, 11).fill(shadeColor(shoeCol, 0.65));
      legG.ellipse(fx + 7, fy + 2, 19, 9.5).fill(shoeCol);
      legG.ellipse(fx + 3, fy - 1, 9, 3.5).fill({ color: 0xffffff, alpha: 0.25 });
    } else if (mode === "kurzgesagt") {
      // Lineless crisp vector pill legs + flat geometric shoe
      legG.moveTo(hx, hipY).lineTo(kx, ky).lineTo(fx, fy).stroke({ color: pCol, width: 20, cap: "round", join: "round" });
      legG.roundRect(fx - 9, fy - 5, 30, 14, 7).fill(sideIdx === 0 ? shadeColor(shoeCol, 0.82) : shoeCol);
      legG.roundRect(fx - 7, fy + 5, 26, 4, 2).fill({ color: 0xffffff, alpha: 0.25 });
    } else if (mode === "anime_cel") {
      const ink = 0x161926;
      legG.moveTo(hx, hipY).lineTo(kx, ky).lineTo(fx, fy).stroke({ color: ink, width: 26, cap: "round", join: "round" });
      legG.moveTo(hx, hipY).lineTo(kx, ky).lineTo(fx, fy).stroke({ color: pCol, width: 20, cap: "round", join: "round" });
      legG.moveTo(hx + 3, hipY).lineTo(kx + 3, ky).lineTo(fx + 3, fy).stroke({ color: shadeColor(pCol, 0.78), width: 7, cap: "round", join: "round" });
      legG.roundRect(fx - 10, fy - 4, 28, 13, 5).fill(shoeCol).stroke({ color: ink, width: 2.8 });
    } else if (mode === "retro_psx") {
      // Faceted low-poly trapezoidal thigh & shin blocks
      const pLight = shadeColor(pCol, 1.15);
      const pDark = shadeColor(pCol, 0.65);
      legG.poly([hx - 11, hipY, hx + 11, hipY, kx + 9, ky, kx - 9, ky]).fill(pLight);
      legG.poly([hx, hipY, hx + 11, hipY, kx + 9, ky, kx, ky]).fill(pDark);
      legG.poly([kx - 9, ky, kx + 9, ky, fx + 7, fy, fx - 7, fy]).fill(pCol);
      legG.poly([kx, ky, kx + 9, ky, fx + 7, fy, fx, fy]).fill(pDark);
      legG.poly([fx - 9, fy - 4, fx + 18, fy - 2, fx + 20, fy + 10, fx - 10, fy + 10]).fill(shoeCol);
    } else if (mode === "paper_cutout") {
      // Drop shadow -> white die-cut border -> textured paper fill
      legG.moveTo(hx + 7, hipY + 7).lineTo(kx + 7, ky + 7).lineTo(fx + 7, fy + 7).stroke({ color: 0x000000, width: 28, cap: "round", join: "round", alpha: 0.22 });
      legG.moveTo(hx, hipY).lineTo(kx, ky).lineTo(fx, fy).stroke({ color: 0xfbf7ef, width: 30, cap: "round", join: "round" });
      legG.moveTo(hx, hipY).lineTo(kx, ky).lineTo(fx, fy).stroke({ color: pCol, width: 20, cap: "round", join: "round" });
      legG.roundRect(fx - 12, fy - 7, 34, 18, 8).fill(0xfbf7ef);
      legG.roundRect(fx - 9, fy - 4, 28, 12, 6).fill(shoeCol);
    } else if (mode === "pixel_theater") {
      drawPixelBlockLine(legG, hx, hipY, kx, ky, px, pCol, 0x0b0e1c);
      drawPixelBlockLine(legG, kx, ky, fx, fy, px, pCol, 0x0b0e1c);
      // Chunky 16-bit boot
      legG.rect(fx - px, fy - px * 0.5, px * 3.5, px * 1.8).fill(0x0b0e1c);
      legG.rect(fx - px * 0.6, fy - px * 0.2, px * 2.7, px * 1.1).fill(shoeCol);
      legG.rect(fx - px * 0.3, fy - px * 0.1, px * 1.1, px * 0.45).fill(shadeColor(shoeCol, 1.45));
    }
  }

  // =========================================================================
  // 2. UPPER BODY CONTAINER (TORSO, ARMS, HEAD)
  // =========================================================================
  const upper = new Container();
  upper.position.set(0, hipY);
  upper.rotation = (pose.torsoTilt ?? 0) + (danceW > 0.05 ? Math.sin(globalTime * 6.2 + ph) * 0.07 * danceW : 0);
  root.addChild(upper);

  const ug = new Graphics();
  upper.addChild(ug);

  const uShY = shoulderY - hipY;
  const uHeadY = headY - hipY;
  const shOffX = mode === "stylized_3d" ? 36 : mode === "kurzgesagt" ? 34 : isPixel ? 32 : 34;

  const drawArm = (sx: number, sy: number, a1: number, a2: number, isBack: boolean) => {
    const ex = psxSnap(sx + Math.sin(a1) * armU);
    const ey = psxSnap(sy + Math.cos(a1) * armU);
    const wx = psxSnap(ex + Math.sin(a1 + a2) * armF);
    const wy = psxSnap(ey + Math.cos(a1 + a2) * armF);
    const armCol = isBack ? shadeColor(torsoMainCol, 0.86) : torsoMainCol;
    const hCol = isBack ? shadeColor(skinCol, 0.9) : skinCol;

    if (mode === "stylized_3d") {
      draw3DCapsuleLimb(ug, sx, sy, ex, ey, wx, wy, 10.5, armCol, hCol, true);
    } else if (mode === "kurzgesagt") {
      ug.moveTo(sx, sy).lineTo(ex, ey).lineTo(wx, wy).stroke({ color: armCol, width: 17, cap: "round", join: "round" });
      ug.circle(wx, wy, 9.5).fill(hCol);
    } else if (mode === "anime_cel") {
      const ink = 0x161926;
      ug.moveTo(sx, sy).lineTo(ex, ey).lineTo(wx, wy).stroke({ color: ink, width: 22, cap: "round", join: "round" });
      ug.moveTo(sx, sy).lineTo(ex, ey).lineTo(wx, wy).stroke({ color: armCol, width: 16.5, cap: "round", join: "round" });
      ug.circle(wx, wy, 10).fill(hCol).stroke({ color: ink, width: 2.5 });
    } else if (mode === "retro_psx") {
      ug.moveTo(sx, sy).lineTo(ex, ey).stroke({ color: shadeColor(armCol, 1.1), width: 16, cap: "butt" });
      ug.moveTo(ex, ey).lineTo(wx, wy).stroke({ color: shadeColor(armCol, 0.78), width: 13, cap: "butt" });
      ug.rect(wx - 7, wy - 7, 14, 14).fill(hCol);
    } else if (mode === "paper_cutout") {
      ug.moveTo(sx + 6, sy + 6).lineTo(ex + 6, ey + 6).lineTo(wx + 6, wy + 6).stroke({ color: 0x000000, width: 24, cap: "round", join: "round", alpha: 0.2 });
      ug.moveTo(sx, sy).lineTo(ex, ey).lineTo(wx, wy).stroke({ color: 0xfbf7ef, width: 26, cap: "round", join: "round" });
      ug.moveTo(sx, sy).lineTo(ex, ey).lineTo(wx, wy).stroke({ color: armCol, width: 17, cap: "round", join: "round" });
      ug.circle(wx, wy, 12.5).fill(0xfbf7ef);
      ug.circle(wx, wy, 9).fill(hCol);
    } else if (mode === "pixel_theater") {
      drawPixelBlockLine(ug, sx, sy, ex, ey, px, armCol, 0x0b0e1c);
      drawPixelBlockLine(ug, ex, ey, wx, wy, px, armCol, 0x0b0e1c);
      ug.rect(wx - px * 0.9, wy - px * 0.9, px * 1.8, px * 1.8).fill(0x0b0e1c);
      ug.rect(wx - px * 0.55, wy - px * 0.55, px * 1.1, px * 1.1).fill(hCol);
    }
  };

  // Back arm
  drawArm(-shOffX, uShY + 14, ba1, ba2, true);

  // =========================================================================
  // 3. TORSO (Style-Specific Sculpted Design)
  // =========================================================================
  const tH = Math.abs(uShY) + 12;
  if (mode === "stylized_3d") {
    const tW = isFemale ? 36 : 42;
    const tDark = shadeColor(torsoMainCol, 0.64);
    const tLight = shadeColor(torsoMainCol, 1.24);
    // Contact shadow + 3D rounded pill torso
    ug.roundRect(-tW, uShY - 2, tW * 2, tH, 28).fill(tDark);
    ug.roundRect(-tW, uShY - 4, tW * 1.88, tH - 3, 26).fill(torsoMainCol);
    // Volumetric highlight lobe on upper-left chest
    ug.ellipse(-tW * 0.36, uShY + tH * 0.28, tW * 0.34, tH * 0.24).fill({ color: tLight, alpha: 0.48 });
    ug.ellipse(-tW * 0.44, uShY + tH * 0.2, tW * 0.14, tH * 0.1).fill({ color: 0xffffff, alpha: 0.25 });
    // Soft collar/neck pill
    ug.roundRect(-14, uShY - 16, 28, 22, 10).fill(shadeColor(skinCol, 0.88));
    // Accent emblem / pocket
    ug.roundRect(-12, uShY + 26, 24, 16, 6).fill(accentCol);
  } else if (mode === "kurzgesagt") {
    // Lineless geometric pill torso with crisp 50/50 flat-vector lighting split
    const tW = isFemale ? 35 : 40;
    ug.roundRect(-tW, uShY - 2, tW * 2, tH, 26).fill(torsoMainCol);
    ug.roundRect(0, uShY - 2, tW, tH, 22).fill({ color: shadeColor(torsoMainCol, 0.8), alpha: 0.52 });
    // Crisp flat-vector geometric collar & badge
    ug.poly([-18, uShY, 0, uShY + 26, 18, uShY]).fill(accentCol);
    ug.circle(-16, uShY + 40, 6).fill({ color: 0xffffff, alpha: 0.85 });
    ug.rect(-tW + 4, -8, (tW - 4) * 2, 10).fill(shadeColor(pantsCol, 0.88));
  } else if (mode === "anime_cel") {
    const ink = 0x161926;
    const tW = isFemale ? 34 : 42;
    const waistW = isFemale ? 26 : 36;
    ug.moveTo(-tW, uShY + 4)
      .quadraticCurveTo(0, uShY - 6, tW, uShY + 4)
      .lineTo(waistW, 12)
      .quadraticCurveTo(0, 18, -waistW, 12)
      .closePath()
      .fill(torsoMainCol)
      .stroke({ color: ink, width: 3.2, join: "round" });
    // Hard-edged anime cel shadow wedge on right side
    ug.poly([tW * 0.28, uShY + 2, tW, uShY + 4, waistW, 12, waistW * 0.2, 14]).fill({ color: shadeColor(torsoMainCol, 0.72), alpha: 0.55 });
    // Crisp anime collar & tie/scarf
    ug.poly([-18, uShY, 0, uShY + 28, 18, uShY]).fill(0xffffff).stroke({ color: ink, width: 2.2 });
    ug.poly([-5, uShY + 18, 5, uShY + 18, 8, uShY + 62, 0, uShY + 72, -8, uShY + 62]).fill(accentCol).stroke({ color: ink, width: 2 });
    // Neck
    ug.roundRect(-10, uShY - 18, 20, 22, 5).fill(skinCol).stroke({ color: ink, width: 2.6 });
  } else if (mode === "retro_psx") {
    // Faceted low-poly chest with distinct bright/mid/dark polygons
    const tW = 40;
    const wW = 30;
    ug.poly([-tW, uShY, 0, uShY - 6, 0, 12, -wW, 10]).fill(shadeColor(torsoMainCol, 1.18));
    ug.poly([0, uShY - 6, tW, uShY, wW, 10, 0, 12]).fill(shadeColor(torsoMainCol, 0.72));
    ug.poly([-wW, -8, wW, -8, wW - 2, 12, -wW + 2, 12]).fill(pantsCol);
    ug.poly([-14, uShY + 20, 14, uShY + 20, 0, uShY + 46]).fill(accentCol);
    ug.rect(-10, uShY - 16, 20, 16).fill(shadeColor(skinCol, 0.88));
  } else if (mode === "paper_cutout") {
    const tW = isFemale ? 36 : 42;
    // Physical paper drop shadow
    ug.roundRect(-tW + 8, uShY + 6, tW * 2, tH, 16).fill({ color: 0x000000, alpha: 0.22 });
    // White die-cut paper margin
    ug.roundRect(-tW - 5, uShY - 7, tW * 2 + 10, tH + 10, 20).fill(0xfbf7ef);
    // Colored craft paper torso
    ug.roundRect(-tW, uShY - 2, tW * 2, tH, 15).fill(torsoMainCol);
    // Paper fold crease down center
    ug.rect(0, uShY - 2, tW, tH).fill({ color: 0x000000, alpha: 0.08 });
    // Cutout collar & pocket
    ug.poly([-18, uShY - 2, 0, uShY + 24, 18, uShY - 2]).fill(accentCol);
    ug.roundRect(-24, uShY + 42, 18, 20, 4).fill(shadeColor(torsoMainCol, 0.82));
  } else if (mode === "pixel_theater") {
    // True 16-bit integer-block pixel-art torso with shading, collar, belt & dark 1-px outline
    const bW = px * 8;
    const bH = Math.round(tH / px) * px;
    const topY = Math.round(uShY / px) * px;
    // 1-block dark outline
    ug.rect(-bW * 0.5 - px, topY - px, bW + px * 2, bH + px * 2).fill(0x0b0e1c);
    // Main shirt fill
    ug.rect(-bW * 0.5, topY, bW, bH).fill(torsoMainCol);
    // Left highlight pixel column & right shadow pixel columns
    ug.rect(-bW * 0.5, topY, px, bH - px * 2).fill(shadeColor(torsoMainCol, 1.28));
    ug.rect(bW * 0.5 - px * 2, topY, px * 2, bH - px * 2).fill(shadeColor(torsoMainCol, 0.72));
    // Pixel collar + tie/accent
    ug.rect(-px * 2, topY, px * 4, px).fill(0xffffff);
    ug.rect(-px, topY + px, px * 2, px * 4).fill(accentCol);
    // Pixel belt & pants waistband
    ug.rect(-bW * 0.5, topY + bH - px * 3, bW, px).fill(0x1a1c2c);
    ug.rect(-px, topY + bH - px * 3, px * 2, px).fill(0xffd447);
    ug.rect(-bW * 0.5, topY + bH - px * 2, bW, px * 2).fill(pantsCol);
  }

  // =========================================================================
  // 4. HEAD & EXPRESSIVE FACE (Style-Specific Craft)
  // =========================================================================
  const headGroup = new Container();
  headGroup.position.set(0, uHeadY);
  const headRot = (bo.head ?? 0) + expr.tilt + Math.sin(globalTime * 1.4 + ph) * 0.025;
  headGroup.rotation = headRot;
  upper.addChild(headGroup);

  const hg = new Graphics();
  headGroup.addChild(hg);

  const pendulum = solvePendulumSway({
    timeSec: globalTime,
    phaseOffset: ph,
    walkCycle,
    walkWeight: walkW,
    runWeight: runW,
    danceWeight: danceW,
    headTilt: headRot,
    torsoTilt: upper.rotation,
    strength: def.wardrobe?.secondaryMotion ?? 1,
  });

  const eyeDx = mode === "anime_cel" ? 16 : 15;
  const eyeY = mode === "anime_cel" ? -2 : -4;
  const mouthY = 17;

  if (mode === "pixel_theater") {
    // True 16-bit pixel-art head (10x9 pixel grid scaled by `px = 8`)
    const hw = px * 5;
    const hh = px * 4.5;
    // Back hair for long styles
    if (!isSil && (def.hairStyle === "long" || def.hairStyle === "wavy" || def.hairStyle === "bob" || def.hairStyle === "long_layered")) {
      hg.rect(-hw - px * 2, -hh, (hw + px * 2) * 2, hh * 2 + px * 5).fill(0x0b0e1c);
      hg.rect(-hw - px, -hh + px, (hw + px) * 2, hh * 2 + px * 3).fill(shadeColor(hairCol, 0.72));
    }
    // 1-block pixel outline + face fill
    hg.rect(-hw - px, -hh - px, hw * 2 + px * 2, hh * 2 + px * 2).fill(0x0b0e1c);
    hg.rect(-hw, -hh, hw * 2, hh * 2).fill(skinCol);
    // 16-bit side shading & forehead highlight
    hg.rect(hw - px * 2, -hh, px * 2, hh * 2).fill(shadeColor(skinCol, 0.84));
    hg.rect(-hw + px, -hh + px, px * 2, px).fill(shadeColor(skinCol, 1.15));
    // Pixel hair crown & bangs
    if (def.hairStyle !== "bald") {
      hg.rect(-hw - px, -hh - px * 2, hw * 2 + px * 2, px * 3).fill(0x0b0e1c);
      hg.rect(-hw, -hh - px, hw * 2, px * 2.5).fill(hairCol);
      hg.rect(-hw + px, -hh - px, px * 4, px * 0.8).fill(shadeColor(hairCol, 1.32));
      // Pixel side hair
      hg.rect(-hw, -hh + px, px, px * 2).fill(hairCol);
      hg.rect(hw - px, -hh + px, px, px * 2).fill(shadeColor(hairCol, 0.78));
    }
    // Pixel eyes (with white specular pixel!)
    for (const side of [-1, 1]) {
      const ex = side * px * 2 - px * 0.5;
      if (isBlinking || expr.mouthStyle === "laugh") {
        hg.rect(ex, -px * 0.2, px * 1.4, px * 0.5).fill(0x0b0e1c);
      } else {
        hg.rect(ex, -px, px * 1.3, px * 1.6).fill(0x0b0e1c);
        hg.rect(ex + px * 0.2, -px * 0.8, px * 0.5, px * 0.5).fill(0xffffff);
      }
      // Pixel eyebrows
      const browY = -px * 2 + Math.round(expr.browLift * 0.3) * px * 0.5;
      hg.rect(ex - px * 0.2, browY, px * 1.7, px * 0.45).fill(shadeColor(hairCol, 0.7));
    }
    // Pixel blush
    if (expr.blush > 0.22) {
      hg.rect(-hw + px * 0.6, px * 0.8, px * 1.2, px * 0.7).fill({ color: 0xff6b8b, alpha: 0.6 });
      hg.rect(hw - px * 1.8, px * 0.8, px * 1.2, px * 0.7).fill({ color: 0xff6b8b, alpha: 0.6 });
    }
    // Pixel mouth
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      hg.rect(-px, px * 1.6, px * 2, px * 1.3).fill(0x3a121e);
      hg.rect(-px * 0.6, px * 2.2, px * 1.2, px * 0.5).fill(0xff6b8b);
    } else if (expr.smile < -1.5) {
      hg.rect(-px * 1.2, px * 2.1, px * 2.4, px * 0.6).fill(0x0b0e1c);
    } else {
      hg.rect(-px * 1.1, px * 1.9, px * 2.2, px * 0.6).fill(0x0b0e1c);
    }
  } else if (mode === "stylized_3d") {
    // 3D Clay / Plastic Sphere Head with volumetric lighting, rim highlight & glossy eyes
    const sDark = shadeColor(skinCol, 0.72);
    const sLight = shadeColor(skinCol, 1.18);
    // Back hair volume for feminine/long styles
    if (def.hairStyle === "long" || def.hairStyle === "wavy" || def.hairStyle === "bob" || def.hairStyle === "long_layered") {
      hg.roundRect(-headR * 1.18, -headR * 0.5, headR * 2.36, headR * 2.35, 34).fill(shadeColor(hairCol, 0.68));
      hg.roundRect(-headR * 1.12, -headR * 0.52, headR * 2.16, headR * 2.25, 32).fill(hairCol);
    }
    // 3D ears
    for (const side of [-1, 1]) {
      hg.circle(side * (headR - 2), 4, 11).fill(side === 1 ? sDark : skinCol);
    }
    // Volumetric head sphere (shadow base -> lit core -> upper-left key specular)
    hg.circle(0, 0, headR).fill(sDark);
    hg.circle(-3, -3, headR * 0.93).fill(skinCol);
    hg.ellipse(-14, -18, headR * 0.42, headR * 0.28).fill({ color: sLight, alpha: 0.42 });
    hg.ellipse(-18, -22, headR * 0.16, headR * 0.1).fill({ color: 0xffffff, alpha: 0.22 });
    // Sculpted 3D button nose
    hg.ellipse(0, 5, 6.5, 5).fill(sDark);
    hg.ellipse(-1, 4, 5.5, 4).fill(sLight);
    // 3D Hair cap with glossy clay highlight ribbon
    if (def.hairStyle !== "bald") {
      const hDark = shadeColor(hairCol, 0.68);
      const hLight = shadeColor(hairCol, 1.32);
      hg.moveTo(-headR * 0.98, -10)
        .bezierCurveTo(-headR * 1.08, -headR * 1.32, headR * 1.08, -headR * 1.32, headR * 0.98, -10)
        .bezierCurveTo(headR * 0.55, -28, 0, -24, -headR * 0.25, -34)
        .bezierCurveTo(-headR * 0.55, -24, -headR * 0.8, -20, -headR * 0.98, -10)
        .closePath()
        .fill(hDark);
      hg.moveTo(-headR * 0.94, -12)
        .bezierCurveTo(-headR * 1.02, -headR * 1.26, headR * 0.96, -headR * 1.26, headR * 0.92, -12)
        .bezierCurveTo(headR * 0.52, -30, 0, -26, -headR * 0.24, -36)
        .bezierCurveTo(-headR * 0.54, -26, -headR * 0.78, -22, -headR * 0.94, -12)
        .closePath()
        .fill(hairCol);
      hg.moveTo(-22, -36).quadraticCurveTo(0, -48, 22, -35).stroke({ color: hLight, width: 6, alpha: 0.45, cap: "round" });
    }
    // Glossy 3D eyes
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (isBlinking || expr.mouthStyle === "laugh") {
        hg.moveTo(ex - 8, eyeY).quadraticCurveTo(ex, eyeY + (expr.mouthStyle === "laugh" ? -6 : 5), ex + 8, eyeY).stroke({ color: 0x1a1e2e, width: 4, cap: "round" });
      } else {
        hg.ellipse(ex, eyeY, 8.2, 9.5 * expr.eyeOpen).fill(0xffffff);
        hg.circle(ex + 1, eyeY + 0.5, 5.4).fill(0x1b2436);
        hg.circle(ex - 2, eyeY - 2.5, 2.4).fill(0xffffff);
        hg.circle(ex + 2.5, eyeY + 2.5, 1.1).fill({ color: 0xffffff, alpha: 0.75 });
      }
      const by = -18 + clamp(expr.browLift, -3, 2.5);
      hg.moveTo(ex - side * 8, by + expr.browIn * 0.6).lineTo(ex + side * 9, by + expr.browOut * 0.6).stroke({ color: shadeColor(hairCol, 0.72), width: 4.5, cap: "round" });
    }
    // Warm 3D cheeks
    hg.ellipse(-22, 10, 8, 4.5).fill({ color: 0xff6f88, alpha: Math.max(0.18, expr.blush * 0.5) });
    hg.ellipse(22, 10, 8, 4.5).fill({ color: 0xff6f88, alpha: Math.max(0.18, expr.blush * 0.5) });
    // Expressive 3D mouth
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      hg.ellipse(0, mouthY, 11, lerp(5, 10, Math.max(talkAmt, 0.6))).fill(0x4a1622);
      hg.ellipse(0, mouthY + 3, 6, 3.2).fill(0xe85a70);
    } else {
      hg.moveTo(-11, mouthY).quadraticCurveTo(0, mouthY + expr.smile * 1.5, 11, mouthY).stroke({ color: 0x3b1d24, width: 3.6, cap: "round" });
    }
  } else if (mode === "kurzgesagt") {
    // Iconic lineless flat-vector geometric head with 50/50 two-tone shading split (NO black outlines!)
    if (def.hairStyle === "long" || def.hairStyle === "wavy" || def.hairStyle === "bob" || def.hairStyle === "long_layered") {
      hg.roundRect(-headR * 1.16, -headR * 0.35, headR * 2.32, headR * 2.2, 30).fill(shadeColor(hairCol, 0.76));
    }
    hg.circle(0, 0, headR).fill(skinCol);
    // Clean geometric vertical half-shadow plane (signature Kurzgesagt vector style)
    hg.arc(0, 0, headR, -Math.PI / 2, Math.PI / 2).fill({ color: shadeColor(skinCol, 0.86), alpha: 0.55 });
    // Lineless geometric hair sweep
    if (def.hairStyle !== "bald") {
      hg.arc(0, -4, headR + 2, Math.PI * 1.04, Math.PI * 1.96).fill(hairCol);
      hg.ellipse(-10, -headR + 8, 22, 12).fill(shadeColor(hairCol, 1.18));
    }
    // Minimalist vector dot/pill eyes
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (isBlinking || expr.mouthStyle === "laugh") {
        hg.moveTo(ex - 7, eyeY).quadraticCurveTo(ex, eyeY + (expr.mouthStyle === "laugh" ? -5 : 4), ex + 7, eyeY).stroke({ color: 0x0b1230, width: 3.6, cap: "round" });
      } else {
        hg.circle(ex, eyeY, 6.2).fill(0x0b1230);
        hg.circle(ex - 2, eyeY - 2, 2.0).fill(0xffffff);
      }
      const by = -16 + clamp(expr.browLift, -3, 2);
      hg.moveTo(ex - side * 7, by + expr.browIn * 0.5).lineTo(ex + side * 8, by + expr.browOut * 0.5).stroke({ color: shadeColor(hairCol, 0.75), width: 3.8, cap: "round" });
    }
    hg.circle(-23, 8, 6).fill({ color: 0xff5c8a, alpha: Math.max(0.2, expr.blush * 0.5) });
    hg.circle(23, 8, 6).fill({ color: 0xff5c8a, alpha: Math.max(0.2, expr.blush * 0.5) });
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      hg.ellipse(0, mouthY, 9.5, lerp(4, 9, Math.max(talkAmt, 0.55))).fill(0x0b1230);
    } else {
      hg.moveTo(-10, mouthY).quadraticCurveTo(0, mouthY + expr.smile * 1.4, 10, mouthY).stroke({ color: 0x0b1230, width: 3.4, cap: "round" });
    }
  } else if (mode === "anime_cel") {
    const ink = 0x161926;
    // Back anime hair with dynamic layered tips
    if (def.hairStyle === "long" || def.hairStyle === "wavy" || def.hairStyle === "bob" || def.hairStyle === "long_layered") {
      hg.moveTo(-headR * 1.15, -18)
        .lineTo(-headR * 1.35, headR * 1.9)
        .lineTo(-headR * 0.85, headR * 1.55)
        .lineTo(0, headR * 2.15)
        .lineTo(headR * 0.85, headR * 1.55)
        .lineTo(headR * 1.35, headR * 1.9)
        .lineTo(headR * 1.15, -18)
        .closePath()
        .fill(shadeColor(hairCol, 0.72))
        .stroke({ color: ink, width: 3.0, join: "round" });
    }
    // Tapered anime chin face contour
    hg.moveTo(-headR * 0.92, -16)
      .bezierCurveTo(-headR * 0.96, 16, -headR * 0.58, 38, 0, headR * 1.06)
      .bezierCurveTo(headR * 0.58, 38, headR * 0.96, 16, headR * 0.92, -16)
      .bezierCurveTo(headR * 0.84, -headR * 1.18, -headR * 0.84, -headR * 1.18, -headR * 0.92, -16)
      .closePath()
      .fill(skinCol)
      .stroke({ color: ink, width: 3.0, join: "round" });
    // Hard-edged anime cel shadow crescent
    hg.moveTo(14, -36)
      .bezierCurveTo(38, -8, 36, 26, 2, headR * 1.0)
      .bezierCurveTo(22, 24, 24, -8, 14, -36)
      .closePath()
      .fill({ color: shadeColor(skinCol, 0.82), alpha: 0.55 });
    // Luminous anime eyes with upper lash arch, colored iris & double catchlights
    const irisCol = def.wardrobe?.eyeColor ? hexToNumber(def.wardrobe.eyeColor) : accentCol;
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (isBlinking || expr.mouthStyle === "laugh") {
        hg.moveTo(ex - 10, eyeY).quadraticCurveTo(ex, eyeY + (expr.mouthStyle === "laugh" ? -6 : 5), ex + 10, eyeY).stroke({ color: ink, width: 3.8, cap: "round" });
      } else {
        hg.ellipse(ex, eyeY, 9.5, 11 * expr.eyeOpen).fill(0xffffff);
        hg.ellipse(ex, eyeY + 1, 6.8, 8.8 * expr.eyeOpen).fill(irisCol);
        hg.ellipse(ex, eyeY - 1, 6.4, 4.4 * expr.eyeOpen).fill(shadeColor(irisCol, 0.52));
        hg.circle(ex, eyeY + 1, 3.0).fill(0x0b0e18);
        hg.circle(ex - 3.2, eyeY - 3.6, 2.8).fill(0xffffff);
        hg.circle(ex + 2.8, eyeY + 3.4, 1.4).fill(0xffffff);
        // Thick stylized anime upper eyelash
        hg.moveTo(ex - 11, eyeY - 3).quadraticCurveTo(ex, eyeY - 14 * expr.eyeOpen, ex + 11, eyeY - 3).stroke({ color: ink, width: isFemale ? 4.4 : 3.4, cap: "round" });
      }
      const by = -18 + clamp(expr.browLift, -3, 2);
      hg.moveTo(ex - side * 9, by + expr.browIn * 0.6).lineTo(ex + side * 10, by + expr.browOut * 0.6).stroke({ color: shadeColor(hairCol, 0.65), width: 2.8, cap: "round" });
    }
    // Dynamic spiky/layered anime bangs + bright horizontal halo sheen
    if (def.hairStyle !== "bald") {
      hg.moveTo(-headR * 1.04, -4)
        .bezierCurveTo(-headR * 1.12, -headR * 1.35, headR * 1.12, -headR * 1.35, headR * 1.04, -4)
        .lineTo(headR * 0.72, -18)
        .lineTo(headR * 0.44, -8)
        .lineTo(headR * 0.16, -24)
        .lineTo(-headR * 0.08, -9)
        .lineTo(-headR * 0.36, -23)
        .lineTo(-headR * 0.66, -10)
        .closePath()
        .fill(hairCol)
        .stroke({ color: ink, width: 2.8, join: "round" });
      // Signature anime hair halo highlight
      hg.moveTo(-24, -30).quadraticCurveTo(-10, -37, -2, -31).stroke({ color: shadeColor(hairCol, 1.55), width: 4.5, alpha: 0.72, cap: "round" });
      hg.moveTo(6, -32).quadraticCurveTo(16, -37, 25, -30).stroke({ color: shadeColor(hairCol, 1.55), width: 4.5, alpha: 0.72, cap: "round" });
    }
    // Tiny anime nose dot & expressive mouth
    hg.circle(1, 9, 1.8).fill(shadeColor(skinCol, 0.76));
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      hg.ellipse(0, mouthY + 4, 8.5, lerp(4, 9.5, Math.max(talkAmt, 0.55))).fill(0x7a2036).stroke({ color: ink, width: 2.2 });
    } else {
      hg.moveTo(-8, mouthY + 4).quadraticCurveTo(0, mouthY + 4 + expr.smile * 1.2, 8, mouthY + 4).stroke({ color: ink, width: 2.4, cap: "round" });
    }
  } else if (mode === "retro_psx") {
    // Low-poly 1998 PlayStation faceted octagonal head with flat-shaded light/shadow faces
    const r = headR;
    const pts = [
      -r * 0.48, -r * 0.96,
      r * 0.48, -r * 0.96,
      r * 0.96, -r * 0.38,
      r * 0.88, r * 0.48,
      r * 0.34, r * 0.98,
      -r * 0.34, r * 0.98,
      -r * 0.88, r * 0.48,
      -r * 0.96, -r * 0.38,
    ];
    hg.poly(pts).fill(skinCol);
    // Faceted right shadow plane
    hg.poly([0, -r * 0.96, r * 0.48, -r * 0.96, r * 0.96, -r * 0.38, r * 0.88, r * 0.48, r * 0.34, r * 0.98, 0, r * 0.98]).fill({ color: shadeColor(skinCol, 0.78), alpha: 0.65 });
    // Angular low-poly hair prism
    if (def.hairStyle !== "bald") {
      hg.poly([-r * 1.02, -10, -r * 0.85, -r * 1.06, 0, -r * 1.18, r * 0.85, -r * 1.06, r * 1.02, -10, r * 0.4, -24, -r * 0.4, -24]).fill(hairCol);
      hg.poly([0, -r * 1.18, r * 0.85, -r * 1.06, r * 1.02, -10, r * 0.4, -24, 0, -24]).fill(shadeColor(hairCol, 0.7));
    }
    // Crisp low-res PSX eyes & mouth
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      hg.rect(ex - 6, eyeY - 5, 12, isBlinking ? 3 : 10).fill(0x090b16);
      if (!isBlinking) hg.rect(ex - 4, eyeY - 3, 4, 4).fill(0xffffff);
    }
    hg.rect(-9, mouthY, 18, talkAmt > 0.25 ? 10 : 4).fill(0x28101c);
  } else if (mode === "paper_cutout") {
    // Craft paper cutout head: drop shadow -> crisp white sticker border -> craft paper face
    if (def.hairStyle === "long" || def.hairStyle === "wavy" || def.hairStyle === "bob" || def.hairStyle === "long_layered") {
      hg.roundRect(-headR * 1.2 + 7, -headR * 0.4 + 7, headR * 2.4, headR * 2.2, 24).fill({ color: 0x000000, alpha: 0.22 });
      hg.roundRect(-headR * 1.24, -headR * 0.44, headR * 2.48, headR * 2.28, 26).fill(0xfbf7ef);
      hg.roundRect(-headR * 1.14, -headR * 0.36, headR * 2.28, headR * 2.12, 22).fill(shadeColor(hairCol, 0.82));
    }
    hg.circle(7, 7, headR + 4).fill({ color: 0x000000, alpha: 0.22 });
    hg.circle(0, 0, headR + 5).fill(0xfbf7ef);
    hg.circle(0, 0, headR).fill(skinCol);
    // Subtle paper-cut cheek circles
    hg.circle(-21, 9, 7).fill({ color: 0xe05a47, alpha: 0.24 });
    hg.circle(21, 9, 7).fill({ color: 0xe05a47, alpha: 0.24 });
    // Layered cutout hair piece with its own drop shadow
    if (def.hairStyle !== "bald") {
      hg.arc(3, -3, headR + 1, Math.PI * 1.02, Math.PI * 1.98).fill({ color: 0x000000, alpha: 0.16 });
      hg.arc(0, -6, headR + 2, Math.PI * 1.02, Math.PI * 1.98).fill(hairCol);
    }
    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (isBlinking) {
        hg.moveTo(ex - 7, eyeY).lineTo(ex + 7, eyeY).stroke({ color: 0x201b16, width: 3.4, cap: "round" });
      } else {
        hg.circle(ex, eyeY, 6.5).fill(0xffffff);
        hg.circle(ex + 1, eyeY, 3.6).fill(0x201b16);
      }
      const by = -16 + clamp(expr.browLift, -3, 2);
      hg.moveTo(ex - side * 8, by + expr.browIn * 0.6).lineTo(ex + side * 8, by + expr.browOut * 0.6).stroke({ color: 0x201b16, width: 3.6, cap: "round" });
    }
    if (talkAmt > 0.25 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      hg.ellipse(0, mouthY, 10, lerp(4, 9.5, Math.max(talkAmt, 0.55))).fill(0x201b16);
    } else {
      hg.moveTo(-10, mouthY).quadraticCurveTo(0, mouthY + expr.smile * 1.5, 10, mouthY).stroke({ color: 0x201b16, width: 3.4, cap: "round" });
    }
  }

  // Optional facial hair & hats across all stylized modes (except pixel which has its own hat/beard overlay)
  if (!isPixel && !isSil) {
    const faceOutline = mode === "kurzgesagt" ? shadeColor(hairCol, 0.72) : 0x161926;
    if (def.accessories.facialHair !== "none") {
      drawFacialHair({
        g: hg,
        style: def.accessories.facialHair,
        hair: hairCol,
        hairDark: shadeColor(hairCol, 0.72),
        outline: faceOutline,
        fs: headR / 41,
        pendulum,
      });
    }
    if (def.accessories.hat !== "none") {
      drawHeadwear({
        g: hg,
        hat: def.accessories.hat,
        hatCol: hexToNumber(def.wardrobe?.hatColor ?? def.palette.accent, accentCol),
        accent: accentCol,
        outline: faceOutline,
        fs: headR / 41,
        feather: Boolean(def.wardrobe?.feather),
        pendulum,
      });
    }
  } else if (isPixel && !isSil && def.accessories.hat !== "none") {
    // Chunky pixel hat cap on top of 16-bit head
    const hatCol = hexToNumber(def.wardrobe?.hatColor ?? def.palette.accent, accentCol);
    const hw = px * 5;
    const topHatY = -px * 4.5 - px * 2;
    hg.rect(-hw - px, topHatY - px, hw * 2 + px * 3, px * 2.5).fill(0x0b0e1c);
    hg.rect(-hw, topHatY - px * 0.5, hw * 2, px * 1.5).fill(hatCol);
    hg.rect(-hw, topHatY + px * 0.5, hw * 2 + px * 2, px * 0.8).fill(shadeColor(hatCol, 0.75));
  }

  // Front arm (rendered cleanly in front of torso)
  drawArm(shOffX, uShY + 14, fa1, fa2, false);
}
