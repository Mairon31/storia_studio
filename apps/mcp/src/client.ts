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

export interface CaptureFrameResponse {
  projectId: string;
  timeSec: number;
  width: number;
  height: number;
  sceneId: string | null;
  sceneName: string | null;
  pngDataUrl: string;
}

export class StoriaServerClient {
  public readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const host = process.env.STORIA_SERVER_HOST ?? "localhost";
    const port = process.env.STORIA_SERVER_PORT ?? "4310";
    this.baseUrl = (baseUrl ?? process.env.STORIA_SERVER_URL ?? `http://${host}:${port}`).replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Storia-Client": "mcp",
          ...(init?.headers ?? {}),
        },
      });
    } catch (err) {
      throw new Error(
        `Cannot reach Storia Studio server at ${this.baseUrl}. Start it with 'pnpm dev' or 'pnpm dev:server'. (${err instanceof Error ? err.message : String(err)})`,
      );
    }

    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const msg =
        typeof parsed === "object" && parsed !== null && "message" in parsed
          ? String((parsed as { message: unknown }).message)
          : text || res.statusText;
      throw new Error(`Storia Server HTTP ${res.status}: ${msg}`);
    }
    return parsed as T;
  }

  health(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/health");
  }

  capabilities(refresh = false): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/system/capabilities${refresh ? "?refresh=true" : ""}`);
  }

  async listProjects(): Promise<ProjectSummary[]> {
    const data = await this.request<{ projects: ProjectSummary[] }>("/api/projects");
    return data.projects;
  }

  async getProject(projectId: string): Promise<Project> {
    const data = await this.request<{ project: Project }>(`/api/projects/${encodeURIComponent(projectId)}`);
    return data.project;
  }

  async createProject(params: {
    id?: string;
    name?: string;
    template?: "demo" | "blank";
    aspectRatio?: AspectRatio;
    resolution?: ResolutionPreset;
    fps?: Fps;
  }): Promise<Project> {
    const data = await this.request<{ project: Project }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(params),
    });
    return data.project;
  }

  applyOperations(
    projectId: string,
    operations: ProjectOperation[],
  ): Promise<{ project: Project; receipt: EditReceipt }> {
    return this.request<{ project: Project; receipt: EditReceipt }>(
      `/api/projects/${encodeURIComponent(projectId)}/operations`,
      {
        method: "POST",
        body: JSON.stringify({ operations, source: "mcp" }),
      },
    );
  }

  restoreSnapshot(projectId: string, snapshotId: string): Promise<{ project: Project; restoredSnapshotId: string }> {
    return this.request<{ project: Project; restoredSnapshotId: string }>(
      `/api/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      { method: "POST", body: "{}" },
    );
  }

  uploadAsset(
    projectId: string,
    payload: {
      id?: string;
      name: string;
      filename: string;
      kind: AssetKind;
      scaleMode?: ScaleMode;
      mimeType?: string;
      base64: string;
    },
  ): Promise<{ asset: Asset; project: Project; receipt: EditReceipt }> {
    return this.request<{ asset: Asset; project: Project; receipt: EditReceipt }>(
      `/api/projects/${encodeURIComponent(projectId)}/assets`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  captureFrame(
    projectId: string,
    params: { timeSec: number; width?: number; height?: number; burnSubtitles?: boolean },
  ): Promise<CaptureFrameResponse> {
    return this.request<CaptureFrameResponse>(`/api/projects/${encodeURIComponent(projectId)}/capture-frame`, {
      method: "POST",
      body: JSON.stringify({ ...params, format: "json" }),
    });
  }

  startExport(
    projectId: string,
    params: { settings?: Partial<ExportSettings>; outputName?: string; wait?: boolean },
  ): Promise<{ job: Record<string, unknown> }> {
    return this.request<{ job: Record<string, unknown> }>(
      `/api/projects/${encodeURIComponent(projectId)}/exports`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
    );
  }

  listExports(projectId: string): Promise<{ jobs: Record<string, unknown>[]; files: Record<string, unknown>[] }> {
    return this.request<{ jobs: Record<string, unknown>[]; files: Record<string, unknown>[] }>(
      `/api/projects/${encodeURIComponent(projectId)}/exports`,
    );
  }

  getExportJob(jobId: string): Promise<{ job: Record<string, unknown> }> {
    return this.request<{ job: Record<string, unknown> }>(`/api/exports/${encodeURIComponent(jobId)}`);
  }

  cancelExport(jobId: string): Promise<{ job: Record<string, unknown> }> {
    return this.request<{ job: Record<string, unknown> }>(`/api/exports/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
      body: "{}",
    });
  }

  getLibrariesCatalog(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/libraries/catalog");
  }

  searchVectorLibrary(params: {
    q?: string;
    source?:
      | "all"
      | "videos"
      | "workspace"
      | "iconify"
      | "openverse"
      | "wikimedia"
      | "pixel_game_sprites"
      | "openmoji_props"
      | "svg_backgrounds";
    category?: "all" | "backgrounds" | "sprites" | "overlays" | "icons";
    video?: string;
    collection?: string;
    color?: string;
    page?: number;
    pageSize?: number;
    refresh?: boolean;
  }): Promise<Record<string, unknown>> {
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
    return this.request<Record<string, unknown>>(`/api/libraries/vectors?${sp.toString()}`);
  }

  importVectorFromLibrary(
    projectId: string,
    payload: {
      itemId?: string;
      iconifyName?: string;
      remoteUrl?: string;
      color?: string;
      name: string;
      source?:
        | "videos"
        | "workspace"
        | "iconify"
        | "openverse"
        | "wikimedia"
        | "pixel_game_sprites"
        | "openmoji_props"
        | "svg_backgrounds";
      category?: string;
      license?: string;
      author?: string;
      sourceUrl?: string;
      insertMode?: "asset_only" | "sprite" | "background";
      sceneId?: string;
      widthNorm?: number;
      scaleMode?: ScaleMode;
    },
  ): Promise<{ asset: Asset; insertedLayerId?: string; sceneId?: string; project: Project; receipt: EditReceipt }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/libraries/vectors/import`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  searchAudioLibrary(params: {
    q?: string;
    source?: "openverse" | "wikimedia" | "internet_archive" | "local" | "all";
    category?: "all" | "sfx" | "music" | "ambience" | "psx";
    license?: "all" | "cc0" | "cc-by";
    duration?: "all" | "short" | "medium" | "long";
    page?: number;
    pageSize?: number;
    refresh?: boolean;
  }): Promise<Record<string, unknown>> {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.source) sp.set("source", params.source);
    if (params.category) sp.set("category", params.category);
    if (params.license) sp.set("license", params.license);
    if (params.duration) sp.set("duration", params.duration);
    if (params.page) sp.set("page", String(params.page));
    if (params.pageSize) sp.set("pageSize", String(params.pageSize));
    if (params.refresh) sp.set("refresh", "true");
    return this.request<Record<string, unknown>>(`/api/libraries/audio?${sp.toString()}`);
  }

  importAudioFromLibrary(
    projectId: string,
    payload: {
      itemId?: string;
      remoteUrl?: string;
      name: string;
      category?: "sfx" | "music" | "ambience";
      source?: "openverse" | "wikimedia" | "internet_archive" | "local_workspace" | "local_videos" | "local";
      license?: string;
      author?: string;
      attribution?: string;
      sourceUrl?: string;
      durationSec?: number;
      insertToTimeline?: boolean;
      startSec?: number;
      trackId?: string;
    },
  ): Promise<{ asset: Asset; durationSec: number; insertedClipId?: string; trackId?: string; project: Project; receipt: EditReceipt }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/libraries/audio/import`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  getTtsProviders(refresh = false): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(`/api/tts/providers${refresh ? "?refresh=true" : ""}`);
  }

  listTtsVoices(provider: string, refresh = false): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/tts/voices?provider=${encodeURIComponent(provider)}${refresh ? "&refresh=true" : ""}`,
    );
  }

  generateProjectTts(
    projectId: string,
    payload: {
      provider: "windows_sapi" | "elevenlabs" | "voicestudio" | "piper" | "kokoro" | "openai" | "custom_api";
      text: string;
      voiceId?: string;
      language?: string;
      speed?: number;
      modelId?: string;
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
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/tts/generate`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "mcp" }),
    });
  }

  generateProjectTtsFromSubtitles(
    projectId: string,
    payload: {
      provider: "windows_sapi" | "elevenlabs" | "voicestudio" | "piper" | "kokoro" | "openai" | "custom_api";
      mode: "grouped" | "individual";
      cueIds?: string[];
      voiceId?: string;
      language?: string;
      speed?: number;
      modelId?: string;
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
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/tts/from-subtitles`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "mcp" }),
    });
  }

  // ============================================================================
  // STICKMAN VIDEO DIRECTOR: 18 STYLES, GUIDES, FONTS, AUDIO & AUTO-ASSEMBLY
  // ============================================================================

  listDirectorStyles(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/director/styles");
  }

  getDirectorGuide(filename: string, maxChars = 16000): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/director/guides/${encodeURIComponent(filename)}?maxChars=${maxChars}`,
    );
  }

  listBundledFonts(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/api/fonts");
  }

  recommendDirectorAudio(params: {
    style: string;
    beat?: string;
    q?: string;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    const sp = new URLSearchParams({ style: params.style });
    if (params.beat) sp.set("beat", params.beat);
    if (params.q) sp.set("q", params.q);
    if (params.limit) sp.set("limit", String(params.limit));
    return this.request<Record<string, unknown>>(`/api/director/audio/recommend?${sp.toString()}`);
  }

  assembleDirectedVideo(
    projectId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/projects/${encodeURIComponent(projectId)}/director/assemble`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  importSubtitles(
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
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/projects/${encodeURIComponent(projectId)}/subtitles/import`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  rechunkSubtitlesTikTok(
    projectId: string,
    payload: {
      combineTokensWithinMs?: number;
      breakOnSilenceAfterMs?: number;
      maxWordsPerPage?: number;
    },
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      `/api/projects/${encodeURIComponent(projectId)}/subtitles/tiktok-rechunk`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  getSvgAssetCode(
    projectId: string,
    assetId: string,
  ): Promise<{ asset: Asset; filename: string; svgCode: string; editable: boolean }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/svg`,
    );
  }

  updateSvgAssetCode(
    projectId: string,
    assetId: string,
    payload: {
      svgCode: string;
      mode?: "replace" | "copy";
      copyName?: string;
      updateLayerRef?: { sceneId: string; layerId: string };
    },
  ): Promise<{ asset: Asset; svgCode: string; mode: "replace" | "copy"; project: Project; receipt: EditReceipt }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/svg`,
      {
        method: "PUT",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  processAudioClip(
    projectId: string,
    payload: {
      trackId: string;
      clipId: string;
      action: "denoise" | "voice_enhance" | "normalize" | "trim_silence" | "deess_warm" | "fade_clean";
    },
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/audio/process`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  transcribeAudioClip(
    projectId: string,
    payload: {
      trackId: string;
      clipId: string;
      language?: string;
      model?: "tiny" | "base" | "small" | "medium";
      replaceExisting?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/audio/transcribe`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  applyTransitionWithSfx(
    projectId: string,
    payload: {
      sceneId: string;
      type: string;
      duration?: number;
      accentColor?: string;
      sfx?: string;
      applyToAll?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/transitions/apply`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  deleteProject(projectId: string): Promise<{ deleted: boolean }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}`, {
      method: "DELETE",
    });
  }

  getStorageStats(): Promise<Record<string, unknown>> {
    return this.request("/api/storage/stats");
  }

  // ============================================================================
  // AI POWER TOOLS: MULTI-FRAME VISUAL PREVIEW, ASSET RASTER PREVIEW,
  // MP4 INSPECTOR, AUDIO/TTS ANALYZER & BENCHMARK, ASSET ENHANCER & REPLACER,
  // DEEP DEBUGGER & SYSTEM DIAGNOSTICS
  // ============================================================================

  captureFramesBatch(
    projectId: string,
    payload: {
      mode?: "timestamps" | "scene_midpoints" | "scene_cuts" | "even_grid";
      timestamps?: number[];
      count?: number;
      width?: number;
      height?: number;
      burnSubtitles?: boolean;
      contactSheet?: boolean;
      columns?: number;
      includeIndividualFrames?: boolean;
    },
  ): Promise<{
    projectId: string;
    durationSec: number;
    mode: string;
    contactSheet: { pngDataUrl: string; width: number; height: number } | null;
    frames: {
      timeSec: number;
      width: number;
      height: number;
      sceneId: string | null;
      sceneName: string | null;
      pngDataUrl?: string;
    }[];
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/capture-frames-batch`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  previewProjectAssetPng(
    projectId: string,
    assetId: string,
    payload: {
      maxSize?: number;
      background?: "checkerboard" | "dark" | "light" | "transparent";
    } = {},
  ): Promise<{
    projectId: string;
    assetId: string;
    name: string;
    kind: string;
    mimeType: string;
    fileSizeBytes: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    opaqueCoverageRatio: number;
    pngDataUrl: string;
  }> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/preview-png`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  previewLibraryVectorPng(payload: {
    itemId?: string;
    iconifyName?: string;
    remoteUrl?: string;
    color?: string;
    maxSize?: number;
    background?: "checkerboard" | "dark" | "light" | "transparent";
    pixelated?: boolean;
  }): Promise<{
    filename: string;
    mimeType: string;
    sourceBytes: number;
    width: number;
    height: number;
    naturalWidth: number;
    naturalHeight: number;
    opaqueCoverageRatio: number;
    pngDataUrl: string;
  }> {
    return this.request("/api/libraries/vectors/preview-png", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  inspectExportedVideo(
    projectId: string,
    payload: {
      filename?: string;
      timestamps?: number[];
      maxWidth?: number;
    } = {},
  ): Promise<{
    projectId: string;
    filename: string;
    filePath: string;
    fileSizeBytes: number;
    durationSec: number;
    width: number;
    height: number;
    fps: number | null;
    videoCodec: string | null;
    audioCodec: string | null;
    videoBitrateKbps: number | null;
    audioAnalysis: Record<string, unknown> | null;
    frames: { timestampSec: number; pngDataUrl: string; width: number; height: number }[];
  }> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/exports/inspect`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  analyzeProjectAudio(
    projectId: string,
    payload: {
      assetId?: string;
      trackId?: string;
      clipId?: string;
    } = {},
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/audio/analyze`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  benchmarkTts(payload: {
    provider?: string;
    text?: string;
    voiceId?: string;
    language?: string;
    speed?: number;
    modelId?: string;
  }): Promise<Record<string, unknown>> {
    return this.request("/api/tts/benchmark", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  enhanceAsset(
    projectId: string,
    assetId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request(
      `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/enhance`,
      {
        method: "POST",
        body: JSON.stringify({ ...payload, requestSource: "mcp" }),
      },
    );
  }

  replaceProjectAsset(
    projectId: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/assets/replace`, {
      method: "POST",
      body: JSON.stringify({ ...payload, requestSource: "mcp" }),
    });
  }

  debugProject(
    projectId: string,
    payload: { timestamp?: number; checkDiskAssets?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    return this.request(`/api/projects/${encodeURIComponent(projectId)}/debug`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  runDiagnostics(payload: {
    checkPython?: boolean;
    checkTts?: boolean;
    checkLibraries?: boolean;
    smokeRenderProjectId?: string;
  } = {}): Promise<Record<string, unknown>> {
    return this.request("/api/diagnostics/run", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}
