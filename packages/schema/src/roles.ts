import type { CharacterDefinition, CharacterWardrobe, GlassesStyle, HatStyle } from "./rig.js";

export interface RolePresetSpec {
  id: string;
  label: string;
  category: "autoridad" | "profesion" | "historia" | "fantasia" | "cotidiano";
  palette: {
    shirt: string;
    jacket?: string;
    pants: string;
    shoes: string;
    accent: string;
  };
  hat?: HatStyle;
  glasses?: GlassesStyle;
  wardrobe: Partial<CharacterWardrobe>;
}

/**
 * Complete role wardrobe library ported & expanded from Storia's `character_wardrobe.py`.
 * Assigning any role (or Spanish/English alias like "policía", "pirata", "médico", "bombero",
 * "astronauta", "chef", "caballero", "mago", etc.) automatically outfits the character!
 */
export const CHARACTER_ROLE_PRESETS: Record<string, RolePresetSpec> = {
  casual: {
    id: "casual",
    label: "Casual / Cotidiano",
    category: "cotidiano",
    palette: { shirt: "#e8ecf2", pants: "#283244", shoes: "#1a1a22", accent: "#f7c8d6" },
    wardrobe: { shoeStyle: "sneakers" },
  },
  formal: {
    id: "formal",
    label: "Traje Formal / Ejecutivo",
    category: "cotidiano",
    palette: { shirt: "#f5f4f0", jacket: "#232a36", pants: "#232a36", shoes: "#1a181a", accent: "#2e4f78" },
    wardrobe: { tieColor: "#2e4f78", pocketSquare: true, shoeStyle: "oxford" },
  },
  politician: {
    id: "politician",
    label: "Político / Presidente",
    category: "autoridad",
    palette: { shirt: "#f4f5f7", jacket: "#1f2b3d", pants: "#1f2b3d", shoes: "#1a1718", accent: "#9e2a2b" },
    wardrobe: { vestColor: "#2b394f", tieColor: "#9e2a2b", pocketSquare: true, watchChain: true, shoeStyle: "oxford" },
  },
  diplomat: {
    id: "diplomat",
    label: "Diplomático / Gala",
    category: "autoridad",
    palette: { shirt: "#f6f6f8", jacket: "#252834", pants: "#252834", shoes: "#181618", accent: "#8e232c" },
    wardrobe: { vestColor: "#383c4c", bowtie: true, pocketSquare: true, watchChain: true, shoeStyle: "oxford" },
  },
  police: {
    id: "police",
    label: "Policía / Oficial",
    category: "autoridad",
    palette: { shirt: "#2c4670", jacket: "#1c2d4a", pants: "#172338", shoes: "#141418", accent: "#e5c158" },
    hat: "police_cap",
    wardrobe: {
      hatColor: "#1a2a47",
      badge: true,
      epaulettes: true,
      tieColor: "#141b29",
      toolBelt: true,
      shoeStyle: "boots",
    },
  },
  detective: {
    id: "detective",
    label: "Detective / Investigador",
    category: "autoridad",
    palette: { shirt: "#efe8d8", jacket: "#9c825e", pants: "#38322c", shoes: "#241b16", accent: "#7a3028" },
    hat: "fedora",
    wardrobe: {
      hatColor: "#6e5a42",
      longcoat: true,
      tieColor: "#7a3028",
      badge: true,
      shoeStyle: "oxford",
    },
  },
  judge: {
    id: "judge",
    label: "Juez / Magistrado",
    category: "autoridad",
    palette: { shirt: "#f6f6f8", jacket: "#181920", pants: "#181920", shoes: "#121216", accent: "#e6d8b5" },
    wardrobe: { judgeRobe: true, longcoat: true, bowtie: true, shoeStyle: "oxford" },
  },
  military: {
    id: "military",
    label: "Militar / General",
    category: "autoridad",
    palette: { shirt: "#4d5c46", jacket: "#3e4c38", pants: "#384433", shoes: "#1d1917", accent: "#e0bb53" },
    hat: "officer_cap",
    wardrobe: {
      hatColor: "#394634",
      epaulettes: true,
      medals: true,
      crossBelt: true,
      shoeStyle: "boots",
    },
  },
  soldier: {
    id: "soldier",
    label: "Soldado / Combate",
    category: "autoridad",
    palette: { shirt: "#56634b", jacket: "#4a5741", pants: "#414c39", shoes: "#261e18", accent: "#8c7a52" },
    hat: "helmet",
    wardrobe: {
      hatColor: "#45523d",
      crossBelt: true,
      toolBelt: true,
      shoeStyle: "boots",
    },
  },
  firefighter: {
    id: "firefighter",
    label: "Bombero / Rescate",
    category: "profesion",
    palette: { shirt: "#2b2f38", jacket: "#222630", pants: "#1e222b", shoes: "#141418", accent: "#d9362c" },
    hat: "fire_helmet",
    wardrobe: {
      hatColor: "#c82820",
      reflectiveStripes: true,
      toolBelt: true,
      badge: true,
      shoeStyle: "boots",
    },
  },
  doctor: {
    id: "doctor",
    label: "Médico / Doctora",
    category: "profesion",
    palette: { shirt: "#cfe3ef", jacket: "#f5f7f9", pants: "#2d3a4a", shoes: "#211e20", accent: "#2b78a8" },
    wardrobe: { labCoat: true, stethoscope: true, tieColor: "#2b4d6e", shoeStyle: "oxford" },
  },
  scientist: {
    id: "scientist",
    label: "Científico / Laboratorio",
    category: "profesion",
    palette: { shirt: "#dce7ee", jacket: "#f4f6f9", pants: "#2d3440", shoes: "#1e1e24", accent: "#4ce6c8" },
    glasses: "classic",
    wardrobe: { labCoat: true, pocketSquare: true, tieColor: "#3a5a78", shoeStyle: "oxford" },
  },
  chef: {
    id: "chef",
    label: "Chef / Cocinero",
    category: "profesion",
    palette: { shirt: "#f7f8fa", jacket: "#ffffff", pants: "#252930", shoes: "#17171c", accent: "#c93838" },
    hat: "chef_hat",
    wardrobe: {
      hatColor: "#ffffff",
      apronColor: "#eae6dc",
      scarfColor: "#c93838",
      shoeStyle: "classic",
    },
  },
  astronaut: {
    id: "astronaut",
    label: "Astronauta / Espacial",
    category: "profesion",
    palette: { shirt: "#f0f3f7", jacket: "#e6ebf2", pants: "#dde4ee", shoes: "#353c4a", accent: "#e85d2a" },
    hat: "astronaut_helmet",
    wardrobe: {
      hatColor: "#f2f5f9",
      spaceSuit: true,
      badge: true,
      toolBelt: true,
      shoeStyle: "boots",
    },
  },
  worker: {
    id: "worker",
    label: "Obrero / Constructor",
    category: "profesion",
    palette: { shirt: "#7c94a8", pants: "#47423c", shoes: "#3b281c", accent: "#e6a82e" },
    hat: "work_cap",
    wardrobe: {
      hatColor: "#e6a82e",
      suspenders: true,
      toolBelt: true,
      scarfColor: "#b34432",
      shoeStyle: "boots",
    },
  },
  engineer: {
    id: "engineer",
    label: "Ingeniero / Explorador",
    category: "profesion",
    palette: { shirt: "#e8dfd0", pants: "#3c3a37", shoes: "#2c211a", accent: "#6e5539" },
    hat: "pith_helmet",
    wardrobe: {
      hatColor: "#d9ccb2",
      vestColor: "#5a4939",
      watchChain: true,
      shoeStyle: "boots",
    },
  },
  student: {
    id: "student",
    label: "Estudiante / Universitario",
    category: "cotidiano",
    palette: { shirt: "#f4f6fa", jacket: "#2e3c5c", pants: "#343b4a", shoes: "#1c1c22", accent: "#c83b4a" },
    wardrobe: { vestColor: "#3f4e73", tieColor: "#c83b4a", shoeStyle: "sneakers" },
  },
  pirate: {
    id: "pirate",
    label: "Pirata / Capitán",
    category: "historia",
    palette: { shirt: "#f0e6d2", jacket: "#5c2426", pants: "#2e2a2c", shoes: "#2a1d16", accent: "#e0b64e" },
    hat: "tricorn",
    glasses: "eyepatch",
    wardrobe: {
      hatColor: "#262024",
      longcoat: true,
      sashColor: "#a82c2c",
      crossBelt: true,
      earrings: "hoop",
      shoeStyle: "boots",
    },
  },
  sailor: {
    id: "sailor",
    label: "Marinero / Naval",
    category: "historia",
    palette: { shirt: "#f2f4f7", pants: "#1f304d", shoes: "#1b1a1e", accent: "#1f304d" },
    hat: "sailor_cap",
    wardrobe: {
      hatColor: "#f4f6f9",
      sailorCollar: true,
      scarfColor: "#1f304d",
      shoeStyle: "oxford",
    },
  },
  noble: {
    id: "noble",
    label: "Noble / Victoriano",
    category: "historia",
    palette: { shirt: "#f7f2e6", jacket: "#3b2242", pants: "#2a1d30", shoes: "#1d161b", accent: "#d9b25f" },
    hat: "tophat",
    glasses: "monocle",
    wardrobe: {
      hatColor: "#1c1a22",
      vestColor: "#6b3b4e",
      tieColor: "#d9b25f",
      longcoat: true,
      watchChain: true,
      shoeStyle: "oxford",
    },
  },
  indigenous: {
    id: "indigenous",
    label: "Indígena / Ancestral",
    category: "historia",
    palette: { shirt: "#b55233", pants: "#543d2e", shoes: "#6b482e", accent: "#e6b84c" },
    hat: "headband",
    wardrobe: {
      hatColor: "#b53a2a",
      tunic: true,
      sashColor: "#2a616d",
      necklace: "beaded",
      feather: true,
      shoeStyle: "flats",
    },
  },
  knight: {
    id: "knight",
    label: "Caballero / Medieval",
    category: "fantasia",
    palette: { shirt: "#8d96a6", jacket: "#b4becd", pants: "#4d5563", shoes: "#363c47", accent: "#b82d38" },
    hat: "knight_helm",
    wardrobe: {
      hatColor: "#aeb8c7",
      armorPlate: true,
      capeColor: "#a82430",
      crossBelt: true,
      shoeStyle: "boots",
    },
  },
  wizard: {
    id: "wizard",
    label: "Mago / Hechicero",
    category: "fantasia",
    palette: { shirt: "#282b5c", jacket: "#1e204a", pants: "#181a3b", shoes: "#261b18", accent: "#ffd447" },
    hat: "wizard_hat",
    wardrobe: {
      hatColor: "#25295e",
      longcoat: true,
      capeColor: "#3c266e",
      sashColor: "#ffd447",
      shoeStyle: "boots",
    },
  },
  ninja: {
    id: "ninja",
    label: "Ninja / Sigilo",
    category: "fantasia",
    palette: { shirt: "#1e2029", jacket: "#161821", pants: "#14161e", shoes: "#101118", accent: "#c92e3a" },
    hat: "ninja_hood",
    wardrobe: {
      hatColor: "#161821",
      sashColor: "#c92e3a",
      crossBelt: true,
      shoeStyle: "boots",
    },
  },
};

const ROLE_ALIASES: Record<string, string> = {
  // Spanish + English natural aliases
  policia: "police",
  cop: "police",
  sheriff: "police",
  guardia: "police",
  pirata: "pirate",
  corsair: "pirate",
  corsario: "pirate",
  capitan: "pirate",
  captain: "pirate",
  medico: "doctor",
  doctora: "doctor",
  enfermera: "doctor",
  nurse: "doctor",
  cientifico: "scientist",
  cientifica: "scientist",
  politico: "politician",
  presidente: "politician",
  president: "politician",
  senador: "politician",
  senator: "politician",
  diplomatico: "diplomat",
  traje: "formal",
  suit: "formal",
  ejecutivo: "formal",
  businessman: "formal",
  obrero: "worker",
  trabajador: "worker",
  minero: "worker",
  builder: "worker",
  laborer: "worker",
  ingeniero: "engineer",
  explorador: "engineer",
  indigena: "indigenous",
  nativo: "indigenous",
  native: "indigenous",
  maya: "indigenous",
  azteca: "indigenous",
  militar: "military",
  oficial: "military",
  officer: "military",
  general: "military",
  soldado: "soldier",
  marinero: "sailor",
  mariner: "sailor",
  aristocrata: "noble",
  aristocrat: "noble",
  victorian: "noble",
  victoriano: "noble",
  rey: "noble",
  bombero: "firefighter",
  cocinero: "chef",
  cocinera: "chef",
  astronauta: "astronaut",
  espacial: "astronaut",
  investigador: "detective",
  caballero: "knight",
  guerrero: "knight",
  mago: "wizard",
  hechicero: "wizard",
  brujo: "wizard",
  juez: "judge",
  abogado: "formal",
  estudiante: "student",
  escolar: "student",
};

/** Resolve any free-text role string (Spanish or English) to a canonical RolePresetSpec. */
export function resolveRolePreset(roleRaw?: string): RolePresetSpec | null {
  if (!roleRaw) return null;
  const norm = roleRaw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!norm || norm === "casual") return CHARACTER_ROLE_PRESETS.casual ?? null;
  if (CHARACTER_ROLE_PRESETS[norm]) return CHARACTER_ROLE_PRESETS[norm]!;
  if (ROLE_ALIASES[norm]) return CHARACTER_ROLE_PRESETS[ROLE_ALIASES[norm]!] ?? null;

  // Substring match for compound descriptions (e.g. "oficial de policia", "capitan pirata")
  for (const [alias, target] of Object.entries(ROLE_ALIASES)) {
    if (norm.includes(alias)) return CHARACTER_ROLE_PRESETS[target] ?? null;
  }
  for (const key of Object.keys(CHARACTER_ROLE_PRESETS)) {
    if (key !== "casual" && norm.includes(key)) return CHARACTER_ROLE_PRESETS[key] ?? null;
  }
  return null;
}

/**
 * Applies a role preset cleanly onto a CharacterDefinition (preserving identity, skin, hair & age).
 */
export function applyRolePresetToCharacter(
  def: CharacterDefinition,
  roleId: string,
): CharacterDefinition {
  const preset = resolveRolePreset(roleId);
  if (!preset) return { ...def, role: roleId };
  return {
    ...def,
    role: preset.id,
    palette: {
      ...def.palette,
      shirt: preset.palette.shirt,
      jacket: preset.palette.jacket,
      pants: preset.palette.pants,
      shoes: preset.palette.shoes,
      accent: preset.palette.accent,
    },
    accessories: {
      ...def.accessories,
      hat: preset.hat ?? "none",
      glasses: preset.glasses ?? def.accessories.glasses,
    },
    wardrobe: {
      bodyShape: def.wardrobe?.bodyShape ?? "average",
      faceShape: def.wardrobe?.faceShape ?? "soft",
      eyeStyle: def.wardrobe?.eyeStyle ?? "open",
      outfitStyle: def.wardrobe?.outfitStyle ?? "classic",
      pantsStyle: def.wardrobe?.pantsStyle ?? "trousers",
      secondaryMotion: def.wardrobe?.secondaryMotion ?? 1,
      dress: def.wardrobe?.dress ?? false,
      dressStyle: def.wardrobe?.dressStyle ?? "a_line",
      skirt: def.wardrobe?.skirt ?? false,
      bowtie: false,
      shirtPattern: "solid",
      earrings: def.wardrobe?.earrings ?? "none",
      necklace: "none",
      hairBow: def.wardrobe?.hairBow ?? false,
      shoeStyle: "classic",
      badge: false,
      epaulettes: false,
      medals: false,
      crossBelt: false,
      stethoscope: false,
      labCoat: false,
      longcoat: false,
      overalls: false,
      suspenders: false,
      toolBelt: false,
      sailorCollar: false,
      reflectiveStripes: false,
      armorPlate: false,
      judgeRobe: false,
      pocketSquare: false,
      watchChain: false,
      tunic: false,
      feather: false,
      spaceSuit: false,
      ...preset.wardrobe,
    },
  };
}
