import React from "react";
import { Award, AudioLines, BookOpen, Shapes, Type } from "lucide-react";

interface CreditEntry {
  name: string;
  creator: string;
  license: string;
  usage: string;
}

const BUNDLED_FONT_CREDITS: CreditEntry[] = [
  {
    name: "Anton",
    creator: "Vernon Adams",
    license: "SIL OFL 1.1",
    usage: "Tipografía incluida offline para titulares e impacto.",
  },
  {
    name: "Archivo Black",
    creator: "Omnibus-Type",
    license: "SIL OFL 1.1",
    usage: "Tipografía incluida offline para títulos y subtítulos de alto contraste.",
  },
  {
    name: "Caveat",
    creator: "Pablo Impallari & Rodrigo Fuenzalida",
    license: "SIL OFL 1.1",
    usage: "Tipografía manuscrita incluida offline para notas y estilo editorial.",
  },
  {
    name: "Noto Sans",
    creator: "Google",
    license: "SIL OFL 1.1",
    usage: "Tipografía universal incluida offline con cobertura multilingüe.",
  },
  {
    name: "Nunito",
    creator: "Vernon Adams, Cyreal & Jacques Le Bailly",
    license: "SIL OFL 1.1",
    usage: "Tipografía redondeada incluida offline para subtítulos limpios.",
  },
];

const GOOGLE_FONT_FAMILIES: { family: string; author: string; license: string }[] = [
  { family: "Bebas Neue", author: "Ryoichi Tsunekawa (Dharma Type)", license: "SIL OFL 1.1" },
  { family: "Oswald", author: "Vernon Adams, Kalapi Gajjar & Cyreal", license: "SIL OFL 1.1" },
  { family: "Bangers", author: "Vernon Adams", license: "SIL OFL 1.1" },
  { family: "Rubik Mono One", author: "Hubert & Fischer / Philipp Hubert", license: "SIL OFL 1.1" },
  { family: "Black Ops One", author: "James Grieshaber", license: "SIL OFL 1.1" },
  { family: "Righteous", author: "Astigmatic", license: "SIL OFL 1.1" },
  { family: "Figtree", author: "Erik Kennedy", license: "SIL OFL 1.1" },
  { family: "Inter", author: "Rasmus Andersson", license: "SIL OFL 1.1" },
  { family: "Montserrat", author: "Julieta Ulanovsky, Sol Matas, Juan Pablo del Peral & Jacques Le Bailly", license: "SIL OFL 1.1" },
  { family: "Poppins", author: "Indian Type Foundry & Jonny Pinhorn", license: "SIL OFL 1.1" },
  { family: "Space Grotesk", author: "Florian Karsten", license: "SIL OFL 1.1" },
  { family: "Outfit", author: "Rodrigo Fuenzalida & On Brand", license: "SIL OFL 1.1" },
  { family: "Syne", author: "Bonjour Monde, Lucas Descroix & Arman Mohtadji", license: "SIL OFL 1.1" },
  { family: "Permanent Marker", author: "Font Diner", license: "Apache 2.0" },
  { family: "Pacifico", author: "Vernon Adams, Jacques Le Bailly, Botjo Nikoltchev & Ani Petrova", license: "SIL OFL 1.1" },
  { family: "Dancing Script", author: "Impallari Type", license: "SIL OFL 1.1" },
  { family: "Satisfy", author: "Sideshow", license: "Apache 2.0" },
  { family: "Shadows Into Light", author: "Kimberly Geswein", license: "SIL OFL 1.1" },
  { family: "Playfair Display", author: "Claus Eggers Sørensen", license: "SIL OFL 1.1" },
  { family: "Cinzel", author: "Natanael Gama", license: "SIL OFL 1.1" },
  { family: "Merriweather", author: "Sorkin Type", license: "SIL OFL 1.1" },
  { family: "Abril Fatface", author: "TypeTogether", license: "SIL OFL 1.1" },
  { family: "Press Start 2P", author: "CodeMan38", license: "SIL OFL 1.1" },
  { family: "Silkscreen", author: "Jason Kottke", license: "SIL OFL 1.1" },
  { family: "VT323", author: "Peter Hull", license: "SIL OFL 1.1" },
  { family: "JetBrains Mono", author: "JetBrains", license: "SIL OFL 1.1" },
];

const MEDIA_LIBRARY_CREDITS: CreditEntry[] = [
  {
    name: "Openverse (WordPress / Creative Commons)",
    creator: "Openverse & creadores originales",
    license: "CC0 / CC-BY / Dominio Público",
    usage: "Catálogo integrado de vectores SVG, música y efectos de sonido con registro automático en credits.txt.",
  },
  {
    name: "Iconify Vector Hub",
    creator: "Vjacheslav Trushkin & autores de colecciones de íconos",
    license: "MIT / Apache 2.0 / CC0 / CC-BY",
    usage: "Índice de íconos vectoriales SVG accesibles desde la biblioteca integrada.",
  },
  {
    name: "Game-Icons.net",
    creator: "Lorc, Delapouite, Skoll y colaboradores de Game-Icons.net",
    license: "CC-BY 3.0",
    usage: "Colección de sprites e íconos vectoriales para juegos y narrativa.",
  },
  {
    name: "Pixelarticons · Streamline Pixel · Memory Icons",
    creator: "Gerrit Halfmann (Pixelarticons), Streamline & Pictogrammers",
    license: "MIT / CC-BY 4.0",
    usage: "Íconos y sprites pixel art en la categoría Game & Pixel Art Sprites.",
  },
  {
    name: "OpenMoji",
    creator: "HfG Schwäbisch Gmünd & colaboradores de OpenMoji",
    license: "CC-BY-SA 4.0",
    usage: "Props y emojis vectoriales estilizados en la biblioteca de props.",
  },
  {
    name: "Google Noto Color Emoji · Twemoji · Fluent Emoji",
    creator: "Google · Twitter / Jdecked · Microsoft",
    license: "Apache 2.0 / CC-BY 4.0 / MIT",
    usage: "Ilustraciones vectoriales y emojis a color disponibles en OpenMoji & Color Props.",
  },
  {
    name: "Wikimedia Commons",
    creator: "Comunidad Wikimedia y autores acreditados por archivo",
    license: "CC0 / CC-BY / CC-BY-SA / Dominio Público",
    usage: "Búsqueda e importación de ilustraciones, grabados y recursos multimedia.",
  },
  {
    name: "Internet Archive Audio",
    creator: "Internet Archive y autores acreditados por grabación",
    license: "CC0 / CC-BY / Dominio Público",
    usage: "Efectos de sonido y música de archivo libres de derechos.",
  },
];

const VOICE_MODEL_CREDITS: CreditEntry[] = [
  {
    name: "Piper Neural Voices",
    creator: "Rhasspy / OHF-Voice & contribuidores de datasets de voz",
    license: "MIT / Licencias por modelo de voz",
    usage: "Modelos de síntesis de voz neuronales descargables para narración offline.",
  },
  {
    name: "Kokoro-82M (kokoro-onnx)",
    creator: "hexgrad & thewh1teagle",
    license: "Apache 2.0",
    usage: "Modelo neuronal multilingüe descargable para síntesis de voz offline.",
  },
  {
    name: "Whisper / faster-whisper",
    creator: "OpenAI (pesos Whisper) & SYSTRAN (faster-whisper)",
    license: "MIT",
    usage: "Modelos opcionales de transcripción automática offline para generar subtítulos.",
  },
  {
    name: "Microsoft Windows Speech API (SAPI)",
    creator: "Microsoft Corporation",
    license: "Componente nativo de Windows",
    usage: "Integración con las voces locales instaladas en el sistema operativo del usuario.",
  },
];

export const CreditsSettingsPanel: React.FC = () => {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-[14px] font-bold flex items-center gap-2 mb-1">
          <Award size={15} style={{ color: "var(--accent-primary)" }} />
          Créditos, Tipografías y Atribuciones
        </h3>
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Storia Studio reconoce y agradece a los autores, fundiciones tipográficas, colecciones multimedia y creadores de modelos de voz cuyos recursos se integran o enlazan desde la aplicación. Todos los recursos con licencia <strong>CC-BY / CC-BY-SA</strong> importados en un proyecto también se registran automáticamente en el archivo <code className="font-mono-code">credits.txt</code> del proyecto.
        </p>
      </div>

      {/* 1. Tipografías incluidas offline */}
      <section
        className="rounded-xl p-3.5 flex flex-col gap-2.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-bold flex items-center gap-1.5">
            <Type size={13} style={{ color: "var(--accent-primary)" }} />
            Tipografías incluidas offline ({BUNDLED_FONT_CREDITS.length})
          </h4>
          <span
            className="text-[9.5px] font-mono-code px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
          >
            SIL OFL 1.1
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {BUNDLED_FONT_CREDITS.map((item) => (
            <div
              key={item.name}
              className="rounded-lg p-2.5 bg-black/20 border"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold">{item.name}</span>
                <span className="text-[9.5px] font-mono-code" style={{ color: "var(--accent-teal)" }}>
                  {item.license}
                </span>
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Autor: {item.creator}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {item.usage}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Catálogo integrado de Google Fonts */}
      <section
        className="rounded-xl p-3.5 flex flex-col gap-2.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-[12px] font-bold flex items-center gap-1.5">
            <BookOpen size={13} style={{ color: "var(--accent-teal)" }} />
            Catálogo de Google Fonts integrado ({GOOGLE_FONT_FAMILIES.length} familias)
          </h4>
          <span
            className="text-[9.5px] font-mono-code px-2 py-0.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
          >
            SIL OFL 1.1 · Apache 2.0
          </span>
        </div>
        <p className="text-[10.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
          Las siguientes familias tipográficas se cargan bajo demanda a través de <strong>Google Fonts</strong> respetando los derechos de sus respectivas fundiciones y diseñadores:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {GOOGLE_FONT_FAMILIES.map((f) => (
            <div
              key={f.family}
              className="rounded-lg px-2.5 py-1.5 bg-black/20 flex items-center justify-between gap-2 text-[10.5px]"
            >
              <div className="min-w-0">
                <span className="font-semibold">{f.family}</span>
                <span className="ml-1.5" style={{ color: "var(--text-muted)" }}>
                  — {f.author}
                </span>
              </div>
              <span className="text-[9px] font-mono-code shrink-0" style={{ color: "var(--text-secondary)" }}>
                {f.license}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Bibliotecas de vectores, íconos, emojis y audio */}
      <section
        className="rounded-xl p-3.5 flex flex-col gap-2.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <h4 className="text-[12px] font-bold flex items-center gap-1.5">
          <Shapes size={13} style={{ color: "var(--accent-gold)" }} />
          Bibliotecas de vectores, íconos, emojis y audio
        </h4>
        <div className="flex flex-col gap-2">
          {MEDIA_LIBRARY_CREDITS.map((item) => (
            <div
              key={item.name}
              className="rounded-lg p-2.5 bg-black/20 border"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[11.5px] font-bold">{item.name}</span>
                <span className="text-[9.5px] font-mono-code" style={{ color: "var(--accent-teal)" }}>
                  {item.license}
                </span>
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                Crédito: {item.creator}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {item.usage}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Modelos de voz y transcripción */}
      <section
        className="rounded-xl p-3.5 flex flex-col gap-2.5"
        style={{ background: "var(--glass-hover)", border: "1px solid var(--border-subtle)" }}
      >
        <h4 className="text-[12px] font-bold flex items-center gap-1.5">
          <AudioLines size={13} style={{ color: "var(--accent-primary)" }} />
          Modelos de voz (TTS) y transcripción (ASR)
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VOICE_MODEL_CREDITS.map((item) => (
            <div
              key={item.name}
              className="rounded-lg p-2.5 bg-black/20 border"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-bold">{item.name}</span>
                <span className="text-[9.5px] font-mono-code" style={{ color: "var(--accent-teal)" }}>
                  {item.license}
                </span>
              </div>
              <div className="text-[10.5px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {item.creator}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                {item.usage}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div
        className="rounded-xl px-3.5 py-2.5 text-[10.5px] leading-relaxed"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        <strong>Nota de atribución para creadores:</strong> Al publicar videos que incluyan recursos importados bajo licencias <strong>CC-BY</strong> o <strong>CC-BY-SA</strong> (por ejemplo de Openverse, Game-Icons, OpenMoji, Wikimedia Commons o Internet Archive), conserva la atribución listada en el archivo <code className="font-mono-code">credits.txt</code> generado automáticamente dentro de la carpeta de tu proyecto.
      </div>
    </div>
  );
};
