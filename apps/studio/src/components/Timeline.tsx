import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignEndVertical,
  AlignStartVertical,
  Bookmark,
  Captions,
  Clapperboard,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Gauge,
  Layers,
  Link2,
  Mic,
  Minus,
  MoreHorizontal,
  Music,
  Plus,
  RefreshCw,
  Scissors,
  Shuffle,
  Snowflake,
  Sparkles,
  Trash2,
  TrendingUp,
  Volume2,
  VolumeX,
  Wand2,
} from "lucide-react";
import {
  type AnimatableProperty,
  type SubtitleWord,
  evaluateKeyframes,
  getProjectDuration,
  resolveSceneAtTime,
} from "@storia/schema";
import { studioApi } from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";

const LABEL_COL_W = 148;

interface AudioContextMenuState {
  x: number;
  y: number;
  trackId: string;
  clipId: string;
  clipName: string;
}

interface LayerContextMenuState {
  x: number;
  y: number;
  sceneId: string;
  layerId: string;
  layerName: string;
  layerType: string;
  visible: boolean;
}

interface AudioClipDragState {
  trackId: string;
  clipId: string;
  mode: "move" | "resize-left" | "resize-right";
  startClientX: number;
  origStart: number;
  origDuration: number;
  origTrimStart: number;
  maxAssetDuration: number | null;
  loop: boolean;
  moved: boolean;
}

interface AudioFadeDragState {
  trackId: string;
  clipId: string;
  side: "in" | "out";
  startClientX: number;
  origFade: number;
  clipDuration: number;
}

interface EffectDragState {
  effectClipId: string;
  mode: "move" | "resize-left" | "resize-right";
  startClientX: number;
  origStart: number;
  origDuration: number;
  moved: boolean;
}

interface SceneResizeDragState {
  sceneId: string;
  prevSceneId?: string;
  mode: "resize-right" | "rolling-left";
  startClientX: number;
  origSceneStart: number;
  origDuration: number;
  origPrevDuration?: number;
  moved: boolean;
}

interface LayerDragState {
  sceneId: string;
  sceneStart: number;
  sceneDuration: number;
  layerId: string;
  mode: "move" | "resize-left" | "resize-right";
  startClientX: number;
  origStart: number;
  origDuration: number;
  moved: boolean;
}

interface SubtitleCueDragState {
  cueId: string;
  mode: "move" | "resize-left" | "resize-right";
  startClientX: number;
  origStart: number;
  origEnd: number;
  origWords: SubtitleWord[];
  moved: boolean;
}

interface MarkerDragState {
  markerId: string;
  startClientX: number;
  origT: number;
  moved: boolean;
}

const WaveformBar: React.FC<{ assetId: string; width: number; height: number; color: string }> = ({
  assetId,
  width,
  height,
  color,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const project = useStudioStore((s) => s.project);
  const [peaks, setPeaks] = useState<number[] | null>(() => audioEngine.getCachedPeaks(assetId));

  useEffect(() => {
    setPeaks(audioEngine.getCachedPeaks(assetId));
  }, [assetId]);

  useEffect(() => {
    if (peaks) return;
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;
    let alive = true;
    void audioEngine.loadAssetAudio(asset).then((entry) => {
      if (alive && entry) setPeaks(entry.peaks);
    });
    return () => {
      alive = false;
    };
  }, [assetId, project.assets, peaks]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const data = peaks ?? Array.from({ length: 48 }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 0.55)));
    const barW = Math.max(1.5, width / data.length);
    ctx.fillStyle = color;
    for (let i = 0; i < data.length; i++) {
      const amp = Math.max(0.08, data[i] ?? 0.15);
      const bh = amp * (height - 6);
      ctx.fillRect(i * barW, (height - bh) * 0.5, Math.max(1, barW - 1), bh);
    }
  }, [peaks, width, height, color]);

  return <canvas ref={canvasRef} width={Math.max(10, Math.round(width))} height={height} className="block opacity-75" />;
};

export interface TimelineProps {
  compact?: boolean;
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ compact = false, className }) => {
  const labelColW = compact ? 76 : LABEL_COL_W;
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const timelineZoom = useStudioStore((s) => s.timelineZoom);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const selectedLayerId = useStudioStore((s) => s.selectedLayerId);
  const selectedEffectClipId = useStudioStore((s) => s.selectedEffectClipId);
  const selectedAudioClip = useStudioStore((s) => s.selectedAudioClip);
  const selectedCueId = useStudioStore((s) => s.selectedSubtitleCueId);

  const setCurrentTime = useStudioStore((s) => s.setCurrentTime);
  const setTimelineZoom = useStudioStore((s) => s.setTimelineZoom);
  const selectScene = useStudioStore((s) => s.selectScene);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const selectEffectClip = useStudioStore((s) => s.selectEffectClip);
  const selectAudioClip = useStudioStore((s) => s.selectAudioClip);
  const selectSubtitleCue = useStudioStore((s) => s.selectSubtitleCue);
  const openReplaceModal = useStudioStore((s) => s.openReplaceModal);
  const setActiveLeftTab = useStudioStore((s) => s.setActiveLeftTab);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const beginHistoryBatch = useStudioStore((s) => s.beginHistoryBatch);
  const endHistoryBatch = useStudioStore((s) => s.endHistoryBatch);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const splitAudioClipAtPlayhead = useStudioStore((s) => s.splitAudioClipAtPlayhead);
  const applyAutoDucking = useStudioStore((s) => s.applyAutoDucking);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);
  const snapEnabled = useStudioStore((s) => s.snapEnabled);
  const toggleSnap = useStudioStore((s) => s.toggleSnap);

  const scrollRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const effectDragRef = useRef<EffectDragState | null>(null);
  const audioFadeDragRef = useRef<AudioFadeDragState | null>(null);
  const audioClipDragRef = useRef<AudioClipDragState | null>(null);
  const sceneDragRef = useRef<SceneResizeDragState | null>(null);
  const layerDragRef = useRef<LayerDragState | null>(null);
  const subtitleDragRef = useRef<SubtitleCueDragState | null>(null);
  const markerDragRef = useRef<MarkerDragState | null>(null);
  const suppressNextClickRef = useRef(false);
  const [snapGuideSec, setSnapGuideSec] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<AudioContextMenuState | null>(null);
  const [layerCtxMenu, setLayerCtxMenu] = useState<LayerContextMenuState | null>(null);
  const [showCurveGraph, setShowCurveGraph] = useState(false);
  const [curveProperty, setCurveProperty] = useState<AnimatableProperty>("x");

  const totalDur = Math.max(1, getProjectDuration(project));
  const trackWidth = Math.max(720, Math.ceil((totalDur + 2) * timelineZoom));

  const sceneSpans = useMemo(() => {
    let cursor = 0;
    return project.scenes.map((sc) => {
      const start = cursor;
      cursor += sc.duration;
      return { scene: sc, start, end: cursor };
    });
  }, [project.scenes]);

  const activeResolved = resolveSceneAtTime(project, currentTime);
  const activeSpan = sceneSpans.find((s) => s.scene.id === (activeResolved?.scene.id ?? selectedSceneId)) ?? sceneSpans[0];

  const scrubFromClientX = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft - labelColW;
    let nextTime = Math.max(0, Math.min(totalDur, x / timelineZoom));
    if (snapEnabled) {
      const snapThresholdSec = 8 / Math.max(20, timelineZoom);
      const targets: number[] = [0, totalDur];
      for (const sp of sceneSpans) targets.push(sp.start, sp.end);
      for (const mk of project.markers ?? []) targets.push(mk.t);
      let best = nextTime;
      let bestDist = snapThresholdSec;
      for (const tgt of targets) {
        const d = Math.abs(tgt - nextTime);
        if (d < bestDist) {
          bestDist = d;
          best = tgt;
        }
      }
      nextTime = best;
    }
    setCurrentTime(nextTime);
  };

  useEffect(() => {
    const closeMenu = () => {
      setCtxMenu(null);
      setLayerCtxMenu(null);
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("contextmenu", closeMenu);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("contextmenu", closeMenu);
    };
  }, []);

  const collectSnapTargets = (exclude?: {
    audioClipId?: string;
    effectClipId?: string;
    layerId?: string;
    subtitleCueId?: string;
    markerId?: string;
    sceneId?: string;
  }): number[] => {
    const targets: number[] = [0, Number(currentTime.toFixed(2))];
    if (!exclude?.sceneId) targets.push(totalDur);
    for (const sp of sceneSpans) {
      if (sp.scene.id === exclude?.sceneId) {
        targets.push(sp.start);
        continue;
      }
      targets.push(sp.start, sp.end);
    }
    for (const mk of project.markers ?? []) {
      if (mk.id === exclude?.markerId) continue;
      targets.push(mk.t);
    }
    for (const tr of project.audioTracks) {
      for (const c of tr.clips) {
        if (c.id === exclude?.audioClipId) continue;
        targets.push(c.start, Number((c.start + c.duration).toFixed(2)));
      }
    }
    for (const ec of project.effectClips ?? []) {
      if (ec.id === exclude?.effectClipId) continue;
      targets.push(ec.start, Number((ec.start + ec.duration).toFixed(2)));
    }
    for (const cue of project.subtitles.cues) {
      if (cue.id === exclude?.subtitleCueId) continue;
      targets.push(cue.start, cue.end);
    }
    if (activeSpan) {
      for (const l of activeSpan.scene.layers) {
        if (l.id === exclude?.layerId) continue;
        const lStart = activeSpan.start + l.start;
        const lDur = Math.min(activeSpan.scene.duration - l.start, l.duration ?? activeSpan.scene.duration);
        targets.push(Number(lStart.toFixed(2)), Number((lStart + lDur).toFixed(2)));
      }
    }
    return targets;
  };

  const snapEdge = (
    rawSec: number,
    targets: readonly number[],
  ): { value: number; snappedTo: number | null } => {
    if (!snapEnabled) return { value: rawSec, snappedTo: null };
    const snapThresholdSec = 10 / Math.max(20, timelineZoom);
    let best = rawSec;
    let bestDist = snapThresholdSec;
    let snappedTo: number | null = null;
    for (const tgt of targets) {
      const d = Math.abs(tgt - rawSec);
      if (d < bestDist) {
        bestDist = d;
        best = tgt;
        snappedTo = tgt;
      }
    }
    return { value: best, snappedTo };
  };

  const snapRangeMove = (
    rawStart: number,
    duration: number,
    targets: readonly number[],
    minStart = 0,
    maxStart = Number.POSITIVE_INFINITY,
  ): { start: number; guide: number | null } => {
    const clampedRaw = Math.max(minStart, Math.min(maxStart, rawStart));
    const rawEnd = clampedRaw + duration;
    const snapStart = snapEdge(clampedRaw, targets);
    const snapEnd = snapEdge(rawEnd, targets);

    let nextStart = clampedRaw;
    let guide: number | null = null;
    if (
      snapStart.snappedTo !== null &&
      (snapEnd.snappedTo === null ||
        Math.abs(snapStart.value - clampedRaw) <= Math.abs(snapEnd.value - rawEnd))
    ) {
      nextStart = Math.max(minStart, Math.min(maxStart, snapStart.value));
      guide = Math.abs(nextStart - snapStart.snappedTo) < 0.02 ? snapStart.snappedTo : null;
    } else if (snapEnd.snappedTo !== null) {
      nextStart = Math.max(minStart, Math.min(maxStart, snapEnd.value - duration));
      guide = Math.abs(nextStart + duration - snapEnd.snappedTo) < 0.02 ? snapEnd.snappedTo : null;
    }
    return { start: nextStart, guide };
  };

  const remapCueWords = (
    origWords: SubtitleWord[],
    origStart: number,
    origEnd: number,
    nextStart: number,
    nextEnd: number,
  ): SubtitleWord[] => {
    if (origWords.length === 0) return [];
    const origSpan = Math.max(0.05, origEnd - origStart);
    const nextSpan = Math.max(0.05, nextEnd - nextStart);
    return origWords.map((w) => {
      const relS = (w.start - origStart) / origSpan;
      const relE = (w.end - origStart) / origSpan;
      const ws = Math.max(nextStart, Math.min(nextEnd, Number((nextStart + relS * nextSpan).toFixed(3))));
      const we = Math.max(ws, Math.min(nextEnd, Number((nextStart + relE * nextSpan).toFixed(3))));
      return { ...w, start: ws, end: we };
    });
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (scrubbingRef.current) {
        scrubFromClientX(e.clientX);
        return;
      }

      // 1. Marker horizontal drag
      const md = markerDragRef.current;
      if (md) {
        const dxPx = e.clientX - md.startClientX;
        if (!md.moved && Math.abs(dxPx) < 3) return;
        md.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const mk = (project.markers ?? []).find((m) => m.id === md.markerId);
        if (!mk) return;
        const targets = collectSnapTargets({ markerId: md.markerId });
        const rawT = Math.max(0, md.origT + dxSec);
        const snapped = snapEdge(rawT, targets);
        setSnapGuideSec(snapped.snappedTo);
        const nextT = Math.max(0, Number(snapped.value.toFixed(2)));
        if (Math.abs(nextT - mk.t) >= 0.005) {
          dispatchOps([{ op: "marker.upsert", marker: { ...mk, t: nextT } }]);
        }
        return;
      }

      // 2. Scene duration trim / rolling cut between adjacent scenes
      const sd = sceneDragRef.current;
      if (sd) {
        const dxPx = e.clientX - sd.startClientX;
        if (!sd.moved && Math.abs(dxPx) < 3) return;
        sd.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const MIN_SCENE_DUR = 0.3;
        const targets = collectSnapTargets({ sceneId: sd.sceneId });

        if (sd.mode === "resize-right") {
          const rawEnd = Math.max(sd.origSceneStart + MIN_SCENE_DUR, sd.origSceneStart + sd.origDuration + dxSec);
          const snapped = snapEdge(rawEnd, targets);
          const nextDur = Math.max(MIN_SCENE_DUR, Number((snapped.value - sd.origSceneStart).toFixed(2)));
          setSnapGuideSec(snapped.snappedTo);
          const sc = project.scenes.find((s) => s.id === sd.sceneId);
          if (sc && Math.abs(nextDur - sc.duration) >= 0.005) {
            dispatchOps([{ op: "scene.update", sceneId: sd.sceneId, patch: { duration: nextDur } }]);
          }
          return;
        }

        if (sd.mode === "rolling-left" && sd.prevSceneId && sd.origPrevDuration !== undefined) {
          const minCut = sd.origSceneStart - (sd.origPrevDuration - MIN_SCENE_DUR);
          const maxCut = sd.origSceneStart + (sd.origDuration - MIN_SCENE_DUR);
          const rawCut = Math.max(minCut, Math.min(maxCut, sd.origSceneStart + dxSec));
          const snapped = snapEdge(rawCut, targets);
          const clampedCut = Math.max(minCut, Math.min(maxCut, snapped.value));
          const delta = Number((clampedCut - sd.origSceneStart).toFixed(2));
          const nextPrevDur = Math.max(MIN_SCENE_DUR, Number((sd.origPrevDuration + delta).toFixed(2)));
          const nextDur = Math.max(MIN_SCENE_DUR, Number((sd.origDuration - delta).toFixed(2)));
          setSnapGuideSec(snapped.snappedTo !== null && Math.abs(clampedCut - snapped.snappedTo) < 0.02 ? snapped.snappedTo : null);
          const prevSc = project.scenes.find((s) => s.id === sd.prevSceneId);
          const curSc = project.scenes.find((s) => s.id === sd.sceneId);
          if (
            prevSc &&
            curSc &&
            (Math.abs(nextPrevDur - prevSc.duration) >= 0.005 || Math.abs(nextDur - curSc.duration) >= 0.005)
          ) {
            dispatchOps([
              { op: "scene.update", sceneId: sd.prevSceneId, patch: { duration: nextPrevDur } },
              { op: "scene.update", sceneId: sd.sceneId, patch: { duration: nextDur } },
            ]);
          }
          return;
        }
      }

      // 3. Visual layer move / left-trim / right-trim inside scene
      const ld = layerDragRef.current;
      if (ld) {
        const dxPx = e.clientX - ld.startClientX;
        if (!ld.moved && Math.abs(dxPx) < 3) return;
        ld.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const sc = project.scenes.find((s) => s.id === ld.sceneId);
        const layer = sc?.layers.find((l) => l.id === ld.layerId);
        if (!sc || !layer) return;

        const targets = collectSnapTargets({ layerId: ld.layerId });
        const MIN_DUR = 0.15;

        if (ld.mode === "move") {
          const spansFullScene = ld.origDuration >= ld.sceneDuration - 0.05;
          const maxLocalStart = spansFullScene
            ? Math.max(0, ld.sceneDuration - MIN_DUR)
            : Math.max(0, ld.sceneDuration - ld.origDuration);
          const globalRawStart = ld.sceneStart + ld.origStart + dxSec;
          const snapped = snapRangeMove(
            globalRawStart,
            ld.origDuration,
            targets,
            ld.sceneStart,
            ld.sceneStart + maxLocalStart,
          );
          setSnapGuideSec(snapped.guide);
          const nextLocalStart = Math.max(0, Math.min(maxLocalStart, Number((snapped.start - ld.sceneStart).toFixed(2))));
          const nextDur = spansFullScene
            ? Number(Math.max(MIN_DUR, ld.sceneDuration - nextLocalStart).toFixed(2))
            : Number(Math.min(ld.origDuration, Math.max(MIN_DUR, ld.sceneDuration - nextLocalStart)).toFixed(2));
          if (
            Math.abs(nextLocalStart - layer.start) >= 0.005 ||
            (layer.duration !== undefined && Math.abs(nextDur - layer.duration) >= 0.005) ||
            (layer.duration === undefined && nextLocalStart > 0.005)
          ) {
            dispatchOps([
              {
                op: "layer.update",
                sceneId: ld.sceneId,
                layerId: ld.layerId,
                patch: { start: nextLocalStart, duration: nextDur },
              },
            ]);
          }
          return;
        }

        if (ld.mode === "resize-left") {
          const origLocalEnd = Math.min(ld.sceneDuration, ld.origStart + ld.origDuration);
          const maxLocalStart = Math.max(0, origLocalEnd - MIN_DUR);
          const rawGlobalStart = ld.sceneStart + Math.max(0, Math.min(maxLocalStart, ld.origStart + dxSec));
          const snapped = snapEdge(rawGlobalStart, targets);
          const nextLocalStart = Math.max(0, Math.min(maxLocalStart, Number((snapped.value - ld.sceneStart).toFixed(2))));
          const nextDur = Math.max(MIN_DUR, Number((origLocalEnd - nextLocalStart).toFixed(2)));
          setSnapGuideSec(snapped.snappedTo !== null && Math.abs(ld.sceneStart + nextLocalStart - snapped.snappedTo) < 0.02 ? snapped.snappedTo : null);
          if (Math.abs(nextLocalStart - layer.start) >= 0.005 || Math.abs(nextDur - (layer.duration ?? ld.sceneDuration)) >= 0.005) {
            dispatchOps([
              {
                op: "layer.update",
                sceneId: ld.sceneId,
                layerId: ld.layerId,
                patch: { start: nextLocalStart, duration: nextDur },
              },
            ]);
          }
          return;
        }

        if (ld.mode === "resize-right") {
          const maxDur = Math.max(MIN_DUR, ld.sceneDuration - ld.origStart);
          const rawGlobalEnd = ld.sceneStart + ld.origStart + Math.max(MIN_DUR, Math.min(maxDur, ld.origDuration + dxSec));
          const snapped = snapEdge(rawGlobalEnd, targets);
          const nextDur = Math.max(MIN_DUR, Math.min(maxDur, Number((snapped.value - (ld.sceneStart + ld.origStart)).toFixed(2))));
          setSnapGuideSec(snapped.snappedTo !== null && Math.abs(ld.sceneStart + ld.origStart + nextDur - snapped.snappedTo) < 0.02 ? snapped.snappedTo : null);
          if (Math.abs(nextDur - (layer.duration ?? ld.sceneDuration - layer.start)) >= 0.005) {
            dispatchOps([
              {
                op: "layer.update",
                sceneId: ld.sceneId,
                layerId: ld.layerId,
                patch: { duration: nextDur },
              },
            ]);
          }
          return;
        }
      }

      // 4. Subtitle cue move / left-trim / right-trim (keeps word-level karaoke synced)
      const subD = subtitleDragRef.current;
      if (subD) {
        const dxPx = e.clientX - subD.startClientX;
        if (!subD.moved && Math.abs(dxPx) < 3) return;
        subD.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const cue = project.subtitles.cues.find((c) => c.id === subD.cueId);
        if (!cue) return;

        const targets = collectSnapTargets({ subtitleCueId: subD.cueId });
        const MIN_DUR = 0.15;
        const origDur = Math.max(MIN_DUR, subD.origEnd - subD.origStart);

        if (subD.mode === "move") {
          const snapped = snapRangeMove(subD.origStart + dxSec, origDur, targets, 0);
          setSnapGuideSec(snapped.guide);
          const nextStart = Math.max(0, Number(snapped.start.toFixed(2)));
          const nextEnd = Number((nextStart + origDur).toFixed(2));
          if (Math.abs(nextStart - cue.start) >= 0.005) {
            const delta = nextStart - subD.origStart;
            const shiftedWords = subD.origWords.map((w) => ({
              ...w,
              start: Math.max(0, Number((w.start + delta).toFixed(3))),
              end: Math.max(0, Number((w.end + delta).toFixed(3))),
            }));
            dispatchOps([
              {
                op: "subtitle.upsertCue",
                cue: { ...cue, start: nextStart, end: nextEnd, words: shiftedWords },
              },
            ]);
          }
          return;
        }

        if (subD.mode === "resize-left") {
          const maxStart = Math.max(0, subD.origEnd - MIN_DUR);
          const rawStart = Math.max(0, Math.min(maxStart, subD.origStart + dxSec));
          const snapped = snapEdge(rawStart, targets);
          const nextStart = Math.max(0, Math.min(maxStart, Number(snapped.value.toFixed(2))));
          setSnapGuideSec(snapped.snappedTo !== null && Math.abs(nextStart - snapped.snappedTo) < 0.02 ? snapped.snappedTo : null);
          if (Math.abs(nextStart - cue.start) >= 0.005) {
            const nextWords = remapCueWords(subD.origWords, subD.origStart, subD.origEnd, nextStart, subD.origEnd);
            dispatchOps([
              {
                op: "subtitle.upsertCue",
                cue: { ...cue, start: nextStart, end: subD.origEnd, words: nextWords },
              },
            ]);
          }
          return;
        }

        if (subD.mode === "resize-right") {
          const minEnd = subD.origStart + MIN_DUR;
          const rawEnd = Math.max(minEnd, subD.origEnd + dxSec);
          const snapped = snapEdge(rawEnd, targets);
          const nextEnd = Math.max(minEnd, Number(snapped.value.toFixed(2)));
          setSnapGuideSec(snapped.snappedTo !== null && Math.abs(nextEnd - snapped.snappedTo) < 0.02 ? snapped.snappedTo : null);
          if (Math.abs(nextEnd - cue.end) >= 0.005) {
            const nextWords = remapCueWords(subD.origWords, subD.origStart, subD.origEnd, subD.origStart, nextEnd);
            dispatchOps([
              {
                op: "subtitle.upsertCue",
                cue: { ...cue, start: subD.origStart, end: nextEnd, words: nextWords },
              },
            ]);
          }
          return;
        }
      }

      // 5. Audio clip move / left-trim / right-trim
      const ad = audioClipDragRef.current;
      if (ad) {
        const dxPx = e.clientX - ad.startClientX;
        if (!ad.moved && Math.abs(dxPx) < 3) return;
        ad.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const tr = project.audioTracks.find((t) => t.id === ad.trackId);
        const clip = tr?.clips.find((c) => c.id === ad.clipId);
        if (!clip) return;

        const targets = collectSnapTargets({ audioClipId: ad.clipId });
        const MIN_DUR = 0.15;

        if (ad.mode === "move") {
          const snapped = snapRangeMove(ad.origStart + dxSec, ad.origDuration, targets, 0);
          setSnapGuideSec(snapped.guide);
          const nextStart = Math.max(0, Number(snapped.start.toFixed(2)));
          if (Math.abs(nextStart - clip.start) >= 0.005) {
            dispatchOps([{ op: "audioClip.upsert", trackId: ad.trackId, clip: { ...clip, start: nextStart } }]);
          }
          return;
        }

        if (ad.mode === "resize-right") {
          const maxDur =
            !ad.loop && ad.maxAssetDuration !== null
              ? Math.max(ad.origDuration, ad.maxAssetDuration - ad.origTrimStart)
              : 3600;
          const rawEnd = Math.max(ad.origStart + MIN_DUR, ad.origStart + ad.origDuration + dxSec);
          const snapped = snapEdge(rawEnd, targets);
          let nextDur = Math.max(MIN_DUR, Math.min(maxDur, snapped.value - ad.origStart));
          setSnapGuideSec(snapped.snappedTo !== null && nextDur < maxDur ? snapped.snappedTo : null);
          nextDur = Number(nextDur.toFixed(2));
          const maxFade = Number((nextDur * 0.9).toFixed(2));
          if (Math.abs(nextDur - clip.duration) >= 0.005) {
            dispatchOps([
              {
                op: "audioClip.upsert",
                trackId: ad.trackId,
                clip: {
                  ...clip,
                  duration: nextDur,
                  fadeIn: Math.min(clip.fadeIn, maxFade),
                  fadeOut: Math.min(clip.fadeOut, maxFade),
                },
              },
            ]);
          }
          return;
        }

        if (ad.mode === "resize-left") {
          const origEnd = ad.origStart + ad.origDuration;
          const minStartByTrim = ad.loop ? 0 : Math.max(0, ad.origStart - ad.origTrimStart);
          const maxStart = origEnd - MIN_DUR;
          const rawStart = Math.max(minStartByTrim, Math.min(maxStart, ad.origStart + dxSec));
          const snapped = snapEdge(rawStart, targets);
          let nextStart = Math.max(minStartByTrim, Math.min(maxStart, snapped.value));
          setSnapGuideSec(snapped.snappedTo !== null ? snapped.snappedTo : null);
          nextStart = Number(nextStart.toFixed(2));
          const delta = nextStart - ad.origStart;
          const nextTrimStart = Math.max(0, Number((ad.origTrimStart + delta).toFixed(2)));
          const nextDur = Math.max(MIN_DUR, Number((origEnd - nextStart).toFixed(2)));
          const maxFade = Number((nextDur * 0.9).toFixed(2));
          if (Math.abs(nextStart - clip.start) >= 0.005 || Math.abs(nextDur - clip.duration) >= 0.005) {
            dispatchOps([
              {
                op: "audioClip.upsert",
                trackId: ad.trackId,
                clip: {
                  ...clip,
                  start: nextStart,
                  trimStart: nextTrimStart,
                  duration: nextDur,
                  fadeIn: Math.min(clip.fadeIn, maxFade),
                  fadeOut: Math.min(clip.fadeOut, maxFade),
                },
              },
            ]);
          }
          return;
        }
      }

      // 6. Audio fade handle drag
      const fd = audioFadeDragRef.current;
      if (fd) {
        const dxSec = (e.clientX - fd.startClientX) / timelineZoom;
        const tr = project.audioTracks.find((t) => t.id === fd.trackId);
        const clip = tr?.clips.find((c) => c.id === fd.clipId);
        if (!clip) return;
        const maxFade = Math.max(0.05, fd.clipDuration * 0.9);
        if (fd.side === "in") {
          const nextIn = Math.max(0, Math.min(maxFade, Number((fd.origFade + dxSec).toFixed(2))));
          dispatchOps([{ op: "audioClip.upsert", trackId: fd.trackId, clip: { ...clip, fadeIn: nextIn } }]);
        } else {
          const nextOut = Math.max(0, Math.min(maxFade, Number((fd.origFade - dxSec).toFixed(2))));
          dispatchOps([{ op: "audioClip.upsert", trackId: fd.trackId, clip: { ...clip, fadeOut: nextOut } }]);
        }
        return;
      }

      // 7. Timed effect clip move / left-trim / right-trim
      const ed = effectDragRef.current;
      if (ed) {
        const dxPx = e.clientX - ed.startClientX;
        if (!ed.moved && Math.abs(dxPx) < 3) return;
        ed.moved = true;
        suppressNextClickRef.current = true;
        const dxSec = dxPx / timelineZoom;
        const ec = (project.effectClips ?? []).find((x) => x.id === ed.effectClipId);
        if (!ec) return;
        const targets = collectSnapTargets({ effectClipId: ed.effectClipId });
        if (ed.mode === "move") {
          const snapped = snapRangeMove(ed.origStart + dxSec, ed.origDuration, targets, 0);
          setSnapGuideSec(snapped.guide);
          const nextStart = Math.max(0, Number(snapped.start.toFixed(2)));
          if (Math.abs(nextStart - ec.start) >= 0.005) {
            dispatchOps([{ op: "effectClip.upsert", effectClip: { ...ec, start: nextStart } }]);
          }
        } else if (ed.mode === "resize-left") {
          const origEnd = ed.origStart + ed.origDuration;
          const rawStart = Math.max(0, Math.min(origEnd - 0.2, ed.origStart + dxSec));
          const snapped = snapEdge(rawStart, targets);
          setSnapGuideSec(snapped.snappedTo);
          const nextStart = Math.max(0, Math.min(origEnd - 0.2, Number(snapped.value.toFixed(2))));
          const nextDur = Math.max(0.2, Number((origEnd - nextStart).toFixed(2)));
          if (Math.abs(nextStart - ec.start) >= 0.005 || Math.abs(nextDur - ec.duration) >= 0.005) {
            dispatchOps([{ op: "effectClip.upsert", effectClip: { ...ec, start: nextStart, duration: nextDur } }]);
          }
        } else {
          const rawEnd = Math.max(ed.origStart + 0.2, ed.origStart + ed.origDuration + dxSec);
          const snapped = snapEdge(rawEnd, targets);
          setSnapGuideSec(snapped.snappedTo);
          const nextDur = Math.max(0.2, Number((snapped.value - ed.origStart).toFixed(2)));
          if (Math.abs(nextDur - ec.duration) >= 0.005) {
            dispatchOps([{ op: "effectClip.upsert", effectClip: { ...ec, duration: nextDur } }]);
          }
        }
      }
    };
    const onUp = () => {
      const hadBatch = Boolean(
        audioClipDragRef.current ||
          audioFadeDragRef.current ||
          effectDragRef.current ||
          sceneDragRef.current ||
          layerDragRef.current ||
          subtitleDragRef.current ||
          markerDragRef.current,
      );
      scrubbingRef.current = false;
      effectDragRef.current = null;
      audioFadeDragRef.current = null;
      audioClipDragRef.current = null;
      sceneDragRef.current = null;
      layerDragRef.current = null;
      subtitleDragRef.current = null;
      markerDragRef.current = null;
      setSnapGuideSec(null);
      if (hadBatch) endHistoryBatch();
      if (suppressNextClickRef.current) {
        window.setTimeout(() => {
          suppressNextClickRef.current = false;
        }, 0);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    timelineZoom,
    totalDur,
    currentTime,
    snapEnabled,
    sceneSpans,
    activeSpan,
    project.scenes,
    project.subtitles.cues,
    project.markers,
    project.effectClips,
    project.audioTracks,
    dispatchOps,
    endHistoryBatch,
  ]);

  const runAudioAction = async (
    trackId: string,
    clipId: string,
    action: "transcribe" | "denoise" | "voice_enhance" | "normalize" | "trim_silence",
  ) => {
    setCtxMenu(null);
    const labels: Record<typeof action, string> = {
      transcribe: "Detectando y generando subtítulos con Whisper IA local…",
      denoise: "Eliminando ruido de fondo (FFmpeg afftdn)…",
      voice_enhance: "Mejorando voz (EQ + compresión + limpieza)…",
      normalize: "Normalizando volumen a -16 LUFS…",
      trim_silence: "Recortando silencios automáticamente…",
    };
    setBusyNotice(labels[action]);
    try {
      if (action === "transcribe") {
        const res = await studioApi.transcribeAudioClip(project.id, {
          trackId,
          clipId,
          language: project.subtitles.language || "es",
          model: "small",
          replaceExisting: true,
        });
        setProjectFromRemote(res.project, res.receipt);
        setActiveLeftTab("subtitles");
        setBusyNotice(`Subtítulos generados: ${res.cuesCount} bloques (${res.language})`);
      } else {
        const res = await studioApi.processAudioClip(project.id, { trackId, clipId, action });
        setProjectFromRemote(res.project, res.receipt);
        void audioEngine.loadAssetAudio(res.asset);
        setBusyNotice(`Audio actualizado: ${res.asset.name} (${res.durationSec.toFixed(1)}s)`);
      }
      window.setTimeout(() => setBusyNotice(null), 3200);
    } catch (err) {
      setBusyNotice(null);
      useStudioStore.setState({ lastError: err instanceof Error ? err.message : String(err) });
    }
  };

  const openAudioMenu = (
    e: React.MouseEvent,
    trackId: string,
    clipId: string,
    clipName: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setLayerCtxMenu(null);
    selectAudioClip({ trackId, clipId });
    const menuW = 258;
    const menuH = 380;
    const x = Math.min(window.innerWidth - menuW - 12, Math.max(8, e.clientX));
    const y = Math.min(window.innerHeight - menuH - 12, Math.max(8, e.clientY - menuH * 0.6));
    setCtxMenu({ x, y, trackId, clipId, clipName });
  };

  const openLayerMenu = (
    e: React.MouseEvent,
    sceneId: string,
    layer: { id: string; name: string; type: string; visible: boolean },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);
    selectLayer(layer.id);
    const menuW = 230;
    const menuH = 190;
    const x = Math.min(window.innerWidth - menuW - 12, Math.max(8, e.clientX));
    const y = Math.min(window.innerHeight - menuH - 12, Math.max(8, e.clientY - menuH * 0.5));
    setLayerCtxMenu({
      x,
      y,
      sceneId,
      layerId: layer.id,
      layerName: layer.name,
      layerType: layer.type,
      visible: layer.visible,
    });
  };

  const rulerStepSec = timelineZoom >= 120 ? 0.5 : timelineZoom >= 60 ? 1 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDur + 1; t += rulerStepSec) {
    ticks.push(Number(t.toFixed(2)));
  }

  const effectClips = project.effectClips ?? [];
  const markers = project.markers ?? [];

  const flashTimelineNotice = (msg: string) => {
    setBusyNotice(msg);
    window.setTimeout(() => setBusyNotice(null), 2200);
  };

  // =========================================================================
  // OpenCut-Style Timeline Toolbar Actions
  // =========================================================================
  const handleSplitAtPlayhead = () => {
    // 1. Selected audio clip
    if (selectedAudioClip) {
      splitAudioClipAtPlayhead(selectedAudioClip.trackId, selectedAudioClip.clipId);
      flashTimelineNotice("Clip de audio dividido en el cabezal.");
      return;
    }
    // 2. Selected effect clip
    if (selectedEffectClipId) {
      const ec = effectClips.find((e) => e.id === selectedEffectClipId);
      if (ec && currentTime > ec.start + 0.15 && currentTime < ec.start + ec.duration - 0.15) {
        const leftDur = Number((currentTime - ec.start).toFixed(2));
        const rightDur = Number((ec.start + ec.duration - currentTime).toFixed(2));
        const rightId = `${ec.id}_s${Date.now().toString(36).slice(-3)}`;
        dispatchOps([
          { op: "effectClip.upsert", effectClip: { ...ec, duration: leftDur } },
          { op: "effectClip.upsert", effectClip: { ...ec, id: rightId, start: Number(currentTime.toFixed(2)), duration: rightDur } },
        ]);
        selectEffectClip(rightId);
        flashTimelineNotice("Clip de efecto dividido en el cabezal.");
        return;
      }
    }
    // 3. Selected subtitle cue
    if (selectedCueId) {
      const cue = project.subtitles.cues.find((c) => c.id === selectedCueId);
      if (cue && currentTime > cue.start + 0.15 && currentTime < cue.end - 0.15) {
        const splitT = Number(currentTime.toFixed(2));
        const leftWords = cue.words.filter((w) => (w.start + w.end) * 0.5 < splitT);
        const rightWords = cue.words.filter((w) => (w.start + w.end) * 0.5 >= splitT);
        const rightId = `${cue.id}_s${Date.now().toString(36).slice(-3)}`;
        const leftText = leftWords.length > 0 ? leftWords.map((w) => w.text).join(" ") : cue.text;
        const rightText = rightWords.length > 0 ? rightWords.map((w) => w.text).join(" ") : cue.text;
        dispatchOps([
          { op: "subtitle.upsertCue", cue: { ...cue, end: splitT, text: leftText, words: leftWords } },
          {
            op: "subtitle.upsertCue",
            cue: {
              ...cue,
              id: rightId,
              start: splitT,
              text: rightText,
              words: rightWords.map((w, i) => ({ ...w, id: `${rightId}_w${i}` })),
            },
          },
        ]);
        selectSubtitleCue(rightId, null);
        flashTimelineNotice("Bloque de subtítulo dividido en el cabezal.");
        return;
      }
    }
    // 4. Fallback: Split active scene at playhead
    if (activeSpan && currentTime > activeSpan.start + 0.25 && currentTime < activeSpan.end - 0.25) {
      const sc = activeSpan.scene;
      const leftDur = Number((currentTime - activeSpan.start).toFixed(2));
      const rightDur = Number((activeSpan.end - currentTime).toFixed(2));
      const sceneIdx = project.scenes.findIndex((s) => s.id === sc.id);
      const cloneId = `${sc.id}_b_${Date.now().toString(36).slice(-3)}`;
      const clonedScene = {
        ...structuredClone(sc),
        id: cloneId,
        name: `${sc.name} (Parte 2)`,
        duration: rightDur,
        transitionIn: { ...sc.transitionIn, type: "cut" as const, duration: 0 },
        layers: sc.layers.map((l, idx) => ({ ...structuredClone(l), id: `${cloneId}_l${idx}` })),
      };
      dispatchOps([
        {
          op: "scene.update",
          sceneId: sc.id,
          patch: {
            duration: leftDur,
            transitionOut: { ...sc.transitionOut, type: "cut", duration: 0 },
          },
        },
        { op: "scene.add", scene: clonedScene, index: sceneIdx + 1 },
      ]);
      selectScene(cloneId, false);
      flashTimelineNotice(`Escena «${sc.name}» dividida en ${currentTime.toFixed(2)}s.`);
    } else {
      flashTimelineNotice("Coloca el cabezal dentro de una escena o clip para dividir.");
    }
  };

  const handleTrimStartToPlayhead = () => {
    if (selectedAudioClip) {
      const tr = project.audioTracks.find((t) => t.id === selectedAudioClip.trackId);
      const clip = tr?.clips.find((c) => c.id === selectedAudioClip.clipId);
      if (clip && currentTime > clip.start && currentTime < clip.start + clip.duration - 0.15) {
        const delta = Number((currentTime - clip.start).toFixed(2));
        dispatchOps([
          {
            op: "audioClip.upsert",
            trackId: tr!.id,
            clip: {
              ...clip,
              start: Number(currentTime.toFixed(2)),
              trimStart: Number((clip.trimStart + delta).toFixed(2)),
              duration: Number((clip.duration - delta).toFixed(2)),
            },
          },
        ]);
        flashTimelineNotice("Inicio de clip de audio recortado al cabezal.");
        return;
      }
    }
    if (selectedEffectClipId) {
      const ec = effectClips.find((e) => e.id === selectedEffectClipId);
      if (ec && currentTime > ec.start && currentTime < ec.start + ec.duration - 0.15) {
        const delta = Number((currentTime - ec.start).toFixed(2));
        dispatchOps([
          {
            op: "effectClip.upsert",
            effectClip: {
              ...ec,
              start: Number(currentTime.toFixed(2)),
              duration: Number((ec.duration - delta).toFixed(2)),
            },
          },
        ]);
        flashTimelineNotice("Inicio de efecto recortado al cabezal.");
        return;
      }
    }
    if (selectedCueId) {
      const cue = project.subtitles.cues.find((c) => c.id === selectedCueId);
      if (cue && currentTime > cue.start && currentTime < cue.end - 0.15) {
        dispatchOps([{ op: "subtitle.upsertCue", cue: { ...cue, start: Number(currentTime.toFixed(2)) } }]);
        flashTimelineNotice("Inicio de subtítulo recortado al cabezal.");
        return;
      }
    }
    if (activeSpan && currentTime > activeSpan.start + 0.1 && currentTime < activeSpan.end - 0.25) {
      const newDur = Number((activeSpan.end - currentTime).toFixed(2));
      dispatchOps([{ op: "scene.update", sceneId: activeSpan.scene.id, patch: { duration: newDur } }]);
      setCurrentTime(activeSpan.start);
      flashTimelineNotice(`Inicio de escena «${activeSpan.scene.name}» recortado (${newDur.toFixed(2)}s).`);
    }
  };

  const handleTrimEndToPlayhead = () => {
    if (selectedAudioClip) {
      const tr = project.audioTracks.find((t) => t.id === selectedAudioClip.trackId);
      const clip = tr?.clips.find((c) => c.id === selectedAudioClip.clipId);
      if (clip && currentTime > clip.start + 0.15 && currentTime < clip.start + clip.duration) {
        const newDur = Number((currentTime - clip.start).toFixed(2));
        dispatchOps([{ op: "audioClip.upsert", trackId: tr!.id, clip: { ...clip, duration: newDur } }]);
        flashTimelineNotice("Fin de clip de audio recortado al cabezal.");
        return;
      }
    }
    if (selectedEffectClipId) {
      const ec = effectClips.find((e) => e.id === selectedEffectClipId);
      if (ec && currentTime > ec.start + 0.15 && currentTime < ec.start + ec.duration) {
        const newDur = Number((currentTime - ec.start).toFixed(2));
        dispatchOps([{ op: "effectClip.upsert", effectClip: { ...ec, duration: newDur } }]);
        flashTimelineNotice("Fin de efecto recortado al cabezal.");
        return;
      }
    }
    if (selectedCueId) {
      const cue = project.subtitles.cues.find((c) => c.id === selectedCueId);
      if (cue && currentTime > cue.start + 0.15 && currentTime < cue.end) {
        dispatchOps([{ op: "subtitle.upsertCue", cue: { ...cue, end: Number(currentTime.toFixed(2)) } }]);
        flashTimelineNotice("Fin de subtítulo recortado al cabezal.");
        return;
      }
    }
    if (activeSpan && currentTime > activeSpan.start + 0.25 && currentTime < activeSpan.end) {
      const newDur = Number((currentTime - activeSpan.start).toFixed(2));
      dispatchOps([{ op: "scene.update", sceneId: activeSpan.scene.id, patch: { duration: newDur } }]);
      flashTimelineNotice(`Fin de escena «${activeSpan.scene.name}» recortado a ${newDur.toFixed(2)}s.`);
    }
  };

  const handleDuplicateSelected = () => {
    if (selectedAudioClip) {
      const tr = project.audioTracks.find((t) => t.id === selectedAudioClip.trackId);
      const clip = tr?.clips.find((c) => c.id === selectedAudioClip.clipId);
      if (clip && tr) {
        const copyId = `${clip.id}_c${Date.now().toString(36).slice(-3)}`;
        dispatchOps([
          {
            op: "audioClip.upsert",
            trackId: tr.id,
            clip: { ...structuredClone(clip), id: copyId, start: Number((clip.start + clip.duration).toFixed(2)) },
          },
        ]);
        selectAudioClip({ trackId: tr.id, clipId: copyId });
        flashTimelineNotice("Clip de audio duplicado.");
        return;
      }
    }
    if (selectedEffectClipId) {
      const ec = effectClips.find((e) => e.id === selectedEffectClipId);
      if (ec) {
        const copyId = `${ec.id}_c${Date.now().toString(36).slice(-3)}`;
        dispatchOps([
          {
            op: "effectClip.upsert",
            effectClip: { ...structuredClone(ec), id: copyId, start: Number((ec.start + ec.duration).toFixed(2)) },
          },
        ]);
        selectEffectClip(copyId);
        flashTimelineNotice("Clip de efecto duplicado.");
        return;
      }
    }
    if (selectedCueId) {
      const cue = project.subtitles.cues.find((c) => c.id === selectedCueId);
      if (cue) {
        const dur = cue.end - cue.start;
        const copyId = `${cue.id}_c${Date.now().toString(36).slice(-3)}`;
        dispatchOps([
          {
            op: "subtitle.upsertCue",
            cue: {
              ...structuredClone(cue),
              id: copyId,
              start: Number(cue.end.toFixed(2)),
              end: Number((cue.end + dur).toFixed(2)),
              words: cue.words.map((w, i) => ({
                ...w,
                id: `${copyId}_w${i}`,
                start: Number((w.start + dur).toFixed(2)),
                end: Number((w.end + dur).toFixed(2)),
              })),
            },
          },
        ]);
        selectSubtitleCue(copyId, null);
        flashTimelineNotice("Subtítulo duplicado.");
        return;
      }
    }
    if (selectedLayerId && activeSpan) {
      const layer = activeSpan.scene.layers.find((l) => l.id === selectedLayerId);
      if (layer) {
        const copyId = `${layer.id}_c${Date.now().toString(36).slice(-3)}`;
        dispatchOps([
          {
            op: "layer.add",
            sceneId: activeSpan.scene.id,
            layer: {
              ...structuredClone(layer),
              id: copyId,
              name: `${layer.name} (Copia)`,
              transform: { ...layer.transform, x: Math.min(0.95, layer.transform.x + 0.04) },
            },
          },
        ]);
        selectLayer(copyId);
        flashTimelineNotice(`Capa «${layer.name}» duplicada.`);
        return;
      }
    }
    if (activeSpan) {
      const sc = activeSpan.scene;
      const sceneIdx = project.scenes.findIndex((s) => s.id === sc.id);
      const copyId = `${sc.id}_c${Date.now().toString(36).slice(-3)}`;
      const copyScene = {
        ...structuredClone(sc),
        id: copyId,
        name: `${sc.name} (Copia)`,
        layers: sc.layers.map((l, i) => ({ ...structuredClone(l), id: `${copyId}_l${i}` })),
      };
      dispatchOps([{ op: "scene.add", scene: copyScene, index: sceneIdx + 1 }]);
      selectScene(copyId, true);
      flashTimelineNotice(`Escena «${sc.name}» duplicada.`);
    }
  };

  const handleFreezeFrame = () => {
    if (!activeSpan) return;
    const sc = activeSpan.scene;
    const sceneIdx = project.scenes.findIndex((s) => s.id === sc.id);
    const freezeId = `freeze_${Date.now().toString(36).slice(-4)}`;
    const frozenScene = {
      ...structuredClone(sc),
      id: freezeId,
      name: `Congelado · ${sc.name}`,
      duration: 2.0,
      transitionIn: { ...sc.transitionIn, type: "cut" as const, duration: 0.2 },
      camera: {
        ...structuredClone(sc.camera),
        handheld: { ...sc.camera.handheld, enabled: false },
        impulses: [],
        keyframes: {},
      },
      layers: sc.layers.map((l, i) => ({
        ...structuredClone(l),
        id: `${freezeId}_l${i}`,
        keyframes: {},
        ...(l.motion
          ? {
              motion: {
                ...l.motion,
                enter: "none" as const,
                exit: "none" as const,
                loop: "none" as const,
              },
            }
          : {}),
      })),
    };
    dispatchOps([{ op: "scene.add", scene: frozenScene, index: sceneIdx + 1 }]);
    selectScene(freezeId, true);
    flashTimelineNotice("Fotograma congelado (2.0s) insertado en el timeline.");
  };

  const handleDeleteSelected = () => {
    if (selectedAudioClip) {
      dispatchOps([
        {
          op: "audioClip.remove",
          trackId: selectedAudioClip.trackId,
          clipId: selectedAudioClip.clipId,
        },
      ]);
      selectAudioClip(null);
      flashTimelineNotice("Clip de audio eliminado.");
      return;
    }
    if (selectedEffectClipId) {
      dispatchOps([{ op: "effectClip.remove", effectClipId: selectedEffectClipId }]);
      selectEffectClip(null);
      flashTimelineNotice("Clip de efecto eliminado.");
      return;
    }
    if (selectedCueId) {
      dispatchOps([{ op: "subtitle.removeCue", cueId: selectedCueId }]);
      selectSubtitleCue(null, null);
      flashTimelineNotice("Subtítulo eliminado.");
      return;
    }
    if (selectedLayerId && activeSpan) {
      dispatchOps([{ op: "layer.remove", sceneId: activeSpan.scene.id, layerId: selectedLayerId }]);
      selectLayer(null);
      flashTimelineNotice("Capa eliminada.");
      return;
    }
    if (activeSpan && project.scenes.length > 1) {
      dispatchOps([{ op: "scene.remove", sceneId: activeSpan.scene.id }]);
      flashTimelineNotice(`Escena «${activeSpan.scene.name}» eliminada.`);
    } else {
      flashTimelineNotice("Selecciona un clip, capa o subtítulo para eliminar.");
    }
  };

  const handleToggleMarkerAtPlayhead = () => {
    const existing = markers.find((m) => Math.abs(m.t - currentTime) < 0.15);
    if (existing) {
      dispatchOps([{ op: "marker.remove", markerId: existing.id }]);
      flashTimelineNotice(`Marcador en ${existing.t.toFixed(2)}s eliminado.`);
      return;
    }
    const mkId = `mk_${Date.now().toString(36).slice(-4)}`;
    dispatchOps([
      {
        op: "marker.upsert",
        marker: {
          id: mkId,
          t: Number(currentTime.toFixed(2)),
          label: `M${markers.length + 1} (${currentTime.toFixed(1)}s)`,
          color: "#ffd447",
        },
      },
    ]);
    flashTimelineNotice(`Marcador añadido en ${currentTime.toFixed(2)}s.`);
  };

  // Keyframe curve graph data for active layer or scene camera
  const selectedLayerObj = activeSpan?.scene.layers.find((l) => l.id === selectedLayerId) ?? null;
  const curveTargetTracks = selectedLayerObj
    ? selectedLayerObj.keyframes
    : activeSpan?.scene.camera.keyframes ?? {};
  const availableCurveProps: AnimatableProperty[] = selectedLayerObj
    ? ["x", "y", "scaleX", "scaleY", "rotation", "opacity"]
    : ["cameraZoom", "cameraX", "cameraY", "cameraRotation"];
  const effectiveCurveProp: AnimatableProperty = availableCurveProps.includes(curveProperty)
    ? curveProperty
    : availableCurveProps[0]!;
  const activeCurveKeyframes = useMemo(() => {
    const kfs = curveTargetTracks[effectiveCurveProp] ?? [];
    return [...kfs].sort((a, b) => a.t - b.t);
  }, [curveTargetTracks, effectiveCurveProp]);

  const curveDuration = Math.max(0.5, activeSpan?.scene.duration ?? 3);

  return (
    <section
      className={`${
        className ?? (showCurveGraph ? "h-[332px] shrink-0" : "h-[256px] shrink-0")
      } glass-panel rounded-2xl flex flex-col overflow-hidden relative transition-[height] duration-150`}
    >
      {/* OpenCut-Style Timeline Toolbar */}
      <div
        className={`flex items-center justify-between gap-1.5 border-b shrink-0 ${
          compact ? "h-9 px-1.5" : "h-9 px-2.5 gap-2"
        }`}
        style={{ borderColor: "var(--border-subtle)" }}
      >
        {/* Left: OpenCut Editing Tools (scrolls cleanly on mobile without overlapping zoom) */}
        <div className="flex-1 min-w-0 flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Dividir en el cabezal (Split)"
            onClick={handleSplitAtPlayhead}
          >
            <Scissors size={13} />
          </button>
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Recortar inicio hasta el cabezal (Trim Left)"
            onClick={handleTrimStartToPlayhead}
          >
            <AlignStartVertical size={13} />
          </button>
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Recortar fin desde el cabezal (Trim Right)"
            onClick={handleTrimEndToPlayhead}
          >
            <AlignEndVertical size={13} />
          </button>
          <button
            className={`${compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"} ${snapEnabled ? "studio-btn-active" : ""}`}
            title={snapEnabled ? "Ajuste magnético / Vinculación ACTIVO" : "Activar ajuste magnético en cortes y marcadores"}
            onClick={toggleSnap}
          >
            <Link2 size={13} />
          </button>
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Duplicar elemento seleccionado"
            onClick={handleDuplicateSelected}
          >
            <Copy size={13} />
          </button>
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Congelar fotograma (Insertar pausa de 2.0s)"
            onClick={handleFreezeFrame}
          >
            <Snowflake size={13} />
          </button>
          <button
            className={compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"}
            title="Eliminar elemento seleccionado"
            style={{ color: "var(--accent-danger)" }}
            onClick={handleDeleteSelected}
          >
            <Trash2 size={13} />
          </button>

          <div className="w-px h-4 mx-0.5 shrink-0" style={{ background: "var(--border-strong)" }} />

          <button
            className={`${compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"} ${markers.some((m) => Math.abs(m.t - currentTime) < 0.15) ? "studio-btn-active" : ""}`}
            title="Añadir / quitar marcador en el cabezal"
            onClick={handleToggleMarkerAtPlayhead}
          >
            <Bookmark size={13} />
          </button>
          <button
            className={`${compact ? "mobile-icon-btn" : "studio-btn !p-1.5 shrink-0"} ${showCurveGraph ? "studio-btn-accent" : ""}`}
            title="Mostrar / ocultar gráfica de curvas y keyframes"
            onClick={() => setShowCurveGraph((v) => !v)}
          >
            <TrendingUp size={13} />
          </button>

          <span
            className="font-mono-code text-[10px] px-1.5 py-0.5 rounded ml-2 hidden lg:inline shrink-0"
            style={{ background: "var(--glass-hover)", color: "var(--text-secondary)" }}
          >
            {project.scenes.length} esc · {effectClips.length} fx · {markers.length} mk · {totalDur.toFixed(1)}s
          </span>
        </div>

        {/* Right: Timeline Zoom */}
        <div
          className="flex items-center gap-0.5 shrink-0 pl-1 border-l"
          style={{ borderColor: compact ? "var(--border-subtle)" : "transparent" }}
        >
          <button
            className={compact ? "mobile-icon-btn !w-7 !h-7" : "studio-btn !p-1"}
            title="Alejar zoom timeline"
            onClick={() => setTimelineZoom(timelineZoom - 18)}
          >
            <Minus size={13} />
          </button>
          {!compact && (
            <input
              type="range"
              min={24}
              max={240}
              value={timelineZoom}
              onChange={(e) => setTimelineZoom(Number(e.target.value))}
              className="w-24"
            />
          )}
          <button
            className={compact ? "mobile-icon-btn !w-7 !h-7" : "studio-btn !p-1"}
            title="Acercar zoom timeline"
            onClick={() => setTimelineZoom(timelineZoom + 18)}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Optional Keyframe & Easing Curve Graph Drawer (Remotion Springs & Bezier Curves) */}
      {showCurveGraph && activeSpan && (
        <div
          className="h-[78px] shrink-0 px-3 py-1.5 flex items-center gap-3 border-b"
          style={{ background: "rgba(9,12,20,0.68)", borderColor: "var(--border-subtle)" }}
        >
          <div className="w-[136px] shrink-0 flex flex-col gap-1">
            <div className="text-[9.5px] font-semibold uppercase tracking-wider truncate" style={{ color: "var(--accent-primary)" }}>
              {selectedLayerObj ? `Curva: ${selectedLayerObj.name}` : `Cámara: ${activeSpan.scene.name}`}
            </div>
            <div className="flex items-center gap-1">
              <select
                className="studio-input !py-0.5 !px-1.5 !text-[10px] flex-1"
                value={effectiveCurveProp}
                onChange={(e) => setCurveProperty(e.target.value as AnimatableProperty)}
              >
                {availableCurveProps.map((prop) => (
                  <option key={prop} value={prop} style={{ background: "#14161c", color: "#f3f4f6" }}>
                    {prop}
                  </option>
                ))}
              </select>
              <button
                className="studio-btn !py-0.5 !px-1.5 !text-[9.5px]"
                title="Insertar keyframe en el cabezal"
                onClick={() => {
                  const localT = Number(Math.max(0, Math.min(curveDuration, currentTime - activeSpan.start)).toFixed(2));
                  const fallbackVal = effectiveCurveProp === "cameraZoom" || effectiveCurveProp === "scaleX" || effectiveCurveProp === "scaleY" || effectiveCurveProp === "opacity" ? 1 : 0.5;
                  const val = evaluateKeyframes(activeCurveKeyframes, localT, fallbackVal);
                  dispatchOps([
                    {
                      op: "keyframe.upsert",
                      sceneId: activeSpan.scene.id,
                      ...(selectedLayerObj ? { layerId: selectedLayerObj.id } : {}),
                      property: effectiveCurveProp,
                      keyframe: { t: localT, value: Number(val.toFixed(3)), easing: "springSmooth" },
                    },
                  ]);
                  flashTimelineNotice(`Keyframe (${effectiveCurveProp}) insertado en ${localT}s.`);
                }}
              >
                +KF
              </button>
            </div>
          </div>

          {/* Interactive SVG Curve Preview */}
          <div
            className="flex-1 h-full rounded-lg relative overflow-hidden"
            style={{ background: "rgba(0,0,0,0.35)", border: "1px solid var(--border-subtle)" }}
          >
            {activeCurveKeyframes.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                Sin keyframes en «{effectiveCurveProp}» — Pulsa <strong className="mx-1">+KF</strong> para crear una curva Spring / Easing
              </div>
            ) : (() => {
              const vals = activeCurveKeyframes.map((k) => k.value);
              const minV = Math.min(...vals);
              const maxV = Math.max(...vals);
              const spanV = Math.max(0.1, maxV - minV);
              const samples = 48;
              const pts: string[] = [];
              for (let i = 0; i <= samples; i++) {
                const t = (i / samples) * curveDuration;
                const v = evaluateKeyframes(activeCurveKeyframes, t, vals[0]!);
                const xPct = (t / curveDuration) * 100;
                const yPct = 85 - ((v - minV) / spanV) * 70;
                pts.push(`${xPct.toFixed(2)},${Math.max(6, Math.min(94, yPct)).toFixed(2)}`);
              }
              const playheadLocal = Math.max(0, Math.min(curveDuration, currentTime - activeSpan.start));
              const playheadPct = (playheadLocal / curveDuration) * 100;
              return (
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
                  <polyline
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                    points={pts.join(" ")}
                  />
                  <line
                    x1={playheadPct}
                    y1={0}
                    x2={playheadPct}
                    y2={100}
                    stroke="#f472b6"
                    strokeWidth="1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {activeCurveKeyframes.map((kf, idx) => {
                    const cx = (kf.t / curveDuration) * 100;
                    const cy = 85 - ((kf.value - minV) / spanV) * 70;
                    return (
                      <circle
                        key={`${kf.t}-${idx}`}
                        cx={cx}
                        cy={Math.max(8, Math.min(92, cy))}
                        r="3.2"
                        fill="#ffd447"
                        stroke="#090b10"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                        className="cursor-pointer"
                        onClick={() => setCurrentTime(activeSpan.start + kf.t)}
                      >
                        <title>{`${kf.t.toFixed(2)}s → ${kf.value} (${kf.easing})`}</title>
                      </circle>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>
      )}

      {/* Scrollable Tracks Area */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        <div style={{ width: labelColW + trackWidth, minHeight: "100%" }} className="relative">
          {/* Playhead vertical line */}
          <div
            className="absolute top-0 bottom-0 z-30 pointer-events-none"
            style={{
              left: labelColW + currentTime * timelineZoom,
              width: 1.5,
              background: "var(--accent-primary)",
            }}
          >
            <div className="w-3 h-3 -ml-[5px] rounded-b-sm" style={{ background: "var(--accent-primary)" }} />
          </div>

          {/* Magnetic Snap Guide Line (visible while dragging/trimming audio or effects) */}
          {snapGuideSec !== null && (
            <div
              className="absolute top-0 bottom-0 z-30 pointer-events-none"
              style={{
                left: labelColW + snapGuideSec * timelineZoom,
                width: 1.5,
                background: "var(--accent-gold)",
                boxShadow: "0 0 8px rgba(255, 212, 71, 0.85)",
              }}
            />
          )}

          {/* 1. Time Ruler */}
          <div
            className="h-7 flex sticky top-0 z-20 border-b cursor-ew-resize touch-none"
            style={{ background: "var(--glass-surface-elevated)", borderColor: "var(--border-subtle)" }}
            onPointerDown={(e) => {
              scrubbingRef.current = true;
              scrubFromClientX(e.clientX);
            }}
          >
            <div
              className="shrink-0 px-2 flex items-center text-[10px] font-mono-code sticky left-0 z-20 border-r"
              style={{
                width: labelColW,
                background: "var(--glass-surface-elevated)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              {currentTime.toFixed(2)}s
            </div>
            <div className="relative flex-1">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 flex flex-col justify-between pointer-events-none"
                  style={{ left: t * timelineZoom }}
                >
                  <span className="text-[9px] font-mono-code pl-1 pt-0.5" style={{ color: "var(--text-muted)" }}>
                    {t}s
                  </span>
                  <div className="h-2 w-px" style={{ background: "var(--border-strong)" }} />
                </div>
              ))}

              {/* Interactive Timeline Markers */}
              {markers.map((mk) => (
                <button
                  key={mk.id}
                  type="button"
                  title={`${mk.label} (${mk.t.toFixed(2)}s) — Arrastra para mover · Clic para ir · Clic derecho para eliminar`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.button === 2) return;
                    beginHistoryBatch();
                    markerDragRef.current = {
                      markerId: mk.id,
                      startClientX: e.clientX,
                      origT: mk.t,
                      moved: false,
                    };
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (suppressNextClickRef.current) return;
                    setCurrentTime(mk.t);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dispatchOps([{ op: "marker.remove", markerId: mk.id }]);
                    flashTimelineNotice(`Marcador ${mk.label} eliminado.`);
                  }}
                  className="absolute top-0.5 -translate-x-1/2 z-30 w-3.5 h-4 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none transition-transform hover:scale-110"
                  style={{ left: mk.t * timelineZoom, color: mk.color || "#ffd447" }}
                >
                  <Bookmark size={11} fill="currentColor" />
                </button>
              ))}
            </div>
          </div>

          {/* 2. Scenes Track + CapCut Transition Cut Badges + Tactile Duration/Rolling Handles */}
          <div className="h-10 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              className={`shrink-0 flex items-center gap-1 sticky left-0 z-10 border-r overflow-hidden ${
                compact ? "px-1.5 text-[10px]" : "px-3 gap-1.5 text-[11px]"
              }`}
              style={{ width: labelColW, background: "var(--glass-surface)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" }}
            >
              <Clapperboard size={11} className="shrink-0" />
              <span className="truncate">{compact ? "Esc." : "Escenas"}</span>
            </div>
            <div className="relative flex-1">
              {sceneSpans.map(({ scene, start }, idx) => {
                const isSel = activeSpan?.scene.id === scene.id;
                const prevScene = idx > 0 ? sceneSpans[idx - 1]?.scene : undefined;
                const w = Math.max(24, scene.duration * timelineZoom - 2);
                const camKfCount = Object.values(scene.camera.keyframes).reduce((a, b) => a + (b?.length ?? 0), 0);
                const prevOutType = prevScene?.transitionOut.type ?? "cut";
                const curInType = scene.transitionIn.type;
                const hasTrans = curInType !== "cut" || prevOutType !== "cut";
                const transTitle = prevScene
                  ? prevOutType === curInType
                    ? `Transición entre «${prevScene.name}» y «${scene.name}» (${curInType}) — Clic para cambiar`
                    : `Transición desincronizada (${prevOutType} → ${curInType}) — Clic para unificar`
                  : `Transición de entrada (${curInType}) — Clic para cambiar`;
                return (
                  <React.Fragment key={scene.id}>
                    <div
                      onClick={() => {
                        if (suppressNextClickRef.current) return;
                        selectScene(scene.id, true);
                      }}
                      className="group absolute top-1 bottom-1 rounded-lg px-3 flex items-center justify-between cursor-pointer overflow-hidden select-none"
                      style={{
                        left: start * timelineZoom,
                        width: w,
                        background: isSel ? "var(--glass-active)" : "var(--glass-hover)",
                        border: `1.5px solid ${isSel ? "var(--accent-primary)" : "var(--border-strong)"}`,
                      }}
                      title={`${scene.name} (${scene.duration.toFixed(2)}s) — Arrastra los bordes para ajustar duración con ajuste magnético`}
                    >
                      {/* Left Rolling-Cut Handle (moves cut between prevScene & this scene) */}
                      {prevScene && (
                        <div
                          title={`Arrastra para desplazar el corte entre «${prevScene.name}» y «${scene.name}» (ajuste magnético)`}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.button === 2) return;
                            selectScene(scene.id, false);
                            beginHistoryBatch();
                            sceneDragRef.current = {
                              sceneId: scene.id,
                              prevSceneId: prevScene.id,
                              mode: "rolling-left",
                              startClientX: e.clientX,
                              origSceneStart: start,
                              origDuration: scene.duration,
                              origPrevDuration: prevScene.duration,
                              moved: false,
                            };
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute left-0 top-0 bottom-0 z-10 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                            compact ? "w-3.5" : "w-2.5"
                          } ${isSel ? "opacity-95" : "opacity-0 group-hover:opacity-100"}`}
                          style={{
                            background: isSel ? "rgba(247, 200, 214, 0.85)" : "rgba(247, 200, 214, 0.55)",
                          }}
                        >
                          <div className="w-[2px] h-3.5 rounded-full bg-[#090c12]" />
                        </div>
                      )}

                      <span className="text-[11px] font-medium truncate pointer-events-none">{scene.name}</span>
                      <span className="text-[9px] font-mono-code shrink-0 ml-1 flex items-center gap-1 pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        {camKfCount > 0 && <Diamond size={9} style={{ color: "var(--accent-gold)" }} />}
                        {scene.duration.toFixed(1)}s
                      </span>

                      {/* Right Edge Trim Handle (resizes scene duration freely with magnetic snap) */}
                      <div
                        title={`Arrastra para alargar o acortar «${scene.name}» (ajuste magnético)`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button === 2) return;
                          selectScene(scene.id, false);
                          beginHistoryBatch();
                          sceneDragRef.current = {
                            sceneId: scene.id,
                            mode: "resize-right",
                            startClientX: e.clientX,
                            origSceneStart: start,
                            origDuration: scene.duration,
                            moved: false,
                          };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute right-0 top-0 bottom-0 z-10 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                          compact ? "w-3.5" : "w-2.5"
                        } ${isSel ? "opacity-95" : "opacity-0 group-hover:opacity-100"}`}
                        style={{
                          background: isSel ? "rgba(247, 200, 214, 0.9)" : "rgba(247, 200, 214, 0.6)",
                        }}
                      >
                        <div className="w-[2px] h-3.5 rounded-full bg-[#090c12]" />
                      </div>
                    </div>

                    {/* CapCut-style Transition button right at every scene cut */}
                    {idx > 0 && (
                      <button
                        title={transTitle}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectScene(scene.id, false);
                          setCurrentTime(start + 0.05);
                          setActiveLeftTab("transitions");
                        }}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 w-5 h-5 rounded-md flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                        style={{
                          left: start * timelineZoom,
                          background: hasTrans ? "var(--accent-gold)" : "var(--glass-surface-elevated)",
                          color: hasTrans ? "#0b0c10" : "var(--text-secondary)",
                          border: "1px solid var(--border-strong)",
                        }}
                      >
                        <Shuffle size={10} />
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* 3. Timed Video / Motion / Overlay Effects Track */}
          <div className="h-8 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              onClick={() => setActiveLeftTab("effects")}
              className={`shrink-0 flex items-center justify-between gap-1 sticky left-0 z-10 border-r cursor-pointer overflow-hidden ${
                compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
              }`}
              style={{ width: labelColW, background: "var(--glass-surface)", borderColor: "var(--border-subtle)", color: "var(--accent-primary)" }}
            >
              <span className="flex items-center gap-1 min-w-0">
                <Sparkles size={11} className="shrink-0" />
                <span className="truncate">{compact ? "FX" : "Efectos"}</span>
              </span>
              <div className="flex items-center gap-0.5 shrink-0">
                {!compact && <span className="text-[9px] font-mono-code opacity-75">{effectClips.length}</span>}
                {effectClips.length > 0 && (() => {
                  const anyEnabled = effectClips.some((ec) => ec.enabled);
                  return (
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-white/10 cursor-pointer"
                      style={{ color: anyEnabled ? "var(--text-secondary)" : "var(--accent-danger)" }}
                      title={anyEnabled ? "Ocultar todos los efectos en video/preview" : "Mostrar todos los efectos en video/preview"}
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatchOps(
                          effectClips.map((ec) => ({
                            op: "effectClip.upsert" as const,
                            effectClip: { ...ec, enabled: !anyEnabled },
                          })),
                        );
                      }}
                    >
                      {anyEnabled ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                  );
                })()}
              </div>
            </div>
            <div className="relative flex-1">
              {effectClips.length === 0 ? (
                <div
                  onClick={() => setActiveLeftTab("effects")}
                  className="h-full px-3 flex items-center text-[10px] cursor-pointer opacity-60 hover:opacity-100"
                  style={{ color: "var(--text-muted)" }}
                >
                  + Añadir efectos de video, movimiento o atmósfera por segundos…
                </div>
              ) : (
                effectClips.map((ec) => {
                  const isSel = selectedEffectClipId === ec.id;
                  const cw = Math.max(24, ec.duration * timelineZoom - 2);
                  return (
                    <div
                      key={ec.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button === 2) return;
                        selectEffectClip(ec.id);
                        beginHistoryBatch();
                        effectDragRef.current = {
                          effectClipId: ec.id,
                          mode: "move",
                          startClientX: e.clientX,
                          origStart: ec.start,
                          origDuration: ec.duration,
                          moved: false,
                        };
                      }}
                      className="group absolute top-1 bottom-1 rounded-md px-3 flex items-center justify-between cursor-grab active:cursor-grabbing overflow-hidden select-none touch-none"
                      style={{
                        left: ec.start * timelineZoom,
                        width: cw,
                        opacity: ec.enabled ? 1 : 0.4,
                        background: isSel ? "rgba(247, 200, 214, 0.30)" : "rgba(247, 200, 214, 0.14)",
                        border: `1.5px solid ${isSel ? "var(--accent-primary)" : "rgba(247, 200, 214, 0.4)"}`,
                      }}
                      title={`${ec.name} (${ec.start.toFixed(2)}s · ${ec.duration.toFixed(2)}s) — Arrastra para mover o bordes para recortar`}
                    >
                      {/* Left resize handle to trim effect start */}
                      <div
                        title="Arrastra para recortar inicio del efecto (ajuste magnético)"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button === 2) return;
                          selectEffectClip(ec.id);
                          beginHistoryBatch();
                          effectDragRef.current = {
                            effectClipId: ec.id,
                            mode: "resize-left",
                            startClientX: e.clientX,
                            origStart: ec.start,
                            origDuration: ec.duration,
                            moved: false,
                          };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute left-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                          compact ? "w-3.5" : "w-2.5"
                        } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        style={{ background: isSel ? "rgba(247, 200, 214, 0.92)" : "rgba(247, 200, 214, 0.65)" }}
                      >
                        <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                      </div>
                      <span className="text-[10px] font-medium truncate pointer-events-none">
                        {ec.name} ({ec.duration.toFixed(1)}s)
                      </span>
                      {/* Right resize handle to drag effect duration */}
                      <div
                        title="Arrastra para ajustar duración del efecto (ajuste magnético)"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          if (e.button === 2) return;
                          selectEffectClip(ec.id);
                          beginHistoryBatch();
                          effectDragRef.current = {
                            effectClipId: ec.id,
                            mode: "resize-right",
                            startClientX: e.clientX,
                            origStart: ec.start,
                            origDuration: ec.duration,
                            moved: false,
                          };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute right-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                          compact ? "w-3.5" : "w-2.5"
                        } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        style={{ background: isSel ? "rgba(247, 200, 214, 0.92)" : "rgba(247, 200, 214, 0.65)" }}
                      >
                        <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. Active Scene Visual Layers & Keyframes */}
          {activeSpan &&
            [...activeSpan.scene.layers]
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((layer) => {
                const isSel = selectedLayerId === layer.id;
                const layerStart = activeSpan.start + layer.start;
                const layerDur = Math.min(activeSpan.scene.duration - layer.start, layer.duration ?? activeSpan.scene.duration);
                const kfTimes = Array.from(
                  new Set(
                    Object.values(layer.keyframes).flatMap((list) => (list ?? []).map((k) => k.t)),
                  ),
                );

                return (
                  <div key={layer.id} className="h-8 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
                    <div
                      onClick={() => selectLayer(layer.id)}
                      onContextMenu={(e) => openLayerMenu(e, activeSpan.scene.id, layer)}
                      className={`shrink-0 flex items-center justify-between gap-1 sticky left-0 z-10 border-r cursor-pointer overflow-hidden ${
                        compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
                      }`}
                      style={{
                        width: labelColW,
                        background: isSel ? "var(--glass-surface-elevated)" : "var(--glass-surface)",
                        borderColor: "var(--border-subtle)",
                        color: isSel ? "var(--text-primary)" : "var(--text-secondary)",
                        opacity: layer.visible ? 1 : 0.52,
                      }}
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        {!compact && <Layers size={11} className="shrink-0" />}
                        <span className="truncate">{layer.name}</span>
                      </span>
                      <button
                        type="button"
                        className="p-0.5 rounded hover:bg-white/10 cursor-pointer shrink-0"
                        style={{ color: layer.visible ? "var(--text-secondary)" : "var(--accent-danger)" }}
                        title={layer.visible ? `Ocultar capa «${layer.name}» en video/preview` : `Mostrar capa «${layer.name}» en video/preview`}
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatchOps([
                            {
                              op: "layer.update",
                              sceneId: activeSpan.scene.id,
                              layerId: layer.id,
                              patch: { visible: !layer.visible },
                            },
                          ]);
                        }}
                      >
                        {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                      </button>
                    </div>
                    <div className="relative flex-1">
                      {(() => {
                        const startLayerDrag = (
                          e: React.PointerEvent,
                          mode: "move" | "resize-left" | "resize-right",
                        ) => {
                          e.stopPropagation();
                          if (e.button === 2) return;
                          selectLayer(layer.id);
                          beginHistoryBatch();
                          layerDragRef.current = {
                            sceneId: activeSpan.scene.id,
                            sceneStart: activeSpan.start,
                            sceneDuration: activeSpan.scene.duration,
                            layerId: layer.id,
                            mode,
                            startClientX: e.clientX,
                            origStart: layer.start,
                            origDuration: Math.max(0.15, layerDur),
                            moved: false,
                          };
                        };
                        return (
                          <div
                            onPointerDown={(e) => startLayerDrag(e, "move")}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (suppressNextClickRef.current) return;
                              selectLayer(layer.id);
                            }}
                            onContextMenu={(e) => openLayerMenu(e, activeSpan.scene.id, layer)}
                            className="group absolute top-1 bottom-1 rounded-md px-3 flex items-center cursor-grab active:cursor-grabbing overflow-hidden select-none touch-none"
                            style={{
                              left: layerStart * timelineZoom,
                              width: Math.max(24, layerDur * timelineZoom - 2),
                              opacity: layer.visible ? 1 : 0.35,
                              background: isSel ? "rgba(247, 200, 214, 0.22)" : "rgba(255, 255, 255, 0.06)",
                              border: `1.5px solid ${isSel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                            }}
                            title={`${layer.name} (${layer.type} · ${layer.start.toFixed(2)}s · ${layerDur.toFixed(2)}s)${layer.visible ? "" : " · OCULTA"} — Arrastra para mover, bordes para recortar o clic derecho`}
                          >
                            {/* Left Edge Trim Handle */}
                            <div
                              title="Arrastra para recortar el inicio de la capa (ajuste magnético)"
                              onPointerDown={(e) => startLayerDrag(e, "resize-left")}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute left-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                                compact ? "w-3.5" : "w-2.5"
                              } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                              style={{
                                background: isSel ? "rgba(247, 200, 214, 0.9)" : "rgba(247, 200, 214, 0.6)",
                              }}
                            >
                              <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                            </div>

                            <span className="text-[10px] truncate pointer-events-none" style={{ color: "var(--text-secondary)" }}>
                              {layer.type} · {layerDur.toFixed(1)}s
                            </span>

                            {kfTimes.map((kt) => (
                              <div
                                key={kt}
                                title={`Keyframe en ${kt.toFixed(2)}s`}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectLayer(layer.id);
                                  setCurrentTime(layerStart + kt);
                                }}
                                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 cursor-pointer z-20"
                                style={{
                                  left: kt * timelineZoom,
                                  background: "var(--accent-gold)",
                                  border: "1px solid #0b0c10",
                                }}
                              />
                            ))}

                            {/* Right Edge Trim Handle */}
                            <div
                              title="Arrastra para recortar o alargar el final de la capa (ajuste magnético)"
                              onPointerDown={(e) => startLayerDrag(e, "resize-right")}
                              onClick={(e) => e.stopPropagation()}
                              className={`absolute right-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                                compact ? "w-3.5" : "w-2.5"
                              } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                              style={{
                                background: isSel ? "rgba(247, 200, 214, 0.9)" : "rgba(247, 200, 214, 0.6)",
                              }}
                            >
                              <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}

          {/* 5. Subtitles Track */}
          <div className="h-8 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
            <div
              onClick={() => setActiveLeftTab("subtitles")}
              className={`shrink-0 flex items-center justify-between gap-1 sticky left-0 z-10 border-r cursor-pointer overflow-hidden ${
                compact ? "px-1.5 text-[10px]" : "px-2.5 text-[11px]"
              }`}
              style={{
                width: labelColW,
                background: "var(--glass-surface)",
                borderColor: "var(--border-subtle)",
                color: "var(--accent-gold)",
                opacity: project.subtitles.enabled ? 1 : 0.5,
              }}
            >
              <span className="flex items-center gap-1 min-w-0">
                <Captions size={11} className="shrink-0" />
                <span className="truncate">{compact ? "Subs" : "Subtítulos"}</span>
              </span>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-white/10 cursor-pointer shrink-0"
                style={{ color: project.subtitles.enabled ? "var(--accent-gold)" : "var(--accent-danger)" }}
                title={project.subtitles.enabled ? "Ocultar pista de subtítulos en video/preview" : "Mostrar pista de subtítulos en video/preview"}
                onClick={(e) => {
                  e.stopPropagation();
                  dispatchOps([{ op: "subtitle.updateStyle", enabled: !project.subtitles.enabled }]);
                }}
              >
                {project.subtitles.enabled ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
            <div className="relative flex-1" style={{ opacity: project.subtitles.enabled ? 1 : 0.35 }}>
              {project.subtitles.cues.map((cue) => {
                const isSel = selectedCueId === cue.id;
                const startCueDrag = (
                  e: React.PointerEvent,
                  mode: "move" | "resize-left" | "resize-right",
                ) => {
                  e.stopPropagation();
                  if (e.button === 2) return;
                  selectSubtitleCue(cue.id, null);
                  beginHistoryBatch();
                  subtitleDragRef.current = {
                    cueId: cue.id,
                    mode,
                    startClientX: e.clientX,
                    origStart: cue.start,
                    origEnd: cue.end,
                    origWords: cue.words.map((w) => ({ ...w })),
                    moved: false,
                  };
                };
                return (
                  <div
                    key={cue.id}
                    onPointerDown={(e) => startCueDrag(e, "move")}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (suppressNextClickRef.current) return;
                      selectSubtitleCue(cue.id, null);
                      setActiveLeftTab("subtitles");
                      setCurrentTime(cue.start + 0.05);
                    }}
                    className="group absolute top-1 bottom-1 rounded-md px-3 flex items-center cursor-grab active:cursor-grabbing overflow-hidden select-none touch-none"
                    style={{
                      left: cue.start * timelineZoom,
                      width: Math.max(24, (cue.end - cue.start) * timelineZoom - 2),
                      background: isSel ? "rgba(255, 212, 71, 0.28)" : "rgba(255, 212, 71, 0.13)",
                      border: `1.5px solid ${isSel ? "var(--accent-gold)" : "rgba(255, 212, 71, 0.38)"}`,
                    }}
                    title={`"${cue.text}" (${cue.start.toFixed(2)}s → ${cue.end.toFixed(2)}s) — Arrastra para mover o bordes para ajustar duración`}
                  >
                    {/* Left Edge Trim Handle */}
                    <div
                      title="Arrastra para recortar inicio del subtítulo (ajuste magnético)"
                      onPointerDown={(e) => startCueDrag(e, "resize-left")}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute left-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                        compact ? "w-3.5" : "w-2.5"
                      } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      style={{
                        background: isSel ? "rgba(255, 212, 71, 0.95)" : "rgba(255, 212, 71, 0.7)",
                      }}
                    >
                      <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                    </div>

                    <span className="text-[10px] truncate pointer-events-none">{cue.text}</span>

                    {/* Right Edge Trim Handle */}
                    <div
                      title="Arrastra para recortar o alargar fin del subtítulo (ajuste magnético)"
                      onPointerDown={(e) => startCueDrag(e, "resize-right")}
                      onClick={(e) => e.stopPropagation()}
                      className={`absolute right-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                        compact ? "w-3.5" : "w-2.5"
                      } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      style={{
                        background: isSel ? "rgba(255, 212, 71, 0.95)" : "rgba(255, 212, 71, 0.7)",
                      }}
                    >
                      <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 6. Audio Tracks with Real Waveforms + Right-Click AI/DSP Context Menu */}
          {project.audioTracks.map((track) => (
            <div key={track.id} className="h-9 flex border-b" style={{ borderColor: "var(--border-subtle)" }}>
              <div
                className={`shrink-0 flex items-center justify-between gap-1 sticky left-0 z-10 border-r overflow-hidden ${
                  compact ? "px-1.5 text-[10px]" : "px-3 text-[11px]"
                }`}
                style={{ width: labelColW, background: "var(--glass-surface)", borderColor: "var(--border-subtle)", color: "var(--accent-teal)" }}
              >
                <span className="flex items-center gap-1 min-w-0">
                  {track.role === "voice" ? <Mic size={11} className="shrink-0" /> : <Music size={11} className="shrink-0" />}
                  <span className="truncate">{track.name}</span>
                </span>
                <button
                  className="opacity-70 hover:opacity-100 cursor-pointer shrink-0 p-0.5"
                  title={track.muted ? "Activar audio" : "Silenciar pista"}
                  onClick={() =>
                    dispatchOps([{ op: "audioTrack.upsert", track: { ...track, muted: !track.muted } }])
                  }
                >
                  {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                </button>
              </div>
              <div className="relative flex-1">
                {track.clips.map((clip) => {
                  const cw = Math.max(28, clip.duration * timelineZoom - 2);
                  const isSel =
                    selectedAudioClip?.trackId === track.id && selectedAudioClip?.clipId === clip.id;
                  const assetMeta = project.assets.find((a) => a.id === clip.assetId);
                  const maxAssetDur =
                    typeof assetMeta?.durationSec === "number" && assetMeta.durationSec > 0
                      ? assetMeta.durationSec
                      : null;

                  const startAudioDrag = (
                    e: React.PointerEvent,
                    mode: "move" | "resize-left" | "resize-right",
                  ) => {
                    e.stopPropagation();
                    if (e.button === 2) return;
                    selectAudioClip({ trackId: track.id, clipId: clip.id });
                    beginHistoryBatch();
                    audioClipDragRef.current = {
                      trackId: track.id,
                      clipId: clip.id,
                      mode,
                      startClientX: e.clientX,
                      origStart: clip.start,
                      origDuration: clip.duration,
                      origTrimStart: clip.trimStart,
                      maxAssetDuration: maxAssetDur,
                      loop: clip.loop,
                      moved: false,
                    };
                  };

                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(e) => startAudioDrag(e, "move")}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAudioClip({ trackId: track.id, clipId: clip.id });
                      }}
                      onContextMenu={(e) => openAudioMenu(e, track.id, clip.id, clip.name)}
                      className="group absolute top-1 bottom-1 rounded-md overflow-hidden flex items-center cursor-grab active:cursor-grabbing touch-none select-none"
                      style={{
                        left: clip.start * timelineZoom,
                        width: cw,
                        background: isSel ? "rgba(76, 230, 200, 0.26)" : "rgba(76, 230, 200, 0.13)",
                        border: `1.5px solid ${isSel ? "var(--accent-teal)" : "rgba(76, 230, 200, 0.38)"}`,
                      }}
                      title={`${clip.name} (${clip.start.toFixed(2)}s · ${clip.duration.toFixed(2)}s) — Arrastra para mover, bordes para recortar o clic derecho para opciones`}
                    >
                      <WaveformBar assetId={clip.assetId} width={cw} height={26} color="#4ce6c8" />

                      {/* Visual Fade-In Ramp Overlay */}
                      {clip.fadeIn > 0.01 && (
                        <div
                          className="absolute left-0 top-0 bottom-0 pointer-events-none"
                          style={{
                            width: Math.min(cw * 0.9, clip.fadeIn * timelineZoom),
                            background: "linear-gradient(to bottom right, rgba(6,8,14,0.72) 48%, transparent 52%)",
                          }}
                        />
                      )}
                      {/* Visual Fade-Out Ramp Overlay */}
                      {clip.fadeOut > 0.01 && (
                        <div
                          className="absolute right-0 top-0 bottom-0 pointer-events-none"
                          style={{
                            width: Math.min(cw * 0.9, clip.fadeOut * timelineZoom),
                            background: "linear-gradient(to bottom left, rgba(6,8,14,0.72) 48%, transparent 52%)",
                          }}
                        />
                      )}

                      {/* Left Edge Trim Handle (CapCut-style grip bar) */}
                      <div
                        title="Arrastra para recortar el inicio del audio (ajuste magnético)"
                        onPointerDown={(e) => startAudioDrag(e, "resize-left")}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute left-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                          compact ? "w-3.5" : "w-2.5"
                        } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        style={{
                          background: isSel ? "rgba(76, 230, 200, 0.9)" : "rgba(76, 230, 200, 0.65)",
                        }}
                      >
                        <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                      </div>

                      {/* Right Edge Trim Handle (CapCut-style grip bar) */}
                      <div
                        title="Arrastra para recortar o alargar el final del audio (ajuste magnético)"
                        onPointerDown={(e) => startAudioDrag(e, "resize-right")}
                        onClick={(e) => e.stopPropagation()}
                        className={`absolute right-0 top-0 bottom-0 z-20 cursor-ew-resize touch-none flex items-center justify-center transition-opacity ${
                          compact ? "w-3.5" : "w-2.5"
                        } ${isSel ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        style={{
                          background: isSel ? "rgba(76, 230, 200, 0.9)" : "rgba(76, 230, 200, 0.65)",
                        }}
                      >
                        <div className="w-[2px] h-3 rounded-full bg-[#090c12]" />
                      </div>

                      {/* Draggable Fade-In Handle (offset inside trim handle) */}
                      <div
                        title={`Fade In: ${clip.fadeIn.toFixed(2)}s (arrastra horizontalmente)`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectAudioClip({ trackId: track.id, clipId: clip.id });
                          beginHistoryBatch();
                          audioFadeDragRef.current = {
                            trackId: track.id,
                            clipId: clip.id,
                            side: "in",
                            startClientX: e.clientX,
                            origFade: clip.fadeIn,
                            clipDuration: clip.duration,
                          };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-0 w-2.5 h-2.5 rounded-full cursor-ew-resize touch-none z-30 opacity-75 group-hover:opacity-100"
                        style={{
                          left: Math.max(10, Math.min(cw - 14, clip.fadeIn * timelineZoom + 6)),
                          background: "var(--accent-gold)",
                          border: "1px solid #0b0c10",
                        }}
                      />

                      {/* Draggable Fade-Out Handle (offset inside trim handle) */}
                      <div
                        title={`Fade Out: ${clip.fadeOut.toFixed(2)}s (arrastra horizontalmente)`}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          selectAudioClip({ trackId: track.id, clipId: clip.id });
                          beginHistoryBatch();
                          audioFadeDragRef.current = {
                            trackId: track.id,
                            clipId: clip.id,
                            side: "out",
                            startClientX: e.clientX,
                            origFade: clip.fadeOut,
                            clipDuration: clip.duration,
                          };
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-0 w-2.5 h-2.5 rounded-full cursor-ew-resize touch-none z-30 opacity-75 group-hover:opacity-100"
                        style={{
                          right: Math.max(10, Math.min(cw - 14, clip.fadeOut * timelineZoom + 6)),
                          background: "var(--accent-gold)",
                          border: "1px solid #0b0c10",
                        }}
                      />

                      <span
                        className="absolute left-3.5 text-[9.5px] font-medium truncate pointer-events-none max-w-[72%]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {clip.name}
                      </span>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => openAudioMenu(e, track.id, clip.id, clip.name)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 rounded p-0.5 cursor-pointer z-20"
                        style={{ background: "rgba(10,12,18,0.8)", color: "var(--text-primary)" }}
                        title="Opciones de audio (Subtítulos, Denoise, Voz…)"
                      >
                        <MoreHorizontal size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audio Clip Right-Click Context Menu */}
      {ctxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-[248px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider truncate border-b mb-0.5" style={{ color: "var(--accent-teal)", borderColor: "var(--border-subtle)" }}>
            Audio: {ctxMenu.clipName}
          </div>

          <button
            className="studio-btn studio-btn-accent justify-start !py-1.5 !px-2 !text-[11px] w-full mb-0.5"
            onClick={() => {
              openReplaceModal({ kind: "audio", trackId: ctxMenu.trackId, clipId: ctxMenu.clipId });
              setCtxMenu(null);
            }}
          >
            <RefreshCw size={13} />
            Reemplazar audio (librería / importar)…
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => void runAudioAction(ctxMenu.trackId, ctxMenu.clipId, "transcribe")}
          >
            <Captions size={13} style={{ color: "var(--accent-gold)" }} />
            Generar subtítulos (Whisper IA)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => void runAudioAction(ctxMenu.trackId, ctxMenu.clipId, "voice_enhance")}
          >
            <Wand2 size={13} style={{ color: "var(--accent-primary)" }} />
            Mejorar voz (EQ + Compresión)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => void runAudioAction(ctxMenu.trackId, ctxMenu.clipId, "denoise")}
          >
            <Sparkles size={13} style={{ color: "var(--accent-teal)" }} />
            Eliminar ruido de fondo (Denoise)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => void runAudioAction(ctxMenu.trackId, ctxMenu.clipId, "normalize")}
          >
            <Gauge size={13} />
            Normalizar volumen (-16 LUFS)
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => void runAudioAction(ctxMenu.trackId, ctxMenu.clipId, "trim_silence")}
          >
            <Scissors size={13} />
            Recortar silencios automáticamente
          </button>

          <div className="my-0.5 border-t" style={{ borderColor: "var(--border-subtle)" }} />

          <div className="px-1.5 py-1 flex items-center gap-1">
            <button
              className="studio-btn flex-1 !py-1 !px-1.5 !text-[10px] border"
              style={{ borderColor: "var(--border-subtle)" }}
              onClick={() => {
                const tr = project.audioTracks.find((t) => t.id === ctxMenu.trackId);
                const c = tr?.clips.find((x) => x.id === ctxMenu.clipId);
                if (c) {
                  dispatchOps([{ op: "audioClip.upsert", trackId: ctxMenu.trackId, clip: { ...c, fadeIn: Math.min(0.6, c.duration * 0.4) } }]);
                }
                setCtxMenu(null);
              }}
            >
              +Fade In
            </button>
            <button
              className="studio-btn flex-1 !py-1 !px-1.5 !text-[10px] border"
              style={{ borderColor: "var(--border-subtle)" }}
              onClick={() => {
                const tr = project.audioTracks.find((t) => t.id === ctxMenu.trackId);
                const c = tr?.clips.find((x) => x.id === ctxMenu.clipId);
                if (c) {
                  dispatchOps([{ op: "audioClip.upsert", trackId: ctxMenu.trackId, clip: { ...c, fadeOut: Math.min(1.2, c.duration * 0.45) } }]);
                }
                setCtxMenu(null);
              }}
            >
              +Fade Out
            </button>
            <button
              className="studio-btn !py-1 !px-1.5 !text-[10px] border"
              style={{ borderColor: "var(--border-subtle)" }}
              onClick={() => {
                const tr = project.audioTracks.find((t) => t.id === ctxMenu.trackId);
                const c = tr?.clips.find((x) => x.id === ctxMenu.clipId);
                if (c) {
                  dispatchOps([{ op: "audioClip.upsert", trackId: ctxMenu.trackId, clip: { ...c, fadeIn: 0, fadeOut: 0 } }]);
                }
                setCtxMenu(null);
              }}
            >
              0s
            </button>
          </div>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              applyAutoDucking(ctxMenu.trackId);
              setBusyNotice("Auto-ducking (-8 dB) aplicado a música y ambiente bajo esta pista.");
              window.setTimeout(() => setBusyNotice(null), 2400);
              setCtxMenu(null);
            }}
          >
            <Volume2 size={13} />
            Auto-ducking de música bajo voz
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              splitAudioClipAtPlayhead(ctxMenu.trackId, ctxMenu.clipId);
              setCtxMenu(null);
            }}
          >
            <Scissors size={13} />
            Dividir clip en {currentTime.toFixed(2)}s
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              const tr = project.audioTracks.find((t) => t.id === ctxMenu.trackId);
              const c = tr?.clips.find((x) => x.id === ctxMenu.clipId);
              if (c) {
                dispatchOps([
                  {
                    op: "audioClip.upsert",
                    trackId: ctxMenu.trackId,
                    clip: {
                      ...c,
                      id: `${c.id}_copy_${Date.now().toString(36).slice(-3)}`,
                      name: `${c.name} copia`,
                      start: Number((c.start + c.duration + 0.1).toFixed(2)),
                    },
                  },
                ]);
              }
              setCtxMenu(null);
            }}
          >
            <Copy size={13} />
            Duplicar clip
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            style={{ color: "var(--accent-danger)" }}
            onClick={() => {
              dispatchOps([{ op: "audioClip.remove", trackId: ctxMenu.trackId, clipId: ctxMenu.clipId }]);
              selectAudioClip(null);
              setCtxMenu(null);
            }}
          >
            <Trash2 size={13} />
            Eliminar clip
          </button>
        </div>
      )}

      {/* Visual Layer Right-Click Context Menu */}
      {layerCtxMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
          className="fixed z-50 w-[230px] glass-elevated rounded-xl p-1.5 flex flex-col gap-0.5 shadow-2xl"
          style={{ left: layerCtxMenu.x, top: layerCtxMenu.y }}
        >
          <div
            className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider truncate border-b mb-0.5"
            style={{ color: "var(--accent-primary)", borderColor: "var(--border-subtle)" }}
          >
            {layerCtxMenu.layerType}: {layerCtxMenu.layerName}
          </div>

          {(layerCtxMenu.layerType === "background" ||
            layerCtxMenu.layerType === "sprite" ||
            layerCtxMenu.layerType === "character" ||
            layerCtxMenu.layerType === "pip") && (
            <button
              className="studio-btn studio-btn-accent justify-start !py-1.5 !px-2 !text-[11px] w-full"
              onClick={() => {
                openReplaceModal({
                  kind: "layer",
                  sceneId: layerCtxMenu.sceneId,
                  layerId: layerCtxMenu.layerId,
                });
                setLayerCtxMenu(null);
              }}
            >
              <RefreshCw size={13} />
              Reemplazar recurso…
            </button>
          )}

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              dispatchOps([
                {
                  op: "layer.update",
                  sceneId: layerCtxMenu.sceneId,
                  layerId: layerCtxMenu.layerId,
                  patch: { visible: !layerCtxMenu.visible },
                },
              ]);
              setLayerCtxMenu(null);
            }}
          >
            {layerCtxMenu.visible ? <EyeOff size={13} /> : <Eye size={13} />}
            {layerCtxMenu.visible ? "Ocultar capa" : "Mostrar capa"}
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            onClick={() => {
              const sc = project.scenes.find((s) => s.id === layerCtxMenu.sceneId);
              const l = sc?.layers.find((x) => x.id === layerCtxMenu.layerId);
              if (l) {
                const copyId = `${l.id}_copy_${Date.now().toString(36).slice(-3)}`;
                dispatchOps([
                  {
                    op: "layer.add",
                    sceneId: layerCtxMenu.sceneId,
                    layer: {
                      ...structuredClone(l),
                      id: copyId,
                      name: `${l.name} copia`,
                      zIndex: l.zIndex + 1,
                      transform: { ...l.transform, x: Math.min(0.95, l.transform.x + 0.04) },
                    },
                  },
                ]);
                selectLayer(copyId);
              }
              setLayerCtxMenu(null);
            }}
          >
            <Copy size={13} />
            Duplicar capa
          </button>

          <button
            className="studio-btn justify-start !py-1.5 !px-2 !text-[11px] w-full"
            style={{ color: "var(--accent-danger)" }}
            onClick={() => {
              dispatchOps([
                {
                  op: "layer.remove",
                  sceneId: layerCtxMenu.sceneId,
                  layerId: layerCtxMenu.layerId,
                },
              ]);
              selectLayer(null);
              setLayerCtxMenu(null);
            }}
          >
            <Trash2 size={13} />
            Eliminar capa
          </button>
        </div>
      )}
    </section>
  );
};
