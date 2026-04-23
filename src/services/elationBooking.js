// Wrapper da API pública de booking do Elation (/book/api).
// Descoberto inspecionando a página pública de booking — este endpoint NÃO requer
// OAuth, mas requer CSRF + sessão Django. Crucialmente, o POST /book/api/appointments
// é o ÚNICO caminho que dispara emails de confirmação + convite do Elation Passport +
// formulários (equivalente ao fluxo que o paciente teria se reservasse pela UI).
// Alternativa OAuth (/api/2.0/appointments) não dispara emails.

import { CHECKOUT_CONFIG } from "../config/checkout.js";

const TIMEOUT_MS = 10_000;

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// ─── Parser de Set-Cookie headers ────────────────────────────────────────────
// Node fetch não expõe cookies individuais facilmente — precisamos parsear.
function parseCookies(setCookieHeader) {
  if (!setCookieHeader) return {};
  // setCookieHeader pode ser string única ou array (depende do runtime).
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  const jar = {};
  for (const line of raw) {
    const [pair] = line.split(";");
    const [k, ...rest] = pair.split("=");
    if (k) jar[k.trim()] = rest.join("=").trim();
  }
  return jar;
}

// Pega todos os Set-Cookie via headers.getSetCookie() (Node 20+) com fallback.
function getSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function serializeCookies(jar) {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

// ─── Requisição pública SEM sessão (listar slots etc) ────────────────────────
async function request(method, path, { params, body } = {}) {
  const url = new URL(`${CHECKOUT_CONFIG.elationPublicBase}${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetchWithTimeout(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }

  if (!res.ok || json?.status === "error") {
    const err = new Error(`Elation booking ${method} ${path} → ${res.status}: ${JSON.stringify(json?.message || json)}`);
    err.status = res.status >= 400 && res.status < 500 ? res.status : 502;
    err.upstream = json;
    throw err;
  }
  return json;
}

// ─── Sessão Django (csrftoken + sessionid) ───────────────────────────────────
// Fluxo descoberto via MITM no browser:
//   1. GET /book/{practiceId}  → Set-Cookie: csrftoken=...; sessionid=...
//   2. POST /book/api/appointments  → headers: X-CSRFToken + Cookie: csrftoken+sessionid
// O mesmo csrftoken vai no header e no cookie (Django double-submit defense).
async function acquireSession() {
  const url = `${CHECKOUT_CONFIG.elationPublicBase}/book/${CHECKOUT_CONFIG.practiceId}`;
  const res = await fetchWithTimeout(url, { method: "GET", headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`Elation booking GET /book/${CHECKOUT_CONFIG.practiceId} falhou: ${res.status}`);

  const jar = {};
  for (const line of getSetCookies(res.headers)) {
    Object.assign(jar, parseCookies(line));
  }
  if (!jar.csrftoken) throw new Error("Elation booking: csrftoken cookie ausente");
  return jar;
}

export const elationBooking = {
  getPractice: () =>
    request("GET", `/book/api/practices/${CHECKOUT_CONFIG.practiceId}`),

  // Retorna [{ provider_id, service_location_id, appointment_type_id, available_datetimes: [...] }]
  getAvailabilities: ({ appointmentTypeId, startDate, endDate }) =>
    request("GET", `/book/api/${CHECKOUT_CONFIG.practiceId}/availabilities/practice-availabilities`, {
      params: {
        appointment_type_id: appointmentTypeId,
        start_date: startDate,
        end_date: endDate,
      },
    }),

  /**
   * POST /book/api/appointments — cria paciente + appointment numa única chamada
   * e DISPARA: (1) email de confirmação, (2) convite do Passport, (3) convite de forms.
   *
   * @param {object} input
   * @param {object} input.appointment  - { appointment_type_id, scheduled_date (ISO com TZ) }
   * @param {object} input.patient      - { first_name, last_name, dob, email, phone, sex, actual_name? }
   * @param {number} input.physicianId
   * @param {number} input.serviceLocationId
   * @returns {Promise<{ patient, appointment }>}
   */
  async createPublicAppointment({ appointment, patient, physicianId, serviceLocationId }) {
    const jar = await acquireSession();

    const url = `${CHECKOUT_CONFIG.elationPublicBase}/book/api/appointments`;
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-CSRFToken": jar.csrftoken,
        Cookie: serializeCookies(jar),
        Referer: `${CHECKOUT_CONFIG.elationPublicBase}/book/${CHECKOUT_CONFIG.practiceId}/account`,
      },
      body: JSON.stringify({
        appointment,
        patient: { actual_name: "", ...patient },
        physician_id:       physicianId,
        practice_id:        CHECKOUT_CONFIG.practiceId,
        service_location_id: serviceLocationId,
      }),
    });

    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }

    if (!res.ok || json?.status === "error") {
      const err = new Error(`Elation booking POST /appointments → ${res.status}: ${text.slice(0, 500)}`);
      err.status = res.status;
      err.upstream = json;
      throw err;
    }
    return json.data; // { patient, appointment }
  },

  cancelAppointment: (appointmentId, token) =>
    request("POST", `/book/api/appointments/${appointmentId}/cancel`, { body: { token } }),
};
