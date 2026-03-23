import { config } from "dotenv";
config();

const {
  ELATION_CLIENT_ID,
  ELATION_CLIENT_SECRET,
  ELATION_BASE_URL,
  ELATION_TOKEN_URL,
} = process.env;

// ─── Token cache ─────────────────────────────────────────────────────────────
let _token = null;
let _tokenExpiry = 0;

async function getToken() {
  if (_token && Date.now() < _tokenExpiry) return _token;

  const res = await fetch(ELATION_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: ELATION_CLIENT_ID,
      client_secret: ELATION_CLIENT_SECRET,
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

// ─── Generic GET helper ──────────────────────────────────────────────────────
async function elationGet(path, params = {}) {
  const token = await getToken();
  const url = new URL(`${ELATION_BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Elation API error ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Paginação completa (busca todas as páginas) ──────────────────────────────
async function elationGetAll(path, params = {}) {
  let results = [];
  let nextUrl = null;

  const first = await elationGet(path, { ...params, limit: 100 });
  results = results.concat(first.results || []);
  nextUrl = first.next;

  while (nextUrl) {
    const token = await getToken();
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) break;
    const page = await res.json();
    results = results.concat(page.results || []);
    nextUrl = page.next;
  }

  return results;
}

// ─── Módulo 2 — Visit Volume & Utilization ───────────────────────────────────

/**
 * Appointments com filtro de data e status
 * Params: scheduled_date_from, scheduled_date_to, physician, status
 */
export async function getAppointments(params = {}) {
  return elationGet("/api/2.0/appointments/", params);
}

/**
 * Visit notes (registros clínicos de visitas)
 * Params: document_date_from, document_date_to, physician, patient
 */
export async function getVisitNotes(params = {}) {
  return elationGet("/api/2.0/visit_notes/", params);
}

/**
 * Lista todos os médicos da prática
 */
export async function getPhysicians(params = {}) {
  return elationGet("/api/2.0/physicians/", params);
}

/**
 * Lista pacientes com filtros opcionais
 * Params: primary_physician, created_date_from, created_date_to
 */
export async function getPatients(params = {}) {
  return elationGet("/api/2.0/patients/", params);
}

/**
 * Resumo de appointments agrupados por médico/status para o Módulo 2
 */
export async function getVisitVolumeSummary({ from, to } = {}) {
  const params = {};
  if (from) params.scheduled_date_from = from;
  if (to) params.scheduled_date_to = to;

  const [appointmentsData, physiciansData] = await Promise.all([
    elationGet("/api/2.0/appointments/", { ...params, limit: 100 }),
    elationGet("/api/2.0/physicians/"),
  ]);

  const appointments = appointmentsData.results || [];
  const physicians = physiciansData.results || [];

  // Agrupa por médico
  const byPhysician = {};
  for (const appt of appointments) {
    const pid = appt.physician;
    if (!byPhysician[pid]) byPhysician[pid] = { total: 0, byStatus: {} };
    byPhysician[pid].total++;
    const status = appt.status?.status || "Unknown";
    byPhysician[pid].byStatus[status] = (byPhysician[pid].byStatus[status] || 0) + 1;
  }

  // Agrupa por status geral
  const byStatus = {};
  for (const appt of appointments) {
    const status = appt.status?.status || "Unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  // Agrupa por modo (in-person vs video)
  const byMode = { IN_PERSON: 0, VIDEO: 0, OTHER: 0 };
  for (const appt of appointments) {
    const mode = appt.mode || "OTHER";
    byMode[mode] = (byMode[mode] || 0) + 1;
  }

  return {
    total: appointmentsData.count ?? appointments.length,
    byStatus,
    byMode,
    byPhysician: physicians.map((ph) => ({
      id: ph.id,
      name: `${ph.first_name} ${ph.last_name}`,
      credentials: ph.credentials,
      is_active: ph.is_active,
      stats: byPhysician[ph.id] || { total: 0, byStatus: {} },
    })),
    period: { from: from || null, to: to || null },
  };
}
