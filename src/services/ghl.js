// GoHighLevel CRM service.
// TODO: Erian está conseguindo acesso à API. Quando disponível, substituir o stub abaixo
// por chamadas reais ao GHL. Flow alvo: `lookupByEmail(email)` → `{ firstName, lastName, phone, state, reason, ... }`
// Até lá, o checkout continua recebendo os dados por URL params vindos da LP.

import config from "../config/index.js";

export function ghlIsConfigured() {
  return !!config.ghl.apiKey;
}

/**
 * Busca dados do lead cadastrado no GHL a partir do email.
 * @param {string} email
 * @returns {Promise<null | { firstName, lastName, phone, state, reason, source, ghlContactId }>}
 */
export async function lookupByEmail(email) {
  if (!ghlIsConfigured()) return null;
  // TODO implementar chamada real ao endpoint GHL de contacts/search
  // Referência (provável): GET https://services.leadconnectorhq.com/contacts/search?email=
  return null;
}
