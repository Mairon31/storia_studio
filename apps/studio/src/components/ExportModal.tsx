import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  Download,
  FileText,
  Film,
  Loader2,
  Square,
  X,
  XCircle,
} from "lucide-react";
import {
  AspectRatio,
  Fps,
  QUALITY_PRESET_DEFAULTS,
  QualityPreset,
  resolveCanvasDimensions,
  ResolutionPreset,
  VideoEncoder,
} from "@storia/schema";
import { studioApi } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExportModal: React.FC = () => {
  const open = useStudioStore((s) => s.exportModalOpen);
  const setOpen = useStudioStore((s) => s.setExportModalOpen);
  const project = useStudioStore((s) => s.project);
  const capabilities = useStudioStore((s) => s.capabilities);
  const exportJobs = useStudioStore((s) => s.exportJobs);
  const exportFiles = useStudioStore((s) => s.exportFiles);
  const activeExportJobId = useStudioStore((s) => s.activeExportJobId);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const startExport = useStudioStore((s) => s.startExport);
  const cancelExport = useStudioStore((s) => s.cancelExport);
  const refreshExports = useStudioStore((s) => s.refreshExports);
  const upsertExportJobFromSocket = useStudioStore((s) => s.upsertExportJobFromSocket);

  const [outputName, setOutputName] = useState("");
  const [starting, setStarting] = useState(false);

  const activeJob =
    exportJobs.find((j) => j.id === activeExportJobId) ??
    exportJobs[0] ??
    null;

  const isRunning =
    activeJob !== null &&
    (activeJob.status === "queued" ||
      activeJob.status === "mixing_audio" ||
      activeJob.status === "rendering_frames" ||
      activeJob.status === "finalizing");

  // Polling fallback if WS drops during export
  useEffect(() => {
    if (!open || !isRunning || !activeJob) return;
    const timer = window.setInterval(async () => {
      try {
        const latest = await studioApi.getExportJob(activeJob.id);
        upsertExportJobFromSocket(latest, latest.status === "completed");
      } catch {
        // Ignore transient errors
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open, isRunning, activeJob?.id, upsertExportJobFromSocket]);

  if (!open) return null;

  const cfg = project.exportSettings;
  const dims = resolveCanvasDimensions(cfg);

  const updateExport = (patch: Record<string, unknown>) => {
    dispatchOps([{ op: "exportSettings.update", patch }]);
  };

  const handleStartExport = async () => {
    setStarting(true);
    try {
      await startExport(cfg, outputName.trim() || undefined);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(0,0,0,0.62)", backdropFilter: "blur(8px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-elevated rounded-2xl w-full max-w-[580px] max-h-[94dvh] overflow-y-auto p-3.5 sm:p-5 flex flex-col gap-3.5 sm:gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Exportar Video (FFmpeg 1:1)</h2>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Paridad exacta con el viewport · Salida {dims.width}×{dims.height} @ {cfg.fps} FPS
            </p>
          </div>
          <button className="studio-btn !p-1.5" onClick={() => setOpen(false)}>
            <X size={16} />
          </button>
        </div>

        {/* Aspect / Resolution / FPS */}
        <div className="grid grid-cols-3 gap-2.5">
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Aspecto
            <select
              className="studio-input"
              disabled={isRunning}
              value={cfg.aspectRatio}
              onChange={(e) => updateExport({ aspectRatio: e.target.value as AspectRatio })}
            >
              <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>9:16 Vertical</option>
              <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>16:9 YouTube</option>
              <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>1:1 Cuadrado</option>
              <option value="custom" style={{ background: "#14161c", color: "#f3f4f6" }}>Personalizado</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Resolución
            <select
              className="studio-input"
              disabled={isRunning}
              value={cfg.resolution}
              onChange={(e) => updateExport({ resolution: e.target.value as ResolutionPreset })}
            >
              <option value="360p" style={{ background: "#14161c", color: "#f3f4f6" }}>360p Borrador</option>
              <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>720p HD</option>
              <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>1080p Full HD</option>
              <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>2K (1440p)</option>
              <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>4K (2160p)</option>
              <option value="custom" style={{ background: "#14161c", color: "#f3f4f6" }}>Personalizada</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            FPS
            <select
              className="studio-input"
              disabled={isRunning}
              value={cfg.fps}
              onChange={(e) => updateExport({ fps: Number(e.target.value) as Fps })}
            >
              <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>24 FPS Cine</option>
              <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>30 FPS Estándar</option>
              <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>60 FPS Fluido</option>
            </select>
          </label>
        </div>

        {/* Custom width/height if selected */}
        {(cfg.aspectRatio === "custom" || cfg.resolution === "custom") && (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Ancho (px)
              <input
                type="number"
                min={128}
                max={7680}
                step={2}
                disabled={isRunning}
                className="studio-input font-mono-code"
                value={cfg.customWidth ?? dims.width}
                onChange={(e) => updateExport({ customWidth: Math.max(128, Number(e.target.value)) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Alto (px)
              <input
                type="number"
                min={128}
                max={7680}
                step={2}
                disabled={isRunning}
                className="studio-input font-mono-code"
                value={cfg.customHeight ?? dims.height}
                onChange={(e) => updateExport({ customHeight: Math.max(128, Number(e.target.value)) })}
              />
            </label>
          </div>
        )}

        {/* Quality & Encoder */}
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Perfil de Calidad
            <select
              className="studio-input"
              disabled={isRunning}
              value={cfg.quality}
              onChange={(e) => {
                const q = e.target.value as QualityPreset;
                const def = q !== "custom" ? QUALITY_PRESET_DEFAULTS[q] : null;
                updateExport({
                  quality: q,
                  ...(def ? { crf: def.crf, audioBitrateKbps: def.audioBitrateKbps, videoBitrateKbps: undefined } : {}),
                });
              }}
            >
              <option value="draft" style={{ background: "#14161c", color: "#f3f4f6" }}>Borrador rápido (CRF 27)</option>
              <option value="standard" style={{ background: "#14161c", color: "#f3f4f6" }}>Estándar (CRF 21)</option>
              <option value="high" style={{ background: "#14161c", color: "#f3f4f6" }}>Alta (CRF 17)</option>
              <option value="master" style={{ background: "#14161c", color: "#f3f4f6" }}>Master (CRF 13)</option>
              <option value="custom" style={{ background: "#14161c", color: "#f3f4f6" }}>Personalizado (CRF / Bitrate)</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Codificador GPU / CPU
            <select
              className="studio-input"
              disabled={isRunning}
              value={cfg.encoder}
              onChange={(e) => updateExport({ encoder: e.target.value as VideoEncoder })}
            >
              <option value="auto" style={{ background: "#14161c", color: "#f3f4f6" }}>
                Auto ({capabilities?.recommendedEncoder ?? "h264_nvenc"})
              </option>
              <option value="h264_nvenc" style={{ background: "#14161c", color: "#f3f4f6" }}>NVIDIA H.264 (NVENC)</option>
              <option value="hevc_nvenc" style={{ background: "#14161c", color: "#f3f4f6" }}>NVIDIA H.265 / HEVC (NVENC)</option>
              <option value="av1_nvenc" style={{ background: "#14161c", color: "#f3f4f6" }}>NVIDIA AV1 (NVENC)</option>
              <option value="libx264" style={{ background: "#14161c", color: "#f3f4f6" }}>CPU libx264 (Fallback)</option>
              <option value="libx265" style={{ background: "#14161c", color: "#f3f4f6" }}>CPU libx265</option>
            </select>
          </label>
        </div>

        {/* Custom CRF / Bitrate */}
        {cfg.quality === "custom" && (
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              CRF / CQ ({cfg.crf ?? 17})
              <input
                type="range"
                min={8}
                max={34}
                disabled={isRunning}
                value={cfg.crf ?? 17}
                onChange={(e) => updateExport({ crf: Number(e.target.value), videoBitrateKbps: undefined })}
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Bitrate Video opcional (kbps)
              <input
                type="number"
                placeholder="Vacío = usar CRF/CQ"
                min={500}
                max={120000}
                disabled={isRunning}
                className="studio-input font-mono-code"
                value={cfg.videoBitrateKbps ?? ""}
                onChange={(e) =>
                  updateExport({ videoBitrateKbps: e.target.value ? Number(e.target.value) : undefined })
                }
              />
            </label>
          </div>
        )}

        {/* Remotion-Powered Parallel Render Concurrency, Motion Blur & Partial Range */}
        <div
          className="rounded-xl p-3 flex flex-col gap-2.5"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-teal)" }}>
            Aceleración Paralela y Motion Blur Cinematográfico
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              Workers paralelos
              <select
                className="studio-input"
                disabled={isRunning}
                value={cfg.concurrency ?? 0}
                onChange={(e) => updateExport({ concurrency: Number(e.target.value) })}
              >
                <option value={0} style={{ background: "#14161c", color: "#f3f4f6" }}>Auto (CPU óptimo)</option>
                <option value={1} style={{ background: "#14161c", color: "#f3f4f6" }}>1× Secuencial</option>
                <option value={2} style={{ background: "#14161c", color: "#f3f4f6" }}>2× Workers</option>
                <option value={4} style={{ background: "#14161c", color: "#f3f4f6" }}>4× Workers</option>
                <option value={6} style={{ background: "#14161c", color: "#f3f4f6" }}>6× Workers</option>
                <option value={8} style={{ background: "#14161c", color: "#f3f4f6" }}>8× Workers (Max)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              Motion Blur (Sub-frames)
              <select
                className="studio-input"
                disabled={isRunning}
                value={cfg.motionBlurSamples ?? 1}
                onChange={(e) => updateExport({ motionBlurSamples: Number(e.target.value) })}
              >
                <option value={1} style={{ background: "#14161c", color: "#f3f4f6" }}>Desactivado (1×)</option>
                <option value={2} style={{ background: "#14161c", color: "#f3f4f6" }}>Ligero (2× muestras)</option>
                <option value={4} style={{ background: "#14161c", color: "#f3f4f6" }}>Cine Estándar (4×)</option>
                <option value={8} style={{ background: "#14161c", color: "#f3f4f6" }}>Ultra Suave (8×)</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              Obturador ({cfg.shutterAngle ?? 180}°)
              <input
                type="range"
                min={0}
                max={360}
                step={15}
                disabled={isRunning || (cfg.motionBlurSamples ?? 1) <= 1}
                value={cfg.shutterAngle ?? 180}
                onChange={(e) => updateExport({ shutterAngle: Number(e.target.value) })}
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              Rango inicio opcional (seg)
              <input
                type="number"
                min={0}
                step={0.1}
                disabled={isRunning}
                placeholder="0.0 (todo el video)"
                className="studio-input font-mono-code"
                value={cfg.startTimeSec ?? ""}
                onChange={(e) =>
                  updateExport({ startTimeSec: e.target.value !== "" ? Math.max(0, Number(e.target.value)) : undefined })
                }
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
              Rango fin opcional (seg)
              <input
                type="number"
                min={0.1}
                step={0.1}
                disabled={isRunning}
                placeholder="Fin del proyecto"
                className="studio-input font-mono-code"
                value={cfg.endTimeSec ?? ""}
                onChange={(e) =>
                  updateExport({ endTimeSec: e.target.value !== "" ? Math.max(0.1, Number(e.target.value)) : undefined })
                }
              />
            </label>
          </div>
        </div>

        {/* Output Name & Subtitle Options */}
        <div className="grid grid-cols-2 gap-2.5 items-end">
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Nombre del archivo (opcional)
            <input
              type="text"
              disabled={isRunning}
              placeholder={`${project.id}_${dims.width}x${dims.height}`}
              className="studio-input font-mono-code"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
            />
          </label>

          <div className="flex flex-col gap-1.5 pb-1 text-[11px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={isRunning}
                checked={cfg.burnSubtitles}
                onChange={(e) => updateExport({ burnSubtitles: e.target.checked })}
              />
              Quemar subtítulos en video
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={isRunning}
                checked={cfg.exportSrt}
                onChange={(e) => updateExport({ exportSrt: e.target.checked })}
              />
              Exportar archivo .SRT adjunto
            </label>
          </div>
        </div>

        {/* Hardware Capability Banner */}
        <div
          className="rounded-xl px-3 py-2 text-[11px] flex items-center justify-between"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <Cpu size={14} style={{ color: "var(--accent-teal)" }} />
            <span>
              {capabilities?.encoders.h264_nvenc
                ? "GPU NVIDIA NVENC lista (H.264 / HEVC / AV1) con fallback automático"
                : "Modo CPU libx264 activo"}
            </span>
          </div>
          <span className="font-mono-code" style={{ color: "var(--text-muted)" }}>
            {cfg.loudnessLufs} LUFS
          </span>
        </div>

        {/* Live Progress Card */}
        {activeJob && (
          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: "var(--glass-hover)", border: "1px solid var(--border-strong)" }}
          >
            <div className="flex items-center justify-between gap-2 text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                {isRunning ? (
                  <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--accent-gold)" }} />
                ) : activeJob.status === "completed" ? (
                  <CheckCircle2 size={14} className="shrink-0" style={{ color: "var(--accent-teal)" }} />
                ) : (
                  <XCircle size={14} className="shrink-0" style={{ color: "var(--accent-danger)" }} />
                )}
                <span className="font-medium truncate">{activeJob.stageLabel}</span>
              </div>
              <span className="font-mono-code text-[11px] shrink-0">
                {Math.round(activeJob.progress * 100)}%
              </span>
            </div>

            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full transition-all duration-150"
                style={{
                  width: `${Math.round(activeJob.progress * 100)}%`,
                  background:
                    activeJob.status === "failed" || activeJob.status === "cancelled"
                      ? "var(--accent-danger)"
                      : activeJob.status === "completed"
                        ? "var(--accent-teal)"
                        : "var(--accent-primary)",
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
              <span>
                {activeJob.width}×{activeJob.height} · {activeJob.fps}fps · {activeJob.codec}
                {activeJob.isGpu ? " (GPU)" : " (CPU)"}
              </span>
              <span>
                {isRunning && activeJob.etaSec !== null
                  ? `ETA ~${activeJob.etaSec}s`
                  : activeJob.probe
                    ? `${activeJob.probe.durationSec.toFixed(2)}s · ${formatBytes(activeJob.probe.sizeBytes)}`
                    : activeJob.status}
              </span>
            </div>

            {activeJob.status === "completed" && activeJob.downloadUrl && (
              <div className="flex items-center gap-2 pt-1">
                <a
                  href={activeJob.downloadUrl}
                  download={activeJob.outputFilename}
                  className="studio-btn studio-btn-accent !text-[11px] !py-1.5"
                >
                  <Download size={12} /> Descargar MP4
                </a>
                {activeJob.srtDownloadUrl && (
                  <a
                    href={activeJob.srtDownloadUrl}
                    download={activeJob.srtFilename}
                    className="studio-btn !text-[11px] !py-1.5"
                    style={{ borderColor: "var(--border-strong)" }}
                  >
                    <FileText size={12} /> Descargar SRT
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {/* Recent Export Files on Disk */}
        {exportFiles.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              <span>Exportaciones en disco ({exportFiles.length})</span>
              <button className="hover:underline cursor-pointer" onClick={() => void refreshExports()}>
                Actualizar
              </button>
            </div>
            <div className="max-h-28 overflow-y-auto flex flex-col gap-1">
              {exportFiles.slice(0, 6).map((f) => (
                <a
                  key={f.filename}
                  href={f.url}
                  download={f.filename}
                  className="rounded-lg px-2.5 py-1.5 flex items-center justify-between text-[11px] hover:opacity-100 opacity-90"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    {f.filename.endsWith(".mp4") ? <Film size={12} /> : <FileText size={12} />}
                    <span className="truncate font-mono-code">{f.filename}</span>
                  </span>
                  <span className="font-mono-code text-[10px] shrink-0 ml-2" style={{ color: "var(--text-muted)" }}>
                    {formatBytes(f.sizeBytes)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Footer Action Bar */}
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Se guarda en <span className="font-mono-code">projects/{project.id}/exports/</span>
          </span>

          {isRunning && activeJob ? (
            <button
              className="studio-btn !text-[12px]"
              style={{
                background: "rgba(255, 100, 112, 0.16)",
                borderColor: "rgba(255, 100, 112, 0.45)",
                color: "var(--accent-danger)",
              }}
              onClick={() => void cancelExport(activeJob.id)}
            >
              <Square size={12} /> Cancelar
            </button>
          ) : (
            <button
              disabled={starting}
              className="studio-btn studio-btn-accent"
              onClick={() => void handleStartExport()}
            >
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Iniciar Exportación MP4
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
