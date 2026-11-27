#!/usr/bin/env node
/**
 * Generates `latest-stable.json` or `latest-nightly.json` + `SHA256SUMS.txt`
 * from a directory of built desktop installers for Storia Studio's in-app auto-updater.
 *
 * Usage:
 *   node scripts/generate-release-manifest.mjs \
 *     --dir release-assets \
 *     --channel nightly \
 *     --tag nightly \
 *     --repo Mairon31/storia_studio
 */
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[k] = v;
    }
  }
  return out;
}

function classifyAssetKind(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith("-setup.exe") || (lower.endsWith(".exe") && !lower.includes("launcher"))) return "nsis";
  if (lower.endsWith(".msi")) return "msi";
  if (lower.endsWith(".dmg")) return "dmg";
  if (lower.endsWith(".appimage")) return "appimage";
  if (lower.endsWith(".deb")) return "deb";
  if (lower.endsWith(".rpm")) return "rpm";
  if (lower.includes("launcher")) return "launcher";
  return "other";
}

function inferPlatformKey(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes("launcher")) return null;
  if (lower.endsWith(".exe") || lower.endsWith(".msi")) return "windows-x64";
  if (lower.endsWith(".dmg")) {
    if (lower.includes("aarch64") || lower.includes("arm64")) return "macos-arm64";
    if (lower.includes("x64") || lower.includes("x86_64") || lower.includes("intel")) return "macos-x64";
    return "macos-arm64";
  }
  if (lower.endsWith(".appimage") || lower.endsWith(".deb") || lower.endsWith(".rpm")) {
    return "linux-x64";
  }
  return null;
}

function priorityForKind(kind) {
  switch (kind) {
    case "nsis":
      return 100;
    case "appimage":
      return 95;
    case "dmg":
      return 90;
    case "msi":
      return 80;
    case "deb":
      return 70;
    case "rpm":
      return 60;
    default:
      return 10;
  }
}

function safeGit(args) {
  try {
    return execFileSync("git", args, { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const assetsDir = path.resolve(args.dir || "release-assets");
  const channel = args.channel === "nightly" ? "nightly" : "stable";
  const repo = (args.repo || process.env.GITHUB_REPOSITORY || "Mairon31/storia_studio").trim();

  const rootPkg = JSON.parse(await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf8"));
  const baseVersion = rootPkg.version || "0.2.0";
  const commitSha = (args.commit || process.env.GITHUB_SHA || safeGit(["rev-parse", "HEAD"]) || "").trim();
  const commitShort = commitSha ? commitSha.slice(0, 7) : "dev";
  const commitMessage = (args.message || process.env.STORIA_COMMIT_MESSAGE || safeGit(["log", "-1", "--pretty=%s"]) || "").trim();

  const tag = args.tag || (channel === "nightly" ? "nightly" : `v${baseVersion}`);
  const version = channel === "nightly" ? `${baseVersion}-nightly.${commitShort}` : tag.replace(/^v/i, "");
  const publishedAt = new Date().toISOString();

  const entries = (await fs.readdir(assetsDir, { withFileTypes: true }))
    .filter((e) => e.isFile() && e.name !== "SHA256SUMS.txt" && !e.name.startsWith("latest-"))
    .map((e) => e.name)
    .sort();

  const checksumLines = [];
  const platformAssets = {};

  for (const filename of entries) {
    const fullPath = path.join(assetsDir, filename);
    const buf = await fs.readFile(fullPath);
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    checksumLines.push(`${sha256}  ${filename}`);

    const plat = inferPlatformKey(filename);
    if (!plat) continue;
    const kind = classifyAssetKind(filename);
    const prev = platformAssets[plat];
    if (!prev || priorityForKind(kind) > priorityForKind(prev.kind)) {
      platformAssets[plat] = {
        filename,
        url: `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`,
        sha256,
        size: buf.byteLength,
        kind,
      };
    }
  }

  await fs.writeFile(path.join(assetsDir, "SHA256SUMS.txt"), checksumLines.join("\n") + "\n", "utf8");

  const manifest = {
    channel,
    tag,
    version,
    commitSha,
    commitShort,
    commitMessage,
    publishedAt,
    releaseUrl: `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`,
    notes:
      channel === "nightly"
        ? `Compilación automática Nightly desde master (${commitShort}): ${commitMessage || "Últimos cambios de desarrollo"}`
        : `Lanzamiento estable Storia Studio ${tag}`,
    assets: platformAssets,
  };

  const manifestFilename = channel === "nightly" ? "latest-nightly.json" : "latest-stable.json";
  await fs.writeFile(path.join(assetsDir, manifestFilename), JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`[release-manifest] Wrote ${manifestFilename} (${Object.keys(platformAssets).length} platforms) + SHA256SUMS.txt (${checksumLines.length} files).`);
}

main().catch((err) => {
  console.error("[release-manifest] Failed:", err);
  process.exit(1);
});
