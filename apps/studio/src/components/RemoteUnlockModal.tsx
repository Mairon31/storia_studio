import React, { useState } from "react";
import { KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { studioApi } from "../lib/api";
import { ensureBundledFontsLoaded } from "../lib/fonts";
import { useStudioStore } from "../store/useStudioStore";

export const RemoteUnlockModal: React.FC = () => {
  const remoteAuthRequired = useStudioStore((s) => s.remoteAuthRequired);
  const remoteAuthMessage = useStudioStore((s) => s.remoteAuthMessage);
  const setRemoteAuthRequired = useStudioStore((s) => s.setRemoteAuthRequired);
  const clearError = useStudioStore((s) => s.clearError);
  const bootstrap = useStudioStore((s) => s.bootstrap);
  const setBusyNotice = useStudioStore((s) => s.setBusyNotice);

  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!remoteAuthRequired) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = token.trim();
    if (!cleaned) {
      setErrorMsg("Pega el código de acceso móvil o el Bearer Token MCP.");
      return;
    }

    // If the user pasted the full mobile URL (`https://.../auth/remote?code=...`), extract `code` seamlessly
    let candidate = cleaned;
    try {
      if (/^https?:\/\//i.test(cleaned)) {
        const parsed = new URL(cleaned);
        const fromQuery = parsed.searchParams.get("code") || parsed.searchParams.get("token");
        if (fromQuery) candidate = fromQuery.trim();
      }
    } catch {
      // Keep raw candidate
    }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      await studioApi.unlockRemoteSession(candidate);
      setToken("");
      setRemoteAuthRequired(false, null);
      clearError();
      setBusyNotice("Sesión remota autorizada con cookie HttpOnly segura.");
      window.setTimeout(() => setBusyNotice(null), 2800);
      void ensureBundledFontsLoaded();
      await bootstrap();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("401") || msg.includes("invalid_remote_token")) {
        setErrorMsg("Código o token incorrecto. Copia la URL Segura para Móvil desde tu PC en Ajustes › Conexión Remota.");
      } else if (msg.includes("429")) {
        setErrorMsg("Demasiados intentos fallidos. Espera unos minutos antes de reintentar.");
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(6, 8, 14, 0.84)", backdropFilter: "blur(14px)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 flex flex-col gap-3.5 shadow-2xl"
        style={{
          background: "var(--glass-surface-elevated)",
          border: "1px solid var(--border-strong)",
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(76, 230, 200, 0.14)", color: "var(--accent-teal)" }}
          >
            <Lock size={19} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
              Acceso Remoto Protegido
            </h2>
            <p className="text-[11.5px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Estás entrando a Storia Studio mediante un túnel público. Abre la{" "}
              <strong style={{ color: "var(--accent-teal)" }}>URL Segura para Móvil</strong> desde tu PC (Ajustes › Conexión Remota) o pega tu código de acceso aquí.
            </p>
          </div>
        </div>

        {(errorMsg || remoteAuthMessage) && (
          <div
            className="rounded-xl px-3 py-2 text-[11px] leading-snug"
            style={{
              background: "rgba(255, 100, 112, 0.14)",
              border: "1px solid rgba(255, 100, 112, 0.35)",
              color: "#fecaca",
            }}
          >
            {errorMsg || remoteAuthMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Código móvil, enlace completo o Bearer Token MCP
            <input
              type="password"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="studio-input font-mono-code !py-2 !px-3 !text-[12px]"
              placeholder="storia_mob_… o pega el enlace completo"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={submitting || !token.trim()}
            className="studio-btn studio-btn-accent justify-center !py-2 !text-[12px] font-semibold disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
            Desbloquear sesión segura
          </button>
        </form>

        <div
          className="rounded-xl px-3 py-2 text-[10.5px] flex items-start gap-2 leading-relaxed"
          style={{ background: "rgba(0,0,0,0.26)", color: "var(--text-muted)" }}
        >
          <ShieldCheck size={14} className="shrink-0 mt-0.5" style={{ color: "var(--accent-teal)" }} />
          <span>
            Al desbloquear, tu navegador guarda una cookie cifrada <code className="font-mono-code">HttpOnly</code> válida por 7 días. Las API keys y ajustes del túnel permanecen bloqueados fuera del equipo principal.
          </span>
        </div>
      </div>
    </div>
  );
};
