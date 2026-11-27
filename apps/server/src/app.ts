import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify, { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import { z, ZodError } from "zod";
import {
  ANIMATION_STYLE_LIST,
  AspectRatioSchema,
  AssetKindSchema,
  createDemoProject,
  ExportSettingsSchema,
  FpsSchema,
  getAnimationStylePreset,
  getProjectDuration,
  IdSchema,
  importLegacyStoriaManifest,
  importSubtitlesTextToCues,
  Project,
  ProjectOperation,
  ProjectOperationSchema,
  ProjectSchema,
  rechunkSubtitleCuesToTikTok,
  resolveSceneAtTime,
  ResolutionPresetSchema,
  ScaleModeSchema,
  SCHEMA_VERSION,
  TransitionConfigSchema,
} from "@storia/schema";
import {
  AudioProcessAction,
  processAudioWithFfmpeg,
  synthesizeTransitionSfxWav,
  transcribeAudioFileToCues,
} from "./audioTools.js";
import { closeHeadlessBrowser } from "./chromium.js";
import {
  AiHarnessId,
  AiTransportMode,
  ConnectivityManager,
  REMOTE_SESSION_COOKIE_NAME,
} from "./connectivity.js";
import { assembleDirectedVideo, DirectorAssembleRequestSchema } from "./directorAssembler.js";
import { ExportEventPayload, ExportManager } from "./exporter.js";
import {
  appendProjectCredit,
  AudioSearchParams,
  LibraryId,
  LibraryManager,
  probeAudioDurationSec,
  VectorSource,
} from "./libraries.js";
import { StickmanDirectorBridge } from "./stickmanDirector.js";
import { McpOAuthProvider, resolvePublicBaseUrl } from "./mcpOAuth.js";
import {
  analyzeAudioFile,
  checkPythonEnvironment,
  composeContactSheetPng,
  enhanceImageWithFfmpeg,
  enhanceSvgMarkup,
  ImageEnhanceAction,
  inspectMp4Video,
  probeImageDimensions,
  rasterizeVisualToPng,
} from "./mcpPowerTools.js";
import { ProjectStorage } from "./storage.js";
import {
  checkStrictLocalAdminRequest,
  isMcpAgentRequest,
  isRemoteTunnelRequest,
  redactSecrets,
} from "./secretVault.js";
import {
  resolveDefaultModelsRootDir,
  resolveDefaultStudioDistDir,
} from "./dataPaths.js";
import { OnboardingManager } from "./onboarding.js";
import { getSystemCapabilities } from "./system.js";
import { TtsManager, TtsProviderId } from "./tts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STUDIO_DIST = resolveDefaultStudioDistDir();

export interface BuildServerOptions {
  projectsDir: string;
  studioDistDir?: string;
  videosDir?: string;
  workspaceAssetsDir?: string;
  modelsDir?: string;
  ttsModelsDir?: string;
  stickmanDirectorDir?: string;
  connectivityConfigPath?: string;
  librariesConfigPath?: string;
  oauthStorePath?: string;
  onboardingConfigPath?: string;
  bootstrapConfigPath?: string;
  isDesktopApp?: boolean;
  listeningHost?: string;
  listeningPort?: number;
  logger?: boolean;
}

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".srt": "application/x-subrip; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
};

const CreateProjectBodySchema = z.object({
  id: IdSchema.optional(),
  name: z.string().min(1).max(160).optional(),
  template: z.enum(["blank", "demo"]).default("demo"),
  aspectRatio: AspectRatioSchema.default("9:16"),
  resolution: ResolutionPresetSchema.default("1080p"),
  fps: FpsSchema.default(30),
});

const ApplyOperationsBodySchema = z.object({
  operations: z.array(ProjectOperationSchema).min(1).max(200),
  source: z.enum(["ui", "mcp", "api"]).default("api"),
});

const ImportLegacyBodySchema = z.object({
  id: IdSchema.optional(),
  manifest: z.record(z.string(), z.unknown()),
});

const UploadAssetBodySchema = z.object({
  id: IdSchema.optional(),
  name: z.string().min(1).max(160),
  filename: z.string().min(1).max(200),
  kind: AssetKindSchema,
  scaleMode: ScaleModeSchema.default("linear"),
  mimeType: z.string().max(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  durationSec: z.number().min(0).optional(),
  /** Base64-encoded file bytes (raw or data URL). */
  base64: z.string().min(1),
});

const StartExportBodySchema = z.object({
  settings: ExportSettingsSchema.partial().optional(),
  outputName: z.string().min(1).max(120).optional(),
  wait: z.boolean().default(false),
});

const CaptureFrameBodySchema = z.object({
  timeSec: z.number().min(0).default(0),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
  burnSubtitles: z.boolean().default(true),
  format: z.enum(["json", "png"]).default("json"),
});

function sanitizeFilename(raw: string): string {
  const base = path.basename(raw).replace(/[^a-zA-Z0-9._-]+/g, "_");
  return base.length > 0 ? base.slice(0, 140) : `asset_${Date.now()}.bin`;
}

function sanitizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : `asset_${Date.now()}`;
}

const DISALLOWED_UPLOAD_EXTENSIONS = new Set([
  ".html",
  ".htm",
  ".xhtml",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".php",
  ".sh",
  ".bash",
  ".bat",
  ".cmd",
  ".ps1",
  ".exe",
  ".dll",
  ".msi",
  ".com",
  ".scr",
]);

function isDisallowedUploadExtension(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return DISALLOWED_UPLOAD_EXTENSIONS.has(ext);
}

/**
 * Simple in-memory sliding-window rate limiter keyed by bucket + client IP.
 */
class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  consume(key: string, maxRequests: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length >= maxRequests) {
      const oldest = list[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.hits.set(key, list);
      return { allowed: false, retryAfterSec };
    }
    list.push(now);
    this.hits.set(key, list);
    // Periodic cleanup to keep memory bounded
    if (this.hits.size > 2000) {
      for (const [k, v] of this.hits.entries()) {
        if (v.length === 0 || (v[v.length - 1] ?? 0) <= cutoff) {
          this.hits.delete(k);
        }
      }
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

function getClientRateKey(req: { headers: Record<string, string | string[] | undefined>; ip?: string; socket?: { remoteAddress?: string } }): string {
  const cfIp = typeof req.headers["cf-connecting-ip"] === "string" ? req.headers["cf-connecting-ip"].trim() : "";
  if (cfIp) return cfIp;
  const xff = typeof req.headers["x-forwarded-for"] === "string" ? req.headers["x-forwarded-for"].split(",")[0]?.trim() : "";
  if (xff) return xff;
  return (req.socket?.remoteAddress || req.ip || "unknown").trim();
}

function isLoopbackRemoteSocket(req: { socket?: { remoteAddress?: string }; ip?: string; headers: Record<string, string | string[] | undefined> }): boolean {
  if (isRemoteTunnelRequest(req as Parameters<typeof isRemoteTunnelRequest>[0])) return false;
  const hostHeader = typeof req.headers.host === "string" ? req.headers.host.trim().toLowerCase() : "";
  if (
    hostHeader &&
    !/^localhost(:\d+)?$/.test(hostHeader) &&
    !/^127\.0\.0\.1(:\d+)?$/.test(hostHeader) &&
    !/^\[::1\](:\d+)?$/.test(hostHeader)
  ) {
    return false;
  }
  const addr = (req.socket?.remoteAddress || req.ip || "").trim().toLowerCase();
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1" || addr === "localhost";
}

export async function buildServer(options: BuildServerOptions): Promise<FastifyInstance> {
  // 128 MB body limit cleanly accommodates raw 4K RGBA frames (2160*3840*4 = ~33 MB) and media uploads
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 128 * 1024 * 1024 });
  const storage = new ProjectStorage(options.projectsDir);
  const ttsManager = new TtsManager(options.ttsModelsDir);
  const studioDistDir = options.studioDistDir ?? DEFAULT_STUDIO_DIST;
  await storage.ensureRoot();

  await app.register(cors, {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Accept",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "Last-Event-ID",
      "X-Storia-Client",
      "ngrok-skip-browser-warning",
    ],
    exposedHeaders: ["Mcp-Session-Id", "MCP-Protocol-Version", "WWW-Authenticate"],
  });
  await app.register(websocket);

  // Raw binary RGBA frame parser for zero-overhead Playwright -> FFmpeg frame streaming
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer" }, (_req, payload, done) => {
    done(null, payload);
  });

  // OAuth 2.1 form-urlencoded body parser (/oauth/token, /oauth/authorize, /oauth/revoke)
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    try {
      const params = new URLSearchParams(String(body));
      const parsed: Record<string, string> = {};
      for (const [k, v] of params.entries()) {
        parsed[k] = v;
      }
      done(null, parsed);
    } catch (err) {
      done(err as Error);
    }
  });

  // Live project rooms for real-time Studio UI <-> MCP sync & export progress
  const rooms = new Map<string, Set<WebSocket>>();

  function broadcastToRoom(projectId: string, payloadObj: unknown): void {
    const sockets = rooms.get(projectId);
    if (!sockets || sockets.size === 0) return;
    const payload = JSON.stringify(payloadObj);
    for (const ws of sockets) {
      if (ws.readyState === 1) {
        ws.send(payload);
      }
    }
  }

  function broadcastProjectUpdate(project: Project, source: string, receipt?: unknown): void {
    broadcastToRoom(project.id, {
      type: "project.updated",
      projectId: project.id,
      updatedAt: project.updatedAt,
      source,
      receipt,
      project,
    });
  }

  const getListeningInfo = (): { listeningHost: string; listeningPort: number } => {
    const addr = app.server.address();
    const fallbackHost = options.listeningHost ?? process.env.STORIA_SERVER_HOST ?? "localhost";
    const fallbackPort = options.listeningPort ?? Number(process.env.STORIA_SERVER_PORT ?? 4310);
    if (addr && typeof addr === "object" && addr.port) {
      return { listeningHost: addr.address, listeningPort: addr.port };
    }
    return { listeningHost: fallbackHost, listeningPort: fallbackPort };
  };

  const getServerOrigin = (): string => {
    const { listeningHost, listeningPort } = getListeningInfo();
    const envHost = process.env.STORIA_SERVER_HOST;
    const safeDefault = envHost && envHost !== "0.0.0.0" && envHost !== "::" ? envHost : "localhost";
    const rawHost =
      listeningHost === "0.0.0.0" || listeningHost === "::" || listeningHost === "::1"
        ? safeDefault
        : listeningHost;
    const formattedHost = rawHost.includes(":") ? `[${rawHost}]` : rawHost;
    return `http://${formattedHost}:${listeningPort}`;
  };

  const exportManager = new ExportManager(storage, getServerOrigin, (evt: ExportEventPayload) => {
    broadcastToRoom(evt.projectId, evt);
  });

  const directorBridge = new StickmanDirectorBridge(options.stickmanDirectorDir);
  const connectivityManager = new ConnectivityManager(options.connectivityConfigPath);
  const mcpOAuth = new McpOAuthProvider(options.oauthStorePath);

  const effectiveVideosDir = options.videosDir ?? process.env.STORIA_VIDEOS_DIR ?? "";
  const effectiveWorkspaceAssetsDir = options.workspaceAssetsDir ?? process.env.STORIA_WORKSPACE_ASSETS_DIR ?? "";
  const effectiveModelsDir = options.modelsDir ?? resolveDefaultModelsRootDir();

  const libraryManager = new LibraryManager({
    videosDir: effectiveVideosDir,
    workspaceAssetsDir: effectiveWorkspaceAssetsDir,
    directorBridge,
    librariesConfigPath: options.librariesConfigPath,
  });

  const onboardingManager = new OnboardingManager({
    configPath: options.onboardingConfigPath,
    bootstrapConfigPath: options.bootstrapConfigPath,
    activeProjectsDir: storage.rootDir,
    activeModelsDir: effectiveModelsDir,
    activeCustomAssetsDir: effectiveWorkspaceAssetsDir,
    isDesktopApp: options.isDesktopApp,
  });

  app.addHook("onClose", async () => {
    await connectivityManager.stopTunnel();
    await closeHeadlessBrowser();
  });

  // Expose connectivity manager on fastify instance for bootstrap auto-start
  (app as FastifyInstance & { connectivityManager?: ConnectivityManager }).connectivityManager = connectivityManager;

  const rateLimiter = new SlidingWindowRateLimiter();

  // Global security headers on all HTTP responses (prevents MIME sniffing & referrer leakage)
  app.addHook("onSend", async (_req, reply, payload) => {
    if (!reply.getHeader("X-Content-Type-Options")) {
      reply.header("X-Content-Type-Options", "nosniff");
    }
    if (!reply.getHeader("Referrer-Policy")) {
      reply.header("Referrer-Policy", "no-referrer");
    }
    return payload;
  });

  // Zero-Trust Remote Tunnel Gate:
  // Localhost and home LAN Wi-Fi remain frictionless for the Studio UI,
  // while requests arriving through public tunnels/proxies (ngrok / Cloudflare / reverse proxy)
  // MUST present a valid MCP Bearer token or OAuth 2.1 access token to access `/api/*` or `/ws/*`
  // (except public health/redacted connectivity status & strict-local-admin routes which always return 403).
  const STRICT_LOCAL_ADMIN_PREFIXES = [
    "/api/tts/config",
    "/api/tts/models/install",
    "/api/connectivity/config",
    "/api/connectivity/token/rotate",
    "/api/connectivity/mobile-link/",
    "/api/connectivity/tunnel/",
    "/api/connectivity/ai-prompt",
    "/api/connectivity/oauth/",
    "/api/libraries/config",
    "/api/libraries/cache/clear",
    "/api/onboarding/complete",
    "/api/onboarding/skip",
    "/api/onboarding/reset",
    "/api/internal/",
  ];

  const isHttpsRequest = (req: { headers: Record<string, string | string[] | undefined>; protocol?: string }): boolean => {
    const xfp =
      typeof req.headers["x-forwarded-proto"] === "string"
        ? req.headers["x-forwarded-proto"].split(",")[0]?.trim().toLowerCase()
        : "";
    return xfp === "https" || req.protocol === "https";
  };

  const buildRemoteSessionCookieHeader = (
    req: { headers: Record<string, string | string[] | undefined>; protocol?: string },
    value: string,
    maxAgeSec: number,
  ): string => {
    const parts = [
      `${REMOTE_SESSION_COOKIE_NAME}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAgeSec}`,
    ];
    if (isHttpsRequest(req)) {
      parts.push("Secure");
    }
    return parts.join("; ");
  };

  app.addHook("onRequest", async (req, reply) => {
    const pathname = (req.url.split("?")[0] ?? req.url).trim();
    if (!pathname.startsWith("/api/")) return;
    if (!isRemoteTunnelRequest(req)) return;

    // Allow public health check, redacted connectivity status, and remote unlock/logout auth endpoints
    if (
      pathname === "/api/health" ||
      (pathname === "/api/connectivity" && req.method === "GET") ||
      pathname === "/api/auth/remote-unlock" ||
      pathname === "/api/auth/remote-logout"
    ) {
      return;
    }

    // Strict local-admin endpoints must always return 403 (even if authenticated)
    if (STRICT_LOCAL_ADMIN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      const admin = checkStrictLocalAdminRequest(req);
      if (!admin.ok) {
        return reply.status(403).send({
          error: "local_admin_required",
          message: admin.reason,
        });
      }
      return;
    }

    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpAuthEnabled) return;

    const query = (req.query ?? {}) as { token?: string };
    const authOk =
      (await connectivityManager.validateRemoteSessionCookie(req.headers.cookie)) ||
      (await connectivityManager.validateMcpBearer(req.headers.authorization, query.token)) ||
      (await mcpOAuth.validateAccessToken(req.headers.authorization)).valid;

    if (!authOk) {
      const ipKey = `remote_api_unauth:${getClientRateKey(req)}`;
      const rl = rateLimiter.consume(ipKey, 40, 5 * 60 * 1000);
      if (!rl.allowed) {
        reply.header("Retry-After", String(rl.retryAfterSec));
        return reply.status(429).send({
          error: "too_many_requests",
          message: "Too many unauthorized remote requests. Try again later.",
        });
      }
      const baseUrl = resolvePublicBaseUrl(req.headers, getServerOrigin());
      reply.header("WWW-Authenticate", mcpOAuth.buildWwwAuthenticateHeader(baseUrl));
      return reply.status(401).send({
        error: "remote_auth_required",
        message: "Authentication required for remote tunnel access. Open the secure mobile link or enter your access code.",
      });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: "validation_error",
        message: "Payload failed schema validation",
        issues: err.issues,
      });
    }
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500;
    const rawMsg = err instanceof Error ? err.message : String(err);
    return reply.status(statusCode).send({
      error: statusCode >= 500 ? "internal_error" : "request_error",
      message: redactSecrets(rawMsg),
    });
  });

  app.get("/api/health", async () => ({
    ok: true,
    service: "storia-studio-server",
    schemaVersion: SCHEMA_VERSION,
    projectsDir: storage.rootDir,
  }));

  app.get("/api/system/capabilities", async (req) => {
    const refresh = (req.query as { refresh?: string })?.refresh === "true";
    return getSystemCapabilities(refresh);
  });

  // ============================================================================
  // FIRST-RUN DESKTOP / STUDIO ONBOARDING WIZARD
  // ============================================================================

  app.get("/api/onboarding/status", async (req) => {
    const admin = checkStrictLocalAdminRequest(req);
    const [projects, caps, pythonEnv] = await Promise.all([
      storage.list(),
      getSystemCapabilities(false),
      checkPythonEnvironment().catch(() => null),
    ]);
    const status = await onboardingManager.getStatus({ existingProjectCount: projects.length });
    return {
      ...status,
      // Only show onboarding to the local host desktop user, never over remote tunnels/LAN
      shouldShow: admin.ok ? status.shouldShow : false,
      localAdminAllowed: admin.ok,
      system: {
        platform: caps.platform,
        cpus: caps.cpus,
        totalMemGb: caps.totalMemGb,
        ffmpegAvailable: Boolean(caps.ffmpegVersion),
        ffmpegVersion: caps.ffmpegVersion,
        recommendedEncoder: caps.recommendedEncoder,
        nvencAvailable: Boolean(caps.encoders.h264_nvenc),
        pythonAvailable: Boolean(pythonEnv?.pythonBin),
      },
    };
  });

  app.post("/api/onboarding/complete", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }

    const body = z
      .object({
        projectsDir: z.string().max(500).optional(),
        modelsDir: z.string().max(500).optional(),
        customAssetsDir: z.string().max(500).optional(),
        enabledLibraries: z.record(z.string(), z.boolean()).optional(),
        connectivity: z
          .object({
            accessMode: z.enum(["local", "lan"]).optional(),
            mcpHttpEnabled: z.boolean().optional(),
            mcpAuthEnabled: z.boolean().optional(),
            tunnelProvider: z.enum(["none", "ngrok", "cloudflare"]).optional(),
            tunnelAutoStart: z.boolean().optional(),
          })
          .optional(),
        preferences: z
          .object({
            theme: z.enum(["dark", "light"]).optional(),
            language: z.enum(["es", "en", "pt", "fr"]).optional(),
            defaultAspectRatio: z.enum(["9:16", "16:9", "1:1"]).optional(),
            defaultResolution: z.enum(["720p", "1080p", "2k", "4k"]).optional(),
            defaultFps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
            defaultTtsProvider: z.string().max(64).optional(),
            whisperModel: z.enum(["tiny", "base", "small", "medium"]).optional(),
          })
          .optional(),
        createStarterProject: z.boolean().optional().default(true),
      })
      .parse(req.body ?? {});

    if (body.customAssetsDir !== undefined) {
      libraryManager.setCustomAssetsDir(body.customAssetsDir);
    }

    if (body.enabledLibraries && Object.keys(body.enabledLibraries).length > 0) {
      await libraryManager.updateEnabledLibraries(
        body.enabledLibraries as Partial<Record<LibraryId, boolean>>,
      );
    }

    if (body.connectivity) {
      await connectivityManager.updateConfig(body.connectivity);
    }

    const { state, restartRequired } = await onboardingManager.complete({
      projectsDir: body.projectsDir,
      modelsDir: body.modelsDir,
      customAssetsDir: body.customAssetsDir,
      preferences: body.preferences,
      skipped: false,
    });

    // Optionally seed a clean starter project if the workspace has none yet
    let starterProjectId: string | null = null;
    if (body.createStarterProject) {
      const existing = await storage.list();
      if (existing.length === 0) {
        const demo = createDemoProject("starter_story_project");
        demo.name = "Mi Primer Video — Storia Studio";
        if (body.preferences?.defaultAspectRatio) {
          demo.canvas.aspectRatio = body.preferences.defaultAspectRatio;
          demo.exportSettings.aspectRatio = body.preferences.defaultAspectRatio;
        }
        if (body.preferences?.defaultResolution) {
          demo.canvas.resolution = body.preferences.defaultResolution;
          demo.exportSettings.resolution = body.preferences.defaultResolution;
        }
        if (body.preferences?.defaultFps) {
          demo.canvas.fps = body.preferences.defaultFps;
          demo.exportSettings.fps = body.preferences.defaultFps;
        }
        await storage.save(demo);
        starterProjectId = demo.id;
      }
    }

    const status = await onboardingManager.getStatus({ existingProjectCount: starterProjectId ? 1 : (await storage.list()).length });
    return {
      ok: true,
      completed: state.completed,
      restartRequired,
      starterProjectId,
      status,
    };
  });

  app.post("/api/onboarding/skip", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    const { state } = await onboardingManager.complete({ skipped: true });
    return { ok: true, completed: state.completed };
  });

  app.post("/api/onboarding/reset", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    await onboardingManager.reset();
    return { ok: true, completed: false };
  });

  app.get("/api/projects", async () => {
    const projects = await storage.list();
    return { projects };
  });

  app.post("/api/projects", async (req, reply) => {
    const body = CreateProjectBodySchema.parse(req.body ?? {});
    const id = body.id ?? `proj_${Date.now()}`;
    const existing = await storage.get(id);
    if (existing) {
      return reply.status(409).send({ error: "conflict", message: `Project '${id}' already exists` });
    }

    const now = new Date().toISOString();
    let project: Project;
    if (body.template === "demo") {
      project = createDemoProject(id);
      if (body.name) project.name = body.name;
      project.canvas.aspectRatio = body.aspectRatio;
      project.canvas.resolution = body.resolution;
      project.canvas.fps = body.fps;
      project.exportSettings.aspectRatio = body.aspectRatio;
      project.exportSettings.resolution = body.resolution;
      project.exportSettings.fps = body.fps;
    } else {
      project = ProjectSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id,
        name: body.name ?? "Nuevo Proyecto Storia",
        createdAt: now,
        updatedAt: now,
        canvas: {
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          fps: body.fps,
        },
        scenes: [
          {
            id: "scene_01",
            name: "Escena 1",
            duration: 5,
            mood: "dusk",
            layers: [
              {
                id: "bg_01",
                type: "background",
                name: "Fondo",
                sourceType: "gradient",
                gradientTop: "#171d2e",
                gradientBottom: "#0a0d16",
                zIndex: 0,
                parallaxDepth: 0.8,
              },
            ],
          },
        ],
        exportSettings: {
          aspectRatio: body.aspectRatio,
          resolution: body.resolution,
          fps: body.fps,
        },
      });
    }

    const saved = await storage.save(project);
    return reply.status(201).send({ project: saved });
  });

  app.get("/api/projects/:id", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    return { project };
  });

  app.put("/api/projects/:id", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const incoming = ProjectSchema.parse({ ...(req.body as Record<string, unknown>), id });
    incoming.updatedAt = new Date().toISOString();
    const saved = await storage.save(incoming);
    broadcastProjectUpdate(saved, "api");
    return reply.status(200).send({ project: saved });
  });

  app.post("/api/projects/:id/operations", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const { operations, source } = ApplyOperationsBodySchema.parse(req.body);
    const { project: saved, receipt } = await storage.applyOperations(id, operations, source);
    broadcastProjectUpdate(saved, source, receipt);
    return reply.status(200).send({ project: saved, receipt });
  });

  app.post("/api/projects/:id/snapshots/:snapshotId/restore", async (req, reply) => {
    const { id, snapshotId } = z.object({ id: IdSchema, snapshotId: IdSchema }).parse(req.params);
    const restored = await storage.restoreSnapshot(id, snapshotId);
    if (!restored) {
      return reply.status(404).send({ error: "not_found", message: `Snapshot '${snapshotId}' not found` });
    }
    broadcastProjectUpdate(restored, "undo");
    return reply.status(200).send({ project: restored, restoredSnapshotId: snapshotId });
  });

  app.delete("/api/projects/:id", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const deleted = await storage.delete(id);
    if (!deleted) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    return reply.status(200).send({ deleted: true, id });
  });

  app.post("/api/projects/import-legacy", async (req, reply) => {
    const { id, manifest } = ImportLegacyBodySchema.parse(req.body);
    const converted = importLegacyStoriaManifest(manifest, id);
    const saved = await storage.save(converted);
    return reply.status(201).send({ project: saved });
  });

  // ============================================================================
  // PROJECT ASSETS (Upload & Static Serving)
  // ============================================================================

  app.get("/api/projects/:id/assets", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    return { assets: project.assets };
  });

  app.post("/api/projects/:id/assets", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = UploadAssetBodySchema.parse(req.body);
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const safeFile = sanitizeFilename(body.filename);
    if (isDisallowedUploadExtension(safeFile)) {
      return reply.status(400).send({
        error: "disallowed_file_type",
        message: "Executable or HTML file uploads are not permitted.",
      });
    }
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const fullPath = path.resolve(assetsDir, safeFile);
    if (!fullPath.startsWith(assetsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_filename", message: "Unsafe filename" });
    }

    const rawBase64 = body.base64.includes(",") ? body.base64.split(",")[1] ?? "" : body.base64;
    let buffer = Buffer.from(rawBase64, "base64");
    const ext = path.extname(safeFile).toLowerCase();
    const mimeType = body.mimeType ?? MIME_BY_EXT[ext] ?? "application/octet-stream";

    // Sanitize uploaded SVG markup to prevent stored XSS (<script>, foreignObject, on*, javascript:)
    if (ext === ".svg" || body.kind === "svg" || mimeType.toLowerCase().includes("svg")) {
      const cleanSvg = sanitizeSvgMarkup(buffer.toString("utf8"));
      buffer = Buffer.from(cleanSvg, "utf8");
    }
    await fs.writeFile(fullPath, buffer);
    const assetId = body.id ?? sanitizeId(`asset_${path.parse(safeFile).name}_${Date.now().toString(36)}`);
    const asset = {
      id: assetId,
      name: body.name,
      kind: body.kind,
      src: `/api/projects/${id}/assets/${encodeURIComponent(safeFile)}`,
      mimeType,
      width: body.width,
      height: body.height,
      durationSec: body.durationSec,
      scaleMode: body.kind === "pixel_art" ? ("nearest" as const) : body.scaleMode,
      tags: [],
      provenance: { source: "local" as const },
    };

    const { project: saved, receipt } = await storage.applyOperations(id, [{ op: "asset.upsert", asset }], "ui");
    broadcastProjectUpdate(saved, "ui", receipt);
    return reply.status(201).send({ asset, project: saved, receipt });
  });

  app.get("/api/projects/:id/assets/:filename", async (req, reply) => {
    const { id, filename } = z.object({
      id: IdSchema,
      filename: z.string().min(1).max(200),
    }).parse(req.params);

    const safeFile = path.basename(filename);
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    const fullPath = path.resolve(assetsDir, safeFile);
    if (!fullPath.startsWith(assetsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    try {
      const data = await fs.readFile(fullPath);
      const ext = path.extname(safeFile).toLowerCase();
      reply.header("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
      reply.header("X-Content-Type-Options", "nosniff");
      if (ext === ".svg") {
        reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
      reply.header("Cache-Control", ext === ".svg" ? "no-cache" : "public, max-age=3600");
      return reply.send(data);
    } catch {
      return reply.status(404).send({ error: "not_found", message: `Asset '${safeFile}' not found` });
    }
  });

  function sanitizeSvgMarkup(raw: string): string {
    const trimmed = raw.trim();
    if (!/<svg[\s>]/i.test(trimmed) || !/<\/svg>/i.test(trimmed)) {
      throw Object.assign(new Error("El código debe contener una etiqueta <svg>...</svg> válida."), {
        statusCode: 400,
      });
    }
    return trimmed
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      .replace(/(?:xlink:)?href\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
  }

  function resolveSvgAssetFilename(asset: { src: string; kind: string; mimeType?: string }): string | null {
    const cleanUrl = asset.src.split("?")[0] ?? "";
    const isSvg =
      asset.kind === "svg" ||
      asset.mimeType === "image/svg+xml" ||
      cleanUrl.toLowerCase().endsWith(".svg");
    if (!isSvg) return null;
    const match = cleanUrl.match(/\/assets\/([^/?#]+)$/);
    if (!match?.[1]) return null;
    try {
      return path.basename(decodeURIComponent(match[1]));
    } catch {
      return path.basename(match[1]);
    }
  }

  // Live SVG Code Editor: Read SVG source code of a project vector asset
  app.get("/api/projects/:id/assets/:assetId/svg", async (req, reply) => {
    const { id, assetId } = z.object({ id: IdSchema, assetId: IdSchema }).parse(req.params);
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) {
      return reply.status(404).send({ error: "asset_not_found", message: `Asset '${assetId}' not found` });
    }
    const filename = resolveSvgAssetFilename(asset);
    if (!filename) {
      return reply.status(400).send({
        error: "not_editable_svg",
        message: "Este recurso no es un archivo SVG local editable.",
      });
    }
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    const fullPath = path.resolve(assetsDir, filename);
    if (!fullPath.startsWith(assetsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    try {
      const svgCode = await fs.readFile(fullPath, "utf8");
      return reply.send({ asset, filename, svgCode, editable: true });
    } catch {
      return reply.status(404).send({ error: "file_not_found", message: `SVG file '${filename}' not found on disk` });
    }
  });

  // Live SVG Code Editor: Update SVG source (replace original or save as copy) + real-time WS broadcast
  app.put("/api/projects/:id/assets/:assetId/svg", async (req, reply) => {
    const { id, assetId } = z.object({ id: IdSchema, assetId: IdSchema }).parse(req.params);
    const body = z
      .object({
        svgCode: z.string().min(10).max(2_000_000),
        mode: z.enum(["replace", "copy"]).default("replace"),
        copyName: z.string().min(1).max(140).optional(),
        updateLayerRef: z
          .object({
            sceneId: IdSchema,
            layerId: IdSchema,
          })
          .optional(),
        requestSource: z.enum(["ui", "mcp", "api"]).default("ui"),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) {
      return reply.status(404).send({ error: "asset_not_found", message: `Asset '${assetId}' not found` });
    }
    const origFilename = resolveSvgAssetFilename(asset);
    if (!origFilename) {
      return reply.status(400).send({
        error: "not_editable_svg",
        message: "Este recurso no es un archivo SVG local editable.",
      });
    }

    const sanitizedSvg = sanitizeSvgMarkup(body.svgCode);
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const rev = Date.now().toString(36);

    if (body.mode === "copy") {
      const baseSlug = path.parse(origFilename).name.replace(/[^a-zA-Z0-9_-]+/g, "_");
      const copyFile = sanitizeFilename(`${baseSlug}_copy_${rev}.svg`);
      const fullPath = path.resolve(assetsDir, copyFile);
      if (!fullPath.startsWith(assetsDir + path.sep)) {
        return reply.status(400).send({ error: "invalid_path" });
      }
      await fs.writeFile(fullPath, sanitizedSvg, "utf8");

      const newAssetId = sanitizeId(`${asset.id}_copy_${rev.slice(-4)}`);
      const newAsset = {
        ...asset,
        id: newAssetId,
        name: body.copyName?.trim() || `${asset.name} (Copia SVG)`,
        kind: "svg" as const,
        mimeType: "image/svg+xml",
        src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(copyFile)}?v=${rev}`,
      };

      const ops: ProjectOperation[] = [{ op: "asset.upsert", asset: newAsset }];
      if (body.updateLayerRef) {
        const sc = project.scenes.find((s) => s.id === body.updateLayerRef!.sceneId);
        const lyr = sc?.layers.find((l) => l.id === body.updateLayerRef!.layerId);
        if (lyr) {
          if (lyr.type === "character") {
            ops.push({
              op: "layer.update",
              sceneId: body.updateLayerRef.sceneId,
              layerId: body.updateLayerRef.layerId,
              patch: { customSpriteAssetId: newAssetId },
            });
          } else if (lyr.type === "sprite" || lyr.type === "background" || lyr.type === "pip") {
            ops.push({
              op: "layer.update",
              sceneId: body.updateLayerRef.sceneId,
              layerId: body.updateLayerRef.layerId,
              patch: lyr.type === "background" ? { sourceType: "asset", assetId: newAssetId } : { assetId: newAssetId },
            });
          }
        }
      }

      const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
      broadcastProjectUpdate(saved, body.requestSource, receipt);
      broadcastToRoom(id, {
        type: "asset.svg_updated",
        projectId: id,
        assetId: newAssetId,
        mode: "copy",
        source: body.requestSource,
        asset: newAsset,
        svgCode: sanitizedSvg,
      });
      return reply.status(201).send({ asset: newAsset, svgCode: sanitizedSvg, mode: "copy", project: saved, receipt });
    }

    // Mode === "replace": overwrite existing SVG on disk & bust texture cache via ?v=rev
    const fullPath = path.resolve(assetsDir, origFilename);
    if (!fullPath.startsWith(assetsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    await fs.writeFile(fullPath, sanitizedSvg, "utf8");

    const cleanSrc = asset.src.split("?")[0]!;
    const updatedAsset = {
      ...asset,
      src: `${cleanSrc}?v=${rev}`,
    };
    const { project: saved, receipt } = await storage.applyOperations(
      id,
      [{ op: "asset.upsert", asset: updatedAsset }],
      body.requestSource,
    );
    broadcastProjectUpdate(saved, body.requestSource, receipt);
    broadcastToRoom(id, {
      type: "asset.svg_updated",
      projectId: id,
      assetId: updatedAsset.id,
      mode: "replace",
      source: body.requestSource,
      asset: updatedAsset,
      svgCode: sanitizedSvg,
    });
    return reply.status(200).send({ asset: updatedAsset, svgCode: sanitizedSvg, mode: "replace", project: saved, receipt });
  });

  // ============================================================================
  // EXPORTS (1:1 Playwright -> FFmpeg NVENC/CPU) & CAPTURE_FRAME
  // ============================================================================

  app.post("/api/projects/:id/exports", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = StartExportBodySchema.parse(req.body ?? {});
    const job = await exportManager.startExport(id, body.settings, {
      waitForCompletion: body.wait,
      outputName: body.outputName,
    });
    return reply.status(body.wait ? 200 : 202).send({ job });
  });

  app.get("/api/projects/:id/exports", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    const jobs = exportManager.listJobs(id);
    const files = await exportManager.listExportFiles(id);
    return { jobs, files };
  });

  app.get("/api/exports/:jobId", async (req, reply) => {
    const { jobId } = z.object({ jobId: IdSchema }).parse(req.params);
    const job = exportManager.getJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: "not_found", message: `Export job '${jobId}' not found` });
    }
    return { job };
  });

  app.post("/api/exports/:jobId/cancel", async (req, reply) => {
    const { jobId } = z.object({ jobId: IdSchema }).parse(req.params);
    const job = exportManager.cancelJob(jobId);
    if (!job) {
      return reply.status(404).send({ error: "not_found", message: `Export job '${jobId}' not found` });
    }
    return { job };
  });

  app.get("/api/projects/:id/exports/:filename", async (req, reply) => {
    const { id, filename } = z.object({
      id: IdSchema,
      filename: z.string().min(1).max(200),
    }).parse(req.params);

    const safeFile = path.basename(filename);
    const exportsDir = path.resolve(storage.rootDir, id, "exports");
    const fullPath = path.resolve(exportsDir, safeFile);
    if (!fullPath.startsWith(exportsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    try {
      const data = await fs.readFile(fullPath);
      const ext = path.extname(safeFile).toLowerCase();
      const safeDispName = safeFile.replace(/["\r\n\\]/g, "_");
      reply.header("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${safeDispName}"`);
      return reply.send(data);
    } catch {
      return reply.status(404).send({ error: "not_found", message: `Export file '${safeFile}' not found` });
    }
  });

  // Internal zero-overhead binary RGBA frame ingest for headless Chromium -> FFmpeg (strictly loopback-only)
  app.post("/api/internal/export-jobs/:jobId/frame", async (req, reply) => {
    if (!isLoopbackRemoteSocket(req)) {
      return reply.status(403).send({
        error: "loopback_only",
        message: "Internal frame ingest endpoint is strictly restricted to localhost.",
      });
    }
    const { jobId } = z.object({ jobId: IdSchema }).parse(req.params);
    const q = z.object({ index: z.coerce.number().int().min(0).optional() }).parse(req.query ?? {});
    const buf = req.body;
    if (!Buffer.isBuffer(buf)) {
      return reply.status(400).send({ error: "invalid_body", message: "Expected application/octet-stream RGBA buffer" });
    }
    await exportManager.ingestRgbaFrame(jobId, buf, q.index);
    return reply.status(204).send();
  });

  // Remotion Captions: Import SRT / WebVTT with optional TikTok rhythmic pagination
  app.post("/api/projects/:id/subtitles/import", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        content: z.string().min(1).max(2_000_000),
        format: z.enum(["auto", "srt", "vtt"]).optional().default("auto"),
        tiktokMode: z.boolean().optional().default(true),
        combineTokensWithinMs: z.number().min(250).max(8000).optional().default(1400),
        breakOnSilenceAfterMs: z.number().min(100).max(4000).optional().default(450),
        maxWordsPerPage: z.number().int().min(1).max(12).optional().default(4),
        replaceExisting: z.boolean().optional().default(true),
        requestSource: z.enum(["ui", "mcp", "cli", "system"]).optional().default("ui"),
      })
      .parse(req.body ?? {});

    const current = await storage.get(id);
    if (!current) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const parsed = importSubtitlesTextToCues(body.content, {
      format: body.format,
      tiktokMode: body.tiktokMode,
      combineTokensWithinMs: body.combineTokensWithinMs,
      breakOnSilenceAfterMs: body.breakOnSilenceAfterMs,
      maxWordsPerPage: body.maxWordsPerPage,
    });
    if (parsed.cues.length === 0) {
      return reply.status(400).send({
        error: "empty_subtitles",
        message: "No se encontraron subtítulos válidos en el texto SRT/VTT proporcionado.",
      });
    }

    const nextCues = body.replaceExisting
      ? parsed.cues
      : [...current.subtitles.cues, ...parsed.cues].sort((a, b) => a.start - b.start);

    const updated = ProjectSchema.parse({
      ...current,
      updatedAt: new Date().toISOString(),
      subtitles: {
        ...current.subtitles,
        enabled: true,
        cues: nextCues,
      },
    });
    await storage.save(updated);
    broadcastProjectUpdate(updated, body.requestSource);
    return reply.status(200).send({
      format: parsed.format,
      importedCount: parsed.cues.length,
      project: updated,
    });
  });

  // Remotion Captions: Re-paginate existing cues into rhythmic TikTok / Reels pages
  app.post("/api/projects/:id/subtitles/tiktok-rechunk", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        combineTokensWithinMs: z.number().min(250).max(8000).optional().default(1350),
        breakOnSilenceAfterMs: z.number().min(100).max(4000).optional().default(420),
        maxWordsPerPage: z.number().int().min(1).max(12).optional().default(3),
        requestSource: z.enum(["ui", "mcp", "cli", "system"]).optional().default("ui"),
      })
      .parse(req.body ?? {});

    const current = await storage.get(id);
    if (!current) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }
    if (current.subtitles.cues.length === 0) {
      return reply.status(400).send({
        error: "no_subtitles",
        message: "El proyecto aún no tiene subtítulos para re-paginar.",
      });
    }

    const rechunked = rechunkSubtitleCuesToTikTok(current.subtitles.cues, {
      combineTokensWithinMs: body.combineTokensWithinMs,
      breakOnSilenceAfterMs: body.breakOnSilenceAfterMs,
      maxWordsPerPage: body.maxWordsPerPage,
    });

    const updated = ProjectSchema.parse({
      ...current,
      updatedAt: new Date().toISOString(),
      subtitles: {
        ...current.subtitles,
        enabled: true,
        style: {
          ...current.subtitles.style,
          maxWordsPerWindow: body.maxWordsPerPage,
        },
        cues: rechunked,
      },
    });
    await storage.save(updated);
    broadcastProjectUpdate(updated, body.requestSource);
    return reply.status(200).send({
      pagesCount: rechunked.length,
      project: updated,
    });
  });

  // 1:1 PNG Frame Capture (used by QA and Phase 4 MCP capture_frame)
  app.post("/api/projects/:id/capture-frame", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = CaptureFrameBodySchema.parse(req.body ?? {});
    const res = await exportManager.captureFrame(id, {
      timeSec: body.timeSec,
      width: body.width,
      height: body.height,
      burnSubtitles: body.burnSubtitles,
    });
    if (body.format === "png") {
      reply.header("Content-Type", "image/png");
      return reply.send(res.pngBuffer);
    }
    return {
      projectId: res.projectId,
      timeSec: res.timeSec,
      width: res.width,
      height: res.height,
      sceneId: res.sceneId,
      sceneName: res.sceneName,
      pngDataUrl: res.pngDataUrl,
    };
  });

  // ============================================================================
  // INTEGRATED LIBRARIES (VECTORS: VIDEOS + WORKSPACE + ICONIFY + OPENVERSE)
  //                      (AUDIO:   OPENVERSE-SFX + LOCAL WORKSPACE & VIDEOS)
  // ============================================================================

  const VectorImportBodySchema = z.object({
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
      .default("videos"),
    category: z.string().max(48).optional(),
    license: z.string().max(120).optional(),
    author: z.string().max(120).optional(),
    sourceUrl: z.string().max(512).optional(),
    insertMode: z.enum(["asset_only", "sprite", "background"]).default("sprite"),
    sceneId: IdSchema.optional(),
    replaceLayerId: IdSchema.optional(),
    widthNorm: z.number().min(0.05).max(3).optional(),
    scaleMode: ScaleModeSchema.optional(),
    requestSource: z.enum(["ui", "mcp", "api"]).default("ui"),
  });

  const AudioImportBodySchema = z.object({
    itemId: z.string().min(1).optional(),
    remoteUrl: z.string().min(1).optional(),
    name: z.string().min(1).max(160),
    category: z.enum(["sfx", "music", "ambience"]).default("sfx"),
    source: z
      .enum(["openverse", "wikimedia", "internet_archive", "local_workspace", "local_videos", "local"])
      .default("openverse"),
    license: z.string().max(120).optional(),
    author: z.string().max(120).optional(),
    attribution: z.string().max(512).optional(),
    sourceUrl: z.string().max(512).optional(),
    durationSec: z.number().positive().optional(),
    insertToTimeline: z.boolean().default(true),
    startSec: z.number().min(0).default(0),
    trackId: IdSchema.optional(),
    replaceTrackId: IdSchema.optional(),
    replaceClipId: IdSchema.optional(),
    preserveClipDuration: z.boolean().default(false),
    requestSource: z.enum(["ui", "mcp", "api"]).default("ui"),
  });

  const LibraryTogglePatchSchema = z.object({
    enabled: z.record(z.string(), z.boolean()),
  });

  app.get("/api/libraries/catalog", async () => {
    return libraryManager.getLibrariesCatalog();
  });

  app.post("/api/libraries/config", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    const body = LibraryTogglePatchSchema.parse(req.body ?? {});
    return libraryManager.updateEnabledLibraries(body.enabled as Partial<Record<LibraryId, boolean>>);
  });

  app.get("/api/libraries/cache", async () => {
    return libraryManager.getCacheStats();
  });

  app.post("/api/libraries/cache/clear", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    return libraryManager.clearCache();
  });

  async function measureDirRecursive(dirPath: string): Promise<{ bytes: number; files: number }> {
    let bytes = 0;
    let files = 0;
    const walk = async (cur: string, depth: number): Promise<void> => {
      if (depth > 8) return;
      let entries;
      try {
        entries = await fs.readdir(cur, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          await walk(full, depth + 1);
        } else if (e.isFile()) {
          try {
            const st = await fs.stat(full);
            bytes += st.size;
            files += 1;
          } catch {
            // ignore transient files
          }
        }
      }
    };
    await walk(dirPath, 0);
    return { bytes, files };
  }

  app.get("/api/storage/stats", async () => {
    const [cacheStats, projectsAll, modelsStats, projectsList] = await Promise.all([
      libraryManager.getCacheStats(),
      measureDirRecursive(storage.rootDir),
      measureDirRecursive(ttsManager.modelsDir),
      storage.list(),
    ]);

    let exportsBytes = 0;
    let exportsCount = 0;
    for (const proj of projectsList) {
      const exp = await measureDirRecursive(path.join(storage.rootDir, proj.id, "exports"));
      exportsBytes += exp.bytes;
      exportsCount += exp.files;
    }

    const projectsOnlyBytes = Math.max(0, projectsAll.bytes - exportsBytes);
    const totalBytes = projectsAll.bytes + cacheStats.totalBytes + modelsStats.bytes;
    const info = getListeningInfo();

    return {
      totalBytes,
      projects: {
        bytes: projectsOnlyBytes,
        files: Math.max(0, projectsAll.files - exportsCount),
        count: projectsList.length,
        dir: storage.rootDir,
      },
      exports: {
        bytes: exportsBytes,
        files: exportsCount,
      },
      cache: cacheStats,
      models: {
        bytes: modelsStats.bytes,
        files: modelsStats.files,
        dir: ttsManager.modelsDir,
      },
      runtime: {
        uptimeSec: Math.round(process.uptime()),
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        cpuModel: os.cpus()[0]?.model ?? "CPU",
        cpus: os.cpus().length,
        freeMemGb: Number((os.freemem() / 1024 ** 3).toFixed(2)),
        totalMemGb: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
        listeningHost: info.listeningHost,
        listeningPort: info.listeningPort,
      },
    };
  });

  app.get("/api/libraries/vectors", async (req) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    return libraryManager.searchVectors({
      q: q.q,
      source: (q.source as "all" | VectorSource) ?? "all",
      category: (q.category as "all" | "backgrounds" | "sprites" | "overlays" | "icons") ?? "all",
      video: q.video,
      collection: q.collection,
      color: q.color,
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 36,
      refresh: q.refresh === "true",
    });
  });

  app.get("/api/libraries/vectors/preview", async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const { buffer, mimeType } = await libraryManager.fetchVectorSvgBytes({
      id: q.id,
      iconifyName: q.iconify,
      url: q.url,
      fallbackThumb: q.thumb,
      color: q.color,
    });
    reply.header("Content-Type", mimeType || "image/svg+xml; charset=utf-8");
    reply.header("X-Content-Type-Options", "nosniff");
    if (!mimeType || mimeType.toLowerCase().includes("svg")) {
      reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    reply.header("Cache-Control", "public, max-age=3600");
    return reply.send(buffer);
  });

  app.post("/api/projects/:id/libraries/vectors/import", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = VectorImportBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const fetched = await libraryManager.fetchVectorSvgBytes({
      id: body.itemId,
      iconifyName: body.iconifyName,
      url: body.remoteUrl,
      color: body.color,
    });

    const safeFile = sanitizeFilename(fetched.filename);
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    await fs.writeFile(path.join(assetsDir, safeFile), fetched.buffer);

    const isPixel = body.scaleMode === "nearest" || Boolean(body.iconifyName?.includes("pixel"));
    const assetId = sanitizeId(`vec_${path.parse(safeFile).name}_${Date.now().toString(36).slice(-4)}`);
    const provenanceSource =
      body.source === "openverse" || body.source === "wikimedia"
        ? ("openverse" as const)
        : body.source === "iconify" || body.source === "pixel_game_sprites" || body.source === "openmoji_props"
          ? ("svgrepo" as const)
          : body.source === "videos"
            ? ("imported_legacy" as const)
            : body.source === "svg_backgrounds"
              ? ("generated" as const)
              : ("local" as const);

    const asset = {
      id: assetId,
      name: body.name,
      kind: isPixel ? ("pixel_art" as const) : ("svg" as const),
      src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(safeFile)}`,
      mimeType: "image/svg+xml",
      scaleMode: isPixel ? ("nearest" as const) : (body.scaleMode ?? ("linear" as const)),
      tags: [body.source, ...(body.category ? [body.category] : [])],
      provenance: {
        source: provenanceSource,
        license: body.license,
        author: body.author,
        url: body.sourceUrl ?? fetched.sourceUrl,
      },
    };

    const ops: ProjectOperation[] = [{ op: "asset.upsert", asset }];
    let insertedLayerId: string | undefined;
    let targetSceneId: string | undefined;

    if (body.replaceLayerId && project.scenes.length > 0) {
      const targetScene =
        (body.sceneId ? project.scenes.find((s) => s.id === body.sceneId) : undefined) ??
        project.scenes.find((s) => s.layers.some((l) => l.id === body.replaceLayerId)) ??
        project.scenes[0]!;
      const existingLayer = targetScene.layers.find((l) => l.id === body.replaceLayerId);
      if (existingLayer) {
        targetSceneId = targetScene.id;
        insertedLayerId = existingLayer.id;
        if (existingLayer.type === "background") {
          ops.push({
            op: "layer.update",
            sceneId: targetScene.id,
            layerId: existingLayer.id,
            patch: {
              name: body.name,
              sourceType: "asset",
              assetId,
              scaleMode: asset.scaleMode,
              fit: "cover",
            },
          });
        } else if (existingLayer.type === "sprite") {
          ops.push({
            op: "layer.update",
            sceneId: targetScene.id,
            layerId: existingLayer.id,
            patch: {
              name: body.name,
              assetId,
              scaleMode: asset.scaleMode,
              pixelSnap: isPixel,
            },
          });
        } else if (existingLayer.type === "character") {
          ops.push({
            op: "layer.update",
            sceneId: targetScene.id,
            layerId: existingLayer.id,
            patch: {
              customSpriteAssetId: assetId,
              scaleMode: asset.scaleMode,
            },
          });
        }
      }
    } else if (body.insertMode !== "asset_only" && project.scenes.length > 0) {
      const targetScene =
        (body.sceneId ? project.scenes.find((s) => s.id === body.sceneId) : undefined) ?? project.scenes[0]!;
      targetSceneId = targetScene.id;

      if (body.insertMode === "background") {
        const existingBg = targetScene.layers.find((l) => l.type === "background");
        if (existingBg) {
          insertedLayerId = existingBg.id;
          ops.push({
            op: "layer.update",
            sceneId: targetScene.id,
            layerId: existingBg.id,
            patch: {
              name: body.name,
              sourceType: "asset",
              assetId,
              scaleMode: asset.scaleMode,
              fit: "cover",
            },
          });
        } else {
          insertedLayerId = sanitizeId(`bg_${Date.now().toString(36)}`);
          ops.push({
            op: "layer.add",
            sceneId: targetScene.id,
            layer: {
              id: insertedLayerId,
              type: "background",
              name: body.name,
              sourceType: "asset",
              assetId,
              color: "#121622",
              gradientTop: "#1a2036",
              gradientBottom: "#0a0d16",
              mood: targetScene.mood,
              seed: 1,
              fit: "cover",
              scaleMode: asset.scaleMode,
              driftX: 0,
              driftY: 0,
              start: 0,
              visible: true,
              locked: false,
              zIndex: 0,
              parallaxDepth: 0.8,
              blendMode: "normal",
              transform: {
                x: 0.5,
                y: 0.5,
                anchor: { x: 0.5, y: 0.5 },
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                opacity: 1,
                flipX: false,
                flipY: false,
              },
              keyframes: {},
            },
          });
        }
      } else {
        insertedLayerId = sanitizeId(`sp_${Date.now().toString(36)}`);
        const defaultWidth = body.widthNorm ?? (body.category === "icons" ? 0.28 : 0.44);
        ops.push({
          op: "layer.add",
          sceneId: targetScene.id,
          layer: {
            id: insertedLayerId,
            type: "sprite",
            name: body.name,
            assetId,
            widthNorm: defaultWidth,
            scaleMode: asset.scaleMode,
            pixelSnap: isPixel,
            bobAmplitude: 0,
            bobSpeed: 1.2,
            start: 0,
            visible: true,
            locked: false,
            zIndex: 20,
            parallaxDepth: 1.04,
            blendMode: "normal",
            transform: {
              x: 0.5,
              y: 0.5,
              anchor: { x: 0.5, y: 0.5 },
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              opacity: 1,
              flipX: false,
              flipY: false,
            },
            keyframes: {},
          },
        });
      }
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
    if (body.author || body.license) {
      await appendProjectCredit(
        path.resolve(storage.rootDir, id),
        `[Vector] ${safeFile}: "${body.name}"${body.author ? ` by ${body.author}` : ""} — ${body.license ?? body.source}${body.sourceUrl ? ` (${body.sourceUrl})` : ""}`,
      ).catch(() => {});
    }

    broadcastProjectUpdate(saved, body.requestSource, receipt);
    return reply.status(201).send({
      asset,
      insertedLayerId,
      sceneId: targetSceneId,
      project: saved,
      receipt,
    });
  });

  app.get("/api/libraries/audio", async (req) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    return libraryManager.searchAudio({
      q: q.q,
      source: (q.source as AudioSearchParams["source"]) ?? "openverse",
      category: (q.category as "all" | "sfx" | "music" | "ambience" | "psx") ?? "all",
      license: (q.license as "all" | "cc0" | "cc-by") ?? "all",
      duration: (q.duration as "all" | "short" | "medium" | "long") ?? "all",
      page: q.page ? Number(q.page) : 1,
      pageSize: q.pageSize ? Number(q.pageSize) : 20,
      refresh: q.refresh === "true",
    });
  });

  app.get("/api/libraries/audio/preview", async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const { buffer, mimeType } = await libraryManager.fetchAudioBytes({
      id: q.id,
      url: q.url,
    });
    const total = buffer.byteLength;
    const rangeHeader = req.headers.range;
    reply.header("Content-Type", mimeType);
    reply.header("Accept-Ranges", "bytes");
    reply.header("Cache-Control", "public, max-age=3600");

    if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader)) {
      const [startStr, endStr] = rangeHeader.replace(/^bytes=/i, "").split("-");
      const start = startStr ? Math.min(total - 1, Math.max(0, Number.parseInt(startStr, 10))) : 0;
      const end = endStr ? Math.min(total - 1, Math.max(start, Number.parseInt(endStr, 10))) : total - 1;
      const chunk = buffer.subarray(start, end + 1);
      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${total}`);
      reply.header("Content-Length", String(chunk.byteLength));
      return reply.send(chunk);
    }

    reply.header("Content-Length", String(total));
    return reply.send(buffer);
  });

  app.post("/api/projects/:id/libraries/audio/import", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = AudioImportBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const fetched = await libraryManager.fetchAudioBytes({
      id: body.itemId,
      url: body.remoteUrl,
    });

    const safeFile = sanitizeFilename(fetched.filename);
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const fullDiskPath = path.join(assetsDir, safeFile);
    await fs.writeFile(fullDiskPath, fetched.buffer);

    const probedDuration = (await probeAudioDurationSec(fullDiskPath)) ?? body.durationSec ?? 2.5;
    const assetId = sanitizeId(`aud_${path.parse(safeFile).name}_${Date.now().toString(36).slice(-4)}`);

    const asset = {
      id: assetId,
      name: body.name,
      kind: "audio" as const,
      src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(safeFile)}`,
      mimeType: fetched.mimeType,
      durationSec: probedDuration,
      scaleMode: "linear" as const,
      tags: [body.source, body.category],
      provenance: {
        source:
          body.source === "openverse" || body.source === "wikimedia" || body.source === "internet_archive"
            ? ("openverse" as const)
            : ("local" as const),
        license: body.license,
        author: body.author,
        url: body.sourceUrl ?? fetched.sourceUrl,
      },
    };

    const ops: ProjectOperation[] = [{ op: "asset.upsert", asset }];
    let insertedClipId: string | undefined;
    let targetTrackId: string | undefined;

    if (body.replaceTrackId && body.replaceClipId) {
      const existingTrack = project.audioTracks.find((t) => t.id === body.replaceTrackId);
      const existingClip = existingTrack?.clips.find((c) => c.id === body.replaceClipId);
      if (existingTrack && existingClip) {
        targetTrackId = existingTrack.id;
        insertedClipId = existingClip.id;
        ops.push({
          op: "audioClip.upsert",
          trackId: existingTrack.id,
          clip: {
            ...existingClip,
            name: body.name,
            assetId,
            trimStart: 0,
            duration: body.preserveClipDuration
              ? existingClip.duration
              : Number(Math.max(0.15, probedDuration).toFixed(3)),
          },
        });
      }
    } else if (body.insertToTimeline) {
      const desiredRole = body.category === "music" ? "music" : body.category === "ambience" ? "ambience" : "sfx";
      let track =
        (body.trackId ? project.audioTracks.find((t) => t.id === body.trackId) : undefined) ??
        project.audioTracks.find((t) => t.role === desiredRole);

      if (!track) {
        const newTrackId =
          desiredRole === "music" ? "track_music" : desiredRole === "ambience" ? "track_ambience" : "track_sfx";
        const voiceTrack = project.audioTracks.find((t) => t.role === "voice");
        track = {
          id: newTrackId,
          name: desiredRole === "music" ? "Música" : desiredRole === "ambience" ? "Ambiente" : "SFX",
          role: desiredRole,
          volume: desiredRole === "music" ? 0.22 : desiredRole === "ambience" ? 0.35 : 0.75,
          muted: false,
          solo: false,
          duckUnderTrackId: desiredRole === "music" ? voiceTrack?.id : undefined,
          duckAmountDb: -7,
          clips: [],
        };
        ops.push({ op: "audioTrack.upsert", track });
      }

      targetTrackId = track.id;
      insertedClipId = sanitizeId(`clip_${Date.now().toString(36)}`);
      ops.push({
        op: "audioClip.upsert",
        trackId: track.id,
        clip: {
          id: insertedClipId,
          name: body.name,
          assetId,
          start: Number(body.startSec.toFixed(3)),
          duration: Number(Math.max(0.15, probedDuration).toFixed(3)),
          trimStart: 0,
          gainDb: desiredRole === "sfx" ? -2 : 0,
          pan: 0,
          fadeIn: desiredRole === "music" ? 0.5 : 0.02,
          fadeOut: desiredRole === "music" ? 1.2 : 0.05,
          fadeCurve: "smooth",
          loop: desiredRole === "music",
        },
      });
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);

    const creditText =
      body.attribution ??
      `[Audio] ${safeFile}: "${body.name}"${body.author ? ` by ${body.author}` : ""} — ${body.license ?? body.source}${body.sourceUrl ? ` (${body.sourceUrl})` : ""}`;
    await appendProjectCredit(path.resolve(storage.rootDir, id), creditText).catch(() => {});

    broadcastProjectUpdate(saved, body.requestSource, receipt);
    return reply.status(201).send({
      asset,
      durationSec: probedDuration,
      insertedClipId,
      trackId: targetTrackId,
      project: saved,
      receipt,
    });
  });

  // ============================================================================
  // AUDIO AI & DSP TOOLS (WHISPER SUBTITLES, DENOISE, VOICE ENHANCE, NORMALIZE)
  // + CAPCUT TRANSITIONS WITH PROCEDURAL SFX
  // ============================================================================

  const TranscribeAudioBodySchema = z.object({
    trackId: IdSchema,
    clipId: IdSchema,
    language: z.string().max(16).default("es"),
    model: z.enum(["tiny", "base", "small", "medium"]).default("small"),
    replaceExisting: z.boolean().default(true),
  });

  const ProcessAudioBodySchema = z.object({
    trackId: IdSchema,
    clipId: IdSchema,
    action: z.enum(["denoise", "voice_enhance", "normalize", "trim_silence", "deess_warm", "fade_clean"]),
  });

  const ApplyTransitionBodySchema = z.object({
    sceneId: IdSchema.optional(),
    applyToAll: z.boolean().default(false),
    transition: TransitionConfigSchema,
    addSoundEffect: z.boolean().default(true),
  });

  function resolveAssetFilePath(projectId: string, src: string): string {
    const cleanSrc = (src.split(/[?#]/)[0] ?? src).trim();
    const match = cleanSrc.match(/\/assets\/([^/]+)$/);
    const fileName = match && match[1] ? decodeURIComponent(match[1]) : path.basename(cleanSrc);
    return path.resolve(storage.rootDir, projectId, "assets", path.basename(fileName));
  }

  app.post("/api/projects/:id/audio/transcribe", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = TranscribeAudioBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const track = project.audioTracks.find((t) => t.id === body.trackId);
    const clip = track?.clips.find((c) => c.id === body.clipId);
    if (!track || !clip) {
      return reply.status(404).send({ error: "not_found", message: "Audio clip not found" });
    }
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (!asset) {
      return reply.status(404).send({ error: "not_found", message: "Audio asset not found" });
    }

    const audioFilePath = resolveAssetFilePath(id, asset.src);
    const result = await transcribeAudioFileToCues({
      audioFilePath,
      language: body.language,
      model: body.model,
      clipStartOffsetSec: clip.start,
    });

    const ops: ProjectOperation[] = body.replaceExisting
      ? [{ op: "subtitle.replaceAllCues", cues: result.cues }]
      : result.cues.map((cue) => ({ op: "subtitle.upsertCue", cue }));

    const { project: saved, receipt } = await storage.applyOperations(id, ops, "ui");
    broadcastProjectUpdate(saved, "ui", receipt);
    return reply.status(200).send({
      language: result.language,
      cuesCount: result.cues.length,
      project: saved,
      receipt,
    });
  });

  app.post("/api/projects/:id/audio/process", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = ProcessAudioBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const track = project.audioTracks.find((t) => t.id === body.trackId);
    const clip = track?.clips.find((c) => c.id === body.clipId);
    if (!track || !clip) {
      return reply.status(404).send({ error: "not_found", message: "Audio clip not found" });
    }
    const asset = project.assets.find((a) => a.id === clip.assetId);
    if (!asset) {
      return reply.status(404).send({ error: "not_found", message: "Audio asset not found" });
    }

    const inputPath = resolveAssetFilePath(id, asset.src);
    const stem = path.parse(path.basename(inputPath)).name.replace(/[^a-zA-Z0-9_-]+/g, "_");
    const outFilename = sanitizeFilename(`${stem}_${body.action}_${Date.now().toString(36).slice(-4)}.wav`);
    const outPath = path.resolve(storage.rootDir, id, "assets", outFilename);

    const { durationSec } = await processAudioWithFfmpeg({
      inputPath,
      outPath,
      action: body.action as AudioProcessAction,
    });

    const newAssetId = sanitizeId(`aud_${body.action}_${Date.now().toString(36).slice(-5)}`);
    const actionLabelMap: Record<AudioProcessAction, string> = {
      denoise: "Sin Ruido",
      voice_enhance: "Voz Mejorada",
      normalize: "-16 LUFS",
      trim_silence: "Sin Silencios",
      deess_warm: "De-Ess Cálido",
      fade_clean: "Fade Limpio",
    };
    const newAsset = {
      id: newAssetId,
      name: `${asset.name} (${actionLabelMap[body.action]})`,
      kind: "audio" as const,
      src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(outFilename)}`,
      mimeType: "audio/wav",
      durationSec,
      scaleMode: "linear" as const,
      tags: ["processed", body.action],
      provenance: { source: "local" as const },
    };

    const ops: ProjectOperation[] = [
      { op: "asset.upsert", asset: newAsset },
      {
        op: "audioClip.upsert",
        trackId: track.id,
        clip: {
          ...clip,
          assetId: newAssetId,
          duration: Number(Math.max(0.15, durationSec).toFixed(3)),
          trimStart: 0,
        },
      },
    ];

    const { project: saved, receipt } = await storage.applyOperations(id, ops, "ui");
    broadcastProjectUpdate(saved, "ui", receipt);
    return reply.status(200).send({
      asset: newAsset,
      durationSec,
      project: saved,
      receipt,
    });
  });

  app.post("/api/projects/:id/transitions/apply", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = ApplyTransitionBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const ops: ProjectOperation[] = [];
    const targetScenes: { sceneId: string; prevSceneId?: string; cutTimeSec: number }[] = [];

    let cursor = 0;
    project.scenes.forEach((sc, idx) => {
      const prevSceneId = idx > 0 ? project.scenes[idx - 1]!.id : undefined;
      if (body.applyToAll) {
        if (idx > 0) targetScenes.push({ sceneId: sc.id, prevSceneId, cutTimeSec: cursor });
      } else if (sc.id === body.sceneId) {
        targetScenes.push({ sceneId: sc.id, prevSceneId, cutTimeSec: cursor });
      }
      cursor += sc.duration;
    });

    if (targetScenes.length === 0) {
      return reply.status(400).send({ error: "invalid_target", message: "No target scene found for transition" });
    }

    let sfxAssetId = body.transition.sfxAssetId;
    let sfxDurationSec = 0.45;
    const preset = body.transition.sfxPreset;

    if (body.addSoundEffect && preset && preset !== "none" && body.transition.type !== "cut") {
      const sfxFilename = `trans_sfx_${preset}.wav`;
      const sfxDiskPath = path.resolve(storage.rootDir, id, "assets", sfxFilename);
      const { durationSec } = await synthesizeTransitionSfxWav(preset, sfxDiskPath);
      sfxDurationSec = durationSec;
      sfxAssetId = sanitizeId(`sfx_trans_${preset}`);
      ops.push({
        op: "asset.upsert",
        asset: {
          id: sfxAssetId,
          name: `Transición ${preset}`,
          kind: "audio",
          src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(sfxFilename)}`,
          mimeType: "audio/wav",
          durationSec,
          scaleMode: "linear",
          tags: ["transition-sfx", preset],
          provenance: { source: "generated" },
        },
      });
    }

    const finalTransition = {
      ...body.transition,
      duration: body.transition.type === "cut" ? 0 : body.transition.duration,
      ...(sfxAssetId && body.transition.type !== "cut" ? { sfxAssetId } : { sfxAssetId: undefined }),
    };
    if (body.applyToAll) {
      ops.push({ op: "scene.applyTransitionAll", transition: finalTransition });
    } else {
      const tgt = targetScenes[0]!;
      // Sync BOTH sides of an inter-scene cut: outgoing scene transitionOut + incoming scene transitionIn
      if (tgt.prevSceneId) {
        ops.push({
          op: "scene.update",
          sceneId: tgt.prevSceneId,
          patch: { transitionOut: finalTransition },
        });
      }
      ops.push({
        op: "scene.update",
        sceneId: tgt.sceneId,
        patch: { transitionIn: finalTransition },
      });
    }

    if (body.addSoundEffect && sfxAssetId && body.transition.type !== "cut") {
      let sfxTrack = project.audioTracks.find((t) => t.role === "sfx");
      if (!sfxTrack) {
        sfxTrack = {
          id: "track_sfx",
          name: "SFX",
          role: "sfx",
          volume: 0.8,
          muted: false,
          solo: false,
          duckAmountDb: -10,
          clips: [],
        };
        ops.push({ op: "audioTrack.upsert", track: sfxTrack });
      }
      const vol = body.transition.sfxVolume ?? 0.75;
      const gainDb = Math.max(-24, Math.min(6, Number((20 * Math.log10(Math.max(0.05, vol))).toFixed(1))));
      for (const tgt of targetScenes) {
        ops.push({
          op: "audioClip.upsert",
          trackId: sfxTrack.id,
          clip: {
            id: sanitizeId(`trans_sfx_clip_${tgt.sceneId}`),
            name: `SFX ${body.transition.type}`,
            assetId: sfxAssetId,
            start: Number(Math.max(0, tgt.cutTimeSec - Math.min(0.12, sfxDurationSec * 0.25)).toFixed(3)),
            duration: Number(Math.max(0.15, sfxDurationSec).toFixed(3)),
            trimStart: 0,
            gainDb,
            pan: 0,
            fadeIn: 0.01,
            fadeOut: 0.04,
            fadeCurve: "smooth",
            loop: false,
          },
        });
      }
    } else {
      // Clean up any previously generated transition SFX clip when switching to "cut" or disabling SFX
      const sfxTrack = project.audioTracks.find((t) => t.role === "sfx");
      if (sfxTrack) {
        for (const tgt of targetScenes) {
          const clipId = sanitizeId(`trans_sfx_clip_${tgt.sceneId}`);
          if (sfxTrack.clips.some((c) => c.id === clipId)) {
            ops.push({ op: "audioClip.remove", trackId: sfxTrack.id, clipId });
          }
        }
      }
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, "ui");
    broadcastProjectUpdate(saved, "ui", receipt);
    return reply.status(200).send({
      appliedCount: targetScenes.length,
      sfxAssetId,
      project: saved,
      receipt,
    });
  });

  // ============================================================================
  // MULTI-PROVIDER TEXT-TO-SPEECH (TTS) SUITE
  // (Windows SAPI, ElevenLabs, VoiceStudio, Piper, Kokoro, OpenAI, Custom API)
  // ============================================================================

  const TtsProviderSchema = z.enum([
    "windows_sapi",
    "elevenlabs",
    "voicestudio",
    "piper",
    "kokoro",
    "openai",
    "custom_api",
  ]);

  const TtsConfigPatchSchema = z.object({
    elevenlabsApiKey: z.string().max(256).optional(),
    elevenlabsModel: z.string().max(80).optional(),
    openaiApiKey: z.string().max(256).optional(),
    openaiBaseUrl: z.string().max(256).optional(),
    openaiModel: z.string().max(80).optional(),
    voiceStudioUrl: z.string().max(256).optional(),
    voiceStudioApiKey: z.string().max(256).optional(),
    customApiUrl: z.string().max(512).optional(),
    customApiHeaderName: z.string().max(80).optional(),
    customApiKey: z.string().max(256).optional(),
    customApiBodyTemplate: z.string().max(2000).optional(),
  });

  const TtsGenerateBodySchema = z.object({
    provider: TtsProviderSchema,
    text: z.string().min(1).max(8000),
    voiceId: z.string().max(160).optional(),
    language: z.string().max(24).default("es"),
    speed: z.number().min(0.5).max(2.0).default(1.0),
    modelId: z.string().max(80).optional(),
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    voiceStudioUrl: z.string().max(256).optional(),
    customApiUrl: z.string().max(512).optional(),
    clipName: z.string().max(120).optional(),
    insertToTimeline: z.boolean().default(true),
    startSec: z.number().min(0).default(0),
    trackId: IdSchema.optional(),
    replaceTrackId: IdSchema.optional(),
    replaceClipId: IdSchema.optional(),
    preserveClipDuration: z.boolean().default(false),
    autoSubtitles: z.boolean().default(false),
    requestSource: z.enum(["ui", "mcp", "api"]).default("ui"),
  });

  app.get("/api/tts/providers", async (req) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const admin = checkStrictLocalAdminRequest(req);
    const overview = await ttsManager.getProvidersOverview(q.refresh === "true");
    return {
      ...overview,
      security: {
        localAdminAllowed: admin.ok,
        ...(admin.ok ? {} : { reason: admin.reason }),
      },
    };
  });

  app.post("/api/tts/config", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const patch = TtsConfigPatchSchema.parse(req.body ?? {});
    const config = await ttsManager.updateConfig(patch);
    return { config };
  });

  app.get("/api/tts/voices", async (req) => {
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const provider = TtsProviderSchema.parse(q.provider ?? "windows_sapi") as TtsProviderId;
    return ttsManager.listVoices(provider, q.refresh === "true");
  });

  app.post("/api/tts/models/install", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const body = z
      .object({
        provider: z.enum(["piper", "kokoro"]),
        modelId: z.string().min(1).max(120),
      })
      .parse(req.body ?? {});
    return ttsManager.installLocalModel(body.provider, body.modelId);
  });

  app.post("/api/tts/preview", async (req, reply) => {
    const body = TtsGenerateBodySchema.pick({
      provider: true,
      text: true,
      voiceId: true,
      language: true,
      speed: true,
      modelId: true,
      stability: true,
      similarityBoost: true,
      style: true,
      voiceStudioUrl: true,
      customApiUrl: true,
    }).parse(req.body ?? {});

    // Never allow AI/MCP or remote callers to redirect stored TTS credentials via URL overrides
    const isAdmin = checkStrictLocalAdminRequest(req).ok && !isMcpAgentRequest(req);
    const safeReq = isAdmin
      ? body
      : { ...body, voiceStudioUrl: undefined, customApiUrl: undefined };

    const tmpOut = path.join(os.tmpdir(), `storia-tts-prev-${Date.now().toString(36)}.wav`);
    try {
      await ttsManager.synthesizeToWav(
        {
          ...safeReq,
          text: safeReq.text.slice(0, 320),
        },
        tmpOut,
      );
      const buf = await fs.readFile(tmpOut);
      reply.header("Content-Type", "audio/wav");
      reply.header("Content-Length", String(buf.byteLength));
      return reply.send(buf);
    } finally {
      await fs.rm(tmpOut, { force: true }).catch(() => {});
    }
  });

  app.post("/api/projects/:id/tts/generate", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = TtsGenerateBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const safeFile = sanitizeFilename(`tts_${body.provider}_${Date.now().toString(36)}.wav`);
    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const fullDiskPath = path.join(assetsDir, safeFile);

    const isAdmin = checkStrictLocalAdminRequest(req).ok && !isMcpAgentRequest(req);
    const safeBody = isAdmin
      ? body
      : { ...body, voiceStudioUrl: undefined, customApiUrl: undefined };

    const { durationSec, providerLabel } = await ttsManager.synthesizeToWav(safeBody, fullDiskPath);

    const assetId = sanitizeId(`tts_${body.provider}_${Date.now().toString(36).slice(-5)}`);
    const clipName = body.clipName?.trim() || `Voz (${body.provider})`;
    const asset = {
      id: assetId,
      name: clipName,
      kind: "audio" as const,
      src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(safeFile)}`,
      mimeType: "audio/wav",
      durationSec,
      scaleMode: "linear" as const,
      tags: ["tts", body.provider],
      provenance: {
        source: "generated" as const,
        author: providerLabel,
      },
    };

    const ops: ProjectOperation[] = [{ op: "asset.upsert", asset }];
    let insertedClipId: string | undefined;
    let targetTrackId: string | undefined;
    let effectiveStartSec = body.startSec;

    if (body.replaceTrackId && body.replaceClipId) {
      const existingTrack = project.audioTracks.find((t) => t.id === body.replaceTrackId);
      const existingClip = existingTrack?.clips.find((c) => c.id === body.replaceClipId);
      if (existingTrack && existingClip) {
        targetTrackId = existingTrack.id;
        insertedClipId = existingClip.id;
        effectiveStartSec = existingClip.start;
        ops.push({
          op: "audioClip.upsert",
          trackId: existingTrack.id,
          clip: {
            ...existingClip,
            name: clipName,
            assetId,
            trimStart: 0,
            duration: body.preserveClipDuration
              ? existingClip.duration
              : Number(Math.max(0.15, durationSec).toFixed(3)),
          },
        });
      }
    } else if (body.insertToTimeline) {
      let track =
        (body.trackId ? project.audioTracks.find((t) => t.id === body.trackId) : undefined) ??
        project.audioTracks.find((t) => t.role === "voice");

      if (!track) {
        track = {
          id: "track_voice",
          name: "Voz Principal",
          role: "voice",
          volume: 1,
          muted: false,
          solo: false,
          duckAmountDb: -10,
          clips: [],
        };
        ops.push({ op: "audioTrack.upsert", track });
      }
      targetTrackId = track.id;
      insertedClipId = sanitizeId(`clip_tts_${Date.now().toString(36)}`);
      ops.push({
        op: "audioClip.upsert",
        trackId: track.id,
        clip: {
          id: insertedClipId,
          name: clipName,
          assetId,
          start: Number(body.startSec.toFixed(3)),
          duration: Number(Math.max(0.15, durationSec).toFixed(3)),
          trimStart: 0,
          gainDb: 0,
          pan: 0,
          fadeIn: 0.02,
          fadeOut: 0.05,
          fadeCurve: "smooth",
          loop: false,
        },
      });
    }

    let cuesCount = 0;
    let subtitleWarning: string | undefined;
    if (body.autoSubtitles) {
      try {
        const asr = await transcribeAudioFileToCues({
          audioFilePath: fullDiskPath,
          language: body.language.slice(0, 2) || "es",
          model: "small",
          clipStartOffsetSec: effectiveStartSec,
        });
        cuesCount = asr.cues.length;
        ops.push({ op: "subtitle.replaceAllCues", cues: asr.cues });
      } catch (err) {
        subtitleWarning = `Audio generado, pero Whisper falló: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
    broadcastProjectUpdate(saved, body.requestSource, receipt);

    return reply.status(201).send({
      asset,
      durationSec,
      providerLabel,
      insertedClipId,
      trackId: targetTrackId,
      cuesCount,
      subtitleWarning,
      project: saved,
      receipt,
    });
  });

  const TtsFromSubtitlesBodySchema = z.object({
    provider: TtsProviderSchema,
    mode: z.enum(["grouped", "individual"]).default("grouped"),
    cueIds: z.array(IdSchema).optional(),
    voiceId: z.string().max(160).optional(),
    language: z.string().max(24).default("es"),
    speed: z.number().min(0.5).max(2.0).default(1.0),
    modelId: z.string().max(80).optional(),
    stability: z.number().min(0).max(1).optional(),
    similarityBoost: z.number().min(0).max(1).optional(),
    style: z.number().min(0).max(1).optional(),
    voiceStudioUrl: z.string().max(256).optional(),
    customApiUrl: z.string().max(512).optional(),
    clipName: z.string().max(120).optional(),
    trackId: IdSchema.optional(),
    replaceExistingVoiceClips: z.boolean().default(false),
    syncSubtitleTimings: z.boolean().default(true),
    autoSubtitles: z.boolean().default(false),
    minGapSec: z.number().min(0).max(2).default(0.06),
    requestSource: z.enum(["ui", "mcp", "api"]).default("ui"),
  });

  app.post("/api/projects/:id/tts/from-subtitles", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = TtsFromSubtitlesBodySchema.parse(req.body ?? {});
    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const allSortedCues = [...project.subtitles.cues].sort((a, b) => a.start - b.start);
    const filterSet = body.cueIds && body.cueIds.length > 0 ? new Set(body.cueIds) : null;
    const selectedCues = allSortedCues.filter((c) => c.text.trim().length > 0 && (!filterSet || filterSet.has(c.id)));
    if (selectedCues.length === 0) {
      return reply.status(400).send({
        error: "no_subtitles",
        message: "El proyecto no tiene subtítulos con texto para generar narración TTS.",
      });
    }

    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });

    const isAdmin = checkStrictLocalAdminRequest(req).ok && !isMcpAgentRequest(req);
    const baseSynthOpts = {
      provider: body.provider,
      voiceId: body.voiceId,
      language: body.language,
      speed: body.speed,
      modelId: body.modelId,
      stability: body.stability,
      similarityBoost: body.similarityBoost,
      style: body.style,
      voiceStudioUrl: isAdmin ? body.voiceStudioUrl : undefined,
      customApiUrl: isAdmin ? body.customApiUrl : undefined,
    };

    let targetTrack =
      (body.trackId ? project.audioTracks.find((t) => t.id === body.trackId) : undefined) ??
      project.audioTracks.find((t) => t.role === "voice");

    const ops: ProjectOperation[] = [];
    if (!targetTrack) {
      targetTrack = {
        id: "track_voice",
        name: "Voz Principal",
        role: "voice",
        volume: 1,
        muted: false,
        solo: false,
        duckAmountDb: -10,
        clips: [],
      };
      ops.push({ op: "audioTrack.upsert", track: targetTrack });
    } else if (body.replaceExistingVoiceClips) {
      for (const oldClip of targetTrack.clips) {
        ops.push({ op: "audioClip.remove", trackId: targetTrack.id, clipId: oldClip.id });
      }
    }

    const createdAssets: Project["assets"][number][] = [];
    const insertedClipIds: string[] = [];
    let totalDurationSec = 0;
    let providerLabel: string = body.provider;
    let cuesUpdated = 0;
    let subtitleWarning: string | undefined;

    if (body.mode === "grouped") {
      // Join all selected subtitle blocks into one continuous narration piece
      const joinedParts = selectedCues.map((c) => c.text.trim()).filter(Boolean);
      const fullText = joinedParts.join(" ").replace(/\s+/g, " ").trim();
      if (fullText.length > 8000) {
        return reply.status(400).send({
          error: "text_too_long",
          message: `El texto agrupado (${fullText.length} caracteres) supera el límite de 8000 caracteres. Usa el modo 'Individual' por subtítulo.`,
        });
      }

      const stamp = Date.now().toString(36);
      const safeFile = sanitizeFilename(`tts_subs_grouped_${body.provider}_${stamp}.wav`);
      const fullDiskPath = path.join(assetsDir, safeFile);
      const synth = await ttsManager.synthesizeToWav({ ...baseSynthOpts, text: fullText }, fullDiskPath);
      providerLabel = synth.providerLabel;
      totalDurationSec = synth.durationSec;

      const assetId = sanitizeId(`tts_subs_${body.provider}_${stamp.slice(-6)}`);
      const clipName = body.clipName?.trim() || `Narración subtítulos (${selectedCues.length} bloques)`;
      const asset = {
        id: assetId,
        name: clipName,
        kind: "audio" as const,
        src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(safeFile)}`,
        mimeType: "audio/wav",
        durationSec: synth.durationSec,
        scaleMode: "linear" as const,
        tags: ["tts", "from-subtitles", "grouped", body.provider],
        provenance: {
          source: "generated" as const,
          author: synth.providerLabel,
        },
      };
      createdAssets.push(asset);
      ops.push({ op: "asset.upsert", asset });

      const startSec = Number(Math.max(0, selectedCues[0]!.start).toFixed(3));
      const clipId = sanitizeId(`clip_tts_subs_${stamp}`);
      insertedClipIds.push(clipId);
      ops.push({
        op: "audioClip.upsert",
        trackId: targetTrack.id,
        clip: {
          id: clipId,
          name: clipName,
          assetId,
          start: startSec,
          duration: Number(Math.max(0.15, synth.durationSec).toFixed(3)),
          trimStart: 0,
          gainDb: 0,
          pan: 0,
          fadeIn: 0.02,
          fadeOut: 0.05,
          fadeCurve: "smooth",
          loop: false,
        },
      });

      if (body.autoSubtitles) {
        try {
          const asr = await transcribeAudioFileToCues({
            audioFilePath: fullDiskPath,
            language: body.language.slice(0, 2) || "es",
            model: "small",
            clipStartOffsetSec: startSec,
          });
          cuesUpdated = asr.cues.length;
          ops.push({ op: "subtitle.replaceAllCues", cues: asr.cues });
        } catch (err) {
          subtitleWarning = `Audio agrupado generado, pero Whisper falló al re-sincronizar: ${err instanceof Error ? err.message : String(err)}`;
        }
      }
    } else {
      // Individual mode: synthesize one dedicated WAV clip per subtitle cue
      let cursorSec = 0;
      const batchStamp = Date.now().toString(36).slice(-5);

      for (let idx = 0; idx < selectedCues.length; idx++) {
        const cue = selectedCues[idx]!;
        const cueText = cue.text.trim();
        const safeFile = sanitizeFilename(`tts_sub_${idx + 1}_${body.provider}_${batchStamp}.wav`);
        const fullDiskPath = path.join(assetsDir, safeFile);

        const synth = await ttsManager.synthesizeToWav({ ...baseSynthOpts, text: cueText }, fullDiskPath);
        providerLabel = synth.providerLabel;
        const clipDur = Number(Math.max(0.15, synth.durationSec).toFixed(3));
        totalDurationSec += clipDur;

        const clipStart = body.syncSubtitleTimings
          ? Number((idx === 0 ? Math.max(0, cue.start) : Math.max(cue.start, cursorSec + body.minGapSec)).toFixed(3))
          : Number(Math.max(0, cue.start).toFixed(3));
        const clipEnd = Number((clipStart + clipDur).toFixed(3));
        cursorSec = clipEnd;

        const shortPreview = cueText.length > 34 ? `${cueText.slice(0, 34).trim()}…` : cueText;
        const basePrefix = body.clipName?.trim() ? `${body.clipName.trim()} #${idx + 1}` : `Sub #${idx + 1}`;
        const clipName = `${basePrefix} · ${shortPreview}`.slice(0, 120);

        const assetId = sanitizeId(`tts_sub_${idx + 1}_${body.provider}_${batchStamp}`);
        const asset = {
          id: assetId,
          name: clipName,
          kind: "audio" as const,
          src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(safeFile)}`,
          mimeType: "audio/wav",
          durationSec: clipDur,
          scaleMode: "linear" as const,
          tags: ["tts", "from-subtitles", "individual", body.provider],
          provenance: {
            source: "generated" as const,
            author: synth.providerLabel,
          },
        };
        createdAssets.push(asset);
        ops.push({ op: "asset.upsert", asset });

        const clipId = sanitizeId(`clip_tts_sub_${idx + 1}_${batchStamp}`);
        insertedClipIds.push(clipId);
        ops.push({
          op: "audioClip.upsert",
          trackId: targetTrack.id,
          clip: {
            id: clipId,
            name: clipName,
            assetId,
            start: clipStart,
            duration: clipDur,
            trimStart: 0,
            gainDb: 0,
            pan: 0,
            fadeIn: 0.015,
            fadeOut: 0.03,
            fadeCurve: "smooth",
            loop: false,
          },
        });

        if (body.syncSubtitleTimings) {
          const oldStart = cue.start;
          const oldSpan = Math.max(0.05, cue.end - cue.start);
          let updatedWords = cue.words;
          if (cue.words.length > 0) {
            updatedWords = cue.words.map((w, wi) => {
              const relStart = Math.max(0, Math.min(1, (w.start - oldStart) / oldSpan));
              const relEnd = Math.max(relStart, Math.min(1, (w.end - oldStart) / oldSpan));
              const newWStart = Number((clipStart + relStart * clipDur).toFixed(3));
              const fallbackStep = clipDur / Math.max(1, cue.words.length);
              const rawWEnd =
                relEnd > relStart + 0.001
                  ? clipStart + relEnd * clipDur
                  : clipStart + (wi + 1) * fallbackStep;
              const newWEnd = Number(Math.min(clipEnd, Math.max(newWStart + 0.02, rawWEnd)).toFixed(3));
              return {
                ...w,
                start: newWStart,
                end: newWEnd,
              };
            });
          } else {
            const tokens = cueText.split(/\s+/).filter(Boolean);
            const step = clipDur / Math.max(1, tokens.length);
            updatedWords = tokens.map((tok, wi) => ({
              id: `${cue.id}_w_${wi + 1}`,
              text: tok,
              start: Number((clipStart + wi * step).toFixed(3)),
              end: Number((clipStart + (wi + 1) * step).toFixed(3)),
              emphasis: "normal" as const,
            }));
          }

          ops.push({
            op: "subtitle.upsertCue",
            cue: {
              ...cue,
              start: clipStart,
              end: clipEnd,
              words: updatedWords,
            },
          });
          cuesUpdated += 1;
        }
      }
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
    broadcastProjectUpdate(saved, body.requestSource, receipt);

    return reply.status(201).send({
      mode: body.mode,
      providerLabel,
      trackId: targetTrack.id,
      assets: createdAssets,
      insertedClipIds,
      clipsCreated: insertedClipIds.length,
      cuesProcessed: selectedCues.length,
      cuesUpdated,
      totalDurationSec: Number(totalDurationSec.toFixed(3)),
      subtitleWarning,
      project: saved,
      receipt,
    });
  });

  // ============================================================================
  // AI POWER TOOLS: MULTI-FRAME VISUAL PREVIEW, ASSET RASTER PREVIEW,
  // MP4 INSPECTOR, AUDIO/TTS ANALYZER & BENCHMARK, ASSET ENHANCER & REPLACER,
  // DEEP DEBUGGER & SYSTEM DIAGNOSTICS
  // ============================================================================

  // 1. Multi-frame video preview + optional labeled contact sheet (single Playwright session)
  app.post("/api/projects/:id/capture-frames-batch", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        mode: z.enum(["timestamps", "scene_midpoints", "scene_cuts", "even_grid"]).default("scene_midpoints"),
        timestamps: z.array(z.number().min(0)).max(12).optional(),
        count: z.number().int().min(1).max(12).default(6),
        width: z.number().int().min(64).max(1920).optional(),
        height: z.number().int().min(64).max(1920).optional(),
        burnSubtitles: z.boolean().default(true),
        contactSheet: z.boolean().default(true),
        columns: z.number().int().min(1).max(4).optional(),
        includeIndividualFrames: z.boolean().default(false),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) {
      return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });
    }

    const totalDur = Math.max(0.1, getProjectDuration(project));
    let resolvedTimes: number[] = [];

    if (body.timestamps && body.timestamps.length > 0 && body.mode === "timestamps") {
      resolvedTimes = body.timestamps.map((t) => Math.max(0, Math.min(totalDur - 0.02, t)));
    } else if (body.mode === "scene_midpoints") {
      let cursor = 0;
      for (const sc of project.scenes) {
        resolvedTimes.push(Number((cursor + Math.min(sc.duration * 0.5, Math.max(0.1, sc.duration - 0.1))).toFixed(2)));
        cursor += sc.duration;
      }
      if (resolvedTimes.length > body.count) {
        const picked: number[] = [];
        for (let i = 0; i < body.count; i++) {
          const idx = Math.round((i / Math.max(1, body.count - 1)) * (resolvedTimes.length - 1));
          picked.push(resolvedTimes[idx]!);
        }
        resolvedTimes = picked;
      }
    } else if (body.mode === "scene_cuts") {
      let cursor = 0;
      for (let i = 0; i < project.scenes.length; i++) {
        const sc = project.scenes[i]!;
        if (i > 0) {
          resolvedTimes.push(Number(Math.max(0, cursor - 0.12).toFixed(2)));
          resolvedTimes.push(Number(Math.min(totalDur - 0.02, cursor + 0.12).toFixed(2)));
        }
        cursor += sc.duration;
      }
      if (resolvedTimes.length === 0) resolvedTimes = [0, Number((totalDur * 0.5).toFixed(2))];
      resolvedTimes = resolvedTimes.slice(0, 12);
    } else {
      const n = Math.max(1, Math.min(12, body.count));
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0.5 : i / (n - 1);
        resolvedTimes.push(Number((u * Math.max(0, totalDur - 0.05)).toFixed(2)));
      }
    }

    // Default to crisp preview resolution scaled cleanly to aspect ratio
    const isPortrait = project.canvas.aspectRatio === "9:16";
    const isSquare = project.canvas.aspectRatio === "1:1";
    const defaultW = body.contactSheet ? (isPortrait ? 320 : isSquare ? 380 : 480) : isPortrait ? 540 : 640;
    const defaultH = body.contactSheet ? (isPortrait ? 568 : isSquare ? 380 : 270) : isPortrait ? 960 : 360;

    const captured = await exportManager.captureFramesBatch(id, {
      timestamps: resolvedTimes,
      width: body.width ?? defaultW,
      height: body.height ?? defaultH,
      burnSubtitles: body.burnSubtitles,
    });

    let sheet: { pngDataUrl: string; width: number; height: number } | null = null;
    if (body.contactSheet && captured.length > 0) {
      const composed = await composeContactSheetPng(
        captured.map((f) => ({
          pngDataUrl: f.pngDataUrl,
          label: `t=${f.timeSec.toFixed(2)}s`,
          sublabel: f.sceneName ?? f.sceneId ?? undefined,
        })),
        { columns: body.columns },
      );
      sheet = {
        pngDataUrl: composed.pngDataUrl,
        width: composed.width,
        height: composed.height,
      };
    }

    return {
      projectId: id,
      durationSec: Number(totalDur.toFixed(2)),
      mode: body.mode,
      contactSheet: sheet,
      frames: captured.map((f) => ({
        timeSec: f.timeSec,
        width: f.width,
        height: f.height,
        sceneId: f.sceneId,
        sceneName: f.sceneName,
        ...(body.includeIndividualFrames || !body.contactSheet ? { pngDataUrl: f.pngDataUrl } : {}),
      })),
    };
  });

  // 2. Visual PNG preview of any project asset (SVG, PNG, JPEG, WebP, pixel_art)
  app.post("/api/projects/:id/assets/:assetId/preview-png", async (req, reply) => {
    const { id, assetId } = z.object({ id: IdSchema, assetId: IdSchema }).parse(req.params);
    const body = z
      .object({
        maxSize: z.number().int().min(128).max(1600).default(640),
        background: z.enum(["checkerboard", "dark", "light", "transparent"]).default("checkerboard"),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });

    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return reply.status(404).send({ error: "not_found", message: `Asset '${assetId}' not found` });

    const filePath = resolveAssetFilePath(id, asset.src);
    const buf = await fs.readFile(filePath).catch(() => null);
    if (!buf) {
      return reply.status(404).send({ error: "asset_file_missing", message: `Asset file missing on disk: ${path.basename(filePath)}` });
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = asset.mimeType ?? MIME_BY_EXT[ext] ?? "image/png";
    if (!mimeType.startsWith("image/") && ext !== ".svg") {
      return reply.status(400).send({
        error: "not_visual_asset",
        message: `Asset '${assetId}' (${asset.kind}, ${mimeType}) is not a visual image/SVG asset.`,
      });
    }

    const rendered = await rasterizeVisualToPng({
      buffer: buf,
      mimeType: ext === ".svg" ? "image/svg+xml" : mimeType,
      maxSize: body.maxSize,
      background: body.background,
      pixelated: asset.kind === "pixel_art" || asset.scaleMode === "nearest",
    });

    return {
      projectId: id,
      assetId: asset.id,
      name: asset.name,
      kind: asset.kind,
      mimeType,
      fileSizeBytes: buf.byteLength,
      width: rendered.width,
      height: rendered.height,
      naturalWidth: rendered.naturalWidth,
      naturalHeight: rendered.naturalHeight,
      opaqueCoverageRatio: rendered.opaqueCoverageRatio,
      pngDataUrl: rendered.pngDataUrl,
    };
  });

  // 3. Visual PNG preview of any vector library item BEFORE importing into a project
  app.post("/api/libraries/vectors/preview-png", async (req, reply) => {
    const body = z
      .object({
        itemId: z.string().min(1).optional(),
        iconifyName: z.string().min(1).optional(),
        remoteUrl: z.string().min(1).optional(),
        color: z.string().max(32).optional(),
        maxSize: z.number().int().min(128).max(1600).default(512),
        background: z.enum(["checkerboard", "dark", "light", "transparent"]).default("checkerboard"),
        pixelated: z.boolean().default(false),
      })
      .parse(req.body ?? {});

    if (!body.itemId && !body.iconifyName && !body.remoteUrl) {
      return reply.status(400).send({
        error: "missing_target",
        message: "Provide itemId, iconifyName, or remoteUrl to preview a library visual.",
      });
    }

    const fetched = await libraryManager.fetchVectorSvgBytes({
      id: body.itemId,
      iconifyName: body.iconifyName,
      url: body.remoteUrl,
      color: body.color,
    });

    const rendered = await rasterizeVisualToPng({
      buffer: fetched.buffer,
      mimeType: fetched.mimeType || "image/svg+xml",
      maxSize: body.maxSize,
      background: body.background,
      pixelated: body.pixelated || Boolean(body.iconifyName?.includes("pixel")),
    });

    return {
      filename: fetched.filename,
      mimeType: fetched.mimeType,
      sourceBytes: fetched.buffer.byteLength,
      width: rendered.width,
      height: rendered.height,
      naturalWidth: rendered.naturalWidth,
      naturalHeight: rendered.naturalHeight,
      opaqueCoverageRatio: rendered.opaqueCoverageRatio,
      pngDataUrl: rendered.pngDataUrl,
    };
  });

  // 4. Inspect an exported MP4 file (ffprobe + ebur128 loudness + extracted PNG frames)
  app.post("/api/projects/:id/exports/inspect", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        filename: z.string().min(1).max(200).optional(),
        timestamps: z.array(z.number().min(0)).max(6).optional(),
        maxWidth: z.number().int().min(160).max(1080).default(480),
      })
      .parse(req.body ?? {});

    const exportsDir = path.resolve(storage.rootDir, id, "exports");
    let targetFile = body.filename ? path.basename(body.filename) : undefined;
    if (!targetFile) {
      const files = await fs.readdir(exportsDir).catch(() => []);
      const mp4s = files.filter((f) => f.toLowerCase().endsWith(".mp4"));
      if (mp4s.length === 0) {
        return reply.status(404).send({
          error: "no_exports",
          message: `Project '${id}' has no exported MP4 files yet. Run start_export first.`,
        });
      }
      const stats = await Promise.all(
        mp4s.map(async (f) => ({ f, mtime: (await fs.stat(path.join(exportsDir, f))).mtimeMs })),
      );
      stats.sort((a, b) => b.mtime - a.mtime);
      targetFile = stats[0]!.f;
    }

    const mp4Path = path.resolve(exportsDir, targetFile);
    if (!mp4Path.startsWith(exportsDir + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    try {
      await fs.access(mp4Path);
    } catch {
      return reply.status(404).send({ error: "not_found", message: `Export file '${targetFile}' not found` });
    }

    const inspection = await inspectMp4Video(mp4Path, {
      timestamps: body.timestamps,
      maxWidth: body.maxWidth,
    });
    return {
      projectId: id,
      filename: targetFile,
      ...inspection,
    };
  });

  // 5. Analyze project audio asset/clip or full voice + subtitle alignment
  app.post("/api/projects/:id/audio/analyze", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        assetId: IdSchema.optional(),
        trackId: IdSchema.optional(),
        clipId: IdSchema.optional(),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });

    const assetMap = new Map(project.assets.map((a) => [a.id, a]));
    const analyzed: {
      assetId: string;
      assetName: string;
      trackId?: string;
      clipId?: string;
      clipStartSec?: number;
      clipDurationSec?: number;
      report: Awaited<ReturnType<typeof analyzeAudioFile>>;
    }[] = [];

    const targets: { assetId: string; trackId?: string; clipId?: string; start?: number; duration?: number }[] = [];
    if (body.assetId) {
      targets.push({ assetId: body.assetId });
    } else if (body.trackId && body.clipId) {
      const tr = project.audioTracks.find((t) => t.id === body.trackId);
      const cl = tr?.clips.find((c) => c.id === body.clipId);
      if (!cl) return reply.status(404).send({ error: "not_found", message: "Audio clip not found" });
      targets.push({ assetId: cl.assetId, trackId: tr!.id, clipId: cl.id, start: cl.start, duration: cl.duration });
    } else {
      for (const tr of project.audioTracks) {
        for (const cl of tr.clips) {
          if (targets.length >= 12) break;
          targets.push({ assetId: cl.assetId, trackId: tr.id, clipId: cl.id, start: cl.start, duration: cl.duration });
        }
      }
    }

    const missingFiles: string[] = [];
    for (const tgt of targets) {
      const asset = assetMap.get(tgt.assetId);
      if (!asset) {
        missingFiles.push(tgt.assetId);
        continue;
      }
      const fp = resolveAssetFilePath(id, asset.src);
      try {
        await fs.access(fp);
        const report = await analyzeAudioFile(fp);
        analyzed.push({
          assetId: asset.id,
          assetName: asset.name,
          trackId: tgt.trackId,
          clipId: tgt.clipId,
          clipStartSec: tgt.start,
          clipDurationSec: tgt.duration,
          report,
        });
      } catch {
        missingFiles.push(asset.id);
      }
    }

    // Voice-to-subtitle pacing & sync diagnostics
    const voiceTracks = project.audioTracks.filter((t) => t.role === "voice");
    const voiceClips = voiceTracks.flatMap((t) => t.clips).sort((a, b) => a.start - b.start);
    const totalVoiceDurationSec = voiceClips.reduce((acc, c) => acc + c.duration, 0);
    const totalSubtitleWords = project.subtitles.cues.reduce(
      (acc, c) => acc + (c.words.length > 0 ? c.words.length : c.text.trim().split(/\s+/).filter(Boolean).length),
      0,
    );
    const speakingRateWpm =
      totalVoiceDurationSec > 0.2 ? Math.round((totalSubtitleWords / totalVoiceDurationSec) * 60) : null;

    const overlappingVoiceClips: { clipA: string; clipB: string; overlapSec: number }[] = [];
    for (let i = 1; i < voiceClips.length; i++) {
      const prev = voiceClips[i - 1]!;
      const cur = voiceClips[i]!;
      const overlap = prev.start + prev.duration - cur.start;
      if (overlap > 0.03) {
        overlappingVoiceClips.push({
          clipA: prev.id,
          clipB: cur.id,
          overlapSec: Number(overlap.toFixed(3)),
        });
      }
    }

    const voiceEndSec = voiceClips.length > 0 ? Math.max(...voiceClips.map((c) => c.start + c.duration)) : 0;
    const subEndSec =
      project.subtitles.cues.length > 0 ? Math.max(...project.subtitles.cues.map((c) => c.end)) : 0;
    const timelineDurationSec = Number(getProjectDuration(project).toFixed(2));

    return {
      projectId: id,
      timelineDurationSec,
      analyzedCount: analyzed.length,
      missingFiles,
      analyzed,
      voiceSubtitleSync: {
        voiceClipCount: voiceClips.length,
        totalVoiceDurationSec: Number(totalVoiceDurationSec.toFixed(2)),
        voiceEndSec: Number(voiceEndSec.toFixed(2)),
        subtitleCueCount: project.subtitles.cues.length,
        totalSubtitleWords,
        subtitleEndSec: Number(subEndSec.toFixed(2)),
        speakingRateWpm,
        voiceVsSubtitleEndDiffSec: Number((voiceEndSec - subEndSec).toFixed(2)),
        voiceExceedsTimeline: voiceEndSec > timelineDurationSec + 0.15,
        overlappingVoiceClips,
      },
    };
  });

  // 6. Benchmark / test a TTS provider & voice without polluting the project
  app.post("/api/tts/benchmark", async (req, reply) => {
    const body = z
      .object({
        provider: TtsProviderSchema.default("windows_sapi"),
        text: z
          .string()
          .min(1)
          .max(1200)
          .default("Hola, esta es una prueba rápida de voz y calidad de audio en Storia Studio."),
        voiceId: z.string().max(160).optional(),
        language: z.string().max(24).default("es"),
        speed: z.number().min(0.5).max(2.0).default(1.0),
        modelId: z.string().max(80).optional(),
      })
      .parse(req.body ?? {});

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-tts-bench-"));
    const wavPath = path.join(tmpDir, "bench.wav");
    try {
      const t0 = Date.now();
      const synth = await ttsManager.synthesizeToWav(
        {
          provider: body.provider,
          text: body.text,
          voiceId: body.voiceId,
          language: body.language,
          speed: body.speed,
          modelId: body.modelId,
        },
        wavPath,
      );
      const latencyMs = Date.now() - t0;
      const analysis = await analyzeAudioFile(wavPath);
      const words = body.text.trim().split(/\s+/).filter(Boolean).length;
      const wpm = analysis.durationSec > 0.1 ? Math.round((words / analysis.durationSec) * 60) : null;
      return {
        ok: true,
        provider: body.provider,
        providerLabel: synth.providerLabel,
        voiceId: body.voiceId ?? "(default)",
        language: body.language,
        speed: body.speed,
        latencyMs,
        wordsCount: words,
        speakingRateWpm: wpm,
        analysis,
      };
    } catch (err) {
      return reply.status(400).send({
        ok: false,
        provider: body.provider,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  // 7. Enhance an existing project asset (audio DSP, image/pixel-art filters, or SVG palette/stroke optimization)
  app.post("/api/projects/:id/assets/:assetId/enhance", async (req, reply) => {
    const { id, assetId } = z.object({ id: IdSchema, assetId: IdSchema }).parse(req.params);
    const body = z
      .object({
        mode: z.enum(["replace", "copy"]).default("replace"),
        copyName: z.string().min(1).max(160).optional(),
        // Audio options
        audioAction: z
          .enum(["denoise", "voice_enhance", "normalize", "trim_silence", "deess_warm", "fade_clean"])
          .optional(),
        // Image / pixel_art options
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
        // SVG options
        colorMap: z.record(z.string(), z.string()).optional(),
        strokeScale: z.number().min(0.1).max(10).optional(),
        ensureViewBox: z.boolean().default(true),
        minifySvg: z.boolean().default(false),
        returnPreview: z.boolean().default(true),
        requestSource: z.enum(["ui", "mcp", "api"]).default("mcp"),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });

    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return reply.status(404).send({ error: "not_found", message: `Asset '${assetId}' not found` });

    const inPath = resolveAssetFilePath(id, asset.src);
    try {
      await fs.access(inPath);
    } catch {
      return reply.status(404).send({ error: "asset_file_missing", message: `Asset file missing on disk` });
    }

    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    const stamp = Date.now().toString(36).slice(-5);
    const ops: ProjectOperation[] = [];

    // --- A. AUDIO ENHANCEMENT ---
    if (asset.kind === "audio" || body.audioAction) {
      const action = body.audioAction ?? "voice_enhance";
      const beforeStats = await analyzeAudioFile(inPath).catch(() => null);
      const outName = sanitizeFilename(`${path.parse(inPath).name}_${action}_${stamp}.wav`);
      const outPath = path.join(assetsDir, outName);
      const { durationSec } = await processAudioWithFfmpeg({
        inputPath: inPath,
        outPath,
        action: action as AudioProcessAction,
      });
      const afterStats = await analyzeAudioFile(outPath).catch(() => null);

      const newAssetId = body.mode === "copy" ? sanitizeId(`${asset.id}_${action}_${stamp}`) : asset.id;
      const newSrc = `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(outName)}?v=${Date.now()}`;
      const nextAsset = {
        ...asset,
        id: newAssetId,
        name: body.mode === "copy" ? (body.copyName?.trim() || `${asset.name} (${action})`) : asset.name,
        src: newSrc,
        mimeType: "audio/wav",
        durationSec,
      };
      ops.push({ op: "asset.upsert", asset: nextAsset });

      if (body.mode === "replace") {
        // Update clip durations if action changed length (e.g. trim_silence)
        for (const tr of project.audioTracks) {
          for (const cl of tr.clips) {
            if (cl.assetId === asset.id) {
              ops.push({
                op: "audioClip.upsert",
                trackId: tr.id,
                clip: { ...cl, duration: Number(Math.max(0.1, durationSec).toFixed(3)) },
              });
            }
          }
        }
      }

      const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
      broadcastProjectUpdate(saved, body.requestSource, receipt);
      return {
        kind: "audio",
        action,
        asset: nextAsset,
        before: beforeStats,
        after: afterStats,
        receipt,
      };
    }

    // --- B. SVG ENHANCEMENT ---
    if (asset.kind === "svg" || path.extname(inPath).toLowerCase() === ".svg") {
      const rawSvg = await fs.readFile(inPath, "utf8");
      const enhanced = enhanceSvgMarkup(rawSvg, {
        colorMap: body.colorMap,
        strokeScale: body.strokeScale,
        ensureViewBox: body.ensureViewBox,
        minify: body.minifySvg,
      });

      const outName =
        body.mode === "copy"
          ? sanitizeFilename(`${path.parse(inPath).name}_enh_${stamp}.svg`)
          : path.basename(inPath);
      const outPath = path.join(assetsDir, outName);
      await fs.writeFile(outPath, enhanced.svgCode, "utf8");

      const newAssetId = body.mode === "copy" ? sanitizeId(`${asset.id}_enh_${stamp}`) : asset.id;
      const newSrc = `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(outName)}?v=${Date.now()}`;
      const nextAsset = {
        ...asset,
        id: newAssetId,
        name: body.mode === "copy" ? (body.copyName?.trim() || `${asset.name} (Mejorado)`) : asset.name,
        src: newSrc,
      };
      ops.push({ op: "asset.upsert", asset: nextAsset });

      const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
      broadcastProjectUpdate(saved, body.requestSource, receipt);
      broadcastToRoom(id, {
        type: "svg.updated",
        projectId: id,
        assetId: nextAsset.id,
        src: nextAsset.src,
        svgCode: enhanced.svgCode,
        updatedAt: new Date().toISOString(),
      });

      let preview: Awaited<ReturnType<typeof rasterizeVisualToPng>> | null = null;
      if (body.returnPreview) {
        preview = await rasterizeVisualToPng({
          buffer: Buffer.from(enhanced.svgCode, "utf8"),
          mimeType: "image/svg+xml",
          maxSize: 512,
          background: "checkerboard",
        }).catch(() => null);
      }

      return {
        kind: "svg",
        replacements: enhanced.replacements,
        viewBox: enhanced.viewBox,
        bytes: Buffer.byteLength(enhanced.svgCode, "utf8"),
        asset: nextAsset,
        previewPngDataUrl: preview?.pngDataUrl,
        previewWidth: preview?.width,
        previewHeight: preview?.height,
        receipt,
      };
    }

    // --- C. IMAGE / PIXEL_ART ENHANCEMENT ---
    const imgAction: ImageEnhanceAction =
      body.imageAction ?? (asset.kind === "pixel_art" ? "upscale_pixel_nearest" : "sharpen");
    const outName = sanitizeFilename(`${path.parse(inPath).name}_${imgAction}_${stamp}.png`);
    const outPath = path.join(assetsDir, outName);
    const dims = await enhanceImageWithFfmpeg({
      inputPath: inPath,
      outPath,
      action: imgAction,
      scaleFactor: body.scaleFactor,
      width: body.width,
      height: body.height,
      chromaColor: body.chromaColor,
      chromaSimilarity: body.chromaSimilarity,
    });

    const newAssetId = body.mode === "copy" ? sanitizeId(`${asset.id}_${imgAction}_${stamp}`) : asset.id;
    const newSrc = `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(outName)}?v=${Date.now()}`;
    const nextAsset = {
      ...asset,
      id: newAssetId,
      name: body.mode === "copy" ? (body.copyName?.trim() || `${asset.name} (${imgAction})`) : asset.name,
      src: newSrc,
      mimeType: "image/png",
      width: dims.width || asset.width,
      height: dims.height || asset.height,
    };
    ops.push({ op: "asset.upsert", asset: nextAsset });

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
    broadcastProjectUpdate(saved, body.requestSource, receipt);

    let preview: Awaited<ReturnType<typeof rasterizeVisualToPng>> | null = null;
    if (body.returnPreview) {
      const outBuf = await fs.readFile(outPath);
      preview = await rasterizeVisualToPng({
        buffer: outBuf,
        mimeType: "image/png",
        maxSize: 512,
        background: "checkerboard",
        pixelated: asset.kind === "pixel_art" || asset.scaleMode === "nearest",
      }).catch(() => null);
    }

    return {
      kind: asset.kind,
      action: imgAction,
      width: dims.width,
      height: dims.height,
      asset: nextAsset,
      previewPngDataUrl: preview?.pngDataUrl,
      previewWidth: preview?.width,
      previewHeight: preview?.height,
      receipt,
    };
  });

  // 8. Unified Resource Replacer (replace an existing asset in-place or swap a layer/clip/character part)
  app.post("/api/projects/:id/assets/replace", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        /** Existing assetId to replace in-place (optional if replacing a specific layer/clip/characterPart with a new asset). */
        targetAssetId: IdSchema.optional(),
        targetSceneId: IdSchema.optional(),
        targetLayerId: IdSchema.optional(),
        targetTrackId: IdSchema.optional(),
        targetClipId: IdSchema.optional(),
        targetCharacterId: IdSchema.optional(),
        targetCharacterPart: z
          .enum(["fullBody", "head", "torso", "leftArm", "rightArm", "leftHand", "rightHand", "leftLeg", "rightLeg", "leftFoot", "rightFoot", "hat", "prop"])
          .optional(),
        targetHeadVariant: z.string().max(40).optional(),
        keepOriginalAssetId: z.boolean().default(true),
        preserveClipDuration: z.boolean().default(false),
        name: z.string().min(1).max(160).optional(),
        kind: AssetKindSchema.optional(),
        scaleMode: ScaleModeSchema.optional(),
        // Exactly one source:
        sourceType: z.enum(["base64", "svg_code", "vector_library", "audio_library", "tts"]),
        filename: z.string().min(1).max(200).optional(),
        base64: z.string().min(1).optional(),
        svgCode: z.string().min(10).max(2_000_000).optional(),
        libraryVector: z
          .object({
            source: z
              .enum(["videos", "workspace", "iconify", "openverse", "wikimedia", "pixel_game_sprites", "openmoji_props", "svg_backgrounds"])
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
        returnPreview: z.boolean().default(true),
        requestSource: z.enum(["ui", "mcp", "api"]).default("mcp"),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });

    const existingAsset = body.targetAssetId
      ? project.assets.find((a) => a.id === body.targetAssetId)
      : undefined;

    const assetsDir = path.resolve(storage.rootDir, id, "assets");
    await fs.mkdir(assetsDir, { recursive: true });
    const stamp = Date.now().toString(36).slice(-5);

    let outFilename = "";
    let outDiskPath = "";
    let resolvedKind = body.kind ?? existingAsset?.kind ?? "image";
    let mimeType = "application/octet-stream";
    let durationSec: number | undefined;
    let width: number | undefined;
    let height: number | undefined;
    let provenance: Project["assets"][number]["provenance"] = { source: "local" };
    let visualBufForPreview: Buffer | null = null;

    if (body.sourceType === "svg_code") {
      if (!body.svgCode) return reply.status(400).send({ error: "missing_svg", message: "svgCode is required" });
      const cleanSvg = sanitizeSvgMarkup(body.svgCode);
      outFilename = sanitizeFilename(body.filename ?? `replaced_${stamp}.svg`);
      if (!outFilename.toLowerCase().endsWith(".svg")) outFilename += ".svg";
      outDiskPath = path.join(assetsDir, outFilename);
      await fs.writeFile(outDiskPath, cleanSvg, "utf8");
      resolvedKind = "svg";
      mimeType = "image/svg+xml";
      provenance = { source: "generated" };
      visualBufForPreview = Buffer.from(cleanSvg, "utf8");
    } else if (body.sourceType === "base64") {
      if (!body.base64 || !body.filename) {
        return reply.status(400).send({ error: "missing_file", message: "base64 and filename are required" });
      }
      outFilename = sanitizeFilename(`${path.parse(body.filename).name}_${stamp}${path.extname(body.filename) || ".png"}`);
      if (isDisallowedUploadExtension(outFilename)) {
        return reply.status(400).send({ error: "disallowed_file_type", message: "Executable or HTML file uploads are not permitted." });
      }
      outDiskPath = path.join(assetsDir, outFilename);
      let rawBuf = Buffer.from(body.base64, "base64");
      const ext = path.extname(outFilename).toLowerCase();
      mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
      if (ext === ".svg" || body.kind === "svg" || mimeType.includes("svg")) {
        rawBuf = Buffer.from(sanitizeSvgMarkup(rawBuf.toString("utf8")), "utf8");
      }
      await fs.writeFile(outDiskPath, rawBuf);
      if (!body.kind && !existingAsset) {
        resolvedKind = ext === ".svg" ? "svg" : ext === ".wav" || ext === ".mp3" || ext === ".ogg" ? "audio" : "image";
      }
      if (resolvedKind === "audio") {
        durationSec = (await probeAudioDurationSec(outDiskPath)) ?? undefined;
      } else if (mimeType.startsWith("image/")) {
        visualBufForPreview = rawBuf;
        if (ext !== ".svg") {
          const d = await probeImageDimensions(outDiskPath);
          if (d) {
            width = d.width;
            height = d.height;
          }
        }
      }
    } else if (body.sourceType === "vector_library") {
      const lv = body.libraryVector;
      if (!lv) return reply.status(400).send({ error: "missing_vector_spec", message: "libraryVector is required" });
      const fetched = await libraryManager.fetchVectorSvgBytes({
        id: lv.itemId,
        iconifyName: lv.iconifyName,
        url: lv.remoteUrl,
        color: lv.color,
      });
      outFilename = sanitizeFilename(`${path.parse(fetched.filename).name}_${stamp}.svg`);
      outDiskPath = path.join(assetsDir, outFilename);
      await fs.writeFile(outDiskPath, fetched.buffer);
      resolvedKind = lv.iconifyName?.includes("pixel") ? "pixel_art" : "svg";
      mimeType = fetched.mimeType || "image/svg+xml";
      provenance = {
        source: lv.source === "openverse" || lv.source === "wikimedia" ? "openverse" : "svgrepo",
        author: lv.author,
        license: lv.license,
        url: lv.sourceUrl ?? lv.remoteUrl,
      };
      visualBufForPreview = fetched.buffer;
      await appendProjectCredit(
        path.resolve(storage.rootDir, id),
        `[Vector] ${outFilename}: "${body.name ?? outFilename}"${lv.author ? ` by ${lv.author}` : ""} — ${lv.license ?? lv.source}${lv.sourceUrl ?? lv.remoteUrl ? ` (${lv.sourceUrl ?? lv.remoteUrl})` : ""}`,
      ).catch(() => {});
    } else if (body.sourceType === "audio_library") {
      const la = body.libraryAudio;
      if (!la) return reply.status(400).send({ error: "missing_audio_spec", message: "libraryAudio is required" });
      const fetched = await libraryManager.fetchAudioBytes({
        id: la.itemId,
        url: la.remoteUrl,
      });
      const ext = path.extname(fetched.filename) || ".mp3";
      outFilename = sanitizeFilename(`${path.parse(fetched.filename).name}_${stamp}${ext}`);
      outDiskPath = path.join(assetsDir, outFilename);
      await fs.writeFile(outDiskPath, fetched.buffer);
      resolvedKind = "audio";
      mimeType = fetched.mimeType || MIME_BY_EXT[ext.toLowerCase()] || "audio/mpeg";
      durationSec = (await probeAudioDurationSec(outDiskPath)) ?? undefined;
      provenance = {
        source: la.source === "openverse" ? "openverse" : "local",
        author: la.author,
        license: la.license,
        url: la.sourceUrl ?? la.remoteUrl,
      };
      const replaceCredit =
        la.attribution ??
        `[Audio] ${outFilename}: "${body.name ?? outFilename}"${la.author ? ` by ${la.author}` : ""} — ${la.license ?? la.source}${la.sourceUrl ?? la.remoteUrl ? ` (${la.sourceUrl ?? la.remoteUrl})` : ""}`;
      await appendProjectCredit(path.resolve(storage.rootDir, id), replaceCredit).catch(() => {});
    } else if (body.sourceType === "tts") {
      const tSpec = body.tts;
      if (!tSpec) return reply.status(400).send({ error: "missing_tts_spec", message: "tts is required" });
      outFilename = sanitizeFilename(`tts_replace_${tSpec.provider}_${stamp}.wav`);
      outDiskPath = path.join(assetsDir, outFilename);
      const synth = await ttsManager.synthesizeToWav(tSpec, outDiskPath);
      resolvedKind = "audio";
      mimeType = "audio/wav";
      durationSec = synth.durationSec;
      provenance = { source: "generated", author: synth.providerLabel };
    }

    const effectiveAssetId =
      existingAsset && body.keepOriginalAssetId
        ? existingAsset.id
        : sanitizeId(`rep_${path.parse(outFilename).name.slice(0, 24)}_${stamp}`);

    const newAsset: Project["assets"][number] = {
      id: effectiveAssetId,
      name: body.name?.trim() || existingAsset?.name || path.parse(outFilename).name,
      kind: resolvedKind,
      src: `/api/projects/${encodeURIComponent(id)}/assets/${encodeURIComponent(outFilename)}?v=${Date.now()}`,
      mimeType,
      durationSec,
      width,
      height,
      scaleMode: body.scaleMode ?? (resolvedKind === "pixel_art" ? "nearest" : existingAsset?.scaleMode ?? "linear"),
      tags: existingAsset?.tags ?? ["replaced"],
      provenance,
    };

    const ops: ProjectOperation[] = [{ op: "asset.upsert", asset: newAsset }];
    const updatedReferences: string[] = [];

    // Update specific layer if targeted
    if (body.targetSceneId && body.targetLayerId) {
      const sc = project.scenes.find((s) => s.id === body.targetSceneId);
      const layer = sc?.layers.find((l) => l.id === body.targetLayerId);
      if (!layer) {
        return reply.status(404).send({ error: "not_found", message: `Layer '${body.targetLayerId}' not found` });
      }
      if (layer.type === "background") {
        ops.push({
          op: "layer.update",
          sceneId: sc!.id,
          layerId: layer.id,
          patch: { sourceType: "asset", assetId: newAsset.id, scaleMode: newAsset.scaleMode },
        });
      } else if (layer.type === "sprite" || layer.type === "pip") {
        ops.push({
          op: "layer.update",
          sceneId: sc!.id,
          layerId: layer.id,
          patch: { assetId: newAsset.id, scaleMode: newAsset.scaleMode },
        });
      } else if (layer.type === "character") {
        ops.push({
          op: "layer.update",
          sceneId: sc!.id,
          layerId: layer.id,
          patch: { customSpriteAssetId: newAsset.id, scaleMode: newAsset.scaleMode },
        });
      }
      updatedReferences.push(`layer:${sc!.id}/${layer.id}`);
    }

    // Update specific audio clip if targeted
    if (body.targetTrackId && body.targetClipId) {
      const tr = project.audioTracks.find((t) => t.id === body.targetTrackId);
      const cl = tr?.clips.find((c) => c.id === body.targetClipId);
      if (!cl) {
        return reply.status(404).send({ error: "not_found", message: `Audio clip '${body.targetClipId}' not found` });
      }
      ops.push({
        op: "audioClip.upsert",
        trackId: tr!.id,
        clip: {
          ...cl,
          assetId: newAsset.id,
          name: body.name?.trim() || cl.name,
          trimStart: 0,
          duration:
            body.preserveClipDuration || !durationSec
              ? cl.duration
              : Number(Math.max(0.15, durationSec).toFixed(3)),
        },
      });
      updatedReferences.push(`audioClip:${tr!.id}/${cl.id}`);
    }

    // Update specific character modular part / headVariant if targeted
    if (body.targetCharacterId && (body.targetCharacterPart || body.targetHeadVariant)) {
      const ch = project.cast.find((c) => c.id === body.targetCharacterId);
      if (!ch) {
        return reply.status(404).send({ error: "not_found", message: `Character '${body.targetCharacterId}' not found` });
      }
      const nextParts = { ...ch.parts };
      const partOverride = {
        assetId: newAsset.id,
        offsetX: 0,
        offsetY: 0,
        scale: 1,
        pivotX: 0.5,
        pivotY: 0.5,
        scaleMode: newAsset.scaleMode,
      };
      if (body.targetHeadVariant) {
        nextParts.headVariants = {
          ...(nextParts.headVariants ?? {}),
          [body.targetHeadVariant]: partOverride,
        };
        updatedReferences.push(`character:${ch.id}/headVariants.${body.targetHeadVariant}`);
      } else if (body.targetCharacterPart) {
        (nextParts as Record<string, unknown>)[body.targetCharacterPart] = partOverride;
        updatedReferences.push(`character:${ch.id}/parts.${body.targetCharacterPart}`);
      }
      const nextKind =
        body.targetCharacterPart === "fullBody" ? "full_sprite" : "modular_sprites";
      ops.push({
        op: "character.upsert",
        character: { ...ch, kind: nextKind, parts: nextParts },
      });
    }

    // If replacing an existing audio asset in-place without specific clip target, update clip durations cleanly
    if (existingAsset && body.keepOriginalAssetId && resolvedKind === "audio" && durationSec && !body.preserveClipDuration && !body.targetClipId) {
      for (const tr of project.audioTracks) {
        for (const cl of tr.clips) {
          if (cl.assetId === existingAsset.id) {
            ops.push({
              op: "audioClip.upsert",
              trackId: tr.id,
              clip: { ...cl, duration: Number(Math.max(0.15, durationSec).toFixed(3)) },
            });
            updatedReferences.push(`audioClip:${tr.id}/${cl.id}`);
          }
        }
      }
    }

    const { project: saved, receipt } = await storage.applyOperations(id, ops, body.requestSource);
    broadcastProjectUpdate(saved, body.requestSource, receipt);

    let preview: Awaited<ReturnType<typeof rasterizeVisualToPng>> | null = null;
    if (body.returnPreview && visualBufForPreview) {
      preview = await rasterizeVisualToPng({
        buffer: visualBufForPreview,
        mimeType,
        maxSize: 512,
        background: "checkerboard",
        pixelated: newAsset.scaleMode === "nearest",
      }).catch(() => null);
    }

    return {
      projectId: id,
      replacedInPlace: Boolean(existingAsset && body.keepOriginalAssetId),
      asset: newAsset,
      updatedReferences,
      previewPngDataUrl: preview?.pngDataUrl,
      previewWidth: preview?.width,
      previewHeight: preview?.height,
      receipt,
    };
  });

  // 9. Deep Project & Frame Debugger
  app.post("/api/projects/:id/debug", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const body = z
      .object({
        timestamp: z.number().min(0).optional(),
        checkDiskAssets: z.boolean().default(true),
      })
      .parse(req.body ?? {});

    const project = await storage.get(id);
    if (!project) return reply.status(404).send({ error: "not_found", message: `Project '${id}' not found` });

    const totalDurationSec = Number(getProjectDuration(project).toFixed(3));
    const snapshots = await storage.listSnapshots(id);

    // Build scene timing map & detect desynced inter-scene transitions
    let cursor = 0;
    const sceneTimeline: {
      index: number;
      id: string;
      name: string;
      startSec: number;
      endSec: number;
      durationSec: number;
      layerCount: number;
      transitionIn: string;
      transitionOut: string;
    }[] = [];
    const desyncedTransitions: {
      cutTimeSec: number;
      prevSceneId: string;
      prevTransitionOut: string;
      nextSceneId: string;
      nextTransitionIn: string;
    }[] = [];

    for (let i = 0; i < project.scenes.length; i++) {
      const sc = project.scenes[i]!;
      const startSec = Number(cursor.toFixed(3));
      const endSec = Number((cursor + sc.duration).toFixed(3));
      sceneTimeline.push({
        index: i,
        id: sc.id,
        name: sc.name,
        startSec,
        endSec,
        durationSec: sc.duration,
        layerCount: sc.layers.length,
        transitionIn: sc.transitionIn.type,
        transitionOut: sc.transitionOut.type,
      });
      if (i > 0) {
        const prev = project.scenes[i - 1]!;
        if (prev.transitionOut.type !== sc.transitionIn.type) {
          desyncedTransitions.push({
            cutTimeSec: startSec,
            prevSceneId: prev.id,
            prevTransitionOut: prev.transitionOut.type,
            nextSceneId: sc.id,
            nextTransitionIn: sc.transitionIn.type,
          });
        }
      }
      cursor += sc.duration;
    }

    // Track referenced assets vs orphan assets & disk file existence
    const referencedAssetIds = new Set<string>();
    for (const sc of project.scenes) {
      if (sc.transitionIn.sfxAssetId) referencedAssetIds.add(sc.transitionIn.sfxAssetId);
      if (sc.transitionOut.sfxAssetId) referencedAssetIds.add(sc.transitionOut.sfxAssetId);
      for (const l of sc.layers) {
        if ("assetId" in l && l.assetId) referencedAssetIds.add(l.assetId);
        if (l.type === "character") {
          if (l.customSpriteAssetId) referencedAssetIds.add(l.customSpriteAssetId);
          if (l.contactProp?.assetId) referencedAssetIds.add(l.contactProp.assetId);
        }
      }
    }
    for (const ch of project.cast) {
      const partValues = [
        ch.parts.fullBody,
        ch.parts.head,
        ch.parts.torso,
        ch.parts.leftArm,
        ch.parts.rightArm,
        ch.parts.leftHand,
        ch.parts.rightHand,
        ch.parts.leftLeg,
        ch.parts.rightLeg,
        ch.parts.leftFoot,
        ch.parts.rightFoot,
        ch.parts.hat,
        ch.parts.prop,
        ...Object.values(ch.parts.headVariants ?? {}),
      ];
      for (const p of partValues) {
        if (p?.assetId) referencedAssetIds.add(p.assetId);
      }
    }
    for (const tr of project.audioTracks) {
      for (const cl of tr.clips) referencedAssetIds.add(cl.assetId);
    }
    if (project.subtitles.style.fontAssetId) referencedAssetIds.add(project.subtitles.style.fontAssetId);

    const missingOnDisk: { assetId: string; name: string; kind: string; expectedFile: string }[] = [];
    const orphanAssets: { assetId: string; name: string; kind: string }[] = [];
    if (body.checkDiskAssets) {
      for (const a of project.assets) {
        if (!referencedAssetIds.has(a.id)) {
          orphanAssets.push({ assetId: a.id, name: a.name, kind: a.kind });
        }
        const fp = resolveAssetFilePath(id, a.src);
        try {
          await fs.access(fp);
        } catch {
          missingOnDisk.push({ assetId: a.id, name: a.name, kind: a.kind, expectedFile: path.basename(fp) });
        }
      }
    }

    // Evaluate exact state at requested timestamp
    let frameDebug: Record<string, unknown> | null = null;
    if (body.timestamp !== undefined) {
      const t = Math.max(0, Math.min(totalDurationSec, body.timestamp));
      const resolved = resolveSceneAtTime(project, t);
      const activeScene = resolved?.scene ?? null;
      const localTime = resolved?.localTime ?? 0;

      const activeLayers = (activeScene?.layers ?? [])
        .filter((l) => {
          if (!l.visible) return false;
          if (localTime < l.start) return false;
          if (l.duration !== undefined && localTime > l.start + l.duration) return false;
          return true;
        })
        .map((l) => ({
          id: l.id,
          name: l.name,
          type: l.type,
          zIndex: l.zIndex,
          x: l.transform.x,
          y: l.transform.y,
          scaleX: l.transform.scaleX,
          scaleY: l.transform.scaleY,
          opacity: l.transform.opacity,
          ...("assetId" in l && l.assetId ? { assetId: l.assetId } : {}),
          ...(l.type === "character" ? { characterId: l.characterId, pose: l.pose, expression: l.expression } : {}),
        }));

      const activeCue = project.subtitles.enabled
        ? project.subtitles.cues.find((c) => t >= c.start && t <= c.end) ?? null
        : null;
      const activeWord = activeCue?.words.find((w) => t >= w.start && t <= w.end) ?? null;

      const activeAudioClips = project.audioTracks.flatMap((tr) =>
        tr.muted
          ? []
          : tr.clips
              .filter((c) => t >= c.start && t <= c.start + c.duration)
              .map((c) => ({
                trackId: tr.id,
                role: tr.role,
                clipId: c.id,
                name: c.name,
                assetId: c.assetId,
                clipOffsetSec: Number((t - c.start).toFixed(3)),
                gainDb: c.gainDb,
                trackVolume: tr.volume,
              })),
      );

      const activeEffects = (project.effectClips ?? [])
        .filter((e) => e.enabled && t >= e.start && t <= e.start + e.duration)
        .map((e) => ({ id: e.id, name: e.name, effectType: e.effectType, intensity: e.intensity }));

      frameDebug = {
        timestampSec: Number(t.toFixed(3)),
        frameIndex: Math.round(t * project.canvas.fps),
        sceneId: activeScene?.id ?? null,
        sceneName: activeScene?.name ?? null,
        sceneLocalTimeSec: Number(localTime.toFixed(3)),
        camera: activeScene
          ? {
              x: activeScene.camera.x,
              y: activeScene.camera.y,
              zoom: activeScene.camera.zoom,
              rotation: activeScene.camera.rotation,
              framing: activeScene.camera.framing,
            }
          : null,
        activeLayers,
        activeSubtitle: activeCue
          ? { cueId: activeCue.id, text: activeCue.text, activeWord: activeWord?.text ?? null }
          : null,
        activeAudioClips,
        activeEffects,
      };
    }

    return {
      projectId: id,
      name: project.name,
      animationStyle: project.animationStyle,
      canvas: project.canvas,
      totalDurationSec,
      counts: {
        scenes: project.scenes.length,
        assets: project.assets.length,
        cast: project.cast.length,
        subtitleCues: project.subtitles.cues.length,
        audioTracks: project.audioTracks.length,
        audioClips: project.audioTracks.reduce((a, tr) => a + tr.clips.length, 0),
        effectClips: (project.effectClips ?? []).length,
        markers: (project.markers ?? []).length,
        snapshots: snapshots.length,
      },
      sceneTimeline,
      desyncedTransitions,
      missingOnDisk,
      orphanAssets,
      snapshots,
      frameDebug,
    };
  });

  // 10. Comprehensive System & Render Diagnostics / Self-Test
  app.post("/api/diagnostics/run", async (req) => {
    const body = z
      .object({
        checkPython: z.boolean().default(true),
        checkTts: z.boolean().default(true),
        checkLibraries: z.boolean().default(true),
        smokeRenderProjectId: IdSchema.optional(),
      })
      .parse(req.body ?? {});

    const [caps, pythonEnv, ttsOverview] = await Promise.all([
      getSystemCapabilities(false),
      body.checkPython ? checkPythonEnvironment() : Promise.resolve(null),
      body.checkTts ? ttsManager.getProvidersOverview(false) : Promise.resolve(null),
    ]);

    const libraries = body.checkLibraries ? await libraryManager.getLibrariesCatalog() : null;

    let smokeRender: {
      ok: boolean;
      projectId: string;
      latencyMs: number;
      width?: number;
      height?: number;
      bytes?: number;
      error?: string;
    } | null = null;

    if (body.smokeRenderProjectId) {
      const t0 = Date.now();
      try {
        const cap = await exportManager.captureFrame(body.smokeRenderProjectId, {
          timeSec: 0.2,
          width: 360,
          height: 640,
          burnSubtitles: true,
        });
        smokeRender = {
          ok: cap.pngBuffer.byteLength > 1000,
          projectId: body.smokeRenderProjectId,
          latencyMs: Date.now() - t0,
          width: cap.width,
          height: cap.height,
          bytes: cap.pngBuffer.byteLength,
        };
      } catch (err) {
        smokeRender = {
          ok: false,
          projectId: body.smokeRenderProjectId,
          latencyMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    return {
      ok: Boolean(caps.ffmpegVersion) && (smokeRender === null || smokeRender.ok),
      timestamp: new Date().toISOString(),
      capabilities: caps,
      python: pythonEnv,
      ttsProviders: ttsOverview
        ? ttsOverview.providers.map((p) => ({
            id: p.id,
            name: p.name,
            ready: p.ready,
            detail: p.detail,
          }))
        : null,
      librariesSummary: libraries
        ? libraries.libraries.map((l) => ({
            id: l.id,
            name: l.name,
            enabled: Boolean(libraries.enabled[l.id]),
            kind: l.kind,
          }))
        : null,
      smokeRender,
    };
  });

  // ============================================================================
  // STICKMAN VIDEO DIRECTOR: BUNDLED OFL FONTS, 18 STYLES, GUIDES & AUTO-DIRECTOR
  // ============================================================================

  app.get("/api/fonts", async () => {
    const fonts = await directorBridge.listBundledFonts();
    return {
      fonts: fonts.map(({ fullPath: _fp, ...rest }) => rest),
      count: fonts.length,
    };
  });

  app.get("/api/fonts/:filename", async (req, reply) => {
    const { filename } = z.object({ filename: z.string().min(1).max(120) }).parse(req.params);
    const fullPath = await directorBridge.resolveBundledFontPath(filename);
    if (!fullPath) {
      return reply.status(404).send({ error: "font_not_found", filename });
    }
    const ext = path.extname(fullPath).toLowerCase();
    const mime =
      ext === ".woff2" ? "font/woff2" : ext === ".otf" ? "font/otf" : "font/ttf";
    const buf = await fs.readFile(fullPath);
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.type(mime).send(buf);
  });

  app.get("/api/director/styles", async () => {
    const [fonts, guides, audioAssets, available] = await Promise.all([
      directorBridge.listBundledFonts(),
      directorBridge.listReferenceGuides(),
      directorBridge.ensureAudioLoaded(),
      directorBridge.isAvailable(),
    ]);
    return {
      available,
      styles: ANIMATION_STYLE_LIST,
      fonts: fonts.map(({ fullPath: _fp, ...rest }) => rest),
      guides,
      curatedAudioCount: audioAssets.length,
    };
  });

  app.get("/api/director/guides/:filename", async (req, reply) => {
    const { filename } = z.object({ filename: z.string().min(1).max(160) }).parse(req.params);
    const query = z.object({ maxChars: z.coerce.number().int().min(500).max(50000).optional() }).parse(req.query);
    const guide = await directorBridge.readReferenceGuide(filename, query.maxChars ?? 16000);
    if (!guide) {
      return reply.status(404).send({ error: "guide_not_found", filename });
    }
    return guide;
  });

  app.get("/api/director/audio/recommend", async (req) => {
    const query = z
      .object({
        style: z.string().max(48).default("B1"),
        beat: z.string().max(48).optional(),
        q: z.string().max(120).optional(),
        limit: z.coerce.number().int().min(1).max(20).optional().default(5),
      })
      .parse(req.query);

    const styleCode = /^B[1-9]$/i.test(query.style.trim())
      ? query.style.trim().toUpperCase()
      : getAnimationStylePreset(query.style).audioProfileCode;

    const rec = await directorBridge.recommendAudio({
      styleCode,
      beat: query.beat,
      query: query.q,
      limit: query.limit,
    });

    const serialize = (a: (typeof rec.music)[number]) => ({
      id: `sd_${a.id}`,
      rawId: a.id,
      title: a.title,
      kind: a.kind,
      category: a.category,
      durationSec: a.durationSec,
      author: a.author,
      license: a.licenseId,
      attribution: a.attribution,
      tags: a.tags,
      roles: a.roles,
      styleHints: a.styleHints,
      previewUrl: `/api/libraries/audio/preview?id=${encodeURIComponent(`sd_${a.id}`)}`,
    });

    return {
      ...rec,
      music: rec.music.map(serialize),
      sfx: rec.sfx.map(serialize),
    };
  });

  app.post("/api/projects/:id/director/assemble", async (req, reply) => {
    const { id } = z.object({ id: IdSchema }).parse(req.params);
    const input = DirectorAssembleRequestSchema.parse(req.body ?? {});
    const result = await assembleDirectedVideo({
      storage,
      directorBridge,
      ttsManager,
      projectId: id,
      input,
    });
    broadcastProjectUpdate(result.project, input.requestSource);
    return reply.status(200).send(result);
  });

  // ============================================================================
  // CONNECTIVITY, REMOTE / LAN ACCESS, NGROK & CLOUDFLARE TUNNELS + REMOTE /mcp
  // ============================================================================

  app.get("/api/connectivity", async (req) => {
    const q = z.object({ refresh: z.string().optional() }).parse(req.query);
    const admin = checkStrictLocalAdminRequest(req);
    const info = getListeningInfo();
    const status = await connectivityManager.getStatus({
      ...info,
      refreshBinaries: q.refresh === "true" || q.refresh === "1",
      includeAuthToken: admin.ok,
    });
    return {
      ...status,
      security: {
        localAdminAllowed: admin.ok,
        ...(admin.ok ? {} : { reason: admin.reason }),
      },
    };
  });

  app.post("/api/connectivity/config", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const body = z
      .object({
        accessMode: z.enum(["local", "lan"]).optional(),
        port: z.number().int().min(1024).max(65535).optional(),
        mcpHttpEnabled: z.boolean().optional(),
        mcpAuthEnabled: z.boolean().optional(),
        tunnelProvider: z.enum(["none", "ngrok", "cloudflare"]).optional(),
        tunnelAutoStart: z.boolean().optional(),
        ngrokAuthtoken: z.string().max(400).optional(),
        ngrokDomain: z.string().max(240).optional(),
        ngrokRegion: z.string().max(24).optional(),
        cloudflareMode: z.enum(["quick", "named_token"]).optional(),
        cloudflareTunnelToken: z.string().max(1200).optional(),
        cloudflarePersistentHostname: z.string().max(240).optional(),
      })
      .parse(req.body ?? {});

    await connectivityManager.updateConfig(body);
    return connectivityManager.getStatus({ ...getListeningInfo(), includeAuthToken: true });
  });

  app.post("/api/connectivity/token/rotate", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    await connectivityManager.rotateAuthToken();
    return connectivityManager.getStatus({ ...getListeningInfo(), includeAuthToken: true });
  });

  // Rotate independent mobile/tablet remote access link (immediately revokes all existing HttpOnly mobile sessions)
  app.post("/api/connectivity/mobile-link/rotate", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    await connectivityManager.rotateRemoteAccessCode();
    return connectivityManager.getStatus({ ...getListeningInfo(), includeAuthToken: true });
  });

  // 1-Click Secure Mobile/Tablet Tunnel Entry: validates `?code=...`, sets HttpOnly cookie, redirects to `/` (strips code from URL bar)
  app.get("/auth/remote", async (req, reply) => {
    const rl = rateLimiter.consume(`remote_magic:${getClientRateKey(req)}`, 20, 5 * 60 * 1000);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.status(429).send({
        error: "too_many_requests",
        message: "Demasiados intentos de acceso remoto. Espera unos minutos.",
      });
    }
    const q = (req.query ?? {}) as { code?: string };
    const code = typeof q.code === "string" ? q.code.trim() : "";
    const valid =
      (await connectivityManager.validateRemoteAccessCode(code)) ||
      (await connectivityManager.validateMcpBearer(undefined, code));
    reply.header("Cache-Control", "no-store");
    if (!valid) {
      return reply.redirect("/?remote_auth=invalid");
    }
    const { value, maxAgeSec } = await connectivityManager.createRemoteSessionCookieValue();
    reply.header("Set-Cookie", buildRemoteSessionCookieHeader(req, value, maxAgeSec));
    return reply.redirect("/");
  });

  // Manual Unlock Endpoint for Remote Studio UI overlay (sets HttpOnly cookie so <img>, <audio>, fetch & WS work)
  app.post("/api/auth/remote-unlock", async (req, reply) => {
    const rl = rateLimiter.consume(`remote_unlock:${getClientRateKey(req)}`, 20, 5 * 60 * 1000);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.status(429).send({
        error: "too_many_requests",
        message: "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.",
      });
    }
    const body = z.object({ token: z.string().min(4).max(300) }).parse(req.body ?? {});
    const candidate = body.token.trim();
    const valid =
      (await connectivityManager.validateRemoteAccessCode(candidate)) ||
      (await connectivityManager.validateMcpBearer(undefined, candidate));
    reply.header("Cache-Control", "no-store");
    if (!valid) {
      return reply.status(401).send({
        error: "invalid_remote_token",
        message: "Código o token de acceso inválido. Usa el enlace seguro para móvil desde tu PC.",
      });
    }
    const { value, maxAgeSec } = await connectivityManager.createRemoteSessionCookieValue();
    reply.header("Set-Cookie", buildRemoteSessionCookieHeader(req, value, maxAgeSec));
    return reply.status(200).send({ ok: true, authenticated: true });
  });

  app.post("/api/auth/remote-logout", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("Set-Cookie", buildRemoteSessionCookieHeader(req, "", 0));
    return reply.status(200).send({ ok: true });
  });

  app.post("/api/connectivity/tunnel/start", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const body = z
      .object({
        provider: z.enum(["ngrok", "cloudflare"]).optional(),
      })
      .parse(req.body ?? {});
    const info = getListeningInfo();
    const tunnel = await connectivityManager.startTunnel({
      provider: body.provider,
      targetPort: info.listeningPort,
    });
    const status = await connectivityManager.getStatus({ ...info, includeAuthToken: true });
    return { ...status, tunnel };
  });

  app.post("/api/connectivity/tunnel/stop", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    await connectivityManager.stopTunnel();
    return connectivityManager.getStatus({ ...getListeningInfo(), includeAuthToken: true });
  });

  app.post("/api/connectivity/tunnel/install", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const body = z.object({ provider: z.enum(["ngrok", "cloudflare"]) }).parse(req.body ?? {});
    const binary = await connectivityManager.installBinary(body.provider);
    const status = await connectivityManager.getStatus({
      ...getListeningInfo(),
      refreshBinaries: true,
      includeAuthToken: true,
    });
    return { ...status, installedBinary: binary };
  });

  app.get("/api/connectivity/ai-prompt", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({
        error: "local_admin_required",
        message: admin.reason,
      });
    }
    const q = z
      .object({
        harness: z
          .enum(["universal", "claude", "codex", "antigravity", "opencode", "cursor"])
          .optional()
          .default("universal"),
        mode: z.enum(["tunnel", "lan", "stdio"]).optional().default("tunnel"),
      })
      .parse(req.query);
    const info = getListeningInfo();
    return connectivityManager.buildAiIntegrationBundle({
      harness: q.harness as AiHarnessId,
      mode: q.mode as AiTransportMode,
      ...info,
    });
  });

  // Streamable HTTP MCP Endpoint (`/mcp`) for remote & LAN AI harnesses
  type McpHttpHandler = (
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody: unknown,
    serverBaseUrl: string,
  ) => Promise<void>;

  let cachedMcpHttpHandler: McpHttpHandler | null = null;
  const loadMcpHttpHandler = async (): Promise<McpHttpHandler> => {
    if (cachedMcpHttpHandler) return cachedMcpHttpHandler;
    const distPath = path.resolve(__dirname, "../../mcp/dist/http.js");
    const mod = (await import(pathToFileURL(distPath).href)) as {
      handleStoriaMcpHttpRequest: McpHttpHandler;
    };
    cachedMcpHttpHandler = mod.handleStoriaMcpHttpRequest;
    return cachedMcpHttpHandler;
  };

  // ============================================================================
  // OAUTH 2.1 + PKCE S256 & DISCOVERY (RFC 9728 / RFC 8414 / RFC 7591 / RFC 7009)
  // Enables secure remote connections from ChatGPT, Gemini, Claude web & Desktop
  // ============================================================================

  const getPublicOrigin = (req: { headers: Record<string, string | string[] | undefined> }): string =>
    resolvePublicBaseUrl(req.headers, getServerOrigin());

  const applyMcpCorsHeaders = (
    req: { headers: Record<string, string | string[] | undefined> },
    res: ServerResponse,
  ): void => {
    const origin = typeof req.headers.origin === "string" && req.headers.origin ? req.headers.origin : "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID, X-Storia-Client, ngrok-skip-browser-warning",
    );
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate");
  };

  const validateMcpAccess = async (
    authHeader?: string,
    queryToken?: string,
  ): Promise<boolean> => {
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpAuthEnabled) return true;
    if (await connectivityManager.validateMcpBearer(authHeader, queryToken)) return true;
    const oauthCheck = await mcpOAuth.validateAccessToken(authHeader);
    return oauthCheck.valid;
  };

  // Protected Resource Metadata (RFC 9728) — root & /mcp variants
  app.get("/.well-known/oauth-protected-resource", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return mcpOAuth.buildProtectedResourceMetadata(getPublicOrigin(req));
  });

  app.get("/.well-known/oauth-protected-resource/mcp", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    return mcpOAuth.buildProtectedResourceMetadata(getPublicOrigin(req));
  });

  // Authorization Server Metadata (RFC 8414 + OpenID fallback)
  const serveAuthServerMetadata = async (req: { headers: Record<string, string | string[] | undefined> }, reply: { header: (k: string, v: string) => void }) => {
    reply.header("Cache-Control", "no-store");
    return mcpOAuth.buildAuthorizationServerMetadata(getPublicOrigin(req));
  };
  app.get("/.well-known/oauth-authorization-server", serveAuthServerMetadata);
  app.get("/.well-known/oauth-authorization-server/mcp", serveAuthServerMetadata);
  app.get("/.well-known/openid-configuration", serveAuthServerMetadata);

  // Dynamic Client Registration (RFC 7591) with sliding-window rate limiting
  app.post("/oauth/register", async (req, reply) => {
    const rl = rateLimiter.consume(`oauth_reg:${getClientRateKey(req)}`, 20, 15 * 60 * 1000);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.status(429).send({
        error: "too_many_requests",
        error_description: "Too many client registration requests. Try again later.",
      });
    }
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpHttpEnabled) {
      return reply.status(503).send({ error: "temporarily_unavailable", error_description: "MCP HTTP endpoint is disabled." });
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const res = await mcpOAuth.registerClient(body);
    reply.header("Cache-Control", "no-store");
    return reply.status(res.statusCode).send(res.payload);
  });

  // Authorization Endpoint (GET consent screen + POST approve/deny)
  app.get("/oauth/authorize", async (req, reply) => {
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpHttpEnabled) {
      return reply.status(503).send({ error: "temporarily_unavailable", error_description: "MCP HTTP endpoint is disabled." });
    }
    const q = (req.query ?? {}) as Record<string, string | undefined>;
    const prepared = await mcpOAuth.prepareAuthorization(q);
    if (!prepared.ok) {
      if (prepared.redirectUrl) {
        return reply.redirect(prepared.redirectUrl);
      }
      return reply.status(prepared.statusCode).send({
        error: prepared.error,
        error_description: prepared.errorDescription,
      });
    }
    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "no-store");
    reply.header("X-Frame-Options", "DENY");
    return reply.send(
      mcpOAuth.renderConsentHtml(prepared.grant, {
        requireOwnerToken: cfg.mcpAuthEnabled,
      }),
    );
  });

  app.post("/oauth/authorize", async (req, reply) => {
    const rl = rateLimiter.consume(`oauth_auth:${getClientRateKey(req)}`, 20, 5 * 60 * 1000);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.status(429).send({
        error: "too_many_requests",
        error_description: "Too many authorization attempts. Try again in a few minutes.",
      });
    }
    const cfg = await connectivityManager.readConfig();
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, string | undefined>;
    const action = body.action === "deny" ? "deny" : "approve";
    const enteredToken = (body.access_token_pass ?? "").trim();
    const ownerTokenValid =
      !cfg.mcpAuthEnabled ||
      (enteredToken.length > 0 && (await connectivityManager.validateMcpBearer(undefined, enteredToken)));

    const result = mcpOAuth.completeAuthorization({
      grantId: body.grant_id ?? "",
      csrf: body.csrf ?? "",
      action,
      requireOwnerToken: cfg.mcpAuthEnabled,
      ownerTokenValid,
    });

    if (!result.ok) {
      if (result.retryGrant) {
        reply.header("Content-Type", "text/html; charset=utf-8");
        reply.header("Cache-Control", "no-store");
        return reply.status(result.statusCode).send(
          mcpOAuth.renderConsentHtml(result.retryGrant, {
            requireOwnerToken: cfg.mcpAuthEnabled,
            errorMessage: result.errorMessage,
          }),
        );
      }
      return reply.status(result.statusCode).send({
        error: "invalid_request",
        error_description: result.errorMessage,
      });
    }

    return reply.redirect(result.redirectUrl);
  });

  // Token Endpoint (authorization_code + PKCE S256 & refresh_token)
  app.post("/oauth/token", async (req, reply) => {
    const rl = rateLimiter.consume(`oauth_tok:${getClientRateKey(req)}`, 40, 5 * 60 * 1000);
    if (!rl.allowed) {
      reply.header("Retry-After", String(rl.retryAfterSec));
      return reply.status(429).send({
        error: "too_many_requests",
        error_description: "Too many token requests. Try again later.",
      });
    }
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpHttpEnabled) {
      return reply.status(503).send({ error: "temporarily_unavailable", error_description: "MCP HTTP endpoint is disabled." });
    }
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const res = await mcpOAuth.exchangeToken(body, req.headers.authorization);
    reply.header("Cache-Control", "no-store");
    reply.header("Pragma", "no-cache");
    return reply.status(res.statusCode).send(res.payload);
  });

  // Token Revocation Endpoint (RFC 7009)
  app.post("/oauth/revoke", async (req, reply) => {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const tok = typeof body.token === "string" ? body.token : undefined;
    await mcpOAuth.revokeToken(tok);
    return reply.status(200).send({ revoked: true });
  });

  // Local-admin OAuth status & revoke-all controls for Storia Studio UI
  app.get("/api/connectivity/oauth/status", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    return mcpOAuth.getSummary();
  });

  app.post("/api/connectivity/oauth/revoke-all", async (req, reply) => {
    const admin = checkStrictLocalAdminRequest(req);
    if (!admin.ok) {
      return reply.status(403).send({ error: "local_admin_required", message: admin.reason });
    }
    return mcpOAuth.revokeAll();
  });

  // Standard Streamable HTTP MCP Endpoint (`/mcp`): GET, POST, DELETE (+ OPTIONS via CORS)
  app.get("/mcp", async (req, reply) => {
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpHttpEnabled) {
      return reply.status(503).send({
        error: "mcp_http_disabled",
        message: "El endpoint MCP HTTP está desactivado en Configuración > Red Local (LAN).",
      });
    }

    const accept = String(req.headers.accept ?? "").toLowerCase();
    const wantsSse = accept.includes("text/event-stream");
    const query = req.query as { token?: string } | undefined;
    const baseUrl = getPublicOrigin(req);

    if (wantsSse) {
      const authOk = await validateMcpAccess(req.headers.authorization, query?.token);
      if (!authOk) {
        reply.header("WWW-Authenticate", mcpOAuth.buildWwwAuthenticateHeader(baseUrl));
        return reply.status(401).send({
          error: "unauthorized",
          message: "Unauthorized: complete OAuth 2.1 login or provide a valid Storia Studio Bearer token.",
        });
      }
      // Per MCP Streamable HTTP spec, stateless servers without standalone SSE MUST respond 405
      reply.header("Allow", "POST, DELETE, OPTIONS");
      return reply.status(405).send({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Method Not Allowed: this stateless MCP server handles JSON-RPC over POST /mcp.",
        },
        id: null,
      });
    }

    return reply.send({
      ok: true,
      server: "storia-studio-mcp",
      transport: "streamable-http",
      endpoint: "/mcp",
      authRequired: cfg.mcpAuthEnabled,
      oauthSupported: true,
      oauthProtectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
      oauthAuthorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
      hint: "Conecta ChatGPT, Gemini, Claude u otro cliente MCP compatible con Streamable HTTP mediante POST /mcp.",
    });
  });

  app.post("/mcp", async (req, reply) => {
    const cfg = await connectivityManager.readConfig();
    if (!cfg.mcpHttpEnabled) {
      return reply.status(503).send({
        jsonrpc: "2.0",
        error: { code: -32000, message: "MCP HTTP endpoint is disabled in Storia Studio Settings." },
        id: null,
      });
    }
    const query = req.query as { token?: string } | undefined;
    const baseUrl = getPublicOrigin(req);
    const authOk = await validateMcpAccess(req.headers.authorization, query?.token);
    if (!authOk) {
      const rl = rateLimiter.consume(`mcp_unauth:${getClientRateKey(req)}`, 30, 5 * 60 * 1000);
      if (!rl.allowed) {
        reply.header("Retry-After", String(rl.retryAfterSec));
        return reply.status(429).send({
          jsonrpc: "2.0",
          error: {
            code: -32001,
            message: "Too many unauthorized /mcp attempts. Try again later.",
          },
          id: null,
        });
      }
      reply.header("WWW-Authenticate", mcpOAuth.buildWwwAuthenticateHeader(baseUrl));
      return reply.status(401).send({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized: complete OAuth 2.1 login or provide a valid Storia Studio MCP Bearer token.",
        },
        id: null,
      });
    }

    try {
      const handler = await loadMcpHttpHandler();
      reply.hijack();
      applyMcpCorsHeaders(req, reply.raw);
      await handler(req.raw, reply.raw, req.body, getServerOrigin());
    } catch (err) {
      if (!reply.raw.headersSent) {
        return reply.status(500).send({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : "Failed to handle MCP HTTP request",
          },
          id: null,
        });
      }
    }
  });

  app.delete("/mcp", async (_req, reply) => {
    return reply.status(200).send({ ok: true, stateless: true });
  });

  // ============================================================================
  // LIVE WEBSOCKET ROOMS
  // ============================================================================

  app.get("/ws/projects/:id", { websocket: true }, async (socket, req) => {
    if (isRemoteTunnelRequest(req)) {
      const cfg = await connectivityManager.readConfig();
      if (cfg.mcpAuthEnabled) {
        const query = (req.query ?? {}) as { token?: string };
        const authOk =
          (await connectivityManager.validateRemoteSessionCookie(req.headers.cookie)) ||
          (await validateMcpAccess(req.headers.authorization, query.token));
        if (!authOk) {
          socket.close(1008, "Unauthorized remote WebSocket access");
          return;
        }
      }
    }
    const parsed = z.object({ id: IdSchema }).safeParse(req.params);
    if (!parsed.success) {
      socket.close(1008, "Invalid project ID");
      return;
    }
    const projectId = parsed.data.id;
    let room = rooms.get(projectId);
    if (!room) {
      room = new Set();
      rooms.set(projectId, room);
    }
    room.add(socket);

    const project = await storage.get(projectId);
    if (project) {
      socket.send(JSON.stringify({ type: "project.snapshot", projectId, project }));
    }

    socket.on("close", () => {
      room?.delete(socket);
      if (room && room.size === 0) rooms.delete(projectId);
    });
  });

  // ============================================================================
  // SELF-CONTAINED STUDIO & /render STATIC SERVING (from apps/studio/dist)
  // ============================================================================

  const serveStudioIndex = async (
    _req: unknown,
    reply: { status: (c: number) => { send: (v: unknown) => unknown }; header: (k: string, v: string) => void; send: (v: unknown) => unknown },
  ) => {
    const indexPath = path.join(studioDistDir, "index.html");
    try {
      const html = await fs.readFile(indexPath, "utf8");
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply.send(html);
    } catch {
      return reply.status(503).send({
        error: "studio_not_built",
        message: "Build @storia/studio (`pnpm build`) before running headless /render exports.",
      });
    }
  };

  app.get("/", serveStudioIndex);
  app.get("/render", serveStudioIndex);

  app.get("/assets/*", async (req, reply) => {
    const wildcard = (req.params as { "*": string })["*"] ?? "";
    const resolved = path.resolve(studioDistDir, "assets", wildcard);
    const assetsRoot = path.resolve(studioDistDir, "assets");
    if (!resolved.startsWith(assetsRoot + path.sep)) {
      return reply.status(400).send({ error: "invalid_path" });
    }
    try {
      const data = await fs.readFile(resolved);
      const ext = path.extname(resolved).toLowerCase();
      reply.header("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send(data);
    } catch {
      return reply.status(404).send({ error: "not_found" });
    }
  });

  return app;
}
