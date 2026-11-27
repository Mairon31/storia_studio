import { describe, expect, it } from "vitest";
import {
  ActiveWordEffectSchema,
  applyProjectOperations,
  createDemoProject,
  EffectClipTypeSchema,
  KeywordFxSchema,
  LayerEnterAnimSchema,
  LayerExitAnimSchema,
  LayerLoopMotionSchema,
  SUBTITLE_STYLE_PRESETS,
  SubtitleAnimationSchema,
  SubtitleOverlayStyleSchema,
  SubtitleStyleSchema,
  SubtitleVfxInSchema,
  SubtitleVfxOutSchema,
  TransitionTypeSchema,
} from "../index.js";

describe("@storia/schema — CapCut-Grade Subtitle Presets, Expanded +30 Catalogs & Markers", () => {
  it("provides 36+ valid CapCut-grade subtitle style presets across all categories", () => {
    expect(SUBTITLE_STYLE_PRESETS.length).toBeGreaterThanOrEqual(36);
    const ids = new Set<string>();
    for (const preset of SUBTITLE_STYLE_PRESETS) {
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
      const parsed = SubtitleStyleSchema.parse(preset.style);
      expect(parsed.presetId).toBe(preset.id);
      expect(preset.sampleWords).toHaveLength(3);
    }
  });

  it("exposes rich +30 catalogs across subtitle animations/FX/VFX, transitions, layer motions, and video effects", () => {
    expect(SubtitleAnimationSchema.options.length).toBeGreaterThanOrEqual(34);
    expect(ActiveWordEffectSchema.options.length).toBeGreaterThanOrEqual(20);
    expect(KeywordFxSchema.options.length).toBeGreaterThanOrEqual(15);
    expect(SubtitleOverlayStyleSchema.options.length).toBeGreaterThanOrEqual(19);
    expect(SubtitleVfxInSchema.options.length + SubtitleVfxOutSchema.options.length).toBeGreaterThanOrEqual(30);
    expect(TransitionTypeSchema.options.length).toBeGreaterThanOrEqual(36);
    expect(EffectClipTypeSchema.options.length).toBeGreaterThanOrEqual(45);
    expect(LayerEnterAnimSchema.options.length).toBeGreaterThanOrEqual(30);
    expect(LayerExitAnimSchema.options.length).toBeGreaterThanOrEqual(18);
    expect(LayerLoopMotionSchema.options.length).toBeGreaterThanOrEqual(18);
  });

  it("supports applying subtitle style globally vs individually per cue and clearing overrides", () => {
    const base = createDemoProject("capcut-sub-test");
    const firstCue = base.subtitles.cues[0]!;
    const presetA = SUBTITLE_STYLE_PRESETS[0]!;
    const presetB = SUBTITLE_STYLE_PRESETS[1]!;

    // Apply presetA to all
    const afterAll = applyProjectOperations(base, [
      {
        op: "subtitle.applyStyleToAll",
        patch: presetA.style as Record<string, unknown>,
        clearCueOverrides: true,
      },
    ]);
    expect(afterAll.subtitles.style.presetId).toBe(presetA.id);
    expect(afterAll.subtitles.cues[0]!.styleOverride).toBeUndefined();

    // Override only the first cue with presetB
    const afterIndividual = applyProjectOperations(afterAll, [
      {
        op: "subtitle.updateCueStyle",
        cueId: firstCue.id,
        patch: presetB.style as Record<string, unknown>,
      },
    ]);
    expect(afterIndividual.subtitles.style.presetId).toBe(presetA.id);
    expect(afterIndividual.subtitles.cues[0]!.styleOverride?.presetId).toBe(presetB.id);

    // Clear override back to global
    const afterReset = applyProjectOperations(afterIndividual, [
      { op: "subtitle.updateCueStyle", cueId: firstCue.id, patch: null },
    ]);
    expect(afterReset.subtitles.cues[0]!.styleOverride).toBeUndefined();
  });

  it("supports timeline marker upsert and removal", () => {
    const base = createDemoProject("marker-test");
    const withMarkers = applyProjectOperations(base, [
      { op: "marker.upsert", marker: { id: "m2", t: 3.5, label: "Drop", color: "#ffd447" } },
      { op: "marker.upsert", marker: { id: "m1", t: 1.2, label: "Hook", color: "#4ce6c8" } },
    ]);
    expect(withMarkers.markers).toHaveLength(2);
    expect(withMarkers.markers[0]!.id).toBe("m1");

    const afterRemove = applyProjectOperations(withMarkers, [
      { op: "marker.remove", markerId: "m1" },
    ]);
    expect(afterRemove.markers).toHaveLength(1);
    expect(afterRemove.markers[0]!.id).toBe("m2");
  });
});
