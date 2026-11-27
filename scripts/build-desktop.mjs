#!/usr/bin/env node
/**
 * Cross-platform orchestrator for building Storia Studio's native Rust Desktop App (Tauri v2),
 * OS Installers (Windows NSIS/MSI, macOS DMG/App, Linux AppImage/DEB/RPM), and Standalone Rust Launcher.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const TAURI_DIR = path.join(ROOT_DIR, "apps", "desktop", "src-tauri");

// Auto-discover ~/.cargo/bin (Windows %USERPROFILE%\.cargo\bin or CARGO_HOME\bin)
// so `pnpm desktop:build` works immediately after installing Rustup without restarting the terminal.
const cargoBinCandidates = [
  process.env.CARGO_HOME ? path.join(process.env.CARGO_HOME, "bin") : "",
  path.join(os.homedir(), ".cargo", "bin"),
  process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".cargo", "bin") : "",
].filter(Boolean);

const extraPathEntries = [];
for (const dir of cargoBinCandidates) {
  if (fs.existsSync(dir) && !extraPathEntries.includes(dir)) {
    extraPathEntries.push(dir);
  }
}

const childEnv = { ...process.env };
if (extraPathEntries.length > 0) {
  const pathKey =
    Object.keys(childEnv).find((k) => k.toLowerCase() === "path") ?? "PATH";
  const currentPath = childEnv[pathKey] ?? "";
  const missing = extraPathEntries.filter(
    (d) => !currentPath.toLowerCase().includes(d.toLowerCase()),
  );
  if (missing.length > 0) {
    childEnv[pathKey] = [...missing, currentPath].filter(Boolean).join(path.delimiter);
  }
}

const args = new Set(process.argv.slice(2));
const isDev = args.has("--dev");
const launcherOnly = args.has("--launcher-only");
const skipBundle = args.has("--skip-bundle");

function hasCommand(cmd, probeArgs = ["--version"]) {
  const res = spawnSync(cmd, probeArgs, { stdio: "ignore", env: childEnv });
  return res.status === 0;
}

function run(cmd, cmdArgs, cwd = ROOT_DIR) {
  execFileSync(cmd, cmdArgs, { cwd, stdio: "inherit", env: childEnv });
}

function printRustInstallHelp() {
  console.error("\n[desktop:build] Rust (cargo / rustc) no está instalado en este equipo.");
  console.error("Instálalo según tu sistema operativo y vuelve a ejecutar el comando:\n");
  if (process.platform === "win32") {
    console.error("  Windows (PowerShell): winget install Rustlang.Rustup");
    console.error("  (Requiere Desktop development with C++ / Visual Studio Build Tools)");
  } else if (process.platform === "darwin") {
    console.error("  macOS: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
    console.error("         xcode-select --install");
  } else {
    console.error("  Linux: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh");
    console.error("         sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libssl-dev libayatana-appindicator3-dev librsvg2-dev");
  }
  console.error("\nTambién puedes compilar los instaladores para Windows/macOS/Linux automáticamente con GitHub Actions (.github/workflows/release-desktop.yml).\n");
}

function assertAppNotRunningOnWindows() {
  if (process.platform !== "win32" || isDev) return;
  const targets = launcherOnly ? ["storia-launcher"] : ["storia-studio", "storia-launcher"];
  for (const name of targets) {
    const res = spawnSync("tasklist", ["/FI", `IMAGENAME eq ${name}.exe`, "/NH"], {
      encoding: "utf8",
      env: childEnv,
    });
    const out = (res.stdout || "").toLowerCase();
    if (out.includes(`${name}.exe`)) {
      console.error(
        `\n[desktop:build] ${name}.exe está en ejecución y Windows bloquea la sobreescritura del binario.`,
      );
      console.error(
        `Ciérralo desde la bandeja del sistema (clic derecho > Salir) o ejecuta:\n  Stop-Process -Name "${name}" -Force\n`,
      );
      process.exit(1);
    }
  }
}

function main() {
  if (!hasCommand("cargo")) {
    printRustInstallHelp();
    process.exit(1);
  }

  assertAppNotRunningOnWindows();

  // 1. Ensure icons exist
  const requiredIcon = path.join(TAURI_DIR, "icons", "icon.ico");
  if (!fs.existsSync(requiredIcon)) {
    run("node", [path.join(ROOT_DIR, "scripts", "generate-desktop-icons.mjs")]);
  }

  // 2. Standalone Rust Launcher build (`storia-launcher`)
  if (launcherOnly) {
    console.log("[desktop:build] Compiling standalone native Rust launcher (storia-launcher)...");
    run("cargo", ["build", "--release", "--bin", "storia-launcher"], TAURI_DIR);
    const ext = process.platform === "win32" ? ".exe" : "";
    console.log(
      `[desktop:build] Launcher ready: ${path.join(TAURI_DIR, "target", "release", `storia-launcher${ext}`)}`,
    );
    return;
  }

  // 3. Stage runtime bundle (unless skipped or dev)
  if (!skipBundle && !isDev) {
    run("node", [path.join(ROOT_DIR, "scripts", "prepare-desktop-bundle.mjs")]);
  }

  // 4. Locate Tauri CLI (`cargo tauri` or `pnpm dlx @tauri-apps/cli`)
  const hasCargoTauri = hasCommand("cargo", ["tauri", "--version"]);
  if (hasCargoTauri) {
    run("cargo", ["tauri", isDev ? "dev" : "build"], TAURI_DIR);
  } else if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "pnpm", "dlx", "@tauri-apps/cli@^2", isDev ? "dev" : "build"], TAURI_DIR);
  } else {
    run("pnpm", ["dlx", "@tauri-apps/cli@^2", isDev ? "dev" : "build"], TAURI_DIR);
  }

  if (!isDev) {
    // Also compile the standalone Rust CLI launcher alongside the Tauri installer
    run("cargo", ["build", "--release", "--bin", "storia-launcher"], TAURI_DIR);
    console.log(
      `[desktop:build] Installers generated in: ${path.join(TAURI_DIR, "target", "release", "bundle")}`,
    );
  }
}

main();
