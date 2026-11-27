import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");
const REMOTE_CLIENT = ["203", "0", "113", "99"].join(".");
const SAMPLE_TUNNEL_HOST = ["storia-upd-test", "ngrok-free", "app"].join(".");
const REPO_SLUG = "Mairon31/storia_studio";
const GH_BASE = ["https://", "github.com/", REPO_SLUG].join("");

describe("@storia/server — Stable & Nightly Auto-Updater (Channels, Commit Check, SHA-256 & Zero-Trust)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let fakeInstallerBytes: Buffer;
  let fakeInstallerSha: string;
  let tamperNextDownload = false;

  const installedSha = "1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const remoteNightlySha = "2222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-updater-test-"));
    const buildInfoPath = path.join(tmpDir, "build-info.json");
    await fs.writeFile(
      buildInfoPath,
      JSON.stringify({
        version: "0.2.0",
        channel: "stable",
        commitSha: installedSha,
        commitShort: "1111111",
        commitMessage: "initial stable build",
        builtAt: "2026-11-27T10:00:00.000Z",
        repo: REPO_SLUG,
      }),
      "utf8",
    );

    fakeInstallerBytes = Buffer.from("STORIA_FAKE_NSIS_INSTALLER_PAYLOAD_v0.2.0_NIGHTLY", "utf8");
    fakeInstallerSha = crypto.createHash("sha256").update(fakeInstallerBytes).digest("hex");

    const mockFetch = async (url: string): Promise<Response> => {
      if (url.endsWith("/latest-stable.json")) {
        return new Response(
          JSON.stringify({
            channel: "stable",
            tag: "v0.2.0",
            version: "0.2.0",
            commitSha: installedSha,
            commitShort: "1111111",
            commitMessage: "Stable v0.2.0",
            publishedAt: "2026-11-27T10:00:00.000Z",
            releaseUrl: `${GH_BASE}/releases/tag/v0.2.0`,
            notes: "Stable release",
            assets: {
              "windows-x64": {
                filename: "Storia Studio_0.2.0_x64-setup.exe",
                url: `${GH_BASE}/releases/download/v0.2.0/setup.exe`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "nsis",
              },
              "linux-x64": {
                filename: "Storia_Studio_0.2.0_amd64.AppImage",
                url: `${GH_BASE}/releases/download/v0.2.0/storia.AppImage`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "appimage",
              },
              "macos-arm64": {
                filename: "Storia_Studio_0.2.0_aarch64.dmg",
                url: `${GH_BASE}/releases/download/v0.2.0/storia.dmg`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "dmg",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.endsWith("/latest-nightly.json")) {
        return new Response(
          JSON.stringify({
            channel: "nightly",
            tag: "nightly",
            version: "0.2.0-nightly.2222222",
            commitSha: remoteNightlySha,
            commitShort: "2222222",
            commitMessage: "feat: shiny new nightly commit on master",
            publishedAt: "2026-11-27T14:00:00.000Z",
            releaseUrl: `${GH_BASE}/releases/tag/nightly`,
            notes: "Nightly build",
            assets: {
              "windows-x64": {
                filename: "nightly-Storia Studio_0.2.0_x64-setup.exe",
                url: `${GH_BASE}/releases/download/nightly/nightly-setup.exe`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "nsis",
              },
              "linux-x64": {
                filename: "nightly-Storia_Studio_0.2.0_amd64.AppImage",
                url: `${GH_BASE}/releases/download/nightly/nightly.AppImage`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "appimage",
              },
              "macos-arm64": {
                filename: "nightly-Storia_Studio_0.2.0_aarch64.dmg",
                url: `${GH_BASE}/releases/download/nightly/nightly.dmg`,
                sha256: fakeInstallerSha,
                size: fakeInstallerBytes.byteLength,
                kind: "dmg",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("/releases/download/nightly/")) {
        const payload = tamperNextDownload ? Buffer.from("CORRUPTED_BYTES") : fakeInstallerBytes;
        return new Response(new Uint8Array(payload), {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(payload.byteLength),
          },
        });
      }
      return new Response("Not Found", { status: 404 });
    };

    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      modelsDir: path.join(tmpDir, "models"),
      ttsModelsDir: path.join(tmpDir, "models", "tts"),
      connectivityConfigPath: path.join(tmpDir, "models", "config", "connectivity.json"),
      librariesConfigPath: path.join(tmpDir, "models", "config", "libraries.json"),
      oauthStorePath: path.join(tmpDir, "models", "config", "mcp-oauth.json"),
      onboardingConfigPath: path.join(tmpDir, "models", "config", "onboarding.json"),
      updatesConfigPath: path.join(tmpDir, "models", "config", "updates.json"),
      updatesDir: path.join(tmpDir, "models", "updates"),
      buildInfoPath,
      updateFetchImpl: mockFetch,
      isDesktopApp: true,
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("checks stable (up-to-date), switches to nightly, detects new master commit, downloads & verifies SHA-256, and rejects tampered files", async () => {
    // 1. Default stable channel -> up to date
    const checkStable = await app.inject({ method: "POST", url: "/api/updates/check", payload: {} });
    expect(checkStable.statusCode).toBe(200);
    expect(checkStable.json().result.channel).toBe("stable");
    expect(checkStable.json().result.updateAvailable).toBe(false);

    // 2. Switch user config to nightly channel
    const cfgRes = await app.inject({
      method: "POST",
      url: "/api/updates/config",
      payload: { channel: "nightly", autoCheck: true },
    });
    expect(cfgRes.statusCode).toBe(200);
    expect(cfgRes.json().config.channel).toBe("nightly");

    // 3. Check updates on nightly -> detects new master commit
    const checkNightly = await app.inject({ method: "POST", url: "/api/updates/check", payload: {} });
    expect(checkNightly.statusCode).toBe(200);
    const nr = checkNightly.json().result;
    expect(nr.channel).toBe("nightly");
    expect(nr.updateAvailable).toBe(true);
    expect(nr.remote.commitSha).toBe(remoteNightlySha);
    expect(nr.remote.commitShort).toBe("2222222");
    expect(nr.asset).toBeTruthy();

    // 4. Tampered download MUST fail SHA-256 verification
    tamperNextDownload = true;
    const badDl = await app.inject({
      method: "POST",
      url: "/api/updates/download",
      payload: { channel: "nightly", wait: true },
    });
    expect(badDl.statusCode).toBe(200);
    expect(badDl.json().ok).toBe(false);
    expect(badDl.json().download.phase).toBe("error");
    expect(badDl.json().download.error).toContain("SHA-256");

    // 5. Valid download succeeds, verifies SHA-256, and writes installer file to updatesDir
    tamperNextDownload = false;
    const goodDl = await app.inject({
      method: "POST",
      url: "/api/updates/download",
      payload: { channel: "nightly", wait: true },
    });
    expect(goodDl.statusCode).toBe(200);
    expect(goodDl.json().ok).toBe(true);
    expect(goodDl.json().download.phase).toBe("ready");
    expect(goodDl.json().download.sha256).toBe(fakeInstallerSha);
    const savedBytes = await fs.readFile(goodDl.json().download.localPath);
    expect(savedBytes.equals(fakeInstallerBytes)).toBe(true);

    // 6. Remote tunnel & MCP clients are blocked from mutating update config or triggering downloads
    const remoteBlocked = await app.inject({
      method: "POST",
      url: "/api/updates/config",
      headers: {
        "x-forwarded-for": REMOTE_CLIENT,
        "x-forwarded-host": SAMPLE_TUNNEL_HOST,
        "x-forwarded-proto": "https",
      },
      payload: { channel: "stable" },
    });
    expect(remoteBlocked.statusCode).toBe(403);

    const mcpBlocked = await app.inject({
      method: "POST",
      url: "/api/updates/download",
      headers: { "x-storia-client": "mcp" },
      payload: { channel: "nightly" },
    });
    expect(mcpBlocked.statusCode).toBe(403);
  });
});
