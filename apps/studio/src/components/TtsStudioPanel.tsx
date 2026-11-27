import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Captions,
  Check,
  Download,
  FileText,
  Layers,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  studioApi,
  TtsProviderId,
  TtsProviderStatus,
  TtsPublicConfig,
  TtsVoiceInfo,
} from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";

const PROVIDER_TABS: { id: TtsProviderId; short: string }[] = [
  { id: "windows_sapi", short: "Windows" },
  { id: "elevenlabs", short: "ElevenLabs" },
  { id: "voicestudio", short: "VoiceStudio" },
  { id: "piper", short: "Piper" },
  { id: "kokoro", short: "Kokoro" },
  { id: "openai", short: "OpenAI" },
  { id: "custom_api", short: "API HTTP" },
];

const ELEVENLABS_MODELS = [
  { id: "eleven_multilingual_v2", label: "Multilingual v2 (Calidad)" },
  { id: "eleven_flash_v2_5", label: "Flash v2.5 (Rápido / Bajo costo)" },
  { id: "eleven_turbo_v2_5", label: "Turbo v2.5" },
  { id: "eleven_v3", label: "Eleven v3 (Expresivo)" },
];

export interface TtsStudioPanelProps {
  /** When set, synthesizes and replaces this exact audio clip in-place. */
  replaceAudioTarget?: {
    trackId: string;
    clipId: string;
    preserveDuration: boolean;
    onDone?: () => void;
  };
}

export const TtsStudioPanel: React.FC<TtsStudioPanelProps> = ({ replaceAudioTarget }) => {
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const selectedSubtitleCueId = useStudioStore((s) => s.selectedSubtitleCueId);
  const ttsSourceMode = useStudioStore((s) => s.ttsSourceMode);
  const setTtsSourceMode = useStudioStore((s) => s.setTtsSourceMode);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [provider, setProvider] = useState<TtsProviderId>("windows_sapi");
  const [providers, setProviders] = useState<TtsProviderStatus[]>([]);
  const [config, setConfig] = useState<TtsPublicConfig | null>(null);
  const [voices, setVoices] = useState<TtsVoiceInfo[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [customVoiceInput, setCustomVoiceInput] = useState("default");

  const [text, setText] = useState(
    "Imagina que puedes viajar al pasado y cambiar una sola decisión de tu vida.",
  );
  const [clipName, setClipName] = useState("");
  const [language, setLanguage] = useState("es");
  const [speed, setSpeed] = useState(1.0);
  const [autoSubtitles, setAutoSubtitles] = useState(false);

  // Subtitles -> TTS mode state
  const [subTtsMode, setSubTtsMode] = useState<"grouped" | "individual">("grouped");
  const [subTtsScope, setSubTtsScope] = useState<"all" | "selected">("all");
  const [replaceVoiceClips, setReplaceVoiceClips] = useState(true);
  const [syncSubTimings, setSyncSubTimings] = useState(true);
  const [subGapSec, setSubGapSec] = useState(0.06);

  // ElevenLabs fine tuning
  const [elModel, setElModel] = useState("eleven_multilingual_v2");
  const [elStability, setElStability] = useState(0.5);
  const [elSimilarity, setElSimilarity] = useState(0.78);
  const [elStyle, setElStyle] = useState(0.15);

  // Settings drawer form state
  const [showSettings, setShowSettings] = useState(false);
  const [elKeyInput, setElKeyInput] = useState("");
  const [oaiKeyInput, setOaiKeyInput] = useState("");
  const [oaiBaseInput, setOaiBaseInput] = useState("");
  const [oaiModelInput, setOaiModelInput] = useState("gpt-4o-mini-tts");
  const [vsUrlInput, setVsUrlInput] = useState("");
  const [vsKeyInput, setVsKeyInput] = useState("");
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [customHeaderInput, setCustomHeaderInput] = useState("Authorization");
  const [customKeyInput, setCustomKeyInput] = useState("");
  const [customTemplateInput, setCustomTemplateInput] = useState("");

  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [installingModelId, setInstallingModelId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [savingCfg, setSavingCfg] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
    };
  }, []);

  const loadOverview = useCallback(async (refresh = false) => {
    setLoadingProviders(true);
    try {
      const res = await studioApi.getTtsProviders(refresh);
      setProviders(res.providers);
      setConfig(res.config);
      setElModel(res.config.elevenlabsModel);
      setOaiBaseInput(res.config.openaiBaseUrl);
      setOaiModelInput(res.config.openaiModel);
      setVsUrlInput(res.config.voiceStudioUrl);
      setCustomUrlInput(res.config.customApiUrl);
      setCustomHeaderInput(res.config.customApiHeaderName);
      setCustomTemplateInput(res.config.customApiBodyTemplate);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingProviders(false);
    }
  }, []);

  const loadVoices = useCallback(async (prov: TtsProviderId, refresh = false) => {
    setLoadingVoices(true);
    setWarning(null);
    try {
      const res = await studioApi.listTtsVoices(prov, refresh);
      setVoices(res.voices);
      if (res.warning) setWarning(res.warning);
      if (res.voices.length > 0) {
        const preferInstalled = res.voices.find((v) => v.installed && v.language.toLowerCase().startsWith("es"));
        const preferEs = res.voices.find((v) => v.language.toLowerCase().startsWith("es"));
        const firstInstalled = res.voices.find((v) => v.installed);
        const pick = preferInstalled ?? preferEs ?? firstInstalled ?? res.voices[0]!;
        setVoiceId(pick.id);
      } else {
        setVoiceId("");
      }
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview(false);
  }, [loadOverview]);

  useEffect(() => {
    void loadVoices(provider, false);
  }, [provider, loadVoices]);

  const currentStatus = providers.find((p) => p.id === provider);
  const sortedSubtitleCues = useMemo(
    () => [...project.subtitles.cues].filter((c) => c.text.trim().length > 0).sort((a, b) => a.start - b.start),
    [project.subtitles.cues],
  );
  const selectedSubtitleCue = useMemo(
    () => sortedSubtitleCues.find((c) => c.id === selectedSubtitleCueId) ?? null,
    [sortedSubtitleCues, selectedSubtitleCueId],
  );
  const effectiveSourceMode: "text" | "subtitles" = replaceAudioTarget ? "text" : ttsSourceMode;
  const targetSubtitleCues = useMemo(() => {
    if (subTtsScope === "selected" && selectedSubtitleCue) return [selectedSubtitleCue];
    return sortedSubtitleCues;
  }, [subTtsScope, selectedSubtitleCue, sortedSubtitleCues]);
  const subtitlesCombinedText = useMemo(
    () => targetSubtitleCues.map((c) => c.text.trim()).join(" ").replace(/\s+/g, " ").trim(),
    [targetSubtitleCues],
  );

  const activeTextForMetrics = effectiveSourceMode === "subtitles" ? subtitlesCombinedText : text;
  const wordCount = activeTextForMetrics.trim() ? activeTextForMetrics.trim().split(/\s+/).length : 0;
  const estSec = Math.max(0.5, wordCount / (2.5 * speed));

  const handleSaveConfig = async () => {
    setSavingCfg(true);
    setWarning(null);
    setOkMsg(null);
    try {
      const patch: Record<string, string | undefined> = {
        elevenlabsModel: elModel,
        openaiBaseUrl: oaiBaseInput,
        openaiModel: oaiModelInput,
        voiceStudioUrl: vsUrlInput,
        customApiUrl: customUrlInput,
        customApiHeaderName: customHeaderInput,
        customApiBodyTemplate: customTemplateInput,
      };
      if (elKeyInput.trim()) patch.elevenlabsApiKey = elKeyInput.trim();
      if (oaiKeyInput.trim()) patch.openaiApiKey = oaiKeyInput.trim();
      if (vsKeyInput.trim()) patch.voiceStudioApiKey = vsKeyInput.trim();
      if (customKeyInput.trim()) patch.customApiKey = customKeyInput.trim();

      const res = await studioApi.updateTtsConfig(patch);
      setConfig(res.config);
      setElKeyInput("");
      setOaiKeyInput("");
      setVsKeyInput("");
      setCustomKeyInput("");
      setOkMsg("Configuración TTS guardada en local.");
      await loadOverview(true);
      await loadVoices(provider, true);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingCfg(false);
    }
  };

  const handleInstallModel = async (prov: "piper" | "kokoro", modelId: string) => {
    setInstallingModelId(modelId);
    setWarning(null);
    setOkMsg(null);
    setBusyNotice(`Descargando modelo ${modelId} (${prov})… puede tardar unos segundos`);
    try {
      const res = await studioApi.installTtsModel(prov, modelId);
      const mb = (res.totalBytes / (1024 * 1024)).toFixed(1);
      setOkMsg(`Modelo ${res.modelId} instalado (${mb} MB).`);
      await loadOverview(true);
      await loadVoices(prov, true);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setInstallingModelId(null);
      setBusyNotice(null);
    }
  };

  const handlePreview = async () => {
    if (playingPreview) {
      previewAudioRef.current?.pause();
      setPlayingPreview(false);
      return;
    }
    const sampleText =
      effectiveSourceMode === "subtitles"
        ? (targetSubtitleCues[0]?.text ?? "").trim()
        : text.trim();
    if (!sampleText) return;
    setPreviewing(true);
    setWarning(null);
    try {
      const blob = await studioApi.previewTtsAudio({
        provider,
        text: sampleText.slice(0, 220),
        voiceId: provider === "custom_api" ? customVoiceInput : voiceId || undefined,
        language,
        speed,
        modelId: provider === "elevenlabs" ? elModel : provider === "openai" ? oaiModelInput : undefined,
        stability: provider === "elevenlabs" ? elStability : undefined,
        similarityBoost: provider === "elevenlabs" ? elSimilarity : undefined,
        style: provider === "elevenlabs" ? elStyle : undefined,
        voiceStudioUrl: provider === "voicestudio" ? vsUrlInput : undefined,
        customApiUrl: provider === "custom_api" ? customUrlInput : undefined,
      });
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
      const url = URL.createObjectURL(blob);
      previewBlobUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      setPlayingPreview(true);
      audio.onended = () => setPlayingPreview(false);
      audio.onerror = () => setPlayingPreview(false);
      await audio.play();
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewing(false);
    }
  };

  const handleGenerate = async () => {
    if (effectiveSourceMode === "subtitles") {
      if (targetSubtitleCues.length === 0) return;
      setGenerating(true);
      setWarning(null);
      setOkMsg(null);
      const effectiveMode = subTtsScope === "selected" ? "individual" : subTtsMode;
      setBusyNotice(
        effectiveMode === "grouped"
          ? `Generando narración agrupada (${targetSubtitleCues.length} subtítulos) con ${provider}…`
          : `Generando ${targetSubtitleCues.length} clips TTS individuales con ${provider}…`,
      );
      try {
        const res = await studioApi.generateProjectTtsFromSubtitles(project.id, {
          provider,
          mode: effectiveMode,
          cueIds: subTtsScope === "selected" && selectedSubtitleCue ? [selectedSubtitleCue.id] : undefined,
          voiceId: provider === "custom_api" ? customVoiceInput : voiceId || undefined,
          language,
          speed,
          modelId: provider === "elevenlabs" ? elModel : provider === "openai" ? oaiModelInput : undefined,
          stability: provider === "elevenlabs" ? elStability : undefined,
          similarityBoost: provider === "elevenlabs" ? elSimilarity : undefined,
          style: provider === "elevenlabs" ? elStyle : undefined,
          voiceStudioUrl: provider === "voicestudio" ? vsUrlInput : undefined,
          customApiUrl: provider === "custom_api" ? customUrlInput : undefined,
          clipName: clipName.trim() || undefined,
          replaceExistingVoiceClips: subTtsScope === "selected" ? false : replaceVoiceClips,
          syncSubtitleTimings: effectiveMode === "individual" ? syncSubTimings : false,
          autoSubtitles: effectiveMode === "grouped" ? autoSubtitles : false,
          minGapSec: subGapSec,
        });
        setProjectFromRemote(res.project, res.receipt);
        for (const asset of res.assets) {
          void audioEngine.loadAssetAudio(asset);
        }
        const msg =
          res.mode === "grouped"
            ? `${res.providerLabel} · 1 pieza agrupada (${res.totalDurationSec.toFixed(1)}s · ${res.cuesProcessed} subs)`
            : `${res.providerLabel} · ${res.clipsCreated} clips individuales (${res.totalDurationSec.toFixed(1)}s)${
                res.cuesUpdated > 0 ? " · tiempos sincronizados" : ""
              }`;
        setOkMsg(msg);
        if (res.subtitleWarning) setWarning(res.subtitleWarning);
        setBusyNotice(msg);
        window.setTimeout(() => setBusyNotice(null), 3500);
      } catch (err) {
        setWarning(err instanceof Error ? err.message : String(err));
        setBusyNotice(null);
      } finally {
        setGenerating(false);
      }
      return;
    }

    if (!text.trim()) return;
    setGenerating(true);
    setWarning(null);
    setOkMsg(null);
    setBusyNotice(
      autoSubtitles
        ? `Sintetizando voz (${provider}) + generando subtítulos Whisper…`
        : `Sintetizando voz con ${provider}…`,
    );
    try {
      const res = await studioApi.generateProjectTts(project.id, {
        provider,
        text: text.trim(),
        voiceId: provider === "custom_api" ? customVoiceInput : voiceId || undefined,
        language,
        speed,
        modelId: provider === "elevenlabs" ? elModel : provider === "openai" ? oaiModelInput : undefined,
        stability: provider === "elevenlabs" ? elStability : undefined,
        similarityBoost: provider === "elevenlabs" ? elSimilarity : undefined,
        style: provider === "elevenlabs" ? elStyle : undefined,
        voiceStudioUrl: provider === "voicestudio" ? vsUrlInput : undefined,
        customApiUrl: provider === "custom_api" ? customUrlInput : undefined,
        clipName: clipName.trim() || `Voz ${provider}`,
        insertToTimeline: true,
        startSec: Number(currentTime.toFixed(2)),
        replaceTrackId: replaceAudioTarget?.trackId,
        replaceClipId: replaceAudioTarget?.clipId,
        preserveClipDuration: replaceAudioTarget?.preserveDuration,
        autoSubtitles,
      });
      setProjectFromRemote(res.project, res.receipt);
      void audioEngine.loadAssetAudio(res.asset);
      const msg = `${res.providerLabel} · ${res.durationSec.toFixed(1)}s${
        res.cuesCount > 0 ? ` + ${res.cuesCount} subtítulos` : ""
      }`;
      setOkMsg(msg);
      if (res.subtitleWarning) setWarning(res.subtitleWarning);
      setBusyNotice(msg);
      window.setTimeout(() => setBusyNotice(null), 3000);
      if (autoSubtitles && res.cuesCount > 0 && !replaceAudioTarget) {
        setActiveLeftTab("subtitles");
      }
      replaceAudioTarget?.onDone?.();
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
      setBusyNotice(null);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <AudioLines size={12} /> Texto a Voz (TTS)
          </div>
          <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
            7 proveedores · Local + Cloud + API
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className={`studio-btn !p-1 ${showSettings ? "studio-btn-active" : ""}`}
            title="Configurar API keys y servidores"
            onClick={() => setShowSettings((v) => !v)}
          >
            <Settings size={12} />
          </button>
          <button
            className="studio-btn !p-1"
            title="Refrescar estado y voces"
            onClick={() => {
              void loadOverview(true);
              void loadVoices(provider, true);
            }}
          >
            <RefreshCw size={12} className={loadingProviders || loadingVoices ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Provider selector pills */}
      <div className="flex flex-wrap gap-1">
        {PROVIDER_TABS.map((tab) => {
          const st = providers.find((p) => p.id === tab.id);
          const active = provider === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setProvider(tab.id);
                setWarning(null);
                setOkMsg(null);
              }}
              className="px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer flex items-center gap-1 transition-colors"
              style={{
                background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: st?.ready ? "#22c55e" : "#f59e0b",
                }}
              />
              {tab.short}
            </button>
          );
        })}
      </div>

      {/* Current Provider Status Strip */}
      {currentStatus && (
        <div
          className="rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 text-[10px]"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="min-w-0">
            <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {currentStatus.name}
            </div>
            <div className="truncate" style={{ color: "var(--text-muted)" }} title={currentStatus.detail}>
              {currentStatus.detail}
            </div>
          </div>
          {!currentStatus.ready &&
            (provider === "elevenlabs" || provider === "voicestudio" || provider === "openai" || provider === "custom_api") && (
              <button
                className="studio-btn !py-1 !px-2 !text-[10px] shrink-0"
                style={{ borderColor: "var(--border-strong)" }}
                onClick={() => setShowSettings(true)}
              >
                Configurar
              </button>
            )}
        </div>
      )}

      {/* Provider Settings Drawer */}
      {showSettings && config && (
        <div
          className="rounded-xl p-2.5 flex flex-col gap-2"
          style={{ background: "var(--glass-surface-elevated)", border: "1px solid var(--border-strong)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
            Conexión · {currentStatus?.name ?? provider}
          </div>

          {provider === "elevenlabs" && (
            <>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                API Key {config.hasElevenlabsKey ? "(Guardada ✓ — ingresa otra para cambiar)" : ""}
                <input
                  type="password"
                  className="studio-input"
                  placeholder="sk_..."
                  value={elKeyInput}
                  onChange={(e) => setElKeyInput(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Modelo
                <select className="studio-input" value={elModel} onChange={(e) => setElModel(e.target.value)}>
                  {ELEVENLABS_MODELS.map((m) => (
                    <option key={m.id} value={m.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {provider === "voicestudio" && (
            <>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                URL local de VoiceStudio (debpalash/VoiceStudio)
                <input
                  className="studio-input font-mono-code"
                  placeholder="host:puerto de VoiceStudio"
                  value={vsUrlInput}
                  onChange={(e) => setVsUrlInput(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Token opcional {config.hasVoiceStudioKey ? "(Guardado ✓)" : ""}
                <input
                  type="password"
                  className="studio-input"
                  placeholder="Opcional"
                  value={vsKeyInput}
                  onChange={(e) => setVsKeyInput(e.target.value)}
                />
              </label>
            </>
          )}

          {provider === "openai" && (
            <>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                API Key {config.hasOpenaiKey ? "(Guardada ✓)" : ""}
                <input
                  type="password"
                  className="studio-input"
                  placeholder="sk-..."
                  value={oaiKeyInput}
                  onChange={(e) => setOaiKeyInput(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Base URL (OpenAI o servidor compatible)
                <input
                  className="studio-input font-mono-code"
                  value={oaiBaseInput}
                  onChange={(e) => setOaiBaseInput(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Modelo
                <input
                  className="studio-input font-mono-code"
                  value={oaiModelInput}
                  onChange={(e) => setOaiModelInput(e.target.value)}
                />
              </label>
            </>
          )}

          {provider === "custom_api" && (
            <>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Endpoint POST URL
                <input
                  className="studio-input font-mono-code"
                  placeholder="URL completa del endpoint TTS"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Header auth
                  <input
                    className="studio-input font-mono-code"
                    value={customHeaderInput}
                    onChange={(e) => setCustomHeaderInput(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Clave {config.hasCustomApiKey ? "(✓)" : ""}
                  <input
                    type="password"
                    className="studio-input"
                    placeholder="Token / API Key"
                    value={customKeyInput}
                    onChange={(e) => setCustomKeyInput(e.target.value)}
                  />
                </label>
              </div>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Plantilla JSON (variables: {"{{text}}"}, {"{{voice}}"}, {"{{speed}}"}, {"{{language}}"})
                <textarea
                  rows={2}
                  className="studio-input font-mono-code resize-none"
                  value={customTemplateInput}
                  onChange={(e) => setCustomTemplateInput(e.target.value)}
                />
              </label>
            </>
          )}

          {(provider === "windows_sapi" || provider === "piper" || provider === "kokoro") && (
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              Este proveedor corre 100% en tu PC sin API key.
              {currentStatus?.pipInstallHint && !currentStatus.pythonPackageInstalled && (
                <div className="mt-1 font-mono-code px-2 py-1 rounded bg-black/30">
                  Runtime Python: {currentStatus.pipInstallHint}
                </div>
              )}
            </div>
          )}

          {(provider === "elevenlabs" ||
            provider === "voicestudio" ||
            provider === "openai" ||
            provider === "custom_api") && (
            <button
              disabled={savingCfg}
              className="studio-btn studio-btn-accent !py-1.5 !text-[11px]"
              onClick={() => void handleSaveConfig()}
            >
              {savingCfg ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Guardar y probar conexión
            </button>
          )}
        </div>
      )}

      {/* Local Model Downloader for Piper & Kokoro */}
      {(provider === "piper" || provider === "kokoro") && currentStatus?.installableModels && (
        <div
          className="rounded-xl p-2 flex flex-col gap-1.5"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            <span>Modelos descargables ({provider})</span>
            {currentStatus.pipInstallHint && !currentStatus.pythonPackageInstalled && (
              <span className="font-mono-code text-[9px] text-amber-300" title="Ejecuta este comando en tu terminal Python">
                {currentStatus.pipInstallHint}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
            {currentStatus.installableModels.map((m) => {
              const isDl = installingModelId === m.id;
              return (
                <div
                  key={m.id}
                  className="rounded-lg px-2 py-1 flex items-center justify-between gap-1.5 text-[10px]"
                  style={{ background: "rgba(0,0,0,0.2)" }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="font-mono-code text-[9px]" style={{ color: "var(--text-muted)" }}>
                      {m.language} · {m.sizeLabel}
                    </div>
                  </div>
                  {m.installed ? (
                    <span className="text-[9.5px] font-semibold flex items-center gap-0.5 shrink-0" style={{ color: "var(--accent-teal)" }}>
                      <Check size={10} /> Listo
                    </span>
                  ) : (
                    <button
                      disabled={installingModelId !== null}
                      onClick={() => void handleInstallModel(provider, m.id)}
                      className="studio-btn studio-btn-accent !py-0.5 !px-2 !text-[9.5px] shrink-0"
                    >
                      {isDl ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                      {isDl ? "Bajando…" : "Descargar"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Voice selector */}
      {provider === "custom_api" ? (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          ID de voz para tu API
          <input
            className="studio-input font-mono-code"
            value={customVoiceInput}
            onChange={(e) => setCustomVoiceInput(e.target.value)}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Voz ({voices.length})
          <select
            className="studio-input"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            disabled={loadingVoices}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                {v.name} {v.installed === false ? " (requiere descarga)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Source Mode Switcher: Free Text vs Existing Subtitles */}
      {!replaceAudioTarget && (
        <div
          className="rounded-xl p-1 grid grid-cols-2 gap-1"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <button
            type="button"
            onClick={() => setTtsSourceMode("text")}
            className={`studio-btn !py-1 !px-2 !text-[10.5px] justify-center ${
              effectiveSourceMode === "text" ? "studio-btn-accent" : ""
            }`}
          >
            <FileText size={11} /> Texto libre
          </button>
          <button
            type="button"
            onClick={() => setTtsSourceMode("subtitles")}
            className={`studio-btn !py-1 !px-2 !text-[10.5px] justify-center ${
              effectiveSourceMode === "subtitles" ? "studio-btn-accent" : ""
            }`}
            title="Generar voz TTS a partir de los subtítulos ya creados en el proyecto"
          >
            <Captions size={11} /> Subtítulos ({sortedSubtitleCues.length})
          </button>
        </div>
      )}

      {/* Script textarea OR From-Subtitles configuration */}
      {effectiveSourceMode === "text" ? (
        <label className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span className="flex items-center justify-between">
            <span>Guion / Texto a narrar</span>
            <span className="font-mono-code">
              {wordCount} pal. · ~{estSec.toFixed(1)}s
            </span>
          </span>
          <textarea
            rows={4}
            className="studio-input resize-y leading-relaxed"
            placeholder="Escribe aquí la frase o guion completo para generar el audio…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      ) : (
        <div
          className="rounded-xl p-2.5 flex flex-col gap-2"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          {sortedSubtitleCues.length === 0 ? (
            <div className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Este proyecto aún no tiene subtítulos. Importa un archivo <strong>.SRT / .VTT</strong> o crea bloques en la pestaña <strong>Subtítulos</strong> primero.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--text-secondary)" }}>
                <span className="font-semibold uppercase tracking-wider">Modo desde subtítulos</span>
                <span className="font-mono-code" style={{ color: "var(--text-muted)" }}>
                  {targetSubtitleCues.length} bloq. · {wordCount} pal. · ~{estSec.toFixed(1)}s
                </span>
              </div>

              {/* Grouped vs Individual mode cards */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={subTtsScope === "selected"}
                  onClick={() => setSubTtsMode("grouped")}
                  className={`rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer ${
                    subTtsScope === "selected" ? "opacity-50" : ""
                  }`}
                  style={{
                    background:
                      subTtsMode === "grouped" && subTtsScope !== "selected"
                        ? "var(--glass-active)"
                        : "rgba(0,0,0,0.22)",
                    border: `1px solid ${
                      subTtsMode === "grouped" && subTtsScope !== "selected"
                        ? "var(--accent-primary)"
                        : "var(--border-subtle)"
                    }`,
                  }}
                >
                  <div className="text-[10.5px] font-semibold flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
                    <Layers size={11} /> Agrupado
                  </div>
                  <div className="text-[9.5px] leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
                    1 sola pieza continua
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTtsMode("individual")}
                  className="rounded-lg px-2 py-1.5 text-left transition-colors cursor-pointer"
                  style={{
                    background:
                      subTtsMode === "individual" || subTtsScope === "selected"
                        ? "var(--glass-active)"
                        : "rgba(0,0,0,0.22)",
                    border: `1px solid ${
                      subTtsMode === "individual" || subTtsScope === "selected"
                        ? "var(--accent-primary)"
                        : "var(--border-subtle)"
                    }`,
                  }}
                >
                  <div className="text-[10.5px] font-semibold flex items-center gap-1" style={{ color: "var(--text-primary)" }}>
                    <ListMusic size={11} /> Individual
                  </div>
                  <div className="text-[9.5px] leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
                    1 clip TTS por subtítulo
                  </div>
                </button>
              </div>

              {/* Scope: All cues vs Selected cue */}
              {selectedSubtitleCue && (
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    onClick={() => setSubTtsScope("all")}
                    className={`studio-btn !py-1 !px-2 !text-[10px] justify-center ${
                      subTtsScope === "all" ? "studio-btn-active" : ""
                    }`}
                  >
                    Todos ({sortedSubtitleCues.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubTtsScope("selected")}
                    className={`studio-btn !py-1 !px-2 !text-[10px] justify-center ${
                      subTtsScope === "selected" ? "studio-btn-active" : ""
                    }`}
                    title={selectedSubtitleCue.text}
                  >
                    Solo bloque ({selectedSubtitleCue.start.toFixed(1)}s)
                  </button>
                </div>
              )}

              {/* Compact preview of cues to narrate */}
              <div
                className="rounded-lg px-2 py-1.5 text-[10px] max-h-[76px] overflow-y-auto leading-relaxed"
                style={{ background: "rgba(0,0,0,0.24)", color: "var(--text-secondary)" }}
              >
                {subTtsMode === "grouped" && subTtsScope === "all" ? (
                  <span>{subtitlesCombinedText}</span>
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {targetSubtitleCues.slice(0, 6).map((c, idx) => (
                      <div key={c.id} className="truncate">
                        <span className="font-mono-code mr-1" style={{ color: "var(--accent-teal)" }}>
                          #{idx + 1} ({c.start.toFixed(1)}s)
                        </span>
                        {c.text}
                      </div>
                    ))}
                    {targetSubtitleCues.length > 6 && (
                      <div style={{ color: "var(--text-muted)" }}>
                        +{targetSubtitleCues.length - 6} subtítulos más…
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Options */}
              {subTtsScope === "all" && (
                <label className="flex items-center gap-2 text-[10px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                  <input
                    type="checkbox"
                    checked={replaceVoiceClips}
                    onChange={(e) => setReplaceVoiceClips(e.target.checked)}
                  />
                  Reemplazar clips anteriores de la pista de voz
                </label>
              )}

              {(subTtsMode === "individual" || subTtsScope === "selected") && (
                <>
                  <label className="flex items-center gap-2 text-[10px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                    <input
                      type="checkbox"
                      checked={syncSubTimings}
                      onChange={(e) => setSyncSubTimings(e.target.checked)}
                    />
                    Sincronizar tiempos de subtítulos al audio real (sin solapar)
                  </label>
                  {syncSubTimings && subTtsScope === "all" && (
                    <label className="flex items-center justify-between gap-2 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
                      <span>Pausa mínima entre clips ({subGapSec.toFixed(2)}s)</span>
                      <input
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.02}
                        value={subGapSec}
                        onChange={(e) => setSubGapSec(Number(e.target.value))}
                        className="w-24"
                      />
                    </label>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Speed + Language + Optional Name */}
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Velocidad ({speed.toFixed(2)}×)
          <input
            type="range"
            min={0.6}
            max={1.6}
            step={0.05}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Idioma
          <select className="studio-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="es" style={{ background: "#14161c", color: "#f3f4f6" }}>Español (es)</option>
            <option value="en" style={{ background: "#14161c", color: "#f3f4f6" }}>English (en)</option>
            <option value="pt" style={{ background: "#14161c", color: "#f3f4f6" }}>Português (pt)</option>
            <option value="fr" style={{ background: "#14161c", color: "#f3f4f6" }}>Français (fr)</option>
          </select>
        </label>
      </div>

      {/* ElevenLabs extra voice sliders */}
      {provider === "elevenlabs" && (
        <div
          className="rounded-xl p-2 grid grid-cols-3 gap-1.5"
          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
        >
          <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
            Estab. {Math.round(elStability * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={elStability} onChange={(e) => setElStability(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
            Simil. {Math.round(elSimilarity * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={elSimilarity} onChange={(e) => setElSimilarity(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-0.5 text-[9.5px]" style={{ color: "var(--text-muted)" }}>
            Estilo {Math.round(elStyle * 100)}%
            <input type="range" min={0} max={1} step={0.05} value={elStyle} onChange={(e) => setElStyle(Number(e.target.value))} />
          </label>
        </div>
      )}

      <input
        className="studio-input !text-[11px]"
        placeholder="Nombre del clip (ej. Narración Escena 1)"
        value={clipName}
        onChange={(e) => setClipName(e.target.value)}
      />

      {/* Auto-Subtitles checkbox (free text OR grouped subtitle mode) */}
      {(effectiveSourceMode === "text" || (subTtsMode === "grouped" && subTtsScope === "all")) && (
        <label className="flex items-center gap-2 text-[10.5px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={autoSubtitles}
            onChange={(e) => setAutoSubtitles(e.target.checked)}
          />
          <Captions size={12} style={{ color: "var(--accent-gold)" }} />
          {effectiveSourceMode === "subtitles"
            ? "Re-sincronizar subtítulos con Whisper IA al audio agrupado"
            : "Auto-generar subtítulos sincronizados (Whisper IA)"}
        </label>
      )}

      {warning && (
        <div
          className="rounded-lg px-2 py-1.5 text-[10px]"
          style={{ background: "rgba(255, 100, 112, 0.14)", border: "1px solid rgba(255, 100, 112, 0.35)" }}
        >
          {warning}
        </div>
      )}

      {okMsg && (
        <div
          className="rounded-lg px-2 py-1.5 text-[10px] flex items-center gap-1"
          style={{ background: "rgba(76, 230, 200, 0.14)", color: "var(--accent-teal)" }}
        >
          <Check size={11} /> {okMsg}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-1.5">
        <button
          disabled={
            previewing ||
            generating ||
            (effectiveSourceMode === "subtitles" ? targetSubtitleCues.length === 0 : !text.trim())
          }
          onClick={() => void handlePreview()}
          className="studio-btn !py-2 !px-3 !text-[11px]"
          style={{ borderColor: "var(--border-strong)" }}
          title="Escuchar prueba rápida antes de insertar"
        >
          {previewing ? (
            <Loader2 size={13} className="animate-spin" />
          ) : playingPreview ? (
            <Pause size={13} />
          ) : (
            <Play size={13} />
          )}
          {playingPreview ? "Parar" : "Probar"}
        </button>

        <button
          disabled={
            generating ||
            (effectiveSourceMode === "subtitles" ? targetSubtitleCues.length === 0 : !text.trim())
          }
          onClick={() => void handleGenerate()}
          className="studio-btn studio-btn-accent flex-1 !py-2 !text-[11px]"
        >
          {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {replaceAudioTarget
            ? "Generar y reemplazar clip"
            : effectiveSourceMode === "subtitles"
              ? subTtsScope === "selected"
                ? "Generar TTS de este bloque"
                : subTtsMode === "grouped"
                  ? `Narrar agrupado (1 pieza · ${targetSubtitleCues.length} subs)`
                  : `Narrar individual (${targetSubtitleCues.length} clips)`
              : `Generar e insertar (${currentTime.toFixed(1)}s)`}
        </button>
      </div>
    </div>
  );
};
