import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shapes,
  Sparkles,
  Upload,
  User,
  Volume2,
  X,
} from "lucide-react";
import type { AssetKind } from "@storia/schema";
import {
  AudioLibraryItem,
  LibraryId,
  studioApi,
  VectorLibraryItem,
  VectorLibrarySource,
} from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";
import { TtsStudioPanel } from "./TtsStudioPanel";

type LayerTab = "upload" | "project" | "vectors" | "cast";
type AudioTab = "upload" | "project" | "library" | "tts";
type ModalAudioSource = "openverse" | "wikimedia" | "internet_archive" | "local" | "all";

const MODAL_VEC_SOURCES: {
  id: VectorLibrarySource;
  label: string;
  requiresAny: LibraryId[];
  online?: boolean;
  builtin?: boolean;
}[] = [
  { id: "videos", label: "Videos", requiresAny: ["local_videos"] },
  { id: "workspace", label: "Workspace", requiresAny: ["local_workspace"] },
  { id: "svg_backgrounds", label: "Fondos SVG", requiresAny: ["svg_backgrounds"], builtin: true },
  { id: "iconify", label: "Iconify", requiresAny: ["iconify"], online: true },
  { id: "pixel_game_sprites", label: "Pixel / Game", requiresAny: ["pixel_game_sprites"], online: true },
  { id: "openmoji_props", label: "Props Color", requiresAny: ["openmoji_props"], online: true },
  { id: "openverse", label: "Openverse", requiresAny: ["openverse"], online: true },
  { id: "wikimedia", label: "Wikimedia", requiresAny: ["wikimedia"], online: true },
];

const MODAL_AUD_SOURCES: {
  id: ModalAudioSource;
  label: string;
  requiresAny: LibraryId[];
  kind: "all" | "local" | "online";
}[] = [
  {
    id: "all",
    label: "Todo",
    requiresAny: ["openverse", "wikimedia", "internet_archive", "local_videos", "local_workspace"],
    kind: "all",
  },
  { id: "local", label: "Local", requiresAny: ["local_videos", "local_workspace"], kind: "local" },
  { id: "openverse", label: "Openverse", requiresAny: ["openverse"], kind: "online" },
  { id: "wikimedia", label: "Wikimedia", requiresAny: ["wikimedia"], kind: "online" },
  { id: "internet_archive", label: "Archive", requiresAny: ["internet_archive"], kind: "online" },
];

export const ReplaceResourceModal: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const replaceTarget = useStudioStore((s) => s.replaceTarget);
  const enabledLibraries = useStudioStore((s) => s.enabledLibraries);
  const closeReplaceModal = useStudioStore((s) => s.closeReplaceModal);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);
  const dispatchOps = useStudioStore((s) => s.dispatchOps);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const availableVecSources = useMemo(
    () => MODAL_VEC_SOURCES.filter((o) => o.requiresAny.some((id) => Boolean(enabledLibraries[id]))),
    [enabledLibraries],
  );
  const availableAudSources = useMemo(
    () => MODAL_AUD_SOURCES.filter((o) => o.requiresAny.some((id) => Boolean(enabledLibraries[id]))),
    [enabledLibraries],
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const [layerTab, setLayerTab] = useState<LayerTab>("vectors");
  const [audioTab, setAudioTab] = useState<AudioTab>("library");
  const [uploadAsPixelArt, setUploadAsPixelArt] = useState(false);
  const [preserveClipDuration, setPreserveClipDuration] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Vector library search state
  const [vecQuery, setVecQuery] = useState("");
  const [vecSource, setVecSource] = useState<"all" | VectorLibrarySource>("videos");
  const [vecItems, setVecItems] = useState<VectorLibraryItem[]>([]);
  const [vecLoading, setVecLoading] = useState(false);

  // Audio library search state
  const [audQuery, setAudQuery] = useState("whoosh");
  const [audSource, setAudSource] = useState<ModalAudioSource>("all");
  const [audItems, setAudItems] = useState<AudioLibraryItem[]>([]);
  const [audLoading, setAudLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const targetScene =
    replaceTarget?.kind === "layer"
      ? project.scenes.find((s) => s.id === replaceTarget.sceneId) ?? null
      : null;
  const targetLayer =
    replaceTarget?.kind === "layer" && targetScene
      ? targetScene.layers.find((l) => l.id === replaceTarget.layerId) ?? null
      : null;

  const targetTrack =
    replaceTarget?.kind === "audio"
      ? project.audioTracks.find((t) => t.id === replaceTarget.trackId) ?? null
      : null;
  const targetClip =
    replaceTarget?.kind === "audio" && targetTrack
      ? targetTrack.clips.find((c) => c.id === replaceTarget.clipId) ?? null
      : null;

  useEffect(() => {
    setError(null);
    setBusy(false);
    previewAudioRef.current?.pause();
    setPlayingId(null);
    if (replaceTarget?.kind === "layer") {
      setLayerTab(targetLayer?.type === "character" ? "cast" : "vectors");
    } else if (replaceTarget?.kind === "audio") {
      setAudioTab(targetTrack?.role === "voice" ? "upload" : "library");
      setAudQuery(targetTrack?.role === "music" ? "cinematic" : "whoosh");
    }
  }, [replaceTarget, targetLayer?.type, targetTrack?.role]);

  useEffect(() => {
    return () => {
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (availableVecSources.length > 0 && !availableVecSources.some((o) => o.id === vecSource)) {
      setVecSource(availableVecSources[0]!.id);
    }
  }, [availableVecSources, vecSource]);

  useEffect(() => {
    if (availableAudSources.length > 0 && !availableAudSources.some((o) => o.id === audSource)) {
      setAudSource(availableAudSources[0]!.id);
    }
  }, [availableAudSources, audSource]);

  const fetchVectors = useCallback(async () => {
    if (availableVecSources.length === 0) {
      setVecItems([]);
      return;
    }
    if (!availableVecSources.some((o) => o.id === vecSource)) return;
    setVecLoading(true);
    setError(null);
    try {
      const res = await studioApi.searchVectors({
        q: vecQuery.trim() || undefined,
        source: vecSource,
        category: targetLayer?.type === "background" && vecSource === "videos" ? "backgrounds" : "all",
        page: 1,
        pageSize: 24,
      });
      setVecItems(res.items);
      if (res.onlineWarning) setError(res.onlineWarning);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setVecLoading(false);
    }
  }, [availableVecSources, enabledLibraries, vecQuery, vecSource, targetLayer?.type]);

  const fetchAudio = useCallback(async () => {
    if (availableAudSources.length === 0) {
      setAudItems([]);
      return;
    }
    if (!availableAudSources.some((o) => o.id === audSource)) return;
    setAudLoading(true);
    setError(null);
    try {
      const res = await studioApi.searchAudio({
        q: audQuery.trim() || undefined,
        source: audSource,
        category: targetTrack?.role === "music" ? "music" : targetTrack?.role === "ambience" ? "ambience" : "all",
        page: 1,
        pageSize: 20,
      });
      setAudItems(res.items);
      if (res.onlineWarning) setError(res.onlineWarning);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAudLoading(false);
    }
  }, [availableAudSources, enabledLibraries, audQuery, audSource, targetTrack?.role]);

  useEffect(() => {
    if (!replaceTarget) return;
    if (replaceTarget.kind === "layer" && layerTab === "vectors") {
      const t = window.setTimeout(() => void fetchVectors(), 200);
      return () => window.clearTimeout(t);
    }
    if (replaceTarget.kind === "audio" && audioTab === "library") {
      const t = window.setTimeout(() => void fetchAudio(), 200);
      return () => window.clearTimeout(t);
    }
  }, [replaceTarget, layerTab, audioTab, fetchVectors, fetchAudio]);

  if (!replaceTarget) return null;

  const notifyAndClose = (msg: string) => {
    setBusyNotice(msg);
    window.setTimeout(() => setBusyNotice(null), 2600);
    previewAudioRef.current?.pause();
    closeReplaceModal();
  };

  // --- LAYER REPLACEMENT HANDLERS ---
  const replaceLayerWithProjectAsset = (assetId: string, assetName: string, scaleMode: "linear" | "nearest") => {
    if (!targetScene || !targetLayer) return;
    if (targetLayer.type === "background") {
      dispatchOps([
        {
          op: "layer.update",
          sceneId: targetScene.id,
          layerId: targetLayer.id,
          patch: { name: assetName, sourceType: "asset", assetId, scaleMode, fit: "cover" },
        },
      ]);
    } else if (targetLayer.type === "sprite") {
      dispatchOps([
        {
          op: "layer.update",
          sceneId: targetScene.id,
          layerId: targetLayer.id,
          patch: { name: assetName, assetId, scaleMode, pixelSnap: scaleMode === "nearest" },
        },
      ]);
    } else if (targetLayer.type === "character") {
      dispatchOps([
        {
          op: "layer.update",
          sceneId: targetScene.id,
          layerId: targetLayer.id,
          patch: { customSpriteAssetId: assetId, scaleMode },
        },
      ]);
    }
    notifyAndClose(`Capa "${targetLayer.name}" reemplazada por "${assetName}"`);
  };

  const replaceLayerWithVector = async (item: VectorLibraryItem) => {
    if (!targetScene || !targetLayer) return;
    setBusy(true);
    setError(null);
    try {
      const isLocalOrBuiltin =
        item.source === "videos" || item.source === "workspace" || item.source === "svg_backgrounds";
      const isRemoteUrl = item.source === "openverse" || item.source === "wikimedia";
      const res = await studioApi.importVectorFromLibrary(project.id, {
        itemId: isLocalOrBuiltin ? item.id : undefined,
        iconifyName: item.iconifyName,
        remoteUrl: isRemoteUrl ? item.remoteUrl : undefined,
        name: item.name,
        source: item.source,
        category: item.category,
        license: item.license,
        author: item.author,
        sourceUrl: item.sourceUrl,
        insertMode: targetLayer.type === "background" ? "background" : "sprite",
        sceneId: targetScene.id,
        replaceLayerId: targetLayer.id,
        scaleMode: item.defaultScaleMode,
      });
      setProjectFromRemote(res.project, res.receipt);
      notifyAndClose(`"${targetLayer.name}" reemplazado con "${item.name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const replaceCharacterWithCast = (characterId: string, charName: string) => {
    if (!targetScene || !targetLayer || targetLayer.type !== "character") return;
    dispatchOps([
      {
        op: "layer.update",
        sceneId: targetScene.id,
        layerId: targetLayer.id,
        patch: { characterId, name: charName, customSpriteAssetId: undefined },
      },
    ]);
    notifyAndClose(`Personaje cambiado a "${charName}"`);
  };

  // --- AUDIO REPLACEMENT HANDLERS ---
  const replaceAudioWithProjectAsset = (assetId: string, assetName: string, durationSec?: number) => {
    if (!targetTrack || !targetClip) return;
    const asset = project.assets.find((a) => a.id === assetId);
    dispatchOps([
      {
        op: "audioClip.upsert",
        trackId: targetTrack.id,
        clip: {
          ...targetClip,
          name: assetName,
          assetId,
          trimStart: 0,
          duration: preserveClipDuration
            ? targetClip.duration
            : Number(Math.max(0.15, durationSec ?? targetClip.duration).toFixed(3)),
        },
      },
    ]);
    if (asset) void audioEngine.loadAssetAudio(asset);
    notifyAndClose(`Audio "${targetClip.name}" reemplazado por "${assetName}"`);
  };

  const replaceAudioWithLibrary = async (item: AudioLibraryItem) => {
    if (!targetTrack || !targetClip) return;
    setBusy(true);
    setError(null);
    try {
      const isOnline =
        item.source === "openverse" || item.source === "wikimedia" || item.source === "internet_archive";
      const res = await studioApi.importAudioFromLibrary(project.id, {
        itemId: !isOnline ? item.id : undefined,
        remoteUrl: isOnline ? item.remoteUrl : undefined,
        name: item.name,
        category: item.category,
        source: item.source,
        license: item.license,
        author: item.author,
        attribution: item.attribution,
        sourceUrl: item.sourceUrl,
        durationSec: item.durationSec,
        insertToTimeline: true,
        replaceTrackId: targetTrack.id,
        replaceClipId: targetClip.id,
        preserveClipDuration,
      });
      setProjectFromRemote(res.project, res.receipt);
      void audioEngine.loadAssetAudio(res.asset);
      notifyAndClose(`Audio "${targetClip.name}" reemplazado con "${item.name}"`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  // --- LOCAL FILE UPLOAD HANDLER (BOTH LAYER & AUDIO) ---
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
        reader.readAsDataURL(file);
      });

      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const isAudio = replaceTarget.kind === "audio" || ["mp3", "wav", "ogg", "m4a", "flac"].includes(ext);
      const kind: AssetKind = isAudio
        ? "audio"
        : ext === "svg"
          ? "svg"
          : uploadAsPixelArt
            ? "pixel_art"
            : "image";

      const uploaded = await studioApi.uploadAsset(project.id, {
        name: file.name.replace(/\.[^.]+$/, ""),
        filename: file.name,
        kind,
        scaleMode: uploadAsPixelArt ? "nearest" : "linear",
        mimeType: file.type || undefined,
        base64,
      });
      setProjectFromRemote(uploaded.project, uploaded.receipt);

      if (replaceTarget.kind === "audio" && targetTrack && targetClip) {
        const decoded = await audioEngine.loadAssetAudio(uploaded.asset);
        const dur = decoded?.buffer.duration ?? uploaded.asset.durationSec ?? targetClip.duration;
        dispatchOps([
          {
            op: "audioClip.upsert",
            trackId: targetTrack.id,
            clip: {
              ...targetClip,
              name: uploaded.asset.name,
              assetId: uploaded.asset.id,
              trimStart: 0,
              duration: preserveClipDuration
                ? targetClip.duration
                : Number(Math.max(0.15, dur).toFixed(3)),
            },
          },
        ]);
        notifyAndClose(`Audio reemplazado por archivo local "${uploaded.asset.name}"`);
      } else if (replaceTarget.kind === "layer" && targetScene && targetLayer) {
        replaceLayerWithProjectAsset(
          uploaded.asset.id,
          uploaded.asset.name,
          uploadAsPixelArt ? "nearest" : "linear",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleAudioPreview = (item: AudioLibraryItem) => {
    if (playingId === item.id) {
      previewAudioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    previewAudioRef.current?.pause();
    const audio = new Audio(item.previewUrl);
    previewAudioRef.current = audio;
    setPlayingId(item.id);
    audio.onended = () => setPlayingId((curr) => (curr === item.id ? null : curr));
    audio.onerror = () => {
      setPlayingId(null);
      setError(`No se pudo pre-escuchar "${item.name}" desde ${item.provider}. Prueba otra fuente o "Local".`);
    };
    void audio.play().catch(() => setPlayingId(null));
  };

  const visualAssets = project.assets.filter((a) => a.kind === "image" || a.kind === "svg" || a.kind === "pixel_art");
  const audioAssets = project.assets.filter((a) => a.kind === "audio");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(5, 7, 12, 0.72)", backdropFilter: "blur(6px)" }}
      onClick={closeReplaceModal}
    >
      <div
        className="glass-elevated w-full max-w-[680px] max-h-[92dvh] sm:max-h-[82vh] rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3" style={{ borderColor: "var(--border-subtle)" }}>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold flex items-center gap-2">
              <RefreshCw size={14} style={{ color: "var(--accent-primary)" }} />
              {replaceTarget.kind === "layer"
                ? `Reemplazar capa: ${targetLayer?.name ?? ""}`
                : `Reemplazar audio: ${targetClip?.name ?? ""}`}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {replaceTarget.kind === "layer"
                ? "Conserva posición, escala, rotación, keyframes, animaciones y efectos actuales."
                : "Conserva la posición en el Timeline, volumen, paneo y fades del clip."}
            </div>
          </div>
          <button className="studio-btn !p-1.5" onClick={closeReplaceModal} title="Cerrar">
            <X size={15} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-4 pt-2.5 pb-2 border-b flex flex-wrap items-center gap-1.5" style={{ borderColor: "var(--border-subtle)" }}>
          {replaceTarget.kind === "layer" ? (
            <>
              {targetLayer?.type === "character" && (
                <button
                  onClick={() => setLayerTab("cast")}
                  className={`studio-btn !py-1.5 !text-[11px] ${layerTab === "cast" ? "studio-btn-accent" : ""}`}
                >
                  <User size={12} /> Elenco ({project.cast.length})
                </button>
              )}
              <button
                onClick={() => setLayerTab("vectors")}
                className={`studio-btn !py-1.5 !text-[11px] ${layerTab === "vectors" ? "studio-btn-accent" : ""}`}
              >
                <Shapes size={12} /> Librería Vectorial
              </button>
              <button
                onClick={() => setLayerTab("project")}
                className={`studio-btn !py-1.5 !text-[11px] ${layerTab === "project" ? "studio-btn-accent" : ""}`}
              >
                <FolderOpen size={12} /> Assets del proyecto ({visualAssets.length})
              </button>
              <button
                onClick={() => setLayerTab("upload")}
                className={`studio-btn !py-1.5 !text-[11px] ${layerTab === "upload" ? "studio-btn-accent" : ""}`}
              >
                <Upload size={12} /> Importar archivo
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setAudioTab("library")}
                className={`studio-btn !py-1.5 !text-[11px] ${audioTab === "library" ? "studio-btn-accent" : ""}`}
              >
                <Volume2 size={12} /> Openverse &amp; Audio local
              </button>
              <button
                onClick={() => setAudioTab("project")}
                className={`studio-btn !py-1.5 !text-[11px] ${audioTab === "project" ? "studio-btn-accent" : ""}`}
              >
                <FolderOpen size={12} /> Audios del proyecto ({audioAssets.length})
              </button>
              <button
                onClick={() => setAudioTab("upload")}
                className={`studio-btn !py-1.5 !text-[11px] ${audioTab === "upload" ? "studio-btn-accent" : ""}`}
              >
                <Upload size={12} /> Importar audio
              </button>
              <button
                onClick={() => setAudioTab("tts")}
                className={`studio-btn !py-1.5 !text-[11px] ${audioTab === "tts" ? "studio-btn-accent" : ""}`}
              >
                <AudioLines size={12} /> Generar con Voz IA (TTS)
              </button>
              <label className="ml-auto flex items-center gap-1.5 text-[10.5px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input
                  type="checkbox"
                  checked={preserveClipDuration}
                  onChange={(e) => setPreserveClipDuration(e.target.checked)}
                />
                Conservar duración actual ({targetClip?.duration.toFixed(1)}s)
              </label>
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {error && (
            <div
              className="rounded-xl px-3 py-2 text-[11px]"
              style={{ background: "rgba(255, 100, 112, 0.14)", border: "1px solid rgba(255, 100, 112, 0.35)" }}
            >
              {error}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={replaceTarget.kind === "audio" ? "audio/*,.mp3,.wav,.ogg,.m4a,.flac" : "image/*,.svg"}
            onChange={(e) => void handleFileUpload(e)}
          />

          {/* === LAYER: CAST === */}
          {replaceTarget.kind === "layer" && layerTab === "cast" && targetLayer?.type === "character" && (
            <div className="grid grid-cols-2 gap-2">
              {project.cast.map((ch) => {
                const isCurrent = targetLayer.characterId === ch.id && !targetLayer.customSpriteAssetId;
                return (
                  <button
                    key={ch.id}
                    onClick={() => replaceCharacterWithCast(ch.id, ch.name)}
                    className="rounded-xl p-3 flex items-center gap-3 text-left cursor-pointer transition-colors"
                    style={{
                      background: isCurrent ? "var(--glass-active)" : "var(--glass-hover)",
                      border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-bold text-[14px]"
                      style={{
                        background: ch.palette.shirt,
                        color: "#11131a",
                        border: `3px solid ${ch.palette.hair}`,
                      }}
                    >
                      {ch.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold truncate">{ch.name}</div>
                      <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                        {ch.age} · {ch.hairStyle} · {ch.role}
                      </div>
                    </div>
                    {isCurrent && <Check size={14} style={{ color: "var(--accent-primary)" }} />}
                  </button>
                );
              })}
            </div>
          )}

          {/* === LAYER: UPLOAD === */}
          {replaceTarget.kind === "layer" && layerTab === "upload" && (
            <div className="rounded-2xl p-6 border border-dashed flex flex-col items-center gap-3 text-center" style={{ borderColor: "var(--border-strong)", background: "var(--glass-hover)" }}>
              <Upload size={28} style={{ color: "var(--accent-primary)" }} />
              <div className="text-[12px] font-medium">
                Sube una imagen PNG, WebP, JPG o vector SVG desde tu PC
              </div>
              <label className="flex items-center gap-2 text-[11px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
                <input type="checkbox" checked={uploadAsPixelArt} onChange={(e) => setUploadAsPixelArt(e.target.checked)} />
                Tratar como Pixel Art (escalado nítido `nearest`)
              </label>
              <button
                disabled={busy}
                className="studio-btn studio-btn-accent !px-4 !py-2"
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Elegir archivo y reemplazar
              </button>
            </div>
          )}

          {/* === LAYER: PROJECT ASSETS === */}
          {replaceTarget.kind === "layer" && layerTab === "project" && (
            visualAssets.length === 0 ? (
              <div className="text-center text-[12px] py-8" style={{ color: "var(--text-muted)" }}>
                Aún no hay imágenes o SVGs en este proyecto.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {visualAssets.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => replaceLayerWithProjectAsset(a.id, a.name, a.scaleMode)}
                    className="rounded-xl overflow-hidden flex flex-col text-left cursor-pointer hover:opacity-100"
                    style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                  >
                    <div className="h-24 flex items-center justify-center p-2 bg-black/30">
                      <img
                        src={a.src}
                        alt={a.name}
                        className="max-h-full max-w-full object-contain"
                        style={{ imageRendering: a.scaleMode === "nearest" ? "pixelated" : "auto" }}
                      />
                    </div>
                    <div className="p-2 text-[11px] font-medium truncate">{a.name}</div>
                  </button>
                ))}
              </div>
            )
          )}

          {/* === LAYER: VECTOR LIBRARY === */}
          {replaceTarget.kind === "layer" && layerTab === "vectors" && (
            <div className="flex flex-col gap-2.5">
              {availableVecSources.length === 0 ? (
                <div
                  className="rounded-xl p-6 text-center flex flex-col items-center gap-2"
                  style={{ background: "var(--glass-hover)", border: "1px dashed var(--border-subtle)" }}
                >
                  <div className="text-[12px] font-medium">Todas las librerías vectoriales están deshabilitadas</div>
                  <button
                    className="studio-btn studio-btn-accent !px-3 !py-1.5 !text-[11px]"
                    onClick={() => {
                      closeReplaceModal();
                      setSettingsModalOpen(true, "libraries");
                    }}
                  >
                    <Settings size={12} /> Habilitar en Ajustes › Librerías
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                      <input
                        className="studio-input w-full !pl-8"
                        placeholder="Buscar vector o fondo…"
                        value={vecQuery}
                        onChange={(e) => setVecQuery(e.target.value)}
                      />
                    </div>
                    {availableVecSources.map((src) => (
                      <button
                        key={src.id}
                        onClick={() => setVecSource(src.id)}
                        className={`studio-btn !py-1 !px-2.5 !text-[10.5px] ${vecSource === src.id ? "studio-btn-accent" : ""}`}
                      >
                        {src.online && <Globe size={10} />}
                        {src.builtin && <Sparkles size={10} />}
                        {src.label}
                      </button>
                    ))}
                  </div>

                  {vecLoading ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <Loader2 size={14} className="animate-spin" /> Buscando vectores…
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {vecItems.map((item) => (
                        <button
                          key={item.id}
                          disabled={busy}
                          onClick={() => void replaceLayerWithVector(item)}
                          className="rounded-xl overflow-hidden flex flex-col text-left cursor-pointer hover:border-white/30"
                          style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                        >
                          <div className="h-20 flex items-center justify-center p-2 bg-black/35">
                            <img
                              src={item.previewUrl}
                              alt={item.name}
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                              style={{ imageRendering: item.defaultScaleMode === "nearest" ? "pixelated" : "auto" }}
                            />
                          </div>
                          <div className="p-1.5 text-[10.5px] font-medium truncate">{item.name}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* === AUDIO: UPLOAD === */}
          {replaceTarget.kind === "audio" && audioTab === "upload" && (
            <div className="rounded-2xl p-6 border border-dashed flex flex-col items-center gap-3 text-center" style={{ borderColor: "var(--border-strong)", background: "var(--glass-hover)" }}>
              <Upload size={28} style={{ color: "var(--accent-teal)" }} />
              <div className="text-[12px] font-medium">
                Importa una narración, música o SFX (MP3, WAV, OGG, M4A, FLAC)
              </div>
              <button
                disabled={busy}
                className="studio-btn studio-btn-accent !px-4 !py-2"
                onClick={() => fileInputRef.current?.click()}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Elegir archivo de audio y reemplazar
              </button>
            </div>
          )}

          {/* === AUDIO: PROJECT ASSETS === */}
          {replaceTarget.kind === "audio" && audioTab === "project" && (
            <div className="flex flex-col gap-1.5">
              {audioAssets.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl px-3 py-2 flex items-center justify-between gap-2"
                  style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium truncate">{a.name}</div>
                    <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                      {a.durationSec ? `${a.durationSec.toFixed(1)}s` : "Audio"} · {a.id}
                    </div>
                  </div>
                  <button
                    className="studio-btn studio-btn-accent !py-1 !px-3 !text-[11px]"
                    onClick={() => replaceAudioWithProjectAsset(a.id, a.name, a.durationSec)}
                  >
                    Usar este audio
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* === AUDIO: TTS GENERATOR === */}
          {replaceTarget.kind === "audio" && audioTab === "tts" && targetTrack && targetClip && (
            <TtsStudioPanel
              replaceAudioTarget={{
                trackId: targetTrack.id,
                clipId: targetClip.id,
                preserveDuration: preserveClipDuration,
                onDone: closeReplaceModal,
              }}
            />
          )}

          {/* === AUDIO: LIBRARY (ONLY ENABLED AUDIO LIBRARIES) === */}
          {replaceTarget.kind === "audio" && audioTab === "library" && (
            <div className="flex flex-col gap-2.5">
              {availableAudSources.length === 0 ? (
                <div
                  className="rounded-xl p-6 text-center flex flex-col items-center gap-2"
                  style={{ background: "var(--glass-hover)", border: "1px dashed var(--border-subtle)" }}
                >
                  <div className="text-[12px] font-medium">Todas las librerías de audio están deshabilitadas</div>
                  <button
                    className="studio-btn studio-btn-accent !px-3 !py-1.5 !text-[11px]"
                    onClick={() => {
                      closeReplaceModal();
                      setSettingsModalOpen(true, "libraries");
                    }}
                  >
                    <Settings size={12} /> Habilitar en Ajustes › Librerías
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
                      <input
                        className="studio-input w-full !pl-8"
                        placeholder="Buscar audio en librerías habilitadas…"
                        value={audQuery}
                        onChange={(e) => setAudQuery(e.target.value)}
                      />
                    </div>
                    {availableAudSources.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setAudSource(opt.id)}
                        className={`studio-btn !py-1 !px-2.5 !text-[10.5px] ${audSource === opt.id ? "studio-btn-accent" : ""}`}
                      >
                        {opt.kind === "local" ? <HardDrive size={10} /> : opt.kind === "online" ? <Globe size={10} /> : null}
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {audLoading ? (
                    <div className="py-8 flex items-center justify-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      <Loader2 size={14} className="animate-spin" /> Buscando sonidos…
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {audItems.map((item) => {
                        const isPlaying = playingId === item.id;
                        return (
                          <div
                            key={item.id}
                            className="rounded-xl px-2.5 py-2 flex items-center gap-2"
                            style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
                          >
                            <button
                              onClick={() => toggleAudioPreview(item)}
                              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
                              style={{
                                background: isPlaying ? "var(--accent-primary)" : "rgba(255,255,255,0.08)",
                                color: isPlaying ? "var(--accent-ink)" : "var(--text-primary)",
                              }}
                            >
                              {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="text-[11.5px] font-medium truncate">{item.name}</div>
                              <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                                {item.provider} · {item.license} {item.durationSec ? `· ${item.durationSec.toFixed(1)}s` : ""}
                              </div>
                            </div>
                            <button
                              disabled={busy}
                              onClick={() => void replaceAudioWithLibrary(item)}
                              className="studio-btn studio-btn-accent !py-1 !px-2.5 !text-[10.5px]"
                            >
                              {busy ? <Loader2 size={11} className="animate-spin" /> : "Reemplazar"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
