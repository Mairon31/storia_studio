import { create } from "zustand";
import { temporal } from "zundo";
import {
  applyProjectOperations,
  createDemoProject,
  createEditReceipt,
  EditReceipt,
  ExportSettings,
  getProjectDuration,
  Project,
  ProjectOperation,
  resolveSceneAtTime,
} from "@storia/schema";
import {
  connectProjectSocket,
  ExportFileEntry,
  ExportJob,
  LibraryCatalogItem,
  LibraryId,
  OnboardingStatusPayload,
  ProjectSummary,
  studioApi,
  SystemCapabilities,
} from "../lib/api";

const DEFAULT_ENABLED_LIBRARIES: Record<LibraryId, boolean> = {
  openverse: true,
  iconify: true,
  wikimedia: true,
  internet_archive: false,
  pixel_game_sprites: false,
  openmoji_props: false,
  svg_backgrounds: false,
  local_videos: false,
  local_workspace: false,
};

export type LeftTab = "scenes" | "assets" | "vectors" | "audio" | "tts" | "transitions" | "effects" | "cast" | "subtitles" | "fx" | "styles";

export type ReplaceTarget =
  | { kind: "layer"; sceneId: string; layerId: string }
  | { kind: "audio"; trackId: string; clipId: string };
export type ThemeMode = "dark" | "light";
export type StudioView = "home" | "editor";
export type UiLayoutMode = "auto" | "desktop" | "mobile";

const UI_LAYOUT_MODE_KEY = "storia_ui_layout_mode_v1";

function loadSavedUiLayoutMode(): UiLayoutMode {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(UI_LAYOUT_MODE_KEY);
    if (raw === "auto" || raw === "desktop" || raw === "mobile") return raw;
  } catch {
    // Ignore storage failures
  }
  return "auto";
}

export interface AppSettings {
  // Renderizado
  previewQuality: "full" | "half" | "proxy";
  webglAntialias: boolean;
  defaultMotionBlurSamples: number;
  defaultShutterAngle: number;
  pixelSnapDefault: boolean;
  textureCacheLimit: number;
  // Exportación
  defaultAspectRatio: "9:16" | "16:9" | "1:1";
  defaultResolution: "720p" | "1080p" | "2k" | "4k";
  defaultFps: 24 | 30 | 60;
  preferredEncoder: "auto" | "gpu" | "cpu";
  defaultCrf: number;
  defaultExportConcurrency: number;
  defaultAudioBitrateKbps: 128 | 192 | 256 | 320;
  autoBurnSubtitles: boolean;
  exportSrtSidecar: boolean;
  // Editor
  autosaveDebounceMs: number;
  defaultSceneDuration: number;
  defaultTransitionDuration: number;
  snapThresholdPx: number;
  defaultTimelineZoom: number;
  undoHistoryLimit: number;
  // Interfaz
  uiDensity: "comfortable" | "compact";
  showTimelineWaveforms: boolean;
  showSafeZonesByDefault: boolean;
  startOnHomeHub: boolean;
  showPerfStats: boolean;
  keymapPreset: "storia" | "premiere" | "capcut";
  // Audio
  defaultAudioLufs: -16 | -14 | -23;
  audioTruePeakDbtp: number;
  audioSampleRate: 48000 | 44100;
  defaultDuckingDb: number;
  defaultFadeCurve: "linear" | "smooth" | "exp" | "log";
  masterLimiterEnabled: boolean;
  // Whisper IA
  whisperModel: "tiny" | "base" | "small" | "medium";
  whisperLanguage: string;
  whisperDevice: "auto" | "cpu" | "cuda";
  whisperAutoPunctuation: boolean;
  tiktokMaxWordsPerPage: number;
  tiktokCombineMs: number;
  tiktokSilenceBreakMs: number;
  // Voz TTS
  defaultTtsProvider: "windows_sapi" | "elevenlabs" | "voicestudio" | "piper" | "kokoro" | "openai" | "custom_api";
  defaultTtsSpeed: number;
  defaultTtsLanguage: string;
  ttsAutoSubtitles: boolean;
  elevenlabsStability: number;
  elevenlabsSimilarity: number;
  elevenlabsStyle: number;
  // Almacenamiento & Caché
  autoCacheLibraries: boolean;
  maxCacheSizeMb: number;
  cacheTtlDays: number;
  // Hardware & Sistema & Actualizaciones
  hardwareAcceleration: boolean;
  maxParallelWorkers: number;
  logVerbosity: "minimal" | "normal" | "verbose";
  updateChannel: "stable" | "beta";
  autoCheckUpdates: boolean;
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  previewQuality: "full",
  webglAntialias: true,
  defaultMotionBlurSamples: 1,
  defaultShutterAngle: 180,
  pixelSnapDefault: false,
  textureCacheLimit: 120,
  defaultAspectRatio: "9:16",
  defaultResolution: "1080p",
  defaultFps: 30,
  preferredEncoder: "auto",
  defaultCrf: 18,
  defaultExportConcurrency: 0,
  defaultAudioBitrateKbps: 192,
  autoBurnSubtitles: true,
  exportSrtSidecar: false,
  autosaveDebounceMs: 320,
  defaultSceneDuration: 4,
  defaultTransitionDuration: 0.4,
  snapThresholdPx: 8,
  defaultTimelineZoom: 72,
  undoHistoryLimit: 60,
  uiDensity: "comfortable",
  showTimelineWaveforms: true,
  showSafeZonesByDefault: false,
  startOnHomeHub: true,
  showPerfStats: false,
  keymapPreset: "storia",
  defaultAudioLufs: -16,
  audioTruePeakDbtp: -1.5,
  audioSampleRate: 48000,
  defaultDuckingDb: -12,
  defaultFadeCurve: "smooth",
  masterLimiterEnabled: true,
  whisperModel: "small",
  whisperLanguage: "es",
  whisperDevice: "auto",
  whisperAutoPunctuation: true,
  tiktokMaxWordsPerPage: 3,
  tiktokCombineMs: 1350,
  tiktokSilenceBreakMs: 420,
  defaultTtsProvider: "windows_sapi",
  defaultTtsSpeed: 1.0,
  defaultTtsLanguage: "es",
  ttsAutoSubtitles: false,
  elevenlabsStability: 0.5,
  elevenlabsSimilarity: 0.78,
  elevenlabsStyle: 0.15,
  autoCacheLibraries: true,
  maxCacheSizeMb: 2048,
  cacheTtlDays: 30,
  hardwareAcceleration: true,
  maxParallelWorkers: 4,
  logVerbosity: "normal",
  updateChannel: "stable",
  autoCheckUpdates: true,
};

function loadSavedAppSettings(): AppSettings {
  try {
    if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
    const raw = window.localStorage.getItem("storia_studio_app_settings_v1");
    if (!raw) return DEFAULT_APP_SETTINGS;
    return { ...DEFAULT_APP_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

function persistAppSettings(settings: AppSettings): void {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("storia_studio_app_settings_v1", JSON.stringify(settings));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface SvgEditorTarget {
  assetId: string;
  sceneId?: string;
  layerId?: string;
}

export interface SvgLiveUpdateEvent {
  assetId: string;
  svgCode: string;
  source?: string;
  rev: number;
}

interface StudioState {
  // Persisted / undoable document
  project: Project;

  // Non-undoable UI & session state
  projectsList: ProjectSummary[];
  capabilities: SystemCapabilities | null;
  wsStatus: "connected" | "connecting" | "offline";
  isSaving: boolean;
  lastError: string | null;
  receipts: EditReceipt[];
  exportJobs: ExportJob[];
  exportFiles: ExportFileEntry[];
  activeExportJobId: string | null;

  // Transport
  currentTime: number;
  isPlaying: boolean;
  loop: boolean;
  timelineZoom: number; // pixels per second

  // Selection & viewport tools
  selectedSceneId: string | null;
  selectedLayerId: string | null;
  selectedEffectClipId: string | null;
  selectedAudioClip: { trackId: string; clipId: string } | null;
  selectedSubtitleCueId: string | null;
  selectedWordId: string | null;
  replaceTarget: ReplaceTarget | null;
  svgEditorTarget: SvgEditorTarget | null;
  svgLiveUpdate: SvgLiveUpdateEvent | null;
  busyNotice: string | null;
  activeLeftTab: LeftTab;
  ttsSourceMode: "text" | "subtitles";
  uiLayoutMode: UiLayoutMode;
  theme: ThemeMode;
  activeView: StudioView;
  settingsModalOpen: boolean;
  settingsSection: string;
  librariesCatalog: LibraryCatalogItem[];
  enabledLibraries: Record<LibraryId, boolean>;
  appSettings: AppSettings;
  showSafeZones: boolean;
  snapEnabled: boolean;
  exportModalOpen: boolean;
  remoteAuthRequired: boolean;
  remoteAuthMessage: string | null;
  onboardingStatus: OnboardingStatusPayload | null;
  onboardingOpen: boolean;

  // Actions
  bootstrap: () => Promise<void>;
  refreshProjectsList: () => Promise<void>;
  loadProject: (projectId: string, openEditor?: boolean) => Promise<void>;
  createNewProject: (
    name: string,
    template: "demo" | "blank",
    overrides?: { aspectRatio?: "9:16" | "16:9" | "1:1"; resolution?: "720p" | "1080p" | "2k" | "4k"; fps?: 24 | 30 | 60 },
  ) => Promise<void>;
  saveProjectNow: () => Promise<void>;
  deleteProjectById: (projectId: string) => Promise<void>;
  duplicateProjectById: (projectId: string) => Promise<void>;
  importLegacyProject: (manifest: Record<string, unknown>, id?: string) => Promise<void>;
  setActiveView: (view: StudioView) => void;
  setSettingsModalOpen: (open: boolean, section?: string) => void;
  setSettingsSection: (section: string) => void;
  refreshLibrariesCatalog: () => Promise<void>;
  toggleLibraryEnabled: (id: LibraryId, enabled: boolean) => Promise<void>;
  updateAppSettings: (patch: Partial<AppSettings>) => void;
  resetAppSettings: () => void;
  dispatchOps: (ops: ProjectOperation[], options?: { skipServer?: boolean }) => void;
  setProjectFromRemote: (project: Project, receipt?: EditReceipt) => void;
  restoreSnapshot: (snapshotId: string) => Promise<void>;
  undo: () => void;
  redo: () => void;
  beginHistoryBatch: () => void;
  endHistoryBatch: () => void;

  setCurrentTime: (t: number) => void;
  stepFrames: (deltaFrames: number) => void;
  setIsPlaying: (playing: boolean) => void;
  togglePlay: () => void;
  setLoop: (loop: boolean) => void;
  setTimelineZoom: (pxPerSec: number) => void;

  selectScene: (sceneId: string | null, seekToStart?: boolean) => void;
  selectLayer: (layerId: string | null) => void;
  selectEffectClip: (effectClipId: string | null) => void;
  selectAudioClip: (ref: { trackId: string; clipId: string } | null) => void;
  selectSubtitleCue: (cueId: string | null, wordId?: string | null) => void;
  openReplaceModal: (target: ReplaceTarget) => void;
  closeReplaceModal: () => void;
  openSvgEditor: (target: SvgEditorTarget) => void;
  closeSvgEditor: () => void;
  splitAudioClipAtPlayhead: (trackId: string, clipId: string) => void;
  applyAutoDucking: (voiceTrackId: string) => void;
  setBusyNotice: (msg: string | null) => void;
  setActiveLeftTab: (tab: LeftTab) => void;
  setTtsSourceMode: (mode: "text" | "subtitles") => void;
  setUiLayoutMode: (mode: UiLayoutMode) => void;
  toggleTheme: () => void;
  toggleSafeZones: () => void;
  toggleSnap: () => void;
  setExportModalOpen: (open: boolean) => void;
  refreshExports: () => Promise<void>;
  startExport: (settings?: Partial<ExportSettings>, outputName?: string) => Promise<ExportJob | null>;
  cancelExport: (jobId: string) => Promise<void>;
  upsertExportJobFromSocket: (job: ExportJob, refreshFiles?: boolean) => void;
  setRemoteAuthRequired: (required: boolean, message?: string | null) => void;
  setOnboardingOpen: (open: boolean) => void;
  setOnboardingStatus: (status: OnboardingStatusPayload | null) => void;
  clearError: () => void;
}

let disconnectSocket: (() => void) | null = null;
let syncTimer: number | null = null;
let undoSaveTimer: number | null = null;
let pendingOps: ProjectOperation[] = [];
let lastSelfServerSyncAt = 0;
let historyBatchDepth = 0;
let historyBatchStartState: {
  project: Project;
  appSettings: AppSettings;
  theme: ThemeMode;
  showSafeZones: boolean;
  snapEnabled: boolean;
  uiLayoutMode: UiLayoutMode;
} | null = null;

const initialProject = createDemoProject("demo_episodum_paradox");

export const useStudioStore = create<StudioState>()(
  temporal(
    (set, get) => ({
      project: initialProject,
      projectsList: [],
      capabilities: null,
      wsStatus: "offline",
      isSaving: false,
      lastError: null,
      receipts: [],
      exportJobs: [],
      exportFiles: [],
      activeExportJobId: null,

      currentTime: 0.6,
      isPlaying: false,
      loop: true,
      timelineZoom: 92,

      selectedSceneId: initialProject.scenes[0]?.id ?? null,
      selectedLayerId: initialProject.scenes[0]?.layers.find((l) => l.type === "character")?.id ?? null,
      selectedEffectClipId: null,
      selectedAudioClip: null,
      selectedSubtitleCueId: initialProject.subtitles.cues[0]?.id ?? null,
      selectedWordId: null,
      replaceTarget: null,
      svgEditorTarget: null,
      svgLiveUpdate: null,
      busyNotice: null,
      activeLeftTab: "scenes",
      ttsSourceMode: "text",
      uiLayoutMode: loadSavedUiLayoutMode(),
      theme: "dark",
      activeView: loadSavedAppSettings().startOnHomeHub ? "home" : "editor",
      settingsModalOpen: false,
      settingsSection: "render",
      librariesCatalog: [],
      enabledLibraries: { ...DEFAULT_ENABLED_LIBRARIES },
      appSettings: loadSavedAppSettings(),
      showSafeZones: true,
      snapEnabled: true,
      exportModalOpen: false,
      remoteAuthRequired: false,
      remoteAuthMessage: null,
      onboardingStatus: null,
      onboardingOpen: false,

      bootstrap: async () => {
        try {
          const [projects, caps, libs, onboarding] = await Promise.all([
            studioApi.listProjects().catch(() => []),
            studioApi.getCapabilities().catch(() => null),
            studioApi.getLibrariesCatalog().catch(() => null),
            studioApi.getOnboardingStatus().catch(() => null),
          ]);
          set({
            projectsList: projects,
            capabilities: caps,
            ...(libs ? { librariesCatalog: libs.libraries, enabledLibraries: libs.enabled } : {}),
            ...(onboarding ? { onboardingStatus: onboarding, onboardingOpen: onboarding.shouldShow } : {}),
          });

          const urlParams =
            typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
          const requestedProj = urlParams?.get("project");
          const startInEditor = Boolean(requestedProj) || !get().appSettings.startOnHomeHub;

          if (requestedProj && projects.some((p) => p.id === requestedProj)) {
            await get().loadProject(requestedProj, true);
          } else if (projects.length > 0) {
            await get().loadProject(projects[0]!.id, startInEditor);
          } else if (!onboarding?.shouldShow) {
            // Seed a demo project on the local server automatically only when onboarding is already completed
            const created = await studioApi.createProject({
              id: "demo_episodum_paradox",
              template: "demo",
              aspectRatio: get().appSettings.defaultAspectRatio,
              resolution: get().appSettings.defaultResolution,
              fps: get().appSettings.defaultFps,
            });
            set({ projectsList: await studioApi.listProjects() });
            await get().loadProject(created.id, startInEditor);
          }
        } catch (err) {
          set({
            wsStatus: "offline",
            lastError: `Modo sin conexión local (${err instanceof Error ? err.message : String(err)})`,
          });
        }
      },

      refreshProjectsList: async () => {
        try {
          const projects = await studioApi.listProjects();
          set({ projectsList: projects });
        } catch {
          // Ignore offline
        }
      },

      loadProject: async (projectId: string, openEditor = true) => {
        disconnectSocket?.();
        disconnectSocket = null;
        try {
          const proj = await studioApi.getProject(projectId);
          set({
            project: proj,
            ...(openEditor ? { activeView: "editor" as StudioView } : {}),
            currentTime: 0,
            isPlaying: false,
            selectedSceneId: proj.scenes[0]?.id ?? null,
            selectedLayerId: proj.scenes[0]?.layers.find((l) => l.type !== "background")?.id ?? null,
            selectedEffectClipId: null,
            selectedAudioClip: null,
            selectedSubtitleCueId: proj.subtitles.cues[0]?.id ?? null,
            selectedWordId: null,
            lastError: null,
          });
          // Reset undo history when switching projects
          useStudioStore.temporal.getState().clear();

          disconnectSocket = connectProjectSocket(projectId, {
            onStatus: (wsStatus) => set({ wsStatus }),
            onMessage: (msg) => {
              if (msg.type === "export.progress" || msg.type === "export.completed" || msg.type === "export.failed") {
                get().upsertExportJobFromSocket(msg.job, msg.type === "export.completed");
                return;
              }
              if (msg.type === "asset.svg_updated") {
                set({
                  svgLiveUpdate: {
                    assetId: msg.assetId,
                    svgCode: msg.svgCode,
                    source: msg.source,
                    rev: Date.now(),
                  },
                });
                return;
              }
              if (msg.type === "project.updated" && msg.source === "ui") {
                // Ignore WebSocket self-echoes from our own UI dispatches / undo / save so Redo stack stays intact
                if (
                  msg.project.updatedAt === get().project.updatedAt ||
                  pendingOps.length > 0 ||
                  syncTimer !== null ||
                  undoSaveTimer !== null ||
                  Date.now() - lastSelfServerSyncAt < 2500
                ) {
                  return;
                }
              }
              if (msg.type === "project.updated") {
                get().setProjectFromRemote(msg.project, msg.receipt);
              }
            },
          });
          void get().refreshExports();
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      createNewProject: async (name: string, template: "demo" | "blank", overrides) => {
        try {
          const cfg = get().appSettings;
          const safeSlug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 36);
          const id = `${safeSlug || "proyecto"}_${Date.now().toString(36)}`;
          const created = await studioApi.createProject({
            id,
            name,
            template,
            aspectRatio: overrides?.aspectRatio ?? cfg.defaultAspectRatio,
            resolution: overrides?.resolution ?? cfg.defaultResolution,
            fps: overrides?.fps ?? cfg.defaultFps,
          });
          const projectsList = await studioApi.listProjects();
          set({ projectsList });
          await get().loadProject(created.id, true);
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      saveProjectNow: async () => {
        try {
          set({ isSaving: true });
          if (pendingOps.length > 0) {
            const batch = pendingOps;
            pendingOps = [];
            if (syncTimer !== null) {
              window.clearTimeout(syncTimer);
              syncTimer = null;
            }
            lastSelfServerSyncAt = Date.now();
            await studioApi.applyOperations(get().project.id, batch, "ui");
          }
          lastSelfServerSyncAt = Date.now();
          const saved = await studioApi.saveProject(get().project);
          lastSelfServerSyncAt = Date.now();
          // Updating updatedAt from disk save must NOT pollute undo history or wipe Redo
          const temporalStore = useStudioStore.temporal.getState();
          const wasTracking = temporalStore.isTracking;
          if (wasTracking) temporalStore.pause();
          set({ project: saved, isSaving: false, busyNotice: `Proyecto "${saved.name}" guardado en disco.` });
          if (wasTracking) temporalStore.resume();
          window.setTimeout(() => set({ busyNotice: null }), 2200);
          void get().refreshProjectsList();
        } catch (err) {
          set({ isSaving: false, lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      deleteProjectById: async (projectId: string) => {
        try {
          await studioApi.deleteProject(projectId);
          const projectsList = await studioApi.listProjects();
          set({ projectsList, busyNotice: "Proyecto eliminado." });
          window.setTimeout(() => set({ busyNotice: null }), 2200);
          if (get().project.id === projectId && projectsList.length > 0) {
            await get().loadProject(projectsList[0]!.id, get().activeView === "editor");
          }
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      duplicateProjectById: async (projectId: string) => {
        try {
          const orig = await studioApi.getProject(projectId);
          const copyId = `${orig.id.slice(0, 28)}_copia_${Date.now().toString(36).slice(-4)}`;
          const now = new Date().toISOString();
          const created = await studioApi.createProject({
            id: copyId,
            name: `${orig.name} (Copia)`,
            template: "blank",
            aspectRatio: orig.canvas.aspectRatio,
            resolution: orig.canvas.resolution,
            fps: orig.canvas.fps,
          });
          await studioApi.saveProject({
            ...orig,
            id: created.id,
            name: `${orig.name} (Copia)`,
            createdAt: now,
            updatedAt: now,
          });
          const projectsList = await studioApi.listProjects();
          set({ projectsList, busyNotice: `Duplicado: "${orig.name} (Copia)"` });
          window.setTimeout(() => set({ busyNotice: null }), 2400);
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      importLegacyProject: async (manifest: Record<string, unknown>, id?: string) => {
        try {
          const imported = await studioApi.importLegacyManifest({ id, manifest });
          const projectsList = await studioApi.listProjects();
          set({ projectsList, busyNotice: `Proyecto importado: "${imported.name}"` });
          window.setTimeout(() => set({ busyNotice: null }), 2600);
          await get().loadProject(imported.id, true);
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      setActiveView: (activeView) => {
        if (activeView === "home") {
          set({ isPlaying: false, activeView: "home" });
          void get().refreshProjectsList();
        } else {
          set({ activeView: "editor" });
        }
      },

      setSettingsModalOpen: (settingsModalOpen, section) =>
        set((s) => ({
          settingsModalOpen,
          settingsSection: section ?? s.settingsSection,
        })),

      setSettingsSection: (settingsSection) => set({ settingsSection }),

      refreshLibrariesCatalog: async () => {
        try {
          const res = await studioApi.getLibrariesCatalog();
          set({ librariesCatalog: res.libraries, enabledLibraries: res.enabled });
        } catch {
          // Ignore transient network errors
        }
      },

      toggleLibraryEnabled: async (id, enabled) => {
        try {
          const res = await studioApi.updateLibrariesConfig({ [id]: enabled });
          set({ librariesCatalog: res.libraries, enabledLibraries: res.enabled });
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      updateAppSettings: (patch) =>
        set((s) => {
          const next = { ...s.appSettings, ...patch };
          persistAppSettings(next);
          return { appSettings: next };
        }),

      resetAppSettings: () => {
        persistAppSettings(DEFAULT_APP_SETTINGS);
        set({ appSettings: DEFAULT_APP_SETTINGS });
      },

      dispatchOps: (ops, options) => {
        if (ops.length === 0) return;
        const prev = get().project;
        let next: Project;
        try {
          next = applyProjectOperations(prev, ops);
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
          return;
        }

        const localReceipt = createEditReceipt({
          before: prev,
          after: next,
          operations: ops,
          source: "ui",
        });

        set((state) => ({
          project: next,
          lastError: null,
          receipts: [localReceipt, ...state.receipts].slice(0, 30),
        }));

        if (options?.skipServer) return;

        // Batch rapid drags/sliders cleanly into a single server operation request
        pendingOps.push(...ops);
        if (syncTimer !== null) window.clearTimeout(syncTimer);
        syncTimer = window.setTimeout(async () => {
          const batch = pendingOps;
          pendingOps = [];
          syncTimer = null;
          if (batch.length === 0) return;

          set({ isSaving: true });
          try {
            lastSelfServerSyncAt = Date.now();
            const res = await studioApi.applyOperations(get().project.id, batch, "ui");
            lastSelfServerSyncAt = Date.now();
            set((state) => ({
              isSaving: false,
              receipts: [res.receipt, ...state.receipts.filter((r) => r.receiptId !== localReceipt.receiptId)].slice(0, 30),
            }));
          } catch (err) {
            set({
              isSaving: false,
              lastError: err instanceof Error ? err.message : String(err),
            });
          }
        }, 160);
      },

      setProjectFromRemote: (project, receipt) => {
        const cur = get().project;
        if (cur.id === project.id && cur.updatedAt === project.updatedAt) {
          // Deduplicate WebSocket echo after direct REST call so Undo/Redo stack is never duplicated or wiped
          if (receipt) {
            set((state) => ({
              receipts: [receipt, ...state.receipts.filter((r) => r.receiptId !== receipt.receiptId)].slice(0, 30),
            }));
          }
          return;
        }
        set((state) => ({
          project,
          receipts: receipt ? [receipt, ...state.receipts].slice(0, 30) : state.receipts,
        }));
      },

      beginHistoryBatch: () => {
        historyBatchDepth += 1;
        if (historyBatchDepth === 1) {
          const s = get();
          historyBatchStartState = {
            project: s.project,
            appSettings: s.appSettings,
            theme: s.theme,
            showSafeZones: s.showSafeZones,
            snapEnabled: s.snapEnabled,
            uiLayoutMode: s.uiLayoutMode,
          };
          useStudioStore.temporal.getState().pause();
        }
      },

      endHistoryBatch: () => {
        if (historyBatchDepth <= 0) return;
        historyBatchDepth -= 1;
        if (historyBatchDepth > 0) return;

        const startSnap = historyBatchStartState;
        historyBatchStartState = null;
        const temporalStore = useStudioStore.temporal.getState();

        if (!startSnap) {
          temporalStore.resume();
          return;
        }

        const endState = get();
        const changed =
          startSnap.project !== endState.project ||
          startSnap.appSettings !== endState.appSettings ||
          startSnap.theme !== endState.theme ||
          startSnap.showSafeZones !== endState.showSafeZones ||
          startSnap.snapEnabled !== endState.snapEnabled ||
          startSnap.uiLayoutMode !== endState.uiLayoutMode;

        if (!changed) {
          temporalStore.resume();
          return;
        }

        // Commit the entire drag/scrub gesture as ONE atomic undoable step
        const finalSnap = {
          project: endState.project,
          appSettings: endState.appSettings,
          theme: endState.theme,
          showSafeZones: endState.showSafeZones,
          snapEnabled: endState.snapEnabled,
          uiLayoutMode: endState.uiLayoutMode,
        };
        set(startSnap);
        temporalStore.resume();
        set(finalSnap);
      },

      undo: () => {
        // If a batch was somehow open, close it cleanly first
        if (historyBatchDepth > 0) {
          historyBatchDepth = 0;
          historyBatchStartState = null;
          useStudioStore.temporal.getState().resume();
        }
        const temporalStore = useStudioStore.temporal.getState();
        if (temporalStore.pastStates.length === 0) return;

        // Cancel any queued debounced ops so they cannot overwrite the undone state
        pendingOps = [];
        if (syncTimer !== null) {
          window.clearTimeout(syncTimer);
          syncTimer = null;
        }

        const prevProj = get().project;
        temporalStore.undo();
        const next = get();

        // Sync restored UI/settings side-effects
        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", next.theme);
        }
        persistAppSettings(next.appSettings);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(UI_LAYOUT_MODE_KEY, next.uiLayoutMode);
          }
        } catch {
          // Ignore storage errors
        }

        // Persist restored project back to server (debounced so rapid Ctrl+Z stays snappy)
        if (next.project !== prevProj) {
          lastSelfServerSyncAt = Date.now();
          if (undoSaveTimer !== null) window.clearTimeout(undoSaveTimer);
          undoSaveTimer = window.setTimeout(async () => {
            undoSaveTimer = null;
            try {
              lastSelfServerSyncAt = Date.now();
              await studioApi.saveProject(get().project);
              lastSelfServerSyncAt = Date.now();
            } catch {
              // Ignore offline save errors
            }
          }, 220);
        }
      },

      redo: () => {
        if (historyBatchDepth > 0) {
          historyBatchDepth = 0;
          historyBatchStartState = null;
          useStudioStore.temporal.getState().resume();
        }
        const temporalStore = useStudioStore.temporal.getState();
        if (temporalStore.futureStates.length === 0) return;

        pendingOps = [];
        if (syncTimer !== null) {
          window.clearTimeout(syncTimer);
          syncTimer = null;
        }

        const prevProj = get().project;
        temporalStore.redo();
        const next = get();

        if (typeof document !== "undefined") {
          document.documentElement.setAttribute("data-theme", next.theme);
        }
        persistAppSettings(next.appSettings);
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(UI_LAYOUT_MODE_KEY, next.uiLayoutMode);
          }
        } catch {
          // Ignore storage errors
        }

        if (next.project !== prevProj) {
          lastSelfServerSyncAt = Date.now();
          if (undoSaveTimer !== null) window.clearTimeout(undoSaveTimer);
          undoSaveTimer = window.setTimeout(async () => {
            undoSaveTimer = null;
            try {
              lastSelfServerSyncAt = Date.now();
              await studioApi.saveProject(get().project);
              lastSelfServerSyncAt = Date.now();
            } catch {
              // Ignore offline save errors
            }
          }, 220);
        }
      },

      restoreSnapshot: async (snapshotId: string) => {
        try {
          const restored = await studioApi.restoreSnapshot(get().project.id, snapshotId);
          set({ project: restored, lastError: null });
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      setCurrentTime: (t: number) => {
        const dur = Math.max(0.1, getProjectDuration(get().project));
        const clamped = Math.max(0, Math.min(dur, t));
        const resolved = resolveSceneAtTime(get().project, clamped);
        set({
          currentTime: clamped,
          selectedSceneId: resolved?.scene.id ?? get().selectedSceneId,
        });
      },

      stepFrames: (deltaFrames: number) => {
        const fps = get().project.canvas.fps || 30;
        get().setCurrentTime(get().currentTime + deltaFrames / fps);
      },

      setIsPlaying: (isPlaying) => set({ isPlaying }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      setLoop: (loop) => set({ loop }),
      setTimelineZoom: (timelineZoom) => set({ timelineZoom: Math.max(24, Math.min(280, timelineZoom)) }),

      selectScene: (sceneId, seekToStart = true) => {
        const proj = get().project;
        if (!sceneId) {
          set({ selectedSceneId: null, selectedLayerId: null });
          return;
        }
        let cursor = 0;
        for (const sc of proj.scenes) {
          if (sc.id === sceneId) {
            set({
              selectedSceneId: sceneId,
              selectedLayerId: null,
              selectedEffectClipId: null,
              selectedAudioClip: null,
              currentTime: seekToStart ? cursor + 0.01 : get().currentTime,
            });
            return;
          }
          cursor += sc.duration;
        }
      },

      selectLayer: (layerId) =>
        set({
          selectedLayerId: layerId,
          ...(layerId ? { selectedEffectClipId: null, selectedAudioClip: null } : {}),
        }),
      selectEffectClip: (effectClipId) =>
        set({
          selectedEffectClipId: effectClipId,
          ...(effectClipId ? { selectedLayerId: null, selectedAudioClip: null } : {}),
        }),
      selectAudioClip: (selectedAudioClip) =>
        set({
          selectedAudioClip,
          ...(selectedAudioClip ? { selectedLayerId: null, selectedEffectClipId: null } : {}),
        }),
      selectSubtitleCue: (cueId, wordId = null) =>
        set({ selectedSubtitleCueId: cueId, selectedWordId: wordId }),
      openReplaceModal: (replaceTarget) => set({ replaceTarget }),
      closeReplaceModal: () => set({ replaceTarget: null }),
      openSvgEditor: (svgEditorTarget) => set({ svgEditorTarget }),
      closeSvgEditor: () => set({ svgEditorTarget: null }),

      splitAudioClipAtPlayhead: (trackId, clipId) => {
        const proj = get().project;
        const t = get().currentTime;
        const track = proj.audioTracks.find((tr) => tr.id === trackId);
        const clip = track?.clips.find((c) => c.id === clipId);
        if (!track || !clip) return;
        const splitOffset = t - clip.start;
        if (splitOffset <= 0.1 || splitOffset >= clip.duration - 0.1) {
          set({ lastError: "Coloca el cabezal dentro del clip para dividirlo." });
          return;
        }
        const firstPart = { ...clip, duration: Number(splitOffset.toFixed(3)) };
        const secondPart = {
          ...clip,
          id: `${clip.id}_b_${Date.now().toString(36).slice(-3)}`,
          name: `${clip.name} (2)`,
          start: Number(t.toFixed(3)),
          duration: Number((clip.duration - splitOffset).toFixed(3)),
          trimStart: Number((clip.trimStart + splitOffset).toFixed(3)),
        };
        get().dispatchOps([
          { op: "audioClip.upsert", trackId, clip: firstPart },
          { op: "audioClip.upsert", trackId, clip: secondPart },
        ]);
        set({ selectedAudioClip: { trackId, clipId: secondPart.id } });
      },

      applyAutoDucking: (voiceTrackId) => {
        const proj = get().project;
        const ops: ProjectOperation[] = [];
        for (const tr of proj.audioTracks) {
          if (tr.id !== voiceTrackId && (tr.role === "music" || tr.role === "ambience")) {
            ops.push({
              op: "audioTrack.upsert",
              track: { ...tr, duckUnderTrackId: voiceTrackId, duckAmountDb: -8 },
            });
          }
        }
        if (ops.length === 0) {
          set({ lastError: "No hay pistas de música/ambiente para aplicar auto-ducking." });
          return;
        }
        get().dispatchOps(ops);
      },

      setBusyNotice: (busyNotice) => set({ busyNotice }),
      setActiveLeftTab: (activeLeftTab) => set({ activeLeftTab }),
      setTtsSourceMode: (ttsSourceMode) => set({ ttsSourceMode }),
      setUiLayoutMode: (uiLayoutMode) => {
        try {
          if (typeof window !== "undefined") {
            window.localStorage.setItem(UI_LAYOUT_MODE_KEY, uiLayoutMode);
          }
        } catch {
          // Ignore storage failures
        }
        set({ uiLayoutMode });
      },

      toggleTheme: () =>
        set((s) => {
          const next: ThemeMode = s.theme === "dark" ? "light" : "dark";
          if (typeof document !== "undefined") {
            document.documentElement.setAttribute("data-theme", next);
          }
          return { theme: next };
        }),

      toggleSafeZones: () => set((s) => ({ showSafeZones: !s.showSafeZones })),
      toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
      setExportModalOpen: (exportModalOpen) => {
        set({ exportModalOpen });
        if (exportModalOpen) {
          void get().refreshExports();
        }
      },

      refreshExports: async () => {
        try {
          const { jobs, files } = await studioApi.listExports(get().project.id);
          set({ exportJobs: jobs, exportFiles: files });
        } catch {
          // Ignore when offline
        }
      },

      startExport: async (settings, outputName) => {
        try {
          // Flush any pending unsaved ops first so disk state matches UI 1:1
          if (pendingOps.length > 0) {
            const batch = pendingOps;
            pendingOps = [];
            if (syncTimer !== null) {
              window.clearTimeout(syncTimer);
              syncTimer = null;
            }
            await studioApi.applyOperations(get().project.id, batch, "ui");
          }
          const job = await studioApi.startExport(
            get().project.id,
            settings ?? get().project.exportSettings,
            outputName,
          );
          set((state) => ({
            activeExportJobId: job.id,
            exportJobs: [job, ...state.exportJobs.filter((j) => j.id !== job.id)],
            lastError: null,
          }));
          return job;
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
          return null;
        }
      },

      cancelExport: async (jobId) => {
        try {
          const job = await studioApi.cancelExport(jobId);
          set((state) => ({
            exportJobs: [job, ...state.exportJobs.filter((j) => j.id !== job.id)],
          }));
        } catch (err) {
          set({ lastError: err instanceof Error ? err.message : String(err) });
        }
      },

      upsertExportJobFromSocket: (job, refreshFiles = false) => {
        set((state) => ({
          activeExportJobId:
            job.status === "queued" ||
            job.status === "mixing_audio" ||
            job.status === "rendering_frames" ||
            job.status === "finalizing"
              ? job.id
              : state.activeExportJobId === job.id
                ? job.id
                : state.activeExportJobId,
          exportJobs: [job, ...state.exportJobs.filter((j) => j.id !== job.id)].slice(0, 20),
        }));
        if (refreshFiles) {
          void get().refreshExports();
        }
      },

      setRemoteAuthRequired: (required, message = null) =>
        set({
          remoteAuthRequired: required,
          remoteAuthMessage: required ? message : null,
        }),

      setOnboardingOpen: (open) => set({ onboardingOpen: open }),

      setOnboardingStatus: (status) => set({ onboardingStatus: status }),

      clearError: () => set({ lastError: null }),
    }),
    {
      partialize: (state) => ({
        project: state.project,
        appSettings: state.appSettings,
        theme: state.theme,
        showSafeZones: state.showSafeZones,
        snapEnabled: state.snapEnabled,
        uiLayoutMode: state.uiLayoutMode,
      }),
      equality: (past, current) =>
        past.project === current.project &&
        past.appSettings === current.appSettings &&
        past.theme === current.theme &&
        past.showSafeZones === current.showSafeZones &&
        past.snapEnabled === current.snapEnabled &&
        past.uiLayoutMode === current.uiLayoutMode,
      limit: 120,
    },
  ),
);
