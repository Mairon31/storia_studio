import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { StickmanDirectorBridge } from "./stickmanDirector.js";
import { resolveDefaultLibrariesConfigPath, resolveDefaultLibraryCacheDir } from "./dataPaths.js";
import { assertSafePublicRemoteUrl, safeFetchPublicUrl } from "./secretVault.js";
import { BUILTIN_SVG_BACKGROUNDS, findBuiltinSvgBackground } from "./svgBackgroundCatalog.js";

const execFileAsync = promisify(execFile);

const OPENVERSE_API_BASE = ["https://", "api.openverse.org", "/v1"].join("");
const WIKIMEDIA_API_BASE = ["https://", "commons.wikimedia.org", "/w/api.php"].join("");
const ICONIFY_API_BASE = ["https://", "api.iconify.design"].join("");
const ARCHIVE_ORG_SEARCH_BASE = ["https://", "archive.org", "/advancedsearch.php"].join("");
const ARCHIVE_ORG_METADATA_BASE = ["https://", "archive.org", "/metadata"].join("");
const ARCHIVE_ORG_DOWNLOAD_BASE = ["https://", "archive.org", "/download"].join("");
const DEFAULT_LIBRARIES_CONFIG_PATH = resolveDefaultLibrariesConfigPath();
const USER_AGENT = "StoriaStudio/0.3 (https://localhost; local-nle-video-editor)";
/** Persistent local disk cache so external library queries, SVGs & audio never re-download unnecessarily. */
const REMOTE_CACHE_DIR = resolveDefaultLibraryCacheDir();
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Simple concurrency semaphore so parallel <img> / <audio> previews never flood Wikimedia/Openverse with 429s
let activeUpstream = 0;
const upstreamWaiters: (() => void)[] = [];
async function withUpstreamSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeUpstream >= 4) {
    await new Promise<void>((resolve) => upstreamWaiters.push(resolve));
  }
  activeUpstream++;
  try {
    return await fn();
  } finally {
    activeUpstream--;
    const next = upstreamWaiters.shift();
    if (next) next();
  }
}

function sanitizeSvgText(raw: string): string {
  let svg = raw.replace(/<script[\s\S]*?<\/script>/gi, "");
  if (!/xmlns=/.test(svg) && /<svg\b/i.test(svg)) {
    svg = svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  // Ensure explicit width/height so PixiJS v8 SVG rasterization never produces 0x0 textures
  const openTagMatch = svg.match(/<svg\b[^>]*>/i);
  if (openTagMatch && !/\bwidth\s*=/.test(openTagMatch[0])) {
    svg = svg.replace(/<svg\b/i, '<svg width="512" height="512"');
  }
  return svg;
}

async function readRemoteCache(bucket: "svg" | "audio", key: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const hash = crypto.createHash("sha1").update(key).digest("hex");
    const base = path.join(REMOTE_CACHE_DIR, bucket, hash);
    const [buffer, metaRaw] = await Promise.all([
      fs.readFile(`${base}.bin`),
      fs.readFile(`${base}.json`, "utf8"),
    ]);
    const meta = JSON.parse(metaRaw) as { mimeType?: string };
    if (buffer.byteLength === 0) return null;
    return { buffer, mimeType: meta.mimeType ?? (bucket === "svg" ? "image/svg+xml" : "audio/mpeg") };
  } catch {
    return null;
  }
}

async function writeRemoteCache(bucket: "svg" | "audio", key: string, buffer: Buffer, mimeType: string): Promise<void> {
  try {
    const hash = crypto.createHash("sha1").update(key).digest("hex");
    const dir = path.join(REMOTE_CACHE_DIR, bucket);
    await fs.mkdir(dir, { recursive: true });
    const base = path.join(dir, hash);
    await Promise.all([
      fs.writeFile(`${base}.bin`, buffer),
      fs.writeFile(`${base}.json`, JSON.stringify({ mimeType, cachedAt: Date.now() }), "utf8"),
    ]);
  } catch {
    // Cache is best-effort only
  }
}

async function readSearchCache<T>(key: string, allowStale = false): Promise<T | null> {
  try {
    const hash = crypto.createHash("sha1").update(key).digest("hex");
    const filePath = path.join(REMOTE_CACHE_DIR, "search", `${hash}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { cachedAt?: number; payload?: T };
    if (!parsed.payload) return null;
    if (!allowStale && parsed.cachedAt && Date.now() - parsed.cachedAt > SEARCH_CACHE_TTL_MS) {
      return null;
    }
    return parsed.payload;
  } catch {
    return null;
  }
}

async function writeSearchCache<T>(key: string, payload: T): Promise<void> {
  try {
    const hash = crypto.createHash("sha1").update(key).digest("hex");
    const dir = path.join(REMOTE_CACHE_DIR, "search");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, `${hash}.json`),
      JSON.stringify({ cachedAt: Date.now(), payload }),
      "utf8",
    );
  } catch {
    // Best-effort cache write
  }
}

export interface LibraryCacheStats {
  cacheDir: string;
  searchEntries: number;
  svgFiles: number;
  audioFiles: number;
  totalBytes: number;
}

function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const c = cause as { code?: string; message?: string };
    const detail = [c.code, c.message].filter(Boolean).join(": ");
    if (detail) return `${err.message} (${detail})`;
  }
  return err.message;
}

async function fetchJsonWithRetry<T>(url: string, timeoutMs = 18_000, retries = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "es,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 450 * (attempt + 1)));
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  throw new Error(describeFetchError(lastErr));
}

export type LibraryId =
  | "openverse"
  | "iconify"
  | "wikimedia"
  | "internet_archive"
  | "pixel_game_sprites"
  | "openmoji_props"
  | "svg_backgrounds"
  | "local_videos"
  | "local_workspace";

export type LibraryAssetType = "sfx" | "music" | "sprites" | "backgrounds" | "vectors" | "icons";

export interface LibraryCatalogItem {
  id: LibraryId;
  name: string;
  tagline: string;
  description: string;
  kind: "online" | "builtin" | "local";
  assetTypes: LibraryAssetType[];
  license: string;
  estimatedCount: string;
  requiresApiKey: boolean;
  supportsVector: boolean;
  supportsAudio: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  websiteUrl?: string;
}

export const COMPATIBLE_LIBRARIES_DEFS: Omit<LibraryCatalogItem, "enabled">[] = [
  {
    id: "openverse",
    name: "Openverse",
    tagline: "5.2M+ SFX, música libre y vectores SVG",
    description:
      "Buscador abierto de Creative Commons con millones de efectos de sonido, pistas musicales y gráficos SVG CC0 / CC-BY sin necesidad de API Key.",
    kind: "online",
    assetTypes: ["sfx", "music", "vectors", "sprites"],
    license: "CC0 / CC-BY / Dominio Público",
    estimatedCount: "5.2M+ recursos",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: true,
    defaultEnabled: true,
    websiteUrl: "https://openverse.org",
  },
  {
    id: "iconify",
    name: "Iconify Vector Hub",
    tagline: "200k+ íconos y vectores SVG personalizables",
    description:
      "Repositorio unificado de íconos vectoriales de código abierto (Lucide, Tabler, Phosphor, Material, Heroicons) con tintado de color en vivo y edición SVG.",
    kind: "online",
    assetTypes: ["icons", "vectors"],
    license: "MIT / Apache 2.0 / CC0",
    estimatedCount: "200k+ íconos",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: false,
    defaultEnabled: true,
    websiteUrl: "https://iconify.design",
  },
  {
    id: "wikimedia",
    name: "Wikimedia Commons",
    tagline: "Ilustraciones SVG, fondos, SFX y música libre",
    description:
      "Acceso directo al archivo multimedia de Wikimedia Commons para buscar ilustraciones vectoriales, mapas, fondos históricos, efectos de sonido y música libre.",
    kind: "online",
    assetTypes: ["vectors", "sprites", "backgrounds", "sfx", "music"],
    license: "CC0 / CC-BY / Dominio Público",
    estimatedCount: "1M+ medios",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: true,
    defaultEnabled: true,
    websiteUrl: "https://commons.wikimedia.org",
  },
  {
    id: "internet_archive",
    name: "Internet Archive Audio",
    tagline: "Archivo masivo de SFX, foley, retro y música",
    description:
      "Bóveda abierta de Internet Archive con colecciones de efectos cinematográficos, foley, sonidos retro, ambientes y música de dominio público sin API Key.",
    kind: "online",
    assetTypes: ["sfx", "music"],
    license: "CC0 / Dominio Público / CC-BY",
    estimatedCount: "2M+ audios",
    requiresApiKey: false,
    supportsVector: false,
    supportsAudio: true,
    defaultEnabled: false,
    websiteUrl: "https://archive.org/details/audio",
  },
  {
    id: "pixel_game_sprites",
    name: "Game & Pixel Art Sprites",
    tagline: "Sprites pixel-art e íconos RPG nítidos",
    description:
      "Colección especializada para videojuegos y estética retro (Pixelarticons, Game-Icons, Streamline Pixel y Memory) con renderizado nítido nearest-neighbor.",
    kind: "online",
    assetTypes: ["sprites", "icons"],
    license: "CC-BY 3.0 / MIT / CC0",
    estimatedCount: "6,000+ sprites",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: false,
    defaultEnabled: false,
    websiteUrl: "https://game-icons.net",
  },
  {
    id: "openmoji_props",
    name: "OpenMoji & Noto Color Props",
    tagline: "Objetos y props vectoriales a todo color",
    description:
      "Más de 4,000 objetos, personajes, gestos y props vectoriales a color (OpenMoji, Noto Color, Twemoji y Fluent Flat) ideales para escenas animadas 2D.",
    kind: "online",
    assetTypes: ["sprites", "vectors", "icons"],
    license: "CC-BY-SA 4.0 / Apache 2.0 / MIT",
    estimatedCount: "4,000+ props",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: false,
    defaultEnabled: false,
    websiteUrl: "https://openmoji.org",
  },
  {
    id: "svg_backgrounds",
    name: "Storia SVG Backgrounds",
    tagline: "Fondos y overlays vectoriales 100% editables",
    description:
      "Colección integrada offline de escenarios, gradientes, pizarras, grillas synthwave, fondos editoriales y marcos HUD en formato SVG listos para editar en vivo.",
    kind: "builtin",
    assetTypes: ["backgrounds", "vectors"],
    license: "CC0 / Incluido en Storia Studio",
    estimatedCount: `${BUILTIN_SVG_BACKGROUNDS.length} escenarios SVG`,
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: false,
    defaultEnabled: false,
  },
  {
    id: "local_videos",
    name: "Biblioteca Local de Proyectos",
    tagline: "Recursos reutilizables de tu carpeta local de videos",
    description:
      "Indexa automáticamente fondos SVG, sprites, overlays y audios guardados en una carpeta local de producciones configurada por ti.",
    kind: "local",
    assetTypes: ["backgrounds", "sprites", "vectors", "sfx", "music"],
    license: "Local / Propio",
    estimatedCount: "Local",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: true,
    defaultEnabled: false,
  },
  {
    id: "local_workspace",
    name: "Carpeta Local de Assets",
    tagline: "Tu colección personal offline de SVGs, sprites, SFX y música",
    description:
      "Indexa una carpeta local de tu equipo con tus propios archivos SVG, efectos de sonido y música para reutilizarlos offline en cualquier proyecto.",
    kind: "local",
    assetTypes: ["icons", "vectors", "sfx", "music"],
    license: "Local / Propio",
    estimatedCount: "Local",
    requiresApiKey: false,
    supportsVector: true,
    supportsAudio: true,
    defaultEnabled: false,
  },
];

export type VectorSource =
  | "videos"
  | "workspace"
  | "iconify"
  | "openverse"
  | "wikimedia"
  | "pixel_game_sprites"
  | "openmoji_props"
  | "svg_backgrounds";
export type VectorCategory = "backgrounds" | "sprites" | "overlays" | "icons";

export interface VectorLibraryItem {
  id: string;
  name: string;
  source: VectorSource;
  category: VectorCategory;
  video?: string;
  collection?: string;
  iconifyName?: string;
  previewUrl: string;
  remoteUrl?: string;
  license: string;
  author?: string;
  sourceUrl?: string;
  tags: string[];
  suggestedPlacement: "background" | "sprite";
  defaultScaleMode: "linear" | "nearest";
}

export interface VectorSearchParams {
  q?: string;
  source?: "all" | VectorSource;
  category?: "all" | VectorCategory;
  video?: string;
  collection?: string;
  color?: string;
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}

export interface VectorSearchResponse {
  items: VectorLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: {
    videos: string[];
    categories: Record<VectorCategory, number>;
    counts: { videos: number; workspace: number };
  };
  onlineWarning?: string;
  disabledLibrary?: boolean;
}

export type AudioSource =
  | "openverse"
  | "wikimedia"
  | "internet_archive"
  | "local_workspace"
  | "local_videos";
export type AudioCategory = "sfx" | "music" | "ambience";

export interface AudioLibraryItem {
  id: string;
  name: string;
  source: AudioSource;
  provider: string;
  category: AudioCategory;
  durationSec?: number;
  license: string;
  licenseVersion?: string;
  author?: string;
  attribution?: string;
  previewUrl: string;
  remoteUrl?: string;
  sourceUrl?: string;
  video?: string;
  tags: string[];
}

export interface AudioSearchParams {
  q?: string;
  source?: "openverse" | "wikimedia" | "internet_archive" | "local" | "all";
  category?: "all" | "sfx" | "music" | "ambience" | "psx";
  license?: "all" | "cc0" | "cc-by";
  duration?: "all" | "short" | "medium" | "long";
  page?: number;
  pageSize?: number;
  refresh?: boolean;
}

export interface AudioSearchResponse {
  items: AudioLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  localCount: number;
  onlineWarning?: string;
  disabledLibrary?: boolean;
}

interface IndexedLocalFile {
  id: string;
  absPath: string;
  item: VectorLibraryItem | AudioLibraryItem;
}

export interface LibraryPathsConfig {
  videosDir: string;
  workspaceAssetsDir: string;
  directorBridge?: StickmanDirectorBridge;
  librariesConfigPath?: string;
}

function stableId(prefix: string, rawPath: string): string {
  const hash = crypto.createHash("sha1").update(rawPath).digest("hex").slice(0, 12);
  return `${prefix}_${hash}`;
}

function humanizeStem(stem: string): string {
  return stem
    .replace(/^(bg_\d+_|bg_|fg_|sprite_|ov_)/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function matchesQuery(haystack: string, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 1;
  const norm = haystack
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  let score = 0;
  for (const tok of queryTokens) {
    if (!norm.includes(tok)) return 0;
    score += norm.startsWith(tok) ? 3 : 1;
  }
  return score;
}

async function walkFiles(
  dir: string,
  exts: Set<string>,
  out: string[],
  maxDepth = 6,
  depth = 0,
): Promise<void> {
  if (!dir || depth > maxDepth) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules" || e.name === ".storia_cache") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkFiles(full, exts, out, maxDepth, depth + 1);
    } else if (e.isFile()) {
      const ext = path.extname(e.name).toLowerCase();
      if (exts.has(ext)) out.push(full);
    }
  }
}

export async function probeAudioDurationSec(filePath: string): Promise<number | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "ffprobe",
      [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        filePath,
      ],
      { timeout: 10_000 },
    );
    const val = Number.parseFloat(stdout.trim());
    return Number.isFinite(val) && val > 0 ? Number(val.toFixed(3)) : undefined;
  } catch {
    return undefined;
  }
}

function classifyAudioCategory(filePath: string, name: string): AudioCategory {
  const lower = `${filePath} ${name}`.toLowerCase();
  if (lower.includes("/music/") || lower.includes("\\music\\") || lower.includes("theme") || lower.includes("melody") || lower.includes("soundtrack")) {
    return "music";
  }
  if (lower.includes("background") || lower.includes("ambient") || lower.includes("ambience") || lower.includes("drone") || lower.includes("wind") || lower.includes("rain") || lower.includes("room")) {
    return "ambience";
  }
  return "sfx";
}

export class LibraryManager {
  private readonly videosDir: string;
  private workspaceAssetsDir: string;
  private readonly directorBridge?: StickmanDirectorBridge;
  private readonly librariesConfigPath: string;
  private readonly exposeLocalVideos: boolean;
  private exposeLocalWorkspace: boolean;

  private vectorIndex: IndexedLocalFile[] = [];
  private vectorById = new Map<string, IndexedLocalFile>();
  private vectorIndexedAt = 0;

  private audioIndex: IndexedLocalFile[] = [];
  private audioById = new Map<string, IndexedLocalFile>();
  private audioIndexedAt = 0;

  private enabledMap: Record<LibraryId, boolean> | null = null;
  private readonly cacheTtlMs = 5 * 60 * 1000;

  constructor(config: LibraryPathsConfig) {
    this.videosDir = (config.videosDir ?? "").trim();
    this.workspaceAssetsDir = (config.workspaceAssetsDir ?? "").trim();
    this.directorBridge = config.directorBridge;
    this.librariesConfigPath = path.resolve(config.librariesConfigPath ?? DEFAULT_LIBRARIES_CONFIG_PATH);
    this.exposeLocalVideos = this.videosDir.length > 0;
    this.exposeLocalWorkspace = this.workspaceAssetsDir.length > 0;
  }

  setCustomAssetsDir(dirPath: string): void {
    const clean = dirPath.trim();
    this.workspaceAssetsDir = clean ? path.resolve(clean) : "";
    this.exposeLocalWorkspace = this.workspaceAssetsDir.length > 0;
    this.vectorIndexedAt = 0;
    this.audioIndexedAt = 0;
    if (this.enabledMap) {
      this.enabledMap.local_workspace = this.exposeLocalWorkspace;
    }
  }

  private defaultEnabledMap(): Record<LibraryId, boolean> {
    const out = {} as Record<LibraryId, boolean>;
    for (const def of COMPATIBLE_LIBRARIES_DEFS) {
      if (def.id === "local_videos") {
        out[def.id] = this.exposeLocalVideos;
      } else if (def.id === "local_workspace") {
        out[def.id] = this.exposeLocalWorkspace;
      } else {
        out[def.id] = def.defaultEnabled;
      }
    }
    return out;
  }

  async getEnabledLibrariesMap(): Promise<Record<LibraryId, boolean>> {
    if (this.enabledMap) return { ...this.enabledMap };
    const defaults = this.defaultEnabledMap();
    try {
      const raw = await fs.readFile(this.librariesConfigPath, "utf8");
      const parsed = JSON.parse(raw) as { enabled?: Record<string, unknown> };
      const merged = { ...defaults };
      if (parsed?.enabled && typeof parsed.enabled === "object") {
        for (const def of COMPATIBLE_LIBRARIES_DEFS) {
          if (typeof parsed.enabled[def.id] === "boolean") {
            merged[def.id] = parsed.enabled[def.id] as boolean;
          }
        }
      }
      if (!this.exposeLocalVideos) merged.local_videos = false;
      if (!this.exposeLocalWorkspace) merged.local_workspace = false;
      this.enabledMap = merged;
      return { ...merged };
    } catch {
      this.enabledMap = defaults;
      return { ...defaults };
    }
  }

  async isLibraryEnabled(id: LibraryId): Promise<boolean> {
    const map = await this.getEnabledLibrariesMap();
    return Boolean(map[id]);
  }

  async getLibrariesCatalog(): Promise<{ libraries: LibraryCatalogItem[]; enabled: Record<LibraryId, boolean> }> {
    const enabled = await this.getEnabledLibrariesMap();
    const libraries: LibraryCatalogItem[] = COMPATIBLE_LIBRARIES_DEFS
      .filter((def) => {
        if (def.id === "local_videos" && !this.exposeLocalVideos) return false;
        if (def.id === "local_workspace" && !this.exposeLocalWorkspace) return false;
        return true;
      })
      .map((def) => ({
        ...def,
        enabled: Boolean(enabled[def.id]),
      }));
    return { libraries, enabled };
  }

  async updateEnabledLibraries(
    patch: Partial<Record<LibraryId, boolean>>,
  ): Promise<{ libraries: LibraryCatalogItem[]; enabled: Record<LibraryId, boolean> }> {
    const cur = await this.getEnabledLibrariesMap();
    const next = { ...cur };
    for (const def of COMPATIBLE_LIBRARIES_DEFS) {
      if (typeof patch[def.id] === "boolean") {
        next[def.id] = patch[def.id]!;
      }
    }
    this.enabledMap = next;
    await fs.mkdir(path.dirname(this.librariesConfigPath), { recursive: true });
    await fs.writeFile(
      this.librariesConfigPath,
      JSON.stringify({ updatedAt: new Date().toISOString(), enabled: next }, null, 2),
      "utf8",
    );
    return this.getLibrariesCatalog();
  }

  private async ensureVectorIndex(force = false): Promise<void> {
    if (!force && this.vectorIndexedAt > 0 && Date.now() - this.vectorIndexedAt < this.cacheTtlMs) {
      return;
    }

    const items: IndexedLocalFile[] = [];
    const byId = new Map<string, IndexedLocalFile>();
    const svgExts = new Set([".svg"]);

    // 1. Bespoke SVGs from previous Storia videos (storia-output/video*/assets/*)
    const videoFiles: string[] = [];
    await walkFiles(this.videosDir, svgExts, videoFiles, 5);
    for (const absPath of videoFiles) {
      const rel = path.relative(this.videosDir, absPath).replace(/\\/g, "/");
      const parts = rel.split("/");
      const videoName = parts[0] ?? "video";
      if (!rel.includes("/assets/")) continue;

      let category: VectorCategory = "sprites";
      if (rel.includes("/backgrounds/")) category = "backgrounds";
      else if (rel.includes("/overlays/")) category = "overlays";
      else if (rel.includes("/sprites/")) category = "sprites";
      else category = "icons";

      const stem = path.parse(absPath).name;
      const id = stableId("vec_vid", absPath);
      const item: VectorLibraryItem = {
        id,
        name: humanizeStem(stem) || stem,
        source: "videos",
        category,
        video: videoName,
        previewUrl: `/api/libraries/vectors/preview?id=${encodeURIComponent(id)}`,
        license: "Original Storia",
        tags: Array.from(new Set([...tokenize(stem), videoName.toLowerCase(), category])),
        suggestedPlacement: category === "backgrounds" ? "background" : "sprite",
        defaultScaleMode: "linear",
      };
      const entry: IndexedLocalFile = { id, absPath, item };
      items.push(entry);
      byId.set(id, entry);
    }

    // 2. Workspace SVG Icons Library (assets/svgs-icons)
    const wsSvgRoot = path.join(this.workspaceAssetsDir, "svgs-icons");
    const wsFiles: string[] = [];
    await walkFiles(wsSvgRoot, svgExts, wsFiles, 6);
    const seenWorkspaceKey = new Set<string>();

    for (const absPath of wsFiles) {
      const rel = path.relative(wsSvgRoot, absPath).replace(/\\/g, "/");
      const stem = path.parse(absPath).name;
      const folder = path.dirname(rel).split("/")[0] || "icons";
      // Prefer no-padding or icons-svg over duplicate padded copies
      const dedupeKey = `${stem.toLowerCase()}`;
      if (rel.startsWith("padding/") && seenWorkspaceKey.has(dedupeKey)) continue;
      seenWorkspaceKey.add(dedupeKey);

      const id = stableId("vec_ws", absPath);
      const item: VectorLibraryItem = {
        id,
        name: humanizeStem(stem) || stem,
        source: "workspace",
        category: "icons",
        collection: folder,
        previewUrl: `/api/libraries/vectors/preview?id=${encodeURIComponent(id)}`,
        license: "Local Workspace",
        tags: Array.from(new Set([...tokenize(stem), ...tokenize(folder), "icon", "svg"])),
        suggestedPlacement: "sprite",
        defaultScaleMode: "linear",
      };
      const entry: IndexedLocalFile = { id, absPath, item };
      items.push(entry);
      byId.set(id, entry);
    }

    this.vectorIndex = items;
    this.vectorById = byId;
    this.vectorIndexedAt = Date.now();
  }

  private async ensureAudioIndex(force = false): Promise<void> {
    if (!force && this.audioIndexedAt > 0 && Date.now() - this.audioIndexedAt < this.cacheTtlMs) {
      return;
    }

    const items: IndexedLocalFile[] = [];
    const byId = new Map<string, IndexedLocalFile>();
    const audioExts = new Set([".wav", ".mp3", ".ogg", ".flac", ".m4a"]);

    // 1. Workspace SFX library (assets/sfx)
    const wsSfxRoot = path.join(this.workspaceAssetsDir, "sfx");
    const wsFiles: string[] = [];
    await walkFiles(wsSfxRoot, audioExts, wsFiles, 5);
    for (const absPath of wsFiles) {
      const rel = path.relative(wsSfxRoot, absPath).replace(/\\/g, "/");
      const stem = path.parse(absPath).name;
      const folder = path.dirname(rel) === "." ? "sfx" : path.dirname(rel);
      const id = stableId("aud_ws", absPath);
      const category = classifyAudioCategory(rel, stem);
      const isPsx = rel.toLowerCase().includes("psx") || stem.toLowerCase().includes("retro");
      const item: AudioLibraryItem = {
        id,
        name: humanizeStem(stem) || stem,
        source: "local_workspace",
        provider: isPsx ? "PSX Pack" : "Workspace SFX",
        category,
        license: "CC0 / Local",
        previewUrl: `/api/libraries/audio/preview?id=${encodeURIComponent(id)}`,
        tags: Array.from(new Set([...tokenize(stem), ...tokenize(folder), category, ...(isPsx ? ["psx", "retro"] : [])])),
      };
      const entry: IndexedLocalFile = { id, absPath, item };
      items.push(entry);
      byId.set(id, entry);
    }

    // 2. Audio from previous Storia videos (storia-output/video*/assets/{sfx,music} & openverse_raw)
    const vidAudioFiles: string[] = [];
    await walkFiles(this.videosDir, audioExts, vidAudioFiles, 5);
    const seenVideoAudioStem = new Set<string>();

    for (const absPath of vidAudioFiles) {
      const rel = path.relative(this.videosDir, absPath).replace(/\\/g, "/");
      const lowerRel = rel.toLowerCase();
      // Skip exported/verify/voice narrations; keep reusable SFX, music, and Openverse downloads
      if (
        lowerRel.includes("/verify/") ||
        lowerRel.includes("final_video") ||
        lowerRel.includes("voice_") ||
        lowerRel.includes("elevenlabs_")
      ) {
        continue;
      }
      if (!lowerRel.includes("/assets/sfx/") && !lowerRel.includes("/assets/music/") && !lowerRel.includes("/openverse_raw/")) {
        continue;
      }

      const parts = rel.split("/");
      const videoName = parts[0] ?? "video";
      const stem = path.parse(absPath).name;
      const dedupeKey = `${stem.toLowerCase().replace(/_raw$/, "")}`;
      if (seenVideoAudioStem.has(dedupeKey)) continue;
      seenVideoAudioStem.add(dedupeKey);

      const category = classifyAudioCategory(rel, stem);
      const isOpenverseCached = lowerRel.includes("/openverse_raw/") || stem.toLowerCase().startsWith("ov_");
      const id = stableId("aud_vid", absPath);
      const item: AudioLibraryItem = {
        id,
        name: humanizeStem(stem.replace(/_raw$/i, "")) || stem,
        source: "local_videos",
        provider: isOpenverseCached ? `Openverse (${videoName})` : `Storia (${videoName})`,
        category,
        video: videoName,
        license: isOpenverseCached ? "CC0 / CC-BY" : "Local Video Asset",
        previewUrl: `/api/libraries/audio/preview?id=${encodeURIComponent(id)}`,
        tags: Array.from(
          new Set([
            ...tokenize(stem),
            videoName.toLowerCase(),
            category,
            ...(isOpenverseCached ? ["openverse"] : []),
          ]),
        ),
      };
      const entry: IndexedLocalFile = { id, absPath, item };
      items.push(entry);
      byId.set(id, entry);
    }

    // 3. Curated 890-asset CC0/CC-BY Stickman Video Director audio library (SFX, Transitions, Stingers, 31 BGM tracks)
    if (this.directorBridge) {
      const dirAssets = await this.directorBridge.ensureAudioLoaded(force);
      for (const da of dirAssets) {
        const id = `sd_${da.id}`;
        const category: AudioCategory =
          da.kind === "music"
            ? "music"
            : da.category.includes("amb") || da.tags.some((t) => /rain|wind|nature|outside|crowd/i.test(t))
              ? "ambience"
              : "sfx";
        const isRetro =
          da.category.includes("digital") ||
          da.styleHints.includes("B7") ||
          da.tags.some((t) => /8bit|retro|pixel|game|chiptune/i.test(t));
        const item: AudioLibraryItem = {
          id,
          name: da.title,
          source: "local_workspace",
          provider: `Director Pack (${da.category})`,
          category,
          durationSec: da.durationSec,
          license: da.licenseId,
          author: da.author,
          attribution: da.attribution,
          sourceUrl: da.sourceUrl,
          previewUrl: `/api/libraries/audio/preview?id=${encodeURIComponent(id)}`,
          tags: Array.from(
            new Set([
              ...da.tags.map((t) => t.toLowerCase()),
              ...da.roles.map((r) => r.toLowerCase()),
              ...da.styleHints.map((s) => s.toLowerCase()),
              da.kind,
              da.category.toLowerCase(),
              ...(isRetro ? ["psx", "retro"] : []),
            ]),
          ),
        };
        const entry: IndexedLocalFile = { id, absPath: da.fullPath, item };
        items.push(entry);
        byId.set(id, entry);
      }
    }

    this.audioIndex = items;
    this.audioById = byId;
    this.audioIndexedAt = Date.now();
  }

  getLocalVectorFilePath(id: string): string | null {
    return this.vectorById.get(id)?.absPath ?? null;
  }

  getLocalAudioFilePath(id: string): string | null {
    return this.audioById.get(id)?.absPath ?? null;
  }

  // ============================================================================
  // VECTOR LIBRARY SEARCH (Local Videos + Workspace 7k SVGs + Iconify + Openverse)
  // ============================================================================

  async searchVectors(params: VectorSearchParams): Promise<VectorSearchResponse> {
    await this.ensureVectorIndex(params.refresh);
    const enabled = await this.getEnabledLibrariesMap();

    const source = params.source ?? "all";
    const category = params.category ?? "all";
    const video = params.video?.trim() || "";
    const collection = params.collection?.trim() || "all";
    const color = params.color?.trim() || "";
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 36));
    const q = (params.q ?? "").trim();
    const qTokens = tokenize(q);

    // Compute local facets ONLY from enabled local libraries
    const videoSet = new Set<string>();
    const catCounts: Record<VectorCategory, number> = {
      backgrounds: 0,
      sprites: 0,
      overlays: 0,
      icons: 0,
    };
    let videosCount = 0;
    let workspaceCount = 0;

    for (const entry of this.vectorIndex) {
      const v = entry.item as VectorLibraryItem;
      if (v.source === "videos") {
        if (!enabled.local_videos) continue;
        videosCount++;
        catCounts[v.category]++;
        if (v.video) videoSet.add(v.video);
      } else if (v.source === "workspace") {
        if (!enabled.local_workspace) continue;
        workspaceCount++;
        catCounts[v.category]++;
      }
    }

    const facets = {
      videos: Array.from(videoSet).sort((a, b) => {
        const na = Number.parseInt(a.replace(/\D+/g, ""), 10);
        const nb = Number.parseInt(b.replace(/\D+/g, ""), 10);
        if (Number.isFinite(na) && Number.isFinite(nb)) return nb - na;
        return a.localeCompare(b);
      }),
      categories: catCounts,
      counts: { videos: videosCount, workspace: workspaceCount },
    };

    const emptyDisabled = (libName: string): VectorSearchResponse => ({
      items: [],
      total: 0,
      page,
      pageSize,
      hasMore: false,
      facets,
      disabledLibrary: true,
      onlineWarning: `La librería «${libName}» está deshabilitada en Ajustes > Librerías.`,
    });

    // Guard explicitly requested disabled libraries
    if (source === "videos" && !enabled.local_videos) return emptyDisabled("Biblioteca Local de Proyectos");
    if (source === "workspace" && !enabled.local_workspace) return emptyDisabled("Carpeta Local de Assets");
    if (source === "iconify" && !enabled.iconify) return emptyDisabled("Iconify Vector Hub");
    if (source === "openverse" && !enabled.openverse) return emptyDisabled("Openverse");
    if (source === "wikimedia" && !enabled.wikimedia) return emptyDisabled("Wikimedia Commons");
    if (source === "pixel_game_sprites" && !enabled.pixel_game_sprites) return emptyDisabled("Game & Pixel Art Sprites");
    if (source === "openmoji_props" && !enabled.openmoji_props) return emptyDisabled("OpenMoji & Noto Color Props");
    if (source === "svg_backgrounds" && !enabled.svg_backgrounds) return emptyDisabled("Storia SVG Backgrounds");

    // Online-only: Iconify (200k+ MIT/Apache/CC0 SVGs)
    if (source === "iconify") {
      return this.searchIconifyVectors({ q: q || "star", collection, color, page, pageSize, facets, refresh: params.refresh });
    }

    // Online-only: Openverse SVG Images (CC0 / CC-BY)
    if (source === "openverse") {
      return this.searchOpenverseVectors({
        q: q || "clock",
        page,
        pageSize,
        facets,
        refresh: params.refresh,
        allowWikimediaFallback: enabled.wikimedia,
      });
    }

    // Online-only: Dedicated Wikimedia Commons SVGs (backgrounds, illustrations, sprites)
    if (source === "wikimedia") {
      return this.searchWikimediaVectors({ q: q || "illustration", page, pageSize, facets, refresh: params.refresh });
    }

    // Online-only: Game & Pixel Art Sprites (pixelarticons, game-icons, streamline-pixel, memory)
    if (source === "pixel_game_sprites") {
      return this.searchCuratedIconifyPack({
        source: "pixel_game_sprites",
        q: q || "sword",
        prefixes: ["pixelarticons", "game-icons", "streamline-pixel", "memory"],
        color: color || undefined,
        page,
        pageSize,
        facets,
        refresh: params.refresh,
        defaultScaleMode: "nearest",
        category: "sprites",
      });
    }

    // Online-only: OpenMoji & Noto Color Vector Props
    if (source === "openmoji_props") {
      return this.searchCuratedIconifyPack({
        source: "openmoji_props",
        q: q || "rocket",
        prefixes: ["openmoji", "noto", "twemoji", "fluent-emoji-flat", "fxemoji"],
        color: undefined,
        page,
        pageSize,
        facets,
        refresh: params.refresh,
        defaultScaleMode: "linear",
        category: "sprites",
      });
    }

    // Built-in: Editable SVG Backgrounds & Overlays
    if (source === "svg_backgrounds") {
      return this.searchBuiltinSvgBackgrounds({ q, category, page, pageSize, facets });
    }

    // Local / Combined filtering (videos + workspace + builtin svg_backgrounds if enabled)
    const scored: { item: VectorLibraryItem; score: number }[] = [];
    for (const entry of this.vectorIndex) {
      const v = entry.item as VectorLibraryItem;
      if (v.source === "videos" && !enabled.local_videos) continue;
      if (v.source === "workspace" && !enabled.local_workspace) continue;
      if (source === "videos" && v.source !== "videos") continue;
      if (source === "workspace" && v.source !== "workspace") continue;
      if (category !== "all" && v.category !== category) continue;
      if (video && v.video !== video) continue;

      const haystack = `${v.name} ${v.tags.join(" ")} ${v.video ?? ""} ${v.collection ?? ""}`;
      const score = matchesQuery(haystack, qTokens);
      if (score <= 0) continue;

      // Prioritize bespoke video SVGs slightly above raw icon packs when browsing "all"
      const sourceBoost = v.source === "videos" ? 10 : 0;
      scored.push({ item: v, score: score + sourceBoost });
    }

    if (source === "all" && enabled.svg_backgrounds && !video) {
      for (const bg of BUILTIN_SVG_BACKGROUNDS) {
        if (category !== "all" && bg.category !== category) continue;
        const haystack = `${bg.name} ${bg.tags.join(" ")} svg background`;
        const score = matchesQuery(haystack, qTokens);
        if (score <= 0) continue;
        scored.push({
          item: this.builtinBgToItem(bg),
          score: score + 4,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

    const total = scored.length;
    const startIdx = (page - 1) * pageSize;
    const slice = scored.slice(startIdx, startIdx + pageSize).map((s) => s.item);

    return {
      items: slice,
      total,
      page,
      pageSize,
      hasMore: startIdx + slice.length < total,
      facets,
    };
  }

  private builtinBgToItem(bg: (typeof BUILTIN_SVG_BACKGROUNDS)[number]): VectorLibraryItem {
    return {
      id: bg.id,
      name: bg.name,
      source: "svg_backgrounds",
      category: bg.category,
      collection: "Storia SVG Backgrounds",
      previewUrl: `/api/libraries/vectors/preview?id=${encodeURIComponent(bg.id)}`,
      license: "CC0 1.0 (Storia Studio)",
      author: "Storia Studio",
      tags: bg.tags,
      suggestedPlacement: bg.category === "backgrounds" ? "background" : "sprite",
      defaultScaleMode: bg.tags.includes("pixel") ? "nearest" : "linear",
    };
  }

  private searchBuiltinSvgBackgrounds(opts: {
    q: string;
    category: "all" | VectorCategory;
    page: number;
    pageSize: number;
    facets: VectorSearchResponse["facets"];
  }): VectorSearchResponse {
    const qTokens = tokenize(opts.q);
    const scored: { item: VectorLibraryItem; score: number }[] = [];
    for (const bg of BUILTIN_SVG_BACKGROUNDS) {
      if (opts.category !== "all" && bg.category !== opts.category) continue;
      const haystack = `${bg.name} ${bg.tags.join(" ")} ${bg.category}`;
      const score = matchesQuery(haystack, qTokens);
      if (score <= 0) continue;
      scored.push({ item: this.builtinBgToItem(bg), score });
    }
    scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
    const total = scored.length;
    const startIdx = (opts.page - 1) * opts.pageSize;
    const slice = scored.slice(startIdx, startIdx + opts.pageSize).map((s) => s.item);
    return {
      items: slice,
      total,
      page: opts.page,
      pageSize: opts.pageSize,
      hasMore: startIdx + slice.length < total,
      facets: opts.facets,
    };
  }

  private async searchWikimediaVectors(opts: {
    q: string;
    page: number;
    pageSize: number;
    facets: VectorSearchResponse["facets"];
    refresh?: boolean;
  }): Promise<VectorSearchResponse> {
    const cacheKey = `wm_vec:${opts.q.toLowerCase()}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, false);
      if (hit) return { ...hit, facets: opts.facets };
    }
    try {
      const wm = await this.searchWikimediaCommonsSvgs(opts.q, opts.page, opts.pageSize);
      const items: VectorLibraryItem[] = wm.items.map((it) => ({
        ...it,
        source: "wikimedia",
      }));
      const out: Omit<VectorSearchResponse, "facets"> = {
        items,
        total: wm.total,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: wm.hasMore,
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return { ...out, facets: opts.facets };
    } catch (err) {
      const stale = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, true);
      if (stale) return { ...stale, facets: opts.facets, onlineWarning: "Cargado desde caché persistente de Wikimedia." };
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        facets: opts.facets,
        onlineWarning: `No se pudo consultar Wikimedia Commons SVG: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async searchCuratedIconifyPack(opts: {
    source: "pixel_game_sprites" | "openmoji_props";
    q: string;
    prefixes: string[];
    color?: string;
    page: number;
    pageSize: number;
    facets: VectorSearchResponse["facets"];
    refresh?: boolean;
    defaultScaleMode: "linear" | "nearest";
    category: VectorCategory;
  }): Promise<VectorSearchResponse> {
    const cacheKey = `${opts.source}:${opts.q.toLowerCase()}:${opts.page}:${opts.pageSize}:${opts.color ?? ""}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, false);
      if (hit) return { ...hit, facets: opts.facets };
    }
    try {
      const sp = new URLSearchParams({
        query: opts.q,
        limit: String(Math.min(64, Math.max(opts.page * opts.pageSize, 36))),
        prefixes: opts.prefixes.join(","),
      });
      const url = `${ICONIFY_API_BASE}/search?${sp.toString()}`;
      const data = await fetchJsonWithRetry<{
        icons?: string[];
        total?: number;
        collections?: Record<string, { name?: string; license?: { title?: string } }>;
      }>(url, 15_000, 1);

      const allIcons = data.icons ?? [];
      const startIdx = (opts.page - 1) * opts.pageSize;
      const pageIcons = allIcons.slice(startIdx, startIdx + opts.pageSize);
      const colorQs = opts.color ? `&color=${encodeURIComponent(opts.color)}` : "";

      const items: VectorLibraryItem[] = pageIcons.map((fullName) => {
        const [prefix = "icon", iconName = fullName] = fullName.split(":");
        const colInfo = data.collections?.[prefix];
        const isPixel = prefix.includes("pixel") || opts.defaultScaleMode === "nearest";
        return {
          id: `${opts.source}_${fullName}`,
          name: humanizeStem(iconName),
          source: opts.source,
          category: opts.category,
          collection: colInfo?.name ?? prefix,
          iconifyName: fullName,
          previewUrl: `/api/libraries/vectors/preview?iconify=${encodeURIComponent(fullName)}${colorQs}`,
          license: colInfo?.license?.title ?? "MIT / CC-BY",
          author: colInfo?.name ?? prefix,
          sourceUrl: `https://icon-sets.iconify.design/${prefix}/${iconName}/`,
          tags: [prefix, ...tokenize(iconName)],
          suggestedPlacement: "sprite",
          defaultScaleMode: isPixel ? "nearest" : "linear",
        };
      });

      const total = data.total ?? allIcons.length;
      const out: Omit<VectorSearchResponse, "facets"> = {
        items,
        total,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: startIdx + items.length < allIcons.length,
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return { ...out, facets: opts.facets };
    } catch (err) {
      const stale = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, true);
      if (stale) return { ...stale, facets: opts.facets, onlineWarning: "Cargado desde caché persistente." };
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        facets: opts.facets,
        onlineWarning: `No se pudo consultar ${opts.source}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async searchIconifyVectors(opts: {
    q: string;
    collection: string;
    color: string;
    page: number;
    pageSize: number;
    facets: VectorSearchResponse["facets"];
    refresh?: boolean;
  }): Promise<VectorSearchResponse> {
    const cacheKey = `iconify:${opts.q.toLowerCase()}:${opts.collection}:${opts.color}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, false);
      if (hit) return { ...hit, facets: opts.facets };
    }
    try {
      const sp = new URLSearchParams({
        query: opts.q,
        limit: String(Math.min(96, opts.page * opts.pageSize + 1)),
      });
      if (opts.collection && opts.collection !== "all") {
        sp.set("prefix", opts.collection);
      }

      const url = `${ICONIFY_API_BASE}/search?${sp.toString()}`;
      const data = await fetchJsonWithRetry<{
        icons?: string[];
        total?: number;
        collections?: Record<string, { name?: string; author?: { name?: string }; license?: { spdx?: string; title?: string } }>;
      }>(url, 14_000, 1);

      const icons = data.icons ?? [];
      const startIdx = (opts.page - 1) * opts.pageSize;
      const paged = icons.slice(startIdx, startIdx + opts.pageSize);
      const colorParam = opts.color ? `&color=${encodeURIComponent(opts.color)}` : "";

      const items: VectorLibraryItem[] = paged.map((fullName) => {
        const [prefix = "icon", iconName = fullName] = fullName.split(":");
        const colMeta = data.collections?.[prefix];
        const isPixel = prefix.includes("pixel");
        const remoteSvgUrl = `${ICONIFY_API_BASE}/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg${opts.color ? `?color=${encodeURIComponent(opts.color)}` : ""}`;
        return {
          id: `iconify_${fullName.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
          name: humanizeStem(iconName) || iconName,
          source: "iconify",
          category: "icons",
          collection: colMeta?.name ?? prefix,
          iconifyName: fullName,
          previewUrl: `/api/libraries/vectors/preview?iconify=${encodeURIComponent(fullName)}${colorParam}`,
          remoteUrl: remoteSvgUrl,
          license: colMeta?.license?.spdx ?? colMeta?.license?.title ?? "Open Source (MIT/Apache)",
          author: colMeta?.author?.name ?? prefix,
          sourceUrl: `${ICONIFY_API_BASE}/${prefix}/${iconName}.svg`,
          tags: [prefix, ...tokenize(iconName), ...(isPixel ? ["pixel_art"] : [])],
          suggestedPlacement: "sprite",
          defaultScaleMode: isPixel ? "nearest" : "linear",
        };
      });

      const total = data.total ?? icons.length;
      const out: Omit<VectorSearchResponse, "facets"> = {
        items,
        total,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: startIdx + items.length < total && items.length === opts.pageSize,
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return { ...out, facets: opts.facets };
    } catch (err) {
      const stale = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, true);
      if (stale) {
        return { ...stale, facets: opts.facets, onlineWarning: "Mostrando caché local (Iconify lento temporalmente)." };
      }
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        facets: opts.facets,
        onlineWarning: `No se pudo consultar Iconify: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /** Fast direct fallback to Wikimedia Commons SVG search when Openverse Images API times out. */
  private async searchWikimediaCommonsSvgs(
    q: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: VectorLibraryItem[]; total: number; hasMore: boolean }> {
    const offset = (page - 1) * pageSize;
    const sp = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrnamespace: "6",
      gsrsearch: `${q} filetype:drawing`,
      gsrlimit: String(Math.min(24, pageSize)),
      gsroffset: String(offset),
      prop: "imageinfo",
      iiprop: "url|mime|extmetadata",
    });
    const data = await fetchJsonWithRetry<{
      continue?: Record<string, unknown>;
      query?: {
        pages?: Record<
          string,
          {
            pageid: number;
            title?: string;
            imageinfo?: {
              url?: string;
              descriptionurl?: string;
              mime?: string;
              extmetadata?: {
                Artist?: { value?: string };
                LicenseShortName?: { value?: string };
              };
            }[];
          }
        >;
      };
    }>(`${WIKIMEDIA_API_BASE}?${sp.toString()}`, 14_000, 1);

    const pages = Object.values(data.query?.pages ?? {});
    const items: VectorLibraryItem[] = [];
    for (const p of pages) {
      const info = p.imageinfo?.[0];
      if (!info?.url) continue;
      if (!info.url.toLowerCase().endsWith(".svg") && !(info.mime ?? "").includes("svg")) continue;
      const cleanTitle = (p.title ?? "Wikimedia SVG")
        .replace(/^File:/i, "")
        .replace(/\.svg$/i, "")
        .replace(/_/g, " ")
        .trim();
      const rawArtist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim();
      items.push({
        id: `wm_svg_${p.pageid}`,
        name: cleanTitle.slice(0, 80),
        source: "openverse",
        category: "sprites",
        collection: "Wikimedia Commons",
        previewUrl: `/api/libraries/vectors/preview?url=${encodeURIComponent(info.url)}`,
        remoteUrl: info.url,
        license: info.extmetadata?.LicenseShortName?.value ?? "CC-BY / Public Domain",
        author: rawArtist ? rawArtist.slice(0, 80) : "Wikimedia Commons",
        sourceUrl: info.descriptionurl ?? info.url,
        tags: tokenize(cleanTitle).slice(0, 6),
        suggestedPlacement: "sprite",
        defaultScaleMode: "linear",
      });
    }
    return {
      items,
      total: items.length + (data.continue ? pageSize : 0),
      hasMore: Boolean(data.continue && items.length > 0),
    };
  }

  private async searchOpenverseVectors(opts: {
    q: string;
    page: number;
    pageSize: number;
    facets: VectorSearchResponse["facets"];
    refresh?: boolean;
    allowWikimediaFallback?: boolean;
  }): Promise<VectorSearchResponse> {
    const cacheKey = `ov_svg:${opts.q.toLowerCase()}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, false);
      if (hit) return { ...hit, facets: opts.facets };
    }

    try {
      const sp = new URLSearchParams({
        q: opts.q,
        extension: "svg",
        license_type: "commercial,modification",
        page: String(opts.page),
        page_size: String(Math.min(20, opts.pageSize)),
      });
      const url = `${OPENVERSE_API_BASE}/images/?${sp.toString()}`;
      const data = await fetchJsonWithRetry<{
        result_count?: number;
        page_count?: number;
        results?: {
          id: string;
          title?: string;
          url?: string;
          thumbnail?: string;
          creator?: string;
          license?: string;
          license_version?: string;
          foreign_landing_url?: string;
          source?: string;
          tags?: { name?: string }[];
        }[];
      }>(url, 16_000, 1);

      const results = data.results ?? [];
      const items: VectorLibraryItem[] = results
        .filter((r) => Boolean(r.url))
        .map((r) => {
          const thumbQs = r.thumbnail ? `&thumb=${encodeURIComponent(r.thumbnail)}` : "";
          return {
            id: `ov_svg_${r.id}`,
            name: (r.title ?? "Openverse SVG").slice(0, 80),
            source: "openverse",
            category: "sprites",
            collection: r.source ?? "Openverse",
            previewUrl: `/api/libraries/vectors/preview?url=${encodeURIComponent(r.url!)}${thumbQs}`,
            remoteUrl: r.url!,
            license: `${(r.license ?? "cc0").toUpperCase()}${r.license_version ? ` ${r.license_version}` : ""}`,
            author: r.creator ?? "Unknown",
            sourceUrl: r.foreign_landing_url ?? r.url,
            tags: (r.tags ?? []).map((t) => String(t.name ?? "")).filter(Boolean).slice(0, 6),
            suggestedPlacement: "sprite",
            defaultScaleMode: "linear",
          };
        });

      const total = data.result_count ?? items.length;
      const out: Omit<VectorSearchResponse, "facets"> = {
        items,
        total,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: opts.page < (data.page_count ?? 1),
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return { ...out, facets: opts.facets };
    } catch (err) {
      // 1. Try persistent stale cache first
      const stale = await readSearchCache<Omit<VectorSearchResponse, "facets">>(cacheKey, true);
      if (stale && stale.items.length > 0) {
        return {
          ...stale,
          facets: opts.facets,
          onlineWarning: "Cargado desde caché persistente (Openverse tardó demasiado).",
        };
      }

      // 2. Seamless fallback to direct Wikimedia Commons SVG API (only if Wikimedia is enabled)
      if (opts.allowWikimediaFallback !== false) {
        try {
          const wm = await this.searchWikimediaCommonsSvgs(opts.q, opts.page, opts.pageSize);
          if (wm.items.length > 0) {
            const out: Omit<VectorSearchResponse, "facets"> = {
              items: wm.items,
              total: wm.total,
              page: opts.page,
              pageSize: opts.pageSize,
              hasMore: wm.hasMore,
            };
            await writeSearchCache(cacheKey, out);
            return {
              ...out,
              facets: opts.facets,
              onlineWarning: "Openverse excedió el tiempo de espera; mostrando SVGs en caché desde Wikimedia Commons.",
            };
          }
        } catch {
          // Fall through to error message
        }
      }

      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        facets: opts.facets,
        onlineWarning: `No se pudo consultar Openverse SVG: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // ============================================================================
  // OPENVERSE-SFX & LOCAL AUDIO LIBRARY SEARCH
  // ============================================================================

  async searchAudio(params: AudioSearchParams): Promise<AudioSearchResponse> {
    await this.ensureAudioIndex(params.refresh);
    const enabled = await this.getEnabledLibrariesMap();

    const source = params.source ?? "openverse";
    const category = params.category ?? "all";
    const license = params.license ?? "all";
    const duration = params.duration ?? "all";
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(1, Math.min(50, params.pageSize ?? 20));
    const q = (params.q ?? "").trim();

    const enabledLocalEntries = this.audioIndex.filter((entry) => {
      const a = entry.item as AudioLibraryItem;
      if (a.source === "local_videos" && !enabled.local_videos) return false;
      if (a.source === "local_workspace" && !enabled.local_workspace) return false;
      return true;
    });
    const localCount = enabledLocalEntries.length;

    const emptyDisabled = (libName: string): AudioSearchResponse => ({
      items: [],
      total: 0,
      page,
      pageSize,
      hasMore: false,
      localCount,
      disabledLibrary: true,
      onlineWarning: `La librería «${libName}» está deshabilitada en Ajustes > Librerías.`,
    });

    const searchLocal = (): AudioLibraryItem[] => {
      const qTokens = tokenize(q);
      const scored: { item: AudioLibraryItem; score: number }[] = [];
      for (const entry of enabledLocalEntries) {
        const a = entry.item as AudioLibraryItem;
        if (category === "psx" && !a.tags.includes("psx") && !a.tags.includes("retro")) continue;
        if (category !== "all" && category !== "psx" && a.category !== category) continue;

        const haystack = `${a.name} ${a.id} ${a.author ?? ""} ${a.tags.join(" ")} ${a.provider} ${a.video ?? ""}`;
        const score = matchesQuery(haystack, qTokens);
        if (score <= 0) continue;
        scored.push({ item: a, score });
      }
      scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
      return scored.map((s) => s.item);
    };

    if (source === "local") {
      if (!enabled.local_videos && !enabled.local_workspace) {
        return emptyDisabled("Librerías Locales");
      }
      const allLocal = searchLocal();
      const startIdx = (page - 1) * pageSize;
      const slice = allLocal.slice(startIdx, startIdx + pageSize);
      return {
        items: slice,
        total: allLocal.length,
        page,
        pageSize,
        hasMore: startIdx + slice.length < allLocal.length,
        localCount,
      };
    }

    if (source === "openverse") {
      if (!enabled.openverse) return emptyDisabled("Openverse");
      const online = await this.searchOpenverseAudio({
        q: q || (category === "music" ? "cinematic ambient" : "whoosh"),
        category,
        license,
        duration,
        page,
        pageSize: Math.min(20, pageSize),
        refresh: params.refresh,
      });
      return { ...online, localCount };
    }

    if (source === "wikimedia") {
      if (!enabled.wikimedia) return emptyDisabled("Wikimedia Commons");
      const wm = await this.searchWikimediaCommonsAudio({
        q: q || (category === "music" ? "classical piano" : "bell"),
        category,
        page,
        pageSize: Math.min(20, pageSize),
        refresh: params.refresh,
      });
      return { ...wm, localCount };
    }

    if (source === "internet_archive") {
      if (!enabled.internet_archive) return emptyDisabled("Internet Archive Audio");
      const ia = await this.searchInternetArchiveAudio({
        q: q || (category === "music" ? "cinematic soundtrack" : "sound effect whoosh"),
        category,
        page,
        pageSize: Math.min(20, pageSize),
        refresh: params.refresh,
      });
      return { ...ia, localCount };
    }

    // Combined mode ("all"): ONLY query & aggregate currently enabled audio libraries
    const combinedItems: AudioLibraryItem[] = [];
    let totalCount = 0;
    let hasMore = false;
    const warnings: string[] = [];

    if (enabled.local_videos || enabled.local_workspace) {
      const localMatches = page === 1 ? searchLocal().slice(0, 8) : [];
      combinedItems.push(...localMatches);
      totalCount += localMatches.length;
    }

    const onlineTasks: Promise<Omit<AudioSearchResponse, "localCount">>[] = [];
    if (enabled.openverse) {
      onlineTasks.push(
        this.searchOpenverseAudio({
          q: q || (category === "music" ? "cinematic ambient" : "whoosh"),
          category,
          license,
          duration,
          page,
          pageSize: Math.min(14, pageSize),
          refresh: params.refresh,
        }),
      );
    }
    if (enabled.wikimedia) {
      onlineTasks.push(
        this.searchWikimediaCommonsAudio({
          q: q || (category === "music" ? "ambient music" : "sound effect"),
          category,
          page,
          pageSize: Math.min(8, pageSize),
          refresh: params.refresh,
        }),
      );
    }
    if (enabled.internet_archive) {
      onlineTasks.push(
        this.searchInternetArchiveAudio({
          q: q || (category === "music" ? "ambient soundtrack" : "sound effect"),
          category,
          page,
          pageSize: Math.min(8, pageSize),
          refresh: params.refresh,
        }),
      );
    }

    if (onlineTasks.length > 0) {
      const results = await Promise.all(onlineTasks);
      for (const r of results) {
        combinedItems.push(...r.items);
        totalCount += r.total;
        if (r.hasMore) hasMore = true;
        if (r.onlineWarning) warnings.push(r.onlineWarning);
      }
    }

    if (
      !enabled.openverse &&
      !enabled.wikimedia &&
      !enabled.internet_archive &&
      !enabled.local_videos &&
      !enabled.local_workspace
    ) {
      return emptyDisabled("Todas las librerías de audio");
    }

    return {
      items: combinedItems,
      total: totalCount,
      page,
      pageSize,
      hasMore,
      localCount,
      onlineWarning: warnings.length > 0 ? warnings[0] : undefined,
    };
  }

  private async searchWikimediaCommonsAudio(opts: {
    q: string;
    category: "all" | "sfx" | "music" | "ambience" | "psx";
    page: number;
    pageSize: number;
    refresh?: boolean;
  }): Promise<Omit<AudioSearchResponse, "localCount">> {
    const cacheKey = `wm_aud:${opts.q.toLowerCase()}:${opts.category}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, false);
      if (hit) return hit;
    }
    try {
      const offset = (opts.page - 1) * opts.pageSize;
      const catHint = opts.category === "music" ? " music" : opts.category === "ambience" ? " ambient" : "";
      const sp = new URLSearchParams({
        action: "query",
        format: "json",
        generator: "search",
        gsrnamespace: "6",
        gsrsearch: `${opts.q}${catHint} filetype:audio`,
        gsrlimit: String(Math.min(20, opts.pageSize)),
        gsroffset: String(offset),
        prop: "imageinfo",
        iiprop: "url|mime|size|extmetadata",
      });
      const data = await fetchJsonWithRetry<{
        continue?: Record<string, unknown>;
        query?: {
          pages?: Record<
            string,
            {
              pageid: number;
              title?: string;
              imageinfo?: {
                url?: string;
                descriptionurl?: string;
                mime?: string;
                duration?: number;
                extmetadata?: {
                  Artist?: { value?: string };
                  LicenseShortName?: { value?: string };
                };
              }[];
            }
          >;
        };
      }>(`${WIKIMEDIA_API_BASE}?${sp.toString()}`, 14_000, 1);

      const pages = Object.values(data.query?.pages ?? {});
      const items: AudioLibraryItem[] = [];
      for (const p of pages) {
        const info = p.imageinfo?.[0];
        if (!info?.url) continue;
        if (!/\.(ogg|oga|wav|mp3|flac)$/i.test(info.url) && !(info.mime ?? "").startsWith("audio/")) continue;
        const cleanTitle = (p.title ?? "Wikimedia Audio")
          .replace(/^File:/i, "")
          .replace(/\.(ogg|oga|wav|mp3|flac)$/i, "")
          .replace(/_/g, " ")
          .trim();
        const rawArtist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "").trim();
        const cat: AudioCategory = opts.category === "music" ? "music" : opts.category === "ambience" ? "ambience" : "sfx";
        items.push({
          id: `wm_aud_${p.pageid}`,
          name: cleanTitle.slice(0, 80),
          source: "wikimedia",
          provider: "wikimedia",
          category: cat,
          durationSec: typeof info.duration === "number" ? info.duration : undefined,
          license: info.extmetadata?.LicenseShortName?.value ?? "CC-BY / Public Domain",
          author: rawArtist ? rawArtist.slice(0, 80) : "Wikimedia Commons",
          attribution: `${cleanTitle} — Wikimedia Commons`,
          previewUrl: `/api/libraries/audio/preview?url=${encodeURIComponent(info.url)}`,
          remoteUrl: info.url,
          sourceUrl: info.descriptionurl ?? info.url,
          tags: ["wikimedia", ...tokenize(cleanTitle).slice(0, 5)],
        });
      }
      const out: Omit<AudioSearchResponse, "localCount"> = {
        items,
        total: items.length + (data.continue ? opts.pageSize : 0),
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: Boolean(data.continue && items.length > 0),
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return out;
    } catch (err) {
      const stale = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, true);
      if (stale) return { ...stale, onlineWarning: "Wikimedia Audio cargado desde caché persistente." };
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        onlineWarning: `No se pudo consultar Wikimedia Audio: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async searchInternetArchiveAudio(opts: {
    q: string;
    category: "all" | "sfx" | "music" | "ambience" | "psx";
    page: number;
    pageSize: number;
    refresh?: boolean;
  }): Promise<Omit<AudioSearchResponse, "localCount">> {
    const cacheKey = `ia_aud:${opts.q.toLowerCase()}:${opts.category}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, false);
      if (hit) return hit;
    }
    try {
      const safeTerm = opts.q.replace(/["()\\]/g, " ").trim() || "sound effect";
      const catClause =
        opts.category === "music"
          ? " AND (music OR soundtrack OR instrumental)"
          : opts.category === "ambience"
            ? " AND (ambient OR ambience OR nature)"
            : "";
      const qExpr = `mediatype:audio AND (${safeTerm})${catClause} AND (licenseurl:*creativecommons* OR licenseurl:*publicdomain*)`;
      const sp = new URLSearchParams({
        q: qExpr,
        "fl[]": "identifier,title,creator,licenseurl",
        rows: String(Math.min(12, opts.pageSize)),
        page: String(opts.page),
        output: "json",
      });
      // Append each field cleanly for Archive.org API
      const url = `${ARCHIVE_ORG_SEARCH_BASE}?q=${encodeURIComponent(qExpr)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=licenseurl&rows=${Math.min(10, opts.pageSize)}&page=${opts.page}&output=json`;
      void sp;
      const data = await fetchJsonWithRetry<{
        response?: {
          numFound?: number;
          docs?: { identifier?: string; title?: string; creator?: string | string[]; licenseurl?: string }[];
        };
      }>(url, 15_000, 1);

      const docs = (data.response?.docs ?? []).slice(0, 8);
      const items: AudioLibraryItem[] = [];
      const cat: AudioCategory = opts.category === "music" ? "music" : opts.category === "ambience" ? "ambience" : "sfx";

      // Resolve playable MP3/OGG/WAV files inside top matching Archive items
      await Promise.all(
        docs.map(async (doc) => {
          if (!doc.identifier) return;
          try {
            const meta = await fetchJsonWithRetry<{
              files?: { name?: string; format?: string; length?: string; size?: string }[];
            }>(`${ARCHIVE_ORG_METADATA_BASE}/${encodeURIComponent(doc.identifier)}/files`, 9_000, 0);
            const audioFile = (meta.files ?? []).find(
              (f) => f.name && /\.(mp3|ogg|wav)$/i.test(f.name) && Number(f.size ?? 0) < 25 * 1024 * 1024,
            );
            if (!audioFile?.name) return;
            const dlUrl = `${ARCHIVE_ORG_DOWNLOAD_BASE}/${encodeURIComponent(doc.identifier)}/${encodeURIComponent(audioFile.name)}`;
            const creatorStr = Array.isArray(doc.creator) ? doc.creator.join(", ") : doc.creator ?? "Internet Archive";
            const durNum = audioFile.length ? Number.parseFloat(audioFile.length) : undefined;
            const title = (doc.title || audioFile.name.replace(/\.(mp3|ogg|wav)$/i, "")).slice(0, 80);
            items.push({
              id: `ia_aud_${doc.identifier}`,
              name: title,
              source: "internet_archive",
              provider: "internet_archive",
              category: cat,
              durationSec: Number.isFinite(durNum) ? durNum : undefined,
              license: doc.licenseurl?.includes("publicdomain") ? "Public Domain / CC0" : "CC / Archive.org",
              author: creatorStr.slice(0, 80),
              attribution: `${title} by ${creatorStr} (Internet Archive)`,
              previewUrl: `/api/libraries/audio/preview?url=${encodeURIComponent(dlUrl)}`,
              remoteUrl: dlUrl,
              sourceUrl: `https://archive.org/details/${encodeURIComponent(doc.identifier)}`,
              tags: ["archive.org", ...tokenize(title).slice(0, 5)],
            });
          } catch {
            // Skip unreachable individual item
          }
        }),
      );

      const numFound = data.response?.numFound ?? items.length;
      const out: Omit<AudioSearchResponse, "localCount"> = {
        items,
        total: numFound,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: opts.page * 10 < numFound,
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return out;
    } catch (err) {
      const stale = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, true);
      if (stale) return { ...stale, onlineWarning: "Internet Archive Audio cargado desde caché persistente." };
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        onlineWarning: `No se pudo consultar Internet Archive Audio: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async searchOpenverseAudio(opts: {
    q: string;
    category: string;
    license: string;
    duration: string;
    page: number;
    pageSize: number;
    refresh?: boolean;
  }): Promise<Omit<AudioSearchResponse, "localCount">> {
    const cacheKey = `ov_aud:${opts.q.toLowerCase()}:${opts.category}:${opts.license}:${opts.duration}:${opts.page}:${opts.pageSize}`;
    if (!opts.refresh) {
      const hit = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, false);
      if (hit) return hit;
    }
    try {
      const effectiveQuery =
        opts.category === "psx" && !/(retro|8bit|8-bit|psx|pixel|chip)/i.test(opts.q)
          ? `${opts.q} retro`
          : opts.q;

      const sp = new URLSearchParams({
        q: effectiveQuery,
        page: String(opts.page),
        page_size: String(opts.pageSize),
      });

      if (opts.license === "cc0") {
        sp.set("license", "cc0,pdm");
      } else if (opts.license === "cc-by") {
        sp.set("license", "by");
      } else {
        sp.set("license_type", "commercial,modification");
      }

      // Include Wikimedia Audio & Jamendo alongside Freesound so playable CC0/CC-BY audio is always available
      if (opts.category === "music") {
        sp.set("category", "music");
      } else if (opts.category === "sfx" || opts.category === "psx" || opts.category === "ambience") {
        sp.set("source", "wikimedia_audio,jamendo,freesound");
      }

      if (opts.duration === "short") {
        sp.set("length", "shortest");
      } else if (opts.duration === "medium") {
        sp.set("length", "short");
      } else if (opts.duration === "long") {
        sp.set("length", "medium,long");
      }

      const url = `${OPENVERSE_API_BASE}/audio/?${sp.toString()}`;
      const data = await fetchJsonWithRetry<{
        result_count?: number;
        page_count?: number;
        results?: {
          id: string;
          title?: string;
          url?: string;
          creator?: string;
          license?: string;
          license_version?: string;
          attribution?: string;
          duration?: number; // milliseconds in Openverse API
          source?: string;
          category?: string;
          foreign_landing_url?: string;
          tags?: { name?: string }[];
        }[];
      }>(url, 18_000, 1);

      let results = (data.results ?? []).filter((r) => Boolean(r.url));

      // Also fetch Wikimedia/Jamendo specifically if Openverse returned only Freesound entries
      // (Freesound's CDN often blocks headless/server proxies with HTTP 403 while Wikimedia & Jamendo stream cleanly)
      const hasDirectlyStreamable = results.some(
        (r) => (r.source ?? "").toLowerCase() !== "freesound",
      );
      if (!hasDirectlyStreamable && opts.category !== "music") {
        try {
          const spAlt = new URLSearchParams(sp);
          spAlt.set("source", "wikimedia_audio,jamendo");
          spAlt.set("page_size", String(Math.min(10, opts.pageSize)));
          const altRes = await fetch(`${OPENVERSE_API_BASE}/audio/?${spAlt.toString()}`, {
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(8_000),
          });
          if (altRes.ok) {
            const altData = (await altRes.json()) as typeof data;
            const altItems = (altData.results ?? []).filter((r) => Boolean(r.url));
            if (altItems.length > 0) {
              const seen = new Set(altItems.map((x) => x.id));
              results = [...altItems, ...results.filter((x) => !seen.has(x.id))].slice(0, opts.pageSize);
            }
          }
        } catch {
          // Best-effort secondary query
        }
      }

      // Rank reliably streamable sources (wikimedia_audio / jamendo) ahead of freesound CDN
      results.sort((a, b) => {
        const score = (s?: string) => {
          const k = (s ?? "").toLowerCase();
          if (k === "jamendo") return 2;
          if (k === "wikimedia_audio") return 1;
          return 0;
        };
        return score(b.source) - score(a.source);
      });

      // Fine-grained duration filter (Openverse `shortest` is <= 30s; we refine for crisp one-shots)
      if (opts.duration === "short") {
        const refined = results.filter((r) => !r.duration || r.duration <= 4500);
        if (refined.length > 0) results = refined;
      } else if (opts.duration === "medium") {
        const refined = results.filter((r) => !r.duration || (r.duration >= 2500 && r.duration <= 20000));
        if (refined.length > 0) results = refined;
      }

      const items: AudioLibraryItem[] = results.map((r) => {
        const durSec = typeof r.duration === "number" && r.duration > 0 ? Number((r.duration / 1000).toFixed(2)) : undefined;
        const catRaw = (r.category ?? "").toLowerCase();
        const cat: AudioCategory =
          catRaw.includes("music") || opts.category === "music"
            ? "music"
            : opts.category === "ambience" || (durSec !== undefined && durSec > 18)
              ? "ambience"
              : "sfx";

        const licUpper = (r.license ?? "cc0").toUpperCase();
        const licFull = r.license_version ? `${licUpper} ${r.license_version}` : licUpper;

        return {
          id: `ov_aud_${r.id}`,
          name: (r.title ?? "Openverse Audio").slice(0, 96),
          source: "openverse",
          provider: r.source ?? "openverse",
          category: cat,
          durationSec: durSec,
          license: licFull,
          licenseVersion: r.license_version,
          author: r.creator ?? "Unknown",
          attribution: r.attribution,
          previewUrl: `/api/libraries/audio/preview?url=${encodeURIComponent(r.url!)}`,
          remoteUrl: r.url!,
          sourceUrl: r.foreign_landing_url ?? r.url,
          tags: (r.tags ?? []).map((t) => String(t.name ?? "")).filter(Boolean).slice(0, 6),
        };
      });

      const out: Omit<AudioSearchResponse, "localCount"> = {
        items,
        total: data.result_count ?? items.length,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: opts.page < (data.page_count ?? 1),
      };
      if (items.length > 0) await writeSearchCache(cacheKey, out);
      return out;
    } catch (err) {
      const stale = await readSearchCache<Omit<AudioSearchResponse, "localCount">>(cacheKey, true);
      if (stale && stale.items.length > 0) {
        return {
          ...stale,
          onlineWarning: "Mostrando caché local (Openverse Audio tardó demasiado).",
        };
      }
      return {
        items: [],
        total: 0,
        page: opts.page,
        pageSize: opts.pageSize,
        hasMore: false,
        onlineWarning: `Openverse Audio no disponible ahora: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getCacheStats(): Promise<LibraryCacheStats> {
    const countDir = async (sub: string, extFilter?: string) => {
      let count = 0;
      let bytes = 0;
      try {
        const dir = path.join(REMOTE_CACHE_DIR, sub);
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isFile()) continue;
          const st = await fs.stat(path.join(dir, e.name));
          bytes += st.size;
          if (!extFilter || e.name.endsWith(extFilter)) count++;
        }
      } catch {
        // Dir doesn't exist yet
      }
      return { count, bytes };
    };
    const [s, v, a] = await Promise.all([
      countDir("search", ".json"),
      countDir("svg", ".bin"),
      countDir("audio", ".bin"),
    ]);
    return {
      cacheDir: REMOTE_CACHE_DIR,
      searchEntries: s.count,
      svgFiles: v.count,
      audioFiles: a.count,
      totalBytes: s.bytes + v.bytes + a.bytes,
    };
  }

  async clearCache(): Promise<LibraryCacheStats> {
    await fs.rm(REMOTE_CACHE_DIR, { recursive: true, force: true }).catch(() => {});
    return this.getCacheStats();
  }

  /**
   * Resolves & reads an SVG (or fallback thumbnail preview) either from the local index,
   * Iconify API, or a validated HTTPS URL with concurrency throttling & disk caching.
   */
  async fetchVectorSvgBytes(params: {
    id?: string;
    iconifyName?: string;
    url?: string;
    fallbackThumb?: string;
    color?: string;
  }): Promise<{ buffer: Buffer; filename: string; mimeType: string; sourceUrl?: string }> {
    if (params.id) {
      if (params.id.startsWith("svgbg:")) {
        const bg = findBuiltinSvgBackground(params.id);
        if (!bg) {
          throw Object.assign(new Error(`Built-in SVG background '${params.id}' not found`), { statusCode: 404 });
        }
        const safeSlug = bg.id.replace(/^svgbg:/, "");
        return {
          buffer: Buffer.from(bg.svg, "utf8"),
          filename: `${safeSlug}.svg`,
          mimeType: "image/svg+xml; charset=utf-8",
        };
      }
      await this.ensureVectorIndex(false);
      const localPath = this.getLocalVectorFilePath(params.id);
      if (!localPath) {
        throw Object.assign(new Error(`Local vector '${params.id}' not found in index`), { statusCode: 404 });
      }
      const buffer = await fs.readFile(localPath);
      return { buffer, filename: path.basename(localPath), mimeType: "image/svg+xml; charset=utf-8" };
    }

    if (params.iconifyName) {
      const [prefix, iconName] = params.iconifyName.split(":");
      if (!prefix || !iconName || !/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(iconName)) {
        throw Object.assign(new Error("Invalid iconify icon identifier"), { statusCode: 400 });
      }
      const qs = params.color ? `?color=${encodeURIComponent(params.color)}` : "";
      const targetUrl = `${ICONIFY_API_BASE}/${encodeURIComponent(prefix)}/${encodeURIComponent(iconName)}.svg${qs}`;
      const cached = await readRemoteCache("svg", targetUrl);
      if (cached) {
        return { buffer: cached.buffer, filename: `${prefix}_${iconName}.svg`, mimeType: cached.mimeType, sourceUrl: targetUrl };
      }

      const svgText = await withUpstreamSlot(async () => {
        const res = await fetch(targetUrl, {
          headers: { "User-Agent": USER_AGENT, Accept: "image/svg+xml,*/*" },
          redirect: "follow",
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw Object.assign(new Error(`Failed to fetch Iconify SVG (HTTP ${res.status})`), { statusCode: 502 });
        }
        return sanitizeSvgText(await res.text());
      });

      const buffer = Buffer.from(svgText, "utf8");
      await writeRemoteCache("svg", targetUrl, buffer, "image/svg+xml; charset=utf-8");
      return {
        buffer,
        filename: `${prefix}_${iconName}.svg`,
        mimeType: "image/svg+xml; charset=utf-8",
        sourceUrl: targetUrl,
      };
    }

    if (params.url) {
      const parsed = await assertSafePublicRemoteUrl(params.url);

      const cacheKey = `${parsed.toString()}::${params.fallbackThumb ? "preview" : "raw"}`;
      const cached = await readRemoteCache("svg", cacheKey);
      const rawName = path.basename(parsed.pathname) || `vector_${Date.now()}.svg`;
      const safeSvgName = rawName.endsWith(".svg") ? rawName : `${rawName}.svg`;
      if (cached) {
        return { buffer: cached.buffer, filename: safeSvgName, mimeType: cached.mimeType, sourceUrl: parsed.toString() };
      }

      const fetched = await withUpstreamSlot(async () => {
        const tryFetch = async (u: string): Promise<Response | null> => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const { res: r } = await safeFetchPublicUrl(u, {
                headers: {
                  "User-Agent": USER_AGENT,
                  Accept: "image/svg+xml,image/*,*/*;q=0.8",
                },
                signal: AbortSignal.timeout(14_000),
              });
              if (r.status === 429 && attempt === 0) {
                await new Promise((res) => setTimeout(res, 450));
                continue;
              }
              if (r.ok) return r;
              return null;
            } catch (err) {
              const code = (err as { statusCode?: number })?.statusCode;
              if (code === 400 || code === 403) throw err;
              return null;
            }
          }
          return null;
        };

        let res = await tryFetch(parsed.toString());
        if (!res && params.fallbackThumb) {
          res = await tryFetch(params.fallbackThumb);
        }
        if (!res) {
          throw Object.assign(new Error("Failed to download remote vector"), { statusCode: 502 });
        }

        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        const ab = await res.arrayBuffer();
        if (ab.byteLength > 8 * 1024 * 1024) {
          throw Object.assign(new Error("Remote SVG exceeds 8 MB limit"), { statusCode: 413 });
        }
        const rawBuf = Buffer.from(ab);
        const asText = rawBuf.toString("utf8");
        const looksSvg = ct.includes("svg") || asText.trimStart().startsWith("<svg") || asText.includes("<svg");
        if (looksSvg) {
          const clean = Buffer.from(sanitizeSvgText(asText), "utf8");
          return { buffer: clean, mimeType: "image/svg+xml; charset=utf-8" };
        }
        return { buffer: rawBuf, mimeType: ct.split(";")[0]?.trim() || "image/png" };
      });

      await writeRemoteCache("svg", cacheKey, fetched.buffer, fetched.mimeType);
      return {
        buffer: fetched.buffer,
        filename: safeSvgName,
        mimeType: fetched.mimeType,
        sourceUrl: parsed.toString(),
      };
    }

    throw Object.assign(new Error("Provide id, iconifyName, or url"), { statusCode: 400 });
  }

  /**
   * Resolves & reads an audio buffer either from the local index or a validated HTTPS Openverse URL
   * with disk caching, redirect handling, and variant fallback.
   */
  async fetchAudioBytes(params: {
    id?: string;
    url?: string;
  }): Promise<{ buffer: Buffer; filename: string; mimeType: string; sourceUrl?: string }> {
    if (params.id) {
      await this.ensureAudioIndex(false);
      const localPath = this.getLocalAudioFilePath(params.id);
      if (!localPath) {
        throw Object.assign(new Error(`Local audio '${params.id}' not found in index`), { statusCode: 404 });
      }
      const buffer = await fs.readFile(localPath);
      const ext = path.extname(localPath).toLowerCase();
      const mimeType =
        ext === ".wav" ? "audio/wav" : ext === ".ogg" ? "audio/ogg" : ext === ".flac" ? "audio/flac" : "audio/mpeg";
      return { buffer, filename: path.basename(localPath), mimeType };
    }

    if (params.url) {
      const parsed = await assertSafePublicRemoteUrl(params.url);

      const cached = await readRemoteCache("audio", parsed.toString());
      const base = path.parse(path.basename(parsed.pathname) || `openverse_${Date.now()}`).name;
      if (cached) {
        const ext = cached.mimeType.includes("wav") ? ".wav" : cached.mimeType.includes("ogg") ? ".ogg" : ".mp3";
        return {
          buffer: cached.buffer,
          filename: `${base}${ext}`,
          mimeType: cached.mimeType,
          sourceUrl: parsed.toString(),
        };
      }

      const candidates = [parsed.toString()];
      if (parsed.hostname.includes("freesound.org") && parsed.pathname.endsWith("-hq.mp3")) {
        candidates.push(parsed.toString().replace("-hq.mp3", "-lq.mp3"));
        candidates.push(parsed.toString().replace("-hq.mp3", "-hq.ogg"));
      }

      const fetched = await withUpstreamSlot(async () => {
        let lastStatus = 502;
        for (const candidateUrl of candidates) {
          try {
            const headers: Record<string, string> = {
              "User-Agent": USER_AGENT,
              Accept: "audio/*,*/*;q=0.8",
            };
            if (candidateUrl.includes("freesound.org")) {
              headers["Referer"] = "https://freesound.org/";
            }
            const { res, finalUrl } = await safeFetchPublicUrl(candidateUrl, {
              headers,
              signal: AbortSignal.timeout(20_000),
            });
            lastStatus = res.status;
            if (!res.ok) continue;
            const ab = await res.arrayBuffer();
            if (ab.byteLength === 0) continue;
            if (ab.byteLength > 32 * 1024 * 1024) {
              throw Object.assign(new Error("Remote audio exceeds 32 MB limit"), { statusCode: 413 });
            }
            const ct = res.headers.get("content-type")?.split(";")[0]?.trim() || "audio/mpeg";
            return { buffer: Buffer.from(ab), ct, finalUrl };
          } catch (err) {
            const code = (err as { statusCode?: number })?.statusCode;
            if (code === 400 || code === 403 || code === 413) throw err;
          }
        }
        throw Object.assign(
          new Error(`El servidor de origen rechazó la descarga del audio (HTTP ${lastStatus})`),
          { statusCode: lastStatus === 403 ? 403 : 502 },
        );
      });

      const extFromUrl = path.extname(new URL(fetched.finalUrl).pathname).toLowerCase();
      const ext =
        [".mp3", ".wav", ".ogg", ".flac", ".m4a"].includes(extFromUrl)
          ? extFromUrl
          : fetched.ct.includes("wav")
            ? ".wav"
            : fetched.ct.includes("ogg")
              ? ".ogg"
              : ".mp3";
      const mimeType = fetched.ct.startsWith("audio/") || fetched.ct === "application/ogg" ? fetched.ct : "audio/mpeg";

      await writeRemoteCache("audio", parsed.toString(), fetched.buffer, mimeType);
      return {
        buffer: fetched.buffer,
        filename: `${base}${ext}`,
        mimeType,
        sourceUrl: parsed.toString(),
      };
    }

    throw Object.assign(new Error("Provide id or url"), { statusCode: 400 });
  }
}

export async function appendProjectCredit(
  projectDir: string,
  line: string,
): Promise<void> {
  const creditsPath = path.join(projectDir, "credits.txt");
  let existing = "";
  try {
    existing = await fs.readFile(creditsPath, "utf8");
  } catch {
    existing = "# Storia Studio — Asset Attribution & Credits\n\n";
  }
  if (existing.includes(line)) return;
  await fs.writeFile(creditsPath, `${existing.trimEnd()}\n${line}\n`, "utf8");
}
