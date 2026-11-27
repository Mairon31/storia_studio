import {
  evaluateEasing,
  evaluateKeyframes,
  Layer,
  noise2D,
  PostProcessing,
  Project,
  resolveSceneAtTime,
  Scene,
} from "@storia/schema";
import { clamp, lerp } from "./color.js";
import type {
  EvaluatedCamera,
  EvaluatedEffectClip,
  EvaluatedFrame,
  EvaluatedLayer,
  EvaluatedSubtitleState,
  EvaluatedTransform,
  EvaluatedTransition,
} from "./types.js";

function evalLayerTransformAt(
  layer: Layer,
  localTime: number,
  layerDuration: number,
  globalTime: number,
): EvaluatedTransform {
  const kf = layer.keyframes;
  const base = layer.transform;
  let x = evaluateKeyframes(kf.x, localTime, base.x);
  let y = evaluateKeyframes(kf.y, localTime, base.y);
  let scaleX = evaluateKeyframes(kf.scaleX, localTime, base.scaleX);
  let scaleY = evaluateKeyframes(kf.scaleY, localTime, base.scaleY);
  let rotationDeg = evaluateKeyframes(kf.rotation, localTime, base.rotation);
  let opacity = clamp(evaluateKeyframes(kf.opacity, localTime, base.opacity), 0, 1);

  const motion = layer.motion;
  if (motion) {
    // 1. Enter animation
    if (motion.enter !== "none" && motion.enterDuration > 0 && localTime < motion.enterDuration) {
      const p = clamp(localTime / motion.enterDuration, 0, 1);
      const e = evaluateEasing(p, motion.enter === "elastic" ? "spring" : motion.enter === "pop" || motion.enter === "slam" ? "easeOutBack" : "easeOutCubic");
      switch (motion.enter) {
        case "fade":
        case "blur_in":
          opacity *= e;
          if (motion.enter === "blur_in") {
            scaleX *= 0.92 + 0.08 * e;
            scaleY *= 0.92 + 0.08 * e;
          }
          break;
        case "pop":
        case "elastic":
        case "bounce_in":
          opacity *= clamp(p * 3, 0, 1);
          scaleX *= 0.4 + 0.6 * e;
          scaleY *= 0.4 + 0.6 * e;
          if (motion.enter === "bounce_in") y += (1 - e) * 0.09;
          break;
        case "slam":
        case "stamp":
          opacity *= clamp(p * 4, 0, 1);
          scaleX *= (motion.enter === "stamp" ? 2.0 : 1.65) - (motion.enter === "stamp" ? 1.0 : 0.65) * e;
          scaleY *= (motion.enter === "stamp" ? 2.0 : 1.65) - (motion.enter === "stamp" ? 1.0 : 0.65) * e;
          if (motion.enter === "stamp") rotationDeg += (1 - e) * -12;
          break;
        case "zoom_in":
        case "zoom_punch":
          opacity *= clamp(p * 2.8, 0, 1);
          scaleX *= (motion.enter === "zoom_punch" ? 0.35 : 0.65) + (motion.enter === "zoom_punch" ? 0.65 : 0.35) * e;
          scaleY *= (motion.enter === "zoom_punch" ? 0.35 : 0.65) + (motion.enter === "zoom_punch" ? 0.65 : 0.35) * e;
          break;
        case "zoom_out":
          opacity *= clamp(p * 2.5, 0, 1);
          scaleX *= 1.35 - 0.35 * e;
          scaleY *= 1.35 - 0.35 * e;
          break;
        case "slide_up":
        case "whip_up":
        case "rise_spring":
          opacity *= clamp(p * 2.5, 0, 1);
          y += (1 - e) * (motion.enter === "whip_up" ? 0.38 : 0.14);
          break;
        case "slide_down":
        case "whip_down":
        case "drop_in":
          opacity *= clamp(p * 2.5, 0, 1);
          y -= (1 - e) * (motion.enter === "whip_down" ? 0.38 : motion.enter === "drop_in" ? 0.24 : 0.14);
          break;
        case "slide_left":
        case "whip_left":
          opacity *= clamp(p * 2.5, 0, 1);
          x += (1 - e) * (motion.enter === "whip_left" ? 0.42 : 0.18);
          break;
        case "slide_right":
        case "whip_right":
          opacity *= clamp(p * 2.5, 0, 1);
          x -= (1 - e) * (motion.enter === "whip_right" ? 0.42 : 0.18);
          break;
        case "flip_x":
        case "unfold_y":
          opacity *= clamp(p * 3, 0, 1);
          scaleY *= Math.max(0.05, e);
          break;
        case "flip_y":
        case "unfold_x":
          opacity *= clamp(p * 3, 0, 1);
          scaleX *= Math.max(0.05, e);
          break;
        case "spin_in":
        case "spiral_in":
          opacity *= clamp(p * 2.8, 0, 1);
          scaleX *= 0.2 + 0.8 * e;
          scaleY *= 0.2 + 0.8 * e;
          rotationDeg += (1 - e) * (motion.enter === "spiral_in" ? -360 : -140);
          break;
        case "swing_in":
        case "tilt_pop":
          opacity *= clamp(p * 3, 0, 1);
          rotationDeg += (1 - e) * (motion.enter === "swing_in" ? 26 : -18);
          scaleX *= 0.72 + 0.28 * e;
          scaleY *= 0.72 + 0.28 * e;
          break;
        case "squeeze_in":
        case "rubber_band": {
          opacity *= clamp(p * 3, 0, 1);
          const osc = Math.sin(p * Math.PI * 2.5) * (1 - p) * 0.32;
          scaleX *= 1 + osc;
          scaleY *= Math.max(0.35, 1 - osc);
          break;
        }
        case "glitch":
          opacity *= p < 0.25 ? (Math.sin(p * 90) > 0 ? 0.9 : 0.2) : 1;
          x += (1 - p) * Math.sin(p * 75) * 0.03;
          break;
      }
    }

    // 2. Exit animation
    if (motion.exit !== "none" && motion.exitDuration > 0 && layerDuration > motion.exitDuration) {
      const rem = layerDuration - localTime;
      if (rem >= 0 && rem < motion.exitDuration) {
        const p = clamp(1 - rem / motion.exitDuration, 0, 1);
        const e = evaluateEasing(p, "easeIn");
        switch (motion.exit) {
          case "fade":
          case "blur_out":
            opacity *= 1 - e;
            break;
          case "pop":
          case "zoom_out":
          case "bounce_out":
            opacity *= 1 - e;
            scaleX *= 1 - 0.38 * e;
            scaleY *= 1 - 0.38 * e;
            break;
          case "zoom_in":
          case "slam_out":
            opacity *= 1 - e;
            scaleX *= 1 + 0.55 * e;
            scaleY *= 1 + 0.55 * e;
            break;
          case "slide_up":
            opacity *= 1 - e;
            y -= e * 0.14;
            break;
          case "slide_down":
          case "drop_out":
            opacity *= 1 - e;
            y += e * (motion.exit === "drop_out" ? 0.28 : 0.14);
            break;
          case "slide_left":
          case "whip_left":
            opacity *= 1 - e;
            x -= e * (motion.exit === "whip_left" ? 0.42 : 0.16);
            break;
          case "slide_right":
          case "whip_right":
            opacity *= 1 - e;
            x += e * (motion.exit === "whip_right" ? 0.42 : 0.16);
            break;
          case "flip_x":
            opacity *= 1 - e;
            scaleY *= Math.max(0.05, 1 - e);
            break;
          case "flip_y":
            opacity *= 1 - e;
            scaleX *= Math.max(0.05, 1 - e);
            break;
          case "spin_out":
          case "shrink_spin":
            opacity *= 1 - e;
            scaleX *= Math.max(0.1, 1 - 0.85 * e);
            scaleY *= Math.max(0.1, 1 - 0.85 * e);
            rotationDeg += e * 180;
            break;
          case "glitch_out":
            opacity *= p > 0.7 ? 0 : (Math.sin(p * 95) > 0 ? 1 : 0.15);
            x += e * Math.sin(p * 80) * 0.04;
            break;
        }
      }
    }

    // 3. Continuous Loop Motion
    if (motion.loop !== "none" && motion.loopAmplitude > 0) {
      const amp = motion.loopAmplitude;
      const spd = motion.loopSpeed;
      const t = globalTime * spd;
      switch (motion.loop) {
        case "float":
          y += Math.sin(t * Math.PI) * 0.018 * amp;
          break;
        case "breathe": {
          const s = 1 + Math.sin(t * Math.PI) * 0.045 * amp;
          scaleX *= s;
          scaleY *= s;
          break;
        }
        case "bounce":
          y -= Math.abs(Math.sin(t * Math.PI * 1.4)) * 0.03 * amp;
          break;
        case "wiggle":
          rotationDeg += Math.sin(t * Math.PI * 2) * 6 * amp;
          break;
        case "spin":
          rotationDeg += (globalTime * spd * 45 * amp) % 360;
          break;
        case "pulse": {
          const s = 1 + Math.pow(Math.abs(Math.sin(t * Math.PI * 1.5)), 3) * 0.1 * amp;
          scaleX *= s;
          scaleY *= s;
          break;
        }
        case "shake":
          x += Math.sin(t * 27) * 0.01 * amp;
          y += Math.cos(t * 31) * 0.01 * amp;
          rotationDeg += Math.sin(t * 23) * 2.5 * amp;
          break;
        case "ken_burns": {
          const progress = clamp(localTime / Math.max(0.5, layerDuration), 0, 1);
          const s = 1 + progress * 0.14 * amp;
          scaleX *= s;
          scaleY *= s;
          x += (progress - 0.5) * 0.03 * amp;
          break;
        }
        case "pendulum":
          rotationDeg += Math.sin(t * Math.PI * 1.2) * 11 * amp;
          break;
        case "orbit":
          x += Math.cos(t * Math.PI * 1.2) * 0.024 * amp;
          y += Math.sin(t * Math.PI * 1.2) * 0.024 * amp;
          break;
        case "jitter":
          x += noise2D("loop-jitter", t * 18, 1.3) * 0.012 * amp;
          y += noise2D("loop-jitter", t * 18, 5.7) * 0.012 * amp;
          break;
        case "heartbeat": {
          const beat = Math.pow(Math.abs(Math.sin(t * Math.PI * 1.6)), 6) * 0.14 * amp;
          scaleX *= 1 + beat;
          scaleY *= 1 + beat;
          break;
        }
        case "sway_x":
          x += Math.sin(t * Math.PI) * 0.028 * amp;
          break;
        case "sway_y":
          y += Math.sin(t * Math.PI) * 0.028 * amp;
          break;
        case "flicker":
          opacity *= 0.72 + 0.28 * Math.sin(t * 24) * amp;
          break;
        case "zoom_breathe": {
          const s = 1 + (0.5 + 0.5 * Math.sin(t * Math.PI * 0.9)) * 0.12 * amp;
          scaleX *= s;
          scaleY *= s;
          break;
        }
        case "tilt_rock":
          rotationDeg += Math.sin(t * Math.PI * 0.85) * 7.5 * amp;
          y += Math.cos(t * Math.PI * 1.7) * 0.008 * amp;
          break;
        case "hover_drift":
          x += noise2D("hover-drift", t * 0.55, 1.1) * 0.022 * amp;
          y += noise2D("hover-drift", t * 0.55, 4.9) * 0.022 * amp;
          break;
        case "rubber_pulse": {
          const s = Math.sin(t * Math.PI * 2) * 0.09 * amp;
          scaleX *= 1 + s;
          scaleY *= Math.max(0.5, 1 - s);
          break;
        }
      }
    }
  }

  return {
    x,
    y,
    scaleX,
    scaleY,
    rotationDeg,
    opacity: clamp(opacity, 0, 1),
    flipX: base.flipX,
    flipY: base.flipY,
    anchorX: base.anchor.x,
    anchorY: base.anchor.y,
  };
}

function evaluateEffectClips(project: Project, globalTimeSec: number): EvaluatedEffectClip[] {
  const clips = project.effectClips ?? [];
  const active: EvaluatedEffectClip[] = [];
  for (const clip of clips) {
    if (!clip.enabled) continue;
    const end = clip.start + clip.duration;
    if (globalTimeSec < clip.start || globalTimeSec > end) continue;
    const localTime = globalTimeSec - clip.start;
    const progress = clamp(localTime / Math.max(0.01, clip.duration), 0, 1);

    let env = 1;
    if (clip.fadeIn > 0.005 && localTime < clip.fadeIn) {
      env = Math.min(env, clamp(localTime / clip.fadeIn, 0, 1));
    }
    const rem = end - globalTimeSec;
    if (clip.fadeOut > 0.005 && rem < clip.fadeOut) {
      env = Math.min(env, clamp(rem / clip.fadeOut, 0, 1));
    }

    active.push({
      clip,
      localTime,
      progress,
      weight: env * clip.intensity,
    });
  }
  return active;
}

function resolveFramingBase(
  scene: Scene,
  layers: readonly EvaluatedLayer[],
): { x: number; y: number; zoom: number } {
  const framing = scene.camera.framing;
  if (framing === "default") {
    return { x: scene.camera.x, y: scene.camera.y, zoom: scene.camera.zoom };
  }
  const target = scene.camera.framingTargetLayerId
    ? layers.find((l) => l.layer.id === scene.camera.framingTargetLayerId)
    : layers.find((l) => l.layer.type === "character" && l.visibleAtTime);

  const tx = target ? target.transform.x : 0.5;
  const ty = target ? target.transform.y - 0.14 : 0.5;

  switch (framing) {
    case "establishing":
      return { x: 0.5, y: 0.48, zoom: Math.max(1.0, scene.camera.zoom) };
    case "wide":
      return { x: 0.5, y: 0.5, zoom: Math.max(1.02, scene.camera.zoom) };
    case "medium":
      return { x: lerp(0.5, tx, 0.45), y: lerp(0.5, ty, 0.35), zoom: Math.max(1.12, scene.camera.zoom) };
    case "closeup":
      return { x: lerp(0.5, tx, 0.72), y: lerp(0.5, ty - 0.06, 0.65), zoom: Math.max(1.26, scene.camera.zoom) };
    case "extreme_closeup":
      return { x: lerp(0.5, tx, 0.85), y: lerp(0.5, ty - 0.1, 0.78), zoom: Math.max(1.38, scene.camera.zoom) };
    case "low_angle":
      return { x: 0.5, y: 0.45, zoom: Math.max(1.1, scene.camera.zoom) };
    case "over_shoulder":
      return { x: lerp(0.5, tx, 0.55), y: lerp(0.5, ty - 0.03, 0.45), zoom: Math.max(1.18, scene.camera.zoom) };
  }
}

function evaluateCamera(
  scene: Scene,
  sceneIndex: number,
  localTime: number,
  globalTime: number,
  layers: readonly EvaluatedLayer[],
  activeEffects: readonly EvaluatedEffectClip[],
): EvaluatedCamera {
  const cam = scene.camera;
  const framingBase = resolveFramingBase(scene, layers);
  let x = evaluateKeyframes(cam.keyframes.cameraX, localTime, framingBase.x);
  let y = evaluateKeyframes(cam.keyframes.cameraY, localTime, framingBase.y);
  let zoom = clamp(evaluateKeyframes(cam.keyframes.cameraZoom, localTime, framingBase.zoom), 0.25, 6);
  let rotationDeg = evaluateKeyframes(cam.keyframes.cameraRotation, localTime, cam.rotation);

  let shakeX = 0;
  let shakeY = 0;
  let chromaticBurst = 0;

  if (cam.handheld.enabled && cam.handheld.intensity > 0) {
    const f = cam.handheld.frequency;
    const seed = `cam-handheld-${sceneIndex}`;
    const amp = cam.handheld.intensity * 0.0075;
    // Remotion-style deterministic Simplex Noise for organic cinema handheld drift
    shakeX += (noise2D(seed, globalTime * 0.55 * f, 1.1) * 0.72 + noise2D(seed, globalTime * 1.45 * f, 4.3) * 0.28) * amp;
    shakeY += (noise2D(seed, globalTime * 0.48 * f, 7.7) * 0.72 + noise2D(seed, globalTime * 1.32 * f, 11.9) * 0.28) * amp;
    rotationDeg += noise2D(seed, globalTime * 0.42 * f, 19.3) * cam.handheld.intensity * 0.72;
  }

  for (const imp of cam.impulses) {
    const dt = localTime - imp.t;
    if (dt >= 0 && dt <= imp.duration) {
      const decay = 1 - dt / Math.max(0.01, imp.duration);
      const decaySq = decay * decay;
      const impSeed = `cam-imp-${sceneIndex}-${imp.t.toFixed(2)}`;
      shakeX += noise2D(impSeed, dt * 16, 1.3) * imp.intensity * 0.016 * decaySq;
      shakeY += noise2D(impSeed, dt * 15, 5.7) * imp.intensity * 0.016 * decaySq;
      rotationDeg += noise2D(impSeed, dt * 12, 9.1) * imp.intensity * 1.7 * decaySq;
      chromaticBurst = Math.max(chromaticBurst, imp.chromaticBurst * decay);
    }
  }

  // Apply timed CapCut-style Motion / Camera Effect Clips
  for (const eff of activeEffects) {
    const w = eff.weight;
    const spd = eff.clip.speed;
    if (w <= 0.005) continue;
    switch (eff.clip.effectType) {
      case "camera_shake": {
        const effSeed = `eff-shake-${eff.clip.id}`;
        shakeX += noise2D(effSeed, eff.localTime * 14 * spd, 0.7) * 0.018 * w;
        shakeY += noise2D(effSeed, eff.localTime * 13 * spd, 3.9) * 0.018 * w;
        rotationDeg += noise2D(effSeed, eff.localTime * 11 * spd, 8.2) * 2.0 * w;
        chromaticBurst = Math.max(chromaticBurst, 0.25 * w);
        break;
      }
      case "handheld_drift": {
        const effSeed = `eff-drift-${eff.clip.id}`;
        shakeX += noise2D(effSeed, globalTime * 0.65 * spd, 1.4) * 0.012 * w;
        shakeY += noise2D(effSeed, globalTime * 0.58 * spd, 6.2) * 0.011 * w;
        rotationDeg += noise2D(effSeed, globalTime * 0.45 * spd, 12.5) * 1.25 * w;
        break;
      }
      case "punch_zoom": {
        const bump = Math.sin(eff.progress * Math.PI);
        zoom = clamp(zoom * (1 + bump * 0.22 * w), 0.25, 6);
        chromaticBurst = Math.max(chromaticBurst, bump * 0.35 * w);
        break;
      }
      case "dolly_zoom":
        zoom = clamp(zoom * (1 + eff.progress * 0.24 * w), 0.25, 6);
        break;
      case "dutch_sway":
        rotationDeg += Math.sin(eff.localTime * 2.1 * spd) * 4.5 * w;
        break;
      case "ken_burns":
        zoom = clamp(zoom * (1 + eff.progress * 0.16 * w), 0.25, 6);
        x += (eff.progress - 0.5) * 0.04 * w;
        y += (eff.progress - 0.5) * 0.02 * w;
        break;
      case "beat_pulse": {
        const beat = Math.pow(Math.abs(Math.sin(eff.localTime * Math.PI * 2 * spd)), 4);
        zoom = clamp(zoom * (1 + beat * 0.1 * w), 0.25, 6);
        chromaticBurst = Math.max(chromaticBurst, beat * 0.3 * w);
        break;
      }
      case "whip_pan_loop": {
        const wave = Math.sin(eff.localTime * Math.PI * 1.5 * spd);
        shakeX += wave * 0.06 * w;
        chromaticBurst = Math.max(chromaticBurst, Math.abs(wave) * 0.4 * w);
        break;
      }
      case "zoom_breathe": {
        const breathe = 0.5 + 0.5 * Math.sin(eff.localTime * Math.PI * 0.9 * spd);
        zoom = clamp(zoom * (1 + breathe * 0.14 * w), 0.25, 6);
        break;
      }
      case "earthquake_heavy": {
        const eqSeed = `eff-eq-${eff.clip.id}`;
        shakeX += noise2D(eqSeed, eff.localTime * 22 * spd, 1.1) * 0.036 * w;
        shakeY += noise2D(eqSeed, eff.localTime * 20 * spd, 5.4) * 0.036 * w;
        rotationDeg += noise2D(eqSeed, eff.localTime * 18 * spd, 9.7) * 4.2 * w;
        chromaticBurst = Math.max(chromaticBurst, 0.55 * w);
        break;
      }
      case "orbit_drift": {
        shakeX += Math.cos(eff.localTime * 1.3 * spd) * 0.022 * w;
        shakeY += Math.sin(eff.localTime * 1.3 * spd) * 0.018 * w;
        zoom = clamp(zoom * (1 + 0.06 * w), 0.25, 6);
        break;
      }
      case "vertigo_tilt": {
        const p = eff.progress;
        zoom = clamp(zoom * (1 + Math.sin(p * Math.PI) * 0.22 * w), 0.25, 6);
        rotationDeg += Math.sin(eff.localTime * 1.6 * spd) * 8.5 * w;
        break;
      }
    }
  }

  return {
    x,
    y,
    zoom,
    rotationDeg,
    shakeX,
    shakeY,
    chromaticBurst,
    parallaxStrength: cam.parallaxStrength,
  };
}

function evaluateSubtitle(project: Project, globalTimeSec: number): EvaluatedSubtitleState | null {
  const track = project.subtitles;
  if (!track.enabled || track.cues.length === 0) return null;

  const cue = track.cues.find((c) => globalTimeSec >= c.start && globalTimeSec <= c.end);
  if (!cue) return null;

  const cueDur = Math.max(0.01, cue.end - cue.start);
  const progressInCue = clamp((globalTimeSec - cue.start) / cueDur, 0, 1);

  const effectiveAnimIn = cue.styleOverride?.animationIn ?? track.style.animationIn;
  const effectiveAnimOut = cue.styleOverride?.animationOut ?? track.style.animationOut;
  const fadeInDur = Math.min(0.24, cueDur * 0.28);
  const fadeOutDur = Math.min(0.20, cueDur * 0.25);
  const enterProgress = clamp((globalTimeSec - cue.start) / Math.max(0.01, fadeInDur), 0, 1);
  const exitProgress = clamp((cue.end - globalTimeSec) / Math.max(0.01, fadeOutDur), 0, 1);
  const fadeAlpha = Math.min(
    effectiveAnimIn === "none" ? 1 : evaluateEasing(enterProgress, "easeOut"),
    effectiveAnimOut === "none" ? 1 : evaluateEasing(exitProgress, "easeOut"),
  );

  const words = cue.words.length > 0
    ? cue.words
    : cue.text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((w, idx, arr) => ({
          id: `${cue.id}_auto_${idx}`,
          text: w,
          start: cue.start + (idx / arr.length) * cueDur,
          end: cue.start + ((idx + 1) / arr.length) * cueDur,
          emphasis: "normal" as const,
        }));

  const maxPerWin = Math.max(1, cue.styleOverride?.maxWordsPerWindow ?? track.style.maxWordsPerWindow);
  let activeIdx = words.findIndex((w) => globalTimeSec >= w.start && globalTimeSec <= w.end);
  if (activeIdx === -1) {
    activeIdx = 0;
    for (let i = 0; i < words.length; i++) {
      if (globalTimeSec >= words[i]!.start) activeIdx = i;
    }
  }

  const winIndex = Math.floor(activeIdx / maxPerWin);
  const startIdx = winIndex * maxPerWin;
  const windowWords = words.slice(startIdx, startIdx + maxPerWin);
  const activeWord = words[activeIdx] ?? null;
  const activeWordProgress = activeWord
    ? clamp((globalTimeSec - activeWord.start) / Math.max(0.04, activeWord.end - activeWord.start), 0, 1)
    : 0;

  return {
    cue,
    windowWords,
    activeWordId: activeWord ? activeWord.id : null,
    activeWordProgress,
    progressInCue,
    fadeAlpha,
    enterProgress,
    exitProgress,
    globalTimeSec,
  };
}

function mergePostProcessing(base: PostProcessing, override?: Partial<PostProcessing>): PostProcessing {
  if (!override) return base;
  return {
    ...base,
    ...override,
    psx: { ...base.psx, ...(override.psx ?? {}) },
    pixelArt: { ...base.pixelArt, ...(override.pixelArt ?? {}) },
    halation: { ...base.halation, ...(override.halation ?? {}) },
    chromaticAberration: { ...base.chromaticAberration, ...(override.chromaticAberration ?? {}) },
    filmGrain: { ...base.filmGrain, ...(override.filmGrain ?? {}) },
    vignette: { ...base.vignette, ...(override.vignette ?? {}) },
  };
}

/**
 * Pure deterministic frame evaluation — zero browser/WebGL dependencies.
 * Guarantees 1:1 state parity between Viewport (60 FPS), capture_frame, and FFmpeg Exporter.
 */
export function evaluateSceneFrame(project: Project, globalTimeSec: number): EvaluatedFrame | null {
  const resolved = resolveSceneAtTime(project, globalTimeSec);
  if (!resolved) return null;

  const { scene, sceneIndex, sceneStart, localTime } = resolved;
  const dt = 1 / Math.max(1, project.canvas.fps);
  const frameIndex = Math.max(0, Math.floor(globalTimeSec * project.canvas.fps + 1e-6));
  const activeEffects = evaluateEffectClips(project, globalTimeSec);

  const sortedLayers = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const evaluatedLayers: EvaluatedLayer[] = sortedLayers.map((layer) => {
    const layerEnd = layer.duration !== undefined ? layer.start + layer.duration : scene.duration;
    const layerDuration = Math.max(0.05, layerEnd - layer.start);
    const visibleAtTime = layer.visible && localTime >= layer.start && localTime <= layerEnd;
    const layerLocalTime = Math.max(0, localTime - layer.start);
    const transform = evalLayerTransformAt(layer, layerLocalTime, layerDuration, globalTimeSec);

    const prevTransform = evalLayerTransformAt(layer, Math.max(0, layerLocalTime - dt), layerDuration, Math.max(0, globalTimeSec - dt));
    const vx = (transform.x - prevTransform.x) / dt;
    const vy = (transform.y - prevTransform.y) / dt;
    const speedNormPerSec = Math.hypot(vx, vy);

    return {
      layer,
      localTime: layerLocalTime,
      visibleAtTime,
      transform,
      speedNormPerSec,
      movingLeft: vx < -0.004,
    };
  });

  const camera = evaluateCamera(scene, sceneIndex, localTime, globalTimeSec, evaluatedLayers, activeEffects);
  const subtitle = evaluateSubtitle(project, globalTimeSec);
  const postProcessing = mergePostProcessing(project.postProcessing, scene.postProcessingOverride);

  let transition: EvaluatedTransition | null = null;
  if (scene.transitionIn.type !== "cut" && scene.transitionIn.duration > 0 && localTime < scene.transitionIn.duration) {
    transition = {
      type: scene.transitionIn.type,
      progress: clamp(localTime / scene.transitionIn.duration, 0, 1),
      phase: "in",
      accentColor: scene.transitionIn.accentColor ?? "#ffd447",
    };
  } else if (
    scene.transitionOut.type !== "cut" &&
    scene.transitionOut.duration > 0 &&
    localTime > scene.duration - scene.transitionOut.duration
  ) {
    const rem = scene.duration - localTime;
    transition = {
      type: scene.transitionOut.type,
      progress: clamp(1 - rem / scene.transitionOut.duration, 0, 1),
      phase: "out",
      accentColor: scene.transitionOut.accentColor ?? "#ffd447",
    };
  }

  return {
    project,
    globalTimeSec,
    frameIndex,
    scene,
    sceneIndex,
    sceneStart,
    localTime,
    camera,
    layers: evaluatedLayers,
    subtitle,
    postProcessing,
    transition,
    activeEffects,
  };
}
