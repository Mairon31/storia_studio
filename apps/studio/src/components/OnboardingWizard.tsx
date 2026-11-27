import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cloud,
  Cpu,
  Download,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  Mic,
  Moon,
  RotateCcw,
  Shield,
  Sparkles,
  Sun,
  Wifi,
} from "lucide-react";
import {
  AccessMode,
  ConnectivityStatusResponse,
  LibraryCatalogItem,
  LibraryId,
  OnboardingPreferences,
  studioApi,
  TtsProviderStatus,
  TunnelProvider,
} from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

const STEPS = [
  { id: "welcome", label: "Bienvenida", icon: Sparkles },
  { id: "folders", label: "Carpetas", icon: FolderOpen },
  { id: "libraries", label: "Librerías", icon: Globe },
  { id: "voice", label: "Voz y IA", icon: Mic },
  { id: "network", label: "Red y Túneles", icon: Cloud },
  { id: "finish", label: "Listo", icon: CheckCircle2 },
] as const;

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

export const OnboardingWizard: React.FC = () => {
  const open = useStudioStore((s) => s.onboardingOpen);
  const status = useStudioStore((s) => s.onboardingStatus);
  const setOnboardingOpen = useStudioStore((s) => s.setOnboardingOpen);
  const setOnboardingStatus = useStudioStore((s) => s.setOnboardingStatus);
  const updateAppSettings = useStudioStore((s) => s.updateAppSettings);
  const refreshLibrariesCatalog = useStudioStore((s) => s.refreshLibrariesCatalog);
  const refreshProjectsList = useStudioStore((s) => s.refreshProjectsList);
  const loadProject = useStudioStore((s) => s.loadProject);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);
  const currentTheme = useStudioStore((s) => s.theme);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);

  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // Step 1: General Preferences
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [language, setLanguage] = useState<OnboardingPreferences["language"]>("es");
  const [aspectRatio, setAspectRatio] = useState<OnboardingPreferences["defaultAspectRatio"]>("9:16");
  const [resolution, setResolution] = useState<OnboardingPreferences["defaultResolution"]>("1080p");
  const [fps, setFps] = useState<OnboardingPreferences["defaultFps"]>(30);

  // Step 2: Directories
  const [projectsDir, setProjectsDir] = useState("");
  const [modelsDir, setModelsDir] = useState("");
  const [customAssetsDir, setCustomAssetsDir] = useState("");
  const [pickingField, setPickingField] = useState<string | null>(null);

  // Step 3: Libraries
  const [catalog, setCatalog] = useState<LibraryCatalogItem[]>([]);
  const [enabledLibs, setEnabledLibs] = useState<Partial<Record<LibraryId, boolean>>>({
    openverse: true,
    iconify: true,
    wikimedia: true,
    internet_archive: false,
    pixel_game_sprites: false,
    openmoji_props: false,
    svg_backgrounds: true,
  });

  // Step 4: TTS & Whisper
  const [ttsProviders, setTtsProviders] = useState<TtsProviderStatus[]>([]);
  const [defaultTtsProvider, setDefaultTtsProvider] = useState<string>("windows_sapi");
  const [whisperModel, setWhisperModel] = useState<OnboardingPreferences["whisperModel"]>("small");
  const [installingTtsKey, setInstallingTtsKey] = useState<string | null>(null);

  // Step 5: Network & Tunnels
  const [connStatus, setConnStatus] = useState<ConnectivityStatusResponse | null>(null);
  const [accessMode, setAccessMode] = useState<AccessMode>("local");
  const [mcpHttpEnabled, setMcpHttpEnabled] = useState(true);
  const [mcpAuthEnabled, setMcpAuthEnabled] = useState(true);
  const [tunnelProvider, setTunnelProvider] = useState<TunnelProvider>("none");
  const [tunnelAutoStart, setTunnelAutoStart] = useState(false);
  const [installingTunnel, setInstallingTunnel] = useState<"ngrok" | "cloudflare" | null>(null);

  // Step 6: Starter project
  const [createStarterProject, setCreateStarterProject] = useState(true);

  const hasNativePicker = Boolean(getTauriInvoke());

  // Sync initial fields whenever modal opens or status updates
  useEffect(() => {
    if (!open || !status) return;
    setStep(0);
    setErrorMsg(null);
    setInfoMsg(null);
    setTheme(status.preferences.theme);
    setLanguage(status.preferences.language);
    setAspectRatio(status.preferences.defaultAspectRatio);
    setResolution(status.preferences.defaultResolution);
    setFps(status.preferences.defaultFps);
    setDefaultTtsProvider(status.preferences.defaultTtsProvider);
    setWhisperModel(status.preferences.whisperModel);
    setProjectsDir(status.paths.projectsDir);
    setModelsDir(status.paths.modelsDir);
    setCustomAssetsDir(status.paths.customAssetsDir || "");

    // Load live catalog, TTS providers, and connectivity binaries in parallel
    void Promise.all([
      studioApi
        .getLibrariesCatalog()
        .then((res) => {
          setCatalog(res.libraries);
          setEnabledLibs({
            ...res.enabled,
            svg_backgrounds: res.enabled.svg_backgrounds ?? true,
          });
        })
        .catch(() => {}),
      studioApi
        .getTtsProviders(false)
        .then((res) => setTtsProviders(res.providers))
        .catch(() => {}),
      studioApi
        .getConnectivityStatus(false)
        .then((res) => {
          setConnStatus(res);
          setAccessMode(res.config.accessMode);
          setMcpHttpEnabled(res.config.mcpHttpEnabled);
          setMcpAuthEnabled(res.config.mcpAuthEnabled);
          setTunnelProvider(res.config.tunnel.provider);
          setTunnelAutoStart(res.config.tunnel.autoStart);
        })
        .catch(() => {}),
    ]);
  }, [open, status]);

  if (!open || !status) return null;

  const handleBrowseFolder = async (
    field: "projects" | "models" | "assets",
    title: string,
    setter: (v: string) => void,
  ) => {
    const invoke = getTauriInvoke();
    if (!invoke) return;
    setPickingField(field);
    try {
      const picked = await invoke<string | null>("pick_folder", { title });
      if (picked && typeof picked === "string" && picked.trim()) {
        setter(picked.trim());
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setPickingField(null);
    }
  };

  const handleInstallTtsModel = async (provider: "piper" | "kokoro", modelId: string) => {
    const key = `${provider}:${modelId}`;
    setInstallingTtsKey(key);
    setErrorMsg(null);
    setInfoMsg(`Descargando modelo de voz ${modelId} (${provider})…`);
    try {
      const res = await studioApi.installTtsModel(provider, modelId);
      setInfoMsg(
        `Modelo ${res.modelId} instalado correctamente (${(res.totalBytes / (1024 * 1024)).toFixed(1)} MB).`,
      );
      const refreshed = await studioApi.getTtsProviders(true);
      setTtsProviders(refreshed.providers);
    } catch (err) {
      setErrorMsg(`No se pudo instalar ${modelId}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingTtsKey(null);
    }
  };

  const handleInstallTunnel = async (provider: "ngrok" | "cloudflare") => {
    setInstallingTunnel(provider);
    setErrorMsg(null);
    setInfoMsg(`Instalando binario oficial de ${provider}…`);
    try {
      const updated = await studioApi.installTunnelBinary(provider);
      setConnStatus(updated);
      setTunnelProvider(provider);
      setInfoMsg(`${provider === "ngrok" ? "ngrok" : "cloudflared"} instalado correctamente.`);
    } catch (err) {
      setErrorMsg(`No se pudo instalar ${provider}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setInstallingTunnel(null);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    setErrorMsg(null);
    try {
      await studioApi.skipOnboarding();
      setOnboardingStatus({ ...status, completed: true, shouldShow: false });
      setOnboardingOpen(false);
      await refreshProjectsList();
      const list = useStudioStore.getState().projectsList;
      if (list.length > 0) {
        await loadProject(list[0]!.id, false);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSkipping(false);
    }
  };

  const handleComplete = async () => {
    setFinishing(true);
    setErrorMsg(null);
    try {
      const res = await studioApi.completeOnboarding({
        projectsDir: projectsDir.trim() || undefined,
        modelsDir: modelsDir.trim() || undefined,
        customAssetsDir: customAssetsDir.trim(),
        enabledLibraries: enabledLibs,
        connectivity: {
          accessMode,
          mcpHttpEnabled,
          mcpAuthEnabled,
          tunnelProvider,
          tunnelAutoStart,
        },
        preferences: {
          theme,
          language,
          defaultAspectRatio: aspectRatio,
          defaultResolution: resolution,
          defaultFps: fps,
          defaultTtsProvider,
          whisperModel,
        },
        createStarterProject,
      });

      // Persist UI preferences locally right away
      updateAppSettings({
        defaultAspectRatio: aspectRatio,
        defaultResolution: resolution,
        defaultFps: fps,
        whisperLanguage: language,
        whisperModel,
        defaultTtsLanguage: language,
        defaultTtsProvider: defaultTtsProvider as Parameters<typeof updateAppSettings>[0]["defaultTtsProvider"],
      });
      if (theme !== currentTheme) {
        toggleTheme();
      }

      setOnboardingStatus({ ...res.status, completed: true, shouldShow: false });
      setOnboardingOpen(false);
      await Promise.all([refreshLibrariesCatalog(), refreshProjectsList()]);

      if (res.restartRequired) {
        const invoke = getTauriInvoke();
        if (invoke) {
          setBusyNotice("Aplicando nuevas carpetas de almacenamiento y reiniciando servidor local…");
          await invoke("restart_server").catch(() => {});
          window.setTimeout(() => window.location.reload(), 1600);
          return;
        }
        setBusyNotice(
          "Configuración guardada. Reinicia el servidor de Storia Studio para aplicar las nuevas rutas de carpetas.",
        );
        window.setTimeout(() => setBusyNotice(null), 5000);
      } else {
        setBusyNotice("¡Storia Studio configurado y listo para crear!");
        window.setTimeout(() => setBusyNotice(null), 3200);
      }

      if (res.starterProjectId) {
        await loadProject(res.starterProjectId, true);
      } else {
        const list = useStudioStore.getState().projectsList;
        if (list.length > 0) {
          await loadProject(list[0]!.id, false);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setFinishing(false);
    }
  };

  const piperProvider = ttsProviders.find((p) => p.id === "piper");
  const kokoroProvider = ttsProviders.find((p) => p.id === "kokoro");
  const enabledCount = Object.values(enabledLibs).filter(Boolean).length;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-5"
      style={{ background: "rgba(5, 7, 12, 0.86)", backdropFilter: "blur(14px)" }}
    >
      <div
        className="w-full max-w-[780px] max-h-[92dvh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "var(--glass-surface-elevated)",
          border: "1px solid var(--border-strong)",
        }}
      >
        {/* Header with official Storia Studio SVG Logo */}
        <div
          className="px-5 py-4 flex items-center justify-between gap-3 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/favicon.svg"
              alt="Storia Studio"
              className="w-10 h-10 rounded-xl shrink-0 border border-white/15 shadow"
            />
            <div className="min-w-0">
              <div className="text-[15px] font-bold tracking-tight flex items-center gap-2">
                Configuración Inicial de Storia Studio
                <span
                  className="text-[9.5px] font-mono-code px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(76, 230, 200, 0.14)", color: "var(--accent-teal)" }}
                >
                  PRIMER INICIO
                </span>
              </div>
              <div className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                Ajusta tus carpetas, librerías gratuitas, voces offline y acceso remoto una sola vez.
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={skipping || finishing}
            onClick={() => void handleSkip()}
            className="studio-btn !py-1.5 !px-3 !text-[11px] shrink-0"
            title="Usar valores recomendados por defecto y no volver a mostrar este asistente"
          >
            {skipping ? "Omitiendo…" : "Usar defaults"}
          </button>
        </div>

        {/* Stepper Bar */}
        <div
          className="px-4 py-2.5 border-b flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.16)" }}
        >
          {STEPS.map((st, idx) => {
            const Icon = st.icon;
            const active = idx === step;
            const done = idx < step;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setStep(idx)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium cursor-pointer shrink-0 transition-colors"
                style={{
                  background: active
                    ? "var(--accent-primary)"
                    : done
                      ? "rgba(76, 230, 200, 0.14)"
                      : "transparent",
                  color: active
                    ? "var(--accent-ink)"
                    : done
                      ? "var(--accent-teal)"
                      : "var(--text-secondary)",
                  border: active
                    ? "1px solid transparent"
                    : "1px solid var(--border-subtle)",
                }}
              >
                {done ? <Check size={12} /> : <Icon size={12} />}
                <span>
                  {idx + 1}. {st.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          {errorMsg && (
            <div
              className="rounded-xl px-3 py-2 text-[11.5px]"
              style={{
                background: "rgba(255, 100, 112, 0.14)",
                border: "1px solid rgba(255, 100, 112, 0.36)",
                color: "#fecaca",
              }}
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div
              className="rounded-xl px-3 py-2 text-[11.5px]"
              style={{
                background: "rgba(76, 230, 200, 0.12)",
                border: "1px solid rgba(76, 230, 200, 0.34)",
                color: "var(--accent-teal)",
              }}
            >
              {infoMsg}
            </div>
          )}

          {/* STEP 0: WELCOME & DEFAULTS */}
          {step === 0 && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-[14px] font-bold">Bienvenido a Storia Studio</h3>
                <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Este asistente aparece únicamente la primera vez que inicias la aplicación. Todos los campos ya traen valores óptimos listos para usar; puedes personalizarlos ahora o cambiarlos después en <strong>Ajustes</strong>.
                </p>
              </div>

              {/* Hardware & Environment Diagnostics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div
                  className="rounded-xl p-2.5 flex flex-col gap-0.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-[9.5px] uppercase flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
                    <Cpu size={10} /> Equipo
                  </span>
                  <span className="text-[11.5px] font-semibold font-mono-code">
                    {status.system ? `${status.system.cpus} CPU · ${status.system.totalMemGb} GB` : "Detectado"}
                  </span>
                </div>
                <div
                  className="rounded-xl p-2.5 flex flex-col gap-0.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-[9.5px] uppercase" style={{ color: "var(--text-muted)" }}>
                    FFmpeg
                  </span>
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: status.system?.ffmpegAvailable ? "var(--accent-teal)" : "#fbbf24" }}
                  >
                    {status.system?.ffmpegAvailable ? "Listo" : "No detectado"}
                  </span>
                </div>
                <div
                  className="rounded-xl p-2.5 flex flex-col gap-0.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-[9.5px] uppercase" style={{ color: "var(--text-muted)" }}>
                    Codificador
                  </span>
                  <span className="text-[11.5px] font-semibold font-mono-code" style={{ color: "var(--accent-primary)" }}>
                    {status.system?.recommendedEncoder ?? "libx264"}
                  </span>
                </div>
                <div
                  className="rounded-xl p-2.5 flex flex-col gap-0.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <span className="text-[9.5px] uppercase" style={{ color: "var(--text-muted)" }}>
                    Python IA
                  </span>
                  <span
                    className="text-[11.5px] font-semibold"
                    style={{ color: status.system?.pythonAvailable ? "var(--accent-teal)" : "var(--text-secondary)" }}
                  >
                    {status.system?.pythonAvailable ? "Disponible" : "Opcional"}
                  </span>
                </div>
              </div>

              {/* Theme + Language */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Tema visual preferido
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setTheme("dark")}
                      className="rounded-xl p-2.5 flex items-center justify-center gap-2 text-[11.5px] font-semibold cursor-pointer"
                      style={{
                        background: theme === "dark" ? "var(--glass-active)" : "var(--glass-hover)",
                        border: `1.5px solid ${theme === "dark" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <Moon size={13} /> Oscuro
                    </button>
                    <button
                      type="button"
                      onClick={() => setTheme("light")}
                      className="rounded-xl p-2.5 flex items-center justify-center gap-2 text-[11.5px] font-semibold cursor-pointer"
                      style={{
                        background: theme === "light" ? "var(--glass-active)" : "var(--glass-hover)",
                        border: `1.5px solid ${theme === "light" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <Sun size={13} /> Claro
                    </button>
                  </div>
                </div>

                <label className="flex flex-col gap-1.5 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Idioma por defecto (Voz TTS y Subtítulos)
                  <select
                    className="studio-input !py-2"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value as OnboardingPreferences["language"])}
                  >
                    <option value="es" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Español (es)
                    </option>
                    <option value="en" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      English (en)
                    </option>
                    <option value="pt" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Português (pt)
                    </option>
                    <option value="fr" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Français (fr)
                    </option>
                  </select>
                </label>
              </div>

              {/* Default Video Format */}
              <div className="grid grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Formato por defecto
                  <select
                    className="studio-input font-mono-code"
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as OnboardingPreferences["defaultAspectRatio"])}
                  >
                    <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      9:16 Vertical (Reels/Shorts)
                    </option>
                    <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      16:9 Horizontal (YouTube)
                    </option>
                    <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      1:1 Cuadrado
                    </option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Resolución
                  <select
                    className="studio-input font-mono-code"
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value as OnboardingPreferences["defaultResolution"])}
                  >
                    <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      720p HD
                    </option>
                    <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      1080p Full HD
                    </option>
                    <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      2K QHD
                    </option>
                    <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      4K UHD
                    </option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Fotogramas (FPS)
                  <select
                    className="studio-input font-mono-code"
                    value={fps}
                    onChange={(e) => setFps(Number(e.target.value) as OnboardingPreferences["defaultFps"])}
                  >
                    <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      24 FPS (Cine)
                    </option>
                    <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      30 FPS (Estándar)
                    </option>
                    <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      60 FPS (Fluido)
                    </option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* STEP 1: FOLDERS & INSTALLATION PATHS */}
          {step === 1 && (
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-[14px] font-bold flex items-center gap-1.5">
                    <HardDrive size={14} style={{ color: "var(--accent-primary)" }} /> Carpetas de Instalación y Datos
                  </h3>
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Ya vienen configuradas las rutas recomendadas para tu sistema operativo. Puedes dejarlas así o elegir otro disco.
                  </p>
                </div>
                <button
                  type="button"
                  className="studio-btn !py-1 !px-2 !text-[10.5px] shrink-0"
                  onClick={() => {
                    setProjectsDir(status.paths.defaults.projectsDir);
                    setModelsDir(status.paths.defaults.modelsDir);
                    setCustomAssetsDir("");
                  }}
                >
                  <RotateCcw size={11} /> Restaurar rutas default
                </button>
              </div>

              <div
                className="rounded-xl p-3 flex flex-col gap-1"
                style={{ background: "rgba(0,0,0,0.22)", border: "1px solid var(--border-subtle)" }}
              >
                <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Carpeta de instalación de la aplicación (solo lectura)
                </span>
                <div className="font-mono-code text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                  {status.paths.installDir}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Carpeta de Proyectos y Exportaciones MP4
                  <div className="flex items-center gap-2">
                    <input
                      className="studio-input font-mono-code flex-1"
                      value={projectsDir}
                      onChange={(e) => setProjectsDir(e.target.value)}
                      placeholder={status.paths.defaults.projectsDir}
                    />
                    {hasNativePicker && (
                      <button
                        type="button"
                        disabled={pickingField !== null}
                        className="studio-btn !py-1.5 !px-3 !text-[11px] shrink-0"
                        onClick={() =>
                          void handleBrowseFolder(
                            "projects",
                            "Selecciona la carpeta de proyectos de Storia Studio",
                            setProjectsDir,
                          )
                        }
                      >
                        <FolderOpen size={12} /> Explorar…
                      </button>
                    )}
                  </div>
                </label>

                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Carpeta de Modelos IA, Caché y Configuración (TTS Piper/Kokoro, túneles, caché)
                  <div className="flex items-center gap-2">
                    <input
                      className="studio-input font-mono-code flex-1"
                      value={modelsDir}
                      onChange={(e) => setModelsDir(e.target.value)}
                      placeholder={status.paths.defaults.modelsDir}
                    />
                    {hasNativePicker && (
                      <button
                        type="button"
                        disabled={pickingField !== null}
                        className="studio-btn !py-1.5 !px-3 !text-[11px] shrink-0"
                        onClick={() =>
                          void handleBrowseFolder(
                            "models",
                            "Selecciona la carpeta para modelos IA y caché de Storia Studio",
                            setModelsDir,
                          )
                        }
                      >
                        <FolderOpen size={12} /> Explorar…
                      </button>
                    )}
                  </div>
                </label>

                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Carpeta personal de Assets locales (opcional — déjalo vacío si solo usarás librerías online)
                  <div className="flex items-center gap-2">
                    <input
                      className="studio-input font-mono-code flex-1"
                      value={customAssetsDir}
                      onChange={(e) => setCustomAssetsDir(e.target.value)}
                      placeholder="Opcional: ruta a tu carpeta propia de SVGs, SFX o música"
                    />
                    {hasNativePicker && (
                      <button
                        type="button"
                        disabled={pickingField !== null}
                        className="studio-btn !py-1.5 !px-3 !text-[11px] shrink-0"
                        onClick={() =>
                          void handleBrowseFolder(
                            "assets",
                            "Selecciona tu carpeta personal de assets (opcional)",
                            setCustomAssetsDir,
                          )
                        }
                      >
                        <FolderOpen size={12} /> Explorar…
                      </button>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: LIBRARIES */}
          {step === 2 && (
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="text-[14px] font-bold flex items-center gap-1.5">
                  <Globe size={14} style={{ color: "var(--accent-teal)" }} /> Librerías Gratuitas Compatibles (Sin API Key)
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Activa las fuentes de vectores SVG, sprites, fondos, música y efectos de sonido que quieres disponibles en el editor.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {catalog.map((lib) => {
                  const active = Boolean(enabledLibs[lib.id]);
                  return (
                    <button
                      key={lib.id}
                      type="button"
                      onClick={() =>
                        setEnabledLibs((prev) => ({
                          ...prev,
                          [lib.id]: !active,
                        }))
                      }
                      className="rounded-xl p-3 text-left flex items-start justify-between gap-2.5 cursor-pointer transition-all"
                      style={{
                        background: active ? "var(--glass-active)" : "var(--glass-hover)",
                        border: `1.5px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold flex items-center gap-1.5">
                          <span>{lib.name}</span>
                          <span
                            className="text-[9px] font-mono-code px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(255,255,255,0.07)", color: "var(--text-muted)" }}
                          >
                            {lib.kind === "builtin" ? "Offline" : lib.kind === "local" ? "Local" : "Online"}
                          </span>
                        </div>
                        <div className="text-[10.5px] mt-0.5 leading-snug" style={{ color: "var(--text-secondary)" }}>
                          {lib.tagline}
                        </div>
                        <div className="text-[9.5px] font-mono-code mt-1" style={{ color: "var(--text-muted)" }}>
                          {lib.estimatedCount} · {lib.license}
                        </div>
                      </div>
                      <span
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.08)",
                          color: active ? "var(--accent-ink)" : "transparent",
                        }}
                      >
                        <Check size={12} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: VOICE TTS & WHISPER */}
          {step === 3 && (
            <div className="flex flex-col gap-3.5">
              <div>
                <h3 className="text-[14px] font-bold flex items-center gap-1.5">
                  <Mic size={14} style={{ color: "var(--accent-gold)" }} /> Modelos de Voz (TTS) y Transcripción (Opcional)
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Elige tu motor de voz por defecto y, si deseas narración neuronal 100% offline, descarga ahora un modelo Piper o Kokoro.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Proveedor de Voz TTS predeterminado
                  <select
                    className="studio-input"
                    value={defaultTtsProvider}
                    onChange={(e) => setDefaultTtsProvider(e.target.value)}
                  >
                    <option value="windows_sapi" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Voz del Sistema / Windows SAPI (Instantáneo)
                    </option>
                    <option value="piper" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Piper ONNX (Offline Rápido)
                    </option>
                    <option value="kokoro" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      Kokoro-82M (Offline Neural)
                    </option>
                    <option value="elevenlabs" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      ElevenLabs (API Key en Ajustes)
                    </option>
                    <option value="openai" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      OpenAI TTS / Compatible
                    </option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                  Modelo Whisper local para subtítulos automáticos
                  <select
                    className="studio-input"
                    value={whisperModel}
                    onChange={(e) => setWhisperModel(e.target.value as OnboardingPreferences["whisperModel"])}
                  >
                    <option value="tiny" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      tiny (~75 MB · Ultra rápido)
                    </option>
                    <option value="base" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      base (~145 MB · Equilibrado)
                    </option>
                    <option value="small" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      small (~480 MB · Recomendado ES/EN)
                    </option>
                    <option value="medium" style={{ background: "#14161c", color: "#f3f4f6" }}>
                      medium (~1.5 GB · Máxima precisión)
                    </option>
                  </select>
                </label>
              </div>

              {/* Optional One-Click Offline Voice Downloads */}
              <div
                className="rounded-xl p-3 flex flex-col gap-2"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="text-[11px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  Descargar voces neuronales offline (opcional · puedes hacerlo luego en Ajustes › Voz TTS)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[190px] overflow-y-auto pr-0.5">
                  {[
                    ...(piperProvider?.installableModels ?? []).map((m) => ({ ...m, provider: "piper" as const })),
                    ...(kokoroProvider?.installableModels ?? []).map((m) => ({ ...m, provider: "kokoro" as const })),
                  ]
                    .slice(0, 6)
                    .map((m) => {
                      const key = `${m.provider}:${m.id}`;
                      const busy = installingTtsKey === key;
                      return (
                        <div
                          key={key}
                          className="rounded-lg px-2.5 py-2 flex items-center justify-between gap-2 text-[10.5px]"
                          style={{ background: "rgba(0,0,0,0.24)" }}
                        >
                          <div className="min-w-0">
                            <div className="font-medium truncate">{m.name}</div>
                            <div className="text-[9.5px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                              {m.provider} · {m.language} · {m.sizeLabel}
                            </div>
                          </div>
                          {m.installed ? (
                            <span
                              className="text-[9.5px] font-mono-code px-2 py-0.5 rounded shrink-0"
                              style={{ background: "rgba(52,211,153,0.18)", color: "#6ee7b7" }}
                            >
                              Instalado
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={installingTtsKey !== null}
                              onClick={() => void handleInstallTtsModel(m.provider, m.id)}
                              className="studio-btn studio-btn-accent !py-1 !px-2 !text-[10px] shrink-0"
                            >
                              {busy ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                              {busy ? "Bajando…" : "Instalar"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: NETWORK, TUNNELS & MCP */}
          {step === 4 && (
            <div className="flex flex-col gap-3.5">
              <div>
                <h3 className="text-[14px] font-bold flex items-center gap-1.5">
                  <Wifi size={14} style={{ color: "var(--accent-teal)" }} /> Red Local, Túneles Remotos y MCP (Opcional)
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Por defecto Storia Studio se mantiene 100% local y privado. Activa LAN o instala un túnel HTTPS solo si quieres controlar el estudio desde tu móvil o desde una IA externa.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setAccessMode("local")}
                  className="rounded-xl p-3 text-left cursor-pointer"
                  style={{
                    background: accessMode === "local" ? "var(--glass-active)" : "var(--glass-hover)",
                    border: `1.5px solid ${accessMode === "local" ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div className="text-[12px] font-semibold">Solo este equipo (Recomendado)</div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Máxima privacidad en localhost. Los túneles HTTPS siguen funcionando si decides activarlos.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAccessMode("lan")}
                  className="rounded-xl p-3 text-left cursor-pointer"
                  style={{
                    background: accessMode === "lan" ? "var(--glass-active)" : "var(--glass-hover)",
                    border: `1.5px solid ${accessMode === "lan" ? "var(--accent-teal)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div className="text-[12px] font-semibold">Red Wi-Fi Local (LAN)</div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                    Permite abrir el editor desde tu teléfono, tablet u otra PC en la misma red local.
                  </div>
                </button>
              </div>

              {/* Optional Tunnel Binaries */}
              <div
                className="rounded-xl p-3 flex flex-col gap-2.5"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="text-[11.5px] font-semibold flex items-center gap-1.5">
                  <Cloud size={13} style={{ color: "var(--accent-primary)" }} /> Proveedor de túnel HTTPS (opcional)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(["ngrok", "cloudflare"] as const).map((prov) => {
                    const installed =
                      prov === "ngrok"
                        ? Boolean(connStatus?.binaries.ngrok.installed)
                        : Boolean(connStatus?.binaries.cloudflared.installed);
                    const selected = tunnelProvider === prov;
                    return (
                      <div
                        key={prov}
                        className="rounded-lg p-2.5 flex items-center justify-between gap-2"
                        style={{
                          background: selected ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                          border: `1px solid ${selected ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setTunnelProvider(selected ? "none" : prov)}
                          className="text-left min-w-0 flex-1 cursor-pointer"
                        >
                          <div className="text-[11.5px] font-semibold">
                            {prov === "ngrok" ? "ngrok" : "Cloudflare Tunnel"}
                          </div>
                          <div className="text-[10px]" style={{ color: installed ? "#6ee7b7" : "var(--text-muted)" }}>
                            {installed ? "Binario instalado" : "No instalado"}
                          </div>
                        </button>
                        {!installed && (
                          <button
                            type="button"
                            disabled={installingTunnel !== null}
                            onClick={() => void handleInstallTunnel(prov)}
                            className="studio-btn studio-btn-accent !py-1 !px-2 !text-[10px] shrink-0"
                          >
                            {installingTunnel === prov ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Download size={11} />
                            )}
                            Instalar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {tunnelProvider !== "none" && (
                  <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tunnelAutoStart}
                      onChange={(e) => setTunnelAutoStart(e.target.checked)}
                    />
                    Iniciar túnel automáticamente al abrir Storia Studio
                  </label>
                )}
              </div>

              {/* MCP Security toggles */}
              <div
                className="rounded-xl p-3 flex flex-col gap-2 text-[11.5px]"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="font-semibold flex items-center gap-1.5">
                  <Shield size={13} style={{ color: "var(--accent-gold)" }} /> Protocolo MCP para IAs (ChatGPT, Claude, Gemini, Codex)
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mcpHttpEnabled}
                    onChange={(e) => setMcpHttpEnabled(e.target.checked)}
                  />
                  Habilitar endpoint Streamable HTTP <code className="font-mono-code">/mcp</code> + OAuth 2.1
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={mcpAuthEnabled}
                    onChange={(e) => setMcpAuthEnabled(e.target.checked)}
                  />
                  Exigir autenticación Zero-Trust (Bearer Token / OAuth / Cookie móvil HttpOnly) en túneles remotos
                </label>
              </div>
            </div>
          )}

          {/* STEP 5: SUMMARY & FINISH */}
          {step === 5 && (
            <div className="flex flex-col gap-3.5">
              <div>
                <h3 className="text-[14px] font-bold flex items-center gap-1.5">
                  <CheckCircle2 size={15} style={{ color: "var(--accent-teal)" }} /> ¡Todo listo para empezar!
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Revisa tu resumen inicial. Al finalizar, Storia Studio guardará tu configuración y no volverá a mostrar este asistente.
                </p>
              </div>

              <div
                className="rounded-xl p-3.5 flex flex-col gap-2 text-[11.5px]"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Formato y tema:</span>
                  <span className="font-mono-code font-semibold">
                    {aspectRatio} · {resolution} @ {fps}fps · {theme === "dark" ? "Oscuro" : "Claro"} ({language.toUpperCase()})
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Proyectos:</span>
                  <span className="font-mono-code truncate max-w-[420px]">{projectsDir}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Modelos y caché:</span>
                  <span className="font-mono-code truncate max-w-[420px]">{modelsDir}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Librerías activas:</span>
                  <span className="font-mono-code">{enabledCount} fuentes habilitadas</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Voz TTS &amp; Whisper:</span>
                  <span className="font-mono-code">
                    {defaultTtsProvider} · Whisper {whisperModel}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span style={{ color: "var(--text-muted)" }}>Red y Túnel:</span>
                  <span className="font-mono-code">
                    {accessMode === "lan" ? "LAN" : "Solo Local"} · Túnel: {tunnelProvider} · MCP:{" "}
                    {mcpHttpEnabled ? "Activo" : "Desactivado"}
                  </span>
                </div>
              </div>

              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={createStarterProject}
                  onChange={(e) => setCreateStarterProject(e.target.checked)}
                />
                Crear un proyecto inicial de muestra para explorar el editor inmediatamente
              </label>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div
          className="px-5 py-3.5 border-t flex items-center justify-between gap-2 shrink-0"
          style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.18)" }}
        >
          <button
            type="button"
            disabled={step === 0 || finishing}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="studio-btn !py-1.5 !px-3.5 !text-[12px] disabled:opacity-40"
          >
            <ArrowLeft size={13} /> Anterior
          </button>

          <div className="text-[11px] font-mono-code" style={{ color: "var(--text-muted)" }}>
            Paso {step + 1} de {STEPS.length}
          </div>

          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="studio-btn studio-btn-accent !py-1.5 !px-4 !text-[12px] font-semibold"
            >
              Siguiente <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              disabled={finishing}
              onClick={() => void handleComplete()}
              className="studio-btn studio-btn-accent !py-1.5 !px-5 !text-[12px] font-semibold"
            >
              {finishing ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {finishing ? "Guardando…" : "Finalizar y abrir Storia Studio"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
