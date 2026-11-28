import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

function buildTestTarGz(files: Record<string, string>): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.from(content, "utf8");
    const header = Buffer.alloc(512, 0);
    header.write(name, 0, Math.min(100, name.length), "utf8");
    header.write("0000644\0", 100, 8, "ascii");
    header.write("0000000\0", 108, 8, "ascii");
    header.write("0000000\0", 116, 8, "ascii");
    header.write(`${data.byteLength.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
    header.write("00000000000\0", 136, 12, "ascii");
    header.fill(0x20, 148, 156);
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i]!;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");

    blocks.push(header);
    blocks.push(data);
    const pad = (512 - (data.byteLength % 512)) % 512;
    if (pad > 0) blocks.push(Buffer.alloc(pad, 0));
  }
  blocks.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(blocks));
}

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

  it("does NOT report an update when already on the latest nightly commit even if publishedAt is later than builtAt", async () => {
    const nightlyTmp = await fs.mkdtemp(path.join(os.tmpdir(), "storia-updater-same-nightly-"));
    const buildInfoPath = path.join(nightlyTmp, "build-info.json");
    await fs.writeFile(
      buildInfoPath,
      JSON.stringify({
        version: "0.2.1",
        channel: "nightly",
        commitSha: remoteNightlySha,
        commitShort: "2222222",
        commitMessage: "latest nightly commit",
        // Built 20 minutes before publish-nightly-release finishes in CI
        builtAt: "2026-11-27T13:40:00.000Z",
        repo: REPO_SLUG,
      }),
      "utf8",
    );

    const sameCommitApp = await buildServer({
      projectsDir: path.join(nightlyTmp, "projects"),
      modelsDir: path.join(nightlyTmp, "models"),
      ttsModelsDir: path.join(nightlyTmp, "models", "tts"),
      connectivityConfigPath: path.join(nightlyTmp, "models", "config", "connectivity.json"),
      librariesConfigPath: path.join(nightlyTmp, "models", "config", "libraries.json"),
      oauthStorePath: path.join(nightlyTmp, "models", "config", "mcp-oauth.json"),
      onboardingConfigPath: path.join(nightlyTmp, "models", "config", "onboarding.json"),
      updatesConfigPath: path.join(nightlyTmp, "models", "config", "updates.json"),
      updatesDir: path.join(nightlyTmp, "models", "updates"),
      buildInfoPath,
      updateFetchImpl: async () =>
        new Response(
          JSON.stringify({
            channel: "nightly",
            tag: "nightly",
            version: "0.2.1-nightly.2222222",
            commitSha: remoteNightlySha,
            commitShort: "2222222",
            commitMessage: "latest nightly commit",
            publishedAt: "2026-11-27T14:00:00.000Z",
            releaseUrl: `${GH_BASE}/releases/tag/nightly`,
            notes: "Nightly build",
            assets: {},
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      isDesktopApp: true,
      logger: false,
    });

    try {
      const checkRes = await sameCommitApp.inject({ method: "POST", url: "/api/updates/check", payload: {} });
      expect(checkRes.statusCode).toBe(200);
      expect(checkRes.json().result.channel).toBe("nightly");
      expect(checkRes.json().result.updateAvailable).toBe(false);
    } finally {
      await sameCommitApp.close();
      await fs.rm(nightlyTmp, { recursive: true, force: true });
    }
  });

  it("applies in-place internal runtime .tar.gz update without an OS installer and falls back from %20 to dot on GitHub 404", async () => {
    const rtTmp = await fs.mkdtemp(path.join(os.tmpdir(), "storia-updater-runtime-inplace-"));
    const buildInfoPath = path.join(rtTmp, "build-info.json");
    const bootstrapConfigPath = path.join(rtTmp, "desktop-bootstrap.json");
    const runtimeReleasesDir = path.join(rtTmp, "models", "runtime-releases");

    await fs.writeFile(
      bootstrapConfigPath,
      JSON.stringify({
        version: 1,
        projectsDir: path.join(rtTmp, "projects"),
        modelsDir: path.join(rtTmp, "models"),
      }),
      "utf8",
    );
    await fs.writeFile(
      buildInfoPath,
      JSON.stringify({
        version: "0.2.0",
        channel: "nightly",
        commitSha: installedSha,
        commitShort: "1111111",
        builtAt: "2026-11-27T10:00:00.000Z",
        repo: REPO_SLUG,
      }),
      "utf8",
    );

    const runtimeArchive = buildTestTarGz({
      "apps/server/dist/index.js": "export const updated = true;\n",
      "apps/studio/dist/index.html": "<!doctype html><title>Updated Storia</title>\n",
      "build-info.json": JSON.stringify({
        version: "0.2.1",
        channel: "nightly",
        commitSha: remoteNightlySha,
        commitShort: "2222222",
      }),
    });
    const runtimeSha = crypto.createHash("sha256").update(runtimeArchive).digest("hex");

    const rtApp = await buildServer({
      projectsDir: path.join(rtTmp, "projects"),
      modelsDir: path.join(rtTmp, "models"),
      ttsModelsDir: path.join(rtTmp, "models", "tts"),
      connectivityConfigPath: path.join(rtTmp, "models", "config", "connectivity.json"),
      librariesConfigPath: path.join(rtTmp, "models", "config", "libraries.json"),
      oauthStorePath: path.join(rtTmp, "models", "config", "mcp-oauth.json"),
      onboardingConfigPath: path.join(rtTmp, "models", "config", "onboarding.json"),
      updatesConfigPath: path.join(rtTmp, "models", "config", "updates.json"),
      updatesDir: path.join(rtTmp, "models", "updates"),
      runtimeReleasesDir,
      bootstrapConfigPath,
      buildInfoPath,
      updateFetchImpl: async (url: string) => {
        if (url.endsWith("/latest-nightly.json")) {
          return new Response(
            JSON.stringify({
              channel: "nightly",
              tag: "nightly",
              version: "0.2.1-nightly.2222222",
              commitSha: remoteNightlySha,
              commitShort: "2222222",
              commitMessage: "feat: internal runtime update",
              publishedAt: "2026-11-27T14:00:00.000Z",
              releaseUrl: `${GH_BASE}/releases/tag/nightly`,
              notes: "Nightly",
              runtime: {
                filename: "storia-runtime nightly.tar.gz",
                // Deliberately test %20 -> dot fallback on GitHub Releases
                url: `${GH_BASE}/releases/download/nightly/storia-runtime%20nightly.tar.gz`,
                sha256: runtimeSha,
                size: runtimeArchive.byteLength,
                kind: "runtime",
              },
              assets: {},
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.endsWith("/storia-runtime%20nightly.tar.gz")) {
          return new Response("Not Found", { status: 404 });
        }
        if (url.endsWith("/storia-runtime.nightly.tar.gz")) {
          return new Response(new Uint8Array(runtimeArchive), {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(runtimeArchive.byteLength),
            },
          });
        }
        return new Response("Not Found", { status: 404 });
      },
      isDesktopApp: true,
      logger: false,
    });

    try {
      const dl = await rtApp.inject({
        method: "POST",
        url: "/api/updates/download",
        payload: { channel: "nightly", wait: true },
      });
      expect(dl.statusCode).toBe(200);
      const body = dl.json();
      expect(body.ok).toBe(true);
      expect(body.download.installKind).toBe("runtime");
      expect(body.download.phase).toBe("ready");
      expect(body.download.extractedRuntimeDir).toBeTruthy();

      const extractedServer = await fs.readFile(
        path.join(body.download.extractedRuntimeDir, "apps", "server", "dist", "index.js"),
        "utf8",
      );
      expect(extractedServer).toContain("updated = true");

      const bootJson = JSON.parse(await fs.readFile(bootstrapConfigPath, "utf8"));
      expect(bootJson.activeRuntimeDir).toBe(body.download.extractedRuntimeDir);
      expect(bootJson.projectsDir).toBe(path.join(rtTmp, "projects"));
    } finally {
      await rtApp.close();
      await fs.rm(rtTmp, { recursive: true, force: true });
    }
  });
});
