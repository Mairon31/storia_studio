import React, { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  AudioLines,
  Captions,
  ChevronDown,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  Frame,
  Home,
  Layers,
  Magnet,
  Moon,
  Plus,
  Redo2,
  Save,
  Settings,
  Shapes,
  Shuffle,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type AspectRatio, type Fps, type ResolutionPreset } from "@storia/schema";
import { SHADER_PRESET_PLUGINS } from "@storia/renderer";
import { useStudioStore } from "../store/useStudioStore";

type MenuName = "file" | "edit" | "view" | "tools" | null;

function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatSrtTime(sec: number): string {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(rem).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export const TopBar: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const projectsList = useStudioStore((s) => s.projectsList);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const wsStatus = useStudioStore((s) => s.wsStatus);
  const isSaving = useStudioStore((s) => s.isSaving);
  const theme = useStudioStore((s) => s.theme);
  const showSafeZones = useStudioStore((s) => s.showSafeZones);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);

  const loadProject = useStudioStore((s) => s.loadProject);
  const createNewProject = useStudioStore((s) => s.createNewProject);
  const saveProjectNow = useStudioStore((s) => s.saveProjectNow);
  const duplicateProjectById = useStudioStore((s) => s.duplicateProjectById);
  const importLegacyProject = useStudioStore((s) => s.importLegacyProject);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const setUiLayoutMode = useStudioStore((s) => s.setUiLayoutMode);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);
  const toggleSafeZones = useStudioStore((s) => s.toggleSafeZones);
  const toggleSnap = useStudioStore((s) => s.toggleSnap);
  const setExportModalOpen = useStudioStore((s) => s.setExportModalOpen);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const canUndo = useStore(useStudioStore.temporal, (t) => t.pastStates.length > 0);
  const canRedo = useStore(useStudioStore.temporal, (t) => t.futureStates.length > 0);

  const [openMenu, setOpenMenu] = useState<MenuName>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const close = () => setOpenMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const activeScene = project.scenes.find((s) => s.id === selectedSceneId) ?? project.scenes[0];

  const handleUndo = () => {
    undo();
    setOpenMenu(null);
  };
  const handleRedo = () => {
    redo();
    setOpenMenu(null);
  };

  const handleExportProjectJson = () => {
    downloadJsonFile(`${project.id}.storia.json`, project);
    setBusyNotice(`Proyecto exportado: ${project.id}.storia.json`);
    window.setTimeout(() => setBusyNotice(null), 2200);
    setOpenMenu(null);
  };

  const handleExportActiveSceneLayers = () => {
    if (!activeScene) return;
    downloadJsonFile(`${project.id}_${activeScene.id}_layers.json`, {
      projectId: project.id,
      sceneId: activeScene.id,
      sceneName: activeScene.name,
      exportedAt: new Date().toISOString(),
      layers: activeScene.layers,
    });
    setBusyNotice(`Capas de "${activeScene.name}" exportadas a JSON.`);
    window.setTimeout(() => setBusyNotice(null), 2200);
    setOpenMenu(null);
  };

  const handleExportSrt = () => {
    const lines = project.subtitles.cues
      .map((c, idx) => `${idx + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
      .join("\n");
    downloadTextFile(`${project.id}.srt`, lines);
    setBusyNotice(`Subtítulos exportados: ${project.id}.srt`);
    window.setTimeout(() => setBusyNotice(null), 2200);
    setOpenMenu(null);
  };

  const handleImportManifestFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Record<string, unknown>;
      await importLegacyProject(parsed);
    } catch (err) {
      useStudioStore.setState({
        lastError: `Error importando JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  };

  const handleDuplicateSelectedLayer = () => {
    if (!activeScene || !selectedLayerId) return;
    const l = activeScene.layers.find((x) => x.id === selectedLayerId);
    if (!l) return;
    const copyId = `${l.id}_copy_${Date.now().toString(36).slice(-3)}`;
    dispatchOps([
      {
        op: "layer.add",
        sceneId: activeScene.id,
        layer: {
          ...structuredClone(l),
          id: copyId,
          name: `${l.name} copia`,
          zIndex: l.zIndex + 1,
          transform: { ...l.transform, x: Math.min(0.95, l.transform.x + 0.04) },
        },
      },
    ]);
    selectLayer(copyId);
    setOpenMenu(null);
  };

  const handleDeleteSelectedLayer = () => {
    if (!activeScene || !selectedLayerId) return;
    dispatchOps([{ op: "layer.remove", sceneId: activeScene.id, layerId: selectedLayerId }]);
    selectLayer(null);
    setOpenMenu(null);
  };

  return (
    <header className="glass-panel flex h-12 shrink-0 items-center justify-between gap-2 px-2.5 rounded-xl relative z-40">
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void handleImportManifestFile(e)}
      />

      {/* Left: Home button + Desktop Windows-style Menus (Archivo / Editar / Ver / Herramientas) + Project Switcher */}
      <div className="flex items-center gap-1 min-w-0">
        <button
          onClick={() => setActiveView("home")}
          className="flex h-7 px-2 shrink-0 items-center gap-1.5 rounded-lg font-extrabold text-[11px] tracking-tight cursor-pointer"
          style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
          title="Regresar a la interfaz principal de proyectos (Inicio)"
        >
          <Home size={13} />
          <span className="hidden sm:inline">Inicio</span>
        </button>

        {/* Desktop Menu Bar */}
        <div className="flex items-center gap-0.5 ml-1" onClick={(e) => e.stopPropagation()}>
          {/* ARCHIVO */}
          <div className="relative">
            <button
              className={`studio-btn !py-1 !px-2 !text-[11px] ${openMenu === "file" ? "studio-btn-active" : ""}`}
              onClick={() => setOpenMenu((m) => (m === "file" ? null : "file"))}
            >
              Archivo <ChevronDown size={11} />
            </button>
            {openMenu === "file" && (
              <div className="absolute left-0 top-9 w-[240px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl z-50">
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveView("home");
                    setOpenMenu(null);
                  }}
                >
                  <Home size={13} /> Interfaz Principal (Proyectos)
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    const name = window.prompt("Nombre del nuevo proyecto:", `Video ${projectsList.length + 1}`);
                    if (name?.trim()) void createNewProject(name.trim(), "demo");
                    setOpenMenu(null);
                  }}
                >
                  <Plus size={13} /> Nuevo proyecto…
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    void saveProjectNow();
                    setOpenMenu(null);
                  }}
                >
                  <Save size={13} /> Guardar ahora <span className="ml-auto font-mono-code text-[9.5px] opacity-60">Ctrl+S</span>
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    void duplicateProjectById(project.id);
                    setOpenMenu(null);
                  }}
                >
                  <Copy size={13} /> Duplicar proyecto actual
                </button>
                <div className="my-0.5 border-t" style={{ borderColor: "var(--border-subtle)" }} />
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    importRef.current?.click();
                    setOpenMenu(null);
                  }}
                >
                  <Upload size={13} /> Importar manifest Storia (.json)
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={handleExportProjectJson}
                >
                  <FileJson size={13} /> Exportar proyecto (.storia.json)
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={handleExportActiveSceneLayers}
                >
                  <Layers size={13} /> Exportar capas de escena (.json)
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={handleExportSrt}
                >
                  <Captions size={13} /> Exportar subtítulos (.srt)
                </button>
                <div className="my-0.5 border-t" style={{ borderColor: "var(--border-subtle)" }} />
                <button
                  className="studio-btn studio-btn-accent justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setExportModalOpen(true);
                    setOpenMenu(null);
                  }}
                >
                  <Download size={13} /> Exportar Video MP4… <span className="ml-auto font-mono-code text-[9.5px]">Ctrl+E</span>
                </button>
              </div>
            )}
          </div>

          {/* EDITAR */}
          <div className="relative">
            <button
              className={`studio-btn !py-1 !px-2 !text-[11px] ${openMenu === "edit" ? "studio-btn-active" : ""}`}
              onClick={() => setOpenMenu((m) => (m === "edit" ? null : "edit"))}
            >
              Editar <ChevronDown size={11} />
            </button>
            {openMenu === "edit" && (
              <div className="absolute left-0 top-9 w-[220px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl z-50">
                <button
                  disabled={!canUndo}
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full disabled:opacity-40"
                  onClick={handleUndo}
                >
                  <Undo2 size={13} /> Deshacer <span className="ml-auto font-mono-code text-[9.5px] opacity-60">Ctrl+Z</span>
                </button>
                <button
                  disabled={!canRedo}
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full disabled:opacity-40"
                  onClick={handleRedo}
                >
                  <Redo2 size={13} /> Rehacer <span className="ml-auto font-mono-code text-[9.5px] opacity-60">Ctrl+Y</span>
                </button>
                <div className="my-0.5 border-t" style={{ borderColor: "var(--border-subtle)" }} />
                <button
                  disabled={!selectedLayerId}
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full disabled:opacity-40"
                  onClick={handleDuplicateSelectedLayer}
                >
                  <Copy size={13} /> Duplicar capa seleccionada
                </button>
                <button
                  disabled={!selectedLayerId}
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full disabled:opacity-40"
                  style={{ color: "var(--accent-danger)" }}
                  onClick={handleDeleteSelectedLayer}
                >
                  <Trash2 size={13} /> Eliminar capa seleccionada
                </button>
                <div className="my-0.5 border-t" style={{ borderColor: "var(--border-subtle)" }} />
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setSettingsModalOpen(true);
                    setOpenMenu(null);
                  }}
                >
                  <Settings size={13} /> Configuración de la app…
                </button>
              </div>
            )}
          </div>

          {/* VER */}
          <div className="relative hidden md:block">
            <button
              className={`studio-btn !py-1 !px-2 !text-[11px] ${openMenu === "view" ? "studio-btn-active" : ""}`}
              onClick={() => setOpenMenu((m) => (m === "view" ? null : "view"))}
            >
              Ver <ChevronDown size={11} />
            </button>
            {openMenu === "view" && (
              <div className="absolute left-0 top-9 w-[210px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl z-50">
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    toggleSafeZones();
                    setOpenMenu(null);
                  }}
                >
                  <Frame size={13} /> Zonas seguras {showSafeZones ? "✓" : ""}
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    toggleSnap();
                    setOpenMenu(null);
                  }}
                >
                  <Magnet size={13} /> Guías magnéticas {snapEnabled ? "✓" : ""}
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    toggleTheme();
                    setOpenMenu(null);
                  }}
                >
                  {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                  Tema {theme === "dark" ? "claro" : "oscuro"}
                </button>
              </div>
            )}
          </div>

          {/* HERRAMIENTAS */}
          <div className="relative hidden lg:block">
            <button
              className={`studio-btn !py-1 !px-2 !text-[11px] ${openMenu === "tools" ? "studio-btn-active" : ""}`}
              onClick={() => setOpenMenu((m) => (m === "tools" ? null : "tools"))}
            >
              Herramientas <ChevronDown size={11} />
            </button>
            {openMenu === "tools" && (
              <div className="absolute left-0 top-9 w-[225px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl z-50">
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("tts");
                    setOpenMenu(null);
                  }}
                >
                  <AudioLines size={13} /> Texto a Voz (TTS Multi-IA)
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("vectors");
                    setOpenMenu(null);
                  }}
                >
                  <Shapes size={13} /> Librería Vectorial SVG
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("audio");
                    setOpenMenu(null);
                  }}
                >
                  <Volume2 size={13} /> Openverse-SFX &amp; Música
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("transitions");
                    setOpenMenu(null);
                  }}
                >
                  <Shuffle size={13} /> Transiciones con SFX
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("effects");
                    setOpenMenu(null);
                  }}
                >
                  <Sparkles size={13} /> Efectos Temporales
                </button>
                <button
                  className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
                  onClick={() => {
                    setActiveLeftTab("subtitles");
                    setOpenMenu(null);
                  }}
                >
                  <FolderOpen size={13} /> Editor de Subtítulos
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="h-4 w-px mx-0.5" style={{ background: "var(--border-subtle)" }} />

        <select
          className="studio-input max-w-[165px] truncate font-medium"
          value={project.id}
          onChange={(e) => void loadProject(e.target.value, true)}
          title="Cambiar proyecto"
        >
          {!projectsList.some((p) => p.id === project.id) && (
            <option value={project.id}>{project.name}</option>
          )}
          {projectsList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <button
          disabled={!canUndo}
          className="studio-btn !px-1.5 disabled:opacity-35"
          onClick={handleUndo}
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 size={13} />
        </button>
        <button
          disabled={!canRedo}
          className="studio-btn !px-1.5 disabled:opacity-35"
          onClick={handleRedo}
          title="Rehacer (Ctrl+Shift+Z / Ctrl+Y)"
        >
          <Redo2 size={13} />
        </button>
      </div>

      {/* Center: Format (Aspect / Resolution / FPS) + Shader Preset */}
      <div className="hidden xl:flex items-center gap-1.5">
        <select
          className="studio-input font-mono-code"
          value={project.canvas.aspectRatio}
          onChange={(e) =>
            dispatchOps([
              { op: "canvas.update", patch: { aspectRatio: e.target.value as AspectRatio } },
              { op: "exportSettings.update", patch: { aspectRatio: e.target.value as AspectRatio } },
            ])
          }
          title="Relación de aspecto"
        >
          <option value="9:16">9:16</option>
          <option value="16:9">16:9</option>
          <option value="1:1">1:1</option>
        </select>

        <select
          className="studio-input font-mono-code"
          value={project.canvas.resolution}
          onChange={(e) =>
            dispatchOps([
              { op: "canvas.update", patch: { resolution: e.target.value as ResolutionPreset } },
              { op: "exportSettings.update", patch: { resolution: e.target.value as ResolutionPreset } },
            ])
          }
          title="Resolución"
        >
          <option value="360p">360p</option>
          <option value="720p">720p</option>
          <option value="1080p">1080p</option>
          <option value="2k">2K</option>
          <option value="4k">4K</option>
        </select>

        <select
          className="studio-input font-mono-code"
          value={project.canvas.fps}
          onChange={(e) => {
            const fps = Number(e.target.value) as Fps;
            dispatchOps([
              { op: "canvas.update", patch: { fps } },
              { op: "exportSettings.update", patch: { fps } },
            ]);
          }}
          title="Fotogramas por segundo"
        >
          <option value={24}>24 FPS</option>
          <option value={30}>30 FPS</option>
          <option value={60}>60 FPS</option>
        </select>

        <div className="flex items-center gap-1">
          <Sparkles size={12} style={{ color: "var(--accent-gold)" }} />
          <select
            className="studio-input max-w-[130px]"
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
            title="Shader Post-Proceso WebGL2"
          >
            {Object.values(SHADER_PRESET_PLUGINS).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Save, Safe Zones, Snap, Settings, Sync Badge, Export */}
      <div className="flex items-center gap-1">
        <button
          className="studio-btn !px-2"
          onClick={() => void saveProjectNow()}
          title="Guardar proyecto en disco (Ctrl+S)"
        >
          <Save size={13} />
          <span className="hidden 2xl:inline text-[11px]">Guardar</span>
        </button>

        <button
          className={`studio-btn !px-1.5 ${showSafeZones ? "studio-btn-active" : ""}`}
          onClick={toggleSafeZones}
          title="Zonas seguras"
        >
          <Frame size={13} />
        </button>

        <button
          className={`studio-btn !px-1.5 ${snapEnabled ? "studio-btn-active" : ""}`}
          onClick={toggleSnap}
          title="Guías magnéticas"
        >
          <Magnet size={13} />
        </button>

        <button
          className="studio-btn !px-1.5"
          onClick={() => setUiLayoutMode("mobile")}
          title="Cambiar a interfaz Móvil / Tablet (CapCut Touch)"
        >
          <Smartphone size={13} />
        </button>

        <button
          className="studio-btn !px-1.5"
          onClick={() => setSettingsModalOpen(true)}
          title="Configuración de Storia Studio"
        >
          <Settings size={13} />
        </button>

        <div
          className="hidden sm:flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-mono-code"
          style={{
            background: "var(--glass-hover)",
            border: "1px solid var(--border-subtle)",
            color: wsStatus === "connected" ? "var(--accent-teal)" : "var(--text-muted)",
          }}
        >
          {wsStatus === "connected" ? <Wifi size={11} /> : <WifiOff size={11} />}
          <span>{isSaving ? "Guardando" : wsStatus === "connected" ? "LIVE" : "LOCAL"}</span>
        </div>

        <button
          className="studio-btn studio-btn-accent !px-3"
          onClick={() => setExportModalOpen(true)}
        >
          <Download size={13} />
          <span>Exportar</span>
        </button>
      </div>
    </header>
  );
};
