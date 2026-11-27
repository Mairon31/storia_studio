import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SubtitleCue, SubtitleCueSchema, TransitionSfxPreset } from "@storia/schema";
import { probeAudioDurationSec } from "./libraries.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSCRIBE_SCRIPT = path.resolve(__dirname, "../../../scripts/transcribe_audio.py");

export type AudioProcessAction =
  | "denoise"
  | "voice_enhance"
  | "normalize"
  | "trim_silence"
  | "deess_warm"
  | "fade_clean";

function toWindowsPathIfWsl(p: string): string {
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m && m[1] && m[2] !== undefined) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
  }
  return p;
}

async function resolveWhisperPython(): Promise<{ bin: string; translatePaths: boolean }> {
  if (process.platform === "win32") {
    return { bin: "python", translatePaths: false };
  }
  // Check if Linux python3 has faster_whisper
  try {
    await execFileAsync("python3", ["-c", "import faster_whisper"], { timeout: 5_000 });
    return { bin: "python3", translatePaths: false };
  } catch {
    // Under WSL2, fall back to Windows python.exe where faster_whisper is installed
    try {
      await execFileAsync("python.exe", ["-c", "import faster_whisper"], { timeout: 8_000 });
      return { bin: "python.exe", translatePaths: true };
    } catch {
      return { bin: "python3", translatePaths: false };
    }
  }
}

export interface TranscribeResult {
  language: string;
  durationSec: number;
  cues: SubtitleCue[];
}

/**
 * Runs local Faster-Whisper ASR on a voice audio file and returns validated
 * word-level SubtitleCue blocks ready to insert into `project.subtitles.cues`.
 */
export async function transcribeAudioFileToCues(params: {
  audioFilePath: string;
  language?: string;
  model?: string;
  clipStartOffsetSec?: number;
}): Promise<TranscribeResult> {
  const { bin, translatePaths } = await resolveWhisperPython();
  const scriptArg = translatePaths ? toWindowsPathIfWsl(TRANSCRIBE_SCRIPT) : TRANSCRIBE_SCRIPT;
  const audioArg = translatePaths ? toWindowsPathIfWsl(params.audioFilePath) : params.audioFilePath;
  const langArg = params.language ?? "es";
  const modelArg = params.model ?? "small";

  let stdout = "";
  let stderr = "";
  try {
    const out = await execFileAsync(
      bin,
      [scriptArg, audioArg, langArg, modelArg],
      {
        timeout: 180_000,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      },
    );
    stdout = out.stdout;
    stderr = out.stderr;
  } catch (err) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string };
    const outLine = (execErr.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).pop() || "";
    let parsedError: string | undefined;
    try {
      const parsed = JSON.parse(outLine) as { error?: string };
      if (parsed.error) parsedError = parsed.error;
    } catch {
      // Not JSON
    }
    if (parsedError) {
      throw Object.assign(new Error(parsedError), { statusCode: 400 });
    }
    throw Object.assign(
      new Error(execErr.stderr?.trim().slice(0, 500) || execErr.message || "Error ejecutando transcripción Whisper"),
      { statusCode: 500 },
    );
  }

  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  const lastJson = lines[lines.length - 1];
  if (!lastJson) {
    throw new Error(`Whisper returned empty output. stderr: ${stderr.slice(0, 400)}`);
  }

  const parsed = JSON.parse(lastJson) as {
    error?: string;
    language?: string;
    durationSec?: number;
    cues?: unknown[];
  };
  if (parsed.error) {
    throw new Error(`Whisper ASR error: ${parsed.error}`);
  }

  const offset = params.clipStartOffsetSec ?? 0;
  const rawCues = Array.isArray(parsed.cues) ? parsed.cues : [];
  const cues: SubtitleCue[] = rawCues.map((c) => {
    const obj = c as {
      id: string;
      start: number;
      end: number;
      text: string;
      words?: { id: string; text: string; start: number; end: number; emphasis?: string }[];
    };
    return SubtitleCueSchema.parse({
      id: obj.id,
      start: Number((obj.start + offset).toFixed(3)),
      end: Number((obj.end + offset).toFixed(3)),
      text: obj.text,
      words: (obj.words ?? []).map((w) => ({
        id: w.id,
        text: w.text,
        start: Number((w.start + offset).toFixed(3)),
        end: Number((w.end + offset).toFixed(3)),
        emphasis: "normal",
      })),
    });
  });

  return {
    language: parsed.language ?? langArg,
    durationSec: parsed.durationSec ?? 0,
    cues,
  };
}

/**
 * Applies professional FFmpeg audio processing to an existing clip file
 * and writes a clean 48kHz stereo WAV asset.
 */
export async function processAudioWithFfmpeg(params: {
  inputPath: string;
  outPath: string;
  action: AudioProcessAction;
}): Promise<{ durationSec: number }> {
  const { inputPath, outPath, action } = params;
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  if (action === "normalize") {
    // True 2-pass EBU R128 -16 LUFS linear normalization
    let applied2Pass = false;
    try {
      const pass1 = await execFileAsync(
        "ffmpeg",
        [
          "-v", "info",
          "-i", inputPath,
          "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
          "-f", "null", "-",
        ],
        { timeout: 60_000 },
      );
      const m = pass1.stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
      if (m) {
        const stats = JSON.parse(m[0]) as Record<string, string>;
        if (stats.input_i && stats.input_i !== "-inf") {
          const af2 =
            `loudnorm=I=-16:TP=-1.5:LRA=11:` +
            `measured_I=${stats.input_i}:measured_TP=${stats.input_tp}:` +
            `measured_LRA=${stats.input_lra}:measured_thresh=${stats.input_thresh}:` +
            `offset=${stats.target_offset}:linear=true`;
          await execFileAsync(
            "ffmpeg",
            ["-y", "-v", "error", "-i", inputPath, "-af", af2, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", outPath],
            { timeout: 60_000 },
          );
          applied2Pass = true;
        }
      }
    } catch {
      applied2Pass = false;
    }
    if (!applied2Pass) {
      await execFileAsync(
        "ffmpeg",
        ["-y", "-v", "error", "-i", inputPath, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", outPath],
        { timeout: 60_000 },
      );
    }
  } else {
    const filterByAction: Record<Exclude<AudioProcessAction, "normalize">, string> = {
      denoise: "highpass=f=75,afftdn=nf=-25:tn=1",
      voice_enhance:
        "highpass=f=80,afftdn=nf=-22:tn=1,equalizer=f=240:t=q:w=1.2:g=-2,equalizer=f=3200:t=q:w=1.2:g=3,acompressor=threshold=-20dB:ratio=3:attack=8:release=120,loudnorm=I=-16:TP=-1.5:LRA=9",
      trim_silence:
        "silenceremove=start_periods=1:start_silence=0.1:start_threshold=-42dB:stop_periods=-1:stop_duration=0.45:stop_threshold=-42dB",
      deess_warm:
        "highpass=f=65,equalizer=f=180:t=q:w=1.1:g=2.2,equalizer=f=6800:t=q:w=2.0:g=-4.5,acompressor=threshold=-18dB:ratio=2.4:attack=10:release=110,loudnorm=I=-16:TP=-1.5:LRA=9",
      fade_clean:
        "highpass=f=60,afade=t=in:st=0:d=0.04,areverse,afade=t=in:st=0:d=0.08,areverse,loudnorm=I=-16:TP=-1.5:LRA=11",
    };

    await execFileAsync(
      "ffmpeg",
      [
        "-y", "-v", "error",
        "-i", inputPath,
        "-af", filterByAction[action],
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
        outPath,
      ],
      { timeout: 90_000 },
    );
  }

  const durationSec = (await probeAudioDurationSec(outPath)) ?? 1;
  return { durationSec };
}

/**
 * Synthesizes crisp procedural transition SFX WAVs via FFmpeg lavfi so any CapCut-style
 * transition-with-sound works immediately offline with zero external dependencies.
 */
export async function synthesizeTransitionSfxWav(
  preset: Exclude<TransitionSfxPreset, "none">,
  outPath: string,
): Promise<{ durationSec: number }> {
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const specs: Record<Exclude<TransitionSfxPreset, "none">, { input: string; af: string; dur: number }> = {
    whoosh: {
      input: "anoisesrc=color=pink:duration=0.48:amplitude=0.75",
      af: "bandpass=f=900:w=700,afade=t=in:st=0:d=0.16,afade=t=out:st=0.22:d=0.26,volume=1.1",
      dur: 0.48,
    },
    whoosh_deep: {
      input: "anoisesrc=color=brown:duration=0.65:amplitude=0.85",
      af: "lowpass=f=520,afade=t=in:st=0:d=0.2,afade=t=out:st=0.28:d=0.37,volume=1.3",
      dur: 0.65,
    },
    whip: {
      input: "anoisesrc=color=white:duration=0.28:amplitude=0.8",
      af: "bandpass=f=1800:w=1400,afade=t=in:st=0:d=0.05,afade=t=out:st=0.09:d=0.19,volume=1.15",
      dur: 0.28,
    },
    zoom_whoosh: {
      input: "aevalsrc=0.45*sin(2*PI*(140+620*t)*t)+0.35*random(0):d=0.42:s=48000",
      af: "lowpass=f=1600,afade=t=in:st=0:d=0.12,afade=t=out:st=0.18:d=0.24",
      dur: 0.42,
    },
    glitch: {
      input: "aevalsrc=0.5*sin(2*PI*(180+1400*floor(mod(t*28,5)))*t)*gt(sin(2*PI*34*t),0):d=0.32:s=48000",
      af: "highpass=f=160,afade=t=out:st=0.16:d=0.16,volume=0.85",
      dur: 0.32,
    },
    flash: {
      input: "aevalsrc=0.5*sin(2*PI*1320*t)*exp(-7*t)+0.35*sin(2*PI*2640*t)*exp(-10*t):d=0.45:s=48000",
      af: "afade=t=in:st=0:d=0.015,afade=t=out:st=0.18:d=0.27",
      dur: 0.45,
    },
    shimmer_gold: {
      input: "aevalsrc=0.3*sin(2*PI*880*t)+0.25*sin(2*PI*1318.5*t)+0.2*sin(2*PI*1760*t):d=0.75:s=48000",
      af: "afade=t=in:st=0:d=0.12,afade=t=out:st=0.25:d=0.5,volume=0.95",
      dur: 0.75,
    },
    impact: {
      input: "aevalsrc=0.85*sin(2*PI*(110*exp(-4*t)+42)*t)*exp(-4.5*t)+0.3*random(0)*exp(-14*t):d=0.55:s=48000",
      af: "lowpass=f=480,afade=t=out:st=0.28:d=0.27,volume=1.1",
      dur: 0.55,
    },
  };

  const spec = specs[preset];
  await execFileAsync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", spec.input,
      "-af", spec.af,
      "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
      outPath,
    ],
    { timeout: 20_000 },
  );

  return { durationSec: (await probeAudioDurationSec(outPath)) ?? spec.dur };
}
