import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  isDesktopAppRuntime,
  REPO_RUNTIME_ROOT,
  resolveDefaultUpdatesConfigPath,
  resolveDefaultUpdatesDir,
} from "./dataPaths.js";
import { safeFetchPublicUrl } from "./secretVault.js";

export type UpdateChannel = "stable" | "nightly";

export interface InstalledBuildInfo {
  version: string;
  channel: UpdateChannel;
  commitSha: string;
  commitShort: string;
  commitMessage: string;
  builtAt: string;
  repo: string;
  platformKey: string;
  isDesktopApp: boolean;
}

export interface RemotePlatformAsset {
  filename: string;
  url: string;
  sha256: string;
  size: number;
  kind: "nsis" | "msi" | "dmg" | "appimage" | "deb" | "rpm" | "launcher" | "other";
}

export interface ReleaseManifest {
  channel: UpdateChannel;
  tag: string;
  version: string;
  commitSha: string;
  commitShort: string;
  commitMessage: string;
  publishedAt: string;
  releaseUrl: string;
  notes: string;
  assets: Record<string, RemotePlatformAsset>;
}

export interface UpdateConfig {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckedAt?: string;
}

export interface UpdateCheckResult {
  checkedAt: string;
  channel: UpdateChannel;
  updateAvailable: boolean;
  switchingChannel: boolean;
  reason: string;
  current: InstalledBuildInfo;
  remote: {
    version: string;
    tag: string;
    commitSha: string;
    commitShort: string;
    commitMessage: string;
    publishedAt: string;
    releaseUrl: string;
    notes: string;
  } | null;
  asset: RemotePlatformAsset | null;
  error?: string;
}

export interface UpdateDownloadState {
  phase: "idle" | "downloading" | "verifying" | "ready" | "error";
  channel?: UpdateChannel;
  filename?: string;
  localPath?: string;
  sha256?: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  error?: string;
  readyAt?: string;
}

export interface UpdateStatusPayload {
  current: InstalledBuildInfo;
  config: UpdateConfig;
  lastCheck: UpdateCheckResult | null;
  download: UpdateDownloadState;
  canAutoInstall: boolean;
}

export interface UpdateManagerOptions {
  configPath?: string;
  updatesDir?: string;
  buildInfoPath?: string;
  repo?: string;
  isDesktopApp?: boolean;
  /** Optional custom fetch implementation for unit tests. */
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;
}

const DEFAULT_REPO = "Mairon31/storia_studio";
const USER_AGENT = "StoriaStudio-Updater/0.2 (+https://github.com/Mairon31/storia_studio)";

export function resolvePlatformKey(platform = process.platform, arch = process.arch): string {
  if (platform === "win32") return "windows-x64";
  if (platform === "darwin") return arch === "arm64" ? "macos-arm64" : "macos-x64";
  return "linux-x64";
}

export function compareSemver(a: string, b: string): number {
  const clean = (v: string) =>
    v
      .trim()
      .replace(/^v/i, "")
      .split("-")[0]!
      .split(".")
      .map((n) => Number.parseInt(n, 10) || 0);
  const pa = clean(a);
  const pb = clean(b);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

function classifyAssetKind(filename: string): RemotePlatformAsset["kind"] {
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

function inferPlatformForAsset(filename: string): string | null {
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

function assetPriority(kind: RemotePlatformAsset["kind"]): number {
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

function parseGithubApiRelease(
  raw: Record<string, unknown>,
  channel: UpdateChannel,
  repo: string,
): ReleaseManifest {
  const tag = String(raw.tag_name ?? (channel === "nightly" ? "nightly" : "v0.0.0"));
  const name = String(raw.name ?? tag);
  const body = String(raw.body ?? "");
  const publishedAt = String(raw.published_at ?? raw.created_at ?? new Date().toISOString());
  const releaseUrl = String(raw.html_url ?? `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag)}`);
  const targetCommitish = String(raw.target_commitish ?? "");

  // Extract commit SHA from release body metadata (`Commit: <40-hex>` or `(<7-hex>)`) or target_commitish
  const shaMatch =
    body.match(/\b([0-9a-f]{40})\b/i) ??
    targetCommitish.match(/^([0-9a-f]{40})$/i) ??
    name.match(/\b([0-9a-f]{7,40})\b/i);
  const commitSha = shaMatch?.[1] ?? "";
  const commitShort = commitSha ? commitSha.slice(0, 7) : "";

  const versionMatch = tag.match(/v?(\d+\.\d+\.\d+)/) ?? name.match(/v?(\d+\.\d+\.\d+)/);
  const baseVer = versionMatch?.[1] ?? "0.2.0";
  const version = channel === "nightly" && commitShort ? `${baseVer}-nightly.${commitShort}` : baseVer;

  const assets: Record<string, RemotePlatformAsset> = {};
  const rawAssets = Array.isArray(raw.assets) ? (raw.assets as Record<string, unknown>[]) : [];
  for (const a of rawAssets) {
    const filename = String(a.name ?? "");
    const url = String(a.browser_download_url ?? "");
    const size = Number(a.size ?? 0);
    if (!filename || !url) continue;
    const plat = inferPlatformForAsset(filename);
    if (!plat) continue;
    const kind = classifyAssetKind(filename);
    const prev = assets[plat];
    if (!prev || assetPriority(kind) > assetPriority(prev.kind)) {
      assets[plat] = { filename, url, sha256: "", size, kind };
    }
  }

  return {
    channel,
    tag,
    version,
    commitSha,
    commitShort,
    commitMessage: body.split("\n").find((l) => l.trim().length > 0)?.trim() ?? name,
    publishedAt,
    releaseUrl,
    notes: body,
    assets,
  };
}

export class UpdateManager {
  readonly configPath: string;
  readonly updatesDir: string;
  private readonly buildInfoPath: string;
  private readonly repoOverride?: string;
  private readonly isDesktop: boolean;
  private readonly fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>;

  private buildInfoCache: InstalledBuildInfo | null = null;
  private configCache: UpdateConfig | null = null;
  private lastCheck: UpdateCheckResult | null = null;
  private downloadState: UpdateDownloadState = {
    phase: "idle",
    bytesDownloaded: 0,
    totalBytes: 0,
    percent: 0,
  };
  private activeDownloadPromise: Promise<UpdateDownloadState> | null = null;

  constructor(options: UpdateManagerOptions = {}) {
    this.configPath = path.resolve(options.configPath ?? resolveDefaultUpdatesConfigPath());
    this.updatesDir = path.resolve(options.updatesDir ?? resolveDefaultUpdatesDir());
    this.buildInfoPath = path.resolve(
      options.buildInfoPath ?? path.join(REPO_RUNTIME_ROOT, "build-info.json"),
    );
    this.repoOverride = options.repo;
    this.isDesktop = options.isDesktopApp ?? isDesktopAppRuntime();
    this.fetchImpl = options.fetchImpl;
  }

  private async doFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
    const mergedHeaders = { "User-Agent": USER_AGENT, ...headers };
    if (this.fetchImpl) {
      return this.fetchImpl(url, { headers: mergedHeaders });
    }
    const { res } = await safeFetchPublicUrl(url, {
      headers: mergedHeaders,
      signal: AbortSignal.timeout(25_000),
    });
    return res;
  }

  async getInstalledBuildInfo(): Promise<InstalledBuildInfo> {
    if (this.buildInfoCache) return { ...this.buildInfoCache };

    let version = "0.2.0";
    let channel: UpdateChannel =
      process.env.STORIA_BUILD_CHANNEL === "nightly" ? "nightly" : "stable";
    let commitSha = (process.env.STORIA_BUILD_COMMIT ?? "").trim();
    let commitShort = commitSha ? commitSha.slice(0, 7) : "";
    let commitMessage = "";
    let builtAt = "";
    let repo = (this.repoOverride ?? process.env.STORIA_UPDATE_REPO ?? DEFAULT_REPO).trim();

    try {
      const raw = await fs.readFile(this.buildInfoPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<InstalledBuildInfo>;
      if (typeof parsed.version === "string" && parsed.version.trim()) version = parsed.version.trim();
      if (parsed.channel === "nightly" || parsed.channel === "stable") channel = parsed.channel;
      if (typeof parsed.commitSha === "string" && parsed.commitSha.trim()) {
        commitSha = parsed.commitSha.trim();
      }
      if (typeof parsed.commitShort === "string" && parsed.commitShort.trim()) {
        commitShort = parsed.commitShort.trim();
      }
      if (typeof parsed.commitMessage === "string") commitMessage = parsed.commitMessage.trim();
      if (typeof parsed.builtAt === "string") builtAt = parsed.builtAt.trim();
      if (typeof parsed.repo === "string" && parsed.repo.trim() && !this.repoOverride) {
        repo = parsed.repo.trim();
      }
    } catch {
      // Fallback for local monorepo dev without build-info.json
      try {
        const pkgRaw = await fs.readFile(path.join(REPO_RUNTIME_ROOT, "package.json"), "utf8");
        const pkg = JSON.parse(pkgRaw) as { version?: string };
        if (pkg.version) version = pkg.version;
      } catch {
        // keep default
      }
      if (!commitSha) {
        try {
          commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: REPO_RUNTIME_ROOT,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
          }).trim();
        } catch {
          // ignore if git is unavailable
        }
      }
    }

    if (!commitShort && commitSha) commitShort = commitSha.slice(0, 7);

    const info: InstalledBuildInfo = {
      version,
      channel,
      commitSha,
      commitShort: commitShort || "dev",
      commitMessage,
      builtAt,
      repo,
      platformKey: resolvePlatformKey(),
      isDesktopApp: this.isDesktop,
    };
    this.buildInfoCache = info;
    return { ...info };
  }

  async getConfig(): Promise<UpdateConfig> {
    if (this.configCache) return { ...this.configCache };
    const installed = await this.getInstalledBuildInfo();
    const defaults: UpdateConfig = {
      channel: installed.channel,
      autoCheck: true,
    };
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<UpdateConfig>;
      const merged: UpdateConfig = {
        channel:
          parsed.channel === "nightly" || parsed.channel === "stable"
            ? parsed.channel
            : defaults.channel,
        autoCheck: typeof parsed.autoCheck === "boolean" ? parsed.autoCheck : defaults.autoCheck,
        lastCheckedAt: typeof parsed.lastCheckedAt === "string" ? parsed.lastCheckedAt : undefined,
      };
      this.configCache = merged;
      return { ...merged };
    } catch {
      this.configCache = defaults;
      return { ...defaults };
    }
  }

  async updateConfig(patch: Partial<Pick<UpdateConfig, "channel" | "autoCheck">>): Promise<UpdateConfig> {
    const cur = await this.getConfig();
    const next: UpdateConfig = {
      ...cur,
      ...(patch.channel === "stable" || patch.channel === "nightly" ? { channel: patch.channel } : {}),
      ...(typeof patch.autoCheck === "boolean" ? { autoCheck: patch.autoCheck } : {}),
    };
    this.configCache = next;
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    return { ...next };
  }

  private async fetchManifestForChannel(repo: string, channel: UpdateChannel): Promise<ReleaseManifest> {
    const manifestUrl =
      channel === "nightly"
        ? `https://github.com/${repo}/releases/download/nightly/latest-nightly.json`
        : `https://github.com/${repo}/releases/latest/download/latest-stable.json`;

    try {
      const res = await this.doFetch(manifestUrl, { Accept: "application/json" });
      if (res.ok) {
        const json = (await res.json()) as Partial<ReleaseManifest>;
        if (json && typeof json.version === "string" && json.assets && typeof json.assets === "object") {
          return {
            channel,
            tag: String(json.tag ?? (channel === "nightly" ? "nightly" : `v${json.version}`)),
            version: json.version,
            commitSha: String(json.commitSha ?? ""),
            commitShort: String(json.commitShort ?? (json.commitSha ? String(json.commitSha).slice(0, 7) : "")),
            commitMessage: String(json.commitMessage ?? ""),
            publishedAt: String(json.publishedAt ?? ""),
            releaseUrl: String(
              json.releaseUrl ??
                `https://github.com/${repo}/releases/tag/${encodeURIComponent(String(json.tag ?? channel))}`,
            ),
            notes: String(json.notes ?? ""),
            assets: json.assets as Record<string, RemotePlatformAsset>,
          };
        }
      }
    } catch {
      // Fallback to GitHub Releases API below
    }

    const apiUrl =
      channel === "nightly"
        ? `https://api.github.com/repos/${repo}/releases/tags/nightly`
        : `https://api.github.com/repos/${repo}/releases/latest`;
    const apiRes = await this.doFetch(apiUrl, { Accept: "application/vnd.github+json" });
    if (!apiRes.ok) {
      if (apiRes.status === 404) {
        throw new Error(
          channel === "nightly"
            ? "Todavía no hay ninguna compilación Nightly publicada en GitHub Releases."
            : "Todavía no hay ningún lanzamiento estable publicado en GitHub Releases.",
        );
      }
      throw new Error(`GitHub Releases devolvió HTTP ${apiRes.status}.`);
    }
    const raw = (await apiRes.json()) as Record<string, unknown>;
    return parseGithubApiRelease(raw, channel, repo);
  }

  async checkForUpdates(channelOverride?: UpdateChannel): Promise<UpdateCheckResult> {
    const current = await this.getInstalledBuildInfo();
    const cfg = await this.getConfig();
    const channel = channelOverride ?? cfg.channel;
    const checkedAt = new Date().toISOString();

    try {
      const manifest = await this.fetchManifestForChannel(current.repo, channel);
      const asset = manifest.assets[current.platformKey] ?? null;
      const switchingChannel = current.channel !== channel;

      let updateAvailable = false;
      let reason = "Ya tienes la versión más reciente instalada.";

      if (channel === "nightly") {
        if (switchingChannel) {
          updateAvailable = true;
          reason = `Cambiarás del canal Estable al último build Nightly (${manifest.commitShort || manifest.version}).`;
        } else if (
          manifest.commitSha &&
          current.commitSha &&
          manifest.commitSha.toLowerCase() !== current.commitSha.toLowerCase()
        ) {
          updateAvailable = true;
          reason = `Hay un nuevo commit en master (${manifest.commitShort}) más reciente que tu instalación actual (${current.commitShort}).`;
        } else if (
          !current.commitSha &&
          manifest.commitSha
        ) {
          updateAvailable = true;
          reason = `Nueva compilación Nightly disponible (${manifest.commitShort}).`;
        } else if (
          current.builtAt &&
          manifest.publishedAt &&
          Date.parse(manifest.publishedAt) > Date.parse(current.builtAt) + 60_000
        ) {
          updateAvailable = true;
          reason = `Hay una compilación Nightly más reciente publicada el ${manifest.publishedAt}.`;
        }
      } else {
        const cmp = compareSemver(manifest.version, current.version);
        if (switchingChannel) {
          updateAvailable = true;
          reason = `Cambiarás del canal Nightly a la versión estable v${manifest.version}.`;
        } else if (cmp > 0) {
          updateAvailable = true;
          reason = `Nueva versión estable disponible: v${manifest.version} (actual: v${current.version}).`;
        }
      }

      const result: UpdateCheckResult = {
        checkedAt,
        channel,
        updateAvailable,
        switchingChannel,
        reason,
        current,
        remote: {
          version: manifest.version,
          tag: manifest.tag,
          commitSha: manifest.commitSha,
          commitShort: manifest.commitShort,
          commitMessage: manifest.commitMessage,
          publishedAt: manifest.publishedAt,
          releaseUrl: manifest.releaseUrl,
          notes: manifest.notes,
        },
        asset,
      };

      this.lastCheck = result;
      this.configCache = { ...cfg, lastCheckedAt: checkedAt };
      await fs.mkdir(path.dirname(this.configPath), { recursive: true }).catch(() => {});
      await fs.writeFile(this.configPath, JSON.stringify(this.configCache, null, 2) + "\n", "utf8").catch(() => {});

      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const result: UpdateCheckResult = {
        checkedAt,
        channel,
        updateAvailable: false,
        switchingChannel: current.channel !== channel,
        reason: msg,
        current,
        remote: null,
        asset: null,
        error: msg,
      };
      this.lastCheck = result;
      return result;
    }
  }

  async downloadUpdate(channelOverride?: UpdateChannel): Promise<UpdateDownloadState> {
    if (this.activeDownloadPromise) {
      return this.activeDownloadPromise;
    }

    const run = async (): Promise<UpdateDownloadState> => {
      const cfg = await this.getConfig();
      const targetChannel = channelOverride ?? cfg.channel;
      const check =
        this.lastCheck && this.lastCheck.channel === targetChannel && this.lastCheck.asset
          ? this.lastCheck
          : await this.checkForUpdates(targetChannel);

      if (check.error || !check.asset) {
        this.downloadState = {
          phase: "error",
          channel: targetChannel,
          bytesDownloaded: 0,
          totalBytes: 0,
          percent: 0,
          error:
            check.error ??
            `No se encontró un instalador compatible para tu plataforma (${check.current.platformKey}) en el canal ${targetChannel}.`,
        };
        return { ...this.downloadState };
      }

      const asset = check.asset;
      const safeName = path.basename(asset.filename).replace(/[^a-zA-Z0-9._ -]/g, "_");
      await fs.mkdir(this.updatesDir, { recursive: true });
      const destPath = path.join(this.updatesDir, safeName);
      const tmpPath = `${destPath}.part`;

      this.downloadState = {
        phase: "downloading",
        channel: targetChannel,
        filename: safeName,
        localPath: destPath,
        bytesDownloaded: 0,
        totalBytes: asset.size || 0,
        percent: 0,
      };

      try {
        const res = await this.doFetch(asset.url, { Accept: "application/octet-stream" });
        if (!res.ok) {
          throw new Error(`Error al descargar el instalador (HTTP ${res.status}).`);
        }

        const headerTotal = Number(res.headers.get("content-length") ?? 0);
        const totalBytes = headerTotal > 0 ? headerTotal : asset.size || 0;
        this.downloadState.totalBytes = totalBytes;

        const hasher = crypto.createHash("sha256");
        const chunks: Buffer[] = [];
        let downloaded = 0;

        if (res.body) {
          const reader = res.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) {
              const buf = Buffer.from(value);
              chunks.push(buf);
              hasher.update(buf);
              downloaded += buf.byteLength;
              this.downloadState.bytesDownloaded = downloaded;
              this.downloadState.percent =
                totalBytes > 0 ? Math.min(99, Math.round((downloaded / totalBytes) * 100)) : 50;
            }
          }
        } else {
          const buf = Buffer.from(await res.arrayBuffer());
          chunks.push(buf);
          hasher.update(buf);
          downloaded = buf.byteLength;
          this.downloadState.bytesDownloaded = downloaded;
          this.downloadState.totalBytes = downloaded;
          this.downloadState.percent = 99;
        }

        this.downloadState.phase = "verifying";
        const computedSha = hasher.digest("hex").toLowerCase();
        if (asset.sha256 && asset.sha256.trim().length === 64) {
          const expected = asset.sha256.trim().toLowerCase();
          if (computedSha !== expected) {
            throw new Error(
              `Verificación SHA-256 fallida (esperado ${expected.slice(0, 12)}…, obtenido ${computedSha.slice(0, 12)}…). Descarga cancelada por seguridad.`,
            );
          }
        }

        const fullBuf = Buffer.concat(chunks);
        await fs.writeFile(tmpPath, fullBuf);
        await fs.rename(tmpPath, destPath);

        this.downloadState = {
          phase: "ready",
          channel: targetChannel,
          filename: safeName,
          localPath: destPath,
          sha256: computedSha,
          bytesDownloaded: fullBuf.byteLength,
          totalBytes: fullBuf.byteLength,
          percent: 100,
          readyAt: new Date().toISOString(),
        };
        return { ...this.downloadState };
      } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        const msg = err instanceof Error ? err.message : String(err);
        this.downloadState = {
          phase: "error",
          channel: targetChannel,
          filename: safeName,
          bytesDownloaded: this.downloadState.bytesDownloaded,
          totalBytes: this.downloadState.totalBytes,
          percent: this.downloadState.percent,
          error: msg,
        };
        return { ...this.downloadState };
      }
    };

    this.activeDownloadPromise = run().finally(() => {
      this.activeDownloadPromise = null;
    });
    return this.activeDownloadPromise;
  }

  getDownloadState(): UpdateDownloadState {
    return { ...this.downloadState };
  }

  async getStatus(): Promise<UpdateStatusPayload> {
    const [current, config] = await Promise.all([this.getInstalledBuildInfo(), this.getConfig()]);
    return {
      current,
      config,
      lastCheck: this.lastCheck,
      download: this.getDownloadState(),
      canAutoInstall: current.isDesktopApp,
    };
  }
}
