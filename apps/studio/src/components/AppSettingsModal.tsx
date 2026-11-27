import React, { useEffect, useState } from "react";
import {
  AudioLines,
  Bot,
  Captions,
  Cloud,
  Cpu,
  Download,
  Film,
  HardDrive,
  Info,
  KeyRound,
  Keyboard,
  Layout,
  Loader2,
  Mic,
  Moon,
  RefreshCw,
  RotateCcw,
  Server,
  Settings,
  Shapes,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Volume2,
  Wifi,
  X,
} from "lucide-react";
import { StorageStatsResponse, studioApi } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";
import { ConnectivitySettingsPanel } from "./ConnectivitySettingsPanel";
import { LibrariesSettingsPanel } from "./LibrariesSettingsPanel";
import { ProvidersSettingsPanel } from "./ProvidersSettingsPanel";

type SettingsSection =
  | "render"
  | "export"
  | "editor"
  | "interface"
  | "shortcuts"
  | "audio"
  | "whisper"
  | "tts"
  | "apis"
  | "libraries"
  | "network"
  | "remote"
  | "mcp"
  | "storage"
  | "hardware"
  | "system"
  | "updates"
  | "about";

interface NavGroup {
  group: string;
  items: { id: SettingsSection; label: string; icon: React.ReactNode }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Producción",
    items: [
      { id: "render", label: "Renderizado", icon: <Sliders size={13} /> },
      { id: "export", label: "Exportación", icon: <Film size={13} /> },
      { id: "editor", label: "Editor", icon: <Settings size={13} /> },
      { id: "interface", label: "Interfaz", icon: <Layout size={13} /> },
      { id: "shortcuts", label: "Atajos de teclado", icon: <Keyboard size={13} /> },
    ],
  },
  {
    group: "Audio, IA y Proveedores",
    items: [
      { id: "audio", label: "Audio", icon: <Volume2 size={13} /> },
      { id: "whisper", label: "Whisper IA", icon: <Captions size={13} /> },
      { id: "tts", label: "Voz TTS y Modelos", icon: <AudioLines size={13} /> },
      { id: "apis", label: "APIs y Credenciales", icon: <KeyRound size={13} /> },
      { id: "libraries", label: "Librerías", icon: <Shapes size={13} /> },
    ],
  },
  {
    group: "Conectividad e IAs",
    items: [
      { id: "network", label: "Red Local (LAN)", icon: <Wifi size={13} /> },
      { id: "remote", label: "Remoto (Túnel)", icon: <Cloud size={13} /> },
      { id: "mcp", label: "MCP para IAs", icon: <Bot size={13} /> },
    ],
  },
  {
    group: "Equipo y Aplicación",
    items: [
      { id: "storage", label: "Almacenamiento", icon: <HardDrive size={13} /> },
      { id: "hardware", label: "Hardware", icon: <Cpu size={13} /> },
      { id: "system", label: "Sistema", icon: <Server size={13} /> },
      { id: "updates", label: "Actualizaciones", icon: <Download size={13} /> },
      { id: "about", label: "Sobre nosotros", icon: <Info size={13} /> },
    ],
  },
];

const KEYBOARD_SHORTCUTS: { category: string; items: { keys: string; desc: string }[] }[] = [
  {
    category: "Reproducción y Navegación",
    items: [
      { keys: "Espacio", desc: "Reproducir / Pausar vista previa" },
      { keys: "← / →", desc: "Avanzar o retroceder 1 fotograma exacto" },
      { keys: "Shift + ← / →", desc: "Saltar 5 fotogramas" },
      { keys: "Ctrl + Rueda", desc: "Acercar / alejar zoom de vista previa" },
    ],
  },
  {
    category: "Edición y Proyecto",
    items: [
      { keys: "Ctrl + Z", desc: "Deshacer última acción" },
      { keys: "Ctrl + Shift + Z", desc: "Rehacer acción" },
      { keys: "Ctrl + S", desc: "Guardar proyecto inmediatamente en disco" },
      { keys: "Ctrl + E", desc: "Abrir ventana de Exportación MP4" },
      { keys: "Supr / Backspace", desc: "Eliminar capa seleccionada (no bloqueada)" },
    ],
  },
  {
    category: "Vista Previa y Timeline",
    items: [
      { keys: "Esc", desc: "Salir de pantalla completa o cerrar ventana activa" },
      { keys: "Clic derecho (Audio)", desc: "Abrir menú Whisper IA / Denoise / Voz / Normalizar" },
      { keys: "Clic derecho (Capa)", desc: "Duplicar, reemplazar recurso, ocultar o eliminar" },
      { keys: "Clic derecho (Marcador)", desc: "Eliminar marcador de la regla del timeline" },
    ],
  },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export const AppSettingsModal: React.FC = () => {
  const open = useStudioStore((s) => s.settingsModalOpen);
  const storeSection = useStudioStore((s) => s.settingsSection);
  const setOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const setStoreSection = useStudioStore((s) => s.setSettingsSection);
  const appSettings = useStudioStore((s) => s.appSettings);
  const updateAppSettings = useStudioStore((s) => s.updateAppSettings);
  const resetAppSettings = useStudioStore((s) => s.resetAppSettings);
  const theme = useStudioStore((s) => s.theme);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);
  const capabilities = useStudioStore((s) => s.capabilities);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const setActiveView = useStudioStore((s) => s.setActiveView);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);
  const setOnboardingOpen = useStudioStore((s) => s.setOnboardingOpen);
  const setOnboardingStatus = useStudioStore((s) => s.setOnboardingStatus);

  const section = (storeSection as SettingsSection) || "render";
  const setSection = (next: SettingsSection) => setStoreSection(next);
  const [storageStats, setStorageStats] = useState<StorageStatsResponse | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<string | null>(null);

  const loadStorageStats = async () => {
    setLoadingStorage(true);
    try {
      const stats = await studioApi.getStorageStats();
      setStorageStats(stats);
    } catch {
      // ignore transient offline error
    } finally {
      setLoadingStorage(false);
    }
  };

  useEffect(() => {
    if (open && (section === "storage" || section === "hardware" || section === "system")) {
      void loadStorageStats();
    }
  }, [open, section]);

  if (!open) return null;

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await studioApi.clearLibraryCache();
      await loadStorageStats();
      setBusyNotice("Caché de librerías vaciada correctamente.");
      window.setTimeout(() => setBusyNotice(null), 2600);
    } finally {
      setClearingCache(false);
    }
  };

  const handleCheckUpdates = () => {
    setCheckingUpdates(true);
    setUpdateCheckMsg(null);
    window.setTimeout(() => {
      setCheckingUpdates(false);
      setUpdateCheckMsg(
        `Estás ejecutando Storia Studio v0.2.0 (${appSettings.updateChannel === "beta" ? "canal Beta" : "canal Estable"}). El servidor de actualizaciones automáticas estará disponible en una próxima versión.`,
      );
    }, 650);
  };

  const totalStorage = Math.max(1, storageStats?.totalBytes ?? 1);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(5, 7, 12, 0.78)", backdropFilter: "blur(8px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="glass-elevated w-full max-w-[960px] h-[94dvh] sm:h-[650px] max-h-[94dvh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-3.5 sm:px-5 py-2.5 sm:py-3 flex items-center justify-between gap-2 border-b shrink-0"
          style={{ borderColor: "var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Settings size={16} className="shrink-0" style={{ color: "var(--accent-primary)" }} />
            <h2 className="text-[13.5px] sm:text-[14.5px] font-bold tracking-tight truncate">
              Configuración de Storia Studio
            </h2>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              className="studio-btn !py-1 !px-2 sm:!px-2.5 !text-[10.5px]"
              onClick={() => {
                resetAppSettings();
                setBusyNotice("Ajustes restaurados a valores recomendados.");
                window.setTimeout(() => setBusyNotice(null), 2200);
              }}
              title="Restaurar valores por defecto"
            >
              <RotateCcw size={12} /> <span className="hidden sm:inline">Restaurar defaults</span>
            </button>
            <button className="studio-btn !p-1.5" onClick={() => setOpen(false)} title="Cerrar">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Body: Horizontal Scrollable Pills on Mobile, Categorized Sidebar on Tablet/Desktop */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <nav
            className="w-full md:w-[218px] shrink-0 border-b md:border-b-0 md:border-r p-2 md:p-2.5 flex flex-row md:flex-col gap-1.5 md:gap-3 overflow-x-auto md:overflow-y-auto no-scrollbar"
            style={{ borderColor: "var(--border-subtle)", background: "rgba(0,0,0,0.14)" }}
          >
            {NAV_GROUPS.map((grp) => (
              <div key={grp.group} className="flex flex-row md:flex-col gap-1 md:gap-0.5 shrink-0">
                <div
                  className="hidden md:block px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {grp.group}
                </div>
                {grp.items.map((item) => {
                  const active = section === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSection(item.id)}
                      className="flex items-center gap-1.5 md:gap-2 px-2.5 py-1.5 rounded-lg text-[11px] md:text-[11.5px] font-medium cursor-pointer text-left transition-colors shrink-0"
                      style={{
                        background: active ? "var(--glass-active)" : "transparent",
                        color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                        border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
                      }}
                    >
                      {item.icon}
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

          {/* Active Section Content */}
          <div className="flex-1 min-w-0 p-3.5 sm:p-5 overflow-y-auto flex flex-col gap-4">
            {/* ============================================================= */}
            {/* 1. RENDERIZADO                                                */}
            {/* ============================================================= */}
            {section === "render" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Motor de Renderizado WebGL2 &amp; PixiJS</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Controla la calidad de vista previa en vivo, suavizado vectorial, Motion Blur sub-frame y caché de texturas GPU.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Calidad de vista previa en vivo
                    <select
                      className="studio-input"
                      value={appSettings.previewQuality}
                      onChange={(e) => updateAppSettings({ previewQuality: e.target.value as typeof appSettings.previewQuality })}
                    >
                      <option value="full" style={{ background: "#14161c", color: "#f3f4f6" }}>Completa (1:1 Nítido)</option>
                      <option value="half" style={{ background: "#14161c", color: "#f3f4f6" }}>Media (1/2 · Rápida)</option>
                      <option value="proxy" style={{ background: "#14161c", color: "#f3f4f6" }}>Proxy (1/4 · Ultra fluida)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Muestras de Motion Blur por defecto ({appSettings.defaultMotionBlurSamples}x)
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultMotionBlurSamples}
                      onChange={(e) => updateAppSettings({ defaultMotionBlurSamples: Number(e.target.value) })}
                    >
                      <option value={1} style={{ background: "#14161c", color: "#f3f4f6" }}>1x (Desactivado)</option>
                      <option value={2} style={{ background: "#14161c", color: "#f3f4f6" }}>2x (Sutil)</option>
                      <option value={4} style={{ background: "#14161c", color: "#f3f4f6" }}>4x (Cinematográfico)</option>
                      <option value={8} style={{ background: "#14161c", color: "#f3f4f6" }}>8x (Alta calidad)</option>
                      <option value={16} style={{ background: "#14161c", color: "#f3f4f6" }}>16x (Máxima suavidad)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Ángulo de obturación ({appSettings.defaultShutterAngle}°)
                    <input
                      type="range"
                      min={0}
                      max={360}
                      step={15}
                      value={appSettings.defaultShutterAngle}
                      onChange={(e) => updateAppSettings({ defaultShutterAngle: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Límite de caché de texturas GPU ({appSettings.textureCacheLimit} texturas)
                    <input
                      type="range"
                      min={30}
                      max={300}
                      step={10}
                      value={appSettings.textureCacheLimit}
                      onChange={(e) => updateAppSettings({ textureCacheLimit: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.webglAntialias}
                      onChange={(e) => updateAppSettings({ webglAntialias: e.target.checked })}
                    />
                    Activar suavizado (Antialiasing) en vectores y texto WebGL2
                  </label>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.pixelSnapDefault}
                      onChange={(e) => updateAppSettings({ pixelSnapDefault: e.target.checked })}
                    />
                    Ajuste a cuadrícula de píxeles (Pixel Snap) por defecto en nuevos proyectos
                  </label>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 2. EXPORTACIÓN                                                */}
            {/* ============================================================= */}
            {section === "export" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Parámetros de Exportación MP4 (FFmpeg)</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Configuración predeterminada al crear nuevos proyectos y al exportar videos con render paralelo multi-worker.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Formato por defecto
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultAspectRatio}
                      onChange={(e) => updateAppSettings({ defaultAspectRatio: e.target.value as typeof appSettings.defaultAspectRatio })}
                    >
                      <option value="9:16" style={{ background: "#14161c", color: "#f3f4f6" }}>9:16 Vertical</option>
                      <option value="16:9" style={{ background: "#14161c", color: "#f3f4f6" }}>16:9 Horizontal</option>
                      <option value="1:1" style={{ background: "#14161c", color: "#f3f4f6" }}>1:1 Cuadrado</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Resolución
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultResolution}
                      onChange={(e) => updateAppSettings({ defaultResolution: e.target.value as typeof appSettings.defaultResolution })}
                    >
                      <option value="720p" style={{ background: "#14161c", color: "#f3f4f6" }}>720p HD</option>
                      <option value="1080p" style={{ background: "#14161c", color: "#f3f4f6" }}>1080p Full HD</option>
                      <option value="2k" style={{ background: "#14161c", color: "#f3f4f6" }}>2K QHD</option>
                      <option value="4k" style={{ background: "#14161c", color: "#f3f4f6" }}>4K UHD</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Fotogramas (FPS)
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultFps}
                      onChange={(e) => updateAppSettings({ defaultFps: Number(e.target.value) as 24 | 30 | 60 })}
                    >
                      <option value={24} style={{ background: "#14161c", color: "#f3f4f6" }}>24 FPS (Cine)</option>
                      <option value={30} style={{ background: "#14161c", color: "#f3f4f6" }}>30 FPS (Estándar)</option>
                      <option value={60} style={{ background: "#14161c", color: "#f3f4f6" }}>60 FPS (Ultra fluido)</option>
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Codificador de video preferido
                    <select
                      className="studio-input"
                      value={appSettings.preferredEncoder}
                      onChange={(e) => updateAppSettings({ preferredEncoder: e.target.value as typeof appSettings.preferredEncoder })}
                    >
                      <option value="auto" style={{ background: "#14161c", color: "#f3f4f6" }}>Automático (GPU NVENC → CPU)</option>
                      <option value="gpu" style={{ background: "#14161c", color: "#f3f4f6" }}>Priorizar GPU NVIDIA NVENC</option>
                      <option value="cpu" style={{ background: "#14161c", color: "#f3f4f6" }}>Solo CPU (libx264 máxima compatibilidad)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Concurrencia paralela ({appSettings.defaultExportConcurrency === 0 ? "Auto" : `${appSettings.defaultExportConcurrency}× workers`})
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultExportConcurrency}
                      onChange={(e) => updateAppSettings({ defaultExportConcurrency: Number(e.target.value) })}
                    >
                      <option value={0} style={{ background: "#14161c", color: "#f3f4f6" }}>Automático (CPU/2)</option>
                      <option value={1} style={{ background: "#14161c", color: "#f3f4f6" }}>1× Secuencial (Bajo consumo RAM)</option>
                      <option value={2} style={{ background: "#14161c", color: "#f3f4f6" }}>2× Workers paralelos</option>
                      <option value={4} style={{ background: "#14161c", color: "#f3f4f6" }}>4× Workers paralelos</option>
                      <option value={6} style={{ background: "#14161c", color: "#f3f4f6" }}>6× Workers paralelos</option>
                      <option value={8} style={{ background: "#14161c", color: "#f3f4f6" }}>8× Workers (Máxima velocidad)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Calidad CRF / CQ ({appSettings.defaultCrf} · menor = mayor calidad)
                    <input
                      type="range"
                      min={12}
                      max={28}
                      value={appSettings.defaultCrf}
                      onChange={(e) => updateAppSettings({ defaultCrf: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Bitrate de audio AAC
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.defaultAudioBitrateKbps}
                      onChange={(e) => updateAppSettings({ defaultAudioBitrateKbps: Number(e.target.value) as 128 | 192 | 256 | 320 })}
                    >
                      <option value={128} style={{ background: "#14161c", color: "#f3f4f6" }}>128 kbps (Compacto)</option>
                      <option value={192} style={{ background: "#14161c", color: "#f3f4f6" }}>192 kbps (Recomendado)</option>
                      <option value={256} style={{ background: "#14161c", color: "#f3f4f6" }}>256 kbps (Alta fidelidad)</option>
                      <option value={320} style={{ background: "#14161c", color: "#f3f4f6" }}>320 kbps (Estudio)</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.autoBurnSubtitles}
                      onChange={(e) => updateAppSettings({ autoBurnSubtitles: e.target.checked })}
                    />
                    Incrustar (quemar) subtítulos en el MP4 exportado por defecto
                  </label>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.exportSrtSidecar}
                      onChange={(e) => updateAppSettings({ exportSrtSidecar: e.target.checked })}
                    />
                    Generar también archivo .SRT adjunto junto al video exportado
                  </label>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 3. EDITOR                                                     */}
            {/* ============================================================= */}
            {section === "editor" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Comportamiento del Editor y Timeline</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Ajusta autoguardado, duraciones por defecto de escenas y transiciones, sensibilidad del ajuste magnético e historial.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Autoguardado ({appSettings.autosaveDebounceMs} ms)
                    <input
                      type="range"
                      min={150}
                      max={2000}
                      step={50}
                      value={appSettings.autosaveDebounceMs}
                      onChange={(e) => updateAppSettings({ autosaveDebounceMs: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Duración por defecto de nueva escena ({appSettings.defaultSceneDuration.toFixed(1)}s)
                    <input
                      type="range"
                      min={1}
                      max={15}
                      step={0.5}
                      value={appSettings.defaultSceneDuration}
                      onChange={(e) => updateAppSettings({ defaultSceneDuration: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Duración de transición por defecto ({appSettings.defaultTransitionDuration.toFixed(2)}s)
                    <input
                      type="range"
                      min={0.15}
                      max={1.5}
                      step={0.05}
                      value={appSettings.defaultTransitionDuration}
                      onChange={(e) => updateAppSettings({ defaultTransitionDuration: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Sensibilidad de ajuste magnético / Snap ({appSettings.snapThresholdPx} px)
                    <input
                      type="range"
                      min={2}
                      max={20}
                      step={1}
                      value={appSettings.snapThresholdPx}
                      onChange={(e) => updateAppSettings({ snapThresholdPx: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Zoom inicial del timeline ({appSettings.defaultTimelineZoom} px/s)
                    <input
                      type="range"
                      min={24}
                      max={180}
                      step={6}
                      value={appSettings.defaultTimelineZoom}
                      onChange={(e) => updateAppSettings({ defaultTimelineZoom: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Niveles de historial Deshacer / Rehacer ({appSettings.undoHistoryLimit})
                    <input
                      type="range"
                      min={20}
                      max={200}
                      step={10}
                      value={appSettings.undoHistoryLimit}
                      onChange={(e) => updateAppSettings({ undoHistoryLimit: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 4. INTERFAZ                                                   */}
            {/* ============================================================= */}
            {section === "interface" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Apariencia e Interfaz de Usuario</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Personaliza el tema visual, densidad de paneles, ondas de audio, zonas seguras y pantalla de inicio.
                  </p>
                </div>

                <div
                  className="rounded-xl p-3 flex items-center justify-between"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="text-[12px] font-medium">Tema visual de la aplicación</div>
                    <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                      Alterna entre tema oscuro editorial y tema claro
                    </div>
                  </div>
                  <button className="studio-btn !px-3 !py-1.5" onClick={toggleTheme}>
                    {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                    {theme === "dark" ? "Cambiar a Claro" : "Cambiar a Oscuro"}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Densidad de interfaz
                    <select
                      className="studio-input"
                      value={appSettings.uiDensity}
                      onChange={(e) => updateAppSettings({ uiDensity: e.target.value as "comfortable" | "compact" })}
                    >
                      <option value="comfortable" style={{ background: "#14161c", color: "#f3f4f6" }}>Cómoda (Recomendada)</option>
                      <option value="compact" style={{ background: "#14161c", color: "#f3f4f6" }}>Compacta (Más espacio de lienzo)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Esquema de atajos
                    <select
                      className="studio-input"
                      value={appSettings.keymapPreset}
                      onChange={(e) => updateAppSettings({ keymapPreset: e.target.value as typeof appSettings.keymapPreset })}
                    >
                      <option value="storia" style={{ background: "#14161c", color: "#f3f4f6" }}>Storia Studio (Estándar)</option>
                      <option value="capcut" style={{ background: "#14161c", color: "#f3f4f6" }}>Estilo CapCut</option>
                      <option value="premiere" style={{ background: "#14161c", color: "#f3f4f6" }}>Estilo Premiere / NLE</option>
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.startOnHomeHub}
                      onChange={(e) => updateAppSettings({ startOnHomeHub: e.target.checked })}
                    />
                    Abrir en la interfaz principal de proyectos (Inicio) al arrancar
                  </label>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.showTimelineWaveforms}
                      onChange={(e) => updateAppSettings({ showTimelineWaveforms: e.target.checked })}
                    />
                    Mostrar formas de onda de audio en tiempo real en el timeline
                  </label>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.showSafeZonesByDefault}
                      onChange={(e) => updateAppSettings({ showSafeZonesByDefault: e.target.checked })}
                    />
                    Mostrar zonas seguras (Reels / TikTok / YouTube) al abrir proyectos
                  </label>
                  <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={appSettings.showPerfStats}
                      onChange={(e) => updateAppSettings({ showPerfStats: e.target.checked })}
                    />
                    Mostrar métricas de rendimiento y fotogramas en el editor
                  </label>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 5. ATAJOS DE TECLADO                                          */}
            {/* ============================================================= */}
            {section === "shortcuts" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-bold mb-1">Atajos de Teclado del Estudio</h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Referencia rápida de controles de teclado y ratón activos en Storia Studio.
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-mono-code px-2 py-1 rounded-lg"
                    style={{ background: "var(--glass-hover)", color: "var(--accent-primary)" }}
                  >
                    Perfil: {appSettings.keymapPreset.toUpperCase()}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  {KEYBOARD_SHORTCUTS.map((group) => (
                    <div
                      key={group.category}
                      className="rounded-xl p-3 flex flex-col gap-1.5"
                      style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                    >
                      <div
                        className="text-[10.5px] font-bold uppercase tracking-wider pb-1 border-b"
                        style={{ color: "var(--accent-teal)", borderColor: "var(--border-subtle)" }}
                      >
                        {group.category}
                      </div>
                      {group.items.map((item) => (
                        <div key={item.keys} className="flex items-center justify-between text-[11.5px] py-0.5">
                          <span style={{ color: "var(--text-secondary)" }}>{item.desc}</span>
                          <kbd
                            className="font-mono-code text-[10px] px-2 py-0.5 rounded-md font-semibold"
                            style={{
                              background: "rgba(0,0,0,0.42)",
                              border: "1px solid var(--border-strong)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {item.keys}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 6. AUDIO (SEPARADO)                                           */}
            {/* ============================================================= */}
            {section === "audio" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Mezcla y Masterización de Audio (FFmpeg EBU R128)</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Configura sonoridad objetivo, techo True Peak, frecuencia de muestreo, ducking automático y curvas de fundido.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Sonoridad objetivo (Loudnorm 2 pasos)
                    <select
                      className="studio-input"
                      value={appSettings.defaultAudioLufs}
                      onChange={(e) => updateAppSettings({ defaultAudioLufs: Number(e.target.value) as -16 | -14 | -23 })}
                    >
                      <option value={-16} style={{ background: "#14161c", color: "#f3f4f6" }}>-16 LUFS (Reels / TikTok / Podcasts)</option>
                      <option value={-14} style={{ background: "#14161c", color: "#f3f4f6" }}>-14 LUFS (YouTube / Spotify)</option>
                      <option value={-23} style={{ background: "#14161c", color: "#f3f4f6" }}>-23 LUFS (Broadcast EBU R128)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Frecuencia de muestreo
                    <select
                      className="studio-input font-mono-code"
                      value={appSettings.audioSampleRate}
                      onChange={(e) => updateAppSettings({ audioSampleRate: Number(e.target.value) as 48000 | 44100 })}
                    >
                      <option value={48000} style={{ background: "#14161c", color: "#f3f4f6" }}>48,000 Hz (Estándar Video)</option>
                      <option value={44100} style={{ background: "#14161c", color: "#f3f4f6" }}>44,100 Hz (Música / CD)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Techo True Peak ({appSettings.audioTruePeakDbtp.toFixed(1)} dBTP)
                    <input
                      type="range"
                      min={-3}
                      max={-0.5}
                      step={0.1}
                      value={appSettings.audioTruePeakDbtp}
                      onChange={(e) => updateAppSettings({ audioTruePeakDbtp: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Atenuación Sidechain Ducking música ({appSettings.defaultDuckingDb} dB)
                    <input
                      type="range"
                      min={-24}
                      max={-3}
                      step={1}
                      value={appSettings.defaultDuckingDb}
                      onChange={(e) => updateAppSettings({ defaultDuckingDb: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Curva de Fade In / Out por defecto
                    <select
                      className="studio-input"
                      value={appSettings.defaultFadeCurve}
                      onChange={(e) => updateAppSettings({ defaultFadeCurve: e.target.value as typeof appSettings.defaultFadeCurve })}
                    >
                      <option value="smooth" style={{ background: "#14161c", color: "#f3f4f6" }}>Suave (S-Curve / qsin)</option>
                      <option value="linear" style={{ background: "#14161c", color: "#f3f4f6" }}>Lineal</option>
                      <option value="exp" style={{ background: "#14161c", color: "#f3f4f6" }}>Exponencial</option>
                      <option value="log" style={{ background: "#14161c", color: "#f3f4f6" }}>Logarítmica</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.masterLimiterEnabled}
                    onChange={(e) => updateAppSettings({ masterLimiterEnabled: e.target.checked })}
                  />
                  Activar limitador maestro anti-clipping en la exportación final
                </label>

                <div
                  className="rounded-xl p-3 text-[11px] flex flex-col gap-1"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)" }}
                >
                  <div className="font-semibold text-[11.5px]" style={{ color: "var(--text-primary)" }}>
                    Librerías de Audio y SFX (Sin API Key)
                  </div>
                  <div>• <strong>Openverse-SFX:</strong> +5.2M de efectos y música CC0/CC-BY con atribución automática.</div>
                  <div>• <strong>Wikimedia &amp; Internet Archive:</strong> millones de sonidos, foley y música de dominio público configurables en Ajustes › Librerías.</div>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 7. WHISPER IA (SEPARADO)                                      */}
            {/* ============================================================= */}
            {section === "whisper" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1 flex items-center gap-1.5">
                    <Mic size={14} style={{ color: "var(--accent-gold)" }} />
                    Whisper IA &amp; Paginación Rítmica de Subtítulos
                  </h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Ajustes del motor local de transcripción palabra por palabra y el algoritmo de ritmo TikTok / Reels.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Modelo Whisper IA local
                    <select
                      className="studio-input"
                      value={appSettings.whisperModel}
                      onChange={(e) => updateAppSettings({ whisperModel: e.target.value as typeof appSettings.whisperModel })}
                    >
                      <option value="tiny" style={{ background: "#14161c", color: "#f3f4f6" }}>tiny (Ultra rápido · ~75 MB)</option>
                      <option value="base" style={{ background: "#14161c", color: "#f3f4f6" }}>base (Equilibrado · ~145 MB)</option>
                      <option value="small" style={{ background: "#14161c", color: "#f3f4f6" }}>small (Alta precisión ES/EN · ~480 MB)</option>
                      <option value="medium" style={{ background: "#14161c", color: "#f3f4f6" }}>medium (Máxima precisión · ~1.5 GB)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Idioma principal de transcripción
                    <select
                      className="studio-input"
                      value={appSettings.whisperLanguage}
                      onChange={(e) => updateAppSettings({ whisperLanguage: e.target.value })}
                    >
                      <option value="es" style={{ background: "#14161c", color: "#f3f4f6" }}>Español (es)</option>
                      <option value="en" style={{ background: "#14161c", color: "#f3f4f6" }}>Inglés (en)</option>
                      <option value="pt" style={{ background: "#14161c", color: "#f3f4f6" }}>Portugués (pt)</option>
                      <option value="fr" style={{ background: "#14161c", color: "#f3f4f6" }}>Francés (fr)</option>
                      <option value="auto" style={{ background: "#14161c", color: "#f3f4f6" }}>Detección automática</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Dispositivo de inferencia Whisper
                    <select
                      className="studio-input"
                      value={appSettings.whisperDevice}
                      onChange={(e) => updateAppSettings({ whisperDevice: e.target.value as typeof appSettings.whisperDevice })}
                    >
                      <option value="auto" style={{ background: "#14161c", color: "#f3f4f6" }}>Automático (GPU CUDA → CPU)</option>
                      <option value="cuda" style={{ background: "#14161c", color: "#f3f4f6" }}>GPU NVIDIA (CUDA)</option>
                      <option value="cpu" style={{ background: "#14161c", color: "#f3f4f6" }}>CPU (Compatible en cualquier equipo)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Máx. palabras por bloque TikTok ({appSettings.tiktokMaxWordsPerPage})
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={appSettings.tiktokMaxWordsPerPage}
                      onChange={(e) => updateAppSettings({ tiktokMaxWordsPerPage: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Ventana de agrupación rítmica ({appSettings.tiktokCombineMs} ms)
                    <input
                      type="range"
                      min={500}
                      max={3000}
                      step={50}
                      value={appSettings.tiktokCombineMs}
                      onChange={(e) => updateAppSettings({ tiktokCombineMs: Number(e.target.value) })}
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Corte automático por silencio ({appSettings.tiktokSilenceBreakMs} ms)
                    <input
                      type="range"
                      min={150}
                      max={1200}
                      step={30}
                      value={appSettings.tiktokSilenceBreakMs}
                      onChange={(e) => updateAppSettings({ tiktokSilenceBreakMs: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.whisperAutoPunctuation}
                    onChange={(e) => updateAppSettings({ whisperAutoPunctuation: e.target.checked })}
                  />
                  Puntuación inteligente y sincronización exacta por palabra (Karaoke)
                </label>
              </>
            )}

            {/* ============================================================= */}
            {/* 8. VOZ TTS Y MODELOS LOCALES (SEPARADO)                       */}
            {/* ============================================================= */}
            {section === "tts" && (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[13.5px] font-bold mb-1">Texto a Voz (TTS) &amp; Modelos Locales</h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Define el proveedor por defecto, velocidad, parámetros de expresividad e instala voces offline (Piper / Kokoro).
                    </p>
                  </div>
                  <button
                    className="studio-btn studio-btn-accent !px-3 !py-1.5 !text-[11px] shrink-0"
                    onClick={() => {
                      setOpen(false);
                      setActiveView("editor");
                      setActiveLeftTab("tts");
                    }}
                  >
                    Abrir estudio TTS
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Proveedor TTS por defecto
                    <select
                      className="studio-input"
                      value={appSettings.defaultTtsProvider}
                      onChange={(e) =>
                        updateAppSettings({ defaultTtsProvider: e.target.value as typeof appSettings.defaultTtsProvider })
                      }
                    >
                      <option value="windows_sapi" style={{ background: "#14161c", color: "#f3f4f6" }}>Windows SAPI (Offline)</option>
                      <option value="elevenlabs" style={{ background: "#14161c", color: "#f3f4f6" }}>ElevenLabs</option>
                      <option value="voicestudio" style={{ background: "#14161c", color: "#f3f4f6" }}>VoiceStudio Local</option>
                      <option value="piper" style={{ background: "#14161c", color: "#f3f4f6" }}>Piper ONNX (Offline)</option>
                      <option value="kokoro" style={{ background: "#14161c", color: "#f3f4f6" }}>Kokoro-82M (Offline)</option>
                      <option value="openai" style={{ background: "#14161c", color: "#f3f4f6" }}>OpenAI TTS</option>
                      <option value="custom_api" style={{ background: "#14161c", color: "#f3f4f6" }}>API HTTP Personalizada</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Idioma TTS por defecto
                    <select
                      className="studio-input"
                      value={appSettings.defaultTtsLanguage}
                      onChange={(e) => updateAppSettings({ defaultTtsLanguage: e.target.value })}
                    >
                      <option value="es" style={{ background: "#14161c", color: "#f3f4f6" }}>Español (es)</option>
                      <option value="en" style={{ background: "#14161c", color: "#f3f4f6" }}>Inglés (en)</option>
                      <option value="pt" style={{ background: "#14161c", color: "#f3f4f6" }}>Portugués (pt)</option>
                      <option value="fr" style={{ background: "#14161c", color: "#f3f4f6" }}>Francés (fr)</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Velocidad ({appSettings.defaultTtsSpeed.toFixed(2)}×)
                    <input
                      type="range"
                      min={0.6}
                      max={1.6}
                      step={0.05}
                      value={appSettings.defaultTtsSpeed}
                      onChange={(e) => updateAppSettings({ defaultTtsSpeed: Number(e.target.value) })}
                    />
                  </label>
                </div>

                {/* ElevenLabs / Neural Fine-Tuning defaults */}
                <div
                  className="rounded-xl p-3 grid grid-cols-3 gap-2.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
                    Estabilidad ({Math.round(appSettings.elevenlabsStability * 100)}%)
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={appSettings.elevenlabsStability}
                      onChange={(e) => updateAppSettings({ elevenlabsStability: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
                    Similitud ({Math.round(appSettings.elevenlabsSimilarity * 100)}%)
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={appSettings.elevenlabsSimilarity}
                      onChange={(e) => updateAppSettings({ elevenlabsSimilarity: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10.5px]" style={{ color: "var(--text-secondary)" }}>
                    Expresividad ({Math.round(appSettings.elevenlabsStyle * 100)}%)
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={appSettings.elevenlabsStyle}
                      onChange={(e) => updateAppSettings({ elevenlabsStyle: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.ttsAutoSubtitles}
                    onChange={(e) => updateAppSettings({ ttsAutoSubtitles: e.target.checked })}
                  />
                  Generar subtítulos sincronizados con Whisper automáticamente al sintetizar voz
                </label>

                <div className="pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                  <ProvidersSettingsPanel mode="local_installs" />
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 9. APIS Y CREDENCIALES (SEPARADO)                             */}
            {/* ============================================================= */}
            {section === "apis" && <ProvidersSettingsPanel mode="apis" />}

            {section === "libraries" && <LibrariesSettingsPanel />}

            {/* ============================================================= */}
            {/* 10-12. RED LOCAL, REMOTO Y MCP                                */}
            {/* ============================================================= */}
            {section === "network" && <ConnectivitySettingsPanel view="network" />}
            {section === "remote" && <ConnectivitySettingsPanel view="remote" />}
            {section === "mcp" && <ConnectivitySettingsPanel view="mcp" />}

            {/* ============================================================= */}
            {/* 13. ALMACENAMIENTO (RENOMBRADO DE CACHÉ DE LIBRERÍAS)         */}
            {/* ============================================================= */}
            {section === "storage" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-bold mb-1">Almacenamiento, Proyectos, Modelos y Caché</h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Desglose real del espacio ocupado en disco por Storia Studio y políticas de caché de librerías externas.
                    </p>
                  </div>
                  <button className="studio-btn !p-1.5" onClick={() => void loadStorageStats()} title="Recalcular uso en disco">
                    <RefreshCw size={13} className={loadingStorage ? "animate-spin" : ""} />
                  </button>
                </div>

                {/* Total Storage Summary + Visual Distribution Bar */}
                <div
                  className="rounded-xl p-3.5 flex flex-col gap-2.5"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11.5px] font-semibold">Espacio total usado por Storia Studio</span>
                    <span className="text-[16px] font-extrabold font-mono-code" style={{ color: "var(--accent-primary)" }}>
                      {formatBytes(storageStats?.totalBytes ?? 0)}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-black/40">
                    <div
                      style={{
                        width: `${Math.max(2, ((storageStats?.projects.bytes ?? 0) / totalStorage) * 100)}%`,
                        background: "#f7c8d6",
                      }}
                      title="Proyectos y assets"
                    />
                    <div
                      style={{
                        width: `${Math.max(1, ((storageStats?.exports.bytes ?? 0) / totalStorage) * 100)}%`,
                        background: "#ffd447",
                      }}
                      title="Videos exportados MP4"
                    />
                    <div
                      style={{
                        width: `${Math.max(1, ((storageStats?.models.bytes ?? 0) / totalStorage) * 100)}%`,
                        background: "#a855f7",
                      }}
                      title="Modelos IA locales"
                    />
                    <div
                      style={{
                        width: `${Math.max(1, ((storageStats?.cache.totalBytes ?? 0) / totalStorage) * 100)}%`,
                        background: "#4ce6c8",
                      }}
                      title="Caché de librerías"
                    />
                  </div>
                </div>

                {/* 4 Breakdown Cards */}
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl p-3" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[10px] uppercase flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="w-2 h-2 rounded-full bg-[#f7c8d6]" /> Proyectos y Assets
                    </div>
                    <div className="text-[16px] font-bold font-mono-code mt-0.5">
                      {formatBytes(storageStats?.projects.bytes ?? 0)}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {storageStats?.projects.count ?? 0} proyectos · {storageStats?.projects.files ?? 0} archivos
                    </div>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[10px] uppercase flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="w-2 h-2 rounded-full bg-[#ffd447]" /> Exportaciones MP4 / SRT
                    </div>
                    <div className="text-[16px] font-bold font-mono-code mt-0.5">
                      {formatBytes(storageStats?.exports.bytes ?? 0)}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {storageStats?.exports.files ?? 0} archivos renderizados
                    </div>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[10px] uppercase flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="w-2 h-2 rounded-full bg-[#a855f7]" /> Modelos IA Locales (TTS)
                    </div>
                    <div className="text-[16px] font-bold font-mono-code mt-0.5">
                      {formatBytes(storageStats?.models.bytes ?? 0)}
                    </div>
                    <div className="text-[10px] truncate font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {storageStats?.models.files ?? 0} archivos · Piper / Kokoro
                    </div>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                    <div className="text-[10px] uppercase flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <span className="w-2 h-2 rounded-full bg-[#4ce6c8]" /> Caché de Librerías
                    </div>
                    <div className="text-[16px] font-bold font-mono-code mt-0.5">
                      {formatBytes(storageStats?.cache.totalBytes ?? 0)}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {storageStats?.cache.svgFiles ?? 0} SVGs · {storageStats?.cache.audioFiles ?? 0} audios · {storageStats?.cache.searchEntries ?? 0} búsquedas
                    </div>
                  </div>
                </div>

                {/* Cache Policies */}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Límite máximo de caché ({appSettings.maxCacheSizeMb} MB)
                    <input
                      type="range"
                      min={256}
                      max={8192}
                      step={256}
                      value={appSettings.maxCacheSizeMb}
                      onChange={(e) => updateAppSettings({ maxCacheSizeMb: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Retención de caché ({appSettings.cacheTtlDays} días)
                    <input
                      type="range"
                      min={7}
                      max={90}
                      step={1}
                      value={appSettings.cacheTtlDays}
                      onChange={(e) => updateAppSettings({ cacheTtlDays: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.autoCacheLibraries}
                    onChange={(e) => updateAppSettings({ autoCacheLibraries: e.target.checked })}
                  />
                  Guardar automáticamente búsquedas y archivos de Openverse, Wikimedia e Iconify en caché local
                </label>

                <div
                  className="rounded-xl p-3 flex items-center justify-between gap-3"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium">Limpiar caché temporal de librerías</div>
                    <div className="text-[10px] font-mono-code truncate" style={{ color: "var(--text-muted)" }}>
                      {storageStats?.cache.cacheDir ?? "models/cache/libraries"}
                    </div>
                  </div>
                  <button
                    disabled={clearingCache}
                    onClick={() => void handleClearCache()}
                    className="studio-btn !px-3 !py-1.5 !text-[11px] shrink-0"
                    style={{ color: "var(--accent-danger)", borderColor: "rgba(255,100,112,0.35)" }}
                  >
                    {clearingCache ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    Vaciar caché
                  </button>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 14. HARDWARE (SEPARADO)                                       */}
            {/* ============================================================= */}
            {section === "hardware" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Hardware, GPU y Rendimiento</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Diagnóstico de CPU, RAM y codificadores acelerados por GPU detectados en tu equipo.
                  </p>
                </div>

                <div
                  className="rounded-xl p-3.5 flex flex-col gap-2 text-[11.5px] font-mono-code"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "var(--text-muted)" }}>Procesador:</span>
                    <span className="truncate text-right">{storageStats?.runtime.cpuModel ?? "Detectando…"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Núcleos / Hilos CPU:</span>
                    <span>{capabilities?.cpus ?? storageStats?.runtime.cpus ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Memoria RAM (Libre / Total):</span>
                    <span>
                      {storageStats
                        ? `${storageStats.runtime.freeMemGb} GB / ${storageStats.runtime.totalMemGb} GB`
                        : capabilities
                          ? `${capabilities.totalMemGb} GB`
                          : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Codificador recomendado:</span>
                    <span style={{ color: "var(--accent-teal)" }}>{capabilities?.recommendedEncoder ?? "libx264"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span style={{ color: "var(--text-muted)" }}>Codificadores GPU/CPU:</span>
                    <span className="text-right">
                      {capabilities
                        ? [
                            capabilities.encoders.h264_nvenc ? "H.264 NVENC" : null,
                            capabilities.encoders.hevc_nvenc ? "HEVC NVENC" : null,
                            capabilities.encoders.av1_nvenc ? "AV1 NVENC" : null,
                            capabilities.encoders.libx264 ? "libx264 (CPU)" : null,
                          ]
                            .filter(Boolean)
                            .join(", ") || "Ninguno"
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Tope máximo de workers paralelos ({appSettings.maxParallelWorkers})
                    <input
                      type="range"
                      min={1}
                      max={8}
                      step={1}
                      value={appSettings.maxParallelWorkers}
                      onChange={(e) => updateAppSettings({ maxParallelWorkers: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.hardwareAcceleration}
                    onChange={(e) => updateAppSettings({ hardwareAcceleration: e.target.checked })}
                  />
                  Habilitar aceleración por hardware (WebGL2 GPU + NVIDIA NVENC cuando esté disponible)
                </label>
              </>
            )}

            {/* ============================================================= */}
            {/* 15. SISTEMA (SEPARADO)                                        */}
            {/* ============================================================= */}
            {section === "system" && (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-[13.5px] font-bold mb-1">Entorno del Sistema y Servidor Local</h3>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Información del sistema operativo, motor Node.js, FFmpeg, tiempo de ejecución y nivel de registro.
                    </p>
                  </div>
                  <button className="studio-btn !p-1.5" onClick={() => void loadStorageStats()} title="Refrescar estado">
                    <RefreshCw size={13} className={loadingStorage ? "animate-spin" : ""} />
                  </button>
                </div>

                <div
                  className="rounded-xl p-3.5 flex flex-col gap-2 text-[11.5px] font-mono-code"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Sistema operativo:</span>
                    <span>
                      {storageStats
                        ? `${storageStats.runtime.platform} (${storageStats.runtime.arch}) · ${storageStats.runtime.osRelease}`
                        : capabilities?.platform ?? "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Runtime Node.js:</span>
                    <span>{storageStats?.runtime.nodeVersion ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>FFmpeg instalado:</span>
                    <span style={{ color: capabilities?.ffmpegVersion ? "var(--accent-teal)" : "var(--accent-danger)" }}>
                      {capabilities?.ffmpegVersion ? `Sí (${capabilities.ffmpegVersion})` : "No detectado"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Servidor escuchando en:</span>
                    <span>
                      {storageStats ? `${storageStats.runtime.listeningHost}:${storageStats.runtime.listeningPort}` : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-muted)" }}>Tiempo activo (Uptime):</span>
                    <span>{storageStats ? formatUptime(storageStats.runtime.uptimeSec) : "—"}</span>
                  </div>
                </div>

                <label className="flex flex-col gap-1 text-[11px] max-w-xs" style={{ color: "var(--text-secondary)" }}>
                  Nivel de detalle en registros (Logs)
                  <select
                    className="studio-input"
                    value={appSettings.logVerbosity}
                    onChange={(e) => updateAppSettings({ logVerbosity: e.target.value as typeof appSettings.logVerbosity })}
                  >
                    <option value="minimal" style={{ background: "#14161c", color: "#f3f4f6" }}>Mínimo (Solo errores)</option>
                    <option value="normal" style={{ background: "#14161c", color: "#f3f4f6" }}>Normal (Recomendado)</option>
                    <option value="verbose" style={{ background: "#14161c", color: "#f3f4f6" }}>Detallado (Diagnóstico)</option>
                  </select>
                </label>

                <div
                  className="rounded-xl p-3 flex items-center justify-between gap-3"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="text-[11.5px] font-medium">Asistente de configuración inicial (Onboarding)</div>
                    <div className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                      Vuelve a abrir el asistente para revisar carpetas de proyectos, modelos IA, librerías o túneles.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="studio-btn !px-3 !py-1.5 !text-[11px] shrink-0"
                    onClick={async () => {
                      try {
                        const st = await studioApi.getOnboardingStatus();
                        setOnboardingStatus(st);
                        setOpen(false);
                        setOnboardingOpen(true);
                      } catch {
                        setBusyNotice("El asistente de configuración solo está disponible en el equipo local.");
                        window.setTimeout(() => setBusyNotice(null), 2600);
                      }
                    }}
                  >
                    Abrir asistente
                  </button>
                </div>
              </>
            )}

            {/* ============================================================= */}
            {/* 16. ACTUALIZACIONES                                           */}
            {/* ============================================================= */}
            {section === "updates" && (
              <>
                <div>
                  <h3 className="text-[13.5px] font-bold mb-1">Actualizaciones de Storia Studio</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Gestiona el canal de lanzamientos y prepara el equipo para el sistema de actualizaciones automáticas.
                  </p>
                </div>

                <div
                  className="rounded-xl p-4 flex items-center justify-between gap-3"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-extrabold font-mono-code">v0.2.0</span>
                      <span
                        className="text-[9.5px] font-mono-code px-2 py-0.5 rounded-full font-semibold"
                        style={{ background: "rgba(76,230,200,0.16)", color: "var(--accent-teal)" }}
                      >
                        SOPORTE PRÓXIMO
                      </span>
                    </div>
                    <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
                      El actualizador automático con descarga incremental y notas de versión estará disponible próximamente.
                    </div>
                  </div>
                  <button
                    className="studio-btn studio-btn-accent !px-3.5 !py-1.5 !text-[11px] shrink-0"
                    disabled={checkingUpdates}
                    onClick={handleCheckUpdates}
                  >
                    {checkingUpdates ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Buscar actualizaciones
                  </button>
                </div>

                {updateCheckMsg && (
                  <div
                    className="rounded-xl px-3 py-2 text-[11px]"
                    style={{ background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)", color: "#bae6fd" }}
                  >
                    {updateCheckMsg}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                    Canal de actualizaciones
                    <select
                      className="studio-input"
                      value={appSettings.updateChannel}
                      onChange={(e) => updateAppSettings({ updateChannel: e.target.value as "stable" | "beta" })}
                    >
                      <option value="stable" style={{ background: "#14161c", color: "#f3f4f6" }}>Estable (Recomendado)</option>
                      <option value="beta" style={{ background: "#14161c", color: "#f3f4f6" }}>Beta / Acceso anticipado</option>
                    </select>
                  </label>
                </div>

                <label className="flex items-center gap-2 text-[11.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={appSettings.autoCheckUpdates}
                    onChange={(e) => updateAppSettings({ autoCheckUpdates: e.target.checked })}
                  />
                  Comprobar automáticamente si hay nuevas versiones al iniciar Storia Studio
                </label>
              </>
            )}

            {/* ============================================================= */}
            {/* 17. SOBRE NOSOTROS                                            */}
            {/* ============================================================= */}
            {section === "about" && (
              <>
                <div
                  className="rounded-2xl p-5 flex flex-col gap-3"
                  style={{
                    background:
                      "radial-gradient(circle at 90% 15%, rgba(247,200,214,0.2), transparent 55%), var(--glass-hover)",
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-base shadow-lg"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-ink)" }}
                    >
                      ST
                    </div>
                    <div>
                      <h3 className="text-[16px] font-extrabold tracking-tight flex items-center gap-2">
                        Storia Studio
                        <span
                          className="text-[10px] font-mono-code px-2 py-0.5 rounded-full"
                          style={{ background: "var(--glass-active)", color: "var(--accent-primary)" }}
                        >
                          v0.2.0
                        </span>
                      </h3>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        Editor NLE 2D Profesional · Local-First · Potenciado por IA y MCP
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <strong>Storia Studio</strong> es un estudio de creación y animación de video 2D diseñado para creadores de contenido narrativo, educativo y cinematográfico. Combina un motor determinista WebGL2 a 60 FPS, física de resortes y curvas tipo Remotion, subtítulos dinámicos nivel CapCut, personajes articulados, edición de código SVG en tiempo real y exportación MP4 paralela con Motion Blur.
                  </p>

                  <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Su arquitectura local-first mantiene tus proyectos, modelos de voz y credenciales cifradas (AES-256-GCM) bajo tu control total, al mismo tiempo que permite colaborar en vivo con agentes de IA mediante el protocolo <strong>Model Context Protocol (MCP)</strong>.
                  </p>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t text-[10.5px]" style={{ borderColor: "var(--border-subtle)" }}>
                    <div className="rounded-lg p-2 bg-black/20">
                      <div className="font-bold flex items-center gap-1" style={{ color: "var(--accent-primary)" }}>
                        <Sparkles size={11} /> Motor Visual
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>PixiJS v8 · WebGL2 · Remotion Math</div>
                    </div>
                    <div className="rounded-lg p-2 bg-black/20">
                      <div className="font-bold flex items-center gap-1" style={{ color: "var(--accent-teal)" }}>
                        <Film size={11} /> Exportación
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>FFmpeg NVENC/CPU · -16 LUFS</div>
                    </div>
                    <div className="rounded-lg p-2 bg-black/20">
                      <div className="font-bold flex items-center gap-1" style={{ color: "var(--accent-gold)" }}>
                        <Bot size={11} /> Automatización
                      </div>
                      <div style={{ color: "var(--text-muted)" }}>50+ Tools MCP · Bóveda aislada</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
