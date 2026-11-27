import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SystemCapabilities {
  platform: string;
  cpus: number;
  totalMemGb: number;
  nodeVersion: string;
  ffmpegVersion: string | null;
  encoders: {
    h264_nvenc: boolean;
    hevc_nvenc: boolean;
    av1_nvenc: boolean;
    libx264: boolean;
  };
  recommendedEncoder: "h264_nvenc" | "libx264";
}

let cachedCapabilities: SystemCapabilities | null = null;

async function probeFfmpegEncoder(codec: string): Promise<boolean> {
  try {
    await execFileAsync(
      "ffmpeg",
      [
        "-y", "-v", "error",
        "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.05:r=30",
        "-c:v", codec, "-pix_fmt", "yuv420p", "-f", "null", "-",
      ],
      { timeout: 10_000 },
    );
    return true;
  } catch {
    return false;
  }
}

export async function getSystemCapabilities(forceRefresh = false): Promise<SystemCapabilities> {
  if (cachedCapabilities && !forceRefresh) return cachedCapabilities;

  let ffmpegVersion: string | null = null;
  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 });
    ffmpegVersion = stdout.split("\n")[0]?.trim() ?? null;
  } catch {
    ffmpegVersion = null;
  }

  const [h264Nvenc, hevcNvenc, av1Nvenc, libx264] = ffmpegVersion
    ? await Promise.all([
        probeFfmpegEncoder("h264_nvenc"),
        probeFfmpegEncoder("hevc_nvenc"),
        probeFfmpegEncoder("av1_nvenc"),
        probeFfmpegEncoder("libx264"),
      ])
    : [false, false, false, false];

  cachedCapabilities = {
    platform: `${os.platform()} ${os.release()} (${os.arch()})`,
    cpus: os.cpus().length,
    totalMemGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
    nodeVersion: process.version,
    ffmpegVersion,
    encoders: {
      h264_nvenc: h264Nvenc,
      hevc_nvenc: hevcNvenc,
      av1_nvenc: av1Nvenc,
      libx264,
    },
    recommendedEncoder: h264Nvenc ? "h264_nvenc" : "libx264",
  };
  return cachedCapabilities;
}
