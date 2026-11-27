import type { Asset, AudioClip, AudioFadeCurve, AudioTrack } from "@storia/schema";

interface DecodedAudioEntry {
  buffer: AudioBuffer;
  peaks: number[];
}

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

  private ensureContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume();
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

    // Compute initial gain at offsetInClip
    let initFactor = 1;
    if (fadeIn > 0.01 && offsetInClip < fadeIn) {
      initFactor *= evalFadeFactor(offsetInClip / fadeIn, curve);
    }
    if (fadeOut > 0.01 && offsetInClip > fadeOutStart) {
      initFactor *= 1 - evalFadeFactor((offsetInClip - fadeOutStart) / fadeOut, curve);
    }

    try {
      gainParam.setValueAtTime(Math.max(0.0001, safeTarget * initFactor), playStartCtxTime);

      // Schedule remaining fade-in segment
      let fadeInEndCtxTime = playStartCtxTime;
      if (fadeIn > 0.01 && offsetInClip < fadeIn) {
        const remFadeIn = Math.min(fadeIn - offsetInClip, remainingDur);
        if (remFadeIn > 0.015) {
          const startProg = offsetInClip / fadeIn;
          const endProg = Math.min(1, (offsetInClip + remFadeIn) / fadeIn);
          fadeInEndCtxTime = playStartCtxTime + remFadeIn;
          if (curve === "linear") {
            gainParam.linearRampToValueAtTime(safeTarget * endProg, fadeInEndCtxTime);
          } else {
            const vals = buildFadeCurveArray(0.0001, safeTarget, curve, true, startProg, endProg);
            gainParam.setValueCurveAtTime(vals, playStartCtxTime + 0.001, Math.max(0.01, remFadeIn - 0.002));
          }
        }
      }

      // Schedule fade-out segment (strictly non-overlapping for Safari WebKit AudioParam compliance)
      if (fadeOut > 0.01) {
        const fadeOutRelStart = Math.max(0, fadeOutStart - offsetInClip);
        const fadeOutCtxStart = Math.max(fadeInEndCtxTime + 0.004, playStartCtxTime + fadeOutRelStart);
        const clipEndCtxTime = playStartCtxTime + remainingDur;
        const fadeOutDur = clipEndCtxTime - fadeOutCtxStart;
        if (fadeOutDur > 0.015) {
          const startProg = Math.max(0, Math.min(0.95, (offsetInClip - fadeOutStart) / fadeOut));
          if (fadeOutCtxStart > fadeInEndCtxTime + 0.006 && offsetInClip + fadeOutRelStart >= fadeIn) {
            gainParam.setValueAtTime(safeTarget, fadeOutCtxStart - 0.002);
          }
          if (curve === "linear") {
            gainParam.linearRampToValueAtTime(0.0001, fadeOutCtxStart + fadeOutDur);
          } else {
            const vals = buildFadeCurveArray(safeTarget, 0.0001, curve, false, startProg, 1);
            gainParam.setValueCurveAtTime(vals, fadeOutCtxStart, Math.max(0.01, fadeOutDur));
          }
        }
      }
    } catch {
      // Fallback safely on strict WebKit AudioParam overlap checks
      try {
        gainParam.cancelScheduledValues(playStartCtxTime);
        gainParam.setValueAtTime(safeTarget, playStartCtxTime);
      } catch {
        // Ignore
      }
    }
  }

  async startPlayback(
    tracks: readonly AudioTrack[],
    assets: readonly Asset[],
    fromTimeSec: number,
  ): Promise<void> {
    this.stopAll();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const assetMap = new Map(assets.map((a) => [a.id, a]));
    const trackMap = new Map(tracks.map((t) => [t.id, t]));
    const anySolo = tracks.some((t) => t.solo);

    // Pre-decode all active clips first so they all start tightly synchronized on the same clock tick
    interface ScheduledItem {
      track: AudioTrack;
      clip: AudioClip;
      entry: DecodedAudioEntry;
      duckFactor: number;
    }

    const items: ScheduledItem[] = [];
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
        const entry = await this.loadAssetAudio(asset);
        if (!entry) continue;
        items.push({ track, clip, entry, duckFactor });
      }
    }

    const now = ctx.currentTime + 0.02;

    for (const { track, clip, entry, duckFactor } of items) {
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

      const startDelay = Math.max(0, clip.start - fromTimeSec);
      const offsetInClip = Math.max(0, fromTimeSec - clip.start);
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
