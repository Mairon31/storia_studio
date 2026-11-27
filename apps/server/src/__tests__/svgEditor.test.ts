import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");

describe("@storia/server — Live SVG Code Editor (Read, Replace, Save as Copy & Anti-XSS Sanitization)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let projectId: string;
  let svgAssetId: string;
  let sceneId: string;
  let spriteLayerId: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-svg-editor-"));
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
      payload: { name: "SVG Live Editor Test", aspectRatio: "9:16" },
    });
    expect(created.statusCode).toBe(201);
    const proj = created.json().project;
    projectId = proj.id;
    sceneId = proj.scenes[0].id;

    // Upload an SVG asset
    const initialSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#ff0000"/></svg>`;
    const up = await app.inject({
      method: "POST",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets`,
      payload: {
        name: "Badge Rojo",
        kind: "svg",
        filename: "badge.svg",
        mimeType: "image/svg+xml",
        base64: Buffer.from(initialSvg, "utf8").toString("base64"),
      },
    });
    expect(up.statusCode).toBe(201);
    svgAssetId = up.json().asset.id;

    // Attach it to a sprite layer
    spriteLayerId = "layer_svg_badge";
    const addLyr = await app.inject({
      method: "POST",
      url: `/api/projects/${encodeURIComponent(projectId)}/operations`,
      payload: {
        source: "ui",
        operations: [
          {
            op: "layer.add",
            sceneId,
            layer: {
              id: spriteLayerId,
              type: "sprite",
              name: "Badge Layer",
              assetId: svgAssetId,
              widthNorm: 0.4,
              scaleMode: "linear",
              pixelSnap: false,
              bobAmplitude: 0,
              bobSpeed: 1,
              start: 0,
              visible: true,
              locked: false,
              zIndex: 15,
              parallaxDepth: 1,
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
          },
        ],
      },
    });
    expect(addLyr.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("reads SVG source code, updates in-place with XSS sanitization & cache-busting, and saves as a copy swapping layer reference", async () => {
    // 1. Read original SVG
    const readRes = await app.inject({
      method: "GET",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(svgAssetId)}/svg`,
    });
    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().editable).toBe(true);
    expect(readRes.json().svgCode).toContain('fill="#ff0000"');

    // 2. Replace with malicious script/onclick tags -> must sanitize cleanly & bust ?v= cache
    const editedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><script>alert(1)</script><circle onclick="evil()" cx="50" cy="50" r="42" fill="#00ff88"/></svg>`;
    const repRes = await app.inject({
      method: "PUT",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(svgAssetId)}/svg`,
      payload: {
        svgCode: editedSvg,
        mode: "replace",
        requestSource: "mcp",
      },
    });
    expect(repRes.statusCode).toBe(200);
    const repBody = repRes.json();
    expect(repBody.mode).toBe("replace");
    expect(repBody.svgCode).toContain('fill="#00ff88"');
    expect(repBody.svgCode).not.toContain("<script");
    expect(repBody.svgCode).not.toContain("onclick");
    expect(repBody.asset.src).toContain("?v=");

    // 3. Save as copy and swap layer reference automatically
    const copySvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="10" y="10" width="80" height="80" rx="16" fill="#4ce6c8"/></svg>`;
    const copyRes = await app.inject({
      method: "PUT",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(svgAssetId)}/svg`,
      payload: {
        svgCode: copySvg,
        mode: "copy",
        copyName: "Badge Turquesa Copia",
        updateLayerRef: { sceneId, layerId: spriteLayerId },
        requestSource: "ui",
      },
    });
    expect(copyRes.statusCode).toBe(201);
    const copyBody = copyRes.json();
    expect(copyBody.mode).toBe("copy");
    expect(copyBody.asset.id).not.toBe(svgAssetId);
    expect(copyBody.asset.name).toBe("Badge Turquesa Copia");

    // Verify layer now references the new copy asset while original asset still exists with #00ff88
    const updatedLayer = copyBody.project.scenes[0].layers.find((l: { id: string }) => l.id === spriteLayerId);
    expect(updatedLayer.assetId).toBe(copyBody.asset.id);

    const origRead = await app.inject({
      method: "GET",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(svgAssetId)}/svg`,
    });
    expect(origRead.statusCode).toBe(200);
    expect(origRead.json().svgCode).toContain('fill="#00ff88"');
  });

  it("rejects invalid non-SVG markup with HTTP 400", async () => {
    const badRes = await app.inject({
      method: "PUT",
      url: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(svgAssetId)}/svg`,
      payload: {
        svgCode: "<html><body>Not an SVG</body></html>",
        mode: "replace",
      },
    });
    expect(badRes.statusCode).toBe(400);
  });
});
