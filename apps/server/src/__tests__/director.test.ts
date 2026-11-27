import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

describe("@storia/server — Stickman Video Director & Studio Pro Styles integration (23 styles, 890 audio, 5 OFL fonts, auto-director)", () => {
  let tmpDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-director-test-"));
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      logger: false,
    });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("exposes all 23 animation styles, 5 bundled OFL fonts, 83 direction guides, and 890 curated audio assets", async () => {
    const stylesRes = await app.inject({ method: "GET", url: "/api/director/styles" });
    expect(stylesRes.statusCode).toBe(200);
    const stylesBody = stylesRes.json();
    expect(stylesBody.styles).toHaveLength(23);
    const styleIds = stylesBody.styles.map((s: { id: string }) => s.id);
    expect(styleIds).toEqual(
      expect.arrayContaining([
        "storia_editorial",
        "c1_stylized_3d",
        "c2_kurzgesagt",
        "c3_anime_cel",
        "c4_retro_psx",
        "c5_paper_cutout",
        "b7_pixel_theater",
        "b8_greek_mythology",
      ]),
    );
    expect(stylesBody.available).toBe(true);
    expect(stylesBody.curatedAudioCount).toBe(890);
    expect(stylesBody.fonts.length).toBeGreaterThanOrEqual(5);
    expect(stylesBody.guides.length).toBeGreaterThanOrEqual(70);

    // Bundled OFL font download
    const fontRes = await app.inject({ method: "GET", url: "/api/fonts/Caveat.ttf" });
    expect(fontRes.statusCode).toBe(200);
    expect(fontRes.headers["content-type"]).toContain("font/ttf");
    expect(fontRes.rawPayload.byteLength).toBeGreaterThan(50_000);

    // Direction guide reader
    const guideRes = await app.inject({ method: "GET", url: "/api/director/guides/style-catalog.md" });
    expect(guideRes.statusCode).toBe(200);
    expect(guideRes.json().content).toContain("Style Catalog");

    // Style + beat audio recommendation
    const recRes = await app.inject({ method: "GET", url: "/api/director/audio/recommend?style=B6&beat=opening&limit=4" });
    expect(recRes.statusCode).toBe(200);
    const recBody = recRes.json();
    expect(recBody.totalLibraryAssets).toBe(890);
    expect(recBody.music.length).toBeGreaterThan(0);

    // All 890 curated assets are searchable inside local Audio Library
    const libRes = await app.inject({ method: "GET", url: "/api/libraries/audio?source=local&q=kenney&pageSize=10" });
    expect(libRes.statusCode).toBe(200);
    const libBody = libRes.json();
    expect(libBody.localCount).toBe(890);
    expect(libBody.items.length).toBeGreaterThan(0);
  });

  it("assembles a complete styled multi-scene video with role wardrobe, auto BGM, SFX, and captions in one call", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "directed_demo", name: "Directed Demo", template: "blank" },
    });
    expect(createRes.statusCode).toBe(201);

    const assembleRes = await app.inject({
      method: "POST",
      url: "/api/projects/directed_demo/director/assemble",
      payload: {
        name: "Mito de Midas",
        styleId: "b8_greek_mythology",
        aspectRatio: "9:16",
        resolution: "1080p",
        fps: 30,
        cast: [
          { id: "midas", name: "Rey Midas", role: "noble", age: "adult", genderPresentation: "masculine" },
          { id: "guard", name: "Guardia", role: "knight", age: "adult", genderPresentation: "masculine" },
        ],
        scenes: [
          {
            name: "El deseo dorado",
            duration: 4.5,
            headline: "EL TOQUE DE ORO",
            narrationText: "El rey Midas deseaba que todo lo que tocara se convirtiera en oro puro.",
            framing: "medium",
            beatTag: "opening",
            characters: [
              { characterId: "midas", x: 0.42, y: 0.85, pose: "present", expression: "proud", talk: true },
              { characterId: "guard", x: 0.74, y: 0.85, pose: "idle", expression: "neutral", flipX: true },
            ],
          },
          {
            name: "La maldición",
            duration: 4.0,
            headline: "PERO HABÍA UN PRECIO",
            narrationText: "Cuando intentó comer, incluso su comida se volvió metal frío.",
            framing: "closeup",
            beatTag: "reveal",
            sfxQuery: "impact",
            characters: [
              { characterId: "midas", x: 0.5, y: 0.85, pose: "despair", expression: "shock", talk: true },
            ],
          },
        ],
        autoMusic: true,
        autoSfx: true,
      },
    });

    expect(assembleRes.statusCode).toBe(200);
    const body = assembleRes.json();
    expect(body.styleApplied).toContain("B8");
    expect(body.scenesBuilt).toBe(2);
    expect(body.castBuilt).toBe(2);
    expect(body.musicAdded).toBeTruthy();
    expect(body.sfxAddedCount).toBeGreaterThanOrEqual(1);
    expect(body.subtitlesCount).toBeGreaterThanOrEqual(2);
    expect(body.project.animationStyle).toBe("b8_greek_mythology");
    expect(body.project.subtitles.style.fontFamily).toBe("NotoSans");
    expect(body.project.audioTracks.some((t: { role: string }) => t.role === "music")).toBe(true);
    expect(body.project.audioTracks.some((t: { role: string }) => t.role === "sfx")).toBe(true);
  });
});
