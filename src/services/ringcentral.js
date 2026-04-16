import config from "../config/index.js";

const RC_BASE   = "https://platform.ringcentral.com";
const TOKEN_URL = `${RC_BASE}/restapi/oauth/token`;

// ─── Token cache ──────────────────────────────────────────────────────────────
let _token       = null;
let _tokenExpiry = 0;

/**
 * Retorna true se RC está configurado para autenticar.
 * Suporta dois métodos:
 *   1. JWT Grant  — RC_JWT_TOKEN preenchido
 *   2. Password Grant — RC_USERNAME + RC_PASSWORD preenchidos
 */
export function rcIsConfigured() {
  const { clientId, clientSecret, jwtToken, username, password } = config.ringcentral;
  if (!clientId || !clientSecret) return false;
  return !!(jwtToken || (username && password));
}

async function getToken() {
  if (!rcIsConfigured()) throw new Error("RingCentral não configurado");
  if (_token && Date.now() < _tokenExpiry) return _token;

  const { clientId, clientSecret, jwtToken, username, password } = config.ringcentral;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  // ── Escolhe o grant type disponível ────────────────────────────────────────
  const body = jwtToken
    ? new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion:  jwtToken,
      })
    : new URLSearchParams({
        grant_type: "password",
        username,
        password,
      });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${creds}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RC auth ${res.status}: ${text}`);
  }

  const data   = await res.json();
  _token       = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// ─── Authenticated GET ────────────────────────────────────────────────────────
async function rcGet(path, params = {}) {
  const token = await getToken();
  const url   = new URL(`${RC_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`RC ${path} → ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

// ─── Paginação automática ─────────────────────────────────────────────────────
async function rcGetAll(path, baseParams = {}) {
  const records = [];
  let page = 1;

  while (true) {
    const data  = await rcGet(path, { ...baseParams, page, perPage: 1000 });
    const batch = data.records ?? [];
    records.push(...batch);

    const nav = data.navigation ?? data.paging ?? {};
    if (!nav.nextPage) break;
    page++;
    if (page > 10) break; // segurança: máx 10.000 registros
  }

  return records;
}

// ─── API calls ────────────────────────────────────────────────────────────────
export const rcService = {
  // Log de chamadas de voz da conta (todos os ramais)
  getCallLog: (params) =>
    rcGetAll("/restapi/v1.0/account/~/call-log", { ...params, type: "Voice" }),

  // Mensagens SMS do ramal principal
  getMessages: (params) =>
    rcGetAll("/restapi/v1.0/account/~/extension/~/message-store", {
      ...params,
      messageType: "SMS",
    }),
};
