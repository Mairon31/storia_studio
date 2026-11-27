import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import {
  CharacterDefinitionSchema,
  FacialHairStyleSchema,
  HairStyleSchema,
  HatStyleSchema,
  OutfitStyleSchema,
  PantsStyleSchema,
} from "@storia/schema";
import {
  clampRigidHeadRadians,
  computeVolumeSquash,
  createOfferTrack,
  createReceiveTrack,
  evaluateArmTrack,
  evaluateContinuousInkArm,
  evaluateReactionNodsDeg,
  lerpAngle,
  renderProceduralCharacter,
  resolveCharacterPoseAt,
  solveBoundedArmIK,
  solveGroundedLegIK,
  solvePendulumSway,
  solvePlantedAnkleLegIK,
  solveTwoBoneIK,
  wrapRadians,
} from "../index.js";

describe("@storia/renderer — 2D Kinematics (IK, Grounded Legs, Verlet Pendulum, Squash) & Expanded Character Rig", () => {
  it("solves analytical 2-bone IK accurately within reach and applies exponential softness near full extension", () => {
    const res = solveTwoBoneIK(0, 0, 50, 90, 70, 70, 1, 0);
    expect(Math.hypot(res.ex - 50, res.ey - 90)).toBeLessThan(1e-3);
    expect(Math.hypot(res.jx, res.jy)).toBeCloseTo(70, 3);
    expect(Math.hypot(res.ex - res.jx, res.ey - res.jy)).toBeCloseTo(70, 3);

    // Beyond full extension with softness: stays strictly below l1+l2 without NaN or popping
    const soft = solveTwoBoneIK(0, 0, 0, 220, 70, 70, 1, 8);
    expect(Number.isFinite(soft.a1)).toBe(true);
    expect(Number.isFinite(soft.a2)).toBe(true);
    expect(Math.hypot(soft.ex, soft.ey)).toBeLessThan(140);
  });

  it("wraps and interpolates angles along the shortest arc without 360-degree flips", () => {
    expect(wrapRadians(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2, 5);
    const mid = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(wrapRadians(mid))).toBeCloseTo(Math.PI, 4);
  });

  it("grounds feet on y = -12 during stance and lifts smoothly during swing without sinking", () => {
    const stance = solveGroundedLegIK({
      hipX: 20,
      hipY: -224,
      legLen: 224,
      sideIndex: 0,
      walkCycle: Math.PI, // cos(PI) = -1 -> stance
      walkWeight: 0.8,
      runWeight: 0,
      sitWeight: 0,
      kneelWeight: 0,
      danceWeight: 0,
      globalTime: 1.0,
      phaseOffset: 0,
    });
    expect(stance.ankleY).toBeGreaterThan(-25);
    expect(stance.ankleY).toBeLessThanOrEqual(-5);

    const swing = solveGroundedLegIK({
      hipX: 20,
      hipY: -224,
      legLen: 224,
      sideIndex: 0,
      walkCycle: 0, // cos(0) = +1 -> swing lift
      walkWeight: 0.8,
      runWeight: 0.5,
      sitWeight: 0,
      kneelWeight: 0,
      danceWeight: 0,
      globalTime: 1.0,
      phaseOffset: 0,
    });
    expect(swing.ankleY).toBeLessThan(stance.ankleY - 10);
  });

  it("computes deterministic pendulum secondary motion and volume-preserving squash & stretch", () => {
    const s1 = solvePendulumSway({
      timeSec: 1.5,
      phaseOffset: 0.4,
      walkCycle: 3.1,
      walkWeight: 0.8,
      runWeight: 0.6,
      danceWeight: 0,
      headTilt: 0.05,
      torsoTilt: 0.1,
      strength: 1,
    });
    const s2 = solvePendulumSway({
      timeSec: 1.5,
      phaseOffset: 0.4,
      walkCycle: 3.1,
      walkWeight: 0.8,
      runWeight: 0.6,
      danceWeight: 0,
      headTilt: 0.05,
      torsoTilt: 0.1,
      strength: 1,
    });
    expect(s1).toEqual(s2);
    expect(Math.abs(s1.swayX)).toBeGreaterThan(0);

    const sq = computeVolumeSquash({
      walkCycle: 0.5,
      walkWeight: 0.7,
      runWeight: 0.5,
      danceWeight: 0,
      breathe: 0.01,
      shockOrCelebrate: 0,
    });
    expect(sq.scaleX * sq.scaleX * sq.scaleY).toBeCloseTo(1, 5);
  });

  it("tracks activePose through poseCues and renders all expanded hair, facial hair, hats, and outfits cleanly", () => {
    expect(HairStyleSchema.options.length).toBe(26);
    expect(FacialHairStyleSchema.options.length).toBe(12);
    expect(HatStyleSchema.options.length).toBe(30);
    expect(OutfitStyleSchema.options.length).toBe(12);
    expect(PantsStyleSchema.options.length).toBe(6);

    const def = CharacterDefinitionSchema.parse({
      id: "hero_expanded",
      name: "Comandante",
      genderPresentation: "masculine",
      hairStyle: "pompadour",
      accessories: {
        glasses: "sunglasses",
        hat: "cowboy_hat",
        facialHair: "handlebar",
      },
      wardrobe: {
        outfitStyle: "leather_jacket",
        pantsStyle: "jeans",
        shirtPattern: "plaid",
        secondaryMotion: 1.2,
      },
    });

    const layer = {
      id: "char_test_1",
      name: "Comandante",
      type: "character" as const,
      characterId: def.id,
      start: 0,
      visible: true,
      locked: false,
      zIndex: 20,
      parallaxDepth: 1,
      blendMode: "normal" as const,
      transform: { x: 0.5, y: 0.85, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchor: { x: 0.5, y: 1 }, flipX: false, flipY: false },
      keyframes: {},
      pose: "idle" as const,
      expression: "happy" as const,
      poseCues: [{ t: 1.0, pose: "think" as const, blendDuration: 0.3 }],
      expressionCues: [],
      boneOverrides: {},
      lookAtPoint: { x: 0.8, y: 0.4 },
      talkWindows: [[0.5, 2.0] as [number, number]],
      silhouette: false,
      autoWalkOnMove: true,
      scaleMode: "linear" as const,
    };

    const resolved = resolveCharacterPoseAt(layer, 1.5);
    expect(resolved.activePose).toBe("think");
    expect(resolved.sit ?? 0).toBeGreaterThanOrEqual(0);
    expect(resolved.sit ?? 0).toBeLessThanOrEqual(1);

    const host = new Container();
    renderProceduralCharacter(host, def, layer, 1.5, 1.5, 0.4, false, "storia_editorial");
    expect(host.children.length).toBeGreaterThan(0);

    // Also test a feminine character with new layered hair + tiara + kimono + pleated skirt
    const femaleDef = CharacterDefinitionSchema.parse({
      id: "heroine_expanded",
      name: "Hana",
      genderPresentation: "feminine",
      hairStyle: "long_layered",
      accessories: { glasses: "none", hat: "tiara", facialHair: "none" },
      wardrobe: { outfitStyle: "kimono", pantsStyle: "pleated_skirt", skirt: true, hairBow: true },
    });
    renderProceduralCharacter(host, femaleDef, layer, 1.5, 1.5, 0.2, true, "storia_editorial");
    expect(host.children.length).toBeGreaterThan(0);
  });

  it("enforces bounded 2-bone arm IK, continuous ink-path geometry, and 3-second continuous ArmTrack transitions without elbow flips or opposite-arm drift", () => {
    // 1. Bounded IK: reachable target vs unreachable target
    const okIk = solveBoundedArmIK({
      shoulderX: 46,
      shoulderY: -136,
      targetX: 110,
      targetY: -60,
      l1: 80,
      l2: 74,
      constraints: { pole: -1, upperAngleRangeDeg: [-165, 165], elbowBendRangeDeg: [4, 152], maxIkOffset: 180 },
    });
    expect(okIk.reachable).toBe(true);
    expect(Math.hypot(okIk.ex - 110, okIk.ey - -60)).toBeLessThan(1.5);

    const outOfReach = solveBoundedArmIK({
      shoulderX: 46,
      shoulderY: -136,
      targetX: 420,
      targetY: -136,
      l1: 80,
      l2: 74,
    });
    expect(outOfReach.reachable).toBe(false);
    expect(outOfReach.reason).toContain("outside permitted reach");

    // 2. Continuous ink path geometry (no chord folding, valid arclength)
    const ink = evaluateContinuousInkArm({
      rootX: 46,
      rootY: -136,
      elbowX: okIk.jx,
      elbowY: okIk.jy,
      wristX: okIk.ex,
      wristY: okIk.ey,
      reach: 154,
      sag: 12,
    });
    expect(ink.valid).toBe(true);
    expect(ink.points.length).toBeGreaterThanOrEqual(20);
    expect(ink.arclength).toBeLessThanOrEqual(154 * 1.12 + 1e-2);

    // 3. 3-second 30fps simulation: right arm runs offerTrack (rest -> reach -> offer -> hold -> retract -> rest)
    const offerSegs = createOfferTrack({ start: 0.4, reach: 0.45, offer: 0.35, hold: 0.6, retract: 0.6 });
    const receiveSegs = createReceiveTrack({ start: 0.4, reach: 0.45, receive: 0.35, hold: 0.5, withdraw: 0.6 });
    expect(offerSegs.length).toBe(4);
    expect(receiveSegs.length).toBe(5);

    const ua = 80;
    const fa = 74;
    let prevWrist: { x: number; y: number } | null = null;
    for (let f = 0; f <= 90; f++) {
      const t = f / 30;
      const sample = evaluateArmTrack("right", offerSegs, t)!;
      expect(sample).not.toBeNull();
      // Fixed pole: right elbow bend stays negative (never flips sign)
      expect(sample.a2).toBeLessThan(0);
      const wx = Math.sin(sample.a1) * ua + Math.sin(sample.a1 + sample.a2) * fa;
      const wy = Math.cos(sample.a1) * ua + Math.cos(sample.a1 + sample.a2) * fa;
      if (prevWrist) {
        const step = Math.hypot(wx - prevWrist.x, wy - prevWrist.y);
        expect(step).toBeLessThan(ua * 0.25); // smooth, zero teleports
      }
      prevWrist = { x: wx, y: wy };
    }
  });

  it("enforces rigid ±20° neck attachment, reaction nods, planted ankles (92%–108%), and renders continuous_ink + contactProp", () => {
    // Rigid head clamp at ±20°
    const clamped = clampRigidHeadRadians((45 * Math.PI) / 180, 20);
    expect((clamped * 180) / Math.PI).toBeCloseTo(20, 4);

    // Reaction nod peaks smoothly and returns to 0
    const nods = [{ start: 1.0, attack: 0.2, settle: 0.3, angleDeg: 8 }];
    expect(evaluateReactionNodsDeg(nods, 0.5)).toBe(0);
    expect(evaluateReactionNodsDeg(nods, 1.2)).toBeCloseTo(8, 3);
    expect(evaluateReactionNodsDeg(nods, 1.6)).toBe(0);

    // Planted ankles within 92%–108% envelope vs overstretched
    const goodAnkle = solvePlantedAnkleLegIK({
      hipX: 20,
      hipY: -224,
      ankleTargetX: 24,
      ankleTargetY: -12,
      legLen: 224,
    });
    expect(goodAnkle.withinEnvelope).toBe(true);
    expect(goodAnkle.lengthRatio).toBeGreaterThanOrEqual(0.92);
    expect(goodAnkle.lengthRatio).toBeLessThanOrEqual(1.08);

    const badAnkle = solvePlantedAnkleLegIK({
      hipX: 20,
      hipY: -224,
      ankleTargetX: 220,
      ankleTargetY: -12,
      legLen: 224,
    });
    expect(badAnkle.withinEnvelope).toBe(false);

    // Render full rig with continuous_ink arms, armTracks, reactionNods, ankleTargets & contactProp
    const def = CharacterDefinitionSchema.parse({
      id: "hero_b6_hybrid",
      name: "Protagonista",
      rigProfile: {
        armRenderMode: "continuous_ink",
        inkSag: 14,
        neckAttachment: { anchorOffsetY: -10, maxAngleDeg: 20, maxDegPerFrame: 7, rigidScale: true },
      },
    });
    const layer = {
      id: "char_b6",
      name: "Protagonista",
      type: "character" as const,
      characterId: def.id,
      start: 0,
      visible: true,
      locked: false,
      zIndex: 20,
      parallaxDepth: 1,
      blendMode: "normal" as const,
      transform: { x: 0.5, y: 0.85, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchor: { x: 0.5, y: 1 }, flipX: false, flipY: false },
      keyframes: {},
      pose: "idle" as const,
      expression: "happy" as const,
      poseCues: [],
      expressionCues: [],
      boneOverrides: {},
      armTracks: { right: createOfferTrack({ start: 0.2, reach: 0.3, offer: 0.25, hold: 0.4, retract: 0.35 }) },
      ankleTargets: { left: { x: -20, y: -12 }, right: { x: 22, y: -12 } },
      headAngleDeg: 6,
      reactionNods: nods,
      frontLimbParts: ["right_forearm" as const],
      contactProp: { state: "owner" as const, holderArm: "right" as const, widthNorm: 0.16, offsetX: 8, offsetY: -4, rotationDeg: 10 },
      talkWindows: [],
      silhouette: false,
      autoWalkOnMove: true,
      scaleMode: "linear" as const,
    };

    const host = new Container();
    renderProceduralCharacter(host, def, layer, 0.8, 0.8, 0, false, "storia_editorial");
    expect(host.children.length).toBeGreaterThan(0);
  });
});
