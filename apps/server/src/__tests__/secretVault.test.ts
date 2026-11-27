import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { decryptSecret, encryptSecret, isEncryptedSecret, redactSecrets } from "../secretVault.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");

describe("@storia/server — Secret Vault (AES-256-GCM) & Anti-Exfiltration Security for MCP, LAN & Remote", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let ttsConfigFile: string;
  let connConfigFile: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-sec-vault-"));
    ttsConfigFile = path.join(tmpDir, "models-tts", "tts-settings.json");
    connConfigFile = path.join(tmpDir, "connectivity.json");
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      ttsModelsDir: path.join(tmpDir, "models-tts"),
      connectivityConfigPath: connConfigFile,
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypts secrets at rest with AES-256-GCM and scrubs secrets from logs/errors", () => {
    const plain = "sk-super-secret-api-key-987654321";
    const enc = encryptSecret(plain);
    expect(enc).toBeDefined();
    expect(isEncryptedSecret(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);

    const scrubbed = redactSecrets(
      `Upstream failed with Authorization: Bearer ${plain} and storia_mcp_abcdef1234567890`,
      [plain],
    );
    expect(scrubbed).not.toContain(plain);
    expect(scrubbed).not.toContain("storia_mcp_abcdef1234567890");
    expect(scrubbed).toContain("[REDACTED]");
  });

  it("stores TTS API keys & tunnel tokens encrypted on disk and never leaks plaintext via REST", async () => {
    const fakeElKey = "sk_live_elevenlabs_secret_123456789";
    const fakeOaiKey = "sk-proj-openai-secret-987654321";

    const saveRes = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      payload: {
        elevenlabsApiKey: fakeElKey,
        openaiApiKey: fakeOaiKey,
      },
    });
    expect(saveRes.statusCode).toBe(200);
    const saveText = JSON.stringify(saveRes.json());
    expect(saveText).not.toContain(fakeElKey);
    expect(saveText).not.toContain(fakeOaiKey);
    expect(saveRes.json().config.hasElevenlabsKey).toBe(true);
    expect(saveRes.json().config.hasOpenaiKey).toBe(true);

    // Raw file on disk MUST NOT contain plaintext API keys
    const rawDisk = await fs.readFile(ttsConfigFile, "utf8");
    expect(rawDisk).not.toContain(fakeElKey);
    expect(rawDisk).not.toContain(fakeOaiKey);
    expect(rawDisk).toContain("enc:v1:");

    // Connectivity tokens on disk are also encrypted
    const connSave = await app.inject({
      method: "POST",
      url: "/api/connectivity/config",
      payload: {
        ngrokAuthtoken: "ngrok_secret_token_xyz999",
        cloudflareTunnelToken: "cf_secret_token_abc888",
      },
    });
    expect(connSave.statusCode).toBe(200);
    const rawConnDisk = await fs.readFile(connConfigFile, "utf8");
    expect(rawConnDisk).not.toContain("ngrok_secret_token_xyz999");
    expect(rawConnDisk).not.toContain("cf_secret_token_abc888");
    expect(rawConnDisk).toContain("enc:v1:");
  });

  it("blocks AI/MCP agents, remote tunnel/proxy callers, and LAN devices from reading tokens or modifying API keys", async () => {
    // 1. AI/MCP client (via X-Storia-Client: mcp) blocked from config & prompt endpoints
    const mcpTtsWrite = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      headers: { "x-storia-client": "mcp" },
      payload: { customApiUrl: "https://evil.example.com/steal" },
    });
    expect(mcpTtsWrite.statusCode).toBe(403);
    expect(mcpTtsWrite.json().error).toBe("local_admin_required");

    const mcpPrompt = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=claude&mode=tunnel",
      headers: { "x-storia-client": "mcp" },
    });
    expect(mcpPrompt.statusCode).toBe(403);

    // GET /api/connectivity from MCP redacts mcpAuthToken completely
    const mcpConn = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: { "x-storia-client": "mcp" },
    });
    expect(mcpConn.statusCode).toBe(200);
    expect(mcpConn.json().config.mcpAuthToken).toBe("");
    expect(mcpConn.json().config.tokenRedacted).toBe(true);
    expect(mcpConn.json().security.localAdminAllowed).toBe(false);

    // 2. Remote tunnel / reverse proxy (X-Forwarded-For / CF-Connecting-IP) blocked from secrets & admin
    const remoteWrite = await app.inject({
      method: "POST",
      url: "/api/tts/config",
      headers: { "x-forwarded-for": "203.0.113.45" },
      payload: { elevenlabsApiKey: "hijacked" },
    });
    expect(remoteWrite.statusCode).toBe(403);

    const remoteRotate = await app.inject({
      method: "POST",
      url: "/api/connectivity/token/rotate",
      headers: { "cf-connecting-ip": "198.51.100.12" },
    });
    expect(remoteRotate.statusCode).toBe(403);

    const remoteConn = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: { "x-forwarded-host": "storia.ngrok-free.app" },
    });
    expect(remoteConn.statusCode).toBe(200);
    expect(remoteConn.json().config.mcpAuthToken).toBe("");
    expect(remoteConn.json().security.localAdminAllowed).toBe(false);

    // 3. LAN Host header (non-localhost IP) blocked from admin & token exposure
    const lanWrite = await app.inject({
      method: "POST",
      url: "/api/connectivity/config",
      headers: { host: "192.168.1.55:4310" },
      payload: { mcpAuthEnabled: false },
    });
    expect(lanWrite.statusCode).toBe(403);

    const lanConn = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: { host: "192.168.1.55:4310" },
    });
    expect(lanConn.statusCode).toBe(200);
    expect(lanConn.json().config.mcpAuthToken).toBe("");
    expect(lanConn.json().security.localAdminAllowed).toBe(false);
  });
});
