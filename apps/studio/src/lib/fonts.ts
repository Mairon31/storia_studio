export const BUNDLED_FONT_PRESETS = [
  "Anton",
  "ArchivoBlack",
  "Caveat",
  "NotoSans",
  "Nunito",
] as const;

export type FontCategory = "impact" | "modern" | "handwritten" | "serif" | "retro";

export interface FontCatalogEntry {
  family: string;
  label: string;
  category: FontCategory;
  sample: string;
  bundled?: boolean;
  /** CSS font-family name used when rendering (matches @font-face / Google Fonts). */
  cssFamily?: string;
}

export const FONT_CATALOG: FontCatalogEntry[] = [
  // Impacto / Viral / Títulos
  { family: "Anton", label: "Anton", category: "impact", sample: "IMPACTO VIRAL", bundled: true },
  { family: "ArchivoBlack", label: "Archivo Black", category: "impact", sample: "TITULAR FUERTE", bundled: true },
  { family: "Bebas Neue", label: "Bebas Neue", category: "impact", sample: "CINE POSTER" },
  { family: "Oswald", label: "Oswald", category: "impact", sample: "TITULAR PRO" },
  { family: "Bangers", label: "Bangers", category: "impact", sample: "¡CÓMIC POP!" },
  { family: "Rubik Mono One", label: "Rubik Mono", category: "impact", sample: "BLOQUE 3D" },
  { family: "Black Ops One", label: "Black Ops", category: "impact", sample: "ACCIÓN" },
  { family: "Righteous", label: "Righteous", category: "impact", sample: "URBANO" },

  // Modernas / Limpias / Editorial Sans
  { family: "Figtree", label: "Figtree", category: "modern", sample: "Limpio y moderno" },
  { family: "Inter", label: "Inter", category: "modern", sample: "Diseño claro" },
  { family: "Montserrat", label: "Montserrat", category: "modern", sample: "ESTILO PRO" },
  { family: "Poppins", label: "Poppins", category: "modern", sample: "Suave y actual" },
  { family: "Space Grotesk", label: "Space Grotesk", category: "modern", sample: "Tech Futuro" },
  { family: "Outfit", label: "Outfit", category: "modern", sample: "Minimalista" },
  { family: "Syne", label: "Syne", category: "modern", sample: "ARTE MODERNO" },
  { family: "Nunito", label: "Nunito", category: "modern", sample: "Redondeada", bundled: true },
  { family: "NotoSans", label: "Noto Sans", category: "modern", sample: "Universal", bundled: true },

  // Manuscritas / Creativas
  { family: "Caveat", label: "Caveat", category: "handwritten", sample: "Hecho a mano", bundled: true },
  { family: "Permanent Marker", label: "Permanent Marker", category: "handwritten", sample: "MARCADOR!" },
  { family: "Pacifico", label: "Pacifico", category: "handwritten", sample: "Verano Libre" },
  { family: "Dancing Script", label: "Dancing Script", category: "handwritten", sample: "Elegante" },
  { family: "Satisfy", label: "Satisfy", category: "handwritten", sample: "Firma creativa" },
  { family: "Shadows Into Light", label: "Shadows Light", category: "handwritten", sample: "Nota rápida" },

  // Editorial / Serif / Cine
  { family: "Playfair Display", label: "Playfair Display", category: "serif", sample: "Editorial Cine" },
  { family: "Cinzel", label: "Cinzel", category: "serif", sample: "ÉPICO ANTIGUO" },
  { family: "Merriweather", label: "Merriweather", category: "serif", sample: "Historia Real" },
  { family: "Abril Fatface", label: "Abril Fatface", category: "serif", sample: "Revista Luxe" },

  // Retro / Pixel / Mono
  { family: "Press Start 2P", label: "Press Start 2P", category: "retro", sample: "GAME OVER" },
  { family: "Silkscreen", label: "Silkscreen", category: "retro", sample: "PIXEL 8-BIT" },
  { family: "VT323", label: "VT323", category: "retro", sample: "TERMINAL >_" },
  { family: "JetBrains Mono", label: "JetBrains Mono", category: "retro", sample: "CODE 01:24" },
];

export const GOOGLE_FONT_PRESETS = FONT_CATALOG.map((f) => f.family);

const loadedFonts = new Set<string>();
let bundledLoadedPromise: Promise<void> | null = null;

/**
 * Dynamically injects a Google Fonts stylesheet link for any selected subtitle/title typeface.
 */
export function ensureGoogleFontLoaded(family: string): void {
  if (typeof document === "undefined") return;
  const clean = family.trim();
  if (!clean || loadedFonts.has(clean)) return;
  // Bundled OFL fonts are served locally offline — no external stylesheet needed
  if ((BUNDLED_FONT_PRESETS as readonly string[]).includes(clean)) return;
  loadedFonts.add(clean);

  const link = document.createElement("link");
  link.rel = "stylesheet";
  const host = ["https://", "fonts.googleapis.com", "/css2"].join("");
  const q = encodeURIComponent(clean).replace(/%20/g, "+");
  link.href = `${host}?family=${q}:wght@400;600;700;800&display=swap`;
  document.head.appendChild(link);
}

/**
 * Loads multiple Google Fonts in one batched stylesheet request so visual font pickers
 * immediately display every typeface with its true glyph rendering.
 */
export function ensureGoogleFontsBatchLoaded(families: readonly string[]): void {
  if (typeof document === "undefined") return;
  const toLoad: string[] = [];
  for (const raw of families) {
    const clean = raw.trim();
    if (!clean || loadedFonts.has(clean)) continue;
    if ((BUNDLED_FONT_PRESETS as readonly string[]).includes(clean)) continue;
    loadedFonts.add(clean);
    toLoad.push(clean);
  }
  if (toLoad.length === 0) return;

  // Chunk in groups of 10 to keep Google Fonts CSS URLs clean & resilient
  const host = ["https://", "fonts.googleapis.com", "/css2"].join("");
  for (let i = 0; i < toLoad.length; i += 10) {
    const chunk = toLoad.slice(i, i + 10);
    const params = chunk
      .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`)
      .join("&");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${host}?${params}&display=swap`;
    document.head.appendChild(link);
  }
}

/**
 * Registers an uploaded local TTF/OTF/WOFF2 font asset via the browser FontFace API.
 */
export async function loadLocalFontAsset(family: string, srcUrl: string): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") return;
  const key = `local::${family}::${srcUrl}`;
  if (loadedFonts.has(key)) return;
  loadedFonts.add(key);
  try {
    const face = new FontFace(family, `url(${srcUrl})`);
    const loaded = await face.load();
    document.fonts.add(loaded);
  } catch {
    // Fallback to system/Google font
  }
}

/**
 * Loads all bundled OFL fonts served by Storia Studio (`/api/fonts`) so both the interactive
 * Viewport and headless `/render` Chromium export render them 100% offline with 1:1 parity.
 */
export function ensureBundledFontsLoaded(origin = ""): Promise<void> {
  if (typeof document === "undefined" || typeof FontFace === "undefined") {
    return Promise.resolve();
  }
  if (bundledLoadedPromise && !origin) return bundledLoadedPromise;

  const task = (async () => {
    try {
      const res = await fetch(`${origin}/api/fonts`, {
        credentials: "same-origin",
        headers: { "ngrok-skip-browser-warning": "true" },
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        fonts?: { family: string; url: string }[];
      };
      const loads = (data.fonts ?? []).map((f) => loadLocalFontAsset(f.family, `${origin}${f.url}`));
      await Promise.all(loads);
    } catch {
      // Offline / server not yet ready
    }
  })();

  if (!origin) bundledLoadedPromise = task;
  return task;
}
