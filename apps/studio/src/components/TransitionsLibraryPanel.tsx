import React, { useMemo, useState } from "react";
import { Check, Loader2, Search, Shuffle, Volume2 } from "lucide-react";
import type { TransitionSfxPreset, TransitionType } from "@storia/schema";
import { studioApi } from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";

export interface TransitionDef {
  id: TransitionType;
  label: string;
  group: "zoom" | "whip" | "optical" | "wipe";
  desc: string;
  defaultSfx: TransitionSfxPreset;
}

export const TRANSITION_CATALOG: TransitionDef[] = [
  { id: "snap_zoom", label: "Snap Zoom", group: "zoom", desc: "Empuje rápido cromático", defaultSfx: "zoom_whoosh" },
  { id: "zoom_through", label: "Zoom Through", group: "zoom", desc: "Cruce inmersivo", defaultSfx: "whoosh_deep" },
  { id: "zoom_pupil", label: "Zoom Pupil", group: "zoom", desc: "Zoom extremo al centro", defaultSfx: "zoom_whoosh" },
  { id: "zoom_rotate", label: "Zoom Rotate", group: "zoom", desc: "Zoom con giro cinematográfico", defaultSfx: "zoom_whoosh" },
  { id: "spin_left", label: "Spin Left", group: "zoom", desc: "Giro cámara izquierda", defaultSfx: "whip" },
  { id: "spin_right", label: "Spin Right", group: "zoom", desc: "Giro cámara derecha", defaultSfx: "whip" },
  { id: "match_cut", label: "Match Cut", group: "zoom", desc: "Empalme con destello", defaultSfx: "impact" },
  { id: "morph", label: "Morph Blur", group: "zoom", desc: "Desenfoque con pulso", defaultSfx: "whoosh" },

  { id: "whip_left", label: "Whip Left", group: "whip", desc: "Barrido rápido izq.", defaultSfx: "whip" },
  { id: "whip_right", label: "Whip Right", group: "whip", desc: "Barrido rápido der.", defaultSfx: "whip" },
  { id: "whip_up", label: "Whip Up", group: "whip", desc: "Barrido vertical arriba", defaultSfx: "whip" },
  { id: "whip_down", label: "Whip Down", group: "whip", desc: "Barrido vertical abajo", defaultSfx: "whip" },
  { id: "slide_left", label: "Slide Left", group: "whip", desc: "Deslizar izquierda", defaultSfx: "whoosh" },
  { id: "slide_right", label: "Slide Right", group: "whip", desc: "Deslizar derecha", defaultSfx: "whoosh" },
  { id: "slide_up", label: "Slide Up", group: "whip", desc: "Deslizar arriba", defaultSfx: "whoosh" },
  { id: "slide_down", label: "Slide Down", group: "whip", desc: "Deslizar abajo", defaultSfx: "whoosh" },

  { id: "glitch", label: "VHS Glitch", group: "optical", desc: "Cortes RGB digitales", defaultSfx: "glitch" },
  { id: "rgb_split", label: "RGB Split", group: "optical", desc: "Separación cian/rojo", defaultSfx: "glitch" },
  { id: "light_leak", label: "Light Leak", group: "optical", desc: "Destello cálido", defaultSfx: "shimmer_gold" },
  { id: "film_burn", label: "Film Burn", group: "optical", desc: "Quemado celuloide", defaultSfx: "shimmer_gold" },
  { id: "flash", label: "Flash Impact", group: "optical", desc: "Destello cámara", defaultSfx: "flash" },
  { id: "pixelate", label: "Pixelate", group: "optical", desc: "Mosaico 8-bit/PSX", defaultSfx: "glitch" },

  { id: "liquid_wipe", label: "Liquid Wipe", group: "wipe", desc: "Cortinilla de acento", defaultSfx: "whoosh" },
  { id: "wipe_left", label: "Wipe Left", group: "wipe", desc: "Cortinilla izquierda", defaultSfx: "whoosh" },
  { id: "wipe_right", label: "Wipe Right", group: "wipe", desc: "Cortinilla derecha", defaultSfx: "whoosh" },
  { id: "wipe_up", label: "Wipe Up", group: "wipe", desc: "Cortinilla arriba", defaultSfx: "whoosh" },
  { id: "wipe_down", label: "Wipe Down", group: "wipe", desc: "Cortinilla abajo", defaultSfx: "whoosh" },
  { id: "iris", label: "Iris Cinema", group: "wipe", desc: "Apertura circular", defaultSfx: "whoosh_deep" },
  { id: "diamond_iris", label: "Diamante Iris", group: "wipe", desc: "Cierre rombo geométrico", defaultSfx: "whoosh_deep" },
  { id: "clock_wipe", label: "Clock Wipe", group: "wipe", desc: "Barrido radial reloj", defaultSfx: "whoosh" },
  { id: "blinds_h", label: "Persiana Horiz.", group: "wipe", desc: "Bandas horizontales", defaultSfx: "whoosh" },
  { id: "blinds_v", label: "Persiana Vert.", group: "wipe", desc: "Bandas verticales", defaultSfx: "whoosh" },
  { id: "split_h", label: "Split Lateral", group: "wipe", desc: "Apertura desde el centro", defaultSfx: "whoosh" },
  { id: "split_v", label: "Split Vertical", group: "wipe", desc: "Apertura arriba/abajo", defaultSfx: "whoosh" },
  { id: "curtain_open", label: "Telón Teatro", group: "wipe", desc: "Cortinilla color acento", defaultSfx: "shimmer_gold" },
  { id: "shutter_blink", label: "Parpadeo Cine", group: "wipe", desc: "Cierre rápido obturador", defaultSfx: "impact" },
  { id: "fade", label: "Fade Negro", group: "wipe", desc: "Fundido a negro", defaultSfx: "none" },
  { id: "dissolve", label: "Disolver", group: "wipe", desc: "Fundido suave A→B", defaultSfx: "none" },
  { id: "fade_white", label: "Fade Blanco", group: "wipe", desc: "Fundido luminoso", defaultSfx: "flash" },
  { id: "cut", label: "Corte Seco", group: "wipe", desc: "Sin transición", defaultSfx: "none" },
];

const GROUP_FILTERS: { id: "all" | TransitionDef["group"]; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "zoom", label: "Zoom" },
  { id: "whip", label: "Barridos" },
  { id: "optical", label: "Glitch/Luz" },
  { id: "wipe", label: "Clásicas" },
];

const SFX_OPTIONS: { id: TransitionSfxPreset; label: string }[] = [
  { id: "none", label: "Sin sonido" },
  { id: "whoosh", label: "Whoosh suave" },
  { id: "whoosh_deep", label: "Whoosh profundo" },
  { id: "whip", label: "Whip rápido" },
  { id: "zoom_whoosh", label: "Zoom Whoosh" },
  { id: "glitch", label: "Glitch digital" },
  { id: "flash", label: "Flash / Destello" },
  { id: "shimmer_gold", label: "Shimmer dorado" },
  { id: "impact", label: "Impacto grave" },
];

/**
 * TikTok/CapCut-style live animated thumbnail preview showing Scene A -> Scene B transition.
 */
export const TransitionThumb: React.FC<{
  type: TransitionType;
  accentColor: string;
  animate: boolean;
}> = ({ type, accentColor, animate }) => {
  const animClass = !animate
    ? ""
    : type === "snap_zoom" || type === "zoom_through" || type === "zoom_pupil" || type === "zoom_rotate" || type === "match_cut" || type === "morph"
      ? "st-anim-zoom"
      : type === "spin_left" || type === "spin_right"
        ? "st-sub-spin-pop"
        : type === "whip_left" || type === "slide_left"
          ? "st-anim-whip-l"
          : type === "whip_right" || type === "slide_right"
            ? "st-anim-whip-r"
            : type === "whip_up" || type === "slide_up" || type === "wipe_up"
              ? "st-anim-whip-u"
              : type === "whip_down" || type === "slide_down" || type === "wipe_down" || type === "shutter_blink"
                ? "st-anim-whip-d"
                : type === "glitch" || type === "rgb_split" || type === "pixelate"
                  ? "st-anim-glitch"
                  : type === "wipe_left" || type === "liquid_wipe" || type === "blinds_v" || type === "split_h" || type === "curtain_open"
                    ? "st-anim-wipe-l"
                    : type === "wipe_right" || type === "clock_wipe" || type === "blinds_h" || type === "split_v"
                      ? "st-anim-wipe-r"
                      : type === "iris" || type === "diamond_iris"
                        ? "st-anim-iris"
                        : type === "fade" || type === "dissolve"
                          ? "st-anim-fade"
                          : "";

  const isFlashOverlay = type === "flash" || type === "fade_white" || type === "light_leak" || type === "film_burn" || type === "match_cut";
  const flashTint = type === "light_leak" || type === "film_burn" ? accentColor : "#ffffff";

  return (
    <div className="relative h-14 w-full rounded-lg overflow-hidden bg-[#0c0f18]">
      {/* Underlying Clip B */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, #1b2845 0%, #274060 55%, #3d5a80 100%)",
        }}
      >
        <div className="w-6 h-6 rounded-full bg-[#ffd447]/80 blur-[1px]" />
        <span className="absolute right-1.5 bottom-1 text-[8px] font-mono-code font-bold px-1 rounded bg-black/45 text-white/80">
          B
        </span>
      </div>

      {/* Foreground Clip A animated by transition */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${animClass}`}
        style={{
          background:
            type === "pixelate"
              ? "repeating-conic-gradient(#3b2a54 0% 25%, #6e3b5c 0% 50%) 50% / 10px 10px"
              : type === "liquid_wipe"
                ? `linear-gradient(125deg, #2b1d3d 0%, #8f3a5b 58%, ${accentColor} 100%)`
                : "linear-gradient(135deg, #2a1b3d 0%, #7a3b69 60%, #e07a5f 100%)",
        }}
      >
        <div className="w-7 h-4 rounded-sm border border-white/40 bg-white/15" />
        <span className="absolute left-1.5 top-1 text-[8px] font-mono-code font-bold px-1 rounded bg-black/45 text-white/85">
          A
        </span>
      </div>

      {/* RGB split accent bars */}
      {(type === "rgb_split" || type === "glitch") && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-glitch" : ""}`}
          style={{
            background: "linear-gradient(90deg, rgba(255,60,90,0.35) 0%, transparent 40%, rgba(76,230,200,0.35) 100%)",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Flash / Light-leak overlay */}
      {isFlashOverlay && (
        <div
          className={`absolute inset-0 pointer-events-none ${animate ? "st-anim-flash" : "opacity-35"}`}
          style={{
            background:
              type === "light_leak" || type === "film_burn"
                ? `radial-gradient(circle at 75% 30%, ${flashTint}, transparent 70%)`
                : flashTint,
          }}
        />
      )}
    </div>
  );
};

export const TransitionsLibraryPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<"all" | TransitionDef["group"]>("all");
  const [duration, setDuration] = useState(0.4);
  const [accentColor, setAccentColor] = useState("#ffd447");
  const [withSfx, setWithSfx] = useState(true);
  const [sfxOverride, setSfxOverride] = useState<"auto" | TransitionSfxPreset>("auto");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [alwaysAnimate, setAlwaysAnimate] = useState(() =>
    typeof window !== "undefined"
      ? !window.matchMedia?.("(pointer: coarse)").matches && window.innerWidth >= 1024
      : true,
  );
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const activeSceneIndex = Math.max(
    0,
    project.scenes.findIndex((s) => s.id === selectedSceneId),
  );
  const activeScene = project.scenes[activeSceneIndex] ?? project.scenes[0]!;
  const prevScene = activeSceneIndex > 0 ? project.scenes[activeSceneIndex - 1] : undefined;
  const isCutMismatched = Boolean(
    prevScene && prevScene.transitionOut.type !== activeScene.transitionIn.type,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TRANSITION_CATALOG.filter((t) => {
      if (group !== "all" && t.group !== group) return false;
      if (!q) return true;
      return t.label.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q) || t.id.includes(q);
    });
  }, [query, group]);

  const applyTransition = async (def: TransitionDef, applyToAll: boolean) => {
    const chosenSfx: TransitionSfxPreset =
      !withSfx || def.id === "cut" ? "none" : sfxOverride === "auto" ? def.defaultSfx : sfxOverride;

    setApplyingId(`${def.id}:${applyToAll ? "all" : "one"}`);
    setStatusMsg(null);
    try {
      const res = await studioApi.applyTransitionWithSfx(project.id, {
        sceneId: activeScene.id,
        applyToAll,
        addSoundEffect: withSfx && chosenSfx !== "none",
        transition: {
          type: def.id,
          duration: def.id === "cut" ? 0 : duration,
          accentColor,
          sfxPreset: chosenSfx,
          sfxVolume: 0.78,
        },
      });
      setProjectFromRemote(res.project, res.receipt);
      if (res.sfxAssetId) {
        const asset = res.project.assets.find((a) => a.id === res.sfxAssetId);
        if (asset) void audioEngine.loadAssetAudio(asset);
      }
      const msg = applyToAll
        ? `"${def.label}" aplicada a ${res.appliedCount} cortes (salida + entrada)${chosenSfx !== "none" ? ` + SFX (${chosenSfx})` : ""}`
        : prevScene
          ? `"${def.label}" aplicada al corte ${prevScene.name} → ${activeScene.name}${chosenSfx !== "none" ? ` + SFX` : ""}`
          : `"${def.label}" aplicada a ${activeScene.name}${chosenSfx !== "none" ? ` + SFX` : ""}`;
      setStatusMsg(msg);
      setBusyNotice(msg);
      window.setTimeout(() => setBusyNotice(null), 2400);
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setApplyingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <Shuffle size={12} /> Transiciones ({TRANSITION_CATALOG.length})
          </div>
          <div className="text-[10px] font-mono-code truncate" style={{ color: "var(--text-muted)" }}>
            {prevScene
              ? isCutMismatched
                ? `${prevScene.name} (${prevScene.transitionOut.type}) → ${activeScene.name} (${activeScene.transitionIn.type})`
                : `${prevScene.name} → ${activeScene.name} · ${activeScene.transitionIn.type}`
              : `${activeScene.name} · ${activeScene.transitionIn.type}`}
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
          placeholder="Buscar transición…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Group pills */}
      <div className="flex flex-wrap gap-1">
        {GROUP_FILTERS.map((g) => {
          const active = group === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setGroup(g.id)}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium cursor-pointer"
              style={{
                background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
              }}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      {/* Compact controls */}
      <div className="rounded-xl p-2 flex flex-col gap-1.5" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
        <div className="flex items-center justify-between gap-2">
          <label className="flex flex-col gap-0.5 text-[9.5px] flex-1" style={{ color: "var(--text-muted)" }}>
            Duración ({duration.toFixed(2)}s)
            <input type="range" min={0.15} max={1.5} step={0.05} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
            Acento
            <input type="color" className="w-7 h-5 rounded cursor-pointer border-0 bg-transparent" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-1.5">
          <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
            <input type="checkbox" checked={withSfx} onChange={(e) => setWithSfx(e.target.checked)} />
            <Volume2 size={11} style={{ color: "var(--accent-teal)" }} /> SFX
          </label>
          {withSfx && (
            <select
              className="studio-input !py-0.5 !text-[10px] flex-1"
              value={sfxOverride}
              onChange={(e) => setSfxOverride(e.target.value as "auto" | TransitionSfxPreset)}
            >
              <option value="auto" style={{ background: "#14161c", color: "#f3f4f6" }}>Auto por transición</option>
              {SFX_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {statusMsg && (
        <div
          className="rounded-lg px-2 py-1 text-[10px] flex items-center gap-1"
          style={{ background: "rgba(76, 230, 200, 0.14)", color: "var(--accent-teal)" }}
        >
          <Check size={11} /> {statusMsg}
        </div>
      )}

      {/* TikTok / CapCut 2-column Visual Animated Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        {filtered.map((item) => {
          const isCurrent =
            activeScene.transitionIn.type === item.id &&
            (!prevScene || prevScene.transitionOut.type === item.id);
          const busyOne = applyingId === `${item.id}:one`;
          const busyAll = applyingId === `${item.id}:all`;
          const animate = alwaysAnimate || hoveredId === item.id || isCurrent;
          return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((c) => (c === item.id ? null : c))}
              className="rounded-xl p-1.5 flex flex-col gap-1 transition-all"
              style={{
                background: isCurrent ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="cursor-pointer" onClick={() => void applyTransition(item, false)} title={item.desc}>
                <TransitionThumb type={item.id} accentColor={accentColor} animate={animate} />
              </div>
              <div className="px-0.5 flex items-center justify-between gap-1">
                <span className="text-[10.5px] font-semibold truncate">{item.label}</span>
                {isCurrent && <Check size={10} style={{ color: "var(--accent-primary)" }} />}
              </div>
              <div className="flex gap-1">
                <button
                  disabled={applyingId !== null}
                  onClick={() => void applyTransition(item, false)}
                  className="studio-btn studio-btn-accent flex-1 !py-0.5 !px-1 !text-[9.5px]"
                >
                  {busyOne ? <Loader2 size={9} className="animate-spin" /> : "Aplicar"}
                </button>
                <button
                  disabled={applyingId !== null}
                  onClick={() => void applyTransition(item, true)}
                  className="studio-btn !py-0.5 !px-1.5 !text-[9.5px] border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  title="Aplicar a todos los cortes del video"
                >
                  {busyAll ? <Loader2 size={9} className="animate-spin" /> : "Todos"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
