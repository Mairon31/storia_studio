# Primeros pasos e instalación

## 1. Instalación Desktop (Recomendada)

Descarga el instalador nativo para tu sistema operativo desde la pestaña **Releases** de este repositorio en GitHub (canal **Estable** o **Nightly**):

| Sistema operativo | Paquetes disponibles |
|---|---|
| **Windows (`x64`)** | Instalador NSIS (`*-setup.exe`), instalador MSI (`*.msi`) y launcher CLI (`storia-launcher-windows-x64.exe`). |
| **macOS (`arm64` Apple Silicon / `x64` Intel)** | Imagen de disco (`*.dmg`), paquete `.app.tar.gz` y launcher CLI (`storia-launcher-macos-*`). |
| **Linux (`x64`)** | `*.AppImage`, paquete Debian/Ubuntu (`*.deb`), paquete Fedora/RHEL (`*.rpm`) y launcher CLI (`storia-launcher-linux-x64`). |

### Requisitos en tu equipo

- **Node.js `>= 22.0.0`** — Necesario para ejecutar el motor de servidor local incluido en la aplicación.
- **FFmpeg en el `PATH`** — Necesario para exportar MP4, aplicar DSP de audio (`denoise` / `-16 LUFS`) y detectar duraciones exactas.
- **Playwright Chromium** — Usado para la exportación 1:1 de fotogramas y `capture_frame`.
- **Python `3.10+`** *(opcional)* — Solo necesario si deseas transcripción local con `faster-whisper` o síntesis de voz offline con `piper` / `kokoro-onnx`.

## 2. Asistente de Primer Inicio (Onboarding)

La **primera vez** que inicias la aplicación Desktop (y únicamente esa primera vez), Storia Studio abre un asistente guiado de 6 pasos:

1. **Bienvenida y diagnóstico:** verifica CPU, RAM, FFmpeg, aceleración GPU NVENC y Python; permite elegir tema (oscuro/claro), idioma y formato/resolución/FPS por defecto.
2. **Carpetas de datos:** conserva las rutas nativas recomendadas por el sistema operativo o elige carpetas personalizadas para **Proyectos**, **Modelos IA / Caché** y una **Carpeta personal de Assets** opcional.
3. **Librerías gratuitas:** activa las fuentes públicas sin API Key que quieras disponibles (`Openverse`, `Iconify`, `Wikimedia Commons`, `Internet Archive`, `Game & Pixel Art Sprites`, `OpenMoji` y `Storia SVG Backgrounds`).
4. **Voz TTS y Whisper:** selecciona tu proveedor de voz predeterminado, tamaño del modelo Whisper y descarga opcional en 1 clic de voces neuronales offline (`Piper` / `Kokoro`).
5. **Red local, túneles y MCP:** elige modo privado (`localhost`) o red Wi-Fi local (`LAN`), instala opcionalmente `ngrok` o `cloudflared` y configura la autenticación Zero-Trust de `/mcp`.
6. **Resumen:** crea opcionalmente un proyecto de muestra inicial y guarda tu configuración en `onboarding.json` y `~/.storia-studio/desktop-bootstrap.json`.

> Puedes volver a abrir el asistente en cualquier momento desde **Ajustes › Sistema › Abrir asistente**.

## 3. Instalación desde código fuente (Desarrollo)

```bash
# 1. Clonar el repositorio y entrar en la carpeta
git clone <url-del-repositorio>
cd storia_studio

# 2. Instalar dependencias (requiere Node >= 22 y pnpm 11)
pnpm install

# 3. Compilar todos los paquetes del workspace
pnpm build

# 4. Verificar entorno (Node, FFmpeg, codificadores GPU NVENC, Chromium)
pnpm doctor

# 5. (Opcional) Crear proyecto de demostración
pnpm seed:demo

# 6. Iniciar el editor (localhost:5173) y servidor local (localhost:4310)
pnpm dev
```

### Comandos útiles del monorepo

```bash
# Verificación de tipos y pruebas unitarias (81 tests)
pnpm typecheck
pnpm test

# Exportar un proyecto directamente desde la terminal
pnpm export --project demo_episodum_paradox --resolution 1080p --fps 30 --encoder auto

# Iniciar el servidor MCP por stdio
pnpm start:mcp
```

## 4. Variables de entorno (Opcionales)

Todos los valores por defecto funcionan sin configuración adicional. Si deseas sobrescribir rutas o puertos en desarrollo, usa variables de entorno o un archivo `.env` local (nunca lo subas a Git):

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `STORIA_SERVER_HOST` | `127.0.0.1` | Interfaz de escucha (`0.0.0.0` para LAN). |
| `STORIA_SERVER_PORT` | `4310` | Puerto HTTP/WebSocket del servidor local. |
| `STORIA_DATA_DIR` | Raíz del repo / AppData en Desktop | Directorio escribible raíz para `projects/` y `models/`. |
| `STORIA_PROJECTS_DIR` | `<dataDir>/projects` | Carpeta de proyectos y exportaciones MP4. |
| `STORIA_MODELS_DIR` | `<dataDir>/models` | Carpeta para modelos TTS, caché de librerías, binarios de túnel y configuración. |
| `STORIA_VAULT_KEY_PATH` | `~/.storia-studio/.vault.key` | Ruta de la clave maestra `AES-256-GCM` fuera del workspace. |
| `STORIA_MCP_TOKEN` | *(generado automáticamente)* | Token Bearer estático opcional para `/mcp`. |

---

[← Volver al inicio](./index.md) · [Siguiente: Arquitectura y motor creativo →](./architecture.md)
