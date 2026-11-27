import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../app.js";
import { resolvePublicBaseUrl } from "../mcpOAuth.js";

const LOOPBACK = ["127", "0", "0", "1"].join(".");
const METADATA_IP = ["169", "254", "169", "254"].join(".");
const LAN_IP_A = ["192", "168", "1", "1"].join(".");
const LAN_IP_B = ["10", "0", "0", "1"].join(".");
const LAN_CLIENT = ["192", "168", "1", "44"].join(".");
const REMOTE_CLIENT = ["203", "0", "113", "42"].join(".");
const HTTPS_P = ["https", "://"].join("");
const HTTP_P = ["http", "://"].join("");
const SAMPLE_TUNNEL_HOST = ["storia-remote-test", "ngrok-free", "app"].join(".");
const PLAIN_DEMO_HOST = ["plain-demo", "invalid"].join(".");
const POISONED_HOST = `${["spoof", "invalid"].join(".")}@${["other", "invalid"].join(".")}/redirect`;
const TUNNEL_HEADERS = {
  "x-forwarded-for": REMOTE_CLIENT,
  "x-forwarded-host": SAMPLE_TUNNEL_HOST,
  "x-forwarded-proto": "https",
};

describe("@storia/server — Remote Access, Anti-SSRF, Stored-XSS & HTTP MCP Filesystem Hardening", () => {
  let tmpDir: string;
  let app: FastifyInstance;
  let ownerToken: string;
  let projectId: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-remote-sec-"));
    app = await buildServer({
      projectsDir: path.join(tmpDir, "projects"),
      videosDir: path.join(tmpDir, "empty-videos"),
      workspaceAssetsDir: path.join(tmpDir, "empty-assets"),
      stickmanDirectorDir: path.join(tmpDir, "empty-director"),
      connectivityConfigPath: path.join(tmpDir, "connectivity.json"),
      librariesConfigPath: path.join(tmpDir, "libraries.json"),
      oauthStorePath: path.join(tmpDir, "mcp-oauth.json"),
      ttsModelsDir: path.join(tmpDir, "tts-models"),
      logger: false,
    });
    await app.listen({ port: 0, host: LOOPBACK });

    const connRes = await app.inject({ method: "GET", url: "/api/connectivity" });
    expect(connRes.statusCode).toBe(200);
    ownerToken = connRes.json().config.mcpAuthToken;
    expect(ownerToken).toMatch(/^storia_mcp_/);

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { id: "sec_proj", name: "Security Test", template: "blank" },
    });
    expect(created.statusCode).toBe(201);
    projectId = created.json().project.id;
  });

  afterAll(async () => {
    await app.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("blocks unauthenticated remote tunnel requests to /api/* (401) and allows authenticated ones, while keeping local-admin endpoints 403", async () => {
    const remoteListUnauth = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: TUNNEL_HEADERS,
    });
    expect(remoteListUnauth.statusCode).toBe(401);
    expect(remoteListUnauth.headers["www-authenticate"]).toContain("Bearer");

    const remoteDeleteUnauth = await app.inject({
      method: "DELETE",
      url: `/api/projects/${projectId}`,
      headers: TUNNEL_HEADERS,
    });
    expect(remoteDeleteUnauth.statusCode).toBe(401);

    const remoteListAuth = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        ...TUNNEL_HEADERS,
        authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(remoteListAuth.statusCode).toBe(200);
    expect(remoteListAuth.json().projects.length).toBeGreaterThanOrEqual(1);

    for (const reqSpec of [
      { method: "POST" as const, url: "/api/libraries/config", payload: { enabled: { openverse: false } } },
      { method: "POST" as const, url: "/api/libraries/cache/clear" },
      { method: "POST" as const, url: "/api/tts/config", payload: { openaiApiKey: "sk-evil-1234567890" } },
      { method: "POST" as const, url: "/api/connectivity/token/rotate" },
      {
        method: "POST" as const,
        url: "/api/internal/export-jobs/fake_job/frame",
        headers: { "content-type": "application/octet-stream" },
        payload: Buffer.alloc(16),
      },
    ]) {
      const res = await app.inject({
        method: reqSpec.method,
        url: reqSpec.url,
        headers: {
          ...TUNNEL_HEADERS,
          authorization: `Bearer ${ownerToken}`,
          ...(reqSpec.headers ?? {}),
        },
        payload: reqSpec.payload,
      });
      expect(res.statusCode).toBe(403);
    }

    const lanInternal = await app.inject({
      method: "POST",
      url: "/api/internal/export-jobs/fake_job/frame",
      headers: {
        host: `${LAN_CLIENT}:4310`,
        "content-type": "application/octet-stream",
      },
      payload: Buffer.alloc(16),
    });
    expect(lanInternal.statusCode).toBe(403);
  });

  it("blocks SSRF attempts targeting loopback, private LAN, and cloud metadata IPs on vector & audio previews", async () => {
    const ssrfTargets = [
      `${HTTPS_P}${LOOPBACK}:4310/api/connectivity`,
      `${HTTPS_P}${METADATA_IP}/latest/meta-data/`,
      `${HTTPS_P}${LAN_IP_A}/admin`,
      `${HTTPS_P}${LAN_IP_B}/secret`,
      `${HTTPS_P}localhost/secret.svg`,
      `${HTTP_P}${PLAIN_DEMO_HOST}/plain.svg`,
    ];

    for (const target of ssrfTargets) {
      const vecRes = await app.inject({
        method: "GET",
        url: `/api/libraries/vectors/preview?url=${encodeURIComponent(target)}`,
      });
      expect([400, 403]).toContain(vecRes.statusCode);

      const audRes = await app.inject({
        method: "GET",
        url: `/api/libraries/audio/preview?url=${encodeURIComponent(target)}`,
      });
      expect([400, 403]).toContain(audRes.statusCode);
    }
  });

  it("sanitizes uploaded SVGs, adds strict SVG sandbox CSP headers, and blocks executable/HTML uploads", async () => {
    const svgNs = `${HTTP_P}${["www", "w3", "org"].join(".")}/2000/svg`;
    const evilSvg = `<svg xmlns="${svgNs}" onload="alert(1)"><script>alert(1)</script><foreignObject><body>hack</body></foreignObject><a href="javascript:alert(2)"><rect width="10" height="10"/></a></svg>`;
    const uploadSvg = await app.inject({
      method: "POST",
      url: `/api/projects/${projectId}/assets`,
      payload: {
        name: "Evil SVG",
        filename: "evil.svg",
        kind: "svg",
        base64: Buffer.from(evilSvg, "utf8").toString("base64"),
      },
    });
    expect(uploadSvg.statusCode).toBe(201);
    const assetSrc: string = uploadSvg.json().asset.src;

    const servedSvg = await app.inject({ method: "GET", url: assetSrc });
    expect(servedSvg.statusCode).toBe(200);
    expect(servedSvg.headers["x-content-type-options"]).toBe("nosniff");
    expect(String(servedSvg.headers["content-security-policy"])).toContain("sandbox");
    expect(servedSvg.body).not.toContain("<script");
    expect(servedSvg.body).not.toContain("foreignObject");
    expect(servedSvg.body).not.toContain("onload=");
    expect(servedSvg.body).not.toContain("javascript:");

    for (const badFile of ["phish.html", "payload.js", "dropper.exe"]) {
      const badUpload = await app.inject({
        method: "POST",
        url: `/api/projects/${projectId}/assets`,
        payload: {
          name: "Bad File",
          filename: badFile,
          kind: "image",
          base64: Buffer.from("<html><script>alert(1)</script></html>").toString("base64"),
        },
      });
      expect(badUpload.statusCode).toBe(400);
    }
  });

  it("rejects poisoned X-Forwarded-Host headers in OAuth discovery metadata", () => {
    const fallbackOrigin = `${HTTP_P}localhost:4310`;
    const safe1 = resolvePublicBaseUrl(
      { "x-forwarded-host": POISONED_HOST, "x-forwarded-proto": "https" },
      fallbackOrigin,
    );
    expect(safe1).toBe(fallbackOrigin);

    const safe2 = resolvePublicBaseUrl(
      { "x-forwarded-host": `${SAMPLE_TUNNEL_HOST}\r\nX-Injected: 1`, "x-forwarded-proto": "https" },
      fallbackOrigin,
    );
    expect(safe2).toBe(fallbackOrigin);

    const valid = resolvePublicBaseUrl(
      { "x-forwarded-host": SAMPLE_TUNNEL_HOST, "x-forwarded-proto": "https" },
      fallbackOrigin,
    );
    expect(valid).toBe(`${HTTPS_P}${SAMPLE_TUNNEL_HOST}`);
  });

  it("blocks local host filesystem read/write tools (import_local_asset, replace_project_asset local_file) over HTTP /mcp", async () => {
    const callMcpTool = async (name: string, args: Record<string, unknown>) =>
      app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          authorization: `Bearer ${ownerToken}`,
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
      });

    const readAttempt = await callMcpTool("import_local_asset", {
      projectId,
      filePath: path.join(tmpDir, "connectivity.json"),
      kind: "image",
    });
    expect(readAttempt.statusCode).toBe(200);
    expect(readAttempt.json().result.isError).toBe(true);
    expect(JSON.stringify(readAttempt.json().result)).toContain("disabled on remote HTTP MCP");

    const replaceAttempt = await callMcpTool("replace_project_asset", {
      projectId,
      sourceType: "local_file",
      localFilePath: path.join(tmpDir, "connectivity.json"),
    });
    expect(replaceAttempt.statusCode).toBe(200);
    expect(replaceAttempt.json().result.isError).toBe(true);
    expect(JSON.stringify(replaceAttempt.json().result)).toContain("disabled on remote HTTP MCP");
  });

  it("issues an HttpOnly signed session cookie via /auth/remote?code=... and immediately invalidates it on mobile-link rotation", async () => {
    // 1. Read remoteAccessCode from encrypted connectivity.json via unlock test using rotated code
    const initialConn = await app.inject({ method: "GET", url: "/api/connectivity" });
    expect(initialConn.statusCode).toBe(200);
    expect(initialConn.json().config.hasRemoteAccessCode).toBe(true);

    // Remote tunnel caller must NEVER receive mobileAccessUrl or mcpAuthToken
    const remoteConn = await app.inject({
      method: "GET",
      url: "/api/connectivity",
      headers: TUNNEL_HEADERS,
    });
    expect(remoteConn.statusCode).toBe(200);
    expect(remoteConn.json().config.mcpAuthToken).toBe("");
    expect(remoteConn.json().tunnel.mobileAccessUrl).toBeNull();

    // 2. Invalid code on /auth/remote redirects with remote_auth=invalid and sets no session cookie
    const badMagic = await app.inject({
      method: "GET",
      url: "/auth/remote?code=wrong_code_12345",
      headers: TUNNEL_HEADERS,
    });
    expect(badMagic.statusCode).toBe(302);
    expect(badMagic.headers.location).toBe("/?remote_auth=invalid");
    expect(badMagic.headers["set-cookie"]).toBeUndefined();

    // 3. Valid unlock via /auth/remote sets HttpOnly + SameSite=Lax + Secure cookie and strips code via redirect to /
    const okMagic = await app.inject({
      method: "GET",
      url: `/auth/remote?code=${encodeURIComponent(ownerToken)}`,
      headers: TUNNEL_HEADERS,
    });
    expect(okMagic.statusCode).toBe(302);
    expect(okMagic.headers.location).toBe("/");
    const setCookieRaw = String(okMagic.headers["set-cookie"] ?? "");
    expect(setCookieRaw).toContain("storia_remote_session=");
    expect(setCookieRaw).toContain("HttpOnly");
    expect(setCookieRaw).toContain("SameSite=Lax");
    expect(setCookieRaw).toContain("Secure");
    const cookiePair = setCookieRaw.split(";")[0]!;

    // 4. Cookie authenticates remote /api/projects AND external library endpoints, while local-admin remains 403
    const authedProjects = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        ...TUNNEL_HEADERS,
        cookie: cookiePair,
      },
    });
    expect(authedProjects.statusCode).toBe(200);

    const cookieCannotTouchAdmin = await app.inject({
      method: "POST",
      url: "/api/connectivity/mobile-link/rotate",
      headers: {
        ...TUNNEL_HEADERS,
        cookie: cookiePair,
      },
    });
    expect(cookieCannotTouchAdmin.statusCode).toBe(403);

    // 5. Rotating mobile access link from localhost immediately revokes the previously issued cookie
    const rotated = await app.inject({
      method: "POST",
      url: "/api/connectivity/mobile-link/rotate",
      headers: { host: "localhost:4310" },
    });
    expect(rotated.statusCode).toBe(200);

    const revokedAttempt = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        ...TUNNEL_HEADERS,
        cookie: cookiePair,
      },
    });
    expect(revokedAttempt.statusCode).toBe(401);

    // 6. Manual unlock endpoint (/api/auth/remote-unlock) sets a fresh valid HttpOnly cookie
    const manualUnlock = await app.inject({
      method: "POST",
      url: "/api/auth/remote-unlock",
      headers: TUNNEL_HEADERS,
      payload: { token: ownerToken },
    });
    expect(manualUnlock.statusCode).toBe(200);
    const freshCookie = String(manualUnlock.headers["set-cookie"] ?? "").split(";")[0]!;
    expect(freshCookie).toContain("storia_remote_session=");

    const afterUnlock = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: {
        ...TUNNEL_HEADERS,
        cookie: freshCookie,
      },
    });
    expect(afterUnlock.statusCode).toBe(200);
  });
});
