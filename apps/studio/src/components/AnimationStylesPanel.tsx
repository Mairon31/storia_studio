import React, { useMemo, useState } from "react";
import { Check, Palette, Search, Sparkles } from "lucide-react";
import { ANIMATION_STYLE_LIST, AnimationStyleId, AnimationStylePreset } from "@storia/schema";
import { useStudioStore } from "../store/useStudioStore";

const FAMILY_FILTERS: { id: "all" | AnimationStylePreset["family"]; label: string }[] = [
  { id: "all", label: `Todos (${ANIMATION_STYLE_LIST.length})` },
  { id: "studio_pro", label: "3D · Kurz · Anime" },
  { id: "storia", label: "Storia" },
  { id: "code_engine_b", label: "B1–B8" },
  { id: "model_engine_a", label: "A1–A8" },
];

const StyleMiniPreview: React.FC<{ style: AnimationStylePreset }> = ({ style }) => {
  const rs = style.characterRenderStyle;
  return (
    <div
      className="relative h-14 w-full rounded-lg overflow-hidden border flex items-center justify-center"
      style={{
        background: `linear-gradient(155deg, ${style.background.gradientTop} 0%, ${style.background.gradientBottom} 100%)`,
        borderColor: "rgba(255,255,255,0.12)",
      }}
    >
      {style.id === "b1_minimal_handdrawn" && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(76,90,105,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(76,90,105,0.22) 1px, transparent 1px)",
            backgroundSize: "12px 12px",
          }}
        />
      )}
      {(style.id === "a2_modern_pop" || style.id === "c4_retro_psx") && (
        <div
          className="absolute bottom-0 left-0 right-0 h-5 opacity-55"
          style={{
            backgroundImage:
              style.id === "c4_retro_psx"
                ? "linear-gradient(to right, rgba(34,211,238,0.48) 1px, transparent 1px), linear-gradient(to bottom, rgba(244,114,182,0.45) 1px, transparent 1px)"
                : "linear-gradient(to right, rgba(6,182,212,0.4) 1px, transparent 1px), linear-gradient(to bottom, rgba(6,182,212,0.4) 1px, transparent 1px)",
            backgroundSize: "10px 7px",
          }}
        />
      )}
      {(style.id === "b3_retro_tv" || style.id === "c4_retro_psx") && (
        <div
          className="absolute inset-0 opacity-45"
          style={{
            background: "repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.7) 3px)",
          }}
        />
      )}
      {style.id === "b7_pixel_theater" && (
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "6px 6px",
          }}
        />
      )}
      {style.id === "c2_kurzgesagt" && (
        <div
          className="absolute -right-2 -top-2 w-9 h-9 rounded-full opacity-85"
          style={{ background: "radial-gradient(circle at 35% 35%, #ff85a8, #ff5c8a 58%, #8f1d45 100%)" }}
        />
      )}
      {style.id === "c1_stylized_3d" && (
        <div
          className="absolute inset-0 opacity-65"
          style={{ background: "radial-gradient(circle at 32% 28%, rgba(125,211,252,0.45), transparent 62%)" }}
        />
      )}
      <div className="relative z-10 flex items-center gap-1.5">
        {rs === "pixel_theater" ? (
          <div
            className="w-4 h-4 border-2"
            style={{
              background: "#f4c8a0",
              borderColor: "#0b0e1c",
              boxShadow: `0 0 0 1px ${style.palette.accent}`,
            }}
          />
        ) : rs === "stylized_3d" ? (
          <div
            className="w-5 h-5 rounded-full shadow-md"
            style={{
              background: "radial-gradient(circle at 32% 28%, #ffffff 0%, #38bdf8 48%, #1e3a8a 100%)",
            }}
          />
        ) : rs === "kurzgesagt" ? (
          <div
            className="w-4 h-4 rounded-full overflow-hidden"
            style={{
              background: "linear-gradient(90deg, #00e5ff 0% 50%, #0284c7 50% 100%)",
            }}
          />
        ) : rs === "paper_cutout" ? (
          <div
            className="w-4 h-4 rounded-full"
            style={{
              background: style.palette.accent,
              boxShadow: "0 0 0 2px #fbf7ef, 2px 3px 0 rgba(0,0,0,0.28)",
            }}
          />
        ) : (
          <div
            className="w-4 h-4 rounded-full border-2"
            style={{
              background:
                rs === "classic_dark" || rs === "classic_light"
                  ? "transparent"
                  : rs === "anime_cel"
                    ? "#ffe2c6"
                    : "#ffffff",
              borderColor: style.palette.ink,
            }}
          />
        )}
        <span
          className="text-[9.5px] font-extrabold tracking-wide px-1.5 py-0.5 rounded"
          style={{
            background: "rgba(0,0,0,0.48)",
            color: style.typography.activeWordColor,
          }}
        >
          {style.code}
        </span>
      </div>
    </div>
  );
};

export const AnimationStylesPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [family, setFamily] = useState<"all" | AnimationStylePreset["family"]>("all");
  const [query, setQuery] = useState("");
  const [updateBackgrounds, setUpdateBackgrounds] = useState(true);
  const [updateSubtitles, setUpdateSubtitles] = useState(true);
  const [updateTransitions, setUpdateTransitions] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ANIMATION_STYLE_LIST.filter((st) => {
      if (family !== "all" && st.family !== family) return false;
      if (!q) return true;
      return (
        st.name.toLowerCase().includes(q) ||
        st.code.toLowerCase().includes(q) ||
        st.tagline.toLowerCase().includes(q)
      );
    });
  }, [family, query]);

  const applyStyle = (styleId: AnimationStyleId, name: string) => {
    dispatchOps([
      {
        op: "project.applyAnimationStyle",
        styleId,
        updateBackgrounds,
        updateSubtitles,
        updateTransitions,
      },
    ]);
    setBusyNotice(`Estilo de animación aplicado: ${name}`);
    window.setTimeout(() => setBusyNotice(null), 2400);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
          <Palette size={12} style={{ color: "var(--accent-primary)" }} /> Estilos de Animación
        </span>
        <span className="text-[9.5px] font-mono-code" style={{ color: "var(--text-muted)" }}>
          {ANIMATION_STYLE_LIST.length} estilos
        </span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
        <input
          className="studio-input w-full !pl-7"
          placeholder="Buscar estilo (3D, Kurzgesagt, Anime, Pixel, PSX…)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Family filter pills */}
      <div className="flex flex-wrap gap-1">
        {FAMILY_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFamily(f.id)}
            className="px-2 py-0.5 rounded-full text-[9.5px] font-medium cursor-pointer transition-colors"
            style={{
              background: family === f.id ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
              color: family === f.id ? "#0b0d14" : "var(--text-secondary)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Apply options */}
      <div
        className="rounded-xl p-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
      >
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={updateBackgrounds} onChange={(e) => setUpdateBackgrounds(e.target.checked)} />
          Fondos
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={updateSubtitles} onChange={(e) => setUpdateSubtitles(e.target.checked)} />
          Subtítulos
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={updateTransitions} onChange={(e) => setUpdateTransitions(e.target.checked)} />
          Transiciones
        </label>
      </div>

      {/* 2-Column Visual Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {filtered.map((st) => {
          const active = project.animationStyle === st.id;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => applyStyle(st.id, st.name)}
              title={`${st.code} · ${st.name}: ${st.tagline}`}
              className="rounded-xl p-1.5 flex flex-col gap-1 text-left cursor-pointer transition-all"
              style={{
                background: active ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1.5px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <StyleMiniPreview style={st} />
              <div className="flex items-center justify-between gap-1 px-0.5">
                <span className="text-[10.5px] font-semibold truncate">{st.name}</span>
                {active && <Check size={11} style={{ color: "var(--accent-primary)" }} className="shrink-0" />}
              </div>
              <div className="flex items-center gap-1 px-0.5">
                {[st.palette.bg, st.palette.accent, st.palette.ink].map((c, idx) => (
                  <span
                    key={idx}
                    className="w-2.5 h-2.5 rounded-full border border-white/20"
                    style={{ background: c }}
                  />
                ))}
                <span className="text-[8.5px] truncate ml-auto" style={{ color: "var(--text-muted)" }}>
                  <Sparkles size={8} className="inline mr-0.5" />
                  {st.typography.subtitleFont}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
