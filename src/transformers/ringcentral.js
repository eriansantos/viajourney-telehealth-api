import { STATUS } from "../constants/elation.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function weekIndex(dateStr, startDate) {
  const diff = new Date(dateStr) - startDate;
  return Math.floor(diff / (7 * 24 * 60 * 60 * 1000));
}

function round1(n) {
  return Math.round(n * 10) / 10;
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
  supportLoad({ calls, messages, appts, periodStart }) {
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
      },
      trend: {
        labels:         Array.from({ length: WEEKS }, (_, i) => `W${i + 1}`),
        callsPerVisit:  trendCallsPerVisit,
        msgsPerVisit:   trendMsgsPerVisit,
      },
    };
  },
};
