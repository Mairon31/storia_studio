import React, { useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Clapperboard,
  Copy,
  Download,
  FilePlus2,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Smartphone,
  Square,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ANIMATION_STYLE_LIST, AnimationStyleId } from "@storia/schema";
import { studioApi } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

interface FormatPreset {
  id: string;
  label: string;
  meta: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  template: "demo" | "blank";
  icon: React.ReactNode;
}

const FORMAT_PRESETS: FormatPreset[] = [
  {
    id: "vertical",
    label: "Vertical 9:16",
    meta: "Reels · Shorts · TikTok",
    aspectRatio: "9:16",
    template: "demo",
    icon: <Smartphone size={15} />,
  },
  {
    id: "horizontal",
    label: "Horizontal 16:9",
    meta: "YouTube · Cinema",
    aspectRatio: "16:9",
    template: "demo",
    icon: <Monitor size={15} />,
  },
  {
    id: "square",
    label: "Cuadrado 1:1",
    meta: "Feed · Clips",
    aspectRatio: "1:1",
    template: "demo",
    icon: <Square size={15} />,
  },
  {
    id: "blank",
    label: "Lienzo en blanco",
    meta: "Empezar desde cero",
    aspectRatio: "9:16",
    template: "blank",
    icon: <FilePlus2 size={15} />,
  },
];

export const HomeDashboard: React.FC = () => {
  const projectsList = useStudioStore((s) => s.projectsList);
  const currentProject = useStudioStore((s) => s.project);
  const theme = useStudioStore((s) => s.theme);
  const uiLayoutMode = useStudioStore((s) => s.uiLayoutMode);
  const appSettings = useStudioStore((s) => s.appSettings);

  const loadProject = useStudioStore((s) => s.loadProject);
  const createNewProject = useStudioStore((s) => s.createNewProject);
  const deleteProjectById = useStudioStore((s) => s.deleteProjectById);
  const duplicateProjectById = useStudioStore((s) => s.duplicateProjectById);
  const importLegacyProject = useStudioStore((s) => s.importLegacyProject);
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const setUiLayoutMode = useStudioStore((s) => s.setUiLayoutMode);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);

  const cycleLayoutMode = () => {
    const next = uiLayoutMode === "auto" ? "mobile" : uiLayoutMode === "mobile" ? "desktop" : "auto";
    setUiLayoutMode(next);
  };

  const [query, setQuery] = useState("");
  const [aspectFilter, setAspectFilter] = useState<"all" | "9:16" | "16:9" | "1:1">("all");
  const [sortBy, setSortBy] = useState<"recent" | "name">("recent");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState("Proyecto sin título");
  const [newTemplate, setNewTemplate] = useState<"demo" | "blank">("demo");
  const [newStyleId, setNewStyleId] = useState<AnimationStyleId>("storia_editorial");
  const [newAspect, setNewAspect] = useState<"9:16" | "16:9" | "1:1">(appSettings.defaultAspectRatio);
  const [newRes, setNewRes] = useState<"720p" | "1080p" | "2k" | "4k">(appSettings.defaultResolution);
  const [newFps, setNewFps] = useState<24 | 30 | 60>(appSettings.defaultFps);
  const [creating, setCreating] = useState(false);

  const importInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projectsList.filter((p) => {
      if (aspectFilter !== "all" && p.aspectRatio !== aspectFilter) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) =>
      sortBy === "name"
        ? a.name.localeCompare(b.name)
        : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }, [projectsList, aspectFilter, query, sortBy]);

  const openPresetModal = (preset: FormatPreset) => {
    setNewName(`Proyecto ${projectsList.length + 1}`);
    setNewAspect(preset.aspectRatio);
    setNewTemplate(preset.template);
    setNewRes(appSettings.defaultResolution);
    setNewFps(appSettings.defaultFps);
    setShowCreateModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await createNewProject(newName.trim(), newTemplate, {
        aspectRatio: newAspect,
        resolution: newRes,
        fps: newFps,
      });
      if (newStyleId !== "storia_editorial") {
        useStudioStore.getState().dispatchOps([
          {
            op: "project.applyAnimationStyle",
            styleId: newStyleId,
            updateBackgrounds: true,
            updateSubtitles: true,
            updateTransitions: true,
          },
        ]);
      }
      setShowCreateModal(false);
    } finally {
      setCreating(false);
    }
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const txt = await file.text();
      const parsed = JSON.parse(txt) as Record<string, unknown>;
      if (parsed.schemaVersion && Array.isArray(parsed.scenes)) {
        const stem = file.name.replace(/\.json$/i, "").replace(/[^a-zA-Z0-9_-]+/g, "_");
        const id = `${stem}_${Date.now().toString(36).slice(-4)}`;
        const created = await studioApi.createProject({
          id,
          name: String(parsed.name ?? stem),
          template: "blank",
        });
        await studioApi.saveProject({
          ...(parsed as unknown as typeof currentProject),
          id: created.id,
          updatedAt: new Date().toISOString(),
        });
        await loadProject(created.id, true);
      } else {
        await importLegacyProject(parsed);
      }
    } catch (err) {
      useStudioStore.setState({
        lastError: `Error al importar JSON: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleExportProjectJson = async (projectId: string) => {
    try {
      const full = await studioApi.getProject(projectId);
      const blob = new Blob([JSON.stringify(full, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${full.id}.storia.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => void handleImportJson(e)}
      />

      {/* Minimal Top Bar */}
      <header
        className="h-14 px-3 sm:px-5 flex items-center justify-between gap-2 sm:gap-4 shrink-0 border-b"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] tracking-tight"
            style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
          >
            ST
          </div>
          <span className="text-[14px] sm:text-[14.5px] font-semibold tracking-tight">Storia Studio</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
          {currentProject && (
            <button
              className="studio-btn !px-2.5 sm:!px-3 !py-1.5 !text-[11px] sm:!text-[11.5px] min-w-0"
              onClick={() => setActiveView("editor")}
            >
              <span className="max-w-[96px] sm:max-w-[170px] truncate">{currentProject.name}</span>
              <ArrowRight size={12} className="shrink-0" style={{ color: "var(--accent-primary)" }} />
            </button>
          )}
          <button
            className={`studio-btn !px-2 !py-1.5 !text-[10.5px] shrink-0 ${uiLayoutMode !== "auto" ? "studio-btn-active" : ""}`}
            onClick={cycleLayoutMode}
            title={`Modo de interfaz: ${uiLayoutMode === "auto" ? "Auto (detecta móvil/tablet)" : uiLayoutMode === "mobile" ? "Móvil / Tablet (CapCut)" : "Escritorio (PC)"} — Clic para alternar`}
          >
            {uiLayoutMode === "mobile" ? <Smartphone size={13} /> : <Monitor size={13} />}
            <span className="hidden sm:inline">
              {uiLayoutMode === "auto" ? "Auto" : uiLayoutMode === "mobile" ? "Móvil" : "PC"}
            </span>
          </button>
          <button
            className="studio-btn !p-2 shrink-0"
            onClick={toggleTheme}
            title="Cambiar tema"
          >
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="studio-btn !p-2 shrink-0"
            onClick={() => setSettingsModalOpen(true)}
            title="Ajustes"
          >
            <Settings size={14} />
          </button>
        </div>
      </header>

      {/* Main Centered Canvas */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-[1160px] mx-auto px-3.5 sm:px-6 py-5 sm:py-8 flex flex-col gap-6 sm:gap-9">
          {/* Clean Studio Action Header */}
          <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-[24px] font-semibold tracking-tight">Proyectos</h1>
              <p className="text-[12.5px] mt-1" style={{ color: "var(--text-muted)" }}>
                Crea una nueva secuencia o continúa editando tu espacio de trabajo.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => importInputRef.current?.click()}
                className="studio-btn !px-3.5 !py-2 !text-[12px]"
              >
                <Upload size={13} /> Importar
              </button>
              <button
                onClick={() => {
                  setNewName(`Proyecto ${projectsList.length + 1}`);
                  setShowCreateModal(true);
                }}
                className="studio-btn studio-btn-accent !px-4 !py-2 !text-[12px] font-semibold"
              >
                <Plus size={14} /> Nuevo proyecto
              </button>
            </div>
          </section>

          {/* Subtle Format Quick-Start Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {FORMAT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => openPresetModal(preset)}
                className="rounded-xl px-4 py-3.5 text-left flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/[0.04]"
                style={{
                  background: "var(--glass-surface)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--glass-hover)", color: "var(--text-secondary)" }}
                >
                  {preset.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium truncate">{preset.label}</div>
                  <div className="text-[10.5px] truncate" style={{ color: "var(--text-muted)" }}>
                    {preset.meta}
                  </div>
                </div>
              </button>
            ))}
          </section>

          {/* Projects Toolbar + Grid */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {(["all", "9:16", "16:9", "1:1"] as const).map((af) => {
                  const active = aspectFilter === af;
                  return (
                    <button
                      key={af}
                      onClick={() => setAspectFilter(af)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer transition-colors"
                      style={{
                        background: active ? "var(--glass-active)" : "transparent",
                        color: active ? "var(--text-primary)" : "var(--text-muted)",
                      }}
                    >
                      {af === "all" ? `Todos (${projectsList.length})` : af}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-52">
                  <Search
                    size={13}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-muted)" }}
                  />
                  <input
                    className="studio-input w-full !pl-8 !py-1.5 !text-[11.5px]"
                    placeholder="Buscar…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <select
                  className="studio-input !py-1.5 !text-[11.5px]"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "recent" | "name")}
                >
                  <option value="recent" style={{ background: "#14161c", color: "#f3f4f6" }}>
                    Recientes
                  </option>
                  <option value="name" style={{ background: "#14161c", color: "#f3f4f6" }}>
                    Nombre
                  </option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div
                className="rounded-2xl py-16 px-6 text-center flex flex-col items-center gap-2.5"
                style={{ background: "var(--glass-surface)", border: "1px dashed var(--border-subtle)" }}
              >
                <Clapperboard size={24} style={{ color: "var(--text-muted)" }} />
                <div className="text-[13px] font-medium">Sin proyectos que mostrar</div>
                <button
                  className="studio-btn studio-btn-accent !mt-1 !px-4 !py-1.5 !text-[11.5px]"
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={13} /> Crear proyecto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                {filtered.map((p) => {
                  const isActive = currentProject?.id === p.id;
                  const frameBox =
                    p.aspectRatio === "9:16"
                      ? "w-10 h-[70px]"
                      : p.aspectRatio === "1:1"
                        ? "w-14 h-14"
                        : "w-24 h-[54px]";

                  return (
                    <div
                      key={p.id}
                      onClick={() => void loadProject(p.id, true)}
                      className="rounded-xl overflow-hidden flex flex-col group cursor-pointer transition-all hover:border-white/25"
                      style={{
                        background: "var(--glass-surface)",
                        border: `1px solid ${isActive ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      {/* Clean Matte Thumbnail Stage */}
                      <div
                        className="h-36 relative flex items-center justify-center overflow-hidden"
                        style={{ background: "var(--bg-stage, rgba(8,10,16,0.72))" }}
                      >
                        <div
                          className={`${frameBox} rounded-md border flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}
                          style={{
                            borderColor: isActive ? "var(--accent-primary)" : "rgba(255,255,255,0.16)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <span className="text-[8.5px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                            {p.aspectRatio}
                          </span>
                        </div>

                        <span
                          className="absolute bottom-2 right-2 text-[10px] font-mono-code px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(0,0,0,0.55)", color: "var(--text-secondary)" }}
                        >
                          {p.durationSec.toFixed(1)}s
                        </span>

                        {isActive && (
                          <span
                            className="absolute top-2.5 left-2.5 w-2 h-2 rounded-full"
                            style={{ background: "var(--accent-primary)" }}
                            title="Proyecto abierto"
                          />
                        )}

                        {/* Hover-only discreet quick actions */}
                        <div
                          className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="p-1.5 rounded-lg bg-black/65 hover:bg-black/85 text-white/85 cursor-pointer"
                            title="Duplicar"
                            onClick={() => void duplicateProjectById(p.id)}
                          >
                            <Copy size={11} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg bg-black/65 hover:bg-black/85 text-white/85 cursor-pointer"
                            title="Exportar JSON"
                            onClick={() => void handleExportProjectJson(p.id)}
                          >
                            <Download size={11} />
                          </button>
                          <button
                            className="p-1.5 rounded-lg bg-black/65 hover:bg-red-500/80 text-white/85 cursor-pointer"
                            title="Eliminar"
                            onClick={() => {
                              if (window.confirm(`¿Eliminar permanentemente "${p.name}"?`)) {
                                void deleteProjectById(p.id);
                              }
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>

                      {/* Minimal Metadata Footer */}
                      <div className="px-3.5 py-3 flex flex-col gap-0.5">
                        <div className="text-[13px] font-medium truncate" title={p.name}>
                          {p.name}
                        </div>
                        <div
                          className="text-[10.5px] font-mono-code flex items-center justify-between"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <span>
                            {p.resolution} · {p.fps}fps · {p.sceneCount} esc
                          </span>
                          <span>{new Date(p.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Minimal Create Project Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5, 7, 12, 0.72)", backdropFilter: "blur(10px)" }}
          onClick={() => setShowCreateModal(false)}
        >
          <form
            onSubmit={(e) => void handleCreate(e)}
            onClick={(e) => e.stopPropagation()}
            className="glass-elevated w-full max-w-[460px] rounded-2xl p-6 flex flex-col gap-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold">Nuevo proyecto</h3>
              <button type="button" className="studio-btn !p-1" onClick={() => setShowCreateModal(false)}>
                <X size={14} />
              </button>
            </div>

            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Nombre
              <input
                autoFocus
                className="studio-input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Proyecto sin título"
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Formato
                <select
                  className="studio-input font-mono-code"
                  value={newAspect}
                  onChange={(e) => setNewAspect(e.target.value as "9:16" | "16:9" | "1:1")}
                >
                  <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>9:16</option>
                  <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>16:9</option>
                  <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>1:1</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Resolución
                <select
                  className="studio-input font-mono-code"
                  value={newRes}
                  onChange={(e) => setNewRes(e.target.value as "720p" | "1080p" | "2k" | "4k")}
                >
                  <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>720p</option>
                  <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>1080p</option>
                  <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>2K</option>
                  <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>4K</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                FPS
                <select
                  className="studio-input font-mono-code"
                  value={newFps}
                  onChange={(e) => setNewFps(Number(e.target.value) as 24 | 30 | 60)}
                >
                  <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>24</option>
                  <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>30</option>
                  <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>60</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Base
                <select
                  className="studio-input"
                  value={newTemplate}
                  onChange={(e) => setNewTemplate(e.target.value as "demo" | "blank")}
                >
                  <option value="demo" style={{ background: "#14161c", color: "#f3f4f6" }}>Escenas de muestra</option>
                  <option value="blank" style={{ background: "#14161c", color: "#f3f4f6" }}>En blanco</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Estilo visual
                <select
                  className="studio-input"
                  value={newStyleId}
                  onChange={(e) => setNewStyleId(e.target.value as AnimationStyleId)}
                >
                  {ANIMATION_STYLE_LIST.map((st) => (
                    <option key={st.id} value={st.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      {st.code} · {st.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" className="studio-btn !px-3.5 !py-1.5" onClick={() => setShowCreateModal(false)}>
                Cancelar
              </button>
              <button type="submit" disabled={creating} className="studio-btn studio-btn-accent !px-4 !py-1.5 font-semibold">
                {creating ? "Creando…" : "Crear"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
