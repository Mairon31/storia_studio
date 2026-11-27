# Arquitectura y motor creativo

## 1. Estructura del monorepo

| Paquete | Ruta | Responsabilidad |
|---|---|---|
| **`@storia/schema`** | `packages/schema` | Fuente única de verdad (`Zod` + TypeScript) para `project.json`, coordenadas normalizadas, keyframes, curvas de aceleración, 23 estilos de animación, 36 presets de subtítulos, operaciones atómicas de parcheo y recibos de edición. |
| **`@storia/renderer`** | `packages/renderer` | Motor determinista **PixiJS v8 / WebGL2**, shaders GLSL de post-procesado, `styleEngine`, rigs articulados y estilizados, escenarios procedimentales, VFX y subtítulos palabra por palabra. |
| **`@storia/studio`** | `apps/studio` | Editor web NLE en **React 19 + Vite** con interfaz adaptable a escritorio, tablet y móvil, viewport interactivo a 60 FPS, línea de tiempo multipista con ondas Web Audio, editor de código SVG en vivo y vista `/render` para exportación headless. |
| **`@storia/server`** | `apps/server` | Servidor local **Fastify** (REST + WebSockets), persistencia atómica con historial rodante `.history/`, indexador/proxy con caché de librerías, proveedor OAuth 2.1, bóveda cifrada, actualizador Estable/Nightly y exportador Playwright → FFmpeg. |
| **`@storia/mcp`** | `apps/mcp` | Servidor **Model Context Protocol** (`stdio` y Streamable HTTP `/mcp`) con más de 68 herramientas para dirección en vivo, auditoría visual, `capture_frame` y exportación. |
| **`@storia/desktop`** | `apps/desktop` | Aplicación nativa en **Rust (Tauri v2)** con bandeja del sistema, supervisión de procesos (Win32 Job Object), diálogos nativos, instaladores multiplataforma y launcher CLI `storia-launcher`. |

## 2. Motor Multi-Estilo (23 estilos de animación integrales)

Al cambiar el estilo del proyecto, `styleEngine` transforma todo el cuadro en tiempo real: personajes, fondos procedimentales, sprites, formas vectoriales, tipografía, subtítulos y shaders WebGL2.

### Familia `Studio Pro` (5 estilos)
- **`c1_stylized_3d` (3D Clay & Toon Studio):** sombreado volumétrico tipo plastilina/clay, brillos especulares, formas biseladas y textos extruidos.
- **`c2_kurzgesagt` (Kurzgesagt Science Vector):** geometría plana sin contornos negros, cortes luz/sombra 50/50 y escenario espacial con planetas anillados.
- **`c3_anime_cel` (Anime Cel-Shaded):** cel-shading en dos tonos, ojos con doble destello, halo en el cabello y cielos con haces de luz.
- **`c4_retro_psx` (Retro PSX 1998 3D):** personajes low-poly facetados, muestreo `nearest` forzado y shader CRT/PSX a 240p (dithering Bayer 4×4, sangrado NTSC y scanlines) sobre todo el cuadro incluidos subtítulos.
- **`c5_paper_cutout` (Paper Cutout Craft):** borde blanco de recorte tipo sticker en personajes, sprites, formas y textos, sombras físicas en capas y textura de fibras de papel (`uPaperStrength`).

### Familias `Storia`, `Code Engine B1–B8` y `Model Engine A1–A8` (18 estilos)
Incluyen **Storia Editorial**, **Pixel Theater 16-bit** (`b7_pixel_theater`), **Rubber Hose 1930s** (`a7`), **Amber Noir**, **Ghibli Sky**, **Greek Mythology** (`b8`), **Hand-Drawn**, **Retro TV**, **Thriller**, **Modern Pop** y las gramáticas Stickman A1–A8 / B1–B8.

## 3. Rigs 2D, subtítulos, audio y exportación 1:1

- **Personajes articulados:** cinemática inversa (IK) en piernas y brazos, 24 vestuarios por rol, más de 26 peinados, poses y expresiones con transiciones suaves, además de soporte para sprites modulares personalizados.
- **Subtítulos y movimiento:** 36 presets estilo CapCut/Reels, resaltado karaoke palabra por palabra, importación SRT/VTT, paginación rítmica, transcripción offline con Whisper, 40 transiciones de escena con SFX sintetizados y 49 efectos temporales.
- **Librerías integradas gratuitas (sin API Key):** `Openverse` (SFX, música y SVG CC0/CC-BY), `Iconify` (200k+ íconos), `Wikimedia Commons`, `Internet Archive Audio`, `Game & Pixel Art Sprites`, `OpenMoji` y `Storia SVG Backgrounds`, con registro automático de atribución en `credits.txt`.
- **Exportación 1:1 Playwright → FFmpeg:** renderizado paralelo con múltiples workers, desenfoque de movimiento (*sub-frame motion blur*), codificación por GPU (`h264_nvenc`, `hevc_nvenc`, `av1_nvenc`) con respaldo automático a CPU (`libx264`) y masterización de sonoridad en 2 pasadas a **`-16 LUFS` (EBU R128)**.

---

[← Primeros pasos](./getting-started.md) · [Siguiente: MCP y acceso remoto →](./mcp-and-remote.md)
