import type {
  EffectClip,
  Layer,
  PostProcessing,
  Project,
  Scene,
  SubtitleCue,
  SubtitleWord,
  TransitionType,
} from "@storia/schema";

export interface LayerBounds {
  layerId: string;
  layerType: Layer["type"];
  /** Center/pivot in normalized canvas coords [0..1] */
  x: number;
  y: number;
  /** Bounding box in normalized canvas coords [0..1] */
  left: number;
  top: number;
  width: number;
  height: number;
  rotationDeg: number;
  anchorX: number;
  anchorY: number;
  locked: boolean;
}

export interface EvaluatedCamera {
  x: number;
  y: number;
  zoom: number;
  rotationDeg: number;
  shakeX: number;
  shakeY: number;
  chromaticBurst: number;
  parallaxStrength: number;
}

export interface EvaluatedTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotationDeg: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  anchorX: number;
  anchorY: number;
}

export interface EvaluatedLayer {
  layer: Layer;
  localTime: number;
  visibleAtTime: boolean;
  transform: EvaluatedTransform;
  /** Estimated velocity in normalized units/sec (drives auto-walk animation). */
  speedNormPerSec: number;
  movingLeft: boolean;
}

export interface EvaluatedSubtitleState {
  cue: SubtitleCue;
  windowWords: SubtitleWord[];
  activeWordId: string | null;
  /** 0..1 progress inside the currently spoken active word */
  activeWordProgress: number;
  progressInCue: number;
  fadeAlpha: number;
  enterProgress: number;
  exitProgress: number;
  globalTimeSec: number;
}

export interface EvaluatedTransition {
  type: TransitionType;
  /** 0 = start of transition, 1 = complete */
  progress: number;
  phase: "in" | "out";
  accentColor: string;
}

export interface EvaluatedEffectClip {
  clip: EffectClip;
  localTime: number;
  /** 0..1 progress inside the clip */
  progress: number;
  /** Smooth fade-in/out envelope multiplied by clip.intensity */
  weight: number;
}

export interface EvaluatedFrame {
  project: Project;
  globalTimeSec: number;
  frameIndex: number;
  scene: Scene;
  sceneIndex: number;
  sceneStart: number;
  localTime: number;
  camera: EvaluatedCamera;
  layers: EvaluatedLayer[];
  subtitle: EvaluatedSubtitleState | null;
  postProcessing: PostProcessing;
  transition: EvaluatedTransition | null;
  activeEffects: EvaluatedEffectClip[];
}

export interface StoriaRendererOptions {
  /** Override output canvas pixel width/height; defaults to project.canvas resolved dimensions. */
  width?: number;
  height?: number;
  /** Preserve drawing buffer so capture_frame / Playwright reads exact pixels. */
  preserveDrawingBuffer?: boolean;
  /** Toggle WebGL MSAA antialiasing (disabled automatically in lowMemoryMode to save VRAM on mobile/iOS). */
  antialias?: boolean;
  /** Mobile / iOS Safari GPU-memory-saving mode (avoids expensive per-layer blur FBOs & lowers texture LRU cap). */
  lowMemoryMode?: boolean;
  /** Prefer WebGL2 (default) with automatic Canvas fallback. */
  preference?: "webgl" | "webgpu";
  /** Optional base URL for relative /api asset paths (used in headless export). */
  assetBaseUrl?: string;
  /** Called whenever a lazy-loaded SVG/image texture becomes ready so interactive UIs can repaint immediately. */
  onAssetLoaded?: () => void;
}
