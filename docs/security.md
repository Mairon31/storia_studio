# Política de seguridad

## Arquitectura y protecciones integradas

Storia Studio está diseñado como una aplicación **local-first** con endurecimiento **Zero-Trust** para red local (LAN), túneles remotos (`ngrok` / `Cloudflare`) e integraciones con el **Model Context Protocol (MCP)**:

- **Bóveda cifrada (`AES-256-GCM`):** Las claves de API de voz (TTS), tokens de túnel y códigos de acceso remoto se cifran en disco mediante una clave maestra local de 256 bits almacenada fuera del proyecto (`~/.storia-studio/.vault.key`, permisos `0600`). Ningún secreto se devuelve en texto plano por REST y se limpian automáticamente en mensajes de error.
- **Aislamiento estricto de administración local:** La gestión de credenciales, controles de túnel, revocación OAuth, configuración de librerías, onboarding y actualizaciones exigen una petición directa desde el equipo local (`127.0.0.1` / `localhost`) sin cabeceras de proxy ni de cliente MCP (`403 Forbidden` en cualquier otro caso).
- **Puerta Zero-Trust para túneles remotos:** Las peticiones que llegan a través de túneles públicos o proxies inversos requieren un token válido **OAuth 2.1 + PKCE (`S256`)**, un Bearer Token MCP o una cookie firmada **`HttpOnly; SameSite=Lax; Secure`** emitida desde `/auth/remote?code=...`. Rotar el enlace móvil revoca de inmediato todas las sesiones activas.
- **Restricción de disco en MCP HTTP:** Cuando se expone `/mcp` sobre Streamable HTTP, las herramientas de lectura/escritura arbitraria del sistema de archivos del host (`import_local_asset`, `replace_project_asset(local_file)`, `capture_frame(saveToPath)`) quedan deshabilitadas. Incluso en modo `stdio` local se bloquean rutas sensibles del sistema y credenciales (`.vault.key`, `.ssh`, `.aws`, `.gnupg`, `.env`, etc.).
- **Protección Anti-SSRF:** Las previsualizaciones e importaciones de librerías remotas obligan a usar HTTPS, validan las direcciones IP resueltas por DNS frente a rangos locales, privados y de metadatos cloud, y revalidan cada redirección.
- **Protección Anti-XSS y subidas seguras:** Los SVG subidos se sanitizan (`<script>`, `<foreignObject>`, `on*`, `javascript:`), se sirven con `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` y se rechazan archivos ejecutables o HTML. Todas las respuestas incluyen `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`.
- **Limitación de tasa (Sliding-Window Rate Limiting):** Activa en el registro/autorización/intercambio OAuth, desbloqueo remoto y peticiones no autorizadas a `/mcp` o `/api/*`.
- **Verificación de actualizaciones (SHA-256):** El actualizador integrado comprueba el hash criptográfico **SHA-256** de cada instalador descargado antes de ejecutarlo y cancela la operación si existe cualquier discrepancia.

## Reportar una vulnerabilidad

Si detectas una vulnerabilidad de seguridad, **no** abras un issue público con detalles de explotación. Comunícalo en privado al mantenedor del repositorio a través de GitHub Security Advisories o mensaje directo incluyendo:

1. Endpoint, herramienta MCP o archivo afectado.
2. Pasos mínimos de reproducción o prueba de concepto.
3. Impacto estimado y mitigación sugerida (si la conoces).
