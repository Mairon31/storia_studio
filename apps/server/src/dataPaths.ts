import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_RUNTIME_ROOT = path.resolve(__dirname, "../../..");

/**
 * Resolves the writable root directory for Storia Studio user data (`projects/`, `models/`).
 * - In installed Desktop Apps (Windows/macOS/Linux), the Rust Tauri launcher sets `STORIA_DATA_DIR`
 *   to the OS-native writable AppData directory so the app bundle itself can remain read-only.
 * - In local monorepo development, falls back cleanly to the repository root.
 */
export function resolveWritableDataRoot(): string {
  const override = process.env.STORIA_DATA_DIR?.trim();
  return override ? path.resolve(override) : REPO_RUNTIME_ROOT;
}

export function resolveInstallDir(): string {
  const override = process.env.STORIA_INSTALL_DIR?.trim();
  return override ? path.resolve(override) : REPO_RUNTIME_ROOT;
}

export function isDesktopAppRuntime(): boolean {
  return process.env.STORIA_DESKTOP_APP === "1" || process.env.STORIA_DESKTOP_APP === "true";
}

export function resolveDesktopBootstrapConfigPath(): string {
  const override = process.env.STORIA_BOOTSTRAP_CONFIG?.trim();
  if (override) return path.resolve(override);
  return path.join(os.homedir(), ".storia-studio", "desktop-bootstrap.json");
}

export function resolveDefaultProjectsDir(): string {
  const override = process.env.STORIA_PROJECTS_DIR?.trim();
  return override ? path.resolve(override) : path.join(resolveWritableDataRoot(), "projects");
}

export function resolveDefaultModelsRootDir(): string {
  const override = process.env.STORIA_MODELS_DIR?.trim();
  return override ? path.resolve(override) : path.join(resolveWritableDataRoot(), "models");
}

export function resolveDefaultStudioDistDir(): string {
  const override = process.env.STORIA_STUDIO_DIST?.trim();
  return override ? path.resolve(override) : path.resolve(__dirname, "../../studio/dist");
}

export function resolveDefaultConnectivityConfigPath(): string {
  const override = process.env.STORIA_CONNECTIVITY_CONFIG?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "config", "connectivity.json");
}

export function resolveDefaultOnboardingConfigPath(): string {
  const override = process.env.STORIA_ONBOARDING_CONFIG?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "config", "onboarding.json");
}

export function resolveDefaultOAuthStorePath(): string {
  const override = process.env.STORIA_OAUTH_STORE?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "config", "mcp-oauth.json");
}

export function resolveDefaultLibrariesConfigPath(): string {
  const override = process.env.STORIA_LIBRARIES_CONFIG?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "config", "libraries.json");
}

export function resolveDefaultLibraryCacheDir(): string {
  const override = process.env.STORIA_CACHE_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "cache", "libraries");
}

export function resolveDefaultLocalBinDir(): string {
  const override = process.env.STORIA_BIN_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "bin");
}

export function resolveDefaultTtsModelsDir(): string {
  const override = process.env.STORIA_TTS_MODELS_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "tts");
}

export function resolveDefaultUpdatesConfigPath(): string {
  const override = process.env.STORIA_UPDATES_CONFIG?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "config", "updates.json");
}

export function resolveDefaultUpdatesDir(): string {
  const override = process.env.STORIA_UPDATES_DIR?.trim();
  return override
    ? path.resolve(override)
    : path.join(resolveDefaultModelsRootDir(), "updates");
}
