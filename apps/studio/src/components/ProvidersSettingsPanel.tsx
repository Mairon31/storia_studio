import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  studioApi,
  TtsProviderId,
  TtsProviderStatus,
  TtsPublicConfig,
  TtsVoiceInfo,
} from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

const ELEVENLABS_MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (Calidad)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (Rápido / Económico)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5" },
  { id: "eleven_v3", label: "Eleven v3 (Expresivo)" },
];

export interface ProvidersSettingsPanelProps {
  /** Split view: 'apis' for API keys & endpoints, 'local_installs' for offline Piper/Kokoro model installer. */
  mode?: "apis" | "local_installs";
}

export const ProvidersSettingsPanel: React.FC<ProvidersSettingsPanelProps> = ({ mode = "apis" }) => {
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [providers, setProviders] = useState<TtsProviderStatus[]>([]);
  const [config, setConfig] = useState<TtsPublicConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable provider credentials & endpoints
  const [elKey, setElKey] = useState("");
  const [elModel, setElModel] = useState("eleven_multilingual_v2");
  const [oaiKey, setOaiKey] = useState("");
  const [oaiBaseUrl, setOaiBaseUrl] = useState("");
  const [oaiModel, setOaiModel] = useState("gpt-4o-mini-tts");
  const [vsUrl, setVsUrl] = useState("");
  const [vsKey, setVsKey] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customHeader, setCustomHeader] = useState("Authorization");
  const [customKey, setCustomKey] = useState("");
  const [customTemplate, setCustomTemplate] = useState("");

  // Local installable models (Piper ONNX & Kokoro-82M)
  const [installProvider, setInstallProvider] = useState<"piper" | "kokoro">("piper");
  const [localModels, setLocalModels] = useState<TtsVoiceInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [localAdminAllowed, setLocalAdminAllowed] = useState(true);
  const [adminBlockReason, setAdminBlockReason] = useState<string | null>(null);

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setBusyNotice(msg);
    window.setTimeout(() => setBusyNotice(null), 2800);
  };

  const loadProviders = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const res = await studioApi.getTtsProviders(refresh);
      setProviders(res.providers);
      setConfig(res.config);
      setLocalAdminAllowed(res.security?.localAdminAllowed ?? true);
      setAdminBlockReason(res.security?.reason ?? null);
      setElModel(res.config.elevenlabsModel);
      setOaiBaseUrl(res.config.openaiBaseUrl);
      setOaiModel(res.config.openaiModel);
      setVsUrl(res.config.voiceStudioUrl);
      setCustomUrl(res.config.customApiUrl);
      setCustomHeader(res.config.customApiHeaderName);
      setCustomTemplate(res.config.customApiBodyTemplate);
    } catch (err) {
      flash(`Error cargando proveedores: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLocalModels = useCallback(async (prov: "piper" | "kokoro", refresh = false) => {
    setLoadingModels(true);
    try {
      const res = await studioApi.listTtsVoices(prov as TtsProviderId, refresh);
      setLocalModels(res.voices);
    } catch (err) {
      flash(`Error listando modelos ${prov}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingModels(false);
    }
  }, []);

  useEffect(() => {
    void loadProviders(false);
  }, [loadProviders]);

  useEffect(() => {
    if (mode === "local_installs") {
      void loadLocalModels(installProvider, false);
    }
  }, [mode, installProvider, loadLocalModels]);

  const handleSaveProviders = async () => {
    setSaving(true);
    try {
      const patch: Record<string, string | undefined> = {
        elevenlabsModel: elModel,
        openaiBaseUrl: oaiBaseUrl.trim(),
        openaiModel: oaiModel.trim(),
        voiceStudioUrl: vsUrl.trim(),
        customApiUrl: customUrl.trim(),
        customApiHeaderName: customHeader.trim(),
        customApiBodyTemplate: customTemplate.trim(),
      };
      if (elKey.trim()) patch.elevenlabsApiKey = elKey.trim();
      if (oaiKey.trim()) patch.openaiApiKey = oaiKey.trim();
      if (vsKey.trim()) patch.voiceStudioApiKey = vsKey.trim();
      if (customKey.trim()) patch.customApiKey = customKey.trim();

      const res = await studioApi.updateTtsConfig(patch);
      setConfig(res.config);
      setElKey("");
      setOaiKey("");
      setVsKey("");
      setCustomKey("");
      await loadProviders(true);
      flash("Credenciales y parámetros de proveedores guardados correctamente.");
    } catch (err) {
      flash(`Error guardando proveedores: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleInstallModel = async (modelId: string) => {
    setInstallingId(modelId);
    try {
      const res = await studioApi.installTtsModel(installProvider, modelId);
      flash(`Modelo ${res.modelId} instalado (${(res.totalBytes / (1024 * 1024)).toFixed(1)} MB).`);
      await Promise.all([loadLocalModels(installProvider, true), loadProviders(true)]);
    } catch (err) {
      flash(`Error instalando modelo: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold mb-0.5 flex items-center gap-1.5">
            {mode === "apis" ? (
              <>
                <KeyRound size={14} style={{ color: "var(--accent-primary)" }} />
                APIs y Credenciales de Proveedores
              </>
            ) : (
              <>
                <Download size={14} style={{ color: "var(--accent-primary)" }} />
                Instalador de Modelos Locales (Piper ONNX / Kokoro-82M)
              </>
            )}
          </h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {mode === "apis"
              ? "Configura claves API y endpoints para ElevenLabs, OpenAI / Compatible, VoiceStudio y API HTTP personalizada."
              : "Descarga y gestiona voces neuronales 100% offline directamente en la carpeta local de modelos."}
          </p>
        </div>
        <button
          className="studio-btn !p-1.5 shrink-0"
          onClick={() => void loadProviders(true)}
          title="Actualizar estado de proveedores"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Security Vault Status Banner */}
      {mode === "apis" && (
        <div
          className="rounded-xl px-3 py-2 text-[10.5px] flex items-start gap-2"
          style={{
            background: localAdminAllowed ? "rgba(16,185,129,0.09)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${localAdminAllowed ? "rgba(16,185,129,0.28)" : "rgba(239,68,68,0.38)"}`,
            color: localAdminAllowed ? "#a7f3d0" : "#fecaca",
          }}
        >
          {localAdminAllowed ? (
            <ShieldCheck size={14} className="shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert size={14} className="shrink-0 mt-0.5" />
          )}
          <div>
            {localAdminAllowed ? (
              <>
                <strong>Bóveda AES-256-GCM activa:</strong> las API Keys se cifran en disco con clave fuera del workspace y jamás se exponen ni son modificables desde MCP, agentes de IA, red local (LAN) o túneles remotos.
              </>
            ) : (
              <>
                <strong>Modo solo lectura (dispositivo remoto / LAN):</strong>{" "}
                {adminBlockReason ?? "Por seguridad, las API Keys solo se pueden gestionar desde localhost en el equipo principal."}
              </>
            )}
          </div>
        </div>
      )}

      {/* Live Provider Status Chips */}
      <div className="flex flex-wrap gap-1.5">
        {providers.map((p) => (
          <div
            key={p.id}
            className="px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1.5"
            style={{
              background: "var(--glass-hover)",
              border: `1px solid ${p.available ? "rgba(52,211,153,0.35)" : "var(--border-subtle)"}`,
            }}
            title={p.detail ?? p.name}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: p.available ? "#34d399" : "#f59e0b" }}
            />
            <span>{p.name}</span>
          </div>
        ))}
      </div>

      {statusMsg && (
        <div
          className="text-[10.5px] px-2.5 py-1.5 rounded-lg"
          style={{ background: "rgba(52,211,153,0.12)", color: "#6ee7b7", border: "1px solid rgba(52,211,153,0.28)" }}
        >
          {statusMsg}
        </div>
      )}

      {/* VIEW 1: API KEYS & ENDPOINTS */}
      {mode === "apis" && (
        <div className="flex flex-col gap-2.5">
          {/* ElevenLabs */}
          <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold flex items-center gap-1.5">
                <Cloud size={12} style={{ color: "var(--accent-primary)" }} /> ElevenLabs TTS
              </span>
              <span className="text-[9.5px] font-mono-code" style={{ color: config?.hasElevenlabsKey ? "#34d399" : "var(--text-muted)" }}>
                {config?.hasElevenlabsKey ? "API Key configurada" : "Sin clave"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                ElevenLabs API Key
                <input
                  type="password"
                  className="studio-input font-mono-code"
                  placeholder={config?.hasElevenlabsKey ? "•••••••• (dejar vacío para conservar)" : "sk_..."}
                  value={elKey}
                  onChange={(e) => setElKey(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                Modelo por defecto
                <select className="studio-input" value={elModel} onChange={(e) => setElModel(e.target.value)}>
                  {ELEVENLABS_MODELS.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* OpenAI / OpenAI-Compatible */}
          <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-semibold">OpenAI TTS / Compatible (LM Studio, Kokoro-FastAPI, etc.)</span>
              <span className="text-[9.5px] font-mono-code" style={{ color: config?.hasOpenaiKey ? "#34d399" : "var(--text-muted)" }}>
                {config?.hasOpenaiKey ? "API Key configurada" : "Sin clave"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                API Key
                <input
                  type="password"
                  className="studio-input font-mono-code"
                  placeholder={config?.hasOpenaiKey ? "••••••••" : "sk-..."}
                  value={oaiKey}
                  onChange={(e) => setOaiKey(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                Base URL
                <input
                  className="studio-input font-mono-code"
                  placeholder="Endpoint /v1"
                  value={oaiBaseUrl}
                  onChange={(e) => setOaiBaseUrl(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
                Modelo
                <input
                  className="studio-input font-mono-code"
                  placeholder="gpt-4o-mini-tts"
                  value={oaiModel}
                  onChange={(e) => setOaiModel(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* VoiceStudio + Custom HTTP API */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl p-2.5 flex flex-col gap-1.5" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px] font-semibold flex items-center gap-1.5">
                <Server size={11} style={{ color: "var(--accent-teal)" }} /> VoiceStudio Local
              </div>
              <input
                className="studio-input font-mono-code"
                placeholder="URL servidor VoiceStudio"
                value={vsUrl}
                onChange={(e) => setVsUrl(e.target.value)}
              />
              <input
                type="password"
                className="studio-input font-mono-code"
                placeholder={config?.hasVoiceStudioKey ? "API Key guardada" : "API Key (opcional)"}
                value={vsKey}
                onChange={(e) => setVsKey(e.target.value)}
              />
            </div>

            <div className="rounded-xl p-2.5 flex flex-col gap-1.5" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[11px] font-semibold">API HTTP Personalizada</div>
              <input
                className="studio-input font-mono-code"
                placeholder="URL POST de síntesis"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  className="studio-input font-mono-code"
                  placeholder="Cabecera Auth"
                  value={customHeader}
                  onChange={(e) => setCustomHeader(e.target.value)}
                />
                <input
                  type="password"
                  className="studio-input font-mono-code"
                  placeholder={config?.hasCustomApiKey ? "Guardada" : "Token / Key"}
                  value={customKey}
                  onChange={(e) => setCustomKey(e.target.value)}
                />
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-secondary)" }}>
            Plantilla JSON para API Personalizada (variables: {"{{text}}"}, {"{{voiceId}}"}, {"{{speed}}"}, {"{{language}}"})
            <input
              className="studio-input font-mono-code"
              value={customTemplate}
              onChange={(e) => setCustomTemplate(e.target.value)}
            />
          </label>

          <div className="flex justify-end">
            <button
              className="studio-btn studio-btn-accent !px-4 !py-1.5 !text-[11.5px]"
              disabled={saving || !localAdminAllowed}
              onClick={() => void handleSaveProviders()}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {localAdminAllowed ? "Guardar proveedores y claves API" : "Solo editable en equipo local"}
            </button>
          </div>
        </div>
      )}

      {/* VIEW 2: LOCAL MODEL INSTALLER (PIPER ONNX & KOKORO-82M) */}
      {mode === "local_installs" && (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setInstallProvider("piper")}
                className={`studio-btn !py-1 !px-3 !text-[11px] ${installProvider === "piper" ? "studio-btn-accent" : ""}`}
              >
                Piper ONNX (Offline Rápido)
              </button>
              <button
                onClick={() => setInstallProvider("kokoro")}
                className={`studio-btn !py-1 !px-3 !text-[11px] ${installProvider === "kokoro" ? "studio-btn-accent" : ""}`}
              >
                Kokoro-82M (Calidad Neural)
              </button>
            </div>
            <button
              className="studio-btn !py-1 !px-2 !text-[10.5px]"
              onClick={() => void loadLocalModels(installProvider, true)}
            >
              <RefreshCw size={11} className={loadingModels ? "animate-spin" : ""} /> Actualizar
            </button>
          </div>

          <div className="flex flex-col gap-1.5 max-h-[260px] overflow-y-auto pr-0.5">
            {loadingModels && localModels.length === 0 && (
              <div className="text-[11px] py-4 text-center" style={{ color: "var(--text-muted)" }}>
                Consultando catálogo de modelos locales…
              </div>
            )}
            {localModels.map((m) => (
              <div
                key={m.id}
                className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="min-w-0">
                  <div className="text-[11.5px] font-medium truncate">
                    {m.name} <span className="text-[10px] font-mono-code opacity-70">({m.language})</span>
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                    {m.description ?? m.id} {m.sizeLabel ? `· ${m.sizeLabel}` : ""}
                  </div>
                </div>
                {m.installed ? (
                  <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 shrink-0">
                    Instalado
                  </span>
                ) : m.downloadable ? (
                  <button
                    className="studio-btn studio-btn-accent !py-1 !px-2.5 !text-[10.5px] shrink-0"
                    disabled={installingId !== null}
                    onClick={() => void handleInstallModel(m.id)}
                  >
                    {installingId === m.id ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Download size={11} />
                    )}
                    Instalar
                  </button>
                ) : (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Sistema</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
