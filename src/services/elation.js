import config from "../config/index.js";

const { clientId, clientSecret, baseUrl, tokenUrl } = config.elation;

// ─── Token cache ─────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "client_credentials",
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Elation OAuth error ${res.status}: ${text}`);
  }

  const data = await res.json();
  _token = data.access_token;
  _tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return _token;
}

// ─── Fetch with timeout ───────────────────────────────────────────────────────
const TIMEOUT_MS = 10_000; // 10 s

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

// ─── Retry with exponential backoff ──────────────────────────────────────────
const MAX_RETRIES  = 2;
const BASE_DELAY   = 300; // ms

async function fetchWithRetry(url, options = {}, attempt = 0) {
  try {
    const res = await fetchWithTimeout(url, options);

    // Retry on 429 (rate-limit) or 5xx (server errors)
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const delay = BASE_DELAY * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }

    return res;
  } catch (err) {
    // Retry on timeout (AbortError) or network failures
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY * 2 ** attempt;
      await new Promise((r) => setTimeout(r, delay));
      return fetchWithRetry(url, options, attempt + 1);
    }
    throw err;
  }
}

// ─── Authenticated GET ────────────────────────────────────────────────────────
async function get(path, params = {}) {
  const token = await getToken();
  const url   = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetchWithRetry(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`Elation ${res.status}: ${text}`);
    err.status = res.status === 401 ? 502 : res.status;
    throw err;
  }

  return res.json();
}

// ─── Authenticated POST ───────────────────────────────────────────────────────
async function post(path, body) {
  const token = await getToken();
  const res = await fetchWithRetry(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      Accept:         "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    const err  = new Error(`Elation POST ${path} → ${res.status}: ${text}`);
    err.status = res.status;
    err.body   = body;
    throw err;
  }
  return res.json();
}

// ─── Raw API calls ────────────────────────────────────────────────────────────
export const elationService = {
  getAppointments:  (params) => get("/api/2.0/appointments/",  params),
  getVisitNotes:    (params) => get("/api/2.0/visit_notes/",   params),
  getPhysicians:    (params) => get("/api/2.0/physicians/",    params),
  getPatients:      (params) => get("/api/2.0/patients/",      params),
  getPrescriptions: (params) => get("/api/2.0/medications/",   params),

  /**
   * POST /patients/ — cria paciente no Elation (OAuth privado).
   * Campos mínimos: first_name, last_name, dob (YYYY-MM-DD), sex, primary_physician, caregiver_practice.
   */
  createPatient: (patient) => post("/api/2.0/patients/", patient),

  /**
   * POST /appointments/ — cria appointment.
   * Campos: scheduled_date (ISO), duration (min), reason, patient, physician,
   * practice, service_location, appointment_type_id.
   */
  createAppointment: (appointment) => post("/api/2.0/appointments/", appointment),
};
