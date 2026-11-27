<div align="center">

<img src="apps/desktop/src-tauri/icons/icon.png" alt="Storia Studio" width="112" height="112" />

# Storia Studio

**Estudio de edición y animación de video 2D & Retro *local-first*, con motor WebGL2 a 60 FPS, 23 estilos de animación integrales y dirección en vivo por IA mediante MCP.**

<p>
  <strong>Español</strong> ·
  <a href="docs/i18n/README.en.md">English</a> ·
  <a href="docs/i18n/README.zh-CN.md">简体中文</a> ·
  <a href="docs/i18n/README.ru.md">Русский</a> ·
  <a href="docs/i18n/README.hi.md">हिन्दी</a> ·
  <a href="docs/i18n/README.pt.md">Português</a>
</p>

<p>
  <img src="docs/assets/badge-version.svg" alt="v0.2.0" />
  <img src="docs/assets/badge-platforms.svg" alt="Windows · macOS · Linux" />
  <img src="docs/assets/badge-engine.svg" alt="WebGL2 · Rust Tauri v2" />
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="docs/assets/badge-discord.svg" alt="Comunidad de Discord" />
  </a>
</p>

<p>
  <a href="#descarga-e-inicio-rápido">Descargar</a> ·
  <a href="docs/README.md">Documentación</a> ·
  <a href="docs/releases-and-updates.md">Canales Estable y Nightly</a> ·
  <a href="SECURITY.md">Seguridad</a> ·
  <a href="https://discord.gg/ahJM3hyFWr">Discord</a>
</p>

</div>

---

## ¿Qué es Storia Studio?

**Storia Studio** es un editor de video no lineal (NLE) diseñado para creadores de contenido narrativo, educativo, filosófico, Shorts/Reels y animación 2D o retro. Se ejecuta **100% en tu equipo** (Windows, macOS y Linux), protege tus proyectos y credenciales de forma local y permite colaborar en tiempo real con agentes de IA mediante el estándar **Model Context Protocol (MCP)**.

## Lo más destacado

| Capacidad | Qué incluye |
|---|---|
| **Motor WebGL2 a 60 FPS** | Vista previa determinista en `9:16`, `16:9`, `1:1` y hasta **4K**, línea de tiempo multipista con imán, ondas Web Audio, editor de código SVG en vivo y deshacer/rehacer atómico. |
| **23 estilos de animación integrales** | Cambia el estilo del proyecto y transforma personajes, escenarios, sprites, formas, tipografía, subtítulos y shaders GPU: **3D Clay & Toon**, **Kurzgesagt Vector**, **Anime Cel**, **Retro PSX 1998**, **Paper Cutout**, **Pixel 16-bit**, **Rubber Hose 1930s**, **Noir**, **Mitología** y Stickman A1–B8. |
| **Personajes 2D articulados** | Cinemática inversa (IK), 24 vestuarios por rol, +26 peinados, poses, expresiones y soporte para sprites modulares. |
| **Subtítulos, Whisper y Voz TTS** | 36 presets estilo CapCut/Reels con karaoke palabra por palabra, transcripción offline con **Whisper** y voces TTS offline (**SAPI**, **Piper ONNX**, **Kokoro-82M**) o en la nube (**ElevenLabs**, **OpenAI**). |
| **Exportación 1:1 con FFmpeg** | Renderizado paralelo por GPU (`NVENC`) o CPU (`libx264`), *motion blur* sub-fotograma y masterización de audio en 2 pasadas a **`-16 LUFS`**. |
| **Librerías libres integradas** | Millones de vectores SVG, íconos, música y SFX gratuitos sin API Key (**Openverse**, **Iconify**, **Wikimedia Commons**, **Internet Archive**, **OpenMoji**) con créditos automáticos en `credits.txt`. |
| **IA en vivo (MCP) y Zero-Trust** | Control bidireccional (`stdio` y `/mcp` con **OAuth 2.1 + PKCE**), acceso móvil seguro por túnel (`ngrok` / `Cloudflare`), bóveda cifrada `AES-256-GCM` y app nativa en **Rust (Tauri v2)**. |

## Descarga e inicio rápido

### Aplicación de escritorio (Windows · macOS · Linux)

Descarga el instalador para tu sistema operativo desde la pestaña **Releases** de este repositorio:

- **Estable (`v*`):** recomendado para producción diaria (`.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb`, `.rpm`).
- **Nightly (`nightly`):** compilación automática en cada commit de `master`. Puedes cambiar entre **Estable** y **Nightly** desde **Ajustes › Actualizaciones** para descargar, verificar con SHA-256 y reiniciar la app en 1 clic.

En el primer inicio, Storia Studio abre un **asistente inicial (Onboarding)** para configurar carpetas, librerías gratuitas, voces y red en menos de un minuto.

### Desde código fuente

```bash
pnpm install
pnpm build
pnpm dev
```

## Documentación

Toda la documentación técnica y guías detalladas viven en [`docs/`](docs/README.md):

- **[Primeros pasos e instalación](docs/getting-started.md)** — Requisitos, Onboarding inicial, comandos de desarrollo y variables de entorno.
- **[Arquitectura y motor creativo](docs/architecture.md)** — Paquetes del monorepo, 23 estilos, rigs, subtítulos y exportación FFmpeg.
- **[MCP para IAs y acceso remoto](docs/mcp-and-remote.md)** — Configuración `stdio` y HTTP `/mcp`, OAuth 2.1, túneles y modelo Zero-Trust.
- **[Releases, canales y actualizaciones](docs/releases-and-updates.md)** — Auto-actualizador Estable/Nightly y compilación Desktop en Rust.
- **[Política de seguridad](SECURITY.md)** — Arquitectura de seguridad y reporte responsable.

## Comunidad

Únete a la comunidad oficial de **Discord** para conocer novedades, nuevas compilaciones Estable y Nightly, soporte y futuras integraciones dentro de Storia Studio:

<p>
  <a href="https://discord.gg/ahJM3hyFWr">
    <img src="docs/assets/badge-discord.svg" alt="Entrar al Discord de Storia Studio" />
  </a>
</p>

## Licencia

Copyright © 2026 Mairon Mayorga. Todos los derechos reservados.  
Consulta [LICENSE.md](LICENSE.md) para los términos completos de licencia.
