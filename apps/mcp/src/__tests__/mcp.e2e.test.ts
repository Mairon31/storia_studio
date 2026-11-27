import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import WebSocket from "ws";
import { buildServer } from "@storia/server/dist/app.js";
import { createDemoProject } from "@storia/schema";
import { auditProject } from "../audit.js";
import { createStoriaMcpServer, resolveCrossPlatformPath } from "../server.js";

function parseJsonToolResult<T>(res: unknown): T {
  const items = ((res as { content?: unknown })?.content ?? []) as { type: string; text?: string }[];
  const textItem = items.find((i) => i.type === "text" && typeof i.text === "string");
  if (!textItem?.text) throw new Error("Expected JSON text block in MCP tool response");
  return JSON.parse(textItem.text) as T;
}

describe("@storia/mcp — End-to-End Bidirectional Live Sync, Audit & capture_frame", () => {
  let tmpDir: string;
  let fastifyApp: Awaited<ReturnType<typeof buildServer>>;
  let serverUrl: string;
  let wsUrl: string;
  let mcpClient: Client;
  let closeMcp: () => Promise<void>;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-mcp-e2e-"));
    fastifyApp = await buildServer({ projectsDir: tmpDir, logger: false });
    await fastifyApp.listen({ port: 0, host: "localhost" });

    const addr = fastifyApp.server.address();
    const port = typeof addr === "object" && addr ? addr.port : 4310;
    serverUrl = `http://localhost:${port}`;
    wsUrl = `ws://localhost:${port}`;

    const mcpServer = createStoriaMcpServer({ serverUrl });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await mcpServer.connect(serverTransport);

    mcpClient = new Client({ name: "storia-e2e-test-client", version: "0.1.0" });
    await mcpClient.connect(clientTransport);

    closeMcp = async () => {
      await mcpClient.close();
      await mcpServer.close();
    };
  }, 30_000);

  afterAll(async () => {
    await closeMcp?.();
    await fastifyApp?.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("normalizes Windows drive paths on Linux/WSL2 cleanly", () => {
    const out = resolveCrossPlatformPath("M:\\Documentos\\storia\\assets\\hero.svg");
    if (process.platform === "linux") {
      expect(out).toBe("/mnt/m/Documentos/storia/assets/hero.svg");
    } else {
      expect(out).toContain("hero.svg");
    }
  });

  it("audits mid-word scene cuts and out-of-safe-zone subtitles accurately", () => {
    const demo = createDemoProject("audit_unit_test");
    // Move scene 1 duration to 2.25s so the cut slices right through word "pasado" (1.95s..2.60s)
    demo.scenes[0]!.duration = 2.25;
    // Push subtitles below 9:16 social UI safe zone
    demo.subtitles.style.position.y = 0.90;

    const report = auditProject(demo);
    expect(report.issues.some((i) => i.code === "mid_word_scene_cut")).toBe(true);
    expect(report.issues.some((i) => i.code === "subtitle_below_safe_zone")).toBe(true);
    expect(report.score).toBeLessThan(90);
  });

  it("detects rig QA violations in auditProject (unreachable IK, non-uniform scale, head limit & joint teleport)", () => {
    const demo = createDemoProject("audit_rig_qa_test");
    const charLayer = demo.scenes[0]!.layers.find((l) => l.type === "character");
    expect(charLayer).toBeDefined();
    if (charLayer && charLayer.type === "character") {
      charLayer.transform.scaleX = 1.45;
      charLayer.transform.scaleY = 1.0;
      charLayer.headAngleDeg = 32; // exceeds ±20° rigid neck limit
      charLayer.wristTargets = { right: { x: 520, y: -130 } }; // unreachable IK target
      charLayer.ankleTargets = { left: { x: -240, y: -10 } }; // outside 92%–108% stance envelope
      charLayer.poseCues = [{ t: 1.5, pose: "celebrate", blendDuration: 0 }]; // single-frame joint teleport
    }

    const report = auditProject(demo);
    expect(report.ok).toBe(false);
    const codes = new Set(report.issues.map((i) => i.code));
    expect(codes.has("rig_non_uniform_scale")).toBe(true);
    expect(codes.has("rig_head_angle_limit")).toBe(true);
    expect(codes.has("rig_ik_target_unreachable")).toBe(true);
    expect(codes.has("rig_ankle_outside_envelope")).toBe(true);
    expect(codes.has("rig_joint_teleport")).toBe(true);
    const ikIssue = report.issues.find((i) => i.code === "rig_ik_target_unreachable");
    expect(ikIssue?.characterId).toBeTruthy();
    expect(typeof ikIssue?.timeSec).toBe("number");
  });

  it("synchronizes edits bidirectionally between Browser WebSocket <-> MCP, supports dryRun, receipts, snapshot rollback, and local asset import", async () => {
    // 1. Verify full tool catalog is exposed with accurate MCP ToolAnnotations
    const toolsList = await mcpClient.listTools();
    const names = toolsList.tools.map((t) => t.name);
    expect(toolsList.tools.every((t) => t.annotations && typeof t.annotations.readOnlyHint === "boolean")).toBe(true);
    const byName = new Map(toolsList.tools.map((t) => [t.name, t]));
    expect(byName.get("list_projects")?.annotations?.readOnlyHint).toBe(true);
    expect(byName.get("get_project")?.annotations?.destructiveHint).toBe(false);
    expect(byName.get("apply_operations")?.annotations?.destructiveHint).toBe(false);
    expect(byName.get("edit_audit_and_render")?.annotations?.destructiveHint).toBe(false);
    expect(byName.get("manage_project")?.annotations?.destructiveHint).toBe(true);
    expect(names).toEqual(
      expect.arrayContaining([
        "studio_health",
        "list_projects",
        "get_project",
        "create_project",
        "update_canvas",
        "update_post_processing",
        "import_local_asset",
        "apply_operations",
        "restore_snapshot",
        "audit_project",
        "capture_frame",
        "start_export",
        "search_vector_library",
        "insert_vector_from_library",
        "search_audio_library",
        "insert_audio_from_library",
        "list_tts_providers",
        "list_tts_voices",
        "generate_tts_voice",
        "generate_tts_from_subtitles",
        "preview_video_frames",
        "preview_visual_asset",
        "inspect_exported_video",
        "analyze_audio_and_tts",
        "enhance_asset",
        "replace_project_asset",
        "debug_project_state",
        "run_studio_diagnostics",
      ]),
    );

    // 2. Create project via MCP
    const createRes = await mcpClient.callTool({
      name: "create_project",
      arguments: {
        id: "e2e_live_sync",
        name: "Live Sync Test",
        template: "demo",
        aspectRatio: "9:16",
        resolution: "720p",
        fps: 30,
      },
    });
    const created = parseJsonToolResult<{ created: boolean; project: { id: string } }>(createRes);
    expect(created.created).toBe(true);
    expect(created.project.id).toBe("e2e_live_sync");

    // 3. Connect simulated Studio Browser WebSocket client to the live room
    const ws = new WebSocket(`${wsUrl}/ws/projects/e2e_live_sync`);
    const wsMessages: { type: string; source?: string; receipt?: { snapshotId?: string }; project?: { name: string } }[] = [];

    await new Promise<void>((resolve, reject) => {
      ws.once("error", reject);
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString("utf8"));
        wsMessages.push(msg);
        if (msg.type === "project.snapshot") resolve();
      });
    });

    // 4. Test dryRun first — must NOT mutate project or emit WS update
    const dryRes = await mcpClient.callTool({
      name: "apply_operations",
      arguments: {
        projectId: "e2e_live_sync",
        dryRun: true,
        operations: [{ op: "project.updateMeta", name: "Should Not Persist" }],
      },
    });
    const dryJson = parseJsonToolResult<{ dryRun: boolean; valid: boolean }>(dryRes);
    expect(dryJson.dryRun).toBe(true);
    expect(dryJson.valid).toBe(true);

    // 5. Apply real MCP edit -> verify Browser WebSocket receives instant broadcast with receipt
    const wsUpdatePromise = new Promise<{ source?: string; receipt?: { snapshotId?: string }; project?: { name: string } }>((resolve) => {
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.type === "project.updated" && msg.source === "mcp") resolve(msg);
      });
    });

    const editRes = await mcpClient.callTool({
      name: "apply_operations",
      arguments: {
        projectId: "e2e_live_sync",
        operations: [
          { op: "project.updateMeta", name: "Dirigido por MCP en Vivo" },
          { op: "subtitle.updateWord", cueId: "cue_01", wordId: "w_05", patch: { text: "PASADO!", emphasis: "alert" } },
        ],
      },
    });
    const editJson = parseJsonToolResult<{ receipt: { snapshotId: string; source: string; operationsCount: number } }>(editRes);
    expect(editJson.receipt.source).toBe("mcp");
    expect(editJson.receipt.operationsCount).toBe(2);
    expect(editJson.receipt.snapshotId).toBeTruthy();

    const broadcast = await wsUpdatePromise;
    expect(broadcast.project?.name).toBe("Dirigido por MCP en Vivo");

    // 6. Simulate manual Browser UI edit (POST /operations with source:"ui") -> MCP reads it back immediately
    const uiEdit = await fetch(`${serverUrl}/api/projects/e2e_live_sync/operations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "ui",
        operations: [{ op: "project.updateMeta", name: "Editado Manualmente en Navegador" }],
      }),
    });
    expect(uiEdit.ok).toBe(true);

    const readBack = parseJsonToolResult<{ name: string }>(
      await mcpClient.callTool({
        name: "get_project",
        arguments: { projectId: "e2e_live_sync", summaryOnly: true },
      }),
    );
    expect(readBack.name).toBe("Editado Manualmente en Navegador");

    // 7. Rollback via MCP restore_snapshot -> restores name before step 5
    const restoreRes = parseJsonToolResult<{ restored: boolean; projectSummary: { name: string } }>(
      await mcpClient.callTool({
        name: "restore_snapshot",
        arguments: { projectId: "e2e_live_sync", snapshotId: editJson.receipt.snapshotId },
      }),
    );
    expect(restoreRes.restored).toBe(true);
    expect(restoreRes.projectSummary.name).toBe("Live Sync Test");

    // 8. Import a real pixel-art SVG/PNG from disk via MCP
    const tempSprite = path.join(tmpDir, "hero_pixel.svg");
    await fs.writeFile(
      tempSprite,
      '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#f7c8d6"/></svg>',
      "utf8",
    );
    const importRes = parseJsonToolResult<{ asset: { kind: string; scaleMode: string } }>(
      await mcpClient.callTool({
        name: "import_local_asset",
        arguments: {
          projectId: "e2e_live_sync",
          filePath: tempSprite,
          kind: "pixel_art",
        },
      }),
    );
    expect(importRes.asset.kind).toBe("pixel_art");
    expect(importRes.asset.scaleMode).toBe("nearest");

    // 9. Run audit_project via MCP
    const auditRes = parseJsonToolResult<{ ok: boolean; score: number }>(
      await mcpClient.callTool({
        name: "audit_project",
        arguments: { projectId: "e2e_live_sync" },
      }),
    );
    expect(auditRes.ok).toBe(true);
    expect(auditRes.score).toBeGreaterThanOrEqual(80);

    ws.close();
  }, 30_000);

  it("captures an exact 1:1 PNG image block via MCP capture_frame(timestamp)", async () => {
    const capRes = await mcpClient.callTool({
      name: "capture_frame",
      arguments: {
        projectId: "e2e_live_sync",
        timestamp: 2.1,
        width: 360,
        height: 640,
        burnSubtitles: true,
      },
    });
    const content = (capRes.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    const imgBlock = content.find((c) => c.type === "image");
    const txtBlock = content.find((c) => c.type === "text");

    expect(imgBlock).toBeDefined();
    expect(imgBlock?.mimeType).toBe("image/png");
    expect(imgBlock?.data && imgBlock.data.length).toBeGreaterThan(2000);

    // Verify valid PNG magic header (89 50 4E 47)
    const pngBytes = Buffer.from(imgBlock!.data!, "base64");
    expect(pngBytes[0]).toBe(0x89);
    expect(pngBytes[1]).toBe(0x50);
    expect(pngBytes[2]).toBe(0x4e);
    expect(pngBytes[3]).toBe(0x47);

    const meta = JSON.parse(txtBlock!.text!) as { width: number; height: number; sceneId: string };
    expect(meta.width).toBe(360);
    expect(meta.height).toBe(640);
    expect(meta.sceneId).toBe("scene_01_hook");
  }, 45_000);

  it("executes batch edits, subtitle preset, quality audit, and preview capture in a single edit_audit_and_render call", async () => {
    const res = await mcpClient.callTool({
      name: "edit_audit_and_render",
      arguments: {
        projectId: "e2e_live_sync",
        animationStyleId: "b2_colorful_handdrawn",
        subtitlePresetId: "vox_explainer_yellow",
        operations: [
          { op: "project.updateMeta", name: "One-Shot Batch Workflow" },
          { op: "marker.upsert", marker: { id: "m_hook", t: 1.0, label: "Hook Beat", color: "#ffd447" } },
        ],
        audit: true,
        captureTimestamps: [1.0],
        captureWidth: 360,
        captureHeight: 640,
        exportVideo: false,
        includeProjectSummary: true,
      },
    });

    const content = (res.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    const imgBlock = content.find((c) => c.type === "image");
    const txtBlock = content.find((c) => c.type === "text");
    expect(imgBlock?.mimeType).toBe("image/png");
    expect(imgBlock?.data && imgBlock.data.length).toBeGreaterThan(2000);

    const payload = JSON.parse(txtBlock!.text!) as {
      operationsApplied: number;
      receipt: { snapshotId?: string; operationsCount: number };
      audit: { ok: boolean; score: number };
      capturedFrames: { timestamp: number; width: number; height: number }[];
      projectSummary: { name: string; subtitles: { style: { presetId?: string } } };
    };
    expect(payload.operationsApplied).toBe(4);
    expect(payload.receipt.snapshotId).toBeTruthy();
    expect(payload.audit.score).toBeGreaterThanOrEqual(70);
    expect(payload.capturedFrames).toHaveLength(1);
    expect(payload.capturedFrames[0]!.width).toBe(360);
    expect(payload.projectSummary.name).toBe("One-Shot Batch Workflow");
    expect(payload.projectSummary.subtitles.style.presetId).toBe("vox_explainer_yellow");

    // Dry-run mode simulates edits + audit without saving or exporting
    const dryRes = await mcpClient.callTool({
      name: "edit_audit_and_render",
      arguments: {
        projectId: "e2e_live_sync",
        operations: [{ op: "project.updateMeta", name: "Should Not Persist" }],
        dryRun: true,
        audit: true,
        exportVideo: true,
      },
    });
    const dryPayload = parseJsonToolResult<{
      dryRun: boolean;
      exportSkippedReason?: string;
      projectSummary: { name: string };
    }>(dryRes);
    expect(dryPayload.dryRun).toBe(true);
    expect(dryPayload.exportSkippedReason).toContain("dryRun");
    expect(dryPayload.projectSummary.name).toBe("Should Not Persist");

    // Confirm real project title remained unchanged after dryRun
    const liveProj = parseJsonToolResult<{ name: string }>(
      await mcpClient.callTool({
        name: "get_project",
        arguments: { projectId: "e2e_live_sync", summaryOnly: true },
      }),
    );
    expect(liveProj.name).toBe("One-Shot Batch Workflow");
  }, 45_000);

  it("supports visual previews (contact sheet & assets), SVG enhancement, in-place replacement, deep debug, audio analysis, and diagnostics", async () => {
    // 1. Multi-frame contact sheet preview across scenes
    const sheetRes = await mcpClient.callTool({
      name: "preview_video_frames",
      arguments: {
        projectId: "e2e_live_sync",
        mode: "scene_midpoints",
        count: 2,
        contactSheet: true,
        width: 240,
        height: 426,
      },
    });
    const sheetContent = (sheetRes.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    const sheetImg = sheetContent.find((c) => c.type === "image");
    const sheetMeta = JSON.parse(sheetContent.find((c) => c.type === "text")!.text!) as {
      contactSheet: { width: number; height: number } | null;
      frames: { timeSec: number; sceneId: string | null }[];
    };
    expect(sheetImg?.mimeType).toBe("image/png");
    expect(sheetImg?.data && sheetImg.data.length).toBeGreaterThan(2000);
    expect(sheetMeta.contactSheet?.width).toBeGreaterThan(200);
    expect(sheetMeta.frames.length).toBeGreaterThanOrEqual(2);

    // 2. Create SVG asset, preview it as PNG, enhance its palette/strokes, and replace it in-place
    const createdSvg = parseJsonToolResult<{ asset: { id: string } }>(
      await mcpClient.callTool({
        name: "create_svg_asset",
        arguments: {
          projectId: "e2e_live_sync",
          name: "Test Badge",
          svgCode:
            '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="80" fill="#ff0000" stroke="#111111" stroke-width="4"/></svg>',
          insertIntoSceneId: "scene_01_hook",
          layerType: "sprite",
        },
      }),
    );
    const svgId = createdSvg.asset.id;

    const prevAssetRes = await mcpClient.callTool({
      name: "preview_visual_asset",
      arguments: {
        source: "project_asset",
        projectId: "e2e_live_sync",
        assetId: svgId,
        maxSize: 256,
        background: "dark",
      },
    });
    const prevAssetContent = (prevAssetRes.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    expect(prevAssetContent.find((c) => c.type === "image")?.mimeType).toBe("image/png");
    const prevAssetMeta = JSON.parse(prevAssetContent.find((c) => c.type === "text")!.text!) as {
      opaqueCoverageRatio: number;
      naturalWidth: number;
    };
    expect(prevAssetMeta.opaqueCoverageRatio).toBeGreaterThan(0.2);

    // Enhance SVG: remap #ff0000 -> #00e5ff, double stroke-width, auto-inject viewBox
    const enhRes = await mcpClient.callTool({
      name: "enhance_asset",
      arguments: {
        projectId: "e2e_live_sync",
        assetId: svgId,
        mode: "replace",
        colorMap: { "#ff0000": "#00e5ff" },
        strokeScale: 2,
        ensureViewBox: true,
        returnPreview: true,
      },
    });
    const enhContent = (enhRes.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    expect(enhContent.find((c) => c.type === "image")?.mimeType).toBe("image/png");
    const enhMeta = JSON.parse(enhContent.find((c) => c.type === "text")!.text!) as {
      kind: string;
      replacements: number;
      viewBox: string | null;
    };
    expect(enhMeta.kind).toBe("svg");
    expect(enhMeta.replacements).toBeGreaterThanOrEqual(2);
    expect(enhMeta.viewBox).toBe("0 0 200 200");

    // Replace SVG in-place while keeping original assetId
    const repRes = await mcpClient.callTool({
      name: "replace_project_asset",
      arguments: {
        projectId: "e2e_live_sync",
        targetAssetId: svgId,
        keepOriginalAssetId: true,
        sourceType: "svg_code",
        name: "Test Badge Replaced",
        svgCode:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect x="10" y="10" width="100" height="100" rx="18" fill="#ffd447"/></svg>',
        returnPreview: true,
      },
    });
    const repContent = (repRes.content ?? []) as { type: string; mimeType?: string; data?: string; text?: string }[];
    expect(repContent.find((c) => c.type === "image")?.mimeType).toBe("image/png");
    const repMeta = JSON.parse(repContent.find((c) => c.type === "text")!.text!) as {
      replacedInPlace: boolean;
      asset: { id: string; name: string };
    };
    expect(repMeta.replacedInPlace).toBe(true);
    expect(repMeta.asset.id).toBe(svgId);
    expect(repMeta.asset.name).toBe("Test Badge Replaced");

    // 3. Deep debugger at timestamp 2.1s
    const dbg = parseJsonToolResult<{
      projectId: string;
      counts: { scenes: number; snapshots: number };
      frameDebug: { sceneId: string; activeLayers: unknown[]; activeSubtitle: { text: string } | null };
      missingOnDisk: unknown[];
    }>(
      await mcpClient.callTool({
        name: "debug_project_state",
        arguments: { projectId: "e2e_live_sync", timestamp: 2.1, checkDiskAssets: true },
      }),
    );
    expect(dbg.projectId).toBe("e2e_live_sync");
    expect(dbg.counts.snapshots).toBeGreaterThan(0);
    expect(dbg.frameDebug.sceneId).toBe("scene_01_hook");
    expect(dbg.frameDebug.activeLayers.length).toBeGreaterThan(0);
    expect(dbg.frameDebug.activeSubtitle).not.toBeNull();
    expect(dbg.missingOnDisk).toHaveLength(0);

    // 4. Audio & subtitle sync analysis
    const audioAnalysis = parseJsonToolResult<{
      projectId: string;
      voiceSubtitleSync: { subtitleCueCount: number; totalSubtitleWords: number };
    }>(
      await mcpClient.callTool({
        name: "analyze_audio_and_tts",
        arguments: { mode: "project_audio", projectId: "e2e_live_sync" },
      }),
    );
    expect(audioAnalysis.projectId).toBe("e2e_live_sync");
    expect(audioAnalysis.voiceSubtitleSync.subtitleCueCount).toBeGreaterThan(0);
    expect(audioAnalysis.voiceSubtitleSync.totalSubtitleWords).toBeGreaterThan(0);

    // 5. Studio self-diagnostics (fast mode without smoke render to keep test snappy)
    const diag = parseJsonToolResult<{
      ok: boolean;
      capabilities: { ffmpegVersion: string | null };
      ttsProviders: { id: string }[];
      librariesSummary: { id: string }[];
    }>(
      await mcpClient.callTool({
        name: "run_studio_diagnostics",
        arguments: { checkPython: false, checkTts: true, checkLibraries: true },
      }),
    );
    expect(diag.ok).toBe(true);
    expect(diag.capabilities.ffmpegVersion).toBeTruthy();
    expect(diag.ttsProviders.length).toBe(7);
    expect(diag.librariesSummary.length).toBeGreaterThan(0);
  }, 60_000);
});
