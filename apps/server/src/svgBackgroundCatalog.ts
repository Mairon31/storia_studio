export interface BuiltinSvgBackground {
  id: string;
  name: string;
  category: "backgrounds" | "overlays";
  tags: string[];
  svg: string;
}

/**
 * 18 built-in editable vector SVG backgrounds & overlays for Storia Studio.
 * Every background is valid standalone SVG markup that can be edited live
 * in Storia Studio's SVG Code Editor (manually or via MCP).
 */
export const BUILTIN_SVG_BACKGROUNDS: BuiltinSvgBackground[] = [
  {
    id: "svgbg:editorial_paper_grid",
    name: "Editorial Paper Grid",
    category: "backgrounds",
    tags: ["paper", "grid", "editorial", "explainer", "whiteboard", "minimal", "clean"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#cbd5e1" stroke-width="1.2" opacity="0.55"/>
    </pattern>
  </defs>
  <rect width="1080" height="1920" fill="#f7f4ec"/>
  <rect width="1080" height="1920" fill="url(#g)"/>
  <rect x="44" y="44" width="992" height="1832" rx="28" fill="none" stroke="#1e293b" stroke-width="3" opacity="0.18"/>
</svg>`,
  },
  {
    id: "svgbg:pastel_pink_minimal",
    name: "Pastel Pink Minimal",
    category: "backgrounds",
    tags: ["pastel", "pink", "minimal", "clean", "brand", "soft"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fde2eb"/>
      <stop offset="100%" stop-color="#f7c8d6"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <circle cx="920" cy="260" r="240" fill="#ffffff" opacity="0.28"/>
  <circle cx="140" cy="1640" r="310" fill="#ffffff" opacity="0.22"/>
</svg>`,
  },
  {
    id: "svgbg:midnight_studio",
    name: "Midnight Studio Dark",
    category: "backgrounds",
    tags: ["dark", "midnight", "studio", "minimal", "gradient", "sleek"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="rg" cx="50%" cy="32%" r="72%">
      <stop offset="0%" stop-color="#1e2942"/>
      <stop offset="65%" stop-color="#0e1320"/>
      <stop offset="100%" stop-color="#070910"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#rg)"/>
  <ellipse cx="540" cy="1620" rx="460" ry="90" fill="#38bdf8" opacity="0.08"/>
</svg>`,
  },
  {
    id: "svgbg:synthwave_grid_84",
    name: "Synthwave Sunset 84",
    category: "backgrounds",
    tags: ["synthwave", "retro", "80s", "neon", "grid", "sunset", "cyberpunk"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0d0424"/>
      <stop offset="55%" stop-color="#3b0764"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="100%" stop-color="#f43f5e"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1180" fill="url(#sky)"/>
  <circle cx="540" cy="860" r="240" fill="url(#sun)"/>
  <rect y="1140" width="1080" height="780" fill="#090418"/>
  <g stroke="#22d3ee" stroke-width="2.5" opacity="0.55">
    <line x1="0" y1="1200" x2="1080" y2="1200"/>
    <line x1="0" y1="1280" x2="1080" y2="1280"/>
    <line x1="0" y1="1390" x2="1080" y2="1390"/>
    <line x1="0" y1="1540" x2="1080" y2="1540"/>
    <line x1="0" y1="1730" x2="1080" y2="1730"/>
    <line x1="540" y1="1140" x2="540" y2="1920"/>
    <line x1="420" y1="1140" x2="120" y2="1920"/>
    <line x1="660" y1="1140" x2="960" y2="1920"/>
    <line x1="300" y1="1140" x2="-240" y2="1920"/>
    <line x1="780" y1="1140" x2="1320" y2="1920"/>
  </g>
</svg>`,
  },
  {
    id: "svgbg:cyberpunk_hud_blueprint",
    name: "Tech Blueprint HUD",
    category: "backgrounds",
    tags: ["tech", "blueprint", "hud", "cyber", "code", "engineering"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <pattern id="bp" width="60" height="60" patternUnits="userSpaceOnUse">
      <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#0ea5e9" stroke-width="1" opacity="0.24"/>
    </pattern>
  </defs>
  <rect width="1080" height="1920" fill="#061426"/>
  <rect width="1080" height="1920" fill="url(#bp)"/>
  <circle cx="540" cy="960" r="360" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="14 10" opacity="0.32"/>
  <path d="M 80 140 L 80 80 L 140 80 M 940 80 L 1000 80 L 1000 140 M 80 1780 L 80 1840 L 140 1840 M 940 1840 L 1000 1840 L 1000 1780" fill="none" stroke="#38bdf8" stroke-width="5" opacity="0.7"/>
</svg>`,
  },
  {
    id: "svgbg:podcast_warm_studio",
    name: "Podcast Warm Booth",
    category: "backgrounds",
    tags: ["podcast", "warm", "studio", "wood", "amber", "cozy", "audio"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#221916"/>
      <stop offset="100%" stop-color="#110c0a"/>
    </linearGradient>
    <radialGradient id="lamp" cx="50%" cy="28%" r="55%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#wall)"/>
  <rect width="1080" height="1920" fill="url(#lamp)"/>
  <g fill="#2e211b" opacity="0.7">
    <rect x="60" y="240" width="28" height="1100" rx="8"/>
    <rect x="112" y="240" width="28" height="1100" rx="8"/>
    <rect x="164" y="240" width="28" height="1100" rx="8"/>
    <rect x="888" y="240" width="28" height="1100" rx="8"/>
    <rect x="940" y="240" width="28" height="1100" rx="8"/>
    <rect x="992" y="240" width="28" height="1100" rx="8"/>
  </g>
  <rect y="1420" width="1080" height="500" fill="#1b1310"/>
</svg>`,
  },
  {
    id: "svgbg:comic_halftone_yellow",
    name: "Comic Burst Amarillo",
    category: "backgrounds",
    tags: ["comic", "pop", "yellow", "burst", "anime", "meme", "viral"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="cb" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </radialGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="13" cy="13" r="4" fill="#b45309" opacity="0.18"/>
    </pattern>
  </defs>
  <rect width="1080" height="1920" fill="url(#cb)"/>
  <rect width="1080" height="1920" fill="url(#dots)"/>
  <g fill="#ffffff" opacity="0.22">
    <polygon points="540,960 0,120 260,0"/>
    <polygon points="540,960 820,0 1080,140"/>
    <polygon points="540,960 1080,820 1080,1140"/>
    <polygon points="540,960 1080,1780 800,1920"/>
    <polygon points="540,960 260,1920 0,1760"/>
    <polygon points="540,960 0,1120 0,800"/>
  </g>
</svg>`,
  },
  {
    id: "svgbg:chalkboard_classroom",
    name: "Pizarra Clásica Verde",
    category: "backgrounds",
    tags: ["chalkboard", "school", "education", "history", "explainer", "green"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="ch" cx="50%" cy="45%" r="72%">
      <stop offset="0%" stop-color="#234434"/>
      <stop offset="100%" stop-color="#13261d"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#ch)"/>
  <rect x="24" y="24" width="1032" height="1872" rx="18" fill="none" stroke="#8b5a2b" stroke-width="26"/>
</svg>`,
  },
  {
    id: "svgbg:astral_cosmos_sky",
    name: "Cielo Astral Nocturno",
    category: "backgrounds",
    tags: ["space", "stars", "night", "cosmos", "sky", "history", "mystery"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="sp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050816"/>
      <stop offset="60%" stop-color="#12183a"/>
      <stop offset="100%" stop-color="#1d244f"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#sp)"/>
  <circle cx="840" cy="320" r="110" fill="#fef3c7" opacity="0.9"/>
  <circle cx="885" cy="295" r="98" fill="#090e26"/>
  <g fill="#ffffff" opacity="0.82">
    <circle cx="140" cy="220" r="3"/><circle cx="310" cy="140" r="2.5"/><circle cx="490" cy="290" r="4"/>
    <circle cx="220" cy="540" r="2"/><circle cx="670" cy="480" r="3.5"/><circle cx="940" cy="640" r="2.5"/>
    <circle cx="120" cy="880" r="3"/><circle cx="420" cy="760" r="2"/><circle cx="770" cy="910" r="3"/>
    <circle cx="260" cy="1180" r="2.5"/><circle cx="610" cy="1090" r="2"/><circle cx="890" cy="1260" r="3.5"/>
  </g>
</svg>`,
  },
  {
    id: "svgbg:forest_dusk_layers",
    name: "Montañas al Atardecer",
    category: "backgrounds",
    tags: ["nature", "mountains", "forest", "sunset", "landscape", "story"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="48%" stop-color="#9d4edd"/>
      <stop offset="100%" stop-color="#ff9e6d"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#dusk)"/>
  <circle cx="540" cy="980" r="170" fill="#fde68a" opacity="0.85"/>
  <path d="M0 1320 L210 1040 L430 1240 L700 990 L940 1210 L1080 1090 L1080 1920 L0 1920 Z" fill="#312e81" opacity="0.85"/>
  <path d="M0 1480 L280 1220 L560 1410 L840 1190 L1080 1380 L1080 1920 L0 1920 Z" fill="#1e1b4b"/>
  <path d="M0 1640 L340 1460 L690 1590 L1080 1420 L1080 1920 L0 1920 Z" fill="#0f1024"/>
</svg>`,
  },
  {
    id: "svgbg:newsroom_broadcast",
    name: "Estudio Broadcast Azul",
    category: "backgrounds",
    tags: ["news", "broadcast", "tv", "blue", "corporate", "infographic"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="nb" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#091a3a"/>
      <stop offset="100%" stop-color="#0f2f6b"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#nb)"/>
  <g stroke="#60a5fa" stroke-width="2" opacity="0.22" fill="none">
    <circle cx="540" cy="860" r="240"/>
    <circle cx="540" cy="860" r="390"/>
    <circle cx="540" cy="860" r="540"/>
  </g>
  <rect y="1660" width="1080" height="14" fill="#ef4444"/>
</svg>`,
  },
  {
    id: "svgbg:vintage_parchment",
    name: "Pergamino Histórico",
    category: "backgrounds",
    tags: ["history", "vintage", "parchment", "ancient", "documentary", "sepia"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <radialGradient id="pg" cx="50%" cy="48%" r="72%">
      <stop offset="0%" stop-color="#f5e6c8"/>
      <stop offset="70%" stop-color="#e3c999"/>
      <stop offset="100%" stop-color="#b89460"/>
    </radialGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#pg)"/>
  <rect x="48" y="48" width="984" height="1824" fill="none" stroke="#6b4b25" stroke-width="4" opacity="0.45"/>
  <rect x="64" y="64" width="952" height="1792" fill="none" stroke="#6b4b25" stroke-width="1.5" opacity="0.35"/>
</svg>`,
  },
  {
    id: "svgbg:aurora_emerald_glass",
    name: "Aurora Cristal Esmeralda",
    category: "backgrounds",
    tags: ["aurora", "emerald", "teal", "modern", "glass", "minimal"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <rect width="1080" height="1920" fill="#071117"/>
  <ellipse cx="260" cy="480" rx="440" ry="260" fill="#10b981" opacity="0.22"/>
  <ellipse cx="820" cy="1120" rx="460" ry="300" fill="#06b6d4" opacity="0.2"/>
  <ellipse cx="480" cy="1620" rx="420" ry="220" fill="#6366f1" opacity="0.18"/>
</svg>`,
  },
  {
    id: "svgbg:noir_spotlight_stage",
    name: "Escenario Noir Foco",
    category: "backgrounds",
    tags: ["noir", "stage", "spotlight", "cinema", "drama", "dark"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="#07080c"/>
  <polygon points="440,0 640,0 980,1740 100,1740" fill="url(#beam)"/>
  <ellipse cx="540" cy="1720" rx="410" ry="64" fill="#ffffff" opacity="0.1"/>
</svg>`,
  },
  {
    id: "svgbg:pixel_sky_clouds",
    name: "Cielo Pixel Art 16-Bit",
    category: "backgrounds",
    tags: ["pixel", "retro", "game", "sky", "clouds", "16bit"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 270 480" shape-rendering="crispEdges">
  <rect width="270" height="160" fill="#3b82f6"/>
  <rect y="160" width="270" height="140" fill="#60a5fa"/>
  <rect y="300" width="270" height="120" fill="#93c5fd"/>
  <rect y="420" width="270" height="60" fill="#22c55e"/>
  <rect y="420" width="270" height="10" fill="#4ade80"/>
  <g fill="#ffffff">
    <rect x="24" y="64" width="60" height="18"/><rect x="36" y="52" width="34" height="12"/>
    <rect x="168" y="108" width="72" height="20"/><rect x="184" y="94" width="40" height="14"/>
    <rect x="78" y="196" width="54" height="14"/><rect x="92" y="186" width="28" height="10"/>
  </g>
</svg>`,
  },
  {
    id: "svgbg:ocean_waves_deep",
    name: "Olas Océano Profundo",
    category: "backgrounds",
    tags: ["ocean", "water", "waves", "blue", "calm", "nature"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="oc" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c4a6e"/>
      <stop offset="100%" stop-color="#082f49"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#oc)"/>
  <path d="M0 1120 Q270 1030 540 1120 T1080 1120 L1080 1920 L0 1920 Z" fill="#0369a1" opacity="0.65"/>
  <path d="M0 1340 Q270 1250 540 1340 T1080 1340 L1080 1920 L0 1920 Z" fill="#0284c7" opacity="0.45"/>
  <path d="M0 1560 Q270 1480 540 1560 T1080 1560 L1080 1920 L0 1920 Z" fill="#0ea5e9" opacity="0.28"/>
</svg>`,
  },
  {
    id: "svgbg:overlay_cinema_frame",
    name: "Overlay Marco REC Cámara",
    category: "overlays",
    tags: ["overlay", "camera", "rec", "viewfinder", "hud", "vlog"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <g stroke="#ffffff" stroke-width="5" fill="none" opacity="0.72">
    <path d="M 70 150 L 70 70 L 150 70"/>
    <path d="M 930 70 L 1010 70 L 1010 150"/>
    <path d="M 70 1770 L 70 1850 L 150 1850"/>
    <path d="M 930 1850 L 1010 1850 L 1010 1770"/>
    <line x1="515" y1="960" x2="565" y2="960"/>
    <line x1="540" y1="935" x2="540" y2="985"/>
  </g>
  <circle cx="132" cy="126" r="14" fill="#ef4444"/>
  <text x="160" y="137" fill="#ffffff" font-family="monospace" font-size="34" font-weight="bold">REC 00:00</text>
</svg>`,
  },
  {
    id: "svgbg:overlay_soft_vignette",
    name: "Overlay Marco Editorial Dorado",
    category: "overlays",
    tags: ["overlay", "frame", "gold", "editorial", "luxury", "border"],
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920">
  <rect x="36" y="36" width="1008" height="1848" rx="34" fill="none" stroke="#ffd166" stroke-width="4" opacity="0.62"/>
  <rect x="52" y="52" width="976" height="1816" rx="26" fill="none" stroke="#ffffff" stroke-width="1.5" opacity="0.28"/>
</svg>`,
  },
];

export function findBuiltinSvgBackground(id: string): BuiltinSvgBackground | undefined {
  return BUILTIN_SVG_BACKGROUNDS.find((b) => b.id === id);
}
