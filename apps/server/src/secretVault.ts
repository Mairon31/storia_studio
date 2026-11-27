import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { FastifyRequest } from "fastify";

const ENC_PREFIX = "enc:v1:";
const KEY_BYTES = 32;

let cachedVaultKey: Buffer | null = null;

function resolveVaultKeyPath(): string {
  const override = process.env.STORIA_VAULT_KEY_PATH?.trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".storia-studio", ".vault.key");
}

/**
 * Loads or generates a machine-local 256-bit master key stored OUTSIDE the project workspace
 * (with strict 0600 permissions) so workspace files and AI/MCP tools can never read plaintext API keys.
 */
function getOrCreateVaultKey(): Buffer {
  if (cachedVaultKey) return cachedVaultKey;

  const envHex = process.env.STORIA_VAULT_KEY?.trim();
  if (envHex && /^[0-9a-f]{64}$/i.test(envHex)) {
    cachedVaultKey = Buffer.from(envHex, "hex");
    return cachedVaultKey;
  }

  const keyPath = resolveVaultKeyPath();
  try {
    const raw = fs.readFileSync(keyPath, "utf8").trim();
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      cachedVaultKey = Buffer.from(raw, "hex");
      return cachedVaultKey;
    }
  } catch {
    // Key file not created yet
  }

  const generated = crypto.randomBytes(KEY_BYTES);
  try {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyPath, generated.toString("hex") + "\n", { encoding: "utf8", mode: 0o600 });
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch {
      // Windows NTFS ignores POSIX chmod; file still resides in user profile directory
    }
  } catch {
    // Fallback deterministic machine key only if user home is read-only
    const machineSeed = `${os.hostname()}|${os.userInfo().username}|storia-studio-vault-v1`;
    cachedVaultKey = crypto.createHash("sha256").update(machineSeed).digest();
    return cachedVaultKey;
  }

  cachedVaultKey = generated;
  return cachedVaultKey;
}

/**
 * Encrypts a secret string using AES-256-GCM authenticated encryption.
 */
export function encryptSecret(plaintext: string | undefined): string | undefined {
  const clean = plaintext?.trim();
  if (!clean) return undefined;
  if (clean.startsWith(ENC_PREFIX)) return clean;

  const key = getOrCreateVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(clean, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/**
 * Decrypts a secret stored by `encryptSecret`. Transparently accepts legacy plaintext values
 * so existing local configs migrate seamlessly on next save.
 */
export function decryptSecret(stored: string | undefined): string | undefined {
  if (!stored) return undefined;
  const trimmed = stored.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith(ENC_PREFIX)) {
    return trimmed;
  }

  const parts = trimmed.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 3) return undefined;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64!, "base64url");
    const tag = Buffer.from(tagB64!, "base64url");
    const data = Buffer.from(dataB64!, "base64url");
    const key = getOrCreateVaultKey();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return out.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function isEncryptedSecret(value: string | undefined): boolean {
  return Boolean(value && value.trim().startsWith(ENC_PREFIX));
}

/**
 * Redacts known secret values and common token/API-key patterns from error messages and logs.
 */
export function redactSecrets(input: string, knownSecrets: readonly (string | undefined)[] = []): string {
  let out = input;
  for (const s of knownSecrets) {
    if (s && s.length >= 6) {
      out = out.split(s).join("[REDACTED]");
    }
  }
  // Scrub common Bearer / OpenAI / ElevenLabs / Storia MCP key formats
  out = out
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{10,}\b/gi, "$1[REDACTED]")
    .replace(/\b(xi-api-key["':\s]+)[A-Za-z0-9._-]{8,}\b/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\bsk_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_KEY]")
    .replace(/\bstoria_mcp_[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_TOKEN]");
  return out;
}

/**
 * Validates that a provider base URL uses strictly http/https and returns normalized origin+path.
 */
export function normalizeSafeHttpUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw Object.assign(new Error("URL inválida: debe comenzar con http:// o https://"), { statusCode: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw Object.assign(new Error("Protocolo no permitido: solo se acepta http:// o https://"), { statusCode: 400 });
  }
  return trimmed.replace(/\/+$/, "");
}

export function extractOriginSafe(raw: string | undefined): string {
  if (!raw?.trim()) return "";
  try {
    return new URL(raw.trim()).origin.toLowerCase();
  } catch {
    return "";
  }
}

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const clean = addr.trim().toLowerCase();
  return (
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "::ffff:127.0.0.1" ||
    clean === "localhost"
  );
}

function isLoopbackHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return true;
  const clean = hostHeader.trim().toLowerCase();
  // Match localhost[:port], 127.0.0.1[:port], [::1][:port]
  return (
    /^localhost(:\d+)?$/.test(clean) ||
    /^127\.0\.0\.1(:\d+)?$/.test(clean) ||
    /^\[::1\](:\d+)?$/.test(clean)
  );
}

function isPrivateLanHostHeader(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const clean = hostHeader.trim().toLowerCase();
  const hostOnly = clean.replace(/:\d+$/, "");
  if (hostOnly.endsWith(".local") || hostOnly.endsWith(".lan")) return true;
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostOnly) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostOnly) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostOnly)
  );
}

const REMOTE_PROXY_HEADERS = [
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "cf-connecting-ip",
  "cf-ray",
  "forwarded",
  "x-original-host",
  "true-client-ip",
] as const;

/**
 * Detects whether an incoming request arrived through a remote tunnel / public reverse proxy
 * (e.g. ngrok, Cloudflare Tunnel, public domain) rather than direct localhost or home LAN Wi-Fi.
 */
export function isRemoteTunnelRequest(req: FastifyRequest): boolean {
  for (const h of REMOTE_PROXY_HEADERS) {
    if (req.headers[h] !== undefined && String(req.headers[h]).trim() !== "") {
      return true;
    }
  }
  const hostHeader = typeof req.headers.host === "string" ? req.headers.host : undefined;
  if (hostHeader && !isLoopbackHostHeader(hostHeader) && !isPrivateLanHostHeader(hostHeader)) {
    return true;
  }
  const remoteAddr = (req.socket?.remoteAddress || req.ip || "").replace(/^::ffff:/i, "");
  if (remoteAddr && !isLoopbackAddress(remoteAddr) && !isPrivateOrReservedIp(remoteAddr)) {
    return true;
  }
  return false;
}

/**
 * Checks whether an IPv4 or IPv6 address belongs to loopback, RFC1918 private LAN,
 * link-local / cloud metadata (169.254.0.0/16), CGNAT (100.64.0.0/10), or reserved ranges.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (!ip) return true;
  const v4Mapped = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const family = net.isIP(v4Mapped);
  if (family === 4) {
    const parts = v4Mapped.split(".").map((n) => Number.parseInt(n, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
    if (a === 169 && b === 254) return true; // Link-local / cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    if (a >= 224) return true; // Multicast & reserved
    return false;
  }
  if (family === 6 || net.isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // Unique local fc00::/7
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true; // Link-local fe80::/10
    if (ip.startsWith("ff")) return true; // Multicast
    return false;
  }
  return true;
}

/**
 * Anti-SSRF validator: verifies that a remote URL is strictly HTTPS, has no embedded credentials,
 * does not target local/internal hostnames, and resolves exclusively to public routable IPs.
 */
export async function assertSafePublicRemoteUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw Object.assign(new Error("Invalid remote URL"), { statusCode: 400 });
  }
  if (parsed.protocol !== "https:") {
    throw Object.assign(new Error("Only HTTPS URLs are allowed for remote media"), { statusCode: 400 });
  }
  if (parsed.username || parsed.password) {
    throw Object.assign(new Error("Credentials in remote URLs are not allowed"), { statusCode: 400 });
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa")
  ) {
    throw Object.assign(new Error("Access to local or internal hosts is blocked (SSRF protection)"), { statusCode: 403 });
  }
  if (net.isIP(host.replace(/^\[|\]$/g, ""))) {
    if (isPrivateOrReservedIp(host)) {
      throw Object.assign(new Error("Access to private or loopback IP addresses is blocked (SSRF protection)"), {
        statusCode: 403,
      });
    }
    return parsed;
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw Object.assign(new Error(`Unable to resolve remote host '${host}'`), { statusCode: 502 });
  }
  if (!addresses || addresses.length === 0) {
    throw Object.assign(new Error(`No DNS records found for '${host}'`), { statusCode: 502 });
  }
  for (const entry of addresses) {
    if (isPrivateOrReservedIp(entry.address)) {
      throw Object.assign(
        new Error("Remote host resolved to a private or loopback IP address (SSRF protection)"),
        { statusCode: 403 },
      );
    }
  }
  return parsed;
}

/**
 * Performs an HTTPS fetch with strict anti-SSRF validation on the initial URL AND every redirect hop.
 */
export async function safeFetchPublicUrl(
  rawUrl: string,
  init: Omit<RequestInit, "redirect"> = {},
  maxRedirects = 5,
): Promise<{ res: Response; finalUrl: string }> {
  let currentUrl = (await assertSafePublicRemoteUrl(rawUrl)).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetch(currentUrl, { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { res, finalUrl: currentUrl };
      if (hop === maxRedirects) {
        throw Object.assign(new Error("Too many redirects while fetching remote media"), { statusCode: 502 });
      }
      const nextUrl = new URL(loc, currentUrl).toString();
      currentUrl = (await assertSafePublicRemoteUrl(nextUrl)).toString();
      continue;
    }
    return { res, finalUrl: currentUrl };
  }
  throw Object.assign(new Error("Redirect limit exceeded"), { statusCode: 502 });
}

/**
 * Checks whether an incoming HTTP request originates from an AI/MCP client.
 */
export function isMcpAgentRequest(req: FastifyRequest): boolean {
  const clientHdr = String(req.headers["x-storia-client"] ?? "").toLowerCase();
  if (clientHdr === "mcp" || req.headers["x-storia-mcp"] !== undefined || req.headers["mcp-session-id"] !== undefined) {
    return true;
  }
  const authHdr = String(req.headers["authorization"] ?? "").trim();
  if (/^bearer\s+storia_mcp_/i.test(authHdr)) {
    return true;
  }
  const body = req.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.requestSource === "mcp") {
    return true;
  }
  return false;
}

/**
 * Strictly verifies that a request comes ONLY from the local desktop host UI (127.0.0.1/localhost),
 * NOT through a reverse proxy / ngrok / Cloudflare tunnel, NOT from another LAN device,
 * and NOT from an AI / MCP client (even local stdio MCP).
 */
export function checkStrictLocalAdminRequest(req: FastifyRequest): { ok: boolean; reason?: string } {
  if (isMcpAgentRequest(req)) {
    return {
      ok: false,
      reason: "Los agentes de IA / clientes MCP no tienen permiso para consultar ni modificar API keys, tokens o configuración de seguridad.",
    };
  }

  // Reject any reverse-proxy / tunnel forwarded requests
  const proxyHeaders = [
    "x-forwarded-for",
    "x-forwarded-host",
    "x-real-ip",
    "cf-connecting-ip",
    "cf-ray",
    "forwarded",
    "x-original-host",
    "true-client-ip",
  ];
  for (const h of proxyHeaders) {
    if (req.headers[h] !== undefined && String(req.headers[h]).trim() !== "") {
      return {
        ok: false,
        reason: "Acceso bloqueado desde túnel o proxy remoto: las API keys y tokens solo pueden gestionarse desde el equipo anfitrión local.",
      };
    }
  }

  const remoteAddr = req.socket?.remoteAddress || req.ip;
  if (!isLoopbackAddress(remoteAddr)) {
    return {
      ok: false,
      reason: "Acceso bloqueado desde dispositivo de red local (LAN) o remoto: gestiona las API keys y tokens únicamente desde localhost en el equipo principal.",
    };
  }

  const hostHeader = typeof req.headers.host === "string" ? req.headers.host : undefined;
  if (!isLoopbackHostHeader(hostHeader)) {
    return {
      ok: false,
      reason: "Acceso bloqueado desde dominio/IP no local: abre Storia Studio en localhost para gestionar credenciales.",
    };
  }

  return { ok: true };
}
