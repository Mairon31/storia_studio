import React, { useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  FolderOpen,
  Frame,
  Home,
  Layers,
  Magnet,
  Monitor,
  Moon,
  Palette,
  Redo2,
  Save,
  Settings,
  Shapes,
  Shuffle,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Undo2,
  Users,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { AspectRatio, Fps, ResolutionPreset } from "@storia/schema";
import { SHADER_PRESET_PLUGINS } from "@storia/renderer";
import type { DeviceLayoutInfo } from "../hooks/useDeviceLayout";
import { LeftTab, useStudioStore } from "../store/useStudioStore";
import { Inspector } from "./Inspector";
import { LeftSidebar } from "./LeftSidebar";
import { Timeline } from "./Timeline";
import { Viewport } from "./Viewport";

type MobileDrawerId = "inspector" | LeftTab;

interface ToolItem {
  id: MobileDrawerId;
  label: string;
  icon: React.ReactNode;
}

const MOBILE_TOOLS: ToolItem[] = [
  { id: "inspector", label: "Editar", icon: <Layers size={18} className="shrink-0" /> },
  { id: "scenes", label: "Escenas", icon: <Clapperboard size={18} className="shrink-0" /> },
  { id: "tts", label: "Voz TTS", icon: <AudioLines size={18} className="shrink-0" /> },
  { id: "subtitles", label: "Subs", icon: <Captions size={18} className="shrink-0" /> },
  { id: "audio", label: "Audio", icon: <Volume2 size={18} className="shrink-0" /> },
  { id: "transitions", label: "Transic.", icon: <Shuffle size={18} className="shrink-0" /> },
  { id: "effects", label: "Efectos", icon: <Sparkles size={18} className="shrink-0" /> },
  { id: "vectors", label: "Vectores", icon: <Shapes size={18} className="shrink-0" /> },
  { id: "cast", label: "Elenco", icon: <Users size={18} className="shrink-0" /> },
  { id: "assets", label: "Assets", icon: <FolderOpen size={18} className="shrink-0" /> },
  { id: "fx", label: "Look", icon: <SlidersHorizontal size={18} className="shrink-0" /> },
  { id: "styles", label: "Estilos", icon: <Palette size={18} className="shrink-0" /> },
];

const TABLET_LEFT_TOOLS = MOBILE_TOOLS.filter(
  (t): t is { id: LeftTab; label: string; icon: React.ReactNode } => t.id !== "inspector",
);

export interface MobileStudioLayoutProps {
  layout: DeviceLayoutInfo;
}

export const MobileStudioLayout: React.FC<MobileStudioLayoutProps> = ({ layout }) => {
  const project = useStudioStore((s) => s.project);
  const projectsList = useStudioStore((s) => s.projectsList);
  const activeLeftTab = useStudioStore((s) => s.activeLeftTab);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const selectedAudioClip = useStudioStore((s) => s.selectedAudioClip);
  const selectedEffectClipId = useStudioStore((s) => s.selectedEffectClipId);
  const selectedSubtitleCueId = useStudioStore((s) => s.selectedSubtitleCueId);
  const wsStatus = useStudioStore((s) => s.wsStatus);
  const isSaving = useStudioStore((s) => s.isSaving);
  const theme = useStudioStore((s) => s.theme);
  const showSafeZones = useStudioStore((s) => s.showSafeZones);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);

  const loadProject = useStudioStore((s) => s.loadProject);
  const saveProjectNow = useStudioStore((s) => s.saveProjectNow);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const selectAudioClip = useStudioStore((s) => s.selectAudioClip);
  const selectEffectClip = useStudioStore((s) => s.selectEffectClip);
  const selectSubtitleCue = useStudioStore((s) => s.selectSubtitleCue);
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const setExportModalOpen = useStudioStore((s) => s.setExportModalOpen);
  const setUiLayoutMode = useStudioStore((s) => s.setUiLayoutMode);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);
  const toggleSafeZones = useStudioStore((s) => s.toggleSafeZones);
  const toggleSnap = useStudioStore((s) => s.toggleSnap);

  const isTabletLandscape = layout.profile === "tablet-landscape";
  const isPhoneLandscape = layout.profile === "phone-landscape";
  const isTabletPortrait = layout.profile === "tablet-portrait";
  const isPhonePortrait = layout.profile === "phone-portrait";

  // Active sheet/drawer state for phone & tablet-portrait
  const [activeDrawer, setActiveDrawer] = useState<MobileDrawerId | null>(null);
  const [sheetSize, setSheetSize] = useState<"half" | "tall">("half");

  // Tablet-landscape split drawers (independently collapsible like CapCut iPad Pro)
  const [tabletLeftOpen, setTabletLeftOpen] = useState<boolean>(layout.width >= 1024);
  const [tabletInspectorOpen, setTabletInspectorOpen] = useState<boolean>(layout.width >= 1120);

  // Compact format/options popover for phones
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);

  // Sync external tab jumps (e.g. tapping a Transition cut badge or "Voz TTS" in SubtitleEditor)
  const prevLeftTabRef = useRef<LeftTab>(activeLeftTab);
  useEffect(() => {
    if (prevLeftTabRef.current !== activeLeftTab) {
      prevLeftTabRef.current = activeLeftTab;
      if (isTabletLandscape) {
        setTabletLeftOpen(true);
      } else {
        setActiveDrawer(activeLeftTab);
      }
    }
  }, [activeLeftTab, isTabletLandscape]);

  const handleUndo = () => useStudioStore.getState().undo();
  const handleRedo = () => useStudioStore.getState().redo();

  const handleSelectTool = (toolId: MobileDrawerId) => {
    if (isTabletLandscape) {
      if (toolId === "inspector") {
        setTabletInspectorOpen((v) => !v);
        return;
      }
      if (tabletLeftOpen && activeLeftTab === toolId) {
        setTabletLeftOpen(false);
      } else {
        setActiveLeftTab(toolId);
        setTabletLeftOpen(true);
      }
      return;
    }

    if (activeDrawer === toolId) {
      setActiveDrawer(null);
      return;
    }
    if (toolId !== "inspector") {
      setActiveLeftTab(toolId);
    }
    setActiveDrawer(toolId);
  };

  const clearSelection = () => {
    selectLayer(null);
    selectAudioClip(null);
    selectEffectClip(null);
    selectSubtitleCue(null, null);
  };

  // Contextual selection label for quick "Editar selección" CapCut pill
  const activeScene = project.scenes.find((s) => s.id === selectedSceneId) ?? project.scenes[0];
  const selectedLayer = activeScene?.layers.find((l) => l.id === selectedLayerId) ?? null;
  const selectedAudio = selectedAudioClip
    ? project.audioTracks
        .find((t) => t.id === selectedAudioClip.trackId)
        ?.clips.find((c) => c.id === selectedAudioClip.clipId) ?? null
    : null;
  const selectedEffect = (project.effectClips ?? []).find((e) => e.id === selectedEffectClipId) ?? null;
  const selectedCue = project.subtitles.cues.find((c) => c.id === selectedSubtitleCueId) ?? null;

  const selectionChip = selectedLayer
    ? { kind: "Capa", name: selectedLayer.name, target: "inspector" as MobileDrawerId }
    : selectedAudio
      ? { kind: "Audio", name: selectedAudio.name, target: "inspector" as MobileDrawerId }
      : selectedEffect
        ? { kind: "Efecto", name: selectedEffect.name, target: "inspector" as MobileDrawerId }
        : selectedCue && activeDrawer === null
          ? { kind: "Sub", name: selectedCue.text.slice(0, 26), target: "subtitles" as MobileDrawerId }
          : null;

  const activeToolDef = MOBILE_TOOLS.find((t) => t.id === activeDrawer) ?? null;

  // ============================================================================
  // SHARED MOBILE / TABLET TOP BAR (Spacious CapCut Clean Glass Header)
  // ============================================================================
  const renderTopBar = () => (
    <header
      className={`glass-panel rounded-xl flex items-center justify-between gap-2 shrink-0 relative z-40 ${
        isPhoneLandscape ? "h-10 px-2" : layout.isTablet ? "h-12 px-3" : "h-11 px-2"
      }`}
    >
      {/* Left: Home + Project Switcher (+ Undo/Redo only on Tablet where width allows) */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <button
          className="studio-btn !w-8 !h-8 !p-0 shrink-0"
          onClick={() => setActiveView("home")}
          title="Inicio · Proyectos"
        >
          <Home size={15} />
        </button>

        <select
          className={`studio-input font-medium truncate min-w-0 ${
            isPhonePortrait
              ? "flex-1 max-w-[165px] !h-8 !text-[11.5px] !py-0 !px-2"
              : "max-w-[180px] !h-8 !text-[11.5px] !py-0 !px-2"
          }`}
          value={project.id}
          onChange={(e) => void loadProject(e.target.value, true)}
          title="Cambiar proyecto"
        >
          {!projectsList.some((p) => p.id === project.id) && (
            <option value={project.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
              {project.name}
            </option>
          )}
          {projectsList.map((p) => (
            <option key={p.id} value={p.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
              {p.name}
            </option>
          ))}
        </select>

        {layout.isTablet && (
          <>
            <button className="studio-btn !w-8 !h-8 !p-0 shrink-0" onClick={handleUndo} title="Deshacer">
              <Undo2 size={14} />
            </button>
            <button className="studio-btn !w-8 !h-8 !p-0 shrink-0" onClick={handleRedo} title="Rehacer">
              <Redo2 size={14} />
            </button>
          </>
        )}
      </div>

      {/* Center (Tablet): Inline Format Controls */}
      {layout.isTablet && (
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            className="studio-input font-mono-code !h-8 !text-[11px] !py-0"
            value={project.canvas.aspectRatio}
            onChange={(e) =>
              dispatchOps([
                { op: "canvas.update", patch: { aspectRatio: e.target.value as AspectRatio } },
                { op: "exportSettings.update", patch: { aspectRatio: e.target.value as AspectRatio } },
              ])
            }
            title="Relación de aspecto"
          >
            <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>9:16</option>
            <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>16:9</option>
            <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>1:1</option>
          </select>

          <select
            className="studio-input font-mono-code !h-8 !text-[11px] !py-0"
            value={project.canvas.resolution}
            onChange={(e) =>
              dispatchOps([
                { op: "canvas.update", patch: { resolution: e.target.value as ResolutionPreset } },
                { op: "exportSettings.update", patch: { resolution: e.target.value as ResolutionPreset } },
              ])
            }
            title="Resolución"
          >
            <option value="360p" style={{ background: "#14161c", color: "#f3f4f6" }}>360p</option>
            <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>720p</option>
            <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>1080p</option>
            <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>2K</option>
            <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>4K</option>
          </select>

          <select
            className="studio-input font-mono-code !h-8 !text-[11px] !py-0"
            value={project.canvas.fps}
            onChange={(e) => {
              const fps = Number(e.target.value) as Fps;
              dispatchOps([
                { op: "canvas.update", patch: { fps } },
                { op: "exportSettings.update", patch: { fps } },
              ]);
            }}
            title="FPS"
          >
            <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>24 FPS</option>
            <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>30 FPS</option>
            <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>60 FPS</option>
          </select>
        </div>
      )}

      {/* Right: Format/Options Popover (Phone) or Quick Icons (Tablet) + Export CTA */}
      <div className="flex items-center gap-1.5 shrink-0">
        {layout.isPhone ? (
          <button
            className={`studio-btn !h-8 !px-2 !text-[10.5px] font-mono-code shrink-0 ${quickMenuOpen ? "studio-btn-active" : ""}`}
            onClick={() => setQuickMenuOpen((v) => !v)}
            title="Formato, guardar y opciones"
          >
            <Sliders size={13} className="shrink-0" />
            <span>{project.canvas.resolution}</span>
          </button>
        ) : (
          <>
            <button
              className="studio-btn !w-8 !h-8 !p-0"
              onClick={() => void saveProjectNow()}
              title="Guardar proyecto"
            >
              <Save size={14} />
            </button>
            <button
              className={`studio-btn !w-8 !h-8 !p-0 ${showSafeZones ? "studio-btn-active" : ""}`}
              onClick={toggleSafeZones}
              title="Zonas seguras"
            >
              <Frame size={14} />
            </button>
            <button
              className={`studio-btn !w-8 !h-8 !p-0 ${snapEnabled ? "studio-btn-active" : ""}`}
              onClick={toggleSnap}
              title="Ajuste magnético"
            >
              <Magnet size={14} />
            </button>
            <button
              className="studio-btn !w-8 !h-8 !p-0"
              onClick={toggleTheme}
              title="Cambiar tema"
            >
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            {isTabletLandscape && (
              <button
                className={`studio-btn !h-8 !px-2 !text-[11px] ${tabletInspectorOpen ? "studio-btn-active" : ""}`}
                onClick={() => setTabletInspectorOpen((v) => !v)}
                title="Mostrar / ocultar Inspector"
              >
                <Layers size={13} />
                <span className="hidden lg:inline">Inspector</span>
              </button>
            )}
            <button
              className="studio-btn !w-8 !h-8 !p-0"
              onClick={() => setUiLayoutMode("desktop")}
              title="Cambiar a interfaz de Escritorio"
            >
              <Monitor size={14} />
            </button>
            <button
              className="studio-btn !w-8 !h-8 !p-0"
              onClick={() => setSettingsModalOpen(true)}
              title="Configuración"
            >
              <Settings size={14} />
            </button>
            <div
              className="flex items-center gap-1 rounded-lg px-2 h-8 text-[10px] font-mono-code"
              style={{
                background: "var(--glass-hover)",
                border: "1px solid var(--border-subtle)",
                color: wsStatus === "connected" ? "var(--accent-teal)" : "var(--text-muted)",
              }}
              title={wsStatus === "connected" ? "Conectado en tiempo real" : "Modo local"}
            >
              {wsStatus === "connected" ? <Wifi size={11} /> : <WifiOff size={11} />}
              <span className="hidden md:inline">{isSaving ? "..." : wsStatus === "connected" ? "LIVE" : "LOCAL"}</span>
            </div>
          </>
        )}

        <button
          className="studio-btn studio-btn-accent !h-8 !px-2.5 !text-[11px] font-semibold shrink-0"
          onClick={() => setExportModalOpen(true)}
        >
          <Download size={13} className="shrink-0" />
          <span>{isPhonePortrait ? "Export" : "Exportar"}</span>
        </button>
      </div>

      {/* Phone Quick Options Popover (Format, Shader, Save, Theme, Desktop Mode, Settings) */}
      {quickMenuOpen && layout.isPhone && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setQuickMenuOpen(false)} />
          <div
            className="absolute right-2 top-full mt-1.5 w-[272px] glass-elevated rounded-2xl p-3 flex flex-col gap-2.5 shadow-2xl z-50 st-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Formato y Opciones
              </span>
              <div
                className="flex items-center gap-1.5 text-[10px] font-mono-code"
                style={{ color: wsStatus === "connected" ? "var(--accent-teal)" : "var(--text-muted)" }}
              >
                {wsStatus === "connected" ? <Wifi size={11} /> : <WifiOff size={11} />}
                {isSaving ? "Guardando" : wsStatus === "connected" ? "LIVE" : "LOCAL"}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              <select
                className="studio-input font-mono-code !text-[11px] !h-8"
                value={project.canvas.aspectRatio}
                onChange={(e) =>
                  dispatchOps([
                    { op: "canvas.update", patch: { aspectRatio: e.target.value as AspectRatio } },
                    { op: "exportSettings.update", patch: { aspectRatio: e.target.value as AspectRatio } },
                  ])
                }
              >
                <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>9:16</option>
                <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>16:9</option>
                <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>1:1</option>
              </select>

              <select
                className="studio-input font-mono-code !text-[11px] !h-8"
                value={project.canvas.resolution}
                onChange={(e) =>
                  dispatchOps([
                    { op: "canvas.update", patch: { resolution: e.target.value as ResolutionPreset } },
                    { op: "exportSettings.update", patch: { resolution: e.target.value as ResolutionPreset } },
                  ])
                }
              >
                <option value="360p" style={{ background: "#14161c", color: "#f3f4f6" }}>360p</option>
                <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>720p</option>
                <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>1080p</option>
                <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>2K</option>
                <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>4K</option>
              </select>

              <select
                className="studio-input font-mono-code !text-[11px] !h-8"
                value={project.canvas.fps}
                onChange={(e) => {
                  const fps = Number(e.target.value) as Fps;
                  dispatchOps([
                    { op: "canvas.update", patch: { fps } },
                    { op: "exportSettings.update", patch: { fps } },
                  ]);
                }}
              >
                <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>24 FPS</option>
                <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>30 FPS</option>
                <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>60 FPS</option>
              </select>
            </div>

            <select
              className="studio-input !text-[11px] !h-8"
              value={project.postProcessing.preset}
              onChange={(e) => {
                const preset = e.target.value as typeof project.postProcessing.preset;
                dispatchOps([
                  {
                    op: "postProcessing.update",
                    patch: {
                      preset,
                      psx: { ...project.postProcessing.psx, enabled: preset === "psx" },
                      pixelArt: { ...project.postProcessing.pixelArt, enabled: preset === "pixel_art" },
                    },
                  },
                ]);
              }}
            >
              {Object.values(SHADER_PRESET_PLUGINS).map((p) => (
                <option key={p.id} value={p.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                  Shader: {p.label}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                className="studio-btn !py-2 !text-[11px] justify-center"
                onClick={() => {
                  void saveProjectNow();
                  setQuickMenuOpen(false);
                }}
              >
                <Save size={12} /> Guardar
              </button>
              <button
                className="studio-btn !py-2 !text-[11px] justify-center"
                onClick={() => {
                  setQuickMenuOpen(false);
                  setSettingsModalOpen(true);
                }}
              >
                <Settings size={12} /> Ajustes
              </button>
              <button
                className={`studio-btn !py-2 !text-[11px] justify-center ${showSafeZones ? "studio-btn-active" : ""}`}
                onClick={toggleSafeZones}
              >
                <Frame size={12} /> Safe Zones
              </button>
              <button
                className={`studio-btn !py-2 !text-[11px] justify-center ${snapEnabled ? "studio-btn-active" : ""}`}
                onClick={toggleSnap}
              >
                <Magnet size={12} /> Imán
              </button>
              <button
                className="studio-btn !py-2 !text-[11px] justify-center"
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={12} /> : <Moon size={12} />}
                {theme === "dark" ? "Tema claro" : "Tema oscuro"}
              </button>
              <button
                className="studio-btn !py-2 !text-[11px] justify-center"
                onClick={() => {
                  setUiLayoutMode("desktop");
                  setQuickMenuOpen(false);
                }}
              >
                <Monitor size={12} /> Vista PC
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );

  // ============================================================================
  // 1. TABLET LANDSCAPE PRO (CapCut iPad Horizontal Experience)
  // ============================================================================
  if (isTabletLandscape) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
        {renderTopBar()}

        <main className="flex-1 min-h-0 flex gap-2 overflow-hidden">
          {/* Left Compact CapCut iPad Vertical Tool Rail */}
          <nav className="glass-panel w-[64px] shrink-0 rounded-2xl p-1.5 flex flex-col gap-1 overflow-y-auto no-scrollbar">
            {TABLET_LEFT_TOOLS.map((t) => {
              const active = tabletLeftOpen && activeLeftTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => handleSelectTool(t.id)}
                  className={`mobile-rail-btn ${active ? "mobile-rail-btn-active" : ""}`}
                >
                  {t.icon}
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Collapsible Left Tool Panel */}
          {tabletLeftOpen && (
            <aside className="glass-panel w-[300px] max-w-[34vw] shrink-0 rounded-2xl flex flex-col overflow-hidden st-sheet-right">
              <div
                className="h-9 px-3 flex items-center justify-between border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
                  {TABLET_LEFT_TOOLS.find((t) => t.id === activeLeftTab)?.label ?? "Herramientas"}
                </span>
                <button
                  className="studio-btn !p-1"
                  onClick={() => setTabletLeftOpen(false)}
                  title="Contraer panel"
                >
                  <X size={13} />
                </button>
              </div>
              <LeftSidebar embedded hideRail />
            </aside>
          )}

          {/* Center Live WebGL2 Viewport (GPU-safe 720p preview on iPad/Tablets) */}
          <Viewport compact={layout.width < 1080} lowMemoryMode previewMaxShortSide={720} />

          {/* Collapsible Right Inspector Panel */}
          {tabletInspectorOpen && (
            <aside className="glass-panel w-[292px] max-w-[32vw] shrink-0 rounded-2xl flex flex-col overflow-hidden st-sheet-right">
              <Inspector embedded />
            </aside>
          )}
        </main>

        {/* Bottom Full-width Touch Timeline */}
        <Timeline compact={layout.width < 1024} className="h-[214px] shrink-0" />
      </div>
    );
  }

  // ============================================================================
  // 2. PHONE LANDSCAPE (CapCut Mobile Horizontal: Stage + Timeline Left, Drawer + Rail Right)
  // ============================================================================
  if (isPhoneLandscape) {
    return (
      <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
        {renderTopBar()}

        <div className="flex-1 min-h-0 flex gap-1.5 overflow-hidden">
          {/* Left Main Stage + Compact Timeline */}
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-hidden">
            <div className="flex-[1.15] min-h-0 flex flex-col">
              <Viewport
                compact
                hideFloatingPill
                lowMemoryMode
                previewMaxShortSide={540}
                mobileTransport
                onUndo={handleUndo}
                onRedo={handleRedo}
              />
            </div>
            <Timeline compact className="h-[124px] shrink-0" />
          </div>

          {/* Slide-in Side Drawer for active tool */}
          {activeDrawer && (
            <aside className="w-[310px] max-w-[50vw] shrink-0 glass-elevated rounded-2xl flex flex-col overflow-hidden st-sheet-right">
              <div
                className="h-9 px-2.5 flex items-center justify-between border-b shrink-0"
                style={{ borderColor: "var(--border-subtle)" }}
              >
                <span className="text-[11px] font-semibold flex items-center gap-1.5" style={{ color: "var(--accent-primary)" }}>
                  {activeToolDef?.icon}
                  {activeToolDef?.label}
                </span>
                <button
                  className="studio-btn studio-btn-accent !py-0.5 !px-2 !text-[10.5px]"
                  onClick={() => setActiveDrawer(null)}
                >
                  <Check size={12} /> Listo
                </button>
              </div>
              {activeDrawer === "inspector" ? <Inspector embedded /> : <LeftSidebar embedded hideRail />}
            </aside>
          )}

          {/* Far-right Vertical CapCut Landscape Tool Rail */}
          <nav className="glass-panel w-[58px] shrink-0 rounded-2xl p-1 flex flex-col gap-1 overflow-y-auto no-scrollbar">
            {MOBILE_TOOLS.map((tool) => {
              const isActive = activeDrawer === tool.id;
              const showBadge = tool.id === "inspector" && Boolean(selectedLayer || selectedAudio || selectedEffect);
              return (
                <button
                  key={tool.id}
                  onClick={() => handleSelectTool(tool.id)}
                  className={`mobile-rail-btn relative ${isActive ? "mobile-rail-btn-active" : ""}`}
                >
                  {tool.icon}
                  <span className="truncate max-w-full">{tool.label}</span>
                  {showBadge && !isActive && (
                    <span
                      className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--accent-gold)" }}
                    />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. PHONE PORTRAIT & TABLET PORTRAIT (CapCut Mobile Vertical Signature Layout)
  // ============================================================================
  const viewportHeightClass = !activeDrawer
    ? isTabletPortrait
      ? "flex-[1.18] min-h-[260px]"
      : "flex-[1.12] min-h-[200px]"
    : sheetSize === "tall"
      ? isTabletPortrait
        ? "h-[24dvh] min-h-[150px] shrink-0"
        : "h-[20dvh] min-h-[120px] shrink-0"
      : isTabletPortrait
        ? "h-[38dvh] min-h-[210px] shrink-0"
        : "h-[32dvh] min-h-[168px] shrink-0";

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden">
      {renderTopBar()}

      {/* Upper Live WebGL2 Preview Stage + CapCut Transport Bar */}
      <div className={`${viewportHeightClass} flex flex-col min-w-0 transition-[height] duration-150`}>
        <Viewport
          compact={isPhonePortrait}
          hideFloatingPill={isPhonePortrait}
          lowMemoryMode
          previewMaxShortSide={isPhonePortrait ? 540 : 720}
          mobileTransport={isPhonePortrait}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
      </div>

      {/* Contextual CapCut Selection Pill (Quick 1-tap edit for selected layer / audio / effect / subtitle) */}
      {!activeDrawer && selectionChip && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1 rounded-xl glass-panel shrink-0">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px]">
            <span
              className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold uppercase tracking-wider shrink-0"
              style={{ background: "var(--glass-active)", color: "var(--accent-primary)" }}
            >
              {selectionChip.kind}
            </span>
            <span className="truncate" style={{ color: "var(--text-primary)" }}>
              {selectionChip.name}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              className="studio-btn studio-btn-accent !h-7 !px-2.5 !text-[10.5px]"
              onClick={() => handleSelectTool(selectionChip.target)}
            >
              <Layers size={11} /> Editar
            </button>
            <button
              className="studio-btn !w-7 !h-7 !p-0"
              onClick={clearSelection}
              title="Deseleccionar"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Middle Area: Multi-track Touch Timeline OR CapCut Slide-up Tool Sheet */}
      {!activeDrawer ? (
        <Timeline
          compact={isPhonePortrait}
          className={isTabletPortrait ? "h-[248px] shrink-0" : "flex-1 min-h-[160px]"}
        />
      ) : (
        <section className="flex-1 min-h-0 glass-elevated rounded-2xl flex flex-col overflow-hidden st-sheet-up">
          {/* Subtle CapCut Sheet Grab Handle + Header */}
          <div
            className="px-3 pt-1.5 pb-1.5 border-b flex flex-col gap-1 shrink-0"
            style={{ borderColor: "var(--border-subtle)" }}
          >
            <div className="w-8 h-1 rounded-full mx-auto opacity-30" style={{ background: "var(--text-secondary)" }} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ color: "var(--accent-primary)" }}>{activeToolDef?.icon}</span>
                <span className="text-[12px] font-semibold truncate">{activeToolDef?.label}</span>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  className="studio-btn !w-7 !h-7 !p-0"
                  onClick={() => setSheetSize((s) => (s === "half" ? "tall" : "half"))}
                  title={sheetSize === "half" ? "Expandir panel" : "Reducir panel"}
                >
                  {sheetSize === "half" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                <button
                  className="studio-btn studio-btn-accent !h-7 !px-2.5 !text-[11px]"
                  onClick={() => setActiveDrawer(null)}
                  title="Volver al timeline"
                >
                  <Check size={12} /> Listo
                </button>
              </div>
            </div>
          </div>

          {/* Embedded Real Storia Studio Tool Content */}
          {activeDrawer === "inspector" ? <Inspector embedded /> : <LeftSidebar embedded hideRail />}
        </section>
      )}

      {/* Bottom CapCut Signature Horizontal Tool Dock (Fixed-geometry non-colliding tiles) */}
      <nav
        className="glass-panel rounded-2xl px-1.5 pt-1.5 pb-safe shrink-0"
        aria-label="Herramientas de edición"
      >
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {MOBILE_TOOLS.map((tool) => {
            const isActive = activeDrawer === tool.id;
            const showDot = tool.id === "inspector" && Boolean(selectedLayer || selectedAudio || selectedEffect);
            return (
              <button
                key={tool.id}
                onClick={() => handleSelectTool(tool.id)}
                className={`mobile-dock-btn relative ${isActive ? "mobile-dock-btn-active" : ""}`}
                style={isTabletPortrait ? { width: 70, height: 54, fontSize: 10.5 } : undefined}
              >
                {tool.icon}
                <span className="whitespace-nowrap truncate max-w-[56px]">{tool.label}</span>
                {showDot && !isActive && (
                  <span
                    className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full"
                    style={{ background: "var(--accent-gold)" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
