import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importLegacyStoriaManifest } from "../packages/schema/dist/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function resolveCrossPlatformPath(inputPath) {
  const trimmed = inputPath.trim();
  if (process.platform === "linux") {
    const m = trimmed.match(/^([a-zA-Z]):[\\/](.*)$/);
    if (m) return `/mnt/${m[1].toLowerCase()}/${m[2].replace(/\\/g, "/")}`;
  }
  return trimmed;
}

function sanitizeId(raw, fallback) {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : fallback;
}

const manifestArg = parseArg("--manifest");
const projectId = sanitizeId(parseArg("--id") ?? "imported_legacy_project", "imported_legacy_project");
if (!manifestArg) {
  console.error("Usage: node scripts/import-legacy.mjs --manifest <path/to/project_manifest.json> --id <project_id>");
  process.exit(1);
}

const manifestPath = resolveCrossPlatformPath(manifestArg);
const sourceDir = path.dirname(manifestPath);
const legacy = JSON.parse(await fs.readFile(manifestPath, "utf8"));

const projectDir = path.join(rootDir, "projects", projectId);
const targetAssetsDir = path.join(projectDir, "assets");
const targetExportsDir = path.join(projectDir, "exports");
await fs.mkdir(targetAssetsDir, { recursive: true });
await fs.mkdir(targetExportsDir, { recursive: true });

// Read-only scan of legacy assets folders + voice + music
const importedAssets = [];
const sfxAssetMap = {};
const seenIds = new Set();

async function copyAssetIfExists(srcFile, { id, name, kind, mimeType }) {
  if (seenIds.has(id)) return id;
  try {
    await fs.access(srcFile);
  } catch {
    return null;
  }
  const destFilename = path.basename(srcFile).replace(/[^a-zA-Z0-9._-]+/g, "_");
  const destPath = path.join(targetAssetsDir, destFilename);
  await fs.copyFile(srcFile, destPath);
  seenIds.add(id);
  importedAssets.push({
    id,
    name,
    kind,
    src: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(destFilename)}`,
    mimeType,
    scaleMode: kind === "pixel_art" ? "nearest" : "linear",
    tags: ["imported-legacy"],
    provenance: { source: "imported_legacy" },
  });
  return id;
}

const legacyAssetsRoot = path.join(sourceDir, "assets");

// Copy backgrounds, overlays, and sprites SVGs/PNGs
for (const sub of ["backgrounds", "overlays", "sprites"]) {
  const dir = path.join(legacyAssetsRoot, sub);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = path.extname(e.name).toLowerCase();
      if (![".svg", ".png", ".jpg", ".jpeg", ".webp"].includes(ext)) continue;
      const stem = path.parse(e.name).name;
      const aid = sanitizeId(stem, `asset_${importedAssets.length}`);
      await copyAssetIfExists(path.join(dir, e.name), {
        id: aid,
        name: stem,
        kind: ext === ".svg" ? "svg" : "image",
        mimeType: ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`,
      });
    }
  } catch {
    // Subfolder optional
  }
}

// Copy voice file if referenced
let voiceAssetId;
if (typeof legacy.voice_file === "string") {
  const vf = resolveCrossPlatformPath(legacy.voice_file);
  const candidate = (await fs.access(vf).then(() => vf).catch(() => null)) ?? path.join(sourceDir, path.basename(vf));
  const ext = path.extname(candidate).toLowerCase();
  const res = await copyAssetIfExists(candidate, {
    id: sanitizeId(path.parse(candidate).name, "voice_main"),
    name: path.parse(candidate).name,
    kind: "audio",
    mimeType: ext === ".wav" ? "audio/wav" : "audio/mpeg",
  });
  if (res) voiceAssetId = res;
}

// Copy music file if referenced
let musicAssetId;
if (typeof legacy.music === "string") {
  const musicDir = path.join(legacyAssetsRoot, "music");
  for (const ext of [".mp3", ".wav", ".ogg", ".m4a"]) {
    const candidate = path.join(musicDir, `${legacy.music}${ext}`);
    const res = await copyAssetIfExists(candidate, {
      id: sanitizeId(`music_${legacy.music}`, "music_main"),
      name: legacy.music,
      kind: "audio",
      mimeType: ext === ".wav" ? "audio/wav" : "audio/mpeg",
    });
    if (res) {
      musicAssetId = res;
      break;
    }
  }
}

// Copy SFX referenced in shots/beats
const sfxDir = path.join(legacyAssetsRoot, "sfx");
const referencedSfx = new Set();
for (const shot of Array.isArray(legacy.shots) ? legacy.shots : []) {
  const beats = Array.isArray(shot.beats) && shot.beats.length > 0 ? shot.beats : [shot];
  for (const beat of beats) {
    for (const sx of Array.isArray(beat.sfx) ? beat.sfx : []) {
      if (typeof sx?.kind === "string") referencedSfx.add(sx.kind);
    }
  }
}
for (const kind of referencedSfx) {
  for (const ext of [".wav", ".mp3", ".ogg"]) {
    const candidate = path.join(sfxDir, `${kind}${ext}`);
    const aid = sanitizeId(`sfx_${kind}`, `sfx_${Object.keys(sfxAssetMap).length}`);
    const res = await copyAssetIfExists(candidate, {
      id: aid,
      name: kind,
      kind: "audio",
      mimeType: ext === ".wav" ? "audio/wav" : "audio/mpeg",
    });
    if (res) {
      sfxAssetMap[kind] = res;
      break;
    }
  }
}

// Read timing.json if present (read-only)
let timingData;
if (typeof legacy.timing_file === "string") {
  const tf = resolveCrossPlatformPath(legacy.timing_file);
  const candidate = (await fs.access(tf).then(() => tf).catch(() => null)) ?? path.join(sourceDir, path.basename(tf));
  try {
    timingData = JSON.parse(await fs.readFile(candidate, "utf8"));
  } catch {
    timingData = undefined;
  }
}

const project = importLegacyStoriaManifest(legacy, projectId, {
  assets: importedAssets,
  timingData,
  voiceAssetId,
  voiceDurationSec: Number(legacy.duration ?? 81),
  musicAssetId,
  sfxAssetMap,
});

await fs.writeFile(path.join(projectDir, "project.json"), JSON.stringify(project, null, 2) + "\n", "utf8");

console.log(
  JSON.stringify(
    {
      imported: true,
      projectId: project.id,
      name: project.name,
      projectJsonPath: path.join(projectDir, "project.json"),
      scenes: project.scenes.length,
      cast: project.cast.length,
      assetsCopied: project.assets.length,
      subtitleCues: project.subtitles.cues.length,
      audioTracks: project.audioTracks.map((t) => ({ id: t.id, role: t.role, clips: t.clips.length })),
      durationSec: Number(project.scenes.reduce((a, s) => a + s.duration, 0).toFixed(2)),
    },
    null,
    2,
  ),
);
