import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { resolveExportConcurrency } from "../exporter.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");

describe("@storia/server — Remotion Subtitles Import/Rechunk & Parallel Export Concurrency", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let projectId: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-remotion-srv-"));
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      connectivityConfigPath: path.join(tmpDir, "connectivity.json"),
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { name: "Remotion Subtitles Test", aspectRatio: "9:16" },
    });
    expect(created.statusCode).toBe(201);
    projectId = created.json().project.id;
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves export worker concurrency cleanly across auto, explicit, and short clips", () => {
    const autoMany = resolveExportConcurrency(0, 120);
    expect(autoMany).toBeGreaterThanOrEqual(1);
    expect(autoMany).toBeLessThanOrEqual(4);

    expect(resolveExportConcurrency(4, 2)).toBe(2);
    expect(resolveExportConcurrency(1, 300)).toBe(1);
    expect(resolveExportConcurrency(12, 300)).toBe(8);
  });

  it("imports SRT & WebVTT via REST and re-chunks subtitles with TikTok rhythmic pacing", async () => {
    const srt = [
      "1",
      "00:00:00,000 --> 00:00:02,400",
      "Bienvenidos a Storia Studio con motor Remotion",
      "",
      "2",
      "00:00:03,200 --> 00:00:05,000",
      "Render paralelo y motion blur real",
      "",
    ].join("\n");

    const imp = await app.inject({
      method: "POST",
      url: `/api/projects/${encodeURIComponent(projectId)}/subtitles/import`,
      payload: {
        content: srt,
        format: "auto",
        tiktokMode: true,
        combineTokensWithinMs: 1400,
        breakOnSilenceAfterMs: 400,
        maxWordsPerPage: 4,
      },
    });
    expect(imp.statusCode).toBe(200);
    const impBody = imp.json();
    expect(impBody.format).toBe("srt");
    expect(impBody.importedCount).toBeGreaterThanOrEqual(2);
    expect(impBody.project.subtitles.enabled).toBe(true);
    expect(impBody.project.subtitles.cues.length).toBe(impBody.importedCount);

    // Rechunk into tighter 2-word TikTok pages
    const rech = await app.inject({
      method: "POST",
      url: `/api/projects/${encodeURIComponent(projectId)}/subtitles/tiktok-rechunk`,
      payload: {
        combineTokensWithinMs: 1100,
        breakOnSilenceAfterMs: 350,
        maxWordsPerPage: 2,
      },
    });
    expect(rech.statusCode).toBe(200);
    const rechBody = rech.json();
    expect(rechBody.pagesCount ?? rechBody.cuesCount).toBeGreaterThanOrEqual(impBody.importedCount);
    expect(rechBody.project.subtitles.cues.every((c: { words: unknown[] }) => c.words.length <= 2)).toBe(true);

    // Also test WebVTT import
    const vtt = "WEBVTT\n\n00:00.000 --> 00:01.500\n<i>Hola</i> WebVTT\n";
    const impVtt = await app.inject({
      method: "POST",
      url: `/api/projects/${encodeURIComponent(projectId)}/subtitles/import`,
      payload: { content: vtt, format: "auto", tiktokMode: false },
    });
    expect(impVtt.statusCode).toBe(200);
    expect(impVtt.json().format).toBe("vtt");
    expect(impVtt.json().project.subtitles.cues[0].text).toBe("Hola WebVTT");
  });
});
