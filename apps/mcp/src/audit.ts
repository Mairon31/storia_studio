import {
  getProjectDuration,
  Project,
  resolveSafeZones,
} from "@storia/schema";

export type AuditSeverity = "error" | "warning" | "info";
export type AuditCategory = "cut_check" | "safe_zone" | "integrity" | "timing" | "audio" | "rig";

export interface AuditIssue {
  severity: AuditSeverity;
  category: AuditCategory;
  code: string;
  message: string;
  timeSec?: number;
  sceneId?: string;
  layerId?: string;
  characterId?: string;
  cueId?: string;
  suggestion?: string;
}

export interface ProjectAuditReport {
  projectId: string;
  aspectRatio: string;
  durationSec: number;
  ok: boolean;
  score: number; // 0..100
  counts: {
    errors: number;
    warnings: number;
    info: number;
  };
  issues: AuditIssue[];
}

/**
 * Comprehensive pre-export & live-direction auditor (MakeMyClip + BaoCut patterns):
 *  1. cut_check: detects scene cuts slicing through the middle of spoken subtitle words
 *  2. safe_zone: detects subtitles, text, sprites, or characters invading platform UI margins
 *  3. integrity: verifies assetId / characterId references, scene structure, and subtitle bounds
 */
export function auditProject(project: Project): ProjectAuditReport {
  const issues: AuditIssue[] = [];
  const totalDur = getProjectDuration(project);
  const assetIds = new Set(project.assets.map((a) => a.id));
  const characterIds = new Set(project.cast.map((c) => c.id));
  const characterMap = new Map(project.cast.map((c) => [c.id, c]));

  // Build scene start/end spans & internal cut timestamps
  const sceneSpans: { scene: Project["scenes"][number]; start: number; end: number }[] = [];
  let cursor = 0;
  for (const scene of project.scenes) {
    const start = cursor;
    cursor += scene.duration;
    sceneSpans.push({ scene, start, end: cursor });
  }
  const cutTimes = sceneSpans.slice(0, -1).map((s) => ({ time: s.end, sceneId: s.scene.id }));

  // Resolve primary UI safe box (social_ui for 9:16, title safe for 16:9 / 1:1)
  const safeZones = resolveSafeZones(project.canvas.aspectRatio);
  const uiSafe = safeZones[1] ?? safeZones[0]!;
  const safeLeft = uiSafe.left;
  const safeRight = 1 - uiSafe.right;
  const safeTop = uiSafe.top;
  const safeBottom = 1 - uiSafe.bottom;

  // --------------------------------------------------------------------------
  // 1. CUT CHECK (Subtitles vs. Scene Boundaries)
  // --------------------------------------------------------------------------
  if (project.subtitles.enabled) {
    for (const cue of project.subtitles.cues) {
      if (cue.end > totalDur + 0.05) {
        issues.push({
          severity: "warning",
          category: "timing",
          code: "subtitle_past_end",
          cueId: cue.id,
          timeSec: cue.end,
          message: `Subtitle cue '${cue.id}' ends at ${cue.end.toFixed(2)}s past project duration (${totalDur.toFixed(2)}s).`,
          suggestion: "Trim cue end time or extend the last scene.",
        });
      }

      // Word-level mid-word cut check
      for (const word of cue.words) {
        for (const cut of cutTimes) {
          if (word.start + 0.04 < cut.time && word.end - 0.04 > cut.time) {
            issues.push({
              severity: "warning",
              category: "cut_check",
              code: "mid_word_scene_cut",
              sceneId: cut.sceneId,
              cueId: cue.id,
              timeSec: Number(cut.time.toFixed(2)),
              message: `Scene cut at ${cut.time.toFixed(2)}s slices through spoken word "${word.text}" (${word.start.toFixed(2)}s–${word.end.toFixed(2)}s).`,
              suggestion: `Adjust duration of scene '${cut.sceneId}' to cut at ${word.start.toFixed(2)}s or ${word.end.toFixed(2)}s.`,
            });
          }
        }
      }

      // Cue-level awkward orphan tail across cut (< 0.18s)
      if (cue.words.length === 0) {
        for (const cut of cutTimes) {
          if (cue.start < cut.time && cue.end > cut.time) {
            const tail = cue.end - cut.time;
            const head = cut.time - cue.start;
            if (tail < 0.18 || head < 0.18) {
              issues.push({
                severity: "info",
                category: "cut_check",
                code: "short_subtitle_overlap_cut",
                sceneId: cut.sceneId,
                cueId: cue.id,
                timeSec: Number(cut.time.toFixed(2)),
                message: `Subtitle cue '${cue.id}' barely crosses scene cut at ${cut.time.toFixed(2)}s.`,
                suggestion: "Align cue boundary cleanly with the scene cut.",
              });
            }
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 2. SAFE ZONE AUDIT — SUBTITLES
    // ------------------------------------------------------------------------
    const subPos = project.subtitles.style.position;
    if (subPos.y > safeBottom + 0.03) {
      issues.push({
        severity: "warning",
        category: "safe_zone",
        code: "subtitle_below_safe_zone",
        message: `Global subtitle Y position (${Math.round(subPos.y * 100)}%) is below the ${uiSafe.label} bottom margin (${Math.round(safeBottom * 100)}%).`,
        suggestion: `Move subtitles.style.position.y to <= ${safeBottom.toFixed(2)} (e.g. 0.74 for 9:16 Reels/Shorts).`,
      });
    } else if (subPos.y < safeTop) {
      issues.push({
        severity: "warning",
        category: "safe_zone",
        code: "subtitle_above_safe_zone",
        message: `Global subtitle Y position (${Math.round(subPos.y * 100)}%) is above the ${uiSafe.label} top margin (${Math.round(safeTop * 100)}%).`,
        suggestion: `Move subtitles.style.position.y to >= ${safeTop.toFixed(2)}.`,
      });
    }
  }

  // --------------------------------------------------------------------------
  // 3. SCENE, LAYER SAFE ZONES & REFERENCE INTEGRITY
  // --------------------------------------------------------------------------
  for (const { scene, start } of sceneSpans) {
    if (scene.duration < 0.3) {
      issues.push({
        severity: "warning",
        category: "timing",
        code: "very_short_scene",
        sceneId: scene.id,
        timeSec: start,
        message: `Scene '${scene.name}' is very short (${scene.duration.toFixed(2)}s).`,
        suggestion: "Increase scene duration to at least 0.5s unless intentionally flashing.",
      });
    }

    if (scene.layers.length === 0) {
      issues.push({
        severity: "warning",
        category: "integrity",
        code: "empty_scene",
        sceneId: scene.id,
        timeSec: start,
        message: `Scene '${scene.name}' has no layers.`,
        suggestion: "Add at least a background layer so the scene doesn't render flat blank color.",
      });
    }

    for (const layer of scene.layers) {
      if (!layer.visible) continue;

      // Asset / Character reference integrity + b6-character-binding Rig QA
      if (layer.type === "character") {
        const charDef = characterMap.get(layer.characterId);
        if (!charDef) {
          issues.push({
            severity: "error",
            category: "integrity",
            code: "missing_character_definition",
            sceneId: scene.id,
            layerId: layer.id,
            characterId: layer.characterId,
            timeSec: start + layer.start,
            message: `Character layer '${layer.name}' references unknown characterId '${layer.characterId}'.`,
            suggestion: "Create the character via upsert_character or point characterId to an existing cast member.",
          });
        } else {
          // 3a. Modular sprite asset references integrity
          const modPartIds: [string, string | undefined][] = [
            ["head", charDef.parts.head?.assetId],
            ["torso", charDef.parts.torso?.assetId],
            ["leftHand", charDef.parts.leftHand?.assetId],
            ["rightHand", charDef.parts.rightHand?.assetId],
            ["leftFoot", charDef.parts.leftFoot?.assetId],
            ["rightFoot", charDef.parts.rightFoot?.assetId],
            ["hat", charDef.parts.hat?.assetId],
            ["prop", charDef.parts.prop?.assetId],
            ...Object.entries(charDef.parts.headVariants ?? {}).map(
              ([k, v]) => [`headVariants.${k}`, v?.assetId] as [string, string | undefined],
            ),
          ];
          for (const [partName, aid] of modPartIds) {
            if (aid && !assetIds.has(aid)) {
              issues.push({
                severity: "error",
                category: "rig",
                code: "missing_rig_part_asset",
                sceneId: scene.id,
                layerId: layer.id,
                characterId: charDef.id,
                timeSec: Number((start + layer.start).toFixed(2)),
                message: `Character '${charDef.name}' (${charDef.id}) part '${partName}' references missing assetId '${aid}'.`,
                suggestion: "Import the modular SVG/PNG part via import_local_asset or create_svg_asset.",
              });
            }
          }

          // 3b. Uniform character scale verification (no non-uniform horizontal/vertical distortion)
          const sx = Math.abs(layer.transform.scaleX);
          const sy = Math.abs(layer.transform.scaleY);
          const scaleRatioDiff = Math.abs(sx - sy) / Math.max(0.001, Math.max(sx, sy));
          if (scaleRatioDiff > 0.03) {
            issues.push({
              severity: "error",
              category: "rig",
              code: "rig_non_uniform_scale",
              sceneId: scene.id,
              layerId: layer.id,
              characterId: charDef.id,
              timeSec: Number((start + layer.start).toFixed(2)),
              message: `Character '${charDef.name}' (${charDef.id}) has non-uniform scale (scaleX=${layer.transform.scaleX.toFixed(2)}, scaleY=${layer.transform.scaleY.toFixed(2)}).`,
              suggestion: "Keep scaleX === scaleY on character layers to preserve anatomical proportions.",
            });
          }

          // 3c. Rigid neck rotation limits (±20° default & maxDegPerFrame=7°/frame)
          const neckLim = charDef.rigProfile?.neckAttachment?.maxAngleDeg ?? 20;
          const maxHeadStep = charDef.rigProfile?.neckAttachment?.maxDegPerFrame ?? 7;
          const baseHeadDeg = (layer.headAngleDeg ?? 0) + ((layer.boneOverrides.head ?? 0) * 180) / Math.PI;
          if (Math.abs(baseHeadDeg) > neckLim + 0.5) {
            issues.push({
              severity: "error",
              category: "rig",
              code: "rig_head_angle_limit",
              sceneId: scene.id,
              layerId: layer.id,
              characterId: charDef.id,
              timeSec: Number((start + layer.start).toFixed(2)),
              message: `Character '${charDef.name}' (${charDef.id}) head angle (${baseHeadDeg.toFixed(1)}°) exceeds rigid neck limit (±${neckLim}°).`,
              suggestion: `Reduce headAngleDeg / boneOverrides.head within [-${neckLim}°, +${neckLim}°] to prevent neck separation.`,
            });
          }

          const fps = project.canvas.fps || 30;
          if (layer.reactionNods && layer.reactionNods.length > 0) {
            for (const nod of layer.reactionNods) {
              const peakDeg = Math.abs(baseHeadDeg + nod.angleDeg);
              if (peakDeg > neckLim + 0.5) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_head_angle_limit",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start + nod.start + nod.attack).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) reaction nod peaks at ${peakDeg.toFixed(1)}° (limit ±${neckLim}°).`,
                  suggestion: `Keep reactionNod angleDeg within ±${neckLim}°.`,
                });
              }
              // Smoothstep max derivative is 1.5 / duration; check per-frame angular velocity
              const maxDegFrame = Math.abs(nod.angleDeg) * (1.5 / Math.max(1e-3, Math.min(nod.attack, nod.settle))) / fps;
              if (maxDegFrame > maxHeadStep + 0.1) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_head_teleport",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start + nod.start).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) reaction nod rotates ${maxDegFrame.toFixed(1)}°/frame (limit ${maxHeadStep}°/frame).`,
                  suggestion: "Increase nod attack/settle duration or reduce angleDeg for smooth rigid turns.",
                });
              }
            }
          }

          // 3d. Bounded 2-Bone Arm IK Reachability (`wristTargets`) & Planted Ankle Envelope (`ankleTargets`)
          const isChild = charDef.age === "toddler" || charDef.age === "boy" || charDef.age === "girl";
          const isFemale = charDef.genderPresentation === "feminine";
          const bodyShape = charDef.wardrobe?.bodyShape ?? "average";
          const wid =
            bodyShape === "slim" ? 0.88 :
            bodyShape === "athletic" ? 1.07 :
            bodyShape === "stocky" ? 1.18 :
            bodyShape === "curvy" ? 1.1 : 1.0;
          const armX = (isFemale ? 40 : 46) * wid;
          const torsoH = isChild ? 132 : 156;
          const uaLen = isChild ? 66 : 80;
          const faLen = isChild ? 60 : 74;
          const minArmReach = Math.abs(uaLen - faLen) + 1;
          const maxArmReach = uaLen + faLen;
          const legh = isChild ? 185 : 224;
          const legDx = isFemale ? 17 : 20;

          for (const side of ["left", "right"] as const) {
            const wt = layer.wristTargets?.[side];
            if (wt) {
              const armSpec = side === "left" ? charDef.rigProfile?.leftArm : charDef.rigProfile?.rightArm;
              const sxPos = (side === "left" ? -armX : armX) + (armSpec?.cuffOutletOffset?.x ?? 0);
              const syPos = -torsoH + 20 + (armSpec?.cuffOutletOffset?.y ?? 0);
              const dist = Math.hypot(wt.x - sxPos, wt.y - syPos);
              if (!Number.isFinite(dist) || dist < minArmReach || dist > maxArmReach) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_ik_target_unreachable",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) ${side} wristTarget (${wt.x}, ${wt.y}) is ${dist.toFixed(1)}px from shoulder (permitted reach ${minArmReach.toFixed(0)}–${maxArmReach.toFixed(0)}px).`,
                  suggestion: `Move wristTargets.${side} within ${maxArmReach}px of shoulder (${sxPos.toFixed(0)}, ${syPos.toFixed(0)}) or reposition the character.`,
                });
              }
            }

            const at = layer.ankleTargets?.[side];
            if (at) {
              const hipX = side === "left" ? -legDx : legDx;
              const hipY = -legh;
              const legDist = Math.hypot(at.x - hipX, at.y - hipY);
              const ratio = legDist / legh;
              if (!Number.isFinite(ratio) || ratio < 0.92 || ratio > 1.08) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_ankle_outside_envelope",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) ${side} ankleTarget leg length ratio is ${(ratio * 100).toFixed(1)}% (permitted 92%–108%).`,
                  suggestion: "Adjust ankleTargets or character vertical position so legs stay within 92%–108% natural length.",
                });
              }
            }
          }

          // 3e. Sudden joint teleportation check on PoseCues & ArmTrack segment boundaries
          const sortedPoseCues = [...layer.poseCues].sort((a, b) => a.t - b.t);
          for (const cue of sortedPoseCues) {
            if (cue.blendDuration < 0.06 && cue.t > 0.01) {
              issues.push({
                severity: "error",
                category: "rig",
                code: "rig_joint_teleport",
                sceneId: scene.id,
                layerId: layer.id,
                characterId: charDef.id,
                timeSec: Number((start + layer.start + cue.t).toFixed(2)),
                message: `Character '${charDef.name}' (${charDef.id}) poseCue '${cue.pose}' at ${(start + layer.start + cue.t).toFixed(2)}s has blendDuration=${cue.blendDuration}s causing a single-frame joint jump.`,
                suggestion: "Use blendDuration >= 0.15s (default 0.35s) for continuous joint transitions.",
              });
            }
          }

          // Validate ArmTrack continuity & per-frame step ratio (b6_actions.py ArmTrack rules)
          const ARM_END_ANGLES: Record<string, Record<string, [number, number]>> = {
            right: {
              rest: [0.14, -0.18],
              reach: [0.92, -0.42],
              offer: [1.24, -0.58],
              receive: [1.08, -0.78],
              retract: [0.48, -0.52],
            },
            left: {
              rest: [-0.14, 0.18],
              reach: [-0.88, 0.42],
              offer: [-1.18, 0.58],
              receive: [-1.02, 0.78],
              retract: [-0.45, 0.52],
            },
          };
          const sampleArmAngles = (side: "left" | "right", action: string, phase: number): [number, number] => {
            const lib = ARM_END_ANGLES[side]!;
            const p = Math.min(1, Math.max(0, phase));
            const smooth = (x: number) => x * x * (3 - 2 * x);
            if (action === "retract") {
              const [a, b] = p <= 0.5 ? [lib.offer!, lib.retract!] : [lib.retract!, lib.rest!];
              const u = smooth(p <= 0.5 ? p * 2 : p * 2 - 1);
              return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
            }
            const startKey = action === "rest" ? "rest" : action === "reach" ? "rest" : "reach";
            const a = lib[startKey]!;
            const b = lib[action] ?? lib.rest!;
            const u = smooth(p);
            return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
          };
          const armWristXY = (a1: number, a2: number): [number, number] => [
            Math.sin(a1) * uaLen + Math.sin(a1 + a2) * faLen,
            Math.cos(a1) * uaLen + Math.cos(a1 + a2) * faLen,
          ];

          for (const side of ["left", "right"] as const) {
            const segs = layer.armTracks?.[side];
            if (!segs || segs.length === 0) continue;
            const maxStepRatio =
              (side === "left" ? charDef.rigProfile?.leftArm?.maxJointStepRatio : charDef.rigProfile?.rightArm?.maxJointStepRatio) ??
              0.32;
            const maxStepPx = Math.max(uaLen, faLen) * maxStepRatio;
            const ordered = [...segs].sort((a, b) => a.start - b.start);

            for (let i = 0; i < ordered.length; i++) {
              const seg = ordered[i]!;
              if (seg.end <= seg.start) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_arm_track_invalid",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start + seg.start).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) ${side} armTrack segment '${seg.action}' has end <= start.`,
                  suggestion: "Ensure every armTrack segment has end > start.",
                });
                continue;
              }
              // Check boundary jump against previous segment
              if (i > 0) {
                const prev = ordered[i - 1]!;
                const [pa1, pa2] = sampleArmAngles(side, prev.action, prev.phaseEnd);
                const [na1, na2] = sampleArmAngles(side, seg.action, seg.phaseStart);
                const [px, py] = armWristXY(pa1, pa2);
                const [nx, ny] = armWristXY(na1, na2);
                const jumpPx = Math.hypot(nx - px, ny - py);
                if (jumpPx > maxStepPx) {
                  issues.push({
                    severity: "error",
                    category: "rig",
                    code: "rig_joint_teleport",
                    sceneId: scene.id,
                    layerId: layer.id,
                    characterId: charDef.id,
                    timeSec: Number((start + layer.start + seg.start).toFixed(2)),
                    message: `Character '${charDef.name}' (${charDef.id}) ${side} armTrack jumps ${jumpPx.toFixed(1)}px at segment boundary '${prev.action}' -> '${seg.action}' (limit ${maxStepPx.toFixed(1)}px).`,
                    suggestion: "Match segment boundary poses continuously (e.g. rest -> reach -> offer -> retract).",
                  });
                }
              }
              // Check peak per-frame speed inside segment
              const dur = seg.end - seg.start;
              const [sa1, sa2] = sampleArmAngles(side, seg.action, seg.phaseStart);
              const [ea1, ea2] = sampleArmAngles(side, seg.action, seg.phaseEnd);
              const [sxW, syW] = armWristXY(sa1, sa2);
              const [exW, eyW] = armWristXY(ea1, ea2);
              const estStepPerFrame = (Math.hypot(exW - sxW, eyW - syW) * 1.5) / Math.max(1, dur * fps);
              if (estStepPerFrame > maxStepPx) {
                issues.push({
                  severity: "error",
                  category: "rig",
                  code: "rig_joint_teleport",
                  sceneId: scene.id,
                  layerId: layer.id,
                  characterId: charDef.id,
                  timeSec: Number((start + layer.start + seg.start).toFixed(2)),
                  message: `Character '${charDef.name}' (${charDef.id}) ${side} armTrack '${seg.action}' moves ~${estStepPerFrame.toFixed(1)}px/frame (limit ${maxStepPx.toFixed(1)}px/frame).`,
                  suggestion: "Increase segment duration so limb motion stays smooth and readable.",
                });
              }
            }
          }
        }
      }

      if (layer.type === "background" && layer.sourceType === "asset" && layer.assetId && !assetIds.has(layer.assetId)) {
        issues.push({
          severity: "error",
          category: "integrity",
          code: "missing_background_asset",
          sceneId: scene.id,
          layerId: layer.id,
          timeSec: start + layer.start,
          message: `Background layer '${layer.name}' references missing assetId '${layer.assetId}'.`,
          suggestion: "Import the asset via import_local_asset or switch sourceType to procedural/gradient.",
        });
      }

      if (layer.type === "sprite" && layer.assetId && !assetIds.has(layer.assetId)) {
        issues.push({
          severity: "error",
          category: "integrity",
          code: "missing_sprite_asset",
          sceneId: scene.id,
          layerId: layer.id,
          timeSec: start + layer.start,
          message: `Sprite layer '${layer.name}' references missing assetId '${layer.assetId}'.`,
          suggestion: "Import the sprite via import_local_asset or set a proceduralProp.",
        });
      }

      // Safe zone check for text & foreground sprites/PiPs (ignore full-screen background & vfx)
      if (layer.type === "text" || layer.type === "sprite" || layer.type === "pip") {
        const { x, y } = layer.transform;
        const outHoriz = x < safeLeft || x > safeRight;
        const outVert = y < safeTop || y > safeBottom;
        if (outHoriz || outVert) {
          issues.push({
            severity: layer.type === "text" ? "warning" : "info",
            category: "safe_zone",
            code: "layer_outside_safe_zone",
            sceneId: scene.id,
            layerId: layer.id,
            timeSec: Number((start + layer.start).toFixed(2)),
            message: `${layer.type} layer '${layer.name}' at (${Math.round(x * 100)}%, ${Math.round(y * 100)}%) sits outside ${uiSafe.label} (${Math.round(safeLeft * 100)}–${Math.round(safeRight * 100)}% X, ${Math.round(safeTop * 100)}–${Math.round(safeBottom * 100)}% Y).`,
            suggestion: `Reposition within X:[${safeLeft.toFixed(2)}, ${safeRight.toFixed(2)}] and Y:[${safeTop.toFixed(2)}, ${safeBottom.toFixed(2)}].`,
          });
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. AUDIO INTEGRITY
  // --------------------------------------------------------------------------
  const trackIds = new Set(project.audioTracks.map((t) => t.id));
  for (const track of project.audioTracks) {
    if (track.duckUnderTrackId && !trackIds.has(track.duckUnderTrackId)) {
      issues.push({
        severity: "warning",
        category: "audio",
        code: "missing_duck_target",
        message: `Audio track '${track.name}' ducks under missing track '${track.duckUnderTrackId}'.`,
        suggestion: "Point duckUnderTrackId to an existing voice track or clear it.",
      });
    }
    for (const clip of track.clips) {
      if (!assetIds.has(clip.assetId)) {
        issues.push({
          severity: "error",
          category: "audio",
          code: "missing_audio_asset",
          timeSec: clip.start,
          message: `Audio clip '${clip.name}' on track '${track.name}' references missing assetId '${clip.assetId}'.`,
          suggestion: "Import the audio file via import_local_asset.",
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const info = issues.filter((i) => i.severity === "info").length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 8 - info * 2);

  return {
    projectId: project.id,
    aspectRatio: project.canvas.aspectRatio,
    durationSec: Number(totalDur.toFixed(2)),
    ok: errors === 0,
    score,
    counts: { errors, warnings, info },
    issues,
  };
}
