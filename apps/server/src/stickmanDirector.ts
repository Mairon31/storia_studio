import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Default path to the installed Stickman Video Director skill bundle:
 * `M:\Documentos\exports\stickman-video-director\skills\directing-stickman-videos`
 */
const DEFAULT_DIRECTOR_ROOT = path.resolve(
  __dirname,
  "../../../../exports/stickman-video-director/skills/directing-stickman-videos",
);

export interface DirectorAudioAsset {
  id: string;
  title: string;
  kind: "sfx" | "transition" | "stinger" | "music";
  category: string;
  tags: string[];
  roles: string[];
  styleHints: string[];
  author: string;
  licenseId: string;
  attribution: string;
  sourceUrl?: string;
  durationSec: number;
  relativePath: string;
  fullPath: string;
}

export interface BundledFontEntry {
  id: string;
  family: string;
  filename: string;
  url: string;
  sizeBytes: number;
  license: string;
  fullPath: string;
}

interface RawCatalogAsset {
  id: string;
  title?: string;
  kind: "sfx" | "transition" | "stinger" | "music";
  category?: string;
  tags?: string[];
  roles?: string[];
  style_hints?: string[];
  author?: string;
  source_url?: string;
  path: string;
  duration?: number;
  license?: {
    id?: string;
    attribution?: string;
  };
}

interface RawSelectionLayer {
  tags_any?: string[];
  tags_all?: string[];
  roles_any?: string[];
  categories?: string[];
}

interface RawSelectionProfile {
  intent?: string;
  notes?: string[];
  music?: RawSelectionLayer | null;
  sfx?: RawSelectionLayer | null;
}

interface RawAudioCatalog {
  schema_version: number;
  assets: RawCatalogAsset[];
  selection_profiles?: Record<string, Record<string, RawSelectionProfile>>;
}

export class StickmanDirectorBridge {
  readonly rootDir: string;
  readonly audioLibRoot: string;
  readonly fontsDir: string;
  readonly referencesDir: string;

  private loadedAudio = false;
  private audioAssets: DirectorAudioAsset[] = [];
  private audioById = new Map<string, DirectorAudioAsset>();
  private selectionProfiles: Record<string, Record<string, RawSelectionProfile>> = {};
  private fontsCache: BundledFontEntry[] | null = null;

  constructor(directorRootDir?: string) {
    const isDesktop = process.env.STORIA_DESKTOP_APP === "1" || process.env.STORIA_DESKTOP_APP === "true";
    const resolved =
      directorRootDir ??
      process.env.STICKMAN_DIRECTOR_DIR ??
      (isDesktop ? "" : DEFAULT_DIRECTOR_ROOT);
    this.rootDir = resolved ? path.resolve(resolved) : "";
    this.audioLibRoot = this.rootDir ? path.join(this.rootDir, "assets", "b-audio-library") : "";
    this.fontsDir = this.rootDir ? path.join(this.rootDir, "assets", "fonts") : "";
    this.referencesDir = this.rootDir ? path.join(this.rootDir, "references") : "";
  }

  async isAvailable(): Promise<boolean> {
    if (!this.audioLibRoot) return false;
    try {
      const st = await fs.stat(this.audioLibRoot);
      return st.isDirectory();
    } catch {
      return false;
    }
  }

  async ensureAudioLoaded(force = false): Promise<DirectorAudioAsset[]> {
    if (this.loadedAudio && !force) return this.audioAssets;
    this.loadedAudio = true;
    this.audioAssets = [];
    this.audioById.clear();
    this.selectionProfiles = {};

    const catalogPath = path.join(this.audioLibRoot, "catalog.json");
    try {
      const raw = await fs.readFile(catalogPath, "utf8");
      const parsed = JSON.parse(raw) as RawAudioCatalog;
      this.selectionProfiles = parsed.selection_profiles ?? {};

      for (const a of parsed.assets ?? []) {
        if (!a?.id || !a?.path) continue;
        const normalizedRel = a.path.replace(/\\/g, "/");
        if (normalizedRel.includes("..") || path.isAbsolute(normalizedRel)) continue;
        const fullPath = path.resolve(this.audioLibRoot, normalizedRel);
        if (!fullPath.startsWith(this.audioLibRoot)) continue;

        const entry: DirectorAudioAsset = {
          id: a.id,
          title: a.title || a.id,
          kind: a.kind,
          category: a.category || a.kind,
          tags: Array.isArray(a.tags) ? a.tags.filter((x) => typeof x === "string") : [],
          roles: Array.isArray(a.roles) ? a.roles.filter((x) => typeof x === "string") : [],
          styleHints: Array.isArray(a.style_hints) ? a.style_hints.filter((x) => typeof x === "string") : [],
          author: a.author || "Stickman Audio Library",
          licenseId: a.license?.id || "CC0-1.0",
          attribution: a.license?.attribution || `${a.title || a.id} — ${a.author || "Unknown"} (${a.license?.id || "CC0"})`,
          sourceUrl: a.source_url,
          durationSec: typeof a.duration === "number" && Number.isFinite(a.duration) ? Number(a.duration.toFixed(3)) : 1.0,
          relativePath: normalizedRel,
          fullPath,
        };
        this.audioAssets.push(entry);
        this.audioById.set(entry.id, entry);
      }
    } catch {
      // Directory not installed on this machine; degrade gracefully
    }

    return this.audioAssets;
  }

  async getAudioById(id: string): Promise<DirectorAudioAsset | null> {
    await this.ensureAudioLoaded();
    return this.audioById.get(id) ?? null;
  }

  /**
   * Style + narrative beat recommender ported directly from `audio-library.mjs`.
   */
  async recommendAudio(opts: {
    styleCode: string;
    beat?: string;
    query?: string;
    limit?: number;
  }): Promise<{
    style: string;
    beat: string;
    availableBeats: string[];
    intent: string | null;
    music: DirectorAudioAsset[];
    sfx: DirectorAudioAsset[];
    totalLibraryAssets: number;
  }> {
    await this.ensureAudioLoaded();
    const limit = Math.max(1, Math.min(20, opts.limit ?? 5));
    const rawStyle = (opts.styleCode || "B1").toUpperCase();
    const matchCode = rawStyle.match(/B[1-9]/)?.[0] ?? "*";
    const exact = this.selectionProfiles[matchCode] ?? {};
    const shared = this.selectionProfiles["*"] ?? {};
    const availableBeats = Array.from(new Set([...Object.keys(exact), ...Object.keys(shared)])).sort();

    const beat = opts.beat?.trim() || availableBeats[0] || "opening";
    const profile = exact[beat] ?? shared[beat];

    const scoreLayer = (layerType: "music" | "sfx", sel?: RawSelectionLayer | null): DirectorAudioAsset[] => {
      const qTerms = (opts.query ?? "")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      const pool = this.audioAssets.filter((a) =>
        layerType === "music" ? a.kind === "music" : a.kind !== "music",
      );

      const scored: { asset: DirectorAudioAsset; score: number }[] = [];
      for (const a of pool) {
        let score = 0;
        const tagSet = new Set(a.tags.map((t) => t.toLowerCase()));
        const roleSet = new Set(a.roles.map((r) => r.toLowerCase()));
        const hintSet = new Set(a.styleHints.map((h) => h.toUpperCase()));

        if (sel) {
          const anyTags = (sel.tags_any ?? []).filter((t) => tagSet.has(t.toLowerCase()));
          const allTags = (sel.tags_all ?? []).filter((t) => tagSet.has(t.toLowerCase()));
          const roles = (sel.roles_any ?? []).filter((r) => roleSet.has(r.toLowerCase()));
          const cats = (sel.categories ?? []).filter((c) => c.toLowerCase() === a.category.toLowerCase());

          if (sel.tags_any?.length && anyTags.length === 0) continue;
          if (sel.tags_all?.length && allTags.length !== sel.tags_all.length) continue;
          if (sel.roles_any?.length && roles.length === 0) continue;
          if (sel.categories?.length && cats.length === 0) continue;

          score += anyTags.length * 4 + allTags.length * 6 + roles.length * 5 + cats.length * 4;
        }

        if (matchCode !== "*" && hintSet.has(matchCode)) score += 6;
        if (qTerms.length > 0) {
          const hay = `${a.id} ${a.title} ${a.category} ${a.tags.join(" ")} ${a.roles.join(" ")}`.toLowerCase();
          const matched = qTerms.filter((t) => hay.includes(t)).length;
          if (matched === 0 && !sel) continue;
          score += matched * 5;
        } else if (!sel && score === 0) {
          score = 1;
        }

        if (score > 0) scored.push({ asset: a, score });
      }

      scored.sort((x, y) => y.score - x.score || x.asset.title.localeCompare(y.asset.title));
      return scored.slice(0, limit).map((s) => s.asset);
    };

    return {
      style: matchCode,
      beat,
      availableBeats,
      intent: profile?.intent ?? null,
      music: scoreLayer("music", profile?.music),
      sfx: scoreLayer("sfx", profile?.sfx),
      totalLibraryAssets: this.audioAssets.length,
    };
  }

  /**
   * Lists all bundled OFL `.ttf`/`.otf` fonts inside `assets/fonts/`.
   */
  async listBundledFonts(refresh = false): Promise<BundledFontEntry[]> {
    if (this.fontsCache && !refresh) return this.fontsCache;
    const out: BundledFontEntry[] = [];
    try {
      const entries = await fs.readdir(this.fontsDir, { withFileTypes: true });
      for (const e of entries) {
        if (!e.isFile()) continue;
        const ext = path.extname(e.name).toLowerCase();
        if (ext !== ".ttf" && ext !== ".otf" && ext !== ".woff2") continue;
        const fullPath = path.join(this.fontsDir, e.name);
        const st = await fs.stat(fullPath);
        const family = path.parse(e.name).name;
        out.push({
          id: family.toLowerCase(),
          family,
          filename: e.name,
          url: `/api/fonts/${encodeURIComponent(e.name)}`,
          sizeBytes: st.size,
          license: "SIL Open Font License 1.1 (OFL)",
          fullPath,
        });
      }
    } catch {
      // Fonts dir missing
    }
    out.sort((a, b) => a.family.localeCompare(b.family));
    this.fontsCache = out;
    return out;
  }

  async resolveBundledFontPath(filename: string): Promise<string | null> {
    const safe = path.basename(filename);
    const fonts = await this.listBundledFonts();
    const match = fonts.find((f) => f.filename === safe);
    return match ? match.fullPath : null;
  }

  /**
   * Lists available direction & reference guides in `references/*.md`.
   */
  async listReferenceGuides(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.referencesDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith(".md"))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  }

  async readReferenceGuide(filename: string, maxChars = 14000): Promise<{ filename: string; content: string; truncated: boolean } | null> {
    const safe = path.basename(filename);
    if (!safe.endsWith(".md")) return null;
    const full = path.resolve(this.referencesDir, safe);
    if (!full.startsWith(this.referencesDir)) return null;
    try {
      const raw = await fs.readFile(full, "utf8");
      const truncated = raw.length > maxChars;
      return {
        filename: safe,
        content: truncated ? `${raw.slice(0, maxChars)}\n\n[... truncado a ${maxChars} caracteres ...]` : raw,
        truncated,
      };
    } catch {
      return null;
    }
  }
}
