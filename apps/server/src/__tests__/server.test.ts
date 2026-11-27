import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

describe("@storia/server — REST API & project persistence", () => {
  let tmpDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-studio-test-"));
    app = await buildServer({ projectsDir: tmpDir, logger: false });
  });

  afterEach(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reports health and system capabilities (including FFmpeg)", async () => {
    const health = await app.inject({ method: "GET", url: "/api/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ ok: true, service: "storia-studio-server" });

    const caps = await app.inject({ method: "GET", url: "/api/system/capabilities" });
    expect(caps.statusCode).toBe(200);
    const body = caps.json();
    expect(body.cpus).toBeGreaterThan(0);
    expect(typeof body.recommendedEncoder).toBe("string");
  });

  it("creates, lists, fetches, patches via operations, and deletes a project on disk", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: {
        id: "test_reel_01",
        name: "Episodum Test Reel",
        template: "demo",
        aspectRatio: "9:16",
        resolution: "4k",
        fps: 60,
      },
    });
    expect(created.statusCode).toBe(201);
    const createdProject = created.json().project;
    expect(createdProject.id).toBe("test_reel_01");
    expect(createdProject.canvas.resolution).toBe("4k");
    expect(createdProject.canvas.fps).toBe(60);

    // List projects
    const listed = await app.inject({ method: "GET", url: "/api/projects" });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().projects).toHaveLength(1);
    expect(listed.json().projects[0].id).toBe("test_reel_01");

    // Apply atomic operations
    const patched = await app.inject({
      method: "POST",
      url: "/api/projects/test_reel_01/operations",
      payload: {
        source: "mcp",
        operations: [
          { op: "project.updateMeta", name: "Episodum Reel Editado" },
          { op: "postProcessing.update", patch: { preset: "psx", psx: { enabled: true, internalHeight: 240, colorBits: 5, ditherStrength: 0.7, vertexSnap: 2, scanlines: 0.2, ntscBleed: 0.25 } } },
          { op: "subtitle.updateStyle", patch: { fontSize: 68, activeWordColor: "#f7c8d6" } },
        ],
      },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().project.name).toBe("Episodum Reel Editado");
    expect(patched.json().project.postProcessing.preset).toBe("psx");
    expect(patched.json().project.subtitles.style.fontSize).toBe(68);
    const receipt = patched.json().receipt;
    expect(receipt.source).toBe("mcp");
    expect(receipt.operationsCount).toBe(3);
    expect(typeof receipt.snapshotId).toBe("string");

    // Upload a tiny SVG asset & verify serving + rollback snapshot restore
    const svgBase64 = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#f7c8d6"/></svg>').toString("base64");
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/projects/test_reel_01/assets",
      payload: {
        name: "Episodum Chip",
        filename: "chip.svg",
        kind: "svg",
        base64: svgBase64,
      },
    });
    expect(uploaded.statusCode).toBe(201);
    const assetSrc = uploaded.json().asset.src as string;
    const served = await app.inject({ method: "GET", url: assetSrc });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/svg+xml");

    // Restore snapshot before the MCP edit
    const restored = await app.inject({
      method: "POST",
      url: `/api/projects/test_reel_01/snapshots/${receipt.snapshotId}/restore`,
      payload: {},
    });
    expect(restored.statusCode).toBe(200);
    expect(restored.json().project.name).toBe("Episodum Test Reel");

    // Re-apply edit so disk check below matches
    await app.inject({
      method: "POST",
      url: "/api/projects/test_reel_01/operations",
      payload: {
        source: "ui",
        operations: [{ op: "project.updateMeta", name: "Episodum Reel Editado" }],
      },
    });

    // Verify persisted JSON on disk matches
    const diskJson = JSON.parse(await fs.readFile(path.join(tmpDir, "test_reel_01", "project.json"), "utf8"));
    expect(diskJson.name).toBe("Episodum Reel Editado");

    // Duplicate ID rejected with 409
    const dup = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "test_reel_01", template: "blank" },
    });
    expect(dup.statusCode).toBe(409);

    // Delete project
    const del = await app.inject({ method: "DELETE", url: "/api/projects/test_reel_01" });
    expect(del.statusCode).toBe(200);
    expect(del.json()).toEqual({ deleted: true, id: "test_reel_01" });

    const missing = await app.inject({ method: "GET", url: "/api/projects/test_reel_01" });
    expect(missing.statusCode).toBe(404);
  });

  it("imports a legacy Storia manifest through the REST endpoint", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/import-legacy",
      payload: {
        id: "legacy_video14_test",
        manifest: {
          project: "Video 14 Legacy",
          aspect_ratio: "9:16",
          resolution: "4k",
          fps: 30,
          gpu: true,
          shots: [{ t0: 0, t1: 4, bg: { type: "living_room" }, chars: [] }],
        },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().project.id).toBe("legacy_video14_test");
    expect(res.json().project.scenes).toHaveLength(1);
  });
});
