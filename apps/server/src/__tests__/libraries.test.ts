import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

describe("@storia/server — Vector Library & Openverse-SFX Local/Online Integration", () => {
  let tmpRoot: string;
  let projectsDir: string;
  let videosDir: string;
  let workspaceAssetsDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "storia-libs-test-"));
    projectsDir = path.join(tmpRoot, "projects");
    videosDir = path.join(tmpRoot, "storia-output");
    workspaceAssetsDir = path.join(tmpRoot, "assets");

    // Populate mock previous-video SVGs & audio
    await fs.mkdir(path.join(videosDir, "video14", "assets", "backgrounds"), { recursive: true });
    await fs.mkdir(path.join(videosDir, "video14", "assets", "sprites"), { recursive: true });
    await fs.mkdir(path.join(videosDir, "video14", "assets", "sfx"), { recursive: true });
    await fs.mkdir(path.join(workspaceAssetsDir, "svgs-icons", "icons-svg"), { recursive: true });
    await fs.mkdir(path.join(workspaceAssetsDir, "sfx", "sfx_footsteps_psx-style"), { recursive: true });

    await fs.writeFile(
      path.join(videosDir, "video14", "assets", "backgrounds", "bg_01_astral_clockwork.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#0d1224"/></svg>',
      "utf8",
    );
    await fs.writeFile(
      path.join(videosDir, "video14", "assets", "sprites", "sprite_pocket_watch_intact.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="100" fill="#ffd447"/></svg>',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceAssetsDir, "svgs-icons", "icons-svg", "hourglass-retro.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#f7c8d6"/></svg>',
      "utf8",
    );

    // Generate two tiny valid WAV files via FFmpeg so ffprobe duration detection is also exercised
    const whooshWav = path.join(videosDir, "video14", "assets", "sfx", "ov_deep_whoosh.wav");
    const stepWav = path.join(workspaceAssetsDir, "sfx", "sfx_footsteps_psx-style", "psx_step_01.wav");
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=0.6",
      "-ar", "48000", "-ac", "2", whooshWav,
    ]);
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "sine=frequency=220:duration=0.4",
      "-ar", "48000", "-ac", "2", stepWav,
    ]);

    app = await buildServer({
      projectsDir,
      videosDir,
      workspaceAssetsDir,
      stickmanDirectorDir: path.join(tmpRoot, "empty-director"),
      librariesConfigPath: path.join(tmpRoot, "libraries.json"),
      logger: false,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "lib_proj_01", template: "demo" },
    });
    expect(created.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("indexes, filters, previews, and imports local video & workspace vectors as sprite and background layers", async () => {
    // 1. Search all local vectors
    const allRes = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=all" });
    expect(allRes.statusCode).toBe(200);
    const allJson = allRes.json();
    expect(allJson.total).toBe(3);
    expect(allJson.facets.videos).toEqual(["video14"]);
    expect(allJson.facets.counts).toEqual({ videos: 2, workspace: 1 });

    // 2. Filter by category=sprites & query="watch"
    const watchRes = await app.inject({
      method: "GET",
      url: "/api/libraries/vectors?source=videos&category=sprites&q=watch",
    });
    expect(watchRes.statusCode).toBe(200);
    const watchJson = watchRes.json();
    expect(watchJson.total).toBe(1);
    const watchItem = watchJson.items[0];
    expect(watchItem.video).toBe("video14");

    // 3. Preview endpoint returns image/svg+xml
    const previewRes = await app.inject({ method: "GET", url: watchItem.previewUrl });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.headers["content-type"]).toContain("image/svg+xml");
    expect(previewRes.body).toContain("<svg");

    // 4. Import sprite into scene_01_hook
    const impSprite = await app.inject({
      method: "POST",
      url: "/api/projects/lib_proj_01/libraries/vectors/import",
      payload: {
        itemId: watchItem.id,
        name: watchItem.name,
        source: "videos",
        category: "sprites",
        license: watchItem.license,
        insertMode: "sprite",
        sceneId: "scene_01_hook",
      },
    });
    expect(impSprite.statusCode).toBe(201);
    const impSpriteJson = impSprite.json();
    expect(impSpriteJson.insertedLayerId).toBeTruthy();
    expect(impSpriteJson.receipt.operationsCount).toBe(2);

    // 5. Import background into scene_01_hook (replaces existing bg layer)
    const bgItem = allJson.items.find((i: { category: string }) => i.category === "backgrounds");
    const impBg = await app.inject({
      method: "POST",
      url: "/api/projects/lib_proj_01/libraries/vectors/import",
      payload: {
        itemId: bgItem.id,
        name: bgItem.name,
        source: "videos",
        category: "backgrounds",
        insertMode: "background",
        sceneId: "scene_01_hook",
      },
    });
    expect(impBg.statusCode).toBe(201);
    const scene1 = impBg.json().project.scenes.find((s: { id: string }) => s.id === "scene_01_hook");
    const bgLayer = scene1.layers.find((l: { type: string }) => l.type === "background");
    expect(bgLayer.sourceType).toBe("asset");
    expect(bgLayer.assetId).toBe(impBg.json().asset.id);
  });

  it("indexes, filters, previews, and imports local SFX into timeline with exact ffprobe duration and credits.txt", async () => {
    // 1. Search local audio with PSX filter
    const psxRes = await app.inject({
      method: "GET",
      url: "/api/libraries/audio?source=local&category=psx",
    });
    expect(psxRes.statusCode).toBe(200);
    const psxJson = psxRes.json();
    expect(psxJson.total).toBe(1);
    expect(psxJson.items[0].tags).toContain("psx");

    // 2. Search local audio for whoosh
    const whooshRes = await app.inject({
      method: "GET",
      url: "/api/libraries/audio?source=local&q=whoosh",
    });
    expect(whooshRes.statusCode).toBe(200);
    const whooshItem = whooshRes.json().items[0];
    expect(whooshItem).toBeDefined();

    // 3. Preview audio bytes (full + 206 Partial Content Range streaming)
    const prevRes = await app.inject({ method: "GET", url: whooshItem.previewUrl });
    expect(prevRes.statusCode).toBe(200);
    expect(prevRes.headers["content-type"]).toContain("audio/wav");

    const rangeRes = await app.inject({
      method: "GET",
      url: whooshItem.previewUrl,
      headers: { range: "bytes=0-1023" },
    });
    expect(rangeRes.statusCode).toBe(206);
    expect(rangeRes.headers["content-range"]).toMatch(/^bytes 0-1023\//);
    expect(rangeRes.rawPayload.byteLength).toBe(1024);

    // 4. Import into project timeline at 1.25s
    const impAudio = await app.inject({
      method: "POST",
      url: "/api/projects/lib_proj_01/libraries/audio/import",
      payload: {
        itemId: whooshItem.id,
        name: whooshItem.name,
        category: "sfx",
        source: "local_videos",
        license: "CC0 1.0",
        author: "Kinoton",
        insertToTimeline: true,
        startSec: 1.25,
      },
    });
    expect(impAudio.statusCode).toBe(201);
    const impJson = impAudio.json();
    expect(impJson.durationSec).toBeCloseTo(0.6, 1);
    expect(impJson.insertedClipId).toBeTruthy();
    expect(impJson.trackId).toBe("track_sfx");

    // 5. Replace that same clip in-place with the PSX step audio while keeping its clipId & start time
    const repAudio = await app.inject({
      method: "POST",
      url: "/api/projects/lib_proj_01/libraries/audio/import",
      payload: {
        itemId: psxJson.items[0].id,
        name: "PSX Step Replaced",
        category: "sfx",
        source: "local_workspace",
        insertToTimeline: true,
        replaceTrackId: impJson.trackId,
        replaceClipId: impJson.insertedClipId,
        preserveClipDuration: false,
      },
    });
    expect(repAudio.statusCode).toBe(201);
    const repJson = repAudio.json();
    expect(repJson.insertedClipId).toBe(impJson.insertedClipId);
    const replacedClip = repJson.project.audioTracks
      .find((t: { id: string }) => t.id === impJson.trackId)
      .clips.find((c: { id: string }) => c.id === impJson.insertedClipId);
    expect(replacedClip.start).toBe(1.25);
    expect(replacedClip.name).toBe("PSX Step Replaced");
    expect(replacedClip.duration).toBeCloseTo(0.4, 1);

    const creditsTxt = await fs.readFile(path.join(projectsDir, "lib_proj_01", "credits.txt"), "utf8");
    expect(creditsTxt).toContain("Kinoton");
    expect(creditsTxt).toContain("CC0 1.0");
  });

  it("exposes compatible libraries catalog with Openverse enabled by default, enables built-in SVG backgrounds, and hides all resources of disabled libraries", async () => {
    // 1. Default catalog has Openverse enabled + 9 compatible libraries
    const catRes = await app.inject({ method: "GET", url: "/api/libraries/catalog" });
    expect(catRes.statusCode).toBe(200);
    const cat = catRes.json();
    expect(cat.libraries.length).toBeGreaterThanOrEqual(9);
    expect(cat.enabled.openverse).toBe(true);
    expect(cat.enabled.svg_backgrounds).toBe(false);

    // Disabled built-in svg_backgrounds returns 0 items and disabledLibrary=true
    const bgOff = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=svg_backgrounds" });
    expect(bgOff.statusCode).toBe(200);
    expect(bgOff.json().items).toHaveLength(0);
    expect(bgOff.json().disabledLibrary).toBe(true);

    // 2. Enable svg_backgrounds and verify all 18 editable SVG backgrounds appear & preview works
    const enableBg = await app.inject({
      method: "POST",
      url: "/api/libraries/config",
      payload: { enabled: { svg_backgrounds: true } },
    });
    expect(enableBg.statusCode).toBe(200);
    expect(enableBg.json().enabled.svg_backgrounds).toBe(true);

    const bgOn = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=svg_backgrounds" });
    expect(bgOn.statusCode).toBe(200);
    expect(bgOn.json().total).toBeGreaterThanOrEqual(18);
    const firstBg = bgOn.json().items[0];
    const bgPrev = await app.inject({ method: "GET", url: firstBg.previewUrl });
    expect(bgPrev.statusCode).toBe(200);
    expect(bgPrev.body).toContain("<svg");

    // 3. Disable openverse & local_videos -> their resources MUST disappear completely
    const disableRes = await app.inject({
      method: "POST",
      url: "/api/libraries/config",
      payload: { enabled: { openverse: false, local_videos: false } },
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().enabled.openverse).toBe(false);
    expect(disableRes.json().enabled.local_videos).toBe(false);

    const ovAudio = await app.inject({ method: "GET", url: "/api/libraries/audio?source=openverse&q=whoosh" });
    expect(ovAudio.statusCode).toBe(200);
    expect(ovAudio.json().items).toHaveLength(0);
    expect(ovAudio.json().disabledLibrary).toBe(true);

    const ovVec = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=openverse&q=clock" });
    expect(ovVec.statusCode).toBe(200);
    expect(ovVec.json().items).toHaveLength(0);
    expect(ovVec.json().disabledLibrary).toBe(true);

    const vidVec = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=videos" });
    expect(vidVec.statusCode).toBe(200);
    expect(vidVec.json().items).toHaveLength(0);
    expect(vidVec.json().disabledLibrary).toBe(true);

    // Local "all" vectors should no longer contain any "videos" items
    const allVecAfter = await app.inject({ method: "GET", url: "/api/libraries/vectors?source=all" });
    expect(allVecAfter.statusCode).toBe(200);
    expect(allVecAfter.json().items.some((it: { source: string }) => it.source === "videos")).toBe(false);

    // Local audio should no longer contain local_videos (ov_deep_whoosh.wav)
    const locAudAfter = await app.inject({ method: "GET", url: "/api/libraries/audio?source=local&q=whoosh" });
    expect(locAudAfter.statusCode).toBe(200);
    expect(locAudAfter.json().items).toHaveLength(0);
  });
});
