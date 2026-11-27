import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ExportSettings,
  ExportSettingsSchema,
  getProjectDuration,
  Project,
  resolveCanvasDimensions,
} from "@storia/schema";
import { getHeadlessBrowser } from "./chromium.js";
import {
  buildVideoFfmpegArgs,
  probeMediaFile,
  ProbeResult,
  renderMasteredAudioWav,
  ResolvedVideoCodec,
} from "./ffmpegBuilder.js";
import type { ProjectStorage } from "./storage.js";
import { generateSrt } from "./subtitlesExport.js";
import { getSystemCapabilities } from "./system.js";

export type ExportJobStatus =
  | "queued"
  | "mixing_audio"
  | "rendering_frames"
  | "finalizing"
  | "completed"
  | "failed"
  | "cancelled";

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
  codec: ResolvedVideoCodec;
  isGpu: boolean;
  fallbackReason?: string;
  concurrency: number;
  motionBlurSamples: number;
  shutterAngle: number;
  totalFrames: number;
  currentFrame: number;
  progress: number; // 0..1
  renderFps: number;
  etaSec: number | null;
  outputFilename?: string;
  outputPath?: string;
  downloadUrl?: string;
  srtFilename?: string;
  srtDownloadUrl?: string;
  probe?: ProbeResult;
  error?: string;
}

export interface ExportEventPayload {
  type: "export.progress" | "export.completed" | "export.failed";
  projectId: string;
  job: ExportJob;
}

export interface CaptureFrameOptions {
  timeSec: number;
  width?: number;
  height?: number;
  burnSubtitles?: boolean;
}

export interface CaptureFrameResult {
  projectId: string;
  timeSec: number;
  width: number;
  height: number;
  sceneId: string | null;
  sceneName: string | null;
  pngBuffer: Buffer;
  pngDataUrl: string;
}

interface ActivePipe {
  ffmpeg: ChildProcessWithoutNullStreams;
  expectedBytes: number;
  cancelled: boolean;
  stderrChunks: string[];
  nextFrameToWrite: number;
  pendingFrames: Map<number, Buffer>;
  flushChain: Promise<void>;
  maxPendingFrames: number;
  waiters: (() => void)[];
}

export function resolveExportConcurrency(requested: number, totalFrames: number): number {
  const autoDefault = Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));
  const desired = requested <= 0 ? autoDefault : Math.min(8, Math.max(1, Math.round(requested)));
  return Math.max(1, Math.min(desired, Math.max(1, totalFrames)));
}

export class ExportManager {
  private readonly jobs = new Map<string, ExportJob>();
  private readonly activePipes = new Map<string, ActivePipe>();

  constructor(
    private readonly storage: ProjectStorage,
    private readonly getServerOrigin: () => string,
    private readonly onEvent?: (evt: ExportEventPayload) => void,
  ) {}

  getJob(jobId: string): ExportJob | null {
    return this.jobs.get(jobId) ?? null;
  }

  listJobs(projectId?: string): ExportJob[] {
    const all = Array.from(this.jobs.values());
    const filtered = projectId ? all.filter((j) => j.projectId === projectId) : all;
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listExportFiles(projectId: string): Promise<{ filename: string; sizeBytes: number; modifiedAt: string; url: string }[]> {
    const exportsDir = path.resolve(this.storage.rootDir, projectId, "exports");
    try {
      const entries = await fs.readdir(exportsDir, { withFileTypes: true });
      const files: { filename: string; sizeBytes: number; modifiedAt: string; url: string }[] = [];
      for (const e of entries) {
        if (!e.isFile()) continue;
        if (!/\.(mp4|srt|vtt)$/i.test(e.name)) continue;
        const st = await fs.stat(path.join(exportsDir, e.name));
        files.push({
          filename: e.name,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
          url: `/api/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(e.name)}`,
        });
      }
      return files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    } catch {
      return [];
    }
  }

  cancelJob(jobId: string): ExportJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const pipe = this.activePipes.get(jobId);
    if (pipe) {
      pipe.cancelled = true;
      pipe.pendingFrames.clear();
      const ws = pipe.waiters.splice(0, pipe.waiters.length);
      ws.forEach((fn) => fn());
      try {
        pipe.ffmpeg.stdin.end();
        pipe.ffmpeg.kill("SIGTERM");
      } catch {
        // Ignore
      }
    }
    if (job.status === "queued" || job.status === "mixing_audio" || job.status === "rendering_frames" || job.status === "finalizing") {
      job.status = "cancelled";
      job.stageLabel = "Cancelado por el usuario";
      job.completedAt = new Date().toISOString();
      this.emit("export.failed", job);
    }
    return job;
  }

  /**
   * Called by the internal Fastify endpoint receiving raw RGBA frame bytes from Playwright.
   * Applies backpressure directly from FFmpeg stdin so RAM usage stays flat even at 4K.
   */
  /**
   * Called by the internal Fastify endpoint receiving raw RGBA frame bytes from Playwright.
   * Supports both sequential calls and parallel multi-worker calls (Remotion concurrency model):
   * frames arriving with `frameIndex` are reordered into strict 0..N-1 order before writing to
   * FFmpeg stdin with backpressure, keeping RAM strictly bounded even at 4K.
   */
  async ingestRgbaFrame(jobId: string, rgbaBuffer: Buffer, frameIndex?: number): Promise<void> {
    const pipe = this.activePipes.get(jobId);
    if (!pipe) {
      throw Object.assign(new Error(`No active export pipe for job '${jobId}'`), { statusCode: 404 });
    }
    if (pipe.cancelled) {
      throw Object.assign(new Error("Export job cancelled"), { statusCode: 409 });
    }
    if (rgbaBuffer.byteLength !== pipe.expectedBytes) {
      throw Object.assign(
        new Error(`Unexpected RGBA frame size: got ${rgbaBuffer.byteLength}, expected ${pipe.expectedBytes}`),
        { statusCode: 400 },
      );
    }

    if (frameIndex === undefined || !Number.isInteger(frameIndex) || frameIndex < 0) {
      const ok = pipe.ffmpeg.stdin.write(rgbaBuffer);
      if (!ok) {
        await once(pipe.ffmpeg.stdin, "drain");
      }
      return;
    }

    // Bound reorder buffer memory when a worker runs far ahead of `nextFrameToWrite`
    while (
      !pipe.cancelled &&
      frameIndex >= pipe.nextFrameToWrite + pipe.maxPendingFrames
    ) {
      await new Promise<void>((resolve) => pipe.waiters.push(resolve));
    }
    if (pipe.cancelled) {
      throw Object.assign(new Error("Export job cancelled"), { statusCode: 409 });
    }

    pipe.pendingFrames.set(frameIndex, rgbaBuffer);

    // Serialize flushing contiguous ready frames in strict order
    pipe.flushChain = pipe.flushChain.then(async () => {
      while (!pipe.cancelled && pipe.pendingFrames.has(pipe.nextFrameToWrite)) {
        const buf = pipe.pendingFrames.get(pipe.nextFrameToWrite)!;
        pipe.pendingFrames.delete(pipe.nextFrameToWrite);
        pipe.nextFrameToWrite++;
        const ok = pipe.ffmpeg.stdin.write(buf);
        if (!ok) {
          await once(pipe.ffmpeg.stdin, "drain");
        }
        // Wake any workers waiting on buffer window
        if (pipe.waiters.length > 0) {
          const toWake = pipe.waiters.splice(0, pipe.waiters.length);
          toWake.forEach((fn) => fn());
        }
      }
    });

    await pipe.flushChain;
  }

  async startExport(
    projectId: string,
    overrides?: Partial<ExportSettings>,
    options?: { waitForCompletion?: boolean; outputName?: string },
  ): Promise<ExportJob> {
    const project = await this.storage.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project '${projectId}' not found`), { statusCode: 404 });
    }

    const mergedSettings = ExportSettingsSchema.parse({
      ...project.exportSettings,
      ...(overrides ?? {}),
    });

    const caps = await getSystemCapabilities();
    const dims = resolveCanvasDimensions(mergedSettings);
    const fullDur = Math.max(0.1, getProjectDuration(project));
    const rangeStart = Math.max(0, Math.min(fullDur - 0.1, mergedSettings.startTimeSec ?? 0));
    const rangeEnd =
      mergedSettings.endTimeSec !== undefined
        ? Math.max(rangeStart + 0.1, Math.min(fullDur, mergedSettings.endTimeSec))
        : fullDur;
    const totalDur = Math.max(0.1, rangeEnd - rangeStart);
    const totalFrames = Math.max(1, Math.round(totalDur * mergedSettings.fps));
    const concurrency = resolveExportConcurrency(mergedSettings.concurrency ?? 0, totalFrames);
    const motionBlurSamples = Math.max(1, Math.min(16, mergedSettings.motionBlurSamples ?? 1));
    const shutterAngle = Math.max(0, Math.min(360, mergedSettings.shutterAngle ?? 180));

    const jobId = `exp_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 6)}`;
    const safePrefix = (options?.outputName ?? `${project.id}_${dims.width}x${dims.height}_${mergedSettings.fps}fps_${jobId.slice(-4)}`)
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/\.mp4$/i, "");
    const outputFilename = `${safePrefix}.mp4`;
    const exportsDir = path.resolve(this.storage.rootDir, project.id, "exports");
    await fs.mkdir(exportsDir, { recursive: true });
    const outputPath = path.join(exportsDir, outputFilename);

    const cmdPreview = buildVideoFfmpegArgs({
      settings: mergedSettings,
      caps,
      outputMp4Path: outputPath,
    });

    const job: ExportJob = {
      id: jobId,
      projectId: project.id,
      status: "queued",
      stageLabel: "En cola…",
      createdAt: new Date().toISOString(),
      settings: mergedSettings,
      width: dims.width,
      height: dims.height,
      fps: mergedSettings.fps,
      codec: cmdPreview.codec,
      isGpu: cmdPreview.isGpu,
      fallbackReason: cmdPreview.fallbackReason,
      concurrency,
      motionBlurSamples,
      shutterAngle,
      totalFrames,
      currentFrame: 0,
      progress: 0,
      renderFps: 0,
      etaSec: null,
      outputFilename,
      outputPath,
      downloadUrl: `/api/projects/${encodeURIComponent(project.id)}/exports/${encodeURIComponent(outputFilename)}`,
    };

    this.jobs.set(jobId, job);
    this.emit("export.progress", job);

    const runPromise = this.runExportJob(job, project, rangeStart, totalDur, exportsDir);
    if (options?.waitForCompletion) {
      await runPromise;
    } else {
      void runPromise;
    }

    return job;
  }

  private emit(type: ExportEventPayload["type"], job: ExportJob): void {
    this.onEvent?.({ type, projectId: job.projectId, job: { ...job } });
  }

  private async runExportJob(
    job: ExportJob,
    project: Project,
    rangeStartSec: number,
    totalDur: number,
    exportsDir: string,
  ): Promise<void> {
    const projectDir = path.resolve(this.storage.rootDir, project.id);
    const tmpAudioWav = path.join(exportsDir, `.${job.id}_audio.wav`);
    const origin = this.getServerOrigin();
    type PlaywrightPage = Awaited<ReturnType<Awaited<ReturnType<typeof getHeadlessBrowser>>["newPage"]>>;
    const workerPages: PlaywrightPage[] = [];
    let pipe: ActivePipe | null = null;

    try {
      job.startedAt = new Date().toISOString();

      // 1. Mix & master audio track (2-pass loudnorm or clean silent track)
      job.status = "mixing_audio";
      job.stageLabel = "Mezclando y masterizando audio (-16 LUFS)…";
      this.emit("export.progress", job);

      await renderMasteredAudioWav({
        project,
        projectDir,
        durationSec: totalDur,
        startOffsetSec: rangeStartSec,
        settings: job.settings,
        outWavPath: tmpAudioWav,
      });

      if ((job.status as ExportJobStatus) === "cancelled") return;

      // 2. Spawn FFmpeg encoder consuming raw RGBA video on stdin + mastered WAV audio
      const caps = await getSystemCapabilities();
      const spec = buildVideoFfmpegArgs({
        settings: job.settings,
        caps,
        outputMp4Path: job.outputPath!,
        audioWavPath: tmpAudioWav,
      });
      job.codec = spec.codec;
      job.isGpu = spec.isGpu;
      job.fallbackReason = spec.fallbackReason;

      const ffmpeg = spawn("ffmpeg", spec.args, { stdio: ["pipe", "pipe", "pipe"] });
      const stderrChunks: string[] = [];
      ffmpeg.stderr.on("data", (d: Buffer) => stderrChunks.push(d.toString("utf8")));

      const ffmpegExitPromise = new Promise<number>((resolve, reject) => {
        ffmpeg.once("error", reject);
        ffmpeg.once("close", (code) => resolve(code ?? -1));
      });

      const workerCount = Math.max(1, job.concurrency);
      pipe = {
        ffmpeg,
        expectedBytes: job.width * job.height * 4,
        cancelled: false,
        stderrChunks,
        nextFrameToWrite: 0,
        pendingFrames: new Map(),
        flushChain: Promise.resolve(),
        maxPendingFrames: Math.max(4, workerCount * 3),
        waiters: [],
      };
      this.activePipes.set(job.id, pipe);

      // 3. Launch N parallel headless Chromium workers on /render (Remotion multi-worker architecture)
      const blurTag = job.motionBlurSamples > 1 ? ` · Blur ${job.motionBlurSamples}x` : "";
      job.status = "rendering_frames";
      job.stageLabel = `Iniciando ${workerCount}× worker${workerCount > 1 ? "s" : ""} (${job.width}×${job.height} · ${job.codec}${blurTag})…`;
      this.emit("export.progress", job);

      const browser = await getHeadlessBrowser();
      const pageErrors: string[] = [];

      const createWorkerPage = async (): Promise<PlaywrightPage> => {
        const p = await browser.newPage({
          viewport: { width: Math.min(job.width, 1920), height: Math.min(job.height, 1920) },
          deviceScaleFactor: 1,
        });
        p.on("pageerror", (err) => pageErrors.push(err.message));
        await p.goto(`${origin}/render`, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await p.waitForFunction(
          () => Boolean((window as unknown as { __STORIA_RENDER_READY__?: boolean }).__STORIA_RENDER_READY__),
          undefined,
          { timeout: 20_000 },
        );
        await p.evaluate(
          async ({ w, h, baseUrl, proj }) => {
            const api = (window as unknown as {
              __STORIA_RENDER__: {
                init: (w: number, h: number, base: string) => Promise<unknown>;
                loadProject: (p: Project) => Promise<unknown>;
              };
            }).__STORIA_RENDER__;
            await api.init(w, h, baseUrl);
            await api.loadProject(proj);
          },
          { w: job.width, h: job.height, baseUrl: origin, proj: project },
        );
        return p;
      };

      const created = await Promise.all(Array.from({ length: workerCount }, () => createWorkerPage()));
      workerPages.push(...created);

      // 4. Parallel frame-rendering pool -> indexed RGBA ingest -> strictly ordered FFmpeg stdin
      const ingestBaseUrl = `${origin}/api/internal/export-jobs/${encodeURIComponent(job.id)}/frame`;
      const startMs = Date.now();
      let lastBroadcastMs = 0;
      let nextFrameToAssign = 0;
      let completedFrames = 0;

      const motionBlurArg =
        job.motionBlurSamples > 1 && job.shutterAngle > 0
          ? { samples: job.motionBlurSamples, shutterAngle: job.shutterAngle, fps: job.fps }
          : undefined;

      const runWorker = async (workerPage: PlaywrightPage): Promise<void> => {
        while (true) {
          if (pipe!.cancelled || (job.status as ExportJobStatus) === "cancelled") {
            throw new Error("Export cancelled");
          }
          const frameIdx = nextFrameToAssign++;
          if (frameIdx >= job.totalFrames) break;

          const timeSec = rangeStartSec + frameIdx / job.fps;
          const ingestUrl = `${ingestBaseUrl}?index=${frameIdx}`;

          await workerPage.evaluate(
            async ({ t, url, burn, mb }) => {
              const api = (window as unknown as {
                __STORIA_RENDER__: {
                  renderAndPostRgba: (
                    t: number,
                    u: string,
                    b: boolean,
                    mb?: { samples: number; shutterAngle: number; fps: number },
                  ) => Promise<unknown>;
                };
              }).__STORIA_RENDER__;
              await api.renderAndPostRgba(t, url, burn, mb);
            },
            { t: timeSec, url: ingestUrl, burn: job.settings.burnSubtitles, mb: motionBlurArg },
          );

          completedFrames++;
          job.currentFrame = completedFrames;
          job.progress = Number((completedFrames / job.totalFrames).toFixed(4));
          const elapsedSec = Math.max(0.05, (Date.now() - startMs) / 1000);
          job.renderFps = Number((completedFrames / elapsedSec).toFixed(1));
          job.etaSec =
            job.renderFps > 0 ? Math.max(0, Math.round((job.totalFrames - completedFrames) / job.renderFps)) : null;
          job.stageLabel = `Renderizando ${completedFrames} / ${job.totalFrames} frames (${job.renderFps} fps · ${workerCount}× workers · ${job.codec}${blurTag})`;

          const nowMs = Date.now();
          if (nowMs - lastBroadcastMs >= 200 || completedFrames === job.totalFrames) {
            lastBroadcastMs = nowMs;
            this.emit("export.progress", job);
          }
        }
      };

      await Promise.all(workerPages.map((wp) => runWorker(wp)));
      await pipe.flushChain;

      if (pageErrors.length > 0) {
        throw new Error(`Render harness page errors: ${pageErrors.join("; ")}`);
      }

      // 5. Close FFmpeg stdin and await final MP4 mux/faststart flush
      job.status = "finalizing";
      job.stageLabel = "Finalizando MP4 (+faststart) y verificando con ffprobe…";
      this.emit("export.progress", job);

      ffmpeg.stdin.end();
      const exitCode = await ffmpegExitPromise;
      if (exitCode !== 0) {
        throw new Error(`FFmpeg exited with code ${exitCode}: ${stderrChunks.join("").trim()}`);
      }

      // 6. Optional SRT sidecar export
      if (job.settings.exportSrt && project.subtitles.cues.length > 0) {
        const srtFilename = job.outputFilename!.replace(/\.mp4$/i, ".srt");
        await fs.writeFile(path.join(exportsDir, srtFilename), generateSrt(project.subtitles), "utf8");
        job.srtFilename = srtFilename;
        job.srtDownloadUrl = `/api/projects/${encodeURIComponent(project.id)}/exports/${encodeURIComponent(srtFilename)}`;
      }

      // 7. Verify exported MP4 via ffprobe
      job.probe = await probeMediaFile(job.outputPath!);
      job.status = "completed";
      job.progress = 1;
      job.etaSec = 0;
      job.completedAt = new Date().toISOString();
      job.stageLabel = `Exportación completada (${job.probe.video?.codec ?? job.codec} · ${workerCount}× workers · ${(job.probe.sizeBytes / (1024 * 1024)).toFixed(2)} MB)`;
      this.emit("export.completed", job);
    } catch (err) {
      if ((job.status as ExportJobStatus) !== "cancelled") {
        job.status = "failed";
        job.error = err instanceof Error ? err.message : String(err);
        job.stageLabel = `Error: ${job.error}`;
        job.completedAt = new Date().toISOString();
        this.emit("export.failed", job);
      }
      if (pipe) {
        pipe.cancelled = true;
        pipe.pendingFrames.clear();
        const ws = pipe.waiters.splice(0, pipe.waiters.length);
        ws.forEach((fn) => fn());
        try {
          pipe.ffmpeg.stdin.end();
          pipe.ffmpeg.kill("SIGTERM");
        } catch {
          // Ignore
        }
      }
    } finally {
      this.activePipes.delete(job.id);
      await Promise.all(workerPages.map((p) => p.close().catch(() => {})));
      await fs.rm(tmpAudioWav, { force: true }).catch(() => {});
    }
  }

  /**
   * Renders an exact 1:1 PNG of any timestamp using the same headless PixiJS v8 harness.
   * Powers both `POST /api/projects/:id/capture-frame` and Phase 4 MCP `capture_frame(timestamp)`.
   */
  async captureFrame(projectId: string, opts: CaptureFrameOptions): Promise<CaptureFrameResult> {
    const project = await this.storage.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project '${projectId}' not found`), { statusCode: 404 });
    }

    const baseDims = resolveCanvasDimensions(project.canvas);
    const width = opts.width ? Math.max(2, Math.round(opts.width / 2) * 2) : baseDims.width;
    const height = opts.height ? Math.max(2, Math.round(opts.height / 2) * 2) : baseDims.height;
    const origin = this.getServerOrigin();

    const browser = await getHeadlessBrowser();
    const page = await browser.newPage({
      viewport: { width: Math.min(width, 1920), height: Math.min(height, 1920) },
      deviceScaleFactor: 1,
    });

    try {
      await page.goto(`${origin}/render`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(
        () => Boolean((window as unknown as { __STORIA_RENDER_READY__?: boolean }).__STORIA_RENDER_READY__),
        undefined,
        { timeout: 20_000 },
      );

      const result = await page.evaluate(
        async ({ w, h, baseUrl, proj, t, burn }) => {
          const api = (window as unknown as {
            __STORIA_RENDER__: {
              init: (w: number, h: number, base: string) => Promise<unknown>;
              loadProject: (p: Project) => Promise<unknown>;
              capturePngDataUrl: (
                t: number,
                burn: boolean,
              ) => Promise<{
                pngDataUrl: string;
                width: number;
                height: number;
                sceneId: string | null;
                sceneName: string | null;
              }>;
            };
          }).__STORIA_RENDER__;
          await api.init(w, h, baseUrl);
          await api.loadProject(proj);
          return api.capturePngDataUrl(t, burn);
        },
        {
          w: width,
          h: height,
          baseUrl: origin,
          proj: project,
          t: Math.max(0, opts.timeSec),
          burn: opts.burnSubtitles ?? true,
        },
      );

      const base64 = result.pngDataUrl.replace(/^data:image\/png;base64,/, "");
      const pngBuffer = Buffer.from(base64, "base64");

      return {
        projectId: project.id,
        timeSec: Math.max(0, opts.timeSec),
        width: result.width,
        height: result.height,
        sceneId: result.sceneId,
        sceneName: result.sceneName,
        pngBuffer,
        pngDataUrl: result.pngDataUrl,
      };
    } finally {
      await page.close().catch(() => {});
    }
  }

  /**
   * Captures multiple timestamps in one single Playwright/WebGL2 page session for rapid visual QA
   * across an entire video timeline.
   */
  async captureFramesBatch(
    projectId: string,
    opts: {
      timestamps: number[];
      width?: number;
      height?: number;
      burnSubtitles?: boolean;
    },
  ): Promise<CaptureFrameResult[]> {
    const project = await this.storage.get(projectId);
    if (!project) {
      throw Object.assign(new Error(`Project '${projectId}' not found`), { statusCode: 404 });
    }

    const baseDims = resolveCanvasDimensions(project.canvas);
    const width = opts.width ? Math.max(2, Math.round(opts.width / 2) * 2) : baseDims.width;
    const height = opts.height ? Math.max(2, Math.round(opts.height / 2) * 2) : baseDims.height;
    const origin = this.getServerOrigin();
    const safeTimes = opts.timestamps.slice(0, 12).map((t) => Math.max(0, Number(t)));

    const browser = await getHeadlessBrowser();
    const page = await browser.newPage({
      viewport: { width: Math.min(width, 1920), height: Math.min(height, 1920) },
      deviceScaleFactor: 1,
    });

    try {
      await page.goto(`${origin}/render`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForFunction(
        () => Boolean((window as unknown as { __STORIA_RENDER_READY__?: boolean }).__STORIA_RENDER_READY__),
        undefined,
        { timeout: 20_000 },
      );

      const rawFrames = await page.evaluate(
        async ({ w, h, baseUrl, proj, times, burn }) => {
          const api = (window as unknown as {
            __STORIA_RENDER__: {
              init: (w: number, h: number, base: string) => Promise<unknown>;
              loadProject: (p: Project) => Promise<unknown>;
              capturePngDataUrl: (
                t: number,
                burn: boolean,
              ) => Promise<{
                pngDataUrl: string;
                width: number;
                height: number;
                sceneId: string | null;
                sceneName: string | null;
              }>;
            };
          }).__STORIA_RENDER__;
          await api.init(w, h, baseUrl);
          await api.loadProject(proj);
          const out: {
            timeSec: number;
            pngDataUrl: string;
            width: number;
            height: number;
            sceneId: string | null;
            sceneName: string | null;
          }[] = [];
          for (const t of times) {
            const cap = await api.capturePngDataUrl(t, burn);
            out.push({ timeSec: t, ...cap });
          }
          return out;
        },
        {
          w: width,
          h: height,
          baseUrl: origin,
          proj: project,
          times: safeTimes,
          burn: opts.burnSubtitles ?? true,
        },
      );

      return rawFrames.map((r) => {
        const base64 = r.pngDataUrl.replace(/^data:image\/png;base64,/, "");
        return {
          projectId: project.id,
          timeSec: r.timeSec,
          width: r.width,
          height: r.height,
          sceneId: r.sceneId,
          sceneName: r.sceneName,
          pngBuffer: Buffer.from(base64, "base64"),
          pngDataUrl: r.pngDataUrl,
        };
      });
    } finally {
      await page.close().catch(() => {});
    }
  }
}
