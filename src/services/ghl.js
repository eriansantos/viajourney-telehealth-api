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

async function ghlPost(path, body) {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method:  "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL POST ${res.status} ${path}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.upstream = json;
    throw err;
  }
  return json;
}

async function ghlPut(path, body) {
  const res = await fetchWithTimeout(`${baseUrl}${path}`, {
    method:  "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`GHL PUT ${res.status} ${path}: ${JSON.stringify(json)}`);
    err.status = res.status;
    err.upstream = json;
    throw err;
  }
  return json;
}

/**
 * Atualiza um contato no GHL (PUT /contacts/:id).
 * Mapeia os campos do checkout para os campos padrão do GHL.
 * Só envia campos com valor (não sobrescreve com vazio).
 * @param {string} contactId
 * @param {object} fields  { firstName, lastName, phone, address1, city, state, postalCode, country }
 */
export async function updateContact(contactId, fields = {}) {
  if (!ghlIsConfigured() || !contactId) return null;
  const body = {};
  if (fields.firstName)  body.firstName  = fields.firstName;
  if (fields.lastName)   body.lastName   = fields.lastName;
  if (fields.phone)      body.phone      = fields.phone;
  if (fields.address1)   body.address1   = fields.address1;
  if (fields.city)       body.city       = fields.city;
  if (fields.state)      body.state      = fields.state;
  if (fields.postalCode) body.postalCode = fields.postalCode;
  if (fields.country)    body.country    = fields.country;
  if (Object.keys(body).length === 0) return null;
  return ghlPut(`/contacts/${contactId}`, body);
}

// Tag aplicada a leads dos EUA fora da Flórida (fora da área de atuação).
// Identifica no CRM quem NÃO pode fazer a subscrição — base p/ smart list / follow-up.
export const OUT_OF_STATE_TAGS = ["checkout"];

// Oportunidade do lead fora-da-área: pipeline "Novo funil" → etapa "Outros Estados".
// IDs confirmados via GET /opportunities/pipelines (produção).
export const OUT_OF_STATE_PIPELINE_ID = "eIPhZA61snbD7aBfK6np";                  // "Novo funil"
export const OUT_OF_STATE_STAGE_ID    = "9a37ef86-b7e2-4ba3-9cd0-5a0afba9ba0e";  // "Outros Estados"

/**
 * Cria uma oportunidade para o contato no pipeline/etapa indicados — evitando
 * duplicar (se já existe oportunidade do contato nesse pipeline, retorna a existente).
 * @returns {Promise<object|null>}
 */
export async function ensureOpportunity({ contactId, pipelineId, stageId, name, monetaryValue }) {
  if (!ghlIsConfigured() || !contactId || !pipelineId || !stageId) return null;

  // Procura oportunidade existente do contato no mesmo pipeline.
  let existing = null;
  try {
    const found = await ghlGet("/opportunities/search", { location_id: locationId, contact_id: contactId });
    existing = (found?.opportunities || []).find(o => o.pipelineId === pipelineId) || null;
  } catch (e) { /* sem busca → segue e cria nova */ }

  // Já existe no pipeline → MOVE para a etapa alvo (evita duplicar e garante
  // que leads de fora da área caiam em "Outros Estados", mesmo vindos de outra etapa).
  if (existing) {
    if (existing.pipelineStageId === stageId) return existing;
    return ghlPut(`/opportunities/${existing.id}`, { pipelineId, pipelineStageId: stageId });
  }

  // Não existe → cria nova na etapa alvo.
  const body = {
    pipelineId,
    locationId,
    pipelineStageId: stageId,
    contactId,
    status: "open",
    name: name || "Lead Checkout — fora da área (FL)",
  };
  if (monetaryValue != null) body.monetaryValue = monetaryValue;
  return ghlPost("/opportunities/", body);
}

/**
 * Cria ou atualiza um contato no GHL por email (POST /contacts/upsert).
 * Usado para gravar o lead mesmo quando ele não pode assinar (fora da FL).
 * Só envia campos com valor; tags são mescladas (GHL não remove as existentes).
 * @param {object} fields { email, firstName, lastName, phone, address1, city, state, postalCode, country, dob, tags }
 * @returns {Promise<object|null>} contato upsertado, ou null se GHL não configurado / sem email
 */
export async function upsertContact(fields = {}) {
  if (!ghlIsConfigured() || !fields.email) return null;
  const body = { locationId, email: fields.email };
  if (fields.firstName)  body.firstName  = fields.firstName;
  if (fields.lastName)   body.lastName   = fields.lastName;
  if (fields.phone)      body.phone      = fields.phone;
  if (fields.address1)   body.address1   = fields.address1;
  if (fields.city)       body.city       = fields.city;
  if (fields.state)      body.state      = fields.state;
  if (fields.postalCode) body.postalCode = fields.postalCode;
  if (fields.country)    body.country    = fields.country;
  if (fields.dob)        body.dateOfBirth = fields.dob;
  if (Array.isArray(fields.tags) && fields.tags.length) body.tags = fields.tags;
  return ghlPost("/contacts/upsert", body);
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
    // Campos de endereço padrão do GHL — pré-preenchem o form do checkout.
    address1:     c.address1   || "",
    city:         c.city       || "",
    zip:          c.postalCode || "",
    country:      normalizeCountry(c.country),
    source:       c.source || null,
    tags:         c.tags   || [],
  };
}

// Normaliza código de país do GHL para o nome esperado no campo do checkout/Hint.
function normalizeCountry(code) {
  if (!code) return "";
  const c = String(code).trim().toUpperCase();
  if (c === "US" || c === "USA") return "United States";
  if (c === "BR" || c === "BRA") return "Brasil";
  return code;
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
export { normalizeFlAnswer, normalizeUsState, mapContact };

/**
 * Lista contacts via POST /contacts/search com filtro de dateAdded.
 * Pagina automaticamente até retornar todos os matches dentro da janela.
 *
 * @param {object} opts
 * @param {Date}   opts.from        início da janela (inclusivo)
 * @param {Date}   opts.to          fim da janela (exclusivo)
 * @param {number} [opts.maxRecords=5000]  proteção contra runaway
 * @returns {Promise<Array>}        array bruto de contacts
 */
export async function listContactsInRange({ from, to, maxRecords = 5000 } = {}) {
  if (!ghlIsConfigured()) return [];

  const records = [];
  const pageLimit = 100;
  let page = 1;

  while (records.length < maxRecords) {
    const body = {
      locationId,
      page,
      pageLimit,
      filters: [
        { field: "dateAdded", operator: "range", value: { gte: from.toISOString(), lte: to.toISOString() } },
      ],
      sort: [{ field: "dateAdded", direction: "desc" }],
    };

    let json;
    try {
      json = await ghlPost("/contacts/search", body);
    } catch (err) {
      // Algumas instalações GHL retornam 422 ou 400 se o filtro não for aceito.
      // Fallback: GET /contacts/ paginação por cursor + filtro client-side.
      if (err.status === 422 || err.status === 400 || err.status === 404) {
        return listContactsViaGet({ from, to, maxRecords });
      }
      throw err;
    }

    const batch = Array.isArray(json?.contacts) ? json.contacts : [];
    records.push(...batch);
    if (batch.length < pageLimit) break;
    page += 1;
  }

  return records;
}

/**
 * Fallback: GET /contacts/ com paginação por cursor (startAfterId).
 * Filtra dateAdded client-side. Usado quando POST /contacts/search não está
 * disponível na conta.
 */
async function listContactsViaGet({ from, to, maxRecords = 5000 }) {
  const records = [];
  let startAfterId = null;
  const fromMs = from.getTime();
  const toMs   = to.getTime();

  while (records.length < maxRecords) {
    const json = await ghlGet("/contacts/", {
      locationId,
      limit:        100,
      startAfterId,
    });
    const batch = Array.isArray(json?.contacts) ? json.contacts : [];
    if (batch.length === 0) break;

    let stoppedEarly = false;
    for (const c of batch) {
      const t = c.dateAdded ? new Date(c.dateAdded).getTime() : 0;
      if (t < fromMs) { stoppedEarly = true; break; }   // ordenado desc → tudo daqui pra trás é mais antigo
      if (t < toMs)   records.push(c);
    }
    if (stoppedEarly) break;

    startAfterId = json?.meta?.startAfterId;
    if (!startAfterId) break;
  }

  return records;
}

// ─── Pipelines ────────────────────────────────────────────────────────────────

/** Cache simples em memória pra evitar chamada repetida a cada request. */
let _pipelinesCache = null;
let _pipelinesCachedAt = 0;
const PIPELINES_TTL_MS = 5 * 60 * 1000; // 5 min

export async function getPipelines() {
  if (_pipelinesCache && Date.now() - _pipelinesCachedAt < PIPELINES_TTL_MS) {
    return _pipelinesCache;
  }
  const data = await ghlGet("/opportunities/pipelines", { locationId });
  _pipelinesCache = Array.isArray(data?.pipelines) ? data.pipelines : [];
  _pipelinesCachedAt = Date.now();
  return _pipelinesCache;
}

/** Mapas rápidos id → name, construídos a partir dos pipelines. */
export async function getPipelineMaps() {
  const pipelines = await getPipelines();
  const pipelineMap = {};
  const stageMap = {};
  for (const p of pipelines) {
    pipelineMap[p.id] = p.name;
    for (const s of (p.stages || [])) {
      stageMap[s.id] = s.name;
    }
  }
  return { pipelines, pipelineMap, stageMap };
}

// ─── Contacts paginados com filtro (para a view de Leads) ─────────────────────

/**
 * Busca contacts com paginação e filtros opcionais de pipeline e tag.
 * Retorna contacts enriquecidos com nome do pipeline/stage.
 *
 * @param {object} opts
 * @param {string}   [opts.tag]       — filtra contacts que contenham essa tag
 * @param {string}   [opts.pipeline]  — filtra contacts com oportunidade nesse pipeline
 * @param {number}   [opts.page=1]
 * @param {number}   [opts.limit=50]
 * @returns {Promise<{ contacts: Array, total: number }>}
 */
export async function getContactsPage({ tag, pipeline, page = 1, limit = 50 } = {}) {
  if (!ghlIsConfigured()) return { contacts: [], total: 0 };

  // Monta filtros GHL
  const filters = [];
  if (tag) {
    filters.push({ field: "tags", operator: "contains", value: tag });
  }

  // GHL não suporta filtro nativo por pipeline na /contacts/search — fazemos
  // paginação com limite maior e filtramos client-side se pipeline for fornecido.
  const needsClientFilter = !!pipeline;
  const fetchLimit = needsClientFilter ? 100 : limit;

  // Se filtro de pipeline: precisamos varrer mais páginas. Busca até 10 páginas.
  if (needsClientFilter) {
    const matched = [];
    let ghPage = 1;
    while (matched.length < page * limit) {
      const body = {
        locationId,
        page: ghPage,
        pageLimit: 100,
        filters,
        sort: [{ field: "dateAdded", direction: "desc" }],
      };
      const json = await ghlPost("/contacts/search", body);
      const batch = Array.isArray(json?.contacts) ? json.contacts : [];
      if (batch.length === 0) break;

      // Filtra client-side por pipeline
      for (const c of batch) {
        if ((c.opportunities || []).some(o => o.pipelineId === pipeline)) {
          matched.push(c);
        }
      }
      if (batch.length < 100) break;
      ghPage++;
      if (ghPage > 15) break; // segurança
    }

    const start = (page - 1) * limit;
    return {
      contacts: matched.slice(start, start + limit),
      total: matched.length,
    };
  }

  // Sem filtro de pipeline: usa paginação direta do GHL
  const body = {
    locationId,
    page,
    pageLimit: limit,
    filters,
    sort: [{ field: "dateAdded", direction: "desc" }],
  };
  const json = await ghlPost("/contacts/search", body);
  const contacts = Array.isArray(json?.contacts) ? json.contacts : [];
  const total = json?.meta?.total ?? json?.total ?? contacts.length;

  return { contacts, total };
}

/**
 * Varre todos os contacts pra coletar as tags únicas usadas na conta.
 * Usa cache de 10 min.
 */
let _tagsCache = null;
let _tagsCachedAt = 0;
const TAGS_TTL_MS = 10 * 60 * 1000;

export async function getAllTags() {
  if (_tagsCache && Date.now() - _tagsCachedAt < TAGS_TTL_MS) return _tagsCache;

  const tagSet = new Set();
  let ghPage = 1;
  while (true) {
    const json = await ghlPost("/contacts/search", {
      locationId,
      page: ghPage,
      pageLimit: 100,
      filters: [],
      sort: [{ field: "dateAdded", direction: "desc" }],
    });
    const batch = Array.isArray(json?.contacts) ? json.contacts : [];
    if (batch.length === 0) break;
    for (const c of batch) {
      for (const t of (c.tags || [])) tagSet.add(t);
    }
    if (batch.length < 100) break;
    ghPage++;
    if (ghPage > 20) break;
  }

  _tagsCache = Array.from(tagSet).sort();
  _tagsCachedAt = Date.now();
  return _tagsCache;
}

export const ghlService = {
  lookupByEmail,
  updateContact,
  upsertContact,
  ensureOpportunity,
  listContactsInRange,
  mapContact,
  getPipelines,
  getPipelineMaps,
  getContactsPage,
  getAllTags,
};
