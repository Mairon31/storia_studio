import type { Asset, AudioClip, AudioFadeCurve, AudioTrack } from "@storia/schema";

interface DecodedAudioEntry {
  buffer: AudioBuffer;
  peaks: number[];
}

const MIN_FADE_SEC = 0.005;
const LINEAR_FALLBACK_MAX_SEC = 0.06;

function evalFadeFactor(progress: number, curve: AudioFadeCurve): number {
  const p = Math.max(0, Math.min(1, progress));
  switch (curve) {
    case "linear":
      return p;
    case "exp":
      return p * p;
    case "log":
      return Math.sqrt(p);
    case "smooth":
    default:
      // Half-sine / smooth cosine S-curve matching FFmpeg `afade=curve=hsin`
      return 0.5 - 0.5 * Math.cos(Math.PI * p);
  }
}

function buildFadeCurveArray(
  fromGain: number,
  toGain: number,
  curve: AudioFadeCurve,
  isFadeIn: boolean,
  startProgress: number,
  endProgress: number,
  samples = 32,
): Float32Array {
  const arr = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const frac = i / Math.max(1, samples - 1);
    const p = startProgress + (endProgress - startProgress) * frac;
    const f = isFadeIn ? evalFadeFactor(p, curve) : 1 - evalFadeFactor(p, curve);
    arr[i] = Math.max(0.0001, isFadeIn ? toGain * f : fromGain * f);
  }
  return arr;
}

/**
 * Web Audio API multi-track playback & waveform generator.
 * Plays synchronized voice, music, and SFX clips during 60 FPS preview with
 * 1:1 Fade In / Fade Out curves (linear, smooth, exp, log), live ducking,
 * and normalized waveform peaks for the Timeline.
 */
class StudioAudioEngine {
  private ctx: AudioContext | null = null;
  private cache = new Map<string, DecodedAudioEntry>();
  private loading = new Map<string, Promise<DecodedAudioEntry | null>>();
  private activeNodes: AudioBufferSourceNode[] = [];
  private playbackSessionId = 0;

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    return this.ctx;
  }

  async loadAssetAudio(asset: Asset): Promise<DecodedAudioEntry | null> {
    if (asset.kind !== "audio") return null;
    const cached = this.cache.get(asset.id);
    if (cached) return cached;
    const inflight = this.loading.get(asset.id);
    if (inflight) return inflight;

    const promise = (async () => {
      const ctx = this.ensureContext();
      if (!ctx) return null;
      try {
        const res = await fetch(asset.src, {
          credentials: "same-origin",
          headers: { "ngrok-skip-browser-warning": "true" },
        });
        if (!res.ok) return null;
        const arr = await res.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arr);
        const peaks = computeWaveformPeaks(buffer, 160);
        const entry = { buffer, peaks };
        this.cache.set(asset.id, entry);
        return entry;
      } catch {
        return null;
      } finally {
        this.loading.delete(asset.id);
      }
    })();

    this.loading.set(asset.id, promise);
    return promise;
  }

  getCachedPeaks(assetId: string): number[] | null {
    return this.cache.get(assetId)?.peaks ?? null;
  }

  stopAll(): void {
    this.playbackSessionId++;
    for (const node of this.activeNodes) {
      try {
        node.stop();
        node.disconnect();
      } catch {
        // Already stopped
      }
    }
    this.activeNodes = [];
  }

  private scheduleClipGainEnvelope(
    gainParam: AudioParam,
    clip: AudioClip,
    targetGain: number,
    playStartCtxTime: number,
    offsetInClip: number,
    remainingDur: number,
  ): void {
    const safeTarget = Math.max(0.0001, Math.min(2.5, targetGain));
    const curve: AudioFadeCurve = clip.fadeCurve ?? "smooth";
    const fadeIn = Math.min(Math.max(0, clip.fadeIn ?? 0), clip.duration * 0.95);
    const fadeOut = Math.min(Math.max(0, clip.fadeOut ?? 0), clip.duration * 0.95);
    const fadeOutStart = Math.max(fadeIn, clip.duration - fadeOut);

    const remFadeIn =
      fadeIn >= MIN_FADE_SEC && offsetInClip < fadeIn
        ? Math.min(fadeIn - offsetInClip, remainingDur)
        : 0;
    const applyFadeIn = remFadeIn >= MIN_FADE_SEC;

    // Only attenuate initial gain when a fade-in ramp is actually scheduled; otherwise start at full targetGain
    let initFactor = 1;
    if (applyFadeIn) {
      initFactor *= evalFadeFactor(offsetInClip / fadeIn, curve);
    }
    if (fadeOut >= MIN_FADE_SEC && offsetInClip > fadeOutStart) {
      initFactor *= 1 - evalFadeFactor((offsetInClip - fadeOutStart) / fadeOut, curve);
    }

    const initGain = Math.max(0.0001, safeTarget * initFactor);

    try {
      gainParam.setValueAtTime(initGain, playStartCtxTime);

      let fadeInEndCtxTime = playStartCtxTime;
      if (applyFadeIn) {
        const startProg = offsetInClip / fadeIn;
        const endProg = Math.min(1, (offsetInClip + remFadeIn) / fadeIn);
        const endGain = Math.max(0.0001, safeTarget * evalFadeFactor(endProg, curve));
        fadeInEndCtxTime = playStartCtxTime + remFadeIn;

        if (curve === "linear" || remFadeIn <= LINEAR_FALLBACK_MAX_SEC) {
          gainParam.linearRampToValueAtTime(endGain, fadeInEndCtxTime);
        } else {
          const vals = buildFadeCurveArray(0.0001, safeTarget, curve, true, startProg, endProg);
          vals[0] = initGain;
          vals[vals.length - 1] = endGain;
          gainParam.setValueCurveAtTime(vals, playStartCtxTime + 0.0005, Math.max(MIN_FADE_SEC, remFadeIn - 0.001));
        }

        if (endProg >= 0.999) {
          gainParam.setValueAtTime(safeTarget, fadeInEndCtxTime + 0.001);
        }
      }

      // Schedule fade-out segment strictly after fade-in finishes
      if (fadeOut >= MIN_FADE_SEC) {
        const fadeOutRelStart = Math.max(0, fadeOutStart - offsetInClip);
        const fadeOutCtxStart = Math.max(fadeInEndCtxTime + 0.003, playStartCtxTime + fadeOutRelStart);
        const clipEndCtxTime = playStartCtxTime + remainingDur;
        const fadeOutDur = clipEndCtxTime - fadeOutCtxStart;
        if (fadeOutDur >= MIN_FADE_SEC) {
          const startProg = Math.max(0, Math.min(0.95, (offsetInClip - fadeOutStart) / fadeOut));
          const fadeOutStartGain = Math.max(0.0001, safeTarget * (1 - evalFadeFactor(startProg, curve)));
          if (fadeOutCtxStart > fadeInEndCtxTime + 0.004) {
            gainParam.setValueAtTime(fadeOutStartGain, fadeOutCtxStart);
          }
          if (curve === "linear" || fadeOutDur <= LINEAR_FALLBACK_MAX_SEC) {
            gainParam.linearRampToValueAtTime(0.0001, fadeOutCtxStart + fadeOutDur);
          } else {
            const vals = buildFadeCurveArray(safeTarget, 0.0001, curve, false, startProg, 1);
            vals[0] = fadeOutStartGain;
            gainParam.setValueCurveAtTime(vals, fadeOutCtxStart + 0.0005, Math.max(MIN_FADE_SEC, fadeOutDur - 0.001));
          }
        }
      }
    } catch {
      // Safe fallback so no clip can ever get stuck at 0.0001 (-80 dB)
      try {
        gainParam.cancelScheduledValues(playStartCtxTime);
        gainParam.setValueAtTime(safeTarget, playStartCtxTime);
      } catch {
        gainParam.value = safeTarget;
      }
    }
  }

  async startPlayback(
    tracks: readonly AudioTrack[],
    assets: readonly Asset[],
    fromTimeSec: number,
  ): Promise<void> {
    this.stopAll();
    const sessionId = this.playbackSessionId;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const wallStart = performance.now();

    // Wait for suspended AudioContext to unlock on Windows WebView2 / Chromium before reading ctx.currentTime
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Continue best-effort if resume fails
      }
    }
    if (sessionId !== this.playbackSessionId) return;

    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const anySolo = tracks.some((t) => t.solo);

    interface PendingItem {
      track: AudioTrack;
      clip: AudioClip;
      asset: Asset;
      duckFactor: number;
    }

    const pending: PendingItem[] = [];
    for (const track of tracks) {
      if (track.muted) continue;
      if (anySolo && !track.solo) continue;

      const duckTrack = track.duckUnderTrackId ? trackMap.get(track.duckUnderTrackId) : undefined;
      const hasDuckTrigger = Boolean(duckTrack && !duckTrack.muted && duckTrack.clips.length > 0);
      const duckFactor = hasDuckTrigger ? Math.pow(10, (track.duckAmountDb ?? -8) / 20) : 1;

      for (const clip of track.clips) {
        const clipEnd = clip.start + clip.duration;
        if (clipEnd <= fromTimeSec) continue;
        const asset = assetMap.get(clip.assetId);
        if (!asset) continue;
        pending.push({ track, clip, asset, duckFactor });
      }
    }

    // Decode all needed audio assets in parallel so multi-clip narration stays tightly synchronized
    const decoded = await Promise.all(
      pending.map(async (item) => ({
        ...item,
        entry: await this.loadAssetAudio(item.asset),
      })),
    );
    if (sessionId !== this.playbackSessionId) return;

    // Compensate for any wall-clock elapsed during async resume/decode so audio matches the rAF playhead
    const decodeElapsedSec = Math.max(0, (performance.now() - wallStart) / 1000);
    const effectiveFromTimeSec = fromTimeSec + decodeElapsedSec;

    const now = ctx.currentTime + 0.015;

    for (const { track, clip, entry, duckFactor } of decoded) {
      if (!entry) continue;
      const clipEnd = clip.start + clip.duration;
      if (clipEnd <= effectiveFromTimeSec) continue;

      const source = ctx.createBufferSource();
      source.buffer = entry.buffer;
      source.loop = clip.loop;

      const gainNode = ctx.createGain();
      const targetGain = Math.pow(10, clip.gainDb / 20) * track.volume * duckFactor;

      const panner = typeof ctx.createStereoPanner === "function" ? ctx.createStereoPanner() : null;
      if (panner) {
        panner.pan.value = Math.max(-1, Math.min(1, clip.pan));
        source.connect(gainNode);
        gainNode.connect(panner);
        panner.connect(ctx.destination);
      } else {
        source.connect(gainNode);
        gainNode.connect(ctx.destination);
      }

      const startDelay = Math.max(0, clip.start - effectiveFromTimeSec);
      const offsetInClip = Math.max(0, effectiveFromTimeSec - clip.start);
      const remainingDur = Math.max(0.01, clip.duration - offsetInClip);
      const bufferOffset = clip.trimStart + offsetInClip;

      if (bufferOffset < entry.buffer.duration || clip.loop) {
        const playStartCtxTime = now + startDelay;
        this.scheduleClipGainEnvelope(
          gainNode.gain,
          clip,
          targetGain,
          playStartCtxTime,
          offsetInClip,
          remainingDur,
        );
        source.onended = () => {
          try {
            source.disconnect();
            gainNode.disconnect();
            panner?.disconnect();
          } catch {
            // Ignore cleanup errors
          }
        };
        try {
          source.start(playStartCtxTime, bufferOffset % entry.buffer.duration, remainingDur);
          this.activeNodes.push(source);
        } catch {
          try {
            source.disconnect();
            gainNode.disconnect();
            panner?.disconnect();
          } catch {
            // Ignore
          }
        }
      }
    }
  }
}

export function computeWaveformPeaks(buffer: AudioBuffer, bars = 160): number[] {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / bars));
  const peaks: number[] = [];
  let maxVal = 0.001;

  for (let i = 0; i < bars; i++) {
    const start = i * blockSize;
    const end = Math.min(channel.length, start + blockSize);
    let peak = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(channel[j] ?? 0);
      if (v > peak) peak = v;
    }
    if (peak > maxVal) maxVal = peak;
    peaks.push(peak);
  }
  return peaks.map((p) => Number((p / maxVal).toFixed(3)));
}

export const audioEngine = new StudioAudioEngine();
