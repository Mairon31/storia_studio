import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getHeadlessBrowser } from "./chromium.js";

const execFileAsync = promisify(execFile);

export interface SilenceRegion {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface AudioAnalysisReport {
  filePath: string;
  fileSizeBytes: number;
  durationSec: number;
  sampleRateHz: number | null;
  channels: number | null;
  codec: string | null;
  bitrateKbps: number | null;
  integratedLufs: number | null;
  truePeakDbtp: number | null;
  loudnessRangeLu: number | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  clippingDetected: boolean;
  leadingSilenceSec: number;
  trailingSilenceSec: number;
  silenceCount: number;
  silences: SilenceRegion[];
  qualityFlags: string[];
}

/**
 * Runs deep studio audio inspection via ffprobe + FFmpeg (ebur128/loudnorm, volumedetect, silencedetect).
 */
export async function analyzeAudioFile(filePath: string): Promise<AudioAnalysisReport> {
  const st = await fs.stat(filePath);

  // 1. ffprobe stream metadata
  let durationSec = 0;
  let sampleRateHz: number | null = null;
  let channels: number | null = null;
  let codec: string | null = null;
  let bitrateKbps: number | null = null;

  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration,bit_rate:stream=codec_name,sample_rate,channels,codec_type",
        "-of", "json",
        filePath,
      ],
      { timeout: 20_000 },
    );
    const parsed = JSON.parse(stdout) as {
      format?: { duration?: string; bit_rate?: string };
      streams?: { codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number }[];
    };
    const audioStream = (parsed.streams ?? []).find((s) => s.codec_type === "audio") ?? parsed.streams?.[0];
    if (parsed.format?.duration && Number.isFinite(Number(parsed.format.duration))) {
      durationSec = Number(Number(parsed.format.duration).toFixed(3));
    }
    if (parsed.format?.bit_rate && Number.isFinite(Number(parsed.format.bit_rate))) {
      bitrateKbps = Math.round(Number(parsed.format.bit_rate) / 1000);
    }
    if (audioStream) {
      codec = audioStream.codec_name ?? null;
      sampleRateHz = audioStream.sample_rate ? Number(audioStream.sample_rate) : null;
      channels = typeof audioStream.channels === "number" ? audioStream.channels : null;
    }
  } catch {
    // Fallback gracefully if ffprobe fails
  }

  // 2. Single-pass FFmpeg loudnorm + volumedetect + silencedetect
  let integratedLufs: number | null = null;
  let truePeakDbtp: number | null = null;
  let loudnessRangeLu: number | null = null;
  let meanVolumeDb: number | null = null;
  let maxVolumeDb: number | null = null;
  const silences: SilenceRegion[] = [];

  try {
    const { stderr } = await execFileAsync(
      "ffmpeg",
      [
        "-v", "info",
        "-i", filePath,
        "-af", "silencedetect=noise=-42dB:d=0.22,volumedetect,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
      ],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );

    const loudMatch = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
    if (loudMatch) {
      try {
        const stats = JSON.parse(loudMatch[0]) as Record<string, string>;
        const iVal = Number(stats.input_i);
        const tpVal = Number(stats.input_tp);
        const lraVal = Number(stats.input_lra);
        if (Number.isFinite(iVal)) integratedLufs = Number(iVal.toFixed(2));
        if (Number.isFinite(tpVal)) truePeakDbtp = Number(tpVal.toFixed(2));
        if (Number.isFinite(lraVal)) loudnessRangeLu = Number(lraVal.toFixed(2));
      } catch {
        // Ignore malformed JSON
      }
    }

    const meanMatch = stderr.match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
    const maxMatch = stderr.match(/max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
    if (meanMatch?.[1]) meanVolumeDb = Number(Number(meanMatch[1]).toFixed(2));
    if (maxMatch?.[1]) maxVolumeDb = Number(Number(maxMatch[1]).toFixed(2));

    let pendingStart: number | null = null;
    for (const line of stderr.split(/\r?\n/)) {
      const startM = line.match(/silence_start:\s*(\d+(?:\.\d+)?)/);
      if (startM?.[1]) {
        pendingStart = Number(startM[1]);
        continue;
      }
      const endM = line.match(/silence_end:\s*(\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(\d+(?:\.\d+)?)/);
      if (endM?.[1] && endM?.[2]) {
        const end = Number(endM[1]);
        const dur = Number(endM[2]);
        const start = pendingStart !== null ? pendingStart : Math.max(0, end - dur);
        silences.push({
          startSec: Number(start.toFixed(3)),
          endSec: Number(end.toFixed(3)),
          durationSec: Number(dur.toFixed(3)),
        });
        pendingStart = null;
      }
    }
    if (pendingStart !== null && durationSec > pendingStart) {
      silences.push({
        startSec: Number(pendingStart.toFixed(3)),
        endSec: durationSec,
        durationSec: Number((durationSec - pendingStart).toFixed(3)),
      });
    }
  } catch {
    // Non-fatal
  }

  const leadingSilenceSec =
    silences.length > 0 && silences[0]!.startSec <= 0.08 ? silences[0]!.durationSec : 0;
  const lastSilence = silences[silences.length - 1];
  const trailingSilenceSec =
    lastSilence && durationSec > 0 && Math.abs(lastSilence.endSec - durationSec) <= 0.12
      ? lastSilence.durationSec
      : 0;

  const clippingDetected =
    (truePeakDbtp !== null && truePeakDbtp >= -0.2) ||
    (maxVolumeDb !== null && maxVolumeDb >= -0.1);

  const qualityFlags: string[] = [];
  if (durationSec < 0.15) qualityFlags.push("very_short_audio");
  if (clippingDetected) qualityFlags.push("clipping_risk_peak_near_0dB");
  if (integratedLufs !== null && integratedLufs < -24) qualityFlags.push("too_quiet_below_-24_LUFS");
  if (integratedLufs !== null && integratedLufs > -11) qualityFlags.push("too_loud_above_-11_LUFS");
  if (leadingSilenceSec > 0.35) qualityFlags.push("long_leading_silence");
  if (trailingSilenceSec > 0.5) qualityFlags.push("long_trailing_silence");
  if (sampleRateHz !== null && sampleRateHz < 22050) qualityFlags.push("low_sample_rate");

  return {
    filePath,
    fileSizeBytes: st.size,
    durationSec,
    sampleRateHz,
    channels,
    codec,
    bitrateKbps,
    integratedLufs,
    truePeakDbtp,
    loudnessRangeLu,
    meanVolumeDb,
    maxVolumeDb,
    clippingDetected,
    leadingSilenceSec: Number(leadingSilenceSec.toFixed(3)),
    trailingSilenceSec: Number(trailingSilenceSec.toFixed(3)),
    silenceCount: silences.length,
    silences: silences.slice(0, 40),
    qualityFlags,
  };
}

export type ImageEnhanceAction =
  | "upscale_pixel_nearest"
  | "sharpen"
  | "auto_contrast"
  | "resize"
  | "warm_grade"
  | "cool_grade"
  | "grayscale"
  | "remove_bg_chroma";

export async function probeImageDimensions(
  filePath: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath],
      { timeout: 15_000 },
    );
    const parsed = JSON.parse(stdout) as { streams?: { width?: number; height?: number }[] };
    const s = parsed.streams?.[0];
    if (s?.width && s?.height) return { width: s.width, height: s.height };
  } catch {
    // Ignore
  }
  return null;
}

export async function enhanceImageWithFfmpeg(params: {
  inputPath: string;
  outPath: string;
  action: ImageEnhanceAction;
  scaleFactor?: number;
  width?: number;
  height?: number;
  chromaColor?: string;
  chromaSimilarity?: number;
}): Promise<{ width: number; height: number }> {
  const { inputPath, outPath, action } = params;
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  let vf = "";
  switch (action) {
    case "upscale_pixel_nearest": {
      const factor = Math.max(2, Math.min(8, Math.round(params.scaleFactor ?? 4)));
      vf = `scale=iw*${factor}:ih*${factor}:flags=neighbor`;
      break;
    }
    case "sharpen":
      vf = "unsharp=5:5:0.9:5:5:0.0";
      break;
    case "auto_contrast":
      vf = "eq=contrast=1.12:saturation=1.12:brightness=0.015";
      break;
    case "resize": {
      const w = params.width ? Math.max(16, Math.min(4096, Math.round(params.width))) : -1;
      const h = params.height ? Math.max(16, Math.min(4096, Math.round(params.height))) : -1;
      vf = `scale=${w}:${h}:flags=lanczos`;
      break;
    }
    case "warm_grade":
      vf = "colorbalance=rs=0.08:gs=0.02:bs=-0.08,eq=saturation=1.1:contrast=1.05";
      break;
    case "cool_grade":
      vf = "colorbalance=rs=-0.07:gs=0.01:bs=0.09,eq=saturation=1.06:contrast=1.05";
      break;
    case "grayscale":
      vf = "format=rgba,hue=s=0";
      break;
    case "remove_bg_chroma": {
      const hex = (params.chromaColor ?? "#ffffff").replace(/^#/, "0x");
      const sim = Math.max(0.01, Math.min(0.5, params.chromaSimilarity ?? 0.14));
      vf = `format=rgba,colorkey=${hex}:${sim}:0.06`;
      break;
    }
  }

  await execFileAsync(
    "ffmpeg",
    ["-y", "-v", "error", "-i", inputPath, "-vf", vf, "-frames:v", "1", outPath],
    { timeout: 30_000 },
  );

  const dims = (await probeImageDimensions(outPath)) ?? { width: 0, height: 0 };
  return dims;
}

export function enhanceSvgMarkup(
  rawSvg: string,
  opts: {
    colorMap?: Record<string, string>;
    strokeScale?: number;
    ensureViewBox?: boolean;
    defaultWidth?: number;
    defaultHeight?: number;
    minify?: boolean;
  },
): { svgCode: string; replacements: number; viewBox: string | null } {
  let code = rawSvg.trim();
  let replacements = 0;

  // Strip dangerous scripts/handlers
  code = code
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:xlink:)?href\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");

  // Color palette remapping (case-insensitive hex or named color replacement)
  if (opts.colorMap) {
    for (const [fromColor, toColor] of Object.entries(opts.colorMap)) {
      if (!fromColor || !toColor) continue;
      const escaped = fromColor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(escaped, "gi");
      const matches = code.match(re);
      if (matches && matches.length > 0) {
        replacements += matches.length;
        code = code.replace(re, toColor);
      }
    }
  }

  // Scale stroke-width attributes proportionally
  if (opts.strokeScale !== undefined && Math.abs(opts.strokeScale - 1) > 1e-3) {
    const k = Math.max(0.1, Math.min(10, opts.strokeScale));
    code = code.replace(/stroke-width\s*=\s*(["'])(\d+(?:\.\d+)?)\1/gi, (_m, q, num) => {
      replacements += 1;
      const scaled = Number((Number(num) * k).toFixed(2));
      return `stroke-width=${q}${scaled}${q}`;
    });
    code = code.replace(/stroke-width\s*:\s*(\d+(?:\.\d+)?)(px)?/gi, (_m, num, unit) => {
      replacements += 1;
      const scaled = Number((Number(num) * k).toFixed(2));
      return `stroke-width:${scaled}${unit ?? ""}`;
    });
  }

  // Ensure viewBox exists so PixiJS scales cleanly
  let viewBoxMatch = code.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (!viewBoxMatch && opts.ensureViewBox !== false) {
    const wm = code.match(/<svg[^>]*\bwidth\s*=\s*["'](\d+(?:\.\d+)?)/i);
    const hm = code.match(/<svg[^>]*\bheight\s*=\s*["'](\d+(?:\.\d+)?)/i);
    const w = wm?.[1] ? Number(wm[1]) : (opts.defaultWidth ?? 512);
    const h = hm?.[1] ? Number(hm[1]) : (opts.defaultHeight ?? 512);
    code = code.replace(/<svg\b/i, `<svg viewBox="0 0 ${w} ${h}"`);
    viewBoxMatch = code.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    replacements += 1;
  }

  if (opts.minify) {
    code = code
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/>\s+</g, "><")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return {
    svgCode: code,
    replacements,
    viewBox: viewBoxMatch?.[1] ?? null,
  };
}

export interface RasterizedVisualResult {
  pngBuffer: Buffer;
  pngDataUrl: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  opaqueCoverageRatio: number;
}

/**
 * Renders any SVG markup or raster image buffer onto a clean PNG preview canvas using headless Chromium,
 * allowing AI agents to visually inspect SVGs, pixel-art sprites, and library vectors before or after editing.
 */
export async function rasterizeVisualToPng(params: {
  buffer: Buffer;
  mimeType: string;
  maxSize?: number;
  background?: "checkerboard" | "dark" | "light" | "transparent";
  pixelated?: boolean;
}): Promise<RasterizedVisualResult> {
  const maxSize = Math.max(128, Math.min(1600, Math.round(params.maxSize ?? 640)));
  const background = params.background ?? "checkerboard";
  const pixelated = Boolean(params.pixelated);
  const dataUrl = `data:${params.mimeType};base64,${params.buffer.toString("base64")}`;

  const browser = await getHeadlessBrowser();
  const page = await browser.newPage({
    viewport: { width: maxSize, height: maxSize },
    deviceScaleFactor: 1,
  });

  try {
    await page.setContent("<!doctype html><html><body style='margin:0;background:transparent;'></body></html>");
    const rendered = await page.evaluate(
      async ({ srcUrl, maxDim, bg, nearest }) => {
        const img = new Image();
        img.decoding = "sync";
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error("Failed to decode visual asset in headless renderer"));
          img.src = srcUrl;
        });

        const natW = Math.max(1, img.naturalWidth || img.width || 512);
        const natH = Math.max(1, img.naturalHeight || img.height || 512);
        const scale = Math.min(maxDim / natW, maxDim / natH);
        const outW = Math.max(64, Math.min(maxDim, Math.round(natW * scale)));
        const outH = Math.max(64, Math.min(maxDim, Math.round(natH * scale)));

        // Measure opaque coverage on transparent canvas first
        const probeCanvas = document.createElement("canvas");
        probeCanvas.width = Math.min(256, outW);
        probeCanvas.height = Math.min(256, outH);
        const pctx = probeCanvas.getContext("2d")!;
        pctx.imageSmoothingEnabled = !nearest;
        pctx.drawImage(img, 0, 0, probeCanvas.width, probeCanvas.height);
        const pdata = pctx.getImageData(0, 0, probeCanvas.width, probeCanvas.height).data;
        let opaque = 0;
        const total = probeCanvas.width * probeCanvas.height;
        for (let i = 3; i < pdata.length; i += 4) {
          if (pdata[i]! > 16) opaque++;
        }

        // Draw final preview canvas
        const canvas = document.createElement("canvas");
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext("2d")!;

        if (bg === "dark") {
          ctx.fillStyle = "#101420";
          ctx.fillRect(0, 0, outW, outH);
        } else if (bg === "light") {
          ctx.fillStyle = "#f4f6fa";
          ctx.fillRect(0, 0, outW, outH);
        } else if (bg === "checkerboard") {
          const cell = 16;
          for (let y = 0; y < outH; y += cell) {
            for (let x = 0; x < outW; x += cell) {
              ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? "#1f2433" : "#2a3145";
              ctx.fillRect(x, y, cell, cell);
            }
          }
        }

        ctx.imageSmoothingEnabled = !nearest;
        ctx.drawImage(img, 0, 0, outW, outH);

        return {
          pngDataUrl: canvas.toDataURL("image/png"),
          width: outW,
          height: outH,
          naturalWidth: natW,
          naturalHeight: natH,
          opaqueCoverageRatio: Number((opaque / Math.max(1, total)).toFixed(3)),
        };
      },
      { srcUrl: dataUrl, maxDim: maxSize, bg: background, nearest: pixelated },
    );

    const base64 = rendered.pngDataUrl.replace(/^data:image\/png;base64,/, "");
    return {
      ...rendered,
      pngBuffer: Buffer.from(base64, "base64"),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Composites multiple PNG frames into a single labeled contact sheet PNG via headless Chromium Canvas.
 */
export async function composeContactSheetPng(
  frames: { pngDataUrl: string; label: string; sublabel?: string }[],
  opts?: { columns?: number; padding?: number },
): Promise<{ pngBuffer: Buffer; pngDataUrl: string; width: number; height: number }> {
  if (frames.length === 0) {
    throw new Error("No frames provided for contact sheet");
  }
  const columns = Math.max(1, Math.min(4, opts?.columns ?? (frames.length <= 2 ? frames.length : frames.length <= 6 ? 3 : 4)));
  const padding = opts?.padding ?? 12;

  const browser = await getHeadlessBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1280 }, deviceScaleFactor: 1 });

  try {
    await page.setContent("<!doctype html><html><body style='margin:0;background:#0a0d16;'></body></html>");
    const result = await page.evaluate(
      async ({ items, cols, pad }) => {
        const imgs = await Promise.all(
          items.map(
            (item) =>
              new Promise<{ img: HTMLImageElement; label: string; sublabel?: string }>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ img, label: item.label, sublabel: item.sublabel });
                img.onerror = () => reject(new Error(`Failed to decode contact sheet frame ${item.label}`));
                img.src = item.pngDataUrl;
              }),
          ),
        );

        const cellW = Math.max(120, imgs[0]!.img.naturalWidth || 360);
        const cellH = Math.max(120, imgs[0]!.img.naturalHeight || 640);
        const labelH = 34;
        const rows = Math.ceil(imgs.length / cols);
        const totalW = pad + cols * (cellW + pad);
        const totalH = pad + rows * (cellH + labelH + pad);

        const canvas = document.createElement("canvas");
        canvas.width = totalW;
        canvas.height = totalH;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#0b0f1a";
        ctx.fillRect(0, 0, totalW, totalH);

        imgs.forEach(({ img, label, sublabel }, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          const x = pad + col * (cellW + pad);
          const y = pad + row * (cellH + labelH + pad);

          ctx.fillStyle = "#141a2b";
          ctx.fillRect(x, y, cellW, cellH + labelH);
          ctx.drawImage(img, x, y, cellW, cellH);

          // Label footer bar
          ctx.fillStyle = "#0f1422";
          ctx.fillRect(x, y + cellH, cellW, labelH);
          ctx.strokeStyle = "#2b3654";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, cellW, cellH + labelH);

          ctx.fillStyle = "#ffd447";
          ctx.font = "bold 14px sans-serif";
          ctx.fillText(label, x + 8, y + cellH + 15);
          if (sublabel) {
            ctx.fillStyle = "#cbd5e1";
            ctx.font = "11px sans-serif";
            ctx.fillText(sublabel.slice(0, 38), x + 8, y + cellH + 29);
          }
        });

        return {
          pngDataUrl: canvas.toDataURL("image/png"),
          width: totalW,
          height: totalH,
        };
      },
      { items: frames, cols: columns, pad: padding },
    );

    const base64 = result.pngDataUrl.replace(/^data:image\/png;base64,/, "");
    return {
      ...result,
      pngBuffer: Buffer.from(base64, "base64"),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

export interface ExportedVideoInspection {
  filePath: string;
  fileSizeBytes: number;
  durationSec: number;
  width: number;
  height: number;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  videoBitrateKbps: number | null;
  audioAnalysis: AudioAnalysisReport | null;
  frames: { timestampSec: number; pngDataUrl: string; width: number; height: number }[];
}

/**
 * Inspects an actual rendered MP4 file on disk: ffprobe metadata, EBU R128 loudness, and PNG frame grabs.
 */
export async function inspectMp4Video(
  mp4Path: string,
  opts?: { timestamps?: number[]; maxWidth?: number },
): Promise<ExportedVideoInspection> {
  const st = await fs.stat(mp4Path);
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", mp4Path],
    { timeout: 20_000 },
  );
  const probe = JSON.parse(stdout) as {
    format?: { duration?: string; bit_rate?: string };
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
      bit_rate?: string;
    }[];
  };

  const vStream = (probe.streams ?? []).find((s) => s.codec_type === "video");
  const aStream = (probe.streams ?? []).find((s) => s.codec_type === "audio");
  const durationSec = Number(Number(probe.format?.duration ?? 0).toFixed(3));
  let fps: number | null = null;
  if (vStream?.r_frame_rate) {
    const [n, d] = vStream.r_frame_rate.split("/").map(Number);
    if (n && d) fps = Number((n / d).toFixed(2));
  }

  let audioAnalysis: AudioAnalysisReport | null = null;
  if (aStream) {
    audioAnalysis = await analyzeAudioFile(mp4Path).catch(() => null);
  }

  const requestedTs =
    opts?.timestamps && opts.timestamps.length > 0
      ? opts.timestamps.slice(0, 6)
      : durationSec > 0.5
        ? [
            Number(Math.min(0.4, durationSec * 0.1).toFixed(2)),
            Number((durationSec * 0.5).toFixed(2)),
            Number(Math.max(0, durationSec - 0.35).toFixed(2)),
          ]
        : [0];

  const maxWidth = Math.max(160, Math.min(1080, Math.round(opts?.maxWidth ?? 480)));
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-mp4-inspect-"));
  const frames: { timestampSec: number; pngDataUrl: string; width: number; height: number }[] = [];

  try {
    for (let i = 0; i < requestedTs.length; i++) {
      const ts = Math.max(0, Math.min(Math.max(0, durationSec - 0.05), requestedTs[i]!));
      const outPng = path.join(tmpDir, `f_${i}.png`);
      await execFileAsync(
        "ffmpeg",
        [
          "-y", "-v", "error",
          "-ss", ts.toFixed(3),
          "-i", mp4Path,
          "-frames:v", "1",
          "-vf", `scale='min(${maxWidth},iw)':-2`,
          outPng,
        ],
        { timeout: 25_000 },
      );
      const buf = await fs.readFile(outPng);
      const dims = (await probeImageDimensions(outPng)) ?? {
        width: vStream?.width ?? maxWidth,
        height: vStream?.height ?? maxWidth,
      };
      frames.push({
        timestampSec: Number(ts.toFixed(2)),
        pngDataUrl: `data:image/png;base64,${buf.toString("base64")}`,
        width: dims.width,
        height: dims.height,
      });
    }
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  return {
    filePath: mp4Path,
    fileSizeBytes: st.size,
    durationSec,
    width: vStream?.width ?? 0,
    height: vStream?.height ?? 0,
    fps,
    videoCodec: vStream?.codec_name ?? null,
    audioCodec: aStream?.codec_name ?? null,
    videoBitrateKbps: vStream?.bit_rate
      ? Math.round(Number(vStream.bit_rate) / 1000)
      : probe.format?.bit_rate
        ? Math.round(Number(probe.format.bit_rate) / 1000)
        : null,
    audioAnalysis,
    frames,
  };
}

export interface PythonEnvDiagnostics {
  pythonBin: string | null;
  pythonVersion: string | null;
  modules: Record<string, { installed: boolean; version?: string; error?: string }>;
}

export async function checkPythonEnvironment(): Promise<PythonEnvDiagnostics> {
  const candidates = process.platform === "win32" ? ["python"] : ["python3", "python.exe"];
  const probeScript = `
import json, sys
out = {"version": sys.version.split()[0], "modules": {}}
for name in ("faster_whisper", "kokoro_onnx", "piper", "onnxruntime", "numpy", "soundfile", "av"):
    try:
        m = __import__(name)
        out["modules"][name] = {"installed": True, "version": str(getattr(m, "__version__", "ok"))}
    except Exception as e:
        out["modules"][name] = {"installed": False, "error": f"{type(e).__name__}: {e}"}
print(json.dumps(out))
`;

  let best: PythonEnvDiagnostics = { pythonBin: null, pythonVersion: null, modules: {} };
  let bestScore = -1;

  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, ["-c", probeScript], { timeout: 10_000 });
      const parsed = JSON.parse(stdout.trim().split(/\r?\n/).pop() || "{}") as {
        version?: string;
        modules?: Record<string, { installed: boolean; version?: string; error?: string }>;
      };
      const mods = parsed.modules ?? {};
      const score = Object.values(mods).filter((m) => m.installed).length;
      if (score > bestScore) {
        bestScore = score;
        best = {
          pythonBin: bin,
          pythonVersion: parsed.version ?? null,
          modules: mods,
        };
      }
    } catch {
      // Candidate not available
    }
  }

  return best;
}
