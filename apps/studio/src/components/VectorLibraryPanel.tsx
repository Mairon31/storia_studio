import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Globe,
  Image as ImageIcon,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  LibraryId,
  studioApi,
  VectorLibraryCategory,
  VectorLibraryItem,
  VectorLibrarySource,
  VectorSearchResponse,
} from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

const SOURCE_OPTIONS: {
  id: "all" | VectorLibrarySource;
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
  { id: "all", label: "Todo Local", requiresAny: ["local_videos", "local_workspace", "svg_backgrounds"] },
];

const LOCAL_CATEGORIES: { id: "all" | VectorLibraryCategory; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "backgrounds", label: "Fondos" },
  { id: "sprites", label: "Sprites" },
  { id: "overlays", label: "Overlays" },
  { id: "icons", label: "Íconos" },
];

const ICONIFY_COLLECTIONS: { id: string; label: string }[] = [
  { id: "all", label: "Todas (200k+)" },
  { id: "pixelarticons", label: "Pixel Art" },
  { id: "game-icons", label: "Game Icons" },
  { id: "lucide", label: "Lucide" },
  { id: "tabler", label: "Tabler" },
  { id: "ph", label: "Phosphor" },
  { id: "noto", label: "Noto Color" },
  { id: "mdi", label: "Material (MDI)" },
];

const TINT_SWATCHES = ["#ffffff", "#f7c8d6", "#ffd447", "#4ce6c8", "#ff6470", "#14161c"];

export const VectorLibraryPanel: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const selectedSceneId = useStudioStore((s) => s.selectedSceneId);
  const enabledLibraries = useStudioStore((s) => s.enabledLibraries);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const selectLayer = useStudioStore((s) => s.selectLayer);
  const setSettingsModalOpen = useStudioStore((s) => s.setSettingsModalOpen);

  const availableSources = useMemo(
    () => SOURCE_OPTIONS.filter((opt) => opt.requiresAny.some((id) => Boolean(enabledLibraries[id]))),
    [enabledLibraries],
  );

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [source, setSource] = useState<"all" | VectorLibrarySource>("videos");
  const [category, setCategory] = useState<"all" | VectorLibraryCategory>("all");
  const [videoFilter, setVideoFilter] = useState("");
  const [collection, setCollection] = useState("all");
  const [tintColor, setTintColor] = useState("#f7c8d6");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<VectorLibraryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [facets, setFacets] = useState<VectorSearchResponse["facets"] | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  const activeScene = project.scenes.find((s) => s.id === selectedSceneId) ?? project.scenes[0];

  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 260);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (availableSources.length > 0 && !availableSources.some((o) => o.id === source)) {
      setSource(availableSources[0]!.id);
      setPage(1);
    }
  }, [availableSources, source]);

  const fetchVectors = useCallback(
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
        const isOnlineOnly =
          source === "iconify" ||
          source === "openverse" ||
          source === "wikimedia" ||
          source === "pixel_game_sprites" ||
          source === "openmoji_props";
        const res = await studioApi.searchVectors({
          q: debouncedQuery || undefined,
          source,
          category: isOnlineOnly ? "all" : category,
          video: source === "videos" || source === "all" ? videoFilter || undefined : undefined,
          collection: source === "iconify" ? collection : undefined,
          color: source === "iconify" || source === "pixel_game_sprites" ? tintColor : undefined,
          page: targetPage,
          pageSize: 24,
          refresh: forceRefresh,
        });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
        setHasMore(res.hasMore);
        setFacets(res.facets);
        if (res.onlineWarning) setWarning(res.onlineWarning);
      } catch (err) {
        setWarning(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [availableSources, enabledLibraries, debouncedQuery, source, category, videoFilter, collection, tintColor],
  );

  useEffect(() => {
    void fetchVectors(1, false, false);
  }, [fetchVectors]);

  const handleInsert = async (item: VectorLibraryItem, insertMode: "sprite" | "background") => {
    const key = `${item.id}:${insertMode}`;
    setImportingKey(key);
    try {
      const isLocalOrBuiltin =
        item.source === "videos" || item.source === "workspace" || item.source === "svg_backgrounds";
      const isRemoteUrlSource = item.source === "openverse" || item.source === "wikimedia";
      const isColorableIconify = item.source === "iconify" || item.source === "pixel_game_sprites";
      const res = await studioApi.importVectorFromLibrary(project.id, {
        itemId: isLocalOrBuiltin ? item.id : undefined,
        iconifyName: item.iconifyName,
        remoteUrl: isRemoteUrlSource ? item.remoteUrl : undefined,
        color: isColorableIconify ? tintColor : undefined,
        name: item.name,
        source: item.source,
        category: item.category,
        license: item.license,
        author: item.author,
        sourceUrl: item.sourceUrl,
        insertMode,
        sceneId: activeScene?.id,
        scaleMode: item.defaultScaleMode,
      });
      setProjectFromRemote(res.project, res.receipt);
      if (res.insertedLayerId) {
        selectLayer(res.insertedLayerId);
      }
      setJustAddedId(item.id);
      window.setTimeout(() => setJustAddedId((curr) => (curr === item.id ? null : curr)), 1500);
    } catch (err) {
      setWarning(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingKey(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* Header & counts */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>
            Librería Vectorial (SVG)
          </div>
          {facets && availableSources.length > 0 && (
            <div className="text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
              {availableSources.filter((s) => s.id !== "all").length} librerías activas · {total.toLocaleString()} resultados
            </div>
          )}
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
            title="Re-escanear librerías"
            disabled={availableSources.length === 0}
            onClick={() => void fetchVectors(1, false, true)}
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
          <div className="text-[11.5px] font-medium">Todas las librerías vectoriales están deshabilitadas</div>
          <p className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
            Habilita Openverse, Iconify, Wikimedia, Pixel Art, Props o Fondos SVG desde Ajustes.
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
          placeholder={
            source === "iconify"
              ? "Buscar en Iconify (ej: clock, sword, brain)…"
              : source === "pixel_game_sprites"
                ? "Buscar sprites pixel/RPG (ej: sword, shield, coin)…"
                : source === "openmoji_props"
                  ? "Buscar props a color (ej: rocket, coffee, fire)…"
                  : source === "svg_backgrounds"
                    ? "Buscar fondos SVG editables (ej: synthwave, paper)…"
                    : source === "wikimedia"
                      ? "Buscar SVGs en Wikimedia Commons…"
                      : source === "openverse"
                        ? "Buscar SVGs CC0/BY en Openverse…"
                        : "Buscar fondos, sprites, íconos…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Source selector (only enabled libraries) */}
      <div className="flex flex-wrap gap-1">
        {availableSources.map((opt) => {
          const active = source === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                setSource(opt.id);
                setPage(1);
              }}
              className="px-2 py-1 rounded-md text-[10px] font-medium cursor-pointer transition-colors flex items-center gap-1"
              style={{
                background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
              }}
            >
              {opt.online && <Globe size={10} />}
              {opt.builtin && <Sparkles size={10} />}
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Contextual filters */}
      {(source === "videos" || source === "all" || source === "workspace") && (
        <div className="flex flex-col gap-1.5">
          {source !== "workspace" && (
            <div className="flex flex-wrap gap-1">
              {LOCAL_CATEGORIES.map((c) => {
                const active = category === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setCategory(c.id);
                      setPage(1);
                    }}
                    className="px-2 py-0.5 rounded text-[10px] cursor-pointer"
                    style={{
                      background: active ? "var(--glass-active)" : "transparent",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                      border: `1px solid ${active ? "var(--border-strong)" : "var(--border-subtle)"}`,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}

          {(source === "videos" || source === "all") && facets && facets.videos.length > 0 && (
            <select
              className="studio-input w-full !text-[11px]"
              value={videoFilter}
              onChange={(e) => {
                setVideoFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="" style={{ background: "#14161c", color: "#f3f4f6" }}>
                Todos los videos ({facets.videos.length})
              </option>
              {facets.videos.map((v) => (
                <option key={v} value={v} style={{ background: "#14161c", color: "#f3f4f6" }}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {(source === "iconify" || source === "pixel_game_sprites") && (
        <div className="flex flex-col gap-1.5">
          {source === "iconify" && (
            <select
              className="studio-input w-full !text-[11px]"
              value={collection}
              onChange={(e) => {
                setCollection(e.target.value);
                setPage(1);
              }}
            >
              {ICONIFY_COLLECTIONS.map((c) => (
                <option key={c.id} value={c.id} style={{ background: "#14161c", color: "#f3f4f6" }}>
                  Colección: {c.label}
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center justify-between gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
            <span>Color trazo:</span>
            <div className="flex items-center gap-1">
              {TINT_SWATCHES.map((sw) => (
                <button
                  key={sw}
                  title={sw}
                  onClick={() => setTintColor(sw)}
                  className="w-4 h-4 rounded-full cursor-pointer"
                  style={{
                    background: sw,
                    border: tintColor === sw ? "2px solid var(--accent-gold)" : "1px solid var(--border-strong)",
                  }}
                />
              ))}
              <input
                type="color"
                value={tintColor}
                onChange={(e) => setTintColor(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
              />
            </div>
          </div>
        </div>
      )}

      {warning && (
        <div
          className="rounded-lg px-2 py-1.5 text-[10px]"
          style={{ background: "rgba(255, 100, 112, 0.14)", border: "1px solid rgba(255, 100, 112, 0.35)" }}
        >
          {warning}
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-[10px] font-mono-code" style={{ color: "var(--text-muted)" }}>
        <span>{loading && items.length === 0 ? "Buscando…" : `${total.toLocaleString()} resultados`}</span>
        {activeScene && <span className="truncate max-w-[140px]">→ {activeScene.name}</span>}
      </div>

      {/* 2-Column Visual SVG Card Grid */}
      {items.length === 0 && !loading ? (
        <div className="rounded-xl p-4 text-center text-[11px]" style={{ background: "var(--glass-hover)", color: "var(--text-muted)" }}>
          No se encontraron vectoriales con ese filtro.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const busySprite = importingKey === `${item.id}:sprite`;
            const busyBg = importingKey === `${item.id}:background`;
            const added = justAddedId === item.id;
            return (
              <div
                key={item.id}
                className="rounded-xl overflow-hidden flex flex-col transition-colors"
                style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
              >
                {/* Preview surface */}
                <div
                  className="h-20 relative flex items-center justify-center p-2 overflow-hidden"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 45%, rgba(255,255,255,0.08), rgba(10,12,18,0.55))",
                  }}
                >
                  <img
                    src={item.previewUrl}
                    alt={item.name}
                    loading="lazy"
                    className="max-h-full max-w-full object-contain"
                    style={{
                      imageRendering: item.defaultScaleMode === "nearest" ? "pixelated" : "auto",
                    }}
                  />
                  <span
                    className="absolute top-1 left-1 px-1 py-0.5 rounded text-[8px] font-mono-code uppercase"
                    style={{ background: "rgba(0,0,0,0.62)", color: "var(--text-secondary)" }}
                  >
                    {item.video ?? item.collection ?? item.category}
                  </span>
                  {added && (
                    <span
                      className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-semibold flex items-center gap-0.5"
                      style={{ background: "var(--accent-teal)", color: "#0b0c10" }}
                    >
                      <Check size={9} /> OK
                    </span>
                  )}
                </div>

                {/* Title + Insert buttons */}
                <div className="p-1.5 flex flex-col gap-1">
                  <div className="text-[10px] font-medium truncate" title={item.name}>
                    {item.name}
                  </div>
                  <div className="flex gap-1">
                    <button
                      disabled={busySprite || busyBg}
                      onClick={() => void handleInsert(item, "sprite")}
                      className="studio-btn studio-btn-accent flex-1 !py-1 !px-1.5 !text-[10px]"
                      title="Insertar como capa Sprite en escena actual"
                    >
                      {busySprite ? <Loader2 size={10} className="animate-spin" /> : <Layers size={10} />}
                      Sprite
                    </button>
                    {item.category !== "icons" && (
                      <button
                        disabled={busySprite || busyBg}
                        onClick={() => void handleInsert(item, "background")}
                        className="studio-btn !py-1 !px-1.5 !text-[10px]"
                        style={{ borderColor: "var(--border-strong)" }}
                        title="Usar como Fondo de la escena actual"
                      >
                        {busyBg ? <Loader2 size={10} className="animate-spin" /> : <ImageIcon size={10} />}
                        Fondo
                      </button>
                    )}
                  </div>
                </div>
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
            void fetchVectors(next, true, false);
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          Cargar más resultados
        </button>
      )}
        </>
      )}
    </div>
  );
};
