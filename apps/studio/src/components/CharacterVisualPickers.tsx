import React, { useMemo, useState } from "react";
import { Check, Palette, Smile, User } from "lucide-react";
import type {
  CharacterDefinition,
  CharacterExpression,
  CharacterPose,
  CharacterRenderStyle,
} from "@storia/schema";

// ============================================================================
// 1. CHARACTER POSE CATALOG (34 POSES WITH ARTICULATED SVG SILHOUETTE PREVIEWS)
// ============================================================================

type PoseCategory = "all" | "talk" | "action" | "emotion" | "social";

interface PoseSkeleton {
  head: [number, number];
  neck: [number, number];
  hip: [number, number];
  lElbow: [number, number];
  lHand: [number, number];
  rElbow: [number, number];
  rHand: [number, number];
  lKnee: [number, number];
  lFoot: [number, number];
  rKnee: [number, number];
  rFoot: [number, number];
  prop?: "phone" | "laptop" | "sparkles" | "heart";
}

interface PoseItemDef {
  id: CharacterPose;
  label: string;
  category: Exclude<PoseCategory, "all">;
  sk: PoseSkeleton;
}

const BASE_LEGS = {
  lKnee: [25, 42] as [number, number],
  lFoot: [24, 54] as [number, number],
  rKnee: [35, 42] as [number, number],
  rFoot: [36, 54] as [number, number],
};

const POSE_CATALOG: PoseItemDef[] = [
  // Presentar / Hablar
  {
    id: "idle",
    label: "Reposo",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [21, 25], lHand: [20, 33], rElbow: [39, 25], rHand: [40, 33], ...BASE_LEGS },
  },
  {
    id: "present",
    label: "Presentar",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 25], lHand: [21, 32], rElbow: [41, 23], rHand: [49, 17], ...BASE_LEGS },
  },
  {
    id: "present_both",
    label: "Abrir brazos",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [19, 23], lHand: [11, 17], rElbow: [41, 23], rHand: [49, 17], ...BASE_LEGS },
  },
  {
    id: "point",
    label: "Señalar",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 26], lHand: [22, 33], rElbow: [42, 21], rHand: [53, 20], ...BASE_LEGS },
  },
  {
    id: "point_up",
    label: "Señalar arriba",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 26], lHand: [22, 33], rElbow: [40, 18], rHand: [42, 7], ...BASE_LEGS },
  },
  {
    id: "shrug",
    label: "Encogerse",
    category: "talk",
    sk: { head: [30, 12], neck: [30, 18], hip: [30, 32], lElbow: [18, 26], lHand: [12, 20], rElbow: [42, 26], rHand: [48, 20], ...BASE_LEGS },
  },
  {
    id: "think",
    label: "Pensar",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [21, 27], lHand: [30, 27], rElbow: [41, 24], rHand: [33, 15], ...BASE_LEGS },
  },
  {
    id: "arms_crossed",
    label: "Brazos cruz.",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [20, 25], lHand: [36, 25], rElbow: [40, 25], rHand: [24, 24], ...BASE_LEGS },
  },
  {
    id: "hands_on_hips",
    label: "Cintura",
    category: "talk",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [17, 25], lHand: [25, 31], rElbow: [43, 25], rHand: [35, 31], ...BASE_LEGS },
  },
  {
    id: "lean",
    label: "Inclinado",
    category: "talk",
    sk: { head: [35, 12], neck: [33, 19], hip: [29, 32], lElbow: [24, 26], lHand: [24, 33], rElbow: [43, 24], rHand: [48, 29], lKnee: [25, 42], lFoot: [23, 54], rKnee: [35, 42], rFoot: [38, 54] },
  },
  {
    id: "look_up",
    label: "Mirar arriba",
    category: "talk",
    sk: { head: [31, 9], neck: [30, 18], hip: [30, 32], lElbow: [21, 25], lHand: [20, 33], rElbow: [39, 25], rHand: [40, 33], ...BASE_LEGS },
  },

  // Social / Saludos / Interacción
  {
    id: "wave",
    label: "Saludar",
    category: "social",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [21, 26], lHand: [20, 33], rElbow: [42, 18], rHand: [48, 9], ...BASE_LEGS },
  },
  {
    id: "wave_both",
    label: "Saludo doble",
    category: "social",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [18, 18], lHand: [12, 9], rElbow: [42, 18], rHand: [48, 9], ...BASE_LEGS },
  },
  {
    id: "reach",
    label: "Alcanzar",
    category: "social",
    sk: { head: [33, 11], neck: [32, 18], hip: [29, 32], lElbow: [22, 25], lHand: [18, 30], rElbow: [44, 18], rHand: [54, 15], lKnee: [24, 42], lFoot: [20, 54], rKnee: [36, 42], rFoot: [40, 54] },
  },
  {
    id: "hug",
    label: "Abrazar",
    category: "social",
    sk: { head: [31, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 23], lHand: [36, 22], rElbow: [42, 22], rHand: [49, 24], ...BASE_LEGS, prop: "heart" },
  },
  {
    id: "comfort",
    label: "Consolar",
    category: "social",
    sk: { head: [32, 12], neck: [31, 19], hip: [29, 32], lElbow: [23, 25], lHand: [26, 31], rElbow: [42, 22], rHand: [50, 23], ...BASE_LEGS },
  },
  {
    id: "hold_hands",
    label: "Tomar manos",
    category: "social",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [19, 26], lHand: [11, 31], rElbow: [41, 26], rHand: [49, 31], ...BASE_LEGS },
  },
  {
    id: "salute",
    label: "Saludo mil.",
    category: "social",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 26], lHand: [22, 34], rElbow: [42, 17], rHand: [35, 10], ...BASE_LEGS },
  },
  {
    id: "bow",
    label: "Reverencia",
    category: "social",
    sk: { head: [43, 18], neck: [38, 22], hip: [27, 32], lElbow: [34, 30], lHand: [36, 37], rElbow: [39, 30], rHand: [42, 37], lKnee: [25, 42], lFoot: [24, 54], rKnee: [31, 42], rFoot: [33, 54] },
  },
  {
    id: "phone_call",
    label: "Teléfono",
    category: "social",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [21, 26], lHand: [20, 33], rElbow: [42, 22], rHand: [35, 13], ...BASE_LEGS, prop: "phone" },
  },
  {
    id: "typing",
    label: "Teclando",
    category: "social",
    sk: { head: [32, 13], neck: [31, 20], hip: [27, 34], lElbow: [33, 27], lHand: [42, 27], rElbow: [37, 28], rHand: [46, 27], lKnee: [37, 38], lFoot: [36, 52], rKnee: [34, 39], rFoot: [32, 52], prop: "laptop" },
  },

  // Acción / Movimiento
  {
    id: "walk",
    label: "Caminar",
    category: "action",
    sk: { head: [31, 11], neck: [30, 18], hip: [30, 32], lElbow: [22, 24], lHand: [17, 31], rElbow: [38, 24], rHand: [43, 30], lKnee: [25, 42], lFoot: [19, 54], rKnee: [36, 42], rFoot: [42, 54] },
  },
  {
    id: "run",
    label: "Correr",
    category: "action",
    sk: { head: [35, 11], neck: [33, 18], hip: [28, 32], lElbow: [20, 22], lHand: [13, 26], rElbow: [41, 23], rHand: [48, 17], lKnee: [21, 41], lFoot: [11, 50], rKnee: [39, 39], rFoot: [47, 51] },
  },
  {
    id: "dance",
    label: "Bailar",
    category: "action",
    sk: { head: [29, 11], neck: [30, 18], hip: [32, 32], lElbow: [18, 16], lHand: [12, 8], rElbow: [43, 23], rHand: [50, 27], lKnee: [24, 42], lFoot: [18, 53], rKnee: [39, 41], rFoot: [44, 53], prop: "sparkles" },
  },
  {
    id: "fighting",
    label: "Combate",
    category: "action",
    sk: { head: [32, 12], neck: [31, 19], hip: [28, 32], lElbow: [23, 24], lHand: [33, 20], rElbow: [41, 22], rHand: [49, 17], lKnee: [22, 42], lFoot: [16, 54], rKnee: [38, 42], rFoot: [44, 54] },
  },
  {
    id: "sit",
    label: "Sentado",
    category: "action",
    sk: { head: [28, 14], neck: [28, 21], hip: [27, 35], lElbow: [23, 29], lHand: [31, 33], rElbow: [35, 29], rHand: [42, 33], lKnee: [40, 36], lFoot: [41, 52], rKnee: [37, 38], rFoot: [37, 52] },
  },
  {
    id: "kneel",
    label: "Arrodillado",
    category: "action",
    sk: { head: [30, 17], neck: [30, 24], hip: [29, 37], lElbow: [22, 31], lHand: [26, 37], rElbow: [38, 31], rHand: [42, 37], lKnee: [27, 51], lFoot: [17, 52], rKnee: [40, 42], rFoot: [40, 53] },
  },

  // Emoción / Dramático
  {
    id: "celebrate",
    label: "Celebrar",
    category: "emotion",
    sk: { head: [30, 10], neck: [30, 17], hip: [30, 31], lElbow: [18, 14], lHand: [12, 5], rElbow: [42, 14], rHand: [48, 5], lKnee: [24, 41], lFoot: [20, 53], rKnee: [36, 41], rFoot: [40, 53], prop: "sparkles" },
  },
  {
    id: "victory",
    label: "Victoria",
    category: "emotion",
    sk: { head: [30, 10], neck: [30, 17], hip: [30, 31], lElbow: [19, 25], lHand: [24, 31], rElbow: [41, 14], rHand: [45, 5], ...BASE_LEGS, prop: "sparkles" },
  },
  {
    id: "shock",
    label: "Impacto",
    category: "emotion",
    sk: { head: [30, 11], neck: [30, 18], hip: [30, 32], lElbow: [18, 22], lHand: [24, 14], rElbow: [42, 22], rHand: [36, 14], lKnee: [24, 42], lFoot: [21, 54], rKnee: [36, 42], rFoot: [39, 54] },
  },
  {
    id: "sad",
    label: "Triste",
    category: "emotion",
    sk: { head: [32, 14], neck: [30, 20], hip: [30, 33], lElbow: [23, 28], lHand: [25, 36], rElbow: [37, 28], rHand: [35, 36], ...BASE_LEGS },
  },
  {
    id: "despair",
    label: "Desespero",
    category: "emotion",
    sk: { head: [30, 20], neck: [30, 26], hip: [29, 39], lElbow: [20, 22], lHand: [26, 17], rElbow: [40, 22], rHand: [34, 17], lKnee: [24, 51], lFoot: [16, 53], rKnee: [36, 51], rFoot: [44, 53] },
  },
  {
    id: "protect",
    label: "Proteger",
    category: "emotion",
    sk: { head: [30, 12], neck: [30, 19], hip: [30, 32], lElbow: [18, 21], lHand: [11, 20], rElbow: [42, 21], rHand: [49, 20], lKnee: [23, 42], lFoot: [18, 54], rKnee: [37, 42], rFoot: [42, 54] },
  },
  {
    id: "cower",
    label: "Miedo",
    category: "emotion",
    sk: { head: [29, 17], neck: [30, 23], hip: [31, 36], lElbow: [21, 21], lHand: [27, 15], rElbow: [39, 21], rHand: [33, 15], lKnee: [24, 44], lFoot: [22, 54], rKnee: [36, 44], rFoot: [38, 54] },
  },
];

const POSE_CATEGORIES: { id: PoseCategory; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "talk", label: "Hablar" },
  { id: "social", label: "Social" },
  { id: "action", label: "Acción" },
  { id: "emotion", label: "Emoción" },
];

const PoseMiniSvg: React.FC<{ sk: PoseSkeleton; palette?: CharacterDefinition["palette"] }> = ({ sk, palette }) => {
  const skin = palette?.skin || "#f3cfa6";
  const shirt = palette?.shirt || "#f7c8d6";
  const pants = palette?.pants || "#64748b";
  const accent = palette?.accent || "#ffd447";
  return (
    <svg viewBox="0 0 60 60" className="w-full h-12">
      {/* Subtle floor shadow */}
      <ellipse cx="30" cy="55" rx="14" ry="2.2" fill="rgba(0,0,0,0.45)" />
      {/* Legs */}
      <path
        d={`M${sk.hip[0]} ${sk.hip[1]} L${sk.lKnee[0]} ${sk.lKnee[1]} L${sk.lFoot[0]} ${sk.lFoot[1]}`}
        fill="none"
        stroke={pants}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M${sk.hip[0]} ${sk.hip[1]} L${sk.rKnee[0]} ${sk.rKnee[1]} L${sk.rFoot[0]} ${sk.rFoot[1]}`}
        fill="none"
        stroke={pants}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Torso */}
      <line
        x1={sk.neck[0]}
        y1={sk.neck[1]}
        x2={sk.hip[0]}
        y2={sk.hip[1]}
        stroke={shirt}
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      {/* Arms */}
      <path
        d={`M${sk.neck[0]} ${sk.neck[1] + 1} L${sk.lElbow[0]} ${sk.lElbow[1]} L${sk.lHand[0]} ${sk.lHand[1]}`}
        fill="none"
        stroke={shirt}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={`M${sk.neck[0]} ${sk.neck[1] + 1} L${sk.rElbow[0]} ${sk.rElbow[1]} L${sk.rHand[0]} ${sk.rHand[1]}`}
        fill="none"
        stroke={shirt}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Hands */}
      <circle cx={sk.lHand[0]} cy={sk.lHand[1]} r="1.9" fill={skin} />
      <circle cx={sk.rHand[0]} cy={sk.rHand[1]} r="1.9" fill={skin} />
      {/* Head */}
      <circle cx={sk.head[0]} cy={sk.head[1]} r="5.6" fill={skin} stroke="#0b0c10" strokeWidth="1.2" />
      {/* Optional contextual prop hints */}
      {sk.prop === "phone" && (
        <rect x={sk.rHand[0] - 1} y={sk.rHand[1] - 4} width="3" height="5" rx="0.8" fill={accent} />
      )}
      {sk.prop === "laptop" && (
        <path d="M41 29 L52 29 L55 22" fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" />
      )}
      {sk.prop === "sparkles" && (
        <g fill={accent}>
          <circle cx="11" cy="12" r="1.5" />
          <circle cx="50" cy="11" r="1.7" />
          <circle cx="30" cy="4" r="1.2" />
        </g>
      )}
      {sk.prop === "heart" && (
        <path d="M47 16 C47 16 42 13 42 10 A2.5 2.5 0 0 1 47 9 A2.5 2.5 0 0 1 52 10 C52 13 47 16 47 16 Z" fill="#ff6470" />
      )}
    </svg>
  );
};

// ============================================================================
// 2. CHARACTER EXPRESSION CATALOG (22 EXPRESSIVE SVG FACES)
// ============================================================================

type ExprCategory = "all" | "positive" | "tense" | "sad" | "think";

interface ExpressionItemDef {
  id: CharacterExpression;
  label: string;
  category: Exclude<ExprCategory, "all">;
}

const EXPRESSION_CATALOG: ExpressionItemDef[] = [
  // Positivas
  { id: "neutral", label: "Neutral", category: "positive" },
  { id: "calm", label: "Calma", category: "positive" },
  { id: "happy", label: "Feliz", category: "positive" },
  { id: "laugh", label: "Risa", category: "positive" },
  { id: "proud", label: "Orgulloso", category: "positive" },
  { id: "relieved", label: "Aliviado", category: "positive" },
  { id: "love", label: "Enamorado", category: "positive" },
  { id: "awe", label: "Asombro", category: "positive" },

  // Tensión / Impacto / Enojo
  { id: "angry", label: "Enojado", category: "tense" },
  { id: "determined", label: "Decidido", category: "tense" },
  { id: "shock", label: "Shock", category: "tense" },
  { id: "fear", label: "Miedo", category: "tense" },
  { id: "worried", label: "Preocupado", category: "tense" },

  // Astucia / Pensar / Duda
  { id: "think", label: "Pensando", category: "think" },
  { id: "confused", label: "Confundido", category: "think" },
  { id: "sly", label: "Astuto", category: "think" },
  { id: "smug", label: "Presumido", category: "think" },
  { id: "suspicious", label: "Sospecha", category: "think" },

  // Tristeza / Cansancio
  { id: "sad", label: "Triste", category: "sad" },
  { id: "cry", label: "Llorando", category: "sad" },
  { id: "guilt", label: "Culpa", category: "sad" },
  { id: "exhausted", label: "Agotado", category: "sad" },
];

const EXPR_CATEGORIES: { id: ExprCategory; label: string }[] = [
  { id: "all", label: "Todas" },
  { id: "positive", label: "Positivas" },
  { id: "tense", label: "Tensión" },
  { id: "think", label: "Duda" },
  { id: "sad", label: "Tristeza" },
];

const ExpressionFaceSvg: React.FC<{ expr: CharacterExpression; skin?: string; hair?: string }> = ({
  expr,
  skin = "#f2cba5",
  hair = "#1e1a1c",
}) => {
  const ink = "#12151f";
  const renderEyes = () => {
    if (expr === "love") {
      return (
        <g fill="#ff4d6d">
          <path d="M18 26 C18 26 14 23 14 20.8 A2.1 2.1 0 0 1 18 20 A2.1 2.1 0 0 1 22 20.8 C22 23 18 26 18 26 Z" />
          <path d="M30 26 C30 26 26 23 26 20.8 A2.1 2.1 0 0 1 30 20 A2.1 2.1 0 0 1 34 20.8 C34 23 30 26 30 26 Z" />
        </g>
      );
    }
    if (expr === "laugh" || expr === "relieved" || expr === "calm") {
      const curve = expr === "calm" ? "Q18 25 21 22" : "Q18 19 21 23";
      const curveR = expr === "calm" ? "Q30 25 33 22" : "Q30 19 33 23";
      return (
        <g fill="none" stroke={ink} strokeWidth="2.1" strokeLinecap="round">
          <path d={`M15 23 ${curve}`} />
          <path d={`M27 23 ${curveR}`} />
        </g>
      );
    }
    if (expr === "shock" || expr === "fear" || expr === "awe") {
      return (
        <g>
          <circle cx="18" cy="22" r="3.6" fill="#ffffff" stroke={ink} strokeWidth="1.5" />
          <circle cx="30" cy="22" r="3.6" fill="#ffffff" stroke={ink} strokeWidth="1.5" />
          <circle cx="18" cy="22" r={expr === "awe" ? "2.1" : "1.3"} fill={ink} />
          <circle cx="30" cy="22" r={expr === "awe" ? "2.1" : "1.3"} fill={ink} />
          {expr === "awe" && (
            <>
              <circle cx="17" cy="20.8" r="0.8" fill="#ffffff" />
              <circle cx="29" cy="20.8" r="0.8" fill="#ffffff" />
            </>
          )}
        </g>
      );
    }
    if (expr === "suspicious" || expr === "sly" || expr === "exhausted") {
      return (
        <g>
          <line x1="14.5" y1="22" x2="21.5" y2="22" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />
          <line x1="26.5" y1="22" x2="33.5" y2="22" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />
          <circle cx={expr === "sly" ? "20" : "18"} cy="23.3" r="1.4" fill={ink} />
          <circle cx={expr === "sly" ? "32" : "30"} cy="23.3" r="1.4" fill={ink} />
        </g>
      );
    }
    return (
      <g>
        <circle cx="18" cy="22" r="2.2" fill={ink} />
        <circle cx="30" cy="22" r="2.2" fill={ink} />
      </g>
    );
  };

  const renderBrows = () => {
    if (expr === "angry" || expr === "determined") {
      return (
        <g stroke={ink} strokeWidth="2.1" strokeLinecap="round">
          <line x1="14" y1="15.5" x2="21.5" y2="18.5" />
          <line x1="34" y1="15.5" x2="26.5" y2="18.5" />
        </g>
      );
    }
    if (expr === "sad" || expr === "cry" || expr === "worried" || expr === "guilt" || expr === "fear") {
      return (
        <g stroke={ink} strokeWidth="1.9" strokeLinecap="round">
          <line x1="14" y1="18.5" x2="21" y2="15.5" />
          <line x1="34" y1="18.5" x2="27" y2="15.5" />
        </g>
      );
    }
    if (expr === "confused" || expr === "think" || expr === "smug" || expr === "sly") {
      return (
        <g stroke={ink} strokeWidth="1.9" strokeLinecap="round">
          <line x1="14.5" y1="17.5" x2="21" y2="17.5" />
          <line x1="27" y1="15.2" x2="33.5" y2="17.2" />
        </g>
      );
    }
    return (
      <g stroke={ink} strokeWidth="1.6" strokeLinecap="round" opacity="0.7">
        <line x1="15" y1="16.5" x2="21" y2="16.5" />
        <line x1="27" y1="16.5" x2="33" y2="16.5" />
      </g>
    );
  };

  const renderMouth = () => {
    switch (expr) {
      case "happy":
      case "proud":
      case "love":
      case "relieved":
      case "calm":
        return <path d="M18 30 Q24 35.5 30 30" fill="none" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />;
      case "laugh":
        return <path d="M17 29.5 Q24 38 31 29.5 Z" fill="#ff6b7a" stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />;
      case "sly":
      case "smug":
        return <path d="M19 31.5 Q25 34 31 29" fill="none" stroke={ink} strokeWidth="2.1" strokeLinecap="round" />;
      case "shock":
      case "awe":
        return <ellipse cx="24" cy="32.5" rx="3.4" ry="4.1" fill={ink} />;
      case "fear":
        return <path d="M18 33 Q21 30.5 24 33 Q27 30.5 30 33" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />;
      case "angry":
        return <path d="M18 34 Q24 29.5 30 34" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />;
      case "sad":
      case "cry":
      case "worried":
      case "guilt":
        return <path d="M18.5 33.5 Q24 29 29.5 33.5" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />;
      case "exhausted":
        return <ellipse cx="24" cy="33" rx="4.2" ry="2.2" fill={ink} />;
      case "confused":
      case "think":
        return <path d="M19.5 32 Q24 31 28.5 33" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />;
      case "determined":
      case "suspicious":
      case "neutral":
      default:
        return <line x1="19" y1="32" x2="29" y2="32" stroke={ink} strokeWidth="2" strokeLinecap="round" />;
    }
  };

  return (
    <svg viewBox="0 0 48 48" className="w-full h-11">
      {/* Hair crown hint */}
      <path d="M10 22 A14 14 0 0 1 38 22 L38 17 A14 13 0 0 0 10 17 Z" fill={hair} />
      {/* Head circle */}
      <circle cx="24" cy="25" r="14.5" fill={skin} stroke={ink} strokeWidth="1.6" />
      {/* Hair bangs */}
      <path d="M11 20 Q17 12 24 14 Q31 12 37 20 Q32 10 24 10 Q16 10 11 20 Z" fill={hair} />
      {/* Blush on warm expressions */}
      {(expr === "happy" || expr === "love" || expr === "laugh" || expr === "relieved") && (
        <g fill="#ff758f" opacity="0.45">
          <ellipse cx="14.5" cy="27.5" rx="2.6" ry="1.4" />
          <ellipse cx="33.5" cy="27.5" rx="2.6" ry="1.4" />
        </g>
      )}
      {/* Tears on cry */}
      {expr === "cry" && (
        <g fill="#38bdf8">
          <path d="M17.5 25 L16 32 Q17.5 34 19 32 Z" />
          <path d="M30.5 25 L29 32 Q30.5 34 32 32 Z" />
        </g>
      )}
      {/* Sweat drop on worried / exhausted / guilt */}
      {(expr === "worried" || expr === "exhausted" || expr === "guilt") && (
        <path d="M35.5 14 C35.5 14 38 17.5 38 19.2 A2.5 2.5 0 0 1 33 19.2 C33 17.5 35.5 14 35.5 14 Z" fill="#60a5fa" />
      )}
      {renderBrows()}
      {renderEyes()}
      {renderMouth()}
    </svg>
  );
};

// ============================================================================
// 3. CHARACTER RENDER STYLE CATALOG (12 VISUAL MINI-CARDS)
// ============================================================================

interface RenderStyleCardDef {
  id: CharacterRenderStyle;
  label: string;
  tag: string;
  bg: string;
  stroke: string;
  headFill: string;
  bodyFill?: string;
  accent?: string;
  beanie?: boolean;
  gloves?: boolean;
  pixel?: boolean;
  thick?: boolean;
}

const RENDER_STYLE_CARDS: RenderStyleCardDef[] = [
  { id: "auto", label: "Auto (Proyecto)", tag: "Hereda", bg: "linear-gradient(135deg,#1e293b,#312e81)", stroke: "#f7c8d6", headFill: "#f3cfa6", bodyFill: "#4ce6c8" },
  { id: "editorial", label: "Storia Editorial", tag: "Anatómico", bg: "linear-gradient(135deg,#181c2b,#2d2238)", stroke: "#11131a", headFill: "#e6be9a", bodyFill: "#f7c8d6" },
  { id: "stylized_3d", label: "3D Clay / Toon", tag: "Volumétrico 3D", bg: "linear-gradient(135deg,#1e3a8a,#38bdf8)", stroke: "#1e293b", headFill: "#f6d5b2", bodyFill: "#38bdf8", accent: "#fbbf24" },
  { id: "kurzgesagt", label: "Kurzgesagt Vector", tag: "Sin contornos", bg: "linear-gradient(135deg,#0b1230,#1d337a)", stroke: "none", headFill: "#f3cfa6", bodyFill: "#00e5ff", accent: "#ff5c8a" },
  { id: "anime_cel", label: "Anime Cel-Shaded", tag: "Cel 2 tonos", bg: "linear-gradient(135deg,#1d6fe2,#f5c79e)", stroke: "#141a2e", headFill: "#ffe2c6", bodyFill: "#ff477e", accent: "#ffe066" },
  { id: "retro_psx", label: "Retro PSX 1998", tag: "Low-poly 240p", bg: "linear-gradient(135deg,#1a103b,#5c2459)", stroke: "#0a0c1a", headFill: "#e6be9a", bodyFill: "#22d3ee", accent: "#f472b6" },
  { id: "paper_cutout", label: "Paper Cutout", tag: "Papel sticker", bg: "linear-gradient(135deg,#f5ecdc,#e2d4bc)", stroke: "#fbf7ef", headFill: "#e8be98", bodyFill: "#e05a47", accent: "#2d7d74" },
  { id: "classic_dark", label: "A1 Stickman Oscuro", tag: "Línea blanca", bg: "#0d1018", stroke: "#ffffff", headFill: "none" },
  { id: "classic_light", label: "A1 Stickman Claro", tag: "Línea negra", bg: "#f4f5f7", stroke: "#14161c", headFill: "none" },
  { id: "modern_beanie", label: "A2 Modern Pop", tag: "Gorro + Pop", bg: "linear-gradient(135deg,#0f172a,#1e293b)", stroke: "#14161c", headFill: "#fde047", beanie: true, accent: "#ef4444" },
  { id: "handdrawn", label: "B1/B2 Hand-Drawn", tag: "Papel tinta", bg: "#fbf7ef", stroke: "#1f2937", headFill: "#ffffff", accent: "#f59e0b" },
  { id: "retro_tv", label: "B3 Retro TV", tag: "Redondeado", bg: "linear-gradient(135deg,#1e1b4b,#4c1d95)", stroke: "#ffffff", headFill: "#ffffff", thick: true },
  { id: "thriller", label: "B4 Thriller", tag: "Guantes", bg: "linear-gradient(135deg,#09090b,#27272a)", stroke: "#e4e4e7", headFill: "#18181b", gloves: true },
  { id: "rubber_hose", label: "A7 Rubber Hose", tag: "1930s", bg: "#f3ead8", stroke: "#1c1917", headFill: "#1c1917", gloves: true, thick: true },
  { id: "meme", label: "B6 Meme Story", tag: "Trazo grueso", bg: "#ffffff", stroke: "#000000", headFill: "#ffffff", thick: true },
  { id: "pixel_theater", label: "B7 Pixel 16-bit", tag: "Pixel Art", bg: "#1a1c2c", stroke: "#38bdf8", headFill: "#ffccaa", bodyFill: "#ef4444", pixel: true },
  { id: "greek_mythology", label: "B8 Mitología", tag: "Cel-shaded", bg: "linear-gradient(135deg,#78350f,#d97706)", stroke: "#291509", headFill: "#f5cfa0", bodyFill: "#fef3c7", accent: "#facc15" },
];

const RenderStyleMiniSvg: React.FC<{ card: RenderStyleCardDef }> = ({ card }) => {
  if (card.pixel) {
    return (
      <div className="w-full h-11 rounded-md flex items-center justify-center overflow-hidden" style={{ background: card.bg }}>
        <svg viewBox="0 0 32 32" className="w-10 h-10" style={{ imageRendering: "pixelated" }}>
          <rect x="11" y="4" width="10" height="8" fill={card.headFill} />
          <rect x="13" y="7" width="2" height="2" fill="#111" />
          <rect x="17" y="7" width="2" height="2" fill="#111" />
          <rect x="10" y="12" width="12" height="10" fill={card.bodyFill} />
          <rect x="7" y="13" width="3" height="7" fill={card.headFill} />
          <rect x="22" y="13" width="3" height="7" fill={card.headFill} />
          <rect x="11" y="22" width="4" height="7" fill="#3b82f6" />
          <rect x="17" y="22" width="4" height="7" fill="#3b82f6" />
        </svg>
      </div>
    );
  }

  const sw = card.thick ? 3.2 : 2.1;
  return (
    <div className="w-full h-11 rounded-md flex items-center justify-center overflow-hidden" style={{ background: card.bg }}>
      <svg viewBox="0 0 48 44" className="w-11 h-11">
        {/* Legs */}
        <line x1="24" y1="28" x2="18" y2="40" stroke={card.stroke} strokeWidth={sw} strokeLinecap="round" />
        <line x1="24" y1="28" x2="30" y2="40" stroke={card.stroke} strokeWidth={sw} strokeLinecap="round" />
        {/* Body */}
        {card.bodyFill ? (
          <rect x="18" y="16" width="12" height="13" rx="4" fill={card.bodyFill} stroke={card.stroke} strokeWidth="1.4" />
        ) : (
          <line x1="24" y1="16" x2="24" y2="29" stroke={card.stroke} strokeWidth={sw} strokeLinecap="round" />
        )}
        {/* Arms */}
        <path d="M24 19 Q16 21 13 26" fill="none" stroke={card.stroke} strokeWidth={sw} strokeLinecap="round" />
        <path d="M24 19 Q32 21 36 16" fill="none" stroke={card.stroke} strokeWidth={sw} strokeLinecap="round" />
        {card.gloves && (
          <>
            <circle cx="13" cy="26" r="2.8" fill="#ffffff" stroke="#111" strokeWidth="1" />
            <circle cx="36" cy="16" r="2.8" fill="#ffffff" stroke="#111" strokeWidth="1" />
          </>
        )}
        {/* Head */}
        <circle cx="24" cy="11" r="6" fill={card.headFill} stroke={card.stroke} strokeWidth={sw * 0.85} />
        {card.beanie && (
          <path d="M18 9 A6 5 0 0 1 30 9 Z" fill={card.accent || "#ef4444"} stroke="#111" strokeWidth="1" />
        )}
        {card.id === "greek_mythology" && (
          <path d="M17 7 Q24 3 31 7" fill="none" stroke={card.accent || "#facc15"} strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
};

// ============================================================================
// UNIFIED CAPCUT-STYLE CHARACTER VISUAL STUDIO PANEL (POSE | EXPRESIÓN | ESTILO)
// ============================================================================

export const CharacterVisualStudioPanel: React.FC<{
  pose: CharacterPose;
  expression: CharacterExpression;
  renderStyle?: CharacterRenderStyle;
  palette?: CharacterDefinition["palette"];
  onChangePose: (pose: CharacterPose) => void;
  onChangeExpression: (expression: CharacterExpression) => void;
  onChangeRenderStyle?: (renderStyle: CharacterRenderStyle) => void;
}> = ({
  pose,
  expression,
  renderStyle = "auto",
  palette,
  onChangePose,
  onChangeExpression,
  onChangeRenderStyle,
}) => {
  const [tab, setTab] = useState<"pose" | "expression" | "style">("pose");
  const [poseCat, setPoseCat] = useState<PoseCategory>("all");
  const [exprCat, setExprCat] = useState<ExprCategory>("all");

  const filteredPoses = useMemo(
    () => (poseCat === "all" ? POSE_CATALOG : POSE_CATALOG.filter((p) => p.category === poseCat)),
    [poseCat],
  );
  const filteredExprs = useMemo(
    () => (exprCat === "all" ? EXPRESSION_CATALOG : EXPRESSION_CATALOG.filter((e) => e.category === exprCat)),
    [exprCat],
  );

  const activePoseLabel = POSE_CATALOG.find((p) => p.id === pose)?.label ?? pose;
  const activeExprLabel = EXPRESSION_CATALOG.find((e) => e.id === expression)?.label ?? expression;
  const activeStyleLabel = RENDER_STYLE_CARDS.find((s) => s.id === renderStyle)?.label ?? renderStyle;

  return (
    <div className="flex flex-col gap-2">
      {/* CapCut 3-Tab Switcher: Pose | Expresión | Estilo */}
      <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg" style={{ background: "rgba(0,0,0,0.28)" }}>
        <button
          type="button"
          onClick={() => setTab("pose")}
          className="py-1.5 px-1 rounded-md text-[10px] font-semibold cursor-pointer flex flex-col items-center gap-0.5 transition-colors"
          style={{
            background: tab === "pose" ? "var(--accent-primary)" : "transparent",
            color: tab === "pose" ? "var(--accent-ink)" : "var(--text-secondary)",
          }}
        >
          <span className="flex items-center gap-1">
            <User size={11} /> Pose
          </span>
          <span className="text-[8.5px] opacity-80 truncate max-w-full">{activePoseLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("expression")}
          className="py-1.5 px-1 rounded-md text-[10px] font-semibold cursor-pointer flex flex-col items-center gap-0.5 transition-colors"
          style={{
            background: tab === "expression" ? "var(--accent-primary)" : "transparent",
            color: tab === "expression" ? "var(--accent-ink)" : "var(--text-secondary)",
          }}
        >
          <span className="flex items-center gap-1">
            <Smile size={11} /> Expresión
          </span>
          <span className="text-[8.5px] opacity-80 truncate max-w-full">{activeExprLabel}</span>
        </button>

        <button
          type="button"
          onClick={() => setTab("style")}
          disabled={!onChangeRenderStyle}
          className="py-1.5 px-1 rounded-md text-[10px] font-semibold cursor-pointer flex flex-col items-center gap-0.5 transition-colors disabled:opacity-45"
          style={{
            background: tab === "style" ? "var(--accent-primary)" : "transparent",
            color: tab === "style" ? "var(--accent-ink)" : "var(--text-secondary)",
          }}
        >
          <span className="flex items-center gap-1">
            <Palette size={11} /> Estilo
          </span>
          <span className="text-[8.5px] opacity-80 truncate max-w-full">{activeStyleLabel}</span>
        </button>
      </div>

      {/* TAB 1: POSES VISUAL GRID */}
      {tab === "pose" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {POSE_CATEGORIES.map((c) => {
              const active = poseCat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setPoseCat(c.id)}
                  className="px-2 py-0.5 rounded-md text-[9.5px] font-medium cursor-pointer shrink-0"
                  style={{
                    background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                    color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[224px] overflow-y-auto pr-0.5">
            {filteredPoses.map((item) => {
              const isCurrent = pose === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangePose(item.id)}
                  className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer transition-all text-left"
                  style={{
                    background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                    border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div className="w-full rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <PoseMiniSvg sk={item.sk} palette={palette} />
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

      {/* TAB 2: EXPRESSIONS VISUAL GRID */}
      {tab === "expression" && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {EXPR_CATEGORIES.map((c) => {
              const active = exprCat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setExprCat(c.id)}
                  className="px-2 py-0.5 rounded-md text-[9.5px] font-medium cursor-pointer shrink-0"
                  style={{
                    background: active ? "var(--accent-primary)" : "rgba(255,255,255,0.06)",
                    color: active ? "var(--accent-ink)" : "var(--text-secondary)",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-1.5 max-h-[224px] overflow-y-auto pr-0.5">
            {filteredExprs.map((item) => {
              const isCurrent = expression === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeExpression(item.id)}
                  className="rounded-lg p-1 flex flex-col gap-0.5 cursor-pointer transition-all text-left"
                  style={{
                    background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                    border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  }}
                >
                  <div className="w-full rounded-md overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <ExpressionFaceSvg expr={item.id} skin={palette?.skin} hair={palette?.hair} />
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

      {/* TAB 3: CHARACTER RENDER STYLE VISUAL GRID */}
      {tab === "style" && onChangeRenderStyle && (
        <div className="grid grid-cols-2 gap-1.5 max-h-[244px] overflow-y-auto pr-0.5">
          {RENDER_STYLE_CARDS.map((card) => {
            const isCurrent = renderStyle === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onChangeRenderStyle(card.id)}
                className="rounded-lg p-1.5 flex flex-col gap-1 cursor-pointer transition-all text-left"
                style={{
                  background: isCurrent ? "var(--glass-active)" : "rgba(0,0,0,0.22)",
                  border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                }}
              >
                <RenderStyleMiniSvg card={card} />
                <div className="px-0.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-semibold truncate">{card.label}</span>
                    {isCurrent && <Check size={10} className="shrink-0" style={{ color: "var(--accent-primary)" }} />}
                  </div>
                  <span className="text-[9px] truncate block" style={{ color: "var(--text-muted)" }}>
                    {card.tag}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
