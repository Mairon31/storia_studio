import {
  Application,
  Assets,
  BlurFilter,
  ColorMatrixFilter,
  Container,
  Filter,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import type {
  Asset,
  CharacterDefinition,
  LayerColorAdjust,
  Project,
} from "@storia/schema";
import { evaluateEasing, resolveCanvasDimensions } from "@storia/schema";
import { drawProceduralBackground } from "./backgrounds.js";
import { clamp, hexToNumber, shadeColor } from "./color.js";
import { evaluateSceneFrame } from "./evaluator.js";
import { drawProceduralShape } from "./remotionShapes.js";
import {
  ModularRigTextures,
  renderProceduralCharacter,
  resolveActiveExpressionName,
  ResolvedPartTexture,
} from "./rig.js";
import { StoriaPostFxFilter } from "./shaders.js";
import { getStyleRenderProfile } from "./styleEngine.js";
import { disposeSubtitleChildren, renderSubtitles } from "./subtitles.js";
import type {
  EvaluatedFrame,
  LayerBounds,
  StoriaRendererOptions,
} from "./types.js";
import { drawProceduralProp, drawVfxEffect, drawVfxLayer, OverlayVfxEffect } from "./vfx.js";

const DEFAULT_CHARACTER_DEF: CharacterDefinition = {
  id: "fallback_actor",
  name: "Actor",
  kind: "procedural",
  age: "adult",
  genderPresentation: "neutral",
  role: "casual",
  renderStyle: "auto",
  palette: {
    skin: "#e3b996",
    hair: "#1e1a1c",
    shirt: "#edf0f4",
    pants: "#232833",
    shoes: "#141418",
    accent: "#f7c8d6",
  },
  hairStyle: "short",
  accessories: { glasses: "none", hat: "none", facialHair: "none" },
  parts: {},
};

const OVERLAY_EFFECT_TYPES = new Set<string>([
  "speed_lines",
  "light_leaks",
  "spotlight",
  "embers",
  "rain",
  "snow",
  "dust",
  "god_rays",
  "impact_burst",
  "confetti",
  "bokeh_lights",
  "matrix_rain",
  "lens_flare_sweep",
  "fireflies",
  "starfield",
]);

/**
 * Recursively destroys transient per-frame PixiJS v8 display objects while strictly preserving
 * shared asset Textures owned by StoriaRenderer.textureCache.
 * Critical on iOS Safari / WebKit where un-destroyed per-frame Graphics contexts, Text canvas
 * textures, and Filter instances quickly trigger WebGL VRAM exhaustion and tab reloads.
 */
function disposeTransientChildren(container: Container, keepFilter?: Filter): void {
  const children = container.removeChildren();
  for (const child of children) {
    if (child.filters) {
      const list = Array.isArray(child.filters) ? child.filters : [child.filters];
      for (const f of list) {
        if (f && f !== keepFilter) {
          try {
            f.destroy?.();
          } catch {
            // Ignore already-destroyed filter
          }
        }
      }
      child.filters = null;
    }
    if (child.mask) {
      child.mask = null;
    }

    if (child instanceof Text) {
      child.destroy({ children: true, texture: true, textureSource: true });
    } else if (child instanceof Graphics) {
      child.destroy({ children: true, context: true });
    } else if (child instanceof Sprite) {
      // Never destroy cached asset Texture or TextureSource on Sprites
      child.destroy({ children: false, texture: false, textureSource: false });
    } else {
      disposeTransientChildren(child, keepFilter);
      child.destroy({ children: false, texture: false, textureSource: false });
    }
  }
}

function buildLayerColorFilters(adjust?: LayerColorAdjust, lowMemoryMode = false): Filter[] {
  if (!adjust) return [];
  const filters: Filter[] = [];
  const hasColor =
    Math.abs(adjust.brightness - 1) > 0.01 ||
    Math.abs(adjust.contrast - 1) > 0.01 ||
    Math.abs(adjust.saturation - 1) > 0.01 ||
    Math.abs(adjust.hue) > 0.5 ||
    adjust.grayscale > 0.01 ||
    adjust.sepia > 0.01;

  if (hasColor) {
    const cm = new ColorMatrixFilter();
    if (Math.abs(adjust.brightness - 1) > 0.01) cm.brightness(adjust.brightness, true);
    if (Math.abs(adjust.contrast - 1) > 0.01) cm.contrast(adjust.contrast - 1, true);
    if (Math.abs(adjust.saturation - 1) > 0.01) cm.saturate(adjust.saturation - 1, true);
    if (Math.abs(adjust.hue) > 0.5) cm.hue(adjust.hue, true);
    if (adjust.grayscale > 0.01) cm.desaturate();
    if (adjust.sepia > 0.01) cm.sepia(true);
    filters.push(cm);
  }
  if (adjust.blur > (lowMemoryMode ? 0.6 : 0.2)) {
    filters.push(
      new BlurFilter({
        strength: lowMemoryMode ? Math.min(adjust.blur, 10) : adjust.blur,
        quality: lowMemoryMode ? 1 : 2,
      }),
    );
  }
  return filters;
}

/**
 * Deterministic PixiJS v8 / WebGL2 renderer shared 1:1 between:
 *  - Interactive 60 FPS Studio Viewport
 *  - Headless Playwright -> FFmpeg Exporter (Phase 3)
 *  - Live MCP capture_frame(timestamp) (Phase 4)
 */
export class StoriaRenderer {
  private app: Application | null = null;
  private worldContainer = new Container();
  private hudContainer = new Container();
  private subtitleContainer = new Container();
  private transitionOverlay = new Graphics();
  private postFxFilter = new StoriaPostFxFilter();

  private width = 1080;
  private height = 1920;
  private assetBaseUrl = "";
  private onAssetLoaded?: () => void;
  private destroyed = false;
  private lowMemoryMode = false;
  private preserveDrawingBuffer = true;
  private contextLost = false;
  private onContextLostBound?: (e: Event) => void;
  private onContextRestoredBound?: () => void;

  /** Simple LRU texture cache so switching scenes at 60 FPS stays hitch-free. */
  private textureCache = new Map<string, Texture>();
  private loadingPromises = new Map<string, Promise<Texture | null>>();
  private maxTextures = 80;

  private lastBounds: LayerBounds[] = [];
  private lastEvaluated: EvaluatedFrame | null = null;

  async init(
    hostElement: HTMLElement | HTMLCanvasElement,
    options: StoriaRendererOptions = {},
  ): Promise<HTMLCanvasElement> {
    this.width = options.width ?? 1080;
    this.height = options.height ?? 1920;
    this.assetBaseUrl = (options.assetBaseUrl ?? "").replace(/\/+$/, "");
    this.onAssetLoaded = options.onAssetLoaded;
    this.lowMemoryMode = Boolean(options.lowMemoryMode);
    this.preserveDrawingBuffer = options.preserveDrawingBuffer ?? !this.lowMemoryMode;
    this.maxTextures = this.lowMemoryMode ? 32 : 80;

    const app = new Application();
    const isCanvas = typeof HTMLCanvasElement !== "undefined" && hostElement instanceof HTMLCanvasElement;
    await app.init({
      width: this.width,
      height: this.height,
      antialias: options.antialias ?? !this.lowMemoryMode,
      backgroundAlpha: 1,
      backgroundColor: 0x0a0d16,
      resolution: 1,
      autoDensity: false,
      preserveDrawingBuffer: this.preserveDrawingBuffer,
      preference: options.preference ?? "webgl",
      canvas: isCanvas ? hostElement : undefined,
      autoStart: false,
    });

    if (this.destroyed) {
      app.destroy(false, { children: true, texture: false });
      return app.canvas;
    }

    this.app = app;
    app.stage.addChild(this.worldContainer);
    app.stage.addChild(this.transitionOverlay);
    app.stage.addChild(this.hudContainer);
    app.stage.addChild(this.subtitleContainer);

    this.worldContainer.filterArea = new Rectangle(0, 0, this.width, this.height);
    app.stage.filterArea = new Rectangle(0, 0, this.width, this.height);
    // Attach postFxFilter dynamically only on frames that actually require shader effects
    this.worldContainer.filters = null;
    app.stage.filters = null;

    this.onContextLostBound = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestoredBound = () => {
      this.contextLost = false;
      this.onAssetLoaded?.();
    };
    app.canvas.addEventListener("webglcontextlost", this.onContextLostBound, false);
    app.canvas.addEventListener("webglcontextrestored", this.onContextRestoredBound, false);

    if (!isCanvas) {
      hostElement.innerHTML = "";
      app.canvas.style.width = "100%";
      app.canvas.style.height = "100%";
      app.canvas.style.display = "block";
      hostElement.appendChild(app.canvas);
    }

    return app.canvas;
  }

  get canvas(): HTMLCanvasElement | null {
    return this.app?.canvas ?? null;
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  resize(width: number, height: number): void {
    const w = Math.max(2, Math.round(width));
    const h = Math.max(2, Math.round(height));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    if (this.app) {
      this.app.renderer.resize(w, h);
      const area = new Rectangle(0, 0, w, h);
      this.worldContainer.filterArea = area;
      this.app.stage.filterArea = area;
    }
  }

  private resolveAssetUrl(src: string): string {
    if (/^(https?:|data:|blob:)/i.test(src)) return src;
    if (src.startsWith("/") && this.assetBaseUrl) return `${this.assetBaseUrl}${src}`;
    return src;
  }

  private async loadTextureForAsset(asset: Asset, forceNearest = false): Promise<Texture | null> {
    const url = this.resolveAssetUrl(asset.src);
    const cacheKey = `${url}::${forceNearest || asset.scaleMode === "nearest" ? "nearest" : "linear"}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) {
      this.textureCache.delete(cacheKey);
      this.textureCache.set(cacheKey, cached);
      return cached;
    }
    const inflight = this.loadingPromises.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const tex = (await Assets.load(url)) as Texture;
        if (this.destroyed) return null;
        if (tex && tex.source) {
          tex.source.scaleMode = forceNearest || asset.scaleMode === "nearest" ? "nearest" : "linear";
        }
        if (this.textureCache.size >= this.maxTextures) {
          const oldestKey = this.textureCache.keys().next().value;
          if (oldestKey) this.textureCache.delete(oldestKey);
        }
        this.textureCache.set(cacheKey, tex);
        this.onAssetLoaded?.();
        return tex;
      } catch {
        return null;
      } finally {
        this.loadingPromises.delete(cacheKey);
      }
    })();

    this.loadingPromises.set(cacheKey, promise);
    return promise;
  }

  /**
   * Remotion-inspired deterministic readiness barrier:
   * ensures fonts and every asset texture needed at `timeSec` are loaded before capture/export.
   */
  async ready(project: Project, timeSec: number): Promise<void> {
    const frame = evaluateSceneFrame(project, timeSec);
    if (!frame) return;

    const tasks: Promise<unknown>[] = [];
    if (typeof document !== "undefined" && document.fonts?.ready) {
      tasks.push(document.fonts.ready);
    }

    const assetMap = new Map(project.assets.map((a) => [a.id, a]));
    const castMap = new Map(project.cast.map((c) => [c.id, c]));
    const styleProfile = getStyleRenderProfile(project.animationStyle);
    const forceNearest = styleProfile.forceNearestSampling;
    for (const el of frame.layers) {
      const l = el.layer;
      if (l.type === "background" && l.sourceType === "asset" && l.assetId) {
        const a = assetMap.get(l.assetId);
        if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || l.scaleMode === "nearest"));
      } else if (l.type === "sprite" && l.assetId) {
        const a = assetMap.get(l.assetId);
        if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || l.scaleMode === "nearest"));
      } else if (l.type === "pip" && l.assetId) {
        const a = assetMap.get(l.assetId);
        if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || l.scaleMode === "nearest"));
      } else if (l.type === "character") {
        const def = castMap.get(l.characterId);
        const spriteAssetId = l.customSpriteAssetId ?? (def?.kind === "full_sprite" ? def.parts.fullBody?.assetId : undefined);
        if (spriteAssetId) {
          const a = assetMap.get(spriteAssetId);
          if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || l.scaleMode === "nearest"));
        }
        // Preload modular_sprites parts, expression headVariants, and bound contactProp
        if (def) {
          const partSpecs = [
            def.parts.head,
            def.parts.torso,
            def.parts.leftHand,
            def.parts.rightHand,
            def.parts.leftFoot,
            def.parts.rightFoot,
            def.parts.hat,
            def.parts.prop,
            ...Object.values(def.parts.headVariants ?? {}),
          ];
          for (const part of partSpecs) {
            if (!part?.assetId) continue;
            const a = assetMap.get(part.assetId);
            if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || part.scaleMode === "nearest" || l.scaleMode === "nearest"));
          }
        }
        if (l.contactProp?.assetId) {
          const a = assetMap.get(l.contactProp.assetId);
          if (a) tasks.push(this.loadTextureForAsset(a, forceNearest || l.scaleMode === "nearest"));
        }
      }
    }

    await Promise.all(tasks);
  }

  /**
   * Synchronously renders the exact deterministic frame at `timeSec`.
   * Matches the Project schema 1:1 and updates interactive LayerBounds for selection/gizmos.
   */
  renderAt(
    project: Project,
    timeSec: number,
    overrideDims?: { width: number; height: number },
    renderOptions?: { burnSubtitles?: boolean },
  ): EvaluatedFrame | null {
    if (!this.app || this.destroyed || this.contextLost) return null;

    const dims = overrideDims ?? resolveCanvasDimensions(project.canvas);
    this.resize(dims.width, dims.height);

    const frame = evaluateSceneFrame(project, timeSec);
    this.lastEvaluated = frame;
    if (!frame) return null;

    this.app.renderer.background.color = hexToNumber(project.canvas.backgroundColor, 0x0a0d16);

    // Properly dispose previous frame display lists (frees GPU Graphics contexts, Text textures & temporary filters)
    disposeTransientChildren(this.worldContainer, this.postFxFilter);
    disposeTransientChildren(this.hudContainer, this.postFxFilter);
    this.transitionOverlay.clear();
    this.lastBounds = [];

    const W = this.width;
    const H = this.height;
    const shortSide = Math.min(W, H);
    const scaleRef = shortSide / 1080;

    const assetMap = new Map(project.assets.map((a) => [a.id, a]));
    const castMap = new Map(project.cast.map((c) => [c.id, c]));

    // Camera + Shader transition adjustments across all 40 transition types
    let transZoom = 1;
    let transShiftX = 0;
    let transShiftY = 0;
    let transRotDeg = 0;
    let transChroma = 0;
    let transGlitch = 0;
    let transPixelate = 0;
    let transBlur = 0;
    let transFlash = 0;
    let transFlashColor = "#ffffff";

    if (frame.transition) {
      const { type, progress, phase, accentColor } = frame.transition;
      const k = phase === "in" ? 1 - evaluateEasing(progress, "easeOutCubic") : evaluateEasing(progress, "easeIn");
      const bell = Math.sin(progress * Math.PI);

      switch (type) {
        case "snap_zoom":
        case "zoom_through":
        case "zoom_pupil":
        case "zoom_rotate":
          transZoom = 1 + k * (type === "zoom_pupil" ? 0.55 : type === "zoom_rotate" ? 0.42 : 0.28);
          if (type === "zoom_rotate") {
            transRotDeg = (phase === "in" ? -1 : 1) * k * 28;
          }
          transChroma = k * 0.65;
          transBlur = k * 3.5;
          break;
        case "spin_left":
        case "spin_right":
          transRotDeg = (type === "spin_left" ? -1 : 1) * (phase === "in" ? 1 : -1) * k * 85;
          transZoom = 1 + bell * 0.22;
          transBlur = k * 5;
          transChroma = k * 0.55;
          break;
        case "whip_left":
        case "slide_left":
          transShiftX = (phase === "in" ? 1 : -1) * k * W * (type === "whip_left" ? 0.5 : 0.95);
          if (type === "whip_left") {
            transBlur = k * 6;
            transChroma = k * 0.5;
          }
          break;
        case "whip_right":
        case "slide_right":
          transShiftX = (phase === "in" ? -1 : 1) * k * W * (type === "whip_right" ? 0.5 : 0.95);
          if (type === "whip_right") {
            transBlur = k * 6;
            transChroma = k * 0.5;
          }
          break;
        case "whip_up":
        case "slide_up":
          transShiftY = (phase === "in" ? 1 : -1) * k * H * (type === "whip_up" ? 0.45 : 0.92);
          if (type === "whip_up") transBlur = k * 5;
          break;
        case "whip_down":
        case "slide_down":
          transShiftY = (phase === "in" ? -1 : 1) * k * H * (type === "whip_down" ? 0.45 : 0.92);
          if (type === "whip_down") transBlur = k * 5;
          break;
        case "glitch":
          transGlitch = clamp(bell * 1.15, 0, 1.3);
          transChroma = bell * 1.1;
          transShiftX = Math.sin(frame.frameIndex * 19.3) * bell * 26 * scaleRef;
          break;
        case "rgb_split":
          transChroma = bell * 1.8;
          transZoom = 1 + bell * 0.06;
          break;
        case "pixelate":
          transPixelate = bell;
          break;
        case "morph":
          transZoom = 1 + bell * 0.14;
          transBlur = bell * 5;
          transChroma = bell * 0.5;
          break;
        case "flash":
        case "fade_white":
          transFlash = type === "flash" ? bell * 0.92 : clamp(k, 0, 1);
          transFlashColor = "#ffffff";
          break;
        case "light_leak":
        case "film_burn":
          transFlash = bell * (type === "film_burn" ? 0.72 : 0.48);
          transFlashColor = accentColor || "#ffae42";
          break;
        case "match_cut":
          transZoom = 1 + bell * 0.16;
          transFlash = bell * 0.35;
          transFlashColor = accentColor || "#ffffff";
          break;
      }
    }

    const cam = frame.camera;
    const styleProfile = getStyleRenderProfile(project.animationStyle);
    const forceNearest = styleProfile.forceNearestSampling;
    const activeVirtualH =
      project.canvas.pixelGrid.enabled && project.canvas.pixelGrid.snapTransforms
        ? project.canvas.pixelGrid.virtualHeight
        : styleProfile.pixelSnapVirtualHeight;
    const snapStep = activeVirtualH > 0 ? H / Math.max(90, activeVirtualH) : 0;
    const snap = (v: number) => (snapStep > 0 ? Math.round(v / snapStep) * snapStep : v);

    // Precompute layer world map for lookAt resolution
    const layerPosMap = new Map<string, { x: number; y: number }>();
    for (const el of frame.layers) {
      layerPosMap.set(el.layer.id, { x: el.transform.x, y: el.transform.y });
    }

    const projectPoint = (nx: number, ny: number, depth: number) => {
      if (depth <= 0.001) {
        return { px: snap(nx * W), py: snap(ny * H), camScale: 1, camRot: 0 };
      }
      const effDepth = 1 + (depth - 1) * cam.parallaxStrength;
      const z = (1 + (cam.zoom - 1) * effDepth) * transZoom;
      const cx = (cam.x + cam.shakeX * effDepth) * W;
      const cy = (cam.y + cam.shakeY * effDepth) * H;
      const dx = (nx * W - cx) * z + W * 0.5 + transShiftX * effDepth;
      const dy = (ny * H - cy) * z + H * 0.5 + transShiftY * effDepth;
      return {
        px: snap(dx),
        py: snap(dy),
        camScale: z,
        camRot: ((cam.rotationDeg + transRotDeg) * Math.PI) / 180,
      };
    };

    for (const el of frame.layers) {
      if (!el.visibleAtTime) continue;
      const layer = el.layer;
      const tr = el.transform;
      if (tr.opacity <= 0.005) continue;

      const targetParent = layer.parallaxDepth <= 0.001 ? this.hudContainer : this.worldContainer;
      const holder = new Container();
      holder.alpha = tr.opacity;

      if (layer.type === "background") {
        const bgWrap = new Container();
        const effDepth = 1 + (layer.parallaxDepth - 1) * cam.parallaxStrength;
        const overscan = Math.max(1.06, (1 + (cam.zoom - 1) * effDepth) * transZoom * 1.04);
        const bgX = (0.5 - (cam.x - 0.5 + cam.shakeX) * effDepth) * W + layer.driftX * el.localTime * W + transShiftX * effDepth;
        const bgY = (0.5 - (cam.y - 0.5 + cam.shakeY) * effDepth) * H + layer.driftY * el.localTime * H + transShiftY * effDepth;

        bgWrap.position.set(snap(bgX), snap(bgY));
        bgWrap.scale.set(overscan * tr.scaleX * (tr.flipX ? -1 : 1), overscan * tr.scaleY * (tr.flipY ? -1 : 1));
        bgWrap.rotation = ((cam.rotationDeg + transRotDeg + tr.rotationDeg) * Math.PI) / 180;

        const asset = layer.sourceType === "asset" && layer.assetId ? assetMap.get(layer.assetId) : undefined;
        const tex = asset ? this.getOrTriggerTexture(asset, forceNearest || layer.scaleMode === "nearest") : null;

        if (tex) {
          const sp = new Sprite(tex);
          sp.anchor.set(0.5, 0.5);
          const scaleX = W / Math.max(1, tex.width);
          const scaleY = H / Math.max(1, tex.height);
          if (layer.fit === "cover") {
            const s = Math.max(scaleX, scaleY);
            sp.scale.set(s);
          } else if (layer.fit === "contain") {
            const s = Math.min(scaleX, scaleY);
            sp.scale.set(s);
          } else {
            sp.scale.set(scaleX, scaleY);
          }
          bgWrap.addChild(sp);
        } else {
          const g = new Graphics();
          drawProceduralBackground(g, layer, W, H, frame.globalTimeSec);
          g.position.set(-W * 0.5, -H * 0.5);
          bgWrap.addChild(g);
        }

        const bgFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
        if (bgFilters.length > 0) {
          bgWrap.filters = bgFilters;
        }

        holder.addChild(bgWrap);

        // Optional atmospheric wash & dim overlay directly over the background
        if ((layer.washColor && (layer.washOpacity ?? 0) > 0.005) || (layer.dimOverlay ?? 0) > 0.005) {
          const ov = new Graphics();
          if (layer.washColor && (layer.washOpacity ?? 0) > 0.005) {
            ov.rect(0, 0, W, H).fill({ color: hexToNumber(layer.washColor, 0x1a2036), alpha: layer.washOpacity ?? 0 });
          }
          if ((layer.dimOverlay ?? 0) > 0.005) {
            ov.rect(0, 0, W, H).fill({ color: 0x05070e, alpha: layer.dimOverlay ?? 0 });
          }
          holder.addChild(ov);
        }

        targetParent.addChild(holder);
        this.lastBounds.push({
          layerId: layer.id,
          layerType: layer.type,
          x: tr.x,
          y: tr.y,
          left: 0,
          top: 0,
          width: 1,
          height: 1,
          rotationDeg: tr.rotationDeg,
          anchorX: tr.anchorX,
          anchorY: tr.anchorY,
          locked: layer.locked,
        });
        continue;
      }

      if (layer.type === "vfx") {
        const g = new Graphics();
        drawVfxLayer(g, layer, W, H, frame.globalTimeSec);
        holder.addChild(g);
        targetParent.addChild(holder);
        continue;
      }

      const { px, py, camScale, camRot } = projectPoint(tr.x, tr.y, layer.parallaxDepth);
      holder.position.set(px, py);
      holder.rotation = camRot + (tr.rotationDeg * Math.PI) / 180;

      let localW = shortSide * 0.25;
      let localH = shortSide * 0.25;

      if (layer.type === "sprite") {
        const bobOffset =
          layer.bobAmplitude > 0
            ? Math.sin(frame.globalTimeSec * layer.bobSpeed * Math.PI) * layer.bobAmplitude * H
            : 0;
        holder.y += bobOffset;
        const targetW = layer.widthNorm * shortSide;
        const asset = layer.assetId ? assetMap.get(layer.assetId) : undefined;
        const tex = asset ? this.getOrTriggerTexture(asset, forceNearest || layer.scaleMode === "nearest") : null;

        if (tex) {
          const s = targetW / Math.max(1, tex.width);
          const sx = s * tr.scaleX * (tr.flipX ? -1 : 1);
          const sy = s * tr.scaleY * (tr.flipY ? -1 : 1);

          // Style-aware die-cut sticker border & physical shadow (Paper Cutout / 3D Clay / Kurzgesagt / Retro TV)
          if (styleProfile.spriteTreatment === "paper_cutout") {
            const pShadow = new Sprite(tex);
            pShadow.anchor.set(tr.anchorX, tr.anchorY);
            pShadow.scale.set(sx, sy);
            pShadow.tint = 0x16120c;
            pShadow.alpha = 0.24;
            pShadow.position.set(10 * scaleRef, 11 * scaleRef);
            holder.addChild(pShadow);

            const borderPx = 6 * scaleRef;
            const borderCol = hexToNumber(styleProfile.paperBorderColor, 0xfbf7ef);
            for (const [ox, oy] of [
              [-borderPx, 0],
              [borderPx, 0],
              [0, -borderPx],
              [0, borderPx],
              [-borderPx * 0.7, -borderPx * 0.7],
              [borderPx * 0.7, borderPx * 0.7],
            ] as [number, number][]) {
              const rim = new Sprite(tex);
              rim.anchor.set(tr.anchorX, tr.anchorY);
              rim.scale.set(sx, sy);
              rim.tint = borderCol;
              rim.position.set(ox, oy);
              holder.addChild(rim);
            }
          } else if (
            !layer.shadow?.enabled &&
            (styleProfile.spriteTreatment === "stylized_3d" ||
              styleProfile.spriteTreatment === "kurzgesagt" ||
              styleProfile.spriteTreatment === "retro_tv")
          ) {
            const autoSh = new Sprite(tex);
            autoSh.anchor.set(tr.anchorX, tr.anchorY);
            autoSh.scale.set(sx, sy);
            autoSh.tint =
              styleProfile.spriteTreatment === "retro_tv"
                ? hexToNumber(styleProfile.accentColor, 0x60a5fa)
                : 0x050814;
            autoSh.alpha = styleProfile.spriteTreatment === "retro_tv" ? 0.26 : 0.32;
            autoSh.position.set(
              styleProfile.spriteTreatment === "retro_tv" ? 0 : 7 * scaleRef,
              styleProfile.spriteTreatment === "retro_tv" ? 0 : 12 * scaleRef,
            );
            if (!this.lowMemoryMode) {
              autoSh.filters = [
                new BlurFilter({
                  strength: (styleProfile.spriteTreatment === "retro_tv" ? 12 : 8) * scaleRef,
                  quality: 1,
                }),
              ];
            }
            holder.addChild(autoSh);
          }

          // Optional explicit drop shadow silhouette behind sprite
          if (layer.shadow?.enabled) {
            const sh = new Sprite(tex);
            sh.anchor.set(tr.anchorX, tr.anchorY);
            sh.scale.set(sx, sy);
            sh.tint = hexToNumber(layer.shadow.color, 0x000000);
            sh.alpha = layer.shadow.alpha;
            sh.position.set(layer.shadow.offsetX * scaleRef, layer.shadow.offsetY * scaleRef);
            if (layer.shadow.blur > 0.5 && !this.lowMemoryMode) {
              sh.filters = [new BlurFilter({ strength: layer.shadow.blur * scaleRef * 0.5, quality: 2 })];
            }
            holder.addChild(sh);
          }

          const sp = new Sprite(tex);
          sp.anchor.set(tr.anchorX, tr.anchorY);
          sp.scale.set(sx, sy);
          if (layer.tint) sp.tint = hexToNumber(layer.tint);
          const spFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
          if (spFilters.length > 0) sp.filters = spFilters;
          holder.addChild(sp);

          localW = Math.abs(tex.width * s * tr.scaleX) * camScale;
          localH = Math.abs(tex.height * s * tr.scaleY) * camScale;
        } else {
          const g = new Graphics();
          drawProceduralProp(g, layer.proceduralProp ?? layer.name, targetW, frame.globalTimeSec);
          g.scale.set(tr.scaleX * (tr.flipX ? -1 : 1) * camScale, tr.scaleY * (tr.flipY ? -1 : 1) * camScale);
          const spFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
          if (spFilters.length > 0) g.filters = spFilters;
          holder.addChild(g);
          localW = targetW * tr.scaleX * camScale;
          localH = targetW * tr.scaleY * camScale;
        }
        holder.scale.set(tex ? camScale : 1);
      } else if (layer.type === "character") {
        const def = castMap.get(layer.characterId) ?? DEFAULT_CHARACTER_DEF;
        let faceLeft = tr.flipX;
        if (layer.lookAtLayerId) {
          const tgt = layerPosMap.get(layer.lookAtLayerId);
          if (tgt) faceLeft = tgt.x < tr.x;
        } else if (layer.lookAtPoint) {
          faceLeft = layer.lookAtPoint.x < tr.x;
        } else if (layer.autoWalkOnMove && el.speedNormPerSec > 0.02) {
          faceLeft = el.movingLeft;
        }

        const customAssetId =
          layer.customSpriteAssetId ?? (def.kind === "full_sprite" ? def.parts.fullBody?.assetId : undefined);
        const customAsset = customAssetId ? assetMap.get(customAssetId) : undefined;
        const customTex = customAsset
          ? this.getOrTriggerTexture(customAsset, forceNearest || layer.scaleMode === "nearest")
          : null;
        const charFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);

        if (customTex) {
          const targetH = 470 * scaleRef * camScale;
          const s = targetH / Math.max(1, customTex.height);
          const breathe = Math.sin(frame.globalTimeSec * 2.1) * 0.012;
          const sp = new Sprite(customTex);
          sp.anchor.set(0.5, 1.0);
          sp.scale.set(
            s * tr.scaleX * (1 + breathe) * (faceLeft ? -1 : 1),
            s * tr.scaleY * (1 - breathe * 0.6),
          );
          if (layer.tint) sp.tint = hexToNumber(layer.tint);
          if (charFilters.length > 0) sp.filters = charFilters;
          holder.addChild(sp);

          localW = Math.abs(customTex.width * s * tr.scaleX);
          localH = Math.abs(customTex.height * s * tr.scaleY);
        } else {
          const resolvePartTex = (
            part?: { assetId: string; offsetX: number; offsetY: number; scale: number; pivotX: number; pivotY: number; scaleMode: "linear" | "nearest" },
          ): ResolvedPartTexture | undefined => {
            if (!part?.assetId) return undefined;
            const a = assetMap.get(part.assetId);
            if (!a) return undefined;
            const tex = this.getOrTriggerTexture(
              a,
              forceNearest || part.scaleMode === "nearest" || layer.scaleMode === "nearest",
            );
            return tex ? { texture: tex, override: part } : undefined;
          };

          const activeExprName = resolveActiveExpressionName(layer, el.localTime);
          const headVariantPart = def.parts.headVariants?.[activeExprName];
          const contactPropAsset = layer.contactProp?.assetId ? assetMap.get(layer.contactProp.assetId) : undefined;
          const contactPropTex = contactPropAsset
            ? this.getOrTriggerTexture(contactPropAsset, forceNearest || layer.scaleMode === "nearest") ?? undefined
            : undefined;

          const modularTextures: ModularRigTextures = {
            head: resolvePartTex(headVariantPart) ?? resolvePartTex(def.parts.head),
            torso: resolvePartTex(def.parts.torso),
            leftHand: resolvePartTex(def.parts.leftHand),
            rightHand: resolvePartTex(def.parts.rightHand),
            leftFoot: resolvePartTex(def.parts.leftFoot),
            rightFoot: resolvePartTex(def.parts.rightFoot),
            hat: resolvePartTex(def.parts.hat),
            prop: resolvePartTex(def.parts.prop),
            contactProp: contactPropTex,
          };

          const walkSpeed = layer.autoWalkOnMove ? clamp(el.speedNormPerSec * 4.5, 0, 1) : 0;
          const rigContainer = new Container();
          renderProceduralCharacter(
            rigContainer,
            def,
            layer,
            el.localTime,
            frame.globalTimeSec,
            walkSpeed,
            faceLeft,
            project.animationStyle,
            modularTextures,
          );
          const rigScale = scaleRef * 1.15 * camScale;
          rigContainer.scale.set(rigScale * tr.scaleX, rigScale * tr.scaleY);
          if (charFilters.length > 0) rigContainer.filters = charFilters;
          holder.addChild(rigContainer);

          localW = 190 * rigScale * tr.scaleX;
          localH = 440 * rigScale * tr.scaleY;
        }
      } else if (layer.type === "text") {
        const fontSize = Math.max(12, Math.round(layer.fontSize * scaleRef));
        const maxPx = layer.maxWidth * W;
        const textGroup = new Container();
        const displayText = layer.uppercase ? layer.text.toUpperCase() : layer.text;

        const sh = layer.shadow;
        const dropShadow = sh
          ? sh.enabled
            ? {
                color: hexToNumber(sh.color, 0x000000),
                alpha: sh.alpha,
                blur: sh.blur * scaleRef,
                distance: Math.hypot(sh.offsetX, sh.offsetY) * scaleRef,
                angle: Math.atan2(sh.offsetY, sh.offsetX),
              }
            : undefined
          : {
              color: 0x000000,
              alpha: 0.48,
              blur: 12 * scaleRef,
              distance: 4 * scaleRef,
              angle: Math.PI / 2,
            };

        const mainStyle = new TextStyle({
          fontFamily: `${layer.fontFamily}, "Figtree", "Inter", system-ui, sans-serif`,
          fontSize,
          fontWeight: String(layer.fontWeight) as TextStyle["fontWeight"],
          fontStyle: layer.italic ? "italic" : "normal",
          letterSpacing: (layer.letterSpacing ?? 0) * scaleRef,
          lineHeight: layer.lineHeight ? Math.round(fontSize * layer.lineHeight) : undefined,
          fill: hexToNumber(layer.color, 0xffffff),
          align: layer.align,
          wordWrap: true,
          wordWrapWidth: maxPx,
          stroke:
            layer.strokeWidth > 0
              ? { color: hexToNumber(layer.strokeColor, 0x0a0d16), width: layer.strokeWidth * scaleRef, join: "round" }
              : undefined,
          dropShadow,
        });

        const mainNode = new Text({ text: displayText, style: mainStyle });
        mainNode.anchor.set(tr.anchorX, tr.anchorY);

        let kickerNode: Text | null = null;
        if (layer.kicker) {
          kickerNode = new Text({
            text: layer.kicker.toUpperCase(),
            style: new TextStyle({
              fontFamily: `${layer.fontFamily}, "Figtree", system-ui, sans-serif`,
              fontSize: Math.max(11, Math.round(fontSize * 0.34)),
              fontWeight: "800",
              letterSpacing: 3 * scaleRef,
              fill: hexToNumber(layer.accentColor, 0xf7c8d6),
            }),
          });
          kickerNode.anchor.set(0.5, 1);
          kickerNode.position.set(0, -mainNode.height * tr.anchorY - 10 * scaleRef);
        }

        let subNode: Text | null = null;
        if (layer.subtitle) {
          subNode = new Text({
            text: layer.uppercase ? layer.subtitle.toUpperCase() : layer.subtitle,
            style: new TextStyle({
              fontFamily: `${layer.fontFamily}, "Figtree", system-ui, sans-serif`,
              fontSize: Math.max(12, Math.round(fontSize * 0.42)),
              fontWeight: "600",
              fill: hexToNumber(layer.color, 0xffffff),
              wordWrap: true,
              wordWrapWidth: maxPx,
              align: layer.align,
            }),
          });
          subNode.alpha = 0.88;
          subNode.anchor.set(0.5, 0);
          subNode.position.set(0, mainNode.height * (1 - tr.anchorY) + 10 * scaleRef);
        }

        // Style-aware text backing & 3D/retro extrusion
        const textTreat = styleProfile.textTreatment;
        if (layer.backgroundBox?.enabled) {
          const padX = layer.backgroundBox.paddingX * scaleRef;
          const padY = layer.backgroundBox.paddingY * scaleRef;
          const bw = Math.max(mainNode.width, kickerNode?.width ?? 0, subNode?.width ?? 0) + padX * 2;
          const topY = -mainNode.height * tr.anchorY - (kickerNode ? kickerNode.height + 14 * scaleRef : 0) - padY;
          const botY = mainNode.height * (1 - tr.anchorY) + (subNode ? subNode.height + 14 * scaleRef : 0) + padY;
          const bgCard = new Graphics();
          bgCard
            .roundRect(-bw * 0.5, topY, bw, Math.max(24, botY - topY), layer.backgroundBox.borderRadius * scaleRef)
            .fill({
              color: hexToNumber(layer.backgroundBox.color, 0x0c101b),
              alpha: layer.backgroundBox.opacity,
            });
          textGroup.addChild(bgCard);
        } else if (textTreat === "paper_sticker") {
          const padX = 22 * scaleRef;
          const padY = 12 * scaleRef;
          const bw = Math.max(mainNode.width, kickerNode?.width ?? 0, subNode?.width ?? 0) + padX * 2;
          const topY = -mainNode.height * tr.anchorY - (kickerNode ? kickerNode.height + 12 * scaleRef : 0) - padY;
          const botY = mainNode.height * (1 - tr.anchorY) + (subNode ? subNode.height + 12 * scaleRef : 0) + padY;
          const stickerBg = new Graphics();
          stickerBg
            .roundRect(-bw * 0.5 + 6 * scaleRef, topY + 6 * scaleRef, bw, Math.max(24, botY - topY), 10 * scaleRef)
            .fill({ color: 0x000000, alpha: 0.2 });
          stickerBg
            .roundRect(-bw * 0.5, topY, bw, Math.max(24, botY - topY), 10 * scaleRef)
            .fill({ color: hexToNumber(styleProfile.paperBorderColor, 0xfbf7ef), alpha: 0.94 });
          textGroup.addChild(stickerBg);
        }

        // Style-driven 3D / retro / comic text extrusion behind main title
        const styleExtrudeDepth =
          textTreat === "extrude_3d"
            ? 7
            : textTreat === "comic_pop"
              ? 6
              : textTreat === "pixel_crisp" || textTreat === "psx_retro"
                ? 5
                : 0;
        if (styleExtrudeDepth > 0) {
          const extrudeSteps = Math.min(6, Math.max(2, Math.round(styleExtrudeDepth * 0.7)));
          const extColor = hexToNumber(layer.strokeColor, hexToNumber(styleProfile.inkColor, 0x0a0d16));
          const extStyle = new TextStyle({
            fontFamily: mainStyle.fontFamily,
            fontSize,
            fontWeight: mainStyle.fontWeight,
            fontStyle: mainStyle.fontStyle,
            letterSpacing: mainStyle.letterSpacing,
            lineHeight: mainStyle.lineHeight,
            fill: extColor,
            align: layer.align,
            wordWrap: true,
            wordWrapWidth: maxPx,
            stroke:
              layer.strokeWidth > 0
                ? { color: extColor, width: layer.strokeWidth * scaleRef, join: "round" }
                : undefined,
          });
          for (let stepIdx = extrudeSteps; stepIdx >= 1; stepIdx--) {
            const frac = stepIdx / extrudeSteps;
            const extNode = new Text({ text: displayText, style: extStyle });
            extNode.anchor.set(tr.anchorX, tr.anchorY);
            extNode.position.set(styleExtrudeDepth * 0.42 * frac * scaleRef, styleExtrudeDepth * frac * scaleRef);
            textGroup.addChild(extNode);
          }
        }

        if (kickerNode) textGroup.addChild(kickerNode);
        textGroup.addChild(mainNode);
        if (subNode) textGroup.addChild(subNode);

        textGroup.scale.set(tr.scaleX * camScale, tr.scaleY * camScale);
        const textFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
        if (textFilters.length > 0) textGroup.filters = textFilters;
        holder.addChild(textGroup);
        localW = Math.max(120 * scaleRef, mainNode.width * tr.scaleX * camScale);
        localH = Math.max(
          48 * scaleRef,
          (mainNode.height + (layer.kicker ? fontSize * 0.5 : 0) + (layer.subtitle ? fontSize * 0.6 : 0)) *
            tr.scaleY *
            camScale,
        );
      } else if (layer.type === "shape") {
        const g = new Graphics();
        const sw = layer.widthNorm * W * tr.scaleX * camScale;
        const sh = layer.heightNorm * H * tr.scaleY * camScale;
        const ox = -sw * tr.anchorX;
        const oy = -sh * tr.anchorY;
        const fillCol = layer.fillColor ? hexToNumber(layer.fillColor) : undefined;
        const strokeCol = layer.strokeColor ? hexToNumber(layer.strokeColor) : undefined;
        const strokeW = layer.strokeWidth * scaleRef;

        // Progressive draw-on reveal (`evolvePath`) or pie progress (keyframeable via vfxStrength or auto-enter)
        let effectiveProgress = layer.progress ?? 1;
        if (layer.drawOn) {
          const drawDur = Math.max(0.25, layer.motion?.enterDuration ?? 0.65);
          const u = clamp(el.localTime / drawDur, 0, 1);
          const eased = evaluateEasing(u, "springSmooth");
          effectiveProgress = clamp(effectiveProgress * eased, 0, 1);
        }

        const shapeTreat = styleProfile.shapeTreatment;
        const baseFillCol = layer.fillColor ? hexToNumber(layer.fillColor) : undefined;
        let effectiveStrokeCol = layer.strokeColor ? hexToNumber(layer.strokeColor) : undefined;
        let effectiveStrokeW = layer.strokeWidth * scaleRef;

        // Style-aware shape passes (3D bevel extrusion, Kurzgesagt lineless shadow, Paper Cutout border, Neon glow, Comic ink)
        if (shapeTreat === "stylized_3d" && baseFillCol !== undefined) {
          drawProceduralShape({
            g,
            shape: layer.shape,
            ox: ox + 7 * scaleRef,
            oy: oy + 10 * scaleRef,
            w: sw,
            h: sh,
            borderRadius: layer.borderRadius * scaleRef,
            points: layer.points ?? 5,
            innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
            progress: effectiveProgress,
            drawOn: Boolean(layer.drawOn),
            tailDirection: layer.tailDirection ?? "bottom",
            arrowHeadSize: layer.arrowHeadSize ?? 0.32,
            fillCol: shadeColor(baseFillCol, 0.58),
            strokeCol: undefined,
            strokeWidth: 0,
          });
        } else if (shapeTreat === "kurzgesagt") {
          effectiveStrokeW = 0;
          effectiveStrokeCol = undefined;
          if (baseFillCol !== undefined) {
            drawProceduralShape({
              g,
              shape: layer.shape,
              ox: ox + 6 * scaleRef,
              oy: oy + 8 * scaleRef,
              w: sw,
              h: sh,
              borderRadius: layer.borderRadius * scaleRef,
              points: layer.points ?? 5,
              innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
              progress: effectiveProgress,
              drawOn: Boolean(layer.drawOn),
              tailDirection: layer.tailDirection ?? "bottom",
              arrowHeadSize: layer.arrowHeadSize ?? 0.32,
              fillCol: shadeColor(baseFillCol, 0.45),
              strokeCol: undefined,
              strokeWidth: 0,
            });
          }
        } else if (shapeTreat === "paper_cutout") {
          drawProceduralShape({
            g,
            shape: layer.shape,
            ox: ox + 8 * scaleRef,
            oy: oy + 9 * scaleRef,
            w: sw,
            h: sh,
            borderRadius: layer.borderRadius * scaleRef,
            points: layer.points ?? 5,
            innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
            progress: effectiveProgress,
            drawOn: Boolean(layer.drawOn),
            tailDirection: layer.tailDirection ?? "bottom",
            arrowHeadSize: layer.arrowHeadSize ?? 0.32,
            fillCol: 0x16120d,
            strokeCol: 0x16120d,
            strokeWidth: 10 * scaleRef,
          });
          drawProceduralShape({
            g,
            shape: layer.shape,
            ox,
            oy,
            w: sw,
            h: sh,
            borderRadius: layer.borderRadius * scaleRef,
            points: layer.points ?? 5,
            innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
            progress: effectiveProgress,
            drawOn: Boolean(layer.drawOn),
            tailDirection: layer.tailDirection ?? "bottom",
            arrowHeadSize: layer.arrowHeadSize ?? 0.32,
            fillCol: hexToNumber(styleProfile.paperBorderColor, 0xfbf7ef),
            strokeCol: hexToNumber(styleProfile.paperBorderColor, 0xfbf7ef),
            strokeWidth: 12 * scaleRef,
          });
        } else if (shapeTreat === "comic_ink" || shapeTreat === "anime_cel") {
          effectiveStrokeCol = effectiveStrokeCol ?? hexToNumber(styleProfile.inkColor, 0x141622);
          effectiveStrokeW = Math.max(effectiveStrokeW, 4.5 * scaleRef);
        } else if (shapeTreat === "neon_glow") {
          drawProceduralShape({
            g,
            shape: layer.shape,
            ox,
            oy,
            w: sw,
            h: sh,
            borderRadius: layer.borderRadius * scaleRef,
            points: layer.points ?? 5,
            innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
            progress: effectiveProgress,
            drawOn: Boolean(layer.drawOn),
            tailDirection: layer.tailDirection ?? "bottom",
            arrowHeadSize: layer.arrowHeadSize ?? 0.32,
            fillCol: undefined,
            strokeCol: baseFillCol ?? hexToNumber(styleProfile.accentColor, 0x38bdf8),
            strokeWidth: Math.max(effectiveStrokeW, 6 * scaleRef) + 6 * scaleRef,
          });
        }

        drawProceduralShape({
          g,
          shape: layer.shape,
          ox,
          oy,
          w: sw,
          h: sh,
          borderRadius: layer.borderRadius * scaleRef,
          points: layer.points ?? 5,
          innerRadiusRatio: layer.innerRadiusRatio ?? 0.45,
          progress: effectiveProgress,
          drawOn: Boolean(layer.drawOn),
          tailDirection: layer.tailDirection ?? "bottom",
          arrowHeadSize: layer.arrowHeadSize ?? 0.32,
          fillCol: baseFillCol,
          strokeCol: effectiveStrokeCol,
          strokeWidth: effectiveStrokeW,
        });

        const shapeFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
        if (shapeFilters.length > 0) g.filters = shapeFilters;
        holder.addChild(g);
        localW = sw;
        localH = sh;
      } else if (layer.type === "pip") {
        const pw = layer.widthNorm * W * tr.scaleX * camScale;
        const ph = layer.heightNorm * H * tr.scaleY * camScale;
        const g = new Graphics();
        const ox = -pw * tr.anchorX;
        const oy = -ph * tr.anchorY;
        const borderCol = hexToNumber(layer.borderColor, 0xffd447);
        const rad = layer.shape === "circle" ? Math.min(pw, ph) * 0.5 : 18 * scaleRef;

        if (layer.shape === "polaroid") {
          const pad = 14 * scaleRef;
          g.roundRect(ox - pad, oy - pad, pw + pad * 2, ph + pad * 4.2, 10 * scaleRef).fill(0xf3ede1);
        }
        g.roundRect(ox, oy, pw, ph, rad).fill(0x162033);
        holder.addChild(g);

        // Optional replaced image/SVG inside PiP window
        const pipAsset = layer.assetId ? assetMap.get(layer.assetId) : undefined;
        const pipTex = pipAsset
          ? this.getOrTriggerTexture(pipAsset, forceNearest || layer.scaleMode === "nearest")
          : null;
        if (pipTex) {
          const maskG = new Graphics();
          maskG.roundRect(ox, oy, pw, ph, rad).fill(0xffffff);
          holder.addChild(maskG);
          const sp = new Sprite(pipTex);
          sp.anchor.set(0.5, 0.5);
          sp.position.set(ox + pw * 0.5, oy + ph * 0.5);
          const s = Math.max(pw / Math.max(1, pipTex.width), ph / Math.max(1, pipTex.height));
          sp.scale.set(s);
          sp.mask = maskG;
          const pipFilters = buildLayerColorFilters(layer.colorAdjust, this.lowMemoryMode);
          if (pipFilters.length > 0) sp.filters = pipFilters;
          holder.addChild(sp);
        }

        const borderG = new Graphics();
        borderG.roundRect(ox, oy, pw, ph, rad).stroke({ color: borderCol, width: 4 * scaleRef });
        holder.addChild(borderG);

        if (layer.label) {
          const lbl = new Text({
            text: layer.label,
            style: new TextStyle({
              fontFamily: "Figtree, system-ui, sans-serif",
              fontSize: Math.max(12, Math.round(22 * scaleRef)),
              fontWeight: "700",
              fill: layer.shape === "polaroid" ? 0x18181f : borderCol,
            }),
          });
          lbl.anchor.set(0.5, 0.5);
          lbl.position.set(ox + pw * 0.5, oy + ph + 24 * scaleRef);
          holder.addChild(lbl);
        }
        localW = pw;
        localH = ph;
      }

      targetParent.addChild(holder);

      this.lastBounds.push({
        layerId: layer.id,
        layerType: layer.type,
        x: px / W,
        y: py / H,
        left: (px - localW * tr.anchorX) / W,
        top: (py - localH * tr.anchorY) / H,
        width: localW / W,
        height: localH / H,
        rotationDeg: tr.rotationDeg,
        anchorX: tr.anchorX,
        anchorY: tr.anchorY,
        locked: layer.locked,
      });
    }

    // Render timed CapCut-style Overlay / Atmosphere EffectClips on top of world
    for (let i = 0; i < frame.activeEffects.length; i++) {
      const eff = frame.activeEffects[i]!;
      if (!OVERLAY_EFFECT_TYPES.has(eff.clip.effectType)) continue;
      const g = new Graphics();
      drawVfxEffect(
        g,
        {
          effect: eff.clip.effectType as OverlayVfxEffect,
          intensity: eff.weight,
          color: eff.clip.color,
          seed: 41 + i * 19,
          speed: eff.clip.speed,
        },
        W,
        H,
        frame.globalTimeSec,
        true,
      );
      this.worldContainer.addChild(g);
    }

    // Transition screen overlays (fade / dissolve / wipes / iris / clock_wipe / light_leak)
    if (frame.transition) {
      const { type, progress, phase, accentColor } = frame.transition;
      const k = phase === "in" ? 1 - progress : progress;
      const accentHex = hexToNumber(accentColor, 0xffd447);

      if (type === "fade" || type === "dissolve") {
        this.transitionOverlay.rect(0, 0, W, H).fill({ color: 0x000000, alpha: clamp(k, 0, 1) });
      } else if (type === "wipe_left" || type === "liquid_wipe") {
        const wipeW = W * clamp(k, 0, 1);
        this.transitionOverlay.rect(phase === "in" ? 0 : W - wipeW, 0, wipeW, H).fill({
          color: type === "liquid_wipe" ? accentHex : 0x07090f,
          alpha: type === "liquid_wipe" ? 0.94 : 1,
        });
      } else if (type === "wipe_right") {
        const wipeW = W * clamp(k, 0, 1);
        this.transitionOverlay.rect(phase === "in" ? W - wipeW : 0, 0, wipeW, H).fill({ color: 0x07090f, alpha: 1 });
      } else if (type === "wipe_up") {
        const wipeH = H * clamp(k, 0, 1);
        this.transitionOverlay.rect(0, phase === "in" ? 0 : H - wipeH, W, wipeH).fill({ color: 0x07090f, alpha: 1 });
      } else if (type === "wipe_down") {
        const wipeH = H * clamp(k, 0, 1);
        this.transitionOverlay.rect(0, phase === "in" ? H - wipeH : 0, W, wipeH).fill({ color: 0x07090f, alpha: 1 });
      } else if (type === "split_h" || type === "curtain_open") {
        const halfW = W * 0.5 * clamp(k, 0, 1);
        const col = type === "curtain_open" ? accentHex : 0x07090f;
        this.transitionOverlay.rect(0, 0, halfW, H).fill({ color: col, alpha: type === "curtain_open" ? 0.94 : 1 });
        this.transitionOverlay.rect(W - halfW, 0, halfW, H).fill({ color: col, alpha: type === "curtain_open" ? 0.94 : 1 });
      } else if (type === "split_v" || type === "shutter_blink") {
        const halfH = H * 0.5 * clamp(k, 0, 1);
        this.transitionOverlay.rect(0, 0, W, halfH).fill({ color: 0x05070c, alpha: 1 });
        this.transitionOverlay.rect(0, H - halfH, W, halfH).fill({ color: 0x05070c, alpha: 1 });
      } else if (type === "blinds_h") {
        const slats = 8;
        const slatH = H / slats;
        const barH = slatH * clamp(k, 0, 1);
        for (let s = 0; s < slats; s++) {
          this.transitionOverlay.rect(0, s * slatH, W, barH).fill({ color: 0x07090f, alpha: 1 });
        }
      } else if (type === "blinds_v") {
        const slats = 8;
        const slatW = W / slats;
        const barW = slatW * clamp(k, 0, 1);
        for (let s = 0; s < slats; s++) {
          this.transitionOverlay.rect(s * slatW, 0, barW, H).fill({ color: 0x07090f, alpha: 1 });
        }
      } else if (type === "diamond_iris") {
        const ck = clamp(k, 0, 1);
        const cx = W * 0.5;
        const cy = H * 0.5;
        const rx = W * 0.72 * (1 - ck);
        const ry = H * 0.72 * (1 - ck);
        // 4 corner triangles closing toward center diamond
        this.transitionOverlay.poly([0, 0, cx, 0, cx, Math.max(0, cy - ry), 0, cy]).fill({ color: 0x06080e, alpha: 1 });
        this.transitionOverlay.poly([W, 0, cx, 0, cx, Math.max(0, cy - ry), W, cy]).fill({ color: 0x06080e, alpha: 1 });
        this.transitionOverlay.poly([0, H, cx, H, cx, Math.min(H, cy + ry), 0, cy]).fill({ color: 0x06080e, alpha: 1 });
        this.transitionOverlay.poly([W, H, cx, H, cx, Math.min(H, cy + ry), W, cy]).fill({ color: 0x06080e, alpha: 1 });
        if (rx < W * 0.5) {
          this.transitionOverlay.poly([cx, cy - ry, cx + rx, cy, cx, cy + ry, cx - rx, cy]).stroke({
            color: accentHex,
            width: 3 * scaleRef,
            alpha: 0.7 * ck,
          });
        }
      } else if (type === "iris") {
        const maxR = Math.hypot(W, H) * 0.6;
        const holeR = Math.max(0, maxR * (1 - clamp(k, 0, 1)));
        const band = Math.max(1, maxR - holeR);
        this.transitionOverlay.circle(W * 0.5, H * 0.5, holeR + band * 0.5).stroke({
          color: 0x06080e,
          width: band + 4,
        });
      } else if (type === "clock_wipe") {
        const sweep = clamp(k, 0, 1) * Math.PI * 2;
        const rad = Math.hypot(W, H) * 0.65;
        this.transitionOverlay
          .moveTo(W * 0.5, H * 0.5)
          .arc(W * 0.5, H * 0.5, rad, -Math.PI / 2, -Math.PI / 2 + sweep)
          .lineTo(W * 0.5, H * 0.5)
          .fill({ color: 0x07090f, alpha: 0.96 });
      } else if (type === "light_leak" || type === "film_burn") {
        const bell = Math.sin(progress * Math.PI);
        this.transitionOverlay.circle(W * 0.2, H * 0.3, shortSide * 0.65).fill({
          color: accentHex,
          alpha: bell * 0.5,
        });
        this.transitionOverlay.circle(W * 0.85, H * 0.72, shortSide * 0.55).fill({
          color: 0xff6b3d,
          alpha: bell * 0.42,
        });
      }
    }

    // Render crisp word-level subtitles in screen-space HUD
    if (renderOptions?.burnSubtitles === false) {
      disposeSubtitleChildren(this.subtitleContainer);
    } else {
      renderSubtitles(this.subtitleContainer, project.subtitles, frame.subtitle, W, H, {
        lowMemoryMode: this.lowMemoryMode,
      });
    }

    // Update GPU post-processing shader uniforms (Animation Style + PSX / Pixel Art / Timed Effects / Transitions)
    const postFxActive = this.postFxFilter.updateFromConfig(
      frame.postProcessing,
      frame.globalTimeSec,
      frame.frameIndex,
      Math.max(cam.chromaticBurst, transChroma),
      frame.activeEffects,
      {
        pixelateProgress: transPixelate,
        glitchProgress: transGlitch,
        blurPx: transBlur,
        flash: transFlash,
        flashColor: transFlashColor,
        styleShader: styleProfile.shader,
      },
    );

    const applyToFullStage =
      postFxActive &&
      (styleProfile.applyPostFxToHudAndSubtitles ||
        frame.postProcessing.pixelArt.enabled ||
        frame.postProcessing.psx.enabled ||
        frame.postProcessing.preset === "pixel_art" ||
        frame.postProcessing.preset === "psx");

    if (applyToFullStage) {
      if (this.worldContainer.filters && this.worldContainer.filters.length > 0) {
        this.worldContainer.filters = null;
      }
      if (!this.app.stage.filters || this.app.stage.filters.length === 0) {
        this.app.stage.filters = [this.postFxFilter];
      }
    } else if (postFxActive) {
      if (this.app.stage.filters && this.app.stage.filters.length > 0) {
        this.app.stage.filters = null;
      }
      if (!this.worldContainer.filters || this.worldContainer.filters.length === 0) {
        this.worldContainer.filters = [this.postFxFilter];
      }
    } else {
      if (this.worldContainer.filters && this.worldContainer.filters.length > 0) {
        this.worldContainer.filters = null;
      }
      if (this.app.stage.filters && this.app.stage.filters.length > 0) {
        this.app.stage.filters = null;
      }
    }

    this.app.renderer.render(this.app.stage);
    return frame;
  }

  private getOrTriggerTexture(asset: Asset, forceNearest: boolean): Texture | null {
    const url = this.resolveAssetUrl(asset.src);
    const cacheKey = `${url}::${forceNearest || asset.scaleMode === "nearest" ? "nearest" : "linear"}`;
    const cached = this.textureCache.get(cacheKey);
    if (cached) return cached;
    void this.loadTextureForAsset(asset, forceNearest);
    return null;
  }

  getLayerBounds(): LayerBounds[] {
    return this.lastBounds;
  }

  getLastEvaluatedFrame(): EvaluatedFrame | null {
    return this.lastEvaluated;
  }

  /** Capture the exact rendered canvas as PNG data URL (used by capture_frame & thumbnails). */
  capturePngDataUrl(): string | null {
    if (!this.app || this.contextLost) return null;
    if (!this.preserveDrawingBuffer) {
      this.app.renderer.render(this.app.stage);
    }
    return this.app.canvas.toDataURL("image/png");
  }

  destroy(): void {
    this.destroyed = true;
    disposeTransientChildren(this.worldContainer, this.postFxFilter);
    disposeTransientChildren(this.hudContainer, this.postFxFilter);
    disposeSubtitleChildren(this.subtitleContainer);
    this.worldContainer.filters = null;
    if (this.app) {
      this.app.stage.filters = null;
    }
    try {
      this.postFxFilter.destroy();
    } catch {
      // Ignore
    }
    this.textureCache.clear();
    this.loadingPromises.clear();
    if (this.app) {
      if (this.onContextLostBound) {
        this.app.canvas.removeEventListener("webglcontextlost", this.onContextLostBound, false);
      }
      if (this.onContextRestoredBound) {
        this.app.canvas.removeEventListener("webglcontextrestored", this.onContextRestoredBound, false);
      }
      this.app.destroy(false, { children: true, texture: false });
      this.app = null;
    }
  }
}
