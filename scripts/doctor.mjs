#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function safeRun(cmd, args) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim(),
    };
  } catch (err) {
    return {
      ok: false,
      out: (err?.stderr || err?.message || String(err)).toString().trim(),
    };
  }
}

function probeEncoder(codec) {
  const res = safeRun("ffmpeg", [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.05:r=30",
    "-c:v", codec, "-pix_fmt", "yuv420p", "-f", "null", "-",
  ]);
  return res.ok;
}

const playwrightCache = path.join(os.homedir(), ".cache", "ms-playwright");
const chromiumDirs = fs.existsSync(playwrightCache)
  ? fs.readdirSync(playwrightCache).filter((d) => d.startsWith("chromium"))
  : [];

const report = {
  platform: `${os.platform()} ${os.release()} (${os.arch()})`,
  cpus: os.cpus().length,
  totalMemGb: Number((os.totalmem() / 1024 ** 3).toFixed(1)),
  node: process.version,
  pnpm: safeRun("pnpm", ["-v"]).out,
  git: safeRun("git", ["--version"]).out,
  ffmpeg: safeRun("ffmpeg", ["-version"]).out.split("\n")[0],
  encoders: {
    h264_nvenc: probeEncoder("h264_nvenc"),
    hevc_nvenc: probeEncoder("hevc_nvenc"),
    av1_nvenc: probeEncoder("av1_nvenc"),
    libx264: probeEncoder("libx264"),
  },
  playwrightChromium: chromiumDirs,
};

console.log(JSON.stringify(report, null, 2));
