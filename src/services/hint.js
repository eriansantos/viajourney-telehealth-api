import config from "../config/index.js";

const { apiKey, baseUrl } = config.hint;

/** Hint está pronto para chamadas? */
export function hintIsConfigured() {
  return !!apiKey;
}

// ─── Fetch com timeout ───────────────────────────────────────────────────────
const TIMEOUT_MS = 10_000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── Retry com backoff exponencial ───────────────────────────────────────────
const MAX_RETRIES = 2;
const BASE_DELAY  = 300;

async function fetchWithRetry(url, options = {}, attempt = 0) {
  try {
    const res = await fetchWithTimeout(url, options);
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY * 2 ** attempt));
      return fetchWithRetry(url, options, attempt + 1);
    }
    return res;
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, BASE_DELAY * 2 ** attempt));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

// ─── GET autenticado (Bearer) ────────────────────────────────────────────────
async function hintGet(path, params = {}) {
  if (!hintIsConfigured()) throw new Error("Hint não configurado");

  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetchWithRetry(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept:        "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`Hint ${path} → ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  // Hint expõe paginação via headers: x-count / x-total-count
  const total = Number(res.headers.get("x-total-count") || 0);
  const data  = await res.json();
  return { data, total };
}

// ─── Paginação automática (limit + offset) ───────────────────────────────────
// Hint usa query params `limit` (tamanho da página) + `offset` (pular N registros).
async function hintGetAll(path, baseParams = {}) {
  const records = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const { data, total } = await hintGet(path, { ...baseParams, limit, offset });
    const batch = Array.isArray(data) ? data : [];
    records.push(...batch);
    if (batch.length < limit) break;
    if (total && records.length >= total) break;
    offset += limit;
    if (offset > 50_000) break; // segurança
  }

  return records;
}

// ─── POST autenticado (Bearer) ───────────────────────────────────────────────
async function hintPost(path, body) {
  if (!hintIsConfigured()) throw new Error("Hint não configurado");

  const res = await fetchWithRetry(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept:        "application/json",
      "Content-Type":"application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`Hint POST ${path} → ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// ─── API calls (Practice/Provider API — path UNVERSIONED) ────────────────────
export const hintService = {
  getMemberships:  (params) => hintGetAll("/api/provider/memberships",  params),
  getPlans:        (params) => hintGetAll("/api/provider/plans",        params),
  getPatients:     (params) => hintGetAll("/api/provider/patients",     params),
  getInvoices:     (params) => hintGetAll("/api/provider/invoices",     params),
  getPayments:     (params) => hintGetAll("/api/provider/payments",     params),
  getPractitioners:(params) => hintGetAll("/api/provider/practitioners",params),

  /**
   * POST /quotes — retorna preço de uma membership sem criar nada.
   * @param {string} planId   Hint plan id (pln-…)
   * @param {object} [opts]
   * @param {number} [opts.age=35]    age do membro (obrigatório p/ quote)
   * @param {number} [opts.periodInMonths=1]   1|3|6|12
   */
  createQuote: (planId, { age = 35, periodInMonths = 1 } = {}) =>
    hintPost("/api/provider/quotes", {
      plan: { id: planId },
      members: [{ age }],
      period_in_months: periodInMonths,
    }),

  /**
   * POST /patients — cria paciente no Hint.
   * Campos mínimos: first_name, last_name, email. dob (YYYY-MM-DD) recomendado.
   * @param {object} patient
   * @returns {Promise<{id: string, ...}>}
   */
  createPatient: (patient) =>
    hintPost("/api/provider/patients", patient),

  /**
   * POST /patients/:id/payment_methods/setup — cria setup intent do Rainforest.
   * Retorna { payment_processor, payment_method_config_id, session_key, allowed_methods }.
   */
  createSetupIntent: (patientId, { userIsOwner = true, acceptsBank = false } = {}) =>
    hintPost(`/api/provider/patients/${patientId}/payment_methods/setup`, {
      user_is_owner: userIsOwner,
      accepts_bank: acceptsBank,
    }),

  /**
   * POST /patients/:id/payment_methods — anexa método tokenizado pela Rainforest.
   * @param {string} patientId
   * @param {string} rainforestId  token retornado pelo Rainforest Payment Component
   */
  createPaymentMethod: (patientId, rainforestId) =>
    hintPost(`/api/provider/patients/${patientId}/payment_methods`, {
      rainforest_id: rainforestId,
    }),

  /**
   * POST /memberships — cria assinatura para o paciente.
   * @param {object} opts
   * @param {string} opts.planId          pln-…
   * @param {string} opts.patientId       sbx-pat-…
   * @param {string} opts.startDate       "YYYY-MM-DD"
   * @param {number} [opts.periodInMonths=1]   1|3|6|12
   */
  /**
   * POST /memberships — cria assinatura.
   * Shape descoberto empiricamente (docs incompletos):
   *   - owner.id            — quem paga (subscriber)
   *   - membership_patients — lista de membros. Cada um tem:
   *       patient.id        (pra linkar paciente existente)
   *       member_type       ("employee" p/ subscriber principal, "spouse" ou "dependent" p/ adicionais)
   *   - plan.id, start_date, period_in_months (1|3|6|12)
   */
  createMembership: ({ planId, patientId, startDate, periodInMonths = 1, memberType = "employee" }) =>
    hintPost("/api/provider/memberships", {
      plan:  { id: planId },
      owner: { id: patientId },
      membership_patients: [{ patient: { id: patientId }, member_type: memberType }],
      start_date: startDate,
      period_in_months: periodInMonths,
    }),
};
