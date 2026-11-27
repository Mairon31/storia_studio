import React, { useMemo, useState } from "react";
import { Check, Palette, Search, Sparkles, X } from "lucide-react";
import { ANIMATION_STYLE_LIST, AnimationStyleId, AnimationStylePreset } from "@storia/schema";
import { useStudioStore } from "../store/useStudioStore";

const FAMILY_FILTERS: { id: "all" | AnimationStylePreset["family"]; label: string }[] = [
  { id: "all", label: `Todos (${ANIMATION_STYLE_LIST.length})` },
  { id: "studio_pro", label: "3D · Kurzgesagt · Anime · PSX" },
  { id: "storia", label: "Storia" },
  { id: "code_engine_b", label: "Code Engine B1–B8" },
  { id: "model_engine_a", label: "Model Engine A1–A8" },
];

const StylePreviewCard: React.FC<{ style: AnimationStylePreset }> = ({ style }) => {
  const isLight = style.palette.bg.toLowerCase().startsWith("#f") || style.palette.bg.toLowerCase().startsWith("#e") || style.palette.bg.toLowerCase().startsWith("#d");
  return (
    <div
      className="relative h-20 w-full rounded-lg overflow-hidden border flex items-center justify-center"
      style={{
        background: `linear-gradient(155deg, ${style.background.gradientTop} 0%, ${style.background.gradientBottom} 100%)`,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      {/* Paper grid for B1 */}
      {style.id === "b1_minimal_handdrawn" && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(76,90,105,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(76,90,105,0.22) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
          }}
        />
      )}

      {/* Tech floor grid for A2 */}
      {style.id === "a2_modern_pop" && (
        <div
          className="absolute bottom-0 left-0 right-0 h-7 opacity-50"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(6,182,212,0.4) 1px, transparent 1px)",
            backgroundSize: "12px 8px",
          }}
        />
      )}

      {/* Retro scanlines for B3 / PSX */}
      {(style.id === "b3_retro_tv" || style.id === "c4_retro_psx") && (
        <div
          className="absolute inset-0 opacity-45"
          style={{
            background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.7) 3px)",
          }}
        />
      )}

      {/* Pixel grid for B7 */}
      {style.id === "b7_pixel_theater" && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "7px 7px",
          }}
        />
      )}

      {/* Kurzgesagt planet accent */}
      {style.id === "c2_kurzgesagt" && (
        <div
          className="absolute -right-2 -top-2 w-10 h-10 rounded-full opacity-90"
          style={{ background: "radial-gradient(circle at 35% 35%, #ff8fb1, #ff5c8a 58%, #991b4c 100%)" }}
        />
      )}

      {/* Miniature character silhouette badge */}
      <div className="relative z-10 flex items-end gap-2">
        <div className="flex flex-col items-center">
          <div
            className={`w-5 h-5 ${style.characterRenderStyle === "pixel_theater" ? "rounded-none" : "rounded-full"} ${
              style.characterRenderStyle === "kurzgesagt" || style.characterRenderStyle === "stylized_3d"
                ? ""
                : "border-2"
            } flex items-center justify-center`}
            style={{
              background:
                style.characterRenderStyle === "stylized_3d"
                  ? "radial-gradient(circle at 32% 28%, #ffffff, #f3cfa6 55%, #b8845a 100%)"
                  : style.characterRenderStyle === "kurzgesagt"
                    ? "linear-gradient(90deg, #f3cfa6 0% 50%, #d4a373 50% 100%)"
                    : style.characterRenderStyle === "classic_dark" || style.characterRenderStyle === "classic_light"
                      ? "transparent"
                      : style.characterRenderStyle === "greek_mythology" ||
                          style.characterRenderStyle === "editorial" ||
                          style.characterRenderStyle === "anime_cel" ||
                          style.characterRenderStyle === "pixel_theater" ||
                          style.characterRenderStyle === "retro_psx" ||
                          style.characterRenderStyle === "paper_cutout"
                        ? "#e6be9a"
                        : "#ffffff",
              borderColor: style.palette.ink,
              boxShadow:
                style.characterRenderStyle === "paper_cutout"
                  ? "0 0 0 2px #fbf7ef, 2px 3px 0 rgba(0,0,0,0.3)"
                  : undefined,
            }}
          >
            {style.characterRenderStyle === "modern_beanie" && (
              <div className="w-5 h-2 -mt-4 rounded-t-full bg-[#e11d48] border border-black/60" />
            )}
          </div>
          <div
            className="w-2.5 h-6 rounded-sm mt-0.5"
            style={{
              background:
                style.characterRenderStyle === "modern_beanie"
                  ? "#facc15"
                  : style.characterRenderStyle === "editorial" ||
                      style.characterRenderStyle === "greek_mythology" ||
                      style.characterRenderStyle === "stylized_3d" ||
                      style.characterRenderStyle === "kurzgesagt" ||
                      style.characterRenderStyle === "anime_cel" ||
                      style.characterRenderStyle === "retro_psx" ||
                      style.characterRenderStyle === "paper_cutout" ||
                      style.characterRenderStyle === "pixel_theater"
                    ? style.palette.accent
                    : "transparent",
              borderLeft:
                style.characterRenderStyle !== "editorial" &&
                style.characterRenderStyle !== "modern_beanie" &&
                style.characterRenderStyle !== "greek_mythology" &&
                style.characterRenderStyle !== "stylized_3d" &&
                style.characterRenderStyle !== "kurzgesagt" &&
                style.characterRenderStyle !== "anime_cel" &&
                style.characterRenderStyle !== "retro_psx" &&
                style.characterRenderStyle !== "paper_cutout" &&
                style.characterRenderStyle !== "pixel_theater"
                  ? `2.5px solid ${style.palette.ink}`
                  : undefined,
            }}
          />
        </div>

        {/* Mini title & caption bar */}
        <div className="flex flex-col gap-1">
          <div
            className="text-[11px] font-extrabold leading-none"
            style={{
              color: style.palette.ink,
              fontFamily: style.typography.headingFont,
            }}
          >
            Aa
          </div>
          <div className="flex gap-1">
            <span className="w-3 h-1.5 rounded-full" style={{ background: style.palette.accent }} />
            <span className="w-2.5 h-1.5 rounded-full" style={{ background: style.palette.secondaryAccent }} />
          </div>
        </div>
      </div>

      {/* Style code badge */}
      <span
        className="absolute top-1.5 left-1.5 text-[9px] font-mono-code font-bold px-1.5 py-0.5 rounded"
        style={{
          background: isLight ? "rgba(0,0,0,0.72)" : "rgba(255,255,255,0.16)",
          color: "#ffffff",
        }}
      >
        {style.code}
      </span>

      {/* Font tag */}
      <span
        className="absolute bottom-1 right-1.5 text-[8.5px] font-mono-code px-1 rounded"
        style={{
          background: "rgba(0,0,0,0.52)",
          color: "#f4f4f8",
        }}
      >
        {style.typography.headingFont}
      </span>
    </div>
  );
};

export const AnimationStyleModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const project = useStudioStore((s) => s.project);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<"all" | AnimationStylePreset["family"]>("all");
  const [updateBackgrounds, setUpdateBackgrounds] = useState(true);
  const [updateSubtitles, setUpdateSubtitles] = useState(true);
  const [updateTransitions, setUpdateTransitions] = useState(true);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANIMATION_STYLE_LIST.filter((st) => {
      if (family !== "all" && st.family !== family) return false;
      if (!q) return true;
      return (
        st.name.toLowerCase().includes(q) ||
        st.code.toLowerCase().includes(q) ||
        st.tagline.toLowerCase().includes(q) ||
        st.bestFor.toLowerCase().includes(q)
      );
    });
  }, [query, family]);

  if (!open) return null;

  const applyStyle = (styleId: AnimationStyleId, label: string) => {
    dispatchOps([
      {
        op: "project.applyAnimationStyle",
        styleId,
        updateBackgrounds,
        updateSubtitles,
        updateTransitions,
      },
    ]);
    setBusyNotice(`Estilo de animación aplicado: ${label}`);
    window.setTimeout(() => setBusyNotice(null), 2600);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(5, 7, 12, 0.78)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass-elevated w-full max-w-[920px] max-h-[88vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "var(--glass-active)", color: "var(--accent-primary)" }}
            >
              <Palette size={16} />
            </div>
            <div>
              <div className="text-[14px] font-bold flex items-center gap-2">
                Estilos de Animación ({ANIMATION_STYLE_LIST.length})
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded-full" style={{ background: "var(--glass-hover)", color: "var(--accent-teal)" }}>
                  Storia + Stickman Director A1–A8 &amp; B1–B8
                </span>
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                Cambia al instante el rig de personajes, escenarios procedurales, tipografía OFL, shaders y transiciones
              </div>
            </div>
          </div>
          <button className="studio-btn !p-1.5" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Filters + Apply options */}
        <div className="px-5 py-3 border-b flex flex-wrap items-center justify-between gap-2" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="flex items-center gap-1.5 flex-wrap">
            {FAMILY_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFamily(f.id)}
                className={`studio-btn !py-1 !px-2.5 !text-[11px] ${family === f.id ? "studio-btn-accent" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative w-56">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
            <input
              className="studio-input w-full !pl-8 !py-1"
              placeholder="Buscar estilo (Ghibli, Meme, B1…)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="w-full flex flex-wrap items-center gap-4 text-[11px] pt-1" style={{ color: "var(--text-secondary)" }}>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={updateBackgrounds} onChange={(e) => setUpdateBackgrounds(e.target.checked)} />
              Adaptar fondos de escena
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={updateSubtitles} onChange={(e) => setUpdateSubtitles(e.target.checked)} />
              Adaptar tipografía y estilo de subtítulos
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={updateTransitions} onChange={(e) => setUpdateTransitions(e.target.checked)} />
              Aplicar transición recomendada del estilo
            </label>
          </div>
        </div>

        {/* Grid of 18 styles */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((st) => {
            const isActive = project.animationStyle === st.id;
            return (
              <button
                key={st.id}
                onClick={() => applyStyle(st.id, `${st.code} · ${st.name}`)}
                className="rounded-xl p-2.5 text-left flex flex-col gap-2 cursor-pointer transition-all hover:scale-[1.01]"
                style={{
                  background: isActive ? "var(--glass-active)" : "var(--glass-hover)",
                  border: `1.5px solid ${isActive ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
              >
                <StylePreviewCard style={st} />
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[12px] font-bold truncate">{st.name}</span>
                  {isActive ? (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold" style={{ color: "var(--accent-primary)" }}>
                      <Check size={12} /> Activo
                    </span>
                  ) : (
                    <span className="text-[9.5px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                      <Sparkles size={10} className="inline mr-0.5" />
                      {st.postProcessingPreset}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] leading-snug line-clamp-2" style={{ color: "var(--text-secondary)" }}>
                  {st.tagline}
                </p>
                <div className="text-[9.5px] line-clamp-1 mt-auto" style={{ color: "var(--text-muted)" }}>
                  Ideal: {st.bestFor}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
