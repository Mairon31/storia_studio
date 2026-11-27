import React, { useState } from "react";
import {
  Camera,
  Captions,
  Code2,
  Diamond,
  Eye,
  EyeOff,
  Gauge,
  History,
  Layers,
  Link2,
  Lock,
  Music,
  Plus,
  RefreshCw,
  RotateCcw,
  Scissors,
  Sparkles,
  Trash2,
  Unlink2,
  Unlock,
  Volume2,
  Wand2,
} from "lucide-react";
import {
  AnimatableProperty,
  applyRolePresetToCharacter,
  AudioFadeCurve,
  CameraFraming,
  CHARACTER_ROLE_PRESETS,
  CharacterExpression,
  CharacterPose,
  CharacterRenderStyle,
  EasingType,
  EyeStyle,
  FaceShape,
  FacialHairStyle,
  GlassesStyle,
  HairStyle,
  HatStyle,
  LayerColorAdjust,
  LayerEnterAnim,
  LayerExitAnim,
  LayerLoopMotion,
  LayerMotion,
  OutfitStyle,
  PantsStyle,
  ProjectOperation,
  resolveSceneAtTime,
  ShapeKind,
  TransitionType,
} from "@storia/schema";
import { studioApi } from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { ensureGoogleFontLoaded } from "../lib/fonts";
import { useStudioStore } from "../store/useStudioStore";
import { CharacterVisualStudioPanel } from "./CharacterVisualPickers";
import { CharacterWardrobeVisualPanel } from "./CharacterWardrobePickers";
import { EFFECT_CATALOG } from "./EffectsLibraryPanel";
import {
  type LayerPreviewContext,
  VisualFilterGrid,
  VisualFontPicker,
  VisualMotionGrid,
  VisualProceduralSetGrid,
  VisualShapeGrid,
  VisualTransitionPicker,
} from "./VisualPickers";

const POSES: CharacterPose[] = [
  "idle", "present", "present_both", "point", "point_up", "shrug", "think", "wave", "wave_both",
  "celebrate", "victory", "lean", "sad", "shock", "reach", "hug", "comfort", "despair",
  "protect", "cower", "run", "walk", "sit", "kneel", "look_up", "hold_hands",
  "arms_crossed", "hands_on_hips", "salute", "bow", "dance", "typing", "phone_call", "fighting",
];

const EXPRESSIONS: CharacterExpression[] = [
  "neutral", "calm", "happy", "laugh", "proud", "relieved", "love", "awe",
  "worried", "fear", "angry", "sly", "smug", "suspicious", "think",
  "sad", "cry", "guilt", "exhausted", "shock", "determined", "confused",
];

const HATS: { id: HatStyle; label: string }[] = [
  { id: "none", label: "Sin sombrero" },
  { id: "cap", label: "Gorra clásica" },
  { id: "beanie", label: "Gorro Beanie" },
  { id: "bucket_hat", label: "Gorro Bucket" },
  { id: "fedora", label: "Fedora / Detective" },
  { id: "tophat", label: "Sombrero de copa" },
  { id: "beret", label: "Boina francesa" },
  { id: "cowboy_hat", label: "Sombrero Vaquero" },
  { id: "sombrero", label: "Sombrero Mexicano" },
  { id: "sun_hat", label: "Sombrero de sol / playa" },
  { id: "crown", label: "Corona real" },
  { id: "tiara", label: "Tiara / Diadema" },
  { id: "laurel_wreath", label: "Corona de laurel griega" },
  { id: "graduation_cap", label: "Birrete graduación" },
  { id: "headphones", label: "Audífonos de estudio" },
  { id: "headband", label: "Cinta / Banda cabeza" },
  { id: "police_cap", label: "Gorra Policía" },
  { id: "officer_cap", label: "Gorra Militar / Oficial" },
  { id: "tricorn", label: "Tricornio Pirata" },
  { id: "sailor_cap", label: "Gorro Marinero" },
  { id: "chef_hat", label: "Gorro de Chef" },
  { id: "helmet", label: "Casco de combate / obra" },
  { id: "fire_helmet", label: "Casco Bombero" },
  { id: "work_cap", label: "Casco / Gorra obrero" },
  { id: "pith_helmet", label: "Casco Explorador" },
  { id: "astronaut_helmet", label: "Casco Astronauta" },
  { id: "wizard_hat", label: "Sombrero de Mago" },
  { id: "knight_helm", label: "Yelmo de Caballero" },
  { id: "samurai_kabuto", label: "Casco Samurái Kabuto" },
  { id: "ninja_hood", label: "Capucha Ninja" },
];

const HAIR_STYLES: { id: HairStyle; label: string }[] = [
  // Hombre / estructurados
  { id: "short", label: "Corto clásico" },
  { id: "parted", label: "Raya de lado" },
  { id: "pompadour", label: "Hombre · Pompadour / Tupé" },
  { id: "undercut", label: "Hombre · Undercut moderno" },
  { id: "spiky", label: "Hombre · En puntas (Spiky)" },
  { id: "slick_back", label: "Hombre · Peinado hacia atrás" },
  { id: "side_sweep", label: "Hombre · Flequillo lateral" },
  { id: "buzz", label: "Hombre · Rapado (Buzz)" },
  { id: "mohawk", label: "Hombre · Cresta Mohawk" },
  { id: "bald", label: "Calvo / Sin cabello" },
  // Mujer / expresivos
  { id: "long", label: "Mujer · Largo clásico" },
  { id: "long_layered", label: "Mujer · Largo en capas" },
  { id: "bangs_long", label: "Mujer · Largo con flequillo recto" },
  { id: "wavy", label: "Mujer · Ondulado" },
  { id: "bob", label: "Mujer · Melena Bob" },
  { id: "pixie", label: "Mujer · Corte Pixie" },
  { id: "ponytail", label: "Mujer · Coleta alta" },
  { id: "twin_tails", label: "Mujer · Dos coletas" },
  { id: "braids", label: "Mujer · Dos trenzas" },
  { id: "updo", label: "Mujer · Moño alto elegante" },
  { id: "side_bun", label: "Mujer · Moño lateral" },
  { id: "messy_bun", label: "Mujer · Moño despeinado" },
  { id: "half_up", label: "Mujer · Semirecogido" },
  // Texturizados / unisex
  { id: "curly", label: "Rizado con volumen" },
  { id: "afro", label: "Afro grande" },
  { id: "dreadlocks", label: "Rastas (Dreadlocks)" },
];

const FACIAL_HAIR_STYLES: { id: FacialHairStyle; label: string }[] = [
  { id: "none", label: "Sin vello facial" },
  { id: "stubble", label: "Barba de 3 días (Stubble)" },
  { id: "mustache", label: "Bigote clásico" },
  { id: "chevron", label: "Bigote Chevron (Detective)" },
  { id: "handlebar", label: "Bigote Manillar (Curvo)" },
  { id: "soul_patch", label: "Mosca / Soul Patch" },
  { id: "goatee", label: "Perilla (Goatee)" },
  { id: "van_dyke", label: "Van Dyke (Bigote + Perilla)" },
  { id: "mutton_chops", label: "Patillas largas (Mutton Chops)" },
  { id: "beard", label: "Barba media recortada" },
  { id: "full_beard", label: "Barba completa tupida" },
  { id: "wizard_beard", label: "Barba larga de sabio / mago" },
];

const OUTFIT_STYLES: { id: OutfitStyle; label: string }[] = [
  { id: "classic", label: "Clásico / Por rol" },
  { id: "hoodie", label: "Sudadera Hoodie" },
  { id: "turtleneck", label: "Cuello de tortuga" },
  { id: "sweater", label: "Suéter tejido" },
  { id: "suit", label: "Traje / Saco formal" },
  { id: "trench_coat", label: "Gabardina / Abrigo largo" },
  { id: "leather_jacket", label: "Chaqueta de cuero" },
  { id: "denim_jacket", label: "Chaqueta de mezclilla" },
  { id: "sport_jersey", label: "Camiseta deportiva" },
  { id: "kimono", label: "Kimono tradicional" },
  { id: "toga", label: "Toga grecorromana" },
  { id: "medieval_tunic", label: "Túnica medieval" },
];

const PANTS_STYLES: { id: PantsStyle; label: string }[] = [
  { id: "trousers", label: "Pantalón vestir" },
  { id: "jeans", label: "Jeans" },
  { id: "shorts", label: "Shorts" },
  { id: "cargo", label: "Pantalón cargo" },
  { id: "pleated_skirt", label: "Falda plisada" },
  { id: "pencil_skirt", label: "Falda tubo" },
];

const SHIRT_PATTERNS: { id: "solid" | "stripes" | "pinstripe" | "checks" | "dots" | "plaid" | "colorblock"; label: string }[] = [
  { id: "solid", label: "Liso" },
  { id: "stripes", label: "Rayas horizontales" },
  { id: "pinstripe", label: "Raya diplomática" },
  { id: "checks", label: "Cuadros" },
  { id: "plaid", label: "Tartán / Escocés" },
  { id: "dots", label: "Lunares" },
  { id: "colorblock", label: "Franja colorblock" },
];

const GLASSES_LIST: GlassesStyle[] = [
  "none", "classic", "round", "cat_eye", "sunglasses", "monocle", "eyepatch",
];

const FACE_SHAPES: FaceShape[] = ["soft", "round", "square", "long", "heart"];
const EYE_STYLES: EyeStyle[] = ["open", "almond", "round"];
const RENDER_STYLES: { id: CharacterRenderStyle; label: string }[] = [
  { id: "auto", label: "Auto (heredar estilo del proyecto)" },
  { id: "editorial", label: "Storia Editorial (Anatómico)" },
  { id: "classic_dark", label: "A1 Classic Stickman (Línea blanca)" },
  { id: "classic_light", label: "A1 Classic Stickman (Línea negra)" },
  { id: "modern_beanie", label: "A2 Modern Pop (Gorro rojo + amarilla)" },
  { id: "handdrawn", label: "B1/B2/B5 Hand-Drawn Stickman" },
  { id: "retro_tv", label: "B3 Retro TV (Blanco redondeado)" },
  { id: "thriller", label: "B4 Survival Thriller (Guantes blancos)" },
  { id: "rubber_hose", label: "A7 Rubber Hose 1930s (Elástico)" },
  { id: "meme", label: "B6 Meme Story (Trazo grueso)" },
  { id: "pixel_theater", label: "B7 Pixel Theater (16-bit)" },
  { id: "greek_mythology", label: "B8 Greek Mythology (Cel-shaded)" },
];
const ROLE_PRESET_LIST = Object.values(CHARACTER_ROLE_PRESETS);

const FRAMINGS: CameraFraming[] = [
  "default", "establishing", "wide", "medium", "closeup", "extreme_closeup", "low_angle", "over_shoulder",
];

const TRANSITIONS: TransitionType[] = [
  "cut", "fade", "dissolve", "fade_white", "flash", "snap_zoom", "zoom_through", "zoom_pupil",
  "zoom_rotate", "spin_left", "spin_right",
  "whip_left", "whip_right", "whip_up", "whip_down", "slide_left", "slide_right", "slide_up", "slide_down",
  "wipe_left", "wipe_right", "wipe_up", "wipe_down", "liquid_wipe", "iris", "diamond_iris", "clock_wipe",
  "blinds_h", "blinds_v", "split_h", "split_v", "curtain_open", "shutter_blink",
  "glitch", "rgb_split", "light_leak", "film_burn", "match_cut", "morph", "pixelate",
];

const EASINGS: EasingType[] = [
  "linear",
  "easeIn",
  "easeOut",
  "easeInOut",
  "easeOutCubic",
  "easeInOutCubic",
  "easeOutBack",
  "spring",
  "springSmooth",
  "springSnappy",
  "springBouncy",
  "springHeavy",
  "step",
];

const SHAPE_KINDS: { id: ShapeKind; label: string }[] = [
  { id: "rounded_rect", label: "Rectángulo redondeado" },
  { id: "rect", label: "Rectángulo" },
  { id: "circle", label: "Círculo" },
  { id: "ring", label: "Aro / Anillo" },
  { id: "line", label: "Línea / Subrayado" },
  { id: "arrow", label: "Flecha explicativa" },
  { id: "callout", label: "Globo de diálogo (Callout)" },
  { id: "pie", label: "Gráfico Circular (Pie)" },
  { id: "star", label: "Estrella" },
  { id: "spark", label: "Destello (Spark)" },
  { id: "triangle", label: "Triángulo" },
  { id: "polygon", label: "Polígono (N lados)" },
  { id: "heart", label: "Corazón" },
];

const ENTER_ANIMS: LayerEnterAnim[] = [
  "none", "fade", "pop", "slide_up", "slide_down", "slide_left", "slide_right", "zoom_in", "zoom_out",
  "slam", "elastic", "glitch", "bounce_in", "drop_in", "flip_x", "flip_y", "spin_in", "swing_in",
  "squeeze_in", "rubber_band", "zoom_punch", "whip_left", "whip_right", "whip_up", "whip_down",
  "blur_in", "stamp", "tilt_pop", "unfold_x", "unfold_y", "rise_spring", "spiral_in",
];
const EXIT_ANIMS: LayerExitAnim[] = [
  "none", "fade", "pop", "slide_up", "slide_down", "slide_left", "slide_right", "zoom_out", "zoom_in",
  "slam_out", "bounce_out", "flip_x", "flip_y", "spin_out", "whip_left", "whip_right", "blur_out",
  "glitch_out", "drop_out", "shrink_spin",
];
const LOOP_MOTIONS: LayerLoopMotion[] = [
  "none", "float", "breathe", "bounce", "wiggle", "spin", "pulse", "shake", "ken_burns",
  "pendulum", "orbit", "jitter", "heartbeat", "sway_x", "sway_y", "flicker",
  "zoom_breathe", "tilt_rock", "hover_drift", "rubber_pulse",
];

const PROCEDURAL_SETS = [
  "living_room", "dining_family", "childhood_room", "city_crosswalk", "memory_corridor",
  "sunset_hill", "observatory", "cafe", "park", "street", "studio", "library", "hospital", "forest",
] as const;

const DEFAULT_COLOR_ADJUST: LayerColorAdjust = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

const DEFAULT_MOTION: LayerMotion = {
  enter: "none",
  enterDuration: 0.35,
  exit: "none",
  exitDuration: 0.25,
  loop: "none",
  loopAmplitude: 0.5,
  loopSpeed: 1.2,
};

const ColorAdjustSection: React.FC<{
  value?: LayerColorAdjust;
  onChange: (next: LayerColorAdjust) => void;
}> = ({ value, onChange }) => {
  const adj = { ...DEFAULT_COLOR_ADJUST, ...(value ?? {}) };
  const set = (patch: Partial<LayerColorAdjust>) => onChange({ ...adj, ...patch });

  return (
    <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
          Ajustes de Imagen y Color
        </span>
        <button
          className="text-[9.5px] hover:underline cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          onClick={() => onChange(DEFAULT_COLOR_ADJUST)}
        >
          Restablecer
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Brillo ({Math.round(adj.brightness * 100)}%)
          <input type="range" min={0.3} max={2.0} step={0.05} value={adj.brightness} onChange={(e) => set({ brightness: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Contraste ({Math.round(adj.contrast * 100)}%)
          <input type="range" min={0.3} max={2.0} step={0.05} value={adj.contrast} onChange={(e) => set({ contrast: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Saturación ({Math.round(adj.saturation * 100)}%)
          <input type="range" min={0} max={2.2} step={0.05} value={adj.saturation} onChange={(e) => set({ saturation: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Matiz ({adj.hue}°)
          <input type="range" min={-180} max={180} step={5} value={adj.hue} onChange={(e) => set({ hue: Number(e.target.value) })} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Desenfoque ({adj.blur.toFixed(1)}px)
          <input type="range" min={0} max={24} step={0.5} value={adj.blur} onChange={(e) => set({ blur: Number(e.target.value) })} />
        </label>
        <div className="flex items-center gap-2.5 text-[10px] pt-3">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={adj.grayscale > 0.5} onChange={(e) => set({ grayscale: e.target.checked ? 1 : 0 })} />
            B&amp;N
          </label>
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={adj.sepia > 0.5} onChange={(e) => set({ sepia: e.target.checked ? 1 : 0 })} />
            Sepia
          </label>
        </div>
      </div>
    </div>
  );
};

const MotionSection: React.FC<{
  value?: LayerMotion;
  onChange: (next: LayerMotion) => void;
}> = ({ value, onChange }) => {
  const m = { ...DEFAULT_MOTION, ...(value ?? {}) };
  const set = (patch: Partial<LayerMotion>) => onChange({ ...m, ...patch });

  return (
    <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
        Animación y Movimiento
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Entrada
          <select className="studio-input" value={m.enter} onChange={(e) => set({ enter: e.target.value as LayerEnterAnim })}>
            {ENTER_ANIMS.map((a) => (
              <option key={a} value={a} style={{ background: "#14161c", color: "#f3f4f6" }}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Salida
          <select className="studio-input" value={m.exit} onChange={(e) => set({ exit: e.target.value as LayerExitAnim })}>
            {EXIT_ANIMS.map((a) => (
              <option key={a} value={a} style={{ background: "#14161c", color: "#f3f4f6" }}>{a}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Movimiento continuo
          <select className="studio-input" value={m.loop} onChange={(e) => set({ loop: e.target.value as LayerLoopMotion })}>
            {LOOP_MOTIONS.map((a) => (
              <option key={a} value={a} style={{ background: "#14161c", color: "#f3f4f6" }}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Velocidad ({m.loopSpeed.toFixed(1)}×)
          <input type="range" min={0.2} max={4} step={0.1} value={m.loopSpeed} onChange={(e) => set({ loopSpeed: Number(e.target.value) })} />
        </label>
      </div>
      {m.loop !== "none" && (
        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          Amplitud ({Math.round(m.loopAmplitude * 100)}%)
          <input type="range" min={0.05} max={2} step={0.05} value={m.loopAmplitude} onChange={(e) => set({ loopAmplitude: Number(e.target.value) })} />
        </label>
      )}
    </div>
  );
};

export interface InspectorProps {
  embedded?: boolean;
}

export const Inspector: React.FC<InspectorProps> = ({ embedded = false }) => {
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const selectedEffectClipId = useStudioStore((s) => s.selectedEffectClipId);
  const selectedAudioClip = useStudioStore((s) => s.selectedAudioClip);
  const receipts = useStudioStore((s) => s.receipts);

  const selectLayer = useStudioStore((s) => s.selectLayer);
  const selectEffectClip = useStudioStore((s) => s.selectEffectClip);
  const selectAudioClip = useStudioStore((s) => s.selectAudioClip);
  const openReplaceModal = useStudioStore((s) => s.openReplaceModal);
  const openSvgEditor = useStudioStore((s) => s.openSvgEditor);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const restoreSnapshot = useStudioStore((s) => s.restoreSnapshot);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const splitAudioClipAtPlayhead = useStudioStore((s) => s.splitAudioClipAtPlayhead);
  const applyAutoDucking = useStudioStore((s) => s.applyAutoDucking);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [tab, setTab] = useState<"properties" | "receipts">("properties");
  const [kfEasing, setKfEasing] = useState<EasingType>("easeInOut");
  const [linkAdjacentTransitions, setLinkAdjacentTransitions] = useState(true);

  const resolved = resolveSceneAtTime(project, currentTime);
  const scene = resolved?.scene ?? project.scenes[0]!;
  const sceneIndex = project.scenes.findIndex((s) => s.id === scene.id);
  const prevScene = sceneIndex > 0 ? project.scenes[sceneIndex - 1] : undefined;
  const nextScene =
    sceneIndex >= 0 && sceneIndex < project.scenes.length - 1
      ? project.scenes[sceneIndex + 1]
      : undefined;
  const localTime = resolved?.localTime ?? 0;
  const layer = scene.layers.find((l) => l.id === selectedLayerId) ?? null;
  const effectClip = (project.effectClips ?? []).find((e) => e.id === selectedEffectClipId) ?? null;
  const audioTrack = selectedAudioClip
    ? project.audioTracks.find((t) => t.id === selectedAudioClip.trackId) ?? null
    : null;
  const audioClip =
    audioTrack && selectedAudioClip
      ? audioTrack.clips.find((c) => c.id === selectedAudioClip.clipId) ?? null
      : null;

  const localFonts = project.assets.filter((a) => a.kind === "font");

  // Build real visual preview subject for CapCut-style Filter & Animation preview grids
  const layerPreviewContext: LayerPreviewContext | undefined = layer
    ? (() => {
        if (layer.type === "sprite") {
          const a = layer.assetId ? project.assets.find((x) => x.id === layer.assetId) : undefined;
          return { kind: "image", imageSrc: a?.src, label: layer.name };
        }
        if (layer.type === "pip") {
          const a = layer.assetId ? project.assets.find((x) => x.id === layer.assetId) : undefined;
          return { kind: "image", imageSrc: a?.src, label: layer.name };
        }
        if (layer.type === "background") {
          const a =
            layer.sourceType === "asset" && layer.assetId
              ? project.assets.find((x) => x.id === layer.assetId)
              : undefined;
          return {
            kind: "background",
            imageSrc: a?.src,
            bgGradient: [layer.gradientTop ?? "#1a2036", layer.gradientBottom ?? "#0a0d16"],
            label: layer.name,
          };
        }
        if (layer.type === "character") {
          const a = layer.customSpriteAssetId
            ? project.assets.find((x) => x.id === layer.customSpriteAssetId)
            : undefined;
          return { kind: "character", imageSrc: a?.src, label: layer.name };
        }
        if (layer.type === "text") {
          return {
            kind: "text",
            text: layer.text,
            fontFamily: layer.fontFamily,
            color: layer.color,
            accentColor: layer.accentColor,
            label: layer.name,
          };
        }
        if (layer.type === "shape") {
          return {
            kind: "shape",
            color: layer.fillColor ?? "#4ce6c8",
            accentColor: layer.strokeColor ?? "#ffffff",
            label: layer.name,
          };
        }
        return undefined;
      })()
    : undefined;

  const updateLayer = (patch: Record<string, unknown>) => {
    if (!layer) return;
    dispatchOps([{ op: "layer.update", sceneId: scene.id, layerId: layer.id, patch }]);
  };

  const addKeyframe = (property: AnimatableProperty, value: number, targetLayerId?: string) => {
    dispatchOps([
      {
        op: "keyframe.upsert",
        sceneId: scene.id,
        layerId: targetLayerId,
        property,
        keyframe: { t: Number(localTime.toFixed(2)), value, easing: kfEasing },
      },
    ]);
  };

  const runAudioTool = async (
    action: "transcribe" | "denoise" | "voice_enhance" | "normalize" | "trim_silence",
  ) => {
    if (!audioTrack || !audioClip) return;
    setBusyNotice(action === "transcribe" ? "Transcribiendo audio con Whisper IA local…" : `Procesando audio (${action})…`);
    try {
      if (action === "transcribe") {
        const res = await studioApi.transcribeAudioClip(project.id, {
          trackId: audioTrack.id,
          clipId: audioClip.id,
          language: project.subtitles.language || "es",
          model: "small",
          replaceExisting: true,
        });
        setProjectFromRemote(res.project, res.receipt);
        setActiveLeftTab("subtitles");
        setBusyNotice(`Subtítulos generados: ${res.cuesCount} bloques (${res.language})`);
      } else {
        const res = await studioApi.processAudioClip(project.id, {
          trackId: audioTrack.id,
          clipId: audioClip.id,
          action,
        });
        setProjectFromRemote(res.project, res.receipt);
        void audioEngine.loadAssetAudio(res.asset);
        setBusyNotice(`Audio procesado: ${res.asset.name}`);
      }
      window.setTimeout(() => setBusyNotice(null), 3000);
    } catch (err) {
      setBusyNotice(null);
      useStudioStore.setState({ lastError: err instanceof Error ? err.message : String(err) });
    }
  };

  const Wrapper = embedded ? "div" : "aside";

  return (
    <Wrapper
      className={
        embedded
          ? "flex-1 min-h-0 flex flex-col overflow-hidden"
          : "w-[310px] shrink-0 glass-panel rounded-2xl flex flex-col overflow-hidden"
      }
    >
      {/* Header tabs */}
      <div className="flex items-center border-b px-2 py-1.5 gap-1" style={{ borderColor: "var(--border-subtle)" }}>
        <button
          onClick={() => setTab("properties")}
          className={`studio-btn flex-1 !py-1.5 !text-[11px] ${tab === "properties" ? "studio-btn-active" : ""}`}
        >
          <Layers size={13} /> Inspector
        </button>
        <button
          onClick={() => setTab("receipts")}
          className={`studio-btn flex-1 !py-1.5 !text-[11px] ${tab === "receipts" ? "studio-btn-active" : ""}`}
        >
          <History size={13} /> Recibos ({receipts.length})
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {tab === "receipts" ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Historial auditable de ediciones (UI + MCP) con restauración de snapshots.
            </div>
            {receipts.length === 0 ? (
              <div className="text-[11px] p-3 rounded-xl text-center" style={{ background: "var(--glass-hover)", color: "var(--text-muted)" }}>
                Aún no hay ediciones registradas en esta sesión.
              </div>
            ) : (
              receipts.map((r) => (
                <div
                  key={r.receiptId}
                  className="rounded-xl p-2.5 flex flex-col gap-1"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between text-[10px]">
                    <span
                      className="px-1.5 py-0.5 rounded font-semibold uppercase"
                      style={{
                        background: r.source === "mcp" ? "rgba(76,230,200,0.18)" : "var(--glass-active)",
                        color: r.source === "mcp" ? "var(--accent-teal)" : "var(--accent-primary)",
                      }}
                    >
                      {r.source}
                    </span>
                    <span className="font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {new Date(r.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium truncate">{r.summary}</div>
                  {r.snapshotId && (
                    <button
                      className="studio-btn !py-1 !px-2 !text-[10px] self-start mt-0.5"
                      onClick={() => void restoreSnapshot(r.snapshotId!)}
                    >
                      <RotateCcw size={11} /> Restaurar estado previo
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : effectClip ? (
          /* ================= EFFECT CLIP INSPECTOR ================= */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
                <Sparkles size={13} /> Efecto Temporal
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="studio-btn !p-1"
                  onClick={() => dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, enabled: !effectClip.enabled } }])}
                >
                  {effectClip.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  className="studio-btn !p-1"
                  onClick={() => {
                    dispatchOps([{ op: "effectClip.remove", effectClipId: effectClip.id }]);
                    selectEffectClip(null);
                  }}
                >
                  <Trash2 size={13} style={{ color: "var(--accent-danger)" }} />
                </button>
              </div>
            </div>

            <label className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              Tipo de efecto
              <select
                className="studio-input"
                value={effectClip.effectType}
                onChange={(e) => {
                  const found = EFFECT_CATALOG.find((x) => x.type === e.target.value);
                  dispatchOps([
                    {
                      op: "effectClip.upsert",
                      effectClip: {
                        ...effectClip,
                        effectType: e.target.value as typeof effectClip.effectType,
                        name: found?.label ?? effectClip.name,
                        category: found?.category ?? effectClip.category,
                      },
                    },
                  ]);
                }}
              >
                {EFFECT_CATALOG.map((item) => (
                  <option key={item.type} value={item.type} style={{ background: "#14161c", color: "#f3f4f6" }}>
                    {item.label} ({item.category})
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Inicio (s)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className="studio-input font-mono-code"
                  value={effectClip.start}
                  onChange={(e) =>
                    dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, start: Math.max(0, Number(e.target.value)) } }])
                  }
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Duración (s)
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="studio-input font-mono-code"
                  value={effectClip.duration}
                  onChange={(e) =>
                    dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, duration: Math.max(0.1, Number(e.target.value)) } }])
                  }
                />
              </label>
            </div>

            <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Intensidad ({Math.round(effectClip.intensity * 100)}%)
                <input
                  type="range"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={effectClip.intensity}
                  onChange={(e) =>
                    dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, intensity: Number(e.target.value) } }])
                  }
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Velocidad ({effectClip.speed.toFixed(1)}×)
                <input
                  type="range"
                  min={0.2}
                  max={5}
                  step={0.1}
                  value={effectClip.speed}
                  onChange={(e) =>
                    dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, speed: Number(e.target.value) } }])
                  }
                />
              </label>
              <div className="grid grid-cols-3 gap-1.5 items-end">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Fade In
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.05}
                    className="studio-input font-mono-code"
                    value={effectClip.fadeIn}
                    onChange={(e) =>
                      dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, fadeIn: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Fade Out
                  <input
                    type="number"
                    min={0}
                    max={3}
                    step={0.05}
                    className="studio-input font-mono-code"
                    value={effectClip.fadeOut}
                    onChange={(e) =>
                      dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, fadeOut: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Color
                  <input
                    type="color"
                    className="w-full h-7 rounded cursor-pointer border-0 bg-transparent"
                    value={effectClip.color.slice(0, 7)}
                    onChange={(e) =>
                      dispatchOps([{ op: "effectClip.upsert", effectClip: { ...effectClip, color: e.target.value } }])
                    }
                  />
                </label>
              </div>
            </div>

            <button className="studio-btn !text-[11px] self-start" onClick={() => selectEffectClip(null)}>
              ← Volver a escena
            </button>
          </div>
        ) : audioTrack && audioClip ? (
          /* ================= AUDIO CLIP INSPECTOR ================= */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-teal)" }}>
                <Music size={13} /> Clip de Audio
              </div>
              <button
                className="studio-btn !p-1"
                onClick={() => {
                  dispatchOps([{ op: "audioClip.remove", trackId: audioTrack.id, clipId: audioClip.id }]);
                  selectAudioClip(null);
                }}
                title="Eliminar clip"
              >
                <Trash2 size={13} style={{ color: "var(--accent-danger)" }} />
              </button>
            </div>

            <input
              className="studio-input font-medium"
              value={audioClip.name}
              onChange={(e) =>
                dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, name: e.target.value || audioClip.name } }])
              }
            />

            <button
              className="studio-btn studio-btn-accent !py-1.5 !text-[11px] w-full"
              onClick={() => openReplaceModal({ kind: "audio", trackId: audioTrack.id, clipId: audioClip.id })}
            >
              <RefreshCw size={12} /> Reemplazar audio (librería / importar)…
            </button>

            {/* Quick AI & DSP Tools right in the Inspector */}
            <div className="rounded-xl p-2.5 flex flex-col gap-1.5" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Herramientas IA y Limpieza
              </div>
              <button className="studio-btn studio-btn-accent justify-start !py-1.5 !text-[11px]" onClick={() => void runAudioTool("transcribe")}>
                <Captions size={13} /> Detectar y generar subtítulos (Whisper)
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button className="studio-btn justify-start !py-1 !text-[10.5px] border" style={{ borderColor: "var(--border-subtle)" }} onClick={() => void runAudioTool("voice_enhance")}>
                  <Wand2 size={11} /> Mejorar voz
                </button>
                <button className="studio-btn justify-start !py-1 !text-[10.5px] border" style={{ borderColor: "var(--border-subtle)" }} onClick={() => void runAudioTool("denoise")}>
                  <Sparkles size={11} /> Quitar ruido
                </button>
                <button className="studio-btn justify-start !py-1 !text-[10.5px] border" style={{ borderColor: "var(--border-subtle)" }} onClick={() => void runAudioTool("normalize")}>
                  <Gauge size={11} /> -16 LUFS
                </button>
                <button className="studio-btn justify-start !py-1 !text-[10.5px] border" style={{ borderColor: "var(--border-subtle)" }} onClick={() => void runAudioTool("trim_silence")}>
                  <Scissors size={11} /> Sin silencios
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  className="studio-btn justify-start !py-1 !text-[10.5px] border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() => {
                    applyAutoDucking(audioTrack.id);
                    setBusyNotice("Auto-ducking (-8 dB) aplicado a música bajo esta pista.");
                    window.setTimeout(() => setBusyNotice(null), 2400);
                  }}
                >
                  <Volume2 size={11} /> Auto-ducking
                </button>
                <button
                  className="studio-btn justify-start !py-1 !text-[10.5px] border"
                  style={{ borderColor: "var(--border-subtle)" }}
                  onClick={() => splitAudioClipAtPlayhead(audioTrack.id, audioClip.id)}
                >
                  <Scissors size={11} /> Dividir aquí
                </button>
              </div>
            </div>

            {/* Volume, Pan, Timing, Fades */}
            <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Ganancia ({audioClip.gainDb.toFixed(1)} dB)
                  <input
                    type="range"
                    min={-30}
                    max={12}
                    step={0.5}
                    value={audioClip.gainDb}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, gainDb: Number(e.target.value) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Paneo ({audioClip.pan.toFixed(2)})
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={audioClip.pan}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, pan: Number(e.target.value) } }])
                    }
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Inicio (s)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="studio-input font-mono-code"
                    value={audioClip.start}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, start: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Duración (s)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    className="studio-input font-mono-code"
                    value={audioClip.duration}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, duration: Math.max(0.1, Number(e.target.value)) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Fade In ({audioClip.fadeIn.toFixed(2)}s)
                  <input
                    type="range"
                    min={0}
                    max={Math.min(10, Math.max(1, audioClip.duration * 0.9))}
                    step={0.05}
                    value={audioClip.fadeIn}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, fadeIn: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.05}
                    className="studio-input font-mono-code !py-0.5"
                    value={audioClip.fadeIn}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, fadeIn: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Fade Out ({audioClip.fadeOut.toFixed(2)}s)
                  <input
                    type="range"
                    min={0}
                    max={Math.min(10, Math.max(1, audioClip.duration * 0.9))}
                    step={0.05}
                    value={audioClip.fadeOut}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, fadeOut: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    max={30}
                    step={0.05}
                    className="studio-input font-mono-code !py-0.5"
                    value={audioClip.fadeOut}
                    onChange={(e) =>
                      dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, fadeOut: Math.max(0, Number(e.target.value)) } }])
                    }
                  />
                </label>
              </div>
              <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                Curva de Fade In / Out
                <select
                  className="studio-input"
                  value={audioClip.fadeCurve ?? "smooth"}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "audioClip.upsert",
                        trackId: audioTrack.id,
                        clip: { ...audioClip, fadeCurve: e.target.value as AudioFadeCurve },
                      },
                    ])
                  }
                >
                  <option value="smooth" style={{ background: "#14161c", color: "#f3f4f6" }}>Suave (S-Curve)</option>
                  <option value="linear" style={{ background: "#14161c", color: "#f3f4f6" }}>Lineal</option>
                  <option value="exp" style={{ background: "#14161c", color: "#f3f4f6" }}>Exponencial</option>
                  <option value="log" style={{ background: "#14161c", color: "#f3f4f6" }}>Logarítmica</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioClip.loop}
                  onChange={(e) =>
                    dispatchOps([{ op: "audioClip.upsert", trackId: audioTrack.id, clip: { ...audioClip, loop: e.target.checked } }])
                  }
                />
                Repetir en bucle (loop)
              </label>
            </div>

            <button className="studio-btn !text-[11px] self-start" onClick={() => selectAudioClip(null)}>
              ← Volver a escena
            </button>
          </div>
        ) : !layer ? (
          /* ================= SCENE & CAMERA INSPECTOR ================= */
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
              <Camera size={13} /> Escena y Cámara
            </div>

            <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
              Nombre de escena
              <input
                className="studio-input"
                value={scene.name}
                onChange={(e) =>
                  dispatchOps([{ op: "scene.update", sceneId: scene.id, patch: { name: e.target.value || scene.name } }])
                }
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Duración (s)
                <input
                  type="number"
                  step={0.25}
                  min={0.5}
                  max={600}
                  className="studio-input font-mono-code"
                  value={scene.duration}
                  onChange={(e) => {
                    const duration = Math.max(0.5, Number(e.target.value));
                    dispatchOps([{ op: "scene.update", sceneId: scene.id, patch: { duration } }]);
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Encuadre
                <select
                  className="studio-input"
                  value={scene.camera.framing}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "scene.update",
                        sceneId: scene.id,
                        patch: { camera: { ...scene.camera, framing: e.target.value as CameraFraming } },
                      },
                    ])
                  }
                >
                  {FRAMINGS.map((f) => (
                    <option key={f} value={f} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Camera Zoom + Keyframe */}
            <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between text-[11px]">
                <span style={{ color: "var(--text-secondary)" }}>Zoom cámara ({scene.camera.zoom.toFixed(2)}×)</span>
                <button
                  className="studio-btn !p-1"
                  title={`Añadir keyframe de zoom en ${localTime.toFixed(2)}s`}
                  onClick={() => addKeyframe("cameraZoom", scene.camera.zoom)}
                >
                  <Diamond size={12} style={{ color: "var(--accent-gold)" }} />
                </button>
              </div>
              <input
                type="range"
                min={0.5}
                max={2.5}
                step={0.02}
                value={scene.camera.zoom}
                onChange={(e) =>
                  dispatchOps([
                    {
                      op: "scene.update",
                      sceneId: scene.id,
                      patch: { camera: { ...scene.camera, zoom: Number(e.target.value) } },
                    },
                  ])
                }
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Dutch Tilt ({scene.camera.rotation}°)
                  <input
                    type="range"
                    min={-15}
                    max={15}
                    step={0.5}
                    value={scene.camera.rotation}
                    onChange={(e) =>
                      dispatchOps([
                        {
                          op: "scene.update",
                          sceneId: scene.id,
                          patch: { camera: { ...scene.camera, rotation: Number(e.target.value) } },
                        },
                      ])
                    }
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Paralaje ({scene.camera.parallaxStrength.toFixed(1)})
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={scene.camera.parallaxStrength}
                    onChange={(e) =>
                      dispatchOps([
                        {
                          op: "scene.update",
                          sceneId: scene.id,
                          patch: { camera: { ...scene.camera, parallaxStrength: Number(e.target.value) } },
                        },
                      ])
                    }
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-[11px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={scene.camera.handheld.enabled}
                  onChange={(e) =>
                    dispatchOps([
                      {
                        op: "scene.update",
                        sceneId: scene.id,
                        patch: {
                          camera: {
                            ...scene.camera,
                            handheld: { ...scene.camera.handheld, enabled: e.target.checked },
                          },
                        },
                      },
                    ])
                  }
                />
                Cámara en mano orgánica (handheld)
              </label>
            </div>

            {/* Transitions */}
            <div
              className="rounded-xl p-2.5 flex flex-col gap-2"
              style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-[10.5px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Transiciones
                </span>
                <button
                  type="button"
                  onClick={() => setLinkAdjacentTransitions((v) => !v)}
                  className={`studio-btn !py-0.5 !px-2 !text-[10px] ${
                    linkAdjacentTransitions ? "studio-btn-accent" : ""
                  }`}
                  title={
                    linkAdjacentTransitions
                      ? "Enlazado: al cambiar Entrada/Salida se sincroniza también con la escena adyacente"
                      : "Independiente: cambia solo esta escena sin modificar escenas adyacentes"
                  }
                >
                  {linkAdjacentTransitions ? <Link2 size={11} /> : <Unlink2 size={11} />}
                  {linkAdjacentTransitions ? "Enlazadas" : "Independientes"}
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <VisualTransitionPicker
                  label="Entrada"
                  badgeText={prevScene ? (linkAdjacentTransitions ? "⇄ ant." : "solo esta") : "intro"}
                  value={scene.transitionIn.type}
                  accentColor={scene.transitionIn.accentColor}
                  onChange={(nextType) => {
                    const nextDur = nextType === "cut" ? 0 : Math.max(0.3, scene.transitionIn.duration || 0.4);
                    const nextIn = {
                      ...scene.transitionIn,
                      type: nextType,
                      duration: nextDur,
                    };
                    const ops: ProjectOperation[] = [];
                    if (linkAdjacentTransitions && prevScene) {
                      ops.push({
                        op: "scene.update",
                        sceneId: prevScene.id,
                        patch: {
                          transitionOut: {
                            ...prevScene.transitionOut,
                            type: nextType,
                            duration: nextDur,
                            ...(nextIn.accentColor ? { accentColor: nextIn.accentColor } : {}),
                          },
                        },
                      });
                    }
                    ops.push({
                      op: "scene.update",
                      sceneId: scene.id,
                      patch: { transitionIn: nextIn },
                    });
                    dispatchOps(ops);
                  }}
                />

                <VisualTransitionPicker
                  label="Salida"
                  badgeText={nextScene ? (linkAdjacentTransitions ? "⇄ sig." : "solo esta") : "outro"}
                  value={scene.transitionOut.type}
                  accentColor={scene.transitionOut.accentColor}
                  onChange={(nextType) => {
                    const nextDur = nextType === "cut" ? 0 : Math.max(0.3, scene.transitionOut.duration || 0.4);
                    const nextOut = {
                      ...scene.transitionOut,
                      type: nextType,
                      duration: nextDur,
                    };
                    const ops: ProjectOperation[] = [
                      {
                        op: "scene.update",
                        sceneId: scene.id,
                        patch: { transitionOut: nextOut },
                      },
                    ];
                    if (linkAdjacentTransitions && nextScene) {
                      ops.push({
                        op: "scene.update",
                        sceneId: nextScene.id,
                        patch: {
                          transitionIn: {
                            ...nextScene.transitionIn,
                            type: nextType,
                            duration: nextDur,
                            ...(nextOut.accentColor ? { accentColor: nextOut.accentColor } : {}),
                          },
                        },
                      });
                    }
                    dispatchOps(ops);
                  }}
                />
              </div>
            </div>

            {/* Scene Layer Stack Quick Picker */}
            <div className="pt-2 border-t flex flex-col gap-1.5" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                Capas de la escena ({scene.layers.length})
              </div>
              {[...scene.layers]
                .sort((a, b) => b.zIndex - a.zIndex)
                .map((l) => (
                  <button
                    key={l.id}
                    onClick={() => selectLayer(l.id)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:opacity-100 opacity-90 cursor-pointer"
                    style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                  >
                    <span className="text-[12px] truncate">{l.name}</span>
                    <span className="text-[10px] font-mono-code uppercase" style={{ color: "var(--text-muted)" }}>
                      {l.type}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          /* ================= SELECTED LAYER INSPECTOR ================= */
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-mono-code uppercase" style={{ background: "var(--glass-active)", color: "var(--accent-primary)" }}>
                  {layer.type}
                </span>
                <input
                  className="studio-input flex-1 min-w-0 font-medium"
                  value={layer.name}
                  onChange={(e) => updateLayer({ name: e.target.value || layer.name })}
                />
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  className="studio-btn !p-1"
                  title={layer.visible ? "Ocultar" : "Mostrar"}
                  onClick={() => updateLayer({ visible: !layer.visible })}
                >
                  {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  className="studio-btn !p-1"
                  title={layer.locked ? "Desbloquear" : "Bloquear"}
                  onClick={() => updateLayer({ locked: !layer.locked })}
                >
                  {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                </button>
                <button
                  className="studio-btn !p-1"
                  title="Eliminar capa"
                  onClick={() => {
                    dispatchOps([{ op: "layer.remove", sceneId: scene.id, layerId: layer.id }]);
                    selectLayer(null);
                  }}
                >
                  <Trash2 size={13} style={{ color: "var(--accent-danger)" }} />
                </button>
              </div>
            </div>

            {(layer.type === "background" || layer.type === "sprite" || layer.type === "character" || layer.type === "pip") && (() => {
              const linkedAssetId =
                layer.type === "character"
                  ? layer.customSpriteAssetId
                  : layer.type === "background"
                    ? (layer.sourceType === "asset" ? layer.assetId : undefined)
                    : layer.assetId;
              const linkedAsset = linkedAssetId ? project.assets.find((a) => a.id === linkedAssetId) : undefined;
              const isEditableSvg = Boolean(
                linkedAsset &&
                (linkedAsset.kind === "svg" ||
                  linkedAsset.mimeType === "image/svg+xml" ||
                  linkedAsset.src.split("?")[0]?.toLowerCase().endsWith(".svg")),
              );

              return (
                <div className="flex flex-col gap-1.5">
                  <button
                    className="studio-btn studio-btn-accent !py-1.5 !text-[11px] w-full"
                    onClick={() => openReplaceModal({ kind: "layer", sceneId: scene.id, layerId: layer.id })}
                  >
                    <RefreshCw size={12} /> Reemplazar {layer.type === "character" ? "personaje / sprite" : layer.type === "background" ? "fondo" : "recurso"}…
                  </button>
                  {isEditableSvg && linkedAsset && (
                    <button
                      className="studio-btn !py-1.5 !text-[11px] w-full justify-center"
                      style={{ borderColor: "rgba(56,189,248,0.45)", color: "#7dd3fc" }}
                      title="Abrir panel lateral para editar el código SVG en tiempo real (manual o por IA MCP)"
                      onClick={() =>
                        openSvgEditor({
                          assetId: linkedAsset.id,
                          sceneId: scene.id,
                          layerId: layer.id,
                        })
                      }
                    >
                      <Code2 size={12} /> Editar código SVG en vivo…
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Transform + Timing + Pivot + Keyframe buttons */}
            <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Transformación · Tiempo
                </span>
                <select
                  className="studio-input !py-0.5 !text-[10px]"
                  value={kfEasing}
                  onChange={(e) => setKfEasing(e.target.value as EasingType)}
                  title="Curva de easing para nuevos keyframes"
                >
                  {EASINGS.map((ez) => (
                    <option key={ez} value={ez} style={{ background: "#14161c", color: "#f3f4f6" }}>
                      {ez}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Inicio en escena (s)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    className="studio-input font-mono-code"
                    value={layer.start}
                    onChange={(e) => updateLayer({ start: Math.max(0, Number(e.target.value)) })}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Duración (vacío = toda)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    placeholder={scene.duration.toFixed(1)}
                    className="studio-input font-mono-code"
                    value={layer.duration ?? ""}
                    onChange={(e) => updateLayer({ duration: e.target.value ? Math.max(0.1, Number(e.target.value)) : undefined })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center justify-between">
                    X ({(layer.transform.x * 100).toFixed(1)}%)
                    <button onClick={() => addKeyframe("x", layer.transform.x, layer.id)} title="Keyframe X">
                      <Diamond size={10} style={{ color: "var(--accent-gold)" }} />
                    </button>
                  </span>
                  <input
                    type="number"
                    step={0.01}
                    className="studio-input font-mono-code"
                    value={layer.transform.x}
                    onChange={(e) => updateLayer({ transform: { x: Number(e.target.value) } })}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center justify-between">
                    Y ({(layer.transform.y * 100).toFixed(1)}%)
                    <button onClick={() => addKeyframe("y", layer.transform.y, layer.id)} title="Keyframe Y">
                      <Diamond size={10} style={{ color: "var(--accent-gold)" }} />
                    </button>
                  </span>
                  <input
                    type="number"
                    step={0.01}
                    className="studio-input font-mono-code"
                    value={layer.transform.y}
                    onChange={(e) => updateLayer({ transform: { y: Number(e.target.value) } })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center justify-between">
                    Escala ({layer.transform.scaleX.toFixed(2)}×)
                    <button
                      onClick={() => {
                        addKeyframe("scaleX", layer.transform.scaleX, layer.id);
                        addKeyframe("scaleY", layer.transform.scaleY, layer.id);
                      }}
                      title="Keyframe Escala"
                    >
                      <Diamond size={10} style={{ color: "var(--accent-gold)" }} />
                    </button>
                  </span>
                  <input
                    type="range"
                    min={0.1}
                    max={3.5}
                    step={0.02}
                    value={layer.transform.scaleX}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      updateLayer({ transform: { scaleX: v, scaleY: v } });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center justify-between">
                    Rotación ({layer.transform.rotation.toFixed(0)}°)
                    <button onClick={() => addKeyframe("rotation", layer.transform.rotation, layer.id)} title="Keyframe Rotación">
                      <Diamond size={10} style={{ color: "var(--accent-gold)" }} />
                    </button>
                  </span>
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    step={1}
                    value={layer.transform.rotation}
                    onChange={(e) => updateLayer({ transform: { rotation: Number(e.target.value) } })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  <span className="flex items-center justify-between">
                    Opacidad ({Math.round(layer.transform.opacity * 100)}%)
                    <button onClick={() => addKeyframe("opacity", layer.transform.opacity, layer.id)} title="Keyframe Opacidad">
                      <Diamond size={10} style={{ color: "var(--accent-gold)" }} />
                    </button>
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={layer.transform.opacity}
                    onChange={(e) => updateLayer({ transform: { opacity: Number(e.target.value) } })}
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Paralaje ({layer.parallaxDepth.toFixed(2)})
                  <input
                    type="range"
                    min={0}
                    max={1.6}
                    step={0.05}
                    value={layer.parallaxDepth}
                    onChange={(e) => updateLayer({ parallaxDepth: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="flex items-center justify-between gap-2 text-[10px]">
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={layer.transform.flipX} onChange={(e) => updateLayer({ transform: { flipX: e.target.checked } })} />
                  Voltear H
                </label>
                <label className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={layer.transform.flipY} onChange={(e) => updateLayer({ transform: { flipY: e.target.checked } })} />
                  Voltear V
                </label>
                <label className="flex items-center gap-1">
                  Z:
                  <input
                    type="number"
                    className="studio-input font-mono-code w-12 !py-0.5"
                    value={layer.zIndex}
                    onChange={(e) => updateLayer({ zIndex: Math.round(Number(e.target.value)) })}
                  />
                </label>
              </div>
            </div>

            {/* Layer-type-specific rich controls */}
            {layer.type === "character" && (() => {
              const charDef = project.cast.find((c) => c.id === layer.characterId);
              return (
                <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Actuación, Rig 2D y Vestimenta por Rol
                  </div>
                  <CharacterVisualStudioPanel
                    pose={layer.pose}
                    expression={layer.expression}
                    renderStyle={charDef?.renderStyle ?? "auto"}
                    palette={charDef?.palette}
                    onChangePose={(pose) => updateLayer({ pose })}
                    onChangeExpression={(expression) => updateLayer({ expression })}
                    onChangeRenderStyle={
                      charDef
                        ? (renderStyle) =>
                            dispatchOps([
                              {
                                op: "character.upsert",
                                character: {
                                  ...charDef,
                                  renderStyle,
                                },
                              },
                            ])
                        : undefined
                    }
                  />

                  {charDef && (
                    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ background: "rgba(0,0,0,0.22)", border: "1px solid var(--border-subtle)" }}>
                      <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--accent-primary)" }}>
                        Vestimenta automática por Rol (24 roles)
                        <select
                          className="studio-input"
                          value={charDef.role}
                          onChange={(e) => {
                            const updated = applyRolePresetToCharacter(charDef, e.target.value);
                            dispatchOps([{ op: "character.upsert", character: updated }]);
                          }}
                        >
                          {ROLE_PRESET_LIST.map((r) => (
                            <option key={r.id} value={r.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <CharacterWardrobeVisualPanel
                        character={charDef}
                        onUpdateCharacter={(updated) =>
                          dispatchOps([{ op: "character.upsert", character: updated }])
                        }
                      />

                      <div className="grid grid-cols-2 gap-1.5">
                        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Género / Silueta
                          <select
                            className="studio-input"
                            value={charDef.genderPresentation}
                            onChange={(e) =>
                              dispatchOps([
                                {
                                  op: "character.upsert",
                                  character: {
                                    ...charDef,
                                    genderPresentation: e.target.value as "neutral" | "masculine" | "feminine",
                                  },
                                },
                              ])
                            }
                          >
                            <option value="masculine" style={{ background: "#14161c", color: "#f3f4f6" }}>Hombre / Masculino</option>
                            <option value="feminine" style={{ background: "#14161c", color: "#f3f4f6" }}>Mujer / Femenino</option>
                            <option value="neutral" style={{ background: "#14161c", color: "#f3f4f6" }}>Neutro</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Pantalón / Falda
                          <select
                            className="studio-input"
                            value={charDef.wardrobe?.pantsStyle ?? "trousers"}
                            onChange={(e) =>
                              dispatchOps([
                                {
                                  op: "character.upsert",
                                  character: {
                                    ...charDef,
                                    wardrobe: {
                                      ...(charDef.wardrobe ?? {}),
                                      pantsStyle: e.target.value as PantsStyle,
                                      skirt: e.target.value === "pleated_skirt" || e.target.value === "pencil_skirt",
                                    } as typeof charDef.wardrobe,
                                  },
                                },
                              ])
                            }
                          >
                            {PANTS_STYLES.map((ps) => (
                              <option key={ps.id} value={ps.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                                {ps.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Estampado tela
                          <select
                            className="studio-input"
                            value={charDef.wardrobe?.shirtPattern ?? "solid"}
                            onChange={(e) =>
                              dispatchOps([
                                {
                                  op: "character.upsert",
                                  character: {
                                    ...charDef,
                                    wardrobe: {
                                      ...(charDef.wardrobe ?? {}),
                                      shirtPattern: e.target.value as "solid" | "stripes" | "pinstripe" | "checks" | "dots" | "plaid" | "colorblock",
                                    } as typeof charDef.wardrobe,
                                  },
                                },
                              ])
                            }
                          >
                            {SHIRT_PATTERNS.map((sp) => (
                              <option key={sp.id} value={sp.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                                {sp.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Rostro
                          <select
                            className="studio-input"
                            value={charDef.wardrobe?.faceShape ?? "soft"}
                            onChange={(e) =>
                              dispatchOps([
                                {
                                  op: "character.upsert",
                                  character: {
                                    ...charDef,
                                    wardrobe: {
                                      ...(charDef.wardrobe ?? {}),
                                      faceShape: e.target.value as FaceShape,
                                    } as typeof charDef.wardrobe,
                                  },
                                },
                              ])
                            }
                          >
                            {FACE_SHAPES.map((fs) => (
                              <option key={fs} value={fs} style={{ background: "#14161c", color: "#f3f4f6" }}>{fs}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                          Ojos
                          <select
                            className="studio-input"
                            value={charDef.wardrobe?.eyeStyle ?? "open"}
                            onChange={(e) =>
                              dispatchOps([
                                {
                                  op: "character.upsert",
                                  character: {
                                    ...charDef,
                                    wardrobe: {
                                      ...(charDef.wardrobe ?? {}),
                                      eyeStyle: e.target.value as EyeStyle,
                                    } as typeof charDef.wardrobe,
                                  },
                                },
                              ])
                            }
                          >
                            {EYE_STYLES.map((es) => (
                              <option key={es} value={es} style={{ background: "#14161c", color: "#f3f4f6" }}>{es}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="flex flex-col gap-0.5 text-[10px] pt-1" style={{ color: "var(--text-muted)" }}>
                        <div className="flex justify-between">
                          <span>Física secundaria (cabello/capa)</span>
                          <span className="font-mono-code">{Math.round((charDef.wardrobe?.secondaryMotion ?? 1) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={2}
                          step={0.1}
                          value={charDef.wardrobe?.secondaryMotion ?? 1}
                          onChange={(e) =>
                            dispatchOps([
                              {
                                op: "character.upsert",
                                character: {
                                  ...charDef,
                                  wardrobe: {
                                    ...(charDef.wardrobe ?? {}),
                                    secondaryMotion: Number(e.target.value),
                                  } as typeof charDef.wardrobe,
                                },
                              },
                            ])
                          }
                        />
                      </label>
                    </div>
                  )}

                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                    <input type="checkbox" checked={layer.silhouette} onChange={(e) => updateLayer({ silhouette: e.target.checked })} />
                    Modo Silueta / Fantasma
                  </label>
                  {layer.customSpriteAssetId && (
                    <button
                      className="studio-btn !text-[10.5px] !py-1 border"
                      style={{ borderColor: "var(--border-strong)" }}
                      onClick={() => updateLayer({ customSpriteAssetId: undefined })}
                    >
                      <RotateCcw size={11} /> Volver al Rig 2D articulado
                    </button>
                  )}
                  <button
                    className="studio-btn !text-[11px] !py-1"
                    onClick={() =>
                      updateLayer({
                        poseCues: [...layer.poseCues, { t: Number(localTime.toFixed(2)), pose: layer.pose, blendDuration: 0.35 }],
                      })
                    }
                  >
                    <Plus size={12} /> Fijar cue de pose en {localTime.toFixed(2)}s
                  </button>
                </div>
              );
            })()}

            {layer.type === "sprite" && (
              <>
                <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Sprite / Asset Vectorial
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Ancho ({Math.round(layer.widthNorm * 100)}%)
                      <input type="range" min={0.05} max={2.0} step={0.02} value={layer.widthNorm} onChange={(e) => updateLayer({ widthNorm: Number(e.target.value) })} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Muestreo
                      <select className="studio-input" value={layer.scaleMode} onChange={(e) => updateLayer({ scaleMode: e.target.value })}>
                        <option value="linear" style={{ background: "#14161c", color: "#f3f4f6" }}>Suave (HD/SVG)</option>
                        <option value="nearest" style={{ background: "#14161c", color: "#f3f4f6" }}>Nearest (Pixel-Art)</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Flotación ({layer.bobAmplitude.toFixed(3)})
                      <input type="range" min={0} max={0.05} step={0.002} value={layer.bobAmplitude} onChange={(e) => updateLayer({ bobAmplitude: Number(e.target.value) })} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Vel. flotación ({layer.bobSpeed.toFixed(1)})
                      <input type="range" min={0.2} max={5} step={0.1} value={layer.bobSpeed} onChange={(e) => updateLayer({ bobSpeed: Number(e.target.value) })} />
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(layer.shadow?.enabled)}
                        onChange={(e) =>
                          updateLayer({
                            shadow: {
                              color: "#000000",
                              blur: 14,
                              offsetX: 0,
                              offsetY: 10,
                              alpha: 0.55,
                              ...(layer.shadow ?? {}),
                              enabled: e.target.checked,
                            },
                          })
                        }
                      />
                      Sombra proyectada
                    </label>
                    <label className="flex items-center gap-1">
                      Tinte:
                      <input
                        type="color"
                        className="w-6 h-5 rounded cursor-pointer border-0 bg-transparent"
                        value={(layer.tint ?? "#ffffff").slice(0, 7)}
                        onChange={(e) => updateLayer({ tint: e.target.value })}
                      />
                    </label>
                  </div>
                </div>
              </>
            )}

            {layer.type === "text" && (
              <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Texto, Tipografía y Estilo
                </div>
                <input
                  placeholder="Antetítulo (kicker)"
                  className="studio-input"
                  value={layer.kicker ?? ""}
                  onChange={(e) => updateLayer({ kicker: e.target.value || undefined })}
                />
                <textarea
                  rows={2}
                  className="studio-input resize-none"
                  value={layer.text}
                  onChange={(e) => updateLayer({ text: e.target.value || "Texto" })}
                />
                <input
                  placeholder="Subtítulo opcional"
                  className="studio-input"
                  value={layer.subtitle ?? ""}
                  onChange={(e) => updateLayer({ subtitle: e.target.value || undefined })}
                />

                <VisualFontPicker
                  value={layer.fontFamily}
                  localFonts={localFonts}
                  sampleText={layer.text}
                  onSelect={(fam, localAssetId) => {
                    if (!localAssetId) ensureGoogleFontLoaded(fam);
                    updateLayer({ fontFamily: fam });
                  }}
                />

                <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                  Alineación
                  <div className="grid grid-cols-3 gap-1">
                    {([
                      { id: "left", label: "Izquierda" },
                      { id: "center", label: "Centro" },
                      { id: "right", label: "Derecha" },
                    ] as const).map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => updateLayer({ align: a.id })}
                        className={`studio-btn !py-1 !text-[10px] justify-center ${
                          layer.align === a.id ? "studio-btn-active" : ""
                        }`}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                </label>

                <div className="grid grid-cols-3 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Tamaño
                    <input type="number" min={12} max={240} className="studio-input font-mono-code" value={layer.fontSize} onChange={(e) => updateLayer({ fontSize: Math.max(12, Number(e.target.value)) })} />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Contorno
                    <input type="number" min={0} max={24} className="studio-input font-mono-code" value={layer.strokeWidth} onChange={(e) => updateLayer({ strokeWidth: Math.max(0, Number(e.target.value)) })} />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Espaciado
                    <input type="number" min={-5} max={30} className="studio-input font-mono-code" value={layer.letterSpacing ?? 0} onChange={(e) => updateLayer({ letterSpacing: Number(e.target.value) })} />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Color
                    <input type="color" className="w-full h-6 rounded cursor-pointer border-0 bg-transparent" value={layer.color.slice(0, 7)} onChange={(e) => updateLayer({ color: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Acento
                    <input type="color" className="w-full h-6 rounded cursor-pointer border-0 bg-transparent" value={layer.accentColor.slice(0, 7)} onChange={(e) => updateLayer({ accentColor: e.target.value })} />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Borde
                    <input type="color" className="w-full h-6 rounded cursor-pointer border-0 bg-transparent" value={layer.strokeColor.slice(0, 7)} onChange={(e) => updateLayer({ strokeColor: e.target.value })} />
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-[10.5px]">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={Boolean(layer.uppercase)} onChange={(e) => updateLayer({ uppercase: e.target.checked })} />
                    MAYÚS
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={Boolean(layer.italic)} onChange={(e) => updateLayer({ italic: e.target.checked })} />
                    Cursiva
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(layer.backgroundBox?.enabled)}
                      onChange={(e) =>
                        updateLayer({
                          backgroundBox: {
                            color: "#0c101b",
                            opacity: 0.72,
                            paddingX: 24,
                            paddingY: 14,
                            borderRadius: 16,
                            ...(layer.backgroundBox ?? {}),
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Caja fondo
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layer.shadow ? layer.shadow.enabled : true}
                      onChange={(e) =>
                        updateLayer({
                          shadow: {
                            color: "#000000",
                            blur: 12,
                            offsetX: 0,
                            offsetY: 5,
                            alpha: 0.55,
                            ...(layer.shadow ?? {}),
                            enabled: e.target.checked,
                          },
                        })
                      }
                    />
                    Sombra
                  </label>
                </div>
              </div>
            )}

            {layer.type === "shape" && (
              <div
                className="rounded-xl p-2.5 flex flex-col gap-2"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                  Forma Vectorial Procedural (Remotion Shapes & Paths)
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Tipo de forma (13 procedurales)
                  </span>
                  <VisualShapeGrid
                    value={layer.shape}
                    fillColor={layer.fillColor}
                    strokeColor={layer.strokeColor}
                    onChange={(shape) => updateLayer({ shape })}
                  />
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Ancho ({Math.round(layer.widthNorm * 100)}%)
                    <input
                      type="range"
                      min={0.05}
                      max={1.5}
                      step={0.01}
                      value={layer.widthNorm}
                      onChange={(e) => updateLayer({ widthNorm: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Alto ({Math.round(layer.heightNorm * 100)}%)
                    <input
                      type="range"
                      min={0.05}
                      max={1.5}
                      step={0.01}
                      value={layer.heightNorm}
                      onChange={(e) => updateLayer({ heightNorm: Number(e.target.value) })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Color de relleno
                    <input
                      type="color"
                      className="w-full h-7 rounded border-0 bg-transparent cursor-pointer"
                      value={(layer.fillColor ?? "#4ce6c8").slice(0, 7)}
                      onChange={(e) => updateLayer({ fillColor: e.target.value })}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Color de borde
                    <input
                      type="color"
                      className="w-full h-7 rounded border-0 bg-transparent cursor-pointer"
                      value={(layer.strokeColor ?? "#ffffff").slice(0, 7)}
                      onChange={(e) => updateLayer({ strokeColor: e.target.value })}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Grosor borde ({layer.strokeWidth}px)
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={layer.strokeWidth}
                      onChange={(e) => updateLayer({ strokeWidth: Number(e.target.value) })}
                    />
                  </label>
                  {layer.shape === "rounded_rect" && (
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Radio esquina ({layer.borderRadius}px)
                      <input
                        type="range"
                        min={0}
                        max={120}
                        step={2}
                        value={layer.borderRadius}
                        onChange={(e) => updateLayer({ borderRadius: Number(e.target.value) })}
                      />
                    </label>
                  )}
                  {(layer.shape === "pie" || layer.shape === "ring" || layer.shape === "line" || layer.drawOn) && (
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Progreso ({Math.round((layer.progress ?? 1) * 100)}%)
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={layer.progress ?? 1}
                        onChange={(e) => updateLayer({ progress: Number(e.target.value) })}
                      />
                    </label>
                  )}
                </div>

                {(layer.shape === "star" || layer.shape === "polygon" || layer.shape === "spark") && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Puntas / Lados ({layer.points ?? 5})
                      <input
                        type="range"
                        min={3}
                        max={16}
                        step={1}
                        value={layer.points ?? 5}
                        onChange={(e) => updateLayer({ points: Number(e.target.value) })}
                      />
                    </label>
                    {(layer.shape === "star" || layer.shape === "spark") && (
                      <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        Radio interior ({Math.round((layer.innerRadiusRatio ?? 0.45) * 100)}%)
                        <input
                          type="range"
                          min={0.1}
                          max={0.9}
                          step={0.05}
                          value={layer.innerRadiusRatio ?? 0.45}
                          onChange={(e) => updateLayer({ innerRadiusRatio: Number(e.target.value) })}
                        />
                      </label>
                    )}
                  </div>
                )}

                {layer.shape === "arrow" && (
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Tamaño de punta ({Math.round((layer.arrowHeadSize ?? 0.32) * 100)}%)
                    <input
                      type="range"
                      min={0.15}
                      max={0.65}
                      step={0.02}
                      value={layer.arrowHeadSize ?? 0.32}
                      onChange={(e) => updateLayer({ arrowHeadSize: Number(e.target.value) })}
                    />
                  </label>
                )}

                {layer.shape === "callout" && (
                  <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                    Dirección de cola del globo
                    <select
                      className="studio-input"
                      value={layer.tailDirection ?? "bottom"}
                      onChange={(e) => updateLayer({ tailDirection: e.target.value as "left" | "right" | "bottom" })}
                    >
                      <option value="bottom" style={{ background: "#14161c", color: "#f3f4f6" }}>Centro abajo</option>
                      <option value="left" style={{ background: "#14161c", color: "#f3f4f6" }}>Izquierda</option>
                      <option value="right" style={{ background: "#14161c", color: "#f3f4f6" }}>Derecha</option>
                    </select>
                  </label>
                )}

                <label className="flex items-center gap-1.5 text-[11px] cursor-pointer pt-0.5">
                  <input
                    type="checkbox"
                    checked={Boolean(layer.drawOn)}
                    onChange={(e) => updateLayer({ drawOn: e.target.checked })}
                  />
                  Animar dibujado progresivo del trazo (draw-on)
                </label>
              </div>
            )}

            {layer.type === "background" && (
              <>
                <div className="rounded-xl p-2.5 flex flex-col gap-2" style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
                    Fondo de Escena y Atmósfera
                  </div>
                  <select className="studio-input" value={layer.sourceType} onChange={(e) => updateLayer({ sourceType: e.target.value })}>
                    <option value="procedural" style={{ background: "#14161c", color: "#f3f4f6" }}>Escenario Procedimental</option>
                    <option value="gradient" style={{ background: "#14161c", color: "#f3f4f6" }}>Gradiente</option>
                    <option value="solid" style={{ background: "#14161c", color: "#f3f4f6" }}>Color sólido</option>
                    <option value="asset" style={{ background: "#14161c", color: "#f3f4f6" }}>Imagen / SVG</option>
                  </select>
                  {layer.sourceType === "procedural" && (
                    <VisualProceduralSetGrid
                      value={layer.proceduralSet ?? "living_room"}
                      onChange={(proceduralSet) => updateLayer({ proceduralSet })}
                    />
                  )}
                  {layer.sourceType === "solid" && (
                    <input type="color" className="w-full h-7 rounded cursor-pointer border-0 bg-transparent" value={layer.color.slice(0, 7)} onChange={(e) => updateLayer({ color: e.target.value })} />
                  )}
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Oscurecer ({Math.round((layer.dimOverlay ?? 0) * 100)}%)
                      <input type="range" min={0} max={0.85} step={0.05} value={layer.dimOverlay ?? 0} onChange={(e) => updateLayer({ dimOverlay: Number(e.target.value) })} />
                    </label>
                    <label className="flex flex-col gap-0.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Tinte clima ({Math.round((layer.washOpacity ?? 0) * 100)}%)
                      <div className="flex items-center gap-1">
                        <input type="color" className="w-6 h-5 rounded border-0 bg-transparent cursor-pointer" value={(layer.washColor ?? "#1a2036").slice(0, 7)} onChange={(e) => updateLayer({ washColor: e.target.value })} />
                        <input type="range" className="flex-1" min={0} max={0.75} step={0.05} value={layer.washOpacity ?? 0} onChange={(e) => updateLayer({ washOpacity: Number(e.target.value) })} />
                      </div>
                    </label>
                  </div>
                </div>
              </>
            )}

            {/* Shared CapCut-style Visual Filter Grid (27 presets + intensity + fine-tune) for images, sprites, backgrounds, PiP, characters, text & shapes */}
            {layer.type !== "vfx" && (
              <VisualFilterGrid
                value={"colorAdjust" in layer ? layer.colorAdjust : undefined}
                onChange={(colorAdjust) => updateLayer({ colorAdjust })}
                preview={layerPreviewContext}
              />
            )}

            {/* Shared CapCut-style Visual Enter / Exit / Continuous Motion Grid for all non-VFX layers */}
            {layer.type !== "vfx" && (
              <VisualMotionGrid
                value={layer.motion}
                onChange={(motion) => updateLayer({ motion })}
                preview={layerPreviewContext}
              />
            )}

            <button className="studio-btn !text-[11px] self-start" onClick={() => selectLayer(null)}>
              ← Volver a propiedades de escena
            </button>
          </div>
        )}
      </div>
    </Wrapper>
  );
};
