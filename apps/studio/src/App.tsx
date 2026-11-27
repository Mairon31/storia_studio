import React, { useEffect } from "react";
import { AppSettingsModal } from "./components/AppSettingsModal";
import { ExportModal } from "./components/ExportModal";
import { HomeDashboard } from "./components/HomeDashboard";
import { Inspector } from "./components/Inspector";
import { LeftSidebar } from "./components/LeftSidebar";
import { MobileStudioLayout } from "./components/MobileStudioLayout";
import { RemoteUnlockModal } from "./components/RemoteUnlockModal";
import { ReplaceResourceModal } from "./components/ReplaceResourceModal";
import { SvgCodeEditorDrawer } from "./components/SvgCodeEditorDrawer";
import { Timeline } from "./components/Timeline";
import { TopBar } from "./components/TopBar";
import { Viewport } from "./components/Viewport";
import { useDeviceLayout } from "./hooks/useDeviceLayout";
import { setRemoteAuthRequiredListener } from "./lib/api";
import { ensureBundledFontsLoaded, ensureGoogleFontLoaded, loadLocalFontAsset } from "./lib/fonts";
import { useStudioStore } from "./store/useStudioStore";

export const App: React.FC = () => {
  const layout = useDeviceLayout();
  const bootstrap = useStudioStore((s) => s.bootstrap);
  const project = useStudioStore((s) => s.project);
  const activeView = useStudioStore((s) => s.activeView);
  const lastError = useStudioStore((s) => s.lastError);
  const busyNotice = useStudioStore((s) => s.busyNotice);
  const clearError = useStudioStore((s) => s.clearError);
  const togglePlay = useStudioStore((s) => s.togglePlay);
  const stepFrames = useStudioStore((s) => s.stepFrames);
  const saveProjectNow = useStudioStore((s) => s.saveProjectNow);
  const setExportModalOpen = useStudioStore((s) => s.setExportModalOpen);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const undo = useStudioStore((s) => s.undo);
  const redo = useStudioStore((s) => s.redo);
  const beginHistoryBatch = useStudioStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useStudioStore((s) => s.endHistoryBatch);
  const setRemoteAuthRequired = useStudioStore((s) => s.setRemoteAuthRequired);

  useEffect(() => {
    setRemoteAuthRequiredListener((message) => {
      setRemoteAuthRequired(true, message ?? null);
    });
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("remote_auth") === "invalid") {
        setRemoteAuthRequired(
          true,
          "El enlace de acceso móvil expiró o fue revocado. Copia el nuevo enlace desde tu PC en Ajustes › Conexión Remota.",
        );
        url.searchParams.delete("remote_auth");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // Ignore URL parse errors
    }
    void bootstrap();
    void ensureBundledFontsLoaded();
    ensureGoogleFontLoaded("Figtree");
    ensureGoogleFontLoaded("Inter");
    ensureGoogleFontLoaded("JetBrains Mono");
    return () => {
      setRemoteAuthRequiredListener(null);
    };
  }, [bootstrap, setRemoteAuthRequired]);

  // Keep subtitle & uploaded local font assets registered in document.fonts
  useEffect(() => {
    if (project.subtitles.style.fontSource === "google") {
      ensureGoogleFontLoaded(project.subtitles.style.fontFamily);
    }
    for (const a of project.assets) {
      if (a.kind === "font") {
        void loadLocalFontAsset(a.name, a.src);
      }
    }
  }, [project.subtitles.style.fontFamily, project.subtitles.style.fontSource, project.assets]);

  // Global NLE keyboard shortcuts (Space, Left/Right, Undo/Redo, Ctrl+S, Ctrl+E, Delete)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (activeView === "editor") void saveProjectNow();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
        e.preventDefault();
        if (activeView === "editor") setExportModalOpen(true);
        return;
      }
      if (activeView !== "editor") return;

      const target = e.target as HTMLElement | null;
      const isTextInput =
        target &&
        (target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          (target.tagName === "INPUT" &&
            !["range", "checkbox", "radio", "color", "button", "submit"].includes(
              (target as HTMLInputElement).type?.toLowerCase() ?? "text",
            )));

      // Undo / Redo (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) work globally across sliders, selects, checkboxes & panels
      if ((e.ctrlKey || e.metaKey) && !isTextInput && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !isTextInput && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      const isEditing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isEditing) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        stepFrames(e.shiftKey ? -5 : -1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        stepFrames(e.shiftKey ? 5 : 1);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedSceneId && selectedLayerId) {
        const scene = project.scenes.find((s) => s.id === selectedSceneId);
        const layer = scene?.layers.find((l) => l.id === selectedLayerId);
        if (layer && layer.type !== "background" && !layer.locked) {
          e.preventDefault();
          dispatchOps([{ op: "layer.remove", sceneId: selectedSceneId, layerId: selectedLayerId }]);
          selectLayer(null);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeView,
    togglePlay,
    stepFrames,
    saveProjectNow,
    setExportModalOpen,
    selectedSceneId,
    selectedLayerId,
    project.scenes,
    dispatchOps,
    selectLayer,
    undo,
    redo,
  ]);

  // Collapse continuous slider drags (<input type="range">) into ONE atomic Undo/Redo step globally
  useEffect(() => {
    let rangeBatchOpen = false;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target instanceof HTMLInputElement && target.type === "range" && !rangeBatchOpen) {
        rangeBatchOpen = true;
        beginHistoryBatch();
      }
    };
    const closeBatch = () => {
      if (!rangeBatchOpen) return;
      rangeBatchOpen = false;
      endHistoryBatch();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", closeBatch, true);
    window.addEventListener("pointercancel", closeBatch, true);
    return () => {
      if (rangeBatchOpen) endHistoryBatch();
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", closeBatch, true);
      window.removeEventListener("pointercancel", closeBatch, true);
    };
  }, [beginHistoryBatch, endHistoryBatch]);

  return (
    <div
      className={`h-[100dvh] w-screen flex flex-col overflow-hidden ${
        layout.isMobileOrTablet ? "p-1.5 gap-1.5 pt-safe px-safe" : "p-2.5 gap-2.5"
      }`}
      style={{ background: "var(--bg-canvas)" }}
    >
      {busyNotice && (
        <div
          className="px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-between shrink-0"
          style={{
            background: "rgba(76, 230, 200, 0.14)",
            border: "1px solid rgba(76, 230, 200, 0.42)",
            color: "var(--accent-teal)",
          }}
        >
          <span className="truncate">{busyNotice}</span>
        </div>
      )}

      {lastError && (
        <div
          className="px-3 py-1.5 rounded-xl text-[11px] flex items-center justify-between gap-2 shrink-0"
          style={{
            background: "rgba(255, 100, 112, 0.14)",
            border: "1px solid rgba(255, 100, 112, 0.4)",
            color: "var(--text-primary)",
          }}
        >
          <span className="truncate">{lastError}</span>
          <button className="studio-btn !py-0.5 !px-2 !text-[10px] shrink-0" onClick={clearError}>
            Cerrar
          </button>
        </div>
      )}

      {activeView === "home" ? (
        <HomeDashboard />
      ) : layout.isMobileOrTablet ? (
        <MobileStudioLayout layout={layout} />
      ) : (
        <>
          <TopBar />

          {/* Main Workspace: Left Sidebar | Live 60 FPS Viewport | Right Inspector */}
          <main className="flex-1 min-h-0 flex gap-2.5">
            <LeftSidebar />
            <Viewport />
            <Inspector />
          </main>

          {/* Bottom Multi-track Timeline */}
          <Timeline />
        </>
      )}

      <ExportModal />
      <ReplaceResourceModal />
      <SvgCodeEditorDrawer />
      <AppSettingsModal />
      <RemoteUnlockModal />
    </div>
  );
};
