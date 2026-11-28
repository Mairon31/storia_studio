import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  GitCommit,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { studioApi, UpdateChannel, UpdateStatusPayload } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

type TauriGlobal = {
  core?: {
    invoke?: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
  };
};

function getTauriInvoke(): (<T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>) | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__;
  return g?.core?.invoke ?? null;
}

function formatMb(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const UpdatesSettingsPanel: React.FC = () => {
  const updateAppSettings = useStudioStore((s) => s.updateAppSettings);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  const stopPolling = () => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const loadStatus = async () => {
    setLoading(true);
    try {
      const st = await studioApi.getUpdatesStatus();
      setStatus(st);
      updateAppSettings({
        updateChannel: st.config.channel,
        autoCheckUpdates: st.config.autoCheck,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
    return () => stopPolling();
  }, []);

  const handleCheck = async (channelOverride?: UpdateChannel) => {
    setChecking(true);
    setErrorMsg(null);
    try {
      const res = await studioApi.checkForUpdates(channelOverride ?? status?.config.channel);
      setStatus(res.status);
      if (res.result.error) {
        setErrorMsg(res.result.error);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const handleChannelChange = async (channel: UpdateChannel) => {
    setSavingConfig(true);
    setErrorMsg(null);
    try {
      const res = await studioApi.updateUpdatesConfig({ channel });
      setStatus(res.status);
      updateAppSettings({ updateChannel: channel });
      setBusyNotice(
        channel === "nightly"
          ? "Canal cambiado a Nightly. Comprobando último commit en master…"
          : "Canal cambiado a Estable. Comprobando última versión estable…",
      );
      window.setTimeout(() => setBusyNotice(null), 2600);
      await handleCheck(channel);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfig(false);
    }
  };

  const handleAutoCheckToggle = async (autoCheck: boolean) => {
    setSavingConfig(true);
    setErrorMsg(null);
    try {
      const res = await studioApi.updateUpdatesConfig({ autoCheck });
      setStatus(res.status);
      updateAppSettings({ autoCheckUpdates: autoCheck });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfig(false);
    }
  };

  const triggerNativeInstall = async (dl: NonNullable<UpdateStatusPayload["download"]>) => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    setInstalling(true);
    if (dl.installKind === "runtime") {
      setBusyNotice("Aplicando actualización interna y reiniciando Storia Studio…");
      try {
        await invoke("restart_server");
      } catch (err) {
        setInstalling(false);
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setBusyNotice(null);
      }
      return;
    }
    if (!dl.localPath) {
      setInstalling(false);
      return;
    }
    setBusyNotice("Instalando actualización y reiniciando Storia Studio…");
    try {
      const willRestart = await invoke<boolean>("install_update_and_restart", {
        installerPath: dl.localPath,
      });
      if (!willRestart) {
        setInstalling(false);
        setBusyNotice("Instalador abierto. Completa los pasos en pantalla para terminar.");
        window.setTimeout(() => setBusyNotice(null), 5000);
      }
    } catch (err) {
      setInstalling(false);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setBusyNotice(null);
    }
  };

  const handleDownloadAndInstall = async () => {
    if (!status) return;
    const channel = status.config.channel;
    const isDesktop = Boolean(getTauriInvoke()) && status.canAutoInstall;
    setErrorMsg(null);

    if (!isDesktop) {
      const url = status.lastCheck?.remote?.releaseUrl;
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    if (status.download.phase === "ready" && status.download.channel === channel) {
      await triggerNativeInstall(status.download);
      return;
    }

    try {
      const started = await studioApi.downloadUpdate(channel, false);
      setStatus((prev) => (prev ? { ...prev, download: started.download } : prev));
      stopPolling();
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const latest = await studioApi.getUpdatesStatus();
          setStatus(latest);
          if (latest.download.phase === "ready") {
            stopPolling();
            await triggerNativeInstall(latest.download);
          } else if (latest.download.phase === "error") {
            stopPolling();
            setErrorMsg(latest.download.error ?? "No se pudo descargar la actualización.");
          }
        } catch {
          // ignore transient error while polling
        }
      }, 400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const current = status?.current;
  const config = status?.config;
  const check = status?.lastCheck;
  const download = status?.download;
  const isDownloading =
    download?.phase === "downloading" ||
    download?.phase === "verifying" ||
    download?.phase === "extracting";
  const isDesktop = Boolean(getTauriInvoke()) && Boolean(status?.canAutoInstall);
  const selectedChannel: UpdateChannel = config?.channel ?? "stable";
  const effectivePackage = check?.runtime ?? check?.asset ?? null;

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h3 className="text-[13.5px] font-bold mb-1">Actualizaciones de Storia Studio (Estable y Nightly)</h3>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Elige entre lanzamientos <strong>Estables</strong> o compilaciones <strong>Nightly</strong> automáticas con cada nuevo commit en <code className="font-mono-code">master</code>. En la app de escritorio, la descarga se verifica con SHA-256 y se reinicia automáticamente al completar.
        </p>
      </div>

      {/* Installed build card */}
      <div
        className="rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-extrabold font-mono-code">
              v{current?.version ?? "0.2.1"}
            </span>
            <span
              className="text-[9.5px] font-mono-code px-2 py-0.5 rounded-full font-semibold uppercase"
              style={{
                background:
                  current?.channel === "nightly" ? "rgba(247,200,214,0.18)" : "rgba(76,230,200,0.16)",
                color: current?.channel === "nightly" ? "var(--accent-primary)" : "var(--accent-teal)",
              }}
            >
              {current?.channel === "nightly" ? "Nightly" : "Estable"}
            </span>
            {current?.commitShort && (
              <span
                className="text-[10px] font-mono-code px-2 py-0.5 rounded-full flex items-center gap-1"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
              >
                <GitCommit size={10} /> {current.commitShort}
              </span>
            )}
          </div>
          <div className="text-[10.5px] mt-1 font-mono-code" style={{ color: "var(--text-muted)" }}>
            Plataforma: {current?.platformKey ?? "—"} · Repo: {current?.repo ?? "Mairon31/storia_studio"}
          </div>
          {config?.lastCheckedAt && (
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              Última comprobación: {new Date(config.lastCheckedAt).toLocaleString()}
            </div>
          )}
        </div>

        <button
          type="button"
          className="studio-btn studio-btn-accent !px-3.5 !py-1.5 !text-[11px] shrink-0"
          disabled={checking || loading || isDownloading || installing}
          onClick={() => void handleCheck()}
        >
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {checking ? "Comprobando…" : "Buscar actualizaciones"}
        </button>
      </div>

      {/* Channel selector cards: Stable vs Nightly */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={savingConfig || isDownloading || installing}
          onClick={() => void handleChannelChange("stable")}
          className="rounded-xl p-3 text-left cursor-pointer transition-all"
          style={{
            background: selectedChannel === "stable" ? "var(--glass-active)" : "var(--glass-hover)",
            border: `1.5px solid ${selectedChannel === "stable" ? "var(--accent-teal)" : "var(--border-subtle)"}`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold flex items-center gap-1.5">
              <ShieldCheck size={13} style={{ color: "var(--accent-teal)" }} />
              Estable (Recomendado)
            </span>
            {selectedChannel === "stable" && (
              <span
                className="text-[9px] font-mono-code px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(76,230,200,0.16)", color: "var(--accent-teal)" }}
              >
                ACTIVO
              </span>
            )}
          </div>
          <div className="text-[10.5px] mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
            Solo versiones etiquetadas (<code className="font-mono-code">v*</code>) probadas y listas para producción.
          </div>
        </button>

        <button
          type="button"
          disabled={savingConfig || isDownloading || installing}
          onClick={() => void handleChannelChange("nightly")}
          className="rounded-xl p-3 text-left cursor-pointer transition-all"
          style={{
            background: selectedChannel === "nightly" ? "var(--glass-active)" : "var(--glass-hover)",
            border: `1.5px solid ${selectedChannel === "nightly" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold flex items-center gap-1.5">
              <Sparkles size={13} style={{ color: "var(--accent-primary)" }} />
              Nightly (Cada commit en master)
            </span>
            {selectedChannel === "nightly" && (
              <span
                className="text-[9px] font-mono-code px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(247,200,214,0.18)", color: "var(--accent-primary)" }}
              >
                ACTIVO
              </span>
            )}
          </div>
          <div className="text-[10.5px] mt-1 leading-snug" style={{ color: "var(--text-secondary)" }}>
            Detecta automáticamente cada commit publicado en <code className="font-mono-code">master</code> para actualizar y reiniciar en 1 clic.
          </div>
        </button>
      </div>

      {/* Auto-check toggle */}
      <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(config?.autoCheck ?? true)}
          disabled={savingConfig}
          onChange={(e) => void handleAutoCheckToggle(e.target.checked)}
        />
        Comprobar automáticamente al iniciar Storia Studio y avisar si hay una actualización pendiente
      </label>

      {/* Error banner */}
      {errorMsg && (
        <div
          className="rounded-xl px-3 py-2 text-[11px]"
          style={{
            background: "rgba(255,100,112,0.14)",
            border: "1px solid rgba(255,100,112,0.34)",
            color: "#fecaca",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Check result card */}
      {check && !check.error && (
        <div
          className="rounded-xl p-3.5 flex flex-col gap-2.5"
          style={{
            background: check.updateAvailable ? "rgba(76,230,200,0.08)" : "var(--glass-hover)",
            border: `1px solid ${check.updateAvailable ? "rgba(76,230,200,0.36)" : "var(--border-subtle)"}`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] font-bold flex items-center gap-1.5 flex-wrap">
                {check.updateAvailable ? (
                  <>
                    <Download size={13} style={{ color: "var(--accent-teal)" }} />
                    <span>
                      {check.channel === "nightly"
                        ? `Nueva compilación Nightly (${check.remote?.commitShort || check.remote?.version})`
                        : `Nueva versión estable v${check.remote?.version}`}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={13} style={{ color: "var(--accent-teal)" }} />
                    <span>Storia Studio está actualizado</span>
                  </>
                )}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {check.reason}
              </div>
              {check.remote?.commitMessage && check.updateAvailable && (
                <div className="text-[10.5px] font-mono-code mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                  Último cambio: {check.remote.commitMessage}
                </div>
              )}
              {effectivePackage && check.updateAvailable && (
                <div className="text-[10px] font-mono-code mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {check.runtime ? "Actualización interna" : "Paquete"}: {effectivePackage.filename} (
                  {formatMb(effectivePackage.size)})
                </div>
              )}
            </div>

            {check.updateAvailable && check.remote && (
              <button
                type="button"
                disabled={isDownloading || installing || (!effectivePackage && isDesktop)}
                onClick={() => void handleDownloadAndInstall()}
                className="studio-btn studio-btn-accent !px-3.5 !py-1.5 !text-[11px] font-semibold shrink-0"
              >
                {isDownloading || installing ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : isDesktop ? (
                  <Download size={12} />
                ) : (
                  <ExternalLink size={12} />
                )}
                {installing
                  ? "Reiniciando…"
                  : isDownloading
                    ? `${download?.percent ?? 0}%`
                    : isDesktop
                      ? "Actualizar y reiniciar"
                      : "Abrir en GitHub Releases"}
              </button>
            )}
          </div>

          {isDownloading && download && (
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[10px] font-mono-code" style={{ color: "var(--text-secondary)" }}>
                <span>
                  {download.phase === "extracting"
                    ? "Aplicando archivos internos…"
                    : download.phase === "verifying"
                      ? "Verificando integridad SHA-256…"
                      : `Descargando ${formatMb(download.bytesDownloaded)} / ${formatMb(download.totalBytes)}`}
                </span>
                <span>{download.percent}%</span>
              </div>
              <div className="h-2 w-full rounded-full overflow-hidden bg-black/40">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${Math.max(4, download.percent)}%`,
                    background: "var(--accent-teal)",
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
