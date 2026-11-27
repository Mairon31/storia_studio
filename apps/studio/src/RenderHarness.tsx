import React, { useEffect, useRef } from "react";
import type { Project } from "@storia/schema";
import { StoriaRenderer } from "@storia/renderer";
import { ensureBundledFontsLoaded, ensureGoogleFontLoaded, loadLocalFontAsset } from "./lib/fonts";

interface MotionBlurOptions {
  samples: number;
  shutterAngle: number;
  fps: number;
}

interface RenderApi {
  init: (width: number, height: number, assetBaseUrl: string) => Promise<{ ok: boolean; width: number; height: number }>;
  loadProject: (project: Project) => Promise<{ ok: boolean; scenes: number }>;
  renderFrame: (timeSec: number, burnSubtitles?: boolean) => Promise<{ sceneId: string | null; sceneName: string | null }>;
  renderAndPostRgba: (
    timeSec: number,
    ingestUrl: string,
    burnSubtitles?: boolean,
    motionBlur?: MotionBlurOptions,
  ) => Promise<{ ok: boolean; bytes: number }>;
  capturePngDataUrl: (
    timeSec: number,
    burnSubtitles?: boolean,
  ) => Promise<{ pngDataUrl: string; width: number; height: number; sceneId: string | null; sceneName: string | null }>;
  dispose: () => void;
}

declare global {
  interface Window {
    __STORIA_RENDER__?: RenderApi;
    __STORIA_RENDER_READY__?: boolean;
  }
}

/**
 * Zero-chrome headless render harness mounted at `/render`.
 * Uses the exact same `@storia/renderer` (PixiJS v8 + GLSL shaders + rigs + subtitles)
 * as the interactive 60 FPS Studio Viewport to guarantee 1:1 pixel parity on export & capture_frame.
 */
export const RenderHarness: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let renderer: StoriaRenderer | null = null;
    let activeProject: Project | null = null;
    let outW = 1080;
    let outH = 1920;
    let readbackCanvas: HTMLCanvasElement | null = null;
    let readbackCtx: CanvasRenderingContext2D | null = null;
    let accumBuf: Float32Array | null = null;
    let outRgbaBuf: Uint8ClampedArray | null = null;

    const ensureReadback = (w: number, h: number) => {
      if (!readbackCanvas) {
        readbackCanvas = document.createElement("canvas");
      }
      if (readbackCanvas.width !== w || readbackCanvas.height !== h) {
        readbackCanvas.width = w;
        readbackCanvas.height = h;
        readbackCtx = readbackCanvas.getContext("2d", { willReadFrequently: true });
        accumBuf = null;
        outRgbaBuf = null;
      }
      return readbackCtx;
    };

    const api: RenderApi = {
      async init(width, height, assetBaseUrl) {
        outW = Math.max(2, Math.round(width));
        outH = Math.max(2, Math.round(height));
        if (renderer) {
          renderer.destroy();
          renderer = null;
        }
        const host = hostRef.current;
        if (!host) throw new Error("Render host container not mounted");
        host.style.width = `${outW}px`;
        host.style.height = `${outH}px`;

        renderer = new StoriaRenderer();
        await renderer.init(host, {
          width: outW,
          height: outH,
          preserveDrawingBuffer: true,
          preference: "webgl",
          assetBaseUrl,
        });
        ensureReadback(outW, outH);
        return { ok: true, width: outW, height: outH };
      },

      async loadProject(project) {
        activeProject = project;
        if (project.subtitles.style.fontSource === "google") {
          ensureGoogleFontLoaded(project.subtitles.style.fontFamily);
        }
        const localLoads: Promise<void>[] = [ensureBundledFontsLoaded()];
        for (const a of project.assets) {
          if (a.kind === "font") {
            localLoads.push(loadLocalFontAsset(a.name, a.src));
          }
        }
        await Promise.all(localLoads);
        if (document.fonts?.ready) {
          await document.fonts.ready;
        }
        return { ok: true, scenes: project.scenes.length };
      },

      async renderFrame(timeSec, burnSubtitles = true) {
        if (!renderer || !activeProject) {
          throw new Error("Renderer or project not initialized");
        }
        await renderer.ready(activeProject, timeSec);
        const evaluated = renderer.renderAt(
          activeProject,
          timeSec,
          { width: outW, height: outH },
          { burnSubtitles },
        );
        return {
          sceneId: evaluated?.scene.id ?? null,
          sceneName: evaluated?.scene.name ?? null,
        };
      },

      async renderAndPostRgba(timeSec, ingestUrl, burnSubtitles = true, motionBlur) {
        if (!renderer || !activeProject) {
          throw new Error("Renderer or project not initialized");
        }
        const srcCanvas = renderer.canvas;
        const ctx = ensureReadback(outW, outH);
        if (!srcCanvas || !ctx) {
          throw new Error("Canvas readback context unavailable");
        }

        const samples = Math.max(1, Math.min(16, Math.round(motionBlur?.samples ?? 1)));
        const shutterAngle = Math.max(0, Math.min(360, motionBlur?.shutterAngle ?? 180));
        const fps = Math.max(1, motionBlur?.fps ?? 30);

        let payloadBytes: Uint8ClampedArray;

        if (samples > 1 && shutterAngle > 0) {
          // Remotion-style sub-frame shutter-angle Motion Blur accumulation
          const totalChannels = outW * outH * 4;
          if (!accumBuf || accumBuf.length !== totalChannels) {
            accumBuf = new Float32Array(totalChannels);
          } else {
            accumBuf.fill(0);
          }
          if (!outRgbaBuf || outRgbaBuf.length !== totalChannels) {
            outRgbaBuf = new Uint8ClampedArray(totalChannels);
          }

          const shutterDurationSec = (shutterAngle / 360) / fps;
          for (let s = 0; s < samples; s++) {
            const frac = samples > 1 ? s / (samples - 1) : 1;
            const sampleTime = Math.max(0, timeSec - shutterDurationSec * (1 - frac));
            await renderer.ready(activeProject, sampleTime);
            renderer.renderAt(
              activeProject,
              sampleTime,
              { width: outW, height: outH },
              { burnSubtitles },
            );
            ctx.clearRect(0, 0, outW, outH);
            ctx.drawImage(srcCanvas, 0, 0, outW, outH);
            const data = ctx.getImageData(0, 0, outW, outH).data;
            for (let p = 0; p < totalChannels; p++) {
              accumBuf[p]! += data[p]!;
            }
          }

          const invN = 1 / samples;
          for (let p = 0; p < totalChannels; p++) {
            outRgbaBuf[p] = Math.round(accumBuf[p]! * invN);
          }
          payloadBytes = outRgbaBuf;
        } else {
          await renderer.ready(activeProject, timeSec);
          renderer.renderAt(
            activeProject,
            timeSec,
            { width: outW, height: outH },
            { burnSubtitles },
          );
          ctx.clearRect(0, 0, outW, outH);
          ctx.drawImage(srcCanvas, 0, 0, outW, outH);
          payloadBytes = ctx.getImageData(0, 0, outW, outH).data;
        }

        const res = await fetch(ingestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: payloadBytes as unknown as BodyInit,
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => res.statusText);
          throw new Error(`Frame ingest HTTP ${res.status}: ${msg}`);
        }
        return { ok: true, bytes: payloadBytes.byteLength };
      },

      async capturePngDataUrl(timeSec, burnSubtitles = true) {
        if (!renderer || !activeProject) {
          throw new Error("Renderer or project not initialized");
        }
        await renderer.ready(activeProject, timeSec);
        const evaluated = renderer.renderAt(
          activeProject,
          timeSec,
          { width: outW, height: outH },
          { burnSubtitles },
        );
        const pngDataUrl = renderer.capturePngDataUrl();
        if (!pngDataUrl) throw new Error("Failed to capture PNG from canvas");
        return {
          pngDataUrl,
          width: outW,
          height: outH,
          sceneId: evaluated?.scene.id ?? null,
          sceneName: evaluated?.scene.name ?? null,
        };
      },

      dispose() {
        renderer?.destroy();
        renderer = null;
      },
    };

    window.__STORIA_RENDER__ = api;
    window.__STORIA_RENDER_READY__ = true;

    return () => {
      window.__STORIA_RENDER_READY__ = false;
      delete window.__STORIA_RENDER__;
      renderer?.destroy();
      renderer = null;
    };
  }, []);

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        background: "#000000",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <div ref={hostRef} />
    </div>
  );
};
