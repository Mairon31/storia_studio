# MCP para IAs y acceso remoto

Storia Studio incluye integración nativa con el **Model Context Protocol (MCP)** para que agentes y clientes de IA (Claude, ChatGPT, Gemini, Codex, Cursor, OpenCode, etc.) puedan inspeccionar fotogramas reales, editar escenas, sincronizar subtítulos, importar recursos y lanzar exportaciones en vivo mientras ves los cambios al instante en el editor.

## 1. Modo local (`stdio`)

1. Compila el proyecto (`pnpm build`).
2. Usa la plantilla `scripts/mcp-config.example.json` del repositorio en la configuración de tu cliente MCP reemplazando la ruta hacia `apps/mcp/dist/index.js`:

```json
{
  "mcpServers": {
    "storia-studio": {
      "command": "node",
      "args": ["/ruta/a/storia_studio/apps/mcp/dist/index.js"],
      "env": {
        "STORIA_SERVER_HOST": "127.0.0.1",
        "STORIA_SERVER_PORT": "4310"
      }
    }
  }
}
```

## 2. Modo remoto (`Streamable HTTP` en `/mcp` y OAuth 2.1)

Desde la interfaz de Storia Studio ve a **Ajustes › Remoto (Túnel)** o **Ajustes › MCP para IAs**:

- **Túneles HTTPS integrados:** soporta **ngrok** y **Cloudflare Tunnel** (con instalación guiada de binarios desde la interfaz).
- **Autenticación Zero-Trust:**
  - **OAuth 2.1 + PKCE (`S256`)** con registro dinámico de clientes (DCR), pantalla de consentimiento local, rotación de *refresh tokens* y revocación inmediata.
  - **Bearer Token** rotatorio para integraciones directas.
  - **Enlace móvil de 1 clic:** emite una cookie de sesión firmada `HttpOnly; SameSite=Lax; Secure` para abrir y controlar el estudio desde tu teléfono o tablet; al rotar el enlace se revocan al instante todas las sesiones activas.

## 3. Protecciones de seguridad integradas

- **Bóveda cifrada (`AES-256-GCM`):** las claves de API (TTS) y tokens de túnel se cifran en disco con una clave maestra local de 256 bits almacenada fuera del proyecto (`~/.storia-studio/.vault.key`). Nunca se exponen en texto plano vía REST.
- **Aislamiento estricto de administración local:** las rutas de credenciales, túneles, OAuth, librerías, onboarding y actualizaciones solo aceptan peticiones directas desde `127.0.0.1` sin cabeceras de proxy ni de cliente MCP (`403 Forbidden` en cualquier otro caso).
- **Restricción de disco en MCP HTTP:** sobre `/mcp` remoto se deshabilitan todas las herramientas de lectura/escritura arbitraria del sistema de archivos del host (`import_local_asset`, `replace_project_asset(local_file)`, `capture_frame(saveToPath)`).
- **Anti-SSRF y Anti-XSS:** las descargas externas validan HTTPS + resolución DNS (bloqueando rangos privados/loopback/metadatos cloud en cada salto de redirección) y los SVG subidos se sanitizan y sirven con `Content-Security-Policy` de sandbox.

Consulta todos los detalles técnicos en la [Política de seguridad](./security.md).

---

[← Arquitectura](./architecture.md) · [Siguiente: Releases y actualizaciones →](./releases-and-updates.md)
