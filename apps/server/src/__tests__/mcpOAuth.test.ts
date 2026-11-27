import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");
const HTTPS_SCHEME = "https://";
const SAMPLE_TUNNEL_HOST = ["storia-demo", "ngrok-free", "dev"].join(".");
const SAMPLE_TUNNEL_ORIGIN = `${HTTPS_SCHEME}${SAMPLE_TUNNEL_HOST}`;
const CHATGPT_ORIGIN = `${HTTPS_SCHEME}${["chatgpt", "com"].join(".")}`;
const GEMINI_ORIGIN = `${HTTPS_SCHEME}${["gemini", "google", "com"].join(".")}`;

describe("@storia/server — OAuth 2.1 + PKCE S256, CORS & Standard /mcp (ChatGPT / Gemini / Claude Web)", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let baseUrl: string;
  let oauthStorePath: string;
  let ownerMcpToken: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-oauth-test-"));
    oauthStorePath = path.join(tmpDir, "mcp-oauth.json");
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      connectivityConfigPath: path.join(tmpDir, "connectivity.json"),
      oauthStorePath,
      logger: false,
    });
    const addr = await app.listen({ port: 0, host: LOOPBACK });
    baseUrl = addr;

    const statusRes = await app.inject({ method: "GET", url: "/api/connectivity" });
    expect(statusRes.statusCode).toBe(200);
    ownerMcpToken = statusRes.json().config.mcpAuthToken;
    expect(ownerMcpToken).toBeTruthy();
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("serves RFC 9728 / RFC 8414 discovery metadata honoring forwarded HTTPS origins and handles CORS preflight", async () => {
    const forwardedHeaders = {
      "x-forwarded-proto": "https",
      "x-forwarded-host": SAMPLE_TUNNEL_HOST,
    };

    const prm = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-protected-resource/mcp",
      headers: forwardedHeaders,
    });
    expect(prm.statusCode).toBe(200);
    expect(prm.json().resource).toBe(`${SAMPLE_TUNNEL_ORIGIN}/mcp`);
    expect(prm.json().authorization_servers).toEqual([SAMPLE_TUNNEL_ORIGIN]);

    const asm = await app.inject({
      method: "GET",
      url: "/.well-known/oauth-authorization-server",
      headers: forwardedHeaders,
    });
    expect(asm.statusCode).toBe(200);
    expect(asm.json().issuer).toBe(SAMPLE_TUNNEL_ORIGIN);
    expect(asm.json().authorization_endpoint).toBe(`${SAMPLE_TUNNEL_ORIGIN}/oauth/authorize`);
    expect(asm.json().token_endpoint).toBe(`${SAMPLE_TUNNEL_ORIGIN}/oauth/token`);
    expect(asm.json().registration_endpoint).toBe(`${SAMPLE_TUNNEL_ORIGIN}/oauth/register`);
    expect(asm.json().code_challenge_methods_supported).toEqual(["S256"]);

    // CORS preflight on /mcp
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/mcp",
      headers: {
        origin: CHATGPT_ORIGIN,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type, mcp-protocol-version, mcp-session-id",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(CHATGPT_ORIGIN);
    expect(String(preflight.headers["access-control-allow-headers"]).toLowerCase()).toContain("mcp-session-id");
    expect(String(preflight.headers["access-control-expose-headers"]).toLowerCase()).toContain("www-authenticate");
  });

  it("enforces RFC 9728 WWW-Authenticate on unauthenticated /mcp and returns 405 on authenticated GET SSE", async () => {
    const unauthPost = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        "x-forwarded-host": SAMPLE_TUNNEL_HOST,
      },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    });
    expect(unauthPost.statusCode).toBe(401);
    expect(String(unauthPost.headers["www-authenticate"])).toContain(
      `resource_metadata="${SAMPLE_TUNNEL_ORIGIN}/.well-known/oauth-protected-resource/mcp"`,
    );

    // Unauthenticated GET /mcp requesting SSE -> 401 with resource_metadata
    const unauthSse = await app.inject({
      method: "GET",
      url: "/mcp",
      headers: { accept: "text/event-stream" },
    });
    expect(unauthSse.statusCode).toBe(401);
    expect(String(unauthSse.headers["www-authenticate"])).toContain("oauth-protected-resource/mcp");

    // Authenticated GET /mcp requesting SSE -> 405 Method Not Allowed (stateless spec)
    const authSse = await app.inject({
      method: "GET",
      url: "/mcp",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${ownerMcpToken}`,
      },
    });
    expect(authSse.statusCode).toBe(405);
    expect(String(authSse.headers.allow)).toContain("POST");
  });

  it("completes full OAuth 2.1 DCR + PKCE S256 consent + token exchange + /mcp call + refresh rotation + revocation without plaintext token storage", async () => {
    // 1. Dynamic Client Registration
    const redirectUri = `${CHATGPT_ORIGIN}/connector_platform_oauth_redirect`;
    const regRes = await app.inject({
      method: "POST",
      url: "/oauth/register",
      payload: {
        client_name: "ChatGPT Connector Test",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
      },
    });
    expect(regRes.statusCode).toBe(201);
    const clientId = regRes.json().client_id as string;
    expect(clientId).toMatch(/^storia_cli_/);

    // 2. Generate PKCE S256 pair
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
    const state = "state_xyz_123";

    // 3. GET /oauth/authorize -> consent HTML
    const authPage = await app.inject({
      method: "GET",
      url: `/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&state=${state}`,
    });
    expect(authPage.statusCode).toBe(200);
    expect(authPage.headers["content-type"]).toContain("text/html");
    const grantMatch = authPage.body.match(/name="grant_id" value="([^"]+)"/);
    const csrfMatch = authPage.body.match(/name="csrf" value="([^"]+)"/);
    expect(grantMatch?.[1]).toBeTruthy();
    expect(csrfMatch?.[1]).toBeTruthy();
    const grantId = grantMatch![1]!;
    const csrf = csrfMatch![1]!;

    // 4. Reject invalid owner token on consent form
    const badConsent = await app.inject({
      method: "POST",
      url: "/oauth/authorize",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_id: grantId,
        csrf,
        action: "approve",
        access_token_pass: "wrong-token",
      }).toString(),
    });
    expect(badConsent.statusCode).toBe(401);

    // 5. Approve with valid owner MCP token -> 302 redirect with ?code=...
    const goodConsent = await app.inject({
      method: "POST",
      url: "/oauth/authorize",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_id: grantId,
        csrf,
        action: "approve",
        access_token_pass: ownerMcpToken,
      }).toString(),
    });
    expect(goodConsent.statusCode).toBe(302);
    const loc = new URL(String(goodConsent.headers.location));
    expect(loc.origin + loc.pathname).toBe(redirectUri);
    expect(loc.searchParams.get("state")).toBe(state);
    const authCode = loc.searchParams.get("code")!;
    expect(authCode).toMatch(/^storia_code_/);

    // 6. Exchange code with valid PKCE code_verifier (application/x-www-form-urlencoded)
    const tokenRes = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "authorization_code",
        code: authCode,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }).toString(),
    });
    expect(tokenRes.statusCode).toBe(200);
    const tokenBody = tokenRes.json();
    const accessToken = tokenBody.access_token as string;
    const refreshToken = tokenBody.refresh_token as string;
    expect(accessToken).toMatch(/^storia_oat_/);
    expect(refreshToken).toMatch(/^storia_ort_/);

    // Verify raw access/refresh tokens are NEVER written in plaintext on disk
    const rawDisk = await fs.readFile(oauthStorePath, "utf8");
    expect(rawDisk).not.toContain(accessToken);
    expect(rawDisk).not.toContain(refreshToken);

    // 7. Call live /mcp over HTTP using the OAuth Bearer token + lenient Accept: application/json + Origin
    const mcpInit = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        Origin: GEMINI_ORIGIN,
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "gemini-web", version: "1.0.0" },
        },
      }),
    });
    expect(mcpInit.status).toBe(200);
    expect(mcpInit.headers.get("access-control-allow-origin")).toBe(GEMINI_ORIGIN);
    const initJson = (await mcpInit.json()) as { result?: { serverInfo?: { name?: string } } };
    expect(initJson.result?.serverInfo?.name).toBe("storia-studio-mcp");

    // 8. Refresh token rotation
    const refRes = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
    });
    expect(refRes.statusCode).toBe(200);
    const nextAccess = refRes.json().access_token as string;
    expect(nextAccess).toMatch(/^storia_oat_/);
    expect(nextAccess).not.toBe(accessToken);

    // Reusing rotated refresh token must fail
    const reuseRef = await app.inject({
      method: "POST",
      url: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }).toString(),
    });
    expect(reuseRef.statusCode).toBe(400);

    // 9. Revoke access token -> /mcp must reject with 401
    const revRes = await app.inject({
      method: "POST",
      url: "/oauth/revoke",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      payload: new URLSearchParams({ token: nextAccess }).toString(),
    });
    expect(revRes.statusCode).toBe(200);

    const afterRevoke = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${nextAccess}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(afterRevoke.status).toBe(401);
  });
});
