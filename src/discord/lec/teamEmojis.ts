import { env } from "#config/env.js";

function normalizeTeamLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .replaceAll("&", "AND")
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

// Aliases comunes para opciones típicas de LEC.
// La clave final es lo que se buscará en `LEC_TEAM_EMOJIS`.
const TEAM_ALIASES: Record<string, string> = {
  // Abreviaturas
  "G2": "G2",
  "FNC": "FNC",
  "MKOI": "MKOI",
  "SHFT": "BDS",
  "SK": "SK",
  "VIT": "VIT",
  "GX": "GX",
  "KC": "KC",
  "TH": "TH",
  "NAVI": "NAVI",

  // Nombres completos / variantes
  "G2 ESPORTS": "G2",
  "FNATIC": "FNC",
  "MOVISTAR KOI": "MKOI",
  "SHIFTERS": "SHFT",
  "SK GAMING": "SK",
  "TEAM VITALITY": "VIT",
  "GIANTX": "GX",
  "KARMINE CORP": "KC",
  "TEAM HERETICS": "TH",
  "NATUS VINCERE": "NAVI",
};

let cachedEmojiMap: Record<string, string> | null = null;

function loadEmojiMap(): Record<string, string> {
  if (cachedEmojiMap) return cachedEmojiMap;

  const raw = env.LEC_TEAM_EMOJIS;
  if (!raw) {
    cachedEmojiMap = {};
    return cachedEmojiMap;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      console.warn("LEC_TEAM_EMOJIS debe ser un JSON objeto (p.ej. {\"G2\":\"<:g2:123>\"}).");
      cachedEmojiMap = {};
      return cachedEmojiMap;
    }

    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) {
        map[normalizeTeamLabel(k)] = v.trim();
      }
    }

    cachedEmojiMap = map;
    return cachedEmojiMap;
  } catch {
    console.warn("LEC_TEAM_EMOJIS no es JSON válido.");
    cachedEmojiMap = {};
    return cachedEmojiMap;
  }
}

export function getLecTeamEmoji(label: string): string | undefined {
  const normalized = normalizeTeamLabel(label);
  const key = TEAM_ALIASES[normalized] ?? normalized;
  const map = loadEmojiMap();
  return map[normalizeTeamLabel(key)];
}
