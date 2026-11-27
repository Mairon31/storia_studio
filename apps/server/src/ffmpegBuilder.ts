import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  ExportSettings,
  Project,
  QUALITY_PRESET_DEFAULTS,
  resolveCanvasDimensions,
  VideoEncoder,
} from "@storia/schema";
import type { SystemCapabilities } from "./system.js";

const execFileAsync = promisify(execFile);

export type ResolvedVideoCodec = "h264_nvenc" | "hevc_nvenc" | "av1_nvenc" | "libx264" | "libx265";

export interface ResolvedEncoderDecision {
  codec: ResolvedVideoCodec;
  isGpu: boolean;
  fallbackReason?: string;
}

/**
 * Resolves the requested encoder against actual runtime FFmpeg hardware capabilities,
 * automatically falling back to CPU (`libx264` / `libx265`) when NVENC is unavailable.
 */
export function resolveVideoEncoder(
  requested: VideoEncoder,
  caps: SystemCapabilities,
): ResolvedEncoderDecision {
  if (requested === "auto") {
    if (caps.encoders.h264_nvenc) {
      return { codec: "h264_nvenc", isGpu: true };
    }
    return { codec: "libx264", isGpu: false, fallbackReason: "h264_nvenc unavailable; using libx264" };
  }

  if (requested === "h264_nvenc") {
    if (caps.encoders.h264_nvenc) return { codec: "h264_nvenc", isGpu: true };
    return { codec: "libx264", isGpu: false, fallbackReason: "h264_nvenc unavailable; fell back to libx264" };
  }
  if (requested === "hevc_nvenc") {
    if (caps.encoders.hevc_nvenc) return { codec: "hevc_nvenc", isGpu: true };
    return { codec: "libx265", isGpu: false, fallbackReason: "hevc_nvenc unavailable; fell back to libx265" };
  }
  if (requested === "av1_nvenc") {
    if (caps.encoders.av1_nvenc) return { codec: "av1_nvenc", isGpu: true };
    return { codec: "libx264", isGpu: false, fallbackReason: "av1_nvenc unavailable; fell back to libx264" };
  }
  if (requested === "libx265") {
    return { codec: "libx265", isGpu: false };
  }
  return { codec: "libx264", isGpu: false };
}

export interface VideoEncodeCommandSpec {
  args: string[];
  width: number;
  height: number;
  fps: number;
  codec: ResolvedVideoCodec;
  isGpu: boolean;
  crf: number;
  audioBitrateKbps: number;
  fallbackReason?: string;
}

/**
 * Builds the exact FFmpeg command line that consumes raw RGBA frames on stdin (`-i -`)
 * and optional mastered WAV audio (`audioWavPath`) to write a faststart MP4.
 */
export function buildVideoFfmpegArgs(params: {
  settings: ExportSettings;
  caps: SystemCapabilities;
  outputMp4Path: string;
  audioWavPath?: string;
}): VideoEncodeCommandSpec {
  const { settings, caps, outputMp4Path, audioWavPath } = params;
  const dims = resolveCanvasDimensions(settings);
  const decision = resolveVideoEncoder(settings.encoder, caps);
  const presetDefaults =
    settings.quality === "custom"
      ? QUALITY_PRESET_DEFAULTS.high
      : QUALITY_PRESET_DEFAULTS[settings.quality];

  const crf = settings.crf ?? presetDefaults.crf;
  const audioBitrateKbps = settings.audioBitrateKbps ?? presetDefaults.audioBitrateKbps;
  const bitrateKbps = settings.videoBitrateKbps;

  const args: string[] = [
    "-y",
    "-v", "error",
    "-f", "rawvideo",
    "-pix_fmt", "rgba",
    "-s", `${dims.width}x${dims.height}`,
    "-r", String(settings.fps),
    "-i", "-",
  ];

  if (audioWavPath) {
    args.push("-i", audioWavPath);
    args.push("-map", "0:v:0", "-map", "1:a:0");
  } else {
    args.push("-map", "0:v:0");
  }

  // Video encoder settings
  if (decision.isGpu) {
    args.push("-c:v", decision.codec, "-preset", presetDefaults.nvencPreset);
    if (bitrateKbps) {
      args.push("-rc", "vbr", "-b:v", `${bitrateKbps}k`, "-maxrate", `${Math.round(bitrateKbps * 1.4)}k`, "-bufsize", `${bitrateKbps * 2}k`);
    } else {
      args.push("-rc", "vbr", "-cq", String(crf), "-b:v", "0");
    }
    args.push("-spatial-aq", "1");
    if (decision.codec === "h264_nvenc" || decision.codec === "hevc_nvenc") {
      args.push("-temporal-aq", "1");
    }
  } else {
    args.push("-c:v", decision.codec, "-preset", presetDefaults.x264Preset);
    if (bitrateKbps) {
      args.push("-b:v", `${bitrateKbps}k`, "-maxrate", `${Math.round(bitrateKbps * 1.4)}k`, "-bufsize", `${bitrateKbps * 2}k`);
    } else {
      args.push("-crf", String(crf));
    }
  }

  args.push("-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709");

  if (audioWavPath) {
    args.push("-c:a", "aac", "-b:a", `${audioBitrateKbps}k`, "-ar", "48000", "-ac", "2", "-shortest");
  }

  args.push("-movflags", "+faststart", outputMp4Path);

  return {
    args,
    width: dims.width,
    height: dims.height,
    fps: settings.fps,
    codec: decision.codec,
    isGpu: decision.isGpu,
    crf,
    audioBitrateKbps,
    fallbackReason: decision.fallbackReason,
  };
}

export interface ProbeResult {
  durationSec: number;
  sizeBytes: number;
  bitRate: number;
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: string;
    pixFmt: string;
  };
  audio?: {
    codec: string;
    sampleRate: number;
    channels: number;
  };
}

/**
 * Probes an exported media file with `ffprobe` to verify stream integrity and metadata.
 */
export async function probeMediaFile(filePath: string): Promise<ProbeResult> {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      filePath,
    ],
    { timeout: 15_000 },
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; size?: string; bit_rate?: string };
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      pix_fmt?: string;
      sample_rate?: string;
      channels?: number;
    }[];
  };

  const vStream = parsed.streams?.find((s) => s.codec_type === "video");
  const aStream = parsed.streams?.find((s) => s.codec_type === "audio");

  return {
    durationSec: Number(parsed.format?.duration ?? 0),
    sizeBytes: Number(parsed.format?.size ?? 0),
    bitRate: Number(parsed.format?.bit_rate ?? 0),
    video: vStream
      ? {
          codec: vStream.codec_name ?? "unknown",
          width: vStream.width ?? 0,
          height: vStream.height ?? 0,
          fps: vStream.r_frame_rate ?? "0/0",
          pixFmt: vStream.pix_fmt ?? "unknown",
        }
      : undefined,
    audio: aStream
      ? {
          codec: aStream.codec_name ?? "unknown",
          sampleRate: Number(aStream.sample_rate ?? 0),
          channels: aStream.channels ?? 0,
        }
      : undefined,
  };
}

function resolveLocalAssetDiskPath(projectDir: string, src: string): string | null {
  if (/^https?:/i.test(src)) return null;
  // Project asset API URL: /api/projects/:id/assets/:filename
  const match = src.match(/\/assets\/([^/?#]+)$/);
  if (match && match[1]) {
    const filename = decodeURIComponent(match[1]);
    return path.resolve(projectDir, "assets", path.basename(filename));
  }
  return path.resolve(projectDir, src);
}

/**
 * Mixes all active multi-track audio clips (voice, music with optional sidechain ducking, sfx, ambience)
 * and runs 2-pass EBU R128 `loudnorm` to target LUFS/True Peak.
 * When no playable audio clips exist, generates a clean silent 48kHz stereo track of exact duration.
 */
export async function renderMasteredAudioWav(params: {
  project: Project;
  projectDir: string;
  durationSec: number;
  startOffsetSec?: number;
  settings: ExportSettings;
  outWavPath: string;
}): Promise<{ hasClips: boolean; loudnormApplied: boolean }> {
  const { project, projectDir, durationSec, settings, outWavPath } = params;
  const startOffsetSec = Math.max(0, params.startOffsetSec ?? 0);
  const fullMixDurationSec = startOffsetSec + durationSec;
  const assetMap = new Map(project.assets.map((a) => [a.id, a]));
  const anySolo = project.audioTracks.some((t) => t.solo);

  interface PlayableClip {
    trackId: string;
    role: string;
    duckUnderTrackId?: string;
    duckAmountDb: number;
    filePath: string;
    start: number;
    duration: number;
    trimStart: number;
    linearGain: number;
    pan: number;
    fadeIn: number;
    fadeOut: number;
    fadeCurve: "linear" | "smooth" | "exp" | "log";
    loop: boolean;
  }

  const playable: PlayableClip[] = [];
  for (const track of project.audioTracks) {
    if (track.muted) continue;
    if (anySolo && !track.solo) continue;
    for (const clip of track.clips) {
      const asset = assetMap.get(clip.assetId);
      if (!asset || asset.kind !== "audio") continue;
      const diskPath = resolveLocalAssetDiskPath(projectDir, asset.src);
      if (!diskPath) continue;
      try {
        await fs.access(diskPath);
      } catch {
        continue;
      }
      const linearGain = Math.pow(10, clip.gainDb / 20) * track.volume;
      playable.push({
        trackId: track.id,
        role: track.role,
        duckUnderTrackId: track.duckUnderTrackId,
        duckAmountDb: track.duckAmountDb,
        filePath: diskPath,
        start: clip.start,
        duration: clip.duration,
        trimStart: clip.trimStart,
        linearGain,
        pan: clip.pan,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        fadeCurve: clip.fadeCurve ?? "smooth",
        loop: clip.loop,
      });
    }
  }

  if (playable.length === 0) {
    await execFileAsync(
      "ffmpeg",
      [
        "-y", "-v", "error",
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000",
        "-t", durationSec.toFixed(4),
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
        outWavPath,
      ],
      { timeout: 30_000 },
    );
    return { hasClips: false, loudnormApplied: false };
  }

  // Group clips by track so sidechain ducking works cleanly at track level
  const trackIds = Array.from(new Set(playable.map((c) => c.trackId)));
  const inputArgs: string[] = [];
  const filterParts: string[] = [];
  const trackClipLabels = new Map<string, string[]>();

  playable.forEach((clip, idx) => {
    if (clip.loop) {
      inputArgs.push("-stream_loop", "-1");
    }
    inputArgs.push("-i", clip.filePath);

    const delayMs = Math.max(0, Math.round(clip.start * 1000));
    const chain: string[] = [
      "aresample=48000",
      "aformat=channel_layouts=stereo",
      `atrim=start=${clip.trimStart.toFixed(4)}:duration=${clip.duration.toFixed(4)}`,
      "asetpts=PTS-STARTPTS",
      `volume=${clip.linearGain.toFixed(4)}`,
    ];
    if (Math.abs(clip.pan) > 0.01) {
      const l = Math.min(1, 1 - clip.pan);
      const r = Math.min(1, 1 + clip.pan);
      chain.push(`pan=stereo|c0=${l.toFixed(3)}*c0|c1=${r.toFixed(3)}*c1`);
    }
    const ffmpegCurve =
      clip.fadeCurve === "linear"
        ? "tri"
        : clip.fadeCurve === "exp"
          ? "exp"
          : clip.fadeCurve === "log"
            ? "log"
            : "hsin";
    if (clip.fadeIn > 0.01) {
      const fi = Math.min(clip.fadeIn, clip.duration * 0.95);
      chain.push(`afade=t=in:st=0:d=${fi.toFixed(3)}:curve=${ffmpegCurve}`);
    }
    if (clip.fadeOut > 0.01) {
      const fo = Math.min(clip.fadeOut, clip.duration * 0.95);
      chain.push(`afade=t=out:st=${Math.max(0, clip.duration - fo).toFixed(3)}:d=${fo.toFixed(3)}:curve=${ffmpegCurve}`);
    }
    if (delayMs > 0) {
      chain.push(`adelay=${delayMs}|${delayMs}`);
    }
    chain.push(
      `apad=whole_dur=${fullMixDurationSec.toFixed(4)}`,
      `atrim=${startOffsetSec.toFixed(4)}:${fullMixDurationSec.toFixed(4)}`,
      "asetpts=PTS-STARTPTS",
    );

    const lbl = `clip_${idx}`;
    filterParts.push(`[${idx}:a]${chain.join(",")}[${lbl}]`);
    const list = trackClipLabels.get(clip.trackId) ?? [];
    list.push(lbl);
    trackClipLabels.set(clip.trackId, list);
  });

  // Mix clips per track
  const trackOutLabel = new Map<string, string>();
  const trackDuckInfo = new Map<string, { under: string; amountDb: number }>();
  for (const tid of trackIds) {
    const sample = playable.find((c) => c.trackId === tid)!;
    if (sample.duckUnderTrackId && trackIds.includes(sample.duckUnderTrackId) && sample.duckUnderTrackId !== tid) {
      trackDuckInfo.set(tid, { under: sample.duckUnderTrackId, amountDb: sample.duckAmountDb });
    }
    const labels = trackClipLabels.get(tid)!;
    const rawLbl = `trk_${tid.replace(/[^a-zA-Z0-9]/g, "_")}`;
    if (labels.length === 1) {
      filterParts.push(`[${labels[0]}]anull[${rawLbl}]`);
    } else {
      filterParts.push(
        `${labels.map((l) => `[${l}]`).join("")}amix=inputs=${labels.length}:duration=first:normalize=0[${rawLbl}]`,
      );
    }
    trackOutLabel.set(tid, rawLbl);
  }

  // Split sidechain trigger tracks if any track ducks under them
  const scUsageCount = new Map<string, number>();
  for (const info of trackDuckInfo.values()) {
    scUsageCount.set(info.under, (scUsageCount.get(info.under) ?? 0) + 1);
  }
  const scQueues = new Map<string, string[]>();
  for (const [triggerTid, count] of scUsageCount.entries()) {
    const srcLbl = trackOutLabel.get(triggerTid)!;
    const outs: string[] = [];
    const mainCopy = `${srcLbl}_main`;
    outs.push(mainCopy);
    const scLabels: string[] = [];
    for (let i = 0; i < count; i++) {
      const scLbl = `${srcLbl}_sc_${i}`;
      outs.push(scLbl);
      scLabels.push(scLbl);
    }
    filterParts.push(`[${srcLbl}]asplit=${outs.length}${outs.map((o) => `[${o}]`).join("")}`);
    trackOutLabel.set(triggerTid, mainCopy);
    scQueues.set(triggerTid, scLabels);
  }

  // Apply sidechaincompress on ducked tracks
  for (const [tid, info] of trackDuckInfo.entries()) {
    const srcLbl = trackOutLabel.get(tid)!;
    const scLbl = scQueues.get(info.under)?.shift();
    if (!scLbl) continue;
    const duckedLbl = `${srcLbl}_ducked`;
    const ratio = Math.max(1.5, Math.min(12, Math.abs(info.amountDb) * 0.45));
    filterParts.push(
      `[${srcLbl}][${scLbl}]sidechaincompress=threshold=0.025:ratio=${ratio.toFixed(2)}:attack=25:release=320:knee=4:makeup=1[${duckedLbl}]`,
    );
    trackOutLabel.set(tid, duckedLbl);
  }

  // Final pre-master bus
  const finalTrackLabels = trackIds.map((tid) => trackOutLabel.get(tid)!);
  if (finalTrackLabels.length === 1) {
    filterParts.push(`[${finalTrackLabels[0]}]atrim=0:${durationSec.toFixed(4)},asetpts=PTS-STARTPTS[premix]`);
  } else {
    filterParts.push(
      `${finalTrackLabels.map((l) => `[${l}]`).join("")}amix=inputs=${finalTrackLabels.length}:duration=first:normalize=0,atrim=0:${durationSec.toFixed(4)},asetpts=PTS-STARTPTS[premix]`,
    );
  }

  const preMixWav = `${outWavPath}.premix.wav`;
  await execFileAsync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      ...inputArgs,
      "-filter_complex", filterParts.join(";"),
      "-map", "[premix]",
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_f32le",
      preMixWav,
    ],
    { timeout: 120_000 },
  );

  // Two-pass linear EBU R128 loudnorm
  const targetI = settings.loudnessLufs;
  const targetTp = settings.truePeakDbtp;
  let loudnormApplied = false;
  try {
    const pass1 = await execFileAsync(
      "ffmpeg",
      [
        "-v", "info",
        "-i", preMixWav,
        "-af", `loudnorm=I=${targetI}:TP=${targetTp}:LRA=11:print_format=json`,
        "-f", "null", "-",
      ],
      { timeout: 60_000 },
    );
    const jsonMatch = pass1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
    if (jsonMatch) {
      const m = JSON.parse(jsonMatch[0]) as Record<string, string>;
      if (m.input_i && m.input_i !== "-inf") {
        const af2 =
          `loudnorm=I=${targetI}:TP=${targetTp}:LRA=11:` +
          `measured_I=${m.input_i}:measured_TP=${m.input_tp}:` +
          `measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:` +
          `offset=${m.target_offset}:linear=true`;
        await execFileAsync(
          "ffmpeg",
          [
            "-y", "-v", "error",
            "-i", preMixWav,
            "-af", af2,
            "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
            outWavPath,
          ],
          { timeout: 60_000 },
        );
        loudnormApplied = true;
      }
    }
  } catch {
    loudnormApplied = false;
  }

  if (!loudnormApplied) {
    await execFileAsync(
      "ffmpeg",
      ["-y", "-v", "error", "-i", preMixWav, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", outWavPath],
      { timeout: 30_000 },
    );
  }

  await fs.rm(preMixWav, { force: true }).catch(() => {});
  return { hasClips: true, loudnormApplied };
}
