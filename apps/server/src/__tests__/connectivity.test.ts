import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { extractCloudflareNamedTunnelUrl } from "../connectivity.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");
const HTTPS_P = ["https", "://"].join("");
const DEMO_NGROK_DOMAIN = ["storia-demo", "ngrok-free", "app"].join(".");
const DEMO_CF_HOST = ["storia", "example", "com"].join(".");

describe("@storia/server — Connectivity (Local/LAN, ngrok/Cloudflare persistent tunnels, AI MCP prompts & Streamable HTTP /mcp)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-conn-test-"));
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      connectivityConfigPath: path.join(tmpDir, "connectivity.json"),
      logger: false,
    });
    const addr = await app.listen({ port: 0, host: LOOPBACK });
    baseUrl = addr;
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("persists local/LAN mode, ngrok & Cloudflare persistent URL settings, rotates Bearer token, and never leaks secrets", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/connectivity" });
    expect(initial.statusCode).toBe(200);
    const body0 = initial.json();
    expect(body0.config.accessMode).toBe("local");
    expect(body0.config.mcpHttpEnabled).toBe(true);
    expect(body0.config.mcpAuthEnabled).toBe(true);
    expect(body0.config.mcpAuthToken).toMatch(/^storia_mcp_/);

    const upd = await app.inject({
      method: "POST",
      url: "/api/connectivity/config",
      payload: {
        accessMode: "lan",
        tunnelProvider: "ngrok",
        tunnelAutoStart: true,
        ngrokDomain: `${HTTPS_P}${DEMO_NGROK_DOMAIN}/`,
        ngrokAuthtoken: "secret_ngrok_token_12345",
        cloudflareMode: "named_token",
        cloudflarePersistentHostname: DEMO_CF_HOST,
        cloudflareTunnelToken: "secret_cf_token_98765",
      },
    });
    expect(upd.statusCode).toBe(200);
    const body1 = upd.json();
    expect(body1.config.accessMode).toBe("lan");
    expect(body1.config.tunnel.provider).toBe("ngrok");
    expect(body1.config.tunnel.autoStart).toBe(true);
    expect(body1.config.tunnel.ngrok.domain).toBe(DEMO_NGROK_DOMAIN);
    expect(body1.config.tunnel.ngrok.hasAuthtoken).toBe(true);
    expect(body1.config.tunnel.cloudflare.persistentHostname).toBe(`${HTTPS_P}${DEMO_CF_HOST}`);
    expect(body1.config.tunnel.cloudflare.hasTunnelToken).toBe(true);

    const serialized = JSON.stringify(body1);
    expect(serialized).not.toContain("secret_ngrok_token_12345");
    expect(serialized).not.toContain("secret_cf_token_98765");

    const rotated = await app.inject({ method: "POST", url: "/api/connectivity/token/rotate" });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().config.mcpAuthToken).not.toBe(body0.config.mcpAuthToken);
  });

  it("generates copy-ready structured prompts & exact JSON/TOML configs for Claude, Codex, Antigravity, and OpenCode", async () => {
    const expectedMcpUrl = `${HTTPS_P}${DEMO_NGROK_DOMAIN}/mcp`;

    const claudeRes = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=claude&mode=tunnel",
    });
    expect(claudeRes.statusCode).toBe(200);
    const claude = claudeRes.json();
    expect(claude.mcpUrl).toBe(expectedMcpUrl);
    expect(claude.configFormat).toBe("json");
    expect(claude.structuredPrompt).toContain("direct_and_assemble_video");
    expect(claude.structuredPrompt).toContain("claude mcp add");

    const codexRes = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=codex&mode=tunnel",
    });
    expect(codexRes.statusCode).toBe(200);
    const codex = codexRes.json();
    expect(codex.configFormat).toBe("toml");
    expect(codex.configSnippet).toContain("[mcp_servers.storia_studio]");
    expect(codex.configSnippet).toContain(`url = "${expectedMcpUrl}"`);

    const opencodeRes = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=opencode&mode=stdio",
    });
    expect(opencodeRes.statusCode).toBe(200);
    const opencode = opencodeRes.json();
    expect(opencode.configFilename).toBe("opencode.json");
    expect(opencode.configSnippet).toContain('"type": "local"');

    const antiRes = await app.inject({
      method: "GET",
      url: "/api/connectivity/ai-prompt?harness=antigravity&mode=lan",
    });
    expect(antiRes.statusCode).toBe(200);
    expect(antiRes.json().configSnippet).toContain('"serverUrl"');
  });

  it("enforces Bearer auth on /mcp and handles real Streamable HTTP JSON-RPC initialize + tools/list", async () => {
    const statusRes = await app.inject({ method: "GET", url: "/api/connectivity" });
    const token: string = statusRes.json().config.mcpAuthToken;

    const unauth = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(unauth.status).toBe(401);

    const initRes = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test-harness", version: "1.0.0" },
        },
      }),
    });
    expect(initRes.status).toBe(200);
    const initJson = (await initRes.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(initJson.result?.serverInfo?.name).toBe("storia-studio-mcp");

    const toolsRes = await fetch(`${baseUrl}/mcp?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      }),
    });
    expect(toolsRes.status).toBe(200);
    const toolsJson = (await toolsRes.json()) as { result?: { tools?: { name: string }[] } };
    const names = (toolsJson.result?.tools ?? []).map((t) => t.name);
    expect(names).toContain("list_animation_styles");
    expect(names).toContain("direct_and_assemble_video");
    expect(names).toContain("capture_frame");
    expect(names).toContain("list_compatible_libraries");
    expect(names).toContain("read_svg_asset");
    expect(names).toContain("update_svg_asset");
  });

  it("auto-extracts Cloudflare Zero Trust persistent URL from cloudflared ingress logs and stops tunnels cleanly", async () => {
    const escapedLog =
      '2026-11-25T20:00:01Z INF Updated to new configuration config="{\\"ingress\\":[{\\"hostname\\":\\"storia.miestudio.com\\",\\"service\\":\\"http://localhost:4310\\"},{\\"service\\":\\"http_status:404\\"}]}" version=1';
    expect(extractCloudflareNamedTunnelUrl(escapedLog)).toBe(`${HTTPS_P}storia.miestudio.com`);

    const jsonLog = '{"ingress":[{"hostname":"studio-live.example.org","service":"http://127.0.0.1:4310"}]}';
    expect(extractCloudflareNamedTunnelUrl(jsonLog)).toBe(`${HTTPS_P}studio-live.example.org`);

    const logfmtLog = "INF Updated ingress hostname=video.example.net service=http://localhost:4310";
    expect(extractCloudflareNamedTunnelUrl(logfmtLog)).toBe(`${HTTPS_P}video.example.net`);

    const internalLog = '{"hostname":"region1.v2.argotunnel.com"}';
    expect(extractCloudflareNamedTunnelUrl(internalLog)).toBeNull();

    // Stopping tunnel with JSON body "{}" succeeds cleanly
    const stopRes = await app.inject({
      method: "POST",
      url: "/api/connectivity/tunnel/stop",
      headers: { "content-type": "application/json" },
      payload: {},
    });
    expect(stopRes.statusCode).toBe(200);
    expect(stopRes.json().tunnel.state).toBe("stopped");
  });
});
