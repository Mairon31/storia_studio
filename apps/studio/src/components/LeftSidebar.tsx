import React, { useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  Clapperboard,
  Code2,
  FolderOpen,
  History,
  Image as ImageIcon,
  Music,
  Palette,
  Plus,
  RotateCcw,
  Shapes,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Type,
  Upload,
  User,
  Users,
  Volume2,
  Wand2,
} from "lucide-react";
import type { AssetKind, Layer } from "@storia/schema";
import { SHADER_PRESET_PLUGINS } from "@storia/renderer";
import { studioApi } from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { LeftTab, useStudioStore } from "../store/useStudioStore";
import { AnimationStylesPanel } from "./AnimationStylesPanel";
import { AudioLibraryPanel } from "./AudioLibraryPanel";
import { EffectsLibraryPanel } from "./EffectsLibraryPanel";
import { SubtitleEditor } from "./SubtitleEditor";
import { TransitionsLibraryPanel } from "./TransitionsLibraryPanel";
import { TtsStudioPanel } from "./TtsStudioPanel";
import { VectorLibraryPanel } from "./VectorLibraryPanel";

const TABS: { id: LeftTab; label: string; icon: React.ReactNode }[] = [
  { id: "scenes", label: "Escenas", icon: <Clapperboard size={15} /> },
  { id: "assets", label: "Assets", icon: <FolderOpen size={15} /> },
  { id: "vectors", label: "Vectores", icon: <Shapes size={15} /> },
  { id: "audio", label: "Audio", icon: <Volume2 size={15} /> },
  { id: "tts", label: "Voz TTS", icon: <AudioLines size={15} /> },
  { id: "transitions", label: "Transic.", icon: <Shuffle size={15} /> },
  { id: "effects", label: "Efectos", icon: <Sparkles size={15} /> },
  { id: "cast", label: "Elenco", icon: <Users size={15} /> },
  { id: "subtitles", label: "Subs", icon: <Captions size={15} /> },
  { id: "fx", label: "Look", icon: <SlidersHorizontal size={15} /> },
  { id: "styles", label: "Estilos", icon: <Palette size={15} /> },
];

export interface LeftSidebarProps {
  embedded?: boolean;
  hideRail?: boolean;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({ embedded = false, hideRail = false }) => {
  const project = useStudioStore((s) => s.project);
  const activeTab = useStudioStore((s) => s.activeLeftTab);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const currentTime = useStudioStore((s) => s.currentTime);
  const receipts = useStudioStore((s) => s.receipts);

  const setActiveTab = useStudioStore((s) => s.setActiveLeftTab);
  const selectScene = useStudioStore((s) => s.selectScene);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const restoreSnapshot = useStudioStore((s) => s.restoreSnapshot);
  const openSvgEditor = useStudioStore((s) => s.openSvgEditor);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadAsPixelArt, setUploadAsPixelArt] = useState(false);
  const [uploading, setUploading] = useState(false);

  const activeScene = project.scenes.find((s) => s.id === selectedSceneId) ?? project.scenes[0]!;

  const addScene = () => {
    const id = `scene_${Date.now().toString(36)}`;
    dispatchOps([
      {
        op: "scene.add",
        scene: {
          id,
          name: `Escena ${project.scenes.length + 1}`,
          duration: 4,
          mood: "dusk",
          camera: { framing: "wide", x: 0.5, y: 0.5, zoom: 1, rotation: 0, handheld: { enabled: false, intensity: 0.2, frequency: 1 }, parallaxStrength: 1, impulses: [], keyframes: {} },
          transitionIn: { type: "fade", duration: 0.25 },
          transitionOut: { type: "cut", duration: 0 },
          layers: [
            {
              id: `${id}_bg`,
              type: "background",
              name: "Escenario",
              sourceType: "procedural",
              proceduralSet: "living_room",
              color: "#121622",
              gradientTop: "#1a2036",
              gradientBottom: "#0a0d16",
              mood: "gold",
              seed: project.scenes.length + 3,
              fit: "cover",
              scaleMode: "linear",
              driftX: 0,
              driftY: 0,
              start: 0,
              visible: true,
              locked: false,
              zIndex: 0,
              parallaxDepth: 0.8,
              blendMode: "normal",
              transform: { x: 0.5, y: 0.5, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
              keyframes: {},
            },
          ],
        },
      },
    ]);
    selectScene(id, true);
  };

  const addLayerToActiveScene = (layer: Layer) => {
    dispatchOps([{ op: "layer.add", sceneId: activeScene.id, layer }]);
    selectLayer(layer.id);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let kind: AssetKind = "image";
      if (ext === "svg") kind = "svg";
      else if (["mp3", "wav", "ogg", "m4a", "flac"].includes(ext)) kind = "audio";
      else if (["ttf", "otf", "woff", "woff2"].includes(ext)) kind = "font";
      else if (uploadAsPixelArt) kind = "pixel_art";

      const res = await studioApi.uploadAsset(project.id, {
        name: file.name.replace(/\.[^.]+$/, ""),
        filename: file.name,
        kind,
        scaleMode: kind === "pixel_art" ? "nearest" : "linear",
        mimeType: file.type || undefined,
        base64,
      });
      setProjectFromRemote(res.project, res.receipt);

      if (kind === "audio") {
        void audioEngine.loadAssetAudio(res.asset);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addAudioAssetToTimeline = (assetId: string, name: string) => {
    const track = project.audioTracks[0];
    if (!track) return;
    dispatchOps([
      {
        op: "audioClip.upsert",
        trackId: track.id,
        clip: {
          id: `clip_${Date.now().toString(36)}`,
          name,
          assetId,
          start: Number(currentTime.toFixed(2)),
          duration: 6,
          trimStart: 0,
          gainDb: 0,
          pan: 0,
          fadeIn: 0.2,
          fadeOut: 0.4,
          fadeCurve: "smooth",
          loop: false,
        },
      },
    ]);
  };

  const addCharacterToCast = () => {
    const idx = project.cast.length + 1;
    const id = `char_${Date.now().toString(36)}`;
    dispatchOps([
      {
        op: "character.upsert",
        character: {
          id,
          name: `Personaje ${idx}`,
          kind: "procedural",
          age: "adult",
          genderPresentation: idx % 2 === 0 ? "feminine" : "masculine",
          role: "casual",
          renderStyle: "auto",
          palette: {
            skin: "#e3b996",
            hair: "#241d1c",
            shirt: idx % 2 === 0 ? "#c96b78" : "#4e6d8a",
            pants: "#222733",
            shoes: "#141418",
            accent: "#ffd447",
          },
          hairStyle: idx % 2 === 0 ? "bob" : "short",
          accessories: { glasses: "none", hat: "none", facialHair: "none" },
          parts: {},
        },
      },
    ]);
  };

  const Wrapper = embedded ? "div" : "aside";
  return (
    <Wrapper
      className={
        embedded
          ? "flex-1 min-h-0 flex flex-col overflow-hidden"
          : "glass-panel flex w-[346px] shrink-0 flex-row rounded-2xl overflow-hidden"
      }
    >
      {/* Navigation Rail: Vertical on Desktop, Horizontal on Embedded (unless hidden by external mobile dock) */}
      {!embedded ? (
        <nav
          className="flex w-[62px] shrink-0 flex-col border-r p-1.5 gap-1 overflow-y-auto no-scrollbar"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.14)" }}
        >
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                title={t.label}
                className={`studio-btn w-full flex-col !gap-1 !px-1 !py-2 text-[9.5px] leading-none ${
                  active ? "studio-btn-active" : ""
                }`}
                style={active ? { color: "var(--accent-primary)" } : { color: "var(--text-secondary)" }}
              >
                {t.icon}
                <span className="truncate max-w-full">{t.label}</span>
              </button>
            );
          })}
        </nav>
      ) : !hideRail ? (
        <nav
          className="flex shrink-0 flex-row items-center gap-1 overflow-x-auto no-scrollbar border-b px-2 py-1.5"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.14)" }}
        >
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                title={t.label}
                className={`studio-btn shrink-0 !px-2.5 !py-1.5 text-[11px] ${
                  active ? "studio-btn-active" : ""
                }`}
                style={active ? { color: "var(--accent-primary)" } : { color: "var(--text-secondary)" }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      {/* Scrollable Tab Content */}
      <div className="flex-1 min-w-0 overflow-y-auto p-3">
        {activeTab === "scenes" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Escenas ({project.scenes.length})
              </span>
              <button className="studio-btn studio-btn-accent px-2 py-1 text-[11px]" onClick={addScene}>
                <Plus size={12} /> Escena
              </button>
            </div>
            {project.scenes.map((sc, idx) => {
              const isSel = sc.id === activeScene.id;
              return (
                <div
                  key={sc.id}
                  onClick={() => selectScene(sc.id, true)}
                  className="rounded-lg p-2.5 cursor-pointer flex items-center justify-between transition-colors"
                  style={{
                    background: isSel ? "var(--glass-active)" : "var(--glass-hover)",
                    border: `1px solid ${isSel ? "var(--border-strong)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">
                      {idx + 1}. {sc.name}
                    </div>
                    <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {sc.duration.toFixed(1)}s · {sc.layers.length} capas · {sc.camera.framing}
                    </div>
                  </div>
                  {project.scenes.length > 1 && (
                    <button
                      className="studio-btn px-1.5 py-1"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatchOps([{ op: "scene.remove", sceneId: sc.id }]);
                      }}
                      title="Eliminar escena"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "assets" && (
          <div className="flex flex-col gap-3">
            {/* Upload local file */}
            <div className="rounded-lg p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <input
                ref={fileRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.svg,.gif,.mp3,.wav,.ogg,.ttf,.otf,.woff2"
                className="hidden"
                onChange={handleFileUpload}
              />
              <button
                className="studio-btn studio-btn-accent w-full py-2"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={14} />
                <span>{uploading ? "Subiendo..." : "Importar SVG / PNG / Audio / Fuente"}</span>
              </button>
              <label className="flex items-center gap-1.5 text-[11px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={uploadAsPixelArt}
                  onChange={(e) => setUploadAsPixelArt(e.target.checked)}
                />
                <span>Tratar imagen como Pixel-Art (nítido, sin suavizado)</span>
              </label>
            </div>

            {/* Quick Add Creative Layers */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Añadir Capa Rápida
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  className="studio-btn justify-start border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() =>
                    addLayerToActiveScene({
                      id: `txt_${Date.now().toString(36)}`,
                      type: "text",
                      name: "Título",
                      variant: "kinetic_title",
                      kicker: "DESTACADO",
                      text: "NUEVO TÍTULO",
                      fontFamily: "Figtree",
                      fontWeight: 800,
                      fontSize: 58,
                      color: "#ffffff",
                      accentColor: "#f7c8d6",
                      strokeColor: "#0a0d16",
                      strokeWidth: 6,
                      align: "center",
                      maxWidth: 0.84,
                      start: 0,
                      visible: true,
                      locked: false,
                      zIndex: 25,
                      parallaxDepth: 0,
                      blendMode: "normal",
                      transform: { x: 0.5, y: 0.24, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                      keyframes: {},
                    })
                  }
                >
                  <Type size={13} /> Texto
                </button>
                <button
                  className="studio-btn justify-start border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() =>
                    addLayerToActiveScene({
                      id: `prop_${Date.now().toString(36)}`,
                      type: "sprite",
                      name: "Reloj de Bolsillo",
                      proceduralProp: "pocket_watch",
                      widthNorm: 0.34,
                      scaleMode: "linear",
                      pixelSnap: false,
                      bobAmplitude: 0.008,
                      bobSpeed: 1.2,
                      start: 0,
                      visible: true,
                      locked: false,
                      zIndex: 14,
                      parallaxDepth: 1,
                      blendMode: "normal",
                      transform: { x: 0.5, y: 0.44, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                      keyframes: {},
                    })
                  }
                >
                  <ImageIcon size={13} /> Prop 2D
                </button>
                <button
                  className="studio-btn justify-start border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() =>
                    addLayerToActiveScene({
                      id: `vfx_${Date.now().toString(36)}`,
                      type: "vfx",
                      name: "Partículas / Lluvia",
                      effect: "embers",
                      intensity: 0.8,
                      color: "#ffd447",
                      seed: 9,
                      start: 0,
                      visible: true,
                      locked: false,
                      zIndex: 18,
                      parallaxDepth: 1.15,
                      blendMode: "normal",
                      transform: { x: 0.5, y: 0.5, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                      keyframes: {},
                    })
                  }
                >
                  <Wand2 size={13} /> VFX
                </button>
                <button
                  className="studio-btn justify-start border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() =>
                    addLayerToActiveScene({
                      id: `pip_${Date.now().toString(36)}`,
                      type: "pip",
                      name: "Recuerdo Polaroid",
                      shape: "polaroid",
                      widthNorm: 0.48,
                      heightNorm: 0.22,
                      borderColor: "#ffd447",
                      label: "RECUERDO",
                      sourceTimeOffset: 0,
                      scaleMode: "linear",
                      start: 0,
                      visible: true,
                      locked: false,
                      zIndex: 16,
                      parallaxDepth: 0,
                      blendMode: "normal",
                      transform: { x: 0.5, y: 0.36, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: -3, opacity: 1, flipX: false, flipY: false },
                      keyframes: {},
                    })
                  }
                >
                  <Clapperboard size={13} /> PiP
                </button>
              </div>
            </div>

            {/* Uploaded Assets Library */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Biblioteca ({project.assets.length})
              </span>
              {project.assets.length === 0 ? (
                <div className="text-[11px] py-3 text-center rounded-lg" style={{ color: "var(--text-muted)", background: "var(--glass-hover)" }}>
                  Sube tus SVGs, sprites pixel-art, audio o fuentes locales.
                </div>
              ) : (
                project.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-lg p-2 flex items-center justify-between gap-2"
                    style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{asset.name}</div>
                      <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                        {asset.kind} · {asset.scaleMode}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {(asset.kind === "svg" ||
                        asset.mimeType === "image/svg+xml" ||
                        asset.src.split("?")[0]?.toLowerCase().endsWith(".svg")) && (
                        <button
                          className="studio-btn !px-1.5 !py-1 text-[10.5px]"
                          style={{ color: "#7dd3fc" }}
                          title="Editar código SVG en vivo (manual o vía MCP)"
                          onClick={() => openSvgEditor({ assetId: asset.id })}
                        >
                          <Code2 size={12} />
                        </button>
                      )}
                      {asset.kind === "audio" ? (
                        <button
                          className="studio-btn studio-btn-accent px-2 py-1 text-[11px]"
                          onClick={() => addAudioAssetToTimeline(asset.id, asset.name)}
                        >
                          <Music size={12} /> +
                        </button>
                      ) : asset.kind !== "font" ? (
                        <button
                          className="studio-btn studio-btn-accent px-2 py-1 text-[11px]"
                          onClick={() =>
                            addLayerToActiveScene({
                              id: `sp_${Date.now().toString(36)}`,
                              type: "sprite",
                              name: asset.name,
                              assetId: asset.id,
                              widthNorm: 0.42,
                              scaleMode: asset.scaleMode,
                              pixelSnap: asset.kind === "pixel_art",
                              bobAmplitude: 0,
                              bobSpeed: 1.2,
                              start: 0,
                              visible: true,
                              locked: false,
                              zIndex: 14,
                              parallaxDepth: 1,
                              blendMode: "normal",
                              transform: { x: 0.5, y: 0.5, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                              keyframes: {},
                            })
                          }
                        >
                          + Escena
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === "vectors" && <VectorLibraryPanel />}

        {activeTab === "audio" && <AudioLibraryPanel />}

        {activeTab === "tts" && <TtsStudioPanel />}

        {activeTab === "transitions" && <TransitionsLibraryPanel />}

        {activeTab === "effects" && <EffectsLibraryPanel />}

        {activeTab === "cast" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Personajes Articulados ({project.cast.length})
              </span>
              <button className="studio-btn studio-btn-accent px-2 py-1 text-[11px]" onClick={addCharacterToCast}>
                <Plus size={12} /> Nuevo
              </button>
            </div>
            {project.cast.map((ch) => (
              <div
                key={ch.id}
                className="rounded-lg p-2.5 flex items-center justify-between gap-2"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 border"
                    style={{ background: ch.palette.shirt, borderColor: "var(--border-strong)", color: "#111" }}
                  >
                    <User size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{ch.name}</div>
                    <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {ch.age} · {ch.hairStyle}
                    </div>
                  </div>
                </div>
                <button
                  className="studio-btn studio-btn-accent px-2 py-1 text-[11px]"
                  onClick={() =>
                    addLayerToActiveScene({
                      id: `char_${ch.id}_${Date.now().toString(36)}`,
                      type: "character",
                      name: ch.name,
                      characterId: ch.id,
                      pose: "idle",
                      expression: "neutral",
                      poseCues: [],
                      expressionCues: [],
                      boneOverrides: {},
                      talkWindows: [],
                      silhouette: false,
                      autoWalkOnMove: true,
                      scaleMode: "linear",
                      start: 0,
                      visible: true,
                      locked: false,
                      zIndex: 12,
                      parallaxDepth: 1,
                      blendMode: "normal",
                      transform: { x: 0.5, y: 0.82, anchor: { x: 0.5, y: 1 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                      keyframes: {},
                    })
                  }
                >
                  + Escena
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "subtitles" && <SubtitleEditor />}

        {activeTab === "fx" && (
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              Shaders GPU WebGL2 (Vista previa)
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.values(SHADER_PRESET_PLUGINS).map((plugin) => {
                const active = project.postProcessing.preset === plugin.id;
                const previewStyle: React.CSSProperties =
                  plugin.id === "psx"
                    ? {
                        background: "linear-gradient(135deg, #1d4ed8, #7e22ce, #f97316)",
                        filter: "contrast(1.3) saturate(1.15)",
                        imageRendering: "pixelated",
                      }
                    : plugin.id === "pixel_art"
                      ? {
                          background: "linear-gradient(135deg, #0ea5e9, #10b981, #facc15)",
                          filter: "contrast(1.2) saturate(1.35)",
                        }
                      : plugin.id === "cinematic"
                        ? {
                            background: "linear-gradient(135deg, #0f172a, #9a3412, #f59e0b)",
                            filter: "contrast(1.22) saturate(1.18)",
                          }
                        : plugin.id === "noir"
                          ? {
                              background: "linear-gradient(135deg, #111827, #6b7280, #f3f4f6)",
                              filter: "grayscale(1) contrast(1.45)",
                            }
                          : {
                              background: "linear-gradient(135deg, #2563eb, #a855f7, #f59e0b)",
                            };
                return (
                  <button
                    key={plugin.id}
                    type="button"
                    onClick={() =>
                      dispatchOps([
                        {
                          op: "postProcessing.update",
                          patch: {
                            preset: plugin.id as typeof project.postProcessing.preset,
                            psx: { ...project.postProcessing.psx, enabled: plugin.id === "psx" },
                            pixelArt: { ...project.postProcessing.pixelArt, enabled: plugin.id === "pixel_art" },
                          },
                        },
                      ])
                    }
                    className="rounded-xl p-1.5 text-left transition-all cursor-pointer flex flex-col gap-1.5"
                    style={{
                      background: active ? "var(--glass-active)" : "var(--glass-hover)",
                      border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="w-full h-11 rounded-lg relative overflow-hidden" style={previewStyle}>
                      <div
                        className="w-3.5 h-3.5 rounded-full absolute top-1.5 right-2"
                        style={{ background: "#fef08a", boxShadow: "0 0 8px rgba(254,240,138,0.85)" }}
                      />
                      <div
                        className="absolute bottom-0 left-0 right-0 h-4"
                        style={{
                          background: "rgba(10,14,26,0.72)",
                          clipPath: "polygon(0 100%, 0 40%, 36% 8%, 68% 58%, 100% 18%, 100% 100%)",
                        }}
                      />
                      {plugin.id === "psx" && (
                        <div
                          className="absolute inset-0 pointer-events-none opacity-45"
                          style={{
                            backgroundImage:
                              "repeating-linear-gradient(0deg, rgba(0,0,0,0.45) 0px, rgba(0,0,0,0.45) 1px, transparent 1px, transparent 3px)",
                          }}
                        />
                      )}
                      {plugin.id === "pixel_art" && (
                        <div
                          className="absolute inset-0 pointer-events-none opacity-30"
                          style={{
                            backgroundImage:
                              "linear-gradient(90deg, rgba(0,0,0,0.4) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.4) 1px, transparent 1px)",
                            backgroundSize: "6px 6px",
                          }}
                        />
                      )}
                      {plugin.id === "cinematic" && (
                        <div className="absolute inset-0 pointer-events-none border-y-[4px] border-black/80" />
                      )}
                    </div>
                    <div className="px-0.5">
                      <div className="text-[11px] font-semibold truncate">{plugin.label}</div>
                      <div className="text-[9.5px] line-clamp-2 leading-tight" style={{ color: "var(--text-muted)" }}>
                        {plugin.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Fine-tune postFX toggles */}
            <div className="rounded-lg p-2.5 flex flex-col gap-2 text-[11px]" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <label className="flex items-center justify-between">
                <span>Halation (Brillo cine)</span>
                <input
                  type="checkbox"
                  checked={project.postProcessing.halation.enabled}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "postProcessing.update",
                        patch: { halation: { ...project.postProcessing.halation, enabled: e.target.checked } },
                      },
                    ])
                  }
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Grano de película</span>
                <input
                  type="checkbox"
                  checked={project.postProcessing.filmGrain.enabled}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "postProcessing.update",
                        patch: { filmGrain: { ...project.postProcessing.filmGrain, enabled: e.target.checked } },
                      },
                    ])
                  }
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Aberración cromática</span>
                <input
                  type="checkbox"
                  checked={project.postProcessing.chromaticAberration.enabled}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "postProcessing.update",
                        patch: {
                          chromaticAberration: {
                            ...project.postProcessing.chromaticAberration,
                            enabled: e.target.checked,
                          },
                        },
                      },
                    ])
                  }
                />
              </label>
              <label className="flex items-center justify-between">
                <span>Viñeta</span>
                <input
                  type="checkbox"
                  checked={project.postProcessing.vignette.enabled}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "postProcessing.update",
                        patch: { vignette: { ...project.postProcessing.vignette, enabled: e.target.checked } },
                      },
                    ])
                  }
                />
              </label>
            </div>

            {/* BaoCut-inspired Edit Receipts & Snapshot Rollback */}
            <div className="flex flex-col gap-1.5 pt-1">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                <History size={12} /> Recibos de Edición ({receipts.length})
              </div>
              {receipts.slice(0, 8).map((r) => (
                <div
                  key={r.receiptId}
                  className="rounded-lg px-2 py-1.5 flex items-center justify-between gap-2 text-[10px]"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.summary}</div>
                    <div className="font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {r.source.toUpperCase()} · {r.durationAfterSec.toFixed(1)}s
                    </div>
                  </div>
                  {r.snapshotId && (
                    <button
                      className="studio-btn px-1.5 py-1"
                      onClick={() => void restoreSnapshot(r.snapshotId!)}
                      title="Restaurar snapshot previo"
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "styles" && <AnimationStylesPanel />}
      </div>
    </Wrapper>
  );
};
