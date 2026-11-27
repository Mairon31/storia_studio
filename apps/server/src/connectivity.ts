import { ChildProcess, execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  resolveDefaultConnectivityConfigPath,
  resolveDefaultLocalBinDir,
  REPO_RUNTIME_ROOT,
} from "./dataPaths.js";
import { decryptSecret, encryptSecret, redactSecrets } from "./secretVault.js";

const execFileAsync = promisify(execFile);
const DEFAULT_CONFIG_PATH = resolveDefaultConnectivityConfigPath();
const STORIA_STUDIO_ROOT = REPO_RUNTIME_ROOT;
const LOCAL_BIN_DIR = resolveDefaultLocalBinDir();

const LOOPBACK_HOST = ["127", "0", "0", "1"].join(".");
const HTTP_SCHEME = "http://";
const HTTPS_SCHEME = "https://";

export type AccessMode = "local" | "lan";
export type TunnelProvider = "none" | "ngrok" | "cloudflare";
export type CloudflareTunnelMode = "quick" | "named_token";
export type AiHarnessId = "universal" | "claude" | "codex" | "antigravity" | "opencode" | "cursor";
export type AiTransportMode = "tunnel" | "lan" | "stdio";

export interface ConnectivityStoredConfig {
  accessMode: AccessMode;
  port: number;
  mcpHttpEnabled: boolean;
  mcpAuthEnabled: boolean;
  mcpAuthToken: string;
  /** Independent revocable code for 1-click mobile/tablet browser access over remote tunnels (HttpOnly cookie session). */
  remoteAccessCode: string;
  tunnel: {
    provider: TunnelProvider;
    autoStart: boolean;
    ngrok: {
      authtoken?: string;
      domain?: string;
      region?: string;
    };
    cloudflare: {
      mode: CloudflareTunnelMode;
      tunnelToken?: string;
      persistentHostname?: string;
    };
  };
}

export interface ConnectivityPublicConfig {
  accessMode: AccessMode;
  port: number;
  mcpHttpEnabled: boolean;
  mcpAuthEnabled: boolean;
  mcpAuthToken: string;
  hasRemoteAccessCode?: boolean;
  tokenRedacted?: boolean;
  tunnel: {
    provider: TunnelProvider;
    autoStart: boolean;
    ngrok: {
      hasAuthtoken: boolean;
      domain: string;
      region: string;
    };
    cloudflare: {
      mode: CloudflareTunnelMode;
      hasTunnelToken: boolean;
      persistentHostname: string;
    };
  };
}

export interface LanAddressInfo {
  interfaceName: string;
  address: string;
  studioUrl: string;
  mcpUrl: string;
}

export interface TunnelBinaryStatus {
  installed: boolean;
  binPath: string | null;
  version: string | null;
}

export interface TunnelRuntimeStatus {
  state: "stopped" | "starting" | "running" | "error";
  provider: TunnelProvider;
  publicUrl: string | null;
  mcpUrl: string | null;
  /** Secure 1-click mobile/tablet URL (`https://<tunnel>/auth/remote?code=...`) — ONLY exposed to local host admin UI. */
  mobileAccessUrl?: string | null;
  persistent: boolean;
  pid: number | null;
  startedAt: string | null;
  error: string | null;
  recentLogs: string[];
}

export interface ConnectivityStatusResponse {
  config: ConnectivityPublicConfig;
  runtime: {
    listeningHost: string;
    listeningPort: number;
    lanActiveNow: boolean;
    restartRequiredForBind: boolean;
    localStudioUrl: string;
    localMcpUrl: string;
    lanAddresses: LanAddressInfo[];
    mcpStdioEntry: string;
    mcpStdioWindowsEntry: string;
  };
  binaries: {
    ngrok: TunnelBinaryStatus;
    cloudflared: TunnelBinaryStatus;
  };
  tunnel: TunnelRuntimeStatus;
}

export interface AiIntegrationBundle {
  harness: AiHarnessId;
  harnessLabel: string;
  mode: AiTransportMode;
  mcpUrl: string;
  studioUrl: string;
  authRequired: boolean;
  authHeader: string | null;
  configFormat: "json" | "toml";
  configFilename: string;
  configSnippet: string;
  structuredPrompt: string;
}

function generateSecureToken(): string {
  return `storia_mcp_${crypto.randomBytes(20).toString("hex")}`;
}

function generateRemoteAccessCode(): string {
  return `storia_mob_${crypto.randomBytes(24).toString("base64url")}`;
}

export const REMOTE_SESSION_COOKIE_NAME = "storia_remote_session";
const REMOTE_SESSION_TTL_SEC = 7 * 24 * 60 * 60; // 7 days

function parseCookieMap(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader || typeof cookieHeader !== "string") return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

function normalizeUrlOrigin(raw?: string): string {
  const s = (raw ?? "").trim().replace(/\/+$/, "");
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  return `${HTTPS_SCHEME}${s}`;
}

function normalizeNgrokDomain(raw?: string): string {
  return (raw ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
}

function toWindowsPath(p: string): string {
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m && m[1] && m[2] !== undefined) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
  }
  return p;
}

export function detectLanAddresses(port: number): LanAddressInfo[] {
  const nets = os.networkInterfaces();
  const out: LanAddressInfo[] = [];
  const seen = new Set<string>();

  for (const [name, list] of Object.entries(nets)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family !== "IPv4" || info.internal) continue;
      if (seen.has(info.address)) continue;
      seen.add(info.address);
      out.push({
        interfaceName: name,
        address: info.address,
        studioUrl: `${HTTP_SCHEME}${info.address}:${port}`,
        mcpUrl: `${HTTP_SCHEME}${info.address}:${port}/mcp`,
      });
    }
  }

  out.sort((a, b) => {
    const score = (ip: string) =>
      ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3;
    return score(a.address) - score(b.address);
  });
  return out;
}

async function probeBinary(candidates: string[], versionArgs: string[]): Promise<TunnelBinaryStatus> {
  for (const bin of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, versionArgs, { timeout: 6000 });
      const text = `${stdout}\n${stderr}`.trim();
      const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0)?.trim() ?? "installed";
      return { installed: true, binPath: bin, version: firstLine };
    } catch {
      // try next candidate
    }
  }
  return { installed: false, binPath: null, version: null };
}

export async function readBootstrapBindSettings(configPath = DEFAULT_CONFIG_PATH): Promise<{
  host: string;
  port: number;
  autoStartTunnel: boolean;
}> {
  const defaultPort = Number(process.env.STORIA_SERVER_PORT ?? 4310);
  const envHost = process.env.STORIA_SERVER_HOST;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ConnectivityStoredConfig>;
    const accessMode: AccessMode = parsed.accessMode === "lan" ? "lan" : "local";
    const port =
      process.env.STORIA_SERVER_PORT
        ? defaultPort
        : typeof parsed.port === "number" && parsed.port >= 1024 && parsed.port <= 65535
          ? parsed.port
          : defaultPort;
    const host = envHost ?? (accessMode === "lan" ? "0.0.0.0" : LOOPBACK_HOST);
    return {
      host,
      port,
      autoStartTunnel: Boolean(parsed.tunnel?.autoStart && parsed.tunnel?.provider && parsed.tunnel.provider !== "none"),
    };
  } catch {
    return {
      host: envHost ?? LOOPBACK_HOST,
      port: defaultPort,
      autoStartTunnel: false,
    };
  }
}

const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function isPublicTunnelHostname(host: string): boolean {
  const h = host.trim().toLowerCase();
  if (!h || !HOSTNAME_RE.test(h)) return false;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return false;
  if (
    h === "cloudflare.com" ||
    h.endsWith(".argotunnel.com") ||
    h.endsWith(".cftunnel.com") ||
    h === "api.cloudflare.com"
  ) {
    return false;
  }
  return true;
}

/**
 * Extracts the public persistent HTTPS origin assigned by Cloudflare Zero Trust
 * when `cloudflared tunnel run --token ...` logs its remote ingress configuration.
 */
export function extractCloudflareNamedTunnelUrl(rawLine: string): string | null {
  if (!rawLine || !/hostname|ingress/i.test(rawLine)) return null;
  const unescaped = rawLine.replace(/\\"/g, '"');
  const candidates: string[] = [];

  // 1. JSON ingress entries: "hostname":"storia.example.com"
  for (const m of unescaped.matchAll(/"hostname"\s*:\s*"([^"]+)"/gi)) {
    if (m[1]) candidates.push(m[1]);
  }
  // 2. Logfmt / YAML style: hostname=storia.example.com or hostname: storia.example.com
  for (const m of unescaped.matchAll(/\bhostname\s*[:=]\s*["']?([a-z0-9.-]+)["']?/gi)) {
    if (m[1]) candidates.push(m[1]);
  }

  for (const raw of candidates) {
    const cleaned = raw
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "");
    if (isPublicTunnelHostname(cleaned)) {
      return `${HTTPS_SCHEME}${cleaned.toLowerCase()}`;
    }
  }
  return null;
}

export class ConnectivityManager {
  readonly configPath: string;
  private cachedConfig: ConnectivityStoredConfig | null = null;
  private binariesCache: { ngrok: TunnelBinaryStatus; cloudflared: TunnelBinaryStatus } | null = null;

  private tunnelProc: ChildProcess | null = null;
  private tunnelGeneration = 0;
  private tunnelState: TunnelRuntimeStatus = {
    state: "stopped",
    provider: "none",
    publicUrl: null,
    mcpUrl: null,
    persistent: false,
    pid: null,
    startedAt: null,
    error: null,
    recentLogs: [],
  };

  constructor(configPath?: string) {
    this.configPath = path.resolve(configPath ?? process.env.STORIA_CONNECTIVITY_CONFIG ?? DEFAULT_CONFIG_PATH);
  }

  private defaultConfig(): ConnectivityStoredConfig {
    return {
      accessMode: "local",
      port: Number(process.env.STORIA_SERVER_PORT ?? 4310),
      mcpHttpEnabled: true,
      mcpAuthEnabled: true,
      mcpAuthToken: process.env.STORIA_MCP_TOKEN?.trim() || generateSecureToken(),
      remoteAccessCode: generateRemoteAccessCode(),
      tunnel: {
        provider: "none",
        autoStart: false,
        ngrok: {
          domain: "",
          region: "",
        },
        cloudflare: {
          mode: "quick",
          persistentHostname: "",
        },
      },
    };
  }

  async readConfig(): Promise<ConnectivityStoredConfig> {
    if (this.cachedConfig) return this.cachedConfig;
    const base = this.defaultConfig();
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ConnectivityStoredConfig>;
      const merged: ConnectivityStoredConfig = {
        accessMode: parsed.accessMode === "lan" ? "lan" : "local",
        port: typeof parsed.port === "number" && parsed.port >= 1024 && parsed.port <= 65535 ? parsed.port : base.port,
        mcpHttpEnabled: parsed.mcpHttpEnabled ?? base.mcpHttpEnabled,
        mcpAuthEnabled: parsed.mcpAuthEnabled ?? base.mcpAuthEnabled,
        mcpAuthToken:
          (() => {
            const dec = decryptSecret(parsed.mcpAuthToken);
            return dec && dec.length >= 8 ? dec : base.mcpAuthToken;
          })(),
        remoteAccessCode:
          (() => {
            const dec = decryptSecret(parsed.remoteAccessCode);
            return dec && dec.length >= 12 ? dec : base.remoteAccessCode;
          })(),
        tunnel: {
          provider:
            parsed.tunnel?.provider === "ngrok" || parsed.tunnel?.provider === "cloudflare"
              ? parsed.tunnel.provider
              : "none",
          autoStart: Boolean(parsed.tunnel?.autoStart),
          ngrok: {
            authtoken: decryptSecret(parsed.tunnel?.ngrok?.authtoken),
            domain: normalizeNgrokDomain(parsed.tunnel?.ngrok?.domain),
            region: parsed.tunnel?.ngrok?.region?.trim() ?? "",
          },
          cloudflare: {
            mode: parsed.tunnel?.cloudflare?.mode === "named_token" ? "named_token" : "quick",
            tunnelToken: decryptSecret(parsed.tunnel?.cloudflare?.tunnelToken),
            persistentHostname: normalizeUrlOrigin(parsed.tunnel?.cloudflare?.persistentHostname),
          },
        },
      };
      this.cachedConfig = merged;
      return merged;
    } catch {
      this.cachedConfig = base;
      await this.writeConfig(base).catch(() => {});
      return base;
    }
  }

  private async writeConfig(cfg: ConnectivityStoredConfig): Promise<void> {
    this.cachedConfig = cfg;
    const diskPayload: ConnectivityStoredConfig = {
      ...cfg,
      mcpAuthToken: encryptSecret(cfg.mcpAuthToken) ?? cfg.mcpAuthToken,
      remoteAccessCode: encryptSecret(cfg.remoteAccessCode) ?? cfg.remoteAccessCode,
      tunnel: {
        ...cfg.tunnel,
        ngrok: {
          ...cfg.tunnel.ngrok,
          authtoken: encryptSecret(cfg.tunnel.ngrok.authtoken),
        },
        cloudflare: {
          ...cfg.tunnel.cloudflare,
          tunnelToken: encryptSecret(cfg.tunnel.cloudflare.tunnelToken),
        },
      },
    };
    await fs.mkdir(path.dirname(this.configPath), { recursive: true, mode: 0o700 });
    await fs.writeFile(this.configPath, JSON.stringify(diskPayload, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.chmod(this.configPath, 0o600).catch(() => {});
  }

  toPublicConfig(cfg: ConnectivityStoredConfig, includeAuthToken = true): ConnectivityPublicConfig {
    return {
      accessMode: cfg.accessMode,
      port: cfg.port,
      mcpHttpEnabled: cfg.mcpHttpEnabled,
      mcpAuthEnabled: cfg.mcpAuthEnabled,
      mcpAuthToken: includeAuthToken ? cfg.mcpAuthToken : "",
      hasRemoteAccessCode: Boolean(cfg.remoteAccessCode),
      ...(includeAuthToken ? {} : { tokenRedacted: true }),
      tunnel: {
        provider: cfg.tunnel.provider,
        autoStart: cfg.tunnel.autoStart,
        ngrok: {
          hasAuthtoken: Boolean(cfg.tunnel.ngrok.authtoken?.trim()),
          domain: cfg.tunnel.ngrok.domain ?? "",
          region: cfg.tunnel.ngrok.region ?? "",
        },
        cloudflare: {
          mode: cfg.tunnel.cloudflare.mode,
          hasTunnelToken: Boolean(cfg.tunnel.cloudflare.tunnelToken?.trim()),
          persistentHostname: cfg.tunnel.cloudflare.persistentHostname ?? "",
        },
      },
    };
  }

  async updateConfig(patch: {
    accessMode?: AccessMode;
    port?: number;
    mcpHttpEnabled?: boolean;
    mcpAuthEnabled?: boolean;
    tunnelProvider?: TunnelProvider;
    tunnelAutoStart?: boolean;
    ngrokAuthtoken?: string;
    ngrokDomain?: string;
    ngrokRegion?: string;
    cloudflareMode?: CloudflareTunnelMode;
    cloudflareTunnelToken?: string;
    cloudflarePersistentHostname?: string;
  }): Promise<ConnectivityPublicConfig> {
    const cur = await this.readConfig();
    const next: ConnectivityStoredConfig = {
      ...cur,
      accessMode: patch.accessMode ?? cur.accessMode,
      port: patch.port ?? cur.port,
      mcpHttpEnabled: patch.mcpHttpEnabled ?? cur.mcpHttpEnabled,
      mcpAuthEnabled: patch.mcpAuthEnabled ?? cur.mcpAuthEnabled,
      tunnel: {
        provider: patch.tunnelProvider ?? cur.tunnel.provider,
        autoStart: patch.tunnelAutoStart ?? cur.tunnel.autoStart,
        ngrok: {
          authtoken:
            patch.ngrokAuthtoken !== undefined
              ? patch.ngrokAuthtoken.trim() || undefined
              : cur.tunnel.ngrok.authtoken,
          domain:
            patch.ngrokDomain !== undefined
              ? normalizeNgrokDomain(patch.ngrokDomain)
              : cur.tunnel.ngrok.domain,
          region:
            patch.ngrokRegion !== undefined
              ? patch.ngrokRegion.trim()
              : cur.tunnel.ngrok.region,
        },
        cloudflare: {
          mode: patch.cloudflareMode ?? cur.tunnel.cloudflare.mode,
          tunnelToken:
            patch.cloudflareTunnelToken !== undefined
              ? patch.cloudflareTunnelToken.trim() || undefined
              : cur.tunnel.cloudflare.tunnelToken,
          persistentHostname:
            patch.cloudflarePersistentHostname !== undefined
              ? normalizeUrlOrigin(patch.cloudflarePersistentHostname)
              : cur.tunnel.cloudflare.persistentHostname,
        },
      },
    };
    await this.writeConfig(next);
    return this.toPublicConfig(next);
  }

  async rotateAuthToken(): Promise<ConnectivityPublicConfig> {
    const cur = await this.readConfig();
    const next: ConnectivityStoredConfig = {
      ...cur,
      mcpAuthToken: generateSecureToken(),
    };
    await this.writeConfig(next);
    return this.toPublicConfig(next);
  }

  /**
   * Rotates the independent mobile/tablet remote access code.
   * Immediately invalidates all previously issued `storia_remote_session` HttpOnly cookies.
   */
  async rotateRemoteAccessCode(): Promise<ConnectivityPublicConfig> {
    const cur = await this.readConfig();
    const next: ConnectivityStoredConfig = {
      ...cur,
      remoteAccessCode: generateRemoteAccessCode(),
    };
    await this.writeConfig(next);
    return this.toPublicConfig(next);
  }

  async validateRemoteAccessCode(code?: string): Promise<boolean> {
    if (!code || typeof code !== "string") return false;
    const provided = code.trim();
    if (!provided) return false;
    const cfg = await this.readConfig();
    const expected = cfg.remoteAccessCode;
    if (!expected) return false;
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async createRemoteSessionCookieValue(): Promise<{ value: string; maxAgeSec: number }> {
    const cfg = await this.readConfig();
    const issuedAt = Math.floor(Date.now() / 1000);
    const nonce = crypto.randomBytes(12).toString("base64url");
    const payload = `v1.${issuedAt}.${nonce}`;
    const sig = crypto.createHmac("sha256", cfg.remoteAccessCode).update(payload).digest("base64url");
    return { value: `${payload}.${sig}`, maxAgeSec: REMOTE_SESSION_TTL_SEC };
  }

  async validateRemoteSessionCookie(cookieHeader?: string): Promise<boolean> {
    const cookies = parseCookieMap(cookieHeader);
    const raw = cookies[REMOTE_SESSION_COOKIE_NAME];
    if (!raw) return false;
    const parts = raw.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") return false;
    const issuedAt = Number.parseInt(parts[1] ?? "", 10);
    const nonce = parts[2] ?? "";
    const providedSig = parts[3] ?? "";
    if (!Number.isFinite(issuedAt) || !nonce || !providedSig) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    if (issuedAt > nowSec + 60 || nowSec - issuedAt > REMOTE_SESSION_TTL_SEC) return false;

    const cfg = await this.readConfig();
    const payload = `v1.${issuedAt}.${nonce}`;
    const expectedSig = crypto.createHmac("sha256", cfg.remoteAccessCode).update(payload).digest("base64url");
    const a = Buffer.from(providedSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async validateMcpBearer(authHeader?: string, queryToken?: string): Promise<boolean> {
    const cfg = await this.readConfig();
    if (!cfg.mcpAuthEnabled) return true;
    const expected = cfg.mcpAuthToken;
    if (!expected) return true;

    let provided = "";
    if (typeof authHeader === "string" && authHeader.trim().length > 0) {
      const m = authHeader.trim().match(/^Bearer\s+(.+)$/i);
      provided = m && m[1] ? m[1].trim() : authHeader.trim();
    } else if (typeof queryToken === "string" && queryToken.trim().length > 0) {
      provided = queryToken.trim();
    }
    if (!provided) return false;

    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  async detectBinaries(force = false): Promise<{ ngrok: TunnelBinaryStatus; cloudflared: TunnelBinaryStatus }> {
    if (this.binariesCache && !force) return this.binariesCache;
    const home = os.homedir();
    const isWin = process.platform === "win32";
    const localAppData = process.env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
    const programData = process.env.ProgramData ?? "C:\\ProgramData";

    const ngrokWinCandidates = [
      path.join(LOCAL_BIN_DIR, "ngrok.exe"),
      "ngrok.exe",
      "ngrok",
      path.join(localAppData, "Microsoft", "WinGet", "Links", "ngrok.exe"),
      path.join(localAppData, "ngrok", "ngrok.exe"),
      path.join(home, "scoop", "shims", "ngrok.exe"),
      path.join(home, ".local", "bin", "ngrok.exe"),
      path.join(programData, "chocolatey", "bin", "ngrok.exe"),
      "C:\\Program Files\\ngrok\\ngrok.exe",
      "C:\\Program Files (x86)\\ngrok\\ngrok.exe",
      "C:\\ngrok\\ngrok.exe",
      "C:\\Tools\\ngrok.exe",
    ];

    const ngrokUnixCandidates = [
      path.join(LOCAL_BIN_DIR, "ngrok"),
      "ngrok",
      path.join(home, ".local", "bin", "ngrok"),
      "/usr/local/bin/ngrok",
      "/usr/bin/ngrok",
      path.join(LOCAL_BIN_DIR, "ngrok.exe"),
      "ngrok.exe",
      "/mnt/c/ProgramData/chocolatey/bin/ngrok.exe",
      "/mnt/c/Program Files/ngrok/ngrok.exe",
    ];

    const cfWinCandidates = [
      path.join(LOCAL_BIN_DIR, "cloudflared.exe"),
      "cloudflared.exe",
      "cloudflared",
      "C:\\Program Files (x86)\\cloudflared\\cloudflared.exe",
      "C:\\Program Files\\cloudflared\\cloudflared.exe",
      path.join(localAppData, "Microsoft", "WinGet", "Links", "cloudflared.exe"),
      path.join(home, "scoop", "shims", "cloudflared.exe"),
      path.join(programData, "chocolatey", "bin", "cloudflared.exe"),
    ];

    const cfUnixCandidates = [
      path.join(LOCAL_BIN_DIR, "cloudflared"),
      "cloudflared",
      path.join(home, ".local", "bin", "cloudflared"),
      "/usr/local/bin/cloudflared",
      path.join(LOCAL_BIN_DIR, "cloudflared.exe"),
      "/mnt/c/Program Files (x86)/cloudflared/cloudflared.exe",
      "/mnt/c/Program Files/cloudflared/cloudflared.exe",
      "cloudflared.exe",
    ];

    const [ngrok, cloudflared] = await Promise.all([
      probeBinary(isWin ? ngrokWinCandidates : ngrokUnixCandidates, ["version"]),
      probeBinary(isWin ? cfWinCandidates : cfUnixCandidates, ["--version"]),
    ]);
    this.binariesCache = { ngrok, cloudflared };
    return this.binariesCache;
  }

  /**
   * Downloads and installs the official ngrok or cloudflared binary into `models/bin/`
   * so Storia Studio works out-of-the-box without requiring manual system PATH edits.
   */
  async installBinary(provider: "ngrok" | "cloudflare"): Promise<TunnelBinaryStatus> {
    await fs.mkdir(LOCAL_BIN_DIR, { recursive: true });
    const isWin = process.platform === "win32";
    const arch = process.arch === "arm64" ? "arm64" : "amd64";

    if (provider === "ngrok") {
      const targetExe = path.join(LOCAL_BIN_DIR, isWin ? "ngrok.exe" : "ngrok");
      const downloadUrl = isWin
        ? `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-${arch}.zip`
        : process.platform === "darwin"
          ? `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-darwin-${arch}.zip`
          : `https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${arch}.tgz`;

      const archivePath = path.join(LOCAL_BIN_DIR, `ngrok_dl_${Date.now()}${downloadUrl.endsWith(".zip") ? ".zip" : ".tgz"}`);
      const res = await fetch(downloadUrl, { redirect: "follow", signal: AbortSignal.timeout(90_000) });
      if (!res.ok) {
        throw new Error(`No se pudo descargar ngrok (HTTP ${res.status})`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(archivePath, buf);

      try {
        if (downloadUrl.endsWith(".zip")) {
          if (isWin) {
            await execFileAsync(
              "powershell.exe",
              [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${LOCAL_BIN_DIR.replace(/'/g, "''")}' -Force`,
              ],
              { timeout: 60_000, windowsHide: true },
            );
          } else {
            await execFileAsync("unzip", ["-o", archivePath, "-d", LOCAL_BIN_DIR], { timeout: 60_000 });
          }
        } else {
          await execFileAsync("tar", ["-xzf", archivePath, "-C", LOCAL_BIN_DIR], { timeout: 60_000 });
        }
        if (!isWin) {
          await fs.chmod(targetExe, 0o755).catch(() => {});
        }
      } finally {
        await fs.rm(archivePath, { force: true }).catch(() => {});
      }

      const bins = await this.detectBinaries(true);
      if (!bins.ngrok.installed) {
        throw new Error("ngrok fue descargado pero no pudo verificarse. Intenta reiniciar o revisar antivirus.");
      }
      return bins.ngrok;
    }

    // Cloudflare cloudflared direct binary release
    const targetBin = path.join(LOCAL_BIN_DIR, isWin ? "cloudflared.exe" : "cloudflared");
    const cfUrl = isWin
      ? `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-${arch}.exe`
      : `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
    const res = await fetch(cfUrl, { redirect: "follow", signal: AbortSignal.timeout(90_000) });
    if (!res.ok) {
      throw new Error(`No se pudo descargar cloudflared (HTTP ${res.status})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(targetBin, buf);
    if (!isWin) {
      await fs.chmod(targetBin, 0o755).catch(() => {});
    }
    const bins = await this.detectBinaries(true);
    if (!bins.cloudflared.installed) {
      throw new Error("cloudflared fue descargado pero no pudo verificarse.");
    }
    return bins.cloudflared;
  }

  private pushLog(line: string): void {
    const clean = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
    if (!clean) return;
    const redacted = clean
      .replace(/--token\s+\S+/gi, "--token ***")
      .replace(/--authtoken[=\s]+\S+/gi, "--authtoken=***");
    this.tunnelState.recentLogs.push(redacted.slice(0, 260));
    if (this.tunnelState.recentLogs.length > 40) {
      this.tunnelState.recentLogs.splice(0, this.tunnelState.recentLogs.length - 40);
    }
  }

  async stopTunnel(): Promise<TunnelRuntimeStatus> {
    this.tunnelGeneration += 1;
    const proc = this.tunnelProc;
    this.tunnelProc = null;

    this.tunnelState = {
      state: "stopped",
      provider: "none",
      publicUrl: null,
      mcpUrl: null,
      persistent: false,
      pid: null,
      startedAt: null,
      error: null,
      recentLogs: this.tunnelState.recentLogs.slice(-6),
    };

    if (proc) {
      proc.stdout?.removeAllListeners("data");
      proc.stderr?.removeAllListeners("data");
      proc.removeAllListeners("error");
      proc.removeAllListeners("exit");

      const isAlive = () => proc.exitCode === null && proc.signalCode === null;
      const waitForExit = (timeoutMs: number) =>
        new Promise<void>((resolve) => {
          if (!isAlive()) {
            resolve();
            return;
          }
          const timer = setTimeout(() => {
            proc.removeListener("exit", onDone);
            resolve();
          }, timeoutMs);
          const onDone = () => {
            clearTimeout(timer);
            resolve();
          };
          proc.once("exit", onDone);
        });

      const pid = proc.pid;
      if (isAlive()) {
        try {
          if (process.platform !== "win32" && pid) {
            try {
              process.kill(-pid, "SIGTERM");
            } catch {
              proc.kill("SIGTERM");
            }
          } else {
            proc.kill("SIGTERM");
          }
        } catch {
          // Process may have already exited
        }
        await waitForExit(500);
      }

      if (isAlive()) {
        try {
          if (process.platform === "win32" && pid) {
            await execFileAsync("taskkill", ["/PID", String(pid), "/T", "/F"], {
              timeout: 4000,
              windowsHide: true,
            }).catch(() => {});
          } else if (pid) {
            try {
              process.kill(-pid, "SIGKILL");
            } catch {
              proc.kill("SIGKILL");
            }
          } else {
            proc.kill("SIGKILL");
          }
        } catch {
          // Ignore already exited
        }
        await waitForExit(500);
      }
    }

    return { ...this.tunnelState };
  }

  async startTunnel(opts: {
    provider?: TunnelProvider;
    targetPort: number;
  }): Promise<TunnelRuntimeStatus> {
    const cfg = await this.readConfig();
    const provider = opts.provider ?? cfg.tunnel.provider;
    if (provider === "none") {
      return this.stopTunnel();
    }

    await this.stopTunnel();
    const bins = await this.detectBinaries(true);
    const localTarget = `${HTTP_SCHEME}${LOOPBACK_HOST}:${opts.targetPort}`;

    if (provider === "ngrok") {
      if (!bins.ngrok.installed || !bins.ngrok.binPath) {
        this.tunnelState = {
          state: "error",
          provider: "ngrok",
          publicUrl: null,
          mcpUrl: null,
          persistent: false,
          pid: null,
          startedAt: null,
          error: "Binario 'ngrok' no encontrado en PATH. Instálalo desde ngrok.com/download.",
          recentLogs: [],
        };
        return this.tunnelState;
      }

      const domain = normalizeNgrokDomain(cfg.tunnel.ngrok.domain);
      const args = ["http", localTarget, "--log=stdout", "--log-format=logfmt"];
      if (domain) args.push(`--url=${domain}`);
      if (cfg.tunnel.ngrok.region) args.push(`--region=${cfg.tunnel.ngrok.region}`);
      if (cfg.tunnel.ngrok.authtoken) args.push(`--authtoken=${cfg.tunnel.ngrok.authtoken}`);

      const ngrokApiUrl = `${HTTP_SCHEME}${LOOPBACK_HOST}:4040/api/tunnels`;

      return this.launchTunnelProcess({
        provider: "ngrok",
        binPath: bins.ngrok.binPath,
        args,
        persistent: Boolean(domain),
        knownPublicUrl: domain ? `${HTTPS_SCHEME}${domain}` : null,
        urlExtractor: (line) => {
          const m = line.match(/url=(https:\/\/[^\s"]+)/i);
          return m?.[1] ?? null;
        },
        pollFallback: async () => {
          try {
            const res = await fetch(ngrokApiUrl, { signal: AbortSignal.timeout(1500) });
            if (!res.ok) return null;
            const data = (await res.json()) as { tunnels?: { public_url?: string }[] };
            const https = data.tunnels?.find((t) => t.public_url?.startsWith(HTTPS_SCHEME))?.public_url;
            return https ?? data.tunnels?.[0]?.public_url ?? null;
          } catch {
            return null;
          }
        },
      });
    }

    if (!bins.cloudflared.installed || !bins.cloudflared.binPath) {
      this.tunnelState = {
        state: "error",
        provider: "cloudflare",
        publicUrl: null,
        mcpUrl: null,
        persistent: false,
        pid: null,
        startedAt: null,
        error: "Binario 'cloudflared' no encontrado. Instálalo con winget install Cloudflare.cloudflared.",
        recentLogs: [],
      };
      return this.tunnelState;
    }

    const cf = cfg.tunnel.cloudflare;
    if (cf.mode === "named_token") {
      if (!cf.tunnelToken?.trim()) {
        this.tunnelState = {
          state: "error",
          provider: "cloudflare",
          publicUrl: null,
          mcpUrl: null,
          persistent: true,
          pid: null,
          startedAt: null,
          error: "Falta el Cloudflare Tunnel Token para el modo URL persistente (Zero Trust Named Tunnel).",
          recentLogs: [],
        };
        return this.tunnelState;
      }
      const persistentUrl = normalizeUrlOrigin(cf.persistentHostname) || null;
      return this.launchTunnelProcess({
        provider: "cloudflare",
        binPath: bins.cloudflared.binPath,
        args: ["tunnel", "--no-autoupdate", "run", "--token", cf.tunnelToken.trim()],
        persistent: true,
        knownPublicUrl: persistentUrl,
        urlExtractor: (line) => extractCloudflareNamedTunnelUrl(line),
        readyMatcher: (line) => /Registered tunnel connection/i.test(line),
      });
    }

    return this.launchTunnelProcess({
      provider: "cloudflare",
      binPath: bins.cloudflared.binPath,
      args: ["tunnel", "--no-autoupdate", "--url", localTarget],
      persistent: false,
      knownPublicUrl: null,
      urlExtractor: (line) => {
        const m = line.match(/(https:\/\/[a-z0-9-]+\.trycloudflare\.com)/i);
        return m?.[1] ?? null;
      },
    });
  }

  private async launchTunnelProcess(opts: {
    provider: TunnelProvider;
    binPath: string;
    args: string[];
    persistent: boolean;
    knownPublicUrl: string | null;
    urlExtractor?: (line: string) => string | null;
    readyMatcher?: (line: string) => boolean;
    pollFallback?: () => Promise<string | null>;
  }): Promise<TunnelRuntimeStatus> {
    const gen = ++this.tunnelGeneration;
    this.tunnelState = {
      state: "starting",
      provider: opts.provider,
      publicUrl: opts.knownPublicUrl,
      mcpUrl: opts.knownPublicUrl ? `${opts.knownPublicUrl.replace(/\/+$/, "")}/mcp` : null,
      persistent: opts.persistent,
      pid: null,
      startedAt: new Date().toISOString(),
      error: null,
      recentLogs: [],
    };

    const proc = spawn(opts.binPath, opts.args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32",
    });
    this.tunnelProc = proc;
    this.tunnelState.pid = proc.pid ?? null;

    let resolvedUrl: string | null = opts.knownPublicUrl;
    let readySeen = false;
    let readyAt = 0;

    const processLine = (rawLine: string) => {
      if (gen !== this.tunnelGeneration || this.tunnelProc !== proc) return;
      if (!rawLine.trim()) return;
      const safeLine = redactSecrets(rawLine, [
        this.cachedConfig?.mcpAuthToken,
        this.cachedConfig?.tunnel.ngrok.authtoken,
        this.cachedConfig?.tunnel.cloudflare.tunnelToken,
      ]);
      this.pushLog(safeLine);
      if (opts.urlExtractor && !resolvedUrl) {
        const found = opts.urlExtractor(rawLine);
        if (found) {
          resolvedUrl = found.replace(/\/+$/, "");
          this.tunnelState.publicUrl = resolvedUrl;
          this.tunnelState.mcpUrl = `${resolvedUrl}/mcp`;
          this.tunnelState.state = "running";
        }
      }
      if (opts.readyMatcher && opts.readyMatcher(rawLine)) {
        if (!readySeen) readyAt = Date.now();
        readySeen = true;
        this.tunnelState.state = "running";
      }
    };

    let stdoutBuf = "";
    let stderrBuf = "";
    const makeChunkHandler = (isErr: boolean) => (chunk: Buffer) => {
      if (gen !== this.tunnelGeneration || this.tunnelProc !== proc) return;
      const combined = (isErr ? stderrBuf : stdoutBuf) + chunk.toString("utf8");
      const lines = combined.split(/\r?\n/);
      const tail = lines.pop() ?? "";
      if (isErr) stderrBuf = tail;
      else stdoutBuf = tail;
      for (const line of lines) processLine(line);
      if (tail.length > 0 && (tail.includes("trycloudflare.com") || tail.includes("hostname") || tail.includes("url="))) {
        processLine(tail);
      }
    };

    proc.stdout?.on("data", makeChunkHandler(false));
    proc.stderr?.on("data", makeChunkHandler(true));

    proc.on("error", (err) => {
      if (gen !== this.tunnelGeneration || this.tunnelProc !== proc) return;
      this.tunnelState.state = "error";
      this.tunnelState.error = err.message;
      this.tunnelProc = null;
    });

    proc.on("exit", (code, signal) => {
      if (gen === this.tunnelGeneration && this.tunnelProc === proc) {
        this.tunnelProc = null;
        if (this.tunnelState.state !== "stopped") {
          this.tunnelState.state = code === 0 ? "stopped" : "error";
          if (code !== 0) {
            const lastLog = this.tunnelState.recentLogs[this.tunnelState.recentLogs.length - 1];
            this.tunnelState.error =
              lastLog || `El proceso del túnel finalizó (code=${code ?? "null"}, signal=${signal ?? "none"}).`;
          }
          this.tunnelState.pid = null;
        }
      }
    });

    const deadline = Date.now() + 9000;
    while (Date.now() < deadline) {
      if (gen !== this.tunnelGeneration) break;
      if (this.tunnelState.state === "error" || this.tunnelState.state === "stopped") break;
      if (this.tunnelState.state === "running") {
        if (this.tunnelState.publicUrl) break;
        if (readySeen && Date.now() - readyAt >= 2800) break;
      }
      if (!resolvedUrl && opts.pollFallback) {
        const polled = await opts.pollFallback();
        if (polled && gen === this.tunnelGeneration) {
          resolvedUrl = polled.replace(/\/+$/, "");
          this.tunnelState.publicUrl = resolvedUrl;
          this.tunnelState.mcpUrl = `${resolvedUrl}/mcp`;
          this.tunnelState.state = "running";
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (
      gen === this.tunnelGeneration &&
      this.tunnelState.state === "starting" &&
      this.tunnelProc === proc &&
      proc.exitCode === null &&
      this.tunnelState.publicUrl
    ) {
      this.tunnelState.state = "running";
    }

    return { ...this.tunnelState };
  }

  async getStatus(runtimeInfo: {
    listeningHost: string;
    listeningPort: number;
    refreshBinaries?: boolean;
    includeAuthToken?: boolean;
  }): Promise<ConnectivityStatusResponse> {
    const [cfg, binaries] = await Promise.all([
      this.readConfig(),
      this.detectBinaries(Boolean(runtimeInfo.refreshBinaries)),
    ]);

    const port = runtimeInfo.listeningPort;
    const lanActiveNow = runtimeInfo.listeningHost === "0.0.0.0" || runtimeInfo.listeningHost === "::";
    const wantLan = cfg.accessMode === "lan";
    const restartRequiredForBind = wantLan !== lanActiveNow || cfg.port !== port;
    const lanAddresses = detectLanAddresses(port);

    const mcpEntryPosix = path.join(STORIA_STUDIO_ROOT, "apps/mcp/dist/index.js");

    const includeSecrets = runtimeInfo.includeAuthToken ?? true;
    const mobileAccessUrl =
      includeSecrets && this.tunnelState.publicUrl
        ? `${this.tunnelState.publicUrl.replace(/\/+$/, "")}/auth/remote?code=${encodeURIComponent(cfg.remoteAccessCode)}`
        : null;

    return {
      config: this.toPublicConfig(cfg, includeSecrets),
      runtime: {
        listeningHost: runtimeInfo.listeningHost,
        listeningPort: port,
        lanActiveNow,
        restartRequiredForBind,
        localStudioUrl: `${HTTP_SCHEME}${LOOPBACK_HOST}:${port}`,
        localMcpUrl: `${HTTP_SCHEME}${LOOPBACK_HOST}:${port}/mcp`,
        lanAddresses,
        mcpStdioEntry: mcpEntryPosix,
        mcpStdioWindowsEntry: toWindowsPath(mcpEntryPosix),
      },
      binaries,
      tunnel: {
        ...this.tunnelState,
        mobileAccessUrl,
      },
    };
  }

  async buildAiIntegrationBundle(opts: {
    harness: AiHarnessId;
    mode: AiTransportMode;
    listeningHost: string;
    listeningPort: number;
  }): Promise<AiIntegrationBundle> {
    const status = await this.getStatus({
      listeningHost: opts.listeningHost,
      listeningPort: opts.listeningPort,
    });
    const cfg = status.config;
    const primaryLan = status.runtime.lanAddresses[0];

    const configuredPersistentUrl =
      cfg.tunnel.provider === "ngrok" && cfg.tunnel.ngrok.domain
        ? `${HTTPS_SCHEME}${cfg.tunnel.ngrok.domain}`
        : cfg.tunnel.provider === "cloudflare" && cfg.tunnel.cloudflare.persistentHostname
          ? cfg.tunnel.cloudflare.persistentHostname
          : null;

    const tunnelOrigin =
      status.tunnel.publicUrl ??
      configuredPersistentUrl ??
      `${HTTPS_SCHEME}<tu-url-persistente-ngrok-o-cloudflare>`;
    const lanOrigin = primaryLan ? primaryLan.studioUrl : `${HTTP_SCHEME}<IP-LOCAL-DEL-PC>:${opts.listeningPort}`;

    const studioUrl =
      opts.mode === "tunnel"
        ? tunnelOrigin
        : opts.mode === "lan"
          ? lanOrigin
          : status.runtime.localStudioUrl;

    const mcpUrl = `${studioUrl.replace(/\/+$/, "")}/mcp`;
    const authRequired = opts.mode !== "stdio" && cfg.mcpAuthEnabled;
    const authHeader = authRequired ? `Bearer ${cfg.mcpAuthToken}` : null;
    const mcpUrlWithToken = authRequired ? `${mcpUrl}?token=${cfg.mcpAuthToken}` : mcpUrl;

    const HARNESS_LABELS: Record<AiHarnessId, string> = {
      universal: "Universal (Cualquier IA / Harness MCP)",
      claude: "Claude (Desktop / Code / Web)",
      codex: "OpenAI Codex CLI",
      antigravity: "Antigravity / Gemini CLI",
      opencode: "OpenCode",
      cursor: "Cursor / Windsurf / VS Code",
    };

    let configFormat: "json" | "toml" = "json";
    let configFilename = "mcp.json";
    let configSnippet = "";

    if (opts.harness === "codex") {
      configFormat = "toml";
      configFilename = "~/.codex/config.toml";
      if (opts.mode === "stdio") {
        configSnippet = [
          "[mcp_servers.storia_studio]",
          'command = "node"',
          `args = ["${status.runtime.mcpStdioEntry}"]`,
          "",
          "[mcp_servers.storia_studio.env]",
          `STORIA_SERVER_URL = "${status.runtime.localStudioUrl}"`,
        ].join("\n");
      } else {
        configSnippet = [
          "[mcp_servers.storia_studio]",
          `url = "${mcpUrl}"`,
          ...(authHeader
            ? ["", "[mcp_servers.storia_studio.http_headers]", `Authorization = "${authHeader}"`]
            : []),
        ].join("\n");
      }
    } else if (opts.harness === "opencode") {
      configFormat = "json";
      configFilename = "opencode.json";
      if (opts.mode === "stdio") {
        configSnippet = JSON.stringify(
          {
            mcp: {
              storia_studio: {
                type: "local",
                command: ["node", status.runtime.mcpStdioEntry],
                environment: {
                  STORIA_SERVER_URL: status.runtime.localStudioUrl,
                },
                enabled: true,
              },
            },
          },
          null,
          2,
        );
      } else {
        configSnippet = JSON.stringify(
          {
            mcp: {
              storia_studio: {
                type: "remote",
                url: mcpUrl,
                ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
                enabled: true,
              },
            },
          },
          null,
          2,
        );
      }
    } else {
      configFormat = "json";
      configFilename =
        opts.harness === "claude"
          ? "claude_desktop_config.json / .mcp.json"
          : opts.harness === "antigravity"
            ? "~/.gemini/antigravity/mcp_config.json"
            : opts.harness === "cursor"
              ? ".cursor/mcp.json"
              : "mcp_config.json";

      if (opts.mode === "stdio") {
        configSnippet = JSON.stringify(
          {
            mcpServers: {
              storia_studio: {
                command: "node",
                args: [status.runtime.mcpStdioEntry],
                env: {
                  STORIA_SERVER_URL: status.runtime.localStudioUrl,
                },
              },
            },
          },
          null,
          2,
        );
      } else {
        const entry: Record<string, unknown> =
          opts.harness === "antigravity"
            ? {
                serverUrl: mcpUrl,
                ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
              }
            : {
                type: "http",
                url: mcpUrl,
                ...(authHeader ? { headers: { Authorization: authHeader } } : {}),
              };
        configSnippet = JSON.stringify(
          {
            mcpServers: {
              storia_studio: entry,
            },
          },
          null,
          2,
        );
      }
    }

    const modeLabel =
      opts.mode === "tunnel"
        ? "Remoto HTTPS (Túnel persistente ngrok / Cloudflare)"
        : opts.mode === "lan"
          ? "Red Local (LAN / Otro dispositivo en el mismo Wi-Fi)"
          : "Local (stdio en este mismo equipo)";

    const structuredPrompt = `# Integración de Storia Studio MCP (${HARNESS_LABELS[opts.harness]})

Quiero conectar y operar **Storia Studio** (estudio profesional local de animación 2D/Stickman/Retro con WebGL2, 18 estilos visuales, 890 audios CC0/CC-BY, 5 fuentes OFL, TTS multi-proveedor y exportación MP4 con FFmpeg) mediante **Model Context Protocol (MCP)**.

## 1. Datos de conexión activos
- **Modo de conexión:** ${modeLabel}
- **URL del Editor Web (Storia Studio):** ${studioUrl}
- **Endpoint MCP Streamable HTTP:** ${mcpUrl}
${authRequired ? `- **Autenticación (Header HTTP):** \`Authorization: ${authHeader}\`\n- **URL alternativa con token (para conectores web sin headers personalizados):** ${mcpUrlWithToken}` : "- **Autenticación:** Desactivada (acceso abierto en esta red)"}
- **Entrada local stdio (Linux/WSL):** \`node ${status.runtime.mcpStdioEntry}\`
- **Entrada local stdio (Windows):** \`node "${status.runtime.mcpStdioWindowsEntry}"\`

## 2. Configuración MCP exacta (\`${configFilename}\`)
Si tienes acceso a archivos de configuración de tu entorno (${HARNESS_LABELS[opts.harness]}), agrega o verifica esta entrada MCP:

\`\`\`${configFormat}
${configSnippet}
\`\`\`
${opts.harness === "claude" ? `\n> **Comando rápido para Claude Code CLI:**\n> \`claude mcp add --transport http storia-studio "${mcpUrl}"${authHeader ? ` --header "Authorization: ${authHeader}"` : ""}\`\n` : ""}
## 3. Capacidades y herramientas MCP disponibles en Storia Studio
Una vez conectado el servidor \`storia_studio\`, dispones de control completo en tiempo real (los cambios se reflejan en vivo vía WebSocket en el editor):

1. **Dirección Autónoma Completa (Stickman Director + Storia):**
   - \`list_animation_styles\`: lista los **18 estilos** (Storia Editorial 2D + A1–A8 + B1–B8: Minimal Paper Grid, Modern Pop Beanie, Rubber Hose 1930s, Studio Ghibli, Retro TV, Survival Thriller, Meme Story, Pixel Theater, Greek Mythology), las 5 fuentes OFL y las 83 guías.
   - \`get_style_direction_guide\`: lee las reglas de dirección de cualquier estilo (\`b1-minimal-handdrawn.md\`, \`b8-greek-mythology.md\`, \`rubber-hose.md\`, etc.).
   - \`recommend_style_audio\`: recomienda BGM y SFX del catálogo local de 890 audios por estilo y beat narrativo.
   - \`direct_and_assemble_video\`: ensambla un proyecto multi-escena completo en una sola llamada (reparto con 26 peinados, 12 barbas/bigotes, 30 sombreros, 12 vestimentas, 24 roles automáticos, poses con IK de 2 huesos, cámara, titulares, TTS + subtítulos Whisper, música con ducking y SFX).
   - \`apply_animation_style\`: cambia en vivo el estilo global de un proyecto.
2. **Edición Fina de Proyecto, Escenas, Capas y Rig 2D:**
   - \`list_projects\`, \`create_project\`, \`get_project\`, \`patch_project\` (operaciones atómicas de escenas, capas, personajes, keyframes, subtítulos karaoke y shaders PSX/Pixel-Art/Cinematic/Noir).
3. **Audio, TTS Multi-Proveedor y Librerías:**
   - \`list_tts_providers\`, \`list_tts_voices\`, \`generate_tts_narration\` (ElevenLabs, Windows SAPI, VoiceStudio, Piper ONNX, Kokoro-82M, OpenAI, API personalizada).
   - \`search_vector_library\`, \`import_vector_from_library\`, \`search_audio_library\`, \`import_audio_from_library\`.
4. **Control de Calidad Visual 1:1 y Exportación MP4:**
   - \`audit_project\`: detecta solapamientos, zonas seguras, ritmo y audio.
   - \`capture_frame\`: renderiza y devuelve una captura PNG exacta 1:1 del timestamp indicado para inspección visual.
   - \`start_export\` / \`get_export_status\`: exporta el video final en MP4 (hasta 4K 60 FPS con NVENC/x264 y masterización -16 LUFS).

## 4. Verificación inicial que debes ejecutar ahora
1. Confirma la conexión llamando a \`list_animation_styles\` y \`list_projects\`.
2. Repórtame cuántos estilos, proyectos y proveedores TTS ves disponibles.
3. Queda listo para recibir mi guion, tema o estilo y dirigir/editar videos en Storia Studio.`;

    return {
      harness: opts.harness,
      harnessLabel: HARNESS_LABELS[opts.harness],
      mode: opts.mode,
      mcpUrl,
      studioUrl,
      authRequired,
      authHeader,
      configFormat,
      configFilename,
      configSnippet,
      structuredPrompt,
    };
  }
}
