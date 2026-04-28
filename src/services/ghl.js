// GoHighLevel (LeadConnector) CRM service — API v2.
// Auth: Private Integration Token (pit-...) scoped ao location.
// Headers obrigatórios: Authorization, Version, Accept.
// Docs: https://highlevel.stoplight.io/docs/integrations/

import config from "../config/index.js";

const { apiKey, locationId, baseUrl, apiVersion } = config.ghl;

const TIMEOUT_MS = 10_000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version:       apiVersion,
    Accept:        "application/json",
  };
}

export function ghlIsConfigured() {
  return !!apiKey && !!locationId;
}

async function ghlGet(path, params = {}) {
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetchWithTimeout(url.toString(), { headers: headers() });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL ${res.status} ${path}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.upstream = json;
    throw err;
  }
  return json;
}

/**
 * IDs dos custom fields da LP — confirmados via /locations/{id}/customFields.
 * Se a LP for migrada/recriada, basta atualizar aqui.
 */
const CF = {
  FL_CONSULTATION:   "TAP2eU6VaQFwRskJDCty",  // "Will the consultation take place while you are in Florida?"
  REASON:            "wCjbgvk25uMGcxKSh5Hr",  // "Reason for Appointment"
  CURRENT_LOCATION:  "cv6PLfqJLaoWeseAEqtT",  // "Where do you currently live?" (texto livre, US state)
};

function pickCustomField(arr, id) {
  if (!Array.isArray(arr)) return null;
  const cf = arr.find(c => c.id === id);
  return cf?.value ?? null;
}

/**
 * Normaliza a resposta do dropdown "Você está na FL?" da LP.
 *   "Sim, estou na FL"             → "FL"
 *   "Não, estou em outro estado…"  → "OUT_OF_STATE"
 *   "Não, estou no Brasil"         → "BR"
 *   (também aceita variações curtas: "Sim", "Brasil", etc.)
 */
function normalizeFlAnswer(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase();
  if (/brasil|brazil/.test(s))         return "BR";
  if (/outro estado|out of state|other state|eua|united states/.test(s)) return "OUT_OF_STATE";
  if (/n[aã]o/.test(s))                return "OUT_OF_STATE";  // "Não" sem qualificador → assume US
  if (/sim|fl\b|florida/.test(s))      return "FL";
  return null;
}

// Mapa de states US (sigla → variantes em lowercase). Usado pra normalizar
// texto livre vindo do GHL (ex: "California" → "CA").
const US_STATES_MAP = {
  AL: ["alabama"], AK: ["alaska"], AZ: ["arizona"], AR: ["arkansas"],
  CA: ["california"], CO: ["colorado"], CT: ["connecticut"], DE: ["delaware"],
  DC: ["district of columbia", "washington dc", "washington d.c."],
  FL: ["florida"], GA: ["georgia"], HI: ["hawaii"], ID: ["idaho"],
  IL: ["illinois"], IN: ["indiana"], IA: ["iowa"], KS: ["kansas"],
  KY: ["kentucky"], LA: ["louisiana"], ME: ["maine"], MD: ["maryland"],
  MA: ["massachusetts"], MI: ["michigan"], MN: ["minnesota"], MS: ["mississippi"],
  MO: ["missouri"], MT: ["montana"], NE: ["nebraska"], NV: ["nevada"],
  NH: ["new hampshire"], NJ: ["new jersey"], NM: ["new mexico"], NY: ["new york"],
  NC: ["north carolina"], ND: ["north dakota"], OH: ["ohio"], OK: ["oklahoma"],
  OR: ["oregon"], PA: ["pennsylvania"], RI: ["rhode island"],
  SC: ["south carolina"], SD: ["south dakota"], TN: ["tennessee"], TX: ["texas"],
  UT: ["utah"], VT: ["vermont"], VA: ["virginia"], WA: ["washington"],
  WV: ["west virginia"], WI: ["wisconsin"], WY: ["wyoming"],
};

/**
 * Normaliza um texto qualquer pra sigla US de 2 letras.
 *   "FL" → "FL"
 *   "Florida" → "FL"
 *   "new york" → "NY"
 *   "I live in California" → "CA"
 *   "" / texto não reconhecido → ""
 */
function normalizeUsState(input) {
  if (!input) return "";
  const s = String(input).trim();
  // 1) Sigla 2-letter exata
  const upper = s.toUpperCase();
  if (US_STATES_MAP[upper]) return upper;
  // 2) Nome do state (igual ou substring case-insensitive)
  const lower = s.toLowerCase();
  for (const [code, names] of Object.entries(US_STATES_MAP)) {
    if (names.some(n => lower === n || lower.includes(n))) return code;
  }
  return "";
}

/**
 * Mapeia contact do GHL → shape que o checkout consome.
 * Campos custom ficam em `customFields` (array de {id, value}) — extraímos
 * os 3 campos que a LP do checkout captura: FL?, motivo, residência.
 */
function mapContact(c) {
  if (!c) return null;

  const flAnswer  = pickCustomField(c.customFields, CF.FL_CONSULTATION);
  const reasonRaw = pickCustomField(c.customFields, CF.REASON);
  const whereRaw  = pickCustomField(c.customFields, CF.CURRENT_LOCATION);

  const flStatus = normalizeFlAnswer(flAnswer);

  // state: valor pro dropdown do checkout (US states 2-letter, "BR", ou "").
  //   FL                → "FL"
  //   OUT_OF_STATE      → tenta normalizar c.state OU "Where do you live?" (texto livre)
  //                        → ex: "California" vira "CA"; texto irreconhecível vira ""
  //   BR                → "BR" (sentinela; backend NÃO manda "BR" pro Elation no booking)
  //   sem flStatus      → tenta normalizar c.state nativo (legacy)
  const state =
    flStatus === "FL"           ? "FL"
    : flStatus === "BR"         ? "BR"
    : flStatus === "OUT_OF_STATE" ? (normalizeUsState(c.state) || normalizeUsState(whereRaw) || "")
    : (normalizeUsState(c.state) || "");

  return {
    ghlContactId: c.id,
    // *Raw preserva a capitalização original ("Roxanne"); firstName fica lowercase.
    firstName:    c.firstNameRaw || c.firstName || "",
    lastName:     c.lastNameRaw  || c.lastName  || "",
    email:        c.email     || "",
    phone:        c.phone     || "",
    dob:          c.dateOfBirth || null,
    state,
    flStatus,                       // "FL" | "OUT_OF_STATE" | "BR" | null
    reason:       reasonRaw || "",
    city:         c.city  || "",
    source:       c.source || null,
    tags:         c.tags   || [],
  };
}

/**
 * Busca contact por email no GHL. Usa /contacts/search/duplicate que retorna
 * 1 contato exato se houver match, 404 caso contrário.
 * @param {string} email
 * @returns {Promise<null | ReturnType<typeof mapContact>>}
 */
export async function lookupByEmail(email) {
  if (!ghlIsConfigured() || !email) return null;
  try {
    const data = await ghlGet("/contacts/search/duplicate", {
      locationId,
      email,
    });
    return mapContact(data?.contact);
  } catch (err) {
    if (err.status === 404) return null;  // sem match — comportamento esperado
    console.warn("[ghl.lookupByEmail]", err.message);
    return null;
  }
}

// Exportados pra teste/uso externo.
export { normalizeFlAnswer, normalizeUsState };

export const ghlService = {
  lookupByEmail,
};
