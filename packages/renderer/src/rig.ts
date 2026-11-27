import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type {
  AnimationStyleId,
  CharacterDefinition,
  CharacterExpression,
  CharacterPose,
  CharacterWardrobe,
  GlassesStyle,
  HatStyle,
  Layer,
  RigPartOverride,
} from "@storia/schema";
import { evaluateEasing, getAnimationStylePreset, resolveRolePreset } from "@storia/schema";
import { clamp, hexToNumber, lerp, shadeColor } from "./color.js";
import {
  drawBackHair,
  drawFacialHair,
  drawFrontHair,
  drawHeadwear,
} from "./rigHairAndAccessories.js";
import {
  clampRigidHeadRadians,
  computeVolumeSquash,
  evaluateArmTrack,
  evaluateContinuousInkArm,
  evaluateReactionNodsDeg,
  lerpAngle,
  solveBoundedArmIK,
  solveGroundedLegIK,
  solvePendulumSway,
  solvePlantedAnkleLegIK,
} from "./rigKinematics.js";
import { drawOutfitOverlay, drawShirtPattern, drawSkirtOverlay } from "./rigWardrobe.js";
import { renderStyledStickmanCharacter } from "./stickmanRig.js";
import { isStylizedCharacterMode, renderStylizedCharacter } from "./stylizedRig.js";

export interface ResolvedPartTexture {
  texture: Texture;
  override?: RigPartOverride;
}

export interface ModularRigTextures {
  head?: ResolvedPartTexture;
  torso?: ResolvedPartTexture;
  leftHand?: ResolvedPartTexture;
  rightHand?: ResolvedPartTexture;
  leftFoot?: ResolvedPartTexture;
  rightFoot?: ResolvedPartTexture;
  hat?: ResolvedPartTexture;
  prop?: ResolvedPartTexture;
  contactProp?: Texture;
}

type CharacterLayer = Extract<Layer, { type: "character" }>;

type HandGesture = "relaxed" | "open" | "point" | "fist";

interface PoseAngles {
  activePose?: CharacterPose;
  ba1: number;
  ba2: number;
  fa1: number;
  fa2: number;
  bothFront?: boolean;
  torsoTilt?: number;
  sit?: number;
  kneel?: number;
  run?: number;
  walk?: number;
  dance?: number;
  bow?: number;
  handL?: HandGesture;
  handR?: HandGesture;
}

const POSE_ANGLES: Record<CharacterPose, PoseAngles> = {
  idle:          { ba1: -0.14, ba2: 0.14,  fa1: 0.14,  fa2: -0.14 },
  present:       { ba1: -0.14, ba2: 0.14,  fa1: 1.05,  fa2: 0.42,  handR: "open" },
  present_both:  { ba1: -1.05, ba2: -0.42, fa1: 1.05,  fa2: 0.42,  handL: "open", handR: "open" },
  point:         { ba1: -0.14, ba2: 0.14,  fa1: 1.48,  fa2: 0.08,  handR: "point" },
  point_up:      { ba1: -0.16, ba2: 0.16,  fa1: 2.38,  fa2: 0.22,  handR: "point" },
  shrug:         { ba1: -0.78, ba2: -1.45, fa1: 0.78,  fa2: 1.45,  handL: "open", handR: "open" },
  think:         { ba1: 0.18,  ba2: 1.42,  fa1: 0.62,  fa2: -2.84, bothFront: true, handR: "open" },
  wave:          { ba1: -0.14, ba2: 0.14,  fa1: 2.08,  fa2: 0.62,  handR: "open" },
  wave_both:     { ba1: -2.08, ba2: -0.62, fa1: 2.08,  fa2: 0.62,  handL: "open", handR: "open" },
  celebrate:     { ba1: -2.52, ba2: -0.22, fa1: 2.52,  fa2: 0.22,  handL: "fist", handR: "fist" },
  victory:       { ba1: -0.20, ba2: 0.18,  fa1: 2.58,  fa2: 0.18,  handR: "open" },
  lean:          { ba1: -0.24, ba2: 0.36,  fa1: 0.78,  fa2: -0.38, torsoTilt: 0.08 },
  sad:           { ba1: -0.06, ba2: 0.08,  fa1: 0.06,  fa2: -0.08, torsoTilt: 0.06 },
  shock:         { ba1: -0.92, ba2: -1.78, fa1: 0.92,  fa2: 1.78,  handL: "open", handR: "open" },
  reach:         { ba1: 0.35,  ba2: 0.25,  fa1: 1.48,  fa2: 0.12,  handR: "open" },
  hug:           { ba1: 0.62,  ba2: 0.85,  fa1: 0.95,  fa2: 0.72,  bothFront: true, torsoTilt: 0.06, handL: "open", handR: "open" },
  comfort:       { ba1: -0.14, ba2: 0.14,  fa1: 1.18,  fa2: 0.42,  handR: "open" },
  despair:       { ba1: -1.62, ba2: -1.92, fa1: 1.62,  fa2: 1.92,  torsoTilt: 0.1 },
  protect:       { ba1: -0.62, ba2: 0.92,  fa1: 1.52,  fa2: -0.35, bothFront: true, handR: "open" },
  cower:         { ba1: -0.78, ba2: -1.82, fa1: 0.78,  fa2: 1.82,  torsoTilt: 0.12, handL: "open", handR: "open" },
  run:           { ba1: -0.82, ba2: 1.25,  fa1: 0.95,  fa2: -1.15, torsoTilt: 0.14, run: 1, handL: "fist", handR: "fist" },
  walk:          { ba1: -0.16, ba2: 0.18,  fa1: 0.16,  fa2: -0.18, walk: 0.72 },
  sit:           { ba1: -0.22, ba2: 0.85,  fa1: 0.24,  fa2: -0.82, sit: 1 },
  kneel:         { ba1: -0.18, ba2: 0.52,  fa1: 0.58,  fa2: -0.72, kneel: 1, torsoTilt: 0.1 },
  look_up:       { ba1: -0.18, ba2: 0.22,  fa1: 0.36,  fa2: -0.26 },
  hold_hands:    { ba1: -0.48, ba2: 0.18,  fa1: 0.56,  fa2: -0.16, handL: "open", handR: "open" },
  arms_crossed:  { ba1: -0.22, ba2: 1.72,  fa1: 0.22,  fa2: -1.72, bothFront: true },
  hands_on_hips: { ba1: -0.64, ba2: 1.30,  fa1: 0.64,  fa2: -1.30, handL: "fist", handR: "fist" },
  salute:        { ba1: -0.12, ba2: 0.12,  fa1: 1.65,  fa2: 1.82,  handR: "open" },
  bow:           { ba1: -0.10, ba2: 0.12,  fa1: 0.10,  fa2: -0.12, torsoTilt: 0.26, bow: 1 },
  dance:         { ba1: -1.45, ba2: -0.82, fa1: 1.45,  fa2: 0.82,  dance: 1, handL: "open", handR: "open" },
  typing:        { ba1: -0.35, ba2: 1.32,  fa1: 0.35,  fa2: -1.32, bothFront: true, sit: 0.85 },
  phone_call:    { ba1: -0.14, ba2: 0.14,  fa1: 0.88,  fa2: 2.38,  handR: "fist" },
  fighting:      { ba1: 0.72,  ba2: 1.45,  fa1: 1.05,  fa2: 1.38,  bothFront: true, torsoTilt: 0.1, handL: "fist", handR: "fist" },
  custom:        { ba1: -0.14, ba2: 0.14,  fa1: 0.14,  fa2: -0.14 },
};

interface ExprParams {
  browIn: number;
  browOut: number;
  browLift: number;
  browArch: number;
  eyeOpen: number;
  lidTop: number;
  lidBot: number;
  furrow: number;
  pupilScale: number;
  smile: number;
  mouthW: number;
  mouthStyle: "line" | "open_smile" | "laugh" | "gasp" | "smirk" | "frown";
  gasp?: boolean;
  blush: number;
  tears: number;
  tilt: number;
}

const EXPR_MAP: Record<CharacterExpression, ExprParams> = {
  neutral:    { browIn: 0,    browOut: 0,    browLift: 0,    browArch: -2.2, eyeOpen: 1.0,  lidTop: 0.04, lidBot: 0.0,  furrow: 0,    pupilScale: 1.0,  smile: 1.8,  mouthW: 1.0,  mouthStyle: "line",       blush: 0.12, tears: 0, tilt: 0 },
  calm:       { browIn: -0.5, browOut: 0,    browLift: -1.0, browArch: -2.5, eyeOpen: 0.94, lidTop: 0.14, lidBot: 0.06, furrow: 0,    pupilScale: 1.0,  smile: 3.4,  mouthW: 1.02, mouthStyle: "line",       blush: 0.16, tears: 0, tilt: 0.02 },
  happy:      { browIn: -1.2, browOut: -0.8, browLift: -2.8, browArch: -3.2, eyeOpen: 1.02, lidTop: 0.0,  lidBot: 0.28, furrow: 0,    pupilScale: 1.06, smile: 6.5,  mouthW: 1.12, mouthStyle: "open_smile", blush: 0.34, tears: 0, tilt: 0.03 },
  laugh:      { browIn: -1.8, browOut: -1.2, browLift: -3.8, browArch: -3.6, eyeOpen: 0.35, lidTop: 0.0,  lidBot: 0.45, furrow: 0,    pupilScale: 1.05, smile: 8.5,  mouthW: 1.24, mouthStyle: "laugh",      blush: 0.42, tears: 0, tilt: 0.05 },
  proud:      { browIn: -0.4, browOut: -1.4, browLift: -1.8, browArch: -2.6, eyeOpen: 0.92, lidTop: 0.18, lidBot: 0.16, furrow: 0,    pupilScale: 1.0,  smile: 5.2,  mouthW: 1.06, mouthStyle: "smirk",      blush: 0.2,  tears: 0, tilt: -0.04 },
  relieved:   { browIn: -2.4, browOut: 0.8,  browLift: -1.2, browArch: -2.0, eyeOpen: 0.72, lidTop: 0.32, lidBot: 0.22, furrow: 0,    pupilScale: 0.96, smile: 4.5,  mouthW: 1.0,  mouthStyle: "line",       blush: 0.22, tears: 0, tilt: 0.04 },
  love:       { browIn: -1.6, browOut: -0.6, browLift: -2.2, browArch: -3.4, eyeOpen: 0.96, lidTop: 0.1,  lidBot: 0.26, furrow: 0,    pupilScale: 1.14, smile: 6.4,  mouthW: 1.08, mouthStyle: "open_smile", blush: 0.56, tears: 0, tilt: 0.06 },
  awe:        { browIn: -2.6, browOut: -1.8, browLift: -5.2, browArch: -4.0, eyeOpen: 1.18, lidTop: 0.0,  lidBot: 0.0,  furrow: 0,    pupilScale: 1.12, smile: 1.5,  mouthW: 0.92, mouthStyle: "gasp",       blush: 0.16, tears: 0, tilt: -0.03 },
  worried:    { browIn: -4.6, browOut: 2.2,  browLift: -1.5, browArch: -1.2, eyeOpen: 1.06, lidTop: 0.08, lidBot: 0.1,  furrow: 0.22, pupilScale: 0.94, smile: -4.4, mouthW: 0.94, mouthStyle: "frown",      blush: 0.04, tears: 0, tilt: -0.05 },
  fear:       { browIn: -5.4, browOut: 2.6,  browLift: -3.8, browArch: -1.0, eyeOpen: 1.24, lidTop: 0.0,  lidBot: 0.0,  furrow: 0.3,  pupilScale: 0.78, smile: -5.2, mouthW: 0.98, mouthStyle: "gasp",       blush: 0,    tears: 0, tilt: -0.06 },
  angry:      { browIn: 5.4,  browOut: -2.2, browLift: 1.8,  browArch: -0.4, eyeOpen: 0.92, lidTop: 0.34, lidBot: 0.14, furrow: 0.88, pupilScale: 0.92, smile: -5.2, mouthW: 1.06, mouthStyle: "frown",      blush: 0.18, tears: 0, tilt: 0.04 },
  sly:        { browIn: 1.6,  browOut: -1.8, browLift: -0.8, browArch: -2.8, eyeOpen: 0.84, lidTop: 0.28, lidBot: 0.16, furrow: 0.1,  pupilScale: 0.98, smile: 4.8,  mouthW: 1.04, mouthStyle: "smirk",      blush: 0.12, tears: 0, tilt: 0.06 },
  smug:       { browIn: 0.8,  browOut: -2.6, browLift: -1.6, browArch: -3.0, eyeOpen: 0.82, lidTop: 0.32, lidBot: 0.14, furrow: 0,    pupilScale: 0.98, smile: 5.4,  mouthW: 1.08, mouthStyle: "smirk",      blush: 0.14, tears: 0, tilt: -0.05 },
  suspicious: { browIn: 2.8,  browOut: -1.0, browLift: 0.4,  browArch: -1.0, eyeOpen: 0.78, lidTop: 0.38, lidBot: 0.22, furrow: 0.32, pupilScale: 0.94, smile: -1.5, mouthW: 0.9,  mouthStyle: "line",       blush: 0.04, tears: 0, tilt: 0.04 },
  think:      { browIn: 0.8,  browOut: -1.8, browLift: -1.8, browArch: -2.4, eyeOpen: 0.94, lidTop: 0.16, lidBot: 0.08, furrow: 0.14, pupilScale: 0.98, smile: -0.8, mouthW: 0.86, mouthStyle: "line",       blush: 0.06, tears: 0, tilt: -0.05 },
  sad:        { browIn: -4.8, browOut: 2.6,  browLift: -1.0, browArch: -1.0, eyeOpen: 0.88, lidTop: 0.24, lidBot: 0.08, furrow: 0.18, pupilScale: 0.96, smile: -5.6, mouthW: 0.92, mouthStyle: "frown",      blush: 0.06, tears: 0, tilt: -0.06 },
  cry:        { browIn: -5.8, browOut: 3.0,  browLift: -1.6, browArch: -0.8, eyeOpen: 0.84, lidTop: 0.28, lidBot: 0.24, furrow: 0.26, pupilScale: 0.98, smile: -6.4, mouthW: 0.98, mouthStyle: "frown",      blush: 0.28, tears: 1, tilt: -0.07 },
  guilt:      { browIn: -4.4, browOut: 2.0,  browLift: -0.8, browArch: -1.2, eyeOpen: 0.84, lidTop: 0.3,  lidBot: 0.06, furrow: 0.16, pupilScale: 0.95, smile: -3.8, mouthW: 0.88, mouthStyle: "frown",      blush: 0.16, tears: 0, tilt: -0.08 },
  exhausted:  { browIn: -2.0, browOut: 2.2,  browLift: 0.8,  browArch: -0.8, eyeOpen: 0.68, lidTop: 0.46, lidBot: 0.2,  furrow: 0.1,  pupilScale: 0.92, smile: -3.2, mouthW: 0.9,  mouthStyle: "frown",      blush: 0.04, tears: 0, tilt: -0.07 },
  shock:      { browIn: -2.8, browOut: -2.2, browLift: -6.0, browArch: -4.0, eyeOpen: 1.24, lidTop: 0.0,  lidBot: 0.0,  furrow: 0,    pupilScale: 0.8,  smile: -1.2, mouthW: 0.96, mouthStyle: "gasp",       blush: 0.04, tears: 0, tilt: -0.04 },
  determined: { browIn: 3.2,  browOut: -1.4, browLift: 0.4,  browArch: -1.2, eyeOpen: 0.94, lidTop: 0.22, lidBot: 0.12, furrow: 0.42, pupilScale: 0.98, smile: 1.8,  mouthW: 1.0,  mouthStyle: "line",       blush: 0.1,  tears: 0, tilt: 0.03 },
  confused:   { browIn: -2.4, browOut: -0.8, browLift: -2.0, browArch: -2.6, eyeOpen: 1.04, lidTop: 0.06, lidBot: 0.04, furrow: 0.14, pupilScale: 0.98, smile: -2.0, mouthW: 0.9,  mouthStyle: "line",       blush: 0.06, tears: 0, tilt: 0.07 },
};

export function resolveCharacterPoseAt(layer: CharacterLayer, localTime: number): PoseAngles {
  let activePose: CharacterPose = layer.pose;
  let active = POSE_ANGLES[layer.pose] ?? POSE_ANGLES.idle;
  const cues = [...layer.poseCues].sort((a, b) => a.t - b.t);
  for (const cue of cues) {
    if (localTime >= cue.t) {
      const target = POSE_ANGLES[cue.pose] ?? POSE_ANGLES.idle;
      const dt = localTime - cue.t;
      if (cue.blendDuration > 0.01 && dt < cue.blendDuration) {
        const k = evaluateEasing(dt / cue.blendDuration, "spring");
        const kClamped = clamp(k, 0, 1);
        activePose = kClamped > 0.5 ? cue.pose : activePose;
        active = {
          ba1: lerpAngle(active.ba1, target.ba1, k),
          ba2: lerpAngle(active.ba2, target.ba2, k),
          fa1: lerpAngle(active.fa1, target.fa1, k),
          fa2: lerpAngle(active.fa2, target.fa2, k),
          bothFront: kClamped > 0.5 ? target.bothFront : active.bothFront,
          torsoTilt: lerp(active.torsoTilt ?? 0, target.torsoTilt ?? 0, k),
          sit: clamp(lerp(active.sit ?? 0, target.sit ?? 0, kClamped), 0, 1),
          kneel: clamp(lerp(active.kneel ?? 0, target.kneel ?? 0, kClamped), 0, 1),
          run: clamp(lerp(active.run ?? 0, target.run ?? 0, kClamped), 0, 1),
          walk: clamp(lerp(active.walk ?? 0, target.walk ?? 0, kClamped), 0, 1),
          dance: clamp(lerp(active.dance ?? 0, target.dance ?? 0, kClamped), 0, 1),
          bow: clamp(lerp(active.bow ?? 0, target.bow ?? 0, kClamped), 0, 1),
          handL: kClamped > 0.5 ? target.handL : active.handL,
          handR: kClamped > 0.5 ? target.handR : active.handR,
        };
        break;
      }
      active = target;
      activePose = cue.pose;
    }
  }
  const ov = layer.boneOverrides;
  return {
    ...active,
    activePose,
    ba1: ov.leftUpperArm ?? active.ba1,
    ba2: ov.leftForearm ?? active.ba2,
    fa1: ov.rightUpperArm ?? active.fa1,
    fa2: ov.rightForearm ?? active.fa2,
    torsoTilt: ov.torso ?? active.torsoTilt,
  };
}

export function resolveActiveExpressionName(layer: CharacterLayer, localTime: number): CharacterExpression {
  let active: CharacterExpression = layer.expression;
  const cues = [...layer.expressionCues].sort((a, b) => a.t - b.t);
  for (const cue of cues) {
    if (localTime >= cue.t) {
      const dt = localTime - cue.t;
      if (cue.blendDuration > 0.01 && dt < cue.blendDuration) {
        if (dt / cue.blendDuration >= 0.5) active = cue.expression;
        break;
      }
      active = cue.expression;
    }
  }
  return active;
}

export function resolveCharacterExpressionAt(layer: CharacterLayer, localTime: number): ExprParams {
  let active = EXPR_MAP[layer.expression] ?? EXPR_MAP.neutral;
  const cues = [...layer.expressionCues].sort((a, b) => a.t - b.t);
  for (const cue of cues) {
    if (localTime >= cue.t) {
      const target = EXPR_MAP[cue.expression] ?? EXPR_MAP.neutral;
      const dt = localTime - cue.t;
      if (cue.blendDuration > 0.01 && dt < cue.blendDuration) {
        const k = evaluateEasing(dt / cue.blendDuration, "easeInOut");
        active = {
          browIn: lerp(active.browIn, target.browIn, k),
          browOut: lerp(active.browOut, target.browOut, k),
          browLift: lerp(active.browLift, target.browLift, k),
          browArch: lerp(active.browArch, target.browArch, k),
          eyeOpen: lerp(active.eyeOpen, target.eyeOpen, k),
          lidTop: lerp(active.lidTop, target.lidTop, k),
          lidBot: lerp(active.lidBot, target.lidBot, k),
          furrow: lerp(active.furrow, target.furrow, k),
          pupilScale: lerp(active.pupilScale, target.pupilScale, k),
          smile: lerp(active.smile, target.smile, k),
          mouthW: lerp(active.mouthW, target.mouthW, k),
          mouthStyle: k > 0.5 ? target.mouthStyle : active.mouthStyle,
          blush: lerp(active.blush, target.blush, k),
          tears: lerp(active.tears, target.tears, k),
          tilt: lerp(active.tilt, target.tilt, k),
        };
        break;
      }
      active = target;
    }
  }
  return { ...active, gasp: active.mouthStyle === "gasp" };
}

/**
 * Seamless 2-segment tapered limb (zero dark joint circles!) matching Storia's Cairo quality:
 * draws the complete outer contour first, fills upper+lower with rounded elbow/knee blending,
 * adds directional cel-shading and a delicate anatomical fold crease at the bend.
 */
function drawSeamlessLimb(
  g: Graphics,
  x0: number,
  y0: number,
  jx: number,
  jy: number,
  ex: number,
  ey: number,
  r0: number,
  rMid: number,
  r1: number,
  col: number,
  shadowCol: number,
  outline: number,
  lineW = 2.8,
  drawShoulderCap = true,
): void {
  const segPts = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.max(0.001, Math.hypot(dx, dy));
    // Pick the normal pointing consistently toward right-bottom (+0.85, +0.52) to match head & torso light
    let nx = -dy / len;
    let ny = dx / len;
    if (nx * 0.85 + ny * 0.52 < 0) {
      nx = -nx;
      ny = -ny;
    }
    return {
      aS: [ax + nx * ra, ay + ny * ra] as [number, number],
      bS: [bx + nx * rb, by + ny * rb] as [number, number],
      bL: [bx - nx * rb, by - ny * rb] as [number, number],
      aL: [ax - nx * ra, ay - ny * ra] as [number, number],
      mA: [ax + nx * (ra * 0.34), ay + ny * (ra * 0.34)] as [number, number],
      mB: [bx + nx * (rb * 0.34), by + ny * (rb * 0.34)] as [number, number],
      tx: dx / len,
      ty: dy / len,
      nx,
      ny,
    };
  };

  const s1 = segPts(x0, y0, jx, jy, r0, rMid);
  const s2 = segPts(jx, jy, ex, ey, rMid, r1);

  // 1. Unified silhouette outline underlay (thick outer stroke, zero internal joint seam!)
  const pad = lineW;
  const o1 = segPts(x0, y0, jx, jy, r0 + pad, rMid + pad);
  const o2 = segPts(jx, jy, ex, ey, rMid + pad, r1 + pad);
  if (drawShoulderCap) g.circle(x0, y0, r0 + pad).fill(outline);
  g.poly([...o1.aS, ...o1.bS, ...o1.bL, ...o1.aL]).fill(outline);
  g.circle(jx, jy, rMid + pad).fill(outline);
  g.poly([...o2.aS, ...o2.bS, ...o2.bL, ...o2.aL]).fill(outline);
  g.circle(ex, ey, r1 + pad).fill(outline);

  // 2. Clean interior fill (merges upper + joint + lower seamlessly)
  if (drawShoulderCap) g.circle(x0, y0, r0).fill(col);
  g.poly([...s1.aS, ...s1.bS, ...s1.bL, ...s1.aL]).fill(col);
  g.circle(jx, jy, rMid).fill(col);
  g.poly([...s2.aS, ...s2.bS, ...s2.bL, ...s2.aL]).fill(col);
  g.circle(ex, ey, r1).fill(col);

  // 3. Soft directional cel-shading strip consistently on right/bottom side (matches head & torso!)
  g.poly([...s1.mA, ...s1.mB, ...s1.bS, ...s1.aS]).fill({ color: shadowCol, alpha: 0.42 });
  g.poly([...s2.mA, ...s2.mB, ...s2.bS, ...s2.aS]).fill({ color: shadowCol, alpha: 0.42 });

  // 4. Subtle oriented garment fold ONLY when elbow/knee is genuinely bent (> 16°)
  const dot = clamp(s1.tx * s2.tx + s1.ty * s2.ty, -1, 1);
  const bendRad = Math.acos(dot);
  if (bendRad > 0.28) {
    // Bisector pointing toward the inner crook of the bend
    const bx = s2.tx - s1.tx;
    const by = s2.ty - s1.ty;
    const bLen = Math.max(0.001, Math.hypot(bx, by));
    const ix = bx / bLen;
    const iy = by / bLen;
    const px = -iy;
    const py = ix;
    const cx = jx + ix * (rMid * 0.48);
    const cy = jy + iy * (rMid * 0.48);
    g.moveTo(cx - px * (rMid * 0.38), cy - py * (rMid * 0.38))
      .lineTo(cx + px * (rMid * 0.38), cy + py * (rMid * 0.38))
      .stroke({ color: shadowCol, width: 1.8, alpha: 0.52, cap: "round" });
  }
}

function drawDetailedHand(
  g: Graphics,
  ex: number,
  ey: number,
  dirX: number,
  dirY: number,
  rWrist: number,
  skinCol: number,
  skinShadow: number,
  outline: number,
  gesture: HandGesture,
): void {
  // Clean, unified editorial mitten silhouette (no individual stick fingers or crossing outlines)
  const perpX = -dirY;
  const perpY = dirX;
  const pad = 2.5;
  const palmR = Math.max(9.8, rWrist * 1.06);

  const p0x = ex + dirX * (palmR * 0.32);
  const p0y = ey + dirY * (palmR * 0.32);

  const reachMult =
    gesture === "point" ? 1.24 : gesture === "open" ? 0.98 : gesture === "fist" ? 0.56 : 0.82;
  const p1x = ex + dirX * (palmR * reachMult);
  const p1y = ey + dirY * (palmR * reachMult);

  const r0 = palmR * (gesture === "fist" ? 0.92 : 0.88);
  const r1 = palmR * (gesture === "point" ? 0.52 : gesture === "open" ? 0.88 : gesture === "fist" ? 0.86 : 0.78);

  const hasThumb = gesture !== "fist";
  const thumbX = p0x + dirX * (palmR * 0.24) + perpX * (palmR * 0.66);
  const thumbY = p0y + dirY * (palmR * 0.24) + perpY * (palmR * 0.66);
  const rThumb = palmR * 0.35;

  const quad = (ra: number, rb: number) => [
    p0x + perpX * ra, p0y + perpY * ra,
    p1x + perpX * rb, p1y + perpY * rb,
    p1x - perpX * rb, p1y - perpY * rb,
    p0x - perpX * ra, p0y - perpY * ra,
  ];

  // Pass 1: Unified outer silhouette outline (zero internal seams)
  g.circle(p0x, p0y, r0 + pad).fill(outline);
  g.poly(quad(r0 + pad, r1 + pad)).fill(outline);
  g.circle(p1x, p1y, r1 + pad).fill(outline);
  if (hasThumb) {
    g.circle(thumbX, thumbY, rThumb + pad).fill(outline);
  }

  // Pass 2: Clean solid interior fill merging palm, tip & thumb into one organic mitten
  g.circle(p0x, p0y, r0).fill(skinCol);
  g.poly(quad(r0, r1)).fill(skinCol);
  g.circle(p1x, p1y, r1).fill(skinCol);
  if (hasThumb) {
    g.circle(thumbX, thumbY, rThumb).fill(skinCol);
  }

  // Pass 3: Subtle directional cel-shading along right/bottom edge (matches head & limbs)
  const shadeSide = perpX * 0.85 + perpY * 0.52 >= 0 ? 1 : -1;
  const sx = perpX * shadeSide;
  const sy = perpY * shadeSide;
  g.poly([
    p0x + sx * (r0 * 0.28), p0y + sy * (r0 * 0.28),
    p1x + sx * (r1 * 0.28), p1y + sy * (r1 * 0.28),
    p1x + sx * (r1 * 0.92), p1y + sy * (r1 * 0.92),
    p0x + sx * (r0 * 0.92), p0y + sy * (r0 * 0.92),
  ]).fill({ color: skinShadow, alpha: 0.34 });
}

function drawContinuousInkArm(
  g: Graphics,
  sx: number,
  sy: number,
  jx: number,
  jy: number,
  ex: number,
  ey: number,
  ua: number,
  fa: number,
  w: number,
  sag: number,
  sleeveCol: number,
  skinCol: number,
  outline: number,
  isSilhouette: boolean,
  hasCuff: boolean,
  reflectiveStripes: boolean,
  gesture: HandGesture,
): { ex: number; ey: number; dirX: number; dirY: number; rWrist: number } {
  const geom = evaluateContinuousInkArm({
    rootX: sx,
    rootY: sy,
    elbowX: jx,
    elbowY: jy,
    wristX: ex,
    wristY: ey,
    reach: ua + fa,
    sag,
    samples: 22,
  });

  const pts = geom.points;
  const rShoulder = w * 0.52;
  const rWrist = w * 0.35;
  const sleeveShadow = shadeColor(sleeveCol, 0.78);
  const skinShadow = shadeColor(skinCol, 0.84);
  const pad = 2.7;

  // Build continuous tapered ribbon polygon along quadratic Bezier path
  const leftOuter: number[] = [];
  const rightOuter: number[] = [];
  const leftInner: number[] = [];
  const rightInner: number[] = [];
  const shadeInner: number[] = [];

  for (let i = 0; i < pts.length; i++) {
    const t = i / Math.max(1, pts.length - 1);
    const p = pts[i]!;
    const pPrev = pts[Math.max(0, i - 1)]!;
    const pNext = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = pNext.x - pPrev.x;
    const ty = pNext.y - pPrev.y;
    const len = Math.max(1e-4, Math.hypot(tx, ty));
    const nx = -ty / len;
    const ny = tx / len;
    // Slight calligraphic pressure modulation along stroke (b6_puppet.py continuous brush)
    const pressure = 1 + 0.06 * Math.sin(t * Math.PI * 2);
    const r = lerp(rShoulder, rWrist, t) * pressure;

    leftOuter.push(p.x + nx * (r + pad), p.y + ny * (r + pad));
    rightOuter.unshift(p.x - nx * (r + pad), p.y - ny * (r + pad));
    leftInner.push(p.x + nx * r, p.y + ny * r);
    rightInner.unshift(p.x - nx * r, p.y - ny * r);
    shadeInner.unshift(p.x + nx * (r * 0.25), p.y + ny * (r * 0.25));
  }

  // Unified outline + fill + soft directional cel-shading strip
  g.circle(sx, sy, rShoulder + pad).fill(outline);
  g.poly([...leftOuter, ...rightOuter]).fill(outline);
  g.circle(ex, ey, rWrist + pad).fill(outline);

  g.circle(sx, sy, rShoulder).fill(sleeveCol);
  g.poly([...leftInner, ...rightInner]).fill(sleeveCol);
  g.circle(ex, ey, rWrist).fill(sleeveCol);

  if (!isSilhouette) {
    g.poly([...leftInner, ...shadeInner]).fill({ color: sleeveShadow, alpha: 0.56 });
  }

  const lastP = pts[pts.length - 1]!;
  const prevP = pts[Math.max(0, pts.length - 2)]!;
  const dLen = Math.max(1e-4, Math.hypot(lastP.x - prevP.x, lastP.y - prevP.y));
  const dirX = (lastP.x - prevP.x) / dLen;
  const dirY = (lastP.y - prevP.y) / dLen;

  if (reflectiveStripes && !isSilhouette) {
    g.moveTo(ex - dirX * 14, ey - dirY * 14)
      .lineTo(ex - dirX * 6, ey - dirY * 6)
      .stroke({ color: 0xe6f238, width: rWrist * 2.15, cap: "butt" });
  } else if (hasCuff && !isSilhouette) {
    g.moveTo(ex - dirX * 7, ey - dirY * 7)
      .lineTo(ex - dirX * 2, ey - dirY * 2)
      .stroke({ color: 0xf4f5f8, width: rWrist * 2.05, cap: "butt" });
  }

  drawDetailedHand(g, ex, ey, dirX, dirY, rWrist, skinCol, skinShadow, outline, gesture);
  return { ex, ey, dirX, dirY, rWrist };
}

function drawDetailedArm(
  g: Graphics,
  sx: number,
  sy: number,
  a1: number,
  a2: number,
  ua: number,
  fa: number,
  w: number,
  sleeveCol: number,
  skinCol: number,
  outline: number,
  isSilhouette: boolean,
  hasCuff: boolean,
  reflectiveStripes: boolean,
  gesture: HandGesture = "relaxed",
  continuousMode = false,
  inkSag = 12,
  skipProceduralHand = false,
): { ex: number; ey: number; dirX: number; dirY: number; rWrist: number } {
  const jx = sx + Math.sin(a1) * ua;
  const jy = sy + Math.cos(a1) * ua;
  const ex = jx + Math.sin(a1 + a2) * fa;
  const ey = jy + Math.cos(a1 + a2) * fa;

  if (continuousMode && !skipProceduralHand) {
    return drawContinuousInkArm(
      g,
      sx,
      sy,
      jx,
      jy,
      ex,
      ey,
      ua,
      fa,
      w,
      inkSag,
      sleeveCol,
      skinCol,
      outline,
      isSilhouette,
      hasCuff,
      reflectiveStripes,
      gesture,
    );
  }

  const rShoulder = w * 0.51;
  const rElbow = w * 0.46;
  const rWrist = w * 0.41;
  const sleeveShadow = shadeColor(sleeveCol, 0.8);
  const skinShadow = shadeColor(skinCol, 0.84);

  drawSeamlessLimb(g, sx, sy, jx, jy, ex, ey, rShoulder, rElbow, rWrist, sleeveCol, sleeveShadow, outline, 2.7, true);

  const dirX = Math.sin(a1 + a2);
  const dirY = Math.cos(a1 + a2);

  if (reflectiveStripes && !isSilhouette) {
    g.moveTo(ex - dirX * 14, ey - dirY * 14)
      .lineTo(ex - dirX * 6, ey - dirY * 6)
      .stroke({ color: 0xe6f238, width: rWrist * 2.15, cap: "butt" });
  } else if (hasCuff && !isSilhouette) {
    g.moveTo(ex - dirX * 8, ey - dirY * 8)
      .lineTo(ex - dirX * 2, ey - dirY * 2)
      .stroke({ color: 0xf4f5f8, width: rWrist * 2.05, cap: "butt" });
  } else if (!isSilhouette) {
    // Clean wrist seam / spacesuit cuff ring set slightly back from the mitten hand
    const perpX = -dirY;
    const perpY = dirX;
    const cx = ex - dirX * 9;
    const cy = ey - dirY * 9;
    g.moveTo(cx - perpX * (rWrist * 0.94), cy - perpY * (rWrist * 0.94))
      .lineTo(cx + perpX * (rWrist * 0.94), cy + perpY * (rWrist * 0.94))
      .stroke({ color: outline, width: 2.0, alpha: 0.55, cap: "round" });
  }

  if (!skipProceduralHand) {
    drawDetailedHand(g, ex, ey, dirX, dirY, rWrist, skinCol, skinShadow, outline, gesture);
  }
  return { ex, ey, dirX, dirY, rWrist };
}

function mountModularPartSprite(
  parent: Container,
  part: ResolvedPartTexture,
  x: number,
  y: number,
  targetHeight: number,
  rotation = 0,
  defaultAnchorX = 0.5,
  defaultAnchorY = 0.5,
): Sprite {
  const sp = new Sprite(part.texture);
  const ov = part.override;
  sp.anchor.set(ov?.pivotX ?? defaultAnchorX, ov?.pivotY ?? defaultAnchorY);
  const baseScale = targetHeight / Math.max(1, part.texture.height);
  const s = baseScale * (ov?.scale ?? 1);
  sp.scale.set(s);
  sp.position.set(x + (ov?.offsetX ?? 0), y + (ov?.offsetY ?? 0));
  sp.rotation = rotation;
  parent.addChild(sp);
  return sp;
}

function drawDetailedShoe(
  g: Graphics,
  x: number,
  y: number,
  rot: number,
  shoeCol: number,
  shoeStyle: string,
  outline: number,
  isSilhouette: boolean,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pt = (lx: number, ly: number): [number, number] => [x + lx * cos - ly * sin, y + lx * sin + ly * cos];

  const isBoot = shoeStyle === "boots";
  const ankleTop = isBoot ? -18 : -6;
  const heel = pt(-15, 4);
  const toeTop = pt(21, -3);
  const toeTip = pt(27, 7);
  const soleFront = pt(24, 14);
  const soleBack = pt(-15, 14);
  const ankleBack = pt(-13, ankleTop);
  const ankleFront = pt(8, ankleTop);

  g.poly([
    ankleBack[0], ankleBack[1],
    ankleFront[0], ankleFront[1],
    toeTop[0], toeTop[1],
    toeTip[0], toeTip[1],
    soleFront[0], soleFront[1],
    soleBack[0], soleBack[1],
    heel[0], heel[1],
  ])
    .fill(shoeCol)
    .stroke({ color: outline, width: 2.9, join: "round" });

  if (!isSilhouette) {
    const sA = pt(-14, 11.5);
    const sB = pt(24, 11.5);
    g.moveTo(sA[0], sA[1]).lineTo(sB[0], sB[1]).stroke({
      color: shoeStyle === "sneakers" ? 0xf2f4f7 : shadeColor(shoeCol, 0.7),
      width: shoeStyle === "sneakers" ? 4.2 : 3.8,
      cap: "round",
    });
    const hA = pt(7, -1);
    const hB = pt(17, 2);
    g.moveTo(hA[0], hA[1]).lineTo(hB[0], hB[1]).stroke({
      color: shadeColor(shoeCol, 1.35),
      width: 2.2,
      alpha: 0.45,
      cap: "round",
    });
    if (shoeStyle === "heels") {
      const hTop = pt(-12, 12);
      const hBot = pt(-13, 21);
      g.moveTo(hTop[0], hTop[1]).lineTo(hBot[0], hBot[1]).stroke({ color: outline, width: 4.5, cap: "round" });
    }
  }
}

function drawDetailedLeg(
  g: Graphics,
  lx: number,
  hipY: number,
  legh: number,
  wid: number,
  thighAng: number,
  kneeAng: number,
  footAng: number,
  pantsCol: number,
  skinCol: number,
  shoeCol: number,
  shoeStyle: string,
  outline: number,
  isBareLowerLeg: boolean,
  isSilhouette: boolean,
  skipProceduralShoe = false,
): { fx: number; fy: number } {
  const standSpan = Math.max(40, legh - 14);
  const upperLen = standSpan * 0.515;
  const lowerLen = standSpan * 0.485;
  const kx = lx + Math.sin(thighAng) * upperLen;
  const ky = hipY + Math.cos(thighAng) * upperLen;
  const fx = kx + Math.sin(thighAng + kneeAng) * lowerLen;
  const fy = ky + Math.cos(thighAng + kneeAng) * lowerLen;

  const rHip = 19.2 * wid;
  const rKnee = 15.6 * wid;
  const rAnkle = 12.4 * wid;
  const col = isBareLowerLeg ? skinCol : pantsCol;

  drawSeamlessLimb(g, lx, hipY, kx, ky, fx, fy, rHip, rKnee, rAnkle, col, shadeColor(col, 0.8), outline, 2.9, true);

  // Tall boot shaft or clean trouser hem cuff matching Storia's `character_wardrobe.py`
  const shinDirX = Math.sin(thighAng + kneeAng);
  const shinDirY = Math.cos(thighAng + kneeAng);
  const perpX = -shinDirY;
  const perpY = shinDirX;
  if (!isSilhouette) {
    if (shoeStyle === "boots") {
      const bootLen = lowerLen * 0.44;
      const bTopX = fx - shinDirX * bootLen;
      const bTopY = fy - shinDirY * bootLen;
      const rBootTop = rAnkle + 2.4;
      const rBootBot = rAnkle + 1.2;
      g.poly([
        bTopX - perpX * rBootTop, bTopY - perpY * rBootTop,
        bTopX + perpX * rBootTop, bTopY + perpY * rBootTop,
        fx + perpX * rBootBot, fy + perpY * rBootBot,
        fx - perpX * rBootBot, fy - perpY * rBootBot,
      ])
        .fill(shoeCol)
        .stroke({ color: outline, width: 2.6, join: "round" });
      // Boot collar band
      g.moveTo(bTopX - perpX * (rBootTop + 1), bTopY - perpY * (rBootTop + 1))
        .lineTo(bTopX + perpX * (rBootTop + 1), bTopY + perpY * (rBootTop + 1))
        .stroke({ color: shadeColor(shoeCol, 0.72), width: 4.5, cap: "round" });
    } else if (!isBareLowerLeg) {
      const cTopX = fx - shinDirX * 10;
      const cTopY = fy - shinDirY * 10;
      g.moveTo(cTopX - perpX * (rAnkle + 1.5), cTopY - perpY * (rAnkle + 1.5))
        .lineTo(cTopX + perpX * (rAnkle + 1.5), cTopY + perpY * (rAnkle + 1.5))
        .stroke({ color: outline, width: 2.2, alpha: 0.75, cap: "round" });
    }
  }

  if (!skipProceduralShoe) {
    drawDetailedShoe(g, fx, fy, footAng, shoeCol, shoeStyle, outline, isSilhouette);
  }
  return { fx, fy };
}

/**
 * Draws an articulated, editorial graphic-novel 2D character rig into a PixiJS Container,
 * anchored at feet (0, 0), matching Storia's `engine.py` + `character_wardrobe.py` quality
 * and `stickman-video-director` (`b6_puppet.py` / `b6_actions.py`) bounded IK, rigid neck
 * attachment, planted ankles, continuous ink-path arms, and hybrid `modular_sprites` compositing.
 */
export function renderProceduralCharacter(
  container: Container,
  def: CharacterDefinition,
  layer: CharacterLayer,
  localTime: number,
  globalTime: number,
  walkSpeed: number,
  faceLeft: boolean,
  animationStyle: AnimationStyleId = "storia_editorial",
  modularTextures?: ModularRigTextures,
): void {
  const hasModularSprites =
    def.kind === "modular_sprites" ||
    Boolean(modularTextures?.head || modularTextures?.torso || modularTextures?.leftHand || modularTextures?.rightHand);

  const effectiveRenderStyle =
    def.renderStyle && def.renderStyle !== "auto"
      ? def.renderStyle
      : getAnimationStylePreset(animationStyle).characterRenderStyle;

  if (effectiveRenderStyle !== "editorial" && !hasModularSprites) {
    const pose = resolveCharacterPoseAt(layer, localTime);
    const expr = resolveCharacterExpressionAt(layer, localTime);
    if (isStylizedCharacterMode(effectiveRenderStyle)) {
      renderStylizedCharacter(
        container,
        effectiveRenderStyle,
        def,
        layer,
        pose,
        expr,
        localTime,
        globalTime,
        walkSpeed,
        faceLeft,
      );
    } else {
      renderStyledStickmanCharacter(
        container,
        effectiveRenderStyle,
        def,
        layer,
        pose,
        expr,
        localTime,
        globalTime,
        walkSpeed,
        faceLeft,
      );
    }
    return;
  }

  container.removeChildren();
  const root = new Container();

  const ageScale =
    def.age === "toddler" ? 0.58 :
    def.age === "boy" || def.age === "girl" ? 0.74 :
    def.age === "teen" ? 0.89 :
    def.age === "elder" ? 0.95 : 1.0;

  const headScale =
    def.age === "toddler" ? 1.2 :
    def.age === "boy" || def.age === "girl" ? 1.1 :
    def.age === "teen" ? 1.02 : 1.0;

  root.scale.set(faceLeft ? -ageScale : ageScale, ageScale);
  container.addChild(root);

  // Merge automatic role preset defaults with explicit character overrides
  const rolePreset = resolveRolePreset(def.role);
  const wSpec: Partial<CharacterWardrobe> = {
    ...(rolePreset?.wardrobe ?? {}),
    ...(def.wardrobe ?? {}),
  };

  const g = new Graphics();
  root.addChild(g);

  const pose = resolveCharacterPoseAt(layer, localTime);
  const expr = resolveCharacterExpressionAt(layer, localTime);
  const ph = (def.id.charCodeAt(0) + def.id.length * 7) * 0.73;

  const isSilhouette = layer.silhouette;
  const silCol = hexToNumber(layer.tint ?? "#0f1526", 0x0f1526);
  const outline = isSilhouette ? silCol : 0x18151d;

  const skin = isSilhouette ? silCol : hexToNumber(def.palette.skin, 0xe3b996);
  const skinShade = shadeColor(skin, 0.85);
  const skinLight = shadeColor(skin, 1.12);
  const hair = isSilhouette ? silCol : hexToNumber(def.palette.hair, 0x1e1a1c);
  const hairDark = shadeColor(hair, 0.72);
  const hairLight = shadeColor(hair, 1.38);

  // Use role preset colors as smart fallback if character still uses default casual colors for a specialized role
  const useRolePalette = Boolean(rolePreset && rolePreset.id !== "casual" && rolePreset.id !== "formal");
  const isDefaultShirt = def.palette.shirt.toLowerCase() === "#eceef2" || def.palette.shirt.toLowerCase() === "#edf0f4";

  const shirt = isSilhouette
    ? silCol
    : hexToNumber(useRolePalette && isDefaultShirt ? rolePreset!.palette.shirt : def.palette.shirt, 0xedf0f4);
  const jacketRaw = def.palette.jacket ?? (useRolePalette ? rolePreset?.palette.jacket : undefined);
  const jacket = isSilhouette ? silCol : jacketRaw ? hexToNumber(jacketRaw) : undefined;
  const pants = isSilhouette
    ? silCol
    : hexToNumber(useRolePalette && def.palette.pants === "#232833" ? rolePreset!.palette.pants : def.palette.pants, 0x232833);
  const shoes = isSilhouette
    ? silCol
    : hexToNumber(useRolePalette && def.palette.shoes === "#141418" ? rolePreset!.palette.shoes : def.palette.shoes, 0x141418);
  const accent = isSilhouette
    ? silCol
    : hexToNumber(useRolePalette && def.palette.accent === "#f7c8d6" ? rolePreset!.palette.accent : def.palette.accent, 0xf7c8d6);

  const effectiveHat: HatStyle =
    def.accessories.hat !== "none" ? def.accessories.hat : rolePreset?.hat ?? "none";
  const effectiveGlasses: GlassesStyle =
    def.accessories.glasses !== "none" ? def.accessories.glasses : rolePreset?.glasses ?? "none";

  const isFemale = def.genderPresentation === "feminine";
  const isChild = def.age === "toddler" || def.age === "boy" || def.age === "girl";
  const bodyShape = wSpec.bodyShape ?? "average";
  const wid =
    bodyShape === "slim" ? 0.88 :
    bodyShape === "athletic" ? 1.07 :
    bodyShape === "stocky" ? 1.18 :
    bodyShape === "curvy" ? 1.1 : 1.0;

  const hasDress = Boolean(wSpec.dress);
  const outfitStyle = wSpec.outfitStyle ?? "classic";
  const pantsStyle = wSpec.pantsStyle ?? (wSpec.skirt ? "pleated_skirt" : "trousers");
  const hasSkirt = (Boolean(wSpec.skirt) || pantsStyle === "pleated_skirt" || pantsStyle === "pencil_skirt") && !hasDress;
  const secondaryStrength = wSpec.secondaryMotion ?? 1.0;
  const vestCol = !isSilhouette && wSpec.vestColor ? hexToNumber(wSpec.vestColor) : undefined;
  const tieCol = !isSilhouette && wSpec.tieColor
    ? hexToNumber(wSpec.tieColor)
    : !isSilhouette && def.role === "formal" && !isFemale
      ? accent
      : undefined;
  const scarfCol = !isSilhouette && wSpec.scarfColor ? hexToNumber(wSpec.scarfColor) : undefined;
  const sashCol = !isSilhouette && wSpec.sashColor ? hexToNumber(wSpec.sashColor) : undefined;
  const capeCol = !isSilhouette && wSpec.capeColor ? hexToNumber(wSpec.capeColor) : undefined;
  const apronCol = !isSilhouette && wSpec.apronColor ? hexToNumber(wSpec.apronColor) : undefined;
  const hatCol = !isSilhouette && wSpec.hatColor ? hexToNumber(wSpec.hatColor) : accent;
  const eyeIrisCol = !isSilhouette && wSpec.eyeColor ? hexToNumber(wSpec.eyeColor) : 0x261f2e;
  const shoeStyle = wSpec.shoeStyle ?? (def.role === "formal" ? "oxford" : isFemale ? "flats" : "classic");

  // Organic breathing, dance, walk, run & sit locomotion
  const runW = pose.run ?? 0;
  const sitW = pose.sit ?? 0;
  const kneelW = pose.kneel ?? 0;
  const danceW = pose.dance ?? 0;
  const walkW = clamp(walkSpeed + (pose.walk ?? 0) + runW * 0.92, 0, 1);

  const walkCycle = globalTime * (runW > 0.2 ? 12.2 : 7.6) + ph;
  const walkBounce = Math.abs(Math.sin(walkCycle)) * (runW > 0.2 ? 12 : 6) * walkW;
  const danceBounce = Math.abs(Math.sin(globalTime * 6.2 + ph)) * 8 * danceW;
  const idleBob = Math.sin(globalTime * 2.1 + ph) * 1.6;
  const breathe = Math.sin(globalTime * 2.1 + ph) * 0.011;

  const legh = isChild ? 185 : 224;
  const hipY = -legh + 56 * sitW + 76 * kneelW - walkBounce * 0.45 - danceBounce * 0.5;

  // Ground contact shadow + subtle rim glow
  g.ellipse(0, 8, 66 * wid, 13).fill({ color: 0x05070e, alpha: isSilhouette ? 0.14 : 0.32 });
  if (!isSilhouette) {
    g.circle(0, hipY - 120, 130).fill({ color: 0xffd478, alpha: 0.04 });
  }

  // Animated pose offsets (driven by resolved `activePose`, so poseCues animate cleanly too!)
  const activePose = pose.activePose ?? layer.pose;
  const rigProf = def.rigProfile;
  const continuousArmMode = rigProf?.armRenderMode === "continuous_ink";
  const inkSag = rigProf?.inkSag ?? 12;
  const leftArmConstraints = rigProf?.leftArm;
  const rightArmConstraints = rigProf?.rightArm;

  let ba1 = pose.ba1;
  let ba2 = pose.ba2;
  let fa1 = pose.fa1;
  let fa2 = pose.fa2;
  let handL: HandGesture = pose.handL ?? "relaxed";
  let handR: HandGesture = pose.handR ?? "relaxed";

  // Independent per-arm action tracks (b6_actions.py: rest -> reach -> offer/receive -> hold -> retract)
  const leftTrackSample = layer.armTracks?.left
    ? evaluateArmTrack("left", layer.armTracks.left, localTime)
    : null;
  const rightTrackSample = layer.armTracks?.right
    ? evaluateArmTrack("right", layer.armTracks.right, localTime)
    : null;

  if (leftTrackSample) {
    ba1 = leftTrackSample.a1;
    ba2 = leftTrackSample.a2;
    handL = leftTrackSample.hand;
  }
  if (rightTrackSample) {
    fa1 = rightTrackSample.a1;
    fa2 = rightTrackSample.a2;
    handR = rightTrackSample.hand;
  }

  if (!rightTrackSample && (activePose === "wave" || activePose === "wave_both")) {
    const waveOsc = Math.sin(globalTime * 7.5 + ph);
    fa2 += waveOsc * 0.28;
    fa1 += Math.sin(globalTime * 7.5 + ph - 0.5) * 0.06;
    if (activePose === "wave_both" && !leftTrackSample) {
      ba2 -= waveOsc * 0.28;
    }
  }
  if ((activePose === "celebrate" || activePose === "victory") && !leftTrackSample && !rightTrackSample) {
    const pulse = Math.sin(globalTime * 6.4 + ph) * 0.1;
    ba1 += pulse;
    fa1 -= pulse;
  }
  if (danceW > 0.05) {
    const dOsc = Math.sin(globalTime * 6.2 + ph);
    if (!leftTrackSample) {
      ba1 += dOsc * 0.45 * danceW;
      ba2 += Math.cos(globalTime * 6.2 + ph) * 0.35 * danceW;
    }
    if (!rightTrackSample) {
      fa1 += dOsc * 0.45 * danceW;
      fa2 -= Math.cos(globalTime * 6.2 + ph) * 0.35 * danceW;
    }
  }
  if (activePose === "typing") {
    if (!leftTrackSample) ba2 += Math.sin(globalTime * 18 + ph) * 0.08;
    if (!rightTrackSample) fa2 += Math.cos(globalTime * 19 + ph) * 0.08;
  }
  if (walkW > 0.02 && sitW < 0.2) {
    const sw = Math.sin(walkCycle) * (runW > 0.2 ? 0.65 : 0.42) * walkW;
    if (!leftTrackSample) ba1 += sw;
    if (!rightTrackSample) fa1 -= sw;
  }

  const sleeveCol =
    outfitStyle === "leather_jacket"
      ? 0x242733
      : outfitStyle === "denim_jacket"
        ? (jacket ?? 0x3b6594)
        : (jacket ?? shirt);
  const hasCuff =
    (Boolean(jacket) || outfitStyle === "suit" || outfitStyle === "trench_coat" || outfitStyle === "denim_jacket") &&
    !hasDress &&
    !wSpec.armorPlate &&
    !wSpec.spaceSuit;
  const tw = (isFemale ? 44 : 52) * wid;
  const torsoH = isChild ? 132 : 156;
  const armX = (isFemale ? 38 : 44) * wid;
  const uaLen = isChild ? 64 : 76;
  const faLen = isChild ? 58 : 70;
  const armW = isFemale ? 23.5 : 27;
  // Astronauts & armored characters wear matching gloves instead of bare flesh hands
  const handCol = isSilhouette
    ? silCol
    : wSpec.spaceSuit
      ? shadeColor(shirt, 0.9)
      : wSpec.armorPlate
        ? 0x9aa5b8
        : skin;

  // --------------------------------------------------------------------------
  // 1. GROUNDED & PLANTED-ANKLE 2-BONE IK LEGS (b6_puppet ankleTargets + Rigby2D IK)
  // --------------------------------------------------------------------------
  const legDx = isFemale ? 18 : 21;
  const ov = layer.boneOverrides;

  // Pelvis hip bridge so thighs join seamlessly under the belt/hem with zero gap
  if (!hasDress && !hasSkirt) {
    g.roundRect(-legDx - 17 * wid, hipY - 12, (legDx + 17 * wid) * 2, 24, 10)
      .fill(pants)
      .stroke({ color: outline, width: 2.6 });
  }
  for (let i = 0; i < 2; i++) {
    const lx = i === 0 ? -legDx : legDx;
    const explicitAnkle = i === 0 ? layer.ankleTargets?.left : layer.ankleTargets?.right;
    const solvedLeg = explicitAnkle
      ? solvePlantedAnkleLegIK({
          hipX: lx,
          hipY,
          ankleTargetX: explicitAnkle.x,
          ankleTargetY: explicitAnkle.y,
          legLen: legh,
          bendDir: -1,
        })
      : solveGroundedLegIK({
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

    const depthShade = i === 0 ? 0.88 : 1.0;
    const bareLegs = hasDress || hasSkirt || pantsStyle === "shorts";
    const footPart = i === 0 ? modularTextures?.leftFoot : modularTextures?.rightFoot;

    const { fx, fy } = drawDetailedLeg(
      g,
      lx,
      hipY,
      legh,
      wid,
      solvedLeg.thighAng,
      solvedLeg.kneeAng,
      solvedLeg.footAng,
      shadeColor(pants, depthShade),
      shadeColor(skin, depthShade),
      shadeColor(shoes, depthShade),
      shoeStyle,
      outline,
      bareLegs,
      isSilhouette,
      Boolean(footPart),
    );
    if (footPart) {
      mountModularPartSprite(root, footPart, fx, fy + 6, 36, solvedLeg.footAng, 0.45, 0.65);
    }
  }

  // Upper body group (torso tilt + StretchyStudio volume-preserving squash & stretch)
  const upperGroup = new Container();
  upperGroup.position.set(0, hipY);
  const torsoTilt =
    (pose.torsoTilt ?? 0) +
    (danceW > 0.05 ? Math.sin(globalTime * 6.2 + ph) * 0.06 * danceW : 0);
  upperGroup.rotation = torsoTilt;
  const squash = computeVolumeSquash({
    walkCycle,
    walkWeight: walkW,
    runWeight: runW,
    danceWeight: danceW,
    breathe,
    shockOrCelebrate: activePose === "shock" || activePose === "celebrate" || activePose === "victory" ? 1 : 0,
  });
  upperGroup.scale.set(squash.scaleX, squash.scaleY);
  root.addChild(upperGroup);

  const uShoulderY = -torsoH + idleBob * 0.4;
  const uWaistY = -torsoH * 0.36;
  const neckSpec = rigProf?.neckAttachment ?? {
    anchorOffsetY: -10,
    maxAngleDeg: 20,
    maxDegPerFrame: 7,
    rigidScale: true,
  };
  const neckPivotY = uShoulderY + neckSpec.anchorOffsetY;
  const headCenterOffsetY = -42 * headScale;
  const headY = neckPivotY + headCenterOffsetY;
  const hr = 41 * headScale;
  const fs = hr / 41;

  // LookAt gaze vector & subtle head turn when `layer.lookAtPoint` is specified
  let gazeX = 0.8;
  let gazeY = 0.4;
  let lookHeadBias = 0;
  if (layer.lookAtPoint) {
    const rawDx = layer.lookAtPoint.x - layer.transform.x;
    const rawDy = layer.lookAtPoint.y - (layer.transform.y - 0.28);
    const localDx = faceLeft ? -rawDx : rawDx;
    gazeX = clamp(localDx * 7.5, -2.6, 2.8);
    gazeY = clamp(rawDy * 5.5, -2.0, 2.2);
    lookHeadBias = clamp(rawDy * 0.16, -0.14, 0.14);
  }

  // Rigid head angle bounded to ±maxAngleDeg (default ±20°, b6_puppet.py + b6_actions.py reaction_nod)
  const nodRad = (evaluateReactionNodsDeg(layer.reactionNods, localTime, neckSpec.maxAngleDeg) * Math.PI) / 180;
  const explicitHeadRad = layer.headAngleDeg !== undefined ? (layer.headAngleDeg * Math.PI) / 180 : 0;
  const rawHeadRot =
    (ov.head ?? 0) +
    explicitHeadRad +
    nodRad +
    Math.sin(globalTime * 0.9 + ph) * 0.018 +
    expr.tilt +
    lookHeadBias;
  const headRot = clampRigidHeadRadians(rawHeadRot, neckSpec.maxAngleDeg);

  // Deterministic Verlet-inspired pendulum physics for hair, cape, scarf & beard
  const pendulum = solvePendulumSway({
    timeSec: globalTime,
    phaseOffset: ph,
    walkCycle,
    walkWeight: walkW,
    runWeight: runW,
    danceWeight: danceW,
    headTilt: headRot,
    torsoTilt,
    stiffness: 1.0,
    strength: secondaryStrength,
  });

  // Cuff/sleeve shoulder socket coordinates (respecting cuffOutletOffset from rigProfile)
  const leftSocketX = -armX + (leftArmConstraints?.cuffOutletOffset?.x ?? 0);
  const leftSocketY = uShoulderY + 20 + (leftArmConstraints?.cuffOutletOffset?.y ?? 0);
  const rightSocketX = armX + (rightArmConstraints?.cuffOutletOffset?.x ?? 0);
  const rightSocketY = uShoulderY + 20 + (rightArmConstraints?.cuffOutletOffset?.y ?? 0);

  // Bounded 2-bone IK refinement for explicit wristTargets (authored poses stay clean without forced chest-crossing!)
  if (layer.wristTargets?.right) {
    const ik = solveBoundedArmIK({
      shoulderX: rightSocketX,
      shoulderY: rightSocketY,
      targetX: layer.wristTargets.right.x,
      targetY: layer.wristTargets.right.y,
      l1: uaLen,
      l2: faLen,
      constraints: { pole: -1, ...(rightArmConstraints ?? {}) },
      softness: 4,
    });
    fa1 = ik.a1;
    fa2 = ik.a2;
  }

  if (layer.wristTargets?.left) {
    const ik = solveBoundedArmIK({
      shoulderX: leftSocketX,
      shoulderY: leftSocketY,
      targetX: layer.wristTargets.left.x,
      targetY: layer.wristTargets.left.y,
      l1: uaLen,
      l2: faLen,
      constraints: { pole: 1, ...(leftArmConstraints ?? {}) },
      softness: 4,
    });
    ba1 = ik.a1;
    ba2 = ik.a2;
  }

  // --------------------------------------------------------------------------
  // 0. BACK CAPE (Inside upperGroup so it moves & tilts cleanly with shoulders!)
  // --------------------------------------------------------------------------
  if (capeCol !== undefined && !isSilhouette) {
    const capeG = new Graphics();
    upperGroup.addChild(capeG);
    const cSway = pendulum.swayX * 1.35;
    capeG
      .moveTo(-tw * 0.9, uShoulderY + 6)
      .lineTo(tw * 0.9, uShoulderY + 6)
      .bezierCurveTo(tw * 1.45, 0, tw * 1.6 + cSway, 115, tw * 1.35 + cSway, 150)
      .quadraticCurveTo(cSway * 0.5, 165, -tw * 1.35 + cSway, 150)
      .bezierCurveTo(-tw * 1.6 + cSway, 115, -tw * 1.45, 0, -tw * 0.9, uShoulderY + 6)
      .closePath()
      .fill(shadeColor(capeCol, 0.85))
      .stroke({ color: outline, width: 3.0, join: "round" });
  }

  // --------------------------------------------------------------------------
  // 2. BACK ARM
  // --------------------------------------------------------------------------
  const backArmG = new Graphics();
  upperGroup.addChild(backArmG);
  let leftWristPos = {
    ex: leftSocketX + Math.sin(ba1) * uaLen + Math.sin(ba1 + ba2) * faLen,
    ey: leftSocketY + Math.cos(ba1) * uaLen + Math.cos(ba1 + ba2) * faLen,
    dirX: Math.sin(ba1 + ba2),
    dirY: Math.cos(ba1 + ba2),
    rWrist: armW * 0.35,
  };
  const leftArmInFront =
    Boolean(pose.bothFront) ||
    Boolean(layer.frontLimbParts?.includes("left_arm") || layer.frontLimbParts?.includes("left_forearm"));

  if (!leftArmInFront) {
    leftWristPos = drawDetailedArm(
      backArmG,
      leftSocketX,
      leftSocketY,
      ba1,
      ba2,
      uaLen,
      faLen,
      armW,
      shadeColor(sleeveCol, 0.88),
      shadeColor(handCol, 0.9),
      outline,
      isSilhouette,
      hasCuff,
      Boolean(wSpec.reflectiveStripes),
      handL,
      continuousArmMode,
      inkSag,
      Boolean(modularTextures?.leftHand),
    );
    if (modularTextures?.leftHand) {
      mountModularPartSprite(
        upperGroup,
        modularTextures.leftHand,
        leftWristPos.ex,
        leftWristPos.ey,
        28,
        Math.atan2(leftWristPos.dirY, leftWristPos.dirX),
      );
    }
  }

  // --------------------------------------------------------------------------
  // 3. BACK HAIR LAYER (Pivoted on rigid neck_attachment behind torso!)
  // --------------------------------------------------------------------------
  const backHairPivot = new Container();
  backHairPivot.position.set(0, neckPivotY);
  backHairPivot.rotation = headRot;
  if (neckSpec.rigidScale) {
    backHairPivot.scale.set(1 / squash.scaleX, 1 / squash.scaleY);
  }
  upperGroup.addChild(backHairPivot);
  if (!modularTextures?.head) {
    const backHairContainer = new Container();
    backHairContainer.position.set(0, headCenterOffsetY);
    backHairPivot.addChild(backHairContainer);
    const bhg = new Graphics();
    backHairContainer.addChild(bhg);
    drawBackHair({
      g: bhg,
      hairStyle: def.hairStyle,
      hair,
      hairDark,
      hairLight,
      accent,
      outline,
      fs,
      isFemale,
      isSilhouette,
      hairBow: Boolean(wSpec.hairBow),
      effectiveHat,
      pendulum,
    });
  }

  const ug = new Graphics();
  upperGroup.addChild(ug);

  // --------------------------------------------------------------------------
  // 4. TORSO (Illustrated modular SVG/PNG sprite OR Storia wardrobe engine)
  // --------------------------------------------------------------------------
  const hipHalfW = isFemale ? tw * 1.06 : tw * 0.94;
  const waistHalfW = isFemale ? tw * 0.76 : tw * 0.9;
  const shHalfW = tw * (1 + breathe);

  if (modularTextures?.torso) {
    mountModularPartSprite(
      upperGroup,
      modularTextures.torso,
      0,
      uShoulderY + torsoH * 0.52,
      torsoH + 26,
      0,
      0.5,
      0.5,
    );
  } else if (hasDress) {
    const skirtFlare = wSpec.dressStyle === "pinafore" ? tw * 1.48 : tw * 1.56;
    const hemY = isChild ? 62 : 95;
    const dressShade = shadeColor(shirt, 0.82);

    ug.moveTo(-shHalfW * 0.88, uShoulderY + 6)
      .quadraticCurveTo(0, uShoulderY - 5, shHalfW * 0.88, uShoulderY + 6)
      .bezierCurveTo(shHalfW * 0.95, uShoulderY + 46, waistHalfW, uWaistY - 12, waistHalfW, uWaistY)
      .bezierCurveTo(waistHalfW * 1.18, -10, skirtFlare, hemY - 28, skirtFlare, hemY)
      .quadraticCurveTo(0, hemY + 14, -skirtFlare, hemY)
      .bezierCurveTo(-skirtFlare, hemY - 28, -waistHalfW * 1.18, -10, -waistHalfW, uWaistY)
      .bezierCurveTo(-waistHalfW, uWaistY - 12, -shHalfW * 0.95, uShoulderY + 46, -shHalfW * 0.88, uShoulderY + 6)
      .closePath()
      .fill(shirt)
      .stroke({ color: outline, width: 3.1, join: "round" });

    if (!isSilhouette) {
      ug.moveTo(waistHalfW * 0.32, uShoulderY + 8)
        .lineTo(shHalfW * 0.85, uShoulderY + 8)
        .lineTo(waistHalfW, uWaistY)
        .lineTo(skirtFlare, hemY)
        .lineTo(skirtFlare * 0.35, hemY + 6)
        .closePath()
        .fill({ color: dressShade, alpha: 0.48 });
      ug.roundRect(-waistHalfW - 1, uWaistY - 5, waistHalfW * 2 + 2, 11, 5)
        .fill(shadeColor(shirt, 0.72))
        .stroke({ color: outline, width: 2.0 });
    }
  } else {
    const shirtShade = shadeColor(shirt, 0.83);
    const torsoBotY = wSpec.tunic || wSpec.longcoat || wSpec.labCoat || wSpec.judgeRobe ? 46 : 14;

    // Tailored Storia torso silhouette (curved deltoid shoulders + slight natural waist taper)
    ug.moveTo(-shHalfW * 0.96, uShoulderY + 12)
      .bezierCurveTo(-shHalfW * 0.55, uShoulderY - 8, shHalfW * 0.55, uShoulderY - 8, shHalfW * 0.96, uShoulderY + 12)
      .bezierCurveTo(shHalfW * 1.04, uWaistY - 24, waistHalfW * 0.98, uWaistY + 4, hipHalfW * 0.92, torsoBotY)
      .quadraticCurveTo(0, torsoBotY + 9, -hipHalfW * 0.92, torsoBotY)
      .bezierCurveTo(-waistHalfW * 0.98, uWaistY + 4, -shHalfW * 1.04, uWaistY - 24, -shHalfW * 0.96, uShoulderY + 12)
      .closePath()
      .fill(shirt)
      .stroke({ color: outline, width: 3.1, join: "round" });

    if (!isSilhouette) {
      // Cel-shading on right side of torso
      ug.moveTo(shHalfW * 0.28, uShoulderY + 4)
        .lineTo(shHalfW, uShoulderY + 8)
        .lineTo(hipHalfW, torsoBotY)
        .lineTo(hipHalfW * 0.25, torsoBotY + 4)
        .closePath()
        .fill({ color: shirtShade, alpha: 0.42 });

      // Fabric pattern & outfit style overlays (12 rich outfits + 7 fabric patterns)
      const outfitParams = {
        g: ug,
        outfitStyle,
        pantsStyle,
        shirtPattern: wSpec.shirtPattern ?? "solid",
        shHalfW,
        waistHalfW,
        hipHalfW,
        uShoulderY,
        uWaistY,
        torsoBotY,
        shirt,
        jacket,
        pants,
        accent,
        outline,
        isFemale,
        isSilhouette,
      };
      drawShirtPattern(outfitParams);
      drawOutfitOverlay(outfitParams);
      if (hasSkirt) {
        drawSkirtOverlay({
          g: ug,
          pantsStyle: pantsStyle === "pencil_skirt" ? "pencil_skirt" : "pleated_skirt",
          waistHalfW,
          hipHalfW,
          uWaistY,
          pants,
          outline,
          isSilhouette,
        });
      }

      // Indigenous woven trim
      if (wSpec.tunic) {
        ug.rect(-hipHalfW + 3, torsoBotY - 14, hipHalfW * 2 - 6, 9).fill(accent);
        for (let px = -hipHalfW + 10; px < hipHalfW - 10; px += 12) {
          ug.poly([px, torsoBotY - 14, px + 5, torsoBotY - 9, px, torsoBotY - 5, px - 5, torsoBotY - 9]).fill(0x224e59);
        }
      }

      // Overalls or Suspenders (Worker / Laborer)
      if (wSpec.overalls || wSpec.suspenders) {
        const strCol = wSpec.overalls ? pants : 0x6e4a32;
        for (const side of [-1, 1]) {
          ug.roundRect(side * (shHalfW * 0.46) - 6, uShoulderY + 6, 12, torsoH * 0.92, 3)
            .fill(strCol)
            .stroke({ color: outline, width: 2.0 });
        }
        if (wSpec.overalls) {
          ug.roundRect(-waistHalfW * 0.85, uShoulderY + 54, waistHalfW * 1.7, torsoH * 0.56, 6)
            .fill(pants)
            .stroke({ color: outline, width: 2.4 });
        }
      }

      // Vest layer
      if (vestCol !== undefined) {
        ug.moveTo(-shHalfW * 0.72, uShoulderY + 8)
          .lineTo(-12, uShoulderY + 56)
          .lineTo(0, uShoulderY + 70)
          .lineTo(12, uShoulderY + 56)
          .lineTo(shHalfW * 0.72, uShoulderY + 8)
          .lineTo(hipHalfW * 0.85, 12)
          .lineTo(0, 19)
          .lineTo(-hipHalfW * 0.85, 12)
          .closePath()
          .fill(vestCol)
          .stroke({ color: outline, width: 2.2, join: "round" });
        for (const by of [uShoulderY + 84, uShoulderY + 104, uShoulderY + 124]) {
          ug.circle(0, by, 2.6).fill(0xd9b36c);
        }
        if (wSpec.watchChain) {
          ug.moveTo(0, uShoulderY + 114)
            .quadraticCurveTo(18, uShoulderY + 132, 30, uShoulderY + 116)
            .stroke({ color: 0xe6c15c, width: 2.2 });
        }
      }

      // Tie or Bowtie
      if (tieCol !== undefined) {
        ug.poly([-7, uShoulderY + 14, 7, uShoulderY + 14, 4.5, uShoulderY + 26, -4.5, uShoulderY + 26])
          .fill(shadeColor(tieCol, 0.84))
          .stroke({ color: outline, width: 1.8 });
        ug.poly([-4.5, uShoulderY + 26, 4.5, uShoulderY + 26, 8.5, -26, 0, -10, -8.5, -26])
          .fill(tieCol)
          .stroke({ color: outline, width: 2.0, join: "round" });
      } else if (wSpec.bowtie) {
        ug.poly([-15, uShoulderY + 12, -2, uShoulderY + 19, -15, uShoulderY + 26]).fill(accent).stroke({ color: outline, width: 1.8 });
        ug.poly([15, uShoulderY + 12, 2, uShoulderY + 19, 15, uShoulderY + 26]).fill(accent).stroke({ color: outline, width: 1.8 });
        ug.circle(0, uShoulderY + 19, 4.5).fill(shadeColor(accent, 0.8)).stroke({ color: outline, width: 1.6 });
      }

      // Tailored Jacket / Lab Coat / Longcoat / Judge Robe / Firefighter Coat
      if (jacket !== undefined && !wSpec.armorPlate && !wSpec.spaceSuit) {
        const jShade = shadeColor(jacket, 0.8);
        const lapelOpen = wSpec.judgeRobe ? 10 : isFemale ? 16 : 20;
        const coatBot = wSpec.longcoat || wSpec.labCoat || wSpec.judgeRobe ? 76 : 16;

        for (const side of [-1, 1]) {
          ug.moveTo(side * (shHalfW + 2), uShoulderY + 7)
            .lineTo(side * (shHalfW * 0.42), uShoulderY + 3)
            .lineTo(side * lapelOpen, uShoulderY + 74)
            .lineTo(side * (lapelOpen - 3), coatBot)
            .lineTo(side * (hipHalfW + (coatBot > 20 ? 12 : 3)), coatBot - 2)
            .bezierCurveTo(
              side * (waistHalfW + 3), uWaistY,
              side * (shHalfW + 3), uShoulderY + 46,
              side * (shHalfW + 2), uShoulderY + 7,
            )
            .closePath()
            .fill(side === 1 ? jShade : jacket)
            .stroke({ color: outline, width: 2.9, join: "round" });

          // Tailored lapel
          if (!wSpec.judgeRobe) {
            ug.poly([
              side * (shHalfW * 0.44), uShoulderY + 4,
              side * (shHalfW * 0.65), uShoulderY + 36,
              side * (lapelOpen + 2), uShoulderY + 70,
              side * lapelOpen, uShoulderY + 42,
            ])
              .fill(shadeColor(jacket, 1.15))
              .stroke({ color: outline, width: 2.0, join: "round" });
          }

          // Pocket flap
          ug.roundRect(
            side === -1 ? -hipHalfW * 0.82 : hipHalfW * 0.36,
            -22,
            hipHalfW * 0.44,
            8,
            3,
          )
            .fill(shadeColor(jacket, 0.86))
            .stroke({ color: outline, width: 1.6 });
        }

        // Pocket square
        if (wSpec.pocketSquare) {
          ug.poly([shHalfW * 0.44, uShoulderY + 58, shHalfW * 0.56, uShoulderY + 49, shHalfW * 0.68, uShoulderY + 58])
            .fill(0xf7f5f0)
            .stroke({ color: outline, width: 1.4 });
        }

        // Firefighter neon reflective stripes
        if (wSpec.reflectiveStripes) {
          for (const sy of [-6, 12]) {
            ug.rect(-hipHalfW - 2, sy, hipHalfW * 2 + 4, 8).fill(0xe6f238);
            ug.rect(-hipHalfW - 2, sy + 2.5, hipHalfW * 2 + 4, 3).fill(0xd8dfe8);
          }
        }
      }

      // Knight Armor Breastplate
      if (wSpec.armorPlate) {
        const steel = 0xbac4d4;
        const steelDark = 0x7b8699;
        ug.moveTo(-shHalfW * 0.94, uShoulderY + 10)
          .quadraticCurveTo(0, uShoulderY + 2, shHalfW * 0.94, uShoulderY + 10)
          .lineTo(waistHalfW * 0.9, uWaistY + 12)
          .lineTo(0, 14)
          .lineTo(-waistHalfW * 0.9, uWaistY + 12)
          .closePath()
          .fill(steel)
          .stroke({ color: outline, width: 2.9, join: "round" });
        ug.moveTo(0, uShoulderY + 8).lineTo(0, 10).stroke({ color: steelDark, width: 2.4 });
        ug.ellipse(-shHalfW * 0.92, uShoulderY + 18, 16, 12).fill(steel).stroke({ color: outline, width: 2.4 });
        ug.ellipse(shHalfW * 0.92, uShoulderY + 18, 16, 12).fill(steelDark).stroke({ color: outline, width: 2.4 });
        // Chest emblem
        ug.poly([0, uShoulderY + 34, 12, uShoulderY + 50, 0, uShoulderY + 68, -12, uShoulderY + 50])
          .fill(accent)
          .stroke({ color: outline, width: 1.8 });
      }

      // Astronaut Space Suit Panel & Stripes
      if (wSpec.spaceSuit) {
        ug.roundRect(-24, uShoulderY + 34, 48, 36, 6)
          .fill(0xd5dde8)
          .stroke({ color: outline, width: 2.2 });
        ug.circle(-12, uShoulderY + 46, 4).fill(0xe85d2a);
        ug.circle(0, uShoulderY + 46, 4).fill(0x2da6e0);
        ug.circle(12, uShoulderY + 46, 4).fill(0x3ec985);
        ug.roundRect(-16, uShoulderY + 56, 32, 8, 2).fill(0x283142);
        // Mission shoulder stripes
        ug.rect(-shHalfW + 4, uShoulderY + 86, shHalfW * 2 - 8, 7).fill(accent);
      }

      // Sailor Collar
      if (wSpec.sailorCollar) {
        ug.poly([-shHalfW * 0.78, uShoulderY + 6, 0, uShoulderY + 58, shHalfW * 0.78, uShoulderY + 6])
          .fill(0x1f304d)
          .stroke({ color: outline, width: 2.4, join: "round" });
        ug.moveTo(-shHalfW * 0.64, uShoulderY + 12)
          .lineTo(0, uShoulderY + 48)
          .lineTo(shHalfW * 0.64, uShoulderY + 12)
          .stroke({ color: 0xf4f6f9, width: 2.4 });
      }

      // Chef Apron
      if (apronCol !== undefined) {
        ug.roundRect(-hipHalfW * 0.92, uWaistY - 8, hipHalfW * 1.84, 86, 6)
          .fill(apronCol)
          .stroke({ color: outline, width: 2.2 });
        ug.roundRect(-20, uWaistY + 26, 40, 26, 4)
          .fill(shadeColor(apronCol, 0.9))
          .stroke({ color: outline, width: 1.6 });
      }

      // Epaulettes (Police / Military)
      if (wSpec.epaulettes) {
        for (const side of [-1, 1]) {
          ug.roundRect(side === -1 ? -shHalfW : shHalfW - 24, uShoulderY + 3, 24, 9, 4)
            .fill(0xe0bb53)
            .stroke({ color: outline, width: 1.8 });
        }
      }

      // Police / Firefighter / Detective Star Badge
      if (wSpec.badge) {
        const bx = -shHalfW * 0.48;
        const by = uShoulderY + 46;
        ug.poly([bx, by - 9, bx + 8, by - 3, bx + 5, by + 8, bx - 5, by + 8, bx - 8, by - 3])
          .fill(0xf0c954)
          .stroke({ color: outline, width: 1.6, join: "round" });
      }

      // Military Medals
      if (wSpec.medals) {
        const mx = shHalfW * 0.36;
        const my = uShoulderY + 48;
        for (let k = 0; k < 3; k++) {
          ug.rect(mx + k * 9 - 8, my - 6, 7, 10).fill(k === 0 ? 0xc93838 : k === 1 ? 0x2e64b8 : 0x3b8c52);
          ug.circle(mx + k * 9 - 4.5, my + 7, 3.8).fill(0xf0c954).stroke({ color: outline, width: 1.2 });
        }
      }

      // Diagonal Cross-Belt / Baldric (Military / Pirate / Knight / Ninja)
      if (wSpec.crossBelt) {
        ug.moveTo(-shHalfW * 0.72, uShoulderY + 8)
          .lineTo(hipHalfW * 0.82, 10)
          .stroke({ color: 0x3b261a, width: 12, cap: "butt" });
        ug.moveTo(-shHalfW * 0.72, uShoulderY + 8)
          .lineTo(hipHalfW * 0.82, 10)
          .stroke({ color: outline, width: 1.6 });
        ug.roundRect(-6, uShoulderY + 72, 14, 14, 2).fill(0xd9a841).stroke({ color: outline, width: 1.6 });
      }

      // Skirt, Sash, or Belt / Tool Belt
      if (hasSkirt) {
        const skW = hipHalfW * 1.38;
        const skH = 74;
        ug.moveTo(-hipHalfW, -6)
          .lineTo(hipHalfW, -6)
          .lineTo(skW, skH)
          .quadraticCurveTo(0, skH + 10, -skW, skH)
          .closePath()
          .fill(pants)
          .stroke({ color: outline, width: 3.0, join: "round" });
      } else if (sashCol !== undefined) {
        ug.roundRect(-hipHalfW - 2, -2, hipHalfW * 2 + 4, 18, 4)
          .fill(sashCol)
          .stroke({ color: outline, width: 2.2 });
        ug.poly([hipHalfW * 0.4, 14, hipHalfW * 0.82, 14, hipHalfW * 0.96, 52, hipHalfW * 0.52, 48])
          .fill(shadeColor(sashCol, 0.86))
          .stroke({ color: outline, width: 2.0 });
      } else if (!wSpec.judgeRobe && !wSpec.labCoat) {
        ug.roundRect(-hipHalfW, 4, hipHalfW * 2, 11, 3)
          .fill(0x1f1b1a)
          .stroke({ color: outline, width: 1.9 });
        ug.roundRect(-8, 3, 16, 13, 3)
          .fill(0xd9a841)
          .stroke({ color: outline, width: 1.6 });
        if (wSpec.toolBelt) {
          for (const px of [-hipHalfW * 0.65, hipHalfW * 0.42]) {
            ug.roundRect(px, 2, 18, 17, 3).fill(0x4a3424).stroke({ color: outline, width: 1.6 });
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. NECK, COLLAR WINGS, STETHOSCOPE, SCARF & JEWELRY
  // --------------------------------------------------------------------------
  const neckW = isFemale ? 20 : 25;
  if (!modularTextures?.torso) {
    ug.roundRect(-neckW * 0.5, uShoulderY - 22, neckW, 32, 7)
      .fill(skin)
      .stroke({ color: outline, width: 2.6 });

    if (!isSilhouette) {
      ug.ellipse(0, uShoulderY - 12, neckW * 0.48, 7).fill({ color: skinShade, alpha: 0.82 });

      if (!hasDress && !wSpec.armorPlate && !wSpec.spaceSuit && !wSpec.sailorCollar) {
        ug.poly([-neckW * 0.65, uShoulderY - 2, -5, uShoulderY + 18, -22, uShoulderY + 12])
          .fill(shirt)
          .stroke({ color: outline, width: 2.0, join: "round" });
        ug.poly([neckW * 0.65, uShoulderY - 2, 5, uShoulderY + 18, 22, uShoulderY + 12])
          .fill(shirt)
          .stroke({ color: outline, width: 2.0, join: "round" });
      }

      // Doctor Stethoscope draped cleanly around neck
      if (wSpec.stethoscope) {
        ug.moveTo(-18, uShoulderY + 4)
          .bezierCurveTo(-28, uShoulderY + 46, -12, uShoulderY + 76, 0, uShoulderY + 76)
          .bezierCurveTo(12, uShoulderY + 76, 28, uShoulderY + 46, 18, uShoulderY + 4)
          .stroke({ color: 0x252d3a, width: 4.5, cap: "round" });
        ug.circle(0, uShoulderY + 78, 8).fill(0xd0d8e4).stroke({ color: outline, width: 2.2 });
        ug.circle(0, uShoulderY + 78, 3.5).fill(0x526073);
      }

      if (scarfCol !== undefined) {
        ug.roundRect(8, uShoulderY + 10, 18, 56, 6)
          .fill(shadeColor(scarfCol, 0.82))
          .stroke({ color: outline, width: 2.2 });
        ug.roundRect(-neckW * 0.95, uShoulderY - 3, neckW * 1.9, 19, 9)
          .fill(scarfCol)
          .stroke({ color: outline, width: 2.4 });
      } else if (wSpec.necklace === "pearls" || wSpec.necklace === "beaded") {
        const beadCol = wSpec.necklace === "beaded" ? accent : 0xf9f6ee;
        for (let i = -3; i <= 3; i++) {
          ug.circle(i * 6, uShoulderY + 12 - Math.abs(i) * 1.3, 3.4)
            .fill(beadCol)
            .stroke({ color: outline, width: 1.3 });
        }
      } else if (wSpec.necklace === "chain") {
        ug.moveTo(-15, uShoulderY + 2)
          .quadraticCurveTo(0, uShoulderY + 22, 15, uShoulderY + 2)
          .stroke({ color: 0xe8c468, width: 2.2 });
        ug.circle(0, uShoulderY + 14, 3.8).fill(0xffd447).stroke({ color: outline, width: 1.3 });
      }
    }
  }

  // --------------------------------------------------------------------------
  // 6. HEAD (Rigid neck_attachment pivot + modular sprite OR Storia face engine)
  // --------------------------------------------------------------------------
  const headPivot = new Container();
  headPivot.position.set(0, neckPivotY);
  headPivot.rotation = headRot;
  if (neckSpec.rigidScale) {
    // Prevent torso breathing squash/stretch from distorting the head or eyes
    headPivot.scale.set(1 / squash.scaleX, 1 / squash.scaleY);
  }
  upperGroup.addChild(headPivot);

  const headContainer = new Container();
  headContainer.position.set(0, headCenterOffsetY);
  headPivot.addChild(headContainer);

  if (modularTextures?.head) {
    mountModularPartSprite(
      headContainer,
      modularTextures.head,
      0,
      0,
      122 * headScale,
      0,
      0.5,
      0.56,
    );
    if (modularTextures.hat) {
      mountModularPartSprite(headContainer, modularTextures.hat, 0, -48 * headScale, 68 * headScale, 0, 0.5, 0.8);
    }
  } else {
  const hg = new Graphics();
  headContainer.addChild(hg);

  // Ears + Earrings
  const earX = (isFemale ? 36 : 38) * (hr / 41);
  for (const side of [-1, 1]) {
    hg.ellipse(side * earX, 4, hr * 0.17, hr * 0.27)
      .fill(side === 1 ? skinShade : skin)
      .stroke({ color: outline, width: 2.6 });
    if (!isSilhouette) {
      hg.arc(side * earX, 4, hr * 0.08, 0.35, Math.PI - 0.35).stroke({ color: skinShade, width: 2.0 });
      if (wSpec.earrings === "drop") {
        hg.circle(side * (earX + 2), hr * 0.36, 4.2).fill(0xffd447).stroke({ color: outline, width: 1.4 });
      } else if (wSpec.earrings === "hoop") {
        hg.circle(side * (earX + 2), hr * 0.34, 6.2).stroke({ color: 0xf0c24b, width: 2.5 });
      } else if (wSpec.earrings === "stud") {
        hg.circle(side * (earX + 1), hr * 0.24, 2.8).fill(0xffffff).stroke({ color: outline, width: 1.2 });
      }
    }
  }

  // Exact Storia `engine.py` sculpted face shapes (soft / round / square / long / heart)
  const faceShape = wSpec.faceShape ?? "soft";
  const drawFacePath = (gTarget: Graphics) => {
    if (faceShape === "round") {
      gTarget
        .moveTo(-40 * fs, -28 * fs)
        .bezierCurveTo(-48 * fs, 4 * fs, -35 * fs, 43 * fs, -12 * fs, 51 * fs)
        .bezierCurveTo(-4 * fs, 55 * fs, 4 * fs, 55 * fs, 12 * fs, 51 * fs)
        .bezierCurveTo(35 * fs, 43 * fs, 48 * fs, 4 * fs, 40 * fs, -28 * fs)
        .bezierCurveTo(31 * fs, -64 * fs, -31 * fs, -64 * fs, -40 * fs, -28 * fs)
        .closePath();
    } else if (faceShape === "square") {
      gTarget
        .moveTo(-39 * fs, -30 * fs)
        .bezierCurveTo(-43 * fs, 6 * fs, -38 * fs, 30 * fs, -27 * fs, 45 * fs)
        .bezierCurveTo(-18 * fs, 56 * fs, 18 * fs, 56 * fs, 27 * fs, 45 * fs)
        .bezierCurveTo(38 * fs, 30 * fs, 43 * fs, 6 * fs, 39 * fs, -30 * fs)
        .bezierCurveTo(30 * fs, -64 * fs, -30 * fs, -64 * fs, -39 * fs, -30 * fs)
        .closePath();
    } else if (faceShape === "long") {
      gTarget
        .moveTo(-34 * fs, -30 * fs)
        .bezierCurveTo(-37 * fs, 12 * fs, -28 * fs, 43 * fs, -9 * fs, 56 * fs)
        .bezierCurveTo(-3 * fs, 61 * fs, 3 * fs, 61 * fs, 9 * fs, 56 * fs)
        .bezierCurveTo(28 * fs, 43 * fs, 37 * fs, 12 * fs, 34 * fs, -30 * fs)
        .bezierCurveTo(27 * fs, -68 * fs, -27 * fs, -68 * fs, -34 * fs, -30 * fs)
        .closePath();
    } else if (faceShape === "heart") {
      gTarget
        .moveTo(-40 * fs, -30 * fs)
        .bezierCurveTo(-44 * fs, 0, -33 * fs, 32 * fs, -12 * fs, 52 * fs)
        .bezierCurveTo(-5 * fs, 59 * fs, 5 * fs, 59 * fs, 12 * fs, 52 * fs)
        .bezierCurveTo(33 * fs, 32 * fs, 44 * fs, 0, 40 * fs, -30 * fs)
        .bezierCurveTo(25 * fs, -66 * fs, -25 * fs, -66 * fs, -40 * fs, -30 * fs)
        .closePath();
    } else if (isFemale) {
      gTarget
        .moveTo(-37 * fs, -30 * fs)
        .bezierCurveTo(-40 * fs, 10 * fs, -32 * fs, 36 * fs, -12 * fs, 50 * fs)
        .bezierCurveTo(-4 * fs, 55 * fs, 4 * fs, 55 * fs, 12 * fs, 50 * fs)
        .bezierCurveTo(32 * fs, 36 * fs, 40 * fs, 10 * fs, 37 * fs, -30 * fs)
        .bezierCurveTo(30 * fs, -60 * fs, -30 * fs, -60 * fs, -37 * fs, -30 * fs)
        .closePath();
    } else {
      gTarget
        .moveTo(-38 * fs, -30 * fs)
        .bezierCurveTo(-42 * fs, 10 * fs, -35 * fs, 34 * fs, -16 * fs, 51 * fs)
        .bezierCurveTo(-6 * fs, 58 * fs, 6 * fs, 58 * fs, 16 * fs, 51 * fs)
        .bezierCurveTo(35 * fs, 34 * fs, 42 * fs, 10 * fs, 38 * fs, -30 * fs)
        .bezierCurveTo(30 * fs, -60 * fs, -30 * fs, -60 * fs, -38 * fs, -30 * fs)
        .closePath();
    }
  };

  drawFacePath(hg);
  hg.fill(skin).stroke({ color: outline, width: 3.1, join: "round" });

  if (!isSilhouette) {
    // Directional warm cheek/jaw shadow on right 30% + gentle key highlight on left temple
    hg.moveTo(16 * fs, -48 * fs)
      .bezierCurveTo(38 * fs, -16 * fs, 37 * fs, 28 * fs, 12 * fs, 50 * fs)
      .bezierCurveTo(25 * fs, 26 * fs, 26 * fs, -14 * fs, 16 * fs, -48 * fs)
      .closePath()
      .fill({ color: skinShade, alpha: 0.48 });
    hg.ellipse(-18 * fs, -18 * fs, 10 * fs, 6 * fs).fill({ color: skinLight, alpha: 0.32 });

    // Soft blush ovals
    const blushAlpha = Math.max(0.12, expr.blush * 0.55);
    hg.ellipse(-20 * fs, 14 * fs, 8.5 * fs, 4.5 * fs).fill({ color: 0xe66a78, alpha: blushAlpha });
    hg.ellipse(20 * fs, 14 * fs, 8.5 * fs, 4.5 * fs).fill({ color: 0xe66a78, alpha: blushAlpha });

    // Sculpted Storia soft triangle nose
    hg.poly([2 * fs, -4 * fs, 8.5 * fs, 13 * fs, -1.5 * fs, 15 * fs])
      .fill({ color: skinShade, alpha: 0.85 });

    // Expressive eyes with real upper & lower eyelids (`lidTop`, `lidBot`)
    const blinkCycle = (globalTime + ph * 1.3) % 4.1;
    const isBlinking = blinkCycle > 3.96;
    const eyeY = -6 * fs;
    const eyeDx = 16 * fs;
    const eyeStyle = wSpec.eyeStyle ?? "open";
    const esx = eyeStyle === "almond" ? 1.15 : eyeStyle === "round" ? 1.02 : 1.24;
    const esy = (eyeStyle === "almond" ? 0.82 : eyeStyle === "round" ? 1.12 : 0.98) * expr.eyeOpen;
    const rx = 5.6 * esx * fs;
    const ry = Math.max(2.2, 5.6 * esy * fs);

    for (const side of [-1, 1]) {
      const ex = side * eyeDx;
      if (isBlinking || expr.mouthStyle === "laugh") {
        const arcDir = expr.mouthStyle === "laugh" ? -4.5 * fs : 3.5 * fs;
        hg.moveTo(ex - rx, eyeY + 1)
          .quadraticCurveTo(ex, eyeY + arcDir, ex + rx, eyeY + 1)
          .stroke({ color: outline, width: 3.1, cap: "round" });
      } else {
        // Clipped Eye Aperture (matches Storia `engine.py` Cairo clip so iris & lids stay strictly inside sclera)
        const eyeGroup = new Container();
        const eyeMask = new Graphics();
        eyeMask.ellipse(ex, eyeY, rx, ry).fill(0xffffff);
        eyeGroup.addChild(eyeMask);

        const eyeContent = new Graphics();
        eyeContent.mask = eyeMask;
        eyeContent.ellipse(ex, eyeY, rx, ry).fill(0xfaf8f4);

        // Iris + dark pupil + specular catchlight (clamped cleanly inside sclera)
        const pr = 3.5 * expr.pupilScale * fs;
        const px = ex + clamp(1.0 + gazeX, -rx * 0.42, rx * 0.42) * fs;
        const py = eyeY + clamp(gazeY, -ry * 0.36, ry * 0.36) * fs;
        eyeContent.circle(px, py, pr).fill(eyeIrisCol);
        eyeContent.circle(px, py, pr * 0.56).fill(0x0d0b10);
        eyeContent.circle(px - pr * 0.34, py - pr * 0.36, Math.max(1.1, pr * 0.32)).fill({ color: 0xffffff, alpha: 0.94 });

        // Clipped Upper Eyelid (angled inward when angry/furrowed)
        if (expr.lidTop > 0.03) {
          const topY = eyeY - ry + 2 * ry * expr.lidTop;
          const tiltLid = 3.0 * expr.furrow * fs;
          eyeContent
            .poly([
              ex - rx - 3, eyeY - ry - 3,
              ex + rx + 3, eyeY - ry - 3,
              ex + rx + 3, topY + -side * tiltLid,
              ex - rx - 3, topY + side * tiltLid,
            ])
            .fill(skin);
          eyeContent
            .moveTo(ex - rx - 1, topY + side * tiltLid)
            .lineTo(ex + rx + 1, topY + -side * tiltLid)
            .stroke({ color: outline, width: isFemale ? 2.5 : 2.1, cap: "round" });
        }

        // Clipped Lower Eyelid Squint (happy / love / sly)
        if (expr.lidBot > 0.03) {
          const botY = eyeY + ry - 2 * ry * expr.lidBot;
          eyeContent
            .poly([
              ex - rx - 3, eyeY + ry + 3,
              ex + rx + 3, eyeY + ry + 3,
              ex + rx + 3, botY + 1,
              ex - rx - 3, botY + 1,
            ])
            .fill(skin);
          eyeContent
            .moveTo(ex - rx * 0.9, botY + 1)
            .quadraticCurveTo(ex, botY - 1.4, ex + rx * 0.9, botY + 1)
            .stroke({ color: skinShade, width: 1.5, cap: "round" });
        }

        eyeGroup.addChild(eyeContent);
        headContainer.addChild(eyeGroup);

        // Crisp sclera border & upper lash curve rendered cleanly above clipped eye
        const eyeRim = new Graphics();
        eyeRim.ellipse(ex, eyeY, rx, ry).stroke({ color: outline, width: 1.85 });
        if (expr.lidTop <= 0.03) {
          eyeRim
            .moveTo(ex - rx * 1.04, eyeY - ry * 0.45)
            .quadraticCurveTo(ex, eyeY - ry * 1.12, ex + rx * 1.06, eyeY - ry * 0.4)
            .stroke({ color: outline, width: isFemale ? 3.2 : 2.3, cap: "round" });
        }
        if (isFemale) {
          eyeRim
            .moveTo(ex + side * rx * 0.96, eyeY - ry * 0.4)
            .lineTo(ex + side * (rx + 2.6 * fs), eyeY - ry * 0.78)
            .stroke({ color: outline, width: 2.2, cap: "round" });
        }
        headContainer.addChild(eyeRim);
      }

      // Anatomically positioned eyebrow (`browIn`, `browOut`, `browArch`), cleanly framed below the hairline
      const browLiftClamped = clamp(expr.browLift, -3.2, 2.6);
      const by = (-15.5 + browLiftClamped) * fs;
      const xIn = ex - side * 8.8 * fs;
      const xOut = ex + side * 9.8 * fs;
      const yIn = clamp(by + expr.browIn * 0.68 * fs, -23.5 * fs, -11.5 * fs);
      const yOut = clamp(by + expr.browOut * 0.68 * fs, -23.5 * fs, -11.5 * fs);
      const xm = (xIn + xOut) * 0.5;
      const ym = clamp((yIn + yOut) * 0.5 + expr.browArch * 0.65 * fs, -24.5 * fs, -12 * fs);
      hg.moveTo(xOut, yOut)
        .quadraticCurveTo(xm, ym, xIn, yIn)
        .stroke({ color: hairDark, width: isFemale ? 3.0 : 3.9, cap: "round" });
    }

    // Foreground head layer so tears, eyewear, bangs/front hair & hats cleanly overlap eyes
    const headTopG = new Graphics();
    headContainer.addChild(headTopG);

    // Glabella furrow creases when angry/determined
    if (expr.furrow > 0.35) {
      headTopG.moveTo(-3 * fs, -16 * fs).lineTo(-2 * fs, -11 * fs).stroke({ color: skinShade, width: 1.8, alpha: 0.7 });
      headTopG.moveTo(3 * fs, -16 * fs).lineTo(2 * fs, -11 * fs).stroke({ color: skinShade, width: 1.8, alpha: 0.7 });
    }

    // Animated rolling teardrops for cry expression
    if (expr.tears > 0.1) {
      for (const side of [-1, 1]) {
        headTopG.arc(side * eyeDx, eyeY + ry + 1, 3.6 * fs, 0.15, Math.PI - 0.15)
          .fill({ color: 0x8be2ff, alpha: 0.7 * expr.tears });
        const dropU = (globalTime * 0.85 + (side < 0 ? 0 : 0.45)) % 1;
        const ty = eyeY + ry + 3 + dropU * 24 * fs;
        const tx = side * (eyeDx + Math.sin(dropU * 4) * 1.4);
        const da = Math.sin(dropU * Math.PI) * 0.85 * expr.tears;
        if (da > 0.05) {
          headTopG.ellipse(tx, ty, 2.8 * fs, 4.2 * fs).fill({ color: 0x9ce8ff, alpha: da });
        }
      }
    }

    // Facial hair (12 expressive styles)
    drawFacialHair({
      g: hg,
      style: def.accessories.facialHair,
      hair,
      hairDark,
      outline,
      fs,
      pendulum,
    });

    // Mouth (expressive shapes + speech-reactive lip-sync)
    const mouthY = 31 * fs;
    const mw = 10.5 * expr.mouthW * fs;
    const isTalking = layer.talkWindows.some(([a, b]) => localTime >= a && localTime <= b);
    const talkAmt = isTalking ? 0.35 + 0.65 * Math.abs(Math.sin(globalTime * 15)) : 0;

    if (talkAmt > 0.22 || expr.mouthStyle === "gasp" || expr.mouthStyle === "laugh") {
      const openH =
        expr.mouthStyle === "laugh" ? 11 * fs : expr.mouthStyle === "gasp" ? 8.5 * fs : lerp(4, 10, talkAmt) * fs;
      const openW = expr.mouthStyle === "gasp" ? mw * 0.72 : mw * 1.02;
      hg.ellipse(0, mouthY + 1, openW, openH * 0.72)
        .fill(0x571a24)
        .stroke({ color: outline, width: 2.2 });
      // Upper teeth bar
      if (expr.mouthStyle !== "gasp") {
        hg.roundRect(-openW * 0.65, mouthY - openH * 0.42, openW * 1.3, Math.max(2.2, openH * 0.28), 2).fill(0xf9f7f2);
      }
      hg.ellipse(0, mouthY + openH * 0.34, openW * 0.48, openH * 0.22).fill(0xc95367);
    } else if (expr.mouthStyle === "open_smile") {
      hg.moveTo(-mw, mouthY - 1)
        .quadraticCurveTo(0, mouthY + 11 * fs, mw, mouthY - 1)
        .closePath()
        .fill(0x691e2c)
        .stroke({ color: outline, width: 2.2, join: "round" });
      hg.moveTo(-mw * 0.74, mouthY + 0.5)
        .lineTo(mw * 0.74, mouthY + 0.5)
        .stroke({ color: 0xfbfaf6, width: 3.0, cap: "round" });
    } else if (expr.mouthStyle === "smirk") {
      hg.moveTo(-mw * 0.85, mouthY + 2)
        .quadraticCurveTo(mw * 0.2, mouthY + 3.5, mw, mouthY - 3.5)
        .stroke({ color: outline, width: 2.8, cap: "round" });
    } else {
      hg.moveTo(-mw, mouthY)
        .quadraticCurveTo(0, mouthY + expr.smile * 1.45 * fs, mw, mouthY)
        .stroke({ color: outline, width: 2.8, cap: "round" });
      // Delicate lower-lip shadow
      hg.moveTo(-mw * 0.42, mouthY + 5.5 * fs)
        .quadraticCurveTo(0, mouthY + 7.5 * fs, mw * 0.42, mouthY + 5.5 * fs)
        .stroke({ color: skinShade, width: 1.8, alpha: 0.65, cap: "round" });
    }

    // Eyewear (classic / round / cat_eye / sunglasses / monocle / eyepatch)
    if (effectiveGlasses === "eyepatch") {
      headTopG.moveTo(-36 * fs, -26 * fs).lineTo(36 * fs, 12 * fs).stroke({ color: 0x16141a, width: 3.4 });
      headTopG.ellipse(eyeDx, eyeY, rx * 1.25, ry * 1.25).fill(0x18151d).stroke({ color: 0x3b3542, width: 1.8 });
    } else if (effectiveGlasses === "monocle") {
      const gr = 10.5 * fs;
      headTopG.circle(eyeDx, eyeY, gr).fill({ color: 0xe6f5ff, alpha: 0.22 }).stroke({ color: 0xe0b64e, width: 2.6 });
      headTopG.moveTo(eyeDx + gr, eyeY + 2)
        .bezierCurveTo(eyeDx + gr + 6, eyeY + 28, eyeDx + 4, eyeY + 56, eyeDx - 4, eyeY + 64)
        .stroke({ color: 0xe0b64e, width: 1.5, alpha: 0.85 });
    } else if (effectiveGlasses !== "none") {
      const gRad = 10.2 * fs;
      const isSun = effectiveGlasses === "sunglasses";
      const gCol = effectiveGlasses === "round" ? 0xd9a841 : 0x1c1c24;
      for (const side of [-1, 1]) {
        const gx = side * eyeDx;
        if (effectiveGlasses === "round") {
          headTopG.circle(gx, eyeY, gRad)
            .fill({ color: isSun ? 0x111522 : 0xdaf2ff, alpha: isSun ? 0.86 : 0.2 })
            .stroke({ color: gCol, width: 2.8 });
        } else {
          headTopG.roundRect(gx - gRad, eyeY - gRad * 0.76, gRad * 2, gRad * 1.52, 5)
            .fill({ color: isSun ? 0x111522 : 0xdaf2ff, alpha: isSun ? 0.88 : 0.2 })
            .stroke({ color: gCol, width: 2.8 });
        }
        headTopG.moveTo(gx - gRad * 0.42, eyeY - gRad * 0.32)
          .lineTo(gx - gRad * 0.08, eyeY - gRad * 0.56)
          .stroke({ color: 0xffffff, width: 2.0, alpha: 0.65, cap: "round" });
      }
      headTopG.moveTo(-eyeDx + gRad, eyeY).lineTo(eyeDx - gRad, eyeY).stroke({ color: gCol, width: 2.5 });
    }

    // Front Hair Crown & Sculpted Bangs (26 men's & women's hairstyles)
    drawFrontHair({
      g: headTopG,
      hairStyle: def.hairStyle,
      hair,
      hairDark,
      hairLight,
      accent,
      outline,
      fs,
      isFemale,
      isSilhouette,
      hairBow: Boolean(wSpec.hairBow),
      effectiveHat,
      pendulum,
    });

    // ------------------------------------------------------------------------
    // ROLE HEADWEAR & HATS (30 distinct silhouettes) OR MODULAR HAT SPRITE
    // ------------------------------------------------------------------------
    if (modularTextures?.hat) {
      mountModularPartSprite(headContainer, modularTextures.hat, 0, -48 * headScale, 68 * headScale, 0, 0.5, 0.8);
    } else {
      drawHeadwear({
        g: headTopG,
        hat: effectiveHat,
        hatCol,
        accent,
        outline,
        fs,
        feather: Boolean(wSpec.feather),
        pendulum,
      });
    }
  }
  }

  // --------------------------------------------------------------------------
  // 7. FRONT ARM(S) & BOUND CONTACT PROP (`contactProp` + `frontLimbParts`)
  // --------------------------------------------------------------------------
  const rightWristPreview = {
    ex: rightSocketX + Math.sin(fa1) * uaLen + Math.sin(fa1 + fa2) * faLen,
    ey: rightSocketY + Math.cos(fa1) * uaLen + Math.cos(fa1 + fa2) * faLen,
  };
  const renderContactProp = () => {
    const cp = layer.contactProp;
    if (!cp || cp.state === "release") return;
    const tex = modularTextures?.contactProp ?? modularTextures?.prop?.texture;
    const anchor = cp.holderArm === "left" ? leftWristPos : rightWristPreview;
    const px = anchor.ex + cp.offsetX;
    const py = anchor.ey + cp.offsetY;
    if (tex) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 0.5);
      const targetPx = Math.max(24, cp.widthNorm * 320);
      const s = targetPx / Math.max(1, tex.width);
      sp.scale.set(s);
      sp.position.set(px, py);
      sp.rotation = (cp.rotationDeg * Math.PI) / 180;
      upperGroup.addChild(sp);
    } else {
      const pg = new Graphics();
      const pw = Math.max(24, cp.widthNorm * 220);
      const ph = pw * 0.72;
      pg.roundRect(-pw * 0.5, -ph * 0.5, pw, ph, 5)
        .fill(0xf3ebd2)
        .stroke({ color: outline, width: 2.4 });
      pg.position.set(px, py);
      pg.rotation = (cp.rotationDeg * Math.PI) / 180;
      upperGroup.addChild(pg);
    }
  };

  const rightForearmInFrontOfProp = Boolean(
    layer.frontLimbParts?.includes("right_forearm") || layer.frontLimbParts?.includes("right_arm"),
  );

  // If right forearm passes IN FRONT of the prop, draw prop first then front arm(s)
  if (rightForearmInFrontOfProp) {
    renderContactProp();
  }

  const fg = new Graphics();
  upperGroup.addChild(fg);
  if (leftArmInFront) {
    leftWristPos = drawDetailedArm(
      fg,
      leftSocketX,
      leftSocketY,
      ba1,
      ba2,
      uaLen,
      faLen,
      armW,
      shadeColor(sleeveCol, 0.92),
      handCol,
      outline,
      isSilhouette,
      hasCuff,
      Boolean(wSpec.reflectiveStripes),
      handL,
      continuousArmMode,
      inkSag,
      Boolean(modularTextures?.leftHand),
    );
    if (modularTextures?.leftHand) {
      mountModularPartSprite(
        upperGroup,
        modularTextures.leftHand,
        leftWristPos.ex,
        leftWristPos.ey,
        28,
        Math.atan2(leftWristPos.dirY, leftWristPos.dirX),
      );
    }
  }
  const rightWristPos = drawDetailedArm(
    fg,
    rightSocketX,
    rightSocketY,
    fa1,
    fa2,
    uaLen,
    faLen,
    armW,
    sleeveCol,
    handCol,
    outline,
    isSilhouette,
    hasCuff,
    Boolean(wSpec.reflectiveStripes),
    handR,
    continuousArmMode,
    inkSag,
    Boolean(modularTextures?.rightHand),
  );
  if (modularTextures?.rightHand) {
    mountModularPartSprite(
      upperGroup,
      modularTextures.rightHand,
      rightWristPos.ex,
      rightWristPos.ey,
      28,
      Math.atan2(rightWristPos.dirY, rightWristPos.dirX),
    );
  }

  if (!rightForearmInFrontOfProp) {
    renderContactProp();
  }
}
