// Controladores das rotas públicas de checkout.
// Fonte dos slots: API pública /book/api do Elation (sem credencial).
// Fonte dos dados do paciente: URL params da LP (provisório) — migração futura para GHL por email.

import { CHECKOUT_CONFIG, PLAN_META, getPlanMeta, slugFromHintName, leadSourceForHint } from "../config/checkout.js";
import { elationBooking } from "../services/elationBooking.js";
import { lookupByEmail, updateContact, ghlIsConfigured } from "../services/ghl.js";
import { hintService, hintIsConfigured } from "../services/hint.js";
import { sendConfirmationEmail } from "../services/email.js";

function isoDate(d) { return d.toISOString().slice(0, 10); }

/**
 * A booking API pública retorna datetimes "naive" (sem offset), ex: "2026-04-27T06:30:00".
 * O Elation OAuth rejeita datetimes sem TZ ("Date/time objects must be timezone aware").
 * Este helper calcula o offset correto de America/New_York para a data dada
 * (considera DST automaticamente via Intl) e anexa, produzindo "2026-04-27T06:30:00-04:00".
 */
function toTZAware(naiveLocal, tz = CHECKOUT_CONFIG.timezone) {
  if (!naiveLocal || /[zZ]|[+-]\d{2}:?\d{2}$/.test(naiveLocal)) return naiveLocal;
  const asUtc = new Date(naiveLocal + "Z");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, timeZoneName: "shortOffset",
  }).formatToParts(asUtc);
  const off = parts.find(p => p.type === "timeZoneName")?.value || "GMT+0";
  const m = off.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return naiveLocal;
  const sign = m[1];
  const h = m[2].padStart(2, "0");
  const mm = (m[3] || "00").padStart(2, "0");
  return `${naiveLocal}${sign}${h}:${mm}`;
}

/**
 * Converte um datetime naive de uma timezone para outra — ambos sem offset.
 * Ex: "2026-04-27T00:30:00" (LA) → "2026-04-27T03:30:00" (NY).
 * Usado pra traduzir entre sourceTimezone (Elation) e displayTimezone (UI).
 */
function shiftNaive(naive, fromTz, toTz) {
  if (!naive) return naive;
  // 1) converte naive+fromTz em instant real (ISO com offset)
  const aware = toTZAware(naive, fromTz);
  const d = new Date(aware);
  // 2) formata esse instant em toTz como naive "YYYY-MM-DDTHH:mm:ss"
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: toTz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find(p => p.type === t)?.value;
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hh}:${get("minute")}:${get("second")}`;
}

export const checkoutController = {

  /**
   * GET /checkout/lookup?email=...
   * Busca o lead no GHL pelo email. Retorna { found, patient, complete, missing }.
   * `complete` = true quando firstName/email/dob/sex estão todos presentes —
   * nesse caso o frontend pula a tela de preenchimento.
   */
  async lookup(req, res, next) {
    try {
      const email = String(req.query.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email é obrigatório" });
      if (!ghlIsConfigured()) {
        return res.json({ found: false, patient: null, complete: false, missing: ["*"] });
      }
      const contact = await lookupByEmail(email);
      if (!contact) return res.json({ found: false, patient: null, complete: false, missing: ["*"] });

      // Normaliza shape pro que o form do VPayment consome.
      const patient = {
        firstName: contact.firstName || "",
        lastName:  contact.lastName  || "",
        email:     contact.email     || email,
        phone:     contact.phone     || "",
        state:     contact.state     || "",
        flStatus:  contact.flStatus  || null,   // "FL" | "OUT_OF_STATE" | "BR" | null
        reason:    contact.reason    || "",
        dob:       contact.dob       || "",
        sex:       contact.sex       || "",
        ghlContactId: contact.ghlContactId || null,
      };
      // Quando flStatus="OUT_OF_STATE", o state US também é obrigatório
      // pra rotear o atendimento corretamente. FL e BR não precisam (FL é
      // implícito; BR não tem state US).
      const required = ["firstName", "email", "dob", "sex"];
      if (patient.flStatus === "OUT_OF_STATE") required.push("state");
      const missing  = required.filter(k => !patient[k]);

      res.json({ found: true, patient, complete: missing.length === 0, missing });
    } catch (e) { next(e); }
  },

  /**
   * GET /checkout/plans — busca planos disponíveis do Hint e enriquece com
   * metadados locais (slug, appointmentTypeId, durationMin, oneOff).
   * O preço vem do Hint via /quotes. O id do plano vem do Hint.
   */
  async plans(_req, res, next) {
    try {
      const hintPlans = hintIsConfigured() ? await hintService.getPlans() : [];

      const plans = await Promise.all(
        hintPlans.map(async (hp) => {
          const slug = slugFromHintName(hp.name);
          const meta = slug ? getPlanMeta(slug) : null;

          let priceCents = null;
          let billingPeriod = null;
          let registrationFeeCents = 0;

          try {
            const quote = await hintService.createQuote(hp.id, { age: 35, periodInMonths: 1 });
            priceCents           = quote?.ongoing_amount_in_cents ?? null;
            billingPeriod        = quote?.billing_period ?? null;
            registrationFeeCents = quote?.registration_fee_in_cents ?? 0;
          } catch (err) {
            console.warn(`[checkout.plans] quote falhou para ${hp.name}:`, err.message);
          }

          return {
            id:   hp.id,
            slug: slug || hp.name.toLowerCase().replace(/\s+/g, "-"),
            name: hp.name,
            durationMin:          meta?.durationMin ?? null,
            oneOff:               meta?.oneOff ?? false,
            appointmentTypeId:    meta?.appointmentTypeId ?? null,
            priceCents,
            billingPeriod,
            registrationFeeCents,
            recurring: meta?.oneOff ? false : (billingPeriod || "monthly"),
          };
        })
      );

      res.json({ plans });
    } catch (e) { next(e); }
  },

  /**
   * GET /checkout/availability?plan=clube-saude&days=14
   * Retorna lista de slots disponíveis agrupados por dia para o plano escolhido.
   */
  async availability(req, res, next) {
    try {
      const planSlug = String(req.query.plan || "");
      const days = Math.min(Number(req.query.days || 14), 30);
      const meta = getPlanMeta(planSlug);
      if (!meta) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      const now = new Date();
      const start = new Date(now);
      const end = new Date(now);
      end.setDate(end.getDate() + days);

      const availTypeId = CHECKOUT_CONFIG.availabilityAppointmentTypeId || meta.appointmentTypeId;
      const response = await elationBooking.getAvailabilities({
        appointmentTypeId: availTypeId,
        startDate: isoDate(start),
        endDate: isoDate(end),
      });

      // A API retorna [{ provider_id, service_location_id, appointment_type_id, available_datetimes:[...] }]
      const buckets = Array.isArray(response?.data) ? response.data : [];
      // Não filtra por appointment_type_id — todos os buckets retornados são válidos
      // (já filtramos pelo availTypeId na query acima).
      const matching = buckets;

      // Mantém o grid nativo do Elation (15 em 15 min) — mesma UX da página pública
      // /book/{practiceId}. Dedup apenas, pois Elation as vezes retorna slots
      // duplicados em buckets diferentes.
      const seen = new Set();
      const byDay = new Map();
      for (const b of matching) {
        for (const dt of b.available_datetimes || []) {
          if (seen.has(dt)) continue;
          seen.add(dt);

          // Elation retorna naive em sourceTimezone (LA). Convertemos pra displayTimezone (ET)
          // ANTES de agrupar, pois o shift pode cruzar fronteira de dia (22:30 LA = 01:30 ET D+1).
          const displayDt = shiftNaive(dt, CHECKOUT_CONFIG.sourceTimezone, CHECKOUT_CONFIG.displayTimezone);
          const day = displayDt.slice(0, 10);
          if (!byDay.has(day)) byDay.set(day, []);
          byDay.get(day).push({
            datetime: displayDt,      // naive ET — frontend renderiza direto
            providerId: b.provider_id,
            serviceLocationId: b.service_location_id,
          });
        }
      }

      const daysOut = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, slots]) => ({
          date,
          slots: slots.sort((a, b) => a.datetime.localeCompare(b.datetime)),
        }));

      res.json({
        plan: { slug: meta.slug, durationMin: meta.durationMin },
        timezone: CHECKOUT_CONFIG.displayTimezone,
        practiceId: CHECKOUT_CONFIG.practiceId,
        appointmentTypeId: meta.appointmentTypeId,
        days: daysOut,
      });
    } catch (e) { next(e); }
  },

  /**
   * POST /checkout/book
   * Body: { planSlug, slot:{datetime, providerId, serviceLocationId}, patient:{firstName,lastName,email,phone,dob,state,reason} }
   * Cria o appointment no Elation (público) e retorna a URL do Hint para pagamento.
   * TODO: descobrir shape exato do payload POST /book/api/appointments no primeiro teste real.
   */
  async book(req, res, next) {
    try {
      const { planSlug, slot, patient } = req.body || {};
      if (!planSlug || !patient?.email) {
        return res.status(400).json({ error: "planSlug e patient.email são obrigatórios" });
      }
      // slot é opcional: usuário pode optar por agendar depois do pagamento.
      const plan = getPlanMeta(planSlug);
      if (!plan) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      // Enriquecer com GHL se disponível (no futuro). Por ora, usa o patient do body.
      let enriched = patient;
      if (ghlIsConfigured()) {
        const found = await lookupByEmail(patient.email);
        if (found) enriched = { ...found, ...patient };
      }

      const appointmentPayload = slot?.datetime ? {
        practice_id: CHECKOUT_CONFIG.practiceId,
        appointment_type_id: meta?.appointmentTypeId ?? plan?.appointmentTypeId,
        physician_id: slot.providerId,
        service_location_id: slot.serviceLocationId,
        scheduled_date: slot.datetime,
        duration: meta?.durationMin ?? 30,
        patient: {
          first_name: enriched.firstName,
          last_name: enriched.lastName,
          email: enriched.email,
          phone: enriched.phone,
          dob: enriched.dob,
        },
        reason: enriched.reason || planSlug || "Consulta",
      } : null;

      // IMPORTANTE — sobre a criação do appointment:
      // A API pública /book/api/appointments requer sessão autenticada de paciente
      // (fluxo: POST /book/api/patients → login por email+código → então POST appointment).
      // Hoje não fazemos esse fluxo; seguimos sem criar o appointment e confiamos no
      // portal do Hint para confirmar. Próxima iteração: usar OAuth PRIVADA do Elation
      // (POST /api/2.0/patients + /api/2.0/appointments) com credenciais de produção
      // do Erian. Slug sandbox atual não serve porque a agenda real é produção.
      let appointment = null;
      if (appointmentPayload) {
        try {
          const created = await elationBooking.createAppointment(appointmentPayload);
          appointment = created?.data || created;
        } catch (err) {
          console.warn("[checkout.book] Elation booking skipped (needs auth session):", err.message);
        }
      }

      res.json({
        ok: true,
        plan: plan.slug,
        appointment,
        payment: {
          provider: "pending",
          available: false,
          reason: "use /checkout/setup-intent + /checkout/finalize (Rainforest)",
        },
      });
    } catch (e) { next(e); }
  },

  /**
   * POST /checkout/setup-intent
   * Body: { planId, planSlug, patient: { firstName, lastName, email, dob, phone, state } }
   * planId: ID do plano no Hint (vem do GET /checkout/plans)
   * Cria paciente no Hint + setup intent do Rainforest.
   */
  async setupIntent(req, res, next) {
    try {
      if (!hintIsConfigured()) {
        return res.status(503).json({ error: "Hint não configurado" });
      }
      const { planId, planSlug, patient } = req.body || {};
      if (!planId || !patient?.email || !patient?.firstName) {
        return res.status(400).json({ error: "planId, patient.email e patient.firstName são obrigatórios" });
      }

      // 1) Criar paciente no Hint
      console.log(`[hint] createPatient → email=${patient.email} name=${patient.firstName} ${patient.lastName || ""}`);
      const hintPatient = await hintService.createPatient({
        first_name: patient.firstName,
        last_name:  patient.lastName || "",
        email:      patient.email,
        dob:        patient.dob || null,
        phone_mobile:   patient.phone || null,
        address_line1:  patient.address1 || null,
        address_line2:  patient.address2 || null,
        address_city:   patient.city || null,
        address_state:  patient.state && patient.state !== "BR" ? patient.state : null,
        address_zip:    patient.zip || null,
        address_country: patient.country || null,
        lead_source:    leadSourceForHint(patient.howHeard) || undefined,
      });
      console.log(`[hint] patient criado/encontrado → id=${hintPatient.id}`);

      // 2) Criar setup intent
      console.log(`[hint] createSetupIntent → patientId=${hintPatient.id} planId=${planId}`);
      const intent = await hintService.createSetupIntent(hintPatient.id, {
        userIsOwner: true,
        acceptsBank: false,
      });
      console.log(`[hint] setupIntent → processor=${intent.payment_processor} configId=${intent.payment_method_config_id}`);

      res.json({
        patientId: hintPatient.id,
        planId,
        planSlug: planSlug || null,
        setupIntent: {
          sessionKey:             intent.session_key,
          paymentMethodConfigId:  intent.payment_method_config_id,
          allowedMethods:         intent.allowed_methods,
          processor:              intent.payment_processor,
        },
      });
    } catch (e) {
      console.error("[checkout.setupIntent]", e);
      next(e);
    }
  },

  /**
   * POST /checkout/finalize
   * Body: { patientId, planSlug, rainforestId, periodInMonths?, startDate? }
   * Com o token da Rainforest: anexa payment method + cria membership no Hint.
   */
  async finalize(req, res, next) {
    try {
      if (!hintIsConfigured()) {
        return res.status(503).json({ error: "Hint não configurado" });
      }
      const { patientId, planId, planSlug, rainforestId, periodInMonths = 1, startDate, slot, patient } = req.body || {};
      if (!patientId || !planId || !rainforestId) {
        return res.status(400).json({ error: "patientId, planId e rainforestId são obrigatórios" });
      }
      const meta = planSlug ? getPlanMeta(planSlug) : null;

      console.log(`[hint] createPaymentMethod → patientId=${patientId} rainforestId=${rainforestId}`);
      // 1) Anexar método de pagamento ao paciente
      const paymentMethod = await hintService.createPaymentMethod(patientId, rainforestId);
      console.log(`[hint] paymentMethod criado → id=${paymentMethod?.id} last4=${paymentMethod?.last_four} type=${paymentMethod?.type}`);

      // 2) Criar membership usando o planId do Hint recebido do frontend
      const today = new Date().toISOString().slice(0, 10);
      console.log(`[hint] createMembership → planId=${planId} patientId=${patientId} startDate=${startDate || today} period=${periodInMonths}mo`);
      const membership = await hintService.createMembership({
        planId,
        patientId,
        startDate:      startDate || today,
        periodInMonths,
      });
      console.log(`[hint] membership criada → id=${membership?.id} status=${membership?.status} rate=${membership?.period_rate_in_cents}¢ enrollment=${membership?.enrollment_status}`);

      // 3) Criar paciente + appointment no Elation via API pública /book/api/appointments.
      // CRUCIAL: usar este endpoint (não a OAuth /api/2.0/appointments) é o ÚNICO jeito
      // de disparar: (a) email de confirmação, (b) convite do Elation Passport,
      // (c) convite de forms. A OAuth cria o appointment mas sem notificações.
      // Descoberto via MITM do fluxo público de self-scheduling.
      let appointment = { status: "not_requested" };
      if (slot?.datetime && patient?.email) {
        appointment = { status: "pending", reason: null };
        try {
          // slot.datetime vem do frontend como naive ET (displayTimezone).
          // Elation espera aware em sourceTimezone (ET). Anexa offset ET.
          const laNaive = shiftNaive(slot.datetime, CHECKOUT_CONFIG.displayTimezone, CHECKOUT_CONFIG.sourceTimezone);
          const scheduledDate = toTZAware(laNaive, CHECKOUT_CONFIG.sourceTimezone);
          const bookingTypeId = CHECKOUT_CONFIG.availabilityAppointmentTypeId || meta?.appointmentTypeId;
          console.log(`[elation] createPublicAppointment → slot_original=${slot.datetime} slot_converted=${scheduledDate} typeId=${bookingTypeId} physician=${CHECKOUT_CONFIG.physicianId}`);
          const result = await elationBooking.createPublicAppointment({
            appointment: {
              appointment_type_id: bookingTypeId,
              scheduled_date:      scheduledDate,
            },
            patient: {
              first_name: patient.firstName,
              last_name:  patient.lastName || "—",
              dob:        patient.dob,
              email:      patient.email,
              phone:      patient.phone || "",
              sex:        patient.sex || "Unknown",
            },
            physicianId:       CHECKOUT_CONFIG.physicianId,
            serviceLocationId: CHECKOUT_CONFIG.serviceLocationId,
          });
          console.log(`[elation] appointment criado → id=${result.appointment?.id} appt_time=${result.appointment?.appt_time} patient_id=${result.patient?.id}`);

          appointment = {
            status:   "confirmed",
            id:       result.appointment?.id || null,
            datetime: result.appointment?.appt_time || slot.datetime,
            elationPatientId: result.patient?.id || null,
            isTelehealth:     result.appointment?.appt_type?.is_telehealth,
          };
        } catch (err) {
          console.warn(`[elation] booking falhou → ${err.message}`);
          appointment.reason = err.message.slice(0, 500);
        }
      } else {
        console.log(`[elation] booking pulado → slot=${slot?.datetime || "none"} email=${patient?.email || "none"}`);
      }

      // 3.5) Atualizar contato no GHL com os dados do checkout — fire-and-forget.
      // Busca o contactId por email e faz PUT com endereço/telefone/nome.
      if (ghlIsConfigured() && patient?.email) {
        (async () => {
          try {
            const contact = await lookupByEmail(patient.email);
            if (!contact?.ghlContactId) {
              console.log(`[ghl] update pulado → contato não encontrado para ${patient.email}`);
              return;
            }
            await updateContact(contact.ghlContactId, {
              firstName:  patient.firstName,
              lastName:   patient.lastName,
              phone:      patient.phone,
              address1:   patient.address1,
              city:       patient.city,
              state:      patient.state && patient.state !== "BR" ? patient.state : undefined,
              postalCode: patient.zip,
              country:    patient.country,
            });
            console.log(`[ghl] contato atualizado → id=${contact.ghlContactId} email=${patient.email}`);
          } catch (err) {
            console.error(`[ghl] update falhou → ${err.message}`);
          }
        })();
      }

      // 4) Email de confirmação — fire-and-forget (não bloqueia a resposta)
      let email = { skipped: true };
      if (patient?.email) {
        console.log(`[email] enviando confirmação → to=${patient.email} plan=${planSlug} appointment=${appointment?.status}`);
        sendConfirmationEmail({
          to:                  patient.email,
          firstName:           patient.firstName || "Paciente",
          planSlug,
          appointmentDatetime: appointment?.datetime || null,
          membershipId:        membership?.id || null,
        })
          .then(r => { email = r; console.log(`[email] enviado → id=${r?.id}`); })
          .catch(err => console.error(`[email] falhou → ${err.message}`));
      }

      console.log(`[checkout.finalize] OK → membership=${membership?.id} appointment=${appointment?.status} email=${patient?.email}`);
      res.json({
        ok: true,
        paymentMethod: { id: paymentMethod?.id, lastFour: paymentMethod?.last_four, type: paymentMethod?.type },
        membership:    { id: membership?.id, status: membership?.status, startDate: membership?.start_date },
        appointment,
        email,
      });
    } catch (e) {
      console.error("[checkout.finalize] ERRO →", e.message, e.stack?.split("\n")[1] || "");
      next(e);
    }
  },
};
