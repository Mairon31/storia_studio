import { describe, expect, it } from "vitest";
import { applyProjectOperation, createDemoProject } from "@storia/schema";
import {
  evaluateSceneFrame,
  getStyleRenderProfile,
  isStylizedCharacterMode,
  resolveCharacterExpressionAt,
  resolveCharacterPoseAt,
  resolvePostFxUniforms,
  SHADER_PRESET_PLUGINS,
} from "../index.js";

describe("@storia/renderer — deterministic evaluator & modular shader presets", () => {
  it("evaluates active scene, keyframed character position, velocity, and camera zoom deterministically", () => {
    const demo = createDemoProject();
    const f0 = evaluateSceneFrame(demo, 0.7);
    expect(f0).not.toBeNull();
    expect(f0!.scene.id).toBe("scene_01_hook");
    expect(f0!.camera.zoom).toBeGreaterThan(1.0);

    const charEl = f0!.layers.find((l) => l.layer.id === "char_layer_01");
    expect(charEl).toBeDefined();
    expect(charEl!.transform.x).toBeGreaterThan(0.22);
    expect(charEl!.transform.x).toBeLessThan(0.38);
    expect(charEl!.speedNormPerSec).toBeGreaterThan(0.05);
  });

  it("evaluates active word-level subtitle window accurately across time", () => {
    const demo = createDemoProject();
    const f = evaluateSceneFrame(demo, 2.1);
    expect(f?.subtitle).not.toBeNull();
    expect(f?.subtitle?.activeWordId).toBe("w_05");
    expect(f?.subtitle?.windowWords.map((w) => w.text)).toEqual(["al", "pasado", "y"]);
  });

  it("blends articulated character pose and expression cues cleanly", () => {
    const demo = createDemoProject();
    const charLayer = demo.scenes[0]!.layers.find((l) => l.type === "character");
    expect(charLayer?.type).toBe("character");
    if (charLayer && charLayer.type === "character") {
      const before = resolveCharacterPoseAt(charLayer, 1.0);
      const mid = resolveCharacterPoseAt(charLayer, 2.35);
      const after = resolveCharacterPoseAt(charLayer, 3.0);
      expect(mid.fa1).not.toBe(before.fa1);
      expect(after.activePose).toBe("shock");
      expect(after.fa1).toBeGreaterThan(0.5);
      expect(after.ba1).toBeLessThan(-0.5);

      const expAfter = resolveCharacterExpressionAt(charLayer, 3.0);
      expect(expAfter.gasp).toBe(true);
    }
  });

  it("resolves modular shader uniforms for PSX, Pixel Art, Cinematic, and Noir presets", () => {
    expect(Object.keys(SHADER_PRESET_PLUGINS)).toEqual(
      expect.arrayContaining(["clean", "psx", "pixel_art", "cinematic", "noir"]),
    );

    const demo = createDemoProject();
    const psxProj = applyProjectOperation(demo, {
      op: "postProcessing.update",
      patch: { preset: "psx" },
    });
    const uPsx = resolvePostFxUniforms(psxProj.postProcessing);
    expect(uPsx.pixelateOn).toBe(1);
    expect(uPsx.virtualHeight).toBe(240);
    expect(uPsx.colorLevels).toBe(31);
    expect(uPsx.scanlines).toBeGreaterThan(0);

    const pixProj = applyProjectOperation(demo, {
      op: "postProcessing.update",
      patch: { preset: "pixel_art" },
    });
    const uPix = resolvePostFxUniforms(pixProj.postProcessing);
    expect(uPix.pixelateOn).toBe(1);
    expect(uPix.virtualHeight).toBe(270);
    expect(uPix.scanlines).toBe(0);
  });

  it("applies full-pipeline visual render profiles for 3D Clay, Kurzgesagt, Anime Cel, Retro PSX, Paper Cutout, and Pixel Theater", () => {
    const demo = createDemoProject();

    // 1. Pixel Theater forces nearest sampling, full-stage pixel shader & pixel_theater character mode
    const pixelProj = applyProjectOperation(demo, {
      op: "project.applyAnimationStyle",
      styleId: "b7_pixel_theater",
      updateBackgrounds: true,
      updateSubtitles: true,
      updateTransitions: true,
    });
    expect(pixelProj.canvas.pixelGrid.enabled).toBe(true);
    const pixProfile = getStyleRenderProfile(pixelProj.animationStyle);
    expect(pixProfile.forceNearestSampling).toBe(true);
    expect(pixProfile.applyPostFxToHudAndSubtitles).toBe(true);
    expect(isStylizedCharacterMode("pixel_theater")).toBe(true);
    const pixUniforms = resolvePostFxUniforms(pixelProj.postProcessing, 0, [], { styleShader: pixProfile.shader });
    expect(pixUniforms.pixelateOn).toBe(1);
    expect(pixUniforms.virtualHeight).toBe(270);

    // 2. Retro PSX 1998 forces 240p Bayer dithering + scanlines + NTSC bleed across full stage
    const psxProj = applyProjectOperation(demo, {
      op: "project.applyAnimationStyle",
      styleId: "c4_retro_psx",
      updateBackgrounds: true,
      updateSubtitles: true,
      updateTransitions: true,
    });
    const psxProfile = getStyleRenderProfile(psxProj.animationStyle);
    expect(psxProfile.forceNearestSampling).toBe(true);
    expect(psxProfile.applyPostFxToHudAndSubtitles).toBe(true);
    expect(isStylizedCharacterMode("retro_psx")).toBe(true);
    const psxUniforms = resolvePostFxUniforms(psxProj.postProcessing, 0, [], { styleShader: psxProfile.shader });
    expect(psxUniforms.pixelateOn).toBe(1);
    expect(psxUniforms.virtualHeight).toBe(240);
    expect(psxUniforms.scanlines).toBeGreaterThan(0.15);

    // 3. 3D Clay, Kurzgesagt, Anime Cel, and Paper Cutout resolve dedicated treatments & shader uniforms
    const p3d = getStyleRenderProfile("c1_stylized_3d");
    expect(p3d.shapeTreatment).toBe("stylized_3d");
    expect(p3d.textTreatment).toBe("extrude_3d");
    expect(isStylizedCharacterMode("stylized_3d")).toBe(true);

    const pKz = getStyleRenderProfile("c2_kurzgesagt");
    expect(pKz.shapeTreatment).toBe("kurzgesagt");
    expect(pKz.spriteTreatment).toBe("kurzgesagt");
    expect(isStylizedCharacterMode("kurzgesagt")).toBe(true);

    const pAnime = getStyleRenderProfile("c3_anime_cel");
    expect(pAnime.shapeTreatment).toBe("anime_cel");
    expect(isStylizedCharacterMode("anime_cel")).toBe(true);

    const pPaper = getStyleRenderProfile("c5_paper_cutout");
    expect(pPaper.spriteTreatment).toBe("paper_cutout");
    expect(pPaper.applyPostFxToHudAndSubtitles).toBe(true);
    const paperUniforms = resolvePostFxUniforms(demo.postProcessing, 0, [], { styleShader: pPaper.shader });
    expect(paperUniforms.paperStrength).toBeGreaterThan(0.2);
  });
});
