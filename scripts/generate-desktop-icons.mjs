#!/usr/bin/env node
/**
 * Generates all native desktop icons for Windows (.ico), macOS (.icns),
 * and Linux/Tauri (32x32.png, 128x128.png, 128x128@2x.png, icon.png)
 * from the canonical Storia Studio SVG (`apps/desktop/src-tauri/icons/icon.svg`).
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const ICONS_DIR = path.join(ROOT_DIR, "apps", "desktop", "src-tauri", "icons");
const SVG_PATH = path.join(ICONS_DIR, "icon.svg");

async function findPlaywrightChromium() {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || process.env.STORIA_CHROMIUM_PATH;
  if (envPath) {
    try {
      await fs.access(envPath);
      return envPath;
    } catch {
      // continue
    }
  }

  const cacheRoots = [
    path.join(os.homedir(), ".cache", "ms-playwright"),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ms-playwright") : "",
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
  ].filter(Boolean);

  for (const cacheDir of cacheRoots) {
    let entries = [];
    try {
      entries = await fs.readdir(cacheDir);
    } catch {
      continue;
    }
    const chromiumDirs = entries
      .filter((d) => d.startsWith("chromium-") || d.startsWith("chromium_headless_shell-"))
      .sort()
      .reverse();

    for (const dir of chromiumDirs) {
      const candidates = [
        path.join(cacheDir, dir, "chrome-linux", "chrome"),
        path.join(cacheDir, dir, "chrome-linux64", "chrome"),
        path.join(cacheDir, dir, "chrome-headless-shell-linux64", "chrome-headless-shell"),
        path.join(cacheDir, dir, "chrome-win", "chrome.exe"),
        path.join(cacheDir, dir, "chrome-win64", "chrome.exe"),
        path.join(cacheDir, dir, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
        path.join(cacheDir, dir, "chrome-mac-arm64", "Chromium.app", "Contents", "MacOS", "Chromium"),
      ];
      for (const cand of candidates) {
        try {
          await fs.access(cand);
          return cand;
        } catch {
          // next
        }
      }
    }
  }

  return undefined;
}

/**
 * Packs multiple PNG buffers into a valid Windows multi-resolution `.ico` file.
 */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type: 1 = ICO
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  let offset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256px
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // Color palette count
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...entries.map((e) => e.png)]);
}

/**
 * Packs PNG chunks into a valid Apple `.icns` container.
 */
function buildIcns(entries) {
  const typeBySize = {
    16: "icp4",
    32: "icp5",
    64: "icp6",
    128: "ic07",
    256: "ic08",
    512: "ic09",
    1024: "ic10",
  };

  const chunks = [];
  let totalLen = 8;
  for (const { size, png } of entries) {
    const tag = typeBySize[size];
    if (!tag) continue;
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(tag, 0, 4, "ascii");
    chunkHeader.writeUInt32BE(png.length + 8, 4);
    chunks.push(chunkHeader, png);
    totalLen += png.length + 8;
  }

  const fileHeader = Buffer.alloc(8);
  fileHeader.write("icns", 0, 4, "ascii");
  fileHeader.writeUInt32BE(totalLen, 4);
  return Buffer.concat([fileHeader, ...chunks]);
}

async function main() {
  const svgSource = await fs.readFile(SVG_PATH, "utf8");
  const serverRequire = createRequire(path.join(ROOT_DIR, "apps", "server", "package.json"));
  const { chromium } = serverRequire("playwright-core");
  const executablePath = await findPlaywrightChromium();

  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
  const rendered = new Map();

  try {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 1024, height: 1024 },
    });
    const page = await context.newPage();

    for (const size of sizes) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px;background:transparent;overflow:hidden}svg{width:${size}px;height:${size}px;display:block}</style></head><body>${svgSource}</body></html>`,
        { waitUntil: "load" },
      );
      const png = await page.screenshot({ type: "png", omitBackground: true });
      rendered.set(size, Buffer.from(png));
    }
    await context.close();
  } finally {
    await browser.close();
  }

  await fs.mkdir(ICONS_DIR, { recursive: true });
  await fs.writeFile(path.join(ICONS_DIR, "32x32.png"), rendered.get(32));
  await fs.writeFile(path.join(ICONS_DIR, "128x128.png"), rendered.get(128));
  await fs.writeFile(path.join(ICONS_DIR, "128x128@2x.png"), rendered.get(256));
  await fs.writeFile(path.join(ICONS_DIR, "icon.png"), rendered.get(512));

  const icoBuf = buildIco(
    [16, 32, 48, 64, 128, 256].map((size) => ({ size, png: rendered.get(size) })),
  );
  await fs.writeFile(path.join(ICONS_DIR, "icon.ico"), icoBuf);

  const icnsBuf = buildIcns(
    [16, 32, 64, 128, 256, 512, 1024].map((size) => ({ size, png: rendered.get(size) })),
  );
  await fs.writeFile(path.join(ICONS_DIR, "icon.icns"), icnsBuf);

  console.log(
    `[desktop:icons] Generated 32x32.png, 128x128.png, 128x128@2x.png, icon.png, icon.ico (${(icoBuf.length / 1024).toFixed(1)} KB), icon.icns (${(icnsBuf.length / 1024).toFixed(1)} KB)`,
  );
}

main().catch((err) => {
  console.error("[desktop:icons] Failed:", err);
  process.exit(1);
});
