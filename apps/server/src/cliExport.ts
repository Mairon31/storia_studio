import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AspectRatio, ExportSettings, Fps, QualityPreset, ResolutionPreset, VideoEncoder } from "@storia/schema";
import { buildServer } from "./app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectsDir = path.resolve(__dirname, "../../../projects");

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

const projectId = parseArg("--project") ?? "demo_episodum_paradox";
const projectsDir = process.env.STORIA_PROJECTS_DIR ?? defaultProjectsDir;
const aspectRatio = parseArg("--aspect") as AspectRatio | undefined;
const resolution = parseArg("--resolution") as ResolutionPreset | undefined;
const fpsArg = parseArg("--fps");
const quality = parseArg("--quality") as QualityPreset | undefined;
const encoder = parseArg("--encoder") as VideoEncoder | undefined;
const outputName = parseArg("--output");

const settingsOverride: Partial<ExportSettings> = {};
if (aspectRatio) settingsOverride.aspectRatio = aspectRatio;
if (resolution) settingsOverride.resolution = resolution;
if (fpsArg) settingsOverride.fps = Number(fpsArg) as Fps;
if (quality) settingsOverride.quality = quality;
if (encoder) settingsOverride.encoder = encoder;

const app = await buildServer({ projectsDir, logger: false });
await app.listen({ port: 0, host: "localhost" });

try {
  const addr = app.server.address();
  const port = typeof addr === "object" && addr ? addr.port : 4310;
  console.log(`[storia-export] Exporting '${projectId}' via local server on port ${port}...`);

  const res = await fetch(`http://localhost:${port}/api/projects/${encodeURIComponent(projectId)}/exports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      settings: settingsOverride,
      outputName,
      wait: true,
    }),
  });
  const data = (await res.json()) as { job?: Record<string, unknown>; message?: string };
  if (!res.ok || !data.job || data.job.status !== "completed") {
    console.error("[storia-export] Export failed:", JSON.stringify(data, null, 2));
    process.exitCode = 1;
  } else {
    console.log("[storia-export] SUCCESS:");
    console.log(JSON.stringify(data.job, null, 2));
  }
} finally {
  await app.close();
}
