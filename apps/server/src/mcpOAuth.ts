import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OAUTH_STORE_PATH = path.resolve(__dirname, "../../../models/config/mcp-oauth.json");

export const MCP_OAUTH_DEFAULT_SCOPE = "storia:mcp";
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PENDING_GRANT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_TTL_SEC = 24 * 60 * 60; // 24 hours
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const MAX_OAUTH_CLIENTS = 64;
const MAX_PENDING_GRANTS = 128;
const MAX_GRANT_FAILED_ATTEMPTS = 5;

export interface RegisteredOAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: "none" | "client_secret_post" | "client_secret_basic";
  clientSecretHash?: string;
  grantTypes: string[];
  responseTypes: string[];
  scope: string;
  createdAt: string;
}

interface StoredAccessToken {
  tokenHash: string;
  clientId: string;
  scope: string;
  resource?: string;
  issuedAt: number;
  expiresAt: number;
}

interface StoredRefreshToken {
  tokenHash: string;
  clientId: string;
  scope: string;
  resource?: string;
  issuedAt: number;
  expiresAt: number;
}

interface OAuthPersistedState {
  version: 1;
  clients: Record<string, RegisteredOAuthClient>;
  accessTokens: Record<string, StoredAccessToken>;
  refreshTokens: Record<string, StoredRefreshToken>;
}

interface AuthorizationCodeRecord {
  codeHash: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  resource?: string;
  state?: string;
  expiresAt: number;
}

interface PendingConsentGrant {
  grantId: string;
  csrf: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: "S256";
  scope: string;
  resource?: string;
  state?: string;
  expiresAt: number;
  failedAttempts: number;
}

export interface OAuthSummary {
  enabled: boolean;
  clientsCount: number;
  activeTokensCount: number;
  clients: {
    clientId: string;
    clientName: string;
    redirectHost: string;
    createdAt: string;
  }[];
}

function sha256Hex(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

function sha256Base64Url(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    const proto = parsed.protocol.toLowerCase();
    if (proto === "javascript:" || proto === "data:" || proto === "vbscript:") return false;
    if (proto === "https:") return true;
    if (proto === "http:") {
      const host = parsed.hostname.toLowerCase();
      return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
    }
    // Native desktop / editor OAuth callbacks (e.g. cursor://, claude://, vscode://)
    return /^[a-z][a-z0-9+.-]*:$/i.test(proto);
  } catch {
    return false;
  }
}

function safeRedirectHost(uri: string): string {
  try {
    const u = new URL(uri);
    return u.host || u.protocol;
  } catch {
    return uri.slice(0, 60);
  }
}

const SAFE_HOST_HEADER_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*|\[[0-9a-f:]+\])(?::\d{1,5})?$/i;

export function resolvePublicBaseUrl(
  headers: Record<string, string | string[] | undefined>,
  fallbackOrigin: string,
): string {
  const rawHost =
    (typeof headers["x-forwarded-host"] === "string" ? headers["x-forwarded-host"] : undefined) ??
    (typeof headers.host === "string" ? headers.host : undefined);
  const host = rawHost?.split(",")[0]?.trim();
  if (!host || host.length > 255 || !SAFE_HOST_HEADER_RE.test(host)) {
    return fallbackOrigin.replace(/\/+$/, "");
  }

  const rawProto =
    typeof headers["x-forwarded-proto"] === "string"
      ? headers["x-forwarded-proto"].split(",")[0]?.trim().toLowerCase()
      : undefined;
  const isLocalHost =
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]") ||
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

  const proto = rawProto === "https" || rawProto === "http" ? rawProto : isLocalHost ? "http" : "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

export function extractBearerFromHeader(authHeader?: string): string | null {
  if (!authHeader || typeof authHeader !== "string") return null;
  const trimmed = authHeader.trim();
  const match = trimmed.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export class McpOAuthProvider {
  readonly storePath: string;
  private state: OAuthPersistedState | null = null;
  private readonly authCodes = new Map<string, AuthorizationCodeRecord>();
  private readonly pendingGrants = new Map<string, PendingConsentGrant>();

  constructor(storePath?: string) {
    this.storePath = path.resolve(storePath ?? DEFAULT_OAUTH_STORE_PATH);
  }

  private async loadState(): Promise<OAuthPersistedState> {
    if (this.state) {
      this.pruneExpired(this.state);
      return this.state;
    }
    try {
      const raw = await fs.readFile(this.storePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<OAuthPersistedState>;
      this.state = {
        version: 1,
        clients: parsed.clients && typeof parsed.clients === "object" ? parsed.clients : {},
        accessTokens: parsed.accessTokens && typeof parsed.accessTokens === "object" ? parsed.accessTokens : {},
        refreshTokens: parsed.refreshTokens && typeof parsed.refreshTokens === "object" ? parsed.refreshTokens : {},
      };
      this.pruneExpired(this.state);
      return this.state;
    } catch {
      this.state = {
        version: 1,
        clients: {},
        accessTokens: {},
        refreshTokens: {},
      };
      return this.state;
    }
  }

  private pruneExpired(st: OAuthPersistedState): void {
    const now = Date.now();
    for (const [k, tok] of Object.entries(st.accessTokens)) {
      if (tok.expiresAt <= now) delete st.accessTokens[k];
    }
    for (const [k, tok] of Object.entries(st.refreshTokens)) {
      if (tok.expiresAt <= now) delete st.refreshTokens[k];
    }
    for (const [k, code] of this.authCodes.entries()) {
      if (code.expiresAt <= now) this.authCodes.delete(k);
    }
    for (const [k, grant] of this.pendingGrants.entries()) {
      if (grant.expiresAt <= now) this.pendingGrants.delete(k);
    }
  }

  private async saveState(): Promise<void> {
    if (!this.state) return;
    this.pruneExpired(this.state);
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    const tmpPath = `${this.storePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify(this.state, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(tmpPath, this.storePath);
    if (process.platform !== "win32") {
      await fs.chmod(this.storePath, 0o600).catch(() => {});
    }
  }

  buildProtectedResourceMetadata(baseUrl: string): Record<string, unknown> {
    const clean = baseUrl.replace(/\/+$/, "");
    return {
      resource: `${clean}/mcp`,
      authorization_servers: [clean],
      scopes_supported: [MCP_OAUTH_DEFAULT_SCOPE],
      bearer_methods_supported: ["header"],
      resource_name: "Storia Studio MCP",
    };
  }

  buildAuthorizationServerMetadata(baseUrl: string): Record<string, unknown> {
    const clean = baseUrl.replace(/\/+$/, "");
    return {
      issuer: clean,
      authorization_endpoint: `${clean}/oauth/authorize`,
      token_endpoint: `${clean}/oauth/token`,
      registration_endpoint: `${clean}/oauth/register`,
      revocation_endpoint: `${clean}/oauth/revoke`,
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: [MCP_OAUTH_DEFAULT_SCOPE],
      service_documentation: clean,
    };
  }

  buildWwwAuthenticateHeader(baseUrl: string, error?: string, errorDescription?: string): string {
    const clean = baseUrl.replace(/\/+$/, "");
    const parts = [
      'realm="storia-studio-mcp"',
      `resource_metadata="${clean}/.well-known/oauth-protected-resource/mcp"`,
      `scope="${MCP_OAUTH_DEFAULT_SCOPE}"`,
    ];
    if (error) parts.push(`error="${error}"`);
    if (errorDescription) parts.push(`error_description="${errorDescription.replace(/"/g, "'")}"`);
    return `Bearer ${parts.join(", ")}`;
  }

  /** RFC 7591 Dynamic Client Registration */
  async registerClient(body: Record<string, unknown>): Promise<{
    statusCode: number;
    payload: Record<string, unknown>;
  }> {
    const rawUris = body.redirect_uris;
    if (!Array.isArray(rawUris) || rawUris.length === 0 || rawUris.length > 10) {
      return {
        statusCode: 400,
        payload: {
          error: "invalid_redirect_uri",
          error_description: "redirect_uris must be a non-empty array of 1 to 10 valid URIs.",
        },
      };
    }

    const redirectUris: string[] = [];
    for (const u of rawUris) {
      if (typeof u !== "string" || !isAllowedRedirectUri(u.trim())) {
        return {
          statusCode: 400,
          payload: {
            error: "invalid_redirect_uri",
            error_description: `Invalid or disallowed redirect_uri: ${String(u)}`,
          },
        };
      }
      redirectUris.push(u.trim());
    }

    const rawAuthMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
    const tokenEndpointAuthMethod: RegisteredOAuthClient["tokenEndpointAuthMethod"] =
      rawAuthMethod === "client_secret_post" || rawAuthMethod === "client_secret_basic"
        ? rawAuthMethod
        : "none";

    const clientName =
      typeof body.client_name === "string" && body.client_name.trim().length > 0
        ? body.client_name.trim().slice(0, 120)
        : "MCP AI Client";

    const clientId = `storia_cli_${crypto.randomBytes(12).toString("hex")}`;
    const issuedAtSec = Math.floor(Date.now() / 1000);
    let rawClientSecret: string | undefined;
    let clientSecretHash: string | undefined;

    if (tokenEndpointAuthMethod !== "none") {
      rawClientSecret = `storia_sec_${crypto.randomBytes(24).toString("base64url")}`;
      clientSecretHash = sha256Hex(rawClientSecret);
    }

    const client: RegisteredOAuthClient = {
      clientId,
      clientName,
      redirectUris,
      tokenEndpointAuthMethod,
      clientSecretHash,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      scope: typeof body.scope === "string" && body.scope.trim() ? body.scope.trim() : MCP_OAUTH_DEFAULT_SCOPE,
      createdAt: new Date().toISOString(),
    };

    const st = await this.loadState();
    const existingIds = Object.keys(st.clients);
    if (existingIds.length >= MAX_OAUTH_CLIENTS) {
      const activeClientIds = new Set<string>([
        ...Object.values(st.accessTokens).map((t) => t.clientId),
        ...Object.values(st.refreshTokens).map((t) => t.clientId),
      ]);
      const evictable = existingIds
        .filter((cid) => !activeClientIds.has(cid))
        .sort((a, b) => (st.clients[a]?.createdAt ?? "").localeCompare(st.clients[b]?.createdAt ?? ""));
      while (Object.keys(st.clients).length >= MAX_OAUTH_CLIENTS && evictable.length > 0) {
        const dropId = evictable.shift()!;
        delete st.clients[dropId];
      }
      if (Object.keys(st.clients).length >= MAX_OAUTH_CLIENTS) {
        return {
          statusCode: 429,
          payload: {
            error: "too_many_clients",
            error_description: "Maximum number of active OAuth clients reached. Revoke old clients in Storia Studio Settings.",
          },
        };
      }
    }
    st.clients[clientId] = client;
    await this.saveState();

    return {
      statusCode: 201,
      payload: {
        client_id: client.clientId,
        ...(rawClientSecret ? { client_secret: rawClientSecret, client_secret_expires_at: 0 } : {}),
        client_id_issued_at: issuedAtSec,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: client.tokenEndpointAuthMethod,
        grant_types: client.grantTypes,
        response_types: client.responseTypes,
        scope: client.scope,
      },
    };
  }

  /** Step 1 of Authorization Code + PKCE: validate query params and create a short-lived consent grant */
  async prepareAuthorization(query: Record<string, string | undefined>): Promise<
    | { ok: true; grant: PendingConsentGrant }
    | { ok: false; statusCode: number; error: string; errorDescription: string; redirectUrl?: string }
  > {
    const clientId = query.client_id?.trim() ?? "";
    const redirectUri = query.redirect_uri?.trim() ?? "";
    const responseType = query.response_type?.trim() ?? "";
    const codeChallenge = query.code_challenge?.trim() ?? "";
    const codeChallengeMethod = (query.code_challenge_method?.trim() ?? "").toUpperCase();
    const state = query.state?.trim() || undefined;
    const scope = query.scope?.trim() || MCP_OAUTH_DEFAULT_SCOPE;
    const resource = query.resource?.trim() || undefined;

    const st = await this.loadState();
    const client = st.clients[clientId];
    if (!client) {
      return {
        ok: false,
        statusCode: 400,
        error: "invalid_client",
        errorDescription: "Unknown OAuth client_id. Register first via /oauth/register.",
      };
    }

    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      return {
        ok: false,
        statusCode: 400,
        error: "invalid_redirect_uri",
        errorDescription: "redirect_uri does not match any registered redirect URI for this client.",
      };
    }

    const buildErrorRedirect = (err: string, desc: string): string => {
      const u = new URL(redirectUri);
      u.searchParams.set("error", err);
      u.searchParams.set("error_description", desc);
      if (state) u.searchParams.set("state", state);
      return u.toString();
    };

    if (responseType !== "code") {
      return {
        ok: false,
        statusCode: 302,
        error: "unsupported_response_type",
        errorDescription: "Only response_type=code is supported.",
        redirectUrl: buildErrorRedirect("unsupported_response_type", "Only response_type=code is supported."),
      };
    }

    if (!codeChallenge || codeChallenge.length < 32 || codeChallenge.length > 256) {
      return {
        ok: false,
        statusCode: 302,
        error: "invalid_request",
        errorDescription: "PKCE code_challenge is required by OAuth 2.1.",
        redirectUrl: buildErrorRedirect("invalid_request", "PKCE code_challenge is required by OAuth 2.1."),
      };
    }

    if (codeChallengeMethod !== "S256") {
      return {
        ok: false,
        statusCode: 302,
        error: "invalid_request",
        errorDescription: "Only PKCE code_challenge_method=S256 is supported.",
        redirectUrl: buildErrorRedirect("invalid_request", "Only PKCE code_challenge_method=S256 is supported."),
      };
    }

    const grantId = crypto.randomBytes(18).toString("base64url");
    const csrf = crypto.randomBytes(18).toString("base64url");
    const grant: PendingConsentGrant = {
      grantId,
      csrf,
      clientId: client.clientId,
      clientName: client.clientName,
      redirectUri,
      codeChallenge,
      codeChallengeMethod: "S256",
      scope,
      resource,
      state,
      expiresAt: Date.now() + PENDING_GRANT_TTL_MS,
      failedAttempts: 0,
    };
    const nowMs = Date.now();
    for (const [k, v] of this.pendingGrants.entries()) {
      if (v.expiresAt <= nowMs) this.pendingGrants.delete(k);
    }
    if (this.pendingGrants.size >= MAX_PENDING_GRANTS) {
      const oldestKey = this.pendingGrants.keys().next().value;
      if (oldestKey) this.pendingGrants.delete(oldestKey);
    }
    this.pendingGrants.set(grantId, grant);
    return { ok: true, grant };
  }

  /** Step 2 of Authorization Code + PKCE: complete consent form submission */
  completeAuthorization(params: {
    grantId: string;
    csrf: string;
    action: "approve" | "deny";
    requireOwnerToken: boolean;
    ownerTokenValid: boolean;
  }):
    | { ok: true; redirectUrl: string }
    | { ok: false; retryGrant?: PendingConsentGrant; errorMessage: string; statusCode: number } {
    const grant = this.pendingGrants.get(params.grantId);
    if (!grant || grant.expiresAt <= Date.now()) {
      this.pendingGrants.delete(params.grantId);
      return {
        ok: false,
        statusCode: 400,
        errorMessage: "La sesión de autorización expiró. Vuelve a iniciar la conexión desde tu asistente IA.",
      };
    }

    if (!timingSafeEqualStr(grant.csrf, params.csrf || "")) {
      return {
        ok: false,
        statusCode: 403,
        errorMessage: "Token CSRF inválido. Recarga e inténtalo de nuevo.",
      };
    }

    if (params.action === "deny") {
      this.pendingGrants.delete(params.grantId);
      const u = new URL(grant.redirectUri);
      u.searchParams.set("error", "access_denied");
      u.searchParams.set("error_description", "The user denied the authorization request.");
      if (grant.state) u.searchParams.set("state", grant.state);
      return { ok: true, redirectUrl: u.toString() };
    }

    if (params.requireOwnerToken && !params.ownerTokenValid) {
      grant.failedAttempts += 1;
      if (grant.failedAttempts >= MAX_GRANT_FAILED_ATTEMPTS) {
        this.pendingGrants.delete(params.grantId);
        return {
          ok: false,
          statusCode: 429,
          errorMessage: "Demasiados intentos fallidos con el token de seguridad MCP. Reinicia la autorización desde tu asistente IA.",
        };
      }
      return {
        ok: false,
        statusCode: 401,
        retryGrant: grant,
        errorMessage: "Token de seguridad MCP incorrecto. Cópialo desde Storia Studio › Ajustes › Red Local (LAN).",
      };
    }

    this.pendingGrants.delete(params.grantId);
    const rawCode = `storia_code_${crypto.randomBytes(24).toString("base64url")}`;
    const codeHash = sha256Hex(rawCode);
    this.authCodes.set(codeHash, {
      codeHash,
      clientId: grant.clientId,
      redirectUri: grant.redirectUri,
      codeChallenge: grant.codeChallenge,
      codeChallengeMethod: "S256",
      scope: grant.scope,
      resource: grant.resource,
      state: grant.state,
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const redirect = new URL(grant.redirectUri);
    redirect.searchParams.set("code", rawCode);
    if (grant.state) redirect.searchParams.set("state", grant.state);
    return { ok: true, redirectUrl: redirect.toString() };
  }

  /** Renders a minimal dark Storia Studio consent page for /oauth/authorize */
  renderConsentHtml(grant: PendingConsentGrant, opts: { requireOwnerToken: boolean; errorMessage?: string }): string {
    const clientName = escapeHtml(grant.clientName);
    const redirectHost = escapeHtml(safeRedirectHost(grant.redirectUri));
    const scope = escapeHtml(grant.scope);
    const errBlock = opts.errorMessage
      ? `<div class="err">${escapeHtml(opts.errorMessage)}</div>`
      : "";

    const tokenInputBlock = opts.requireOwnerToken
      ? `<label class="field">
          <span>Token de seguridad MCP de Storia Studio</span>
          <input type="password" name="access_token_pass" required autocomplete="off" placeholder="Pega tu Bearer Token desde Ajustes › Red Local (LAN)" autofocus />
        </label>`
      : `<p class="hint">La verificación por token está desactivada; pulsa Autorizar para conceder acceso MCP.</p>`;

    return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Autorizar conexión MCP · Storia Studio</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0a0c12; color: #f3f4f6;
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
      padding: 20px;
    }
    .card {
      width: 100%; max-width: 430px; background: #12151f; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 18px; padding: 26px; box-shadow: 0 24px 60px rgba(0,0,0,0.55);
    }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
    .logo {
      width: 30px; height: 30px; border-radius: 8px; background: #f7c8d6; color: #11131a;
      display: grid; place-items: center; font-weight: 900; font-size: 12px;
    }
    .brand-name { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
    h1 { margin: 0 0 6px; font-size: 18px; font-weight: 650; }
    p.sub { margin: 0 0 18px; font-size: 12.5px; color: #9ca3af; line-height: 1.5; }
    .meta {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 12px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .k { color: #9ca3af; }
    .v { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #e5e7eb; text-align: right; word-break: break-all; }
    .shield {
      font-size: 11.5px; color: #a7f3d0; background: rgba(16,185,129,0.09);
      border: 1px solid rgba(16,185,129,0.25); border-radius: 10px; padding: 9px 12px;
      margin-bottom: 16px; line-height: 1.45;
    }
    .err {
      font-size: 11.5px; color: #fecaca; background: rgba(239,68,68,0.12);
      border: 1px solid rgba(239,68,68,0.35); border-radius: 10px; padding: 9px 12px;
      margin-bottom: 14px;
    }
    label.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; font-size: 11.5px; color: #d1d5db; }
    input[type=password] {
      width: 100%; background: #0a0c12; color: #f9fafb; border: 1px solid rgba(255,255,255,0.16);
      border-radius: 10px; padding: 10px 12px; font-size: 12.5px; outline: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    input[type=password]:focus { border-color: #f7c8d6; }
    p.hint { margin: 0 0 16px; font-size: 12px; color: #9ca3af; }
    .actions { display: flex; gap: 10px; }
    button {
      flex: 1; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; font-weight: 600;
      cursor: pointer; border: 1px solid rgba(255,255,255,0.12); transition: opacity 0.15s;
    }
    button:hover { opacity: 0.92; }
    .deny { background: rgba(255,255,255,0.05); color: #d1d5db; }
    .allow { background: #f7c8d6; color: #11131a; border-color: transparent; }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="logo">ST</div>
      <div class="brand-name">Storia Studio · OAuth 2.1</div>
    </div>
    <h1>Conectar asistente IA</h1>
    <p class="sub"><strong>${clientName}</strong> solicita acceso MCP a tu editor local Storia Studio.</p>
    <div class="meta">
      <div class="row"><span class="k">Cliente</span><span class="v">${clientName}</span></div>
      <div class="row"><span class="k">Destino</span><span class="v">${redirectHost}</span></div>
      <div class="row"><span class="k">Permiso</span><span class="v">${scope}</span></div>
    </div>
    <div class="shield">
      Control completo de proyectos, escenas, capas, subtítulos, SVG y exportación. <strong>Nunca incluye acceso a tus API Keys ni a la bóveda local.</strong>
    </div>
    ${errBlock}
    <form method="POST" action="/oauth/authorize">
      <input type="hidden" name="grant_id" value="${escapeHtml(grant.grantId)}" />
      <input type="hidden" name="csrf" value="${escapeHtml(grant.csrf)}" />
      ${tokenInputBlock}
      <div class="actions">
        <button type="submit" name="action" value="deny" class="deny" formnovalidate>Denegar</button>
        <button type="submit" name="action" value="approve" class="allow">Autorizar acceso</button>
      </div>
    </form>
  </main>
</body>
</html>`;
  }

  /** Step 3: OAuth 2.1 Token Exchange (`authorization_code` + PKCE S256 & `refresh_token`) */
  async exchangeToken(
    body: Record<string, unknown>,
    authHeader?: string,
  ): Promise<{ statusCode: number; payload: Record<string, unknown> }> {
    const grantType = typeof body.grant_type === "string" ? body.grant_type.trim() : "";

    // Extract client credentials from Basic header or body
    let clientId = typeof body.client_id === "string" ? body.client_id.trim() : "";
    let clientSecret = typeof body.client_secret === "string" ? body.client_secret.trim() : "";

    if (authHeader && /^Basic\s+/i.test(authHeader.trim())) {
      try {
        const decoded = Buffer.from(authHeader.trim().replace(/^Basic\s+/i, ""), "base64").toString("utf8");
        const sep = decoded.indexOf(":");
        if (sep >= 0) {
          const basicId = decodeURIComponent(decoded.slice(0, sep));
          const basicSec = decodeURIComponent(decoded.slice(sep + 1));
          if (!clientId) clientId = basicId;
          if (!clientSecret) clientSecret = basicSec;
        }
      } catch {
        return {
          statusCode: 401,
          payload: { error: "invalid_client", error_description: "Malformed Basic Authorization header." },
        };
      }
    }

    const st = await this.loadState();

    const verifyClient = (expectedClientId: string): { ok: true; client: RegisteredOAuthClient } | { ok: false; res: { statusCode: number; payload: Record<string, unknown> } } => {
      const client = st.clients[expectedClientId];
      if (!client) {
        return {
          ok: false,
          res: { statusCode: 401, payload: { error: "invalid_client", error_description: "Unknown client_id." } },
        };
      }
      if (client.tokenEndpointAuthMethod !== "none") {
        if (!clientSecret || !client.clientSecretHash || !timingSafeEqualStr(sha256Hex(clientSecret), client.clientSecretHash)) {
          return {
            ok: false,
            res: { statusCode: 401, payload: { error: "invalid_client", error_description: "Invalid client_secret." } },
          };
        }
      }
      return { ok: true, client };
    };

    if (grantType === "authorization_code") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const redirectUri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
      const codeVerifier = typeof body.code_verifier === "string" ? body.code_verifier.trim() : "";

      if (!code || !codeVerifier) {
        return {
          statusCode: 400,
          payload: {
            error: "invalid_request",
            error_description: "code and code_verifier (PKCE) are required.",
          },
        };
      }

      const codeHash = sha256Hex(code);
      const record = this.authCodes.get(codeHash);
      // Single-use: always consume immediately
      this.authCodes.delete(codeHash);

      if (!record || record.expiresAt <= Date.now()) {
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "Authorization code is invalid or expired." },
        };
      }

      const effectiveClientId = clientId || record.clientId;
      if (effectiveClientId !== record.clientId) {
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "Authorization code does not belong to this client." },
        };
      }

      const check = verifyClient(record.clientId);
      if (!check.ok) return check.res;

      if (redirectUri && redirectUri !== record.redirectUri) {
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "redirect_uri mismatch." },
        };
      }

      // Verify PKCE S256
      const computedChallenge = sha256Base64Url(codeVerifier);
      if (!timingSafeEqualStr(computedChallenge, record.codeChallenge)) {
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "PKCE code_verifier verification failed." },
        };
      }

      return this.issueTokenPair(st, record.clientId, record.scope, record.resource);
    }

    if (grantType === "refresh_token") {
      const refreshToken = typeof body.refresh_token === "string" ? body.refresh_token.trim() : "";
      if (!refreshToken) {
        return {
          statusCode: 400,
          payload: { error: "invalid_request", error_description: "refresh_token is required." },
        };
      }
      const refreshHash = sha256Hex(refreshToken);
      const existing = st.refreshTokens[refreshHash];
      if (!existing || existing.expiresAt <= Date.now()) {
        delete st.refreshTokens[refreshHash];
        await this.saveState();
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "Refresh token is invalid or expired." },
        };
      }
      if (clientId && clientId !== existing.clientId) {
        return {
          statusCode: 400,
          payload: { error: "invalid_grant", error_description: "Refresh token does not belong to this client." },
        };
      }
      const check = verifyClient(existing.clientId);
      if (!check.ok) return check.res;

      // Rotate refresh token
      delete st.refreshTokens[refreshHash];
      return this.issueTokenPair(st, existing.clientId, existing.scope, existing.resource);
    }

    return {
      statusCode: 400,
      payload: {
        error: "unsupported_grant_type",
        error_description: "Supported grant types: authorization_code, refresh_token.",
      },
    };
  }

  private async issueTokenPair(
    st: OAuthPersistedState,
    clientId: string,
    scope: string,
    resource?: string,
  ): Promise<{ statusCode: number; payload: Record<string, unknown> }> {
    const now = Date.now();
    const rawAccess = `storia_oat_${crypto.randomBytes(32).toString("base64url")}`;
    const rawRefresh = `storia_ort_${crypto.randomBytes(32).toString("base64url")}`;
    const accessHash = sha256Hex(rawAccess);
    const refreshHash = sha256Hex(rawRefresh);

    st.accessTokens[accessHash] = {
      tokenHash: accessHash,
      clientId,
      scope,
      resource,
      issuedAt: now,
      expiresAt: now + ACCESS_TOKEN_TTL_SEC * 1000,
    };
    st.refreshTokens[refreshHash] = {
      tokenHash: refreshHash,
      clientId,
      scope,
      resource,
      issuedAt: now,
      expiresAt: now + REFRESH_TOKEN_TTL_SEC * 1000,
    };

    await this.saveState();

    return {
      statusCode: 200,
      payload: {
        access_token: rawAccess,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_TTL_SEC,
        refresh_token: rawRefresh,
        scope,
      },
    };
  }

  /** RFC 7009 Token Revocation */
  async revokeToken(rawToken?: string): Promise<void> {
    if (!rawToken || !rawToken.trim()) return;
    const st = await this.loadState();
    const hash = sha256Hex(rawToken.trim());
    let changed = false;
    if (st.accessTokens[hash]) {
      delete st.accessTokens[hash];
      changed = true;
    }
    if (st.refreshTokens[hash]) {
      delete st.refreshTokens[hash];
      changed = true;
    }
    if (changed) await this.saveState();
  }

  /** Validates an OAuth 2.1 Bearer access token presented to /mcp */
  async validateAccessToken(authHeader?: string): Promise<{ valid: boolean; clientId?: string; scope?: string }> {
    const bearer = extractBearerFromHeader(authHeader);
    if (!bearer) return { valid: false };
    const st = await this.loadState();
    const hash = sha256Hex(bearer);
    const tok = st.accessTokens[hash];
    if (!tok || tok.expiresAt <= Date.now()) {
      return { valid: false };
    }
    return { valid: true, clientId: tok.clientId, scope: tok.scope };
  }

  async getSummary(): Promise<OAuthSummary> {
    const st = await this.loadState();
    const clients = Object.values(st.clients).map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      redirectHost: safeRedirectHost(c.redirectUris[0] ?? ""),
      createdAt: c.createdAt,
    }));
    return {
      enabled: true,
      clientsCount: clients.length,
      activeTokensCount: Object.keys(st.accessTokens).length,
      clients,
    };
  }

  async revokeAll(): Promise<OAuthSummary> {
    const st = await this.loadState();
    st.accessTokens = {};
    st.refreshTokens = {};
    this.authCodes.clear();
    this.pendingGrants.clear();
    await this.saveState();
    return this.getSummary();
  }
}
