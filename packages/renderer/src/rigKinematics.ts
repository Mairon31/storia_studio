import type { ArmAction, ArmRigConstraints, ArmTrackSegment, ReactionNod } from "@storia/schema";
import { clamp, lerp } from "./color.js";

const TWO_PI = Math.PI * 2;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function smoothstep01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Wraps an angle in radians into (-PI, PI] (ported from Rigby2D's wrapDegrees).
 * Guarantees shortest-arc interpolation between pose keyframes with zero 360° flips.
 */
export function wrapRadians(rad: number): number {
  let a = ((rad + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
  if (a <= -Math.PI) a += TWO_PI;
  return a;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapRadians(b - a) * t;
}

export interface TwoBoneIKResult {
  /** Upper segment angle relative to vertical-down (+Y): x = x0 + sin(a1)*l1, y = y0 + cos(a1)*l1 */
  a1: number;
  /** Lower segment angle relative to upper segment (elbow/knee bend). */
  a2: number;
  /** Solved middle joint world/local coordinates. */
  jx: number;
  jy: number;
  /** Solved end-effector coordinates. */
  ex: number;
  ey: number;
}

/**
 * 2-Bone Analytical IK Solver with exponential softness (adapted from Rigby2D `solveIk`).
 * Uses Storia's limb convention where angle 0 points straight down (+Y):
 *   dx = sin(angle) * length, dy = cos(angle) * length.
 *
 * @param x0 Root joint X (shoulder or hip)
 * @param y0 Root joint Y
 * @param tx Target end-effector X (hand or ankle)
 * @param ty Target end-effector Y
 * @param l1 Upper bone length
 * @param l2 Lower bone length
 * @param bendDir +1 or -1 controlling elbow/knee bend side
 * @param softness Smooth exponential deceleration zone near full extension (prevents knee/elbow popping)
 */
export function solveTwoBoneIK(
  x0: number,
  y0: number,
  tx: number,
  ty: number,
  l1: number,
  l2: number,
  bendDir: 1 | -1 = 1,
  softness = 6,
): TwoBoneIKResult {
  const dx = tx - x0;
  const dy = ty - y0;
  let d = Math.hypot(dx, dy);

  const minD = Math.abs(l1 - l2) + 1e-4;
  const maxD = l1 + l2 - 1e-4;

  // Rigby2D exponential softness curve prevents harsh snapping when approaching full extension
  if (softness > 0 && d > maxD - softness) {
    d = maxD - softness * Math.exp(-(d - (maxD - softness)) / softness);
  }
  d = clamp(d, minD, maxD);

  // Target angle in vertical-down frame (0 = +Y, +PI/2 = +X)
  const targetAng = Math.atan2(dx, dy);

  // Law of cosines for shoulder/hip offset angle A and interior knee/elbow angle B
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const A = Math.acos(cosA);

  const cosB = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1);
  const B = Math.acos(cosB);

  const a1 = targetAng - bendDir * A;
  const a2 = bendDir * (Math.PI - B);

  const jx = x0 + Math.sin(a1) * l1;
  const jy = y0 + Math.cos(a1) * l1;
  const ex = jx + Math.sin(a1 + a2) * l2;
  const ey = jy + Math.cos(a1 + a2) * l2;

  return { a1, a2, jx, jy, ex, ey };
}

export interface GroundedLegPose {
  thighAng: number;
  kneeAng: number;
  footAng: number;
  ankleX: number;
  ankleY: number;
}

/**
 * Grounded 2-bone IK locomotion & stance solver for legs.
 * Keeps planted feet firmly resting on the ground plane (`groundY = -12`) during stance,
 * lifts feet along a smooth sinusoidal stride arc during swing, and handles sit/kneel/dance
 * without floating or sinking below the ground shadow.
 */
export function solveGroundedLegIK(opts: {
  hipX: number;
  hipY: number;
  legLen: number;
  sideIndex: 0 | 1;
  walkCycle: number;
  walkWeight: number;
  runWeight: number;
  sitWeight: number;
  kneelWeight: number;
  danceWeight: number;
  globalTime: number;
  phaseOffset: number;
  overrideThigh?: number;
  overrideShin?: number;
}): GroundedLegPose {
  const {
    hipX,
    hipY,
    legLen,
    sideIndex,
    walkCycle,
    walkWeight,
    runWeight,
    sitWeight,
    kneelWeight,
    danceWeight,
    globalTime,
    phaseOffset,
    overrideThigh,
    overrideShin,
  } = opts;

  // Match actual hip-to-ankle span so straight standing legs rest flush on groundY (-14)
  // without forcing a phantom 35° crouch knee bend when idle.
  const groundY = -14;
  const standSpan = Math.max(40, legLen - 14);
  const l1 = standSpan * 0.515;
  const l2 = standSpan * 0.485;

  // Explicit FK bone overrides take priority when authored by user/MCP
  if (overrideThigh !== undefined || overrideShin !== undefined) {
    const thighAng = overrideThigh ?? 0;
    const kneeAng = overrideShin ?? 0;
    const jx = hipX + Math.sin(thighAng) * l1;
    const jy = hipY + Math.cos(thighAng) * l1;
    const ex = jx + Math.sin(thighAng + kneeAng) * l2;
    const ey = jy + Math.cos(thighAng + kneeAng) * l2;
    return { thighAng, kneeAng, footAng: -(thighAng + kneeAng) * 0.75, ankleX: ex, ankleY: ey };
  }

  // Clean, grounded upright stance when stationary (zero awkward knee bend!)
  const activity = Math.max(walkWeight, runWeight, sitWeight, kneelWeight, danceWeight);
  const idleThigh = sideIndex === 0 ? -0.028 : 0.028;
  const idleKnee = sideIndex === 0 ? 0.028 : -0.028;
  const idleAnkleX = hipX + (sideIndex === 0 ? -3.2 : 3.2);
  const idleAnkleY = hipY + standSpan;

  if (activity < 0.01) {
    return {
      thighAng: idleThigh,
      kneeAng: idleKnee,
      footAng: 0,
      ankleX: idleAnkleX,
      ankleY: idleAnkleY,
    };
  }

  const stanceSpread = sideIndex === 0 ? -4 : 4;

  // 1. Standing / walking / running foot trajectory
  const lp = walkCycle + (sideIndex === 0 ? 0 : Math.PI);
  const strideLen = (44 + 40 * runWeight) * walkWeight;
  const liftHeight = (22 + 28 * runWeight) * walkWeight;
  const s = Math.sin(lp);
  const c = Math.cos(lp);

  // Stance phase (c <= 0): foot slides smoothly along ground plane (y = groundY)
  // Swing phase (c > 0): foot lifts in an arc above the ground
  let targetX = hipX + stanceSpread - s * strideLen;
  let targetY = groundY - Math.max(0, c) * liftHeight;
  let footRoll = walkWeight * (c > 0 ? -0.16 * c : 0.12 * s);

  // 2. Dance bounce & step tap
  if (danceWeight > 0.01) {
    const dPhase = globalTime * 6.2 + phaseOffset + (sideIndex === 0 ? 0 : Math.PI);
    const tapLift = Math.max(0, Math.sin(dPhase)) * 18 * danceWeight;
    const tapX = Math.cos(dPhase) * 14 * danceWeight;
    targetX += tapX;
    targetY = Math.min(targetY, groundY - tapLift);
    footRoll += -0.22 * (tapLift / 18) * danceWeight;
  }

  // 3. Seated stance (thighs angled forward, shins resting vertically with feet grounded)
  if (sitWeight > 0.01) {
    const sitTargetX = hipX + (sideIndex === 0 ? 34 : 52);
    const sitTargetY = groundY;
    targetX = lerp(targetX, sitTargetX, sitWeight);
    targetY = lerp(targetY, sitTargetY, sitWeight);
    footRoll = lerp(footRoll, 0.05, sitWeight);
  }

  // 4. Kneeling stance (front leg bent 90 deg planted, back knee down)
  if (kneelWeight > 0.01) {
    const kTargetX = sideIndex === 1 ? hipX + 58 : hipX - 42;
    const kTargetY = sideIndex === 1 ? groundY : groundY - 8;
    targetX = lerp(targetX, kTargetX, kneelWeight);
    targetY = lerp(targetY, kTargetY, kneelWeight);
  }

  // Natural anatomical knee bend direction: knees bend forward (+X), shins trail back (-X)
  const bendDir: 1 | -1 = kneelWeight > 0.5 && sideIndex === 0 ? 1 : -1;
  const solved = solveTwoBoneIK(hipX, hipY, targetX, targetY, l1, l2, bendDir, 2);

  // Keep foot flat to the ground when planted, plus heel/toe roll during swing
  const footAng = -(solved.a1 + solved.a2) * 0.92 + footRoll;
  const blend = clamp(activity * 2.5, 0, 1);

  return {
    thighAng: lerpAngle(idleThigh, solved.a1, blend),
    kneeAng: lerpAngle(idleKnee, solved.a2, blend),
    footAng: lerp(0, footAng, blend),
    ankleX: lerp(idleAnkleX, solved.ex, blend),
    ankleY: lerp(idleAnkleY, solved.ey, blend),
  };
}

export interface SecondaryMotionSample {
  /** Primary horizontal sway in px (for hair tips, capes, scarves). */
  swayX: number;
  /** Secondary vertical lag bounce in px. */
  lagY: number;
  /** Angular lag in radians (for ponytails, ribbons, hat feathers). */
  angleLag: number;
}

/**
 * Deterministic Verlet-inspired damped pendulum secondary motion evaluator
 * (adapted from Rev2D `physics.ts` & rig-c `physics.ts` into a pure stateless function of time `t`,
 * guaranteeing 100% pixel-identical parity between interactive scrubbing and headless MP4 export).
 */
export function solvePendulumSway(opts: {
  timeSec: number;
  phaseOffset: number;
  walkCycle: number;
  walkWeight: number;
  runWeight: number;
  danceWeight: number;
  headTilt: number;
  torsoTilt: number;
  stiffness?: number;
  strength?: number;
}): SecondaryMotionSample {
  const {
    timeSec,
    phaseOffset,
    walkCycle,
    walkWeight,
    runWeight,
    danceWeight,
    headTilt,
    torsoTilt,
    stiffness = 1.0,
    strength = 1.0,
  } = opts;

  if (strength <= 0.001) {
    return { swayX: 0, lagY: 0, angleLag: 0 };
  }

  const freq = 2.35 * clamp(stiffness, 0.4, 2.2);
  // Subtle ambient breeze + phase-delayed harmonic response to walk/run/dance impulses
  const breeze = Math.sin(timeSec * freq + phaseOffset) * 2.6 + Math.sin(timeSec * freq * 1.73 + phaseOffset * 2.1) * 1.1;
  // Trailing inertia when running/walking (lagged by ~0.55 rad behind stride cycle)
  const strideDrag = (-6.5 - 11.5 * runWeight) * walkWeight;
  const strideOsc = Math.sin(walkCycle - 0.55) * (5.5 + 8.5 * runWeight) * walkWeight;
  const danceOsc = Math.sin(timeSec * 6.2 + phaseOffset - 0.45) * 9.5 * danceWeight;
  // Gravity follow-through from torso & head tilt
  const gravityPull = -(torsoTilt * 18 + headTilt * 14);

  const swayX = (breeze + strideDrag + strideOsc + danceOsc + gravityPull) * strength;
  const lagY = (Math.cos(walkCycle * 2 - 0.5) * (3.2 + 4.8 * runWeight) * walkWeight + Math.cos(timeSec * 6.2 + phaseOffset - 0.4) * 3.5 * danceWeight) * strength;
  const angleLag = clamp(swayX * 0.011, -0.55, 0.55);

  return { swayX, lagY, angleLag };
}

/**
 * Volume-preserving Squash & Stretch (inspired by StretchyStudio transforms).
 * Keeps area constant (`scaleX = 1 / sqrt(scaleY)`) so characters feel alive, never flattened.
 */
export function computeVolumeSquash(opts: {
  walkCycle: number;
  walkWeight: number;
  runWeight: number;
  danceWeight: number;
  breathe: number;
  shockOrCelebrate: number;
}): { scaleX: number; scaleY: number } {
  const { walkCycle, walkWeight, runWeight, danceWeight, breathe, shockOrCelebrate } = opts;
  const strideSquash = Math.cos(walkCycle * 2) * (0.014 + 0.022 * runWeight) * walkWeight;
  const danceSquash = Math.cos(walkCycle * 1.4) * 0.024 * danceWeight;
  const popStretch = shockOrCelebrate * 0.028;

  const scaleY = clamp(1 + breathe + strideSquash + danceSquash + popStretch, 0.92, 1.08);
  const scaleX = 1 / Math.sqrt(scaleY);
  return { scaleX, scaleY };
}

// ============================================================================
// STICKMAN-VIDEO-DIRECTOR (b6_puppet.py / b6_actions.py / mei-reference-rig)
// BOUNDED 2-BONE ARM IK, CONTINUOUS INK-PATH, ARM TRACKS, RIGID NECK & ANKLES
// ============================================================================

export interface BoundedArmIKResult extends TwoBoneIKResult {
  /** Whether the requested target was strictly reachable within joint & offset envelopes. */
  reachable: boolean;
  /** Human-readable violation reason when reachable === false (used by audit_project). */
  reason?: string;
  /** Upper arm angle in degrees (vertical-down convention). */
  upperDeg: number;
  /** Elbow bend magnitude in degrees. */
  bendDeg: number;
  /** Actual distance from shoulder to requested target. */
  requestedDistance: number;
  /** Max allowed reach (l1 + l2). */
  maxReach: number;
}

/**
 * Bounded 2-Bone Planar Arm IK Solver (ported from `b6_puppet.py` `planar_ik` + `mei-reference-rig.cjs` `ik`).
 * Enforces fixed pole continuity (no elbow flips), `upperAngleRangeDeg`, `elbowBendRangeDeg`,
 * and `maxIkOffset` relative to an optional nominal wrist position.
 */
export function solveBoundedArmIK(opts: {
  shoulderX: number;
  shoulderY: number;
  targetX: number;
  targetY: number;
  l1: number;
  l2: number;
  constraints?: Partial<ArmRigConstraints>;
  nominalWrist?: { x: number; y: number };
  softness?: number;
}): BoundedArmIKResult {
  const {
    shoulderX,
    shoulderY,
    targetX,
    targetY,
    l1,
    l2,
    constraints,
    nominalWrist,
    softness = 5,
  } = opts;

  const pole: 1 | -1 = constraints?.pole ?? -1;
  const upperRange = constraints?.upperAngleRangeDeg ?? [-165, 165];
  const bendRange = constraints?.elbowBendRangeDeg ?? [4, 152];
  const maxIkOffset = constraints?.maxIkOffset ?? 180;

  const dx = targetX - shoulderX;
  const dy = targetY - shoulderY;
  const requestedDistance = Math.hypot(dx, dy);
  const minReach = Math.abs(l1 - l2) + 1e-3;
  const maxReach = l1 + l2 - 1e-3;

  let reachable = true;
  let reason: string | undefined;

  if (!Number.isFinite(requestedDistance) || requestedDistance < minReach || requestedDistance > maxReach) {
    reachable = false;
    reason = `IK wrist target distance (${requestedDistance.toFixed(1)}px) is outside permitted reach [${minReach.toFixed(1)}, ${maxReach.toFixed(1)}]px.`;
  } else if (nominalWrist) {
    const off = Math.hypot(targetX - nominalWrist.x, targetY - nominalWrist.y);
    if (off > maxIkOffset + 1e-4) {
      reachable = false;
      reason = `IK wrist offset (${off.toFixed(1)}px) exceeds maxIkOffset (${maxIkOffset}px).`;
    }
  }

  // Solve with fixed pole & softness
  const solved = solveTwoBoneIK(shoulderX, shoulderY, targetX, targetY, l1, l2, pole, softness);

  // Clamp upper angle and elbow bend strictly inside approved anatomical ranges
  const rawUpperDeg = wrapRadians(solved.a1) * RAD2DEG;
  const rawBendDeg = Math.abs(wrapRadians(solved.a2)) * RAD2DEG;

  const clampedUpperDeg = clamp(rawUpperDeg, upperRange[0], upperRange[1]);
  const clampedBendDeg = clamp(rawBendDeg, bendRange[0], bendRange[1]);

  if (
    reachable &&
    (Math.abs(clampedUpperDeg - rawUpperDeg) > 1.5 || Math.abs(clampedBendDeg - rawBendDeg) > 1.5)
  ) {
    reachable = false;
    reason = `IK joint solution (upper=${rawUpperDeg.toFixed(1)}°, bend=${rawBendDeg.toFixed(1)}°) exceeds anatomical limits.`;
  }

  const a1 = clampedUpperDeg * DEG2RAD;
  const a2 = pole * clampedBendDeg * DEG2RAD;
  const jx = shoulderX + Math.sin(a1) * l1;
  const jy = shoulderY + Math.cos(a1) * l1;
  const ex = jx + Math.sin(a1 + a2) * l2;
  const ey = jy + Math.cos(a1 + a2) * l2;

  return {
    a1,
    a2,
    jx,
    jy,
    ex,
    ey,
    reachable,
    reason,
    upperDeg: clampedUpperDeg,
    bendDeg: clampedBendDeg,
    requestedDistance,
    maxReach: l1 + l2,
  };
}

export interface ContinuousInkArmGeometry {
  root: { x: number; y: number };
  control: { x: number; y: number };
  wrist: { x: number; y: number };
  points: { x: number; y: number }[];
  arclength: number;
  valid: boolean;
}

/**
 * Continuous quadratic Bezier ink-path arm geometry (ported from `b6_puppet.py` `_continuous_ink_geometry`).
 * Computes a single smooth curve from sleeve cuff outlet to wrist with bounded downward `sag`,
 * forbidding backward folds along the root-to-wrist chord.
 */
export function evaluateContinuousInkArm(opts: {
  rootX: number;
  rootY: number;
  elbowX: number;
  elbowY: number;
  wristX: number;
  wristY: number;
  reach: number;
  sag: number;
  samples?: number;
}): ContinuousInkArmGeometry {
  const { rootX, rootY, elbowX, elbowY, wristX, wristY, reach, samples = 24 } = opts;
  const boundedSag = clamp(opts.sag, 0, reach * 0.25);

  // Blend chord midpoint + bounded sag with subtle elbow guidance so poses retain natural curvature
  const midX = (rootX + wristX) * 0.5;
  const midY = (rootY + wristY) * 0.5;
  let ctrlX = lerp(midX, elbowX, 0.42);
  let ctrlY = lerp(midY + boundedSag * 1.4, elbowY, 0.42);

  // Guard against chord folding: derivative projections along delta must stay strictly positive
  const dx = wristX - rootX;
  const dy = wristY - rootY;
  const d0Dot = 2 * ((ctrlX - rootX) * dx + (ctrlY - rootY) * dy);
  const d1Dot = 2 * ((wristX - ctrlX) * dx + (wristY - ctrlY) * dy);
  if (d0Dot <= 1e-4 || d1Dot <= 1e-4) {
    ctrlX = midX;
    ctrlY = midY + boundedSag * 0.5;
  }

  const pts: { x: number; y: number }[] = [];
  let arclength = 0;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const inv = 1 - t;
    const x = inv * inv * rootX + 2 * inv * t * ctrlX + t * t * wristX;
    const y = inv * inv * rootY + 2 * inv * t * ctrlY + t * t * wristY;
    if (i > 0) {
      arclength += Math.hypot(x - pts[i - 1]!.x, y - pts[i - 1]!.y);
    }
    pts.push({ x, y });
  }

  return {
    root: { x: rootX, y: rootY },
    control: { x: ctrlX, y: ctrlY },
    wrist: { x: wristX, y: wristY },
    points: pts,
    arclength,
    valid: arclength <= reach * 1.12 + 1e-3,
  };
}

/** Authored planar arm action pose table (b6_puppet PoseLibrary adapted to Storia vertical-down angles). */
const ARM_ACTION_POSES: Record<
  "left" | "right",
  Record<ArmAction, { a1: number; a2: number; hand: "relaxed" | "open" | "point" | "fist" }>
> = {
  right: {
    rest: { a1: 0.14, a2: -0.18, hand: "relaxed" },
    reach: { a1: 0.92, a2: -0.42, hand: "open" },
    offer: { a1: 1.24, a2: -0.58, hand: "open" },
    receive: { a1: 1.08, a2: -0.78, hand: "open" },
    retract: { a1: 0.48, a2: -0.52, hand: "relaxed" },
  },
  left: {
    rest: { a1: -0.14, a2: 0.18, hand: "relaxed" },
    reach: { a1: -0.88, a2: 0.42, hand: "open" },
    offer: { a1: -1.18, a2: 0.58, hand: "open" },
    receive: { a1: -1.02, a2: 0.78, hand: "open" },
    retract: { a1: -0.45, a2: 0.52, hand: "relaxed" },
  },
};

export function sampleArmActionPose(
  side: "left" | "right",
  action: ArmAction,
  phase: number,
): { a1: number; a2: number; hand: "relaxed" | "open" | "point" | "fist" } {
  const p = clamp(phase, 0, 1);
  const lib = ARM_ACTION_POSES[side];
  if (action === "retract") {
    const first = p <= 0.5 ? lib.offer : lib.retract;
    const second = p <= 0.5 ? lib.retract : lib.rest;
    const u = smoothstep01(p <= 0.5 ? p * 2 : p * 2 - 1);
    return {
      a1: lerpAngle(first.a1, second.a1, u),
      a2: lerpAngle(first.a2, second.a2, u),
      hand: u > 0.5 ? second.hand : first.hand,
    };
  }
  const startKey: ArmAction =
    action === "rest" ? "rest" : action === "reach" ? "rest" : "reach";
  const a = lib[startKey];
  const b = lib[action];
  const u = smoothstep01(p);
  return {
    a1: lerpAngle(a.a1, b.a1, u),
    a2: lerpAngle(a.a2, b.a2, u),
    hand: u > 0.45 ? b.hand : a.hand,
  };
}

/**
 * Evaluates an independent per-arm `ArmTrack` (ported from `b6_actions.py` `ArmTrack.sample`).
 * Before track start holds initial segment start; after track end holds final segment end.
 */
export function evaluateArmTrack(
  side: "left" | "right",
  segments: ArmTrackSegment[],
  localTime: number,
): { a1: number; a2: number; hand: "relaxed" | "open" | "point" | "fist"; action: ArmAction; phase: number } | null {
  if (!segments || segments.length === 0) return null;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const selected = sorted.find((s) => localTime < s.end) ?? sorted[sorted.length - 1]!;
  const span = Math.max(1e-4, selected.end - selected.start);
  const u = clamp((localTime - selected.start) / span, 0, 1);
  const phase = selected.phaseStart + (selected.phaseEnd - selected.phaseStart) * u;
  const sampled = sampleArmActionPose(side, selected.action, phase);
  return { ...sampled, action: selected.action, phase };
}

/** Builds a continuous rest -> reach -> offer -> hold -> retract -> rest ArmTrack (from `b6_actions.py`). */
export function createOfferTrack(opts: {
  start: number;
  reach?: number;
  offer?: number;
  hold?: number;
  retract?: number;
}): ArmTrackSegment[] {
  const reach = opts.reach ?? 0.25;
  const offer = opts.offer ?? 0.18;
  const hold = opts.hold ?? 0.3;
  const retract = opts.retract ?? 0.32;
  let t = opts.start;
  const segs: ArmTrackSegment[] = [];
  segs.push({ action: "reach", start: t, end: t + reach, phaseStart: 0, phaseEnd: 1 });
  t += reach;
  segs.push({ action: "offer", start: t, end: t + offer, phaseStart: 0, phaseEnd: 1 });
  t += offer;
  if (hold > 0) {
    segs.push({ action: "offer", start: t, end: t + hold, phaseStart: 1, phaseEnd: 1 });
    t += hold;
  }
  segs.push({ action: "retract", start: t, end: t + retract, phaseStart: 0, phaseEnd: 1 });
  return segs;
}

/** Builds a continuous rest -> reach -> receive -> hold -> withdraw -> rest ArmTrack (from `b6_actions.py`). */
export function createReceiveTrack(opts: {
  start: number;
  reach?: number;
  receive?: number;
  hold?: number;
  withdraw?: number;
}): ArmTrackSegment[] {
  const reach = opts.reach ?? 0.25;
  const receive = opts.receive ?? 0.18;
  const hold = opts.hold ?? 0.3;
  const withdraw = opts.withdraw ?? 0.3;
  let t = opts.start;
  const segs: ArmTrackSegment[] = [];
  segs.push({ action: "reach", start: t, end: t + reach, phaseStart: 0, phaseEnd: 1 });
  t += reach;
  segs.push({ action: "receive", start: t, end: t + receive, phaseStart: 0, phaseEnd: 1 });
  t += receive;
  if (hold > 0) {
    segs.push({ action: "receive", start: t, end: t + hold, phaseStart: 1, phaseEnd: 1 });
    t += hold;
  }
  segs.push({ action: "receive", start: t, end: t + withdraw * 0.5, phaseStart: 1, phaseEnd: 0 });
  t += withdraw * 0.5;
  segs.push({ action: "reach", start: t, end: t + withdraw * 0.5, phaseStart: 1, phaseEnd: 0 });
  return segs;
}

/**
 * Evaluates one-shot rigid head reaction nods (ported from `b6_actions.py` `reaction_nod`),
 * returning the summed offset in degrees bounded to `±maxAngleDeg`.
 */
export function evaluateReactionNodsDeg(
  nods: ReactionNod[] | undefined,
  localTime: number,
  maxAngleDeg = 20,
): number {
  if (!nods || nods.length === 0) return 0;
  let totalDeg = 0;
  for (const nod of nods) {
    const end = nod.start + nod.attack + nod.settle;
    if (localTime <= nod.start || localTime >= end) continue;
    const clampedAngle = clamp(nod.angleDeg, -maxAngleDeg, maxAngleDeg);
    if (localTime <= nod.start + nod.attack) {
      totalDeg += clampedAngle * smoothstep01((localTime - nod.start) / Math.max(1e-4, nod.attack));
    } else {
      totalDeg +=
        clampedAngle *
        (1 - smoothstep01((localTime - nod.start - nod.attack) / Math.max(1e-4, nod.settle)));
    }
  }
  return clamp(totalDeg, -maxAngleDeg, maxAngleDeg);
}

/**
 * Clamps a head angle in radians to the rigid neck attachment limit (default ±20° from `b6_puppet.py`).
 */
export function clampRigidHeadRadians(rad: number, maxAngleDeg = 20): number {
  const lim = Math.abs(maxAngleDeg) * DEG2RAD;
  return clamp(rad, -lim, lim);
}

export interface PlantedAnkleResult extends GroundedLegPose {
  /** Whether the requested ankle target sits cleanly within the 92%..108% straight-leg stance envelope. */
  withinEnvelope: boolean;
  /** Ratio of hip-to-ankle distance over nominal leg length. */
  lengthRatio: number;
  reason?: string;
}

/**
 * Planted Ankle IK Solver (ported from `b6_puppet.py` `_validate_head_and_feet`).
 * Keeps feet firmly anchored to explicit target coordinates while torso breathes or leans,
 * validating that apparent leg length stays within [0.92, 1.08] of nominal leg length.
 */
export function solvePlantedAnkleLegIK(opts: {
  hipX: number;
  hipY: number;
  ankleTargetX: number;
  ankleTargetY: number;
  legLen: number;
  bendDir?: 1 | -1;
}): PlantedAnkleResult {
  const { hipX, hipY, ankleTargetX, ankleTargetY, legLen, bendDir = -1 } = opts;
  const dx = ankleTargetX - hipX;
  const dy = ankleTargetY - hipY;
  const dist = Math.hypot(dx, dy);
  const lengthRatio = dist / Math.max(1, legLen);

  let withinEnvelope = true;
  let reason: string | undefined;
  if (lengthRatio < 0.92 || lengthRatio > 1.08) {
    withinEnvelope = false;
    reason = `Planted ankle leg length ratio (${(lengthRatio * 100).toFixed(1)}%) outside 92%–108% stance envelope.`;
  } else if (ankleTargetY <= hipY + legLen * 0.5) {
    withinEnvelope = false;
    reason = `Planted ankle Y (${ankleTargetY.toFixed(1)}) is too close to or above hip Y (${hipY.toFixed(1)}).`;
  }

  const standSpan = Math.max(40, legLen - 14);
  const l1 = standSpan * 0.515;
  const l2 = standSpan * 0.485;
  const solved = solveTwoBoneIK(hipX, hipY, ankleTargetX, ankleTargetY, l1, l2, bendDir, 1.5);
  const footAng = -(solved.a1 + solved.a2) * 0.95;

  return {
    thighAng: solved.a1,
    kneeAng: solved.a2,
    footAng,
    ankleX: solved.ex,
    ankleY: solved.ey,
    withinEnvelope,
    lengthRatio,
    reason,
  };
}
