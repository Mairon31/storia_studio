import { z } from "zod";
import { AnimatablePropertySchema, KeyframeSchema } from "./keyframes.js";
import { CanvasConfigSchema, IdSchema } from "./primitives.js";
import {
  AssetSchema,
  AudioClipSchema,
  AudioTrackSchema,
  EffectClipSchema,
  ExportSettingsSchema,
  LayerSchema,
  PostProcessingSchema,
  Project,
  ProjectSchema,
  SceneSchema,
  TimelineMarkerSchema,
  TransitionConfigSchema,
} from "./project.js";
import { CharacterDefinitionSchema } from "./rig.js";
import { AnimationStyleIdSchema, getAnimationStylePreset } from "./styles.js";
import { SubtitleCueSchema, SubtitleStyleSchema, SubtitleWordSchema } from "./subtitles.js";

/**
 * Atomic, serializable mutations shared by:
 *   1. Studio UI (Zustand + Undo/Redo)
 *   2. Fastify REST + WebSocket live sync
 *   3. Storia Studio MCP server tools
 */
export const ProjectOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("project.updateMeta"),
    name: z.string().min(1).max(160).optional(),
    description: z.string().max(1000).optional(),
  }),
  z.object({
    op: z.literal("canvas.update"),
    patch: CanvasConfigSchema.partial(),
  }),
  z.object({
    op: z.literal("postProcessing.update"),
    patch: PostProcessingSchema.partial(),
  }),
  z.object({
    op: z.literal("exportSettings.update"),
    patch: ExportSettingsSchema.partial(),
  }),
  z.object({
    op: z.literal("asset.upsert"),
    asset: AssetSchema,
  }),
  z.object({
    op: z.literal("asset.remove"),
    assetId: IdSchema,
  }),
  z.object({
    op: z.literal("character.upsert"),
    character: CharacterDefinitionSchema,
  }),
  z.object({
    op: z.literal("character.remove"),
    characterId: IdSchema,
  }),
  z.object({
    op: z.literal("scene.add"),
    scene: SceneSchema,
    index: z.number().int().min(0).optional(),
  }),
  z.object({
    op: z.literal("scene.update"),
    sceneId: IdSchema,
    patch: SceneSchema.omit({ id: true, layers: true }).partial(),
  }),
  z.object({
    op: z.literal("scene.remove"),
    sceneId: IdSchema,
  }),
  z.object({
    op: z.literal("scene.reorder"),
    sceneIds: z.array(IdSchema).min(1),
  }),
  z.object({
    op: z.literal("layer.add"),
    sceneId: IdSchema,
    layer: LayerSchema,
  }),
  z.object({
    op: z.literal("layer.update"),
    sceneId: IdSchema,
    layerId: IdSchema,
    /** Deep-merged partial patch for layer properties including transform/keyframes. */
    patch: z.record(z.string(), z.unknown()),
  }),
  z.object({
    op: z.literal("layer.remove"),
    sceneId: IdSchema,
    layerId: IdSchema,
  }),
  z.object({
    op: z.literal("keyframe.upsert"),
    sceneId: IdSchema,
    /** When omitted, targets the scene camera keyframes. */
    layerId: IdSchema.optional(),
    property: AnimatablePropertySchema,
    keyframe: KeyframeSchema,
  }),
  z.object({
    op: z.literal("keyframe.remove"),
    sceneId: IdSchema,
    layerId: IdSchema.optional(),
    property: AnimatablePropertySchema,
    t: z.number().min(0),
  }),
  z.object({
    op: z.literal("subtitle.updateStyle"),
    patch: SubtitleStyleSchema.partial().optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("subtitle.applyStyleToAll"),
    patch: SubtitleStyleSchema.partial(),
    clearCueOverrides: z.boolean().default(true),
  }),
  z.object({
    op: z.literal("subtitle.updateCueStyle"),
    cueId: IdSchema,
    patch: SubtitleStyleSchema.partial().nullable(),
  }),
  z.object({
    op: z.literal("subtitle.upsertCue"),
    cue: SubtitleCueSchema,
  }),
  z.object({
    op: z.literal("subtitle.removeCue"),
    cueId: IdSchema,
  }),
  z.object({
    op: z.literal("subtitle.updateWord"),
    cueId: IdSchema,
    wordId: IdSchema,
    patch: SubtitleWordSchema.innerType().omit({ id: true }).partial(),
  }),
  z.object({
    op: z.literal("audioTrack.upsert"),
    track: AudioTrackSchema,
  }),
  z.object({
    op: z.literal("audioTrack.remove"),
    trackId: IdSchema,
  }),
  z.object({
    op: z.literal("audioClip.upsert"),
    trackId: IdSchema,
    clip: AudioClipSchema,
  }),
  z.object({
    op: z.literal("audioClip.remove"),
    trackId: IdSchema,
    clipId: IdSchema,
  }),
  z.object({
    op: z.literal("effectClip.upsert"),
    effectClip: EffectClipSchema,
  }),
  z.object({
    op: z.literal("effectClip.remove"),
    effectClipId: IdSchema,
  }),
  z.object({
    op: z.literal("marker.upsert"),
    marker: TimelineMarkerSchema,
  }),
  z.object({
    op: z.literal("marker.remove"),
    markerId: IdSchema,
  }),
  z.object({
    op: z.literal("scene.applyTransitionAll"),
    transition: TransitionConfigSchema,
  }),
  z.object({
    op: z.literal("subtitle.replaceAllCues"),
    cues: z.array(SubtitleCueSchema),
  }),
  z.object({
    op: z.literal("project.applyAnimationStyle"),
    styleId: AnimationStyleIdSchema,
    updateBackgrounds: z.boolean().default(true),
    updateSubtitles: z.boolean().default(true),
    updateTransitions: z.boolean().default(false),
  }),
]);
export type ProjectOperation = z.infer<typeof ProjectOperationSchema>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, val] of Object.entries(patch)) {
    if (val === undefined) continue;
    if (isPlainObject(val) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, val);
    } else {
      out[k] = val;
    }
  }
  return out as T;
}

function upsertById<T extends { id: string }>(list: readonly T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}

export function applyProjectOperation(project: Project, rawOp: ProjectOperation): Project {
  const op = ProjectOperationSchema.parse(rawOp);
  const next: Project = structuredClone(project);
  next.updatedAt = new Date().toISOString();

  switch (op.op) {
    case "project.updateMeta":
      if (op.name !== undefined) next.name = op.name;
      if (op.description !== undefined) next.description = op.description;
      break;

    case "canvas.update":
      next.canvas = deepMerge(next.canvas, op.patch);
      break;

    case "postProcessing.update":
      next.postProcessing = deepMerge(next.postProcessing, op.patch);
      break;

    case "exportSettings.update":
      next.exportSettings = deepMerge(next.exportSettings, op.patch);
      break;

    case "asset.upsert":
      next.assets = upsertById(next.assets, op.asset);
      break;

    case "asset.remove":
      next.assets = next.assets.filter((a) => a.id !== op.assetId);
      break;

    case "character.upsert":
      next.cast = upsertById(next.cast, op.character);
      break;

    case "character.remove":
      next.cast = next.cast.filter((c) => c.id !== op.characterId);
      break;

    case "scene.add": {
      if (next.scenes.some((s) => s.id === op.scene.id)) {
        throw new Error(`Scene with id '${op.scene.id}' already exists`);
      }
      const idx = op.index === undefined ? next.scenes.length : Math.min(op.index, next.scenes.length);
      next.scenes.splice(idx, 0, op.scene);
      break;
    }

    case "scene.update": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      Object.assign(scene, deepMerge(scene as unknown as Record<string, unknown>, op.patch));
      break;
    }

    case "scene.remove": {
      if (next.scenes.length <= 1) {
        throw new Error("Cannot remove the last remaining scene in a project");
      }
      const before = next.scenes.length;
      next.scenes = next.scenes.filter((s) => s.id !== op.sceneId);
      if (next.scenes.length === before) throw new Error(`Scene '${op.sceneId}' not found`);
      break;
    }

    case "scene.reorder": {
      const byId = new Map(next.scenes.map((s) => [s.id, s]));
      if (op.sceneIds.length !== next.scenes.length || op.sceneIds.some((id) => !byId.has(id))) {
        throw new Error("scene.reorder requires every existing scene ID exactly once");
      }
      next.scenes = op.sceneIds.map((id) => byId.get(id)!);
      break;
    }

    case "layer.add": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      if (scene.layers.some((l) => l.id === op.layer.id)) {
        throw new Error(`Layer '${op.layer.id}' already exists in scene '${op.sceneId}'`);
      }
      scene.layers.push(op.layer);
      break;
    }

    case "layer.update": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      const idx = scene.layers.findIndex((l) => l.id === op.layerId);
      if (idx === -1) throw new Error(`Layer '${op.layerId}' not found in scene '${op.sceneId}'`);
      const merged = deepMerge(scene.layers[idx] as unknown as Record<string, unknown>, op.patch);
      scene.layers[idx] = LayerSchema.parse(merged);
      break;
    }

    case "layer.remove": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      const before = scene.layers.length;
      scene.layers = scene.layers.filter((l) => l.id !== op.layerId);
      if (scene.layers.length === before) {
        throw new Error(`Layer '${op.layerId}' not found in scene '${op.sceneId}'`);
      }
      break;
    }

    case "keyframe.upsert": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      const targetMap = op.layerId
        ? (() => {
            const layer = scene.layers.find((l) => l.id === op.layerId);
            if (!layer) throw new Error(`Layer '${op.layerId}' not found in scene '${op.sceneId}'`);
            return layer.keyframes;
          })()
        : scene.camera.keyframes;

      const list = [...(targetMap[op.property] ?? [])];
      const existingIdx = list.findIndex((k) => Math.abs(k.t - op.keyframe.t) < 1e-4);
      if (existingIdx >= 0) {
        list[existingIdx] = op.keyframe;
      } else {
        list.push(op.keyframe);
      }
      list.sort((a, b) => a.t - b.t);
      targetMap[op.property] = list;
      break;
    }

    case "keyframe.remove": {
      const scene = next.scenes.find((s) => s.id === op.sceneId);
      if (!scene) throw new Error(`Scene '${op.sceneId}' not found`);
      const targetMap = op.layerId
        ? (() => {
            const layer = scene.layers.find((l) => l.id === op.layerId);
            if (!layer) throw new Error(`Layer '${op.layerId}' not found in scene '${op.sceneId}'`);
            return layer.keyframes;
          })()
        : scene.camera.keyframes;
      const list = targetMap[op.property] ?? [];
      targetMap[op.property] = list.filter((k) => Math.abs(k.t - op.t) >= 1e-4);
      break;
    }

    case "subtitle.updateStyle":
      if (op.patch) {
        next.subtitles.style = deepMerge(next.subtitles.style, op.patch);
      }
      if (op.enabled !== undefined) {
        next.subtitles.enabled = op.enabled;
      }
      break;

    case "subtitle.upsertCue":
      next.subtitles.cues = upsertById(next.subtitles.cues, op.cue).sort((a, b) => a.start - b.start);
      break;

    case "subtitle.removeCue":
      next.subtitles.cues = next.subtitles.cues.filter((c) => c.id !== op.cueId);
      break;

    case "subtitle.updateWord": {
      const cue = next.subtitles.cues.find((c) => c.id === op.cueId);
      if (!cue) throw new Error(`Subtitle cue '${op.cueId}' not found`);
      const wIdx = cue.words.findIndex((w) => w.id === op.wordId);
      if (wIdx === -1) throw new Error(`Subtitle word '${op.wordId}' not found in cue '${op.cueId}'`);
      cue.words[wIdx] = SubtitleWordSchema.parse(
        deepMerge(cue.words[wIdx] as unknown as Record<string, unknown>, op.patch),
      );
      break;
    }

    case "audioTrack.upsert":
      next.audioTracks = upsertById(next.audioTracks, op.track);
      break;

    case "audioTrack.remove":
      next.audioTracks = next.audioTracks.filter((t) => t.id !== op.trackId);
      break;

    case "audioClip.upsert": {
      const track = next.audioTracks.find((t) => t.id === op.trackId);
      if (!track) throw new Error(`Audio track '${op.trackId}' not found`);
      track.clips = upsertById(track.clips, op.clip).sort((a, b) => a.start - b.start);
      break;
    }

    case "audioClip.remove": {
      const track = next.audioTracks.find((t) => t.id === op.trackId);
      if (!track) throw new Error(`Audio track '${op.trackId}' not found`);
      track.clips = track.clips.filter((c) => c.id !== op.clipId);
      break;
    }

    case "effectClip.upsert":
      next.effectClips = upsertById(next.effectClips, op.effectClip).sort((a, b) => a.start - b.start);
      break;

    case "effectClip.remove":
      next.effectClips = next.effectClips.filter((e) => e.id !== op.effectClipId);
      break;

    case "scene.applyTransitionAll":
      next.scenes.forEach((sc, idx) => {
        if (idx > 0) {
          sc.transitionIn = { ...op.transition };
          next.scenes[idx - 1]!.transitionOut = { ...op.transition };
        }
      });
      break;

    case "subtitle.replaceAllCues":
      next.subtitles.enabled = true;
      next.subtitles.cues = [...op.cues].sort((a, b) => a.start - b.start);
      break;

    case "subtitle.applyStyleToAll": {
      const merged = deepMerge(
        next.subtitles.style as unknown as Record<string, unknown>,
        op.patch as Record<string, unknown>,
      );
      next.subtitles.style = SubtitleStyleSchema.parse(merged);
      if (op.clearCueOverrides) {
        next.subtitles.cues = next.subtitles.cues.map((c) => {
          const { styleOverride: _ignored, ...rest } = c;
          return rest;
        });
      }
      break;
    }

    case "subtitle.updateCueStyle": {
      const idx = next.subtitles.cues.findIndex((c) => c.id === op.cueId);
      if (idx === -1) throw new Error(`Subtitle cue '${op.cueId}' not found`);
      const cue = next.subtitles.cues[idx]!;
      if (op.patch === null) {
        const { styleOverride: _ignored, ...rest } = cue;
        next.subtitles.cues[idx] = rest;
      } else {
        const merged = deepMerge(
          (cue.styleOverride ?? {}) as unknown as Record<string, unknown>,
          op.patch as Record<string, unknown>,
        );
        next.subtitles.cues[idx] = {
          ...cue,
          styleOverride: merged as typeof cue.styleOverride,
        };
      }
      break;
    }

    case "marker.upsert":
      next.markers = upsertById(next.markers ?? [], op.marker).sort((a, b) => a.t - b.t);
      break;

    case "marker.remove":
      next.markers = (next.markers ?? []).filter((m) => m.id !== op.markerId);
      break;

    case "project.applyAnimationStyle": {
      const preset = getAnimationStylePreset(op.styleId);
      const isPixel = preset.id === "b7_pixel_theater";
      const isPsx = preset.id === "c4_retro_psx";
      const isRetroPixel = isPixel || isPsx;
      const isHanddrawnOrPaper =
        preset.id === "b1_minimal_handdrawn" ||
        preset.id === "b2_colorful_handdrawn" ||
        preset.id === "b5_avatar_explainer" ||
        preset.id === "a7_rubber_hose" ||
        preset.id === "c5_paper_cutout";
      const is3D = preset.id === "c1_stylized_3d";
      const isKurzgesagt = preset.id === "c2_kurzgesagt";
      const isAnime = preset.id === "c3_anime_cel";

      next.animationStyle = preset.id;
      next.canvas.backgroundColor = preset.palette.bg;
      next.canvas.pixelGrid = {
        enabled: isRetroPixel,
        virtualHeight: isPsx ? 240 : 270,
        snapTransforms: isRetroPixel,
      };

      // Configure full GPU post-processing pipeline for this animation style
      next.postProcessing.preset = preset.postProcessingPreset;
      next.postProcessing.psx.enabled = isPsx || preset.postProcessingPreset === "psx";
      next.postProcessing.pixelArt.enabled = isPixel || preset.postProcessingPreset === "pixel_art";
      next.postProcessing.filmGrain = {
        ...next.postProcessing.filmGrain,
        enabled: isHanddrawnOrPaper || preset.id === "a6_amber_noir" || preset.id === "b4_survival_thriller",
        mode: isHanddrawnOrPaper ? "paper" : preset.id === "b3_retro_tv" ? "vhs" : "film",
        strength: isHanddrawnOrPaper ? 0.08 : 0.12,
      };
      next.postProcessing.halation = {
        ...next.postProcessing.halation,
        enabled:
          is3D ||
          isKurzgesagt ||
          isAnime ||
          preset.id === "a6_amber_noir" ||
          preset.id === "a8_ghibli" ||
          preset.id === "b3_retro_tv",
        strength: isKurzgesagt || isAnime ? 0.34 : is3D ? 0.28 : 0.38,
        tint: preset.palette.accent,
      };
      next.postProcessing.vignette = {
        ...next.postProcessing.vignette,
        enabled:
          preset.id !== "a1_classic_light" &&
          preset.id !== "a2_modern_pop" &&
          preset.id !== "b1_minimal_handdrawn" &&
          preset.id !== "b2_colorful_handdrawn",
        strength:
          preset.id === "a6_amber_noir" || preset.id === "b4_survival_thriller"
            ? 0.48
            : isKurzgesagt || is3D
              ? 0.22
              : 0.28,
      };

      // Reset cast character renderStyle to "auto" so every character immediately adopts the chosen animation style
      next.cast = next.cast.map((ch) => ({
        ...ch,
        renderStyle: "auto",
      }));

      if (op.updateSubtitles) {
        next.subtitles.style.fontFamily = preset.typography.subtitleFont;
        next.subtitles.style.color = preset.typography.subtitleColor;
        next.subtitles.style.activeWordColor = preset.typography.activeWordColor;
        next.subtitles.style.accentWordColor = preset.typography.accentWordColor;
        next.subtitles.style.strokeColor = preset.typography.strokeColor;
        next.subtitles.style.strokeWidth = preset.typography.strokeWidth;
        next.subtitles.style.uppercase = preset.typography.uppercase;
        next.subtitles.style.extrudeDepth = is3D ? 6 : isPixel || isPsx ? 4 : preset.id === "b6_dynamic_meme" ? 6 : 0;
        next.subtitles.style.extrudeColor = preset.typography.strokeColor;
        next.subtitles.style.glowIntensity = isKurzgesagt || preset.id === "b3_retro_tv" ? 0.65 : isAnime ? 0.35 : 0;
        next.subtitles.style.glowColor = preset.typography.activeWordColor;
        next.subtitles.style.overlayStyle =
          isPsx || isPixel
            ? "retro_terminal"
            : preset.id === "c5_paper_cutout"
              ? "torn_paper"
              : isKurzgesagt
                ? "solid_pill"
                : preset.id === "b1_minimal_handdrawn" || preset.id === "b2_colorful_handdrawn"
                  ? "tape_highlight"
                  : "none";
        next.subtitles.style.backgroundBox = {
          ...next.subtitles.style.backgroundBox,
          enabled: preset.typography.pillBackground,
          color: preset.typography.pillColor,
        };
      }

      // Harmonize scene layers (backgrounds, sprites sampling, text layers & shapes)
      for (const sc of next.scenes) {
        if (op.updateBackgrounds) {
          sc.mood = preset.background.mood;
        }
        for (const l of sc.layers) {
          if (l.type === "background") {
            l.scaleMode = isRetroPixel ? "nearest" : "linear";
            if (op.updateBackgrounds && l.sourceType !== "asset") {
              l.sourceType = preset.background.sourceType;
              l.color = preset.background.color;
              l.gradientTop = preset.background.gradientTop;
              l.gradientBottom = preset.background.gradientBottom;
              if (preset.background.proceduralSet) {
                l.proceduralSet = preset.background.proceduralSet as typeof l.proceduralSet;
              }
              l.mood = preset.background.mood;
            }
          } else if (l.type === "sprite") {
            l.scaleMode = isRetroPixel ? "nearest" : "linear";
            l.pixelSnap = isRetroPixel;
          } else if (l.type === "character") {
            l.scaleMode = isRetroPixel ? "nearest" : "linear";
          } else if (l.type === "text" && op.updateSubtitles) {
            l.fontFamily = preset.typography.headingFont;
            l.color = preset.typography.subtitleColor;
            l.accentColor = preset.palette.accent;
            l.strokeColor = preset.typography.strokeColor;
            l.strokeWidth = Math.min(12, preset.typography.strokeWidth);
            l.uppercase = preset.typography.uppercase;
          }
        }
      }

      if (op.updateTransitions) {
        const nextType = preset.defaultTransition as Project["scenes"][number]["transitionIn"]["type"];
        next.scenes.forEach((sc, idx) => {
          if (idx > 0) {
            sc.transitionIn.type = nextType;
            sc.transitionIn.duration = nextType === "cut" ? 0 : Math.max(0.3, sc.transitionIn.duration);
            sc.transitionIn.accentColor = preset.palette.accent;
            const prev = next.scenes[idx - 1]!;
            prev.transitionOut.type = nextType;
            prev.transitionOut.duration = nextType === "cut" ? 0 : Math.max(0.3, prev.transitionOut.duration);
            prev.transitionOut.accentColor = preset.palette.accent;
          }
        });
      }
      break;
    }
  }

  return ProjectSchema.parse(next);
}

export function applyProjectOperations(project: Project, ops: readonly ProjectOperation[]): Project {
  return ops.reduce((acc, op) => applyProjectOperation(acc, op), project);
}
