import React, { useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Globe,
  Layers,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Type,
  Upload,
  Wand2,
} from "lucide-react";
import {
  SUBTITLE_STYLE_PRESETS,
  type ActiveWordEffect,
  type KeywordFx,
  type SubtitleAnimation,
  type SubtitleCue,
  type SubtitleOverlayStyle,
  type SubtitlePresetCategory,
  type SubtitleStyle,
  type SubtitleStylePreset,
  type SubtitleVfxIn,
  type SubtitleVfxOut,
  type WordEmphasis,
} from "@storia/schema";
import { studioApi } from "../lib/api";
import { ensureGoogleFontLoaded } from "../lib/fonts";
import { useStudioStore } from "../store/useStudioStore";
import { VisualFontPicker } from "./VisualPickers";

const PRESET_CATEGORIES: { id: "all" | SubtitlePresetCategory; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "viral", label: "Viral" },
  { id: "comic", label: "Cómic / 3D" },
  { id: "neon", label: "Neón" },
  { id: "cinematic", label: "Cine" },
  { id: "editorial", label: "Editorial" },
  { id: "retro", label: "Retro" },
  { id: "minimal", label: "Minimal" },
];

const OVERLAY_OPTIONS: { id: SubtitleOverlayStyle; label: string; sampleBg: string }[] = [
  { id: "none", label: "Sin caja", sampleBg: "transparent" },
  { id: "glass_card", label: "Glass Card", sampleBg: "rgba(15,23,42,0.72)" },
  { id: "solid_pill", label: "Píldora", sampleBg: "#11162a" },
  { id: "comic_box", label: "Cómic 3D", sampleBg: "#fffdf0" },
  { id: "neon_frame", label: "Marco Neón", sampleBg: "#050914" },
  { id: "gradient_ribbon", label: "Cinta Oro", sampleBg: "#191229" },
  { id: "tape_highlight", label: "Tape Papel", sampleBg: "#fff7e2" },
  { id: "editorial_bar", label: "Barra Cine", sampleBg: "#090b10" },
  { id: "highlighter_block", label: "Resaltador", sampleBg: "#fef08a" },
  { id: "brush_stroke", label: "Pincelada", sampleBg: "#1d1828" },
  { id: "retro_terminal", label: "Terminal", sampleBg: "#041108" },
  { id: "cinema_blur_bar", label: "Cine Blur", sampleBg: "rgba(5,6,10,0.68)" },
  { id: "retro_window", label: "Win98 OS", sampleBg: "#d4d0c8" },
  { id: "cyber_bracket", label: "Cyber HUD", sampleBg: "#050d18" },
  { id: "torn_paper", label: "Papel Rasg.", sampleBg: "#faf6ec" },
  { id: "news_ticker", label: "News Live", sampleBg: "#111827" },
  { id: "cinema_letterbox", label: "Letterbox", sampleBg: "#050608" },
  { id: "polaroid_strip", label: "Polaroid", sampleBg: "#fffdf8" },
  { id: "gradient_glass", label: "Glass Grad.", sampleBg: "#16192b" },
  { id: "comic_burst_box", label: "Cómic Burst", sampleBg: "#14091f" },
];

const ANIMATION_OPTIONS: { id: SubtitleAnimation; label: string; animClass: string; badge?: string }[] = [
  { id: "pop", label: "Pop Spring", animClass: "st-sub-pop", badge: "PRO" },
  { id: "slam", label: "Slam Golpe", animClass: "st-sub-slam", badge: "HOT" },
  { id: "bounce", label: "Rebote", animClass: "st-sub-bounce" },
  { id: "spring_drop", label: "Spring Drop", animClass: "st-sub-drop" },
  { id: "elastic_drop", label: "Caída Elást.", animClass: "st-sub-drop" },
  { id: "elastic_stretch", label: "Elástico X", animClass: "st-sub-squeeze" },
  { id: "squeeze", label: "Squeeze Pop", animClass: "st-sub-squeeze" },
  { id: "rubber_band", label: "Rubber Band", animClass: "st-sub-squeeze", badge: "FX" },
  { id: "heartbeat_in", label: "Latido Pop", animClass: "st-anim-pulse" },
  { id: "zoom_punch", label: "Zoom Punch", animClass: "st-anim-zoom" },
  { id: "stamp", label: "Sello Stamp", animClass: "st-sub-slam" },
  { id: "skew_snap", label: "Skew Snap", animClass: "st-sub-slide-left", badge: "PRO" },
  { id: "whip_in", label: "Whip In", animClass: "st-anim-whip-l", badge: "HOT" },
  { id: "wave", label: "Ola Palabra", animClass: "st-sub-bounce" },
  { id: "slide_up", label: "Subir", animClass: "st-sub-slide-up" },
  { id: "slide_down", label: "Bajar", animClass: "st-sub-slide-down" },
  { id: "slide_left", label: "Izquierda", animClass: "st-sub-slide-left" },
  { id: "slide_right", label: "Derecha", animClass: "st-sub-slide-right" },
  { id: "slide_fade", label: "Slide Fade", animClass: "st-sub-slide-up" },
  { id: "flip_x", label: "Flip 3D X", animClass: "st-sub-flip-x" },
  { id: "flip_y", label: "Flip 3D Y", animClass: "st-sub-flip-y" },
  { id: "spin_pop", label: "Giro Pop", animClass: "st-sub-spin-pop" },
  { id: "spiral_in", label: "Espiral 360", animClass: "st-sub-spin-pop", badge: "360" },
  { id: "rotate_in", label: "Rotación", animClass: "st-sub-spin-pop" },
  { id: "swing", label: "Péndulo", animClass: "st-sub-swing" },
  { id: "unfold", label: "Desplegar", animClass: "st-sub-flip-y" },
  { id: "curtain_reveal", label: "Cortina", animClass: "st-sub-flip-y" },
  { id: "blur_in", label: "Blur In", animClass: "st-sub-blur-in" },
  { id: "rise_fade", label: "Subida Suave", animClass: "st-sub-slide-up" },
  { id: "float_in", label: "Flotante", animClass: "st-sub-slide-up" },
  { id: "glitch", label: "Glitch RGB", animClass: "st-anim-glitch" },
  { id: "neon_flicker", label: "Neón Flicker", animClass: "st-sub-flicker" },
  { id: "typewriter", label: "Máquina", animClass: "st-sub-type" },
  { id: "karaoke_wipe", label: "Karaoke", animClass: "st-sub-type" },
  { id: "kinetic_split", label: "Split Cin.", animClass: "st-sub-flip-y" },
  { id: "fade", label: "Fundido", animClass: "st-anim-fade" },
  { id: "none", label: "Ninguna", animClass: "" },
];

const ACTIVE_WORD_OPTIONS: { id: ActiveWordEffect; label: string }[] = [
  { id: "pop", label: "Pop Spring" },
  { id: "pill_solid", label: "Píldora CapCut" },
  { id: "gradient_pill", label: "Píldora Glow" },
  { id: "extrude_3d", label: "Bloque 3D" },
  { id: "glow", label: "Glow Suave" },
  { id: "neon", label: "Neón Vivo" },
  { id: "highlight_sweep", label: "Resaltador" },
  { id: "fire_badge", label: "Fuego / Hot" },
  { id: "comic_burst", label: "Cómic Burst" },
  { id: "rainbow_wave", label: "Arcoíris Wave" },
  { id: "rainbow_shift", label: "Arcoíris Shift" },
  { id: "zoom_glow", label: "Zoom + Glow" },
  { id: "marker_circle", label: "Círculo Marc." },
  { id: "laser_underline", label: "Láser Línea" },
  { id: "outline_flash", label: "Borde Flash" },
  { id: "wave_lift", label: "Ola Elevada" },
  { id: "glitch_word", label: "Glitch Palabra" },
  { id: "bounce", label: "Salto" },
  { id: "shake", label: "Sacudida" },
  { id: "box", label: "Caja Borde" },
  { id: "underline", label: "Subrayado" },
  { id: "color", label: "Solo Color" },
  { id: "none", label: "Ninguno" },
];

const KEYWORD_FX_OPTIONS: { id: KeywordFx; label: string }[] = [
  { id: "scale_pop", label: "Escala Pop" },
  { id: "sparkle", label: "Destellos ★" },
  { id: "comic_star", label: "Estrella Cómic" },
  { id: "pill", label: "Píldora" },
  { id: "gold_badge", label: "Insignia Oro" },
  { id: "glow", label: "Resplandor" },
  { id: "neon_pulse", label: "Pulso Neón" },
  { id: "halo_ring", label: "Halo Anillo" },
  { id: "fire_aura", label: "Aura Fuego" },
  { id: "chromatic_pop", label: "RGB Pop" },
  { id: "tilt_punch", label: "Tilt Impacto" },
  { id: "underline_sweep", label: "Subrayado" },
  { id: "double_underline", label: "Doble Línea" },
  { id: "impact_shake", label: "Impacto" },
  { id: "strike_box", label: "Resaltador" },
  { id: "none", label: "Ninguno" },
];

const VFX_IN_OPTIONS: { id: SubtitleVfxIn; label: string; animClass: string }[] = [
  { id: "none", label: "Ninguno", animClass: "" },
  { id: "flash", label: "Flash Blanco", animClass: "st-anim-flash" },
  { id: "chromatic", label: "Split RGB", animClass: "st-sub-chromatic" },
  { id: "spark_burst", label: "Chispas ★", animClass: "st-sub-pop" },
  { id: "zoom_blur", label: "Zoom Blur", animClass: "st-anim-zoom" },
  { id: "glitch_slice", label: "Glitch Slice", animClass: "st-anim-glitch" },
  { id: "gold_shimmer", label: "Brillo Oro", animClass: "st-anim-flash" },
  { id: "shockwave_ring", label: "Onda Choque", animClass: "st-anim-pulse" },
  { id: "neon_sweep", label: "Barrido Neón", animClass: "st-sub-flicker" },
  { id: "fire_flare", label: "Llamarada", animClass: "st-anim-flash" },
  { id: "ink_splatter", label: "Tinta Pop", animClass: "st-sub-pop" },
  { id: "lens_flare", label: "Destello Lente", animClass: "st-anim-flash" },
  { id: "pixel_dissolve", label: "Pixel Dis.", animClass: "st-sub-blur-in" },
  { id: "rgb_pulse", label: "Pulso RGB", animClass: "st-sub-chromatic" },
  { id: "laser_scan", label: "Escáner Láser", animClass: "st-sub-type" },
  { id: "star_trail", label: "Estela Estrel.", animClass: "st-sub-pop" },
  { id: "smoke_puff", label: "Humo Suave", animClass: "st-sub-blur-in" },
  { id: "electric_arc", label: "Arco Eléctr.", animClass: "st-anim-glitch" },
];

const VFX_OUT_OPTIONS: { id: SubtitleVfxOut; label: string; animClass: string }[] = [
  { id: "none", label: "Ninguno", animClass: "" },
  { id: "fade_blur", label: "Blur Out", animClass: "st-sub-blur-in" },
  { id: "zoom_out", label: "Zoom Out", animClass: "st-anim-zoom" },
  { id: "glitch_out", label: "Glitch Out", animClass: "st-anim-glitch" },
  { id: "drop", label: "Caída Drop", animClass: "st-sub-drop" },
  { id: "shatter", label: "Estallido", animClass: "st-anim-shake" },
  { id: "vaporize", label: "Vaporizar", animClass: "st-sub-blur-in" },
  { id: "whip_out", label: "Whip Salida", animClass: "st-anim-whip-l" },
  { id: "pixel_out", label: "Pixel Out", animClass: "st-sub-blur-in" },
  { id: "flash_out", label: "Flash Out", animClass: "st-anim-flash" },
  { id: "shrink_spin", label: "Giro Encoger", animClass: "st-sub-spin-pop" },
  { id: "slice_split", label: "Corte RGB", animClass: "st-anim-glitch" },
  { id: "neon_off", label: "Apagar Neón", animClass: "st-sub-flicker" },
  { id: "slide_fade", label: "Deslizar Out", animClass: "st-sub-slide-down" },
];

function getOverlayPreviewStyle(
  ov: SubtitleOverlayStyle,
  bgCol: string,
  activeCol: string,
  glowCol?: string,
): React.CSSProperties {
  if (ov === "comic_box") {
    return {
      background: bgCol,
      border: "2px solid #090910",
      boxShadow: "2.5px 2.5px 0 #090910",
      borderRadius: 6,
      padding: "2px 6px",
    };
  }
  if (ov === "neon_frame") {
    const nc = glowCol ?? activeCol;
    return {
      background: "rgba(5,9,20,0.88)",
      border: `1.5px solid ${nc}`,
      boxShadow: `0 0 8px ${nc}77`,
      borderRadius: 6,
      padding: "2px 6px",
    };
  }
  if (ov === "glass_card") {
    return {
      background: "rgba(15,23,42,0.72)",
      border: "1px solid rgba(255,255,255,0.28)",
      borderRadius: 7,
      padding: "2px 6px",
    };
  }
  if (ov === "solid_pill") {
    return {
      background: bgCol,
      border: `1.5px solid ${activeCol}99`,
      borderRadius: 999,
      padding: "2px 7px",
    };
  }
  if (ov === "gradient_ribbon") {
    return {
      background: bgCol,
      borderTop: `1.5px solid ${activeCol}`,
      borderBottom: `1.5px solid ${activeCol}`,
      borderRadius: 5,
      padding: "2px 6px",
    };
  }
  if (ov === "tape_highlight") {
    return {
      background: bgCol,
      border: "1.5px solid #151821",
      transform: "skewX(-5deg)",
      borderRadius: 4,
      padding: "2px 6px",
    };
  }
  if (ov === "editorial_bar") {
    return {
      background: "rgba(9,11,16,0.84)",
      borderLeft: `3px solid ${activeCol}`,
      borderRadius: 4,
      padding: "2px 6px",
    };
  }
  if (ov === "highlighter_block") {
    return {
      background: "#fef08a",
      borderBottom: `2px solid ${activeCol}`,
      borderRadius: 4,
      padding: "2px 6px",
    };
  }
  if (ov === "brush_stroke") {
    return {
      background: bgCol,
      borderBottom: `2px solid ${activeCol}`,
      transform: "skewX(-7deg)",
      borderRadius: 4,
      padding: "2px 7px",
    };
  }
  if (ov === "retro_terminal") {
    return {
      background: "#041108",
      border: `1.5px solid ${activeCol}`,
      borderRadius: 4,
      padding: "2px 6px",
    };
  }
  if (ov === "cinema_blur_bar") {
    return {
      background: "rgba(5,6,10,0.68)",
      border: "1px solid rgba(255,255,255,0.18)",
      borderRadius: 6,
      padding: "2px 7px",
    };
  }
  if (ov === "retro_window") {
    return {
      background: "#d4d0c8",
      border: "1.5px solid #1f2937",
      borderTop: `4px solid ${activeCol}`,
      boxShadow: "2px 2px 0 rgba(0,0,0,0.65)",
      borderRadius: 2,
      padding: "2px 6px",
    };
  }
  if (ov === "cyber_bracket") {
    const nc = glowCol ?? activeCol;
    return {
      background: "rgba(5,13,24,0.84)",
      borderLeft: `2.5px solid ${nc}`,
      borderRight: `2.5px solid ${nc}`,
      borderRadius: 4,
      padding: "2px 7px",
    };
  }
  if (ov === "torn_paper") {
    return {
      background: "#faf6ec",
      border: "1px dashed rgba(26,28,36,0.45)",
      borderRadius: 3,
      padding: "2px 6px",
    };
  }
  if (ov === "news_ticker") {
    return {
      background: "#111827",
      borderLeft: `4px solid ${activeCol}`,
      borderBottom: `2px solid ${activeCol}`,
      borderRadius: 4,
      padding: "2px 7px",
    };
  }
  if (ov === "cinema_letterbox") {
    return {
      background: "rgba(5,6,8,0.88)",
      borderTop: "1px solid rgba(255,255,255,0.2)",
      borderBottom: "1px solid rgba(255,255,255,0.2)",
      borderRadius: 2,
      padding: "2px 8px",
    };
  }
  if (ov === "polaroid_strip") {
    return {
      background: "#fffdf8",
      border: "1px solid #d6d3cd",
      borderBottom: "4px solid #fffdf8",
      boxShadow: "0 2px 5px rgba(0,0,0,0.4)",
      borderRadius: 3,
      padding: "2px 7px",
    };
  }
  if (ov === "gradient_glass") {
    return {
      background: `linear-gradient(135deg, ${bgCol}dd, ${activeCol}33)`,
      border: `1.5px solid ${activeCol}88`,
      borderRadius: 10,
      padding: "2px 7px",
    };
  }
  if (ov === "comic_burst_box") {
    return {
      background: "#14091f",
      border: `2px solid ${activeCol}`,
      boxShadow: `0 0 8px ${activeCol}55`,
      borderRadius: 6,
      padding: "2px 7px",
    };
  }
  return { padding: "2px 4px" };
}

function getPresetCardContainerStyle(preset: SubtitleStylePreset): React.CSSProperties {
  const st = preset.style;
  return getOverlayPreviewStyle(
    st.overlayStyle ?? "none",
    st.backgroundBox?.color ?? "#0c101b",
    st.activeWordColor ?? "#ffd447",
    st.glowColor,
  );
}

export const SubtitleEditor: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const selectedCueId = useStudioStore((s) => s.selectedSubtitleCueId);
  const selectedWordId = useStudioStore((s) => s.selectedWordId);
  const selectSubtitleCue = useStudioStore((s) => s.selectSubtitleCue);
  const setCurrentTime = useStudioStore((s) => s.setCurrentTime);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const setTtsSourceMode = useStudioStore((s) => s.setTtsSourceMode);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busySub, setBusySub] = useState(false);
  const [editScope, setEditScope] = useState<"all" | "cue">("all");
  const [presetCat, setPresetCat] = useState<"all" | SubtitlePresetCategory>("all");
  const [styleTab, setStyleTab] = useState<"presets" | "anim" | "fx" | "typo">("presets");
  const [animDir, setAnimDir] = useState<"in" | "out">("in");
  const [fxSubTab, setFxSubTab] = useState<"active" | "overlay" | "keyword" | "vfx">("active");
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const sub = project.subtitles;
  const localFonts = project.assets.filter((a) => a.kind === "font");
  const activeCue = sub.cues.find((c) => c.id === selectedCueId) ?? sub.cues[0] ?? null;

  const effectiveStyle: SubtitleStyle = useMemo(() => {
    if (editScope === "cue" && activeCue?.styleOverride) {
      return {
        ...sub.style,
        ...activeCue.styleOverride,
        shadow: {
          ...sub.style.shadow,
          ...(activeCue.styleOverride.shadow ?? {}),
        },
        backgroundBox: {
          ...sub.style.backgroundBox,
          ...(activeCue.styleOverride.backgroundBox ?? {}),
        },
      };
    }
    return sub.style;
  }, [editScope, activeCue, sub.style]);

  const flashNotice = (msg: string) => {
    setBusyNotice(msg);
    window.setTimeout(() => setBusyNotice(null), 2600);
  };

  const applyStylePatch = (patch: Record<string, unknown>, forceScope?: "all" | "cue", clearCueOverrides = false) => {
    const scope = forceScope ?? editScope;
    if (typeof patch.fontFamily === "string" && (patch.fontSource ?? effectiveStyle.fontSource) === "google") {
      ensureGoogleFontLoaded(patch.fontFamily);
    }
    if (scope === "cue" && activeCue) {
      dispatchOps([{ op: "subtitle.updateCueStyle", cueId: activeCue.id, patch }]);
    } else {
      dispatchOps([{ op: "subtitle.applyStyleToAll", patch, clearCueOverrides }]);
    }
  };

  const applyPreset = (preset: SubtitleStylePreset, target: "all" | "cue") => {
    if (preset.style.fontFamily && preset.style.fontSource === "google") {
      ensureGoogleFontLoaded(preset.style.fontFamily);
    }
    if (target === "cue" && activeCue) {
      dispatchOps([
        {
          op: "subtitle.updateCueStyle",
          cueId: activeCue.id,
          patch: preset.style as Record<string, unknown>,
        },
      ]);
      flashNotice(`Estilo «${preset.name}» aplicado solo al bloque seleccionado.`);
    } else {
      dispatchOps([
        {
          op: "subtitle.applyStyleToAll",
          patch: preset.style as Record<string, unknown>,
          clearCueOverrides: true,
        },
      ]);
      flashNotice(`Estilo «${preset.name}» aplicado a todos los subtítulos.`);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusySub(true);
    try {
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".vtt") ? "vtt" : "auto";
      const res = await studioApi.importSubtitles(project.id, {
        content,
        format,
        tiktokMode: true,
        maxWordsPerPage: sub.style.maxWordsPerWindow,
        replaceExisting: true,
      });
      setProjectFromRemote(res.project);
      flashNotice(`Importados ${res.importedCount} subtítulos (${res.format.toUpperCase()}) con ritmo TikTok.`);
    } catch (err) {
      flashNotice(`Error importando subtítulos: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusySub(false);
    }
  };

  const handleTikTokRechunk = async () => {
    setBusySub(true);
    try {
      const res = await studioApi.rechunkSubtitlesTikTok(project.id, {
        maxWordsPerPage: sub.style.maxWordsPerWindow,
        combineTokensWithinMs: 1350,
        breakOnSilenceAfterMs: 420,
      });
      setProjectFromRemote(res.project);
      flashNotice(`Subtítulos re-paginados en ${res.pagesCount} páginas rítmicas TikTok / Reels.`);
    } catch (err) {
      flashNotice(`Error re-paginando subtítulos: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusySub(false);
    }
  };

  const addCueAtPlayhead = () => {
    const start = Number(currentTime.toFixed(2));
    const end = Number((start + 2.6).toFixed(2));
    const cueId = `cue_${Date.now().toString(36)}`;
    const words = ["Nuevo", "subtítulo", "en", "vivo"].map((text, idx) => ({
      id: `${cueId}_w${idx}`,
      text,
      start: Number((start + idx * 0.65).toFixed(2)),
      end: Number((start + (idx + 1) * 0.65).toFixed(2)),
      emphasis: (idx === 1 ? "highlight" : "normal") as WordEmphasis,
    }));
    const cue: SubtitleCue = {
      id: cueId,
      start,
      end,
      text: words.map((w) => w.text).join(" "),
      words,
    };
    dispatchOps([{ op: "subtitle.upsertCue", cue }]);
    selectSubtitleCue(cueId, null);
  };

  const rebuildWordsFromText = (cue: SubtitleCue, nextText: string) => {
    const tokens = nextText.trim().split(/\s+/).filter(Boolean);
    const dur = Math.max(0.2, cue.end - cue.start);
    const words = tokens.map((tok, i) => ({
      id: cue.words[i]?.id ?? `${cue.id}_w_${i}_${Date.now().toString(36).slice(-3)}`,
      text: tok,
      start: Number((cue.start + (i / Math.max(1, tokens.length)) * dur).toFixed(2)),
      end: Number((cue.start + ((i + 1) / Math.max(1, tokens.length)) * dur).toFixed(2)),
      emphasis: cue.words[i]?.emphasis ?? ("normal" as WordEmphasis),
      styleOverride: cue.words[i]?.styleOverride,
    }));
    dispatchOps([
      {
        op: "subtitle.upsertCue",
        cue: { ...cue, text: nextText, words },
      },
    ]);
  };

  const filteredPresets =
    presetCat === "all"
      ? SUBTITLE_STYLE_PRESETS
      : SUBTITLE_STYLE_PRESETS.filter((p) => p.category === presetCat);

  const hasCueOverride = Boolean(activeCue?.styleOverride && Object.keys(activeCue.styleOverride).length > 0);
  const currentAnimValue = animDir === "in" ? effectiveStyle.animationIn : effectiveStyle.animationOut;

  return (
    <div className="flex flex-col gap-2.5">
      {/* Top Toolbar: Import SRT/VTT & TikTok Rhythmic Re-pagination */}
      <div
        className="rounded-xl p-2 flex items-center gap-1.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".srt,.vtt,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImportFile(f);
            e.target.value = "";
          }}
        />
        <button
          className="studio-btn !py-1 !px-2 !text-[10.5px] flex-1 justify-center"
          disabled={busySub}
          onClick={() => fileInputRef.current?.click()}
          title="Importar archivo .SRT o .VTT y sincronizar palabras automáticamente"
        >
          {busySub ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
          Importar SRT / VTT
        </button>
        <button
          className="studio-btn studio-btn-accent !py-1 !px-2 !text-[10.5px] flex-1 justify-center"
          disabled={busySub || sub.cues.length === 0}
          onClick={() => void handleTikTokRechunk()}
          title="Reagrupa subtítulos por silencios y ritmo estilo TikTok / Reels"
        >
          <Sparkles size={11} />
          Ritmo TikTok
        </button>
        <button
          className="studio-btn !py-1 !px-2 !text-[10.5px] shrink-0 justify-center"
          disabled={busySub || sub.cues.length === 0}
          onClick={() => {
            setTtsSourceMode("subtitles");
            setActiveLeftTab("tts");
          }}
          title="Generar narración TTS desde estos subtítulos (agrupado en 1 pieza o individual por bloque)"
        >
          <AudioLines size={11} />
          Voz TTS
        </button>
      </div>

      {/* Scope Selector: Apply to ALL vs INDIVIDUAL cue */}
      <div
        className="rounded-xl p-2 flex flex-col gap-1.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--text-secondary)" }}
        >
          <span>Alcance del estilo</span>
          {hasCueOverride && activeCue && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
              Estilo propio activo
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setEditScope("all")}
            className={`studio-btn !py-1 !px-2 !text-[10.5px] justify-center ${editScope === "all" ? "studio-btn-accent" : ""}`}
          >
            <Globe size={11} /> Aplicar a todos
          </button>
          <button
            type="button"
            disabled={!activeCue}
            onClick={() => setEditScope("cue")}
            className={`studio-btn !py-1 !px-2 !text-[10.5px] justify-center ${editScope === "cue" ? "studio-btn-accent" : ""}`}
            title={activeCue ? `Editar estilo solo para: "${activeCue.text.slice(0, 32)}"` : "Selecciona un subtítulo"}
          >
            <Layers size={11} /> Solo este bloque
          </button>
        </div>

        {activeCue && hasCueOverride && (
          <div className="flex items-center gap-1 pt-0.5">
            <button
              type="button"
              className="studio-btn !py-0.5 !px-2 !text-[9.5px] flex-1 justify-center"
              onClick={() => {
                dispatchOps([
                  {
                    op: "subtitle.applyStyleToAll",
                    patch: effectiveStyle as unknown as Record<string, unknown>,
                    clearCueOverrides: true,
                  },
                ]);
                setEditScope("all");
                flashNotice("Estilo de este bloque aplicado a todos los subtítulos.");
              }}
            >
              <Check size={10} /> Copiar a todos
            </button>
            <button
              type="button"
              className="studio-btn !py-0.5 !px-2 !text-[9.5px] flex-1 justify-center"
              onClick={() => {
                dispatchOps([{ op: "subtitle.updateCueStyle", cueId: activeCue.id, patch: null }]);
                flashNotice("Bloque restaurado al estilo global.");
              }}
            >
              <RotateCcw size={10} /> Usar global
            </button>
          </div>
        )}
      </div>

      {/* Style Sub-Tabs: Visual Presets Grid / Animations Grid / FX & Overlays Grid / Typography */}
      <div className="grid grid-cols-4 gap-1">
        <button
          onClick={() => setStyleTab("presets")}
          className={`studio-btn !py-1 !px-1 !text-[10px] justify-center ${styleTab === "presets" ? "studio-btn-accent" : ""}`}
        >
          <Sparkles size={10} /> Estilos ({SUBTITLE_STYLE_PRESETS.length})
        </button>
        <button
          onClick={() => setStyleTab("anim")}
          className={`studio-btn !py-1 !px-1 !text-[10px] justify-center ${styleTab === "anim" ? "studio-btn-accent" : ""}`}
        >
          Anim ({ANIMATION_OPTIONS.length})
        </button>
        <button
          onClick={() => setStyleTab("fx")}
          className={`studio-btn !py-1 !px-1 !text-[10px] justify-center ${styleTab === "fx" ? "studio-btn-accent" : ""}`}
        >
          <Wand2 size={10} /> FX Grid
        </button>
        <button
          onClick={() => setStyleTab("typo")}
          className={`studio-btn !py-1 !px-1 !text-[10px] justify-center ${styleTab === "typo" ? "studio-btn-accent" : ""}`}
        >
          <Type size={10} /> Texto
        </button>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: 24 CAPCUT-GRADE VISUAL SUBTITLE PRESETS GRID                   */}
      {/* ===================================================================== */}
      {styleTab === "presets" && (
        <div
          className="rounded-xl p-2 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex flex-wrap gap-1">
            {PRESET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setPresetCat(cat.id)}
                className="px-2 py-0.5 rounded-full text-[9.5px] font-medium cursor-pointer transition-colors"
                style={{
                  background: presetCat === cat.id ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                  color: presetCat === cat.id ? "#0b0d14" : "var(--text-secondary)",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5 max-h-[280px] overflow-y-auto pr-0.5">
            {filteredPresets.map((preset) => {
              const isSelected = effectiveStyle.presetId === preset.id;
              const isHovered = hoveredKey === `preset:${preset.id}`;
              const st = preset.style;
              const isPillWord = st.activeWordEffect === "pill_solid";
              const strokeW = Math.min(2, (st.strokeWidth ?? 0) * 0.16);
              const animDef = ANIMATION_OPTIONS.find((a) => a.id === st.animationIn);
              const extrudeShadow =
                (st.extrudeDepth ?? 0) > 0
                  ? `1.5px 2px 0 ${st.extrudeColor ?? "#000"}, 2.5px 3.5px 0 ${st.extrudeColor ?? "#000"}`
                  : (st.glowIntensity ?? 0) > 0.35
                    ? `0 0 8px ${st.glowColor ?? st.activeWordColor ?? "#ffd447"}`
                    : "0 2px 5px rgba(0,0,0,0.85)";

              return (
                <div
                  key={preset.id}
                  onMouseEnter={() => setHoveredKey(`preset:${preset.id}`)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() => applyPreset(preset, editScope)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") applyPreset(preset, editScope);
                  }}
                  title={`${preset.name}: ${preset.description}`}
                  className="rounded-xl p-1.5 flex flex-col gap-1 cursor-pointer transition-all"
                  style={{
                    background: isSelected ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                    border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div
                    className="h-[54px] rounded-lg flex items-center justify-center overflow-hidden relative px-1"
                    style={{
                      background:
                        preset.category === "neon"
                          ? "radial-gradient(circle at 50% 45%, #161838, #060812)"
                          : preset.category === "retro"
                            ? "linear-gradient(135deg, #0b1c12, #0d111a)"
                            : preset.category === "comic"
                              ? "linear-gradient(135deg, #271a3c, #121521)"
                              : "linear-gradient(180deg, #1b2030, #0d1018)",
                    }}
                  >
                    <span
                      className="text-[7px] font-mono-code px-1 rounded absolute top-1 left-1"
                      style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-muted)" }}
                    >
                      {preset.badge}
                    </span>
                    <div
                      className={`flex items-center gap-1 leading-none select-none ${
                        (isHovered || isSelected) && animDef?.animClass ? animDef.animClass : ""
                      }`}
                      style={{
                        ...getPresetCardContainerStyle(preset),
                        transform: `rotate(${(st.tiltDeg ?? 0) * 0.7}deg)`,
                        fontFamily: `${st.fontFamily ?? "Figtree"}, system-ui, sans-serif`,
                        fontWeight: st.fontWeight ?? 800,
                        fontSize: 10,
                        letterSpacing: (st.letterSpacing ?? 0) * 0.22,
                      }}
                    >
                      {preset.sampleWords.map((sw, idx) => {
                        const isMid = idx === 1;
                        return (
                          <span
                            key={`${preset.id}-${idx}`}
                            style={{
                              color: isMid
                                ? isPillWord
                                  ? "#ffffff"
                                  : st.activeWordColor ?? "#ffd447"
                                : st.color ?? "#ffffff",
                              background: isMid && isPillWord ? st.activeWordColor ?? "#7c3aed" : undefined,
                              padding: isMid && isPillWord ? "1px 4px" : undefined,
                              borderRadius: isMid && isPillWord ? 4 : undefined,
                              WebkitTextStroke:
                                strokeW > 0.2 ? `${strokeW}px ${st.strokeColor ?? "#000"}` : undefined,
                              textShadow: extrudeShadow,
                            }}
                          >
                            {st.uppercase ? sw.toUpperCase() : sw}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 px-0.5">
                    <span className="text-[10px] font-semibold truncate">{preset.name}</span>
                    {activeCue && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          applyPreset(preset, editScope === "all" ? "cue" : "all");
                        }}
                        className="text-[8.5px] px-1 py-0.5 rounded opacity-75 hover:opacity-100 cursor-pointer"
                        style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
                        title={
                          editScope === "all"
                            ? "Aplicar solo al bloque activo"
                            : "Aplicar a todos los subtítulos"
                        }
                      >
                        {editScope === "all" ? "1x" : "Todos"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: LIVE ANIMATED PREVIEW GRID FOR 30 ENTRANCE / EXIT ANIMATIONS   */}
      {/* ===================================================================== */}
      {styleTab === "anim" && (
        <div
          className="rounded-xl p-2 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => setAnimDir("in")}
              className={`studio-btn !py-1 !text-[10.5px] justify-center ${animDir === "in" ? "studio-btn-accent" : ""}`}
            >
              Entrada ({effectiveStyle.animationIn})
            </button>
            <button
              onClick={() => setAnimDir("out")}
              className={`studio-btn !py-1 !text-[10.5px] justify-center ${animDir === "out" ? "studio-btn-accent" : ""}`}
            >
              Salida ({effectiveStyle.animationOut})
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5 max-h-[280px] overflow-y-auto pr-0.5">
            {ANIMATION_OPTIONS.map((anim) => {
              const isSelected = currentAnimValue === anim.id;
              const isHovered = hoveredKey === `anim:${anim.id}`;
              return (
                <button
                  key={anim.id}
                  type="button"
                  onMouseEnter={() => setHoveredKey(`anim:${anim.id}`)}
                  onMouseLeave={() => setHoveredKey(null)}
                  onClick={() =>
                    applyStylePatch(animDir === "in" ? { animationIn: anim.id } : { animationOut: anim.id })
                  }
                  className="rounded-xl p-1 flex flex-col gap-1 cursor-pointer transition-all text-left"
                  style={{
                    background: isSelected ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                    border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div
                    className="h-10 w-full rounded-lg flex items-center justify-center overflow-hidden relative"
                    style={{ background: "linear-gradient(145deg, #161c2e, #0a0d16)" }}
                  >
                    <span
                      className={`text-[10.5px] font-extrabold tracking-wide select-none ${
                        (isHovered || isSelected) && anim.animClass ? anim.animClass : ""
                      }`}
                      style={{
                        color: isSelected ? effectiveStyle.activeWordColor : "#f8fafc",
                        textShadow: "0 2px 4px rgba(0,0,0,0.8)",
                      }}
                    >
                      TEXTO
                    </span>
                    {anim.badge && (
                      <span
                        className="absolute top-0.5 right-0.5 text-[6.5px] font-mono-code px-1 rounded"
                        style={{ background: "rgba(255,212,71,0.22)", color: "#ffd447" }}
                      >
                        {anim.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[9.5px] font-medium truncate w-full text-center px-0.5">
                    {anim.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: VISUAL PREVIEW GRIDS FOR ACTIVE WORD, OVERLAYS, KEYWORDS & VFX */}
      {/* ===================================================================== */}
      {styleTab === "fx" && (
        <div
          className="rounded-xl p-2 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          {/* FX Category Mini Tabs */}
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                ["active", "Palabra"],
                ["overlay", "Overlays"],
                ["keyword", "Keyword"],
                ["vfx", "VFX In/Out"],
              ] as const
            ).map(([id, lbl]) => (
              <button
                key={id}
                onClick={() => setFxSubTab(id)}
                className={`studio-btn !py-1 !px-1 !text-[9.5px] justify-center ${fxSubTab === id ? "studio-btn-accent" : ""}`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {/* SUBTAB A: ACTIVE WORD FX VISUAL GRID */}
          {fxSubTab === "active" && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
              {ACTIVE_WORD_OPTIONS.map((opt) => {
                const isSelected = effectiveStyle.activeWordEffect === opt.id;
                const isHovered = hoveredKey === `aw:${opt.id}`;
                const ac = effectiveStyle.activeWordColor;
                const animCls =
                  isHovered || isSelected
                    ? opt.id === "shake"
                      ? "st-anim-shake"
                      : opt.id === "bounce"
                        ? "st-sub-bounce"
                        : opt.id === "pop" || opt.id === "fire_badge"
                          ? "st-sub-pop"
                          : ""
                    : "";
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onMouseEnter={() => setHoveredKey(`aw:${opt.id}`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => applyStylePatch({ activeWordEffect: opt.id })}
                    className="rounded-xl p-1 flex flex-col gap-1 cursor-pointer"
                    style={{
                      background: isSelected ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                      border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div
                      className="h-10 w-full rounded-lg flex items-center justify-center overflow-hidden px-1"
                      style={{ background: "linear-gradient(145deg, #161b2c, #0a0c14)" }}
                    >
                      <span
                        className={`text-[10px] font-black select-none ${animCls}`}
                        style={{
                          color:
                            opt.id === "pill_solid"
                              ? "#ffffff"
                              : opt.id === "none"
                                ? "#e2e8f0"
                                : opt.id === "highlight_sweep"
                                  ? "#090b10"
                                  : ac,
                          background:
                            opt.id === "pill_solid"
                              ? ac
                              : opt.id === "box"
                                ? `${ac}33`
                                : opt.id === "highlight_sweep"
                                  ? ac
                                  : opt.id === "fire_badge"
                                    ? "rgba(255,46,31,0.38)"
                                    : undefined,
                          border:
                            opt.id === "box"
                              ? `1.5px solid ${ac}`
                              : opt.id === "fire_badge"
                                ? "1.5px solid #ff8c24"
                                : undefined,
                          borderBottom: opt.id === "underline" ? `2.5px solid ${ac}` : undefined,
                          padding:
                            opt.id === "pill_solid" || opt.id === "box" || opt.id === "highlight_sweep" || opt.id === "fire_badge"
                              ? "1px 5px"
                              : "0 2px",
                          borderRadius: opt.id === "pill_solid" ? 999 : 4,
                          textShadow:
                            opt.id === "glow" || opt.id === "neon"
                              ? `0 0 8px ${ac}, 0 0 14px ${ac}`
                              : opt.id === "extrude_3d"
                                ? "2px 2px 0 #000, 3.5px 3.5px 0 #000"
                                : "0 1px 3px rgba(0,0,0,0.8)",
                        }}
                      >
                        ACTIVA
                      </span>
                    </div>
                    <span className="text-[9px] font-medium truncate w-full text-center">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* SUBTAB B: 15 OVERLAYS VISUAL GRID */}
          {fxSubTab === "overlay" && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
              {OVERLAY_OPTIONS.map((ov) => {
                const isSelected = (effectiveStyle.overlayStyle ?? "none") === ov.id;
                const darkText =
                  ov.id === "comic_box" ||
                  ov.id === "tape_highlight" ||
                  ov.id === "highlighter_block" ||
                  ov.id === "retro_window" ||
                  ov.id === "torn_paper";
                return (
                  <button
                    key={ov.id}
                    type="button"
                    onClick={() => applyStylePatch({ overlayStyle: ov.id })}
                    className="rounded-xl p-1 flex flex-col gap-1 cursor-pointer"
                    style={{
                      background: isSelected ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                      border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div
                      className="h-10 w-full rounded-lg flex items-center justify-center overflow-hidden px-1"
                      style={{ background: "linear-gradient(145deg, #252b42, #101420)" }}
                    >
                      <span
                        className="text-[9px] font-bold leading-none"
                        style={{
                          ...getOverlayPreviewStyle(
                            ov.id,
                            ov.sampleBg,
                            effectiveStyle.activeWordColor,
                            effectiveStyle.glowColor,
                          ),
                          color: darkText ? "#11131a" : "#ffffff",
                        }}
                      >
                        SUB
                      </span>
                    </div>
                    <span className="text-[9px] font-medium truncate w-full text-center">{ov.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* SUBTAB C: KEYWORD FX VISUAL GRID */}
          {fxSubTab === "keyword" && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[210px] overflow-y-auto pr-0.5">
              {KEYWORD_FX_OPTIONS.map((kw) => {
                const isSelected = (effectiveStyle.keywordFx ?? "scale_pop") === kw.id;
                const isHovered = hoveredKey === `kw:${kw.id}`;
                const ac = effectiveStyle.accentWordColor;
                const animCls =
                  isHovered || isSelected
                    ? kw.id === "impact_shake"
                      ? "st-anim-shake"
                      : kw.id === "scale_pop" || kw.id === "sparkle"
                        ? "st-sub-pop"
                        : kw.id === "neon_pulse"
                          ? "st-anim-pulse"
                          : ""
                    : "";
                return (
                  <button
                    key={kw.id}
                    type="button"
                    onMouseEnter={() => setHoveredKey(`kw:${kw.id}`)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => applyStylePatch({ keywordFx: kw.id })}
                    className="rounded-xl p-1 flex flex-col gap-1 cursor-pointer"
                    style={{
                      background: isSelected ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                      border: `1.5px solid ${isSelected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div
                      className="h-10 w-full rounded-lg flex items-center justify-center overflow-hidden px-1"
                      style={{ background: "linear-gradient(145deg, #161b2c, #0a0c14)" }}
                    >
                      <span
                        className={`text-[9.5px] font-extrabold ${animCls}`}
                        style={{
                          color: kw.id === "strike_box" ? "#0b0d14" : kw.id === "none" ? "#cbd5e1" : ac,
                          background:
                            kw.id === "pill"
                              ? `${ac}33`
                              : kw.id === "strike_box"
                                ? ac
                                : undefined,
                          border: kw.id === "pill" ? `1px solid ${ac}` : undefined,
                          borderBottom: kw.id === "underline_sweep" ? `2px solid ${ac}` : undefined,
                          padding: kw.id === "pill" || kw.id === "strike_box" ? "1px 5px" : "0 2px",
                          borderRadius: 4,
                          textShadow:
                            kw.id === "glow" || kw.id === "neon_pulse"
                              ? `0 0 8px ${ac}`
                              : undefined,
                        }}
                      >
                        {kw.id === "sparkle" ? "★ CLAVE" : "CLAVE"}
                      </span>
                    </div>
                    <span className="text-[9px] font-medium truncate w-full text-center">{kw.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* SUBTAB D: VFX IN & VFX OUT VISUAL GRIDS */}
          {fxSubTab === "vfx" && (
            <div className="flex flex-col gap-2 max-h-[225px] overflow-y-auto pr-0.5">
              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  VFX Entrada
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {VFX_IN_OPTIONS.map((v) => {
                    const isSel = (effectiveStyle.vfxIn ?? "none") === v.id;
                    const isHov = hoveredKey === `vin:${v.id}`;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onMouseEnter={() => setHoveredKey(`vin:${v.id}`)}
                        onMouseLeave={() => setHoveredKey(null)}
                        onClick={() => applyStylePatch({ vfxIn: v.id })}
                        className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer"
                        style={{
                          background: isSel ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                          border: `1.5px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        }}
                      >
                        <div className="h-8 w-full rounded flex items-center justify-center bg-[#0d101b] overflow-hidden">
                          <span className={`text-[9.5px] font-bold ${(isHov || isSel) ? v.animClass : ""}`}>
                            {v.id === "spark_burst" ? "✦ IN" : "VFX IN"}
                          </span>
                        </div>
                        <span className="text-[8.5px] truncate w-full text-center">{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[9.5px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
                  VFX Salida
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {VFX_OUT_OPTIONS.map((v) => {
                    const isSel = (effectiveStyle.vfxOut ?? "none") === v.id;
                    const isHov = hoveredKey === `vout:${v.id}`;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onMouseEnter={() => setHoveredKey(`vout:${v.id}`)}
                        onMouseLeave={() => setHoveredKey(null)}
                        onClick={() => applyStylePatch({ vfxOut: v.id })}
                        className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer"
                        style={{
                          background: isSel ? "var(--glass-active)" : "rgba(7,9,15,0.68)",
                          border: `1.5px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        }}
                      >
                        <div className="h-8 w-full rounded flex items-center justify-center bg-[#0d101b] overflow-hidden">
                          <span className={`text-[9.5px] font-bold ${(isHov || isSel) ? v.animClass : ""}`}>
                            VFX OUT
                          </span>
                        </div>
                        <span className="text-[8.5px] truncate w-full text-center">{v.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 3D Extrusion + Glow + Tilt Sliders */}
          <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              3D ({effectiveStyle.extrudeDepth ?? 0}px)
              <input
                type="range"
                min={0}
                max={16}
                step={1}
                value={effectiveStyle.extrudeDepth ?? 0}
                onChange={(e) => applyStylePatch({ extrudeDepth: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              Glow ({Math.round((effectiveStyle.glowIntensity ?? 0) * 100)}%)
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={effectiveStyle.glowIntensity ?? 0}
                onChange={(e) => applyStylePatch({ glowIntensity: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              Inclin. ({effectiveStyle.tiltDeg ?? 0}°)
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={effectiveStyle.tiltDeg ?? 0}
                onChange={(e) => applyStylePatch({ tiltDeg: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              Color 3D / Extrusión
              <input
                type="color"
                className="w-full h-5 rounded border-0 bg-transparent cursor-pointer"
                value={(effectiveStyle.extrudeColor ?? "#000000").slice(0, 7)}
                onChange={(e) => applyStylePatch({ extrudeColor: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              Color Neón / Glow
              <input
                type="color"
                className="w-full h-5 rounded border-0 bg-transparent cursor-pointer"
                value={(effectiveStyle.glowColor ?? effectiveStyle.activeWordColor).slice(0, 7)}
                onChange={(e) => applyStylePatch({ glowColor: e.target.value })}
              />
            </label>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: TYPOGRAPHY, COLORS, STROKE & BOX                               */}
      {/* ===================================================================== */}
      {styleTab === "typo" && (
        <div
          className="rounded-xl p-2.5 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase" style={{ color: "var(--text-secondary)" }}>
              Tipografía &amp; Colores
            </span>
            <label className="flex items-center gap-1.5 text-[10.5px] cursor-pointer">
              <input
                type="checkbox"
                checked={effectiveStyle.uppercase}
                onChange={(e) => applyStylePatch({ uppercase: e.target.checked })}
              />
              MAYÚSCULAS
            </label>
          </div>

          <VisualFontPicker
            value={effectiveStyle.fontFamily}
            localFonts={localFonts}
            sampleText={activeCue?.text ?? "Subtítulos Pro"}
            onSelect={(val, localAssetId) => {
              if (localAssetId) {
                applyStylePatch({ fontFamily: val, fontSource: "local", fontAssetId: localAssetId });
              } else {
                ensureGoogleFontLoaded(val);
                applyStylePatch({ fontFamily: val, fontSource: "google", fontAssetId: undefined });
              }
            }}
          />

          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            Palabras/ventana ({effectiveStyle.maxWordsPerWindow})
            <input
              type="range"
              min={1}
              max={8}
              step={1}
              value={effectiveStyle.maxWordsPerWindow}
              onChange={(e) => applyStylePatch({ maxWordsPerWindow: Number(e.target.value) })}
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Tamaño ({effectiveStyle.fontSize}px)
              <input
                type="range"
                min={26}
                max={120}
                value={effectiveStyle.fontSize}
                onChange={(e) => applyStylePatch({ fontSize: Number(e.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Borde ({effectiveStyle.strokeWidth}px)
              <input
                type="range"
                min={0}
                max={20}
                value={effectiveStyle.strokeWidth}
                onChange={(e) => applyStylePatch({ strokeWidth: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ["Base", "color", effectiveStyle.color],
                ["Activa", "activeWordColor", effectiveStyle.activeWordColor],
                ["Acento", "accentWordColor", effectiveStyle.accentWordColor],
                ["Borde", "strokeColor", effectiveStyle.strokeColor],
              ] as const
            ).map(([lbl, key, val]) => (
              <label key={key} className="flex flex-col gap-0.5 text-[9.5px] items-center" style={{ color: "var(--text-muted)" }}>
                {lbl}
                <input
                  type="color"
                  className="w-full h-6 rounded border-0 bg-transparent cursor-pointer"
                  value={val.slice(0, 7)}
                  onChange={(e) => applyStylePatch({ [key]: e.target.value })}
                />
              </label>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5 pt-1 border-t" style={{ borderColor: "var(--border-subtle)" }}>
            <label className="flex items-center gap-1.5 text-[10.5px] cursor-pointer">
              <input
                type="checkbox"
                checked={effectiveStyle.backgroundBox.enabled}
                onChange={(e) =>
                  applyStylePatch({
                    backgroundBox: { ...effectiveStyle.backgroundBox, enabled: e.target.checked },
                  })
                }
              />
              Caja fondo
            </label>
            <label className="flex items-center gap-1.5 text-[10.5px] cursor-pointer">
              <input
                type="color"
                className="w-6 h-5 rounded border-0 bg-transparent cursor-pointer"
                value={effectiveStyle.backgroundBox.color.slice(0, 7)}
                onChange={(e) =>
                  applyStylePatch({
                    backgroundBox: { ...effectiveStyle.backgroundBox, color: e.target.value },
                  })
                }
              />
              Color caja / overlay
            </label>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CUE LIST                                                              */}
      {/* ===================================================================== */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Bloques ({sub.cues.length})
        </span>
        <button className="studio-btn !py-1 !px-2 !text-[10.5px]" onClick={addCueAtPlayhead}>
          <Plus size={12} /> Añadir en cabezal
        </button>
      </div>

      <div className="flex flex-col gap-1 max-h-[145px] overflow-y-auto pr-0.5">
        {sub.cues.map((cue) => {
          const isSel = activeCue?.id === cue.id;
          const cueCustom = Boolean(cue.styleOverride && Object.keys(cue.styleOverride).length > 0);
          return (
            <div
              key={cue.id}
              onClick={() => {
                selectSubtitleCue(cue.id, null);
                setCurrentTime(cue.start + 0.05);
              }}
              className="rounded-lg px-2 py-1.5 cursor-pointer flex items-start justify-between gap-2"
              style={{
                background: isSel ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="min-w-0">
                <div className="text-[9.5px] font-mono-code flex items-center gap-1.5" style={{ color: "var(--accent-teal)" }}>
                  <span>{cue.start.toFixed(2)}s → {cue.end.toFixed(2)}s</span>
                  {cueCustom && (
                    <span className="px-1 rounded bg-amber-500/20 text-amber-300 text-[8.5px]">
                      Custom
                    </span>
                  )}
                </div>
                <div className="text-[11px] truncate">{cue.text}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="studio-btn !p-1"
                  title="Generar voz TTS para este subtítulo"
                  onClick={(e) => {
                    e.stopPropagation();
                    selectSubtitleCue(cue.id, null);
                    setTtsSourceMode("subtitles");
                    setActiveLeftTab("tts");
                  }}
                >
                  <AudioLines size={11} />
                </button>
                <button
                  className="studio-btn !p-1"
                  title="Eliminar subtítulo"
                  onClick={(e) => {
                    e.stopPropagation();
                    dispatchOps([{ op: "subtitle.removeCue", cueId: cue.id }]);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* ACTIVE CUE & INDIVIDUAL WORD / KEYWORD FX EDITOR                      */}
      {/* ===================================================================== */}
      {activeCue && (
        <div
          className="rounded-xl p-2.5 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Texto &amp; Palabras Clave
            </div>
            <span className="text-[9.5px]" style={{ color: "var(--text-muted)" }}>
              Clic en palabra para FX individual
            </span>
          </div>

          <textarea
            rows={2}
            className="studio-input w-full resize-none"
            value={activeCue.text}
            onChange={(e) => rebuildWordsFromText(activeCue, e.target.value)}
          />

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Inicio (s)
              <input
                type="number"
                step={0.05}
                min={0}
                className="studio-input font-mono-code"
                value={activeCue.start}
                onChange={(e) => {
                  const start = Math.max(0, Number(e.target.value));
                  if (start < activeCue.end) {
                    dispatchOps([{ op: "subtitle.upsertCue", cue: { ...activeCue, start } }]);
                  }
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Fin (s)
              <input
                type="number"
                step={0.05}
                min={activeCue.start + 0.1}
                className="studio-input font-mono-code"
                value={activeCue.end}
                onChange={(e) => {
                  const end = Math.max(activeCue.start + 0.1, Number(e.target.value));
                  dispatchOps([{ op: "subtitle.upsertCue", cue: { ...activeCue, end } }]);
                }}
              />
            </label>
          </div>

          {/* Interactive Word Chips */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {activeCue.words.map((w) => {
              const isWordSel = selectedWordId === w.id;
              const hasFx = Boolean(w.styleOverride?.fx && w.styleOverride.fx !== "none");
              const badgeCol =
                w.emphasis === "alert"
                  ? "var(--accent-danger)"
                  : w.emphasis === "accent"
                    ? "var(--accent-teal)"
                    : w.emphasis === "highlight"
                      ? "var(--accent-gold)"
                      : hasFx
                        ? "#c084fc"
                        : "var(--border-strong)";
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    selectSubtitleCue(activeCue.id, w.id);
                    setCurrentTime((w.start + w.end) * 0.5);
                  }}
                  className="px-2 py-0.5 rounded-md text-[11px] font-medium cursor-pointer flex items-center gap-1"
                  style={{
                    background: isWordSel ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                    border: `1.5px solid ${badgeCol}`,
                    color: w.styleOverride?.color ?? "var(--text-primary)",
                  }}
                >
                  {hasFx && <Sparkles size={9} />}
                  {w.text}
                </button>
              );
            })}
          </div>

          {/* Granular Per-Word / Keyword FX Controls */}
          {selectedWordId && (() => {
            const word = activeCue.words.find((w) => w.id === selectedWordId);
            if (!word) return null;
            const ov = word.styleOverride ?? {};
            const updateWordOverride = (patch: Record<string, unknown>) => {
              dispatchOps([
                {
                  op: "subtitle.updateWord",
                  cueId: activeCue.id,
                  wordId: word.id,
                  patch: { styleOverride: { ...ov, ...patch } },
                },
              ]);
            };
            return (
              <div
                className="pt-2 border-t flex flex-col gap-1.5"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--accent-gold)" }}>
                  <span className="font-semibold">Efecto individual: «{word.text}»</span>
                  <button
                    type="button"
                    className="text-[9.5px] underline cursor-pointer"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() =>
                      dispatchOps([
                        {
                          op: "subtitle.updateWord",
                          cueId: activeCue.id,
                          wordId: word.id,
                          patch: { emphasis: "normal", styleOverride: {} },
                        },
                      ])
                    }
                  >
                    Limpiar FX
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    className="studio-input"
                    value={word.text}
                    onChange={(e) =>
                      dispatchOps([
                        {
                          op: "subtitle.updateWord",
                          cueId: activeCue.id,
                          wordId: word.id,
                          patch: { text: e.target.value || word.text },
                        },
                      ])
                    }
                  />
                  <select
                    className="studio-input"
                    value={word.emphasis}
                    onChange={(e) =>
                      dispatchOps([
                        {
                          op: "subtitle.updateWord",
                          cueId: activeCue.id,
                          wordId: word.id,
                          patch: { emphasis: e.target.value as WordEmphasis },
                        },
                      ])
                    }
                  >
                    <option value="normal" style={{ background: "#14161c", color: "#f3f4f6" }}>Normal</option>
                    <option value="highlight" style={{ background: "#14161c", color: "#f3f4f6" }}>★ Destacada (Keyword)</option>
                    <option value="accent" style={{ background: "#14161c", color: "#f3f4f6" }}>◆ Acento</option>
                    <option value="alert" style={{ background: "#14161c", color: "#f3f4f6" }}>! Alerta / Impacto</option>
                  </select>
                </div>

                {/* Mini visual keyword FX chips for selected word */}
                <div className="grid grid-cols-3 gap-1">
                  {KEYWORD_FX_OPTIONS.map((kw) => {
                    const active = (ov.fx ?? "none") === kw.id;
                    return (
                      <button
                        key={kw.id}
                        type="button"
                        onClick={() => updateWordOverride({ fx: kw.id })}
                        className="px-1.5 py-1 rounded-md text-[9px] font-medium cursor-pointer truncate"
                        style={{
                          background: active ? "var(--accent-primary)" : "rgba(0,0,0,0.28)",
                          color: active ? "#0b0d14" : "var(--text-secondary)",
                          border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        }}
                      >
                        {kw.label}
                      </button>
                    );
                  })}
                </div>

                <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
                  Escala ({(ov.scale ?? 1).toFixed(2)}×)
                  <input
                    type="range"
                    min={0.7}
                    max={2.0}
                    step={0.05}
                    value={ov.scale ?? 1}
                    onChange={(e) => updateWordOverride({ scale: Number(e.target.value) })}
                  />
                </label>

                <div className="grid grid-cols-4 gap-1.5 items-center">
                  <label className="flex flex-col gap-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                    Color
                    <input
                      type="color"
                      className="w-full h-5 rounded border-0 bg-transparent cursor-pointer"
                      value={(ov.color ?? effectiveStyle.activeWordColor).slice(0, 7)}
                      onChange={(e) => updateWordOverride({ color: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[9px]" style={{ color: "var(--text-muted)" }}>
                    Fondo FX
                    <input
                      type="color"
                      className="w-full h-5 rounded border-0 bg-transparent cursor-pointer"
                      value={(ov.boxColor ?? effectiveStyle.activeWordColor).slice(0, 7)}
                      onChange={(e) => updateWordOverride({ boxColor: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer pt-3">
                    <input
                      type="checkbox"
                      checked={Boolean(ov.glow)}
                      onChange={(e) => updateWordOverride({ glow: e.target.checked })}
                    />
                    Glow
                  </label>
                  <label className="flex items-center gap-1 text-[10px] cursor-pointer pt-3">
                    <input
                      type="checkbox"
                      checked={Boolean(ov.italic)}
                      onChange={(e) => updateWordOverride({ italic: e.target.checked })}
                    />
                    Itálica
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="number"
                    step={0.02}
                    className="studio-input font-mono-code"
                    value={word.start}
                    onChange={(e) => {
                      const s = Math.max(0, Number(e.target.value));
                      if (s <= word.end) {
                        dispatchOps([{ op: "subtitle.updateWord", cueId: activeCue.id, wordId: word.id, patch: { start: s } }]);
                      }
                    }}
                  />
                  <input
                    type="number"
                    step={0.02}
                    className="studio-input font-mono-code"
                    value={word.end}
                    onChange={(e) => {
                      const en = Math.max(word.start, Number(e.target.value));
                      dispatchOps([{ op: "subtitle.updateWord", cueId: activeCue.id, wordId: word.id, patch: { end: en } }]);
                    }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
