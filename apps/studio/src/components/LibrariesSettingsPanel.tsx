import React, { useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Globe,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Loader2,
  Music,
  RefreshCw,
  Search,
  Shapes,
  Sparkles,
  Volume2,
} from "lucide-react";
import type { LibraryAssetType, LibraryId } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

const ASSET_FILTERS: { id: "all" | LibraryAssetType; label: string; icon?: React.ReactNode }[] = [
  { id: "all", label: "Todas" },
  { id: "sfx", label: "SFX", icon: <Volume2 size={11} /> },
  { id: "music", label: "Música", icon: <Music size={11} /> },
  { id: "sprites", label: "Sprites", icon: <Sparkles size={11} /> },
  { id: "backgrounds", label: "Fondos", icon: <ImageIcon size={11} /> },
  { id: "vectors", label: "Vectores", icon: <Shapes size={11} /> },
  { id: "icons", label: "Íconos", icon: <Layers size={11} /> },
];

const ASSET_TYPE_LABELS: Record<LibraryAssetType, string> = {
  sfx: "SFX",
  music: "Música",
  sprites: "Sprites",
  backgrounds: "Fondos",
  vectors: "Vectores",
  icons: "Íconos",
};

export const LibrariesSettingsPanel: React.FC = () => {
  const librariesCatalog = useStudioStore((s) => s.librariesCatalog);
  const refreshLibrariesCatalog = useStudioStore((s) => s.refreshLibrariesCatalog);
  const toggleLibraryEnabled = useStudioStore((s) => s.toggleLibraryEnabled);

  const [query, setQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | LibraryAssetType>("all");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<LibraryId | null>(null);

  useEffect(() => {
    if (librariesCatalog.length === 0) {
      setLoading(true);
      void refreshLibrariesCatalog().finally(() => setLoading(false));
    }
  }, [librariesCatalog.length, refreshLibrariesCatalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return librariesCatalog.filter((lib) => {
      if (filterType !== "all" && !lib.assetTypes.includes(filterType)) return false;
      if (!q) return true;
      return (
        lib.name.toLowerCase().includes(q) ||
        lib.tagline.toLowerCase().includes(q) ||
        lib.description.toLowerCase().includes(q) ||
        lib.assetTypes.some((t) => ASSET_TYPE_LABELS[t].toLowerCase().includes(q))
      );
    });
  }, [librariesCatalog, filterType, query]);

  const enabledCount = useMemo(
    () => librariesCatalog.filter((l) => l.enabled).length,
    [librariesCatalog],
  );

  const handleToggle = async (id: LibraryId, nextVal: boolean) => {
    setBusyId(id);
    try {
      await toggleLibraryEnabled(id, nextVal);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold mb-0.5 flex items-center gap-1.5">
            <Shapes size={14} style={{ color: "var(--accent-primary)" }} />
            Librerías Compatibles ({enabledCount}/{librariesCatalog.length} activas)
          </h3>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Explora e integra repositorios gratuitos de SFX, música, sprites, fondos, vectores e íconos. Si deshabilitas una librería, todos sus recursos dejarán de mostrarse dentro del editor y las búsquedas MCP.
          </p>
        </div>
        <button
          className="studio-btn !p-1.5 shrink-0"
          title="Recargar catálogo de librerías"
          onClick={() => {
            setLoading(true);
            void refreshLibrariesCatalog().finally(() => setLoading(false));
          }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Search & Asset Type Filter Bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "var(--text-muted)" }}
          />
          <input
            className="studio-input w-full !pl-8 !py-1.5 !text-[11.5px]"
            placeholder="Explorar librerías (Openverse, Wikimedia, Archive, Pixel Art, SVG Backgrounds…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {ASSET_FILTERS.map((f) => {
            const active = filterType === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className="px-2.5 py-1 rounded-lg text-[10.5px] font-medium flex items-center gap-1 cursor-pointer transition-colors"
                style={{
                  background: active ? "var(--accent-primary)" : "var(--glass-hover)",
                  color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  border: `1px solid ${active ? "transparent" : "var(--border-subtle)"}`,
                }}
              >
                {f.icon}
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Libraries Cards List */}
      {loading && librariesCatalog.length === 0 ? (
        <div className="py-10 flex items-center justify-center gap-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={15} className="animate-spin" /> Cargando librerías compatibles…
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center text-[11.5px]"
          style={{ background: "var(--glass-hover)", color: "var(--text-muted)" }}
        >
          No se encontraron librerías con ese filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((lib) => {
            const isBusy = busyId === lib.id;
            const kindIcon =
              lib.kind === "online" ? (
                <Globe size={11} style={{ color: "var(--accent-teal)" }} />
              ) : lib.kind === "builtin" ? (
                <Sparkles size={11} style={{ color: "var(--accent-gold)" }} />
              ) : (
                <HardDrive size={11} style={{ color: "var(--accent-primary)" }} />
              );

            return (
              <div
                key={lib.id}
                className="rounded-xl p-3 flex items-start justify-between gap-3 transition-all"
                style={{
                  background: lib.enabled ? "var(--glass-hover)" : "rgba(10,12,18,0.45)",
                  border: `1px solid ${lib.enabled ? "var(--border-strong)" : "var(--border-subtle)"}`,
                  opacity: lib.enabled ? 1 : 0.75,
                }}
              >
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-center flex-wrap gap-1.5">
                    <span className="text-[12.5px] font-semibold">{lib.name}</span>
                    <span
                      className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded flex items-center gap-1"
                      style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                    >
                      {kindIcon}
                      {lib.kind === "online" ? "Online" : lib.kind === "builtin" ? "Integrada" : "Local"}
                    </span>
                    <span
                      className="text-[9.5px] font-mono-code px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}
                    >
                      {lib.estimatedCount}
                    </span>
                    {!lib.requiresApiKey && (
                      <span
                        className="text-[9px] font-mono-code px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(52,211,153,0.12)", color: "#6ee7b7" }}
                      >
                        Sin API Key
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    {lib.tagline}
                  </div>
                  <p className="text-[10.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {lib.description}
                  </p>

                  <div className="flex items-center flex-wrap gap-1 pt-0.5">
                    {lib.assetTypes.map((at) => (
                      <span
                        key={at}
                        className="text-[9.5px] px-1.5 py-0.5 rounded-md"
                        style={{
                          background: "rgba(255,255,255,0.06)",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {ASSET_TYPE_LABELS[at]}
                      </span>
                    ))}
                    <span className="text-[9.5px] font-mono-code ml-1" style={{ color: "var(--text-muted)" }}>
                      · {lib.license}
                    </span>
                    {lib.websiteUrl && (
                      <a
                        href={lib.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[9.5px] inline-flex items-center gap-0.5 ml-auto hover:underline"
                        style={{ color: "var(--accent-teal)" }}
                      >
                        Sitio <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Enable / Disable Toggle */}
                <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggle(lib.id, !lib.enabled)}
                    className={`studio-btn !px-2.5 !py-1.5 !text-[10.5px] min-w-[98px] justify-center ${
                      lib.enabled ? "studio-btn-accent" : ""
                    }`}
                  >
                    {isBusy ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : lib.enabled ? (
                      <>
                        <Check size={11} /> Habilitada
                      </>
                    ) : (
                      "Habilitar"
                    )}
                  </button>
                  <span className="text-[9px] font-mono-code" style={{ color: "var(--text-muted)" }}>
                    {lib.enabled ? "Visible en editor" : "Oculta en editor"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
