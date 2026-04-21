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

// ─── API calls (Practice/Provider API — path UNVERSIONED) ────────────────────
export const hintService = {
  getMemberships:  (params) => hintGetAll("/api/provider/memberships",  params),
  getPlans:        (params) => hintGetAll("/api/provider/plans",        params),
  getPatients:     (params) => hintGetAll("/api/provider/patients",     params),
  getInvoices:     (params) => hintGetAll("/api/provider/invoices",     params),
  getPayments:     (params) => hintGetAll("/api/provider/payments",     params),
  getPractitioners:(params) => hintGetAll("/api/provider/practitioners",params),
};
