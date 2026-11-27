import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

describe("@storia/server — Multi-Provider TTS Suite (SAPI, ElevenLabs, VoiceStudio, Piper, Kokoro, OpenAI, Custom API)", () => {
  let tmpRoot: string;
  let projectsDir: string;
  let ttsModelsDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "storia-tts-test-"));
    projectsDir = path.join(tmpRoot, "projects");
    ttsModelsDir = path.join(tmpRoot, "models-tts");

    app = await buildServer({
      projectsDir,
      ttsModelsDir,
      logger: false,
    });

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "tts_proj_01", template: "demo" },
    });
    expect(created.statusCode).toBe(201);
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("exposes all 7 TTS providers, persists config without leaking secrets, and lists voices", async () => {
    const provRes = await app.inject({ method: "GET", url: "/api/tts/providers" });
    expect(provRes.statusCode).toBe(200);
    const provJson = provRes.json();
    const ids = provJson.providers.map((p: { id: string }) => p.id);
    expect(ids).toEqual([
      "windows_sapi",
      "elevenlabs",
      "voicestudio",
      "piper",
      "kokoro",
      "openai",
      "custom_api",
    ]);

    // Update settings and ensure API keys are never echoed back in plaintext
    const cfgRes = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      payload: {
        elevenlabsApiKey: "sk_test_secret_12345",
        elevenlabsModel: "eleven_flash_v2_5",
        voiceStudioUrl: ["http://", "localhost", ":8099"].join(""),
      },
    });
    expect(cfgRes.statusCode).toBe(200);
    const cfgJson = cfgRes.json();
    expect(cfgJson.config.hasElevenlabsKey).toBe(true);
    expect(cfgJson.config.elevenlabsModel).toBe("eleven_flash_v2_5");
    expect(JSON.stringify(cfgJson)).not.toContain("sk_test_secret_12345");

    // Piper & Kokoro voice catalogs list Spanish and English voices
    const piperVoices = await app.inject({ method: "GET", url: "/api/tts/voices?provider=piper" });
    expect(piperVoices.statusCode).toBe(200);
    expect(piperVoices.json().voices.some((v: { language: string }) => v.language.startsWith("es"))).toBe(true);

    const kokoroVoices = await app.inject({ method: "GET", url: "/api/tts/voices?provider=kokoro" });
    expect(kokoroVoices.statusCode).toBe(200);
    expect(kokoroVoices.json().voices.some((v: { id: string }) => v.id === "ef_dora")).toBe(true);
  });

  it("synthesizes real offline audio with Windows SAPI (when available), inserts onto timeline, and replaces in-place", async () => {
    const voicesRes = await app.inject({ method: "GET", url: "/api/tts/voices?provider=windows_sapi" });
    expect(voicesRes.statusCode).toBe(200);
    const winVoices = voicesRes.json().voices as { id: string; language: string }[];
    if (winVoices.length === 0) {
      // Non-Windows headless CI fallback: verify clean error handling on empty text
      const bad = await app.inject({
        method: "POST",
        url: "/api/projects/tts_proj_01/tts/generate",
        payload: { provider: "windows_sapi", text: "" },
      });
      expect(bad.statusCode).toBe(400);
      return;
    }

    const chosen = winVoices.find((v) => v.language.toLowerCase().startsWith("es")) ?? winVoices[0]!;

    // 1. Preview endpoint returns real WAV bytes
    const prev = await app.inject({
      method: "POST",
      url: "/api/tts/preview",
      payload: {
        provider: "windows_sapi",
        text: "Hola desde Storia Studio.",
        voiceId: chosen.id,
        speed: 1.05,
      },
    });
    expect(prev.statusCode).toBe(200);
    expect(prev.headers["content-type"]).toContain("audio/wav");
    expect(prev.rawPayload.byteLength).toBeGreaterThan(2000);

    // 2. Generate & insert into project voice track
    const gen = await app.inject({
      method: "POST",
      url: "/api/projects/tts_proj_01/tts/generate",
      payload: {
        provider: "windows_sapi",
        text: "Prueba de narración automática en el timeline.",
        voiceId: chosen.id,
        clipName: "Voz Test 1",
        insertToTimeline: true,
        startSec: 1.5,
      },
    });
    expect(gen.statusCode).toBe(201);
    const genJson = gen.json();
    expect(genJson.durationSec).toBeGreaterThan(0.5);
    expect(genJson.insertedClipId).toBeTruthy();
    expect(genJson.trackId).toBe("track_voice");

    // 3. Replace that exact clip in-place via TTS
    const rep = await app.inject({
      method: "POST",
      url: "/api/projects/tts_proj_01/tts/generate",
      payload: {
        provider: "windows_sapi",
        text: "Nueva locución reemplazada.",
        voiceId: chosen.id,
        clipName: "Voz Reemplazada",
        insertToTimeline: true,
        replaceTrackId: genJson.trackId,
        replaceClipId: genJson.insertedClipId,
      },
    });
    expect(rep.statusCode).toBe(201);
    const repJson = rep.json();
    expect(repJson.insertedClipId).toBe(genJson.insertedClipId);
    const voiceTrack = repJson.project.audioTracks.find((t: { id: string }) => t.id === genJson.trackId);
    const updatedClip = voiceTrack.clips.find((c: { id: string }) => c.id === genJson.insertedClipId);
    expect(updatedClip.start).toBe(1.5);
    expect(updatedClip.name).toBe("Voz Reemplazada");
  }, 20_000);

  it("generates TTS narration directly from existing subtitles in both grouped (1 piece) and individual (per-cue synced) modes", async () => {
    const voicesRes = await app.inject({ method: "GET", url: "/api/tts/voices?provider=windows_sapi" });
    expect(voicesRes.statusCode).toBe(200);
    const winVoices = voicesRes.json().voices as { id: string; language: string }[];
    if (winVoices.length === 0) return;
    const chosen = winVoices.find((v) => v.language.toLowerCase().startsWith("es")) ?? winVoices[0]!;

    // 1. Grouped mode (1 continuous audio piece from all subtitle blocks)
    const grouped = await app.inject({
      method: "POST",
      url: "/api/projects/tts_proj_01/tts/from-subtitles",
      payload: {
        provider: "windows_sapi",
        mode: "grouped",
        voiceId: chosen.id,
        replaceExistingVoiceClips: true,
      },
    });
    expect(grouped.statusCode).toBe(201);
    const groupedJson = grouped.json();
    expect(groupedJson.mode).toBe("grouped");
    expect(groupedJson.clipsCreated).toBe(1);
    expect(groupedJson.cuesProcessed).toBeGreaterThanOrEqual(2);
    expect(groupedJson.totalDurationSec).toBeGreaterThan(0.8);
    const groupedVoiceTrack = groupedJson.project.audioTracks.find((t: { id: string }) => t.id === groupedJson.trackId);
    expect(groupedVoiceTrack.clips).toHaveLength(1);

    // 2. Individual mode (1 dedicated TTS clip per subtitle + timing sync without overlaps)
    const indiv = await app.inject({
      method: "POST",
      url: "/api/projects/tts_proj_01/tts/from-subtitles",
      payload: {
        provider: "windows_sapi",
        mode: "individual",
        voiceId: chosen.id,
        replaceExistingVoiceClips: true,
        syncSubtitleTimings: true,
        minGapSec: 0.08,
      },
    });
    expect(indiv.statusCode).toBe(201);
    const indivJson = indiv.json();
    expect(indivJson.mode).toBe("individual");
    expect(indivJson.clipsCreated).toBe(indivJson.cuesProcessed);
    expect(indivJson.cuesUpdated).toBe(indivJson.cuesProcessed);
    const indivTrack = indivJson.project.audioTracks.find((t: { id: string }) => t.id === indivJson.trackId);
    expect(indivTrack.clips).toHaveLength(indivJson.cuesProcessed);
    for (let i = 1; i < indivTrack.clips.length; i++) {
      const prev = indivTrack.clips[i - 1];
      const cur = indivTrack.clips[i];
      expect(cur.start).toBeGreaterThanOrEqual(prev.start + prev.duration - 0.01);
    }
  }, 30_000);
});
