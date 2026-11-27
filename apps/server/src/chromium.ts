import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Browser } from "playwright-core";

/**
 * Discovers an installed Chromium/Chrome binary without triggering a heavy download.
 * Supports Linux/WSL2 (`~/.cache/ms-playwright`), Windows (`%LOCALAPPDATA%\ms-playwright`),
 * and system Chrome/Edge installations.
 */
export function findChromiumExecutable(): string | undefined {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.STORIA_CHROMIUM_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const cacheRoots: string[] = [];
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    cacheRoots.push(path.join(localAppData, "ms-playwright"));
  } else {
    cacheRoots.push(path.join(os.homedir(), ".cache", "ms-playwright"));
  }

  for (const pwCache of cacheRoots) {
    if (!fs.existsSync(pwCache)) continue;
    const dirs = fs.readdirSync(pwCache).sort().reverse();
    // Prefer full chromium over headless shell because full chromium has stronger WebGL2 support
    for (const dir of dirs) {
      if (!dir.startsWith("chromium-")) continue;
      const candidates = [
        path.join(pwCache, dir, "chrome-linux64", "chrome"),
        path.join(pwCache, dir, "chrome-linux", "chrome"),
        path.join(pwCache, dir, "chrome-win64", "chrome.exe"),
        path.join(pwCache, dir, "chrome-win", "chrome.exe"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
    for (const dir of dirs) {
      if (!dir.startsWith("chromium_headless_shell-")) continue;
      const candidates = [
        path.join(pwCache, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(pwCache, dir, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
        path.join(pwCache, dir, "chrome-linux", "headless_shell"),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  const systemCandidates =
    process.platform === "win32"
      ? [
          "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
          "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        ]
      : [
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
        ];

  for (const c of systemCandidates) {
    if (fs.existsSync(c)) return c;
  }

  return undefined;
}

let sharedBrowser: Browser | null = null;
let launchingPromise: Promise<Browser> | null = null;

function buildLaunchEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v;
  }
  if (process.platform === "linux") {
    const localLibs = path.join(os.homedir(), ".local", "storia-chromium-libs", "usr", "lib", "x86_64-linux-gnu");
    if (fs.existsSync(localLibs)) {
      env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH ? `${localLibs}:${env.LD_LIBRARY_PATH}` : localLibs;
    }
  }
  return env;
}

export async function getHeadlessBrowser(): Promise<Browser> {
  if (sharedBrowser && sharedBrowser.isConnected()) {
    return sharedBrowser;
  }
  if (launchingPromise) return launchingPromise;

  launchingPromise = (async () => {
    const executablePath = findChromiumExecutable();
    const browser = await chromium.launch({
      headless: true,
      executablePath,
      env: buildLaunchEnv(),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--enable-unsafe-swiftshader",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--disable-gpu-sandbox",
        "--autoplay-policy=no-user-gesture-required",
      ],
    });
    browser.on("disconnected", () => {
      if (sharedBrowser === browser) sharedBrowser = null;
    });
    sharedBrowser = browser;
    return browser;
  })();

  try {
    return await launchingPromise;
  } finally {
    launchingPromise = null;
  }
}

export async function closeHeadlessBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
}
