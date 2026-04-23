// Configuração do checkout público da ViaJourney
// Mapeia cada plano do checkout para o appointment_type do Elation e o signup URL do Hint.

export const CHECKOUT_CONFIG = {
  // practiceId é unificado: a MESMA prática atende a booking pública /book/api
  // e a OAuth /api/2.0/*. Descoberto empiricamente — antes usávamos uma prática
  // legacy separada (1180058828472324), mas essa não dispara emails do Passport.
  practiceId:        Number(process.env.ELATION_PRACTICE_ID         || 144048787554308),
  physicianId:       Number(process.env.ELATION_PHYSICIAN_ID        || 144048791879682),
  serviceLocationId: Number(process.env.ELATION_SERVICE_LOCATION_ID || 144048787620087),
  elationPublicBase: process.env.ELATION_PUBLIC_BASE || "https://sandbox.elationemr.com",
  hintSignupBase:    process.env.HINT_SIGNUP_BASE    || "https://viajourneytelehealth.hint.com/signup",
  // DOIS timezones distintos:
  // - sourceTimezone: como a Elation armazena (config dela está errada — prática é em FL
  //   mas cadastrada como LA). Usado pra interpretar os naive datetimes de /book/api/.../availabilities
  //   e pra reconstruir a offset correta antes de POSTar em /book/api/appointments.
  // - displayTimezone: como mostrar pro usuário. A prática é fisicamente em FL e os pacientes
  //   no Brasil — ET faz sentido pra ambos (BR e clínica). O frontend exibe nesse TZ.
  sourceTimezone:  "America/Los_Angeles",
  displayTimezone: "America/New_York",
  timezone:        "America/New_York", // alias legacy — display


  // Aliases de retrocompatibilidade — código antigo ainda usa .oauth.*
  // TODO: remover após migrar todos os consumers.
  oauth: {
    practiceId:        Number(process.env.ELATION_PRACTICE_ID         || 144048787554308),
    physicianId:       Number(process.env.ELATION_PHYSICIAN_ID        || 144048791879682),
    serviceLocationId: Number(process.env.ELATION_SERVICE_LOCATION_ID || 144048787620087),
  },
};

// Plans — slug (usado na URL do checkout) → dados
// appointmentTypeId: ID do Elation (descoberto via /book/api/practices/{id})
// hintSignupSlug: slug do signup page no Hint (viajourneytelehealth.hint.com/signup/{slug})
// Plans — slug → metadados LOCAIS apenas. Preço e billing vêm do Hint (via /quotes em runtime).
// `hintPlanId`: ID do Hint (descoberto via GET /api/provider/plans)
// `appointmentTypeId`: ID do Elation (slots de agendamento)
// `durationMin`: duração da consulta (não vem do Hint)
export const PLANS = {
  // IDs unificados (mesma prática p/ booking público + OAuth).
  // Descobertos via /api/2.0/appointment_types/ — só esses têm is_telehealth:true
  // e patient_form_ids configurados (dispara Passport + emails).
  "consulta-avulsa": {
    slug: "consulta-avulsa",
    name: "Consulta Avulsa",
    hintPlanId: "pln-r83pbK9VSnvv",
    appointmentTypeId: 144607022809193,              // "One Time"
    oauthAppointmentTypeId: 144607022809193,
    appointmentTypeName: "One Time",
    durationMin: 15,
    oneOff: true,  // consulta única — cancelar membership após 1ª cobrança
  },
  "clube-saude": {
    slug: "clube-saude",
    name: "Clube Saúde",
    hintPlanId: "pln-ExR8mMWRvmDy",
    appointmentTypeId: 144607020515433,              // "Member"
    oauthAppointmentTypeId: 144607020515433,
    appointmentTypeName: "Member",
    durationMin: 30,
    oneOff: false,
  },
  "concierge": {
    slug: "concierge",
    name: "Via Journey Concierge",
    hintPlanId: "pln-lReUxne3bPcN",
    appointmentTypeId: 144607021105257,              // "Concierge"
    oauthAppointmentTypeId: 144607021105257,
    appointmentTypeName: "Concierge",
    durationMin: 40,
    oneOff: false,
  },
};

export function getPlan(slug) {
  return PLANS[slug] || null;
}

// getHintSignupUrl removido — checkout agora é 100% in-house (sem redirect pro Hint).
// Pagamento é coletado via Rainforest Payment Component + POST /memberships.
