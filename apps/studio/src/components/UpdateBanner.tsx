import React, { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, Loader2, RefreshCw, Sparkles, X } from "lucide-react";
import { studioApi, UpdateStatusPayload } from "../lib/api";
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

export const UpdateBanner: React.FC = () => {
  const onboardingOpen = useStudioStore((s) => s.onboardingOpen);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const setSettingsSection = useStudioStore((s) => s.setSettingsSection);
  const updateAppSettings = useStudioStore((s) => s.updateAppSettings);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [status, setStatus] = useState<UpdateStatusPayload | null>(null);
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const initial = await studioApi.getUpdatesStatus();
        if (cancelled) return;
        setStatus(initial);
        updateAppSettings({
          updateChannel: initial.config.channel,
          autoCheckUpdates: initial.config.autoCheck,
        });
        if (initial.localAdminAllowed && initial.config.autoCheck) {
          const checked = await studioApi.checkForUpdates(initial.config.channel);
          if (!cancelled) {
            setStatus(checked.status);
          }
        }
      } catch {
        // Silent ignore when offline or remote
      }
    }, 2800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
    };
  }, [updateAppSettings]);

  const check = status?.lastCheck;
  const remote = check?.remote;
  const updateKey = remote ? `${check.channel}:${remote.tag}:${remote.commitSha || remote.version}` : null;

  if (
    onboardingOpen ||
    !status ||
    !check ||
    !check.updateAvailable ||
    !remote ||
    (updateKey && dismissedKey === updateKey)
  ) {
    return null;
  }

  const download = status.download;
  const isDownloading =
    download.phase === "downloading" ||
    download.phase === "verifying" ||
    download.phase === "extracting";
  const isDesktop = Boolean(getTauriInvoke()) && status.canAutoInstall;

  const triggerInstallAfterDownload = async (dl: typeof download) => {
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
        setBusyNotice("Instalador abierto. Completa el asistente para finalizar la actualización.");
        window.setTimeout(() => setBusyNotice(null), 5000);
      }
    } catch (err) {
      setInstalling(false);
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setBusyNotice(null);
    }
  };

  const handleUpdateNow = async () => {
    setErrorMsg(null);
    if (!isDesktop) {
      if (remote.releaseUrl) {
        window.open(remote.releaseUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }

    if (download.phase === "ready" && download.channel === check.channel) {
      await triggerInstallAfterDownload(download);
      return;
    }

    try {
      const started = await studioApi.downloadUpdate(check.channel, false);
      setStatus((prev) => (prev ? { ...prev, download: started.download } : prev));

      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      pollTimerRef.current = window.setInterval(async () => {
        try {
          const latest = await studioApi.getUpdatesStatus();
          setStatus(latest);
          if (latest.download.phase === "ready") {
            if (pollTimerRef.current !== null) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            await triggerInstallAfterDownload(latest.download);
          } else if (latest.download.phase === "error") {
            if (pollTimerRef.current !== null) {
              window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
            setErrorMsg(latest.download.error ?? "No se pudo descargar la actualización.");
          }
        } catch {
          // ignore transient poll glitch
        }
      }, 450);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const isNightly = check.channel === "nightly";

  return (
    <div
      className="fixed bottom-4 right-4 z-[95] w-[min(370px,calc(100vw-24px))] rounded-2xl p-3.5 shadow-2xl flex flex-col gap-2.5"
      style={{
        background: "var(--glass-surface-elevated)",
        border: `1.5px solid ${isNightly ? "rgba(247, 200, 214, 0.45)" : "rgba(76, 230, 200, 0.45)"}`,
        backdropFilter: "blur(18px)",
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
            style={{
              background: isNightly ? "rgba(247, 200, 214, 0.16)" : "rgba(76, 230, 200, 0.16)",
              color: isNightly ? "var(--accent-primary)" : "var(--accent-teal)",
            }}
          >
            <Sparkles size={15} />
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-bold flex items-center gap-1.5 flex-wrap">
              <span>{isNightly ? "Actualización Nightly disponible" : "Nueva versión estable"}</span>
              <span
                className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded-full"
                style={{
                  background: isNightly ? "rgba(247, 200, 214, 0.16)" : "rgba(76, 230, 200, 0.16)",
                  color: isNightly ? "var(--accent-primary)" : "var(--accent-teal)",
                }}
              >
                {isNightly && remote.commitShort ? remote.commitShort : `v${remote.version}`}
              </span>
            </div>
            <div
              className="text-[10.5px] mt-0.5 line-clamp-2 leading-snug"
              style={{ color: "var(--text-secondary)" }}
            >
              {remote.commitMessage || check.reason}
            </div>
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-lg hover:bg-white/10 cursor-pointer shrink-0"
          style={{ color: "var(--text-muted)" }}
          onClick={() => updateKey && setDismissedKey(updateKey)}
          title="Recordar más tarde"
        >
          <X size={13} />
        </button>
      </div>

      {isDownloading && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] font-mono-code" style={{ color: "var(--text-secondary)" }}>
            <span>
              {download.phase === "extracting"
                ? "Aplicando archivos internos…"
                : download.phase === "verifying"
                  ? "Verificando SHA-256…"
                  : "Descargando actualización…"}
            </span>
            <span>{download.percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full overflow-hidden bg-black/40">
            <div
              className="h-full transition-all duration-200"
              style={{
                width: `${Math.max(4, download.percent)}%`,
                background: isNightly ? "var(--accent-primary)" : "var(--accent-teal)",
              }}
            />
          </div>
        </div>
      )}

      {errorMsg && (
        <div
          className="text-[10.5px] rounded-lg px-2.5 py-1.5"
          style={{ background: "rgba(255,100,112,0.14)", color: "#fecaca" }}
        >
          {errorMsg}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <button
          type="button"
          className="text-[10.5px] underline-offset-2 hover:underline cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          onClick={() => {
            setSettingsSection("updates");
            setSettingsModalOpen(true);
          }}
        >
          Ajustes de canal
        </button>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="studio-btn !py-1 !px-2.5 !text-[11px]"
            disabled={isDownloading || installing}
            onClick={() => updateKey && setDismissedKey(updateKey)}
          >
            Más tarde
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-accent !py-1 !px-3 !text-[11px] font-semibold"
            disabled={isDownloading || installing}
            onClick={() => void handleUpdateNow()}
          >
            {isDownloading || installing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : isDesktop ? (
              <RefreshCw size={11} />
            ) : (
              <ExternalLink size={11} />
            )}
            {installing
              ? "Reiniciando…"
              : isDownloading
                ? `${download.percent}%`
                : isDesktop
                  ? "Actualizar y reiniciar"
                  : "Ver descarga"}
          </button>
        </div>
      </div>
    </div>
  );
};
