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
 * Mapeia contact do GHL → shape que o checkout consome.
 * Campos custom ficam em `customFields` (array de {id, value}) — se houver
 * mapeamento conhecido (ex: "state", "reason") extraímos aqui.
 */
function mapContact(c) {
  if (!c) return null;
  return {
    ghlContactId: c.id,
    // *Raw preserva a capitalização original ("Roxanne"); firstName fica lowercase.
    firstName:    c.firstNameRaw || c.firstName || "",
    lastName:     c.lastNameRaw  || c.lastName  || "",
    email:        c.email     || "",
    phone:        c.phone     || "",
    dob:          c.dateOfBirth || null,
    state:        c.state || "",
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

export const ghlService = {
  lookupByEmail,
};
