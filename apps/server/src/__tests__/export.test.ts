import { describe, expect, it } from "vitest";
import { createDemoProject, ExportSettingsSchema } from "@storia/schema";
import { buildVideoFfmpegArgs, resolveVideoEncoder } from "../ffmpegBuilder.js";
import { generateSrt, generateVtt } from "../subtitlesExport.js";
import type { SystemCapabilities } from "../system.js";

const GPU_CAPS: SystemCapabilities = {
  platform: "linux x64",
  cpus: 16,
  totalMemGb: 32,
  nodeVersion: "v22.22.1",
  ffmpegVersion: "ffmpeg version 8.0.1",
  encoders: {
    h264_nvenc: true,
    hevc_nvenc: true,
    av1_nvenc: true,
    libx264: true,
  },
  recommendedEncoder: "h264_nvenc",
};

const CPU_ONLY_CAPS: SystemCapabilities = {
  ...GPU_CAPS,
  encoders: {
    h264_nvenc: false,
    hevc_nvenc: false,
    av1_nvenc: false,
    libx264: true,
  },
  recommendedEncoder: "libx264",
};

describe("@storia/server — ffmpegBuilder & subtitlesExport", () => {
  it("selects NVENC on GPU systems and falls back cleanly to CPU libx264/libx265 when unavailable", () => {
    expect(resolveVideoEncoder("auto", GPU_CAPS)).toEqual({ codec: "h264_nvenc", isGpu: true });
    expect(resolveVideoEncoder("hevc_nvenc", GPU_CAPS)).toEqual({ codec: "hevc_nvenc", isGpu: true });
    expect(resolveVideoEncoder("av1_nvenc", GPU_CAPS)).toEqual({ codec: "av1_nvenc", isGpu: true });

    const autoFallback = resolveVideoEncoder("auto", CPU_ONLY_CAPS);
    expect(autoFallback.codec).toBe("libx264");
    expect(autoFallback.isGpu).toBe(false);
    expect(autoFallback.fallbackReason).toBeTruthy();

    const hevcFallback = resolveVideoEncoder("hevc_nvenc", CPU_ONLY_CAPS);
    expect(hevcFallback.codec).toBe("libx265");
    expect(hevcFallback.isGpu).toBe(false);
  });

  it("builds valid FFmpeg arguments for 4K 60fps NVENC with audio and custom bitrate", () => {
    const settings = ExportSettingsSchema.parse({
      aspectRatio: "9:16",
      resolution: "4k",
      fps: 60,
      quality: "master",
      encoder: "h264_nvenc",
      audioBitrateKbps: 320,
    });
    const spec = buildVideoFfmpegArgs({
      settings,
      caps: GPU_CAPS,
      outputMp4Path: "/tmp/out.mp4",
      audioWavPath: "/tmp/audio.wav",
    });

    expect(spec.width).toBe(2160);
    expect(spec.height).toBe(3840);
    expect(spec.codec).toBe("h264_nvenc");
    expect(spec.isGpu).toBe(true);
    expect(spec.args).toContain("2160x3840");
    expect(spec.args).toContain("60");
    expect(spec.args).toContain("h264_nvenc");
    expect(spec.args).toContain("-cq");
    expect(spec.args).toContain("13");
    expect(spec.args).toContain("+faststart");
    expect(spec.args).toContain("320k");
  });

  it("supports custom dimensions and custom video bitrate on CPU fallback", () => {
    const settings = ExportSettingsSchema.parse({
      aspectRatio: "custom",
      resolution: "custom",
      customWidth: 1281,
      customHeight: 721,
      fps: 24,
      quality: "custom",
      videoBitrateKbps: 6000,
      encoder: "h264_nvenc",
    });
    const spec = buildVideoFfmpegArgs({
      settings,
      caps: CPU_ONLY_CAPS,
      outputMp4Path: "/tmp/custom.mp4",
    });

    expect(spec.width).toBe(1282);
    expect(spec.height).toBe(722);
    expect(spec.codec).toBe("libx264");
    expect(spec.args).toContain("6000k");
    expect(spec.args).not.toContain("-crf");
  });

  it("generates valid SRT and VTT subtitle files from a project SubtitleTrack", () => {
    const demo = createDemoProject();
    const srt = generateSrt(demo.subtitles);
    expect(srt).toContain("1\n00:00:00,300 --> 00:00:04,100");
    expect(srt).toContain("IMAGINA PODER VIAJAR AL PASADO Y CAMBIAR UN INSTANTE.");
    expect(srt).toContain("2\n00:00:04,800 --> 00:00:08,600");

    const vtt = generateVtt(demo.subtitles);
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
    expect(vtt).toContain("00:00:00.300 --> 00:00:04.100");
  });
});
