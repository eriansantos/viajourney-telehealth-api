// Controladores das rotas públicas de checkout.
// Fonte dos slots: API pública /book/api do Elation (sem credencial).
// Fonte dos dados do paciente: URL params da LP (provisório) — migração futura para GHL por email.

import { CHECKOUT_CONFIG, PLANS, getPlan } from "../config/checkout.js";
import { elationBooking } from "../services/elationBooking.js";
import { lookupByEmail, ghlIsConfigured } from "../services/ghl.js";
import { hintService, hintIsConfigured } from "../services/hint.js";

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
        dob:       contact.dob       || "",
        sex:       contact.sex       || "",
        ghlContactId: contact.ghlContactId || null,
      };
      const required = ["firstName", "email", "dob", "sex"];
      const missing  = required.filter(k => !patient[k]);

      res.json({ found: true, patient, complete: missing.length === 0, missing });
    } catch (e) { next(e); }
  },

  /**
   * GET /checkout/plans — retorna catálogo público de planos com preço real do Hint.
   * Para cada plano, chama POST /quotes no Hint (age=35, period=1 mês) pra obter
   * rate_in_cents + billing_period + registration_fee. Retorna metadados locais
   * (slug, name, durationMin, oneOff) merjados com preço remoto.
   */
  async plans(_req, res, next) {
    try {
      const plans = await Promise.all(
        Object.values(PLANS).map(async (p) => {
          let priceCents = null;
          let billingPeriod = null;
          let registrationFeeCents = 0;

          if (hintIsConfigured()) {
            try {
              const quote = await hintService.createQuote(p.hintPlanId, { age: 35, periodInMonths: 1 });
              priceCents           = quote?.ongoing_amount_in_cents ?? null;
              billingPeriod        = quote?.billing_period ?? null;
              registrationFeeCents = quote?.registration_fee_in_cents ?? 0;
            } catch (err) {
              console.warn(`[checkout.plans] quote falhou para ${p.slug}:`, err.message);
            }
          }

          return {
            slug: p.slug,
            name: p.name,
            durationMin: p.durationMin,
            oneOff: p.oneOff,
            priceCents,
            billingPeriod,              // "month" | null
            registrationFeeCents,
            // recurring derivado: se oneOff=true a UI mostra como avulsa,
            // mesmo que o Hint tecnicamente trate como plano mensal.
            recurring: p.oneOff ? false : (billingPeriod || "monthly"),
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
      const plan = getPlan(planSlug);
      if (!plan) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      const now = new Date();
      const start = new Date(now);
      const end = new Date(now);
      end.setDate(end.getDate() + days);

      const response = await elationBooking.getAvailabilities({
        appointmentTypeId: plan.appointmentTypeId,
        startDate: isoDate(start),
        endDate: isoDate(end),
      });

      // A API retorna [{ provider_id, service_location_id, appointment_type_id, available_datetimes:[...] }]
      const buckets = Array.isArray(response?.data) ? response.data : [];
      const matching = buckets.filter(b => b.appointment_type_id === plan.appointmentTypeId);

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
        plan: { slug: plan.slug, name: plan.name, durationMin: plan.durationMin },
        timezone: CHECKOUT_CONFIG.displayTimezone,
        practiceId: CHECKOUT_CONFIG.practiceId,
        appointmentTypeId: plan.appointmentTypeId,
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
      const plan = getPlan(planSlug);
      if (!plan) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      // Enriquecer com GHL se disponível (no futuro). Por ora, usa o patient do body.
      let enriched = patient;
      if (ghlIsConfigured()) {
        const found = await lookupByEmail(patient.email);
        if (found) enriched = { ...found, ...patient };
      }

      const appointmentPayload = slot?.datetime ? {
        practice_id: CHECKOUT_CONFIG.practiceId,
        appointment_type_id: plan.appointmentTypeId,
        physician_id: slot.providerId,
        service_location_id: slot.serviceLocationId,
        scheduled_date: slot.datetime,
        duration: plan.durationMin,
        patient: {
          first_name: enriched.firstName,
          last_name: enriched.lastName,
          email: enriched.email,
          phone: enriched.phone,
          dob: enriched.dob,
        },
        reason: enriched.reason || plan.name,
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
   * Body: { planSlug, patient: { firstName, lastName, email, dob, phone, state } }
   * Cria paciente no Hint + setup intent do Rainforest.
   * Retorna { patientId, session_key, payment_method_config_id, allowed_methods }
   * que o frontend usa pra renderizar o <rainforest-payment>.
   */
  async setupIntent(req, res, next) {
    try {
      if (!hintIsConfigured()) {
        return res.status(503).json({ error: "Hint não configurado" });
      }
      const { planSlug, patient } = req.body || {};
      if (!planSlug || !patient?.email || !patient?.firstName) {
        return res.status(400).json({ error: "planSlug, patient.email e patient.firstName são obrigatórios" });
      }
      const plan = getPlan(planSlug);
      if (!plan) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      // 1) Criar paciente no Hint
      const hintPatient = await hintService.createPatient({
        first_name: patient.firstName,
        last_name:  patient.lastName || "",
        email:      patient.email,
        dob:        patient.dob || null,
        phone_mobile: patient.phone || null,
        address_state: patient.state || null,
      });

      // 2) Criar setup intent
      const intent = await hintService.createSetupIntent(hintPatient.id, {
        userIsOwner: true,
        acceptsBank: false,
      });

      res.json({
        patientId: hintPatient.id,
        planSlug: plan.slug,
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
      const { patientId, planSlug, rainforestId, periodInMonths = 1, startDate, slot, patient } = req.body || {};
      if (!patientId || !planSlug || !rainforestId) {
        return res.status(400).json({ error: "patientId, planSlug e rainforestId são obrigatórios" });
      }
      const plan = getPlan(planSlug);
      if (!plan) return res.status(400).json({ error: `Unknown plan slug: ${planSlug}` });

      // 1) Anexar método de pagamento ao paciente
      const paymentMethod = await hintService.createPaymentMethod(patientId, rainforestId);

      // 2) Criar membership
      const today = new Date().toISOString().slice(0, 10);
      const membership = await hintService.createMembership({
        planId:         plan.hintPlanId,
        patientId,
        startDate:      startDate || today,
        periodInMonths,
      });

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
          // Elation espera aware em sourceTimezone (LA). Shift ET→LA, depois anexa offset LA.
          const laNaive = shiftNaive(slot.datetime, CHECKOUT_CONFIG.displayTimezone, CHECKOUT_CONFIG.sourceTimezone);
          const scheduledDate = toTZAware(laNaive, CHECKOUT_CONFIG.sourceTimezone);
          const result = await elationBooking.createPublicAppointment({
            appointment: {
              appointment_type_id: plan.appointmentTypeId,
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

          appointment = {
            status:   "confirmed",
            id:       result.appointment?.id || null,
            datetime: result.appointment?.appt_time || slot.datetime,
            elationPatientId: result.patient?.id || null,
            isTelehealth:     result.appointment?.appt_type?.is_telehealth,
          };
        } catch (err) {
          console.warn("[checkout.finalize] Elation booking falhou:", err.message);
          appointment.reason = err.message.slice(0, 500);
        }
      }

      res.json({
        ok: true,
        paymentMethod: { id: paymentMethod?.id, lastFour: paymentMethod?.last_four, type: paymentMethod?.type },
        membership:    { id: membership?.id, status: membership?.status, startDate: membership?.start_date },
        appointment,
      });
    } catch (e) {
      console.error("[checkout.finalize]", e);
      next(e);
    }
  },
};
