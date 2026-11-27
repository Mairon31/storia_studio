import { describe, expect, it } from "vitest";
import {
  applyProjectOperation,
  applyProjectOperations,
  createDemoProject,
  evaluateEasing,
  evaluateKeyframes,
  getProjectDuration,
  importLegacyStoriaManifest,
  ProjectSchema,
  resolveCanvasDimensions,
  resolveSafeZones,
  resolveSceneAtTime,
} from "../index.js";

describe("@storia/schema — primitives & canvas resolution", () => {
  it("resolves exact even dimensions across 9:16, 16:9, 1:1, and custom presets", () => {
    expect(resolveCanvasDimensions({ aspectRatio: "9:16", resolution: "360p" })).toMatchObject({ width: 360, height: 640 });
    expect(resolveCanvasDimensions({ aspectRatio: "9:16", resolution: "1080p" })).toMatchObject({ width: 1080, height: 1920 });
    expect(resolveCanvasDimensions({ aspectRatio: "9:16", resolution: "2k" })).toMatchObject({ width: 1440, height: 2560 });
    expect(resolveCanvasDimensions({ aspectRatio: "9:16", resolution: "4k" })).toMatchObject({ width: 2160, height: 3840 });
    expect(resolveCanvasDimensions({ aspectRatio: "16:9", resolution: "4k" })).toMatchObject({ width: 3840, height: 2160 });
    expect(resolveCanvasDimensions({ aspectRatio: "1:1", resolution: "1080p" })).toMatchObject({ width: 1080, height: 1080 });
    expect(resolveCanvasDimensions({ aspectRatio: "custom", resolution: "custom", customWidth: 1001, customHeight: 777 }))
      .toMatchObject({ width: 1002, height: 778 });
  });

  it("returns calibrated safe zones per aspect ratio", () => {
    expect(resolveSafeZones("9:16")).toHaveLength(2);
    expect(resolveSafeZones("16:9")[0]?.label).toContain("Broadcast");
    expect(resolveSafeZones("1:1")[0]?.label).toContain("Square");
  });
});

describe("@storia/schema — keyframes & easing evaluation", () => {
  it("evaluates linear, step, spring, and cubicBezier curves deterministically", () => {
    expect(evaluateEasing(0.5, "linear")).toBeCloseTo(0.5, 5);
    expect(evaluateEasing(0.99, "step")).toBe(0);
    expect(evaluateEasing(1.0, "step")).toBe(1);
    expect(evaluateEasing(0, "cubicBezier", [0.25, 0.1, 0.25, 1])).toBe(0);
    expect(evaluateEasing(1, "cubicBezier", [0.25, 0.1, 0.25, 1])).toBe(1);
    expect(evaluateEasing(0.5, "spring")).toBeGreaterThan(0.5);
  });

  it("interpolates unsorted keyframes and clamps boundary values", () => {
    const keys = [
      { t: 2, value: 1.5, easing: "linear" as const },
      { t: 0, value: 1.0, easing: "linear" as const },
    ];
    expect(evaluateKeyframes(keys, -1, 0)).toBe(1.0);
    expect(evaluateKeyframes(keys, 1, 0)).toBeCloseTo(1.25, 5);
    expect(evaluateKeyframes(keys, 5, 0)).toBe(1.5);
    expect(evaluateKeyframes([], 1, 42)).toBe(42);
  });
});

describe("@storia/schema — project validation & atomic operations", () => {
  it("creates a valid demo project with normalized coordinates and computes timeline lookup", () => {
    const demo = createDemoProject();
    expect(() => ProjectSchema.parse(demo)).not.toThrow();
    expect(getProjectDuration(demo)).toBeCloseTo(12.0, 5);

    const mid = resolveSceneAtTime(demo, 5.2);
    expect(mid?.scene.id).toBe("scene_02_memory");
    expect(mid?.localTime).toBeCloseTo(0.7, 5);
  });

  it("applies atomic operations for canvas, layers, keyframes, and word-level subtitles", () => {
    const base = createDemoProject();
    const updated = applyProjectOperations(base, [
      { op: "canvas.update", patch: { aspectRatio: "16:9", resolution: "4k", fps: 60 } },
      {
        op: "layer.add",
        sceneId: "scene_01_hook",
        layer: {
          id: "pixel_watch_sprite",
          type: "sprite",
          name: "Reloj Pixel Art",
          proceduralProp: "pocket_watch",
          widthNorm: 0.28,
          scaleMode: "nearest",
          pixelSnap: true,
          start: 0,
          visible: true,
          locked: false,
          zIndex: 12,
          parallaxDepth: 1.0,
          blendMode: "normal",
          transform: { x: 0.5, y: 0.45, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
          keyframes: {},
          bobAmplitude: 0.01,
          bobSpeed: 1.2,
        },
      },
      {
        op: "keyframe.upsert",
        sceneId: "scene_01_hook",
        layerId: "pixel_watch_sprite",
        property: "rotation",
        keyframe: { t: 0, value: -8, easing: "easeInOut" },
      },
      {
        op: "keyframe.upsert",
        sceneId: "scene_01_hook",
        layerId: "pixel_watch_sprite",
        property: "rotation",
        keyframe: { t: 2.0, value: 8, easing: "easeInOut" },
      },
      {
        op: "subtitle.updateStyle",
        patch: { fontFamily: "Space Grotesk", strokeWidth: 10, activeWordColor: "#f7c8d6" },
      },
      {
        op: "subtitle.updateWord",
        cueId: "cue_01",
        wordId: "w_05",
        patch: { text: "PASADO", emphasis: "alert" },
      },
    ]);

    expect(updated.canvas.aspectRatio).toBe("16:9");
    expect(updated.canvas.resolution).toBe("4k");
    expect(updated.canvas.fps).toBe(60);

    const sprite = updated.scenes[0]?.layers.find((l) => l.id === "pixel_watch_sprite");
    expect(sprite?.type).toBe("sprite");
    expect(sprite?.keyframes.rotation).toHaveLength(2);

    expect(updated.subtitles.style.fontFamily).toBe("Space Grotesk");
    const word = updated.subtitles.cues[0]?.words.find((w) => w.id === "w_05");
    expect(word?.text).toBe("PASADO");
    expect(word?.emphasis).toBe("alert");
  });

  it("prevents removing the last scene and rejects invalid hex colors", () => {
    const base = createDemoProject();
    const oneScene = applyProjectOperations(base, [
      { op: "scene.remove", sceneId: "scene_02_memory" },
      { op: "scene.remove", sceneId: "scene_03_outro" },
    ]);
    expect(() => applyProjectOperation(oneScene, { op: "scene.remove", sceneId: "scene_01_hook" })).toThrow();
    expect(() =>
      applyProjectOperation(base, {
        op: "canvas.update",
        patch: { backgroundColor: "not-a-color" as unknown as string },
      }),
    ).toThrow();
  });

  it("imports a legacy Storia v5.x manifest into normalized Storia Studio coordinates", () => {
    const imported = importLegacyStoriaManifest({
      project: "Episodum Video14 Test",
      aspect_ratio: "9:16",
      resolution: "4k",
      fps: 30,
      gpu: true,
      cast: {
        protagonist: { role: "formal", hair_col: "1c191a", shirt: "eef0f2" },
      },
      shots: [
        {
          t0: 0,
          t1: 6,
          beats: [
            { dur: 3, bg: { sprite: "bg_01" }, chars: [{ name: "protagonist", x: 540, y: 1536, scale: 1.1 }] },
            { dur: 3, bg: { type: "living_room" }, chars: [] },
          ],
        },
      ],
    });
    expect(imported.scenes).toHaveLength(2);
    expect(imported.exportSettings.encoder).toBe("h264_nvenc");
    const charLayer = imported.scenes[0]?.layers.find((l) => l.type === "character");
    expect(charLayer?.transform.x).toBeCloseTo(0.5, 3);
    expect(charLayer?.transform.y).toBeCloseTo(0.8, 3);
  });
});
