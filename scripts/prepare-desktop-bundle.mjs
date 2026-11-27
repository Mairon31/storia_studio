#!/usr/bin/env node
/**
 * Stages a self-contained, minimal production runtime payload into:
 *   `apps/desktop/src-tauri/resources/runtime/`
 *
 * Includes:
 *   - Compiled `packages/schema/dist`, `apps/server/dist`, `apps/mcp/dist`, `apps/studio/dist`
 *   - Python helper scripts (`scripts/transcribe_audio.py`, `scripts/tts_local.py`)
 *   - Production-only `node_modules/` resolved recursively from `@storia/server`, `@storia/mcp`, `@storia/schema`
 *
 * Excludes personal projects, downloaded models, devDependencies (vite/typescript/vitest), and secrets.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const RUNTIME_OUT = path.join(ROOT_DIR, "apps", "desktop", "src-tauri", "resources", "runtime");
const ROOT_NODE_MODULES = path.join(ROOT_DIR, "node_modules");

const skipBuild = process.argv.includes("--skip-build");

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dst, filterFn) {
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.cp(src, dst, {
    recursive: true,
    dereference: true,
    force: true,
    filter: filterFn
      ? (source) => {
          if (source === src) return true;
          return filterFn(source, path.basename(source));
        }
      : undefined,
  });
}

async function runWithConcurrency(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const cur = items[idx++];
      await worker(cur);
    }
  });
  await Promise.all(runners);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

/**
 * Resolves a package directory starting from `fromDir` (after resolving symlinks so pnpm's
 * `.pnpm/<pkg>/node_modules/` virtual store siblings are discovered accurately), then falling
 * back to hoisted workspace `node_modules`.
 */
async function resolvePackageDir(pkgName, fromDir, fallbackRoots) {
  const realFrom = await fs.realpath(fromDir).catch(() => fromDir);
  const searchRoots = [];

  // Walk upward from realFrom collecting every `node_modules` directory (exact Node.js resolution)
  let cur = realFrom;
  while (true) {
    if (path.basename(cur) === "node_modules") {
      searchRoots.push(cur);
    } else {
      searchRoots.push(path.join(cur, "node_modules"));
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
    if (cur.length < ROOT_DIR.length && !ROOT_DIR.startsWith(cur)) break;
  }

  for (const fb of fallbackRoots) {
    searchRoots.push(fb);
  }

  for (const nmRoot of searchRoots) {
    const candidate = path.join(nmRoot, ...pkgName.split("/"));
    if (await exists(path.join(candidate, "package.json"))) {
      return await fs.realpath(candidate).catch(() => candidate);
    }
  }
  return null;
}

/**
 * Recursively collects all production dependencies (including pnpm virtual-store transitive deps).
 * Returns:
 *   - `topLevel`: Map<pkgName, realSrcDir>
 *   - `nested`: Array<{ parentPkgName: string, depName: string, srcDir: string }> for version conflicts
 */
async function collectProdDependencies(seedPkgDirs) {
  const queue = [];
  const topLevel = new Map(); // pkgName -> realSrcDir
  const nested = []; // { parentDstRel, depName, srcDir }
  const visitedEdges = new Set();

  const fallbackRoots = [
    ROOT_NODE_MODULES,
    path.join(ROOT_DIR, "apps", "server", "node_modules"),
    path.join(ROOT_DIR, "apps", "mcp", "node_modules"),
    path.join(ROOT_DIR, "packages", "schema", "node_modules"),
  ];

  for (const dir of seedPkgDirs) {
    const pkg = await readJson(path.join(dir, "package.json"));
    for (const dep of Object.keys(pkg.dependencies ?? {})) {
      if (!dep.startsWith("@storia/")) {
        queue.push({ name: dep, fromDir: dir, parentDstRel: null });
      }
    }
  }

  while (queue.length > 0) {
    const { name, fromDir, parentDstRel } = queue.shift();
    if (name.startsWith("@storia/")) continue;

    const realPkgDir = await resolvePackageDir(name, fromDir, fallbackRoots);
    if (!realPkgDir) continue;

    let targetDstRel;
    const existingTop = topLevel.get(name);
    if (!existingTop) {
      topLevel.set(name, realPkgDir);
      targetDstRel = path.join(...name.split("/"));
    } else if (existingTop === realPkgDir) {
      continue;
    } else if (parentDstRel) {
      // Different version of same package needed by a transitive parent -> nest under parent/node_modules/
      targetDstRel = path.join(parentDstRel, "node_modules", ...name.split("/"));
      nested.push({ targetDstRel, srcDir: realPkgDir });
    } else {
      continue;
    }

    const edgeKey = `${targetDstRel}::${realPkgDir}`;
    if (visitedEdges.has(edgeKey)) continue;
    visitedEdges.add(edgeKey);

    const pkg = await readJson(path.join(realPkgDir, "package.json"));
    const nextDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    for (const dep of nextDeps) {
      if (!dep.startsWith("@storia/")) {
        queue.push({ name: dep, fromDir: realPkgDir, parentDstRel: targetDstRel });
      }
    }
  }

  return { topLevel, nested };
}

async function measureBytes(dir) {
  let total = 0;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      total += await measureBytes(full);
    } else {
      const st = await fs.stat(full);
      total += st.size;
    }
  }
  return total;
}

async function main() {
  if (!skipBuild) {
    console.log("[desktop:bundle] Building workspace packages (schema, renderer, server, mcp, studio)...");
    if (process.platform === "win32") {
      execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", "build"], { cwd: ROOT_DIR, stdio: "inherit" });
    } else {
      execFileSync("pnpm", ["build"], { cwd: ROOT_DIR, stdio: "inherit" });
    }
  }

  console.log("[desktop:bundle] Staging runtime bundle into apps/desktop/src-tauri/resources/runtime...");
  await fs.rm(RUNTIME_OUT, { recursive: true, force: true, maxRetries: 6, retryDelay: 150 });
  await fs.mkdir(RUNTIME_OUT, { recursive: true });

  // 1. Copy compiled dist outputs & manifests (excluding __tests__, types, and source maps)
  const noTestsFilter = (_fullPath, name) =>
    name !== "__tests__" &&
    !name.endsWith(".test.js") &&
    !name.endsWith(".test.d.ts") &&
    !name.endsWith(".d.ts") &&
    !name.endsWith(".map");

  const workspaceParts = [
    { src: "packages/schema/dist", dst: "packages/schema/dist" },
    { src: "apps/server/dist", dst: "apps/server/dist" },
    { src: "apps/mcp/dist", dst: "apps/mcp/dist" },
    { src: "apps/studio/dist", dst: "apps/studio/dist" },
  ];

  for (const part of workspaceParts) {
    await copyDir(path.join(ROOT_DIR, part.src), path.join(RUNTIME_OUT, part.dst), noTestsFilter);
  }

  // Copy workspace package.json manifests + root ESM manifest + LICENSE
  for (const rel of [
    "packages/schema/package.json",
    "apps/server/package.json",
    "apps/mcp/package.json",
    "LICENSE.md",
  ]) {
    const dst = path.join(RUNTIME_OUT, rel);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(path.join(ROOT_DIR, rel), dst);
  }

  await fs.writeFile(
    path.join(RUNTIME_OUT, "package.json"),
    JSON.stringify({ name: "storia-studio-runtime", private: true, type: "module" }, null, 2) + "\n",
    "utf8",
  );

  // Stamp build metadata (`build-info.json`) used by the in-app Stable/Nightly auto-updater
  const rootPkg = await readJson(path.join(ROOT_DIR, "package.json"));
  const safeGit = (gitArgs) => {
    try {
      return execFileSync("git", gitArgs, { cwd: ROOT_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      return "";
    }
  };
  const commitSha = (process.env.GITHUB_SHA || safeGit(["rev-parse", "HEAD"]) || "").trim();
  const commitShort = commitSha ? commitSha.slice(0, 7) : "local";
  const commitMessage = (process.env.STORIA_COMMIT_MESSAGE || safeGit(["log", "-1", "--pretty=%s"]) || "").trim();
  const buildChannel = process.env.STORIA_BUILD_CHANNEL === "nightly" ? "nightly" : "stable";
  const repoSlug = (process.env.GITHUB_REPOSITORY || process.env.STORIA_UPDATE_REPO || "Mairon31/storia_studio").trim();
  await fs.writeFile(
    path.join(RUNTIME_OUT, "build-info.json"),
    JSON.stringify(
      {
        version: rootPkg.version || "0.2.1",
        channel: buildChannel,
        commitSha,
        commitShort,
        commitMessage,
        builtAt: new Date().toISOString(),
        repo: repoSlug,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  // Copy Python helper scripts for local Whisper & offline TTS
  await fs.mkdir(path.join(RUNTIME_OUT, "scripts"), { recursive: true });
  for (const scriptName of ["transcribe_audio.py", "tts_local.py"]) {
    const src = path.join(ROOT_DIR, "scripts", scriptName);
    if (await exists(src)) {
      await fs.copyFile(src, path.join(RUNTIME_OUT, "scripts", scriptName));
    }
  }

  // 2. Copy production-only node_modules
  const runtimeNm = path.join(RUNTIME_OUT, "node_modules");
  await fs.mkdir(runtimeNm, { recursive: true });

  // Place internal @storia/schema directly inside node_modules/@storia/schema so ESM resolution works everywhere
  await copyDir(
    path.join(RUNTIME_OUT, "packages", "schema"),
    path.join(runtimeNm, "@storia", "schema"),
  );

  const { topLevel, nested } = await collectProdDependencies([
    path.join(ROOT_DIR, "packages", "schema"),
    path.join(ROOT_DIR, "apps", "server"),
    path.join(ROOT_DIR, "apps", "mcp"),
  ]);

  const BLOCKED_NM_DIRS = new Set([
    ".cache",
    ".github",
    ".husky",
    ".vscode",
    "test",
    "tests",
    "__tests__",
    "spec",
    "docs",
    "doc",
    "examples",
    "example",
    "benchmark",
    "benchmarks",
    "integration",
    "node_modules",
  ]);
  const BLOCKED_NM_EXTS = [
    ".map",
    ".ps1",
    ".psm1",
    ".sh",
    ".bash",
    ".bat",
    ".cmd",
    ".vbs",
    ".d.ts",
    ".d.cts",
    ".d.mts",
    ".tst.ts",
    ".test-d.ts",
    ".markdown",
  ];
  const nmFilter = (_full, name) => {
    const lower = name.toLowerCase();
    if (BLOCKED_NM_DIRS.has(lower)) return false;
    for (const ext of BLOCKED_NM_EXTS) {
      if (lower.endsWith(ext)) return false;
    }
    return true;
  };

  await runWithConcurrency(Array.from(topLevel.entries()), 12, async ([pkgName, srcDir]) => {
    const dstDir = path.join(runtimeNm, ...pkgName.split("/"));
    await copyDir(srcDir, dstDir, nmFilter);
  });
  await runWithConcurrency(nested, 12, async ({ targetDstRel, srcDir }) => {
    const dstDir = path.join(runtimeNm, targetDstRel);
    await copyDir(srcDir, dstDir, nmFilter);
  });

  const totalBytes = await measureBytes(RUNTIME_OUT);
  console.log(
    `[desktop:bundle] Runtime staged cleanly: ${topLevel.size} prod packages (+${nested.length} nested), ${(totalBytes / (1024 * 1024)).toFixed(1)} MB total.`,
  );
}

main().catch((err) => {
  console.error("[desktop:bundle] Failed:", err);
  process.exit(1);
});
