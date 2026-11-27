import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { decryptSecret, encryptSecret, isEncryptedSecret, redactSecrets } from "../secretVault.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");

describe("@storia/server — API Key Vault Encryption & Zero-Trust Guard (MCP / LAN / Remote)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let prevVaultKeyPath: string | undefined;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-vault-test-"));
    prevVaultKeyPath = process.env.STORIA_VAULT_KEY_PATH;
    process.env.STORIA_VAULT_KEY_PATH = path.join(tmpDir, "external-vault.key");

    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      connectivityConfigPath: path.join(tmpDir, "connectivity.json"),
      ttsModelsDir: path.join(tmpDir, "tts-models"),
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });
  });

  afterAll(async () => {
    await app.close();
    if (prevVaultKeyPath === undefined) {
      delete process.env.STORIA_VAULT_KEY_PATH;
    } else {
      process.env.STORIA_VAULT_KEY_PATH = prevVaultKeyPath;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypts and decrypts secrets with AES-256-GCM and scrubs tokens in error strings", () => {
    const rawKey = "sk_super_secret_elevenlabs_key_99887766";
    const enc = encryptSecret(rawKey);
    expect(enc).toBeDefined();
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(enc).not.toContain(rawKey);
    expect(decryptSecret(enc)).toBe(rawKey);

    const dirty = `Upstream failed with Bearer storia_mcp_abcdef123456 and key ${rawKey} and sk-openai1234567890abcdef`;
    const clean = redactSecrets(dirty, [rawKey]);
    expect(clean).not.toContain(rawKey);
    expect(clean).not.toContain("storia_mcp_abcdef123456");
    expect(clean).not.toContain("sk-openai1234567890abcdef");
  });

  it("encrypts API keys & tunnel tokens on disk (never plaintext) and never leaks them over REST", async () => {
    const fakeElKey = "sk_live_elevenlabs_secret_5544332211";
    const fakeOaiKey = "sk-proj-openai-secret-9988776655";
    const fakeNgrok = "ngrok_secret_token_1122334455";

    const saveTts = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      headers: { host: "localhost:4310" },
      payload: {
        elevenlabsApiKey: fakeElKey,
        openaiApiKey: fakeOaiKey,
      },
    });
    expect(saveTts.statusCode).toBe(200);
    expect(JSON.stringify(saveTts.json())).not.toContain(fakeElKey);
    expect(JSON.stringify(saveTts.json())).not.toContain(fakeOaiKey);
    expect(saveTts.json().config.hasElevenlabsKey).toBe(true);
    expect(saveTts.json().config.hasOpenaiKey).toBe(true);

    // Inspect raw JSON stored on disk — must be encrypted with enc:v1:
    const ttsDisk = await fs.readFile(path.join(tmpDir, "tts-models", "tts-settings.json"), "utf8");
    expect(ttsDisk).not.toContain(fakeElKey);
    expect(ttsDisk).not.toContain(fakeOaiKey);
    expect(ttsDisk).toContain("enc:v1:");

    const saveConn = await app.inject({
      method: "POST",
      url: "/api/connectivity/config",
      headers: { host: "localhost:4310" },
      payload: { ngrokAuthtoken: fakeNgrok },
    });
    expect(saveConn.statusCode).toBe(200);
    const connDisk = await fs.readFile(path.join(tmpDir, "connectivity.json"), "utf8");
    expect(connDisk).not.toContain(fakeNgrok);
    expect(connDisk).toContain("enc:v1:");
  });

  it("blocks AI/MCP clients, remote proxies/tunnels, and LAN hosts from reading or modifying credentials", async () => {
    // 1. MCP client attempting to modify TTS API keys -> 403
    const mcpTtsWrite = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      headers: { host: "localhost:4310", "x-storia-client": "mcp" },
      payload: { customApiUrl: "https://evil.example/steal" },
    });
    expect(mcpTtsWrite.statusCode).toBe(403);

    // 2. MCP client querying GET /api/connectivity -> mcpAuthToken MUST be redacted
    const mcpConnRead = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: { host: "localhost:4310", "x-storia-client": "mcp" },
    });
    expect(mcpConnRead.statusCode).toBe(200);
    expect(mcpConnRead.json().config.mcpAuthToken).toBe("");
    expect(mcpConnRead.json().config.tokenRedacted).toBe(true);
    expect(mcpConnRead.json().security.localAdminAllowed).toBe(false);

    // 3. MCP client trying to fetch AI prompt bundle (which includes Bearer token) -> 403
    const mcpPrompt = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=claude&mode=tunnel",
      headers: { host: "localhost:4310", "x-storia-client": "mcp" },
    });
    expect(mcpPrompt.statusCode).toBe(403);

    // 4. Remote tunnel / reverse proxy request (x-forwarded-for / cf-ray) -> 403 on write, redacted on read
    const tunnelWrite = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      headers: { host: "localhost:4310", "x-forwarded-for": "203.0.113.10" },
      payload: { openaiApiKey: "sk-hijack-1234567890" },
    });
    expect(tunnelWrite.statusCode).toBe(403);

    const tunnelConnRead = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: { host: "localhost:4310", "cf-ray": "99aa11bb-SJO" },
    });
    expect(tunnelConnRead.statusCode).toBe(200);
    expect(tunnelConnRead.json().config.mcpAuthToken).toBe("");
    expect(tunnelConnRead.json().config.tokenRedacted).toBe(true);

    // 5. LAN device Host header (192.168.x.x) -> 403 on credential mutations & token rotation
    const lanRotate = await app.inject({
      method: "POST",
      url: "/api/connectivity/token/rotate",
      headers: { host: "192.168.1.55:4310" },
    });
    expect(lanRotate.statusCode).toBe(403);

    const lanTtsStatus = await app.inject({
      method: "GET",
      url: "/api/tts/providers",
      headers: { host: "192.168.1.55:4310" },
    });
    expect(lanTtsStatus.statusCode).toBe(200);
    expect(lanTtsStatus.json().security.localAdminAllowed).toBe(false);
  });
});
