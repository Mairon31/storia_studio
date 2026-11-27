import type {
  AspectRatio,
  Asset,
  AssetKind,
  EditReceipt,
  ExportSettings,
  Fps,
  Project,
  ProjectOperation,
  ResolutionPreset,
  ScaleMode,
  TransitionConfig,
} from "@storia/schema";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  aspectRatio: string;
  resolution: string;
  fps: number;
  sceneCount: number;
  durationSec: number;
  updatedAt: string;
}

export interface SystemCapabilities {
  platform: string;
  cpus: number;
  totalMemGb: number;
  nodeVersion: string;
  ffmpegVersion: string | null;
  encoders: {
    h264_nvenc: boolean;
    hevc_nvenc: boolean;
    av1_nvenc: boolean;
    libx264: boolean;
  };
  recommendedEncoder: "h264_nvenc" | "libx264";
}

export type ExportJobStatus =
  | "queued"
  | "mixing_audio"
  | "rendering_frames"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ExportProbeResult {
  durationSec: number;
  sizeBytes: number;
  bitRate: number;
  video?: {
    codec: string;
    width: number;
    height: number;
    fps: string;
    pixFmt: string;
  };
  audio?: {
    codec: string;
    sampleRate: number;
    channels: number;
  };
}

export interface ExportJob {
  id: string;
  projectId: string;
  status: ExportJobStatus;
  stageLabel: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  settings: ExportSettings;
  width: number;
  height: number;
  fps: number;
  codec: string;
  isGpu: boolean;
  fallbackReason?: string;
  concurrency?: number;
  motionBlurSamples?: number;
  shutterAngle?: number;
  totalFrames: number;
  currentFrame: number;
  progress: number;
  renderFps: number;
  etaSec: number | null;
  outputFilename?: string;
  outputPath?: string;
  downloadUrl?: string;
  srtFilename?: string;
  srtDownloadUrl?: string;
  probe?: ExportProbeResult;
  error?: string;
}

export interface ExportFileEntry {
  filename: string;
  sizeBytes: number;
  modifiedAt: string;
  url: string;
}

export type LibraryId =
  | "openverse"
  | "iconify"
  | "wikimedia"
  | "internet_archive"
  | "pixel_game_sprites"
  | "openmoji_props"
  | "svg_backgrounds"
  | "local_videos"
  | "local_workspace";

export type LibraryAssetType = "sfx" | "music" | "sprites" | "backgrounds" | "vectors" | "icons";

export interface LibraryCatalogItem {
  id: LibraryId;
  name: string;
  tagline: string;
  description: string;
  kind: "online" | "builtin" | "local";
  assetTypes: LibraryAssetType[];
  license: string;
  estimatedCount: string;
  requiresApiKey: boolean;
  supportsVector: boolean;
  supportsAudio: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  websiteUrl?: string;
}

export interface LibrariesCatalogResponse {
  libraries: LibraryCatalogItem[];
  enabled: Record<LibraryId, boolean>;
}

export type VectorLibrarySource =
  | "videos"
  | "workspace"
  | "iconify"
  | "openverse"
  | "wikimedia"
  | "pixel_game_sprites"
  | "openmoji_props"
  | "svg_backgrounds";
export type VectorLibraryCategory = "backgrounds" | "sprites" | "overlays" | "icons";

export interface VectorLibraryItem {
  id: string;
  name: string;
  source: VectorLibrarySource;
  category: VectorLibraryCategory;
  video?: string;
  collection?: string;
  iconifyName?: string;
  previewUrl: string;
  remoteUrl?: string;
  license: string;
  author?: string;
  sourceUrl?: string;
  tags: string[];
  suggestedPlacement: "background" | "sprite";
  defaultScaleMode: "linear" | "nearest";
}

export interface VectorSearchResponse {
  items: VectorLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  facets: {
    videos: string[];
    categories: Record<VectorLibraryCategory, number>;
    counts: { videos: number; workspace: number };
  };
  onlineWarning?: string;
  disabledLibrary?: boolean;
}

export type AudioLibrarySource =
  | "openverse"
  | "wikimedia"
  | "internet_archive"
  | "local_workspace"
  | "local_videos";
export type AudioLibraryCategory = "sfx" | "music" | "ambience";

export interface AudioLibraryItem {
  id: string;
  name: string;
  source: AudioLibrarySource;
  provider: string;
  category: AudioLibraryCategory;
  durationSec?: number;
  license: string;
  licenseVersion?: string;
  author?: string;
  attribution?: string;
  previewUrl: string;
  remoteUrl?: string;
  sourceUrl?: string;
  video?: string;
  tags: string[];
}

export interface LibraryCacheStats {
  cacheDir: string;
  searchEntries: number;
  svgFiles: number;
  audioFiles: number;
  totalBytes: number;
}

export interface AudioSearchResponse {
  items: AudioLibraryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  localCount: number;
  onlineWarning?: string;
  disabledLibrary?: boolean;
}

export type TtsProviderId =
  | "windows_sapi"
  | "elevenlabs"
  | "voicestudio"
  | "piper"
  | "kokoro"
  | "openai"
  | "custom_api";

export interface TtsVoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: string;
  provider: TtsProviderId;
  installed?: boolean;
  downloadable?: boolean;
  sizeLabel?: string;
  previewUrl?: string;
  description?: string;
}

export interface TtsPublicConfig {
  hasElevenlabsKey: boolean;
  elevenlabsModel: string;
  hasOpenaiKey: boolean;
  openaiBaseUrl: string;
  openaiModel: string;
  voiceStudioUrl: string;
  hasVoiceStudioKey: boolean;
  customApiUrl: string;
  customApiHeaderName: string;
  hasCustomApiKey: boolean;
  customApiBodyTemplate: string;
}

export type AccessMode = "local" | "lan";
export type TunnelProvider = "none" | "ngrok" | "cloudflare";
export type CloudflareTunnelMode = "quick" | "named_token";
export type AiHarnessId = "universal" | "claude" | "codex" | "antigravity" | "opencode" | "cursor";
export type AiTransportMode = "tunnel" | "lan" | "stdio";

export interface ConnectivityPublicConfig {
  accessMode: AccessMode;
  port: number;
  mcpHttpEnabled: boolean;
  mcpAuthEnabled: boolean;
  mcpAuthToken: string;
  tunnel: {
    provider: TunnelProvider;
    autoStart: boolean;
    ngrok: {
      hasAuthtoken: boolean;
      domain: string;
      region: string;
    };
    cloudflare: {
      mode: CloudflareTunnelMode;
      hasTunnelToken: boolean;
      persistentHostname: string;
    };
  };
}

export interface LanAddressInfo {
  interfaceName: string;
  address: string;
  studioUrl: string;
  mcpUrl: string;
}

export interface TunnelBinaryStatus {
  installed: boolean;
  binPath: string | null;
  version: string | null;
}

export interface TunnelRuntimeStatus {
  state: "stopped" | "starting" | "running" | "error";
  provider: TunnelProvider;
  publicUrl: string | null;
  mcpUrl: string | null;
  mobileAccessUrl?: string | null;
  persistent: boolean;
  pid: number | null;
  startedAt: string | null;
  error: string | null;
  recentLogs: string[];
}

export interface ConnectivityStatusResponse {
  config: ConnectivityPublicConfig;
  runtime: {
    listeningHost: string;
    listeningPort: number;
    lanActiveNow: boolean;
    restartRequiredForBind: boolean;
    localStudioUrl: string;
    localMcpUrl: string;
    lanAddresses: LanAddressInfo[];
    mcpStdioEntry: string;
    mcpStdioWindowsEntry: string;
  };
  binaries: {
    ngrok: TunnelBinaryStatus;
    cloudflared: TunnelBinaryStatus;
  };
  tunnel: TunnelRuntimeStatus;
}

export interface AiIntegrationBundle {
  harness: AiHarnessId;
  harnessLabel: string;
  mode: AiTransportMode;
  mcpUrl: string;
  studioUrl: string;
  authRequired: boolean;
  authHeader: string | null;
  configFormat: "json" | "toml";
  configFilename: string;
  configSnippet: string;
  structuredPrompt: string;
}

export interface TtsProviderStatus {
  id: TtsProviderId;
  name: string;
  kind: "local" | "cloud" | "self_hosted";
  available: boolean;
  ready: boolean;
  detail: string;
  requiresApiKey?: boolean;
  installableModels?: {
    id: string;
    name: string;
    language: string;
    sizeLabel: string;
    installed: boolean;
  }[];
  pythonPackageInstalled?: boolean;
  pipInstallHint?: string;
}

let remoteAuthRequiredListener: ((message?: string) => void) | null = null;

export function setRemoteAuthRequiredListener(cb: ((message?: string) => void) | null): void {
  remoteAuthRequiredListener = cb;
}

const DEFAULT_API_HEADERS: Record<string, string> = {
  "ngrok-skip-browser-warning": "true",
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...DEFAULT_API_HEADERS };
  if (init?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      ...init,
      headers: {
        ...headers,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Sin conexión con el servidor de Storia Studio (${raw}). Si estás usando un túnel remoto, abre el enlace seguro para móvil o verifica que el servidor esté encendido.`,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    if (res.status === 401 && url.startsWith("/api/") && !url.startsWith("/api/auth/")) {
      remoteAuthRequiredListener?.(
        "Sesión remota requerida. Abre el enlace seguro para móvil desde tu PC o ingresa tu código de acceso.",
      );
    }
    throw new Error(`API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export const studioApi = {
  async listProjects(): Promise<ProjectSummary[]> {
    const data = await fetchJson<{ projects: ProjectSummary[] }>("/api/projects");
    return data.projects;
  },

  async getProject(id: string): Promise<Project> {
    const data = await fetchJson<{ project: Project }>(`/api/projects/${encodeURIComponent(id)}`);
    return data.project;
  },

  async createProject(params: {
    id?: string;
    name?: string;
    template?: "blank" | "demo";
    aspectRatio?: AspectRatio;
    resolution?: ResolutionPreset;
    fps?: Fps;
  }): Promise<Project> {
    const data = await fetchJson<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return data.project;
  },

  async saveProject(project: Project): Promise<Project> {
    const data = await fetchJson<{ project: Project }>(`/api/projects/${encodeURIComponent(project.id)}`, {
      method: "PUT",
      body: JSON.stringify(project),
    });
    return data.project;
  },

  async deleteProject(id: string): Promise<{ deleted: boolean }> {
    return fetchJson<{ deleted: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },

  async importLegacyManifest(payload: {
    id?: string;
    manifest: Record<string, unknown>;
  }): Promise<Project> {
    const data = await fetchJson<{ project: Project }>("/api/projects/import-legacy", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return data.project;
  },

  async applyOperations(
    projectId: string,
    operations: ProjectOperation[],
    source: "ui" | "mcp" | "api" = "ui",
  ): Promise<{ project: Project; receipt: EditReceipt }> {
    return fetchJson<{ project: Project; receipt: EditReceipt }>(
      `/api/projects/${encodeURIComponent(projectId)}/operations`,
      {
        method: "POST",
        body: JSON.stringify({ operations, source }),
      },
    );
  },

  async restoreSnapshot(projectId: string, snapshotId: string): Promise<Project> {
    const data = await fetchJson<{ project: Project }>(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      { method: "POST", body: "{}" },
    );
    return data.project;
  },

  async uploadAsset(
    projectId: string,
    payload: {
      name: string;
      filename: string;
      kind: AssetKind;
      scaleMode?: ScaleMode;
      mimeType?: string;
      width?: number;
      height?: number;
      durationSec?: number;
      base64: string;
    },
  ): Promise<{ asset: Asset; project: Project; receipt: EditReceipt }> {
    return fetchJson<{ asset: Asset; project: Project; receipt: EditReceipt }>(
      `/api/projects/${encodeURIComponent(projectId)}/assets`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  },

  async getCapabilities(): Promise<SystemCapabilities> {
    return fetchJson<SystemCapabilities>("/api/system/capabilities");
  },

  async startExport(
    projectId: string,
    settings?: Partial<ExportSettings>,
    outputName?: string,
  ): Promise<ExportJob> {
    const data = await fetchJson<{ job: ExportJob }>(
      `/api/projects/${encodeURIComponent(projectId)}/exports`,
      {
        method: "POST",
        body: JSON.stringify({ settings, outputName, wait: false }),
      },
    );
    return data.job;
  },

  async listExports(projectId: string): Promise<{ jobs: ExportJob[]; files: ExportFileEntry[] }> {
    return fetchJson<{ jobs: ExportJob[]; files: ExportFileEntry[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/exports`,
    );
  },

  async getExportJob(jobId: string): Promise<ExportJob> {
    const data = await fetchJson<{ job: ExportJob }>(`/api/exports/${encodeURIComponent(jobId)}`);
    return data.job;
  },

  async cancelExport(jobId: string): Promise<ExportJob> {
    const data = await fetchJson<{ job: ExportJob }>(
      `/api/exports/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST", body: "{}" },
    );
    return data.job;
  },

  async getLibrariesCatalog(): Promise<LibrariesCatalogResponse> {
    return fetchJson<LibrariesCatalogResponse>("/api/libraries/catalog");
  },

  async updateLibrariesConfig(enabled: Partial<Record<LibraryId, boolean>>): Promise<LibrariesCatalogResponse> {
    return fetchJson<LibrariesCatalogResponse>("/api/libraries/config", {
      method: "POST",
      body: JSON.stringify({ enabled }),
    });
  },

  async getLibraryCacheStats(): Promise<LibraryCacheStats> {
    return fetchJson<LibraryCacheStats>("/api/libraries/cache");
  },

  async clearLibraryCache(): Promise<LibraryCacheStats> {
    return fetchJson<LibraryCacheStats>("/api/libraries/cache/clear", {
      method: "POST",
      body: "{}",
    });
  },

  async searchVectors(params: {
    q?: string;
    source?: "all" | VectorLibrarySource;
    category?: "all" | VectorLibraryCategory;
    video?: string;
    collection?: string;
    color?: string;
    page?: number;
    pageSize?: number;
    refresh?: boolean;
  }): Promise<VectorSearchResponse> {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.source) sp.set("source", params.source);
    if (params.category) sp.set("category", params.category);
    if (params.video) sp.set("video", params.video);
    if (params.collection) sp.set("collection", params.collection);
    if (params.color) sp.set("color", params.color);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.refresh) sp.set("refresh", "true");
    return fetchJson<VectorSearchResponse>(`/api/libraries/vectors?${sp.toString()}`);
  },

  async importVectorFromLibrary(
    projectId: string,
    payload: {
      itemId?: string;
      iconifyName?: string;
      remoteUrl?: string;
      color?: string;
      name: string;
      source: VectorLibrarySource;
      category?: string;
      license?: string;
      author?: string;
      sourceUrl?: string;
      insertMode: "asset_only" | "sprite" | "background";
      sceneId?: string;
      replaceLayerId?: string;
      widthNorm?: number;
      scaleMode?: ScaleMode;
    },
  ): Promise<{ asset: Asset; insertedLayerId?: string; sceneId?: string; project: Project; receipt: EditReceipt }> {
    return fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/libraries/vectors/import`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "ui" }),
      },
    );
  },

  async searchAudio(params: {
    q?: string;
    source?: "openverse" | "wikimedia" | "internet_archive" | "local" | "all";
    category?: "all" | "sfx" | "music" | "ambience" | "psx";
    license?: "all" | "cc0" | "cc-by";
    duration?: "all" | "short" | "medium" | "long";
    page?: number;
    pageSize?: number;
    refresh?: boolean;
  }): Promise<AudioSearchResponse> {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.source) sp.set("source", params.source);
    if (params.category) sp.set("category", params.category);
    if (params.license) sp.set("license", params.license);
    if (params.duration) sp.set("duration", params.duration);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.refresh) sp.set("refresh", "true");
    return fetchJson<AudioSearchResponse>(`/api/libraries/audio?${sp.toString()}`);
  },

  async importAudioFromLibrary(
    projectId: string,
    payload: {
      itemId?: string;
      remoteUrl?: string;
      name: string;
      category: AudioLibraryCategory;
      source: AudioLibrarySource | "local";
      license?: string;
      author?: string;
      attribution?: string;
      sourceUrl?: string;
      durationSec?: number;
      insertToTimeline: boolean;
      startSec?: number;
      trackId?: string;
      replaceTrackId?: string;
      replaceClipId?: string;
      preserveClipDuration?: boolean;
    },
  ): Promise<{ asset: Asset; durationSec: number; insertedClipId?: string; trackId?: string; project: Project; receipt: EditReceipt }> {
    return fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/libraries/audio/import`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "ui" }),
      },
    );
  },

  async transcribeAudioClip(
    projectId: string,
    payload: {
      trackId: string;
      clipId: string;
      language?: string;
      model?: "tiny" | "base" | "small" | "medium";
      replaceExisting?: boolean;
    },
  ): Promise<{ language: string; cuesCount: number; project: Project; receipt: EditReceipt }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/audio/transcribe`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async processAudioClip(
    projectId: string,
    payload: {
      trackId: string;
      clipId: string;
      action: "denoise" | "voice_enhance" | "normalize" | "trim_silence";
    },
  ): Promise<{ asset: Asset; durationSec: number; project: Project; receipt: EditReceipt }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/audio/process`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async applyTransitionWithSfx(
    projectId: string,
    payload: {
      sceneId?: string;
      applyToAll?: boolean;
      transition: TransitionConfig;
      addSoundEffect?: boolean;
    },
  ): Promise<{ appliedCount: number; sfxAssetId?: string; project: Project; receipt: EditReceipt }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/transitions/apply`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getTtsProviders(
    refresh = false,
  ): Promise<{
    config: TtsPublicConfig;
    providers: TtsProviderStatus[];
    security?: { localAdminAllowed: boolean; reason?: string };
  }> {
    return fetchJson(`/api/tts/providers${refresh ? "?refresh=true" : ""}`);
  },

  async updateTtsConfig(patch: Record<string, string | undefined>): Promise<{ config: TtsPublicConfig }> {
    return fetchJson("/api/tts/config", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  },

  async listTtsVoices(
    provider: TtsProviderId,
    refresh = false,
  ): Promise<{ voices: TtsVoiceInfo[]; warning?: string }> {
    return fetchJson(`/api/tts/voices?provider=${encodeURIComponent(provider)}${refresh ? "&refresh=true" : ""}`);
  },

  async installTtsModel(
    provider: "piper" | "kokoro",
    modelId: string,
  ): Promise<{ installed: boolean; modelId: string; totalBytes: number; path: string }> {
    return fetchJson("/api/tts/models/install", {
      method: "POST",
      body: JSON.stringify({ provider, modelId }),
    });
  },

  async previewTtsAudio(payload: {
    provider: TtsProviderId;
    text: string;
    voiceId?: string;
    language?: string;
    speed?: number;
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    style?: number;
    voiceStudioUrl?: string;
    customApiUrl?: string;
  }): Promise<Blob> {
    const res = await fetch("/api/tts/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        ...DEFAULT_API_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      if (res.status === 401) {
        remoteAuthRequiredListener?.("Sesión remota requerida para pre-escuchar TTS.");
      }
      const txt = await res.text().catch(() => "");
      throw new Error(txt || `TTS preview failed (${res.status})`);
    }
    return res.blob();
  },

  async generateProjectTts(
    projectId: string,
    payload: {
      provider: TtsProviderId;
      text: string;
      voiceId?: string;
      language?: string;
      speed?: number;
      modelId?: string;
      stability?: number;
      similarityBoost?: number;
      style?: number;
      voiceStudioUrl?: string;
      customApiUrl?: string;
      clipName?: string;
      insertToTimeline?: boolean;
      startSec?: number;
      trackId?: string;
      replaceTrackId?: string;
      replaceClipId?: string;
      preserveClipDuration?: boolean;
      autoSubtitles?: boolean;
    },
  ): Promise<{
    asset: Asset;
    durationSec: number;
    providerLabel: string;
    insertedClipId?: string;
    trackId?: string;
    cuesCount: number;
    subtitleWarning?: string;
    project: Project;
    receipt: EditReceipt;
  }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/tts/generate`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "ui" }),
    });
  },

  async generateProjectTtsFromSubtitles(
    projectId: string,
    payload: {
      provider: TtsProviderId;
      mode: "grouped" | "individual";
      cueIds?: string[];
      voiceId?: string;
      language?: string;
      speed?: number;
      modelId?: string;
      stability?: number;
      similarityBoost?: number;
      style?: number;
      voiceStudioUrl?: string;
      customApiUrl?: string;
      clipName?: string;
      trackId?: string;
      replaceExistingVoiceClips?: boolean;
      syncSubtitleTimings?: boolean;
      autoSubtitles?: boolean;
      minGapSec?: number;
    },
  ): Promise<{
    mode: "grouped" | "individual";
    providerLabel: string;
    trackId: string;
    assets: Asset[];
    insertedClipIds: string[];
    clipsCreated: number;
    cuesProcessed: number;
    cuesUpdated: number;
    totalDurationSec: number;
    subtitleWarning?: string;
    project: Project;
    receipt: EditReceipt;
  }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/tts/from-subtitles`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "ui" }),
    });
  },

  async getConnectivityStatus(refresh = false): Promise<ConnectivityStatusResponse> {
    return fetchJson(`/api/connectivity${refresh ? "?refresh=true" : ""}`);
  },

  async updateConnectivityConfig(patch: {
    accessMode?: AccessMode;
    port?: number;
    mcpHttpEnabled?: boolean;
    mcpAuthEnabled?: boolean;
    tunnelProvider?: TunnelProvider;
    tunnelAutoStart?: boolean;
    ngrokAuthtoken?: string;
    ngrokDomain?: string;
    ngrokRegion?: string;
    cloudflareMode?: CloudflareTunnelMode;
    cloudflareTunnelToken?: string;
    cloudflarePersistentHostname?: string;
  }): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/config", {
      method: "POST",
      body: JSON.stringify(patch),
    });
  },

  async rotateConnectivityToken(): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/token/rotate", { method: "POST", body: "{}" });
  },

  async rotateMobileAccessCode(): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/mobile-link/rotate", { method: "POST", body: "{}" });
  },

  async unlockRemoteSession(token: string): Promise<{ ok: boolean; authenticated: boolean }> {
    return fetchJson("/api/auth/remote-unlock", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async logoutRemoteSession(): Promise<{ ok: boolean }> {
    return fetchJson("/api/auth/remote-logout", { method: "POST", body: "{}" });
  },

  async startTunnel(provider?: "ngrok" | "cloudflare"): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/tunnel/start", {
      method: "POST",
      body: JSON.stringify(provider ? { provider } : {}),
    });
  },

  async stopTunnel(): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/tunnel/stop", { method: "POST", body: "{}" });
  },

  async installTunnelBinary(provider: "ngrok" | "cloudflare"): Promise<ConnectivityStatusResponse> {
    return fetchJson("/api/connectivity/tunnel/install", {
      method: "POST",
      body: JSON.stringify({ provider }),
    });
  },

  async getOAuthStatus(): Promise<OAuthStatusSummary> {
    return fetchJson("/api/connectivity/oauth/status");
  },

  async revokeAllOAuthSessions(): Promise<OAuthStatusSummary> {
    return fetchJson("/api/connectivity/oauth/revoke-all", {
      method: "POST",
      body: "{}",
    });
  },

  async getAiIntegrationBundle(
    harness: AiHarnessId,
    mode: AiTransportMode,
  ): Promise<AiIntegrationBundle> {
    const sp = new URLSearchParams({ harness, mode });
    return fetchJson(`/api/connectivity/ai-prompt?${sp.toString()}`);
  },

  async importSubtitles(
    projectId: string,
    payload: {
      content: string;
      format?: "auto" | "srt" | "vtt";
      tiktokMode?: boolean;
      combineTokensWithinMs?: number;
      breakOnSilenceAfterMs?: number;
      maxWordsPerPage?: number;
      replaceExisting?: boolean;
    },
  ): Promise<{ format: "srt" | "vtt"; importedCount: number; project: Project }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/subtitles/import`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "ui" }),
    });
  },

  async rechunkSubtitlesTikTok(
    projectId: string,
    payload: {
      combineTokensWithinMs?: number;
      breakOnSilenceAfterMs?: number;
      maxWordsPerPage?: number;
    } = {},
  ): Promise<{ pagesCount: number; project: Project }> {
    return fetchJson(`/api/projects/${encodeURIComponent(projectId)}/subtitles/tiktok-rechunk`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "ui" }),
    });
  },

  async getSvgAssetCode(
    projectId: string,
    assetId: string,
  ): Promise<{ asset: Asset; filename: string; svgCode: string; editable: boolean }> {
    return fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/svg`,
    );
  },

  async updateSvgAssetCode(
    projectId: string,
    assetId: string,
    payload: {
      svgCode: string;
      mode: "replace" | "copy";
      copyName?: string;
      updateLayerRef?: { sceneId: string; layerId: string };
    },
  ): Promise<{ asset: Asset; svgCode: string; mode: "replace" | "copy"; project: Project; receipt: EditReceipt }> {
    return fetchJson(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/svg`,
      {
        method: "PUT",
        body: JSON.stringify({ ...payload, requestSource: "ui" }),
      },
    );
  },

  async getStorageStats(): Promise<StorageStatsResponse> {
    return fetchJson("/api/storage/stats");
  },

  async getOnboardingStatus(): Promise<OnboardingStatusPayload> {
    return fetchJson("/api/onboarding/status");
  },

  async completeOnboarding(payload: {
    projectsDir?: string;
    modelsDir?: string;
    customAssetsDir?: string;
    enabledLibraries?: Partial<Record<LibraryId, boolean>>;
    connectivity?: {
      accessMode?: AccessMode;
      mcpHttpEnabled?: boolean;
      mcpAuthEnabled?: boolean;
      tunnelProvider?: TunnelProvider;
      tunnelAutoStart?: boolean;
    };
    preferences?: Partial<OnboardingPreferences>;
    createStarterProject?: boolean;
  }): Promise<{
    ok: boolean;
    completed: boolean;
    restartRequired: boolean;
    starterProjectId: string | null;
    status: OnboardingStatusPayload;
  }> {
    return fetchJson("/api/onboarding/complete", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async skipOnboarding(): Promise<{ ok: boolean; completed: boolean }> {
    return fetchJson("/api/onboarding/skip", { method: "POST", body: "{}" });
  },

  async resetOnboarding(): Promise<{ ok: boolean; completed: boolean }> {
    return fetchJson("/api/onboarding/reset", { method: "POST", body: "{}" });
  },

  async getUpdatesStatus(): Promise<UpdateStatusPayload> {
    return fetchJson("/api/updates/status");
  },

  async updateUpdatesConfig(payload: {
    channel?: UpdateChannel;
    autoCheck?: boolean;
  }): Promise<{ ok: boolean; config: UpdateConfig; status: UpdateStatusPayload }> {
    return fetchJson("/api/updates/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async checkForUpdates(channel?: UpdateChannel): Promise<{
    ok: boolean;
    result: UpdateCheckResult;
    status: UpdateStatusPayload;
  }> {
    return fetchJson("/api/updates/check", {
      method: "POST",
      body: JSON.stringify(channel ? { channel } : {}),
    });
  },

  async downloadUpdate(
    channel?: UpdateChannel,
    wait = false,
  ): Promise<{ ok: boolean; download: UpdateDownloadState }> {
    return fetchJson("/api/updates/download", {
      method: "POST",
      body: JSON.stringify({ ...(channel ? { channel } : {}), wait }),
    });
  },
};

export type UpdateChannel = "stable" | "nightly";

export interface InstalledBuildInfo {
  version: string;
  channel: UpdateChannel;
  commitSha: string;
  commitShort: string;
  commitMessage: string;
  builtAt: string;
  repo: string;
  platformKey: string;
  isDesktopApp: boolean;
}

export interface RemotePlatformAsset {
  filename: string;
  url: string;
  sha256: string;
  size: number;
  kind: "nsis" | "msi" | "dmg" | "appimage" | "deb" | "rpm" | "launcher" | "other";
}

export interface UpdateConfig {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckedAt?: string;
}

export interface UpdateCheckResult {
  checkedAt: string;
  channel: UpdateChannel;
  updateAvailable: boolean;
  switchingChannel: boolean;
  reason: string;
  current: InstalledBuildInfo;
  remote: {
    version: string;
    tag: string;
    commitSha: string;
    commitShort: string;
    commitMessage: string;
    publishedAt: string;
    releaseUrl: string;
    notes: string;
  } | null;
  asset: RemotePlatformAsset | null;
  error?: string;
}

export interface UpdateDownloadState {
  phase: "idle" | "downloading" | "verifying" | "ready" | "error";
  channel?: UpdateChannel;
  filename?: string;
  localPath?: string;
  sha256?: string;
  bytesDownloaded: number;
  totalBytes: number;
  percent: number;
  error?: string;
  readyAt?: string;
}

export interface UpdateStatusPayload {
  current: InstalledBuildInfo;
  config: UpdateConfig;
  lastCheck: UpdateCheckResult | null;
  download: UpdateDownloadState;
  canAutoInstall: boolean;
  localAdminAllowed?: boolean;
}

export interface OnboardingPreferences {
  theme: "dark" | "light";
  language: "es" | "en" | "pt" | "fr";
  defaultAspectRatio: "9:16" | "16:9" | "1:1";
  defaultResolution: "720p" | "1080p" | "2k" | "4k";
  defaultFps: 24 | 30 | 60;
  defaultTtsProvider: string;
  whisperModel: "tiny" | "base" | "small" | "medium";
}

export interface OnboardingStatusPayload {
  completed: boolean;
  shouldShow: boolean;
  isDesktopApp: boolean;
  localAdminAllowed?: boolean;
  completedAt?: string;
  paths: {
    installDir: string;
    dataDir: string;
    projectsDir: string;
    modelsDir: string;
    customAssetsDir: string;
    defaults: {
      dataDir: string;
      projectsDir: string;
      modelsDir: string;
    };
  };
  preferences: OnboardingPreferences;
  system?: {
    platform: string;
    cpus: number;
    totalMemGb: number;
    ffmpegAvailable: boolean;
    ffmpegVersion: string | null;
    recommendedEncoder: string;
    nvencAvailable: boolean;
    pythonAvailable: boolean;
  };
}

export interface OAuthStatusSummary {
  enabled: boolean;
  clientsCount: number;
  activeTokensCount: number;
  clients: {
    clientId: string;
    clientName: string;
    redirectHost: string;
    createdAt: string;
  }[];
}

export interface StorageStatsResponse {
  totalBytes: number;
  projects: { bytes: number; files: number; count: number; dir: string };
  exports: { bytes: number; files: number };
  cache: { searchEntries: number; svgFiles: number; audioFiles: number; totalBytes: number; cacheDir: string };
  models: { bytes: number; files: number; dir: string };
  runtime: {
    uptimeSec: number;
    nodeVersion: string;
    platform: string;
    arch: string;
    osRelease: string;
    cpuModel: string;
    cpus: number;
    freeMemGb: number;
    totalMemGb: number;
    listeningHost: string;
    listeningPort: number;
  };
}

export type ProjectSocketMessage =
  | {
      type: "project.snapshot" | "project.updated";
      projectId: string;
      source?: string;
      receipt?: EditReceipt;
      project: Project;
    }
  | {
      type: "export.progress" | "export.completed" | "export.failed";
      projectId: string;
      job: ExportJob;
    }
  | {
      type: "asset.svg_updated";
      projectId: string;
      assetId: string;
      mode: "replace" | "copy";
      source?: string;
      asset: Asset;
      svgCode: string;
    };

export function connectProjectSocket(
  projectId: string,
  handlers: {
    onMessage: (msg: ProjectSocketMessage) => void;
    onStatus: (status: "connected" | "connecting" | "offline") => void;
  },
): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let retryTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    handlers.onStatus("connecting");
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/ws/projects/${encodeURIComponent(projectId)}`;
    ws = new WebSocket(url);

    ws.onopen = () => handlers.onStatus("connected");
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as ProjectSocketMessage;
        handlers.onMessage(msg);
      } catch {
        // Ignore malformed frames
      }
    };
    ws.onerror = () => handlers.onStatus("offline");
    ws.onclose = () => {
      if (closed) return;
      handlers.onStatus("offline");
      retryTimer = window.setTimeout(connect, 2500);
    };
  };

  connect();

  return () => {
    closed = true;
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    ws?.close();
  };
}
