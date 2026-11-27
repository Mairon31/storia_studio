import React, { useMemo, useState } from "react";
import { Eye, EyeOff, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import type { EffectClipCategory, EffectClipType } from "@storia/schema";
import { resolveSceneAtTime } from "@storia/schema";
import { useStudioStore } from "../store/useStudioStore";

interface EffectCatalogItem {
  type: EffectClipType;
  label: string;
  category: EffectClipCategory;
  desc: string;
  defaultColor: string;
  defaultIntensity: number;
  defaultDuration: number;
}

export const EFFECT_CATALOG: EffectCatalogItem[] = [
  { type: "vhs_glitch", label: "VHS Glitch", category: "retro", desc: "Cortes digitales y NTSC", defaultColor: "#ff5c5c", defaultIntensity: 0.9, defaultDuration: 1.8 },
  { type: "rgb_split", label: "RGB Split", category: "video", desc: "Aberración cromática", defaultColor: "#4ce6c8", defaultIntensity: 0.9, defaultDuration: 1.5 },
  { type: "psx", label: "PSX 1998", category: "retro", desc: "240p + Bayer 4×4 + CRT", defaultColor: "#ffd447", defaultIntensity: 1.0, defaultDuration: 3.0 },
  { type: "pixel_art", label: "Pixel Art", category: "retro", desc: "Cuadrícula nítida", defaultColor: "#f7c8d6", defaultIntensity: 1.0, defaultDuration: 3.0 },
  { type: "crt_scanlines", label: "CRT Scanlines", category: "retro", desc: "Monitor de tubo clásico", defaultColor: "#8ce8ff", defaultIntensity: 0.9, defaultDuration: 3.0 },
  { type: "halation", label: "Halation Cine", category: "video", desc: "Halo cálido 35mm", defaultColor: "#ff7a59", defaultIntensity: 0.9, defaultDuration: 3.5 },
  { type: "film_grain", label: "Grano Película", category: "video", desc: "Textura analógica", defaultColor: "#ffffff", defaultIntensity: 0.8, defaultDuration: 4.0 },
  { type: "boil", label: "Trazo Boil 2D", category: "video", desc: "Vibración dibujada", defaultColor: "#ffd447", defaultIntensity: 0.85, defaultDuration: 3.0 },
  { type: "noir", label: "Noir Monocromo", category: "video", desc: "B&N alto contraste", defaultColor: "#ffffff", defaultIntensity: 1.0, defaultDuration: 3.0 },
  { type: "sepia", label: "Flashback Sepia", category: "video", desc: "Tono recuerdo vintage", defaultColor: "#d9a96c", defaultIntensity: 0.9, defaultDuration: 3.0 },
  { type: "cyberpunk_neon", label: "Neon Contrast", category: "video", desc: "Contraste magenta/azul", defaultColor: "#f7c8d6", defaultIntensity: 0.9, defaultDuration: 2.5 },
  { type: "dream_blur", label: "Dreamy Blur", category: "video", desc: "Desenfoque onírico", defaultColor: "#f7c8d6", defaultIntensity: 0.85, defaultDuration: 2.5 },
  { type: "vignette_pulse", label: "Pulso Viñeta", category: "video", desc: "Latido en los bordes", defaultColor: "#000000", defaultIntensity: 0.9, defaultDuration: 2.5 },
  { type: "flash_impact", label: "Flash Impacto", category: "video", desc: "Destello inmediato", defaultColor: "#ffffff", defaultIntensity: 0.95, defaultDuration: 0.5 },
  { type: "letterbox", label: "Barras Cine", category: "video", desc: "Formato 2.39:1", defaultColor: "#000000", defaultIntensity: 1.0, defaultDuration: 4.0 },
  { type: "vintage_8mm", label: "Super 8mm", category: "retro", desc: "Cine antiguo + grano + boil", defaultColor: "#d9a96c", defaultIntensity: 0.9, defaultDuration: 3.5 },
  { type: "thermal_vision", label: "Visión Térmica", category: "video", desc: "Infrarrojo cálido neón", defaultColor: "#ff3b1f", defaultIntensity: 1.0, defaultDuration: 2.5 },
  { type: "comic_halftone", label: "Cómic Halftone", category: "retro", desc: "Trama cómic + posterizado", defaultColor: "#ffd447", defaultIntensity: 0.95, defaultDuration: 3.0 },
  { type: "golden_hour", label: "Golden Hour", category: "video", desc: "Atardecer cálido 35mm", defaultColor: "#ffbe55", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "cold_cinema", label: "Cine Frío", category: "video", desc: "Atmósfera thriller azul", defaultColor: "#38bdf8", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "prism_refract", label: "Prisma Óptico", category: "video", desc: "Refracción RGB + halo", defaultColor: "#a855f7", defaultIntensity: 0.9, defaultDuration: 2.0 },
  { type: "strobe_flash", label: "Strobe Club", category: "video", desc: "Destellos rítmicos flash", defaultColor: "#ffffff", defaultIntensity: 0.85, defaultDuration: 1.5 },

  { type: "camera_shake", label: "Terremoto", category: "motion", desc: "Sacudida de impacto", defaultColor: "#ff5c5c", defaultIntensity: 0.9, defaultDuration: 0.8 },
  { type: "handheld_drift", label: "Cámara Mano", category: "motion", desc: "Flotación documental", defaultColor: "#ffd447", defaultIntensity: 0.85, defaultDuration: 4.0 },
  { type: "punch_zoom", label: "Punch Zoom", category: "motion", desc: "Zoom rítmico", defaultColor: "#ffd447", defaultIntensity: 0.9, defaultDuration: 1.0 },
  { type: "dolly_zoom", label: "Dolly Zoom", category: "motion", desc: "Acercamiento dramático", defaultColor: "#4ce6c8", defaultIntensity: 0.9, defaultDuration: 3.0 },
  { type: "dutch_sway", label: "Dutch Sway", category: "motion", desc: "Inclinación tensa", defaultColor: "#ffd447", defaultIntensity: 0.85, defaultDuration: 3.0 },
  { type: "ken_burns", label: "Ken Burns", category: "motion", desc: "Paneo editorial", defaultColor: "#ffffff", defaultIntensity: 0.85, defaultDuration: 4.0 },
  { type: "beat_pulse", label: "Beat Pulse", category: "motion", desc: "Pulso al ritmo", defaultColor: "#f7c8d6", defaultIntensity: 0.85, defaultDuration: 3.0 },
  { type: "whip_pan_loop", label: "Whip Pan", category: "motion", desc: "Barrido lateral rápido", defaultColor: "#38bdf8", defaultIntensity: 0.9, defaultDuration: 2.0 },
  { type: "zoom_breathe", label: "Zoom Respir.", category: "motion", desc: "Acercamiento orgánico", defaultColor: "#4ce6c8", defaultIntensity: 0.85, defaultDuration: 4.0 },
  { type: "earthquake_heavy", label: "Sismo Intenso", category: "motion", desc: "Sacudida extrema + RGB", defaultColor: "#ff3b5c", defaultIntensity: 1.0, defaultDuration: 1.2 },
  { type: "orbit_drift", label: "Órbita 360", category: "motion", desc: "Cámara orbital suave", defaultColor: "#a78bfa", defaultIntensity: 0.85, defaultDuration: 4.0 },
  { type: "vertigo_tilt", label: "Vértigo Cine", category: "motion", desc: "Zoom + inclinación épica", defaultColor: "#f59e0b", defaultIntensity: 0.9, defaultDuration: 3.0 },

  { type: "speed_lines", label: "Speed Lines", category: "overlay", desc: "Líneas anime/acción", defaultColor: "#ffd447", defaultIntensity: 0.9, defaultDuration: 2.0 },
  { type: "light_leaks", label: "Light Leaks", category: "overlay", desc: "Destellos flotantes", defaultColor: "#ffae42", defaultIntensity: 0.85, defaultDuration: 3.0 },
  { type: "spotlight", label: "Spotlight", category: "overlay", desc: "Foco dramático", defaultColor: "#ffd447", defaultIntensity: 0.9, defaultDuration: 3.0 },
  { type: "embers", label: "Brasas", category: "overlay", desc: "Partículas cálidas", defaultColor: "#ff8c42", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "rain", label: "Lluvia", category: "overlay", desc: "Gotas diagonales", defaultColor: "#aad8ff", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "snow", label: "Nieve", category: "overlay", desc: "Copos con viento", defaultColor: "#ffffff", defaultIntensity: 0.85, defaultDuration: 4.0 },
  { type: "dust", label: "Polvo Mágico", category: "overlay", desc: "Motes luminosos", defaultColor: "#fff2cc", defaultIntensity: 0.8, defaultDuration: 4.0 },
  { type: "god_rays", label: "Rayos de Luz", category: "overlay", desc: "Haces volumétricos", defaultColor: "#ffd478", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "impact_burst", label: "Estallido", category: "overlay", desc: "Ráfaga radial", defaultColor: "#ff5c5c", defaultIntensity: 1.0, defaultDuration: 1.0 },
  { type: "confetti", label: "Confeti", category: "overlay", desc: "Lluvia festiva multicolor", defaultColor: "#ffd447", defaultIntensity: 1.0, defaultDuration: 3.5 },
  { type: "bokeh_lights", label: "Bokeh Cine", category: "overlay", desc: "Círculos luminosos suaves", defaultColor: "#f7c8d6", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "matrix_rain", label: "Código Matrix", category: "overlay", desc: "Cascada digital verde", defaultColor: "#22c55e", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "lens_flare_sweep", label: "Lens Flare", category: "overlay", desc: "Destello anamórfico móvil", defaultColor: "#38bdf8", defaultIntensity: 0.95, defaultDuration: 2.5 },
  { type: "fireflies", label: "Luciérnagas", category: "overlay", desc: "Destellos nocturnos vivos", defaultColor: "#fde047", defaultIntensity: 0.9, defaultDuration: 4.0 },
  { type: "starfield", label: "Warp Estrellas", category: "overlay", desc: "Viaje espacial estelar", defaultColor: "#93c5fd", defaultIntensity: 0.95, defaultDuration: 4.0 },
];

const CAT_FILTERS: { id: "all" | EffectClipCategory; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "video", label: "Video" },
  { id: "motion", label: "Movim." },
  { id: "overlay", label: "Atmósf." },
  { id: "retro", label: "Retro" },
];

/**
 * Live animated miniature card preview (TikTok / CapCut effects grid style).
 */
const EffectThumb: React.FC<{ item: EffectCatalogItem; animate: boolean }> = ({ item, animate }) => {
  const t = item.type;
  const baseFilter =
    t === "noir"
      ? "grayscale(1) contrast(1.45)"
      : t === "sepia" || t === "vintage_8mm"
        ? "sepia(0.95) contrast(1.1)"
        : t === "cyberpunk_neon" || t === "prism_refract"
          ? "saturate(2.2) hue-rotate(-30deg) contrast(1.25)"
          : t === "thermal_vision"
            ? "saturate(3.0) hue-rotate(155deg) contrast(1.4)"
            : t === "golden_hour"
              ? "sepia(0.45) saturate(1.6) brightness(1.12)"
              : t === "cold_cinema"
                ? "saturate(1.2) hue-rotate(180deg) brightness(0.95)"
                : t === "dream_blur"
                  ? "blur(1.8px) brightness(1.18)"
                  : t === "halation"
                    ? "brightness(1.12) contrast(1.1)"
                    : undefined;

  const animClass = !animate
    ? ""
    : t === "vhs_glitch" || t === "rgb_split" || t === "boil" || t === "prism_refract"
      ? "st-anim-glitch"
      : t === "camera_shake" || t === "earthquake_heavy"
        ? "st-anim-shake"
        : t === "punch_zoom" || t === "dolly_zoom" || t === "beat_pulse" || t === "ken_burns" || t === "zoom_breathe"
          ? "st-anim-pulse"
          : t === "dutch_sway" || t === "handheld_drift" || t === "vertigo_tilt" || t === "orbit_drift"
            ? "st-anim-sway"
            : t === "whip_pan_loop"
              ? "st-anim-whip-l"
              : "";

  return (
    <div className="relative h-14 w-full rounded-lg overflow-hidden bg-[#101320]">
      {/* Mini stylized editorial scene */}
      <div
        className={`absolute inset-0 flex items-end justify-center pb-1.5 ${animClass}`}
        style={{
          background:
            t === "psx" || t === "pixel_art"
              ? "repeating-conic-gradient(#2c2445 0% 25%, #4a3264 0% 50%) 50% / 8px 8px"
              : "linear-gradient(160deg, #1f2448 0%, #7d3c66 55%, #f29e68 100%)",
          filter: baseFilter,
        }}
      >
        <div className="w-4 h-7 rounded-t-full bg-[#131520]/85 border border-white/25" />
      </div>

      {/* Overlays specific to the effect */}
      {(t === "crt_scanlines" || t === "vhs_glitch" || t === "psx") && (
        <div
          className="absolute inset-0 pointer-events-none opacity-55"
          style={{
            background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.65) 3px)",
          }}
        />
      )}

      {t === "letterbox" && (
        <>
          <div className="absolute top-0 left-0 right-0 h-2.5 bg-black" />
          <div className="absolute bottom-0 left-0 right-0 h-2.5 bg-black" />
        </>
      )}

      {(t === "vignette_pulse" || t === "spotlight") && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-fade" : ""}`}
          style={{
            background:
              t === "spotlight"
                ? "radial-gradient(circle at 50% 45%, transparent 22%, rgba(0,0,0,0.82) 78%)"
                : "radial-gradient(circle at 50% 50%, transparent 35%, rgba(0,0,0,0.85) 100%)",
          }}
        />
      )}

      {(t === "rain" || t === "snow" || t === "matrix_rain" || t === "confetti") && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-rain" : ""}`}
          style={{
            backgroundImage:
              t === "rain"
                ? "repeating-linear-gradient(110deg, transparent 0 8px, rgba(170,216,255,0.55) 8px 9.5px)"
                : t === "matrix_rain"
                  ? "repeating-linear-gradient(90deg, transparent 0 6px, rgba(34,197,94,0.65) 6px 8px)"
                  : t === "confetti"
                    ? "radial-gradient(circle, #ffd447 2px, transparent 2.5px), radial-gradient(circle, #ff5c8a 2px, transparent 2.5px)"
                    : "radial-gradient(circle, rgba(255,255,255,0.85) 1.5px, transparent 2px)",
            backgroundSize: t === "snow" || t === "confetti" ? "16px 16px" : "24px 24px",
          }}
        />
      )}

      {(t === "embers" || t === "dust" || t === "fireflies" || t === "bokeh_lights") && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-around">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`${t === "bokeh_lights" ? "w-3 h-3 opacity-60" : "w-1.5 h-1.5"} rounded-full ${animate ? "st-anim-embers" : ""}`}
              style={{
                background: item.defaultColor,
                animationDelay: `${i * 0.3}s`,
                boxShadow: `0 0 8px ${item.defaultColor}`,
              }}
            />
          ))}
        </div>
      )}

      {(t === "speed_lines" || t === "impact_burst" || t === "god_rays" || t === "starfield") && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-pulse" : ""}`}
          style={{
            background:
              t === "god_rays"
                ? "conic-gradient(from 160deg at 50% -10%, transparent 0deg, rgba(255,212,120,0.45) 18deg, transparent 36deg, rgba(255,212,120,0.35) 55deg, transparent 78deg)"
                : `repeating-conic-gradient(from 0deg at 50% 50%, ${item.defaultColor}55 0deg 6deg, transparent 6deg 24deg)`,
          }}
        />
      )}

      {(t === "light_leaks" || t === "halation" || t === "flash_impact" || t === "strobe_flash" || t === "lens_flare_sweep") && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-flash" : "opacity-45"}`}
          style={{
            background:
              t === "flash_impact" || t === "strobe_flash"
                ? "#ffffff"
                : t === "lens_flare_sweep"
                  ? `linear-gradient(180deg, transparent 40%, ${item.defaultColor} 50%, transparent 60%)`
                  : `radial-gradient(circle at 78% 24%, ${item.defaultColor}, transparent 68%)`,
          }}
        />
      )}

      {t === "film_grain" && (
        <div
          className="absolute inset-0 pointer-events-none opacity-45"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.45) 0.7px, transparent 0.7px)",
            backgroundSize: "5px 5px",
          }}
        />
      )}
    </div>
  );
};

export const EffectsLibraryPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const selectedEffectClipId = useStudioStore((s) => s.selectedEffectClipId);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const selectEffectClip = useStudioStore((s) => s.selectEffectClip);
  const setCurrentTime = useStudioStore((s) => s.setCurrentTime);

  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"all" | EffectClipCategory>("all");
  const [durationSec, setDurationSec] = useState(2.5);
  const [intensity, setIntensity] = useState(0.9);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [alwaysAnimate, setAlwaysAnimate] = useState(() =>
    typeof window !== "undefined"
      ? !window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth >= 1024
      : true,
  );

  const resolved = resolveSceneAtTime(project, currentTime);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EFFECT_CATALOG.filter((e) => {
      if (cat !== "all" && e.category !== cat) return false;
      if (!q) return true;
      return e.label.toLowerCase().includes(q) || e.desc.toLowerCase().includes(q) || e.type.includes(q);
    });
  }, [query, cat]);

  const addEffect = (item: EffectCatalogItem, scope: "playhead" | "scene") => {
    const id = `fx_${item.type}_${Date.now().toString(36).slice(-4)}`;
    const start = scope === "scene" && resolved ? resolved.sceneStart : Number(currentTime.toFixed(2));
    const dur =
      scope === "scene" && resolved
        ? Number(resolved.scene.duration.toFixed(2))
        : Number(Math.max(0.2, durationSec).toFixed(2));

    dispatchOps([
      {
        op: "effectClip.upsert",
        effectClip: {
          id,
          name: item.label,
          category: item.category,
          effectType: item.type,
          start,
          duration: dur,
          enabled: true,
          intensity,
          speed: 1,
          color: item.defaultColor,
          fadeIn: Math.min(0.15, dur * 0.2),
          fadeOut: Math.min(0.15, dur * 0.2),
        },
      },
    ]);
    selectEffectClip(id);
  };

  const activeClips = project.effectClips ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <Sparkles size={12} /> Efectos ({EFFECT_CATALOG.length})
          </div>
          <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
            Vista previa en vivo · Por segundos
          </div>
        </div>
        <label className="flex items-center gap-1 text-[9.5px] cursor-pointer shrink-0" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={alwaysAnimate} onChange={(e) => setAlwaysAnimate(e.target.checked)} />
          Animar
        </label>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          className="studio-input w-full !pl-8"
          placeholder="Buscar efecto (glitch, lluvia, shake…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1">
        {CAT_FILTERS.map((f) => {
          const active = cat === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setCat(f.id)}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer"
              style={{
                background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Duration & Intensity defaults */}
      <div className="rounded-xl p-2 grid grid-cols-2 gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
        <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
          Duración ({durationSec.toFixed(1)}s)
          <input type="range" min={0.3} max={12} step={0.1} value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
          Intensidad ({Math.round(intensity * 100)}%)
          <input type="range" min={0.15} max={1.8} step={0.05} value={intensity} onChange={(e) => setIntensity(Number(e.target.value))} />
        </label>
      </div>

      {/* Active Effect Clips */}
      {activeClips.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-gold)" }}>
            En Timeline ({activeClips.length})
          </div>
          {activeClips.map((ec) => {
            const isSel = selectedEffectClipId === ec.id;
            return (
              <div
                key={ec.id}
                onClick={() => {
                  selectEffectClip(ec.id);
                  setCurrentTime(ec.start + 0.05);
                }}
                className="rounded-lg px-2 py-1 flex items-center justify-between gap-1 cursor-pointer text-[10px]"
                style={{
                  background: isSel ? "var(--glass-active)" : "var(--glass-hover)",
                  border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{ec.name}</div>
                  <div className="font-mono-code text-[9px]" style={{ color: "var(--text-muted)" }}>
                    {ec.start.toFixed(1)}s → {(ec.start + ec.duration).toFixed(1)}s
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    className="studio-btn !p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatchOps([{ op: "effectClip.upsert", effectClip: { ...ec, enabled: !ec.enabled } }]);
                    }}
                  >
                    {ec.enabled ? <Eye size={10} /> : <EyeOff size={10} />}
                  </button>
                  <button
                    className="studio-btn !p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      dispatchOps([{ op: "effectClip.remove", effectClipId: ec.id }]);
                      if (isSel) selectEffectClip(null);
                    }}
                  >
                    <Trash2 size={10} style={{ color: "var(--accent-danger)" }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TikTok / CapCut 2-column Animated Effects Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {filtered.map((item) => {
          const animate = alwaysAnimate || hoveredId === item.type;
          return (
            <div
              key={item.type}
              onMouseEnter={() => setHoveredId(item.type)}
              onMouseLeave={() => setHoveredId((c) => (c === item.type ? null : c))}
              className="rounded-xl p-1.5 flex flex-col gap-1"
              style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="cursor-pointer" onClick={() => addEffect(item, "playhead")} title={item.desc}>
                <EffectThumb item={item} animate={animate} />
              </div>
              <div className="px-0.5 text-[10.5px] font-semibold truncate">{item.label}</div>
              <div className="flex gap-1">
                <button
                  onClick={() => addEffect(item, "playhead")}
                  className="studio-btn studio-btn-accent flex-1 !py-0.5 !px-1 !text-[9.5px]"
                  title={`Añadir en ${currentTime.toFixed(1)}s por ${durationSec.toFixed(1)}s`}
                >
                  <Plus size={9} /> Aquí
                </button>
                <button
                  onClick={() => addEffect(item, "scene")}
                  className="studio-btn !py-0.5 !px-1.5 !text-[9.5px] border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  title="Cubrir toda la escena activa"
                >
                  Escena
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
