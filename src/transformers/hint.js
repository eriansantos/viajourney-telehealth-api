// ─── Helpers ─────────────────────────────────────────────────────────────────
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPrevMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d) {
  return d.toLocaleString("en-US", { month: "short" });
}

function monthsAgo(date, from = new Date()) {
  return (from.getFullYear() - date.getFullYear()) * 12 + (from.getMonth() - date.getMonth());
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function round1(n) { return Math.round(n * 10) / 10; }
function round2(n) { return Math.round(n * 100) / 100; }

// ─── Transformer ─────────────────────────────────────────────────────────────
export const hintTransformer = {
  /**
   * KPIs de Módulo 5 — Membership & Retention
   */
  membership({ memberships = [], plans = [] }) {
    const now        = new Date();
    const monthStart = startOfMonth(now);
    const prevStart  = startOfPrevMonth(now);

    // ── Parse datas ────────────────────────────────────────────────────────
    const mems = memberships.map((m) => ({
      ...m,
      _start: parseDate(m.start_date),
      _end:   parseDate(m.end_date),
    }));

    // ── Conceitos de estado ────────────────────────────────────────────────
    const isActiveNow = (m) =>
      m.status === "active" || m.is_current === true || (m._start && m._start <= now && (!m._end || m._end > now));

    const endedInRange = (m, from, to) =>
      m._end && m._end >= from && m._end < to;

    const startedInRange = (m, from, to) =>
      m._start && m._start >= from && m._start < to;

    // ── KPIs principais ────────────────────────────────────────────────────
    const active      = mems.filter(isActiveNow);
    const newMTD      = mems.filter((m) => startedInRange(m, monthStart, now)).length;
    const newPrevM    = mems.filter((m) => startedInRange(m, prevStart, monthStart)).length;
    const cancelledMTD = mems.filter((m) => endedInRange(m, monthStart, now)).length;
    const cancelledPrevM = mems.filter((m) => endedInRange(m, prevStart, monthStart)).length;

    // Active no início do mês corrente (quem começou antes e não havia terminado)
    const activeAtMonthStart = mems.filter(
      (m) => m._start && m._start < monthStart && (!m._end || m._end >= monthStart)
    ).length;

    const monthlyChurnPct =
      activeAtMonthStart > 0 ? (cancelledMTD / activeAtMonthStart) * 100 : 0;

    const annualizedChurnPct =
      monthlyChurnPct > 0
        ? (1 - Math.pow(1 - monthlyChurnPct / 100, 12)) * 100
        : 0;

    // Duração média (em meses) das memberships já encerradas
    const ended = mems.filter((m) => m._start && m._end && m._end <= now);
    const avgDurationMonths =
      ended.length > 0
        ? ended.reduce((s, m) => s + (m._end - m._start) / (1000 * 60 * 60 * 24 * 30.44), 0) /
          ended.length
        : 0;

    // ── Net growth — últimos 6 meses ───────────────────────────────────────
    const labels6m = [];
    const newSeries = [];
    const cancelSeries = [];
    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels6m.push(monthLabel(from));
      newSeries.push(mems.filter((m) => startedInRange(m, from, to)).length);
      cancelSeries.push(mems.filter((m) => endedInRange(m, from, to)).length);
    }

    // ── Retention cohort — % que continuam ativos após N meses ─────────────
    const cohortRate = (monthsWindow) => {
      const from = new Date(now.getFullYear(), now.getMonth() - monthsWindow - 2, 1);
      const to   = new Date(now.getFullYear(), now.getMonth() - monthsWindow - 1, 1);
      const cohort = mems.filter((m) => startedInRange(m, from, to));
      if (cohort.length === 0) return null;
      const still = cohort.filter(
        (m) => !m._end || monthsAgo(m._end, now) < monthsWindow
      ).length;
      return Math.round((still / cohort.length) * 100);
    };

    const retention = {
      m1:  cohortRate(1),
      m3:  cohortRate(3),
      m6:  cohortRate(6),
      m12: cohortRate(12),
    };

    // ── Por plano ──────────────────────────────────────────────────────────
    const byPlanMap = new Map();
    const getKey = (m) => m.plan?.id || "unknown";
    const getName = (m) => m.plan?.name || "Unknown";

    for (const m of mems) {
      const key = getKey(m);
      if (!byPlanMap.has(key)) {
        byPlanMap.set(key, {
          id:          key,
          name:        getName(m),
          active:      0,
          newMTD:      0,
          cancelledMTD: 0,
          activeAtMonthStart: 0,
        });
      }
      const p = byPlanMap.get(key);
      if (isActiveNow(m)) p.active += 1;
      if (startedInRange(m, monthStart, now)) p.newMTD += 1;
      if (endedInRange(m, monthStart, now)) p.cancelledMTD += 1;
      if (m._start && m._start < monthStart && (!m._end || m._end >= monthStart)) {
        p.activeAtMonthStart += 1;
      }
    }

    const byPlan = Array.from(byPlanMap.values())
      .map((p) => ({
        id:          p.id,
        name:        p.name,
        active:      p.active,
        newMTD:      p.newMTD,
        cancelledMTD: p.cancelledMTD,
        churnPct:
          p.activeAtMonthStart > 0 ? round1((p.cancelledMTD / p.activeAtMonthStart) * 100) : 0,
      }))
      .sort((a, b) => b.active - a.active);

    return {
      kpis: {
        activeMembers:      active.length,
        newMTD,
        cancelledMTD,
        monthlyChurnPct:    round1(monthlyChurnPct),
        annualizedChurnPct: round1(annualizedChurnPct),
        avgDurationMonths:  round1(avgDurationMonths),
        deltaNewVsPrev:     newMTD - newPrevM,
        deltaCancelVsPrev:  cancelledMTD - cancelledPrevM,
      },
      growth: {
        labels:       labels6m,
        newMembers:   newSeries,
        cancellations: cancelSeries,
      },
      retention,
      byPlan,
    };
  },

  /**
   * KPIs de Módulo 6 — Revenue & Financial Health
   */
  revenue({ memberships = [], payments = [], practitioners = [] }) {
    const now        = new Date();
    const monthStart = startOfMonth(now);
    const prevStart  = startOfPrevMonth(now);

    // ── Normaliza pagamentos ───────────────────────────────────────────────
    const pays = payments.map((p) => ({
      ...p,
      _date:   parseDate(p.date),
      _amount: (p.amount_in_cents || 0) / 100,
    }));

    const inMonth = (p, from, to) => p._date && p._date >= from && p._date < to;

    const paidMTD   = pays.filter((p) => p.status === "paid"    && inMonth(p, monthStart, now));
    const failedMTD = pays.filter((p) => p.status === "failed"  && inMonth(p, monthStart, now));
    const refundMTD = pays.filter((p) => p.status === "refunded" && inMonth(p, monthStart, now));
    const cbMTD     = pays.filter((p) => p.status === "chargeback" && inMonth(p, monthStart, now));

    const revenueMTD = paidMTD.reduce((s, p) => s + p._amount, 0);

    const paidPrevM = pays.filter((p) => p.status === "paid" && inMonth(p, prevStart, monthStart));
    const revenuePrevM = paidPrevM.reduce((s, p) => s + p._amount, 0);
    const deltaPct = revenuePrevM > 0 ? ((revenueMTD - revenuePrevM) / revenuePrevM) * 100 : 0;

    // ── Per active member (denominador consistente com a tabela byPlan) ─────
    const memsNorm = memberships.map((m) => ({
      ...m,
      _start: parseDate(m.start_date),
      _end:   parseDate(m.end_date),
    }));
    const isActiveNowFn = (m) =>
      m.status === "active" || m.is_current === true ||
      (m._start && m._start <= now && (!m._end || m._end > now));

    const activeMemberCount = Math.max(memsNorm.filter(isActiveNowFn).length, 1);
    const revenuePerPatient = revenueMTD / activeMemberCount;

    // ── Per clinician ──────────────────────────────────────────────────────
    const clinicianCount = Math.max(practitioners.length, 1);
    const revenuePerClinician = revenueMTD / clinicianCount;

    // ── Rates ──────────────────────────────────────────────────────────────
    const totalAttempts = paidMTD.length + failedMTD.length;
    const failedRate = totalAttempts > 0 ? (failedMTD.length / totalAttempts) * 100 : 0;

    // Recovery: pagamentos falhos seguidos de pago com memo "retry" ou dentro de 7 dias
    const recoveryRate = 0; // sandbox não tem dados de falha — placeholder

    const refundRate     = paidMTD.length > 0 ? (refundMTD.length / paidMTD.length) * 100 : 0;
    const chargebackRate = paidMTD.length > 0 ? (cbMTD.length    / paidMTD.length) * 100 : 0;

    // ── Revenue trend — 6 meses ────────────────────────────────────────────
    const labels6m = [];
    const revSeries = [];
    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels6m.push(monthLabel(from));
      const sum = pays
        .filter((p) => p.status === "paid" && inMonth(p, from, to))
        .reduce((s, p) => s + p._amount, 0);
      revSeries.push(Math.round(sum));
    }

    // ── Por plano — receita via memberships ativos × rate_in_cents/período ─
    // Como não há link direto payments→plan, estimamos via memberships ativos.
    const byPlanMap = new Map();

    for (const m of memsNorm) {
      if (!isActiveNowFn(m)) continue;
      const key  = m.plan?.id || "unknown";
      const name = m.plan?.name || "Unknown";
      const monthly = ((m.rate_in_cents || m.last_bill_amount_in_cents || 0) / 100) /
                      (m.period_in_months || 1);
      if (!byPlanMap.has(key)) {
        byPlanMap.set(key, { id: key, name, active: 0, revenueMTD: 0 });
      }
      const p = byPlanMap.get(key);
      p.active += 1;
      p.revenueMTD += monthly;
    }

    const byPlan = Array.from(byPlanMap.values())
      .map((p) => ({
        id:         p.id,
        name:       p.name,
        active:     p.active,
        revenueMTD: Math.round(p.revenueMTD),
        perPatient: p.active > 0 ? round2(p.revenueMTD / p.active) : 0,
      }))
      .sort((a, b) => b.revenueMTD - a.revenueMTD);

    return {
      kpis: {
        revenueMTD:          Math.round(revenueMTD),
        revenuePerPatient:   Math.round(revenuePerPatient),
        revenuePerClinician: Math.round(revenuePerClinician),
        failedRate:          round1(failedRate),
        recoveryRate:        round1(recoveryRate),
        refundRate:          round1(refundRate),
        chargebackRate:      round1(chargebackRate),
        deltaPctVsPrev:      round1(deltaPct),
      },
      trend: {
        labels:  labels6m,
        revenue: revSeries,
      },
      byPlan,
    };
  },
};
