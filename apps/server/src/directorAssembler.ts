import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  AnimationStyleIdSchema,
  applyRolePresetToCharacter,
  AspectRatioSchema,
  Asset,
  AudioClip,
  AudioTrack,
  CameraFramingSchema,
  CharacterAgeSchema,
  CharacterDefinition,
  CharacterDefinitionSchema,
  CharacterExpressionSchema,
  CharacterPoseSchema,
  CharacterRenderStyleSchema,
  FacialHairStyleSchema,
  FpsSchema,
  getAnimationStylePreset,
  GlassesStyleSchema,
  HairStyleSchema,
  HatStyleSchema,
  IdSchema,
  Layer,
  OutfitStyleSchema,
  PantsStyleSchema,
  Project,
  ProjectSchema,
  ResolutionPresetSchema,
  Scene,
  SubtitleCue,
  TransitionTypeSchema,
} from "@storia/schema";
import { transcribeAudioFileToCues } from "./audioTools.js";
import { appendProjectCredit, probeAudioDurationSec } from "./libraries.js";
import { DirectorAudioAsset, StickmanDirectorBridge } from "./stickmanDirector.js";
import { ProjectStorage } from "./storage.js";
import { TtsManager, TtsProviderId } from "./tts.js";

const DirectorCastMemberSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(80),
  role: z.string().max(64).default("casual"),
  age: CharacterAgeSchema.default("adult"),
  genderPresentation: z.enum(["neutral", "masculine", "feminine"]).default("neutral"),
  hairStyle: HairStyleSchema.default("short"),
  facialHair: FacialHairStyleSchema.default("none"),
  hat: HatStyleSchema.default("none"),
  glasses: GlassesStyleSchema.default("none"),
  outfitStyle: OutfitStyleSchema.optional(),
  pantsStyle: PantsStyleSchema.optional(),
  renderStyle: CharacterRenderStyleSchema.default("auto"),
  skin: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  hair: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  shirt: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const DirectorSceneCharacterSchema = z.object({
  characterId: IdSchema,
  x: z.number().min(-0.2).max(1.2).default(0.5),
  y: z.number().min(0.2).max(1.2).default(0.84),
  scale: z.number().min(0.25).max(3.0).default(1.0),
  flipX: z.boolean().default(false),
  pose: CharacterPoseSchema.default("idle"),
  expression: CharacterExpressionSchema.default("neutral"),
  enterX: z.number().min(-0.5).max(1.5).optional(),
  talk: z.boolean().default(false),
});

const DirectorScenePropSchema = z.object({
  name: z.string().min(1).max(80),
  proceduralProp: z.string().max(64).optional(),
  assetId: IdSchema.optional(),
  x: z.number().min(0).max(1).default(0.5),
  y: z.number().min(0).max(1).default(0.45),
  widthNorm: z.number().min(0.05).max(1.8).default(0.32),
  bob: z.boolean().default(true),
});

const DirectorSceneSpecSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().min(1).max(120),
  duration: z.number().min(0.8).max(60).default(4.0),
  narrationText: z.string().max(1500).optional(),
  headline: z.string().max(160).optional(),
  kicker: z.string().max(80).optional(),
  subtitle: z.string().max(160).optional(),
  proceduralSet: z.string().max(64).optional(),
  backgroundAssetId: IdSchema.optional(),
  framing: CameraFramingSchema.default("medium"),
  cameraZoomEnd: z.number().min(0.75).max(2.2).optional(),
  transitionIn: TransitionTypeSchema.optional(),
  transitionDuration: z.number().min(0).max(1.5).default(0.35),
  beatTag: z.string().max(48).optional(),
  sfxQuery: z.string().max(80).optional(),
  sfxAssetId: z.string().max(120).optional(),
  characters: z.array(DirectorSceneCharacterSchema).default([]),
  props: z.array(DirectorScenePropSchema).default([]),
});

export const DirectorAssembleRequestSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(1000).optional(),
  styleId: AnimationStyleIdSchema.default("storia_editorial"),
  aspectRatio: AspectRatioSchema.optional(),
  resolution: ResolutionPresetSchema.optional(),
  fps: FpsSchema.optional(),
  cast: z.array(DirectorCastMemberSchema).default([]),
  scenes: z.array(DirectorSceneSpecSchema).min(1).max(40),
  narration: z
    .object({
      script: z.string().max(12000).optional(),
      existingAudioAssetId: IdSchema.optional(),
      ttsProvider: z
        .enum(["windows_sapi", "elevenlabs", "voicestudio", "piper", "kokoro", "openai", "custom_api"])
        .optional(),
      voiceId: z.string().max(160).optional(),
      language: z.string().max(24).default("es"),
      speed: z.number().min(0.5).max(2.0).default(1.0),
      autoSubtitles: z.boolean().default(true),
    })
    .optional(),
  autoMusic: z.boolean().default(true),
  musicBeat: z.string().max(48).optional(),
  musicQuery: z.string().max(80).optional(),
  musicVolume: z.number().min(0).max(1).default(0.16),
  autoSfx: z.boolean().default(true),
  sfxVolume: z.number().min(0).max(1.5).default(0.55),
  requestSource: z.enum(["ui", "mcp", "api"]).default("mcp"),
});

export type DirectorAssembleRequest = z.infer<typeof DirectorAssembleRequestSchema>;

function buildFallbackWordCues(scenes: { duration: number; narrationText?: string }[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let cursor = 0;
  let cueIdx = 0;
  let wordIdx = 0;
  for (const sc of scenes) {
    const text = sc.narrationText?.trim();
    if (text) {
      const tokens = text.split(/\s+/).filter(Boolean);
      if (tokens.length > 0) {
        const chunkSize = 5;
        const totalChunks = Math.ceil(tokens.length / chunkSize);
        const chunkDur = sc.duration / Math.max(1, totalChunks);
        for (let ci = 0; ci < totalChunks; ci++) {
          const chunk = tokens.slice(ci * chunkSize, (ci + 1) * chunkSize);
          const start = Number((cursor + ci * chunkDur).toFixed(3));
          const end = Number((cursor + (ci + 1) * chunkDur).toFixed(3));
          const wDur = (end - start) / Math.max(1, chunk.length);
          cueIdx++;
          cues.push({
            id: `cue_dir_${cueIdx}`,
            start,
            end,
            text: chunk.join(" "),
            words: chunk.map((w, wi) => {
              wordIdx++;
              return {
                id: `w_dir_${wordIdx}`,
                text: w,
                start: Number((start + wi * wDur).toFixed(3)),
                end: Number((start + (wi + 1) * wDur).toFixed(3)),
                emphasis: wi === chunk.length - 1 ? "normal" : "normal",
              };
            }),
          });
        }
      }
    }
    cursor += sc.duration;
  }
  return cues;
}

async function copyDirectorAudioIntoProject(
  storage: ProjectStorage,
  projectId: string,
  da: DirectorAudioAsset,
  existingAssets: Asset[],
): Promise<Asset> {
  const assetId = `aud_dir_${da.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)}`;
  const existing = existingAssets.find((a) => a.id === assetId);
  if (existing) return existing;

  const ext = path.extname(da.fullPath).toLowerCase() || ".ogg";
  const safeFile = `${assetId}${ext}`;
  const projectDir = path.resolve(storage.rootDir, IdSchema.parse(projectId));
  const assetsDir = path.join(projectDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const destPath = path.join(assetsDir, safeFile);
  await fs.copyFile(da.fullPath, destPath);

  const durationSec = (await probeAudioDurationSec(destPath)) ?? da.durationSec;
  await appendProjectCredit(
    projectDir,
    `[${da.kind.toUpperCase()}] ${da.title} — ${da.author} (${da.licenseId})${da.sourceUrl ? ` · ${da.sourceUrl}` : ""}`,
  );

  const asset: Asset = {
    id: assetId,
    name: da.title,
    kind: "audio",
    src: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(safeFile)}`,
    mimeType: ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/ogg",
    durationSec,
    scaleMode: "linear",
    tags: Array.from(new Set([da.kind, da.category, ...da.tags.slice(0, 4)])),
    provenance: {
      source: "local",
      license: da.licenseId,
      author: da.author,
      url: da.sourceUrl,
    },
  };
  existingAssets.push(asset);
  return asset;
}

/**
 * Autonomous full-video director & assembler:
 * Takes a style (Storia Editorial or any of the 16 Stickman Director A1-A8 / B1-B8 styles),
 * cast, scenes, optional TTS narration, auto-selected CC0/CC-BY music & SFX, and captions,
 * and constructs a complete, ready-to-preview & export Storia Studio Project in one call.
 */
export async function assembleDirectedVideo(opts: {
  storage: ProjectStorage;
  directorBridge: StickmanDirectorBridge;
  ttsManager: TtsManager;
  projectId: string;
  input: DirectorAssembleRequest;
}): Promise<{
  project: Project;
  styleApplied: string;
  scenesBuilt: number;
  castBuilt: number;
  voiceGenerated: boolean;
  musicAdded: string | null;
  sfxAddedCount: number;
  subtitlesCount: number;
  warnings: string[];
}> {
  const { storage, directorBridge, ttsManager, projectId, input } = opts;
  const existingProject = await storage.get(projectId);
  if (!existingProject) {
    throw new Error(`Project '${projectId}' not found`);
  }

  const preset = getAnimationStylePreset(input.styleId);
  const warnings: string[] = [];
  const nextAssets: Asset[] = [...existingProject.assets];

  // 1. Build cast with role-based automatic wardrobe + style-aware renderStyle
  const castList: CharacterDefinition[] = [];
  for (const c of input.cast) {
    const baseDef = CharacterDefinitionSchema.parse({
      id: c.id,
      name: c.name,
      age: c.age,
      genderPresentation: c.genderPresentation,
      role: c.role,
      renderStyle: c.renderStyle,
      hairStyle: c.hairStyle,
      accessories: {
        glasses: c.glasses,
        hat: c.hat,
        facialHair: c.facialHair,
      },
      wardrobe:
        c.outfitStyle || c.pantsStyle
          ? {
              ...(c.outfitStyle ? { outfitStyle: c.outfitStyle } : {}),
              ...(c.pantsStyle ? { pantsStyle: c.pantsStyle } : {}),
            }
          : undefined,
      palette: {
        skin: c.skin ?? "#e6be9a",
        hair: c.hair ?? "#1e1a1c",
        shirt: c.shirt ?? preset.palette.accent,
        pants: "#232833",
        shoes: "#141418",
        accent: c.accent ?? preset.palette.accent,
      },
    });
    const roleStyled = c.role && c.role !== "casual" ? applyRolePresetToCharacter(baseDef, c.role) : baseDef;
    // Preserve explicit cast overrides for hat/glasses/facialHair/outfitStyle/pantsStyle
    const styledDef: CharacterDefinition = {
      ...roleStyled,
      accessories: {
        ...roleStyled.accessories,
        ...(c.hat !== "none" ? { hat: c.hat } : {}),
        ...(c.glasses !== "none" ? { glasses: c.glasses } : {}),
        ...(c.facialHair !== "none" ? { facialHair: c.facialHair } : {}),
      },
      wardrobe:
        c.outfitStyle || c.pantsStyle
          ? {
              ...(roleStyled.wardrobe ?? ({} as NonNullable<CharacterDefinition["wardrobe"]>)),
              ...(c.outfitStyle ? { outfitStyle: c.outfitStyle } : {}),
              ...(c.pantsStyle ? { pantsStyle: c.pantsStyle } : {}),
            }
          : roleStyled.wardrobe,
    };
    castList.push(styledDef);
  }
  const finalCast = castList.length > 0 ? castList : existingProject.cast;

  // 2. Build scenes with style-matched backgrounds, characters, props, kinetic headlines & transitions
  const scenes: Scene[] = [];
  let cursor = 0;
  const sceneSfxTriggers: { start: number; beat: string; query?: string; explicitId?: string }[] = [];

  for (let idx = 0; idx < input.scenes.length; idx++) {
    const spec = input.scenes[idx]!;
    const sceneId = spec.id ?? `scene_${String(idx + 1).padStart(2, "0")}`;
    const layers: Layer[] = [];

    // Background layer
    const bgLayer: Layer = {
      id: `${sceneId}_bg`,
      name: "Fondo",
      type: "background",
      start: 0,
      visible: true,
      locked: false,
      zIndex: 0,
      parallaxDepth: 0.75,
      blendMode: "normal",
      transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchor: { x: 0.5, y: 0.5 }, flipX: false, flipY: false },
      keyframes: {},
      sourceType: spec.backgroundAssetId ? "asset" : preset.background.sourceType,
      assetId: spec.backgroundAssetId,
      color: preset.background.color,
      gradientTop: preset.background.gradientTop,
      gradientBottom: preset.background.gradientBottom,
      proceduralSet: (spec.proceduralSet ?? preset.background.proceduralSet ?? "living_room") as Extract<
        Layer,
        { type: "background" }
      >["proceduralSet"],
      mood: preset.background.mood,
      seed: idx + 1,
      fit: "cover",
      scaleMode: preset.postProcessingPreset === "pixel_art" ? "nearest" : "linear",
      driftX: 0,
      driftY: 0,
    };
    layers.push(bgLayer);

    // Character layers
    spec.characters.forEach((ch, ci) => {
      const charLayer: Layer = {
        id: `${sceneId}_char_${ci + 1}`,
        name: finalCast.find((x) => x.id === ch.characterId)?.name ?? ch.characterId,
        type: "character",
        characterId: ch.characterId,
        start: 0,
        visible: true,
        locked: false,
        zIndex: 20 + ci * 2,
        parallaxDepth: 1.0,
        blendMode: "normal",
        transform: {
          x: ch.x,
          y: ch.y,
          scaleX: ch.scale,
          scaleY: ch.scale,
          rotation: 0,
          opacity: 1,
          anchor: { x: 0.5, y: 1 },
          flipX: ch.flipX,
          flipY: false,
        },
        keyframes:
          ch.enterX !== undefined
            ? {
                x: [
                  { t: 0, value: ch.enterX, easing: "easeOut" },
                  { t: Math.min(1.1, spec.duration * 0.4), value: ch.x, easing: "easeOut" },
                ],
              }
            : {},
        pose: ch.pose,
        expression: ch.expression,
        poseCues: [],
        expressionCues: [],
        boneOverrides: {},
        talkWindows: ch.talk ? [[0.15, Math.max(0.4, spec.duration - 0.2)]] : [],
        silhouette: false,
        autoWalkOnMove: true,
        scaleMode: preset.postProcessingPreset === "pixel_art" ? "nearest" : "linear",
      };
      layers.push(charLayer);
    });

    // Prop / Sprite layers
    spec.props.forEach((pr, pi) => {
      const propLayer: Layer = {
        id: `${sceneId}_prop_${pi + 1}`,
        name: pr.name,
        type: "sprite",
        assetId: pr.assetId,
        proceduralProp: pr.proceduralProp ?? (pr.assetId ? undefined : "glow_orb"),
        start: 0,
        visible: true,
        locked: false,
        zIndex: 15 + pi,
        parallaxDepth: 0.95,
        blendMode: "normal",
        transform: { x: pr.x, y: pr.y, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchor: { x: 0.5, y: 0.5 }, flipX: false, flipY: false },
        keyframes: {},
        widthNorm: pr.widthNorm,
        scaleMode: preset.postProcessingPreset === "pixel_art" ? "nearest" : "linear",
        pixelSnap: preset.postProcessingPreset === "pixel_art",
        bobAmplitude: pr.bob ? 0.015 : 0,
        bobSpeed: 1.4,
      };
      layers.push(propLayer);
    });

    // Optional kinetic headline text
    if (spec.headline) {
      const textLayer: Layer = {
        id: `${sceneId}_title`,
        name: "Titular",
        type: "text",
        variant: "kinetic_title",
        text: spec.headline,
        kicker: spec.kicker,
        subtitle: spec.subtitle,
        start: 0.08,
        visible: true,
        locked: false,
        zIndex: 60,
        parallaxDepth: 0,
        blendMode: "normal",
        transform: { x: 0.5, y: 0.2, scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, anchor: { x: 0.5, y: 0.5 }, flipX: false, flipY: false },
        keyframes: {},
        motion: {
          enter: "pop",
          enterDuration: 0.35,
          exit: "none",
          exitDuration: 0.3,
          loop: "none",
          loopSpeed: 1,
          loopAmplitude: 1,
        },
        fontFamily: preset.typography.headingFont,
        fontWeight: 900,
        fontSize: 64,
        color: preset.palette.ink,
        accentColor: preset.palette.accent,
        strokeColor: preset.typography.strokeColor,
        strokeWidth: Math.min(8, preset.typography.strokeWidth),
        align: "center",
        maxWidth: 0.86,
        uppercase: preset.typography.uppercase,
      };
      layers.push(textLayer);
    }

    const zoomStart =
      spec.framing === "closeup" || spec.framing === "extreme_closeup"
        ? 1.18
        : spec.framing === "medium"
          ? 1.05
          : 1.0;
    const zoomEnd = spec.cameraZoomEnd ?? Number((zoomStart + 0.06).toFixed(2));

    scenes.push({
      id: sceneId,
      name: spec.name,
      duration: spec.duration,
      mood: preset.background.mood,
      camera: {
        framing: spec.framing,
        x: 0.5,
        y: 0.5,
        zoom: zoomStart,
        rotation: 0,
        handheld: { enabled: false, intensity: 0.22, frequency: 1.0 },
        parallaxStrength: 1.0,
        impulses: [],
        keyframes: {
          cameraZoom: [
            { t: 0, value: zoomStart, easing: "easeInOut" },
            { t: spec.duration, value: zoomEnd, easing: "easeInOut" },
          ],
        },
      },
      transitionIn: {
        type: idx === 0 ? "cut" : ((spec.transitionIn ?? preset.defaultTransition) as Scene["transitionIn"]["type"]),
        duration: idx === 0 ? 0 : spec.transitionDuration,
        accentColor: preset.palette.accent,
        sfxPreset: "none",
        sfxVolume: 0.75,
      },
      transitionOut: {
        type: "cut",
        duration: 0,
        accentColor: preset.palette.accent,
        sfxPreset: "none",
        sfxVolume: 0.75,
      },
      layers,
      notes: spec.narrationText ?? "",
    });

    if (idx > 0 || spec.sfxQuery || spec.sfxAssetId || spec.beatTag) {
      sceneSfxTriggers.push({
        start: Number(cursor.toFixed(3)),
        beat: spec.beatTag ?? (idx === 0 ? "opening" : "reveal"),
        query: spec.sfxQuery,
        explicitId: spec.sfxAssetId,
      });
    }
    cursor += spec.duration;
  }

  let totalDuration = Math.max(1, cursor);
  const audioTracks: AudioTrack[] = [];
  let voiceGenerated = false;
  let subtitleCues: SubtitleCue[] = [];

  // 3. Narration track (existing audio OR synthesized via TTS + optional Whisper subtitles)
  const fullScript =
    input.narration?.script?.trim() ||
    input.scenes
      .map((s) => s.narrationText?.trim())
      .filter(Boolean)
      .join(" ");

  if (input.narration?.existingAudioAssetId) {
    const existingVoice = nextAssets.find((a) => a.id === input.narration!.existingAudioAssetId);
    if (existingVoice) {
      const dur = existingVoice.durationSec ?? totalDuration;
      audioTracks.push({
        id: "track_voice",
        name: "Narración",
        role: "voice",
        volume: 1.0,
        muted: false,
        solo: false,
        duckAmountDb: -10,
        clips: [
          {
            id: "clip_voice_main",
            name: existingVoice.name,
            assetId: existingVoice.id,
            start: 0,
            duration: dur,
            trimStart: 0,
            gainDb: 0,
            pan: 0,
            fadeIn: 0,
            fadeOut: 0,
            fadeCurve: "smooth",
            loop: false,
          },
        ],
      });
    } else {
      warnings.push(`Asset de voz '${input.narration.existingAudioAssetId}' no encontrado.`);
    }
  } else if (input.narration?.ttsProvider && fullScript) {
    try {
      const assetsDir = path.join(path.resolve(storage.rootDir, IdSchema.parse(projectId)), "assets");
      await fs.mkdir(assetsDir, { recursive: true });
      const filename = `tts_dir_${Date.now().toString(36)}.wav`;
      const destPath = path.join(assetsDir, filename);
      const synth = await ttsManager.synthesizeToWav(
        {
          provider: input.narration.ttsProvider as TtsProviderId,
          text: fullScript,
          voiceId: input.narration.voiceId,
          language: input.narration.language,
          speed: input.narration.speed,
        },
        destPath,
      );
      const voiceDur = (await probeAudioDurationSec(destPath)) ?? synth.durationSec;
      const voiceAsset: Asset = {
        id: `aud_voice_${Date.now().toString(36)}`,
        name: `Voz (${synth.providerLabel})`,
        kind: "audio",
        src: `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(filename)}`,
        mimeType: "audio/wav",
        durationSec: voiceDur,
        scaleMode: "linear",
        tags: ["tts", input.narration.ttsProvider, "voice"],
        provenance: {
          source: "generated",
          author: synth.providerLabel,
        },
      };
      nextAssets.push(voiceAsset);
      voiceGenerated = true;

      // Proportionally fit scene durations if narration is longer than planned scenes
      if (voiceDur > totalDuration + 0.5) {
        const ratio = voiceDur / totalDuration;
        for (const sc of scenes) {
          sc.duration = Number((sc.duration * ratio).toFixed(2));
        }
        totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
      }

      audioTracks.push({
        id: "track_voice",
        name: "Narración IA",
        role: "voice",
        volume: 1.0,
        muted: false,
        solo: false,
        duckAmountDb: -10,
        clips: [
          {
            id: "clip_voice_main",
            name: voiceAsset.name,
            assetId: voiceAsset.id,
            start: 0,
            duration: voiceDur,
            trimStart: 0,
            gainDb: 0,
            pan: 0,
            fadeIn: 0,
            fadeOut: 0,
            fadeCurve: "smooth",
            loop: false,
          },
        ],
      });

      if (input.narration.autoSubtitles) {
        try {
          const tr = await transcribeAudioFileToCues({
            audioFilePath: destPath,
            language: input.narration.language,
            model: "base",
          });
          subtitleCues = tr.cues;
        } catch (err) {
          warnings.push(`Whisper falló (${err instanceof Error ? err.message : String(err)}); usando subtítulos sincronizados por escena.`);
        }
      }
    } catch (err) {
      warnings.push(`TTS falló: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Fallback word-level captions from scene narrationText if Whisper wasn't run
  if (subtitleCues.length === 0 && input.scenes.some((s) => Boolean(s.narrationText?.trim()))) {
    subtitleCues = buildFallbackWordCues(
      scenes.map((sc, i) => ({ duration: sc.duration, narrationText: input.scenes[i]?.narrationText })),
    );
  }

  // 4. Auto-selected BGM from Stickman Director's 890-asset library
  let musicAdded: string | null = null;
  if (input.autoMusic && (await directorBridge.isAvailable())) {
    const rec = await directorBridge.recommendAudio({
      styleCode: preset.audioProfileCode,
      beat: input.musicBeat ?? "opening",
      query: input.musicQuery,
      limit: 3,
    });
    const chosenMusic = rec.music[0];
    if (chosenMusic) {
      try {
        const musicAsset = await copyDirectorAudioIntoProject(storage, projectId, chosenMusic, nextAssets);
        musicAdded = chosenMusic.title;
        audioTracks.push({
          id: "track_music",
          name: `Música · ${chosenMusic.title}`,
          role: "music",
          volume: input.musicVolume,
          muted: false,
          solo: false,
          duckUnderTrackId: audioTracks.some((t) => t.id === "track_voice") ? "track_voice" : undefined,
          duckAmountDb: -8,
          clips: [
            {
              id: "clip_bgm_main",
              name: chosenMusic.title,
              assetId: musicAsset.id,
              start: 0,
              duration: Number(totalDuration.toFixed(2)),
              trimStart: 0,
              gainDb: 0,
              pan: 0,
              fadeIn: 0.6,
              fadeOut: 1.4,
              fadeCurve: "smooth",
              loop: true,
            },
          ],
        });
      } catch (err) {
        warnings.push(`No se pudo copiar música '${chosenMusic.id}': ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 5. Auto-selected scene SFX from Stickman Director's curated SFX library
  let sfxAddedCount = 0;
  if (input.autoSfx && sceneSfxTriggers.length > 0 && (await directorBridge.isAvailable())) {
    const sfxClips: AudioClip[] = [];
    for (let i = 0; i < sceneSfxTriggers.length; i++) {
      const trig = sceneSfxTriggers[i]!;
      let chosen: DirectorAudioAsset | null = null;
      if (trig.explicitId) {
        chosen = await directorBridge.getAudioById(trig.explicitId.replace(/^sd_/, ""));
      }
      if (!chosen) {
        const rec = await directorBridge.recommendAudio({
          styleCode: preset.audioProfileCode,
          beat: trig.beat,
          query: trig.query,
          limit: 4,
        });
        chosen = rec.sfx[i % Math.max(1, rec.sfx.length)] ?? rec.sfx[0] ?? null;
      }
      if (!chosen) continue;
      try {
        const sfxAsset = await copyDirectorAudioIntoProject(storage, projectId, chosen, nextAssets);
        sfxClips.push({
          id: `clip_sfx_${i + 1}`,
          name: chosen.title,
          assetId: sfxAsset.id,
          start: trig.start,
          duration: Math.max(0.15, Math.min(3.5, sfxAsset.durationSec ?? chosen.durationSec)),
          trimStart: 0,
          gainDb: 0,
          pan: 0,
          fadeIn: 0,
          fadeOut: 0.05,
          fadeCurve: "smooth",
          loop: false,
        });
        sfxAddedCount++;
      } catch {
        // Skip broken SFX gracefully
      }
    }
    if (sfxClips.length > 0) {
      audioTracks.push({
        id: "track_sfx",
        name: "SFX Director",
        role: "sfx",
        volume: input.sfxVolume,
        muted: false,
        solo: false,
        duckAmountDb: -10,
        clips: sfxClips,
      });
    }
  }

  // 6. Save complete assembled project atomically
  const now = new Date().toISOString();
  const nextCanvas = {
    aspectRatio: input.aspectRatio ?? existingProject.canvas.aspectRatio,
    resolution: input.resolution ?? existingProject.canvas.resolution,
    fps: input.fps ?? existingProject.canvas.fps,
  };

  const assembled: Project = ProjectSchema.parse({
    ...existingProject,
    name: input.name ?? existingProject.name,
    description: input.description ?? existingProject.description,
    updatedAt: now,
    canvas: nextCanvas,
    animationStyle: preset.id,
    cast: finalCast,
    assets: nextAssets,
    scenes,
    audioTracks: audioTracks.length > 0 ? audioTracks : existingProject.audioTracks,
    postProcessing: {
      ...existingProject.postProcessing,
      preset: preset.postProcessingPreset,
      psx: { ...existingProject.postProcessing.psx, enabled: preset.postProcessingPreset === "psx" },
      pixelArt: { ...existingProject.postProcessing.pixelArt, enabled: preset.postProcessingPreset === "pixel_art" },
    },
    subtitles: {
      ...existingProject.subtitles,
      enabled: subtitleCues.length > 0 ? true : existingProject.subtitles.enabled,
      language: input.narration?.language ?? existingProject.subtitles.language,
      style: {
        ...existingProject.subtitles.style,
        fontFamily: preset.typography.subtitleFont,
        fontSource: "local",
        color: preset.typography.subtitleColor,
        activeWordColor: preset.typography.activeWordColor,
        accentWordColor: preset.typography.accentWordColor,
        strokeColor: preset.typography.strokeColor,
        strokeWidth: preset.typography.strokeWidth,
        uppercase: preset.typography.uppercase,
        backgroundBox: {
          ...existingProject.subtitles.style.backgroundBox,
          enabled: preset.typography.pillBackground,
          color: preset.typography.pillColor,
        },
      },
      cues: subtitleCues.length > 0 ? subtitleCues : existingProject.subtitles.cues,
    },
    exportSettings: {
      ...existingProject.exportSettings,
      aspectRatio: nextCanvas.aspectRatio,
      resolution: nextCanvas.resolution,
      fps: nextCanvas.fps,
    },
  });

  const saved = await storage.save(assembled);
  return {
    project: saved,
    styleApplied: `${preset.code} · ${preset.name}`,
    scenesBuilt: scenes.length,
    castBuilt: finalCast.length,
    voiceGenerated,
    musicAdded,
    sfxAddedCount,
    subtitlesCount: saved.subtitles.cues.length,
    warnings,
  };
}
