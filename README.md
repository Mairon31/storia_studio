# Storia Studio

Local-first 2D & retro non-linear video editor (NLE) with real-time WebGL2 preview, 23 full-pipeline animation styles, 1:1 FFmpeg (GPU NVENC / CPU) export, multi-provider TTS, and live bidirectional AI control via **Model Context Protocol (MCP)**.

## Key Features

- **Real-Time WebGL2 NLE (`PixiJS v8`):** 60 FPS deterministic preview across `9:16`, `16:9`, `1:1`, and custom resolutions up to 4K, with magnetic timeline snapping, left/right trimming across all tracks (scenes, layers, subtitles, effects, audio, markers), rolling scene edits, and atomic Undo/Redo.
- **23 Full-Pipeline Animation Styles:** Switching styles transforms characters, procedural backgrounds, sprites, shapes, typography, subtitles, and WebGL2 shaders—including **3D Clay & Toon**, **Kurzgesagt Science Vector**, **Anime Cel-Shaded**, **Retro PSX 1998**, **Paper Cutout Craft**, **Pixel Theater 16-bit**, **Rubber Hose 1930s**, **Amber Noir**, **Greek Mythology**, and Stickman A1–A8 / B1–B8 styles.
- **Articulated 2D Character Rigs:** Grounded leg IK, bounded arm IK, 24 role-based wardrobes, 26+ hairstyles, expressions, poses, and modular sprite compositing.
- **CapCut-Grade Subtitles & Motion:** 36 subtitle presets, word-level karaoke highlighting, SRT/VTT import, TikTok/Reels rhythmic pagination, local Whisper transcription, 40 scene transitions with synthesized SFX, and 49 timed video/motion/overlay effects.
- **1:1 Playwright → FFmpeg Export:** Multi-worker parallel rendering, sub-frame motion blur, `h264_nvenc` / `hevc_nvenc` / `av1_nvenc` with automatic `libx264` fallback, and 2-pass `-16 LUFS` EBU R128 loudness mastering.
- **Integrated Free Asset & Audio Libraries:** Openverse (CC0/CC-BY SVGs & audio), Iconify (200k+ icons), Wikimedia Commons, Internet Archive Audio, plus local workspace libraries with automatic `credits.txt` attribution.
- **Multi-Provider TTS:** Local offline synthesis (Windows SAPI, Piper ONNX, Kokoro-82M) and cloud/custom APIs (ElevenLabs, OpenAI-compatible, VoiceStudio, Custom HTTP).
- **Live MCP & Zero-Trust Remote Access:** Stdio and Streamable HTTP (`/mcp`) with OAuth 2.1 + PKCE (`S256`), ngrok & Cloudflare Tunnel management, 1-click revocable mobile links (`HttpOnly` cookie sessions), and AES-256-GCM secret storage.

## Workspace Layout

| Package | Description |
|---|---|
| `packages/schema` (`@storia/schema`) | Zod + TypeScript single source of truth for `project.json`, 23 animation styles, 36 subtitle presets, atomic patch operations, and edit receipts. |
| `packages/renderer` (`@storia/renderer`) | Deterministic PixiJS v8 / WebGL2 engine, GLSL post-processing shaders, `styleEngine`, articulated & stylized character rigs, procedural sets, and word-level subtitles. |
| `apps/studio` (`@storia/studio`) | React 19 + Vite web editor (desktop & mobile/tablet adaptive UI, 60 FPS interactive viewport, multi-track timeline, live SVG code editor, and `/render` headless harness). |
| `apps/server` (`@storia/server`) | Fastify REST & WebSocket server, atomic project persistence + `.history/` snapshots, library proxy/cache, OAuth 2.1 provider, encrypted vault, and FFmpeg exporter. |
| `apps/mcp` (`@storia/mcp`) | MCP server (`stdio` and Streamable HTTP) for live AI direction, batch `edit_audit_and_render`, `direct_and_assemble_video`, frame inspection (`capture_frame`), and export control. |

## Prerequisites

- **Node.js** `>= 22.0.0`
- **pnpm** `11.x` (`corepack enable`)
- **FFmpeg** available in `PATH` (required for MP4 export, audio DSP, and duration probing)
- **Playwright Chromium** (for headless 1:1 MP4 export and `capture_frame`)
- **Python 3.10+** *(optional)* — for local `faster-whisper` transcription and `piper` / `kokoro-onnx` offline TTS

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Build all workspace packages
pnpm build

# 3. Verify environment (Node, FFmpeg, GPU encoders, Chromium)
pnpm doctor

# 4. Seed the demo project (optional)
pnpm seed:demo

# 5. Start Editor UI (localhost:5173) + Local Server (localhost:4310)
pnpm dev
```

### Verification & CLI Export

```bash
pnpm typecheck
pnpm test

# Export a project directly from CLI
pnpm export --project demo_episodum_paradox --resolution 1080p --fps 30 --encoder auto
```

## MCP Integration

- **Local (`stdio`):** Run `pnpm build`, then configure your MCP client using `scripts/mcp-config.example.json` (replace `/path/to/storia_studio/...` with your absolute path).
- **Remote (`Streamable HTTP`):** Open **Settings › Remote (Tunnel)** in Storia Studio to start an ngrok or Cloudflare tunnel and copy the ready-to-paste MCP config or OAuth 2.1 endpoint (`/mcp`).

## Environment Variables (Optional)

All defaults work out of the box. You can optionally set these in a local `.env` file (never committed):

| Variable | Default | Description |
|---|---|---|
| `STORIA_SERVER_HOST` | `127.0.0.1` | Server bind host (`0.0.0.0` for LAN access) |
| `STORIA_SERVER_PORT` | `4310` | Server HTTP/WebSocket port |
| `STORIA_PROJECTS_DIR` | `./projects` | Directory for saved projects and exports |
| `STORIA_VAULT_KEY_PATH` | `~/.storia-studio/.vault.key` | Machine-local AES-256-GCM master key path |
| `STORIA_MCP_TOKEN` | *(auto-generated)* | Optional static MCP Bearer token override |

## Security

See [SECURITY.md](./SECURITY.md) for details on the Zero-Trust remote access model, AES-256-GCM vault, anti-SSRF protection, and responsible vulnerability reporting.

## License

Copyright (c) 2026 Mairon Mayorga. All rights reserved.  
See [LICENSE.md](./LICENSE.md) for full license terms.
