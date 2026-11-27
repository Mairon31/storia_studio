<script setup lang="ts">
import { ref } from "vue";
import { withBase } from "vitepress";

const DISCORD_URL = "https://discord.gg/ahJM3hyFWr";
const REPO_URL = ["https://", "github.com/", "Mairon31/storia_studio"].join("");
const RELEASES_URL = `${REPO_URL}/releases`;

const copied = ref(false);
const quickCmd = "pnpm install && pnpm build && pnpm dev";

function copyCommand() {
  if (typeof navigator === "undefined" || !navigator.clipboard) return;
  navigator.clipboard.writeText(quickCmd).then(() => {
    copied.value = true;
    window.setTimeout(() => {
      copied.value = false;
    }, 1800);
  });
}

const specs = [
  {
    index: "01",
    label: "Motor determinista",
    value: "WebGL2 · 60 FPS",
    detail:
      "Vista previa en tiempo real en 9:16, 16:9, 1:1 y 4K con línea de tiempo multipista, ondas Web Audio y edición SVG en vivo.",
  },
  {
    index: "02",
    label: "Estilos de animación",
    value: "23 pipelines",
    detail:
      "Transforma personajes, escenarios, tipografía, subtítulos y shaders GPU en un paso: 3D Clay, Kurzgesagt, Anime Cel, Retro PSX 1998 y Paper Cutout.",
  },
  {
    index: "03",
    label: "Exportación exacta",
    value: "1:1 FFmpeg",
    detail:
      "Render paralelo por GPU NVENC o CPU, motion blur sub-fotograma y masterización de audio en dos pasadas a -16 LUFS.",
  },
  {
    index: "04",
    label: "Dirección por IA",
    value: "68+ Tools MCP",
    detail:
      "Control bidireccional en vivo por stdio o HTTP /mcp con OAuth 2.1 + PKCE, auditoría visual y captura de fotogramas 1:1.",
  },
  {
    index: "05",
    label: "Privacidad local-first",
    value: "Zero-Trust",
    detail:
      "Tus proyectos y claves residen en tu equipo bajo bóveda AES-256-GCM, aislamiento estricto de administración local y protección anti-SSRF.",
  },
  {
    index: "06",
    label: "Distribución nativa",
    value: "Estable & Nightly",
    detail:
      "Aplicación nativa en Rust (Tauri v2) para Windows, macOS y Linux con actualizador integrado verificado por SHA-256 y reinicio automático.",
  },
];

const guides = [
  {
    step: "01",
    title: "Primeros pasos e instalación",
    desc: "Instaladores nativos, asistente inicial de 6 pasos, requisitos previos y ejecución desde código fuente.",
    href: "/getting-started",
  },
  {
    step: "02",
    title: "Arquitectura y motor creativo",
    desc: "Estructura del monorepo, los 23 estilos integrales, rigs articulados 2D, subtítulos y exportación FFmpeg.",
    href: "/architecture",
  },
  {
    step: "03",
    title: "MCP para IAs y acceso remoto",
    desc: "Conexión stdio y Streamable HTTP /mcp, OAuth 2.1 + PKCE, túneles ngrok/Cloudflare y control móvil.",
    href: "/mcp-and-remote",
  },
  {
    step: "04",
    title: "Releases y canales",
    desc: "Cómo funcionan los canales Estable y Nightly, actualización automática en 1 clic y builds locales en Rust.",
    href: "/releases-and-updates",
  },
  {
    step: "05",
    title: "Política de seguridad",
    desc: "Bóveda AES-256-GCM, aislamiento loopback, sanitización SVG y reporte responsable de vulnerabilidades.",
    href: "/security",
  },
];
</script>

<template>
  <div class="st-landing">
    <!-- Hero -->
    <section class="st-hero">
      <div class="st-container">
        <div class="st-meta-row">
          <span class="st-pill">v0.2.0</span>
          <span class="st-meta-sep" aria-hidden="true">/</span>
          <span class="st-meta-text">Windows · macOS · Linux · Local-First</span>
        </div>

        <div class="st-hero-grid">
          <div class="st-hero-copy">
            <h1 class="st-title">
              Edición y animación 2D<br />
              en tu equipo, sin ruido.
            </h1>

            <p class="st-lead">
              <strong>Storia Studio</strong> es un estudio de video no lineal (NLE)
              <em>local-first</em> con motor WebGL2 a 60&nbsp;FPS, 23 estilos de animación,
              exportación 1:1 con FFmpeg y control en vivo por IA mediante MCP.
            </p>

            <div class="st-actions">
              <a class="st-btn st-btn-primary" :href="withBase('/getting-started')">
                <span>Ver documentación</span>
                <svg
                  class="st-icon"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                  aria-hidden="true"
                >
                  <path d="M3.5 8h9m0 0L9 4.5M12.5 8 9 11.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </a>

              <a
                class="st-btn st-btn-secondary"
                :href="DISCORD_URL"
                target="_blank"
                rel="noopener noreferrer"
              >
                <svg class="st-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path
                    d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
                  />
                </svg>
                <span>Unirse al Discord</span>
              </a>
            </div>
          </div>

          <!-- Architectural Monochrome Mark & Summary Panel -->
          <div class="st-hero-card">
            <div class="st-hero-card-top">
              <img
                class="st-mark st-mark-light"
                :src="withBase('/logo-light.svg')"
                alt="Storia Studio"
                width="52"
                height="52"
              />
              <img
                class="st-mark st-mark-dark"
                :src="withBase('/logo-dark.svg')"
                alt="Storia Studio"
                width="52"
                height="52"
              />
              <div class="st-card-id">
                <div class="st-card-name">Storia Studio</div>
                <div class="st-card-sub">Desktop NLE · Rust Tauri v2</div>
              </div>
            </div>

            <div class="st-kv-list">
              <div class="st-kv">
                <span>Canales</span>
                <strong>Estable (v*) · Nightly</strong>
              </div>
              <div class="st-kv">
                <span>Render</span>
                <strong>PixiJS v8 · WebGL2 · NVENC</strong>
              </div>
              <div class="st-kv">
                <span>Audio</span>
                <strong>Whisper · TTS · -16 LUFS</strong>
              </div>
              <div class="st-kv">
                <span>Integración IA</span>
                <strong>MCP stdio / HTTP + OAuth 2.1</strong>
              </div>
            </div>

            <div class="st-terminal">
              <code>{{ quickCmd }}</code>
              <button
                type="button"
                class="st-copy-btn"
                :aria-label="copied ? 'Copiado' : 'Copiar comando'"
                @click="copyCommand"
              >
                {{ copied ? "Copiado" : "Copiar" }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Hairline Capabilities Matrix -->
    <section class="st-section">
      <div class="st-container">
        <div class="st-section-head">
          <span class="st-eyebrow">Capacidades</span>
          <h2>Diseñado para producir de principio a fin</h2>
        </div>

        <div class="st-spec-grid">
          <article v-for="item in specs" :key="item.index" class="st-spec-cell">
            <div class="st-spec-top">
              <span class="st-spec-num">{{ item.index }}</span>
              <span class="st-spec-label">{{ item.label }}</span>
            </div>
            <div class="st-spec-value">{{ item.value }}</div>
            <p class="st-spec-detail">{{ item.detail }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- Documentation Index -->
    <section class="st-section st-section-alt">
      <div class="st-container">
        <div class="st-section-head">
          <span class="st-eyebrow">Documentación</span>
          <h2>Guías técnicas y de uso</h2>
        </div>

        <div class="st-doc-list">
          <a
            v-for="guide in guides"
            :key="guide.step"
            class="st-doc-row"
            :href="withBase(guide.href)"
          >
            <span class="st-doc-step">{{ guide.step }}</span>
            <div class="st-doc-body">
              <div class="st-doc-title">{{ guide.title }}</div>
              <div class="st-doc-desc">{{ guide.desc }}</div>
            </div>
            <span class="st-doc-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </div>
    </section>

    <!-- Minimalist Footer -->
    <footer class="st-footer">
      <div class="st-container st-footer-inner">
        <div class="st-footer-left">
          <span class="st-footer-brand">Storia Studio</span>
          <span class="st-footer-copy">© 2026 Mairon Mayorga</span>
        </div>
        <nav class="st-footer-links" aria-label="Enlaces del pie de página">
          <a :href="withBase('/getting-started')">Documentación</a>
          <a :href="RELEASES_URL" target="_blank" rel="noopener noreferrer">Releases</a>
          <a :href="withBase('/security')">Seguridad</a>
          <a :href="DISCORD_URL" target="_blank" rel="noopener noreferrer">Discord</a>
          <a :href="REPO_URL" target="_blank" rel="noopener noreferrer">GitHub</a>
        </nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.st-landing {
  color: var(--st-ink);
  background: var(--st-surface);
}

.st-container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 0 24px;
}

/* Hero */
.st-hero {
  padding: 72px 0 80px;
  border-bottom: 1px solid var(--st-border);
  background: radial-gradient(circle at 80% 0%, var(--st-surface-subtle) 0%, transparent 55%);
}

.st-meta-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--st-ink-subtle);
  margin-bottom: 28px;
}

.st-pill {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--st-ink);
  background: var(--st-surface-hover);
  border: 1px solid var(--st-border);
  padding: 2px 9px;
  border-radius: 999px;
}

.st-meta-sep {
  color: var(--st-border-strong);
}

.st-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.9fr);
  gap: 48px;
  align-items: center;
}

.st-title {
  font-size: clamp(2.15rem, 4.4vw, 3.35rem);
  line-height: 1.08;
  letter-spacing: -0.04em;
  font-weight: 700;
  margin: 0 0 20px;
  color: var(--st-ink);
}

.st-lead {
  font-size: 16.5px;
  line-height: 1.65;
  color: var(--st-ink-muted);
  margin: 0 0 32px;
  max-width: 540px;
}

.st-lead strong {
  color: var(--st-ink);
  font-weight: 600;
}

.st-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.st-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none !important;
  transition: background-color 0.16s ease, border-color 0.16s ease, transform 0.14s ease;
  cursor: pointer;
}

.st-btn-primary {
  background: var(--st-btn-primary-bg);
  color: var(--st-btn-primary-fg) !important;
  border: 1px solid var(--st-btn-primary-bg);
}

.st-btn-primary:hover {
  background: var(--st-btn-primary-hover);
  border-color: var(--st-btn-primary-hover);
}

.st-btn-secondary {
  background: var(--st-surface);
  color: var(--st-ink) !important;
  border: 1px solid var(--st-border-strong);
}

.st-btn-secondary:hover {
  background: var(--st-surface-hover);
  border-color: var(--st-ink);
}

.st-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

/* Right Architectural Card */
.st-hero-card {
  background: var(--st-surface-subtle);
  border: 1px solid var(--st-border);
  border-radius: 14px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.st-hero-card-top {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--st-border);
}

.st-mark {
  width: 48px;
  height: 48px;
  border-radius: 11px;
  flex-shrink: 0;
}

.st-mark-dark {
  display: none;
}

:global(.dark) .st-mark-light {
  display: none;
}

:global(.dark) .st-mark-dark {
  display: block;
}

.st-card-name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--st-ink);
}

.st-card-sub {
  font-size: 12.5px;
  color: var(--st-ink-subtle);
  margin-top: 2px;
}

.st-kv-list {
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.st-kv {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
}

.st-kv span {
  color: var(--st-ink-subtle);
}

.st-kv strong {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--st-ink);
  text-align: right;
}

.st-terminal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  background: var(--st-surface);
  border: 1px solid var(--st-border);
  border-radius: 9px;
  padding: 10px 12px;
}

.st-terminal code {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--st-ink-muted);
  overflow-x: auto;
  white-space: nowrap;
}

.st-copy-btn {
  font-size: 11.5px;
  font-weight: 500;
  color: var(--st-ink);
  background: var(--st-surface-hover);
  border: 1px solid var(--st-border);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.st-copy-btn:hover {
  border-color: var(--st-border-strong);
}

/* Sections */
.st-section {
  padding: 72px 0;
  border-bottom: 1px solid var(--st-border);
}

.st-section-alt {
  background: var(--st-surface-subtle);
}

.st-section-head {
  margin-bottom: 36px;
}

.st-eyebrow {
  display: inline-block;
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--st-ink-subtle);
  margin-bottom: 8px;
}

.st-section-head h2 {
  font-size: clamp(1.45rem, 2.5vw, 1.95rem);
  letter-spacing: -0.03em;
  font-weight: 600;
  margin: 0;
  color: var(--st-ink);
}

/* Hairline Spec Matrix */
.st-spec-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-top: 1px solid var(--st-border);
  border-left: 1px solid var(--st-border);
}

.st-spec-cell {
  padding: 26px 24px;
  border-right: 1px solid var(--st-border);
  border-bottom: 1px solid var(--st-border);
  background: var(--st-surface);
  transition: background-color 0.16s ease;
}

.st-spec-cell:hover {
  background: var(--st-surface-subtle);
}

.st-spec-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 14px;
}

.st-spec-num {
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  color: var(--st-ink-subtle);
}

.st-spec-label {
  font-size: 12px;
  color: var(--st-ink-subtle);
}

.st-spec-value {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--st-ink);
  margin-bottom: 8px;
}

.st-spec-detail {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--st-ink-muted);
  margin: 0;
}

/* Documentation Directory Rows */
.st-doc-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--st-border);
  background: var(--st-surface);
  border-radius: 12px;
  border: 1px solid var(--st-border);
  overflow: hidden;
}

.st-doc-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  text-decoration: none !important;
  border-bottom: 1px solid var(--st-border);
  transition: background-color 0.15s ease;
}

.st-doc-row:last-child {
  border-bottom: none;
}

.st-doc-row:hover {
  background: var(--st-surface-hover);
}

.st-doc-step {
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  color: var(--st-ink-subtle);
}

.st-doc-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--st-ink);
  letter-spacing: -0.015em;
}

.st-doc-desc {
  font-size: 13.5px;
  color: var(--st-ink-muted);
  margin-top: 3px;
  line-height: 1.5;
}

.st-doc-arrow {
  font-size: 16px;
  color: var(--st-ink-subtle);
  text-align: right;
  transition: transform 0.15s ease, color 0.15s ease;
}

.st-doc-row:hover .st-doc-arrow {
  transform: translateX(3px);
  color: var(--st-ink);
}

/* Footer */
.st-footer {
  padding: 32px 0 44px;
  background: var(--st-surface);
}

.st-footer-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.st-footer-left {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.st-footer-brand {
  font-weight: 600;
  color: var(--st-ink);
}

.st-footer-copy {
  color: var(--st-ink-subtle);
}

.st-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.st-footer-links a {
  font-size: 13px;
  color: var(--st-ink-muted);
  text-decoration: none;
  transition: color 0.15s ease;
}

.st-footer-links a:hover {
  color: var(--st-ink);
}

/* Responsive */
@media (max-width: 960px) {
  .st-hero {
    padding: 48px 0 56px;
  }

  .st-hero-grid {
    grid-template-columns: 1fr;
    gap: 32px;
  }

  .st-spec-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .st-container {
    padding: 0 18px;
  }

  .st-hero {
    padding: 36px 0 44px;
  }

  .st-actions {
    flex-direction: column;
  }

  .st-btn {
    width: 100%;
  }

  .st-spec-grid {
    grid-template-columns: 1fr;
  }

  .st-doc-row {
    grid-template-columns: 32px minmax(0, 1fr) 18px;
    gap: 10px;
    padding: 16px;
  }

  .st-section {
    padding: 48px 0;
  }
}
</style>
