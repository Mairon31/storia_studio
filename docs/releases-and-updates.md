# Releases, canales y actualizaciones automáticas

Storia Studio distribuye dos paquetes oficiales multiplataforma (Windows, macOS y Linux) compilados de forma transparente mediante GitHub Actions:

| Canal | Cuándo se publica | Manifiesto | Ideal para |
|---|---|---|---|
| **Estable** | Al publicar una etiqueta `v*` (ej. `v0.2.0`) | `latest-stable.json` | Producción diaria y máxima estabilidad. |
| **Nightly** | Automáticamente en cada `push` de código a `master` | `latest-nightly.json` | Probar las últimas mejoras y funciones apenas se suben al repositorio. |

## 1. Elegir canal y actualizar desde la aplicación

1. Abre **Ajustes › Actualizaciones** dentro de Storia Studio.
2. Elige el canal **Estable (Recomendado)** o **Nightly (Cada commit en master)**.
3. Mantén activa la opción **Comprobar automáticamente al iniciar Storia Studio**.

### Cómo funciona la actualización automática

- En el canal **Nightly**, la aplicación compara el **hash del commit (`commitSha`)** instalado contra el último build publicado en `latest-nightly.json`. En cuanto existe un nuevo commit en `master`, aparece un aviso en la app y en Ajustes.
- En el canal **Estable**, compara la versión SemVer contra `latest-stable.json`.
- Al pulsar **Actualizar y reiniciar** en la versión Desktop:
  1. Descarga el instalador exacto para tu plataforma (`windows-x64`, `macos-arm64`, `macos-x64` o `linux-x64`) mostrando barra de progreso en vivo.
  2. Verifica su integridad criptográfica **SHA-256** antes de ejecutar nada (cancela automáticamente si el hash no coincide).
  3. Detiene limpiamente el servidor local mediante APIs nativas del sistema operativo (Win32 Job Object en Windows).
  4. Ejecuta la actualización (`NSIS /P /UPDATE /R` en Windows o reemplazo atómico de `.AppImage` en Linux) y **reinicia Storia Studio automáticamente** ya en la versión actualizada.

## 2. Evitar builds Nightly innecesarios

El workflow `.github/workflows/release-nightly.yml` está protegido para evitar compilaciones redundantes o duplicación de releases:

- **Rutas ignoradas automáticamente:** los commits que solo modifican archivos `*.md`, `docs/**`, `LICENSE*`, `.gitignore`, `.gitattributes`, `.editorconfig` o `.github/workflows/ci.yml` **no** disparan un build Nightly.
- **Etiqueta en mensaje de commit:** si haces un commit que toca código fuente pero **no** deseas publicar una nueva compilación Nightly, incluye `[skip nightly]` o `[skip release]` en el mensaje del commit.
- **Sin duplicación de releases:** el canal Nightly siempre actualiza el único pre-release flotante `nightly` (`make_latest: false`), limpia assets obsoletos y sobreescribe los instaladores nuevos sin afectar al release Estable marcado como *Latest*.

## 3. Compilar los instaladores nativos localmente

Requiere **Rust estable (`rustup`)** además de Node.js 22 y pnpm 11:

```bash
# Regenerar los íconos nativos (.png, .ico, .icns) desde apps/desktop/src-tauri/icons/icon.svg
pnpm desktop:icons

# Empaquetar el runtime autocontenido de producción en apps/desktop/src-tauri/resources/runtime/
pnpm desktop:bundle

# Ejecutar la app nativa de escritorio en modo desarrollo
pnpm desktop:dev

# Compilar instaladores nativos (.exe/.msi, .dmg, .AppImage/.deb/.rpm) + storia-launcher
pnpm desktop:build

# Compilar únicamente el launcher CLI nativo en Rust
pnpm desktop:launcher
```

---

[← MCP y acceso remoto](./mcp-and-remote.md) · [Siguiente: Política de seguridad →](./security.md)
