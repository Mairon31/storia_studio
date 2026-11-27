import React, { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Crown, Glasses, Scissors, Shirt, Sparkles } from "lucide-react";
import type {
  CharacterDefinition,
  FacialHairStyle,
  GlassesStyle,
  HairStyle,
  HatStyle,
  OutfitStyle,
} from "@storia/schema";

type WardrobeTab = "hair" | "hat" | "facialHair" | "glasses" | "outfit";

// ============================================================================
// 1. HAIR STYLES CATALOG (26 STYLES WITH SVG PREVIEWS)
// ============================================================================

type HairCat = "all" | "short" | "long" | "textured";

const HAIR_CATALOG: { id: HairStyle; label: string; cat: Exclude<HairCat, "all"> }[] = [
  { id: "short", label: "Corto", cat: "short" },
  { id: "parted", label: "Raya lado", cat: "short" },
  { id: "pompadour", label: "Pompadour", cat: "short" },
  { id: "undercut", label: "Undercut", cat: "short" },
  { id: "spiky", label: "En puntas", cat: "short" },
  { id: "slick_back", label: "Hacia atrás", cat: "short" },
  { id: "side_sweep", label: "Flequillo", cat: "short" },
  { id: "buzz", label: "Rapado", cat: "short" },
  { id: "mohawk", label: "Mohawk", cat: "short" },
  { id: "pixie", label: "Pixie", cat: "short" },
  { id: "bald", label: "Calvo", cat: "short" },

  { id: "long", label: "Largo", cat: "long" },
  { id: "long_layered", label: "En capas", cat: "long" },
  { id: "bangs_long", label: "Flequillo recto", cat: "long" },
  { id: "wavy", label: "Ondulado", cat: "long" },
  { id: "bob", label: "Melena Bob", cat: "long" },
  { id: "ponytail", label: "Coleta alta", cat: "long" },
  { id: "twin_tails", label: "Dos coletas", cat: "long" },
  { id: "braids", label: "Trenzas", cat: "long" },
  { id: "updo", label: "Moño alto", cat: "long" },
  { id: "side_bun", label: "Moño lateral", cat: "long" },
  { id: "messy_bun", label: "Moño suelto", cat: "long" },
  { id: "half_up", label: "Semirecog.", cat: "long" },

  { id: "curly", label: "Rizado", cat: "textured" },
  { id: "afro", label: "Afro", cat: "textured" },
  { id: "dreadlocks", label: "Rastas", cat: "textured" },
];

const HairMiniSvg: React.FC<{ style: HairStyle; skin: string; hair: string }> = ({ style, skin, hair }) => {
  const ink = "#11131b";
  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      {/* Back hair silhouettes */}
      {(style === "long" || style === "long_layered" || style === "bangs_long" || style === "half_up") && (
        <path d="M10 22 Q9 38 12 45 L36 45 Q39 38 38 22 A14 14 0 0 0 10 22 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "wavy" && (
        <path d="M10 22 Q7 29 10 35 Q7 41 12 45 L36 45 Q41 41 38 35 Q41 29 38 22 A14 14 0 0 0 10 22 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "bob" && (
        <path d="M9 22 Q8 34 14 38 L34 38 Q40 34 39 22 A15 14 0 0 0 9 22 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "ponytail" && (
        <path d="M32 14 Q43 13 42 29 Q41 36 36 37 Q37 26 32 21 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "twin_tails" && (
        <g fill={hair} stroke={ink} strokeWidth="1.2">
          <path d="M12 18 Q5 24 7 39 Q12 38 13 26 Z" />
          <path d="M36 18 Q43 24 41 39 Q36 38 35 26 Z" />
        </g>
      )}
      {style === "braids" && (
        <g fill={hair} stroke={ink} strokeWidth="1.1">
          <circle cx="11" cy="27" r="3" />
          <circle cx="10.5" cy="33" r="2.8" />
          <circle cx="11" cy="39" r="2.4" />
          <circle cx="37" cy="27" r="3" />
          <circle cx="37.5" cy="33" r="2.8" />
          <circle cx="37" cy="39" r="2.4" />
        </g>
      )}
      {style === "updo" && <circle cx="24" cy="8.5" r="5.5" fill={hair} stroke={ink} strokeWidth="1.2" />}
      {style === "messy_bun" && (
        <g fill={hair} stroke={ink} strokeWidth="1.2">
          <circle cx="24" cy="9" r="5.5" />
          <circle cx="19" cy="10" r="3" />
          <circle cx="29" cy="10" r="3" />
        </g>
      )}
      {style === "side_bun" && <circle cx="36" cy="14" r="5.2" fill={hair} stroke={ink} strokeWidth="1.2" />}
      {style === "afro" && <circle cx="24" cy="21" r="18" fill={hair} stroke={ink} strokeWidth="1.3" />}
      {style === "curly" && (
        <g fill={hair} stroke={ink} strokeWidth="1.1">
          <circle cx="13" cy="17" r="5.5" />
          <circle cx="19" cy="11" r="5.5" />
          <circle cx="29" cy="11" r="5.5" />
          <circle cx="35" cy="17" r="5.5" />
          <circle cx="11" cy="24" r="4.5" />
          <circle cx="37" cy="24" r="4.5" />
        </g>
      )}
      {style === "dreadlocks" && (
        <g stroke={hair} strokeWidth="3.2" strokeLinecap="round">
          <line x1="11" y1="18" x2="9" y2="42" />
          <line x1="15" y1="15" x2="13" y2="43" />
          <line x1="33" y1="15" x2="35" y2="43" />
          <line x1="37" y1="18" x2="39" y2="42" />
        </g>
      )}

      {/* Head */}
      <circle cx="24" cy="26" r="12.5" fill={skin} stroke={ink} strokeWidth="1.4" />
      {/* Simple neutral face */}
      <circle cx="19.5" cy="26.5" r="1.5" fill={ink} />
      <circle cx="28.5" cy="26.5" r="1.5" fill={ink} />
      <path d="M21 32 Q24 34 27 32" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />

      {/* Front hair */}
      {style === "bald" && (
        <path d="M18 16 Q21 14 24 15" fill="none" stroke="#ffffff" strokeWidth="1.4" opacity="0.6" strokeLinecap="round" />
      )}
      {style === "buzz" && (
        <path d="M12.5 22 A12 11 0 0 1 35.5 22 Q30 16 24 16 Q18 16 12.5 22 Z" fill={hair} opacity="0.65" />
      )}
      {(style === "short" || style === "ponytail" || style === "twin_tails" || style === "braids" || style === "updo" || style === "side_bun" || style === "messy_bun") && (
        <path d="M11.5 23 A12.5 12.5 0 0 1 36.5 23 Q31 16 24 17 Q17 16 11.5 23 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "parted" && (
        <path d="M11.5 23 A12.5 12.5 0 0 1 36.5 23 Q30 16 20 19 Q16 17 11.5 23 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "pompadour" && (
        <path d="M12 22 Q10 9 25 8 Q37 9 36 22 Q30 16 22 17 Q16 17 12 22 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "undercut" && (
        <path d="M14 19 Q16 10 34 12 Q37 15 35 20 Q28 16 14 19 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "spiky" && (
        <path d="M12 22 L10 13 L17 16 L20 7 L25 14 L30 7 L32 16 L38 13 L36 22 Q24 16 12 22 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "slick_back" && (
        <path d="M12 22 Q13 11 24 11 Q35 11 36 22 Q32 15 24 15 Q16 15 12 22 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "side_sweep" && (
        <path d="M11.5 24 A12.5 12.5 0 0 1 36.5 22 Q29 14 13 23 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "mohawk" && (
        <path d="M20 16 L21 5 L24 8 L27 5 L28 16 Z" fill={hair} stroke={ink} strokeWidth="1.2" />
      )}
      {style === "pixie" && (
        <path d="M11 24 A13 12 0 0 1 37 22 Q31 15 22 19 L14 21 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {(style === "bangs_long" || style === "bob") && (
        <path d="M12 21 A12.5 12 0 0 1 36 21 L35 21 L13 21 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {(style === "long" || style === "long_layered" || style === "wavy" || style === "half_up") && (
        <path d="M11.5 23 A12.5 12 0 0 1 36.5 23 Q30 16 24 19 Q18 16 11.5 23 Z" fill={hair} stroke={ink} strokeWidth="1.1" />
      )}
      {style === "half_up" && <circle cx="24" cy="11" r="4" fill={hair} stroke={ink} strokeWidth="1.1" />}
    </svg>
  );
};

// ============================================================================
// 2. HAT / HELMET CATALOG (30 STYLES WITH SVG PREVIEWS)
// ============================================================================

type HatCat = "all" | "casual" | "formal" | "action" | "fantasy";

const HAT_CATALOG: { id: HatStyle; label: string; cat: Exclude<HatCat, "all"> }[] = [
  { id: "none", label: "Sin gorro", cat: "casual" },
  { id: "cap", label: "Gorra", cat: "casual" },
  { id: "beanie", label: "Beanie", cat: "casual" },
  { id: "bucket_hat", label: "Bucket", cat: "casual" },
  { id: "sun_hat", label: "De sol", cat: "casual" },
  { id: "headphones", label: "Audífonos", cat: "casual" },
  { id: "headband", label: "Cinta", cat: "casual" },
  { id: "cowboy_hat", label: "Vaquero", cat: "casual" },
  { id: "sombrero", label: "Mexicano", cat: "casual" },

  { id: "fedora", label: "Fedora", cat: "formal" },
  { id: "tophat", label: "De copa", cat: "formal" },
  { id: "beret", label: "Boina", cat: "formal" },
  { id: "graduation_cap", label: "Birrete", cat: "formal" },
  { id: "chef_hat", label: "Chef", cat: "formal" },
  { id: "sailor_cap", label: "Marinero", cat: "formal" },
  { id: "pith_helmet", label: "Explorador", cat: "formal" },

  { id: "police_cap", label: "Policía", cat: "action" },
  { id: "officer_cap", label: "Oficial", cat: "action" },
  { id: "helmet", label: "Casco", cat: "action" },
  { id: "fire_helmet", label: "Bombero", cat: "action" },
  { id: "work_cap", label: "Obrero", cat: "action" },
  { id: "astronaut_helmet", label: "Astronauta", cat: "action" },
  { id: "ninja_hood", label: "Ninja", cat: "action" },

  { id: "crown", label: "Corona", cat: "fantasy" },
  { id: "tiara", label: "Tiara", cat: "fantasy" },
  { id: "laurel_wreath", label: "Laurel", cat: "fantasy" },
  { id: "wizard_hat", label: "Mago", cat: "fantasy" },
  { id: "tricorn", label: "Pirata", cat: "fantasy" },
  { id: "knight_helm", label: "Caballero", cat: "fantasy" },
  { id: "samurai_kabuto", label: "Samurái", cat: "fantasy" },
];

const HatMiniSvg: React.FC<{ hat: HatStyle; skin: string; hatColor: string }> = ({ hat, skin, hatColor }) => {
  const ink = "#11131b";
  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      {/* Base head */}
      <circle cx="24" cy="29" r="11" fill={skin} stroke={ink} strokeWidth="1.4" />
      <circle cx="20" cy="29.5" r="1.4" fill={ink} />
      <circle cx="28" cy="29.5" r="1.4" fill={ink} />

      {hat === "none" && (
        <line x1="15" y1="14" x2="33" y2="14" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeDasharray="3 2" />
      )}
      {hat === "cap" && (
        <g fill={hatColor} stroke={ink} strokeWidth="1.3">
          <path d="M13 23 A11 9 0 0 1 35 23 Z" />
          <path d="M12 23 L41 23 Q38 20 33 21 Z" />
        </g>
      )}
      {hat === "beanie" && (
        <g fill={hatColor} stroke={ink} strokeWidth="1.3">
          <path d="M13 24 A11 11 0 0 1 35 24 Z" />
          <rect x="12" y="21" width="24" height="4" rx="2" />
          <circle cx="24" cy="12" r="2.8" />
        </g>
      )}
      {hat === "bucket_hat" && (
        <g fill={hatColor} stroke={ink} strokeWidth="1.3">
          <path d="M15 21 L17 13 L31 13 L33 21 Z" />
          <path d="M9 24 Q24 20 39 24 L35 20 L13 20 Z" />
        </g>
      )}
      {hat === "sun_hat" && (
        <g fill="#f3d186" stroke={ink} strokeWidth="1.3">
          <ellipse cx="24" cy="22" rx="19" ry="4" />
          <path d="M15 21 A9 7 0 0 1 33 21 Z" />
          <line x1="15" y1="20" x2="33" y2="20" stroke={hatColor} strokeWidth="2" />
        </g>
      )}
      {hat === "headphones" && (
        <g stroke={ink} strokeWidth="1.3">
          <path d="M12 28 A12 13 0 0 1 36 28" fill="none" stroke={hatColor} strokeWidth="3" />
          <rect x="9.5" y="25" width="4.5" height="9" rx="2" fill={hatColor} />
          <rect x="34" y="25" width="4.5" height="9" rx="2" fill={hatColor} />
        </g>
      )}
      {hat === "headband" && (
        <rect x="13" y="21" width="22" height="3.6" rx="1.5" fill={hatColor} stroke={ink} strokeWidth="1.1" />
      )}
      {hat === "cowboy_hat" && (
        <g fill="#8c5a32" stroke={ink} strokeWidth="1.3">
          <path d="M7 20 Q24 26 41 20 Q36 24 24 24 Q12 24 7 20 Z" />
          <path d="M15 22 L17 12 Q24 15 31 12 L33 22 Z" />
        </g>
      )}
      {hat === "sombrero" && (
        <g fill="#e9c46a" stroke={ink} strokeWidth="1.3">
          <path d="M5 23 Q24 27 43 23 Q37 19 24 19 Q11 19 5 23 Z" />
          <path d="M17 20 L21 9 L27 9 L31 20 Z" />
          <line x1="16" y1="19" x2="32" y2="19" stroke="#e63946" strokeWidth="2.2" />
        </g>
      )}
      {hat === "fedora" && (
        <g fill="#374151" stroke={ink} strokeWidth="1.3">
          <ellipse cx="24" cy="22" rx="16" ry="3" />
          <path d="M15 21 L17 12 Q24 14 31 12 L33 21 Z" />
          <line x1="15.5" y1="19.5" x2="32.5" y2="19.5" stroke={hatColor} strokeWidth="2" />
        </g>
      )}
      {hat === "tophat" && (
        <g fill="#18181b" stroke={ink} strokeWidth="1.3">
          <rect x="10" y="20" width="28" height="3" rx="1.5" />
          <rect x="15" y="6" width="18" height="14" rx="1.5" />
          <rect x="15" y="17" width="18" height="3" fill={hatColor} />
        </g>
      )}
      {hat === "beret" && (
        <g fill={hatColor} stroke={ink} strokeWidth="1.3">
          <path d="M11 22 Q10 12 26 13 Q37 14 35 22 Z" />
          <line x1="23" y1="13" x2="25" y2="10" stroke={ink} strokeWidth="1.6" />
        </g>
      )}
      {hat === "graduation_cap" && (
        <g fill="#1e293b" stroke={ink} strokeWidth="1.2">
          <polygon points="24,10 41,17 24,23 7,17" />
          <rect x="16" y="19" width="16" height="4" />
          <line x1="38" y1="17" x2="39" y2="27" stroke="#ffd447" strokeWidth="1.8" />
        </g>
      )}
      {hat === "chef_hat" && (
        <g fill="#ffffff" stroke={ink} strokeWidth="1.2">
          <circle cx="17" cy="14" r="5" />
          <circle cx="24" cy="11" r="6" />
          <circle cx="31" cy="14" r="5" />
          <rect x="14" y="17" width="20" height="6" />
        </g>
      )}
      {hat === "sailor_cap" && (
        <g fill="#f8fafc" stroke={ink} strokeWidth="1.3">
          <path d="M13 22 Q13 13 24 13 Q35 13 35 22 Z" />
          <rect x="14" y="19" width="20" height="3.5" fill="#1d4ed8" />
        </g>
      )}
      {hat === "pith_helmet" && (
        <g fill="#d6c59c" stroke={ink} strokeWidth="1.3">
          <ellipse cx="24" cy="22" rx="16" ry="3.2" />
          <path d="M13 21 A11 9 0 0 1 35 21 Z" />
        </g>
      )}
      {(hat === "police_cap" || hat === "officer_cap") && (
        <g fill={hat === "police_cap" ? "#1e3a8a" : "#3f4d36"} stroke={ink} strokeWidth="1.3">
          <path d="M11 20 L14 12 L34 12 L37 20 Z" />
          <rect x="13" y="20" width="22" height="3" fill="#111827" />
          <circle cx="24" cy="16" r="2.2" fill="#ffd447" />
        </g>
      )}
      {(hat === "helmet" || hat === "work_cap") && (
        <g fill={hat === "work_cap" ? "#facc15" : "#4b5563"} stroke={ink} strokeWidth="1.3">
          <path d="M11 23 A13 11 0 0 1 37 23 Z" />
          <rect x="10" y="21.5" width="28" height="2.8" rx="1.4" />
        </g>
      )}
      {hat === "fire_helmet" && (
        <g fill="#dc2626" stroke={ink} strokeWidth="1.3">
          <path d="M10 23 A13 11 0 0 1 38 23 L41 25 L9 25 Z" />
          <polygon points="24,13 28,20 20,20" fill="#ffd447" />
        </g>
      )}
      {hat === "astronaut_helmet" && (
        <g>
          <circle cx="24" cy="27" r="15" fill="rgba(226,232,240,0.3)" stroke="#e2e8f0" strokeWidth="2.4" />
          <ellipse cx="24" cy="27" rx="10" ry="7" fill="rgba(56,189,248,0.35)" stroke="#38bdf8" strokeWidth="1.2" />
        </g>
      )}
      {hat === "ninja_hood" && (
        <g>
          <circle cx="24" cy="28" r="12.5" fill="#18181b" stroke={ink} strokeWidth="1.3" />
          <rect x="15" y="25" width="18" height="5.5" rx="2.5" fill={skin} />
          <circle cx="20" cy="27.8" r="1.4" fill={ink} />
          <circle cx="28" cy="27.8" r="1.4" fill={ink} />
          <rect x="12" y="21" width="24" height="2.5" fill="#ef4444" />
        </g>
      )}
      {hat === "crown" && (
        <polygon points="13,22 14,10 20,16 24,8 28,16 34,10 35,22" fill="#ffd447" stroke={ink} strokeWidth="1.3" strokeLinejoin="round" />
      )}
      {hat === "tiara" && (
        <path d="M14 21 L18 14 L24 18 L30 14 L34 21 Z" fill="#f9a8d4" stroke={ink} strokeWidth="1.2" />
      )}
      {hat === "laurel_wreath" && (
        <path d="M12 22 Q16 14 24 14 Q32 14 36 22" fill="none" stroke="#84cc16" strokeWidth="3.5" strokeDasharray="3 2" strokeLinecap="round" />
      )}
      {hat === "wizard_hat" && (
        <g fill="#4c1d95" stroke={ink} strokeWidth="1.3">
          <ellipse cx="24" cy="22" rx="17" ry="3.2" />
          <polygon points="15,21 25,5 33,21" />
          <circle cx="24" cy="14" r="1.6" fill="#ffd447" />
        </g>
      )}
      {hat === "tricorn" && (
        <g fill="#1f2937" stroke={ink} strokeWidth="1.3">
          <path d="M9 22 L14 12 Q24 16 34 12 L39 22 Q24 20 9 22 Z" />
          <circle cx="24" cy="16" r="2" fill="#f8fafc" />
        </g>
      )}
      {hat === "knight_helm" && (
        <g fill="#94a3b8" stroke={ink} strokeWidth="1.3">
          <path d="M12 31 L12 20 A12 12 0 0 1 36 20 L36 31 Z" />
          <rect x="16" y="25" width="16" height="3" fill="#0f172a" />
          <path d="M24 8 Q32 7 31 14" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
      {hat === "samurai_kabuto" && (
        <g fill="#7f1d1d" stroke={ink} strokeWidth="1.3">
          <path d="M10 24 A14 11 0 0 1 38 24 Z" />
          <path d="M15 11 L24 18 L33 11" fill="none" stroke="#ffd447" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
};

// ============================================================================
// 3. FACIAL HAIR CATALOG (12 STYLES WITH SVG PREVIEWS)
// ============================================================================

const FACIAL_HAIR_CATALOG: { id: FacialHairStyle; label: string }[] = [
  { id: "none", label: "Afeitado" },
  { id: "stubble", label: "3 días" },
  { id: "mustache", label: "Bigote" },
  { id: "chevron", label: "Chevron" },
  { id: "handlebar", label: "Manillar" },
  { id: "soul_patch", label: "Mosca" },
  { id: "goatee", label: "Perilla" },
  { id: "van_dyke", label: "Van Dyke" },
  { id: "mutton_chops", label: "Patillas" },
  { id: "beard", label: "Barba media" },
  { id: "full_beard", label: "Barba tupida" },
  { id: "wizard_beard", label: "Barba mago" },
];

const FacialHairMiniSvg: React.FC<{ style: FacialHairStyle; skin: string; hair: string }> = ({ style, skin, hair }) => {
  const ink = "#11131b";
  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      <circle cx="24" cy="23" r="13.5" fill={skin} stroke={ink} strokeWidth="1.4" />
      <circle cx="19" cy="20" r="1.6" fill={ink} />
      <circle cx="29" cy="20" r="1.6" fill={ink} />

      {style === "stubble" && (
        <path d="M12 26 A12.5 12.5 0 0 0 36 26 Q30 33 24 33 Q18 33 12 26 Z" fill={hair} opacity="0.32" />
      )}
      {style === "mustache" && (
        <path d="M17 28 Q24 25 31 28 Q27 29.5 24 28.5 Q21 29.5 17 28 Z" fill={hair} />
      )}
      {style === "chevron" && (
        <path d="M16 28.5 Q24 24.5 32 28.5 L31 30.5 Q24 28 17 30.5 Z" fill={hair} />
      )}
      {style === "handlebar" && (
        <path d="M13 26.5 Q16 30 24 27 Q32 30 35 26.5" fill="none" stroke={hair} strokeWidth="2.8" strokeLinecap="round" />
      )}
      {style === "soul_patch" && (
        <polygon points="22,31 26,31 24,35.5" fill={hair} />
      )}
      {style === "goatee" && (
        <path d="M19 30 Q24 39 29 30 Q24 32 19 30 Z" fill={hair} />
      )}
      {style === "van_dyke" && (
        <g fill={hair}>
          <path d="M17 27.5 Q24 25 31 27.5 Q24 29 17 27.5 Z" />
          <polygon points="20,31 28,31 24,38" />
        </g>
      )}
      {style === "mutton_chops" && (
        <g fill={hair}>
          <path d="M10.5 21 L15 24 L15 33 L11 30 Z" />
          <path d="M37.5 21 L33 24 L33 33 L37 30 Z" />
        </g>
      )}
      {style === "beard" && (
        <path d="M11.5 25 A13 13 0 0 0 36.5 25 L34 32 Q24 38 14 32 Z" fill={hair} />
      )}
      {style === "full_beard" && (
        <path d="M11 23 A13.5 14 0 0 0 37 23 L35 35 Q24 42 13 35 Z" fill={hair} />
      )}
      {style === "wizard_beard" && (
        <path d="M11 24 L37 24 L32 41 L24 46 L16 41 Z" fill={hair} stroke={ink} strokeWidth="1" />
      )}
      {/* Mouth line */}
      <line x1="20.5" y1="29.5" x2="27.5" y2="29.5" stroke={style === "full_beard" || style === "wizard_beard" ? "#e5e7eb" : ink} strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
};

// ============================================================================
// 4. GLASSES / EYEWEAR CATALOG (7 STYLES WITH SVG PREVIEWS)
// ============================================================================

const GLASSES_CATALOG: { id: GlassesStyle; label: string }[] = [
  { id: "none", label: "Sin lentes" },
  { id: "classic", label: "Clásicos" },
  { id: "round", label: "Redondos" },
  { id: "cat_eye", label: "Cat-Eye" },
  { id: "sunglasses", label: "De sol" },
  { id: "monocle", label: "Monóculo" },
  { id: "eyepatch", label: "Parche" },
];

const GlassesMiniSvg: React.FC<{ style: GlassesStyle; skin: string }> = ({ style, skin }) => {
  const ink = "#11131b";
  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      <circle cx="24" cy="24" r="13.5" fill={skin} stroke={ink} strokeWidth="1.4" />
      <circle cx="18.5" cy="23" r="1.6" fill={ink} />
      <circle cx="29.5" cy="23" r="1.6" fill={ink} />
      <path d="M21 31 Q24 33 27 31" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />

      {style === "classic" && (
        <g fill="rgba(255,255,255,0.2)" stroke="#111827" strokeWidth="1.8">
          <rect x="12.5" y="19.5" width="9.5" height="7" rx="1.8" />
          <rect x="26" y="19.5" width="9.5" height="7" rx="1.8" />
          <line x1="22" y1="22.5" x2="26" y2="22.5" />
        </g>
      )}
      {style === "round" && (
        <g fill="rgba(255,255,255,0.2)" stroke="#111827" strokeWidth="1.8">
          <circle cx="17.5" cy="23" r="4.6" />
          <circle cx="30.5" cy="23" r="4.6" />
          <line x1="22.1" y1="23" x2="25.9" y2="23" />
        </g>
      )}
      {style === "cat_eye" && (
        <g fill="rgba(247,200,214,0.22)" stroke="#db2777" strokeWidth="1.8">
          <path d="M11 19 L22 21 L21 26.5 Q16 27 13 24 Z" />
          <path d="M37 19 L26 21 L27 26.5 Q32 27 35 24 Z" />
          <line x1="22" y1="22" x2="26" y2="22" />
        </g>
      )}
      {style === "sunglasses" && (
        <g fill="#0f172a" stroke="#1e293b" strokeWidth="1.6">
          <rect x="12" y="19" width="10.5" height="7.5" rx="2.5" />
          <rect x="25.5" y="19" width="10.5" height="7.5" rx="2.5" />
          <line x1="22.5" y1="22" x2="25.5" y2="22" strokeWidth="2" />
          <line x1="14" y1="21" x2="18" y2="21" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
          <line x1="27.5" y1="21" x2="31.5" y2="21" stroke="rgba(255,255,255,0.45)" strokeWidth="1.2" />
        </g>
      )}
      {style === "monocle" && (
        <g>
          <circle cx="29.5" cy="23" r="4.8" fill="rgba(255,255,255,0.22)" stroke="#ffd447" strokeWidth="1.8" />
          <line x1="34" y1="25" x2="35" y2="38" stroke="#ffd447" strokeWidth="1.2" strokeDasharray="2 1.5" />
        </g>
      )}
      {style === "eyepatch" && (
        <g>
          <line x1="11" y1="18" x2="36" y2="26" stroke="#111827" strokeWidth="1.8" />
          <path d="M14 20 L23 20 L22 26.5 Q18.5 28 15 26.5 Z" fill="#111827" />
        </g>
      )}
    </svg>
  );
};

// ============================================================================
// 5. OUTFIT STYLES CATALOG (12 GARMENTS WITH SVG PREVIEWS)
// ============================================================================

const OUTFIT_CATALOG: { id: OutfitStyle; label: string }[] = [
  { id: "classic", label: "Clásico" },
  { id: "hoodie", label: "Hoodie" },
  { id: "turtleneck", label: "Cuello alto" },
  { id: "sweater", label: "Suéter" },
  { id: "suit", label: "Traje" },
  { id: "trench_coat", label: "Gabardina" },
  { id: "leather_jacket", label: "Cuero" },
  { id: "denim_jacket", label: "Mezclilla" },
  { id: "sport_jersey", label: "Deportivo" },
  { id: "kimono", label: "Kimono" },
  { id: "toga", label: "Toga" },
  { id: "medieval_tunic", label: "Medieval" },
];

const OutfitMiniSvg: React.FC<{ style: OutfitStyle; palette?: CharacterDefinition["palette"] }> = ({ style, palette }) => {
  const ink = "#11131b";
  const shirt = palette?.shirt || "#eceef2";
  const jacket = palette?.jacket || "#334155";
  const accent = palette?.accent || "#f7c8d6";

  const mainFill =
    style === "leather_jacket"
      ? "#18181b"
      : style === "denim_jacket"
        ? "#2563eb"
        : style === "trench_coat"
          ? "#a18262"
          : style === "toga"
            ? "#f8fafc"
            : style === "medieval_tunic"
              ? "#7c2d12"
              : style === "suit"
                ? jacket
                : shirt;

  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      {/* Base torso + sleeves */}
      <path
        d={
          style === "trench_coat" || style === "kimono" || style === "toga" || style === "medieval_tunic"
            ? "M14 11 L7 18 L11 23 L14 20 L13 43 L35 43 L34 20 L37 23 L41 18 L34 11 Q24 14 14 11 Z"
            : "M14 12 L7 19 L12 24 L15 21 L15 39 L33 39 L33 21 L36 24 L41 19 L34 12 Q24 15 14 12 Z"
        }
        fill={mainFill}
        stroke={ink}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />

      {style === "hoodie" && (
        <g stroke={ink} strokeWidth="1.2">
          <path d="M17 12 Q24 19 31 12" fill="none" />
          <line x1="21" y1="15" x2="21" y2="23" stroke={accent} strokeWidth="1.6" />
          <line x1="27" y1="15" x2="27" y2="23" stroke={accent} strokeWidth="1.6" />
          <rect x="18" y="30" width="12" height="6" rx="2" fill="rgba(0,0,0,0.16)" />
        </g>
      )}
      {style === "turtleneck" && (
        <rect x="19" y="7" width="10" height="7" rx="2" fill={mainFill} stroke={ink} strokeWidth="1.3" />
      )}
      {style === "sweater" && (
        <g stroke={accent} strokeWidth="1.6" opacity="0.8">
          <line x1="15" y1="22" x2="33" y2="22" />
          <line x1="15" y1="28" x2="33" y2="28" />
          <line x1="15" y1="34" x2="33" y2="34" />
        </g>
      )}
      {style === "suit" && (
        <g>
          <polygon points="19,12 24,26 29,12" fill="#ffffff" />
          <polygon points="23,13 25,13 25.5,24 24,26 22.5,24" fill={accent} />
        </g>
      )}
      {style === "trench_coat" && (
        <g stroke={ink} strokeWidth="1.2">
          <line x1="24" y1="14" x2="24" y2="43" />
          <rect x="13" y="28" width="22" height="3" fill="#71583e" />
          <circle cx="20" cy="21" r="1.2" fill={ink} />
          <circle cx="28" cy="21" r="1.2" fill={ink} />
        </g>
      )}
      {style === "leather_jacket" && (
        <g>
          <polygon points="19,12 24,25 29,12" fill={shirt} />
          <line x1="27" y1="15" x2="27" y2="38" stroke="#94a3b8" strokeWidth="1.5" />
        </g>
      )}
      {style === "denim_jacket" && (
        <g stroke="#93c5fd" strokeWidth="1.2">
          <line x1="24" y1="13" x2="24" y2="39" />
          <rect x="17" y="20" width="5" height="5" fill="none" />
          <rect x="26" y="20" width="5" height="5" fill="none" />
        </g>
      )}
      {style === "sport_jersey" && (
        <g>
          <line x1="15" y1="15" x2="33" y2="15" stroke={accent} strokeWidth="2.5" />
          <text x="24" y="31" textAnchor="middle" fontSize="11" fontWeight="900" fill={accent}>
            10
          </text>
        </g>
      )}
      {style === "kimono" && (
        <g>
          <line x1="18" y1="12" x2="29" y2="28" stroke={ink} strokeWidth="1.5" />
          <line x1="30" y1="12" x2="23" y2="22" stroke={ink} strokeWidth="1.5" />
          <rect x="13" y="27" width="22" height="5.5" fill={accent} stroke={ink} strokeWidth="1.2" />
        </g>
      )}
      {style === "toga" && (
        <path d="M14 12 L34 32 L34 38 L14 18 Z" fill={accent} opacity="0.85" />
      )}
      {style === "medieval_tunic" && (
        <g>
          <rect x="13" y="28" width="22" height="4" fill="#451a03" stroke={ink} strokeWidth="1.1" />
          <rect x="22" y="27.5" width="4" height="5" fill="#ffd447" stroke={ink} strokeWidth="1" />
        </g>
      )}
    </svg>
  );
};

// ============================================================================
// MAIN VISUAL WARDROBE PANEL (HAIR | HAT | FACIAL HAIR | GLASSES | OUTFIT)
// ============================================================================

export const CharacterWardrobeVisualPanel: React.FC<{
  character: CharacterDefinition;
  onUpdateCharacter: (next: CharacterDefinition) => void;
}> = ({ character, onUpdateCharacter }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<WardrobeTab>("hair");
  const [hairCat, setHairCat] = useState<HairCat>("all");
  const [hatCat, setHatCat] = useState<HatCat>("all");

  const skin = character.palette.skin || "#e6be9a";
  const hairColor = character.palette.hair || "#1e1a1c";
  const hatColor = character.wardrobe?.hatColor || character.palette.accent || "#f7c8d6";
  const currentOutfit = character.wardrobe?.outfitStyle ?? "classic";

  const filteredHair = useMemo(
    () => (hairCat === "all" ? HAIR_CATALOG : HAIR_CATALOG.filter((h) => h.cat === hairCat)),
    [hairCat],
  );
  const filteredHats = useMemo(
    () => (hatCat === "all" ? HAT_CATALOG : HAT_CATALOG.filter((h) => h.cat === hatCat)),
    [hatCat],
  );

  const tabs: { id: WardrobeTab; label: string; icon: React.ReactNode; activeLabel: string }[] = [
    {
      id: "hair",
      label: "Pelo",
      icon: <Scissors size={12} />,
      activeLabel: HAIR_CATALOG.find((h) => h.id === character.hairStyle)?.label ?? character.hairStyle,
    },
    {
      id: "hat",
      label: "Gorro",
      icon: <Crown size={12} />,
      activeLabel: HAT_CATALOG.find((h) => h.id === character.accessories.hat)?.label ?? character.accessories.hat,
    },
    {
      id: "facialHair",
      label: "Barba",
      icon: <Sparkles size={12} />,
      activeLabel:
        FACIAL_HAIR_CATALOG.find((f) => f.id === character.accessories.facialHair)?.label ??
        character.accessories.facialHair,
    },
    {
      id: "glasses",
      label: "Lentes",
      icon: <Glasses size={12} />,
      activeLabel:
        GLASSES_CATALOG.find((g) => g.id === character.accessories.glasses)?.label ??
        character.accessories.glasses,
    },
    {
      id: "outfit",
      label: "Ropa",
      icon: <Shirt size={12} />,
      activeLabel: OUTFIT_CATALOG.find((o) => o.id === currentOutfit)?.label ?? currentOutfit,
    },
  ];

  return (
    <div
      className="rounded-xl p-2 flex flex-col gap-2"
      style={{ background: "rgba(0,0,0,0.2)", border: "1px solid var(--border-subtle)" }}
    >
      {/* Compact Header / Accordion Toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 cursor-pointer text-left"
      >
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--accent-primary)" }}>
            Apariencia y Vestuario (Vista previa)
          </div>
          <div className="text-[9.5px] truncate" style={{ color: "var(--text-muted)" }}>
            {tabs.map((t) => t.activeLabel).join(" · ")}
          </div>
        </div>
        {open ? <ChevronUp size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
      </button>

      {open && (
        <>
          {/* 5 Visual Category Tabs */}
          <div className="grid grid-cols-5 gap-1 p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.3)" }}>
            {tabs.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="py-1.5 px-1 rounded-md text-[9.5px] font-semibold cursor-pointer flex flex-col items-center justify-center gap-0.5 transition-colors"
                  style={{
                    background: active ? "var(--accent-primary)" : "transparent",
                    color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  }}
                >
                  {t.icon}
                  <span className="truncate max-w-full">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* 1. HAIR GRID */}
          {tab === "hair" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "short", label: "Corto" },
                    { id: "long", label: "Largo" },
                    { id: "textured", label: "Volumen" },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setHairCat(c.id)}
                    className="px-2 py-0.5 rounded-md text-[9.5px] font-medium cursor-pointer shrink-0"
                    style={{
                      background: hairCat === c.id ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                      color: hairCat === c.id ? "var(--accent-ink)" : "var(--text-secondary)",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-[216px] overflow-y-auto pr-0.5">
                {filteredHair.map((item) => {
                  const isCurrent = character.hairStyle === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onUpdateCharacter({ ...character, hairStyle: item.id })}
                      className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer text-left"
                      style={{
                        background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                        border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <div className="w-full rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <HairMiniSvg style={item.id} skin={skin} hair={hairColor} />
                      </div>
                      <div className="flex items-center justify-between gap-0.5 px-0.5">
                        <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                        {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. HAT GRID */}
          {tab === "hat" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: "all", label: "Todos" },
                    { id: "casual", label: "Casual" },
                    { id: "formal", label: "Formal" },
                    { id: "action", label: "Acción" },
                    { id: "fantasy", label: "Fantasía" },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setHatCat(c.id)}
                    className="px-2 py-0.5 rounded-md text-[9.5px] font-medium cursor-pointer shrink-0"
                    style={{
                      background: hatCat === c.id ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                      color: hatCat === c.id ? "var(--accent-ink)" : "var(--text-secondary)",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-[216px] overflow-y-auto pr-0.5">
                {filteredHats.map((item) => {
                  const isCurrent = character.accessories.hat === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        onUpdateCharacter({
                          ...character,
                          accessories: { ...character.accessories, hat: item.id },
                        })
                      }
                      className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer text-left"
                      style={{
                        background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                        border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      }}
                    >
                      <div className="w-full rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                        <HatMiniSvg hat={item.id} skin={skin} hatColor={hatColor} />
                      </div>
                      <div className="flex items-center justify-between gap-0.5 px-0.5">
                        <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                        {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. FACIAL HAIR GRID */}
          {tab === "facialHair" && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[224px] overflow-y-auto pr-0.5">
              {FACIAL_HAIR_CATALOG.map((item) => {
                const isCurrent = character.accessories.facialHair === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onUpdateCharacter({
                        ...character,
                        accessories: { ...character.accessories, facialHair: item.id },
                      })
                    }
                    className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer text-left"
                    style={{
                      background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                      border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="w-full rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <FacialHairMiniSvg style={item.id} skin={skin} hair={hairColor} />
                    </div>
                    <div className="flex items-center justify-between gap-0.5 px-0.5">
                      <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                      {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 4. GLASSES GRID */}
          {tab === "glasses" && (
            <div className="grid grid-cols-3 gap-1.5">
              {GLASSES_CATALOG.map((item) => {
                const isCurrent = character.accessories.glasses === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onUpdateCharacter({
                        ...character,
                        accessories: { ...character.accessories, glasses: item.id },
                      })
                    }
                    className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer text-left"
                    style={{
                      background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                      border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="w-full rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <GlassesMiniSvg style={item.id} skin={skin} />
                    </div>
                    <div className="flex items-center justify-between gap-0.5 px-0.5">
                      <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                      {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* 5. OUTFITS GRID */}
          {tab === "outfit" && (
            <div className="grid grid-cols-3 gap-1.5 max-h-[224px] overflow-y-auto pr-0.5">
              {OUTFIT_CATALOG.map((item) => {
                const isCurrent = currentOutfit === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onUpdateCharacter({
                        ...character,
                        wardrobe: {
                          ...(character.wardrobe ?? {}),
                          outfitStyle: item.id,
                        } as typeof character.wardrobe,
                      })
                    }
                    className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer text-left"
                    style={{
                      background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                      border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="w-full rounded-md" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <OutfitMiniSvg style={item.id} palette={character.palette} />
                    </div>
                    <div className="flex items-center justify-between gap-0.5 px-0.5">
                      <span className="text-[9.5px] font-medium truncate">{item.label}</span>
                      {isCurrent && <Check size={9} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
