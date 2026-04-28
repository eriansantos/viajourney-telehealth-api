import { STATUS } from "../constants/elation.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function weekIndex(dateStr, startDate) {
  const diff = new Date(dateStr) - startDate;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Considera business hours como 8am-6pm Eastern, Mon-Fri.
// Como o backend não converte timezone, usamos o getHours() em UTC e
// ajustamos o offset Eastern (-4 EDT / -5 EST). Aproximamos com -4 (DST).
function isAfterHoursEastern(isoStr) {
  if (!isoStr) return false;
  const d = new Date(isoStr);
  // Converte UTC pra Eastern aproximado (DST = UTC-4).
  const eastern = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const day = eastern.getUTCDay();          // 0=Sun, 6=Sat
  const hour = eastern.getUTCHours();
  const isWeekend = day === 0 || day === 6;
  const isOutsideWindow = hour < 8 || hour >= 18;
  return isWeekend || isOutsideWindow;
}

// Normaliza um número de telefone pra dígitos. "+1 (941) 337-9856" → "19413379856"
function digitsOnly(phone) {
  return String(phone || "").replace(/\D/g, "");
}

// Dois telefones casam se os 10 últimos dígitos coincidem (ignora código de país).
function phonesMatch(a, b) {
  const aa = digitsOnly(a);
  const bb = digitsOnly(b);
  if (!aa || !bb) return false;
  return aa.slice(-10) === bb.slice(-10);
}

// ─── Transformer ──────────────────────────────────────────────────────────────
export const rcTransformer = {
  /**
   * Transforma dados do RingCentral + Elation em KPIs para o Módulo 10.
   *
   * @param {object[]} calls      – registros do call log RC (Voice)
   * @param {object[]} messages   – registros do message store RC (SMS)
   * @param {object[]} appts      – resultados de appointments do Elation
   * @param {Date}     periodStart – início do período de análise
   */
  supportLoad({ calls, messages, appts, periodStart, patients = [] }) {
    const WEEKS = 8;
    const start = periodStart instanceof Date ? periodStart : new Date(periodStart);

    // ── Totais globais ───────────────────────────────────────────────────────
    const totalVisits   = appts.length;
    const totalCalls    = calls.length;
    const totalMessages = messages.length;

    // ── Avg response time (duração média de chamadas recebidas e atendidas) ──
    // RC usa "Accepted" e "Call connected" para chamadas atendidas (não "Answered")
    const ANSWERED_RESULTS = new Set(["Accepted", "Call connected"]);
    const answeredInbound = calls.filter(
      (c) => c.direction === "Inbound" && ANSWERED_RESULTS.has(c.result)
    );
    const avgDurationSec =
      answeredInbound.length > 0
        ? answeredInbound.reduce((s, c) => s + (c.duration ?? 0), 0) /
          answeredInbound.length
        : 0;
    const avgResponseMin = round1(avgDurationSec / 60);

    // ── Ratios globais ────────────────────────────────────────────────────────
    const callsPerVisit = totalVisits > 0 ? round1(totalCalls / totalVisits) : 0;
    const msgsPerVisit  = totalVisits > 0 ? round1(totalMessages / totalVisits) : 0;

    // ── Follow-up completion: % chamadas recebidas atendidas ──────────────────
    const inboundCalls = calls.filter((c) => c.direction === "Inbound");
    const followUpRate =
      inboundCalls.length > 0
        ? Math.round((answeredInbound.length / inboundCalls.length) * 100)
        : null;

    // ── No-show & cancellation via status do Elation ─────────────────────────
    const completed   = appts.filter((a) => STATUS.COMPLETED.includes(a.status?.status)).length;
    const noShows     = appts.filter((a) => STATUS.NO_SHOW.includes(a.status?.status)).length;
    const cancels     = appts.filter((a) => STATUS.CANCELLED.includes(a.status?.status)).length;
    const denominator = completed + noShows + cancels || 1;

    const noShowRate      = round1((noShows  / denominator) * 100);
    const cancellationRate = round1((cancels  / denominator) * 100);

    // ── Tendência semanal (8 semanas) ─────────────────────────────────────────
    const weekVisits = new Array(WEEKS).fill(0);
    const weekCalls  = new Array(WEEKS).fill(0);
    const weekMsgs   = new Array(WEEKS).fill(0);

    for (const a of appts) {
      if (!a.scheduled_date) continue;
      const w = weekIndex(a.scheduled_date, start);
      if (w >= 0 && w < WEEKS) weekVisits[w]++;
    }

    for (const c of calls) {
      if (!c.startTime) continue;
      const w = weekIndex(c.startTime, start);
      if (w >= 0 && w < WEEKS) weekCalls[w]++;
    }

    for (const m of messages) {
      if (!m.creationTime) continue;
      const w = weekIndex(m.creationTime, start);
      if (w >= 0 && w < WEEKS) weekMsgs[w]++;
    }

    const trendCallsPerVisit = weekVisits.map((v, i) =>
      v > 0 ? round1(weekCalls[i] / v) : null
    );
    const trendMsgsPerVisit = weekVisits.map((v, i) =>
      v > 0 ? round1(weekMsgs[i] / v) : null
    );

    // ── Missed calls ─────────────────────────────────────────────────────────
    // Resultado RC: "Missed", "No Answer", "Voicemail", "Rejected", "Hang Up"
    // contam como missed do ponto de vista de operação (cliente ligou, ninguém
    // atendeu OU foi pra correio/desligou).
    const MISSED_RESULTS = new Set(["Missed", "No Answer", "Voicemail", "Rejected", "Hang Up"]);
    const missedInbound = inboundCalls.filter((c) => MISSED_RESULTS.has(c.result));
    const missedRate =
      inboundCalls.length > 0
        ? round1((missedInbound.length / inboundCalls.length) * 100)
        : null;

    // ── After-hours volume ───────────────────────────────────────────────────
    const afterHoursCalls = calls.filter((c) => isAfterHoursEastern(c.startTime));
    const afterHoursPct =
      calls.length > 0
        ? round1((afterHoursCalls.length / calls.length) * 100)
        : null;

    // ── Call → booking conversion ────────────────────────────────────────────
    // Pegamos os telefones únicos de inbound calls e cruzamos com phone do
    // Elation patients que aparece como `patient` em algum appointment.
    const phoneToPatientId = new Map();
    for (const p of patients) {
      const list = Array.isArray(p.phones) ? p.phones : [];
      for (const ph of list) {
        if (ph?.deleted_date) continue;
        const num = ph?.phone || ph?.number || (typeof ph === "string" ? ph : null);
        if (!num) continue;
        const key = digitsOnly(num).slice(-10);
        if (key.length === 10) phoneToPatientId.set(key, p.id);
      }
    }

    const apptPatientIds = new Set(appts.map((a) => a.patient).filter(Boolean));

    const inboundCallerPhones = new Set();
    for (const c of inboundCalls) {
      const fromKey = digitsOnly(c.from?.phoneNumber).slice(-10);
      if (fromKey.length === 10) inboundCallerPhones.add(fromKey);
    }

    let callersBookedCount = 0;
    for (const phoneKey of inboundCallerPhones) {
      const patientId = phoneToPatientId.get(phoneKey);
      if (patientId && apptPatientIds.has(patientId)) callersBookedCount += 1;
    }

    const callToBookingPct =
      inboundCallerPhones.size > 0
        ? round1((callersBookedCount / inboundCallerPhones.size) * 100)
        : null;

    return {
      kpis: {
        callsPerVisit,
        msgsPerVisit,
        avgResponseMin,
        followUpRate,
        noShowRate,
        cancellationRate,
        totalCalls,
        totalMessages,
        totalVisits,
        answeredRate:
          inboundCalls.length > 0
            ? Math.round((answeredInbound.length / inboundCalls.length) * 100)
            : null,
        // novos KPIs (Phase 2)
        missedRate,
        missedCount:        missedInbound.length,
        inboundCount:       inboundCalls.length,
        afterHoursPct,
        afterHoursCount:    afterHoursCalls.length,
        callToBookingPct,
        uniqueCallers:      inboundCallerPhones.size,
        callersBooked:      callersBookedCount,
        crossSourceAvailable: patients.length > 0,
      },
      trend: {
        labels:         Array.from({ length: WEEKS }, (_, i) => `W${i + 1}`),
        callsPerVisit:  trendCallsPerVisit,
        msgsPerVisit:   trendMsgsPerVisit,
      },
    };
  },
};
