import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");
const REMOTE_CLIENT = ["203", "0", "113", "88"].join(".");
const SAMPLE_TUNNEL_HOST = ["storia-onboard-test", "ngrok-free", "app"].join(".");

describe("@storia/server — First-Run Desktop Onboarding & Public Library Cleanliness", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let projectsDir: string;
  let modelsDir: string;
  let onboardingConfigPath: string;
  let bootstrapConfigPath: string;
  let customProjectsDir: string;
  let customModelsDir: string;
  let customAssetsDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-onboarding-test-"));
    projectsDir = path.join(tmpDir, "projects");
    modelsDir = path.join(tmpDir, "models");
    onboardingConfigPath = path.join(modelsDir, "config", "onboarding.json");
    bootstrapConfigPath = path.join(tmpDir, "desktop-bootstrap.json");
    customProjectsDir = path.join(tmpDir, "custom-projects");
    customModelsDir = path.join(tmpDir, "custom-models");
    customAssetsDir = path.join(tmpDir, "my-assets");

    app = await buildServer({
      projectsDir,
      modelsDir,
      ttsModelsDir: path.join(modelsDir, "tts"),
      connectivityConfigPath: path.join(modelsDir, "config", "connectivity.json"),
      librariesConfigPath: path.join(modelsDir, "config", "libraries.json"),
      oauthStorePath: path.join(modelsDir, "config", "mcp-oauth.json"),
      onboardingConfigPath,
      bootstrapConfigPath,
      stickmanDirectorDir: path.join(tmpDir, "nonexistent-director"),
      isDesktopApp: true,
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("hides personal local_videos and local_workspace libraries by default in public/desktop builds", async () => {
    const catRes = await app.inject({ method: "GET", url: "/api/libraries/catalog" });
    expect(catRes.statusCode).toBe(200);
    const cat = catRes.json();
    const ids = cat.libraries.map((l: { id: string }) => l.id);

    expect(ids).toContain("openverse");
    expect(ids).toContain("iconify");
    expect(ids).toContain("wikimedia");
    expect(ids).toContain("svg_backgrounds");
    expect(ids).not.toContain("local_videos");
    expect(ids).not.toContain("local_workspace");
    expect(cat.enabled.local_videos).toBe(false);
    expect(cat.enabled.local_workspace).toBe(false);
  });

  it("shows onboarding strictly on first run, persists paths/bootstrap/libraries, seeds starter project, and never shows again", async () => {
    // 1. First launch -> shouldShow MUST be true locally, and false over remote tunnels
    const firstLocal = await app.inject({ method: "GET", url: "/api/onboarding/status" });
    expect(firstLocal.statusCode).toBe(200);
    expect(firstLocal.json().completed).toBe(false);
    expect(firstLocal.json().shouldShow).toBe(true);
    expect(firstLocal.json().isDesktopApp).toBe(true);

    // Remote tunnel cannot complete or skip onboarding (403)
    const remoteAttempt = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      headers: {
        "x-forwarded-for": REMOTE_CLIENT,
        "x-forwarded-host": SAMPLE_TUNNEL_HOST,
        "x-forwarded-proto": "https",
      },
      payload: { createStarterProject: false },
    });
    expect(remoteAttempt.statusCode).toBe(403);

    // MCP client also blocked from mutating onboarding (403)
    const mcpAttempt = await app.inject({
      method: "POST",
      url: "/api/onboarding/skip",
      headers: { "x-storia-client": "mcp" },
      payload: {},
    });
    expect(mcpAttempt.statusCode).toBe(403);

    // 2. Complete onboarding with custom directories, libraries & preferences
    const completeRes = await app.inject({
      method: "POST",
      url: "/api/onboarding/complete",
      payload: {
        projectsDir: customProjectsDir,
        modelsDir: customModelsDir,
        customAssetsDir,
        enabledLibraries: {
          openverse: true,
          iconify: true,
          wikimedia: false,
          svg_backgrounds: true,
        },
        connectivity: {
          accessMode: "local",
          mcpHttpEnabled: true,
          mcpAuthEnabled: true,
        },
        preferences: {
          theme: "dark",
          language: "es",
          defaultAspectRatio: "16:9",
          defaultResolution: "1080p",
          defaultFps: 30,
          defaultTtsProvider: "piper",
          whisperModel: "small",
        },
        createStarterProject: true,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const body = completeRes.json();
    expect(body.completed).toBe(true);
    expect(body.restartRequired).toBe(true);
    expect(body.starterProjectId).toBe("starter_story_project");

    // 3. Subsequent launches MUST have shouldShow === false & completed === true
    const secondCheck = await app.inject({ method: "GET", url: "/api/onboarding/status" });
    expect(secondCheck.statusCode).toBe(200);
    expect(secondCheck.json().completed).toBe(true);
    expect(secondCheck.json().shouldShow).toBe(false);

    // 4. Desktop bootstrap JSON & mirrored onboarding.json inside customModelsDir exist
    const bootstrapRaw = JSON.parse(await fs.readFile(bootstrapConfigPath, "utf8"));
    expect(path.resolve(bootstrapRaw.projectsDir)).toBe(path.resolve(customProjectsDir));
    expect(path.resolve(bootstrapRaw.modelsDir)).toBe(path.resolve(customModelsDir));
    expect(path.resolve(bootstrapRaw.customAssetsDir)).toBe(path.resolve(customAssetsDir));

    const mirroredOnboarding = JSON.parse(
      await fs.readFile(path.join(customModelsDir, "config", "onboarding.json"), "utf8"),
    );
    expect(mirroredOnboarding.completed).toBe(true);

    // 5. Libraries config & customAssetsDir took effect
    const catAfter = await app.inject({ method: "GET", url: "/api/libraries/catalog" });
    expect(catAfter.statusCode).toBe(200);
    expect(catAfter.json().enabled.svg_backgrounds).toBe(true);
    expect(catAfter.json().enabled.wikimedia).toBe(false);
    expect(catAfter.json().libraries.some((l: { id: string }) => l.id === "local_workspace")).toBe(true);
  });
});
