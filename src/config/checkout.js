function requireEnv(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}
function envInt(key) { return Number(requireEnv(key)); }

export const CHECKOUT_CONFIG = {
  practiceId:                   envInt("ELATION_PRACTICE_ID"),
  physicianId:                  envInt("ELATION_PHYSICIAN_ID"),
  serviceLocationId:            envInt("ELATION_SERVICE_LOCATION_ID"),
  elationPublicBase:            requireEnv("ELATION_PUBLIC_BASE"),
  availabilityAppointmentTypeId:envInt("ELATION_AVAILABILITY_TYPE_ID"),
  // sourceTimezone: como a Elation armazena internamente (config da prática está
  // errada — FL mas cadastrada como LA). Usado para interpretar datetimes naive.
  // displayTimezone: como mostrar ao paciente (ET — FL + pacientes no Brasil).
  sourceTimezone:  process.env.ELATION_SOURCE_TZ  || "America/Los_Angeles",
  displayTimezone: process.env.ELATION_DISPLAY_TZ || "America/New_York",
  timezone:        process.env.ELATION_DISPLAY_TZ || "America/New_York",
};

// Metadados locais por slug — apenas o que o Hint não fornece.
// appointmentTypeId vem de env vars (diferentes por ambiente Elation).
// durationMin e oneOff são constantes de negócio (não mudam entre ambientes).
export const PLAN_META = {
  "consulta-avulsa": {
    slug:              "consulta-avulsa",
    appointmentTypeId: envInt("ELATION_APPT_TYPE_CONSULTA_AVULSA"),
    durationMin:       15,
    oneOff:            true,
  },
  "clube-saude": {
    slug:              "clube-saude",
    appointmentTypeId: envInt("ELATION_APPT_TYPE_CLUBE_SAUDE"),
    durationMin:       30,
    oneOff:            false,
  },
  "concierge": {
    slug:              "concierge",
    appointmentTypeId: envInt("ELATION_APPT_TYPE_CONCIERGE"),
    durationMin:       40,
    oneOff:            false,
  },
};

// Lead sources do Hint (campo "How did you hear about us?").
// O Hint espera lead_source como objeto { id: "lds-..." } na criação do paciente.
// IDs confirmados via GET /api/provider/lead_sources (produção).
const HINT_LEAD_SOURCES = {
  "Article or blog post": "lds-OrxE8PbW8dNB",
  "Online ad":            "lds-cirdU5ckzRFm",
  "Online search":        "lds-qvqtVNLzEGLe",
  "Other":                "lds-GLdhxrSG9JdK",
  "Radio":                "lds-u9adNjx4ABew",
  "Social media":         "lds-8TjzawE4ulsc",
  "TV":                   "lds-smqbqaNm0Ll4",
  "Word of mouth":        "lds-svlUsirrCTU1",
};

// Converte o label do checkout no objeto lead_source esperado pelo Hint.
// Retorna null se não reconhecer (não envia o campo → não quebra o cadastro).
export function leadSourceForHint(label) {
  const id = HINT_LEAD_SOURCES[label];
  return id ? { id } : null;
}

// Deriva slug a partir do nome do plano no Hint
export function slugFromHintName(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes("concierge"))        return "concierge";
  if (n.includes("clube") || n.includes("saúde") || n.includes("saude")) return "clube-saude";
  if (n.includes("avulsa"))           return "consulta-avulsa";
  return null;
}

export function getPlanMeta(slug) {
  return PLAN_META[slug] || null;
}
