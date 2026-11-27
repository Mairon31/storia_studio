import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronLeft,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Redo2,
  RefreshCw,
  Repeat,
  SkipBack,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  getProjectDuration,
  resolveCanvasDimensions,
  resolveSafeZones,
  resolveSceneAtTime,
} from "@storia/schema";
import { LayerBounds, StoriaRenderer } from "@storia/renderer";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";

type DragMode = "move" | "scale" | "rotate" | "subtitle";

interface DragState {
  mode: DragMode;
  sceneId: string;
  layerId: string | null;
  startClientX: number;
  startClientY: number;
  origX: number;
  origY: number;
  origScaleX: number;
  origScaleY: number;
  origRot: number;
  centerClientX: number;
  centerClientY: number;
  startAngle: number;
  startDist: number;
}

function formatTimecode(sec: number, fps: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  const frames = Math.floor((s - Math.floor(s)) * fps);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function formatShortTime(sec: number): string {
  const s = Math.max(0, sec);
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export interface ViewportProps {
  compact?: boolean;
  hideFloatingPill?: boolean;
  /** Enables GPU memory-saving mode for iOS Safari / mobile browsers (caps preview pixels, disables MSAA & redundant FBOs). */
  lowMemoryMode?: boolean;
  /** Max short-side internal WebGL preview resolution (defaults to 540 in lowMemoryMode, 1080 on desktop). Export remains full 1080p/4K. */
  previewMaxShortSide?: number;
  /** CapCut-style mobile transport bar with Undo/Redo & centered Play button. */
  mobileTransport?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const Viewport: React.FC<ViewportProps> = ({
  compact = false,
  hideFloatingPill = false,
  lowMemoryMode = false,
  previewMaxShortSide,
  mobileTransport = false,
  onUndo,
  onRedo,
}) => {
  const maxShortSide = previewMaxShortSide ?? (lowMemoryMode ? 540 : 1080);
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const loop = useStudioStore((s) => s.loop);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const showSafeZones = useStudioStore((s) => s.showSafeZones);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);

  const setCurrentTime = useStudioStore((s) => s.setCurrentTime);
  const stepFrames = useStudioStore((s) => s.stepFrames);
  const togglePlay = useStudioStore((s) => s.togglePlay);
  const setIsPlaying = useStudioStore((s) => s.setIsPlaying);
  const setLoop = useStudioStore((s) => s.setLoop);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const openReplaceModal = useStudioStore((s) => s.openReplaceModal);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const beginHistoryBatch = useStudioStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useStudioStore((s) => s.endHistoryBatch);

  const viewportSectionRef = useRef<HTMLElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<StoriaRenderer | null>(null);
  const [rendererReady, setRendererReady] = useState(false);
  const [rendererError, setRendererError] = useState<string | null>(null);
  const [assetTick, setAssetTick] = useState(0);
  const [stageBox, setStageBox] = useState({ width: 340, height: 604 });
  const [previewZoom, setPreviewZoom] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [bounds, setBounds] = useState<LayerBounds[]>([]);
  const [guides, setGuides] = useState<{ v: number | null; h: number | null }>({ v: null, h: null });
  const [captureFlash, setCaptureFlash] = useState(false);
  const [stageMenu, setStageMenu] = useState<{
    x: number;
    y: number;
    sceneId: string;
    layerId: string;
    layerName: string;
    layerType: string;
  } | null>(null);

  useEffect(() => {
    const close = () => {
      setStageMenu(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("contextmenu", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("contextmenu", close);
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = viewportSectionRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else {
        setIsFullscreen((v) => !v);
      }
    } catch {
      setIsFullscreen((v) => !v);
    }
  };

  const adjustPreviewZoom = (delta: number) => {
    setPreviewZoom((z) => Math.max(0.5, Math.min(3, Number((z + delta).toFixed(2)))));
  };

  const dragRef = useRef<DragState | null>(null);
  const projectRef = useRef(project);
  projectRef.current = project;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;

  const dims = resolveCanvasDimensions(project.canvas);
  const totalDur = Math.max(0.1, getProjectDuration(project));
  const activeResolved = resolveSceneAtTime(project, currentTime);

  // Initialize PixiJS v8 renderer once (StrictMode-safe + live repaint when lazy SVGs load)
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    let cancelled = false;
    let repaintQueued = false;
    const r = new StoriaRenderer();
    rendererRef.current = r;

    const initShort = lowMemoryMode ? Math.min(540, maxShortSide) : 1080;
    const initLong = Math.round((initShort * 16) / 9);

    void r
      .init(host, {
        width: initShort,
        height: initLong,
        lowMemoryMode,
        antialias: !lowMemoryMode,
        preserveDrawingBuffer: !lowMemoryMode,
        onAssetLoaded: () => {
          if (cancelled || repaintQueued) return;
          repaintQueued = true;
          requestAnimationFrame(() => {
            repaintQueued = false;
            if (!cancelled) setAssetTick((n) => n + 1);
          });
        },
      })
      .then(() => {
        if (cancelled) {
          r.destroy();
          return;
        }
        setRendererError(null);
        setRendererReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setRendererError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      r.destroy();
      if (rendererRef.current === r) {
        rendererRef.current = null;
      }
      setRendererReady(false);
    };
  }, [lowMemoryMode, maxShortSide]);

  // Responsive stage sizing preserving exact aspect ratio
  useEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    const updateSize = () => {
      const pad = compact ? 10 : 28;
      const availW = Math.max(120, el.clientWidth - pad);
      const availH = Math.max(100, el.clientHeight - pad);
      const aspect = dims.width / dims.height;
      let w = availW;
      let h = w / aspect;
      if (h > availH) {
        h = availH;
        w = h * aspect;
      }
      setStageBox({ width: Math.floor(w), height: Math.floor(h) });
    };
    updateSize();
    const obs = new ResizeObserver(updateSize);
    obs.observe(el);
    return () => obs.disconnect();
  }, [dims.width, dims.height, compact]);

  // Render frame whenever project, time, or canvas dimensions change
  useEffect(() => {
    const r = rendererRef.current;
    if (!r || !rendererReady) return;
    // Cap live preview internal pixel resolution (540p on phone / 720p on tablet / 1080p on desktop)
    const shortSide = Math.min(dims.width, dims.height);
    const previewScale = shortSide > maxShortSide ? maxShortSide / shortSide : 1;
    const pw = Math.max(2, Math.round((dims.width * previewScale) / 2) * 2);
    const ph = Math.max(2, Math.round((dims.height * previewScale) / 2) * 2);

    r.renderAt(project, currentTime, { width: pw, height: ph });
    setBounds([...r.getLayerBounds()]);
  }, [project, currentTime, dims.width, dims.height, rendererReady, assetTick, maxShortSide]);

  // Preload textures, fonts & audio buffers when project assets change
  useEffect(() => {
    for (const asset of project.assets) {
      if (asset.kind === "audio") {
        void audioEngine.loadAssetAudio(asset);
      }
    }
    const r = rendererRef.current;
    if (!r || !rendererReady) return;
    void r.ready(project, currentTime).then(() => {
      if (rendererRef.current === r) {
        const shortSide = Math.min(dims.width, dims.height);
        const previewScale = shortSide > maxShortSide ? maxShortSide / shortSide : 1;
        const pw = Math.max(2, Math.round((dims.width * previewScale) / 2) * 2);
        const ph = Math.max(2, Math.round((dims.height * previewScale) / 2) * 2);
        r.renderAt(projectRef.current, currentTimeRef.current, { width: pw, height: ph });
        setBounds([...r.getLayerBounds()]);
      }
    });
  }, [project.assets, project.subtitles.style.fontFamily, rendererReady, maxShortSide]);

  // 60 FPS Playback loop + Web Audio API sync
  useEffect(() => {
    if (!isPlaying) {
      audioEngine.stopAll();
      return;
    }

    void audioEngine.startPlayback(project.audioTracks, project.assets, currentTimeRef.current);

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      const dur = Math.max(0.1, getProjectDuration(projectRef.current));
      let nextT = currentTimeRef.current + dt;
      if (nextT >= dur) {
        if (loop) {
          nextT = 0;
          void audioEngine.startPlayback(projectRef.current.audioTracks, projectRef.current.assets, 0);
        } else {
          setCurrentTime(dur);
          setIsPlaying(false);
          return;
        }
      }
      setCurrentTime(nextT);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      audioEngine.stopAll();
    };
  }, [isPlaying, loop]);

  // Interactive pointer drag for Move / Scale / Rotate / Subtitle position
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;

      if (d.mode === "move" && d.layerId) {
        let nx = d.origX + (e.clientX - d.startClientX) / Math.max(1, stageBox.width);
        let ny = d.origY + (e.clientY - d.startClientY) / Math.max(1, stageBox.height);
        let vGuide: number | null = null;
        let hGuide: number | null = null;
        if (snapEnabled) {
          for (const target of [0.5, 0.25, 0.75]) {
            if (Math.abs(nx - target) < 0.014) {
              nx = target;
              vGuide = target;
            }
            if (Math.abs(ny - target) < 0.014) {
              ny = target;
              hGuide = target;
            }
          }
        }
        setGuides({ v: vGuide, h: hGuide });
        dispatchOps([
          {
            op: "layer.update",
            sceneId: d.sceneId,
            layerId: d.layerId,
            patch: { transform: { x: Number(nx.toFixed(4)), y: Number(ny.toFixed(4)) } },
          },
        ]);
      } else if (d.mode === "subtitle") {
        let nx = Math.max(0.1, Math.min(0.9, d.origX + (e.clientX - d.startClientX) / Math.max(1, stageBox.width)));
        let ny = Math.max(0.08, Math.min(0.94, d.origY + (e.clientY - d.startClientY) / Math.max(1, stageBox.height)));
        let vGuide: number | null = null;
        if (snapEnabled && Math.abs(nx - 0.5) < 0.018) {
          nx = 0.5;
          vGuide = 0.5;
        }
        setGuides({ v: vGuide, h: null });
        dispatchOps([
          {
            op: "subtitle.updateStyle",
            patch: { position: { x: Number(nx.toFixed(4)), y: Number(ny.toFixed(4)) } },
          },
        ]);
      } else if (d.mode === "scale" && d.layerId) {
        const dist = Math.max(12, Math.hypot(e.clientX - d.centerClientX, e.clientY - d.centerClientY));
        const ratio = dist / Math.max(12, d.startDist);
        const sx = Math.max(0.1, Math.min(8, Number((d.origScaleX * ratio).toFixed(3))));
        const sy = Math.max(0.1, Math.min(8, Number((d.origScaleY * ratio).toFixed(3))));
        dispatchOps([
          {
            op: "layer.update",
            sceneId: d.sceneId,
            layerId: d.layerId,
            patch: { transform: { scaleX: sx, scaleY: sy } },
          },
        ]);
      } else if (d.mode === "rotate" && d.layerId) {
        const ang = Math.atan2(e.clientY - d.centerClientY, e.clientX - d.centerClientX);
        let deg = d.origRot + ((ang - d.startAngle) * 180) / Math.PI;
        if (snapEnabled) {
          for (const snapDeg of [-90, -45, 0, 45, 90, 180]) {
            if (Math.abs(deg - snapDeg) < 3.5) deg = snapDeg;
          }
        }
        dispatchOps([
          {
            op: "layer.update",
            sceneId: d.sceneId,
            layerId: d.layerId,
            patch: { transform: { rotation: Number(deg.toFixed(1)) } },
          },
        ]);
      }
    };

    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setGuides({ v: null, h: null });
        endHistoryBatch();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [stageBox.width, stageBox.height, snapEnabled, dispatchOps, endHistoryBatch]);

  const startLayerDrag = (
    e: React.PointerEvent,
    mode: DragMode,
    b: LayerBounds,
  ) => {
    if (!activeResolved || b.locked) return;
    e.stopPropagation();
    const layer = activeResolved.scene.layers.find((l) => l.id === b.layerId);
    if (!layer) return;

    selectLayer(layer.id);
    const rect = canvasHostRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + b.x * rect.width;
    const cy = rect.top + b.y * rect.height;

    beginHistoryBatch();
    dragRef.current = {
      mode,
      sceneId: activeResolved.scene.id,
      layerId: layer.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origX: layer.transform.x,
      origY: layer.transform.y,
      origScaleX: layer.transform.scaleX,
      origScaleY: layer.transform.scaleY,
      origRot: layer.transform.rotation,
      centerClientX: cx,
      centerClientY: cy,
      startAngle: Math.atan2(e.clientY - cy, e.clientX - cx),
      startDist: Math.hypot(e.clientX - cx, e.clientY - cy),
    };
  };

  const handleCanvasBackgroundClick = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    // Hit-test topmost non-background layer first
    for (let i = bounds.length - 1; i >= 0; i--) {
      const b = bounds[i]!;
      if (b.layerType === "background") continue;
      if (nx >= b.left && nx <= b.left + b.width && ny >= b.top && ny <= b.top + b.height) {
        startLayerDrag(e, "move", b);
        return;
      }
    }
    selectLayer(null);
  };

  const handleCanvasContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeResolved) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    let hitId: string | null = null;
    for (let i = bounds.length - 1; i >= 0; i--) {
      const b = bounds[i]!;
      if (b.layerType === "background") continue;
      if (nx >= b.left && nx <= b.left + b.width && ny >= b.top && ny <= b.top + b.height) {
        hitId = b.layerId;
        break;
      }
    }
    const targetLayer =
      (hitId ? activeResolved.scene.layers.find((l) => l.id === hitId) : null) ??
      activeResolved.scene.layers.find((l) => l.type === "background") ??
      null;
    if (!targetLayer) return;

    selectLayer(targetLayer.id);
    const menuW = 228;
    const menuH = 210;
    const x = Math.min(window.innerWidth - menuW - 12, Math.max(8, e.clientX));
    const y = Math.min(window.innerHeight - menuH - 12, Math.max(8, e.clientY));
    setStageMenu({
      x,
      y,
      sceneId: activeResolved.scene.id,
      layerId: targetLayer.id,
      layerName: targetLayer.name,
      layerType: targetLayer.type,
    });
  };

  const handleCaptureSnapshot = () => {
    const dataUrl = rendererRef.current?.capturePngDataUrl();
    if (!dataUrl) return;
    setCaptureFlash(true);
    window.setTimeout(() => setCaptureFlash(false), 180);
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.id}_frame_${currentTime.toFixed(2)}s.png`;
    a.click();
  };

  const selectedBounds = bounds.find((b) => b.layerId === selectedLayerId && b.layerType !== "background") ?? null;
  const safeZones = showSafeZones ? resolveSafeZones(project.canvas.aspectRatio) : [];

  return (
    <section
      ref={viewportSectionRef}
      className={`flex-1 min-w-0 flex flex-col gap-2 ${
        isFullscreen && !document.fullscreenElement ? "fixed inset-0 z-50 p-3" : ""
      }`}
      style={isFullscreen ? { background: "var(--bg-canvas, #0a0c12)" } : undefined}
    >
      {/* Stage Viewport Container */}
      <div
        ref={stageWrapRef}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            adjustPreviewZoom(e.deltaY < 0 ? 0.15 : -0.15);
          }
        }}
        className={`flex-1 min-h-0 rounded-2xl relative flex items-center justify-center ${
          previewZoom > 1 ? "overflow-auto" : "overflow-hidden"
        }`}
        style={{ background: "var(--bg-stage)", border: "1px solid var(--border-subtle)" }}
      >
        <div
          className="relative rounded-xl overflow-hidden shadow-2xl shrink-0 transition-[width,height] duration-150"
          style={{
            width: Math.round(stageBox.width * previewZoom),
            height: Math.round(stageBox.height * previewZoom),
            boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px var(--border-strong)",
          }}
        >
          {/* PixiJS WebGL2 Live Canvas */}
          <div ref={canvasHostRef} className="w-full h-full" />

          {rendererError && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-[11px] bg-black/80 text-red-300 z-20">
              Error WebGL2 en vista previa: {rendererError}
            </div>
          )}

          {/* Interactive Overlay Layer (Hit-testing, Safe Zones, Magnetic Guides, Transform Gizmos) */}
          <div
            className="absolute inset-0 cursor-default"
            onPointerDown={handleCanvasBackgroundClick}
            onContextMenu={handleCanvasContextMenu}
          >
            {/* Safe Zones */}
            {safeZones.map((sz, i) => (
              <div
                key={sz.id}
                className="absolute pointer-events-none"
                style={{
                  left: `${sz.left * 100}%`,
                  right: `${sz.right * 100}%`,
                  top: `${sz.top * 100}%`,
                  bottom: `${sz.bottom * 100}%`,
                  border: `1px dashed ${i === 0 ? "rgba(255,255,255,0.22)" : "rgba(247,200,214,0.34)"}`,
                  borderRadius: 6,
                }}
              >
                <span
                  className="absolute top-1 left-1.5 text-[9px] font-mono-code px-1 rounded"
                  style={{ background: "rgba(0,0,0,0.45)", color: "rgba(255,255,255,0.65)" }}
                >
                  {sz.label}
                </span>
              </div>
            ))}

            {/* Magnetic Alignment Guides */}
            {guides.v !== null && (
              <div
                className="absolute top-0 bottom-0 pointer-events-none"
                style={{ left: `${guides.v * 100}%`, width: 1, background: "var(--accent-gold)" }}
              />
            )}
            {guides.h !== null && (
              <div
                className="absolute left-0 right-0 pointer-events-none"
                style={{ top: `${guides.h * 100}%`, height: 1, background: "var(--accent-gold)" }}
              />
            )}

            {/* Draggable Subtitle Position Pill */}
            {project.subtitles.enabled && project.subtitles.cues.length > 0 && (
              <div
                title="Arrastra para mover posición de subtítulos"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (!activeResolved) return;
                  beginHistoryBatch();
                  dragRef.current = {
                    mode: "subtitle",
                    sceneId: activeResolved.scene.id,
                    layerId: null,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origX: project.subtitles.style.position.x,
                    origY: project.subtitles.style.position.y,
                    origScaleX: 1,
                    origScaleY: 1,
                    origRot: 0,
                    centerClientX: 0,
                    centerClientY: 0,
                    startAngle: 0,
                    startDist: 1,
                  };
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full font-mono-code cursor-grab touch-none transition-opacity ${
                  compact ? "px-2.5 py-1 text-[10px] opacity-70" : "px-2 py-0.5 text-[9px] opacity-40 hover:opacity-100"
                }`}
                style={{
                  left: `${project.subtitles.style.position.x * 100}%`,
                  top: `${Math.max(4, project.subtitles.style.position.y * 100 - 6)}%`,
                  background: "rgba(10,12,18,0.75)",
                  border: "1px solid var(--accent-gold)",
                  color: "var(--accent-gold)",
                }}
              >
                SUBS ✥
              </div>
            )}

            {/* Selected Layer Bounding Box + Scale + Rotate + Pivot Handles */}
            {selectedBounds && (
              <div
                onPointerDown={(e) => startLayerDrag(e, "move", selectedBounds)}
                className="absolute cursor-move touch-none"
                style={{
                  left: `${selectedBounds.left * 100}%`,
                  top: `${selectedBounds.top * 100}%`,
                  width: `${Math.max(4, selectedBounds.width * 100)}%`,
                  height: `${Math.max(4, selectedBounds.height * 100)}%`,
                  border: "1.5px solid var(--accent-primary)",
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                }}
              >
                {/* Pivot crosshair */}
                <div
                  className="absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                  style={{
                    left: `${selectedBounds.anchorX * 100}%`,
                    top: `${selectedBounds.anchorY * 100}%`,
                    border: "1.5px solid var(--accent-teal)",
                    background: "rgba(76,230,200,0.28)",
                  }}
                />
                {/* 4 corner scale handles */}
                {[
                  { left: 0, top: 0, cursor: "nwse-resize" },
                  { left: "100%", top: 0, cursor: "nesw-resize" },
                  { left: 0, top: "100%", cursor: "nesw-resize" },
                  { left: "100%", top: "100%", cursor: "nwse-resize" },
                ].map((h, idx) => (
                  <div
                    key={idx}
                    onPointerDown={(e) => startLayerDrag(e, "scale", selectedBounds)}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-sm touch-none ${
                      compact ? "w-4 h-4" : "w-2.5 h-2.5"
                    }`}
                    style={{
                      left: h.left,
                      top: h.top,
                      cursor: h.cursor,
                      background: "var(--accent-primary)",
                      border: "1px solid #0b0c10",
                    }}
                  />
                ))}
                {/* Top rotation handle */}
                <div
                  title="Arrastra para rotar"
                  onPointerDown={(e) => startLayerDrag(e, "rotate", selectedBounds)}
                  className={`absolute left-1/2 -translate-x-1/2 rounded-full cursor-grab touch-none ${
                    compact ? "-top-7 w-5 h-5" : "-top-6 w-3.5 h-3.5"
                  }`}
                  style={{
                    background: "var(--accent-gold)",
                    border: "1.5px solid #0b0c10",
                  }}
                />
              </div>
            )}

            {/* Snapshot Flash */}
            {captureFlash && <div className="absolute inset-0 bg-white/40 pointer-events-none" />}
          </div>
        </div>

        {/* Floating Resolution / Scene Pill */}
        {!hideFloatingPill && (
          <div
            className={`absolute glass-panel rounded-lg font-mono-code flex items-center gap-1.5 max-w-[calc(100%-20px)] ${
              compact ? "top-2 left-2 px-2 py-0.5 text-[10px]" : "top-3 left-3 px-2.5 py-1 text-[11px] gap-2"
            }`}
            style={{ color: "var(--text-secondary)" }}
          >
            <span className="shrink-0">{compact ? project.canvas.resolution : `${dims.width}×${dims.height}`}</span>
            <span className="shrink-0">·</span>
            <span className="shrink-0">{project.canvas.fps} FPS</span>
            {activeResolved && (
              <>
                <span className="shrink-0">·</span>
                <span className="truncate" style={{ color: "var(--text-primary)" }}>{activeResolved.scene.name}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Transport Bar: CapCut 3-zone clean layout on mobile/compact vs full desktop bar */}
      {compact || mobileTransport ? (
        <div className="glass-panel rounded-xl px-2 py-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5 shrink-0 min-h-[40px]">
          {/* Left: Clean short timecode */}
          <div className="font-mono-code text-[11px] flex items-center gap-1 min-w-0 truncate">
            <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatShortTime(currentTime)}
            </span>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "var(--text-secondary)" }}>{formatShortTime(totalDur)}</span>
          </div>

          {/* Center: CapCut-style frame step & circular Play/Pause */}
          <div className="flex items-center justify-center gap-1 shrink-0">
            <button
              type="button"
              className="mobile-icon-btn"
              title="Frame anterior"
              onClick={() => stepFrames(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer active:scale-95 transition-transform shadow-sm"
              style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
              title="Reproducir / Pausar"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
            </button>
            <button
              type="button"
              className="mobile-icon-btn"
              title="Frame siguiente"
              onClick={() => stepFrames(1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Right: Undo / Redo + Fullscreen (zero crowding) */}
          <div className="flex items-center justify-end gap-0.5 shrink-0">
            {mobileTransport ? (
              <>
                <button
                  type="button"
                  className="mobile-icon-btn"
                  title="Deshacer"
                  onClick={() => (onUndo ? onUndo() : useStudioStore.getState().undo())}
                >
                  <Undo2 size={14} />
                </button>
                <button
                  type="button"
                  className="mobile-icon-btn"
                  title="Rehacer"
                  onClick={() => (onRedo ? onRedo() : useStudioStore.getState().redo())}
                >
                  <Redo2 size={14} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`mobile-icon-btn ${loop ? "studio-btn-active" : ""}`}
                title="Repetir en bucle"
                onClick={() => setLoop(!loop)}
              >
                <Repeat size={14} />
              </button>
            )}
            <button
              type="button"
              className={`mobile-icon-btn ${isFullscreen ? "studio-btn-accent" : ""}`}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      ) : (
        <div className="glass-panel rounded-xl px-3 py-1.5 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <button className="studio-btn !p-1.5" title="Inicio" onClick={() => setCurrentTime(0)}>
              <SkipBack size={14} />
            </button>
            <button className="studio-btn !p-1.5" title="Frame anterior (←)" onClick={() => stepFrames(-1)}>
              <ChevronLeft size={15} />
            </button>
            <button
              className="studio-btn studio-btn-accent !px-3 !py-1.5"
              title="Reproducir / Pausar (Espacio)"
              onClick={togglePlay}
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              <span className="text-[11px]">{isPlaying ? "Pausa" : "Play"}</span>
            </button>
            <button className="studio-btn !p-1.5" title="Frame siguiente (→)" onClick={() => stepFrames(1)}>
              <ChevronRight size={15} />
            </button>
            <button
              className={`studio-btn !p-1.5 ${loop ? "studio-btn-active" : ""}`}
              title="Repetir en bucle"
              onClick={() => setLoop(!loop)}
            >
              <Repeat size={13} />
            </button>
          </div>

          {/* Timecode Readout */}
          <div className="font-mono-code text-[12px] flex items-center gap-1.5 shrink-0">
            <span style={{ color: "var(--text-primary)" }}>{formatTimecode(currentTime, project.canvas.fps)}</span>
            <span style={{ color: "var(--text-muted)" }}>/</span>
            <span style={{ color: "var(--text-secondary)" }}>{formatTimecode(totalDur, project.canvas.fps)}</span>
          </div>

          {/* Preview Zoom, Fullscreen & Quick Frame PNG Capture */}
          <div className="flex items-center gap-1.5 relative shrink-0">
            {/* Preview Zoom Controls */}
            <div
              className="flex items-center rounded-lg overflow-hidden"
              style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
            >
              <button
                className="px-1.5 py-1 hover:bg-white/10 cursor-pointer"
                title="Alejar vista previa"
                onClick={() => adjustPreviewZoom(-0.25)}
              >
                <ZoomOut size={13} />
              </button>
              <button
                className="px-1.5 py-1 text-[10.5px] font-mono-code hover:bg-white/10 cursor-pointer min-w-[42px] text-center"
                title="Restablecer zoom a 100% (Ajustar)"
                onClick={() => setPreviewZoom(1)}
              >
                {Math.round(previewZoom * 100)}%
              </button>
              <button
                className="px-1.5 py-1 hover:bg-white/10 cursor-pointer"
                title="Acercar vista previa (o Ctrl + Rueda)"
                onClick={() => adjustPreviewZoom(0.25)}
              >
                <ZoomIn size={13} />
              </button>
            </div>

            {/* Fullscreen Preview Button */}
            <button
              className={`studio-btn !p-1.5 ${isFullscreen ? "studio-btn-accent" : ""}`}
              title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Abrir vista previa en pantalla completa"}
              onClick={() => void toggleFullscreen()}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>

            {/* Quick Frame PNG Capture */}
            <button
              className="studio-btn !text-[11px]"
              title="Capturar PNG exacto del fotograma actual"
              onClick={handleCaptureSnapshot}
            >
              <Camera size={13} />
              <span>Capturar PNG</span>
            </button>
          </div>
        </div>
      )}

      {/* Stage Right-Click Context Menu */}
      {stageMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-[228px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl"
          style={{ left: stageMenu.x, top: stageMenu.y }}
        >
          <div
            className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider truncate border-b mb-0.5"
            style={{ color: "var(--accent-primary)", borderColor: "var(--border-subtle)" }}
          >
            {stageMenu.layerType}: {stageMenu.layerName}
          </div>

          {(stageMenu.layerType === "background" ||
            stageMenu.layerType === "sprite" ||
            stageMenu.layerType === "character" ||
            stageMenu.layerType === "pip") && (
            <button
              className="studio-btn studio-btn-accent justify-start !py-1.5 !px-2 !text-[11px] w-full"
              onClick={() => {
                openReplaceModal({
                  kind: "layer",
                  sceneId: stageMenu.sceneId,
                  layerId: stageMenu.layerId,
                });
                setStageMenu(null);
              }}
            >
              <RefreshCw size={13} />
              Reemplazar recurso…
            </button>
          )}

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              const sc = project.scenes.find((s) => s.id === stageMenu.sceneId);
              const l = sc?.layers.find((x) => x.id === stageMenu.layerId);
              if (l) {
                dispatchOps([{ op: "layer.update", sceneId: stageMenu.sceneId, layerId: l.id, patch: { zIndex: l.zIndex + 5 } }]);
              }
              setStageMenu(null);
            }}
          >
            <ArrowUp size={13} />
            Traer adelante (Z+)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              const sc = project.scenes.find((s) => s.id === stageMenu.sceneId);
              const l = sc?.layers.find((x) => x.id === stageMenu.layerId);
              if (l) {
                dispatchOps([{ op: "layer.update", sceneId: stageMenu.sceneId, layerId: l.id, patch: { zIndex: l.zIndex - 5 } }]);
              }
              setStageMenu(null);
            }}
          >
            <ArrowDown size={13} />
            Enviar atrás (Z-)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              const sc = project.scenes.find((s) => s.id === stageMenu.sceneId);
              const l = sc?.layers.find((x) => x.id === stageMenu.layerId);
              if (l) {
                const copyId = `${l.id}_copy_${Date.now().toString(36).slice(-3)}`;
                dispatchOps([
                  {
                    op: "layer.add",
                    sceneId: stageMenu.sceneId,
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
              }
              setStageMenu(null);
            }}
          >
            <Copy size={13} />
            Duplicar capa
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            style={{ color: "var(--accent-danger)" }}
            onClick={() => {
              dispatchOps([{ op: "layer.remove", sceneId: stageMenu.sceneId, layerId: stageMenu.layerId }]);
              selectLayer(null);
              setStageMenu(null);
            }}
          >
            <Trash2 size={13} />
            Eliminar capa
          </button>
        </div>
      )}
    </section>
  );
};
