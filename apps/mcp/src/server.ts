import fs from "node:fs/promises";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ActiveWordEffectSchema,
  AnimatablePropertySchema,
  AnimationStyleIdSchema,
  applyProjectOperations,
  AspectRatioSchema,
  AssetKindSchema,
  AudioClipSchema,
  AudioTrackSchema,
  CameraFramingSchema,
  CanvasConfigSchema,
  CHARACTER_ROLE_PRESETS,
  CharacterAgeSchema,
  CharacterDefinitionSchema,
  CharacterExpressionSchema,
  CharacterPoseSchema,
  CharacterRenderStyleSchema,
  createEditReceipt,
  EasingTypeSchema,
  EffectClipSchema,
  EffectClipTypeSchema,
  ExportSettingsSchema,
  FacialHairStyleSchema,
  FpsSchema,
  getProjectDuration,
  getSubtitleStylePreset,
  GlassesStyleSchema,
  HairStyleSchema,
  HatStyleSchema,
  IdSchema,
  KeyframeSchema,
  KeywordFxSchema,
  LayerEnterAnimSchema,
  LayerExitAnimSchema,
  LayerLoopMotionSchema,
  LayerSchema,
  OutfitStyleSchema,
  PantsStyleSchema,
  PostProcessingSchema,
  Project,
  ProjectOperation,
  ProjectOperationSchema,
  ResolutionPresetSchema,
  ScaleModeSchema,
  SceneSchema,
  ShapeKindSchema,
  SUBTITLE_STYLE_PRESETS,
  SubtitleAnimationSchema,
  SubtitleCueSchema,
  SubtitleOverlayStyleSchema,
  SubtitleStyleSchema,
  SubtitleVfxInSchema,
  SubtitleVfxOutSchema,
  SubtitleWordSchema,
  TimelineMarkerSchema,
  TransitionSfxPresetSchema,
  TransitionTypeSchema,
  WordEmphasisSchema,
} from "@storia/schema";
import { auditProject } from "./audit.js";
import { StoriaServerClient } from "./client.js";

function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Normalizes Windows drive paths (e.g. `M:\Documentos\...`) to WSL paths (`/mnt/m/Documentos/...`)
 * when running under Linux/WSL2, while leaving native paths untouched.
 */
export function resolveCrossPlatformPath(inputPath: string): string {
  const trimmed = inputPath.trim();
  if (process.platform === "linux") {
    const winMatch = trimmed.match(/^([a-zA-Z]):[\\/](.*)$/);
    if (winMatch && winMatch[1] && winMatch[2] !== undefined) {
      const drive = winMatch[1].toLowerCase();
      const rest = winMatch[2].replace(/\\/g, "/");
      return `/mnt/${drive}/${rest}`;
    }
  }
  return trimmed;
}

const SENSITIVE_PATH_PATTERNS = [
  /(?:^|[\\/])\.vault\.key$/i,
  /(?:^|[\\/])\.storia-studio(?:[\\/]|$)/i,
  /(?:^|[\\/])\.ssh(?:[\\/]|$)/i,
  /(?:^|[\\/])\.aws(?:[\\/]|$)/i,
  /(?:^|[\\/])\.gnupg(?:[\\/]|$)/i,
  /(?:^|[\\/])\.env(?:\.[^\\/]*)?$/i,
  /(?:^|[\\/])(?:id_rsa|id_ed25519|id_ecdsa)(?:\.pub)?$/i,
  /^\/etc\/(?:passwd|shadow|sudoers|hosts)/i,
  /[\\/]windows[\\/]system32[\\/]config[\\/](?:sam|system|security)$/i,
  /(?:^|[\\/])(?:tts-settings|connectivity|mcp-oauth)\.json$/i,
];

function assertSafeLocalFilePath(resolvedPath: string): void {
  const normalized = path.resolve(resolvedPath);
  for (const re of SENSITIVE_PATH_PATTERNS) {
    if (re.test(normalized)) {
      throw new Error("Access to sensitive system or credential file paths is blocked for security.");
    }
  }
}

function summarizeProject(project: Project) {
  let cursor = 0;
  const scenes = project.scenes.map((s) => {
    const start = Number(cursor.toFixed(3));
    cursor += s.duration;
    return {
      id: s.id,
      name: s.name,
      start,
      end: Number(cursor.toFixed(3)),
      duration: s.duration,
      mood: s.mood,
      framing: s.camera.framing,
      transitionIn: s.transitionIn.type,
      transitionOut: s.transitionOut.type,
      layers: s.layers.map((l) => ({
        id: l.id,
        type: l.type,
        name: l.name,
        zIndex: l.zIndex,
        visible: l.visible,
        x: l.transform.x,
        y: l.transform.y,
        scaleX: l.transform.scaleX,
      })),
    };
  });

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    updatedAt: project.updatedAt,
    durationSec: Number(getProjectDuration(project).toFixed(3)),
    canvas: project.canvas,
    postProcessing: project.postProcessing,
    exportSettings: project.exportSettings,
    cast: project.cast.map((c) => ({ id: c.id, name: c.name, kind: c.kind, age: c.age, role: c.role })),
    assets: project.assets.map((a) => ({ id: a.id, name: a.name, kind: a.kind, scaleMode: a.scaleMode, src: a.src })),
    scenes,
    audioTracks: project.audioTracks.map((t) => ({
      id: t.id,
      name: t.name,
      role: t.role,
      volume: t.volume,
      muted: t.muted,
      clipCount: t.clips.length,
    })),
    subtitles: {
      enabled: project.subtitles.enabled,
      language: project.subtitles.language,
      style: project.subtitles.style,
      cueCount: project.subtitles.cues.length,
      cues: project.subtitles.cues.map((c) => ({
        id: c.id,
        start: c.start,
        end: c.end,
        text: c.text,
        wordCount: c.words.length,
      })),
    },
  };
}

export interface CreateStoriaMcpServerOptions {
  serverUrl?: string;
  client?: StoriaServerClient;
  /**
   * When false (e.g. remote Streamable HTTP `/mcp` over ngrok/Cloudflare tunnels),
   * disables tools/options that read or write arbitrary paths on the host filesystem.
   * Defaults to true for local stdio sessions.
   */
  allowLocalFilesystem?: boolean;
}

const READ_LOCAL: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const READ_WEB: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

const EDIT_LOCAL_SAFE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const EDIT_LOCAL_CREATE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const EDIT_WEB_IMPORT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

const EDIT_DESTRUCTIVE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

export const STORIA_TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // Read-only local inspection & catalogs (auto-approvable by MCP clients)
  studio_health: { ...READ_LOCAL, title: "Check Studio Health" },
  list_projects: { ...READ_LOCAL, title: "List Projects" },
  get_project: { ...READ_LOCAL, title: "Get Project State" },
  list_assets: { ...READ_LOCAL, title: "List Project Assets" },
  audit_project: { ...READ_LOCAL, title: "Audit Project" },
  capture_frame: { ...READ_LOCAL, title: "Capture Preview Frame" },
  get_export_status: { ...READ_LOCAL, title: "Get Export Status" },
  list_compatible_libraries: { ...READ_LOCAL, title: "List Media Libraries" },
  list_tts_providers: { ...READ_LOCAL, title: "List TTS Providers" },
  list_animation_styles: { ...READ_LOCAL, title: "List Animation Styles" },
  get_style_direction_guide: { ...READ_LOCAL, title: "Read Style Guide" },
  recommend_style_audio: { ...READ_LOCAL, title: "Recommend Curated Audio" },
  list_bundled_fonts: { ...READ_LOCAL, title: "List Bundled Fonts" },
  read_svg_asset: { ...READ_LOCAL, title: "Read SVG Source Code" },
  list_editor_catalogs: { ...READ_LOCAL, title: "List Editor Catalogs" },
  preview_video_frames: { ...READ_LOCAL, title: "Preview Video Frames / Contact Sheet" },
  preview_visual_asset: { ...READ_WEB, title: "Preview Visual Asset (Project or Library)" },
  inspect_exported_video: { ...READ_LOCAL, title: "Inspect Exported MP4 Video" },
  analyze_audio_and_tts: { ...READ_LOCAL, title: "Analyze Audio, Sync & Benchmark TTS" },
  debug_project_state: { ...READ_LOCAL, title: "Debug Project & Frame State" },
  run_studio_diagnostics: { ...READ_LOCAL, title: "Run Studio Self-Test & Diagnostics" },

  // Read-only online library queries
  search_vector_library: { ...READ_WEB, title: "Search Vector Libraries" },
  search_audio_library: { ...READ_WEB, title: "Search Audio Libraries" },
  list_tts_voices: { ...READ_WEB, title: "List TTS Voices" },

  // Reversible snapshot-backed local studio edits (non-destructive)
  edit_audit_and_render: { ...EDIT_LOCAL_CREATE, title: "Batch Edit, Audit & Render" },
  create_project: { ...EDIT_LOCAL_CREATE, title: "Create Project" },
  update_canvas: { ...EDIT_LOCAL_SAFE, title: "Update Canvas" },
  update_post_processing: { ...EDIT_LOCAL_SAFE, title: "Update Post-Processing" },
  import_local_asset: { ...EDIT_LOCAL_CREATE, title: "Import Local Asset" },
  upsert_character: { ...EDIT_LOCAL_SAFE, title: "Upsert Character" },
  apply_operations: { ...EDIT_LOCAL_CREATE, title: "Apply Batch Operations" },
  add_scene: { ...EDIT_LOCAL_CREATE, title: "Add Scene" },
  update_scene: { ...EDIT_LOCAL_SAFE, title: "Update Scene" },
  upsert_layer: { ...EDIT_LOCAL_SAFE, title: "Upsert Layer" },
  update_layer: { ...EDIT_LOCAL_SAFE, title: "Update Layer" },
  set_keyframe: { ...EDIT_LOCAL_SAFE, title: "Set Keyframe" },
  update_subtitle_style: { ...EDIT_LOCAL_SAFE, title: "Update Subtitle Style" },
  upsert_subtitle_cue: { ...EDIT_LOCAL_SAFE, title: "Upsert Subtitle Cue" },
  update_subtitle_word: { ...EDIT_LOCAL_SAFE, title: "Update Subtitle Word" },
  upsert_audio_clip: { ...EDIT_LOCAL_SAFE, title: "Upsert Audio Clip" },
  restore_snapshot: { ...EDIT_LOCAL_SAFE, title: "Restore Snapshot" },
  start_export: { ...EDIT_LOCAL_CREATE, title: "Start MP4 Export" },
  cancel_export: { ...EDIT_LOCAL_SAFE, title: "Cancel Export" },
  apply_animation_style: { ...EDIT_LOCAL_SAFE, title: "Apply Animation Style" },
  direct_and_assemble_video: { ...EDIT_LOCAL_CREATE, title: "Direct & Assemble Full Video" },
  import_subtitles_srt_vtt: { ...EDIT_LOCAL_SAFE, title: "Import SRT/VTT Subtitles" },
  rechunk_subtitles_tiktok: { ...EDIT_LOCAL_SAFE, title: "Rechunk TikTok Subtitles" },
  update_svg_asset: { ...EDIT_LOCAL_SAFE, title: "Edit SVG Source Live" },
  apply_subtitle_preset: { ...EDIT_LOCAL_SAFE, title: "Apply Subtitle Preset" },
  update_subtitle_cue_style: { ...EDIT_LOCAL_SAFE, title: "Style Individual Subtitle Cue" },
  upsert_effect_clip: { ...EDIT_LOCAL_SAFE, title: "Upsert Timed Effect Clip" },
  upsert_marker: { ...EDIT_LOCAL_SAFE, title: "Upsert Timeline Marker" },
  process_audio_clip: { ...EDIT_LOCAL_CREATE, title: "Process Audio DSP" },
  transcribe_audio_clip: { ...EDIT_LOCAL_SAFE, title: "Transcribe Audio (Whisper)" },
  apply_transition_with_sfx: { ...EDIT_LOCAL_SAFE, title: "Apply Transition + SFX" },
  create_svg_asset: { ...EDIT_LOCAL_CREATE, title: "Create SVG Vector Asset" },
  enhance_asset: { ...EDIT_LOCAL_SAFE, title: "Enhance Project Asset (Audio/Image/SVG)" },
  replace_project_asset: { ...EDIT_WEB_IMPORT, title: "Replace Project Resource" },

  // Online asset downloads / TTS synthesis into project
  insert_vector_from_library: { ...EDIT_WEB_IMPORT, title: "Insert Vector From Library" },
  insert_audio_from_library: { ...EDIT_WEB_IMPORT, title: "Insert Audio From Library" },
  generate_tts_voice: { ...EDIT_WEB_IMPORT, title: "Generate TTS Narration" },
  generate_tts_from_subtitles: { ...EDIT_WEB_IMPORT, title: "Generate TTS From Subtitles" },

  // Destructive removals / deletions
  remove_layer: { ...EDIT_DESTRUCTIVE, title: "Remove Layer" },
  remove_effect_clip: { ...EDIT_DESTRUCTIVE, title: "Remove Effect Clip" },
  remove_marker: { ...EDIT_DESTRUCTIVE, title: "Remove Timeline Marker" },
  manage_scene: { ...EDIT_DESTRUCTIVE, title: "Manage Scene (Split/Remove/Reorder)" },
  manage_audio_track: { ...EDIT_DESTRUCTIVE, title: "Manage Audio Track" },
  manage_project: { ...EDIT_DESTRUCTIVE, title: "Manage / Delete Project" },
};

export function createStoriaMcpServer(options: CreateStoriaMcpServerOptions = {}): McpServer {
  const client = options.client ?? new StoriaServerClient(options.serverUrl);
  const allowLocalFilesystem = options.allowLocalFilesystem ?? true;

  const server = new McpServer(
    {
      name: "storia-studio-mcp",
      version: "0.2.0",
    },
    {
      instructions:
        "Storia Studio 2D NLE MCP Server. To minimize confirmation prompts and maximize speed in web chat clients (Gemini, ChatGPT, Claude), ALWAYS prefer `edit_audit_and_render` to combine batch edits (`operations`, `animationStyleId`, `subtitlePresetId`), quality auditing (`audit`), frame inspection (`captureTimestamps`), and MP4 export (`exportVideo`) in ONE single call—or `direct_and_assemble_video` when creating a full video from scratch. Every mutation auto-saves a rollback snapshot.",
    },
  );

  // Automatically attach accurate MCP ToolAnnotations to every registered tool
  const rawTool = server.tool.bind(server);
  server.tool = ((...args: unknown[]) => {
    const registered = (rawTool as (...a: unknown[]) => ReturnType<typeof rawTool>)(...args);
    const name = typeof args[0] === "string" ? args[0] : "";
    const annotations = STORIA_TOOL_ANNOTATIONS[name];
    if (annotations) {
      registered.update({ annotations });
    }
    return registered;
  }) as typeof server.tool;

  // ==========================================================================
  // 1. HEALTH & SYSTEM CAPABILITIES
  // ==========================================================================
  server.tool(
    "studio_health",
    "Check Storia Studio local server connectivity, FFmpeg version, and GPU NVENC / CPU encoder capabilities.",
    {
      refreshCapabilities: z.boolean().optional().default(false),
    },
    async ({ refreshCapabilities }) => {
      const [health, capabilities] = await Promise.all([
        client.health(),
        client.capabilities(refreshCapabilities),
      ]);
      return jsonContent({ serverUrl: client.baseUrl, health, capabilities });
    },
  );

  // ==========================================================================
  // 2. PROJECT MANAGEMENT
  // ==========================================================================
  server.tool(
    "list_projects",
    "List all Storia Studio projects stored locally with aspect ratio, resolution, FPS, scene count, and duration.",
    async () => {
      const projects = await client.listProjects();
      return jsonContent({ count: projects.length, projects });
    },
  );

  server.tool(
    "get_project",
    "Read the live state of a Storia Studio project (including manual edits made by the user in the browser). Set summaryOnly=true for a compact overview.",
    {
      projectId: IdSchema,
      summaryOnly: z.boolean().optional().default(false),
    },
    async ({ projectId, summaryOnly }) => {
      const project = await client.getProject(projectId);
      return jsonContent(summaryOnly ? summarizeProject(project) : { project });
    },
  );

  server.tool(
    "create_project",
    "Create a new Storia Studio project ('demo' or 'blank') with configurable aspect ratio, resolution, and FPS.",
    {
      id: IdSchema.optional(),
      name: z.string().min(1).max(160).optional(),
      template: z.enum(["demo", "blank"]).optional().default("demo"),
      aspectRatio: AspectRatioSchema.optional().default("9:16"),
      resolution: ResolutionPresetSchema.optional().default("1080p"),
      fps: FpsSchema.optional().default(30),
    },
    async (args) => {
      const project = await client.createProject(args);
      return jsonContent({ created: true, project: summarizeProject(project) });
    },
  );

  server.tool(
    "update_canvas",
    "Update project canvas format (9:16, 16:9, 1:1, custom), resolution (360p..4k), FPS (24/30/60), background color, or pixel grid. Updates the live browser immediately.",
    {
      projectId: IdSchema,
      patch: CanvasConfigSchema.partial(),
      syncExportSettings: z.boolean().optional().default(true),
    },
    async ({ projectId, patch, syncExportSettings }) => {
      const ops: ProjectOperation[] = [{ op: "canvas.update", patch }];
      if (syncExportSettings) {
        const exportPatch: Record<string, unknown> = {};
        if (patch.aspectRatio) exportPatch.aspectRatio = patch.aspectRatio;
        if (patch.resolution) exportPatch.resolution = patch.resolution;
        if (patch.customWidth) exportPatch.customWidth = patch.customWidth;
        if (patch.customHeight) exportPatch.customHeight = patch.customHeight;
        if (patch.fps) exportPatch.fps = patch.fps;
        if (Object.keys(exportPatch).length > 0) {
          ops.push({ op: "exportSettings.update", patch: exportPatch });
        }
      }
      const { project, receipt } = await client.applyOperations(projectId, ops);
      return jsonContent({ receipt, canvas: project.canvas, exportSettings: project.exportSettings });
    },
  );

  server.tool(
    "update_post_processing",
    "Configure GPU retro/editorial post-processing shaders (clean, psx, pixel_art, cinematic, noir, custom) and parameters (dithering, scanlines, halation, chromatic aberration, film grain, vignette).",
    {
      projectId: IdSchema,
      patch: PostProcessingSchema.partial(),
    },
    async ({ projectId, patch }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "postProcessing.update", patch },
      ]);
      return jsonContent({ receipt, postProcessing: project.postProcessing });
    },
  );

  // ==========================================================================
  // 3. ASSETS & CHARACTERS
  // ==========================================================================
  server.tool(
    "list_assets",
    "List all imported media assets (SVGs, pixel-art sprites, images, audio files, fonts) registered in a project.",
    {
      projectId: IdSchema,
    },
    async ({ projectId }) => {
      const project = await client.getProject(projectId);
      return jsonContent({ projectId, count: project.assets.length, assets: project.assets });
    },
  );

  server.tool(
    "import_local_asset",
    "Import a local file from disk (supports both Windows M:\\... and WSL /mnt/m/... paths) into a project's assets folder and register it live. Pixel-art assets automatically use crisp nearest-neighbor sampling.",
    {
      projectId: IdSchema,
      filePath: z.string().min(1),
      name: z.string().min(1).max(160).optional(),
      kind: AssetKindSchema,
      id: IdSchema.optional(),
      scaleMode: ScaleModeSchema.optional(),
    },
    async ({ projectId, filePath, name, kind, id, scaleMode }) => {
      if (!allowLocalFilesystem) {
        throw new Error(
          "import_local_asset is disabled on remote HTTP MCP connections for security. Use insert_vector_from_library, insert_audio_from_library, create_svg_asset, or upload via the Studio UI.",
        );
      }
      const resolvedPath = resolveCrossPlatformPath(filePath);
      assertSafeLocalFilePath(resolvedPath);
      const buf = await fs.readFile(resolvedPath);
      const filename = path.basename(resolvedPath);
      const result = await client.uploadAsset(projectId, {
        id,
        name: name ?? path.parse(filename).name,
        filename,
        kind,
        scaleMode: scaleMode ?? (kind === "pixel_art" ? "nearest" : "linear"),
        base64: buf.toString("base64"),
      });
      return jsonContent({ asset: result.asset, receipt: result.receipt });
    },
  );

  server.tool(
    "upsert_character",
    "Create or update an articulated 2D character definition in project.cast (procedural rig, modular sprites, or full sprite).",
    {
      projectId: IdSchema,
      character: CharacterDefinitionSchema,
    },
    async ({ projectId, character }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "character.upsert", character },
      ]);
      return jsonContent({ receipt, castCount: project.cast.length, character });
    },
  );

  // ==========================================================================
  // 4. ATOMIC OPERATIONS (WITH DRY-RUN) + SCENES / LAYERS / KEYFRAMES
  // ==========================================================================
  server.tool(
    "apply_operations",
    "Apply one or more atomic ProjectOperations live to the project (broadcasting immediately over WebSocket to the browser UI) and return an auditable EditReceipt with a rollback snapshotId. Pass dryRun=true to validate and preview impact without saving.",
    {
      projectId: IdSchema,
      operations: z.array(ProjectOperationSchema).min(1).max(200),
      dryRun: z.boolean().optional().default(false),
    },
    async ({ projectId, operations, dryRun }) => {
      if (dryRun) {
        const before = await client.getProject(projectId);
        const simulated = applyProjectOperations(before, operations);
        const previewReceipt = createEditReceipt({
          before,
          after: simulated,
          operations,
          source: "mcp",
        });
        const audit = auditProject(simulated);
        return jsonContent({
          dryRun: true,
          valid: true,
          previewReceipt,
          auditSummary: { ok: audit.ok, score: audit.score, counts: audit.counts },
        });
      }
      const { project, receipt } = await client.applyOperations(projectId, operations);
      return jsonContent({
        dryRun: false,
        receipt,
        projectSummary: summarizeProject(project),
      });
    },
  );

  server.tool(
    "add_scene",
    "Add a new scene to the timeline at an optional index (defaults to appending at the end).",
    {
      projectId: IdSchema,
      scene: SceneSchema,
      index: z.number().int().min(0).optional(),
    },
    async ({ projectId, scene, index }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "scene.add", scene, index },
      ]);
      return jsonContent({ receipt, sceneCount: project.scenes.length, durationSec: getProjectDuration(project) });
    },
  );

  server.tool(
    "update_scene",
    "Update properties of an existing scene (name, duration, mood, camera framing/zoom/handheld, transitionIn/Out, notes).",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      patch: SceneSchema.omit({ id: true, layers: true }).partial(),
    },
    async ({ projectId, sceneId, patch }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "scene.update", sceneId, patch },
      ]);
      const scene = project.scenes.find((s) => s.id === sceneId);
      return jsonContent({ receipt, scene });
    },
  );

  server.tool(
    "upsert_layer",
    "Add a new layer (background, sprite, character, text, shape, vfx, pip) to a scene, or replace/update an existing layer with the same ID.",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      layer: LayerSchema,
    },
    async ({ projectId, sceneId, layer }) => {
      const current = await client.getProject(projectId);
      const scene = current.scenes.find((s) => s.id === sceneId);
      if (!scene) {
        throw new Error(`Scene '${sceneId}' not found in project '${projectId}'`);
      }
      const exists = scene.layers.some((l) => l.id === layer.id);
      const op: ProjectOperation = exists
        ? { op: "layer.update", sceneId, layerId: layer.id, patch: layer as unknown as Record<string, unknown> }
        : { op: "layer.add", sceneId, layer };
      const { receipt } = await client.applyOperations(projectId, [op]);
      return jsonContent({ receipt, mode: exists ? "updated" : "added", sceneId, layerId: layer.id });
    },
  );

  server.tool(
    "update_layer",
    "Deep-merge partial updates into an existing layer (e.g. transform.x/y/scaleX/rotation, pose, expression, text, color, zIndex).",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      layerId: IdSchema,
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ projectId, sceneId, layerId, patch }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "layer.update", sceneId, layerId, patch },
      ]);
      const layer = project.scenes.find((s) => s.id === sceneId)?.layers.find((l) => l.id === layerId);
      return jsonContent({ receipt, layer });
    },
  );

  server.tool(
    "remove_layer",
    "Remove a layer from a scene.",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      layerId: IdSchema,
    },
    async ({ projectId, sceneId, layerId }) => {
      const { receipt } = await client.applyOperations(projectId, [
        { op: "layer.remove", sceneId, layerId },
      ]);
      return jsonContent({ receipt, removed: true, sceneId, layerId });
    },
  );

  server.tool(
    "set_keyframe",
    "Add or update an animated keyframe with easing on a layer property (x, y, scaleX, scaleY, rotation, opacity) or on the scene camera (omit layerId for cameraZoom, cameraX, cameraY, cameraRotation).",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      layerId: IdSchema.optional(),
      property: AnimatablePropertySchema,
      t: z.number().min(0),
      value: z.number().finite(),
      easing: EasingTypeSchema.optional().default("easeInOut"),
      bezier: KeyframeSchema.shape.bezier,
    },
    async ({ projectId, sceneId, layerId, property, t, value, easing, bezier }) => {
      const { receipt } = await client.applyOperations(projectId, [
        {
          op: "keyframe.upsert",
          sceneId,
          layerId,
          property,
          keyframe: { t, value, easing, bezier },
        },
      ]);
      return jsonContent({ receipt, target: layerId ?? "camera", property, t, value, easing });
    },
  );

  // ==========================================================================
  // 5. SUBTITLES & AUDIO
  // ==========================================================================
  server.tool(
    "update_subtitle_style",
    "Update global subtitle typography, colors, stroke, shadow, background box, normalized position, active word effect, and enter/exit animations.",
    {
      projectId: IdSchema,
      patch: SubtitleStyleSchema.partial(),
    },
    async ({ projectId, patch }) => {
      const { project, receipt } = await client.applyOperations(projectId, [
        { op: "subtitle.updateStyle", patch },
      ]);
      return jsonContent({ receipt, style: project.subtitles.style });
    },
  );

  server.tool(
    "upsert_subtitle_cue",
    "Create or update a subtitle cue block. If words are omitted, words are auto-timed evenly across [start, end] so karaoke highlight works immediately.",
    {
      projectId: IdSchema,
      id: IdSchema,
      start: z.number().min(0),
      end: z.number().positive(),
      text: z.string().min(1).max(600),
      speaker: z.string().max(64).optional(),
      words: z.array(SubtitleWordSchema).optional(),
    },
    async ({ projectId, id, start, end, text, speaker, words }) => {
      if (end <= start) throw new Error("Cue end time must be greater than start time");
      const resolvedWords =
        words && words.length > 0
          ? words
          : text
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .map((tok, idx, arr) => ({
                id: `${id}_w_${idx}`,
                text: tok,
                start: Number((start + (idx / arr.length) * (end - start)).toFixed(3)),
                end: Number((start + ((idx + 1) / arr.length) * (end - start)).toFixed(3)),
                emphasis: "normal" as const,
              }));

      const cue = SubtitleCueSchema.parse({
        id,
        start,
        end,
        text,
        speaker,
        words: resolvedWords,
      });
      const { receipt } = await client.applyOperations(projectId, [{ op: "subtitle.upsertCue", cue }]);
      return jsonContent({ receipt, cue });
    },
  );

  server.tool(
    "update_subtitle_word",
    "Edit a single word inside a subtitle cue (text, start/end timing, emphasis: normal/highlight/accent/alert, or styleOverride).",
    {
      projectId: IdSchema,
      cueId: IdSchema,
      wordId: IdSchema,
      text: z.string().min(1).max(80).optional(),
      start: z.number().min(0).optional(),
      end: z.number().min(0).optional(),
      emphasis: WordEmphasisSchema.optional(),
      color: z.string().optional(),
      scale: z.number().min(0.5).max(2.5).optional(),
    },
    async ({ projectId, cueId, wordId, text, start, end, emphasis, color, scale }) => {
      const patch: Record<string, unknown> = {};
      if (text !== undefined) patch.text = text;
      if (start !== undefined) patch.start = start;
      if (end !== undefined) patch.end = end;
      if (emphasis !== undefined) patch.emphasis = emphasis;
      if (color !== undefined || scale !== undefined) {
        patch.styleOverride = {
          ...(color !== undefined ? { color } : {}),
          ...(scale !== undefined ? { scale } : {}),
        };
      }
      const { receipt } = await client.applyOperations(projectId, [
        { op: "subtitle.updateWord", cueId, wordId, patch },
      ]);
      return jsonContent({ receipt, cueId, wordId, patch });
    },
  );

  server.tool(
    "upsert_audio_clip",
    "Add or update an audio clip (voice, music, sfx, ambience) on a project audio track.",
    {
      projectId: IdSchema,
      trackId: IdSchema,
      clip: AudioClipSchema,
    },
    async ({ projectId, trackId, clip }) => {
      const { receipt } = await client.applyOperations(projectId, [
        { op: "audioClip.upsert", trackId, clip },
      ]);
      return jsonContent({ receipt, trackId, clip });
    },
  );

  // ==========================================================================
  // 6. ROLLBACK SNAPSHOTS, PROJECT AUDIT & VISUAL CAPTURE_FRAME
  // ==========================================================================
  server.tool(
    "restore_snapshot",
    "Roll back a project to a previous auto-saved snapshotId returned by an earlier EditReceipt. Broadcasts the restored state immediately to the browser UI.",
    {
      projectId: IdSchema,
      snapshotId: IdSchema,
    },
    async ({ projectId, snapshotId }) => {
      const res = await client.restoreSnapshot(projectId, snapshotId);
      return jsonContent({
        restored: true,
        restoredSnapshotId: res.restoredSnapshotId,
        projectSummary: summarizeProject(res.project),
      });
    },
  );

  server.tool(
    "audit_project",
    "Run automated quality checks before export: cut_check (detects scene cuts slicing spoken subtitle words), safe_zone audit (9:16/16:9/1:1 margins), and asset/character/audio integrity.",
    {
      projectId: IdSchema,
    },
    async ({ projectId }) => {
      const project = await client.getProject(projectId);
      const report = auditProject(project);
      return jsonContent(report);
    },
  );

  server.tool(
    "capture_frame",
    "Render and return the exact 1:1 PNG image of any timestamp (in seconds) using the shared PixiJS v8 WebGL2 renderer so you can visually inspect framing, characters, shaders, and subtitles.",
    {
      projectId: IdSchema,
      timestamp: z.number().min(0),
      width: z.number().int().min(64).max(4096).optional(),
      height: z.number().int().min(64).max(4096).optional(),
      burnSubtitles: z.boolean().optional().default(true),
      saveToPath: z.string().min(1).optional(),
    },
    async ({ projectId, timestamp, width, height, burnSubtitles, saveToPath }) => {
      const captured = await client.captureFrame(projectId, {
        timeSec: timestamp,
        width,
        height,
        burnSubtitles,
      });
      const base64 = captured.pngDataUrl.replace(/^data:image\/png;base64,/, "");
      let savedPath: string | undefined;
      if (saveToPath) {
        if (!allowLocalFilesystem) {
          throw new Error(
            "Writing files to host disk (saveToPath) is disabled on remote HTTP MCP connections for security.",
          );
        }
        savedPath = resolveCrossPlatformPath(saveToPath);
        assertSafeLocalFilePath(savedPath);
        await fs.mkdir(path.dirname(savedPath), { recursive: true });
        await fs.writeFile(savedPath, Buffer.from(base64, "base64"));
      }
      return {
        content: [
          {
            type: "image" as const,
            data: base64,
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                projectId: captured.projectId,
                timestamp: captured.timeSec,
                width: captured.width,
                height: captured.height,
                sceneId: captured.sceneId,
                sceneName: captured.sceneName,
                bytes: Buffer.byteLength(base64, "base64"),
                ...(savedPath ? { savedPath } : {}),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ==========================================================================
  // 7. EXPORT CONTROL
  // ==========================================================================
  server.tool(
    "start_export",
    "Start a 1:1 Playwright -> FFmpeg MP4 export (GPU NVENC with automatic CPU fallback). Supports Remotion-style parallel multi-worker concurrency (`settings.concurrency`), sub-frame cinematic Motion Blur (`settings.motionBlurSamples` 2..16 + `settings.shutterAngle`), and optional partial time range (`settings.startTimeSec`, `settings.endTimeSec`). Set wait=true to block until completion and receive the ffprobe report.",
    {
      projectId: IdSchema,
      settings: ExportSettingsSchema.partial().optional(),
      outputName: z.string().min(1).max(120).optional(),
      wait: z.boolean().optional().default(false),
    },
    async ({ projectId, settings, outputName, wait }) => {
      const res = await client.startExport(projectId, { settings, outputName, wait });
      return jsonContent(res);
    },
  );

  server.tool(
    "get_export_status",
    "Check live progress/result of an export job by jobId, or list all export jobs and rendered MP4/SRT files for a project.",
    {
      jobId: IdSchema.optional(),
      projectId: IdSchema.optional(),
    },
    async ({ jobId, projectId }) => {
      if (jobId) {
        return jsonContent(await client.getExportJob(jobId));
      }
      if (projectId) {
        return jsonContent(await client.listExports(projectId));
      }
      throw new Error("Provide either jobId or projectId");
    },
  );

  server.tool(
    "cancel_export",
    "Cancel an active export job by jobId.",
    {
      jobId: IdSchema,
    },
    async ({ jobId }) => {
      return jsonContent(await client.cancelExport(jobId));
    },
  );

  // ==========================================================================
  // 8. INTEGRATED VECTOR & AUDIO LIBRARIES (RESPECTING ENABLED LIBRARIES)
  // ==========================================================================
  server.tool(
    "list_compatible_libraries",
    "List all compatible external, built-in, and local media libraries in Storia Studio (Openverse, Iconify, Wikimedia Commons, Internet Archive Audio, Game & Pixel Art Sprites, OpenMoji & Noto Props, Storia SVG Backgrounds, Local Videos, Workspace) along with their enabled/disabled status.",
    {},
    async () => {
      const res = await client.getLibrariesCatalog();
      return jsonContent(res);
    },
  );

  server.tool(
    "search_vector_library",
    "Search Storia Studio's enabled SVG vector libraries: Openverse CC0/CC-BY SVGs, Iconify (200k+ icons), Wikimedia Commons SVGs, Game & Pixel Art Sprites, OpenMoji & Noto Color Props, Storia SVG Backgrounds (18 editable scenes), and local videos/workspace SVGs. Disabled libraries return empty results.",
    {
      q: z.string().max(120).optional(),
      source: z
        .enum([
          "all",
          "videos",
          "workspace",
          "iconify",
          "openverse",
          "wikimedia",
          "pixel_game_sprites",
          "openmoji_props",
          "svg_backgrounds",
        ])
        .optional()
        .default("all"),
      category: z.enum(["all", "backgrounds", "sprites", "overlays", "icons"]).optional().default("all"),
      video: z.string().max(48).optional(),
      collection: z.string().max(64).optional(),
      color: z.string().max(32).optional(),
      page: z.number().int().min(1).optional().default(1),
      pageSize: z.number().int().min(1).max(100).optional().default(24),
      refresh: z.boolean().optional().default(false),
    },
    async (args) => {
      const res = await client.searchVectorLibrary(args);
      return jsonContent(res);
    },
  );

  server.tool(
    "insert_vector_from_library",
    "Import an SVG from any enabled vector library (local/svg_backgrounds itemId, Iconify/pixel_game_sprites/openmoji_props iconifyName, or Openverse/Wikimedia remoteUrl) into the project, write attribution to credits.txt, and optionally insert it live as a Sprite or Background layer.",
    {
      projectId: IdSchema,
      itemId: z.string().min(1).optional(),
      iconifyName: z.string().min(1).optional(),
      remoteUrl: z.string().min(1).optional(),
      color: z.string().max(32).optional(),
      name: z.string().min(1).max(160),
      source: z
        .enum([
          "videos",
          "workspace",
          "iconify",
          "openverse",
          "wikimedia",
          "pixel_game_sprites",
          "openmoji_props",
          "svg_backgrounds",
        ])
        .optional()
        .default("videos"),
      category: z.string().max(48).optional(),
      license: z.string().max(120).optional(),
      author: z.string().max(120).optional(),
      sourceUrl: z.string().max(512).optional(),
      insertMode: z.enum(["asset_only", "sprite", "background"]).optional().default("sprite"),
      sceneId: IdSchema.optional(),
      widthNorm: z.number().min(0.05).max(3).optional(),
      scaleMode: ScaleModeSchema.optional(),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.importVectorFromLibrary(projectId, payload);
      return jsonContent({
        asset: res.asset,
        insertedLayerId: res.insertedLayerId,
        sceneId: res.sceneId,
        receipt: res.receipt,
      });
    },
  );

  server.tool(
    "search_audio_library",
    "Search Storia Studio's enabled SFX, ambience, and music libraries: Openverse (5.2M+ CC0/CC-BY), Wikimedia Commons Audio, Internet Archive Audio, and local workspace/video SFX libraries. Disabled libraries return empty results.",
    {
      q: z.string().max(120).optional(),
      source: z.enum(["openverse", "wikimedia", "internet_archive", "local", "all"]).optional().default("openverse"),
      category: z.enum(["all", "sfx", "music", "ambience", "psx"]).optional().default("sfx"),
      license: z.enum(["all", "cc0", "cc-by"]).optional().default("all"),
      duration: z.enum(["all", "short", "medium", "long"]).optional().default("all"),
      page: z.number().int().min(1).optional().default(1),
      pageSize: z.number().int().min(1).max(50).optional().default(20),
      refresh: z.boolean().optional().default(false),
    },
    async (args) => {
      const res = await client.searchAudioLibrary(args);
      return jsonContent(res);
    },
  );

  server.tool(
    "insert_audio_from_library",
    "Download or copy an audio file from any enabled audio library (Openverse, Wikimedia, Internet Archive remoteUrl, or local itemId) into the project, probe its exact duration via ffprobe, auto-write attribution to credits.txt, and insert it onto the matching timeline track.",
    {
      projectId: IdSchema,
      itemId: z.string().min(1).optional(),
      remoteUrl: z.string().min(1).optional(),
      name: z.string().min(1).max(160),
      category: z.enum(["sfx", "music", "ambience"]).optional().default("sfx"),
      source: z
        .enum(["openverse", "wikimedia", "internet_archive", "local_workspace", "local_videos", "local"])
        .optional()
        .default("openverse"),
      license: z.string().max(120).optional(),
      author: z.string().max(120).optional(),
      attribution: z.string().max(512).optional(),
      sourceUrl: z.string().max(512).optional(),
      durationSec: z.number().positive().optional(),
      insertToTimeline: z.boolean().optional().default(true),
      startSec: z.number().min(0).optional().default(0),
      trackId: IdSchema.optional(),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.importAudioFromLibrary(projectId, payload);
      return jsonContent({
        asset: res.asset,
        durationSec: res.durationSec,
        insertedClipId: res.insertedClipId,
        trackId: res.trackId,
        receipt: res.receipt,
      });
    },
  );

  // ==========================================================================
  // 9. MULTI-PROVIDER TEXT-TO-SPEECH (TTS)
  // ==========================================================================
  const TtsProviderSchema = z.enum([
    "windows_sapi",
    "elevenlabs",
    "voicestudio",
    "piper",
    "kokoro",
    "openai",
    "custom_api",
  ]);

  server.tool(
    "list_tts_providers",
    "Inspect available Text-to-Speech (TTS) providers in Storia Studio (Windows SAPI local, ElevenLabs, VoiceStudio, Piper ONNX, Kokoro-82M ONNX, OpenAI, Custom HTTP API) along with readiness status and downloadable local models.",
    {
      refresh: z.boolean().optional().default(false),
    },
    async ({ refresh }) => {
      return jsonContent(await client.getTtsProviders(refresh));
    },
  );

  server.tool(
    "list_tts_voices",
    "List available voices for a specific TTS provider (windows_sapi, elevenlabs, voicestudio, piper, kokoro, openai, custom_api).",
    {
      provider: TtsProviderSchema.default("windows_sapi"),
      refresh: z.boolean().optional().default(false),
    },
    async ({ provider, refresh }) => {
      return jsonContent(await client.listTtsVoices(provider, refresh));
    },
  );

  server.tool(
    "generate_tts_voice",
    "Synthesize narration or dialogue text into a 48kHz WAV audio asset using any configured TTS provider, insert it onto the voice track (or replace an existing audio clip), and optionally auto-generate word-level subtitles via local Whisper.",
    {
      projectId: IdSchema,
      provider: TtsProviderSchema.default("windows_sapi"),
      text: z.string().min(1).max(8000),
      voiceId: z.string().max(160).optional(),
      language: z.string().max(24).optional().default("es"),
      speed: z.number().min(0.5).max(2.0).optional().default(1.0),
      modelId: z.string().max(80).optional(),
      clipName: z.string().max(120).optional(),
      insertToTimeline: z.boolean().optional().default(true),
      startSec: z.number().min(0).optional().default(0),
      trackId: IdSchema.optional(),
      replaceTrackId: IdSchema.optional(),
      replaceClipId: IdSchema.optional(),
      preserveClipDuration: z.boolean().optional().default(false),
      autoSubtitles: z.boolean().optional().default(false),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.generateProjectTts(projectId, payload);
      return jsonContent({
        asset: res.asset,
        durationSec: res.durationSec,
        providerLabel: res.providerLabel,
        insertedClipId: res.insertedClipId,
        trackId: res.trackId,
        cuesCount: res.cuesCount,
        subtitleWarning: res.subtitleWarning,
        receipt: res.receipt,
      });
    },
  );

  server.tool(
    "generate_tts_from_subtitles",
    "Synthesize TTS narration directly from existing project subtitles — either grouped into one single continuous audio clip (`mode='grouped'`) or as one individual TTS audio clip per subtitle cue (`mode='individual'`, optionally auto-syncing subtitle cue & word timings to the synthesized durations).",
    {
      projectId: IdSchema,
      provider: TtsProviderSchema.default("windows_sapi"),
      mode: z.enum(["grouped", "individual"]).default("grouped"),
      cueIds: z.array(IdSchema).optional(),
      voiceId: z.string().max(160).optional(),
      language: z.string().max(24).optional().default("es"),
      speed: z.number().min(0.5).max(2.0).optional().default(1.0),
      modelId: z.string().max(80).optional(),
      clipName: z.string().max(120).optional(),
      trackId: IdSchema.optional(),
      replaceExistingVoiceClips: z.boolean().optional().default(false),
      syncSubtitleTimings: z.boolean().optional().default(true),
      autoSubtitles: z.boolean().optional().default(false),
      minGapSec: z.number().min(0).max(2).optional().default(0.06),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.generateProjectTtsFromSubtitles(projectId, payload);
      return jsonContent({
        mode: res.mode,
        providerLabel: res.providerLabel,
        trackId: res.trackId,
        clipsCreated: res.clipsCreated,
        insertedClipIds: res.insertedClipIds,
        cuesProcessed: res.cuesProcessed,
        cuesUpdated: res.cuesUpdated,
        totalDurationSec: res.totalDurationSec,
        subtitleWarning: res.subtitleWarning,
        receipt: res.receipt,
      });
    },
  );

  // ==========================================================================
  // 10. AUTONOMOUS VIDEO DIRECTOR & 18 ANIMATION STYLES (STORIA + A1-A8 + B1-B8)
  // ==========================================================================

  server.tool(
    "list_animation_styles",
    "List all 18 animation styles integrated into Storia Studio (Storia Editorial 2D + all 16 Stickman Video Director A1-A8 & B1-B8 styles: Classic Dark/Light, Modern Pop Beanie, Prehistoric, Cozy, Historical, Amber Noir, Rubber Hose 1930s, Studio Ghibli, Minimal Paper Grid B1, Colorful Hand-Drawn B2, Retro TV B3, Survival Thriller B4, Avatar Explainer B5, Dynamic Meme B6, Pixel Theater B7, Greek Mythology B8), along with available OFL fonts, curated audio count (890 assets), and direction guide filenames.",
    {},
    async () => {
      return jsonContent(await client.listDirectorStyles());
    },
  );

  server.tool(
    "get_style_direction_guide",
    "Read any of the 83 Stickman Video Director direction/reference markdown guides (e.g. 'style-catalog.md', 'b1-minimal-handdrawn.md', 'b6-dynamic-meme.md', 'b8-greek-mythology.md', 'rubber-hose.md', 'amber-noir.md') so the AI director can follow authentic pacing, composition, and visual rules before assembling a video.",
    {
      filename: z.string().min(3).max(160),
      maxChars: z.number().int().min(500).max(50000).optional().default(16000),
    },
    async ({ filename, maxChars }) => {
      return jsonContent(await client.getDirectorGuide(filename, maxChars));
    },
  );

  server.tool(
    "apply_animation_style",
    "Switch an existing project to any of the 18 animation styles (updates character drawing style, backgrounds, post-processing shaders, subtitle typography, and optional scene transitions live in Storia Studio).",
    {
      projectId: IdSchema,
      styleId: AnimationStyleIdSchema,
      updateBackgrounds: z.boolean().optional().default(true),
      updateSubtitles: z.boolean().optional().default(true),
      updateTransitions: z.boolean().optional().default(true),
    },
    async ({ projectId, styleId, updateBackgrounds, updateSubtitles, updateTransitions }) => {
      const res = await client.applyOperations(projectId, [
        {
          op: "project.applyAnimationStyle",
          styleId,
          updateBackgrounds,
          updateSubtitles,
          updateTransitions,
        },
      ]);
      return jsonContent({
        projectId: res.project.id,
        animationStyle: res.project.animationStyle,
        postProcessingPreset: res.project.postProcessing.preset,
        subtitleFont: res.project.subtitles.style.fontFamily,
        receipt: res.receipt,
      });
    },
  );

  server.tool(
    "recommend_style_audio",
    "Recommend curated CC0/CC-BY background music and SFX from the 890-asset Stickman Video Director audio library matched to a specific animation style (B1-B8 or any styleId) and narrative beat (e.g. opening, reveal, punchline, tension, ending) plus optional keyword query.",
    {
      style: z.string().min(1).max(48).default("B1"),
      beat: z.string().max(48).optional(),
      q: z.string().max(120).optional(),
      limit: z.number().int().min(1).max(20).optional().default(5),
    },
    async (args) => {
      return jsonContent(await client.recommendDirectorAudio(args));
    },
  );

  server.tool(
    "list_bundled_fonts",
    "List all offline SIL OFL bundled typefaces (Anton, ArchivoBlack, Caveat, NotoSans, Nunito) served directly by Storia Studio for guaranteed offline rendering & export parity.",
    {},
    async () => {
      return jsonContent(await client.listBundledFonts());
    },
  );

  server.tool(
    "direct_and_assemble_video",
    "Autonomous full-video director & assembler: builds and saves a complete multi-scene animated video inside Storia Studio in one atomic call using any of the 18 animation styles (Storia Editorial + A1-A8 + B1-B8), automatic role-based wardrobe (police, pirate, doctor, scientist, military, etc.), posed & expressive characters, kinetic headlines, camera zooms, transitions, optional TTS voiceover + Whisper subtitles, and auto-selected CC0/CC-BY music (with voice ducking) & scene SFX from the 890-asset library.",
    {
      projectId: IdSchema,
      name: z.string().min(1).max(160).optional(),
      description: z.string().max(1000).optional(),
      styleId: AnimationStyleIdSchema.default("storia_editorial"),
      aspectRatio: AspectRatioSchema.optional(),
      resolution: ResolutionPresetSchema.optional(),
      fps: FpsSchema.optional(),
      cast: z
        .array(
          z.object({
            id: IdSchema,
            name: z.string().min(1).max(80),
            role: z.string().max(64).default("casual"),
            age: CharacterAgeSchema.default("adult"),
            genderPresentation: z.enum(["neutral", "masculine", "feminine"]).default("neutral"),
            hairStyle: HairStyleSchema.default("short"),
            facialHair: FacialHairStyleSchema.default("none"),
            hat: HatStyleSchema.default("none"),
            glasses: GlassesStyleSchema.default("none"),
            outfitStyle: OutfitStyleSchema.optional(),
            pantsStyle: PantsStyleSchema.optional(),
            renderStyle: CharacterRenderStyleSchema.default("auto"),
            skin: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            hair: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            shirt: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
          }),
        )
        .default([]),
      scenes: z
        .array(
          z.object({
            id: IdSchema.optional(),
            name: z.string().min(1).max(120),
            duration: z.number().min(0.8).max(60).default(4.0),
            narrationText: z.string().max(1500).optional(),
            headline: z.string().max(160).optional(),
            kicker: z.string().max(80).optional(),
            subtitle: z.string().max(160).optional(),
            proceduralSet: z.string().max(64).optional(),
            backgroundAssetId: IdSchema.optional(),
            framing: CameraFramingSchema.default("medium"),
            cameraZoomEnd: z.number().min(0.75).max(2.2).optional(),
            transitionIn: TransitionTypeSchema.optional(),
            transitionDuration: z.number().min(0).max(1.5).default(0.35),
            beatTag: z.string().max(48).optional(),
            sfxQuery: z.string().max(80).optional(),
            sfxAssetId: z.string().max(120).optional(),
            characters: z
              .array(
                z.object({
                  characterId: IdSchema,
                  x: z.number().min(-0.2).max(1.2).default(0.5),
                  y: z.number().min(0.2).max(1.2).default(0.84),
                  scale: z.number().min(0.25).max(3.0).default(1.0),
                  flipX: z.boolean().default(false),
                  pose: CharacterPoseSchema.default("idle"),
                  expression: CharacterExpressionSchema.default("neutral"),
                  enterX: z.number().min(-0.5).max(1.5).optional(),
                  talk: z.boolean().default(false),
                }),
              )
              .default([]),
            props: z
              .array(
                z.object({
                  name: z.string().min(1).max(80),
                  proceduralProp: z.string().max(64).optional(),
                  assetId: IdSchema.optional(),
                  x: z.number().min(0).max(1).default(0.5),
                  y: z.number().min(0).max(1).default(0.45),
                  widthNorm: z.number().min(0.05).max(1.8).default(0.32),
                  bob: z.boolean().default(true),
                }),
              )
              .default([]),
          }),
        )
        .min(1)
        .max(40),
      narration: z
        .object({
          script: z.string().max(12000).optional(),
          existingAudioAssetId: IdSchema.optional(),
          ttsProvider: TtsProviderSchema.optional(),
          voiceId: z.string().max(160).optional(),
          language: z.string().max(24).default("es"),
          speed: z.number().min(0.5).max(2.0).default(1.0),
          autoSubtitles: z.boolean().default(true),
        })
        .optional(),
      autoMusic: z.boolean().optional().default(true),
      musicBeat: z.string().max(48).optional(),
      musicQuery: z.string().max(80).optional(),
      musicVolume: z.number().min(0).max(1).optional().default(0.16),
      autoSfx: z.boolean().optional().default(true),
      sfxVolume: z.number().min(0).max(1.5).optional().default(0.55),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.assembleDirectedVideo(projectId, payload);
      return jsonContent({
        projectId,
        styleApplied: res.styleApplied,
        scenesBuilt: res.scenesBuilt,
        castBuilt: res.castBuilt,
        voiceGenerated: res.voiceGenerated,
        musicAdded: res.musicAdded,
        sfxAddedCount: res.sfxAddedCount,
        subtitlesCount: res.subtitlesCount,
        warnings: res.warnings,
      });
    },
  );

  // ==========================================================================
  // REMOTION CAPTIONS: SRT / WEBVTT IMPORT & TIKTOK RHYTHMIC PAGINATION
  // ==========================================================================
  server.tool(
    "import_subtitles_srt_vtt",
    "Import an SRT or WebVTT subtitle file into a project with automatic word-level timing expansion and optional Remotion-style TikTok/Reels rhythmic pagination.",
    {
      projectId: IdSchema,
      content: z.string().min(1).max(2_000_000).describe("Raw SRT or WebVTT text content"),
      format: z.enum(["auto", "srt", "vtt"]).optional().default("auto"),
      tiktokMode: z.boolean().optional().default(true),
      combineTokensWithinMs: z.number().min(250).max(8000).optional().default(1400),
      breakOnSilenceAfterMs: z.number().min(100).max(4000).optional().default(450),
      maxWordsPerPage: z.number().int().min(1).max(12).optional().default(4),
      replaceExisting: z.boolean().optional().default(true),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.importSubtitles(projectId, payload);
      return jsonContent({
        projectId,
        format: res.format,
        importedCount: res.importedCount,
      });
    },
  );

  server.tool(
    "rechunk_subtitles_tiktok",
    "Re-paginate a project's existing word-level subtitles into snappy TikTok / Reels / Shorts pages bounded by duration, silence breaks, and maxWordsPerPage (powered by Remotion Captions algorithm).",
    {
      projectId: IdSchema,
      combineTokensWithinMs: z.number().min(250).max(8000).optional().default(1350),
      breakOnSilenceAfterMs: z.number().min(100).max(4000).optional().default(420),
      maxWordsPerPage: z.number().int().min(1).max(12).optional().default(3),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.rechunkSubtitlesTikTok(projectId, payload);
      return jsonContent({
        projectId,
        pagesCount: res.pagesCount,
      });
    },
  );

  server.tool(
    "read_svg_asset",
    "Read the live editable SVG XML source code of a vector SVG asset in a Storia Studio project so it can be inspected or modified.",
    {
      projectId: IdSchema,
      assetId: IdSchema,
    },
    async ({ projectId, assetId }) => {
      const res = await client.getSvgAssetCode(projectId, assetId);
      return jsonContent({
        projectId,
        asset: res.asset,
        filename: res.filename,
        editable: res.editable,
        svgCode: res.svgCode,
      });
    },
  );

  server.tool(
    "update_svg_asset",
    "Edit the SVG source code of a vector asset in real time. Changes stream instantly to Storia Studio's PixiJS viewport and open SVG Code Editor drawer. Choose mode='replace' to overwrite in-place or mode='copy' to save as a new asset copy (optionally swapping updateLayerRef to use the copy).",
    {
      projectId: IdSchema,
      assetId: IdSchema,
      svgCode: z.string().min(10).max(2_000_000),
      mode: z.enum(["replace", "copy"]).optional().default("replace"),
      copyName: z.string().min(1).max(140).optional(),
      updateLayerRef: z
        .object({
          sceneId: IdSchema,
          layerId: IdSchema,
        })
        .optional(),
    },
    async ({ projectId, assetId, svgCode, mode, copyName, updateLayerRef }) => {
      const res = await client.updateSvgAssetCode(projectId, assetId, {
        svgCode,
        mode,
        copyName,
        updateLayerRef,
      });
      return jsonContent({
        projectId,
        mode: res.mode,
        asset: res.asset,
        receipt: res.receipt,
      });
    },
  );

  // ==========================================================================
  // 11. FULL EDITOR CONTROL: CATALOGS, CAPCUT SUBTITLES, VFX CLIPS, MARKERS,
  //     SCENE NLE TOOLS, AUDIO DSP/WHISPER, TRANSITIONS+SFX, SVG CREATION
  //     (Zero access to API keys, vault secrets, or tunnel credentials)
  // ==========================================================================
  server.tool(
    "list_editor_catalogs",
    "Discover 100% of Storia Studio's built-in creative catalogs: 36 CapCut-grade subtitle presets, 37 subtitle animations, 23 active-word effects, 16 keyword FX, 20 subtitle overlays, 32 subtitle VFX in/out, 40 scene transitions, 49 timed video/motion/overlay effects, 32+20+20 layer motions, 13 procedural vector shapes, 13 Remotion spring/bezier easings, and character role wardrobe presets.",
    {
      section: z
        .enum(["all", "subtitles", "effects", "transitions", "layers", "shapes", "roles"])
        .optional()
        .default("all"),
    },
    async ({ section }) => {
      const out: Record<string, unknown> = {};
      if (section === "all" || section === "subtitles") {
        out.subtitlePresets = SUBTITLE_STYLE_PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          badge: p.badge,
          category: p.category,
          description: p.description,
        }));
        out.subtitleAnimations = SubtitleAnimationSchema.options;
        out.activeWordEffects = ActiveWordEffectSchema.options;
        out.keywordFx = KeywordFxSchema.options;
        out.subtitleOverlays = SubtitleOverlayStyleSchema.options;
        out.subtitleVfxIn = SubtitleVfxInSchema.options;
        out.subtitleVfxOut = SubtitleVfxOutSchema.options;
      }
      if (section === "all" || section === "effects") {
        out.effectClips = EffectClipTypeSchema.options;
      }
      if (section === "all" || section === "transitions") {
        out.transitions = TransitionTypeSchema.options;
        out.transitionSfx = TransitionSfxPresetSchema.options;
      }
      if (section === "all" || section === "layers") {
        out.layerEnterAnims = LayerEnterAnimSchema.options;
        out.layerExitAnims = LayerExitAnimSchema.options;
        out.layerLoopMotions = LayerLoopMotionSchema.options;
        out.easings = EasingTypeSchema.options;
      }
      if (section === "all" || section === "shapes") {
        out.proceduralShapes = ShapeKindSchema.options;
      }
      if (section === "all" || section === "roles") {
        out.characterRolePresets = Object.values(CHARACTER_ROLE_PRESETS).map((r) => ({
          id: r.id,
          label: r.label,
          category: r.category,
          hat: r.hat,
          glasses: r.glasses,
          wardrobe: r.wardrobe,
        }));
      }
      return jsonContent(out);
    },
  );

  server.tool(
    "apply_subtitle_preset",
    "Apply any of Storia Studio's 36 CapCut-grade subtitle presets globally to all subtitles (scope='all') or individually to a single subtitle cue (scope='cue' with cueId). Use list_editor_catalogs(section='subtitles') to inspect all preset IDs.",
    {
      projectId: IdSchema,
      presetId: z.string().min(1).max(64),
      scope: z.enum(["all", "cue"]).optional().default("all"),
      cueId: IdSchema.optional(),
      clearCueOverrides: z.boolean().optional().default(true),
    },
    async ({ projectId, presetId, scope, cueId, clearCueOverrides }) => {
      const preset = getSubtitleStylePreset(presetId);
      if (!preset) {
        throw new Error(`Subtitle preset '${presetId}' not found. Call list_editor_catalogs(section='subtitles') for valid IDs.`);
      }
      const op: ProjectOperation =
        scope === "cue"
          ? {
              op: "subtitle.updateCueStyle",
              cueId: cueId ?? (() => { throw new Error("cueId is required when scope='cue'"); })(),
              patch: preset.style as Record<string, unknown>,
            }
          : {
              op: "subtitle.applyStyleToAll",
              patch: preset.style as Record<string, unknown>,
              clearCueOverrides,
            };
      const { receipt, project } = await client.applyOperations(projectId, [op]);
      return jsonContent({
        receipt,
        appliedPreset: { id: preset.id, name: preset.name, category: preset.category },
        scope,
        cueId: scope === "cue" ? cueId : null,
        globalStyle: project.subtitles.style,
      });
    },
  );

  server.tool(
    "update_subtitle_cue_style",
    "Customize the visual style, animations, overlay, 3D extrusion, glow, keyword FX, or VFX In/Out of a single individual subtitle cue (or pass resetToGlobal=true to restore global style).",
    {
      projectId: IdSchema,
      cueId: IdSchema,
      resetToGlobal: z.boolean().optional().default(false),
      patch: SubtitleStyleSchema.partial().optional(),
    },
    async ({ projectId, cueId, resetToGlobal, patch }) => {
      const { receipt } = await client.applyOperations(projectId, [
        {
          op: "subtitle.updateCueStyle",
          cueId,
          patch: resetToGlobal ? null : (patch ?? {}),
        },
      ]);
      return jsonContent({ receipt, cueId, resetToGlobal });
    },
  );

  server.tool(
    "upsert_effect_clip",
    "Add or update a timed Video, Motion, Retro, or Atmospheric Overlay Effect Clip (49 types: psx, vhs_glitch, rgb_split, vintage_8mm, thermal_vision, golden_hour, camera_shake, earthquake_heavy, punch_zoom, vertigo_tilt, confetti, bokeh_lights, matrix_rain, fireflies, starfield, rain, snow, embers, etc.) on the timeline.",
    {
      projectId: IdSchema,
      effectClip: EffectClipSchema,
    },
    async ({ projectId, effectClip }) => {
      const { receipt, project } = await client.applyOperations(projectId, [
        { op: "effectClip.upsert", effectClip },
      ]);
      return jsonContent({ receipt, effectClipsCount: project.effectClips.length, effectClip });
    },
  );

  server.tool(
    "remove_effect_clip",
    "Remove a timed effect clip from the timeline by effectClipId.",
    {
      projectId: IdSchema,
      effectClipId: IdSchema,
    },
    async ({ projectId, effectClipId }) => {
      const { receipt } = await client.applyOperations(projectId, [
        { op: "effectClip.remove", effectClipId },
      ]);
      return jsonContent({ receipt, removed: true, effectClipId });
    },
  );

  server.tool(
    "upsert_marker",
    "Add or update a timeline marker at timestamp `t` (in seconds) with label and hex color.",
    {
      projectId: IdSchema,
      marker: TimelineMarkerSchema,
    },
    async ({ projectId, marker }) => {
      const { receipt, project } = await client.applyOperations(projectId, [
        { op: "marker.upsert", marker },
      ]);
      return jsonContent({ receipt, markersCount: project.markers.length, marker });
    },
  );

  server.tool(
    "remove_marker",
    "Remove a timeline marker by markerId.",
    {
      projectId: IdSchema,
      markerId: IdSchema,
    },
    async ({ projectId, markerId }) => {
      const { receipt } = await client.applyOperations(projectId, [
        { op: "marker.remove", markerId },
      ]);
      return jsonContent({ receipt, removed: true, markerId });
    },
  );

  server.tool(
    "manage_scene",
    "Perform NLE scene operations: reorder scenes, remove a scene, duplicate a scene, split a scene at a global timestamp, insert a 2s freeze-frame scene, or apply one transition to all scene cuts.",
    {
      projectId: IdSchema,
      action: z.enum(["reorder", "remove", "duplicate", "split_at_time", "freeze_frame", "apply_transition_all"]),
      sceneId: IdSchema.optional(),
      sceneIds: z.array(IdSchema).optional(),
      splitTimeSec: z.number().min(0).optional(),
      freezeDurationSec: z.number().min(0.2).max(30).optional().default(2.0),
      transitionType: TransitionTypeSchema.optional(),
      transitionDuration: z.number().min(0).max(3).optional().default(0.4),
      transitionAccentColor: z.string().optional(),
    },
    async ({
      projectId,
      action,
      sceneId,
      sceneIds,
      splitTimeSec,
      freezeDurationSec,
      transitionType,
      transitionDuration,
      transitionAccentColor,
    }) => {
      const project = await client.getProject(projectId);
      const ops: ProjectOperation[] = [];

      if (action === "reorder") {
        if (!sceneIds || sceneIds.length === 0) throw new Error("sceneIds is required for reorder");
        ops.push({ op: "scene.reorder", sceneIds });
      } else if (action === "remove") {
        if (!sceneId) throw new Error("sceneId is required for remove");
        ops.push({ op: "scene.remove", sceneId });
      } else if (action === "apply_transition_all") {
        ops.push({
          op: "scene.applyTransitionAll",
          transition: {
            type: transitionType ?? "snap_zoom",
            duration: transitionDuration,
            ...(transitionAccentColor ? { accentColor: transitionAccentColor } : {}),
          },
        });
      } else {
        const idx = sceneId ? project.scenes.findIndex((s) => s.id === sceneId) : 0;
        const sc = project.scenes[idx];
        if (!sc) throw new Error(`Scene '${sceneId}' not found`);
        const cloneId = `${sc.id}_${action === "freeze_frame" ? "frz" : "cp"}_${Date.now().toString(36).slice(-4)}`;

        if (action === "duplicate") {
          const copyScene = {
            ...structuredClone(sc),
            id: cloneId,
            name: `${sc.name} (Copia)`,
            layers: sc.layers.map((l, i) => ({ ...structuredClone(l), id: `${cloneId}_l${i}` })),
          };
          ops.push({ op: "scene.add", scene: copyScene, index: idx + 1 });
        } else if (action === "freeze_frame") {
          const frozenScene = {
            ...structuredClone(sc),
            id: cloneId,
            name: `Congelado · ${sc.name}`,
            duration: freezeDurationSec,
            transitionIn: { ...sc.transitionIn, type: "cut" as const, duration: 0.2 },
            camera: {
              ...structuredClone(sc.camera),
              handheld: { ...sc.camera.handheld, enabled: false },
              impulses: [],
              keyframes: {},
            },
            layers: sc.layers.map((l, i) => ({
              ...structuredClone(l),
              id: `${cloneId}_l${i}`,
              keyframes: {},
              ...(l.motion ? { motion: { ...l.motion, enter: "none" as const, exit: "none" as const, loop: "none" as const } } : {}),
            })),
          };
          ops.push({ op: "scene.add", scene: frozenScene, index: idx + 1 });
        } else if (action === "split_at_time") {
          let cursor = 0;
          for (let i = 0; i < idx; i++) cursor += project.scenes[i]!.duration;
          const tSplit = splitTimeSec ?? cursor + sc.duration * 0.5;
          const localSplit = Number((tSplit - cursor).toFixed(2));
          if (localSplit <= 0.15 || localSplit >= sc.duration - 0.15) {
            throw new Error(`splitTimeSec (${tSplit}s) must fall strictly inside scene '${sc.id}' [${cursor}s, ${cursor + sc.duration}s]`);
          }
          const rightDur = Number((sc.duration - localSplit).toFixed(2));
          const rightScene = {
            ...structuredClone(sc),
            id: cloneId,
            name: `${sc.name} (Parte 2)`,
            duration: rightDur,
            transitionIn: { ...sc.transitionIn, type: "cut" as const },
            layers: sc.layers.map((l, i) => ({ ...structuredClone(l), id: `${cloneId}_l${i}` })),
          };
          ops.push(
            { op: "scene.update", sceneId: sc.id, patch: { duration: localSplit } },
            { op: "scene.add", scene: rightScene, index: idx + 1 },
          );
        }
      }

      const { receipt, project: updated } = await client.applyOperations(projectId, ops);
      return jsonContent({
        receipt,
        action,
        scenesCount: updated.scenes.length,
        durationSec: getProjectDuration(updated),
      });
    },
  );

  server.tool(
    "manage_audio_track",
    "Create/update/mute/solo/configure sidechain ducking on an audio track, remove a track, remove an audio clip, or split an audio clip at a timestamp.",
    {
      projectId: IdSchema,
      action: z.enum(["upsert_track", "remove_track", "remove_clip", "split_clip"]),
      track: AudioTrackSchema.optional(),
      trackId: IdSchema.optional(),
      clipId: IdSchema.optional(),
      splitTimeSec: z.number().min(0).optional(),
    },
    async ({ projectId, action, track, trackId, clipId, splitTimeSec }) => {
      const ops: ProjectOperation[] = [];
      if (action === "upsert_track") {
        if (!track) throw new Error("track is required for upsert_track");
        ops.push({ op: "audioTrack.upsert", track });
      } else if (action === "remove_track") {
        if (!trackId) throw new Error("trackId is required for remove_track");
        ops.push({ op: "audioTrack.remove", trackId });
      } else if (action === "remove_clip") {
        if (!trackId || !clipId) throw new Error("trackId and clipId are required for remove_clip");
        ops.push({ op: "audioClip.remove", trackId, clipId });
      } else if (action === "split_clip") {
        if (!trackId || !clipId || splitTimeSec === undefined) {
          throw new Error("trackId, clipId, and splitTimeSec are required for split_clip");
        }
        const proj = await client.getProject(projectId);
        const tr = proj.audioTracks.find((t) => t.id === trackId);
        const clip = tr?.clips.find((c) => c.id === clipId);
        if (!clip) throw new Error(`Audio clip '${clipId}' not found in track '${trackId}'`);
        const offset = Number((splitTimeSec - clip.start).toFixed(2));
        if (offset <= 0.1 || offset >= clip.duration - 0.1) {
          throw new Error(`splitTimeSec must be inside clip [${clip.start}s, ${clip.start + clip.duration}s]`);
        }
        const rightId = `${clip.id}_p2_${Date.now().toString(36).slice(-3)}`;
        ops.push(
          { op: "audioClip.upsert", trackId, clip: { ...clip, duration: offset } },
          {
            op: "audioClip.upsert",
            trackId,
            clip: {
              ...structuredClone(clip),
              id: rightId,
              start: Number(splitTimeSec.toFixed(2)),
              trimStart: Number((clip.trimStart + offset).toFixed(2)),
              duration: Number((clip.duration - offset).toFixed(2)),
            },
          },
        );
      }
      const { receipt } = await client.applyOperations(projectId, ops);
      return jsonContent({ receipt, action });
    },
  );

  server.tool(
    "process_audio_clip",
    "Run FFmpeg studio DSP processing on an audio clip in-place: 'denoise' (spectral noise reduction), 'voice_enhance' (EQ + compression + clarity), 'normalize' (-16 LUFS broadcast loudness), 'trim_silence', 'deess_warm' (reduce sibilance + warm voice), or 'fade_clean' (anti-click fades + loudness).",
    {
      projectId: IdSchema,
      trackId: IdSchema,
      clipId: IdSchema,
      action: z.enum(["denoise", "voice_enhance", "normalize", "trim_silence", "deess_warm", "fade_clean"]),
    },
    async ({ projectId, trackId, clipId, action }) => {
      const res = await client.processAudioClip(projectId, { trackId, clipId, action });
      return jsonContent({ projectId, action, result: res });
    },
  );

  server.tool(
    "transcribe_audio_clip",
    "Transcribe an existing audio clip using local Whisper IA and automatically generate word-level karaoke subtitles on the project timeline.",
    {
      projectId: IdSchema,
      trackId: IdSchema,
      clipId: IdSchema,
      language: z.string().min(2).max(12).optional().default("es"),
      model: z.enum(["tiny", "base", "small", "medium"]).optional().default("small"),
      replaceExisting: z.boolean().optional().default(true),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.transcribeAudioClip(projectId, payload);
      return jsonContent({
        projectId,
        cuesCount: res.cuesCount,
        language: res.language,
      });
    },
  );

  server.tool(
    "apply_transition_with_sfx",
    "Apply any of the 40 scene transitions to a scene (or all scenes) and automatically synthesize and place a matching transition sound effect WAV (whoosh, whip, zoom_whoosh, glitch, flash, shimmer_gold, impact) on the SFX track.",
    {
      projectId: IdSchema,
      sceneId: IdSchema,
      type: TransitionTypeSchema,
      duration: z.number().min(0).max(3).optional().default(0.4),
      accentColor: z.string().optional(),
      sfx: TransitionSfxPresetSchema.optional().default("whoosh"),
      applyToAll: z.boolean().optional().default(false),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.applyTransitionWithSfx(projectId, payload);
      return jsonContent({ projectId, result: res });
    },
  );

  server.tool(
    "create_svg_asset",
    "Create a brand-new vector SVG asset directly from raw <svg>...</svg> markup, register it in the project, and optionally insert it immediately onto a scene as a sprite or background layer.",
    {
      projectId: IdSchema,
      name: z.string().min(1).max(120),
      filename: z.string().min(1).max(120).optional(),
      svgCode: z.string().min(10).max(2_000_000),
      insertIntoSceneId: IdSchema.optional(),
      layerType: z.enum(["sprite", "background"]).optional().default("sprite"),
      x: z.number().min(0).max(1).optional().default(0.5),
      y: z.number().min(0).max(1).optional().default(0.5),
      widthNorm: z.number().min(0.05).max(2).optional().default(0.45),
    },
    async ({ projectId, name, filename, svgCode, insertIntoSceneId, layerType, x, y, widthNorm }) => {
      const safeSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40) || "vector";
      const finalFile = filename?.endsWith(".svg") ? filename : `${safeSlug}_${Date.now().toString(36).slice(-4)}.svg`;
      const base64 = Buffer.from(svgCode, "utf8").toString("base64");
      const uploaded = await client.uploadAsset(projectId, {
        name,
        kind: "svg",
        filename: finalFile,
        mimeType: "image/svg+xml",
        base64,
        scaleMode: "linear",
      });

      let layerId: string | null = null;
      if (insertIntoSceneId) {
        layerId = `svg_${Date.now().toString(36).slice(-5)}`;
        const layer =
          layerType === "background"
            ? {
                id: layerId,
                type: "background" as const,
                name,
                sourceType: "asset" as const,
                assetId: uploaded.asset.id,
                color: "#0b0d14",
                gradientTop: "#141828",
                gradientBottom: "#0a0c12",
                mood: "gold" as const,
                seed: 1,
                fit: "cover" as const,
                scaleMode: "linear" as const,
                driftX: 0,
                driftY: 0,
                dimOverlay: 0,
                washOpacity: 0,
                start: 0,
                visible: true,
                locked: false,
                zIndex: 0,
                parallaxDepth: 0.6,
                blendMode: "normal" as const,
                transform: { x: 0.5, y: 0.5, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                keyframes: {},
              }
            : {
                id: layerId,
                type: "sprite" as const,
                name,
                assetId: uploaded.asset.id,
                widthNorm,
                scaleMode: "linear" as const,
                pixelSnap: false,
                bobAmplitude: 0,
                bobSpeed: 1.2,
                start: 0,
                visible: true,
                locked: false,
                zIndex: 15,
                parallaxDepth: 1,
                blendMode: "normal" as const,
                transform: { x, y, anchor: { x: 0.5, y: 0.5 }, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, flipX: false, flipY: false },
                keyframes: {},
              };
        await client.applyOperations(projectId, [{ op: "layer.add", sceneId: insertIntoSceneId, layer }]);
      }

      return jsonContent({
        projectId,
        asset: uploaded.asset,
        insertedLayerId: layerId,
      });
    },
  );

  server.tool(
    "manage_project",
    "Update project title/description, inspect non-sensitive storage usage stats, or delete a project.",
    {
      action: z.enum(["update_meta", "delete", "storage_stats"]),
      projectId: IdSchema.optional(),
      name: z.string().min(1).max(160).optional(),
      description: z.string().max(1000).optional(),
    },
    async ({ action, projectId, name, description }) => {
      if (action === "storage_stats") {
        const stats = await client.getStorageStats();
        return jsonContent(stats);
      }
      if (!projectId) throw new Error("projectId is required");
      if (action === "delete") {
        const res = await client.deleteProject(projectId);
        return jsonContent({ projectId, ...res });
      }
      const { receipt, project } = await client.applyOperations(projectId, [
        { op: "project.updateMeta", name, description },
      ]);
      return jsonContent({ receipt, project: { id: project.id, name: project.name, description: project.description } });
    },
  );

  // ==========================================================================
  // 12. ALL-IN-ONE HIGH-LEVEL WORKFLOW (BATCH EDIT + AUDIT + CAPTURE + EXPORT)
  // ==========================================================================
  server.tool(
    "edit_audit_and_render",
    "All-in-one high-level Storia Studio workflow: executes batch edits (operations, optional animationStyleId, optional CapCut subtitlePresetId) atomically with snapshot rollback, runs quality audit (`audit_project`), optionally captures 1:1 WebGL2 PNG preview frames (`captureTimestamps`, up to 6), and optionally triggers MP4 export (`exportVideo`) — all in ONE single MCP call to maximize speed and minimize confirmation prompts in Gemini/ChatGPT web.",
    {
      projectId: IdSchema,
      animationStyleId: AnimationStyleIdSchema.optional(),
      updateStyleBackgrounds: z.boolean().optional().default(true),
      updateStyleSubtitles: z.boolean().optional().default(true),
      updateStyleTransitions: z.boolean().optional().default(false),
      subtitlePresetId: z.string().min(1).max(64).optional(),
      clearSubtitleCueOverrides: z.boolean().optional().default(true),
      operations: z.array(ProjectOperationSchema).max(200).optional().default([]),
      dryRun: z.boolean().optional().default(false),
      audit: z.boolean().optional().default(true),
      captureTimestamps: z.array(z.number().min(0)).max(6).optional().default([]),
      captureWidth: z.number().int().min(64).max(4096).optional(),
      captureHeight: z.number().int().min(64).max(4096).optional(),
      burnSubtitles: z.boolean().optional().default(true),
      exportVideo: z.boolean().optional().default(false),
      exportSettings: ExportSettingsSchema.partial().optional(),
      exportOutputName: z.string().min(1).max(120).optional(),
      waitForExport: z.boolean().optional().default(false),
      abortExportOnAuditErrors: z.boolean().optional().default(false),
      includeProjectSummary: z.boolean().optional().default(true),
    },
    async ({
      projectId,
      animationStyleId,
      updateStyleBackgrounds,
      updateStyleSubtitles,
      updateStyleTransitions,
      subtitlePresetId,
      clearSubtitleCueOverrides,
      operations,
      dryRun,
      audit,
      captureTimestamps,
      captureWidth,
      captureHeight,
      burnSubtitles,
      exportVideo,
      exportSettings,
      exportOutputName,
      waitForExport,
      abortExportOnAuditErrors,
      includeProjectSummary,
    }) => {
      const combinedOps: ProjectOperation[] = [];

      if (animationStyleId) {
        combinedOps.push({
          op: "project.applyAnimationStyle",
          styleId: animationStyleId,
          updateBackgrounds: updateStyleBackgrounds,
          updateSubtitles: updateStyleSubtitles,
          updateTransitions: updateStyleTransitions,
        });
      }

      if (operations.length > 0) {
        combinedOps.push(...operations);
      }

      if (subtitlePresetId) {
        const preset = getSubtitleStylePreset(subtitlePresetId);
        if (!preset) {
          throw new Error(
            `Subtitle preset '${subtitlePresetId}' not found. Call list_editor_catalogs(section='subtitles') for valid IDs.`,
          );
        }
        combinedOps.push({
          op: "subtitle.applyStyleToAll",
          patch: preset.style as Record<string, unknown>,
          clearCueOverrides: clearSubtitleCueOverrides,
        });
      }

      let currentProject: Project;
      let receipt: unknown = null;

      if (combinedOps.length > 0) {
        if (dryRun) {
          const before = await client.getProject(projectId);
          currentProject = applyProjectOperations(before, combinedOps);
          receipt = createEditReceipt({
            before,
            after: currentProject,
            operations: combinedOps,
            source: "mcp",
          });
        } else {
          const applied = await client.applyOperations(projectId, combinedOps);
          currentProject = applied.project;
          receipt = applied.receipt;
        }
      } else {
        currentProject = await client.getProject(projectId);
      }

      const auditReport = audit ? auditProject(currentProject) : null;

      const contentBlocks: (
        | { type: "image"; data: string; mimeType: "image/png" }
        | { type: "text"; text: string }
      )[] = [];
      const capturedFrames: {
        timestamp: number;
        width: number;
        height: number;
        sceneId: string | null;
        sceneName: string | null;
        bytes: number;
      }[] = [];

      if (!dryRun && captureTimestamps.length > 0) {
        for (const ts of captureTimestamps) {
          const captured = await client.captureFrame(projectId, {
            timeSec: ts,
            width: captureWidth,
            height: captureHeight,
            burnSubtitles,
          });
          const base64 = captured.pngDataUrl.replace(/^data:image\/png;base64,/, "");
          contentBlocks.push({
            type: "image",
            data: base64,
            mimeType: "image/png",
          });
          capturedFrames.push({
            timestamp: captured.timeSec,
            width: captured.width,
            height: captured.height,
            sceneId: captured.sceneId,
            sceneName: captured.sceneName,
            bytes: Buffer.byteLength(base64, "base64"),
          });
        }
      }

      let exportResult: unknown = null;
      let exportSkippedReason: string | null = null;
      if (exportVideo) {
        if (dryRun) {
          exportSkippedReason = "Skipped export because dryRun=true.";
        } else if (abortExportOnAuditErrors && auditReport && auditReport.counts.errors > 0) {
          exportSkippedReason = `Aborted export because audit detected ${auditReport.counts.errors} blocking error(s).`;
        } else {
          exportResult = await client.startExport(projectId, {
            settings: exportSettings,
            outputName: exportOutputName,
            wait: waitForExport,
          });
        }
      }

      const summaryPayload = {
        projectId,
        dryRun,
        operationsApplied: combinedOps.length,
        receipt,
        audit: auditReport,
        capturedFrames,
        export: exportResult,
        ...(exportSkippedReason ? { exportSkippedReason } : {}),
        ...(includeProjectSummary ? { projectSummary: summarizeProject(currentProject) } : {}),
      };

      contentBlocks.push({
        type: "text",
        text: JSON.stringify(summaryPayload, null, 2),
      });

      return { content: contentBlocks };
    },
  );

  // ==========================================================================
  // 14. AI VISUAL ANALYSIS, RESOURCE ENHANCEMENT, REPLACEMENT, TTS/AUDIO
  //     INSPECTION, DEBUGGING & STUDIO DIAGNOSTICS
  // ==========================================================================

  server.tool(
    "preview_video_frames",
    "Capture multiple 1:1 WebGL2 PNG preview frames across any video timeline in one fast call (by custom timestamps, scene midpoints, scene transition cuts, or evenly spaced grid) and return either a single labeled Contact Sheet PNG or individual PNG images so the AI can visually analyze framing, rigs, subtitles, and transitions.",
    {
      projectId: IdSchema,
      mode: z
        .enum(["timestamps", "scene_midpoints", "scene_cuts", "even_grid"])
        .optional()
        .default("scene_midpoints"),
      timestamps: z.array(z.number().min(0)).max(12).optional(),
      count: z.number().int().min(1).max(12).optional().default(6),
      width: z.number().int().min(64).max(1920).optional(),
      height: z.number().int().min(64).max(1920).optional(),
      burnSubtitles: z.boolean().optional().default(true),
      contactSheet: z.boolean().optional().default(true),
      columns: z.number().int().min(1).max(4).optional(),
      includeIndividualFrames: z.boolean().optional().default(false),
    },
    async ({ projectId, ...payload }) => {
      const res = await client.captureFramesBatch(projectId, payload);
      const contentBlocks: (
        | { type: "image"; data: string; mimeType: string }
        | { type: "text"; text: string }
      )[] = [];

      if (res.contactSheet?.pngDataUrl) {
        contentBlocks.push({
          type: "image",
          data: res.contactSheet.pngDataUrl.replace(/^data:image\/png;base64,/, ""),
          mimeType: "image/png",
        });
      }
      if (!res.contactSheet || payload.includeIndividualFrames) {
        for (const f of res.frames) {
          if (f.pngDataUrl) {
            contentBlocks.push({
              type: "image",
              data: f.pngDataUrl.replace(/^data:image\/png;base64,/, ""),
              mimeType: "image/png",
            });
          }
        }
      }

      contentBlocks.push({
        type: "text",
        text: JSON.stringify(
          {
            projectId: res.projectId,
            durationSec: res.durationSec,
            mode: res.mode,
            contactSheet: res.contactSheet
              ? { width: res.contactSheet.width, height: res.contactSheet.height }
              : null,
            frames: res.frames.map(({ pngDataUrl: _img, ...meta }) => meta),
          },
          null,
          2,
        ),
      });

      return { content: contentBlocks };
    },
  );

  server.tool(
    "preview_visual_asset",
    "Render and return a PNG image of either an existing project visual asset (SVG, PNG, JPEG, WebP, pixel-art sprite) OR a candidate item from the vector libraries (local/svg_backgrounds itemId, Iconify/pixel_game_sprites/openmoji_props iconifyName, or Openverse/Wikimedia remoteUrl) BEFORE importing, along with natural dimensions and opaque coverage ratio.",
    {
      source: z.enum(["project_asset", "library_vector"]),
      projectId: IdSchema.optional(),
      assetId: IdSchema.optional(),
      itemId: z.string().min(1).optional(),
      iconifyName: z.string().min(1).optional(),
      remoteUrl: z.string().min(1).optional(),
      color: z.string().max(32).optional(),
      maxSize: z.number().int().min(128).max(1600).optional().default(512),
      background: z.enum(["checkerboard", "dark", "light", "transparent"]).optional().default("checkerboard"),
      pixelated: z.boolean().optional().default(false),
    },
    async ({ source, projectId, assetId, itemId, iconifyName, remoteUrl, color, maxSize, background, pixelated }) => {
      if (source === "project_asset") {
        if (!projectId || !assetId) {
          throw new Error("projectId and assetId are required when source='project_asset'");
        }
        const res = await client.previewProjectAssetPng(projectId, assetId, { maxSize, background });
        const base64 = res.pngDataUrl.replace(/^data:image\/png;base64,/, "");
        const { pngDataUrl: _ignored, ...meta } = res;
        return {
          content: [
            { type: "image", data: base64, mimeType: "image/png" },
            { type: "text", text: JSON.stringify(meta, null, 2) },
          ],
        };
      }

      const res = await client.previewLibraryVectorPng({
        itemId,
        iconifyName,
        remoteUrl,
        color,
        maxSize,
        background,
        pixelated,
      });
      const base64 = res.pngDataUrl.replace(/^data:image\/png;base64,/, "");
      const { pngDataUrl: _ignored, ...meta } = res;
      return {
        content: [
          { type: "image", data: base64, mimeType: "image/png" },
          { type: "text", text: JSON.stringify(meta, null, 2) },
        ],
      };
    },
  );

  server.tool(
    "inspect_exported_video",
    "Verify an exported MP4 file on disk: runs ffprobe (resolution, FPS, codecs, bitrate, duration), measures EBU R128 loudness (LUFS, True Peak, clipping, silences), and extracts actual rendered PNG frames from the MP4 so the AI can visually confirm the final exported video.",
    {
      projectId: IdSchema,
      filename: z.string().min(1).max(200).optional(),
      timestamps: z.array(z.number().min(0)).max(6).optional(),
      maxWidth: z.number().int().min(160).max(1080).optional().default(480),
    },
    async ({ projectId, filename, timestamps, maxWidth }) => {
      const res = await client.inspectExportedVideo(projectId, { filename, timestamps, maxWidth });
      const contentBlocks: (
        | { type: "image"; data: string; mimeType: string }
        | { type: "text"; text: string }
      )[] = [];

      for (const f of res.frames) {
        contentBlocks.push({
          type: "image",
          data: f.pngDataUrl.replace(/^data:image\/png;base64,/, ""),
          mimeType: "image/png",
        });
      }

      contentBlocks.push({
        type: "text",
        text: JSON.stringify(
          {
            projectId: res.projectId,
            filename: res.filename,
            fileSizeBytes: res.fileSizeBytes,
            durationSec: res.durationSec,
            width: res.width,
            height: res.height,
            fps: res.fps,
            videoCodec: res.videoCodec,
            audioCodec: res.audioCodec,
            videoBitrateKbps: res.videoBitrateKbps,
            audioAnalysis: res.audioAnalysis,
            framesExtracted: res.frames.map(({ pngDataUrl: _p, ...m }) => m),
          },
          null,
          2,
        ),
      });

      return { content: contentBlocks };
    },
  );

  server.tool(
    "analyze_audio_and_tts",
    "Analyze project audio assets/clips (EBU R128 LUFS, True Peak, clipping, leading/trailing silences, speaking rate WPM, voice-to-subtitle sync & overlap detection) OR benchmark/test a TTS provider & voice (`mode='tts_benchmark'`) without modifying the project.",
    {
      mode: z.enum(["project_audio", "tts_benchmark"]).optional().default("project_audio"),
      projectId: IdSchema.optional(),
      assetId: IdSchema.optional(),
      trackId: IdSchema.optional(),
      clipId: IdSchema.optional(),
      provider: TtsProviderSchema.optional().default("windows_sapi"),
      text: z.string().min(1).max(1200).optional(),
      voiceId: z.string().max(160).optional(),
      language: z.string().max(24).optional().default("es"),
      speed: z.number().min(0.5).max(2.0).optional().default(1.0),
      modelId: z.string().max(80).optional(),
    },
    async ({ mode, projectId, assetId, trackId, clipId, provider, text, voiceId, language, speed, modelId }) => {
      if (mode === "tts_benchmark") {
        const res = await client.benchmarkTts({ provider, text, voiceId, language, speed, modelId });
        return jsonContent(res);
      }
      if (!projectId) {
        throw new Error("projectId is required when mode='project_audio'");
      }
      const res = await client.analyzeProjectAudio(projectId, { assetId, trackId, clipId });
      return jsonContent(res);
    },
  );

  server.tool(
    "enhance_asset",
    "Improve an existing project asset in-place or as a copy: Audio DSP ('denoise', 'voice_enhance', 'normalize' -16 LUFS, 'trim_silence', 'deess_warm', 'fade_clean' with before/after loudness metrics), Image/Pixel-Art filters ('upscale_pixel_nearest', 'sharpen', 'auto_contrast', 'resize', 'warm_grade', 'cool_grade', 'grayscale', 'remove_bg_chroma'), or SVG enhancement (color palette remapping via `colorMap`, `strokeScale`, auto `viewBox`, minify) with instant PNG preview.",
    {
      projectId: IdSchema,
      assetId: IdSchema,
      mode: z.enum(["replace", "copy"]).optional().default("replace"),
      copyName: z.string().min(1).max(160).optional(),
      audioAction: z
        .enum(["denoise", "voice_enhance", "normalize", "trim_silence", "deess_warm", "fade_clean"])
        .optional(),
      imageAction: z
        .enum([
          "upscale_pixel_nearest",
          "sharpen",
          "auto_contrast",
          "resize",
          "warm_grade",
          "cool_grade",
          "grayscale",
          "remove_bg_chroma",
        ])
        .optional(),
      scaleFactor: z.number().int().min(2).max(8).optional(),
      width: z.number().int().min(16).max(4096).optional(),
      height: z.number().int().min(16).max(4096).optional(),
      chromaColor: z.string().max(16).optional(),
      chromaSimilarity: z.number().min(0.01).max(0.5).optional(),
      colorMap: z.record(z.string(), z.string()).optional(),
      strokeScale: z.number().min(0.1).max(10).optional(),
      ensureViewBox: z.boolean().optional().default(true),
      minifySvg: z.boolean().optional().default(false),
      returnPreview: z.boolean().optional().default(true),
    },
    async ({ projectId, assetId, ...payload }) => {
      const res = await client.enhanceAsset(projectId, assetId, payload);
      const previewUrl = typeof res.previewPngDataUrl === "string" ? res.previewPngDataUrl : undefined;
      const { previewPngDataUrl: _p, ...meta } = res;
      if (previewUrl) {
        return {
          content: [
            { type: "image", data: previewUrl.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" },
            { type: "text", text: JSON.stringify(meta, null, 2) },
          ],
        };
      }
      return jsonContent(meta);
    },
  );

  server.tool(
    "replace_project_asset",
    "Replace any existing project resource in-place (`targetAssetId`) or swap the media of a specific scene layer (`targetSceneId`+`targetLayerId`), audio clip (`targetTrackId`+`targetClipId`), or articulated character part (`targetCharacterId`+`targetCharacterPart`/`targetHeadVariant`) using a local disk file (`localFilePath`), raw `svgCode`, vector library item, audio library item, or fresh TTS voiceover — preserving transforms, keyframes, and snapshot rollback.",
    {
      projectId: IdSchema,
      targetAssetId: IdSchema.optional(),
      targetSceneId: IdSchema.optional(),
      targetLayerId: IdSchema.optional(),
      targetTrackId: IdSchema.optional(),
      targetClipId: IdSchema.optional(),
      targetCharacterId: IdSchema.optional(),
      targetCharacterPart: z
        .enum([
          "fullBody",
          "head",
          "torso",
          "leftArm",
          "rightArm",
          "leftHand",
          "rightHand",
          "leftLeg",
          "rightLeg",
          "leftFoot",
          "rightFoot",
          "hat",
          "prop",
        ])
        .optional(),
      targetHeadVariant: z.string().max(40).optional(),
      keepOriginalAssetId: z.boolean().optional().default(true),
      preserveClipDuration: z.boolean().optional().default(false),
      name: z.string().min(1).max(160).optional(),
      kind: AssetKindSchema.optional(),
      scaleMode: ScaleModeSchema.optional(),
      sourceType: z.enum(["local_file", "svg_code", "vector_library", "audio_library", "tts"]),
      localFilePath: z.string().min(1).optional(),
      filename: z.string().min(1).max(200).optional(),
      svgCode: z.string().min(10).max(2_000_000).optional(),
      libraryVector: z
        .object({
          source: z
            .enum([
              "videos",
              "workspace",
              "iconify",
              "openverse",
              "wikimedia",
              "pixel_game_sprites",
              "openmoji_props",
              "svg_backgrounds",
            ])
            .default("videos"),
          itemId: z.string().optional(),
          iconifyName: z.string().optional(),
          remoteUrl: z.string().optional(),
          color: z.string().optional(),
          license: z.string().optional(),
          author: z.string().optional(),
          sourceUrl: z.string().optional(),
        })
        .optional(),
      libraryAudio: z
        .object({
          source: z
            .enum(["openverse", "wikimedia", "internet_archive", "local_workspace", "local_videos", "local"])
            .default("openverse"),
          itemId: z.string().optional(),
          remoteUrl: z.string().optional(),
          license: z.string().optional(),
          author: z.string().optional(),
          attribution: z.string().optional(),
          sourceUrl: z.string().optional(),
        })
        .optional(),
      tts: z
        .object({
          provider: TtsProviderSchema.default("windows_sapi"),
          text: z.string().min(1).max(8000),
          voiceId: z.string().max(160).optional(),
          language: z.string().max(24).default("es"),
          speed: z.number().min(0.5).max(2.0).default(1.0),
          modelId: z.string().max(80).optional(),
        })
        .optional(),
      returnPreview: z.boolean().optional().default(true),
    },
    async ({ projectId, sourceType, localFilePath, filename, ...rest }) => {
      let apiSourceType: "base64" | "svg_code" | "vector_library" | "audio_library" | "tts" =
        sourceType === "local_file" ? "base64" : sourceType;
      let base64: string | undefined;
      let resolvedFilename = filename;

      if (sourceType === "local_file") {
        if (!allowLocalFilesystem) {
          throw new Error(
            "replace_project_asset(sourceType='local_file') is disabled on remote HTTP MCP connections for security. Use svg_code, vector_library, audio_library, or tts instead.",
          );
        }
        if (!localFilePath) {
          throw new Error("localFilePath is required when sourceType='local_file'");
        }
        const resolved = resolveCrossPlatformPath(localFilePath);
        assertSafeLocalFilePath(resolved);
        const bytes = await fs.readFile(resolved);
        base64 = bytes.toString("base64");
        resolvedFilename = resolvedFilename ?? path.basename(resolved);
      }

      const res = await client.replaceProjectAsset(projectId, {
        ...rest,
        sourceType: apiSourceType,
        base64,
        filename: resolvedFilename,
      });

      const previewUrl = typeof res.previewPngDataUrl === "string" ? res.previewPngDataUrl : undefined;
      const { previewPngDataUrl: _p, ...meta } = res;
      if (previewUrl) {
        return {
          content: [
            { type: "image", data: previewUrl.replace(/^data:image\/png;base64,/, ""), mimeType: "image/png" },
            { type: "text", text: JSON.stringify(meta, null, 2) },
          ],
        };
      }
      return jsonContent(meta);
    },
  );

  server.tool(
    "debug_project_state",
    "Deep debugger for a Storia Studio project: inspects exact active scene, visible layers, camera, active subtitle/word, playing audio clips, and effects at any `timestamp` (in seconds), plus scene transition sync mismatches, missing disk asset files, orphan unreferenced assets, and rollback snapshot history.",
    {
      projectId: IdSchema,
      timestamp: z.number().min(0).optional(),
      checkDiskAssets: z.boolean().optional().default(true),
    },
    async ({ projectId, timestamp, checkDiskAssets }) => {
      const res = await client.debugProject(projectId, { timestamp, checkDiskAssets });
      return jsonContent(res);
    },
  );

  server.tool(
    "run_studio_diagnostics",
    "Run end-to-end Storia Studio self-tests and environment diagnostics: checks FFmpeg & GPU NVENC/CPU encoders, Python modules (`faster_whisper`, `kokoro_onnx`, `piper`, `onnxruntime`, `av`, `soundfile`), TTS providers readiness, enabled media libraries, and an optional live WebGL2 smoke-test render on a project (`smokeRenderProjectId`).",
    {
      checkPython: z.boolean().optional().default(true),
      checkTts: z.boolean().optional().default(true),
      checkLibraries: z.boolean().optional().default(true),
      smokeRenderProjectId: IdSchema.optional(),
    },
    async (payload) => {
      const res = await client.runDiagnostics(payload);
      return jsonContent(res);
    },
  );

  return server;
}
