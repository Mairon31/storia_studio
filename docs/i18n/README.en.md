<div align="center">

<img src="../../apps/desktop/src-tauri/icons/icon.png" alt="Storia Studio" width="112" height="112" />

# Storia Studio

**Local-first 2D & Retro video editing and animation studio powered by a 60 FPS WebGL2 engine, 23 full-pipeline animation styles, and live AI control via MCP.**

<p>
  <a href="../../README.md">Español</a> ·
  <strong>English</strong> ·
  <a href="./README.zh-CN.md">简体中文</a> ·
  <a href="./README.ru.md">Русский</a> ·
  <a href="./README.hi.md">हिन्दी</a> ·
  <a href="./README.pt.md">Português</a>
</p>

<p>
  <img src="../assets/badge-version.svg" alt="v0.2.0" />
  <img src="../assets/badge-platforms.svg" alt="Windows · macOS · Linux" />
  <img src="../assets/badge-engine.svg" alt="WebGL2 · Rust Tauri v2" />
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="../assets/badge-discord.svg" alt="Discord Community" />
  </a>
</p>

<p>
  <a href="#download--quick-start">Download</a> ·
  <a href="../README.md">Documentation</a> ·
  <a href="../releases-and-updates.md">Stable & Nightly Channels</a> ·
  <a href="../../SECURITY.md">Security</a> ·
  <a href="https://discord.gg/ahJM3hyFWr">Discord</a>
</p>

</div>

---

## What is Storia Studio?

**Storia Studio** is a local-first non-linear video editor (NLE) built for narrative, educational, short-form, and 2D/retro animation creators. It runs **100% locally** on Windows, macOS, and Linux, keeps your projects and credentials encrypted on your machine, and lets AI agents collaborate live on your timeline through the **Model Context Protocol (MCP)**.

## Highlights

| Capability | What's Included |
|---|---|
| **60 FPS WebGL2 Engine** | Deterministic preview in `9:16`, `16:9`, `1:1`, and up to **4K**, magnetic multi-track timeline with Web Audio waveforms, live SVG code editor, and atomic Undo/Redo. |
| **23 Full-Pipeline Styles** | Switch styles to transform characters, backgrounds, sprites, shapes, typography, subtitles, and GPU shaders: **3D Clay & Toon**, **Kurzgesagt Vector**, **Anime Cel**, **Retro PSX 1998**, **Paper Cutout**, **Pixel 16-bit**, **Rubber Hose 1930s**, **Noir**, **Mythology**, and Stickman A1–B8. |
| **Articulated 2D Rigs** | Grounded leg & arm IK, 24 role wardrobes, 26+ hairstyles, poses, expressions, and modular sprite compositing. |
| **Subtitles, Whisper & TTS** | 36 CapCut/Reels subtitle presets with word-level karaoke highlighting, offline **Whisper** transcription, and offline/cloud TTS (**SAPI**, **Piper ONNX**, **Kokoro-82M**, **ElevenLabs**, **OpenAI**). |
| **1:1 FFmpeg Export** | Parallel GPU (`NVENC`) or CPU (`libx264`) export, sub-frame motion blur, and 2-pass **`-16 LUFS`** EBU R128 loudness mastering. |
| **Built-in Free Libraries** | Millions of CC0/CC-BY SVGs, icons, music, and SFX without API keys (**Openverse**, **Iconify**, **Wikimedia Commons**, **Internet Archive**, **OpenMoji**) with automatic `credits.txt`. |
| **Live AI (MCP) & Zero-Trust** | Bidirectional `stdio` & Streamable HTTP `/mcp` with **OAuth 2.1 + PKCE**, secure mobile tunnel access (`ngrok` / `Cloudflare`), `AES-256-GCM` secret vault, and native **Rust (Tauri v2)** desktop shell. |

## Download & Quick Start

### Desktop App (Windows · macOS · Linux)

Grab the native installer for your OS from the **Releases** tab of this repository:

- **Stable (`v*`):** recommended for daily production (`.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb`, `.rpm`).
- **Nightly (`nightly`):** automatically built on every `master` commit. Switch between **Stable** and **Nightly** anytime in **Settings › Updates** for 1-click SHA-256 verified updates with automatic restart.

On first launch, a guided 6-step **Onboarding Wizard** configures your folders, free libraries, voice models, and network preferences.

### From Source

```bash
pnpm install
pnpm build
pnpm dev
```

## Documentation

Full guides and technical references live in [`docs/`](../README.md):

- **[Getting Started & Installation](../getting-started.md)** — Prerequisites, Onboarding, dev workflow, and environment variables.
- **[Architecture & Creative Engine](../architecture.md)** — Monorepo layout, 23 animation styles, character rigs, and FFmpeg pipeline.
- **[MCP for AI Agents & Remote Access](../mcp-and-remote.md)** — `stdio` & HTTP `/mcp`, OAuth 2.1, tunnels, and Zero-Trust model.
- **[Releases, Channels & Auto-Updates](../releases-and-updates.md)** — Stable/Nightly channels, SHA-256 updater, and local Rust desktop builds.
- **[Security Policy](../../SECURITY.md)** — Encryption vault, local-admin isolation, and vulnerability reporting.

## Community

Join our official **Discord** community for news, Stable/Nightly updates, feedback, and upcoming integrations in Storia Studio:

<p>
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="../assets/badge-discord.svg" alt="Join Storia Studio Discord" />
  </a>
</p>

## License

Copyright © 2026 Mairon Mayorga. All rights reserved.  
See [LICENSE.md](../../LICENSE.md) for full license terms.
