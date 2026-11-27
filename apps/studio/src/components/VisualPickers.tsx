import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Type,
} from "lucide-react";
import type {
  Asset,
  LayerColorAdjust,
  LayerEnterAnim,
  LayerExitAnim,
  LayerLoopMotion,
  LayerMotion,
  ShapeKind,
  TransitionType,
} from "@storia/schema";
import {
  ensureGoogleFontLoaded,
  ensureGoogleFontsBatchLoaded,
  FONT_CATALOG,
  type FontCategory,
} from "../lib/fonts";
import { TRANSITION_CATALOG, TransitionThumb } from "./TransitionsLibraryPanel";

// ============================================================================
// SHARED PREVIEW SUBJECT CONTEXT (Real Sprite/Image, Real Text, or Graphic)
// ============================================================================

export interface LayerPreviewContext {
  kind: "image" | "text" | "shape" | "character" | "background";
  imageSrc?: string;
  text?: string;
  fontFamily?: string;
  color?: string;
  accentColor?: string;
  bgGradient?: [string, string];
  label?: string;
}

export const DEFAULT_COLOR_ADJUST: LayerColorAdjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

export const DEFAULT_MOTION: LayerMotion = {
  enter: "none",
  enterDuration: 0.35,
  exit: "none",
  exitDuration: 0.25,
  loop: "none",
  loopAmplitude: 0.5,
  loopSpeed: 1.2,
};

export function colorAdjustToCssFilter(adj: LayerColorAdjust): string {
  const parts: string[] = [];
  if (Math.abs(adj.brightness - 1) > 0.01) parts.push(`brightness(${adj.brightness.toFixed(2)})`);
  if (Math.abs(adj.contrast - 1) > 0.01) parts.push(`contrast(${adj.contrast.toFixed(2)})`);
  if (Math.abs(adj.saturation - 1) > 0.01) parts.push(`saturate(${adj.saturation.toFixed(2)})`);
  if (Math.abs(adj.hue) > 0.5) parts.push(`hue-rotate(${Math.round(adj.hue)}deg)`);
  if (adj.grayscale > 0.01) parts.push(`grayscale(${adj.grayscale.toFixed(2)})`);
  if (adj.sepia > 0.01) parts.push(`sepia(${adj.sepia.toFixed(2)})`);
  if (adj.blur > 0.1) parts.push(`blur(${Math.min(6, adj.blur * 0.35).toFixed(1)}px)`);
  return parts.length > 0 ? parts.join(" ") : "none";
}

const PreviewSubjectThumb: React.FC<{
  preview?: LayerPreviewContext;
  cssFilter?: string;
  animClass?: string;
  compact?: boolean;
}> = ({ preview, cssFilter, animClass, compact = false }) => {
  const bg = preview?.bgGradient
    ? `linear-gradient(135deg, ${preview.bgGradient[0]}, ${preview.bgGradient[1]})`
    : "linear-gradient(135deg, #1b243b 0%, #2b1f3d 55%, #162a3a 100%)";

  const wrapperClass = `w-full ${compact ? "h-10" : "h-12"} rounded-lg overflow-hidden relative flex items-center justify-center select-none`;

  if (preview?.imageSrc) {
    return (
      <div className={wrapperClass} style={{ background: "#111623", border: "1px solid rgba(255,255,255,0.08)" }}>
        <img
          src={preview.imageSrc}
          alt={preview.label ?? "Preview"}
          loading="lazy"
          className={`w-full h-full ${preview.kind === "background" ? "object-cover" : "object-contain p-1"} ${animClass ?? ""}`}
          style={{ filter: cssFilter }}
        />
      </div>
    );
  }

  if (preview?.kind === "text") {
    const sample = (preview.text?.trim() || "TEXTO").slice(0, 12);
    return (
      <div className={wrapperClass} style={{ background: bg, border: "1px solid rgba(255,255,255,0.08)" }}>
        <span
          className={`px-1.5 text-[11px] font-extrabold truncate max-w-full drop-shadow ${animClass ?? ""}`}
          style={{
            fontFamily: preview.fontFamily ? `"${preview.fontFamily}", sans-serif` : undefined,
            color: preview.color || "#ffffff",
            filter: cssFilter,
          }}
        >
          {sample}
        </span>
      </div>
    );
  }

  // Rich default visual scene thumbnail (warm sunset + teal accent mountain/sun so color filters are immediately legible)
  return (
    <div className={wrapperClass} style={{ background: "#0f1422", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div
        className={`w-full h-full relative flex items-center justify-center ${animClass ?? ""}`}
        style={{
          background:
            preview?.kind === "background" && preview.bgGradient
              ? `linear-gradient(160deg, ${preview.bgGradient[0]}, ${preview.bgGradient[1]})`
              : "linear-gradient(155deg, #2563eb 0%, #c084fc 48%, #f59e0b 100%)",
          filter: cssFilter,
        }}
      >
        <div
          className="w-4 h-4 rounded-full absolute top-1.5 right-2.5"
          style={{ background: "#fef08a", boxShadow: "0 0 8px rgba(254,240,138,0.8)" }}
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-5"
          style={{
            background: "linear-gradient(180deg, rgba(16,185,129,0.85), rgba(15,23,42,0.95))",
            clipPath: "polygon(0 100%, 0 48%, 32% 10%, 62% 55%, 84% 20%, 100% 52%, 100% 100%)",
          }}
        />
        {preview?.kind === "character" && (
          <div className="relative z-10 w-4 h-6 rounded-full border border-white/70 bg-white/85 shadow" />
        )}
        {preview?.kind === "shape" && (
          <div
            className="relative z-10 w-5 h-5 rounded-md border border-white/80 shadow"
            style={{ background: preview.color || "#4ce6c8" }}
          />
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 1. CAPCUT-STYLE VISUAL FILTER PRESETS GRID (26 FILTERS + INTENSITY + FINE TUNE)
// ============================================================================

export type FilterCategory = "all" | "cinema" | "retro" | "color" | "bw" | "soft";

export interface VisualFilterPreset {
  id: string;
  label: string;
  category: Exclude<FilterCategory, "all">;
  values: LayerColorAdjust;
}

export const VISUAL_FILTER_PRESETS: VisualFilterPreset[] = [
  { id: "original", label: "Original", category: "cinema", values: { ...DEFAULT_COLOR_ADJUST } },

  // Cine & Editorial
  { id: "teal_orange", label: "Cine T&O", category: "cinema", values: { brightness: 1.02, contrast: 1.24, saturation: 1.18, hue: -8, blur: 0, grayscale: 0, sepia: 0.1 } },
  { id: "golden_hour", label: "Hora Dorada", category: "cinema", values: { brightness: 1.08, contrast: 1.1, saturation: 1.26, hue: -14, blur: 0, grayscale: 0, sepia: 0.24 } },
  { id: "cold_cinema", label: "Cine Frío", category: "cinema", values: { brightness: 0.96, contrast: 1.18, saturation: 0.9, hue: 165, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "blockbuster", label: "Blockbuster", category: "cinema", values: { brightness: 0.94, contrast: 1.32, saturation: 1.12, hue: -4, blur: 0, grayscale: 0, sepia: 0.06 } },
  { id: "moody_dark", label: "Oscuro Moody", category: "cinema", values: { brightness: 0.78, contrast: 1.3, saturation: 0.78, hue: -6, blur: 0, grayscale: 0, sepia: 0.12 } },
  { id: "nordic_ice", label: "Hielo Nórdico", category: "cinema", values: { brightness: 1.06, contrast: 1.14, saturation: 0.72, hue: 18, blur: 0, grayscale: 0, sepia: 0 } },

  // Retro & Analógico
  { id: "kodak_warm", label: "Kodak 400", category: "retro", values: { brightness: 1.05, contrast: 1.12, saturation: 1.15, hue: -10, blur: 0, grayscale: 0, sepia: 0.34 } },
  { id: "vintage_70s", label: "Vintage 70s", category: "retro", values: { brightness: 1.02, contrast: 0.92, saturation: 0.85, hue: -16, blur: 0, grayscale: 0, sepia: 0.52 } },
  { id: "polaroid", label: "Polaroid", category: "retro", values: { brightness: 1.1, contrast: 0.96, saturation: 0.92, hue: 6, blur: 0, grayscale: 0, sepia: 0.28 } },
  { id: "vhs_90s", label: "VHS 90s", category: "retro", values: { brightness: 0.98, contrast: 1.22, saturation: 1.32, hue: -24, blur: 0.6, grayscale: 0, sepia: 0.16 } },
  { id: "amber_sepia", label: "Sepia Ámbar", category: "retro", values: { brightness: 1.0, contrast: 1.12, saturation: 0.9, hue: -6, blur: 0, grayscale: 0, sepia: 0.88 } },
  { id: "faded_film", label: "Film Lavado", category: "retro", values: { brightness: 1.12, contrast: 0.82, saturation: 0.75, hue: 0, blur: 0, grayscale: 0, sepia: 0.22 } },

  // Color Pop & Neón
  { id: "vivid_pop", label: "Vívido Pop", category: "color", values: { brightness: 1.06, contrast: 1.22, saturation: 1.55, hue: 0, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "cyberpunk", label: "Cyberpunk", category: "color", values: { brightness: 1.0, contrast: 1.35, saturation: 1.7, hue: -52, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "vaporwave", label: "Vaporwave", category: "color", values: { brightness: 1.06, contrast: 1.16, saturation: 1.5, hue: 68, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "emerald_matrix", label: "Esmeralda", category: "color", values: { brightness: 0.95, contrast: 1.25, saturation: 1.25, hue: 92, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "sunset_crimson", label: "Carmesí", category: "color", values: { brightness: 1.0, contrast: 1.2, saturation: 1.45, hue: -32, blur: 0, grayscale: 0, sepia: 0.12 } },
  { id: "anime_sky", label: "Cielo Anime", category: "color", values: { brightness: 1.1, contrast: 1.14, saturation: 1.42, hue: 12, blur: 0, grayscale: 0, sepia: 0 } },
  { id: "neon_violet", label: "Neón Violeta", category: "color", values: { brightness: 0.98, contrast: 1.28, saturation: 1.55, hue: -95, blur: 0, grayscale: 0, sepia: 0 } },

  // Blanco y Negro
  { id: "noir_classic", label: "Noir Clásico", category: "bw", values: { brightness: 0.94, contrast: 1.48, saturation: 0, hue: 0, blur: 0, grayscale: 1, sepia: 0 } },
  { id: "silver_bw", label: "B&N Plata", category: "bw", values: { brightness: 1.1, contrast: 1.12, saturation: 0, hue: 0, blur: 0, grayscale: 1, sepia: 0 } },
  { id: "dramatic_bw", label: "B&N Drama", category: "bw", values: { brightness: 0.86, contrast: 1.65, saturation: 0, hue: 0, blur: 0, grayscale: 1, sepia: 0 } },
  { id: "docu_mono", label: "Docu Mono", category: "bw", values: { brightness: 1.02, contrast: 1.08, saturation: 0, hue: 0, blur: 0, grayscale: 1, sepia: 0.18 } },

  // Suave / Ensueño / Desenfoque
  { id: "pastel_soft", label: "Pastel Suave", category: "soft", values: { brightness: 1.14, contrast: 0.88, saturation: 0.86, hue: -8, blur: 0, grayscale: 0, sepia: 0.08 } },
  { id: "dreamy_glow", label: "Ensueño", category: "soft", values: { brightness: 1.12, contrast: 0.95, saturation: 1.15, hue: 4, blur: 2.0, grayscale: 0, sepia: 0.1 } },
  { id: "frosted_blur", label: "Cristal Blur", category: "soft", values: { brightness: 1.05, contrast: 1.04, saturation: 0.95, hue: 0, blur: 6.5, grayscale: 0, sepia: 0 } },
];

const FILTER_CATEGORIES: { id: FilterCategory; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "cinema", label: "Cine" },
  { id: "retro", label: "Retro" },
  { id: "color", label: "Color" },
  { id: "bw", label: "B&N" },
  { id: "soft", label: "Suave" },
];

function lerpColorAdjust(preset: LayerColorAdjust, intensity: number): LayerColorAdjust {
  const k = Math.max(0, Math.min(1, intensity));
  return {
    brightness: Number((1 + (preset.brightness - 1) * k).toFixed(2)),
    contrast: Number((1 + (preset.contrast - 1) * k).toFixed(2)),
    saturation: Number((1 + (preset.saturation - 1) * k).toFixed(2)),
    hue: Math.round(preset.hue * k),
    blur: Number((preset.blur * k).toFixed(1)),
    grayscale: Number((preset.grayscale * k).toFixed(2)),
    sepia: Number((preset.sepia * k).toFixed(2)),
  };
}

function isNearAdjust(a: LayerColorAdjust, b: LayerColorAdjust): boolean {
  return (
    Math.abs(a.brightness - b.brightness) < 0.04 &&
    Math.abs(a.contrast - b.contrast) < 0.04 &&
    Math.abs(a.saturation - b.saturation) < 0.06 &&
    Math.abs(a.hue - b.hue) <= 4 &&
    Math.abs(a.blur - b.blur) < 0.4 &&
    Math.abs(a.grayscale - b.grayscale) < 0.15 &&
    Math.abs(a.sepia - b.sepia) < 0.08
  );
}

export const VisualFilterGrid: React.FC<{
  value?: LayerColorAdjust;
  onChange: (next: LayerColorAdjust) => void;
  preview?: LayerPreviewContext;
}> = ({ value, onChange, preview }) => {
  const adj = { ...DEFAULT_COLOR_ADJUST, ...(value ?? {}) };
  const [cat, setCat] = useState<FilterCategory>("all");
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(1);
  const [showSliders, setShowSliders] = useState(false);

  const filtered = useMemo(
    () => (cat === "all" ? VISUAL_FILTER_PRESETS : VISUAL_FILTER_PRESETS.filter((f) => f.category === cat)),
    [cat],
  );

  const activePresetId = useMemo(() => {
    if (selectedPresetId) {
      const p = VISUAL_FILTER_PRESETS.find((x) => x.id === selectedPresetId);
      if (p && isNearAdjust(adj, lerpColorAdjust(p.values, intensity))) return p.id;
    }
    const exact = VISUAL_FILTER_PRESETS.find((p) => isNearAdjust(adj, p.values));
    return exact?.id ?? null;
  }, [adj, selectedPresetId, intensity]);

  const setField = (patch: Partial<LayerColorAdjust>) => {
    setSelectedPresetId(null);
    onChange({ ...adj, ...patch });
  };

  return (
    <div
      className="rounded-xl p-2.5 flex flex-col gap-2"
      style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between gap-1">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1"
          style={{ color: "var(--text-secondary)" }}
        >
          <Sparkles size={11} style={{ color: "var(--accent-primary)" }} />
          Filtros ({VISUAL_FILTER_PRESETS.length})
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="text-[9.5px] flex items-center gap-0.5 hover:underline cursor-pointer"
            style={{ color: showSliders ? "var(--accent-primary)" : "var(--text-muted)" }}
            onClick={() => setShowSliders((v) => !v)}
          >
            <SlidersHorizontal size={10} />
            Ajustar
          </button>
          <button
            type="button"
            className="text-[9.5px] flex items-center gap-0.5 hover:underline cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onClick={() => {
              setSelectedPresetId("original");
              setIntensity(1);
              onChange({ ...DEFAULT_COLOR_ADJUST });
            }}
            title="Restablecer filtro"
          >
            <RotateCcw size={10} />
          </button>
        </div>
      </div>

      {/* Filter Category Pills */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        {FILTER_CATEGORIES.map((c) => {
          const active = cat === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setCat(c.id)}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer shrink-0"
              style={{
                background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.05)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
              }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Visual Filter Preview Grid (shows actual sprite/image/text with filter applied!) */}
      <div className="grid grid-cols-3 gap-1.5 max-h-[212px] overflow-y-auto pr-0.5">
        {filtered.map((preset) => {
          const isCurrent = activePresetId === preset.id;
          const cssFilter = colorAdjustToCssFilter(preset.values);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                setSelectedPresetId(preset.id);
                setIntensity(1);
                onChange({ ...preset.values });
              }}
              className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer transition-all text-left relative"
              style={{
                background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <PreviewSubjectThumb preview={preview} cssFilter={cssFilter} compact />
              <div className="flex items-center justify-between gap-0.5 px-0.5">
                <span className="text-[9.5px] font-medium truncate">{preset.label}</span>
                {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* CapCut-style Filter Intensity Slider when a non-original preset is selected */}
      {selectedPresetId && selectedPresetId !== "original" && (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Intensidad del filtro ({Math.round(intensity * 100)}%)
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={intensity}
            onChange={(e) => {
              const nextI = Number(e.target.value);
              setIntensity(nextI);
              const p = VISUAL_FILTER_PRESETS.find((x) => x.id === selectedPresetId);
              if (p) onChange(lerpColorAdjust(p.values, nextI));
            }}
          />
        </label>
      )}

      {/* Collapsible Manual Color Sliders */}
      {showSliders && (
        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Brillo ({Math.round(adj.brightness * 100)}%)
            <input type="range" min={0.3} max={2.0} step={0.05} value={adj.brightness} onChange={(e) => setField({ brightness: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Contraste ({Math.round(adj.contrast * 100)}%)
            <input type="range" min={0.3} max={2.0} step={0.05} value={adj.contrast} onChange={(e) => setField({ contrast: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Saturación ({Math.round(adj.saturation * 100)}%)
            <input type="range" min={0} max={2.2} step={0.05} value={adj.saturation} onChange={(e) => setField({ saturation: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Matiz ({adj.hue}°)
            <input type="range" min={-180} max={180} step={5} value={adj.hue} onChange={(e) => setField({ hue: Number(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Desenfoque ({adj.blur.toFixed(1)}px)
            <input type="range" min={0} max={24} step={0.5} value={adj.blur} onChange={(e) => setField({ blur: Number(e.target.value) })} />
          </label>
          <div className="flex items-center gap-2.5 text-[10px] pt-3">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={adj.grayscale > 0.5} onChange={(e) => setField({ grayscale: e.target.checked ? 1 : 0 })} />
              B&amp;N
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={adj.sepia > 0.5} onChange={(e) => setField({ sepia: e.target.checked ? 1 : 0 })} />
              Sepia
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 2. CAPCUT-STYLE VISUAL ANIMATION GRID (ENTER / EXIT / LOOP FOR ALL LAYERS)
// ============================================================================

interface MotionItemDef<T extends string> {
  id: T;
  label: string;
  animClass: string;
}

const ENTER_ITEMS: MotionItemDef<LayerEnterAnim>[] = [
  { id: "none", label: "Ninguna", animClass: "" },
  { id: "fade", label: "Aparecer", animClass: "st-m-fade-in" },
  { id: "pop", label: "Pop", animClass: "st-sub-pop" },
  { id: "zoom_in", label: "Zoom In", animClass: "st-m-zoom-in" },
  { id: "zoom_out", label: "Zoom Out", animClass: "st-m-zoom-out" },
  { id: "zoom_punch", label: "Zoom Golpe", animClass: "st-sub-slam" },
  { id: "slide_up", label: "Subir", animClass: "st-sub-slide-up" },
  { id: "slide_down", label: "Bajar", animClass: "st-sub-slide-down" },
  { id: "slide_left", label: "Desl. Izq", animClass: "st-sub-slide-left" },
  { id: "slide_right", label: "Desl. Der", animClass: "st-sub-slide-right" },
  { id: "bounce_in", label: "Rebote", animClass: "st-sub-bounce" },
  { id: "drop_in", label: "Caída", animClass: "st-sub-drop" },
  { id: "slam", label: "Impacto", animClass: "st-sub-slam" },
  { id: "stamp", label: "Sello", animClass: "st-sub-slam" },
  { id: "elastic", label: "Elástico", animClass: "st-m-elastic" },
  { id: "rubber_band", label: "Goma", animClass: "st-sub-squeeze" },
  { id: "squeeze_in", label: "Estirar", animClass: "st-sub-squeeze" },
  { id: "rise_spring", label: "Resorte", animClass: "st-sub-bounce" },
  { id: "tilt_pop", label: "Pop Giro", animClass: "st-m-tilt-pop" },
  { id: "flip_x", label: "Giro X", animClass: "st-sub-flip-x" },
  { id: "flip_y", label: "Giro Y", animClass: "st-sub-flip-y" },
  { id: "spin_in", label: "Rotar", animClass: "st-sub-spin-pop" },
  { id: "spiral_in", label: "Espiral", animClass: "st-m-spiral-in" },
  { id: "swing_in", label: "Columpio", animClass: "st-sub-swing" },
  { id: "unfold_x", label: "Desplegar H", animClass: "st-m-unfold-x" },
  { id: "unfold_y", label: "Desplegar V", animClass: "st-m-unfold-y" },
  { id: "whip_left", label: "Látigo Izq", animClass: "st-anim-whip-l" },
  { id: "whip_right", label: "Látigo Der", animClass: "st-anim-whip-r" },
  { id: "whip_up", label: "Látigo Arr", animClass: "st-anim-whip-u" },
  { id: "whip_down", label: "Látigo Abj", animClass: "st-anim-whip-d" },
  { id: "blur_in", label: "Desenfoque", animClass: "st-sub-blur-in" },
  { id: "glitch", label: "Glitch", animClass: "st-anim-glitch" },
];

const EXIT_ITEMS: MotionItemDef<LayerExitAnim>[] = [
  { id: "none", label: "Ninguna", animClass: "" },
  { id: "fade", label: "Desvanecer", animClass: "st-m-fade-out" },
  { id: "pop", label: "Pop Salida", animClass: "st-m-exit-zoom-out" },
  { id: "zoom_out", label: "Alejar", animClass: "st-m-exit-zoom-out" },
  { id: "zoom_in", label: "Acercar", animClass: "st-m-exit-zoom-in" },
  { id: "slide_up", label: "Salir Arr", animClass: "st-m-exit-up" },
  { id: "slide_down", label: "Salir Abj", animClass: "st-m-exit-down" },
  { id: "slide_left", label: "Salir Izq", animClass: "st-m-exit-left" },
  { id: "slide_right", label: "Salir Der", animClass: "st-m-exit-right" },
  { id: "slam_out", label: "Golpe Fuera", animClass: "st-m-exit-zoom-in" },
  { id: "bounce_out", label: "Rebote", animClass: "st-m-exit-down" },
  { id: "drop_out", label: "Caer", animClass: "st-m-exit-down" },
  { id: "flip_x", label: "Giro X", animClass: "st-sub-flip-x" },
  { id: "flip_y", label: "Giro Y", animClass: "st-sub-flip-y" },
  { id: "spin_out", label: "Rotar Fuera", animClass: "st-m-shrink-spin" },
  { id: "shrink_spin", label: "Espiral", animClass: "st-m-shrink-spin" },
  { id: "whip_left", label: "Látigo Izq", animClass: "st-anim-whip-l" },
  { id: "whip_right", label: "Látigo Der", animClass: "st-anim-whip-r" },
  { id: "blur_out", label: "Difuminar", animClass: "st-sub-blur-in" },
  { id: "glitch_out", label: "Glitch", animClass: "st-anim-glitch" },
];

const LOOP_ITEMS: MotionItemDef<LayerLoopMotion>[] = [
  { id: "none", label: "Ninguno", animClass: "" },
  { id: "float", label: "Flotar", animClass: "st-m-float" },
  { id: "breathe", label: "Respirar", animClass: "st-m-breathe" },
  { id: "pulse", label: "Pulso", animClass: "st-anim-pulse" },
  { id: "heartbeat", label: "Latido", animClass: "st-m-heartbeat" },
  { id: "bounce", label: "Rebotar", animClass: "st-sub-bounce" },
  { id: "wiggle", label: "Meneo", animClass: "st-m-wiggle" },
  { id: "pendulum", label: "Péndulo", animClass: "st-sub-swing" },
  { id: "tilt_rock", label: "Balanceo", animClass: "st-anim-sway" },
  { id: "sway_x", label: "Vaivén H", animClass: "st-m-sway-x" },
  { id: "sway_y", label: "Vaivén V", animClass: "st-m-float" },
  { id: "hover_drift", label: "Deriva", animClass: "st-m-orbit" },
  { id: "orbit", label: "Órbita", animClass: "st-m-orbit" },
  { id: "spin", label: "Girar 360°", animClass: "st-m-spin" },
  { id: "ken_burns", label: "Ken Burns", animClass: "st-m-ken-burns" },
  { id: "zoom_breathe", label: "Zoom Vivo", animClass: "st-m-breathe" },
  { id: "rubber_pulse", label: "Elástico", animClass: "st-sub-squeeze" },
  { id: "shake", label: "Sacudir", animClass: "st-anim-shake" },
  { id: "jitter", label: "Vibrar", animClass: "st-m-jitter" },
  { id: "flicker", label: "Parpadeo", animClass: "st-sub-flicker" },
];

export const VisualMotionGrid: React.FC<{
  value?: LayerMotion;
  onChange: (next: LayerMotion) => void;
  preview?: LayerPreviewContext;
}> = ({ value, onChange, preview }) => {
  const m = { ...DEFAULT_MOTION, ...(value ?? {}) };
  const set = (patch: Partial<LayerMotion>) => onChange({ ...m, ...patch });

  const [tab, setTab] = useState<"enter" | "exit" | "loop">("enter");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [alwaysAnimate, setAlwaysAnimate] = useState(() =>
    typeof window !== "undefined"
      ? !window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth >= 1024
      : true,
  );

  const items = tab === "enter" ? ENTER_ITEMS : tab === "exit" ? EXIT_ITEMS : LOOP_ITEMS;
  const activeId = tab === "enter" ? m.enter : tab === "exit" ? m.exit : m.loop;

  return (
    <div
      className="rounded-xl p-2.5 flex flex-col gap-2"
      style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Animación (Vista previa)
        </span>
        <label className="flex items-center gap-1 text-[9.5px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={alwaysAnimate} onChange={(e) => setAlwaysAnimate(e.target.checked)} />
          Animar
        </label>
      </div>

      {/* CapCut Entrada / Salida / Bucle Tabs */}
      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.25)" }}>
        {[
          { id: "enter" as const, label: "Entrada", activeVal: m.enter },
          { id: "exit" as const, label: "Salida", activeVal: m.exit },
          { id: "loop" as const, label: "Bucle", activeVal: m.loop },
        ].map((t) => {
          const isTab = tab === t.id;
          const hasAnim = t.activeVal !== "none";
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="py-1 px-1.5 rounded-md text-[10px] font-semibold cursor-pointer flex items-center justify-center gap-1 transition-colors"
              style={{
                background: isTab ? "var(--accent-primary)" : "transparent",
                color: isTab ? "var(--accent-ink)" : "var(--text-secondary)",
              }}
            >
              <span>{t.label}</span>
              {hasAnim && (
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: isTab ? "var(--accent-ink)" : "var(--accent-teal)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Visual Animated Preview Grid */}
      <div className="grid grid-cols-3 gap-1.5 max-h-[220px] overflow-y-auto pr-0.5">
        {items.map((item) => {
          const isCurrent = activeId === item.id;
          const shouldAnim = Boolean(item.animClass) && (alwaysAnimate || hoveredId === item.id || isCurrent);
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((c) => (c === item.id ? null : c))}
              onClick={() => {
                if (tab === "enter") set({ enter: item.id as LayerEnterAnim });
                else if (tab === "exit") set({ exit: item.id as LayerExitAnim });
                else set({ loop: item.id as LayerLoopMotion });
              }}
              className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer transition-all text-left"
              style={{
                background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <PreviewSubjectThumb
                preview={preview}
                animClass={shouldAnim ? item.animClass : undefined}
                compact
              />
              <div className="flex items-center justify-between gap-0.5 px-0.5">
                <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Contextual Duration / Speed / Amplitude Sliders */}
      {tab === "enter" && m.enter !== "none" && (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Duración entrada ({m.enterDuration.toFixed(2)}s)
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.05}
            value={m.enterDuration}
            onChange={(e) => set({ enterDuration: Number(e.target.value) })}
          />
        </label>
      )}
      {tab === "exit" && m.exit !== "none" && (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Duración salida ({m.exitDuration.toFixed(2)}s)
          <input
            type="range"
            min={0.1}
            max={2.0}
            step={0.05}
            value={m.exitDuration}
            onChange={(e) => set({ exitDuration: Number(e.target.value) })}
          />
        </label>
      )}
      {tab === "loop" && m.loop !== "none" && (
        <div className="grid grid-cols-2 gap-1.5">
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Velocidad ({m.loopSpeed.toFixed(1)}×)
            <input
              type="range"
              min={0.2}
              max={4}
              step={0.1}
              value={m.loopSpeed}
              onChange={(e) => set({ loopSpeed: Number(e.target.value) })}
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Amplitud ({Math.round(m.loopAmplitude * 100)}%)
            <input
              type="range"
              min={0.05}
              max={2}
              step={0.05}
              value={m.loopAmplitude}
              onChange={(e) => set({ loopAmplitude: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 3. VISUAL FONT PICKER (RENDERS EVERY FONT WITH ITS REAL TYPEFACE & SAMPLE)
// ============================================================================

const FONT_CATEGORY_TABS: { id: "all" | FontCategory; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "impact", label: "Impacto" },
  { id: "modern", label: "Modernas" },
  { id: "handwritten", label: "Manuscrita" },
  { id: "serif", label: "Editorial" },
  { id: "retro", label: "Retro" },
];

export const VisualFontPicker: React.FC<{
  value: string;
  localFonts?: Asset[];
  sampleText?: string;
  onSelect: (family: string, localAssetId?: string) => void;
}> = ({ value, localFonts = [], sampleText, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<"all" | FontCategory>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FONT_CATALOG.filter((f) => {
      if (cat !== "all" && f.category !== cat) return false;
      if (!q) return true;
      return f.label.toLowerCase().includes(q) || f.family.toLowerCase().includes(q);
    });
  }, [cat, query]);

  // Preload visible fonts as a clean batched Google Fonts request as soon as picker opens
  useEffect(() => {
    ensureGoogleFontLoaded(value);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    ensureGoogleFontsBatchLoaded(filtered.map((f) => f.family));
  }, [open, filtered]);

  const cleanSample = sampleText?.trim().slice(0, 18);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Tipografía (Vista real · {FONT_CATALOG.length + localFonts.length})
        </span>
      </div>

      {/* Current Font Trigger Button (rendered in its actual typeface) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 cursor-pointer transition-colors text-left"
        style={{
          background: open ? "var(--glass-active)" : "rgba(0,0,0,0.24)",
          border: `1px solid ${open ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        }}
      >
        <div className="min-w-0 flex items-center gap-2">
          <Type size={13} className="shrink-0" style={{ color: "var(--accent-primary)" }} />
          <div className="min-w-0">
            <div
              className="text-[14px] leading-tight truncate"
              style={{ fontFamily: `"${value}", "Figtree", sans-serif`, color: "var(--text-primary)" }}
            >
              {cleanSample || value}
            </div>
            <div className="text-[9.5px] font-mono-code truncate" style={{ color: "var(--text-muted)" }}>
              {value}
            </div>
          </div>
        </div>
        {open ? <ChevronUp size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
      </button>

      {/* Expandable Visual Font Grid */}
      {open && (
        <div
          className="rounded-xl p-2 flex flex-col gap-2"
          style={{ background: "rgba(0,0,0,0.26)", border: "1px solid var(--border-strong)" }}
        >
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
            <input
              type="text"
              className="studio-input w-full !pl-7 !py-1 !text-[11px]"
              placeholder="Buscar fuente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {FONT_CATEGORY_TABS.map((t) => {
              const active = cat === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCat(t.id)}
                  className="px-2 py-0.5 rounded-md text-[9.5px] font-medium cursor-pointer shrink-0"
                  style={{
                    background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                    color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-[228px] overflow-y-auto pr-0.5">
            {localFonts.map((lf) => {
              const isCurrent = value === lf.name;
              return (
                <button
                  key={lf.id}
                  type="button"
                  onClick={() => onSelect(lf.name, lf.id)}
                  className="rounded-lg px-2 py-2 flex flex-col gap-0.5 text-left cursor-pointer transition-all"
                  style={{
                    background: isCurrent ? "var(--glass-active)" : "var(--glass-hover)",
                    border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <span
                    className="text-[14px] leading-snug truncate w-full"
                    style={{ fontFamily: `"${lf.name}", sans-serif`, color: "var(--text-primary)" }}
                  >
                    {cleanSample || lf.name}
                  </span>
                  <span className="text-[9px] flex items-center justify-between w-full" style={{ color: "var(--accent-teal)" }}>
                    <span className="truncate">{lf.name}</span>
                    <span>LOCAL</span>
                  </span>
                </button>
              );
            })}

            {filtered.map((f) => {
              const isCurrent = value === f.family;
              return (
                <button
                  key={f.family}
                  type="button"
                  onClick={() => {
                    ensureGoogleFontLoaded(f.family);
                    onSelect(f.family, undefined);
                  }}
                  className="rounded-lg px-2 py-2 flex flex-col gap-0.5 text-left cursor-pointer transition-all"
                  style={{
                    background: isCurrent ? "var(--glass-active)" : "var(--glass-hover)",
                    border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <span
                    className="text-[14px] leading-snug truncate w-full"
                    style={{
                      fontFamily: `"${f.family}", "Figtree", sans-serif`,
                      color: "var(--text-primary)",
                    }}
                  >
                    {cleanSample || f.sample}
                  </span>
                  <span className="text-[9px] flex items-center justify-between w-full" style={{ color: "var(--text-muted)" }}>
                    <span className="truncate">{f.label}</span>
                    {isCurrent ? (
                      <Check size={9} style={{ color: "var(--accent-primary)" }} />
                    ) : f.bundled ? (
                      <span style={{ color: "var(--accent-teal)" }}>OFL</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// 4. VISUAL SHAPE PICKER GRID (13 PROCEDURAL SVG THUMBNAILS)
// ============================================================================

const SHAPE_GRID_ITEMS: { id: ShapeKind; label: string }[] = [
  { id: "rounded_rect", label: "Redond." },
  { id: "rect", label: "Rect." },
  { id: "circle", label: "Círculo" },
  { id: "ring", label: "Anillo" },
  { id: "line", label: "Línea" },
  { id: "arrow", label: "Flecha" },
  { id: "callout", label: "Globo" },
  { id: "pie", label: "Gráfico" },
  { id: "star", label: "Estrella" },
  { id: "spark", label: "Destello" },
  { id: "triangle", label: "Triáng." },
  { id: "polygon", label: "Hexág." },
  { id: "heart", label: "Corazón" },
];

const ShapeMiniSvg: React.FC<{ shape: ShapeKind; fill: string; stroke: string }> = ({ shape, fill, stroke }) => {
  const sw = 2.2;
  return (
    <svg viewBox="0 0 40 40" className="w-7 h-7">
      {shape === "rounded_rect" && <rect x="6" y="10" width="28" height="20" rx="6" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === "rect" && <rect x="6" y="10" width="28" height="20" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === "circle" && <circle cx="20" cy="20" r="13" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === "ring" && <circle cx="20" cy="20" r="12" fill="none" stroke={fill} strokeWidth="4.5" />}
      {shape === "line" && <line x1="6" y1="20" x2="34" y2="20" stroke={fill} strokeWidth="4" strokeLinecap="round" />}
      {shape === "arrow" && <path d="M6 20 H28 M21 12 L32 20 L21 28" fill="none" stroke={fill} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />}
      {shape === "callout" && <path d="M7 9 H33 A3 3 0 0 1 36 12 V24 A3 3 0 0 1 33 27 H22 L15 34 V27 H7 A3 3 0 0 1 4 24 V12 A3 3 0 0 1 7 9 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />}
      {shape === "pie" && <path d="M20 20 L20 7 A13 13 0 1 1 8 25 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />}
      {shape === "star" && <polygon points="20,5 24,15 35,15 26,22 29,33 20,26 11,33 14,22 5,15 16,15" fill={fill} stroke={stroke} strokeWidth="1.8" />}
      {shape === "spark" && <polygon points="20,4 23,17 36,20 23,23 20,36 17,23 4,20 17,17" fill={fill} stroke={stroke} strokeWidth="1.6" />}
      {shape === "triangle" && <polygon points="20,7 34,32 6,32" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === "polygon" && <polygon points="20,6 32,13 32,27 20,34 8,27 8,13" fill={fill} stroke={stroke} strokeWidth={sw} />}
      {shape === "heart" && <path d="M20 33 C20 33 7 24 7 15 A6.5 6.5 0 0 1 20 12 A6.5 6.5 0 0 1 33 15 C33 24 20 33 20 33 Z" fill={fill} stroke={stroke} strokeWidth="1.8" />}
    </svg>
  );
};

export const VisualShapeGrid: React.FC<{
  value: ShapeKind;
  fillColor?: string;
  strokeColor?: string;
  onChange: (shape: ShapeKind) => void;
}> = ({ value, fillColor, strokeColor, onChange }) => (
  <div className="grid grid-cols-4 gap-1.5">
    {SHAPE_GRID_ITEMS.map((item) => {
      const active = value === item.id;
      return (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className="rounded-lg p-1.5 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
          style={{
            background: active ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
            border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          }}
        >
          <ShapeMiniSvg
            shape={item.id}
            fill={fillColor || "#4ce6c8"}
            stroke={strokeColor || "#ffffff"}
          />
          <span className="text-[9px] truncate max-w-full" style={{ color: active ? "var(--accent-primary)" : "var(--text-secondary)" }}>
            {item.label}
          </span>
        </button>
      );
    })}
  </div>
);

// ============================================================================
// 5. VISUAL PROCEDURAL BACKGROUND SETS GRID (14 ATMOSPHERIC MINI-SCENES)
// ============================================================================

const PROCEDURAL_SET_CARDS: { id: string; label: string; grad: [string, string]; accent: string }[] = [
  { id: "living_room", label: "Sala", grad: ["#2b2135", "#5a3d31"], accent: "#ffd447" },
  { id: "dining_family", label: "Comedor", grad: ["#3d261c", "#7c4728"], accent: "#f59e0b" },
  { id: "childhood_room", label: "Cuarto", grad: ["#233252", "#47608c"], accent: "#f7c8d6" },
  { id: "city_crosswalk", label: "Cruce", grad: ["#162238", "#354a6b"], accent: "#38bdf8" },
  { id: "memory_corridor", label: "Pasillo", grad: ["#1b162d", "#4c2d5c"], accent: "#c084fc" },
  { id: "sunset_hill", label: "Atardecer", grad: ["#581c4f", "#f97316"], accent: "#fde047" },
  { id: "observatory", label: "Estrellas", grad: ["#070b1e", "#1d356b"], accent: "#60a5fa" },
  { id: "cafe", label: "Café", grad: ["#2d1f19", "#694430"], accent: "#fbbf24" },
  { id: "park", label: "Parque", grad: ["#14362b", "#2d6a4f"], accent: "#4ade80" },
  { id: "street", label: "Calle", grad: ["#171b26", "#374151"], accent: "#fb923c" },
  { id: "studio", label: "Estudio", grad: ["#121622", "#26314a"], accent: "#4ce6c8" },
  { id: "library", label: "Biblioteca", grad: ["#2c1b18", "#5c3424"], accent: "#fcd34d" },
  { id: "hospital", label: "Clínica", grad: ["#1c2d3b", "#3b657a"], accent: "#67e8f9" },
  { id: "forest", label: "Bosque", grad: ["#0f281e", "#1f513b"], accent: "#86efac" },
];

export const VisualProceduralSetGrid: React.FC<{
  value: string;
  onChange: (setId: string) => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-1.5 max-h-[180px] overflow-y-auto pr-0.5">
    {PROCEDURAL_SET_CARDS.map((card) => {
      const active = value === card.id;
      return (
        <button
          key={card.id}
          type="button"
          onClick={() => onChange(card.id)}
          className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer transition-all text-left"
          style={{
            background: active ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
            border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          }}
        >
          <div
            className="w-full h-8 rounded relative overflow-hidden"
            style={{ background: `linear-gradient(150deg, ${card.grad[0]}, ${card.grad[1]})` }}
          >
            <div
              className="w-2.5 h-2.5 rounded-full absolute top-1.5 right-2 opacity-90"
              style={{ background: card.accent, boxShadow: `0 0 6px ${card.accent}` }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-3 opacity-45"
              style={{ background: "#06080f" }}
            />
          </div>
          <span className="text-[9.5px] font-medium truncate px-0.5">{card.label}</span>
        </button>
      );
    })}
  </div>
);

// ============================================================================
// 6. COMPACT VISUAL TRANSITION PICKER FOR SCENE INSPECTOR (REPLACES <select>)
// ============================================================================

export const VisualTransitionPicker: React.FC<{
  label: string;
  badgeText: string;
  value: TransitionType;
  accentColor?: string;
  onChange: (next: TransitionType) => void;
}> = ({ label, badgeText, value, accentColor = "#ffd447", onChange }) => {
  const [open, setOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const activeDef = TRANSITION_CATALOG.find((t) => t.id === value) ?? TRANSITION_CATALOG[0]!;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span>{label}</span>
        <span className="text-[9px] font-mono-code opacity-80">{badgeText}</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-lg p-1.5 flex items-center justify-between gap-2 cursor-pointer text-left"
        style={{
          background: open ? "var(--glass-active)" : "rgba(0,0,0,0.24)",
          border: `1px solid ${open ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        }}
      >
        <span className="text-[11px] font-medium truncate">{activeDef.label}</span>
        {open ? <ChevronUp size={13} className="shrink-0" /> : <ChevronDown size={13} className="shrink-0" />}
      </button>

      {open && (
        <div
          className="grid grid-cols-2 gap-1.5 max-h-[210px] overflow-y-auto p-1.5 rounded-xl"
          style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-strong)" }}
        >
          {TRANSITION_CATALOG.map((item) => {
            const isCurrent = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId((c) => (c === item.id ? null : c))}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer text-left"
                style={{
                  background: isCurrent ? "var(--glass-active)" : "var(--glass-hover)",
                  border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
              >
                <TransitionThumb
                  type={item.id}
                  accentColor={accentColor}
                  animate={hoveredId === item.id || isCurrent}
                />
                <span className="text-[9.5px] font-medium truncate px-0.5">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
