# Documentación de Storia Studio

Bienvenido a la documentación técnica y de usuario de **Storia Studio**, el editor de video 2D y retro *local-first* con vista previa determinista WebGL2, 23 estilos de animación, exportación 1:1 con FFmpeg y control en vivo por IA mediante **Model Context Protocol (MCP)**.

## Guías disponibles

| Guía | Contenido |
|---|---|
| **[Primeros pasos e instalación](./getting-started.md)** | Instalación Desktop (Windows, macOS y Linux), Asistente de Primer Inicio (*Onboarding*), ejecución desde código fuente, requisitos previos y variables de entorno. |
| **[Arquitectura y motor creativo](./architecture.md)** | Estructura del monorepo, motor WebGL2 PixiJS v8, los 23 estilos de animación, rigs articulados, subtítulos, librerías gratuitas y exportación 1:1 con FFmpeg. |
| **[MCP para IAs y acceso remoto](./mcp-and-remote.md)** | Conexión con agentes de IA (`stdio` y Streamable HTTP `/mcp`), OAuth 2.1 + PKCE (`S256`), túneles `ngrok` y `Cloudflare`, enlace móvil seguro y modelo Zero-Trust. |
| **[Releases, canales y actualizaciones](./releases-and-updates.md)** | Paquetes **Estable** vs **Nightly**, actualizador integrado con verificación SHA-256 y reinicio automático, compilación de instaladores nativos en Rust (Tauri v2). |
| **[Política de seguridad](../SECURITY.md)** | Bóveda cifrada `AES-256-GCM`, aislamiento de administración local, protección anti-SSRF, sanitización SVG y reporte responsable de vulnerabilidades. |

## Comunidad y soporte

¿Tienes dudas, sugerencias o quieres enterarte de nuevas versiones e integraciones futuras?

- **Discord oficial:** [discord.gg/ahJM3hyFWr](https://discord.gg/ahJM3hyFWr)
- **Volver a la presentación:** [README principal](../README.md)
