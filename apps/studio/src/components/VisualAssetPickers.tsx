import React, { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ShapeKind, TransitionType } from "@storia/schema";
import { TRANSITION_CATALOG, TransitionThumb } from "./TransitionsLibraryPanel";

// ============================================================================
// 1. VISUAL PROCEDURAL SHAPE GRID (13 Remotion Shapes with crisp live SVG icons)
// ============================================================================

const SHAPE_ITEMS: { id: ShapeKind; label: string; svg: (fill: string, stroke: string) => React.ReactNode }[] = [
  {
    id: "rounded_rect",
    label: "Rect. Red.",
    svg: (f, s) => <rect x="6" y="10" width="28" height="20" rx="6" fill={f} stroke={s} strokeWidth="2" />,
  },
  {
    id: "rect",
    label: "Rectángulo",
    svg: (f, s) => <rect x="6" y="10" width="28" height="20" fill={f} stroke={s} strokeWidth="2" />,
  },
  {
    id: "circle",
    label: "Círculo",
    svg: (f, s) => <circle cx="20" cy="20" r="12" fill={f} stroke={s} strokeWidth="2" />,
  },
  {
    id: "ring",
    label: "Anillo",
    svg: (_f, s) => <circle cx="20" cy="20" r="11" fill="none" stroke={s} strokeWidth="4" />,
  },
  {
    id: "line",
    label: "Línea",
    svg: (_f, s) => <line x1="6" y1="20" x2="34" y2="20" stroke={s} strokeWidth="4" strokeLinecap="round" />,
  },
  {
    id: "arrow",
    label: "Flecha",
    svg: (f, s) => (
      <path d="M6 20 H27 M21 12 L32 20 L21 28" fill="none" stroke={f || s} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    id: "callout",
    label: "Globo",
    svg: (f, s) => (
      <path d="M7 9 H33 A3 3 0 0 1 36 12 V24 A3 3 0 0 1 33 27 H23 L18 33 L16 27 H7 A3 3 0 0 1 4 24 V12 A3 3 0 0 1 7 9 Z" fill={f} stroke={s} strokeWidth="1.8" />
    ),
  },
  {
    id: "pie",
    label: "Gráfico Pie",
    svg: (f, s) => (
      <>
        <circle cx="20" cy="20" r="12" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
        <path d="M20 20 L20 8 A12 12 0 1 1 8.5 23.5 Z" fill={f} stroke={s} strokeWidth="1.5" />
      </>
    ),
  },
  {
    id: "star",
    label: "Estrella",
    svg: (f, s) => (
      <polygon points="20,6 24,15 34,16 26.5,22.5 28.5,33 20,27.5 11.5,33 13.5,22.5 6,16 16,15" fill={f} stroke={s} strokeWidth="1.6" />
    ),
  },
  {
    id: "spark",
    label: "Destello",
    svg: (f, s) => (
      <path d="M20 5 Q21 19 35 20 Q21 21 20 35 Q19 21 5 20 Q19 19 20 5 Z" fill={f} stroke={s} strokeWidth="1.5" />
    ),
  },
  {
    id: "triangle",
    label: "Triángulo",
    svg: (f, s) => <polygon points="20,7 34,31 6,31" fill={f} stroke={s} strokeWidth="2" />,
  },
  {
    id: "polygon",
    label: "Polígono",
    svg: (f, s) => <polygon points="20,6 32,13 32,27 20,34 8,27 8,13" fill={f} stroke={s} strokeWidth="2" />,
  },
  {
    id: "heart",
    label: "Corazón",
    svg: (f, s) => (
      <path d="M20 33 C11 26 6 20 6 14 C6 9.5 9.5 6.5 13.5 6.5 C16.5 6.5 18.8 8.2 20 10.4 C21.2 8.2 23.5 6.5 26.5 6.5 C30.5 6.5 34 9.5 34 14 C34 20 29 26 20 33 Z" fill={f} stroke={s} strokeWidth="1.6" />
    ),
  },
];

export const VisualShapeGrid: React.FC<{
  value: ShapeKind;
  fillColor?: string;
  strokeColor?: string;
  onChange: (shape: ShapeKind) => void;
}> = ({ value, fillColor, strokeColor, onChange }) => {
  const fill = fillColor || "#4ce6c8";
  const stroke = strokeColor || "#ffffff";
  return (
    <div className="grid grid-cols-4 gap-1">
      {SHAPE_ITEMS.map((item) => {
        const isSel = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className="rounded-lg p-1 flex flex-col items-center gap-0.5 cursor-pointer transition-all relative"
            style={{
              background: isSel ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
              border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
            }}
            title={item.label}
          >
            <svg viewBox="0 0 40 40" className="w-7 h-7">
              {item.svg(fill, stroke)}
            </svg>
            <span
              className="text-[8.5px] truncate max-w-full leading-none"
              style={{ color: isSel ? "var(--accent-primary)" : "var(--text-secondary)" }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ============================================================================
// 2. VISUAL PROCEDURAL BACKGROUND SETS GRID (14 Scenery Previews)
// ============================================================================

const PROCEDURAL_BG_CARDS: { id: string; label: string; bg: string; accent: string; horizon: string }[] = [
  { id: "living_room", label: "Sala", bg: "linear-gradient(180deg, #2d2640, #5c3d3b)", accent: "#fbbf24", horizon: "#3b2314" },
  { id: "dining_family", label: "Comedor", bg: "linear-gradient(180deg, #3b2824, #7c4d3a)", accent: "#fde68a", horizon: "#2e1b14" },
  { id: "childhood_room", label: "Cuarto", bg: "linear-gradient(180deg, #1e3a5f, #64748b)", accent: "#f9a8d4", horizon: "#1e293b" },
  { id: "city_crosswalk", label: "Ciudad", bg: "linear-gradient(180deg, #0f172a, #334155)", accent: "#38bdf8", horizon: "#111827" },
  { id: "memory_corridor", label: "Pasillo", bg: "linear-gradient(180deg, #1c1917, #57534e)", accent: "#fcd34d", horizon: "#0c0a09" },
  { id: "sunset_hill", label: "Atardecer", bg: "linear-gradient(180deg, #7c2d12, #fb7185 60%, #fde047)", accent: "#fffbeb", horizon: "#3b0764" },
  { id: "observatory", label: "Observatorio", bg: "linear-gradient(180deg, #020617, #1e1b4b)", accent: "#93c5fd", horizon: "#0f172a" },
  { id: "cafe", label: "Cafetería", bg: "linear-gradient(180deg, #3f2318, #92400e)", accent: "#fed7aa", horizon: "#27140d" },
  { id: "park", label: "Parque", bg: "linear-gradient(180deg, #0ea5e9, #bae6fd 65%, #22c55e)", accent: "#fef08a", horizon: "#15803d" },
  { id: "street", label: "Calle", bg: "linear-gradient(180deg, #1e293b, #475569)", accent: "#f59e0b", horizon: "#0f172a" },
  { id: "studio", label: "Estudio", bg: "linear-gradient(180deg, #111827, #312e81)", accent: "#4ce6c8", horizon: "#090d16" },
  { id: "library", label: "Biblioteca", bg: "linear-gradient(180deg, #271710, #6b3d24)", accent: "#fcd34d", horizon: "#1a0f0a" },
  { id: "hospital", label: "Clínica", bg: "linear-gradient(180deg, #0f766e, #cbd5e1)", accent: "#ffffff", horizon: "#334155" },
  { id: "forest", label: "Bosque", bg: "linear-gradient(180deg, #064e3b, #047857 65%, #022c22)", accent: "#a7f3d0", horizon: "#052e16" },
  { id: "stylized_3d_stage", label: "Estudio 3D", bg: "linear-gradient(180deg, #2b3b68, #101629)", accent: "#38bdf8", horizon: "#161f3b" },
  { id: "kurzgesagt_cosmos", label: "Kurzgesagt", bg: "linear-gradient(180deg, #132257, #070b21)", accent: "#00e5ff", horizon: "#0c143a" },
  { id: "anime_sky_cel", label: "Cielo Anime", bg: "linear-gradient(180deg, #1d6fe2, #f7c59f)", accent: "#ffffff", horizon: "#216b43" },
  { id: "retro_psx_arena", label: "Arena PSX", bg: "linear-gradient(180deg, #271b4a, #5c2459)", accent: "#22d3ee", horizon: "#0b0e21" },
  { id: "paper_cutout_stage", label: "Papel Craft", bg: "linear-gradient(180deg, #f7efe0, #e7dac2)", accent: "#f2b149", horizon: "#3b7a72" },
  { id: "pixel_stage_b7", label: "Pixel 16-bit", bg: "linear-gradient(180deg, #161c3d, #29366b)", accent: "#4ce6c8", horizon: "#232d52" },
];

export const VisualProceduralBgGrid: React.FC<{
  value: string;
  onChange: (setId: string) => void;
}> = ({ value, onChange }) => (
  <div className="grid grid-cols-3 gap-1.5 max-h-[168px] overflow-y-auto pr-0.5">
    {PROCEDURAL_BG_CARDS.map((card) => {
      const isSel = value === card.id;
      return (
        <button
          key={card.id}
          type="button"
          onClick={() => onChange(card.id)}
          className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer transition-all relative"
          style={{
            background: isSel ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
            border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          }}
        >
          <div
            className="w-full h-9 rounded-md relative overflow-hidden"
            style={{ background: card.bg }}
          >
            <div
              className="absolute top-1.5 right-2 w-2.5 h-2.5 rounded-full opacity-85"
              style={{ background: card.accent, boxShadow: `0 0 8px ${card.accent}` }}
            />
            <div
              className="absolute inset-x-0 bottom-0 h-3"
              style={{ background: card.horizon, opacity: 0.78 }}
            />
            {isSel && (
              <span
                className="absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full flex items-center justify-center"
                style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
              >
                <Check size={9} strokeWidth={3} />
              </span>
            )}
          </div>
          <span
            className="text-[9px] font-medium truncate w-full text-center leading-tight"
            style={{ color: isSel ? "var(--accent-primary)" : "var(--text-secondary)" }}
          >
            {card.label}
          </span>
        </button>
      );
    })}
  </div>
);

// ============================================================================
// 3. VISUAL TRANSITION PICKER FOR INSPECTOR (Replaces blind <select> lists)
// ============================================================================

export const VisualTransitionPicker: React.FC<{
  label: string;
  badge?: string;
  value: TransitionType;
  accentColor?: string;
  onChange: (next: TransitionType) => void;
}> = ({ label, badge, value, accentColor = "#ffd447", onChange }) => {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const currentDef = TRANSITION_CATALOG.find((t) => t.id === value) ?? TRANSITION_CATALOG[0]!;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl p-1.5 flex items-center gap-2 cursor-pointer transition-colors text-left"
        style={{
          background: open ? "var(--glass-active)" : "rgba(0,0,0,0.24)",
          border: `1px solid ${open ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        }}
      >
        <div className="w-12 shrink-0 pointer-events-none">
          <TransitionThumb type={value} accentColor={accentColor} animate={open} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1 text-[9px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            <span>{label}</span>
            {badge && <span className="font-mono-code opacity-80">{badge}</span>}
          </div>
          <div className="text-[11px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
            {currentDef.label}
          </div>
        </div>
        <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>
          {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </span>
      </button>

      {open && (
        <div
          className="rounded-xl p-1.5 grid grid-cols-3 gap-1.5 max-h-[195px] overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.28)", border: "1px solid var(--border-subtle)" }}
        >
          {TRANSITION_CATALOG.map((item) => {
            const isSel = item.id === value;
            return (
              <button
                key={item.id}
                type="button"
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered((c) => (c === item.id ? null : c))}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className="rounded-lg p-1 flex flex-col gap-1 cursor-pointer relative"
                style={{
                  background: isSel ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                  border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
                title={item.desc}
              >
                <TransitionThumb
                  type={item.id}
                  accentColor={accentColor}
                  animate={hovered === item.id || isSel}
                />
                <span
                  className="text-[9px] font-medium truncate w-full text-center leading-tight"
                  style={{ color: isSel ? "var(--accent-primary)" : "var(--text-secondary)" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
