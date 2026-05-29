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
  // appointmentTypeId usado para CONSULTAR disponibilidade em todos os planos.
  // É o mesmo médico/agenda; o tipo específico do plano só importa na hora do booking.
  // Em sandbox só o tipo "Member" (clube-saude) tem slots configurados.
  availabilityAppointmentTypeId: Number(process.env.ELATION_AVAILABILITY_TYPE_ID || 144607020515433),
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

// Metadados locais por slug — apenas o que o Hint não fornece:
// appointmentTypeId (Elation), durationMin e oneOff.
// Os planos em si (id, name, preço) vêm sempre da API do Hint.
// IDs descobertos via /api/2.0/appointment_types/ — só esses têm is_telehealth:true
// e patient_form_ids configurados (dispara Passport + emails).
export const PLAN_META = {
  "consulta-avulsa": {
    slug: "consulta-avulsa",
    appointmentTypeId: 144607022809193,
    appointmentTypeName: "One Time",
    durationMin: 15,
    oneOff: true,
  },
  "clube-saude": {
    slug: "clube-saude",
    appointmentTypeId: 144607020515433,
    appointmentTypeName: "Member",
    durationMin: 30,
    oneOff: false,
  },
  "concierge": {
    slug: "concierge",
    appointmentTypeId: 144607021105257,
    appointmentTypeName: "Concierge",
    durationMin: 40,
    oneOff: false,
  },
};

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
