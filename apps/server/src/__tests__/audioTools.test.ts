import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

describe("@storia/server — Audio DSP (denoise/normalize) & Transitions with SFX", () => {
  let tmpDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-audio-tools-"));
    app = await buildServer({ projectsDir: tmpDir, logger: false });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "audio_fx_proj", template: "demo" },
    });
    expect(created.statusCode).toBe(201);

    // Generate a 1.2s test WAV and upload it as an audio asset + clip on track_voice
    const wavPath = path.join(tmpDir, "voice_sample.wav");
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "sine=frequency=320:duration=1.2",
      "-ar", "48000", "-ac", "2", wavPath,
    ]);
    const wavBase64 = (await fs.readFile(wavPath)).toString("base64");
    const uploaded = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/assets",
      payload: {
        id: "aud_voice_sample",
        name: "Voz Demo",
        filename: "voice_sample.wav",
        kind: "audio",
        base64: wavBase64,
      },
    });
    expect(uploaded.statusCode).toBe(201);

    const addedClip = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/operations",
      payload: {
        source: "ui",
        operations: [
          {
            op: "audioClip.upsert",
            trackId: "track_voice",
            clip: {
              id: "clip_voice_1",
              name: "Narración",
              assetId: "aud_voice_sample",
              start: 0,
              duration: 1.2,
            },
          },
        ],
      },
    });
    expect(addedClip.statusCode).toBe(200);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("processes an audio clip with denoise and normalize (-16 LUFS) and updates the clip atomically", async () => {
    const denoiseRes = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/audio/process",
      payload: {
        trackId: "track_voice",
        clipId: "clip_voice_1",
        action: "denoise",
      },
    });
    expect(denoiseRes.statusCode).toBe(200);
    const denoiseJson = denoiseRes.json();
    expect(denoiseJson.asset.name).toContain("Sin Ruido");
    expect(denoiseJson.durationSec).toBeCloseTo(1.2, 1);

    const normRes = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/audio/process",
      payload: {
        trackId: "track_voice",
        clipId: "clip_voice_1",
        action: "normalize",
      },
    });
    expect(normRes.statusCode).toBe(200);
    expect(normRes.json().asset.name).toContain("-16 LUFS");
  });

  it("applies a CapCut-style transition with procedural sound effect across all cuts", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/transitions/apply",
      payload: {
        applyToAll: true,
        addSoundEffect: true,
        transition: {
          type: "whip_left",
          duration: 0.4,
          accentColor: "#ffd447",
          sfxPreset: "whip",
          sfxVolume: 0.8,
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.appliedCount).toBeGreaterThanOrEqual(1);
    expect(json.sfxAssetId).toBe("sfx_trans_whip");

    const proj = json.project;
    expect(proj.scenes[0].transitionOut.type).toBe("whip_left");
    expect(proj.scenes[1].transitionIn.type).toBe("whip_left");
    const sfxTrack = proj.audioTracks.find((t: { role: string }) => t.role === "sfx");
    expect(sfxTrack).toBeDefined();
    expect(sfxTrack.clips.some((c: { assetId: string }) => c.assetId === "sfx_trans_whip")).toBe(true);

    // Changing a single cut between scenes[0] and scenes[1] must update BOTH scenes[0].transitionOut and scenes[1].transitionIn
    const singleRes = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/transitions/apply",
      payload: {
        sceneId: proj.scenes[1].id,
        applyToAll: false,
        addSoundEffect: true,
        transition: {
          type: "flash",
          duration: 0.35,
          accentColor: "#ffffff",
          sfxPreset: "flash",
          sfxVolume: 0.75,
        },
      },
    });
    expect(singleRes.statusCode).toBe(200);
    const singleProj = singleRes.json().project;
    expect(singleProj.scenes[0].transitionOut.type).toBe("flash");
    expect(singleProj.scenes[0].transitionOut.duration).toBe(0.35);
    expect(singleProj.scenes[1].transitionIn.type).toBe("flash");
    expect(singleProj.scenes[1].transitionIn.duration).toBe(0.35);

    // Switching that cut back to "cut" resets BOTH halves and removes the transition SFX clip
    const cutRes = await app.inject({
      method: "POST",
      url: "/api/projects/audio_fx_proj/transitions/apply",
      payload: {
        sceneId: proj.scenes[1].id,
        applyToAll: false,
        addSoundEffect: false,
        transition: {
          type: "cut",
          duration: 0,
          sfxPreset: "none",
        },
      },
    });
    expect(cutRes.statusCode).toBe(200);
    const cutProj = cutRes.json().project;
    expect(cutProj.scenes[0].transitionOut.type).toBe("cut");
    expect(cutProj.scenes[0].transitionOut.duration).toBe(0);
    expect(cutProj.scenes[1].transitionIn.type).toBe("cut");
    expect(cutProj.scenes[1].transitionIn.duration).toBe(0);
    const sfxAfterCut = cutProj.audioTracks.find((t: { role: string }) => t.role === "sfx");
    expect(sfxAfterCut.clips.some((c: { id: string }) => c.id.includes(proj.scenes[1].id))).toBe(false);
  });
});
