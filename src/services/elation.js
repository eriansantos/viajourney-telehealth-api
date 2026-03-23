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
      grant_type: "client_credentials",
      client_id: clientId,
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

async function get(path, params = {}) {
  const token = await getToken();
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text();
    const err = new Error(`Elation ${res.status}: ${text}`);
    err.status = res.status === 401 ? 502 : res.status;
    throw err;
  }

  return res.json();
}

// ─── Raw API calls ────────────────────────────────────────────────────────────
export const elationService = {
  getAppointments: (params) => get("/api/2.0/appointments/", params),
  getVisitNotes:   (params) => get("/api/2.0/visit_notes/", params),
  getPhysicians:   (params) => get("/api/2.0/physicians/", params),
  getPatients:     (params) => get("/api/2.0/patients/", params),
};
