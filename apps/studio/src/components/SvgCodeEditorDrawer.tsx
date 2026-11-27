import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  Code2,
  Copy,
  CopyPlus,
  Loader2,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  X,
} from "lucide-react";
import { studioApi } from "../lib/api";
import { useStudioStore } from "../store/useStudioStore";

function extractHexColors(svgCode: string): string[] {
  const matches = svgCode.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const low = m.toLowerCase();
    if (!seen.has(low)) {
      seen.add(low);
      out.push(low);
    }
    if (out.length >= 12) break;
  }
  return out;
}

function prettyFormatSvg(raw: string): string {
  const compact = raw.replace(/>\s+</g, ">\n<").trim();
  const lines = compact.split("\n");
  let indent = 0;
  return lines
    .map((line) => {
      const t = line.trim();
      if (/^<\/[^>]+>/.test(t)) indent = Math.max(0, indent - 1);
      const formatted = `${"  ".repeat(indent)}${t}`;
      if (/^<[^/!?][^>]*[^/]>$/.test(t) && !/<\/[^>]+>$/.test(t)) {
        indent++;
      }
      return formatted;
    })
    .join("\n");
}

function sanitizePreviewSvg(raw: string): string {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(?:xlink:)?href\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, "");
}

/**
 * Extra live side panel for viewing and editing SVG vector code manually or via MCP in real time.
 * Supports live preview as you type, instant color token replacement, live auto-sync to the viewport,
 * saving by replacing the original asset, or saving as a new copy (optionally swapping the active layer).
 */
export const SvgCodeEditorDrawer: React.FC = () => {
  const project = useStudioStore((s) => s.project);
  const target = useStudioStore((s) => s.svgEditorTarget);
  const liveUpdate = useStudioStore((s) => s.svgLiveUpdate);
  const closeSvgEditor = useStudioStore((s) => s.closeSvgEditor);
  const openSvgEditor = useStudioStore((s) => s.openSvgEditor);
  const setProjectFromRemote = useStudioStore((s) => s.setProjectFromRemote);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [svgCode, setSvgCode] = useState("");
  const [originalCode, setOriginalCode] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [previewBg, setPreviewBg] = useState<"checker" | "dark" | "light">("checker");
  const [copyModeOpen, setCopyModeOpen] = useState(false);
  const [copyName, setCopyName] = useState("");
  const [swapLayerOnCopy, setSwapLayerOnCopy] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [mcpBadge, setMcpBadge] = useState(false);

  const autoSaveTimerRef = useRef<number | null>(null);
  const lastSavedCodeRef = useRef<string>("");

  const asset = useMemo(
    () => (target ? project.assets.find((a) => a.id === target.assetId) ?? null : null),
    [project.assets, target],
  );

  const loadCode = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await studioApi.getSvgAssetCode(project.id, target.assetId);
      setSvgCode(res.svgCode);
      setOriginalCode(res.svgCode);
      lastSavedCodeRef.current = res.svgCode;
      setFilename(res.filename);
      setCopyName(`${res.asset.name} (Copia)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [project.id, target]);

  useEffect(() => {
    if (target) {
      setCopyModeOpen(false);
      setStatusMsg(null);
      void loadCode();
    }
  }, [target, loadCode]);

  // Real-time sync when an AI via MCP edits this SVG while the drawer is open
  useEffect(() => {
    if (!target || !liveUpdate) return;
    if (liveUpdate.assetId === target.assetId && liveUpdate.source !== "ui") {
      setSvgCode(liveUpdate.svgCode);
      setOriginalCode(liveUpdate.svgCode);
      lastSavedCodeRef.current = liveUpdate.svgCode;
      setMcpBadge(true);
      setStatusMsg("Actualizado en tiempo real por IA (MCP)");
      window.setTimeout(() => setMcpBadge(false), 3200);
    }
  }, [liveUpdate, target]);

  const isValidSvg = useMemo(
    () => /<svg[\s>]/i.test(svgCode) && /<\/svg>/i.test(svgCode),
    [svgCode],
  );

  const previewDataUrl = useMemo(() => {
    if (!isValidSvg) return null;
    try {
      const safe = sanitizePreviewSvg(svgCode);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safe)}`;
    } catch {
      return null;
    }
  }, [svgCode, isValidSvg]);

  const detectedColors = useMemo(() => extractHexColors(svgCode), [svgCode]);

  const saveSvg = useCallback(
    async (mode: "replace" | "copy", silent = false) => {
      if (!target || !isValidSvg) return;
      setSaving(true);
      setError(null);
      try {
        const res = await studioApi.updateSvgAssetCode(project.id, target.assetId, {
          svgCode,
          mode,
          copyName: mode === "copy" ? copyName.trim() || undefined : undefined,
          updateLayerRef:
            mode === "copy" && swapLayerOnCopy && target.sceneId && target.layerId
              ? { sceneId: target.sceneId, layerId: target.layerId }
              : undefined,
        });
        setProjectFromRemote(res.project, res.receipt);
        lastSavedCodeRef.current = res.svgCode;
        setOriginalCode(res.svgCode);

        if (mode === "copy") {
          setCopyModeOpen(false);
          openSvgEditor({
            assetId: res.asset.id,
            sceneId: target.sceneId,
            layerId: target.layerId,
          });
          setBusyNotice(`Copia SVG guardada: «${res.asset.name}»`);
          window.setTimeout(() => setBusyNotice(null), 2600);
          setStatusMsg(`Guardado como copia: ${res.asset.name}`);
        } else if (!silent) {
          setBusyNotice("SVG actualizado en tiempo real en la escena.");
          window.setTimeout(() => setBusyNotice(null), 2200);
          setStatusMsg("Reemplazado y sincronizado en vivo");
        } else {
          setStatusMsg("Sincronizado en vivo");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [target, isValidSvg, project.id, svgCode, copyName, swapLayerOnCopy, setProjectFromRemote, openSvgEditor, setBusyNotice],
  );

  // Debounced live auto-sync to PixiJS Viewport while typing (when enabled)
  useEffect(() => {
    if (!target || !autoSync || loading || !isValidSvg) return;
    if (svgCode === lastSavedCodeRef.current) return;

    if (autoSaveTimerRef.current !== null) {
      window.clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = window.setTimeout(() => {
      void saveSvg("replace", true);
    }, 520);

    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [svgCode, autoSync, loading, isValidSvg, target, saveSvg]);

  if (!target) return null;

  const isDirty = svgCode !== originalCode;
  const lineCount = svgCode ? svgCode.split("\n").length : 0;

  return (
    <aside
      className="fixed top-2.5 right-2.5 bottom-2.5 z-40 w-[440px] max-w-[94vw] glass-elevated rounded-2xl flex flex-col overflow-hidden shadow-2xl"
      style={{ border: "1px solid var(--border-strong)" }}
    >
      {/* Header */}
      <div
        className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Code2 size={14} style={{ color: "var(--accent-primary)" }} />
            <span className="truncate">Editor SVG en Vivo</span>
            {mcpBadge && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                <Bot size={10} /> MCP
              </span>
            )}
          </div>
          <div className="text-[10px] font-mono-code truncate" style={{ color: "var(--text-muted)" }}>
            {asset?.name ?? target.assetId} · {filename || `${target.assetId}.svg`}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="studio-btn !p-1.5"
            title="Recargar desde disco"
            onClick={() => void loadCode()}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button className="studio-btn !p-1.5" title="Cerrar panel SVG" onClick={closeSvgEditor}>
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Live Preview Stage */}
      <div
        className="px-3 py-2.5 border-b shrink-0 flex flex-col gap-2"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between text-[10px]">
          <span className="uppercase tracking-wider font-semibold" style={{ color: "var(--text-secondary)" }}>
            Vista Previa Instantánea
          </span>
          <div className="flex items-center gap-1">
            {(["checker", "dark", "light"] as const).map((bg) => (
              <button
                key={bg}
                onClick={() => setPreviewBg(bg)}
                className="px-1.5 py-0.5 rounded text-[9.5px] cursor-pointer"
                style={{
                  background: previewBg === bg ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                  color: previewBg === bg ? "#0b0d14" : "var(--text-secondary)",
                }}
              >
                {bg === "checker" ? "Cuadrícula" : bg === "dark" ? "Oscuro" : "Claro"}
              </button>
            ))}
          </div>
        </div>

        <div
          className="h-[155px] rounded-xl flex items-center justify-center p-3 overflow-hidden relative"
          style={{
            border: "1px solid var(--border-subtle)",
            background:
              previewBg === "light"
                ? "#f8fafc"
                : previewBg === "dark"
                  ? "#090b10"
                  : "repeating-conic-gradient(#1f2433 0% 25%, #141824 0% 50%) 50% / 14px 14px",
          }}
        >
          {loading ? (
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--accent-primary)" }} />
          ) : previewDataUrl ? (
            <img
              src={previewDataUrl}
              alt={asset?.name ?? "SVG Preview"}
              className="max-w-full max-h-full object-contain drop-shadow"
            />
          ) : (
            <span className="text-[11px] text-amber-300">
              Escribe un bloque &lt;svg&gt;…&lt;/svg&gt; válido para previsualizar
            </span>
          )}
          <span
            className="absolute bottom-1.5 right-2 text-[9px] font-mono-code px-1.5 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.65)", color: "var(--text-secondary)" }}
          >
            {lineCount} líneas · {(svgCode.length / 1024).toFixed(1)} KB
          </span>
        </div>

        {/* Detected SVG Hex Colors Quick Swapper */}
        {detectedColors.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9.5px] flex items-center gap-1" style={{ color: "var(--text-muted)" }}>
              <Palette size={10} /> Colores:
            </span>
            {detectedColors.map((hex) => (
              <label
                key={hex}
                title={`Cambiar todas las apariciones de ${hex}`}
                className="w-5 h-5 rounded-md overflow-hidden cursor-pointer border border-white/25 inline-block"
                style={{ background: hex }}
              >
                <input
                  type="color"
                  className="opacity-0 w-full h-full cursor-pointer"
                  value={hex}
                  onChange={(e) => {
                    const nextHex = e.target.value.toLowerCase();
                    if (nextHex === hex) return;
                    const re = new RegExp(hex.replace("#", "#"), "gi");
                    setSvgCode((prev) => prev.replace(re, nextHex));
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Code Toolbar */}
      <div
        className="px-3 py-1.5 flex items-center justify-between gap-2 border-b shrink-0 text-[10px]"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <label className="flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={autoSync}
            onChange={(e) => setAutoSync(e.target.checked)}
          />
          Sincronizar en vivo al editar
        </label>
        <div className="flex items-center gap-1">
          <button
            className="studio-btn !py-0.5 !px-1.5 !text-[9.5px]"
            title="Formatear / indentar código SVG"
            onClick={() => setSvgCode((prev) => prettyFormatSvg(prev))}
          >
            <Sparkles size={10} /> Formatear
          </button>
          <button
            className="studio-btn !py-0.5 !px-1.5 !text-[9.5px]"
            title="Copiar código SVG"
            onClick={() => {
              void navigator.clipboard.writeText(svgCode);
              setCopiedCode(true);
              window.setTimeout(() => setCopiedCode(false), 1500);
            }}
          >
            {copiedCode ? <Check size={10} /> : <Copy size={10} />}
          </button>
          <button
            className="studio-btn !py-0.5 !px-1.5 !text-[9.5px]"
            title="Deshacer cambios no guardados"
            disabled={!isDirty}
            onClick={() => setSvgCode(originalCode)}
          >
            <RotateCcw size={10} />
          </button>
        </div>
      </div>

      {/* Editable SVG Code Area */}
      <div className="flex-1 min-h-0 p-2.5 flex flex-col gap-1.5">
        <textarea
          value={svgCode}
          onChange={(e) => setSvgCode(e.target.value)}
          spellCheck={false}
          className="flex-1 w-full rounded-xl p-2.5 font-mono-code text-[11px] leading-relaxed resize-none outline-none"
          style={{
            background: "rgba(6,8,14,0.86)",
            border: `1px solid ${isValidSvg ? "var(--border-subtle)" : "rgba(255,100,112,0.6)"}`,
            color: "#e2e8f0",
          }}
          placeholder="<svg viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'>...</svg>"
        />

        {error && (
          <div className="text-[10.5px] px-2 py-1 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30">
            {error}
          </div>
        )}
        {statusMsg && !error && (
          <div className="text-[10px] px-2 py-1 rounded-lg bg-emerald-500/12 text-emerald-300 border border-emerald-500/25 flex items-center justify-between">
            <span>{statusMsg}</span>
            <span className="font-mono-code opacity-75">ID: {target.assetId}</span>
          </div>
        )}
      </div>

      {/* Save As Copy Sub-panel */}
      {copyModeOpen && (
        <div
          className="px-3 py-2 border-t flex flex-col gap-1.5 shrink-0"
          style={{ background: "rgba(15,18,28,0.92)", borderColor: "var(--border-subtle)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-gold)" }}>
            Guardar como nuevo recurso SVG (Copia)
          </div>
          <input
            className="studio-input text-[11px]"
            placeholder="Nombre de la copia SVG…"
            value={copyName}
            onChange={(e) => setCopyName(e.target.value)}
          />
          {target.sceneId && target.layerId && (
            <label className="flex items-center gap-1.5 text-[10.5px] cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input
                type="checkbox"
                checked={swapLayerOnCopy}
                onChange={(e) => setSwapLayerOnCopy(e.target.checked)}
              />
              Usar esta copia en la capa seleccionada
            </label>
          )}
          <div className="flex items-center gap-1.5">
            <button
              className="studio-btn studio-btn-accent !py-1.5 !text-[11px] flex-1 justify-center"
              disabled={saving || !isValidSvg}
              onClick={() => void saveSvg("copy", false)}
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CopyPlus size={12} />}
              Confirmar copia
            </button>
            <button
              className="studio-btn !py-1.5 !px-2.5 !text-[11px]"
              onClick={() => setCopyModeOpen(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Footer Actions: Replace Original vs Save as Copy */}
      <div
        className="px-3 py-2.5 border-t flex items-center gap-2 shrink-0"
        style={{ borderColor: "var(--border-subtle)" }}
      >
        <button
          className="studio-btn studio-btn-accent !py-1.5 !text-[11px] flex-1 justify-center"
          disabled={saving || !isValidSvg}
          onClick={() => void saveSvg("replace", false)}
          title="Sobrescribe el archivo SVG original y actualiza la vista previa en tiempo real"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Reemplazar actual
        </button>
        <button
          className="studio-btn !py-1.5 !text-[11px] flex-1 justify-center"
          disabled={saving || !isValidSvg}
          onClick={() => setCopyModeOpen((v) => !v)}
          title="Crea un archivo SVG nuevo conservando el original intacto"
        >
          <CopyPlus size={12} />
          Guardar como copia
        </button>
      </div>
    </aside>
  );
};
