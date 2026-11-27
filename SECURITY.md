# Security Policy

## Architecture & Built-in Protections

Storia Studio is designed as a **local-first** application with **Zero-Trust** hardening for LAN, remote tunnels (ngrok / Cloudflare), and Model Context Protocol (MCP) integrations:

- **Encrypted Secret Vault (`AES-256-GCM`):** TTS API keys, tunnel tokens, and remote access codes are encrypted on disk using a machine-local 256-bit master key stored outside the project workspace (`~/.storia-studio/.vault.key`, `0600` permissions). Secrets are never returned in plaintext over REST APIs and are automatically scrubbed from error responses.
- **Strict Local-Admin Isolation:** Credential management, tunnel controls, OAuth revocation, library configuration, and internal render-ingest endpoints strictly require a direct loopback request from the host machine (`127.0.0.1` / `localhost`) with no proxy/forwarding headers and no MCP agent headers (`403 Forbidden` otherwise).
- **Zero-Trust Remote Tunnel Gate:** Requests arriving over public tunnels or reverse proxies require either a valid **OAuth 2.1 + PKCE (`S256`)** token, an MCP Bearer token, or a signed **`HttpOnly; SameSite=Lax; Secure`** mobile session cookie issued via `/auth/remote?code=...`. Rotating the mobile link immediately revokes all active mobile cookies.
- **Remote MCP Filesystem Restriction:** When exposed over Streamable HTTP (`/mcp`), arbitrary host filesystem read/write tools (`import_local_asset`, `replace_project_asset(local_file)`, `capture_frame(saveToPath)`) are disabled. Even in local `stdio` mode, sensitive system and credential paths (`.vault.key`, `.ssh`, `.aws`, `.gnupg`, `.env`, etc.) are blocked.
- **Anti-SSRF Protection:** Remote library previews and imports enforce HTTPS-only URLs, verify resolved DNS IPs against loopback/RFC1918/link-local/cloud-metadata ranges, and re-validate every redirect hop.
- **XSS & Upload Hardening:** Uploaded SVGs are sanitized (`<script>`, `<foreignObject>`, `on*`, `javascript:`), served with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, and executable/HTML uploads are rejected. Global `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` headers are enforced on all responses.
- **Sliding-Window Rate Limiting:** Applied to OAuth registration/authorization/token endpoints, remote unlock attempts, and unauthorized `/mcp` or remote `/api/*` requests.

## Reporting a Vulnerability

If you discover a security vulnerability, please **do not** open a public GitHub issue with exploit details. Instead, contact the repository maintainer privately via GitHub Security Advisories or direct message with:

1. Affected endpoint, tool, or file path.
2. Minimal reproduction steps or proof of concept.
3. Estimated impact and suggested mitigation (if known).
