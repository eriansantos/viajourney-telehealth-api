// ─── Helpers ─────────────────────────────────────────────────────────────────
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPrevMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function monthLabel(d) {
  return d.toLocaleString("en-US", { month: "short" });
}

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function round1(n) { return Math.round(n * 10) / 10; }

// Buckets de source pra deixar a UI legível. GHL `source` é texto livre
// (ex: "Facebook Ads — Brazil", "manual", "WhatsApp Form", "API").
function bucketSource(raw) {
  if (!raw) return "Unknown";
  const s = String(raw).toLowerCase();
  if (/whats?app|wpp/.test(s))                  return "WhatsApp";
  if (/facebook|instagram|meta|fb|ig\b/.test(s)) return "Meta Ads";
  if (/google|adwords|ads/.test(s))              return "Google Ads";
  if (/referr|indica/.test(s))                   return "Referral";
  if (/employer|partner|b2b/.test(s))            return "Employer";
  if (/website|landing|lp\b|form/.test(s))       return "Website";
  if (/manual|api|import/.test(s))               return "Manual";
  return "Other";
}

const STATE_NAMES = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", DC:"Washington DC", FL:"Florida",
  GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois", IN:"Indiana", IA:"Iowa",
  KS:"Kansas", KY:"Kentucky", LA:"Louisiana", ME:"Maine", MD:"Maryland",
  MA:"Massachusetts", MI:"Michigan", MN:"Minnesota", MS:"Mississippi",
  MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada", NH:"New Hampshire",
  NJ:"New Jersey", NM:"New Mexico", NY:"New York", NC:"North Carolina",
  ND:"North Dakota", OH:"Ohio", OK:"Oklahoma", OR:"Oregon", PA:"Pennsylvania",
  RI:"Rhode Island", SC:"South Carolina", SD:"South Dakota", TN:"Tennessee",
  TX:"Texas", UT:"Utah", VT:"Vermont", VA:"Virginia", WA:"Washington",
  WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
};

// ─── Transformer ─────────────────────────────────────────────────────────────
export const ghlTransformer = {
  /**
   * KPIs de Module 11 — Growth & Funnel.
   * Cobre apenas o lado de volume/origem (GHL puro). Conversão real
   * (lead→booked, lead→paid, lead→member) precisa cross-source com
   * Elation+Hint e fica como fase 2.
   */
  funnel({ contacts = [] }) {
    const now        = new Date();
    const monthStart = startOfMonth(now);
    const prevStart  = startOfPrevMonth(now);

    const ldNorm = contacts.map((c) => ({
      ...c,
      _added: parseDate(c.dateAdded),
    }));

    const inRange = (c, from, to) => c._added && c._added >= from && c._added < to;

    // ── KPIs principais ────────────────────────────────────────────────────
    const leadsMTD     = ldNorm.filter((c) => inRange(c, monthStart, now)).length;
    const leadsPrevM   = ldNorm.filter((c) => inRange(c, prevStart, monthStart)).length;
    const deltaPct     = leadsPrevM > 0 ? ((leadsMTD - leadsPrevM) / leadsPrevM) * 100 : 0;

    // Self-schedule rate: contacts c/ tag 'booked' / 'self-scheduled' OU campo 'has_appointment'
    // GHL não tem campo nativo — heurística via tags. Fica como N/A se não houver match.
    const isSelfScheduled = (c) => {
      const tags = Array.isArray(c.tags) ? c.tags.map((t) => String(t).toLowerCase()) : [];
      return tags.some((t) => /self.schedule|booked|agendou/.test(t));
    };
    const selfScheduledMTD = ldNorm.filter((c) => inRange(c, monthStart, now) && isSelfScheduled(c)).length;
    const selfScheduleRate = leadsMTD > 0 ? (selfScheduledMTD / leadsMTD) * 100 : null;

    // ── Trend 6 meses ──────────────────────────────────────────────────────
    const labels6m = [];
    const series6m = [];
    for (let i = 5; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to   = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      labels6m.push(monthLabel(from));
      series6m.push(ldNorm.filter((c) => inRange(c, from, to)).length);
    }

    // ── Por source ─────────────────────────────────────────────────────────
    const sourceMap = new Map();
    for (const c of ldNorm) {
      if (!inRange(c, monthStart, now)) continue;
      const key = bucketSource(c.source);
      sourceMap.set(key, (sourceMap.get(key) || 0) + 1);
    }
    const bySource = Array.from(sourceMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // ── Por state (só leads MTD com state válido) ──────────────────────────
    const stateMap = new Map();
    for (const c of ldNorm) {
      if (!inRange(c, monthStart, now)) continue;
      const code = (c.state || "").toUpperCase();
      if (!STATE_NAMES[code]) continue;
      stateMap.set(code, (stateMap.get(code) || 0) + 1);
    }
    const byState = Array.from(stateMap.entries())
      .map(([code, count]) => ({ code, name: STATE_NAMES[code], count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      kpis: {
        leadsMTD,
        leadsPrevM,
        deltaPctVsPrev:    round1(deltaPct),
        selfScheduleRate:  selfScheduleRate == null ? null : round1(selfScheduleRate),
        windowStart:       monthStart.toISOString().slice(0, 10),
      },
      trend: {
        labels: labels6m,
        leads:  series6m,
      },
      bySource,
      byState,
    };
  },
};
