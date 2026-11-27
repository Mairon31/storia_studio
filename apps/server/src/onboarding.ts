import fs from "node:fs/promises";
import path from "node:path";
import {
  isDesktopAppRuntime,
  resolveDefaultModelsRootDir,
  resolveDefaultOnboardingConfigPath,
  resolveDefaultProjectsDir,
  resolveDesktopBootstrapConfigPath,
  resolveInstallDir,
  resolveWritableDataRoot,
} from "./dataPaths.js";

export interface OnboardingPreferences {
  theme: "dark" | "light";
  language: "es" | "en" | "pt" | "fr";
  defaultAspectRatio: "9:16" | "16:9" | "1:1";
  defaultResolution: "720p" | "1080p" | "2k" | "4k";
  defaultFps: 24 | 30 | 60;
  defaultTtsProvider: string;
  whisperModel: "tiny" | "base" | "small" | "medium";
}

export interface OnboardingStoredState {
  version: 1;
  completed: boolean;
  completedAt?: string;
  skipped?: boolean;
  paths: {
    projectsDir: string;
    modelsDir: string;
    customAssetsDir: string;
  };
  preferences: OnboardingPreferences;
}

export interface OnboardingStatusPayload {
  completed: boolean;
  shouldShow: boolean;
  isDesktopApp: boolean;
  completedAt?: string;
  paths: {
    installDir: string;
    dataDir: string;
    projectsDir: string;
    modelsDir: string;
    customAssetsDir: string;
    defaults: {
      dataDir: string;
      projectsDir: string;
      modelsDir: string;
    };
  };
  preferences: OnboardingPreferences;
}

export interface OnboardingManagerOptions {
  configPath?: string;
  bootstrapConfigPath?: string;
  activeProjectsDir: string;
  activeModelsDir: string;
  activeCustomAssetsDir?: string;
  isDesktopApp?: boolean;
}

const DEFAULT_PREFERENCES: OnboardingPreferences = {
  theme: "dark",
  language: "es",
  defaultAspectRatio: "9:16",
  defaultResolution: "1080p",
  defaultFps: 30,
  defaultTtsProvider: process.platform === "win32" ? "windows_sapi" : "piper",
  whisperModel: "small",
};

function normalizeSafeDirectoryInput(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return fallback;
  if (trimmed.includes("\0")) {
    throw Object.assign(new Error("Ruta de carpeta inválida."), { statusCode: 400 });
  }
  return path.resolve(trimmed);
}

export class OnboardingManager {
  readonly configPath: string;
  readonly bootstrapConfigPath: string;
  private readonly activeProjectsDir: string;
  private readonly activeModelsDir: string;
  private readonly activeCustomAssetsDir: string;
  private readonly isDesktop: boolean;
  private cached: OnboardingStoredState | null = null;

  constructor(options: OnboardingManagerOptions) {
    this.configPath = path.resolve(options.configPath ?? resolveDefaultOnboardingConfigPath());
    this.bootstrapConfigPath = path.resolve(
      options.bootstrapConfigPath ?? resolveDesktopBootstrapConfigPath(),
    );
    this.activeProjectsDir = path.resolve(options.activeProjectsDir);
    this.activeModelsDir = path.resolve(options.activeModelsDir);
    this.activeCustomAssetsDir = options.activeCustomAssetsDir?.trim()
      ? path.resolve(options.activeCustomAssetsDir.trim())
      : "";
    this.isDesktop = options.isDesktopApp ?? isDesktopAppRuntime();
  }

  private defaultState(): OnboardingStoredState {
    return {
      version: 1,
      completed: false,
      paths: {
        projectsDir: this.activeProjectsDir,
        modelsDir: this.activeModelsDir,
        customAssetsDir: this.activeCustomAssetsDir,
      },
      preferences: { ...DEFAULT_PREFERENCES },
    };
  }

  async readState(): Promise<{ state: OnboardingStoredState; existed: boolean }> {
    if (this.cached) {
      return { state: this.cached, existed: true };
    }
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<OnboardingStoredState>;
      const base = this.defaultState();
      const merged: OnboardingStoredState = {
        version: 1,
        completed: Boolean(parsed.completed),
        completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : undefined,
        skipped: Boolean(parsed.skipped),
        paths: {
          projectsDir:
            typeof parsed.paths?.projectsDir === "string" && parsed.paths.projectsDir.trim()
              ? path.resolve(parsed.paths.projectsDir)
              : base.paths.projectsDir,
          modelsDir:
            typeof parsed.paths?.modelsDir === "string" && parsed.paths.modelsDir.trim()
              ? path.resolve(parsed.paths.modelsDir)
              : base.paths.modelsDir,
          customAssetsDir:
            typeof parsed.paths?.customAssetsDir === "string" && parsed.paths.customAssetsDir.trim()
              ? path.resolve(parsed.paths.customAssetsDir)
              : base.paths.customAssetsDir,
        },
        preferences: {
          theme: parsed.preferences?.theme === "light" ? "light" : "dark",
          language:
            parsed.preferences?.language === "en" ||
            parsed.preferences?.language === "pt" ||
            parsed.preferences?.language === "fr"
              ? parsed.preferences.language
              : "es",
          defaultAspectRatio:
            parsed.preferences?.defaultAspectRatio === "16:9" ||
            parsed.preferences?.defaultAspectRatio === "1:1"
              ? parsed.preferences.defaultAspectRatio
              : "9:16",
          defaultResolution:
            parsed.preferences?.defaultResolution === "720p" ||
            parsed.preferences?.defaultResolution === "2k" ||
            parsed.preferences?.defaultResolution === "4k"
              ? parsed.preferences.defaultResolution
              : "1080p",
          defaultFps:
            parsed.preferences?.defaultFps === 24 || parsed.preferences?.defaultFps === 60
              ? parsed.preferences.defaultFps
              : 30,
          defaultTtsProvider:
            typeof parsed.preferences?.defaultTtsProvider === "string" &&
            parsed.preferences.defaultTtsProvider.trim()
              ? parsed.preferences.defaultTtsProvider.trim()
              : base.preferences.defaultTtsProvider,
          whisperModel:
            parsed.preferences?.whisperModel === "tiny" ||
            parsed.preferences?.whisperModel === "base" ||
            parsed.preferences?.whisperModel === "medium"
              ? parsed.preferences.whisperModel
              : "small",
        },
      };
      this.cached = merged;
      return { state: merged, existed: true };
    } catch {
      return { state: this.defaultState(), existed: false };
    }
  }

  private async writeState(state: OnboardingStoredState): Promise<void> {
    this.cached = state;
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(state, null, 2) + "\n", "utf8");
  }

  private async writeDesktopBootstrap(paths: OnboardingStoredState["paths"]): Promise<void> {
    if (!this.isDesktop && !process.env.STORIA_BOOTSTRAP_CONFIG) return;
    await fs.mkdir(path.dirname(this.bootstrapConfigPath), { recursive: true });
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      projectsDir: paths.projectsDir,
      modelsDir: paths.modelsDir,
      ...(paths.customAssetsDir ? { customAssetsDir: paths.customAssetsDir } : {}),
    };
    await fs.writeFile(this.bootstrapConfigPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  }

  async getStatus(opts: { existingProjectCount: number }): Promise<OnboardingStatusPayload> {
    const { state, existed } = await this.readState();
    const defaultDataDir = resolveWritableDataRoot();
    const defaultProjectsDir = resolveDefaultProjectsDir();
    const defaultModelsDir = resolveDefaultModelsRootDir();

    // First-run detection:
    // - Once completed, NEVER show again.
    // - On Desktop app (`STORIA_DESKTOP_APP=1`), ALWAYS show on first launch until completed/skipped.
    // - On web/CLI fresh installs (no onboarding.json AND 0 existing projects), also show on first launch.
    const shouldShow = state.completed
      ? false
      : this.isDesktop
        ? true
        : !existed && opts.existingProjectCount === 0;

    return {
      completed: state.completed,
      shouldShow,
      isDesktopApp: this.isDesktop,
      completedAt: state.completedAt,
      paths: {
        installDir: resolveInstallDir(),
        dataDir: defaultDataDir,
        projectsDir: state.paths.projectsDir,
        modelsDir: state.paths.modelsDir,
        customAssetsDir: state.paths.customAssetsDir,
        defaults: {
          dataDir: defaultDataDir,
          projectsDir: defaultProjectsDir,
          modelsDir: defaultModelsDir,
        },
      },
      preferences: { ...state.preferences },
    };
  }

  async complete(input: {
    projectsDir?: string;
    modelsDir?: string;
    customAssetsDir?: string;
    preferences?: Partial<OnboardingPreferences>;
    skipped?: boolean;
  }): Promise<{ state: OnboardingStoredState; restartRequired: boolean }> {
    const { state: prev } = await this.readState();
    const nextProjectsDir = normalizeSafeDirectoryInput(input.projectsDir, prev.paths.projectsDir);
    const nextModelsDir = normalizeSafeDirectoryInput(input.modelsDir, prev.paths.modelsDir);
    const nextCustomAssetsDir = input.customAssetsDir?.trim()
      ? normalizeSafeDirectoryInput(input.customAssetsDir, "")
      : "";

    // Ensure requested directories exist & are writable
    await fs.mkdir(nextProjectsDir, { recursive: true });
    await fs.mkdir(path.join(nextModelsDir, "config"), { recursive: true });
    await fs.mkdir(path.join(nextModelsDir, "tts"), { recursive: true });
    await fs.mkdir(path.join(nextModelsDir, "cache"), { recursive: true });
    if (nextCustomAssetsDir) {
      await fs.mkdir(nextCustomAssetsDir, { recursive: true });
    }

    const nextState: OnboardingStoredState = {
      version: 1,
      completed: true,
      completedAt: new Date().toISOString(),
      skipped: Boolean(input.skipped),
      paths: {
        projectsDir: nextProjectsDir,
        modelsDir: nextModelsDir,
        customAssetsDir: nextCustomAssetsDir,
      },
      preferences: {
        ...prev.preferences,
        ...(input.preferences ?? {}),
      },
    };

    await this.writeState(nextState);
    // Also mirror onboarding.json into the new modelsDir/config if user changed modelsDir,
    // so the very next launch with the new modelsDir ALSO sees `completed: true`!
    const targetOnboardingPath = path.join(nextModelsDir, "config", "onboarding.json");
    if (path.resolve(targetOnboardingPath) !== path.resolve(this.configPath)) {
      await fs.mkdir(path.dirname(targetOnboardingPath), { recursive: true });
      await fs.writeFile(targetOnboardingPath, JSON.stringify(nextState, null, 2) + "\n", "utf8");
    }

    await this.writeDesktopBootstrap(nextState.paths);

    const restartRequired =
      path.resolve(nextProjectsDir) !== path.resolve(this.activeProjectsDir) ||
      path.resolve(nextModelsDir) !== path.resolve(this.activeModelsDir) ||
      (nextCustomAssetsDir !== "" && path.resolve(nextCustomAssetsDir) !== path.resolve(this.activeCustomAssetsDir));

    return { state: nextState, restartRequired };
  }

  async reset(): Promise<void> {
    const { state } = await this.readState();
    await this.writeState({
      ...state,
      completed: false,
      skipped: false,
      completedAt: undefined,
    });
  }
}
