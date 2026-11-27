import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Globe,
  HardDrive,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Volume2,
} from "lucide-react";
import {
  AudioLibraryItem,
  LibraryId,
  studioApi,
} from "../lib/api";
import { audioEngine } from "../lib/audioEngine";
import { useStudioStore } from "../store/useStudioStore";

type AudioSourceOptionId = "openverse" | "wikimedia" | "internet_archive" | "local" | "all";

const AUDIO_SOURCE_OPTIONS: {
  id: AudioSourceOptionId;
  label: string;
  requiresAny: LibraryId[];
  kind: "online" | "local" | "all";
}[] = [
  { id: "openverse", label: "Openverse", requiresAny: ["openverse"], kind: "online" },
  { id: "wikimedia", label: "Wikimedia", requiresAny: ["wikimedia"], kind: "online" },
  { id: "internet_archive", label: "Archive", requiresAny: ["internet_archive"], kind: "online" },
  { id: "local", label: "Local", requiresAny: ["local_videos", "local_workspace"], kind: "local" },
  {
    id: "all",
    label: "Todo",
    requiresAny: ["openverse", "wikimedia", "internet_archive", "local_videos", "local_workspace"],
    kind: "all",
  },
];

const QUICK_SFX_CHIPS = [
  "whoosh",
  "impact",
  "clock",
  "glitch",
  "riser",
  "ding",
  "rain",
  "ambient",
  "click",
  "cinematic",
];

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec)) return "—";
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export const AudioLibraryPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const currentTime = useStudioStore((s) => s.currentTime);
  const enabledLibraries = useStudioStore((s) => s.enabledLibraries);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);

  const availableSources = useMemo(
    () => AUDIO_SOURCE_OPTIONS.filter((opt) => opt.requiresAny.some((id) => Boolean(enabledLibraries[id]))),
    [enabledLibraries],
  );

  const [query, setQuery] = useState("whoosh");
  const [debouncedQuery, setDebouncedQuery] = useState("whoosh");
  const [source, setSource] = useState<AudioSourceOptionId>("all");
  const [category, setCategory] = useState<"all" | "sfx" | "music" | "ambience" | "psx">("sfx");
  const [license, setLicense] = useState<"all" | "cc0" | "cc-by">("all");
  const [duration, setDuration] = useState<"all" | "short" | "medium" | "long">("all");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<AudioLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [localCount, setLocalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (availableSources.length > 0 && !availableSources.some((o) => o.id === source)) {
      setSource(availableSources[0]!.id);
      setPage(1);
    }
  }, [availableSources, source]);

  const fetchAudio = useCallback(
    async (targetPage: number, append: boolean, forceRefresh = false) => {
      if (availableSources.length === 0) {
        setItems([]);
        setTotal(0);
        setHasMore(false);
        setWarning(null);
        return;
      }
      if (!availableSources.some((o) => o.id === source)) {
        return;
      }
      setLoading(true);
      setWarning(null);
      try {
        const res = await studioApi.searchAudio({
          q: debouncedQuery || undefined,
          source,
          category,
          license,
          duration,
          page: targetPage,
          pageSize: 18,
          refresh: forceRefresh,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
        setLocalCount(res.localCount);
        setHasMore(res.hasMore);
        if (res.onlineWarning) setWarning(res.onlineWarning);
      } catch (err) {
        setWarning(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [availableSources, enabledLibraries, debouncedQuery, source, category, license, duration],
  );

  useEffect(() => {
    void fetchAudio(1, false, false);
  }, [fetchAudio]);

  const togglePreview = (item: AudioLibraryItem) => {
    if (playingId === item.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    audioRef.current?.pause();
    const audio = new Audio(item.previewUrl);
    audioRef.current = audio;
    setPlayingId(item.id);
    audio.onended = () => setPlayingId((curr) => (curr === item.id ? null : curr));
    audio.onerror = () => {
      setPlayingId((curr) => (curr === item.id ? null : curr));
      setWarning(
        item.provider === "freesound"
          ? `Freesound CDN bloqueó la vista previa de "${item.name}" (403). Usa resultados de Wikimedia/Jamendo o "Local" (${localCount} sonidos).`
          : `No se pudo pre-escuchar "${item.name}"`,
      );
    };
    void audio.play().catch(() => {
      setPlayingId(null);
    });
  };

  const handleInsertToTimeline = async (item: AudioLibraryItem) => {
    setImportingId(item.id);
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
        startSec: Number(currentTime.toFixed(2)),
      });
      setProjectFromRemote(res.project, res.receipt);
      void audioEngine.loadAssetAudio(res.asset);
      setJustAddedId(item.id);
      window.setTimeout(() => setJustAddedId((curr) => (curr === item.id ? null : curr)), 1600);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <Volume2 size={12} /> Librería de Audio &amp; SFX
          </div>
          <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
            {availableSources.filter((s) => s.id !== "all").length} fuentes activas · {localCount} locales
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            className="studio-btn !p-1"
            title="Gestionar librerías habilitadas"
            onClick={() => setSettingsModalOpen(true, "libraries")}
          >
            <Settings size={12} />
          </button>
          <button
            className="studio-btn !p-1"
            title="Recargar resultados"
            disabled={availableSources.length === 0}
            onClick={() => void fetchAudio(1, false, true)}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {availableSources.length === 0 ? (
        <div
          className="rounded-xl p-5 text-center flex flex-col items-center gap-2"
          style={{ background: "var(--glass-hover)", border: "1px dashed var(--border-subtle)" }}
        >
          <div className="text-[11.5px] font-medium">Todas las librerías de audio están deshabilitadas</div>
          <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            Habilita Openverse, Wikimedia, Internet Archive o librerías locales desde Ajustes.
          </p>
          <button
            className="studio-btn studio-btn-accent !px-3 !py-1.5 !text-[11px]"
            onClick={() => setSettingsModalOpen(true, "libraries")}
          >
            <Settings size={12} /> Abrir Ajustes › Librerías
          </button>
        </div>
      ) : (
        <>
      {/* Search bar */}
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-muted)" }} />
        <input
          type="text"
          className="studio-input w-full !pl-8"
          placeholder="Buscar SFX o música (ej: whoosh, footsteps, rain)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Quick SFX chips */}
      <div className="flex flex-wrap gap-1">
        {QUICK_SFX_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => {
              setQuery(chip);
              setDebouncedQuery(chip);
              setPage(1);
            }}
            className="px-1.5 py-0.5 rounded text-[9.5px] cursor-pointer"
            style={{
              background: debouncedQuery === chip ? "var(--glass-active)" : "var(--glass-hover)",
              color: debouncedQuery === chip ? "var(--text-primary)" : "var(--text-muted)",
              border: `1px solid ${debouncedQuery === chip ? "var(--border-strong)" : "var(--border-subtle)"}`,
            }}
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Source switcher (only enabled libraries) */}
      <div className="flex flex-wrap gap-1">
        {availableSources.map((opt) => {
          const active = source === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                setSource(opt.id);
                if (opt.id === "local" && query === "whoosh") {
                  setQuery("");
                  setDebouncedQuery("");
                }
                setPage(1);
              }}
              className="px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer flex items-center justify-center gap-1"
              style={{
                background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
              }}
            >
              {opt.kind === "online" ? <Globe size={10} /> : opt.kind === "local" ? <HardDrive size={10} /> : null}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Filters row */}
      <div className="grid grid-cols-3 gap-1">
        <select
          className="studio-input !text-[10px] !px-1.5"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as typeof category);
            setPage(1);
          }}
        >
          <option value="all" style={{ background: "#14161c", color: "#f3f4f6" }}>Cat: Todas</option>
          <option value="sfx" style={{ background: "#14161c", color: "#f3f4f6" }}>SFX</option>
          <option value="music" style={{ background: "#14161c", color: "#f3f4f6" }}>Música</option>
          <option value="ambience" style={{ background: "#14161c", color: "#f3f4f6" }}>Ambiente</option>
          <option value="psx" style={{ background: "#14161c", color: "#f3f4f6" }}>PSX/Retro</option>
        </select>

        <select
          className="studio-input !text-[10px] !px-1.5"
          value={duration}
          disabled={source === "local"}
          onChange={(e) => {
            setDuration(e.target.value as typeof duration);
            setPage(1);
          }}
        >
          <option value="all" style={{ background: "#14161c", color: "#f3f4f6" }}>Dur: Toda</option>
          <option value="short" style={{ background: "#14161c", color: "#f3f4f6" }}>&lt; 3s (Hit)</option>
          <option value="medium" style={{ background: "#14161c", color: "#f3f4f6" }}>3–15s</option>
          <option value="long" style={{ background: "#14161c", color: "#f3f4f6" }}>&gt; 15s</option>
        </select>

        <select
          className="studio-input !text-[10px] !px-1.5"
          value={license}
          disabled={source === "local"}
          onChange={(e) => {
            setLicense(e.target.value as typeof license);
            setPage(1);
          }}
        >
          <option value="all" style={{ background: "#14161c", color: "#f3f4f6" }}>Lic: CC0+BY</option>
          <option value="cc0" style={{ background: "#14161c", color: "#f3f4f6" }}>Solo CC0</option>
          <option value="cc-by" style={{ background: "#14161c", color: "#f3f4f6" }}>CC-BY</option>
        </select>
      </div>

      {warning && (
        <div
          className="rounded-lg px-2 py-1.5 text-[10px]"
          style={{ background: "rgba(255, 100, 112, 0.14)", border: "1px solid rgba(255, 100, 112, 0.35)" }}
        >
          {warning}
        </div>
      )}

      {/* Results counter + insert target */}
      <div className="flex items-center justify-between text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
        <span>{loading && items.length === 0 ? "Consultando Openverse…" : `${total.toLocaleString()} sonidos`}</span>
        <span>Inserta en {currentTime.toFixed(2)}s</span>
      </div>

      {/* Audio list */}
      {items.length === 0 && !loading ? (
        <div className="rounded-xl p-4 text-center text-[11px]" style={{ background: "var(--glass-hover)", color: "var(--text-muted)" }}>
          No se encontraron audios con esos filtros.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {items.map((item) => {
            const isPlaying = playingId === item.id;
            const isBusy = importingId === item.id;
            const isAdded = justAddedId === item.id;
            const isCc0 = item.license.toUpperCase().includes("CC0") || item.license.toUpperCase().includes("PDM");

            return (
              <div
                key={item.id}
                className="rounded-xl p-2 flex items-center gap-2 transition-colors"
                style={{
                  background: isPlaying ? "var(--glass-active)" : "var(--glass-hover)",
                  border: `1px solid ${isPlaying ? "var(--border-strong)" : "var(--border-subtle)"}`,
                }}
              >
                {/* Play / Pause preview */}
                <button
                  onClick={() => togglePreview(item)}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
                  style={{
                    background: isPlaying ? "var(--accent-primary)" : "rgba(255,255,255,0.08)",
                    color: isPlaying ? "var(--accent-ink)" : "var(--text-primary)",
                  }}
                  title={isPlaying ? "Detener vista previa" : "Pre-escuchar"}
                >
                  {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                </button>

                {/* Metadata */}
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9.5px] font-mono-code mt-0.5" style={{ color: "var(--text-muted)" }}>
                    <span
                      className="px-1 rounded font-semibold"
                      style={{
                        background: isCc0 ? "rgba(76,230,200,0.16)" : "rgba(255,212,71,0.16)",
                        color: isCc0 ? "var(--accent-teal)" : "var(--accent-gold)",
                      }}
                    >
                      {item.license.split(" ")[0]}
                    </span>
                    {item.durationSec !== undefined && <span>{formatDuration(item.durationSec)}</span>}
                    <span className="truncate">{item.author ?? item.provider}</span>
                  </div>
                </div>

                {/* Insert to Timeline */}
                <button
                  disabled={isBusy}
                  onClick={() => void handleInsertToTimeline(item)}
                  className="studio-btn studio-btn-accent !py-1 !px-2 !text-[10px] shrink-0"
                  title={`Descargar e insertar en Timeline en ${currentTime.toFixed(2)}s`}
                >
                  {isBusy ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : isAdded ? (
                    <Check size={11} />
                  ) : (
                    <Plus size={11} />
                  )}
                  {isAdded ? "Listo" : "Usar"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button
          disabled={loading}
          className="studio-btn w-full !py-1.5 !text-[11px]"
          style={{ borderColor: "var(--border-strong)" }}
          onClick={() => {
            const next = page + 1;
            setPage(next);
            void fetchAudio(next, true, false);
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Cargar más sonidos
        </button>
      )}
        </>
      )}
    </div>
  );
};
