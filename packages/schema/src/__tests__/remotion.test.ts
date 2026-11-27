import { describe, expect, it } from "vitest";
import {
  createTikTokStyleCaptions,
  evaluateEasing,
  evaluateKeyframes,
  importSubtitlesTextToCues,
  interpolate,
  interpolateColors,
  measureSpring,
  noise2D,
  noise3D,
  parseSrtCaptions,
  parseVttCaptions,
  rechunkSubtitleCuesToTikTok,
  seededRandom,
  spring,
  SPRING_PRESETS,
} from "../index.js";

describe("@storia/schema — Remotion Math (spring, interpolate, colors, Simplex noise) & Captions (SRT/VTT/TikTok)", () => {
  it("computes analytical spring physics, measureSpring natural duration, and physical easing presets", () => {
    const start = spring({ frame: 0, fps: 30, config: SPRING_PRESETS.bouncy });
    const mid = spring({ frame: 10, fps: 30, config: SPRING_PRESETS.bouncy });
    const end = spring({ frame: 60, fps: 30, config: SPRING_PRESETS.bouncy });
    expect(start).toBe(0);
    expect(mid).toBeGreaterThan(0.5);
    expect(end).toBeCloseTo(1, 2);

    const dur = measureSpring({ fps: 30, config: SPRING_PRESETS.snappy });
    expect(dur).toBeGreaterThan(5);
    expect(dur).toBeLessThan(90);

    // Overshoot clamping prevents going above 1.0
    for (let f = 0; f <= 40; f++) {
      const val = spring({
        frame: f,
        fps: 30,
        config: { damping: 6, stiffness: 180, mass: 1, overshootClamping: true },
      });
      expect(val).toBeLessThanOrEqual(1.0001);
    }

    // Physical keyframe easings work smoothly via evaluateKeyframes
    const kSmooth = evaluateEasing(0.5, "springSmooth");
    const kBouncy = evaluateEasing(0.4, "springBouncy");
    expect(kSmooth).toBeGreaterThan(0.3);
    expect(kBouncy).toBeGreaterThan(0.4);

    const kfVal = evaluateKeyframes(
      [
        { t: 0, value: 0, easing: "springSnappy" },
        { t: 1, value: 100, easing: "linear" },
      ],
      0.5,
      0,
    );
    expect(kfVal).toBeGreaterThan(60);
  });

  it("interpolates multi-segment numbers and colors deterministically with clamp/extend modes", () => {
    expect(interpolate(5, [0, 10, 20], [0, 100, 0])).toBeCloseTo(50, 5);
    expect(interpolate(15, [0, 10, 20], [0, 100, 0])).toBeCloseTo(50, 5);
    expect(interpolate(-5, [0, 10], [0, 100], { extrapolateLeft: "clamp" })).toBe(0);
    expect(interpolate(15, [0, 10], [0, 100], { extrapolateRight: "extend" })).toBe(150);

    expect(interpolateColors(0, [0, 1], ["#000000", "#ffffff"])).toBe("#000000");
    expect(interpolateColors(0.5, [0, 1], ["#000000", "#ffffff"])).toBe("#808080");
    expect(interpolateColors(1, [0, 1], ["#ff0000", "#0000ff"])).toBe("#0000ff");
  });

  it("generates deterministic seeded random and smooth 2D/3D Simplex noise within [-1, 1]", () => {
    expect(seededRandom("storia-42")).toBe(seededRandom("storia-42"));
    expect(seededRandom("storia-42")).not.toBe(seededRandom("storia-43"));

    const a = noise2D("cam-seed", 1.25, 0.5);
    const b = noise2D("cam-seed", 1.25, 0.5);
    const c = noise2D("cam-seed", 1.27, 0.5);
    expect(a).toBe(b);
    expect(Math.abs(a)).toBeLessThanOrEqual(1);
    expect(Math.abs(a - c)).toBeLessThan(0.15);

    const n3 = noise3D("cam-3d", 0.4, 0.8, 1.2);
    expect(n3).toBe(noise3D("cam-3d", 0.4, 0.8, 1.2));
    expect(Math.abs(n3)).toBeLessThanOrEqual(1);
  });

  it("parses SRT and WebVTT captions, paginates TikTok style with silence breaks, and re-chunks existing cues", () => {
    const sampleSrt = [
      "1",
      "00:00:00,000 --> 00:00:02,000",
      "Hola mundo desde Storia Studio",
      "",
      "2",
      "00:00:03,000 --> 00:00:04,500",
      "Animación profesional en vivo",
      "",
    ].join("\n");

    const srtCaps = parseSrtCaptions(sampleSrt);
    expect(srtCaps).toHaveLength(2);
    expect(srtCaps[0]!.startMs).toBe(0);
    expect(srtCaps[1]!.startMs).toBe(3000);

    const importedSrt = importSubtitlesTextToCues(sampleSrt, {
      tiktokMode: true,
      combineTokensWithinMs: 1200,
      breakOnSilenceAfterMs: 400,
      maxWordsPerPage: 3,
    });
    expect(importedSrt.format).toBe("srt");
    expect(importedSrt.cues.length).toBeGreaterThanOrEqual(2);
    expect(importedSrt.cues.every((c) => c.words.length > 0 && c.words.length <= 3)).toBe(true);

    const sampleVtt = [
      "WEBVTT",
      "",
      "NOTE Comment ignored",
      "",
      "00:00.200 --> 00:01.800",
      "<b>Subtítulos</b> &amp; ritmo",
      "",
    ].join("\n");
    const vttCaps = parseVttCaptions(sampleVtt);
    expect(vttCaps).toHaveLength(1);
    expect(vttCaps[0]!.text).toBe("Subtítulos & ritmo");

    // Direct createTikTokStyleCaptions silence break test
    const { pages } = createTikTokStyleCaptions({
      captions: [
        { text: " Uno", startMs: 0, endMs: 250, timestampMs: 125, confidence: 1 },
        { text: " dos", startMs: 260, endMs: 500, timestampMs: 380, confidence: 1 },
        { text: " tres", startMs: 1300, endMs: 1600, timestampMs: 1450, confidence: 1 },
      ],
      combineTokensWithinMilliseconds: 2000,
      breakOnSilenceAfterMilliseconds: 500,
    });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toBe("Uno dos");
    expect(pages[1]!.text).toBe("tres");

    // Re-chunk existing cues preserving word emphasis
    const original = importedSrt.cues;
    original[0]!.words[0]!.emphasis = "accent";
    const rechunked = rechunkSubtitleCuesToTikTok(original, { maxWordsPerPage: 2 });
    expect(rechunked.length).toBeGreaterThanOrEqual(original.length);
    expect(rechunked[0]!.words[0]!.emphasis).toBe("accent");
  });
});
