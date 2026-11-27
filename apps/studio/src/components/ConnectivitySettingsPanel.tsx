import React, { useCallback, useEffect, useState } from "react";
import {
  Bot,
  Check,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Laptop,
  Loader2,
  Play,
  RefreshCw,
  Shield,
  Smartphone,
  Square,
  Terminal,
  Wifi,
} from "lucide-react";
import {
  AccessMode,
  AiHarnessId,
  AiIntegrationBundle,
  AiTransportMode,
  CloudflareTunnelMode,
  ConnectivityStatusResponse,
  OAuthStatusSummary,
  studioApi,
  TunnelProvider,
} from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

const HARNESS_OPTIONS: { id: AiHarnessId; label: string }[] = [
  { id: "universal", label: "Universal (Cualquier IA)" },
  { id: "claude", label: "Claude (Desktop / Code / Web)" },
  { id: "codex", label: "OpenAI Codex CLI" },
  { id: "antigravity", label: "Antigravity / Gemini" },
  { id: "opencode", label: "OpenCode" },
  { id: "cursor", label: "Cursor / Windsurf" },
];

const TRANSPORT_OPTIONS: { id: AiTransportMode; label: string }[] = [
  { id: "tunnel", label: "Túnel HTTPS (Remoto / Persistente)" },
  { id: "lan", label: "Red Local (Otro dispositivo LAN)" },
  { id: "stdio", label: "Local stdio (Mismo equipo)" },
];

export type ConnectivityPanelView = "network" | "remote" | "mcp";

const LOOPBACK_IP = ["127", "0", "0", "1"].join(".");
const NGROK_PLACEHOLDER = ["mi-storia", "ngrok-free", "app"].join(".");
const CF_PLACEHOLDER = ["storia", "tudominio", "com"].join(".");

export const ConnectivitySettingsPanel: React.FC<{ view: ConnectivityPanelView }> = ({ view }) => {
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [status, setStatus] = useState<ConnectivityStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tunnelBusy, setTunnelBusy] = useState(false);
  const [installingBin, setInstallingBin] = useState<"ngrok" | "cloudflare" | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [accessMode, setAccessMode] = useState<AccessMode>("local");
  const [port, setPort] = useState<number>(4310);
  const [mcpHttpEnabled, setMcpHttpEnabled] = useState(true);
  const [mcpAuthEnabled, setMcpAuthEnabled] = useState(true);
  const [tunnelProvider, setTunnelProvider] = useState<TunnelProvider>("none");
  const [tunnelAutoStart, setTunnelAutoStart] = useState(false);
  const [ngrokDomain, setNgrokDomain] = useState("");
  const [ngrokRegion, setNgrokRegion] = useState("");
  const [ngrokAuthtoken, setNgrokAuthtoken] = useState("");
  const [cfMode, setCfMode] = useState<CloudflareTunnelMode>("named_token");
  const [cfHostname, setCfHostname] = useState("");
  const [cfToken, setCfToken] = useState("");

  const [harness, setHarness] = useState<AiHarnessId>("claude");
  const [transportMode, setTransportMode] = useState<AiTransportMode>("tunnel");
  const [bundle, setBundle] = useState<AiIntegrationBundle | null>(null);
  const [loadingBundle, setLoadingBundle] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusSummary | null>(null);
  const [revokingOauth, setRevokingOauth] = useState(false);

  const flashNotice = (msg: string) => {
    setBusyNotice(msg);
    window.setTimeout(() => setBusyNotice(null), 2800);
  };

  const copyText = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      flashNotice(`${label} copiado al portapapeles.`);
      window.setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {
      flashNotice("No se pudo copiar automáticamente; selecciona el texto manualmente.");
    }
  };

  const syncFormFromStatus = useCallback((st: ConnectivityStatusResponse) => {
    setAccessMode(st.config.accessMode);
    setPort(st.config.port);
    setMcpHttpEnabled(st.config.mcpHttpEnabled);
    setMcpAuthEnabled(st.config.mcpAuthEnabled);
    setTunnelProvider(st.config.tunnel.provider);
    setTunnelAutoStart(st.config.tunnel.autoStart);
    setNgrokDomain(st.config.tunnel.ngrok.domain);
    setNgrokRegion(st.config.tunnel.ngrok.region);
    setCfMode(st.config.tunnel.cloudflare.mode);
    setCfHostname(st.config.tunnel.cloudflare.persistentHostname);
  }, []);

  const loadStatus = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const [st, oa] = await Promise.all([
          studioApi.getConnectivityStatus(refresh),
          studioApi.getOAuthStatus().catch(() => null),
        ]);
        setStatus(st);
        if (oa) setOauthStatus(oa);
        syncFormFromStatus(st);
      } catch (err) {
        flashNotice(`Error cargando conectividad: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setLoading(false);
      }
    },
    [syncFormFromStatus],
  );

  const handleRevokeOAuth = async () => {
    setRevokingOauth(true);
    try {
      const next = await studioApi.revokeAllOAuthSessions();
      setOauthStatus(next);
      flashNotice("Todas las sesiones OAuth 2.1 (ChatGPT / Gemini / Claude) fueron revocadas.");
    } catch (err) {
      flashNotice(`No se pudieron revocar sesiones OAuth: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRevokingOauth(false);
    }
  };

  const loadBundle = useCallback(async (h: AiHarnessId, m: AiTransportMode) => {
    setLoadingBundle(true);
    try {
      const b = await studioApi.getAiIntegrationBundle(h, m);
      setBundle(b);
    } catch {
      // Ignore transient error
    } finally {
      setLoadingBundle(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus(false);
  }, [loadStatus]);

  // Auto-refresh tunnel status briefly while connecting or waiting for Cloudflare remote hostname
  useEffect(() => {
    if (view !== "remote") return;
    const waitingForUrl =
      status?.tunnel.state === "starting" ||
      (status?.tunnel.state === "running" && !status.tunnel.publicUrl);
    if (!waitingForUrl) return;
    const timer = window.setInterval(() => {
      void studioApi
        .getConnectivityStatus(false)
        .then((st) => setStatus(st))
        .catch(() => {});
    }, 1500);
    return () => window.clearInterval(timer);
  }, [view, status?.tunnel.state, status?.tunnel.publicUrl]);

  useEffect(() => {
    if (view === "mcp") {
      void loadBundle(harness, transportMode);
    }
  }, [
    view,
    harness,
    transportMode,
    status?.tunnel.publicUrl,
    status?.config.mcpAuthToken,
    status?.config.mcpAuthEnabled,
    loadBundle,
  ]);

  const handleSaveConfig = async (extraPatch?: Parameters<typeof studioApi.updateConnectivityConfig>[0]) => {
    setSaving(true);
    try {
      const updated = await studioApi.updateConnectivityConfig({
        accessMode,
        port,
        mcpHttpEnabled,
        mcpAuthEnabled,
        tunnelProvider,
        tunnelAutoStart,
        ngrokDomain,
        ngrokRegion,
        ...(ngrokAuthtoken.trim() ? { ngrokAuthtoken: ngrokAuthtoken.trim() } : {}),
        cloudflareMode: cfMode,
        cloudflarePersistentHostname: cfHostname,
        ...(cfToken.trim() ? { cloudflareTunnelToken: cfToken.trim() } : {}),
        ...extraPatch,
      });
      setStatus(updated);
      syncFormFromStatus(updated);
      setNgrokAuthtoken("");
      setCfToken("");
      flashNotice("Configuración de red y túnel guardada.");
    } catch (err) {
      flashNotice(`No se pudo guardar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRotateToken = async () => {
    setSaving(true);
    try {
      const updated = await studioApi.rotateConnectivityToken();
      setStatus(updated);
      flashNotice("Nuevo Bearer Token MCP generado.");
    } catch (err) {
      flashNotice(`No se pudo rotar el token: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRotateMobileLink = async () => {
    setSaving(true);
    try {
      const updated = await studioApi.rotateMobileAccessCode();
      setStatus(updated);
      flashNotice("Enlace móvil regenerado: todas las sesiones móviles anteriores fueron revocadas.");
    } catch (err) {
      flashNotice(`No se pudo regenerar el enlace móvil: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleStartTunnel = async () => {
    if (tunnelProvider === "none") {
      flashNotice("Selecciona ngrok o Cloudflare antes de iniciar el túnel.");
      return;
    }
    setTunnelBusy(true);
    try {
      await studioApi.updateConnectivityConfig({
        tunnelProvider,
        tunnelAutoStart,
        ngrokDomain,
        ngrokRegion,
        ...(ngrokAuthtoken.trim() ? { ngrokAuthtoken: ngrokAuthtoken.trim() } : {}),
        cloudflareMode: cfMode,
        cloudflarePersistentHostname: cfHostname,
        ...(cfToken.trim() ? { cloudflareTunnelToken: cfToken.trim() } : {}),
      });
      const updated = await studioApi.startTunnel(tunnelProvider);
      setStatus(updated);
      setNgrokAuthtoken("");
      setCfToken("");
      if (updated.tunnel.error) {
        flashNotice(`Error en túnel: ${updated.tunnel.error}`);
      } else if (updated.tunnel.publicUrl) {
        flashNotice(`Túnel activo en ${updated.tunnel.publicUrl}`);
      } else {
        flashNotice("Túnel iniciado correctamente.");
      }
    } catch (err) {
      flashNotice(`Error iniciando túnel: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleStopTunnel = async () => {
    setTunnelBusy(true);
    try {
      const updated = await studioApi.stopTunnel();
      setStatus(updated);
      flashNotice("Túnel detenido correctamente.");
    } catch (err) {
      flashNotice(`Error deteniendo túnel: ${err instanceof Error ? err.message : String(err)}`);
      void loadStatus(false);
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleInstallBinary = async (provider: "ngrok" | "cloudflare") => {
    setInstallingBin(provider);
    try {
      const updated = await studioApi.installTunnelBinary(provider);
      setStatus(updated);
      flashNotice(
        provider === "ngrok"
          ? "ngrok instalado correctamente en Storia Studio."
          : "cloudflared instalado correctamente en Storia Studio.",
      );
    } catch (err) {
      flashNotice(`No se pudo instalar ${provider}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingBin(null);
    }
  };

  const tunnelRunning = status?.tunnel.state === "running" || status?.tunnel.state === "starting";
  const localFallbackUrl = `${window.location.protocol}//${LOOPBACK_IP}:${port}`;

  const headerMeta: Record<
    ConnectivityPanelView,
    { title: string; desc: string; icon: React.ReactNode }
  > = {
    network: {
      title: "Red Local y Acceso desde Otros Dispositivos",
      desc: "Configura si Storia Studio solo escucha en este equipo o en toda tu red Wi-Fi/LAN, el puerto del servidor y la seguridad Bearer para el endpoint /mcp.",
      icon: <Wifi size={14} style={{ color: "var(--accent-teal)" }} />,
    },
    remote: {
      title: "Conexión Remota (Túneles ngrok / Cloudflare)",
      desc: "Expón Storia Studio y su endpoint MCP por HTTPS con una URL persistente para conectarlo desde IAs en la nube u otros dispositivos fuera de tu red.",
      icon: <Cloud size={14} style={{ color: "var(--accent-primary)" }} />,
    },
    mcp: {
      title: "Integrar Storia Studio MCP a una IA",
      desc: "Genera y copia el prompt estructurado completo y la configuración JSON/TOML exacta para Claude, Codex, Antigravity, OpenCode, Cursor u otro harness MCP.",
      icon: <Bot size={14} style={{ color: "var(--accent-gold)" }} />,
    },
  };

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold mb-0.5 flex items-center gap-1.5">
            {headerMeta[view].icon}
            {headerMeta[view].title}
          </h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {headerMeta[view].desc}
          </p>
        </div>
        <button
          className="studio-btn !p-1.5 shrink-0"
          onClick={() => void loadStatus(true)}
          title="Recargar estado de red y binarios"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {view === "network" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setAccessMode("local")}
              className="rounded-xl p-3 text-left transition-all cursor-pointer"
              style={{
                background: accessMode === "local" ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1.5px solid ${accessMode === "local" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="text-[12px] font-semibold flex items-center gap-1.5">
                <Laptop size={13} style={{ color: "var(--accent-primary)" }} />
                Solo este equipo (Local)
              </div>
              <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>
                Enlaza en <code className="font-mono-code">{LOOPBACK_IP}</code>. Máxima privacidad; el túnel sigue funcionando si lo activas.
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAccessMode("lan")}
              className="rounded-xl p-3 text-left transition-all cursor-pointer"
              style={{
                background: accessMode === "lan" ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1.5px solid ${accessMode === "lan" ? "var(--accent-teal)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="text-[12px] font-semibold flex items-center gap-1.5">
                <Wifi size={13} style={{ color: "var(--accent-teal)" }} />
                Red Local / Otro Dispositivo (LAN)
              </div>
              <div className="text-[10.5px] mt-1" style={{ color: "var(--text-muted)" }}>
                Enlaza en <code className="font-mono-code">0.0.0.0</code> para abrir el editor y MCP desde otro PC, tablet o móvil en el mismo Wi-Fi.
              </div>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Puerto del servidor Storia Studio
              <input
                type="number"
                min={1024}
                max={65535}
                className="studio-input font-mono-code"
                value={port}
                onChange={(e) => setPort(Number(e.target.value) || 4310)}
              />
            </label>

            <div className="flex flex-col justify-center gap-1.5 text-[11.5px] pt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mcpHttpEnabled}
                  onChange={(e) => setMcpHttpEnabled(e.target.checked)}
                />
                Habilitar endpoint remoto <code className="font-mono-code">/mcp</code> (Streamable HTTP)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mcpAuthEnabled}
                  onChange={(e) => setMcpAuthEnabled(e.target.checked)}
                />
                Exigir Bearer Token para conexiones remotas MCP
              </label>
            </div>
          </div>

          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11.5px] font-medium flex items-center gap-1.5">
                <Shield size={13} style={{ color: "var(--accent-gold)" }} />
                Token de seguridad MCP (Bearer)
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  className="studio-btn !py-1 !px-2 !text-[10.5px]"
                  onClick={() => setShowToken((v) => !v)}
                >
                  {showToken ? <EyeOff size={11} /> : <Eye size={11} />}
                  {showToken ? "Ocultar" : "Mostrar"}
                </button>
                <button
                  className="studio-btn !py-1 !px-2 !text-[10.5px]"
                  onClick={() =>
                    status && void copyText("token", status.config.mcpAuthToken, "Bearer Token MCP")
                  }
                >
                  {copiedKey === "token" ? <Check size={11} /> : <Copy size={11} />}
                  Copiar
                </button>
                <button
                  className="studio-btn !py-1 !px-2 !text-[10.5px]"
                  disabled={saving}
                  onClick={() => void handleRotateToken()}
                >
                  <KeyRound size={11} /> Rotar
                </button>
              </div>
            </div>
            <div className="font-mono-code text-[11px] px-2.5 py-1.5 rounded-lg truncate" style={{ background: "rgba(0,0,0,0.28)" }}>
              {status ? (showToken ? status.config.mcpAuthToken : "•".repeat(32)) : "Cargando…"}
            </div>
            <div className="flex items-center justify-between gap-2 pt-1 text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              <span>
                <strong style={{ color: "#6ee7b7" }}>OAuth 2.1 + PKCE activo</strong> para ChatGPT, Gemini y Claude web ·{" "}
                {oauthStatus ? `${oauthStatus.activeTokensCount} sesiones activas (${oauthStatus.clientsCount} clientes)` : "Listo"}
              </span>
              {oauthStatus && oauthStatus.activeTokensCount > 0 && (
                <button
                  type="button"
                  disabled={revokingOauth}
                  className="studio-btn !py-0.5 !px-2 !text-[10px] shrink-0"
                  style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.35)" }}
                  onClick={() => void handleRevokeOAuth()}
                >
                  {revokingOauth ? "Revocando…" : "Revocar OAuth"}
                </button>
              )}
            </div>
          </div>

          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between text-[11.5px] font-medium">
              <span>Direcciones activas de conexión</span>
              <span
                className="text-[10px] font-mono-code px-2 py-0.5 rounded-full"
                style={{
                  background: status?.runtime.lanActiveNow ? "rgba(52,211,153,0.16)" : "rgba(255,255,255,0.08)",
                  color: status?.runtime.lanActiveNow ? "#34d399" : "var(--text-secondary)",
                }}
              >
                Escuchando en {status?.runtime.listeningHost ?? LOOPBACK_IP}:{status?.runtime.listeningPort ?? port}
              </span>
            </div>

            {status?.runtime.restartRequiredForBind && (
              <div
                className="text-[10.5px] px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(250,204,21,0.12)", color: "#fcd34d", border: "1px solid rgba(250,204,21,0.28)" }}
              >
                El cambio entre Local / LAN o puerto está guardado en disco y se aplicará al reiniciar el servidor de Storia Studio.
              </div>
            )}

            <div className="flex flex-col gap-1.5 text-[11px] font-mono-code">
              <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-black/20">
                <span className="truncate">Local Studio: {status?.runtime.localStudioUrl ?? localFallbackUrl}</span>
                <button
                  className="studio-btn !py-0.5 !px-1.5 !text-[10px]"
                  onClick={() =>
                    status && void copyText("local_url", status.runtime.localStudioUrl, "URL local")
                  }
                >
                  {copiedKey === "local_url" ? <Check size={10} /> : <Copy size={10} />}
                </button>
              </div>
              {(status?.runtime.lanAddresses ?? []).slice(0, 3).map((lan) => (
                <div key={lan.address} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-black/20">
                  <span className="truncate">
                    LAN ({lan.interfaceName}): {lan.studioUrl} · MCP: {lan.mcpUrl}
                  </span>
                  <button
                    className="studio-btn !py-0.5 !px-1.5 !text-[10px]"
                    onClick={() => void copyText(`lan_${lan.address}`, lan.studioUrl, "URL LAN")}
                  >
                    {copiedKey === `lan_${lan.address}` ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              className="studio-btn studio-btn-accent !px-4 !py-1.5 !text-[11.5px]"
              disabled={saving}
              onClick={() => void handleSaveConfig()}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Guardar opciones de acceso
            </button>
          </div>
        </div>
      )}

      {view === "remote" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setTunnelProvider("ngrok")}
              className="rounded-xl p-3 text-left cursor-pointer transition-all"
              style={{
                background: tunnelProvider === "ngrok" ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1.5px solid ${tunnelProvider === "ngrok" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">ngrok (Dominio estático)</span>
                <span
                  className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded"
                  style={{
                    background: status?.binaries.ngrok.installed ? "rgba(52,211,153,0.16)" : "rgba(248,113,113,0.16)",
                    color: status?.binaries.ngrok.installed ? "#34d399" : "#f87171",
                  }}
                >
                  {status?.binaries.ngrok.installed ? "Instalado" : "No instalado"}
                </span>
              </div>
              <div className="text-[10px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                {status?.binaries.ngrok.version ?? "URL fija gratuita con dominio estático ngrok"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTunnelProvider("cloudflare")}
              className="rounded-xl p-3 text-left cursor-pointer transition-all"
              style={{
                background: tunnelProvider === "cloudflare" ? "var(--glass-active)" : "var(--glass-hover)",
                border: `1.5px solid ${tunnelProvider === "cloudflare" ? "var(--accent-teal)" : "var(--border-subtle)"}`,
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold">Cloudflare Tunnel</span>
                <span
                  className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded"
                  style={{
                    background: status?.binaries.cloudflared.installed ? "rgba(52,211,153,0.16)" : "rgba(248,113,113,0.16)",
                    color: status?.binaries.cloudflared.installed ? "#34d399" : "#f87171",
                  }}
                >
                  {status?.binaries.cloudflared.installed ? "Instalado" : "No instalado"}
                </span>
              </div>
              <div className="text-[10px] mt-1 truncate" style={{ color: "var(--text-muted)" }}>
                {status?.binaries.cloudflared.version ?? "Quick gratis o Named Tunnel persistente con token"}
              </div>
            </button>
          </div>

          {tunnelProvider === "ngrok" && (
            <div
              className="rounded-xl p-3 flex flex-col gap-2.5"
              style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
            >
              {status && !status.binaries.ngrok.installed && (
                <div
                  className="rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 text-[10.5px]"
                  style={{ background: "rgba(250,204,21,0.10)", border: "1px solid rgba(250,204,21,0.28)", color: "#fde68a" }}
                >
                  <span>El binario de ngrok no se encontró en el sistema. Puedes instalarlo automáticamente en Storia Studio:</span>
                  <button
                    type="button"
                    disabled={installingBin !== null}
                    onClick={() => void handleInstallBinary("ngrok")}
                    className="studio-btn studio-btn-accent !py-1 !px-2.5 !text-[10.5px] shrink-0"
                  >
                    {installingBin === "ngrok" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    {installingBin === "ngrok" ? "Instalando…" : "Instalar ngrok"}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Dominio persistente ngrok (recomendado)
                  <input
                    className="studio-input font-mono-code"
                    placeholder={NGROK_PLACEHOLDER}
                    value={ngrokDomain}
                    onChange={(e) => setNgrokDomain(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Región (opcional)
                  <select
                    className="studio-input"
                    value={ngrokRegion}
                    onChange={(e) => setNgrokRegion(e.target.value)}
                  >
                    <option value="" style={{ background: "#14161c", color: "#f3f4f6" }}>Automática</option>
                    <option value="us" style={{ background: "#14161c", color: "#f3f4f6" }}>US (Estados Unidos)</option>
                    <option value="eu" style={{ background: "#14161c", color: "#f3f4f6" }}>EU (Europa)</option>
                    <option value="sa" style={{ background: "#14161c", color: "#f3f4f6" }}>SA (Sudamérica)</option>
                    <option value="ap" style={{ background: "#14161c", color: "#f3f4f6" }}>AP (Asia-Pacífico)</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                ngrok Authtoken {status?.config.tunnel.ngrok.hasAuthtoken ? "(guardado — dejar vacío para conservar)" : "(opcional si ya ejecutaste ngrok config add-authtoken)"}
                <input
                  type="password"
                  className="studio-input font-mono-code"
                  placeholder="2xxxxxxxxxxxxxxxxxxxxxxxxxx"
                  value={ngrokAuthtoken}
                  onChange={(e) => setNgrokAuthtoken(e.target.value)}
                />
              </label>
            </div>
          )}

          {tunnelProvider === "cloudflare" && (
            <div
              className="rounded-xl p-3 flex flex-col gap-2.5"
              style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
            >
              {status && !status.binaries.cloudflared.installed && (
                <div
                  className="rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 text-[10.5px]"
                  style={{ background: "rgba(250,204,21,0.10)", border: "1px solid rgba(250,204,21,0.28)", color: "#fde68a" }}
                >
                  <span>El binario de cloudflared no se encontró en el sistema. Puedes instalarlo automáticamente:</span>
                  <button
                    type="button"
                    disabled={installingBin !== null}
                    onClick={() => void handleInstallBinary("cloudflare")}
                    className="studio-btn studio-btn-accent !py-1 !px-2.5 !text-[10.5px] shrink-0"
                  >
                    {installingBin === "cloudflare" ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    {installingBin === "cloudflare" ? "Instalando…" : "Instalar cloudflared"}
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Modo de túnel Cloudflare
                  <select
                    className="studio-input"
                    value={cfMode}
                    onChange={(e) => setCfMode(e.target.value as CloudflareTunnelMode)}
                  >
                    <option value="named_token" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      URL Persistente (Zero Trust Named Tunnel Token)
                    </option>
                    <option value="quick" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Quick Tunnel gratis (URL temporal)
                    </option>
                  </select>
                </label>

                {cfMode === "named_token" && (
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Dominio persistente Zero Trust (opcional — auto-detectado)
                    <input
                      className="studio-input font-mono-code"
                      placeholder={`${CF_PLACEHOLDER} (opcional)`}
                      value={cfHostname}
                      onChange={(e) => setCfHostname(e.target.value)}
                    />
                  </label>
                )}
              </div>

              {cfMode === "named_token" && (
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Cloudflare Tunnel Token {status?.config.tunnel.cloudflare.hasTunnelToken ? "(guardado — dejar vacío para conservar)" : "(Zero Trust > Networks > Tunnels)"}
                  <input
                    type="password"
                    className="studio-input font-mono-code"
                    placeholder="eyJhIjoi..."
                    value={cfToken}
                    onChange={(e) => setCfToken(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
            <input
              type="checkbox"
              checked={tunnelAutoStart}
              onChange={(e) => setTunnelAutoStart(e.target.checked)}
            />
            Activar túnel automáticamente al arrancar el servidor de Storia Studio
          </label>

          <div
            className="rounded-xl p-3 flex flex-col gap-2"
            style={{ background: "rgba(0,0,0,0.26)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background:
                      status?.tunnel.state === "running"
                        ? "#34d399"
                        : status?.tunnel.state === "starting"
                          ? "#fbbf24"
                          : status?.tunnel.state === "error"
                            ? "#f87171"
                            : "#6b7280",
                  }}
                />
                <span className="text-[12px] font-semibold">
                  Estado: {status?.tunnel.state === "running" ? "Túnel activo" : status?.tunnel.state === "starting" ? "Conectando…" : status?.tunnel.state === "error" ? "Error" : "Detenido"}
                </span>
                {status?.tunnel.persistent && status.tunnel.state === "running" && (
                  <span className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                    URL persistente
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  className="studio-btn !py-1 !px-2.5 !text-[11px]"
                  disabled={saving}
                  onClick={() => void handleSaveConfig()}
                >
                  Guardar
                </button>
                {tunnelRunning ? (
                  <button
                    className="studio-btn !py-1 !px-3 !text-[11px]"
                    style={{ color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}
                    disabled={tunnelBusy}
                    onClick={() => void handleStopTunnel()}
                  >
                    {tunnelBusy ? <Loader2 size={12} className="animate-spin" /> : <Square size={11} />}
                    Detener túnel
                  </button>
                ) : (
                  <button
                    className="studio-btn studio-btn-accent !py-1 !px-3 !text-[11px]"
                    disabled={tunnelBusy || tunnelProvider === "none"}
                    onClick={() => void handleStartTunnel()}
                  >
                    {tunnelBusy ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} />}
                    Activar túnel ahora
                  </button>
                )}
              </div>
            </div>

            {(status?.tunnel.publicUrl || status?.tunnel.mcpUrl) && (
              <div className="flex flex-col gap-1.5 text-[11px] font-mono-code pt-1">
                {status.tunnel.publicUrl && (
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-white/5">
                    <span className="truncate">URL Pública Studio: {status.tunnel.publicUrl}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <a
                        href={status.tunnel.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="studio-btn !py-0.5 !px-1.5 !text-[10px]"
                        title="Abrir URL pública en una nueva pestaña"
                      >
                        <ExternalLink size={10} /> Abrir
                      </a>
                      <button
                        type="button"
                        className="studio-btn !py-0.5 !px-1.5 !text-[10px]"
                        title="Copiar URL pública"
                        onClick={() =>
                          status.tunnel.publicUrl &&
                          void copyText("pub_url", status.tunnel.publicUrl, "URL pública")
                        }
                      >
                        {copiedKey === "pub_url" ? <Check size={10} /> : <Copy size={10} />}
                        Copiar
                      </button>
                    </div>
                  </div>
                )}
                {status.tunnel.mobileAccessUrl && (
                  <div className="flex flex-col gap-1 px-2 py-1.5 rounded bg-cyan-500/10 border border-cyan-400/30">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-cyan-200 font-sans text-[11px] font-semibold">
                        <Smartphone size={12} className="shrink-0" />
                        URL Segura para Móvil / Tablet (1 clic · sin ingresar token)
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          className="studio-btn studio-btn-accent !py-0.5 !px-2 !text-[10px]"
                          title="Copiar enlace directo seguro para abrir en tu celular o tablet"
                          onClick={() =>
                            status.tunnel.mobileAccessUrl &&
                            void copyText("mobile_url", status.tunnel.mobileAccessUrl, "URL segura para móvil")
                          }
                        >
                          {copiedKey === "mobile_url" ? <Check size={10} /> : <Copy size={10} />}
                          Copiar para móvil
                        </button>
                        <button
                          type="button"
                          className="studio-btn !py-0.5 !px-1.5 !text-[10px]"
                          disabled={saving}
                          title="Regenerar enlace móvil y revocar de inmediato todas las sesiones móviles activas"
                          onClick={() => void handleRotateMobileLink()}
                        >
                          <RefreshCw size={10} /> Revocar
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-cyan-100/75 truncate">
                      {status.tunnel.mobileAccessUrl.replace(/code=[^&]+/, "code=••••••••••••••••")}
                    </div>
                    <div className="font-sans text-[9.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                      Al abrirla en tu celular guarda una cookie segura <code className="font-mono-code">HttpOnly</code> (7 días) y limpia el código de la barra de direcciones. No expone tus API keys ni el panel admin.
                    </div>
                  </div>
                )}
                {status.tunnel.mcpUrl && (
                  <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/25">
                    <span className="truncate text-emerald-300">URL MCP para IA: {status.tunnel.mcpUrl}</span>
                    <button
                      type="button"
                      className="studio-btn !py-0.5 !px-1.5 !text-[10px] shrink-0"
                      title="Copiar URL MCP"
                      onClick={() =>
                        status.tunnel.mcpUrl &&
                        void copyText("mcp_url", status.tunnel.mcpUrl, "URL MCP")
                      }
                    >
                      {copiedKey === "mcp_url" ? <Check size={10} /> : <Copy size={10} />}
                      Copiar
                    </button>
                  </div>
                )}
              </div>
            )}

            {status?.tunnel.state === "running" && !status.tunnel.publicUrl && status.tunnel.provider === "cloudflare" && (
              <div
                className="text-[10.5px] px-2.5 py-1.5 rounded-lg"
                style={{ background: "rgba(250,204,21,0.10)", color: "#fcd34d", border: "1px solid rgba(250,204,21,0.25)" }}
              >
                Túnel Cloudflare conectado. Si aún no aparece la URL, verifica que tu túnel tenga un <strong>Public Hostname</strong> configurado en Cloudflare Zero Trust → Networks → Tunnels (o escríbelo arriba).
              </div>
            )}

            {status?.tunnel.error && (
              <div className="text-[10.5px] font-mono-code text-rose-300 bg-rose-500/10 px-2.5 py-1.5 rounded">
                {status.tunnel.error}
              </div>
            )}

            {(status?.tunnel.recentLogs.length ?? 0) > 0 && (
              <details className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                <summary className="cursor-pointer select-none">Ver últimos logs del túnel ({status!.tunnel.recentLogs.length})</summary>
                <pre className="mt-1.5 p-2 rounded bg-black/40 max-h-24 overflow-y-auto whitespace-pre-wrap">
                  {status!.tunnel.recentLogs.slice(-12).join("\n")}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}

      {view === "mcp" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              IA / Harness de destino
              <select
                className="studio-input"
                value={harness}
                onChange={(e) => setHarness(e.target.value as AiHarnessId)}
              >
                {HARNESS_OPTIONS.map((h) => (
                  <option key={h.id} value={h.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                    {h.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Modo de conexión a inyectar
              <select
                className="studio-input"
                value={transportMode}
                onChange={(e) => setTransportMode(e.target.value as AiTransportMode)}
              >
                {TRANSPORT_OPTIONS.map((m) => (
                  <option key={m.id} value={m.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-mono-code truncate" style={{ color: "var(--accent-teal)" }}>
              {loadingBundle ? "Generando prompt…" : bundle ? `Endpoint: ${bundle.mcpUrl}` : ""}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                className="studio-btn !py-1.5 !px-2.5 !text-[11px]"
                disabled={!bundle}
                onClick={() =>
                  bundle && void copyText("snippet", bundle.configSnippet, `Config (${bundle.configFilename})`)
                }
              >
                {copiedKey === "snippet" ? <Check size={12} /> : <Terminal size={12} />}
                Copiar {bundle?.configFormat.toUpperCase() ?? "Config"}
              </button>
              <button
                className="studio-btn studio-btn-accent !py-1.5 !px-3 !text-[11px]"
                disabled={!bundle}
                onClick={() =>
                  bundle &&
                  void copyText("prompt", bundle.structuredPrompt, `Prompt estructurado (${bundle.harnessLabel})`)
                }
              >
                {copiedKey === "prompt" ? <Check size={12} /> : <Copy size={12} />}
                Copiar Prompt completo para IA
              </button>
            </div>
          </div>

          {bundle && (
            <div
              className="rounded-xl p-2.5 flex flex-col gap-1"
              style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="text-[10px] font-mono-code flex items-center justify-between" style={{ color: "var(--text-muted)" }}>
                <span>Configuración exacta ({bundle.configFilename})</span>
                <span>{bundle.authRequired ? "Bearer Auth activo" : "Sin Auth"}</span>
              </div>
              <pre className="text-[10.5px] font-mono-code overflow-x-auto max-h-28 overflow-y-auto select-all text-sky-200">
                {bundle.configSnippet}
              </pre>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
              Prompt estructurado listo para pegar en {bundle?.harnessLabel ?? "tu IA"}:
            </div>
            <textarea
              readOnly
              rows={9}
              className="studio-input font-mono-code text-[10.5px] leading-relaxed resize-y"
              value={bundle?.structuredPrompt ?? "Generando prompt de integración…"}
            />
          </div>
        </div>
      )}
    </div>
  );
};
