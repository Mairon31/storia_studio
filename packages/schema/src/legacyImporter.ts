import {
  Asset,
  CameraFramingSchema,
  CharacterExpressionSchema,
  CharacterPoseSchema,
  ProceduralSetSchema,
  Project,
  ProjectSchema,
  resolveCanvasDimensions,
  TransitionTypeSchema,
} from "./index.js";
import { SCHEMA_VERSION } from "./primitives.js";

function sanitizeId(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : fallback;
}

function normalizeHex(raw: unknown, fallback = "#ffffff"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(trimmed)) {
    return `#${trimmed.toLowerCase()}`;
  }
  return fallback;
}

function rgbArrayToHex(raw: unknown, fallback = "#ff7a59"): string {
  if (Array.isArray(raw) && raw.length >= 3) {
    const toByte = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(255, Math.round(n <= 1 ? n * 255 : n)));
    };
    const r = toByte(raw[0]).toString(16).padStart(2, "0");
    const g = toByte(raw[1]).toString(16).padStart(2, "0");
    const b = toByte(raw[2]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }
  return normalizeHex(raw, fallback);
}

const SKIN_MAP: Record<string, string> = {
  a: "#f1cfb4",
  b: "#e3b996",
  c: "#c6926b",
  d: "#8d5b3e",
};

const HAIR_SET = new Set(["short", "curly", "bob", "long", "ponytail", "braids", "updo", "bald"]);
const MOOD_SET = new Set(["day", "dusk", "gold", "night", "ice", "noir"]);
const VFX_SET = new Set(["rain", "snow", "embers", "dust", "god_rays", "speed_lines", "impact_burst", "light_leak"]);

function mapTransition(raw: unknown) {
  if (typeof raw !== "string") return "cut" as const;
  const key = raw.trim().toLowerCase();
  if (key === "whip_pan_left") return "whip_left" as const;
  if (key === "whip_pan_right") return "whip_right" as const;
  const parsed = TransitionTypeSchema.safeParse(key);
  return parsed.success ? parsed.data : ("cut" as const);
}

function mapPose(raw: unknown) {
  const parsed = CharacterPoseSchema.safeParse(typeof raw === "string" ? raw : "idle");
  return parsed.success ? parsed.data : ("idle" as const);
}

function mapExpr(raw: unknown) {
  const parsed = CharacterExpressionSchema.safeParse(typeof raw === "string" ? raw : "neutral");
  return parsed.success ? parsed.data : ("neutral" as const);
}

function mapMood(raw: unknown): "day" | "dusk" | "gold" | "night" | "ice" | "noir" {
  const s = typeof raw === "string" ? raw.toLowerCase() : "dusk";
  return (MOOD_SET.has(s) ? s : "dusk") as "day" | "dusk" | "gold" | "night" | "ice" | "noir";
}

function mapFraming(raw: unknown) {
  const parsed = CameraFramingSchema.safeParse(typeof raw === "string" ? raw : "default");
  return parsed.success ? parsed.data : ("default" as const);
}

function mapProceduralSet(raw: unknown) {
  const parsed = ProceduralSetSchema.safeParse(typeof raw === "string" ? raw : "living_room");
  return parsed.success ? parsed.data : ("living_room" as const);
}

export interface LegacyImportOptions {
  /** Pre-registered assets copied into the Studio project (indexed by asset.id). */
  assets?: Asset[];
  /** Parsed contents of legacy `timing.json` (array or nested array of subtitle cues with words). */
  timingData?: unknown;
  /** Asset ID of the imported voice audio file (e.g. `voice_tiempo`). */
  voiceAssetId?: string;
  /** Duration of the voice file in seconds. */
  voiceDurationSec?: number;
  /** Asset ID of the imported background music file. */
  musicAssetId?: string;
  /** Map from legacy SFX kind name -> imported Asset ID. */
  sfxAssetMap?: Record<string, string>;
}

/**
 * Read-only converter from a legacy Storia v5.x `project_manifest.json`
 * into a Storia Studio v1.0 `Project` (with normalized [0..1] coordinates).
 */
export function importLegacyStoriaManifest(
  legacy: Record<string, unknown>,
  projectId?: string,
  options: LegacyImportOptions = {},
): Project {
  const now = new Date().toISOString();
  const aspectRaw = String(legacy["aspect_ratio"] ?? "9:16");
  const aspectRatio = aspectRaw === "16:9" || aspectRaw === "1:1" || aspectRaw === "9:16" ? aspectRaw : "9:16";
  const resRaw = String(legacy["resolution"] ?? "1080p").toLowerCase();
  const resolution =
    resRaw === "360p" || resRaw === "720p" || resRaw === "1080p" || resRaw === "2k" || resRaw === "4k"
      ? resRaw
      : "1080p";
  const fpsRaw = Number(legacy["fps"] ?? 30);
  const fps = fpsRaw === 24 || fpsRaw === 60 ? fpsRaw : 30;

  // Legacy Storia uses 1080x1920 (9:16), 1920x1080 (16:9), or 1080x1080 (1:1) virtual space
  const refDims = resolveCanvasDimensions({ aspectRatio, resolution: "1080p" });
  const refShort = Math.min(refDims.width, refDims.height);
  const assets = options.assets ?? [];
  const assetIds = new Set(assets.map((a) => a.id));

  // 1. Cast
  const castObj = (legacy["cast"] ?? {}) as Record<string, Record<string, unknown>>;
  const cast = Object.entries(castObj).map(([name, spec]) => {
    const skinKey = String(spec["skin"] ?? "b").toLowerCase();
    const hairRaw = String(spec["hair"] ?? "short").toLowerCase();
    const glasses = spec["glasses"]
      ? spec["glasses_style"] === "round"
        ? ("round" as const)
        : ("classic" as const)
      : ("none" as const);
    const hatRaw = String(spec["hat_style"] ?? "none").toLowerCase();
    const hat = (["cap", "fedora", "beret", "crown"].includes(hatRaw) ? hatRaw : "none") as
      | "none"
      | "cap"
      | "fedora"
      | "beret"
      | "crown";
    const facialHair = spec["stubble"] ? ("stubble" as const) : ("none" as const);

    return {
      id: sanitizeId(`char_${name}`, "char_actor"),
      name,
      kind: "procedural" as const,
      age: (["toddler", "boy", "girl", "teen", "adult", "elder"].includes(String(spec["age"]))
        ? String(spec["age"])
        : "adult") as "toddler" | "boy" | "girl" | "teen" | "adult" | "elder",
      genderPresentation: (spec["female"] ? "feminine" : "neutral") as "neutral" | "masculine" | "feminine",
      role: String(spec["role"] ?? "casual"),
      palette: {
        skin: SKIN_MAP[skinKey] ?? normalizeHex(spec["skin"], "#e3b996"),
        hair: normalizeHex(spec["hair_col"], "#1c191a"),
        shirt: normalizeHex(spec["shirt"], "#eef0f2"),
        jacket: spec["jacket"] ? normalizeHex(spec["jacket"], "#1b2230") : undefined,
        pants: normalizeHex(spec["pants"] ?? spec["skirt_color"], "#1e2430"),
        shoes: normalizeHex(spec["shoes"], "#141110"),
        accent: normalizeHex(spec["tie"], "#f7c8d6"),
      },
      hairStyle: (HAIR_SET.has(hairRaw) ? hairRaw : "short") as
        | "short"
        | "curly"
        | "bob"
        | "long"
        | "ponytail"
        | "braids"
        | "updo"
        | "bald",
      accessories: { glasses, hat, facialHair },
      wardrobe: {
        bodyShape: (["slim", "average", "athletic", "stocky", "curvy"].includes(String(spec["body_shape"]))
          ? String(spec["body_shape"])
          : "average") as "slim" | "average" | "athletic" | "stocky" | "curvy",
        dress: Boolean(spec["dress"]),
        dressStyle: (spec["dress_style"] === "pinafore" || spec["dress_style"] === "wrap"
          ? String(spec["dress_style"])
          : "a_line") as "a_line" | "pinafore" | "wrap",
        skirt: Boolean(spec["skirt"]),
        vestColor: spec["vest"] ? normalizeHex(spec["vest"], "#253242") : undefined,
        tieColor: spec["tie"] ? normalizeHex(spec["tie"], "#d9a841") : undefined,
        bowtie: Boolean(spec["bowtie"]),
        scarfColor: spec["scarf"] ? normalizeHex(spec["scarf"], "#c95b6c") : undefined,
        apronColor: spec["apron"] ? normalizeHex(spec["apron"], "#e6dfca") : undefined,
        shirtPattern: (["solid", "stripes", "pinstripe", "checks", "dots"].includes(String(spec["shirt_pattern"]))
          ? String(spec["shirt_pattern"])
          : "solid") as "solid" | "stripes" | "pinstripe" | "checks" | "dots",
        earrings: (["stud", "hoop", "drop"].includes(String(spec["earrings"]))
          ? String(spec["earrings"])
          : "none") as "none" | "stud" | "hoop" | "drop",
        necklace: (["chain", "pearls"].includes(String(spec["necklace"]))
          ? String(spec["necklace"])
          : "none") as "none" | "chain" | "pearls",
        hairBow: Boolean(spec["hair_bow"]),
        shoeStyle: (["classic", "boots", "flats", "heels", "sneakers"].includes(String(spec["shoe_style"]))
          ? String(spec["shoe_style"])
          : "classic") as "classic" | "boots" | "flats" | "heels" | "sneakers",
        eyeColor: spec["eye_color"] ? normalizeHex(spec["eye_color"], "#2d2433") : undefined,
      },
    };
  });

  // 2. Shots -> Scenes & SFX clips
  const rawShots = Array.isArray(legacy["shots"]) ? (legacy["shots"] as Record<string, unknown>[]) : [];
  const sfxClips: {
    id: string;
    name: string;
    assetId: string;
    start: number;
    duration: number;
    gainDb: number;
  }[] = [];

  let globalCursor = 0;

  const scenes = rawShots.flatMap((shot, sIdx) => {
    const t0 = Number(shot["t0"] ?? globalCursor);
    const t1 = Number(shot["t1"] ?? t0 + 4);
    const beats =
      Array.isArray(shot["beats"]) && shot["beats"].length > 0
        ? (shot["beats"] as Record<string, unknown>[])
        : [{ ...shot, dur: Math.max(0.2, t1 - t0) }];

    return beats.map((beat, bIdx) => {
      const dur = Math.max(0.2, Number(beat["dur"] ?? (t1 - t0) / beats.length));
      const sceneStart = globalCursor;
      globalCursor += dur;

      const sceneId = sanitizeId(`scene_${sIdx + 1}_beat_${bIdx + 1}`, `scene_${sIdx + 1}`);
      const mood = mapMood(beat["mood"] ?? shot["mood"]);
      const layers: unknown[] = [];

      // Background (direct or first panel of split_panels)
      const splitPanels = beat["split_panels"] as Record<string, unknown> | undefined;
      const firstPanel =
        splitPanels && Array.isArray(splitPanels["panels"]) && splitPanels["panels"].length > 0
          ? (splitPanels["panels"][0] as Record<string, unknown>)
          : undefined;
      const bg = beat["bg"] ?? firstPanel?.["bg"] ?? shot["bg"];

      if (typeof bg === "object" && bg !== null && "sprite" in bg) {
        const spName = String((bg as Record<string, unknown>)["sprite"]);
        const aid = sanitizeId(spName, "bg_asset");
        if (assetIds.size === 0 || assetIds.has(aid)) {
          layers.push({
            id: `${sceneId}_bg`,
            type: "background",
            name: spName,
            sourceType: "asset",
            assetId: aid,
            mood,
            zIndex: 0,
            parallaxDepth: 0.8,
          });
        } else {
          layers.push({
            id: `${sceneId}_bg`,
            type: "background",
            name: spName,
            sourceType: "procedural",
            proceduralSet: "observatory",
            mood,
            zIndex: 0,
            parallaxDepth: 0.8,
          });
        }
      } else if (typeof bg === "object" && bg !== null && "type" in bg) {
        layers.push({
          id: `${sceneId}_bg`,
          type: "background",
          name: String((bg as Record<string, unknown>)["type"]),
          sourceType: "procedural",
          proceduralSet: mapProceduralSet((bg as Record<string, unknown>)["type"]),
          seed: Math.round(Number((bg as Record<string, unknown>)["seed"] ?? 1)),
          mood,
          zIndex: 0,
          parallaxDepth: 0.8,
        });
      } else if (typeof bg === "string") {
        layers.push({
          id: `${sceneId}_bg`,
          type: "background",
          name: bg,
          sourceType: "procedural",
          proceduralSet: mapProceduralSet(bg),
          mood,
          zIndex: 0,
          parallaxDepth: 0.8,
        });
      } else {
        layers.push({
          id: `${sceneId}_bg`,
          type: "background",
          name: "Fondo",
          sourceType: "procedural",
          proceduralSet: "living_room",
          mood,
          zIndex: 0,
          parallaxDepth: 0.8,
        });
      }

      // Characters (including from first split panel if beat has split_panels and empty chars)
      const charsRaw = Array.isArray(beat["chars"]) && beat["chars"].length > 0
        ? (beat["chars"] as Record<string, unknown>[])
        : Array.isArray(firstPanel?.["chars"])
          ? (firstPanel!["chars"] as Record<string, unknown>[])
          : [];

      const charLayerIdsByName = new Map<string, string>();
      charsRaw.forEach((ch, cIdx) => {
        const cname = String(ch["name"] ?? `actor_${cIdx}`);
        const lid = sanitizeId(`${sceneId}_char_${cIdx}_${cname}`, `char_${cIdx}`);
        charLayerIdsByName.set(cname, lid);
      });

      charsRaw.forEach((ch, cIdx) => {
        const cname = String(ch["name"] ?? `actor_${cIdx}`);
        const lid = charLayerIdsByName.get(cname)!;
        const cx = Number(ch["x"] ?? refDims.width * 0.5) / refDims.width;
        const cy = Number(ch["y"] ?? refDims.height * 0.8) / refDims.height;
        const sc = Number(ch["scale"] ?? 1);

        const poseCues: { t: number; pose: ReturnType<typeof mapPose>; blendDuration: number }[] = [];
        if (ch["pose2"] && ch["pose_t0"] !== undefined) {
          const pt0 = Math.max(0, Number(ch["pose_t0"]));
          const pt1 = ch["pose_t1"] !== undefined ? Number(ch["pose_t1"]) : pt0 + 0.35;
          poseCues.push({
            t: pt0,
            pose: mapPose(ch["pose2"]),
            blendDuration: Math.max(0.05, Math.min(3, pt1 - pt0)),
          });
        }

        const expressionCues: { t: number; expression: ReturnType<typeof mapExpr>; blendDuration: number }[] = [];
        if (Array.isArray(ch["expr_changes"])) {
          for (const pair of ch["expr_changes"] as unknown[]) {
            if (Array.isArray(pair) && pair.length >= 2) {
              expressionCues.push({
                t: Math.max(0, Number(pair[0])),
                expression: mapExpr(pair[1]),
                blendDuration: 0.25,
              });
            }
          }
        }

        const keyframes: Record<string, { t: number; value: number; easing: "easeInOut" }[]> = {};
        if (Array.isArray(ch["path"]) && ch["path"].length > 0) {
          const kx: { t: number; value: number; easing: "easeInOut" }[] = [];
          const ky: { t: number; value: number; easing: "easeInOut" }[] = [];
          const ks: { t: number; value: number; easing: "easeInOut" }[] = [];
          for (const pt of ch["path"] as unknown[]) {
            if (Array.isArray(pt) && pt.length >= 3) {
              const t = Math.max(0, Number(pt[0]));
              kx.push({ t, value: Number(pt[1]) / refDims.width, easing: "easeInOut" });
              ky.push({ t, value: Number(pt[2]) / refDims.height, easing: "easeInOut" });
              if (pt.length >= 4) {
                ks.push({ t, value: Number(pt[3]), easing: "easeInOut" });
              }
            }
          }
          if (kx.length > 0) keyframes.x = kx;
          if (ky.length > 0) keyframes.y = ky;
          if (ks.length > 0) {
            keyframes.scaleX = ks;
            keyframes.scaleY = ks;
          }
        }

        if (Array.isArray(ch["alpha_keys"]) && ch["alpha_keys"].length > 0) {
          const ko: { t: number; value: number; easing: "easeInOut" }[] = [];
          for (const ak of ch["alpha_keys"] as unknown[]) {
            if (Array.isArray(ak) && ak.length >= 2) {
              ko.push({
                t: Math.max(0, Number(ak[0])),
                value: Math.max(0, Math.min(1, Number(ak[1]))),
                easing: "easeInOut",
              });
            }
          }
          if (ko.length > 0) keyframes.opacity = ko;
        }

        const lookAtName = typeof ch["look_at"] === "string" ? ch["look_at"] : undefined;

        layers.push({
          id: lid,
          type: "character",
          name: cname,
          characterId: sanitizeId(`char_${cname}`, "char_actor"),
          pose: mapPose(ch["pose"]),
          expression: mapExpr(ch["expr"]),
          poseCues,
          expressionCues,
          lookAtLayerId: lookAtName ? charLayerIdsByName.get(lookAtName) : undefined,
          silhouette: Boolean(ch["sil"]),
          tint: ch["tint"] ? normalizeHex(ch["tint"]) : undefined,
          zIndex: 10 + Number(ch["z"] ?? cIdx),
          parallaxDepth: 1.0,
          transform: {
            x: cx,
            y: cy,
            anchor: { x: 0.5, y: 1 },
            scaleX: sc,
            scaleY: sc,
            rotation: 0,
            opacity: Math.max(0, Math.min(1, Number(ch["alpha"] ?? 1))),
          },
          keyframes,
        });
      });

      // PiP frame
      const pip = beat["pip"] as Record<string, unknown> | undefined;
      if (pip && typeof pip === "object") {
        const pt0 = Math.max(0, Number(pip["t0"] ?? 0));
        const pt1 = Number(pip["t1"] ?? dur);
        const shapeRaw = String(pip["shape"] ?? "polaroid");
        const shape = (["rounded", "polaroid", "circle", "rift"].includes(shapeRaw) ? shapeRaw : "polaroid") as
          | "rounded"
          | "polaroid"
          | "circle"
          | "rift";
        layers.push({
          id: `${sceneId}_pip`,
          type: "pip",
          name: String(pip["label"] ?? "PiP"),
          start: pt0,
          duration: Math.max(0.1, pt1 - pt0),
          shape,
          widthNorm: Math.max(0.15, Math.min(0.95, Number(pip["w"] ?? 540) / refDims.width)),
          heightNorm: Math.max(0.12, Math.min(0.8, Number(pip["h"] ?? 360) / refDims.height)),
          borderColor: normalizeHex(pip["accent"], "#ffd447"),
          label: typeof pip["label"] === "string" ? pip["label"] : undefined,
          zIndex: 25,
          parallaxDepth: 1.04,
          transform: {
            x: Number(pip["x"] ?? refDims.width * 0.5) / refDims.width,
            y: Number(pip["y"] ?? refDims.height * 0.62) / refDims.height,
            anchor: { x: 0.5, y: 0.5 },
            rotation: Number(pip["rot"] ?? 0) * (180 / Math.PI),
          },
        });
      }

      // Overlays (kinetic_title, tag, sprite, morph_sprite, impact)
      const overlays = Array.isArray(beat["overlays"]) ? (beat["overlays"] as Record<string, unknown>[]) : [];
      overlays.forEach((ov, oIdx) => {
        const oType = String(ov["type"] ?? "");
        const ot0 = Math.max(0, Number(ov["t0"] ?? 0));
        const ot1 = Number(ov["t1"] ?? dur);
        const odur = Math.max(0.1, ot1 - ot0);
        const ox = Number(ov["x"] ?? refDims.width * 0.5) / refDims.width;
        const oy = Number(ov["y"] ?? refDims.height * 0.3) / refDims.height;

        if (oType === "kinetic_title" || oType === "tag") {
          layers.push({
            id: sanitizeId(`${sceneId}_txt_${oIdx}`, `txt_${oIdx}`),
            type: "text",
            variant: oType === "kinetic_title" ? "kinetic_title" : "tag",
            name: String(ov["title"] ?? "Título").slice(0, 80),
            start: ot0,
            duration: odur,
            text: String(ov["title"] ?? "Título"),
            kicker: typeof ov["kicker"] === "string" ? ov["kicker"] : undefined,
            subtitle: typeof ov["body"] === "string" ? ov["body"] : typeof ov["sub"] === "string" ? ov["sub"] : undefined,
            fontFamily: "Figtree",
            fontWeight: 900,
            fontSize: oType === "kinetic_title" ? 68 : 54,
            color: "#ffffff",
            accentColor: normalizeHex(ov["accent"], "#ffd447"),
            strokeColor: "#0a0d16",
            strokeWidth: 7,
            zIndex: 40 + oIdx,
            parallaxDepth: 0,
            transform: { x: ox, y: oy, anchor: { x: 0.5, y: 0.5 } },
          });
        } else if (oType === "sprite" || oType === "morph_sprite") {
          const spName = String(ov["name"] ?? ov["to_sprite"] ?? ov["from_sprite"] ?? `sprite_${oIdx}`);
          const aid = sanitizeId(spName, `sprite_${oIdx}`);
          const wPx = Number(ov["w"] ?? 450);
          const bobPx = Number(ov["bob"] ?? 0);
          layers.push({
            id: sanitizeId(`${sceneId}_sp_${oIdx}_${spName}`, `sp_${oIdx}`),
            type: "sprite",
            name: spName,
            start: ot0,
            duration: odur,
            assetId: assetIds.has(aid) ? aid : undefined,
            proceduralProp: spName,
            widthNorm: Math.max(0.05, Math.min(3.5, wPx / refShort)),
            bobAmplitude: Math.max(0, Math.min(0.2, bobPx / refDims.height)),
            bobSpeed: Math.max(0, Math.min(10, Number(ov["bob_speed"] ?? 1.2))),
            zIndex: 30 + oIdx,
            parallaxDepth: 1.08,
            transform: { x: ox, y: oy, anchor: { x: 0.5, y: 0.5 } },
          });
        } else if (oType === "impact") {
          layers.push({
            id: sanitizeId(`${sceneId}_impact_${oIdx}`, `impact_${oIdx}`),
            type: "vfx",
            name: "Impact Burst",
            start: ot0,
            duration: odur,
            effect: "impact_burst",
            color: normalizeHex(ov["color"], "#ff5c5c"),
            intensity: 1.1,
            seed: sIdx * 13 + oIdx + 1,
            zIndex: 48,
            parallaxDepth: 1.0,
          });
        }
      });

      // Foreground frame overlays
      const fgList = Array.isArray(beat["foreground"]) ? (beat["foreground"] as Record<string, unknown>[]) : [];
      fgList.forEach((fg, fIdx) => {
        const fgName = String(fg["name"] ?? `fg_${fIdx}`);
        const aid = sanitizeId(fgName, `fg_${fIdx}`);
        if (assetIds.has(aid)) {
          layers.push({
            id: sanitizeId(`${sceneId}_fg_${fIdx}`, `fg_${fIdx}`),
            type: "sprite",
            name: fgName,
            assetId: aid,
            widthNorm: Math.max(0.2, Math.min(3.5, Number(fg["w"] ?? refDims.width) / refShort)),
            zIndex: 55 + fIdx,
            parallaxDepth: Math.max(0, Math.min(3, Number(fg["depth"] ?? 1.18))),
            transform: {
              x: Number(fg["x"] ?? refDims.width * 0.5) / refDims.width,
              y: Number(fg["y"] ?? refDims.height * 0.5) / refDims.height,
              anchor: { x: 0.5, y: 0.5 },
            },
          });
        }
      });

      // Weather & VFX tags
      const vfxList = Array.isArray(beat["vfx"]) ? (beat["vfx"] as string[]) : [];
      const weather = String(beat["weather"] ?? shot["weather"] ?? "none").toLowerCase();
      const allVfx = new Set<string>(vfxList.map((v) => String(v).toLowerCase()));
      if (weather === "rain" || weather === "snow") allVfx.add(weather);
      let vIdx = 0;
      for (const eff of allVfx) {
        if (!VFX_SET.has(eff)) continue;
        layers.push({
          id: `${sceneId}_vfx_${eff}`,
          type: "vfx",
          name: `VFX ${eff}`,
          effect: eff,
          intensity: eff === "embers" || eff === "rain" ? 0.85 : 0.7,
          color: mood === "ice" ? "#4ce6c8" : "#ffd447",
          seed: (sIdx + 1) * 31 + bIdx * 7 + vIdx,
          zIndex: 60 + vIdx,
          parallaxDepth: 1.12,
        });
        vIdx++;
      }

      // Camera
      const camObj = (beat["camera"] ?? shot["camera"] ?? {}) as Record<string, unknown>;
      const framingTargetName = typeof camObj["framing_target"] === "string" ? camObj["framing_target"] : undefined;
      const dutch = camObj["dutch_angle"] as Record<string, unknown> | undefined;
      const handheldVal = Number(camObj["handheld"] ?? 0);

      const camera = {
        framing: mapFraming(camObj["framing"]),
        framingTargetLayerId: framingTargetName ? charLayerIdsByName.get(framingTargetName) : undefined,
        rotation: dutch ? Math.max(-45, Math.min(45, Number(dutch["degrees"] ?? 0))) : 0,
        handheld: {
          enabled: handheldVal > 0.01,
          intensity: Math.max(0, Math.min(2, handheldVal || 0.2)),
          frequency: Math.max(0.1, Math.min(5, Number(camObj["shake_freq"] ?? 1.0))),
        },
        parallaxStrength: legacy["parallax_deep"] ? 1.0 : 0.6,
      };

      // Transitions
      const transInType = bIdx === 0 ? mapTransition(shot["transition_in"]) : mapTransition(beat["beat_transition"]);
      const transOutType = bIdx === beats.length - 1 ? mapTransition(shot["transition_out"]) : "cut";
      const accentHex = normalizeHex(shot["match_accent"], "#ffd447");

      // Collect SFX clips with global timestamps
      const beatSfx = Array.isArray(beat["sfx"]) ? (beat["sfx"] as Record<string, unknown>[]) : [];
      beatSfx.forEach((sx, sxIdx) => {
        const kind = String(sx["kind"] ?? "");
        const mappedAid = options.sfxAssetMap?.[kind];
        if (!mappedAid || !assetIds.has(mappedAid)) return;
        const gain = Math.max(0.05, Number(sx["gain"] ?? 0.5));
        const gainDb = Math.max(-40, Math.min(12, Number((20 * Math.log10(gain)).toFixed(1))));
        sfxClips.push({
          id: sanitizeId(`sfx_${sIdx + 1}_${bIdx + 1}_${sxIdx}_${kind}`, `sfx_${sxIdx}`),
          name: kind,
          assetId: mappedAid,
          start: Number((sceneStart + Math.max(0, Number(sx["t0"] ?? 0))).toFixed(3)),
          duration: 1.8,
          gainDb,
        });
      });

      return {
        id: sceneId,
        name: `Shot ${sIdx + 1}${beats.length > 1 ? ` · Beat ${bIdx + 1}` : ""}`,
        duration: Number(dur.toFixed(3)),
        mood,
        camera,
        transitionIn: { type: transInType, duration: transInType === "cut" ? 0 : 0.35, accentColor: accentHex },
        transitionOut: { type: transOutType, duration: transOutType === "cut" ? 0 : 0.35, accentColor: accentHex },
        layers,
      };
    });
  });

  if (scenes.length === 0) {
    scenes.push({
      id: "scene_1",
      name: "Escena 1",
      duration: 4,
      mood: "dusk" as const,
      camera: {
        framing: "default" as const,
        framingTargetLayerId: undefined,
        rotation: 0,
        handheld: { enabled: false, intensity: 0.2, frequency: 1 },
        parallaxStrength: 1,
      },
      transitionIn: { type: "cut" as const, duration: 0, accentColor: "#ffd447" },
      transitionOut: { type: "cut" as const, duration: 0, accentColor: "#ffd447" },
      layers: [],
    });
  }

  // 3. Subtitles (style + optional timing.json word-level cues)
  const subStyleRaw = (legacy["subtitle_style"] ?? {}) as Record<string, unknown>;
  const alertWords = new Set(
    (Array.isArray(subStyleRaw["alert_words"]) ? subStyleRaw["alert_words"] : []).map((w) =>
      String(w).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
    ),
  );

  const flattenTimingCues = (data: unknown): Record<string, unknown>[] => {
    if (!Array.isArray(data)) return [];
    const out: Record<string, unknown>[] = [];
    for (const item of data) {
      if (Array.isArray(item)) out.push(...flattenTimingCues(item));
      else if (item && typeof item === "object") out.push(item as Record<string, unknown>);
    }
    return out;
  };

  const timingEntries = flattenTimingCues(options.timingData);
  const subtitleCues = timingEntries
    .map((entry, idx) => {
      const start = Math.max(0, Number(entry["t0"] ?? 0));
      const end = Math.max(start + 0.1, Number(entry["t1"] ?? start + 1));
      const text = String(entry["text"] ?? "").trim();
      if (!text) return null;
      const cueId = `cue_${String(idx + 1).padStart(2, "0")}`;
      const rawWords = Array.isArray(entry["words"]) ? (entry["words"] as Record<string, unknown>[]) : [];
      const words = rawWords
        .map((w, wIdx) => {
          const wt = String(w["w"] ?? w["text"] ?? "").trim();
          if (!wt) return null;
          const ws = Math.max(0, Number(w["t0"] ?? w["start"] ?? start));
          const we = Math.max(ws + 0.02, Number(w["t1"] ?? w["end"] ?? ws + 0.2));
          const norm = wt
            .toLowerCase()
            .replace(/[^a-záéíóúñü0-9]/gi, "")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return {
            id: `${cueId}_w_${String(wIdx + 1).padStart(2, "0")}`,
            text: wt,
            start: Number(ws.toFixed(3)),
            end: Number(we.toFixed(3)),
            emphasis: alertWords.has(norm) ? ("alert" as const) : ("normal" as const),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      return {
        id: cueId,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text,
        words,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const fontRaw = String(subStyleRaw["font"] ?? legacy["default_font"] ?? "Figtree");
  const cleanFontFamily = fontRaw.split("-")[0]?.trim() || "Figtree";

  // 4. Post-processing
  const halRaw = legacy["glow_halation"] as Record<string, unknown> | undefined;
  const grainRaw = legacy["moving_texture"] as Record<string, unknown> | undefined;
  const chromaRaw = legacy["chromatic_aberration"] as Record<string, unknown> | undefined;

  const postProcessing = {
    preset: "clean" as const,
    halation: halRaw
      ? {
          enabled: Number(halRaw["strength"] ?? 0) > 0,
          strength: Math.max(0, Math.min(1.5, Number(halRaw["strength"] ?? 0.35))),
          threshold: Math.max(0, Math.min(1, Number(halRaw["threshold"] ?? 0.72))),
          radius: Math.max(1, Math.min(48, Number(halRaw["halation_radius"] ?? 14))),
          tint: rgbArrayToHex(halRaw["tint"], "#ff7a59"),
        }
      : undefined,
    filmGrain: grainRaw
      ? {
          enabled: Number(grainRaw["strength"] ?? 0) > 0,
          mode: "paper" as const,
          strength: Math.max(0, Math.min(1, Number(grainRaw["strength"] ?? 0.07))),
          stepFrames: Math.max(1, Math.min(8, Math.round(Number(grainRaw["step_frames"] ?? 3)))),
        }
      : undefined,
    chromaticAberration: chromaRaw
      ? {
          enabled: Number(chromaRaw["base"] ?? 0) > 0,
          strength: Math.max(0, Math.min(1, Number(chromaRaw["base"] ?? 0))),
          maxPixels: Math.max(0, Math.min(24, Number(chromaRaw["max_px"] ?? 12))),
        }
      : undefined,
    vignette: { enabled: true, strength: 0.28, softness: 0.65 },
  };

  // 5. Audio tracks
  const totalDur = Math.max(1, globalCursor);
  const audioTracks: unknown[] = [];
  if (options.voiceAssetId && assetIds.has(options.voiceAssetId)) {
    audioTracks.push({
      id: "track_voice",
      name: "Voz Principal",
      role: "voice",
      volume: 1.0,
      clips: [
        {
          id: "clip_voice_main",
          name: "Narración",
          assetId: options.voiceAssetId,
          start: 0,
          duration: Math.max(0.5, options.voiceDurationSec ?? totalDur),
        },
      ],
    });
  }
  if (options.musicAssetId && assetIds.has(options.musicAssetId)) {
    audioTracks.push({
      id: "track_music",
      name: String(legacy["music"] ?? "Música"),
      role: "music",
      volume: Math.max(0, Math.min(2, Number(legacy["music_volume"] ?? 0.14))),
      duckUnderTrackId: options.voiceAssetId ? "track_voice" : undefined,
      duckAmountDb: -7,
      clips: [
        {
          id: "clip_music_main",
          name: String(legacy["music"] ?? "Música"),
          assetId: options.musicAssetId,
          start: 0,
          duration: totalDur,
          loop: true,
          fadeIn: 0.6,
          fadeOut: 1.5,
        },
      ],
    });
  }
  if (sfxClips.length > 0) {
    audioTracks.push({
      id: "track_sfx",
      name: "SFX",
      role: "sfx",
      volume: Math.max(0, Math.min(2, Number(legacy["sfx_volume"] ?? 0.42))),
      clips: sfxClips,
    });
  }

  return ProjectSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: sanitizeId(projectId ?? String(legacy["project"] ?? "imported_storia"), "imported_storia"),
    name: String(legacy["project"] ?? "Proyecto Storia Importado"),
    createdAt: now,
    updatedAt: now,
    canvas: { aspectRatio, resolution, fps },
    cast,
    assets,
    scenes,
    audioTracks,
    subtitles: {
      enabled: legacy["burn_in_captions"] !== false,
      language: "es",
      style: {
        fontFamily: cleanFontFamily,
        fontSource: "google",
        fontWeight: 900,
        fontSize: Math.max(16, Math.min(200, Number(subStyleRaw["render_size"] ?? 62))),
        uppercase: subStyleRaw["uppercase"] !== false,
        color: "#ffffff",
        activeWordColor: normalizeHex(subStyleRaw["highlight_color"], "#ffd447"),
        accentWordColor: normalizeHex(subStyleRaw["accent_color"], "#4ce6c8"),
        alertWordColor: normalizeHex(subStyleRaw["alert_color"], "#ff5c5c"),
        activeWordEffect: "pop",
        maxWordsPerWindow: Math.max(1, Math.min(12, Number(subStyleRaw["win_size"] ?? 3))),
        position: {
          x: 0.5,
          y: Math.max(0.05, Math.min(0.95, Number(subStyleRaw["y_ratio"] ?? 0.79))),
        },
      },
      cues: subtitleCues,
    },
    postProcessing,
    exportSettings: {
      aspectRatio,
      resolution,
      fps,
      crf: Number(legacy["crf"] ?? 17),
      encoder: legacy["gpu"] ? "h264_nvenc" : "auto",
      burnSubtitles: legacy["burn_in_captions"] !== false,
      exportSrt: true,
    },
    metadata: {
      tags: ["imported-legacy", "storia-5.2"],
      sourceManifest: typeof legacy["project"] === "string" ? legacy["project"] : undefined,
    },
  });
}
