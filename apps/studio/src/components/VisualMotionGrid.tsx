import React, { useMemo, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";
import type {
  LayerEnterAnim,
  LayerExitAnim,
  LayerLoopMotion,
  LayerMotion,
} from "@storia/schema";

export interface LayerPreviewDescriptor {
  kind: "image" | "text" | "shape" | "character" | "background";
  imageSrc?: string;
  pixelated?: boolean;
  text?: string;
  fontFamily?: string;
  color?: string;
  accentColor?: string;
  bgGradientTop?: string;
  bgGradientBottom?: string;
  label?: string;
}

const DEFAULT_MOTION: LayerMotion = {
  enter: "none",
  enterDuration: 0.35,
  exit: "none",
  exitDuration: 0.25,
  loop: "none",
  loopAmplitude: 0.5,
  loopSpeed: 1.2,
};

interface AnimItem<T extends string> {
  id: T;
  label: string;
  animClass: string;
}

const ENTER_ITEMS: AnimItem<LayerEnterAnim>[] = [
  { id: "none", label: "Ninguna", animClass: "" },
  { id: "fade", label: "Fundido", animClass: "st-m-fade-in" },
  { id: "pop", label: "Pop", animClass: "st-sub-pop" },
  { id: "zoom_in", label: "Zoom In", animClass: "st-m-zoom-in" },
  { id: "zoom_out", label: "Zoom Out", animClass: "st-m-zoom-out" },
  { id: "zoom_punch", label: "Zoom Punch", animClass: "st-sub-slam" },
  { id: "slide_up", label: "Subir", animClass: "st-sub-slide-up" },
  { id: "slide_down", label: "Bajar", animClass: "st-sub-slide-down" },
  { id: "slide_left", label: "Deslizar ←", animClass: "st-sub-slide-left" },
  { id: "slide_right", label: "Deslizar →", animClass: "st-sub-slide-right" },
  { id: "whip_left", label: "Látigo ←", animClass: "st-anim-whip-l" },
  { id: "whip_right", label: "Látigo →", animClass: "st-anim-whip-r" },
  { id: "whip_up", label: "Látigo ↑", animClass: "st-anim-whip-u" },
  { id: "whip_down", label: "Látigo ↓", animClass: "st-anim-whip-d" },
  { id: "bounce_in", label: "Rebote", animClass: "st-sub-bounce" },
  { id: "drop_in", label: "Caída", animClass: "st-sub-drop" },
  { id: "slam", label: "Golpe", animClass: "st-sub-slam" },
  { id: "stamp", label: "Sello", animClass: "st-sub-slam" },
  { id: "elastic", label: "Elástico", animClass: "st-m-elastic" },
  { id: "rubber_band", label: "Goma", animClass: "st-sub-squeeze" },
  { id: "squeeze_in", label: "Apretar", animClass: "st-sub-squeeze" },
  { id: "rise_spring", label: "Resorte ↑", animClass: "st-sub-bounce" },
  { id: "tilt_pop", label: "Pop Tilt", animClass: "st-m-tilt-pop" },
  { id: "swing_in", label: "Péndulo", animClass: "st-sub-swing" },
  { id: "spin_in", label: "Giro In", animClass: "st-sub-spin-pop" },
  { id: "spiral_in", label: "Espiral", animClass: "st-m-spiral-in" },
  { id: "flip_x", label: "Voltear X", animClass: "st-sub-flip-x" },
  { id: "flip_y", label: "Voltear Y", animClass: "st-sub-flip-y" },
  { id: "unfold_x", label: "Desplegar X", animClass: "st-m-unfold-x" },
  { id: "unfold_y", label: "Desplegar Y", animClass: "st-m-unfold-y" },
  { id: "blur_in", label: "Desenfoque", animClass: "st-sub-blur-in" },
  { id: "glitch", label: "Glitch", animClass: "st-anim-glitch" },
];

const EXIT_ITEMS: AnimItem<LayerExitAnim>[] = [
  { id: "none", label: "Ninguna", animClass: "" },
  { id: "fade", label: "Fundido", animClass: "st-m-fade-out" },
  { id: "pop", label: "Pop Out", animClass: "st-m-exit-zoom-out" },
  { id: "zoom_out", label: "Zoom Out", animClass: "st-m-exit-zoom-out" },
  { id: "zoom_in", label: "Zoom In", animClass: "st-m-exit-zoom-in" },
  { id: "slide_up", label: "Salir ↑", animClass: "st-m-exit-up" },
  { id: "slide_down", label: "Salir ↓", animClass: "st-m-exit-down" },
  { id: "slide_left", label: "Salir ←", animClass: "st-m-exit-left" },
  { id: "slide_right", label: "Salir →", animClass: "st-m-exit-right" },
  { id: "whip_left", label: "Látigo ←", animClass: "st-anim-whip-l" },
  { id: "whip_right", label: "Látigo →", animClass: "st-anim-whip-r" },
  { id: "drop_out", label: "Caer", animClass: "st-m-exit-down" },
  { id: "slam_out", label: "Golpe Out", animClass: "st-m-exit-zoom-in" },
  { id: "bounce_out", label: "Rebote Out", animClass: "st-m-exit-zoom-out" },
  { id: "flip_x", label: "Voltear X", animClass: "st-sub-flip-x" },
  { id: "flip_y", label: "Voltear Y", animClass: "st-sub-flip-y" },
  { id: "spin_out", label: "Giro Out", animClass: "st-m-shrink-spin" },
  { id: "shrink_spin", label: "Encoger Giro", animClass: "st-m-shrink-spin" },
  { id: "blur_out", label: "Blur Out", animClass: "st-sub-blur-in" },
  { id: "glitch_out", label: "Glitch Out", animClass: "st-anim-glitch" },
];

const LOOP_ITEMS: AnimItem<LayerLoopMotion>[] = [
  { id: "none", label: "Ninguno", animClass: "" },
  { id: "float", label: "Flotar", animClass: "st-m-float" },
  { id: "breathe", label: "Respirar", animClass: "st-m-breathe" },
  { id: "pulse", label: "Pulso", animClass: "st-anim-pulse" },
  { id: "heartbeat", label: "Latido", animClass: "st-m-heartbeat" },
  { id: "bounce", label: "Rebote", animClass: "st-sub-bounce" },
  { id: "wiggle", label: "Meneo", animClass: "st-m-wiggle" },
  { id: "pendulum", label: "Péndulo", animClass: "st-sub-swing" },
  { id: "tilt_rock", label: "Balanceo", animClass: "st-anim-sway" },
  { id: "sway_x", label: "Vaivén X", animClass: "st-m-sway-x" },
  { id: "sway_y", label: "Vaivén Y", animClass: "st-m-float" },
  { id: "hover_drift", label: "Deriva", animClass: "st-m-float" },
  { id: "orbit", label: "Órbita", animClass: "st-m-orbit" },
  { id: "spin", label: "Girar 360°", animClass: "st-m-spin" },
  { id: "ken_burns", label: "Ken Burns", animClass: "st-m-ken-burns" },
  { id: "zoom_breathe", label: "Zoom Suave", animClass: "st-m-breathe" },
  { id: "rubber_pulse", label: "Pulso Goma", animClass: "st-m-elastic" },
  { id: "shake", label: "Temblor", animClass: "st-anim-shake" },
  { id: "jitter", label: "Vibrar", animClass: "st-m-jitter" },
  { id: "flicker", label: "Parpadeo", animClass: "st-sub-flicker" },
];

const PreviewSubject: React.FC<{
  preview?: LayerPreviewDescriptor;
  animClass: string;
}> = ({ preview, animClass }) => {
  if (preview?.imageSrc) {
    return (
      <img
        src={preview.imageSrc}
        alt=""
        draggable={false}
        className={`max-w-[78%] max-h-[78%] object-contain select-none pointer-events-none ${animClass}`}
        style={preview.pixelated ? { imageRendering: "pixelated" } : undefined}
      />
    );
  }
  if (preview?.kind === "text") {
    const sample = (preview.text ?? "Aa").trim().slice(0, 10) || "Aa";
    return (
      <span
        className={`text-[11px] font-extrabold tracking-tight truncate max-w-[88%] px-1 select-none pointer-events-none ${animClass}`}
        style={{
          fontFamily: preview.fontFamily ? `"${preview.fontFamily}", sans-serif` : undefined,
          color: preview.color || "#ffffff",
          textShadow: "0 1px 4px rgba(0,0,0,0.85)",
        }}
      >
        {sample}
      </span>
    );
  }
  if (preview?.kind === "background") {
    return (
      <div
        className={`w-[72%] h-[68%] rounded-md shadow-inner ${animClass}`}
        style={{
          background: `linear-gradient(135deg, ${preview.bgGradientTop ?? "#3b82f6"}, ${preview.bgGradientBottom ?? "#9333ea"})`,
          border: "1px solid rgba(255,255,255,0.22)",
        }}
      />
    );
  }
  return (
    <div
      className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shadow-md select-none pointer-events-none ${animClass}`}
      style={{
        background: `linear-gradient(135deg, ${preview?.color ?? "#f7c8d6"}, ${preview?.accentColor ?? "#ffd447"})`,
        color: "#0b0c10",
      }}
    >
      {preview?.kind === "character" ? "2D" : preview?.kind === "shape" ? "◆" : "Aa"}
    </div>
  );
};

export interface VisualMotionGridProps {
  value?: LayerMotion;
  onChange: (next: LayerMotion) => void;
  preview?: LayerPreviewDescriptor;
}

export const VisualMotionGrid: React.FC<VisualMotionGridProps> = ({
  value,
  onChange,
  preview,
}) => {
  const m = { ...DEFAULT_MOTION, ...(value ?? {}) };
  const set = (patch: Partial<LayerMotion>) => onChange({ ...m, ...patch });

  const [tab, setTab] = useState<"enter" | "exit" | "loop">("enter");
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [alwaysAnimate, setAlwaysAnimate] = useState(() =>
    typeof window !== "undefined"
      ? !window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth >= 1024
      : false,
  );

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = tab === "enter" ? ENTER_ITEMS : tab === "exit" ? EXIT_ITEMS : LOOP_ITEMS;
    if (!q) return list;
    return list.filter((it) => it.label.toLowerCase().includes(q) || it.id.toLowerCase().includes(q));
  }, [tab, query]);

  const currentVal = tab === "enter" ? m.enter : tab === "exit" ? m.exit : m.loop;

  const handleSelect = (id: string) => {
    if (tab === "enter") set({ enter: id as LayerEnterAnim });
    else if (tab === "exit") set({ exit: id as LayerExitAnim });
    else set({ loop: id as LayerLoopMotion });
  };

  return (
    <div
      className="rounded-xl p-2.5 flex flex-col gap-2"
      style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1"
          style={{ color: "var(--text-secondary)" }}
        >
          <Sparkles size={11} style={{ color: "var(--accent-primary)" }} />
          Animaciones (Vista Previa)
        </span>
        <label className="flex items-center gap-1 text-[9.5px] cursor-pointer" style={{ color: "var(--text-muted)" }}>
          <input
            type="checkbox"
            checked={alwaysAnimate}
            onChange={(e) => setAlwaysAnimate(e.target.checked)}
          />
          Animar
        </label>
      </div>

      {/* CapCut Enter / Exit / Loop Tabs */}
      <div
        className="grid grid-cols-3 gap-1 p-0.5 rounded-lg"
        style={{ background: "rgba(0,0,0,0.22)", border: "1px solid var(--border-subtle)" }}
      >
        {(
          [
            { id: "enter", label: "Entrada", active: m.enter !== "none" },
            { id: "exit", label: "Salida", active: m.exit !== "none" },
            { id: "loop", label: "Bucle", active: m.loop !== "none" },
          ] as const
        ).map((t) => {
          const isTab = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`py-1 px-1.5 rounded-md text-[10px] font-semibold cursor-pointer flex items-center justify-center gap-1 transition-colors ${
                isTab ? "" : "opacity-75 hover:opacity-100"
              }`}
              style={{
                background: isTab ? "var(--glass-active)" : "transparent",
                color: isTab ? "var(--accent-primary)" : "var(--text-secondary)",
                border: isTab ? "1px solid var(--border-strong)" : "1px solid transparent",
              }}
            >
              <span>{t.label}</span>
              {t.active && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: "var(--accent-gold)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={11}
          className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-muted)" }}
        />
        <input
          type="text"
          className="studio-input w-full !pl-6 !py-1 !text-[10.5px]"
          placeholder={`Buscar animación de ${tab === "enter" ? "entrada" : tab === "exit" ? "salida" : "bucle"}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* CapCut-style 3-column Animated Preview Grid */}
      <div className="grid grid-cols-3 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
        {items.map((item) => {
          const isSel = currentVal === item.id;
          const animate = Boolean(item.animClass) && (alwaysAnimate || hoveredId === item.id || isSel);
          return (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((c) => (c === item.id ? null : c))}
              onClick={() => handleSelect(item.id)}
              className="rounded-lg p-1 flex flex-col items-center gap-1 cursor-pointer transition-all text-center relative"
              style={{
                background: isSel ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
              title={`${item.label} (${item.id})`}
            >
              <div
                className="w-full h-11 rounded-md overflow-hidden flex items-center justify-center relative"
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08), rgba(6,8,14,0.88))",
                }}
              >
                {item.id === "none" ? (
                  <span className="text-[11px] font-mono-code opacity-50">⊘</span>
                ) : (
                  <PreviewSubject preview={preview} animClass={animate ? item.animClass : ""} />
                )}
                {isSel && (
                  <span
                    className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
                  >
                    <Check size={9} strokeWidth={3} />
                  </span>
                )}
              </div>
              <span
                className="text-[9.5px] font-medium truncate max-w-full leading-tight"
                style={{ color: isSel ? "var(--accent-primary)" : "var(--text-secondary)" }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Contextual Timing / Intensity Sliders */}
      {tab === "enter" && m.enter !== "none" && (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Duración entrada ({m.enterDuration.toFixed(2)}s)
          <input
            type="range"
            min={0.08}
            max={2.0}
            step={0.04}
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
            min={0.08}
            max={2.0}
            step={0.04}
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
