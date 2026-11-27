import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { probeAudioDurationSec } from "./libraries.js";
import {
  decryptSecret,
  encryptSecret,
  extractOriginSafe,
  normalizeSafeHttpUrl,
  redactSecrets,
} from "./secretVault.js";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_TTS_SCRIPT = path.resolve(__dirname, "../../../scripts/tts_local.py");
const DEFAULT_MODELS_DIR = path.resolve(__dirname, "../../../models/tts");

const ELEVENLABS_BASE = ["https://", "api.elevenlabs.io", "/v1"].join("");
const OPENAI_DEFAULT_BASE = ["https://", "api.openai.com", "/v1"].join("");
const VOICESTUDIO_DEFAULT_BASE = ["http://", "localhost", ":8000"].join("");
const PIPER_HF_BASE = ["https://", "huggingface.co", "/rhasspy/piper-voices/resolve/v1.0.0"].join("");
const KOKORO_RELEASE_BASE = [
  "https://",
  "github.com",
  "/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0",
].join("");

export type TtsProviderId =
  | "windows_sapi"
  | "elevenlabs"
  | "voicestudio"
  | "piper"
  | "kokoro"
  | "openai"
  | "custom_api";

export interface TtsVoiceInfo {
  id: string;
  name: string;
  language: string;
  gender?: string;
  provider: TtsProviderId;
  installed?: boolean;
  downloadable?: boolean;
  sizeLabel?: string;
  previewUrl?: string;
  description?: string;
}

export interface TtsStoredConfig {
  elevenlabsApiKey?: string;
  elevenlabsModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  voiceStudioUrl?: string;
  voiceStudioApiKey?: string;
  customApiUrl?: string;
  customApiHeaderName?: string;
  customApiKey?: string;
  customApiBodyTemplate?: string;
}

export interface TtsPublicConfig {
  hasElevenlabsKey: boolean;
  elevenlabsModel: string;
  hasOpenaiKey: boolean;
  openaiBaseUrl: string;
  openaiModel: string;
  voiceStudioUrl: string;
  hasVoiceStudioKey: boolean;
  customApiUrl: string;
  customApiHeaderName: string;
  hasCustomApiKey: boolean;
  customApiBodyTemplate: string;
}

export interface TtsProviderStatus {
  id: TtsProviderId;
  name: string;
  kind: "local" | "cloud" | "self_hosted";
  available: boolean;
  ready: boolean;
  detail: string;
  requiresApiKey?: boolean;
  installableModels?: {
    id: string;
    name: string;
    language: string;
    sizeLabel: string;
    installed: boolean;
  }[];
  pythonPackageInstalled?: boolean;
  pipInstallHint?: string;
}

export interface TtsSynthesizeRequest {
  provider: TtsProviderId;
  text: string;
  voiceId?: string;
  language?: string;
  speed?: number;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  voiceStudioUrl?: string;
  customApiUrl?: string;
}

interface PiperVoiceCatalogEntry {
  id: string;
  name: string;
  language: string;
  gender: string;
  sizeLabel: string;
  onnxUrl: string;
  jsonUrl: string;
}

export const PIPER_CATALOG: PiperVoiceCatalogEntry[] = [
  {
    id: "es_MX-ald-medium",
    name: "Aldo (Español MX · Claro)",
    language: "es-MX",
    gender: "Male",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/es/es_MX/ald/medium/es_MX-ald-medium.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json`,
  },
  {
    id: "es_MX-claude-high",
    name: "Claude (Español MX · Alta calidad)",
    language: "es-MX",
    gender: "Female",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/es/es_MX/claude/high/es_MX-claude-high.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/es/es_MX/claude/high/es_MX-claude-high.onnx.json`,
  },
  {
    id: "es_ES-davefx-medium",
    name: "DaveFX (Español ES · Narrador)",
    language: "es-ES",
    gender: "Male",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/es/es_ES/davefx/medium/es_ES-davefx-medium.onnx.json`,
  },
  {
    id: "es_ES-sharvard-medium",
    name: "Sharvard (Español ES · Dual)",
    language: "es-ES",
    gender: "Female",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/es/es_ES/sharvard/medium/es_ES-sharvard-medium.onnx.json`,
  },
  {
    id: "en_US-lessac-medium",
    name: "Lessac (English US · Studio)",
    language: "en-US",
    gender: "Female",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json`,
  },
  {
    id: "en_US-amy-medium",
    name: "Amy (English US · Warm)",
    language: "en-US",
    gender: "Female",
    sizeLabel: "63 MB",
    onnxUrl: `${PIPER_HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx`,
    jsonUrl: `${PIPER_HF_BASE}/en/en_US/amy/medium/en_US-amy-medium.onnx.json`,
  },
];

export const KOKORO_VOICES: TtsVoiceInfo[] = [
  { id: "ef_dora", name: "Dora (Español · Femenina suave)", language: "es", gender: "Female", provider: "kokoro" },
  { id: "em_alex", name: "Alex (Español · Masculino)", language: "es", gender: "Male", provider: "kokoro" },
  { id: "em_santa", name: "Santa (Español · Grave)", language: "es", gender: "Male", provider: "kokoro" },
  { id: "af_heart", name: "Heart (English US · Natural)", language: "en", gender: "Female", provider: "kokoro" },
  { id: "af_bella", name: "Bella (English US · Editorial)", language: "en", gender: "Female", provider: "kokoro" },
  { id: "am_michael", name: "Michael (English US · Narrator)", language: "en", gender: "Male", provider: "kokoro" },
  { id: "bf_emma", name: "Emma (English UK · Calm)", language: "en-gb", gender: "Female", provider: "kokoro" },
];

export const OPENAI_VOICES: TtsVoiceInfo[] = [
  { id: "coral", name: "Coral (Cálida / Narrativa)", language: "multi", gender: "Female", provider: "openai" },
  { id: "nova", name: "Nova (Clara / Editorial)", language: "multi", gender: "Female", provider: "openai" },
  { id: "sage", name: "Sage (Suave / Documental)", language: "multi", gender: "Female", provider: "openai" },
  { id: "alloy", name: "Alloy (Equilibrada)", language: "multi", gender: "Neutral", provider: "openai" },
  { id: "shimmer", name: "Shimmer (Luminosa)", language: "multi", gender: "Female", provider: "openai" },
  { id: "echo", name: "Echo (Masculina suave)", language: "multi", gender: "Male", provider: "openai" },
  { id: "onyx", name: "Onyx (Grave / Cine)", language: "multi", gender: "Male", provider: "openai" },
  { id: "ash", name: "Ash (Directa)", language: "multi", gender: "Male", provider: "openai" },
  { id: "fable", name: "Fable (Storytelling)", language: "multi", gender: "Neutral", provider: "openai" },
];

const ELEVENLABS_FALLBACK_VOICES: TtsVoiceInfo[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (Calma · Narración)", language: "multi", gender: "Female", provider: "elevenlabs" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (Suave · Editorial)", language: "multi", gender: "Female", provider: "elevenlabs" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (Profunda · Documental)", language: "multi", gender: "Male", provider: "elevenlabs" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni (Conversacional)", language: "multi", gender: "Male", provider: "elevenlabs" },
];

function toWindowsPathIfWsl(p: string): string {
  const m = p.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (m && m[1] && m[2] !== undefined) {
    return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, "\\")}`;
  }
  return p;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    const st = await fs.stat(p);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function downloadFileAtomic(url: string, destPath: string): Promise<number> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.part`;
  const res = await fetch(url, {
    headers: { "User-Agent": "StoriaStudio/0.3 (TTS Model Manager)" },
    redirect: "follow",
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    throw new Error(`Descarga fallida (HTTP ${res.status}) desde ${url}`);
  }
  const ab = await res.arrayBuffer();
  if (ab.byteLength < 64) {
    throw new Error(`Archivo descargado vacío o inválido (${ab.byteLength} bytes)`);
  }
  await fs.writeFile(tmpPath, Buffer.from(ab));
  await fs.rename(tmpPath, destPath);
  return ab.byteLength;
}

async function convertToStudioWav(inputPath: string, outWavPath: string): Promise<number> {
  await fs.mkdir(path.dirname(outWavPath), { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-i", inputPath,
      "-ar", "48000",
      "-ac", "2",
      "-c:a", "pcm_s16le",
      outWavPath,
    ],
    { timeout: 60_000 },
  );
  return (await probeAudioDurationSec(outWavPath)) ?? 1.5;
}

export class TtsManager {
  readonly modelsDir: string;
  readonly configPath: string;
  private cachedWindowsVoices: TtsVoiceInfo[] | null = null;
  private cachedPyModules: { kokoro_onnx: boolean; piper: boolean } | null = null;
  private cachedPowerShellOk: boolean | null = null;

  constructor(modelsDir?: string) {
    this.modelsDir = path.resolve(modelsDir ?? DEFAULT_MODELS_DIR);
    this.configPath = path.join(this.modelsDir, "tts-settings.json");
  }

  private async readStoredConfig(): Promise<TtsStoredConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      const parsed = JSON.parse(raw) as TtsStoredConfig;
      return {
        ...parsed,
        elevenlabsApiKey: decryptSecret(parsed.elevenlabsApiKey),
        openaiApiKey: decryptSecret(parsed.openaiApiKey),
        voiceStudioApiKey: decryptSecret(parsed.voiceStudioApiKey),
        customApiKey: decryptSecret(parsed.customApiKey),
      };
    } catch {
      return {};
    }
  }

  async getPublicConfig(): Promise<TtsPublicConfig> {
    const cfg = await this.readStoredConfig();
    const envEl = process.env.ELEVENLABS_API_KEY;
    const envOai = process.env.OPENAI_API_KEY;
    return {
      hasElevenlabsKey: Boolean(cfg.elevenlabsApiKey || envEl),
      elevenlabsModel: cfg.elevenlabsModel || "eleven_multilingual_v2",
      hasOpenaiKey: Boolean(cfg.openaiApiKey || envOai),
      openaiBaseUrl: cfg.openaiBaseUrl || OPENAI_DEFAULT_BASE,
      openaiModel: cfg.openaiModel || "gpt-4o-mini-tts",
      voiceStudioUrl: cfg.voiceStudioUrl || VOICESTUDIO_DEFAULT_BASE,
      hasVoiceStudioKey: Boolean(cfg.voiceStudioApiKey),
      customApiUrl: cfg.customApiUrl || "",
      customApiHeaderName: cfg.customApiHeaderName || "Authorization",
      hasCustomApiKey: Boolean(cfg.customApiKey),
      customApiBodyTemplate:
        cfg.customApiBodyTemplate ||
        '{"text": "{{text}}", "voice": "{{voice}}", "speed": {{speed}}}',
    };
  }

  async updateConfig(patch: Partial<TtsStoredConfig>): Promise<TtsPublicConfig> {
    const prev = await this.readStoredConfig();
    const next: TtsStoredConfig = { ...prev };

    const urlKeys = new Set<keyof TtsStoredConfig>(["openaiBaseUrl", "voiceStudioUrl", "customApiUrl"]);
    for (const [k, v] of Object.entries(patch) as [keyof TtsStoredConfig, string | undefined][]) {
      if (v === undefined) continue;
      const trimmed = v.trim();
      if (trimmed === "__CLEAR__") {
        delete next[k];
      } else if (trimmed !== "") {
        next[k] = urlKeys.has(k) ? normalizeSafeHttpUrl(trimmed) : trimmed;
      }
    }

    // Encrypt all API keys at rest (AES-256-GCM) with key stored outside the workspace
    const diskPayload: TtsStoredConfig = {
      ...next,
      elevenlabsApiKey: encryptSecret(next.elevenlabsApiKey),
      openaiApiKey: encryptSecret(next.openaiApiKey),
      voiceStudioApiKey: encryptSecret(next.voiceStudioApiKey),
      customApiKey: encryptSecret(next.customApiKey),
    };

    await fs.mkdir(this.modelsDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(this.configPath, JSON.stringify(diskPayload, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.chmod(this.configPath, 0o600).catch(() => {});
    return this.getPublicConfig();
  }

  private async resolvePythonRunner(): Promise<{ bin: string; translatePaths: boolean }> {
    if (process.platform === "win32") return { bin: "python", translatePaths: false };
    try {
      await execFileAsync("python3", ["-c", "import kokoro_onnx"], { timeout: 4_000 });
      return { bin: "python3", translatePaths: false };
    } catch {
      try {
        await execFileAsync("python.exe", ["--version"], { timeout: 5_000 });
        return { bin: "python.exe", translatePaths: true };
      } catch {
        return { bin: "python3", translatePaths: false };
      }
    }
  }

  private async checkPythonTtsModules(force = false): Promise<{ kokoro_onnx: boolean; piper: boolean }> {
    if (this.cachedPyModules && !force) return this.cachedPyModules;
    try {
      const { bin, translatePaths } = await this.resolvePythonRunner();
      const tmpPayload = path.join(os.tmpdir(), `storia-tts-check-${Date.now()}.json`);
      await fs.writeFile(tmpPayload, JSON.stringify({ engine: "check" }), "utf8");
      try {
        const scriptArg = translatePaths ? toWindowsPathIfWsl(LOCAL_TTS_SCRIPT) : LOCAL_TTS_SCRIPT;
        const payloadArg = translatePaths ? toWindowsPathIfWsl(tmpPayload) : tmpPayload;
        const { stdout } = await execFileAsync(bin, [scriptArg, payloadArg], { timeout: 8_000 });
        const parsed = JSON.parse(stdout.trim().split(/\r?\n/).pop() || "{}") as {
          modules?: { kokoro_onnx?: boolean; piper?: boolean };
        };
        this.cachedPyModules = {
          kokoro_onnx: Boolean(parsed.modules?.kokoro_onnx),
          piper: Boolean(parsed.modules?.piper),
        };
      } finally {
        await fs.rm(tmpPayload, { force: true }).catch(() => {});
      }
    } catch {
      this.cachedPyModules = { kokoro_onnx: false, piper: false };
    }
    return this.cachedPyModules;
  }

  private async hasPiperCli(): Promise<boolean> {
    try {
      await execFileAsync("piper", ["--help"], { timeout: 4_000 });
      return true;
    } catch {
      return false;
    }
  }

  private async getPowerShellBin(): Promise<string | null> {
    if (this.cachedPowerShellOk === false) return null;
    const bin = process.platform === "win32" ? "powershell" : "powershell.exe";
    try {
      await execFileAsync(bin, ["-NoProfile", "-Command", "Write-Output ok"], { timeout: 6_000 });
      this.cachedPowerShellOk = true;
      return bin;
    } catch {
      this.cachedPowerShellOk = false;
      return null;
    }
  }

  async listWindowsSapiVoices(refresh = false): Promise<TtsVoiceInfo[]> {
    if (this.cachedWindowsVoices && !refresh) return this.cachedWindowsVoices;
    const ps = await this.getPowerShellBin();
    if (!ps) return [];
    try {
      const { stdout } = await execFileAsync(
        ps,
        [
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.GetInstalledVoices() | ForEach-Object { $v = $_.VoiceInfo; Write-Output ($v.Name + '|' + $v.Culture.Name + '|' + $v.Gender) }",
        ],
        { timeout: 10_000 },
      );
      const voices: TtsVoiceInfo[] = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.includes("|"))
        .map((line) => {
          const [name = "", culture = "es-ES", gender = "Neutral"] = line.split("|");
          return {
            id: name,
            name: `${name.replace(/^Microsoft\s+/i, "").replace(/\s+Desktop$/i, "")} (${culture})`,
            language: culture,
            gender,
            provider: "windows_sapi" as const,
            installed: true,
          };
        });
      this.cachedWindowsVoices = voices;
      return voices;
    } catch {
      return [];
    }
  }

  private async probeVoiceStudio(baseUrl: string, apiKey?: string): Promise<{ online: boolean; voices: TtsVoiceInfo[] }> {
    const cleanBase = baseUrl.replace(/\/+$/, "");
    if (!cleanBase) return { online: false, voices: [] };
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const endpoints = ["/api/voices", "/voices", "/speakers", "/v1/voices", "/health", "/"];
    for (const ep of endpoints) {
      try {
        const res = await fetch(`${cleanBase}${ep}`, {
          headers,
          signal: AbortSignal.timeout(2_000),
        });
        if (!res.ok) continue;
        const ct = (res.headers.get("content-type") ?? "").toLowerCase();
        if (ct.includes("application/json")) {
          const data = (await res.json()) as unknown;
          const rawList = Array.isArray(data)
            ? data
            : (data as Record<string, unknown>)?.voices ??
              (data as Record<string, unknown>)?.speakers ??
              (data as Record<string, unknown>)?.data ??
              [];
          if (Array.isArray(rawList) && rawList.length > 0) {
            const voices: TtsVoiceInfo[] = rawList
              .map((v: unknown, idx: number) => {
                if (typeof v === "string") {
                  return { id: v, name: v, language: "multi", provider: "voicestudio" as const, installed: true };
                }
                const obj = v as Record<string, unknown>;
                const id = String(obj.id ?? obj.voice_id ?? obj.name ?? `voice_${idx + 1}`);
                const name = String(obj.name ?? obj.label ?? id);
                const lang = String(obj.language ?? obj.lang ?? "multi");
                return { id, name, language: lang, provider: "voicestudio" as const, installed: true };
              })
              .slice(0, 100);
            return { online: true, voices };
          }
          return { online: true, voices: [] };
        }
        return { online: true, voices: [] };
      } catch {
        // Try next endpoint
      }
    }
    return { online: false, voices: [] };
  }

  async getProvidersOverview(refresh = false): Promise<{
    config: TtsPublicConfig;
    providers: TtsProviderStatus[];
  }> {
    const [pub, stored, winVoices, pyMods, piperCli] = await Promise.all([
      this.getPublicConfig(),
      this.readStoredConfig(),
      this.listWindowsSapiVoices(refresh),
      this.checkPythonTtsModules(refresh),
      this.hasPiperCli(),
    ]);

    const piperDir = path.join(this.modelsDir, "piper");
    const piperModels = await Promise.all(
      PIPER_CATALOG.map(async (m) => ({
        id: m.id,
        name: m.name,
        language: m.language,
        sizeLabel: m.sizeLabel,
        installed: await fileExists(path.join(piperDir, `${m.id}.onnx`)),
      })),
    );
    const piperAnyInstalled = piperModels.some((m) => m.installed);

    const kokoroDir = path.join(this.modelsDir, "kokoro");
    const kokoroReadyFiles =
      (await fileExists(path.join(kokoroDir, "kokoro-v1.0.onnx"))) &&
      (await fileExists(path.join(kokoroDir, "voices-v1.0.bin")));

    const vsProbe = await this.probeVoiceStudio(pub.voiceStudioUrl, stored.voiceStudioApiKey);

    const providers: TtsProviderStatus[] = [
      {
        id: "windows_sapi",
        name: "Windows TTS (Integrado)",
        kind: "local",
        available: winVoices.length > 0,
        ready: winVoices.length > 0,
        detail:
          winVoices.length > 0
            ? `${winVoices.length} voces locales listas (offline, $0)`
            : "System.Speech no disponible en este sistema",
      },
      {
        id: "elevenlabs",
        name: "ElevenLabs API",
        kind: "cloud",
        available: true,
        ready: pub.hasElevenlabsKey,
        requiresApiKey: true,
        detail: pub.hasElevenlabsKey
          ? `Conectado · Modelo ${pub.elevenlabsModel}`
          : "Ingresa tu API key de ElevenLabs para usar tus voces",
      },
      {
        id: "voicestudio",
        name: "VoiceStudio (Local)",
        kind: "self_hosted",
        available: true,
        ready: vsProbe.online,
        detail: vsProbe.online
          ? `Conectado en ${pub.voiceStudioUrl} (${vsProbe.voices.length || "perfil activo"})`
          : `Desconectado (${pub.voiceStudioUrl}) — inicia debpalash/VoiceStudio o ajusta la URL`,
      },
      {
        id: "piper",
        name: "Piper TTS (Ligero ONNX)",
        kind: "local",
        available: true,
        ready: (piperCli || pyMods.piper) && piperAnyInstalled,
        pythonPackageInstalled: piperCli || pyMods.piper,
        pipInstallHint: "pip install piper-tts",
        detail:
          (piperCli || pyMods.piper) && piperAnyInstalled
            ? `${piperModels.filter((m) => m.installed).length} voz(ces) ONNX descargadas y listas`
            : piperAnyInstalled
              ? "Voces descargadas — falta instalar runtime (pip install piper-tts)"
              : "Descarga una voz ligera (~63 MB) para sintetizar 100% offline",
        installableModels: piperModels,
      },
      {
        id: "kokoro",
        name: "Kokoro-82M (Neural ONNX)",
        kind: "local",
        available: true,
        ready: pyMods.kokoro_onnx && kokoroReadyFiles,
        pythonPackageInstalled: pyMods.kokoro_onnx,
        pipInstallHint: "pip install kokoro-onnx soundfile",
        detail:
          pyMods.kokoro_onnx && kokoroReadyFiles
            ? "Kokoro-82M ONNX v1.0 listo (Español + Inglés)"
            : kokoroReadyFiles
              ? "Modelo descargado — falta runtime (pip install kokoro-onnx)"
              : "Descarga Kokoro-82M ONNX (modelo + voces) en 1 clic",
        installableModels: [
          {
            id: "kokoro-v1.0",
            name: "Kokoro-82M v1.0 (ONNX + Voces ES/EN)",
            language: "es/en",
            sizeLabel: "~335 MB",
            installed: kokoroReadyFiles,
          },
        ],
      },
      {
        id: "openai",
        name: "OpenAI / Compatible TTS",
        kind: "cloud",
        available: true,
        ready: pub.hasOpenaiKey || !pub.openaiBaseUrl.includes("api.openai.com"),
        requiresApiKey: true,
        detail: pub.hasOpenaiKey
          ? `Listo · ${pub.openaiModel} (${pub.openaiBaseUrl})`
          : "Configura tu API key o URL local compatible con /v1/audio/speech",
      },
      {
        id: "custom_api",
        name: "API HTTP Personalizada",
        kind: "cloud",
        available: true,
        ready: Boolean(pub.customApiUrl),
        detail: pub.customApiUrl
          ? `Endpoint: ${pub.customApiUrl}`
          : "Conecta Cartesia, Fish Audio, MiniMax o tu propio servidor HTTP",
      },
    ];

    return { config: pub, providers };
  }

  async listVoices(provider: TtsProviderId, refresh = false): Promise<{ voices: TtsVoiceInfo[]; warning?: string }> {
    const stored = await this.readStoredConfig();
    const pub = await this.getPublicConfig();

    switch (provider) {
      case "windows_sapi":
        return { voices: await this.listWindowsSapiVoices(refresh) };

      case "elevenlabs": {
        const key = stored.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
        if (!key) {
          return {
            voices: ELEVENLABS_FALLBACK_VOICES,
            warning: "Configura tu API key de ElevenLabs para cargar tus voces y clones personales.",
          };
        }
        try {
          const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
            headers: { "xi-api-key": key, Accept: "application/json" },
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) {
            return {
              voices: ELEVENLABS_FALLBACK_VOICES,
              warning: `ElevenLabs respondió HTTP ${res.status} al listar voces.`,
            };
          }
          const data = (await res.json()) as {
            voices?: {
              voice_id: string;
              name: string;
              preview_url?: string;
              labels?: Record<string, string>;
              description?: string;
            }[];
          };
          const voices: TtsVoiceInfo[] = (data.voices ?? []).map((v) => ({
            id: v.voice_id,
            name: v.name,
            language: v.labels?.language ?? v.labels?.accent ?? "multi",
            gender: v.labels?.gender,
            provider: "elevenlabs",
            previewUrl: v.preview_url,
            description: v.description,
          }));
          return { voices: voices.length > 0 ? voices : ELEVENLABS_FALLBACK_VOICES };
        } catch (err) {
          return {
            voices: ELEVENLABS_FALLBACK_VOICES,
            warning: `No se pudo conectar con ElevenLabs: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      }

      case "voicestudio": {
        const probe = await this.probeVoiceStudio(pub.voiceStudioUrl, stored.voiceStudioApiKey);
        if (!probe.online) {
          return {
            voices: [
              { id: "default", name: "Voz predeterminada de VoiceStudio", language: "es", provider: "voicestudio" },
            ],
            warning: `VoiceStudio no respondió en ${pub.voiceStudioUrl}. Inicia tu servidor local o ajusta la URL.`,
          };
        }
        return {
          voices:
            probe.voices.length > 0
              ? probe.voices
              : [{ id: "default", name: "Voz activa en VoiceStudio", language: "es", provider: "voicestudio" }],
        };
      }

      case "piper": {
        const piperDir = path.join(this.modelsDir, "piper");
        const voices: TtsVoiceInfo[] = await Promise.all(
          PIPER_CATALOG.map(async (m) => ({
            id: m.id,
            name: m.name,
            language: m.language,
            gender: m.gender,
            provider: "piper" as const,
            installed: await fileExists(path.join(piperDir, `${m.id}.onnx`)),
            downloadable: true,
            sizeLabel: m.sizeLabel,
          })),
        );
        try {
          const entries = await fs.readdir(piperDir);
          for (const f of entries) {
            if (!f.endsWith(".onnx")) continue;
            const id = f.slice(0, -5);
            if (!voices.some((v) => v.id === id)) {
              voices.unshift({
                id,
                name: `${id} (Local)`,
                language: id.slice(0, 5),
                provider: "piper",
                installed: true,
              });
            }
          }
        } catch {
          // Directory not created yet
        }
        return { voices };
      }

      case "kokoro": {
        const kokoroDir = path.join(this.modelsDir, "kokoro");
        const ready =
          (await fileExists(path.join(kokoroDir, "kokoro-v1.0.onnx"))) &&
          (await fileExists(path.join(kokoroDir, "voices-v1.0.bin")));
        return {
          voices: KOKORO_VOICES.map((v) => ({ ...v, installed: ready, downloadable: true })),
        };
      }

      case "openai":
        return { voices: OPENAI_VOICES };

      case "custom_api":
        return {
          voices: [
            { id: "default", name: "default (usa el ID que pida tu API)", language: "es", provider: "custom_api" },
          ],
        };
    }
  }

  private async ensurePythonPackage(pkgName: "kokoro-onnx" | "piper-tts", importName: "kokoro_onnx" | "piper"): Promise<void> {
    const mods = await this.checkPythonTtsModules(true);
    if ((importName === "kokoro_onnx" && mods.kokoro_onnx) || (importName === "piper" && mods.piper)) {
      return;
    }
    try {
      const { bin } = await this.resolvePythonRunner();
      await execFileAsync(bin, ["-m", "pip", "install", "--user", pkgName], {
        timeout: 180_000,
        maxBuffer: 8 * 1024 * 1024,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });
      this.cachedPyModules = null;
      await this.checkPythonTtsModules(true);
    } catch {
      // Non-fatal here; synthesis will report a clear install hint if still missing
    }
  }

  async installLocalModel(
    provider: "piper" | "kokoro",
    modelId: string,
  ): Promise<{ installed: boolean; modelId: string; totalBytes: number; path: string }> {
    if (provider === "piper") {
      const entry = PIPER_CATALOG.find((m) => m.id === modelId);
      if (!entry) {
        throw Object.assign(new Error(`Voz Piper desconocida: '${modelId}'`), { statusCode: 400 });
      }
      const dir = path.join(this.modelsDir, "piper");
      const onnxPath = path.join(dir, `${entry.id}.onnx`);
      const jsonPath = path.join(dir, `${entry.id}.onnx.json`);
      const [b1, b2] = await Promise.all([
        downloadFileAtomic(entry.onnxUrl, onnxPath),
        downloadFileAtomic(entry.jsonUrl, jsonPath),
      ]);
      await this.ensurePythonPackage("piper-tts", "piper");
      return { installed: true, modelId: entry.id, totalBytes: b1 + b2, path: onnxPath };
    }

    const dir = path.join(this.modelsDir, "kokoro");
    const modelPath = path.join(dir, "kokoro-v1.0.onnx");
    const voicesPath = path.join(dir, "voices-v1.0.bin");
    const b1 = await downloadFileAtomic(`${KOKORO_RELEASE_BASE}/kokoro-v1.0.onnx`, modelPath);
    const b2 = await downloadFileAtomic(`${KOKORO_RELEASE_BASE}/voices-v1.0.bin`, voicesPath);
    await this.ensurePythonPackage("kokoro-onnx", "kokoro_onnx");
    return { installed: true, modelId: "kokoro-v1.0", totalBytes: b1 + b2, path: dir };
  }

  async synthesizeToWav(
    req: TtsSynthesizeRequest,
    outWavPath: string,
  ): Promise<{ durationSec: number; providerLabel: string }> {
    const text = req.text.trim();
    if (!text) {
      throw Object.assign(new Error("El texto a convertir en audio está vacío"), { statusCode: 400 });
    }
    const stored = await this.readStoredConfig();
    const pub = await this.getPublicConfig();
    const speed = Math.max(0.5, Math.min(2.0, req.speed ?? 1.0));
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "storia-tts-"));

    try {
      switch (req.provider) {
        case "windows_sapi": {
          const ps = await this.getPowerShellBin();
          if (!ps) {
            throw Object.assign(new Error("Windows SAPI (PowerShell) no disponible"), { statusCode: 503 });
          }
          const txtPath = path.join(tmpDir, "input.txt");
          const rawWav = path.join(tmpDir, "sapi.wav");
          const ps1Path = path.join(tmpDir, "speak.ps1");
          await fs.writeFile(txtPath, text, "utf8");

          const sapiRate = Math.max(-10, Math.min(10, Math.round((speed - 1.0) * 6)));
          const voiceName = (req.voiceId ?? "").replace(/'/g, "''");
          const winTxt = toWindowsPathIfWsl(txtPath);
          const winWav = toWindowsPathIfWsl(rawWav);

          const psScript = [
            "Add-Type -AssemblyName System.Speech",
            "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
            voiceName ? `try { $synth.SelectVoice('${voiceName}') } catch {}` : "",
            `$synth.Rate = ${sapiRate}`,
            `$synth.SetOutputToWaveFile('${winWav.replace(/'/g, "''")}')`,
            `$txt = [System.IO.File]::ReadAllText('${winTxt.replace(/'/g, "''")}', [System.Text.Encoding]::UTF8)`,
            "$synth.Speak($txt)",
            "$synth.Dispose()",
          ]
            .filter(Boolean)
            .join("\r\n");

          await fs.writeFile(ps1Path, psScript, "utf8");
          await execFileAsync(
            ps,
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", toWindowsPathIfWsl(ps1Path)],
            { timeout: 60_000 },
          );

          const durationSec = await convertToStudioWav(rawWav, outWavPath);
          return { durationSec, providerLabel: `Windows SAPI (${req.voiceId || "default"})` };
        }

        case "elevenlabs": {
          const key = stored.elevenlabsApiKey || process.env.ELEVENLABS_API_KEY;
          if (!key) {
            throw Object.assign(new Error("Configura tu API key de ElevenLabs antes de sintetizar"), { statusCode: 400 });
          }
          const voiceId = req.voiceId || ELEVENLABS_FALLBACK_VOICES[0]!.id;
          const modelId = req.modelId || pub.elevenlabsModel;
          const res = await fetch(
            `${ELEVENLABS_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`,
            {
              method: "POST",
              headers: {
                "xi-api-key": key,
                "Content-Type": "application/json",
                Accept: "audio/mpeg",
              },
              body: JSON.stringify({
                text,
                model_id: modelId,
                voice_settings: {
                  stability: req.stability ?? 0.5,
                  similarity_boost: req.similarityBoost ?? 0.78,
                  style: req.style ?? 0.15,
                  use_speaker_boost: true,
                  speed,
                },
              }),
              signal: AbortSignal.timeout(60_000),
            },
          );
          if (!res.ok) {
            const errTxt = redactSecrets(await res.text().catch(() => ""), [key]);
            throw Object.assign(
              new Error(`ElevenLabs HTTP ${res.status}: ${errTxt.slice(0, 220)}`),
              { statusCode: 502 },
            );
          }
          const rawMp3 = path.join(tmpDir, "el.mp3");
          await fs.writeFile(rawMp3, Buffer.from(await res.arrayBuffer()));
          const durationSec = await convertToStudioWav(rawMp3, outWavPath);
          return { durationSec, providerLabel: `ElevenLabs (${modelId})` };
        }

        case "voicestudio": {
          const baseUrl = normalizeSafeHttpUrl(req.voiceStudioUrl || pub.voiceStudioUrl);
          if (!baseUrl) {
            throw Object.assign(new Error("Configura la URL local de VoiceStudio"), { statusCode: 400 });
          }
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "audio/*, application/json",
          };
          // Prevent credential exfiltration: only attach stored key if target origin matches saved URL
          const sameOrigin = !req.voiceStudioUrl || extractOriginSafe(baseUrl) === extractOriginSafe(pub.voiceStudioUrl);
          if (stored.voiceStudioApiKey && sameOrigin) {
            headers["Authorization"] = `Bearer ${stored.voiceStudioApiKey}`;
          }

          const payload = {
            text,
            input: text,
            voice: req.voiceId || "default",
            voice_id: req.voiceId || "default",
            speaker: req.voiceId || "default",
            language: req.language || "es",
            speed,
          };

          const endpoints = ["/api/tts", "/tts", "/synthesize", "/v1/audio/speech", "/api/generate"];
          let audioBuf: Buffer | null = null;
          let ext = ".wav";
          let lastErr = "VoiceStudio no respondió en ninguno de los endpoints esperados";

          for (const ep of endpoints) {
            try {
              const res = await fetch(`${baseUrl}${ep}`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(90_000),
              });
              if (!res.ok) {
                lastErr = `${ep} -> HTTP ${res.status}`;
                continue;
              }
              const ct = (res.headers.get("content-type") ?? "").toLowerCase();
              if (ct.includes("audio/") || ct.includes("octet-stream")) {
                audioBuf = Buffer.from(await res.arrayBuffer());
                ext = ct.includes("mpeg") || ct.includes("mp3") ? ".mp3" : ct.includes("ogg") ? ".ogg" : ".wav";
                break;
              }
              if (ct.includes("application/json")) {
                const json = (await res.json()) as Record<string, unknown>;
                const b64 = json.audio_base64 ?? json.audio ?? json.data;
                const audioUrl = json.audio_url ?? json.url;
                if (typeof b64 === "string" && b64.length > 64) {
                  audioBuf = Buffer.from(b64.replace(/^data:audio\/[^;]+;base64,/, ""), "base64");
                  break;
                }
                if (typeof audioUrl === "string") {
                  const full = audioUrl.startsWith("http") ? audioUrl : `${baseUrl}/${audioUrl.replace(/^\/+/, "")}`;
                  const dl = await fetch(full, { signal: AbortSignal.timeout(30_000) });
                  if (dl.ok) {
                    audioBuf = Buffer.from(await dl.arrayBuffer());
                    break;
                  }
                }
              }
            } catch (e) {
              lastErr = e instanceof Error ? e.message : String(e);
            }
          }

          if (!audioBuf || audioBuf.byteLength === 0) {
            throw Object.assign(
              new Error(`No se pudo sintetizar con VoiceStudio (${baseUrl}): ${lastErr}`),
              { statusCode: 502 },
            );
          }

          const rawFile = path.join(tmpDir, `vs${ext}`);
          await fs.writeFile(rawFile, audioBuf);
          const durationSec = await convertToStudioWav(rawFile, outWavPath);
          return { durationSec, providerLabel: `VoiceStudio (${req.voiceId || "local"})` };
        }

        case "piper": {
          const voiceId = req.voiceId || PIPER_CATALOG[0]!.id;
          const modelPath = path.join(this.modelsDir, "piper", `${voiceId}.onnx`);
          if (!(await fileExists(modelPath))) {
            throw Object.assign(
              new Error(`La voz Piper '${voiceId}' aún no está descargada. Pulsa 'Descargar' en el panel TTS.`),
              { statusCode: 400 },
            );
          }
          const rawWav = path.join(tmpDir, "piper.wav");
          if (await this.hasPiperCli()) {
            await new Promise<void>((resolve, reject) => {
              const child = execFile(
                "piper",
                [
                  "--model", modelPath,
                  "--output_file", rawWav,
                  "--length_scale", String((1 / speed).toFixed(3)),
                ],
                { timeout: 60_000 },
                (err) => (err ? reject(err) : resolve()),
              );
              child.stdin?.write(text);
              child.stdin?.end();
            });
          } else {
            await this.runLocalPythonTts({
              engine: "piper",
              text,
              modelPath,
              speed,
              outPath: rawWav,
            });
          }
          const durationSec = await convertToStudioWav(rawWav, outWavPath);
          return { durationSec, providerLabel: `Piper ONNX (${voiceId})` };
        }

        case "kokoro": {
          const kokoroDir = path.join(this.modelsDir, "kokoro");
          const rawWav = path.join(tmpDir, "kokoro.wav");
          await this.runLocalPythonTts({
            engine: "kokoro",
            text,
            voice: req.voiceId || "ef_dora",
            language: req.language || "es",
            speed,
            modelDir: kokoroDir,
            outPath: rawWav,
          });
          const durationSec = await convertToStudioWav(rawWav, outWavPath);
          return { durationSec, providerLabel: `Kokoro-82M (${req.voiceId || "ef_dora"})` };
        }

        case "openai": {
          const baseUrl = pub.openaiBaseUrl.replace(/\/+$/, "");
          const key = stored.openaiApiKey || process.env.OPENAI_API_KEY || "";
          if (baseUrl.includes("api.openai.com") && !key) {
            throw Object.assign(new Error("Configura tu API key de OpenAI TTS"), { statusCode: 400 });
          }
          const model = req.modelId || pub.openaiModel;
          const voice = req.voiceId || "coral";
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (key) headers["Authorization"] = `Bearer ${key}`;

          const res = await fetch(`${baseUrl}/audio/speech`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model,
              input: text,
              voice,
              speed,
              response_format: "wav",
            }),
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            const errTxt = redactSecrets(await res.text().catch(() => ""), [key]);
            throw Object.assign(new Error(`OpenAI TTS HTTP ${res.status}: ${errTxt.slice(0, 200)}`), { statusCode: 502 });
          }
          const rawFile = path.join(tmpDir, "oai.wav");
          await fs.writeFile(rawFile, Buffer.from(await res.arrayBuffer()));
          const durationSec = await convertToStudioWav(rawFile, outWavPath);
          return { durationSec, providerLabel: `OpenAI TTS (${voice})` };
        }

        case "custom_api": {
          const url = normalizeSafeHttpUrl(req.customApiUrl || pub.customApiUrl);
          if (!url) {
            throw Object.assign(new Error("Configura la URL de tu API TTS personalizada"), { statusCode: 400 });
          }
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "audio/*, application/json",
          };
          // Prevent credential exfiltration: only send stored API key to the configured origin
          const sameCustomOrigin = !req.customApiUrl || extractOriginSafe(url) === extractOriginSafe(pub.customApiUrl);
          if (stored.customApiKey && sameCustomOrigin) {
            const hName = pub.customApiHeaderName || "Authorization";
            headers[hName] =
              hName.toLowerCase() === "authorization" && !/^bearer\s+/i.test(stored.customApiKey)
                ? `Bearer ${stored.customApiKey}`
                : stored.customApiKey;
          }

          const escapedText = JSON.stringify(text).slice(1, -1);
          const escapedVoice = JSON.stringify(req.voiceId || "default").slice(1, -1);
          const escapedLang = JSON.stringify(req.language || "es").slice(1, -1);
          const bodyStr = pub.customApiBodyTemplate
            .replace(/\{\{text\}\}/g, escapedText)
            .replace(/\{\{voice\}\}/g, escapedVoice)
            .replace(/\{\{language\}\}/g, escapedLang)
            .replace(/\{\{speed\}\}/g, String(speed));

          const res = await fetch(url, {
            method: "POST",
            headers,
            body: bodyStr,
            signal: AbortSignal.timeout(60_000),
          });
          if (!res.ok) {
            const errTxt = redactSecrets(await res.text().catch(() => ""), [stored.customApiKey]);
            throw Object.assign(new Error(`Custom TTS API HTTP ${res.status}: ${errTxt.slice(0, 200)}`), { statusCode: 502 });
          }

          const ct = (res.headers.get("content-type") ?? "").toLowerCase();
          let buf: Buffer;
          let ext = ".wav";
          if (ct.includes("application/json")) {
            const json = (await res.json()) as Record<string, unknown>;
            const b64 = json.audio_base64 ?? json.audio ?? json.data;
            if (typeof b64 !== "string") {
              throw Object.assign(new Error("La API devolvió JSON sin campo 'audio_base64' / 'audio'"), { statusCode: 502 });
            }
            buf = Buffer.from(b64.replace(/^data:audio\/[^;]+;base64,/, ""), "base64");
          } else {
            buf = Buffer.from(await res.arrayBuffer());
            if (ct.includes("mpeg") || ct.includes("mp3")) ext = ".mp3";
            else if (ct.includes("ogg")) ext = ".ogg";
          }

          const rawFile = path.join(tmpDir, `custom${ext}`);
          await fs.writeFile(rawFile, buf);
          const durationSec = await convertToStudioWav(rawFile, outWavPath);
          return { durationSec, providerLabel: "Custom TTS API" };
        }
      }
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runLocalPythonTts(payload: Record<string, unknown>): Promise<void> {
    const { bin, translatePaths } = await this.resolvePythonRunner();
    const fixedPayload = { ...payload };
    if (translatePaths) {
      for (const k of ["outPath", "modelPath", "modelDir"]) {
        if (typeof fixedPayload[k] === "string") {
          fixedPayload[k] = toWindowsPathIfWsl(fixedPayload[k] as string);
        }
      }
    }
    const reqFile = path.join(os.tmpdir(), `storia-tts-req-${Date.now()}.json`);
    await fs.writeFile(reqFile, JSON.stringify(fixedPayload), "utf8");
    try {
      const scriptArg = translatePaths ? toWindowsPathIfWsl(LOCAL_TTS_SCRIPT) : LOCAL_TTS_SCRIPT;
      const reqArg = translatePaths ? toWindowsPathIfWsl(reqFile) : reqFile;
      try {
        const { stdout } = await execFileAsync(bin, [scriptArg, reqArg], {
          timeout: 120_000,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        });
        const last = stdout.trim().split(/\r?\n/).pop() || "{}";
        const parsed = JSON.parse(last) as { ok?: boolean; error?: string };
        if (parsed.error) {
          throw Object.assign(new Error(parsed.error), { statusCode: 400 });
        }
      } catch (err) {
        const execErr = err as { stdout?: string; stderr?: string; message?: string; statusCode?: number };
        if (execErr.statusCode) throw err;
        const outLine = (execErr.stdout ?? "").trim().split(/\r?\n/).pop() || "";
        let parsedError: string | undefined;
        try {
          const parsed = JSON.parse(outLine) as { error?: string };
          if (parsed.error) parsedError = parsed.error;
        } catch {
          // Not JSON
        }
        if (parsedError) {
          throw Object.assign(new Error(parsedError), { statusCode: 400 });
        }
        throw Object.assign(
          new Error(
            execErr.stderr?.trim().slice(0, 400) ||
              outLine.slice(0, 300) ||
              execErr.message ||
              "Error ejecutando motor TTS local",
          ),
          { statusCode: 500 },
        );
      }
    } finally {
      await fs.rm(reqFile, { force: true }).catch(() => {});
    }
  }
}
