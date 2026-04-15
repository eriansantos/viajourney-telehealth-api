// Transforma dados brutos da Elation em métricas para o dashboard.
// Nenhum dado de paciente (nome, dob, contato) chega aqui.

export const elationTransformer = {

  // Módulo 2 — Visit Volume & Utilization
  visitVolume({ appointments, physicians }) {
    const appts = appointments.results || [];

    const byStatus       = {};
    const byStatusGroup  = {};
    const byMode         = { IN_PERSON: 0, VIDEO: 0, OTHER: 0 };
    const byType         = {};
    const byPhysicianMap = {};
    const byHour         = {};
    const byDayOfWeek    = {};
    const patientCounts  = {};

    const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    for (const appt of appts) {
      // Status
      const status = appt.status?.status || "Unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;

      // Status agrupado
      const COMPLETED  = ["Checked In","In Room","In Room - Vitals Taken","With Doctor","Checked Out","Billed"];
      const NO_ACCESS  = ["Not Seen","Cancelled"];
      const PENDING    = ["Scheduled","Confirmed"];
      let group = "Other";
      if (COMPLETED.includes(status))  group = "Completed";
      else if (NO_ACCESS.includes(status)) group = "No Access";
      else if (PENDING.includes(status))   group = "Pending";
      byStatusGroup[group] = (byStatusGroup[group] || 0) + 1;

      // Mode
      const mode = appt.mode in byMode ? appt.mode : "OTHER";
      byMode[mode]++;

      // Visit type (mapped from reason field)
      if (appt.reason) {
        byType[appt.reason] = (byType[appt.reason] || 0) + 1;
      }

      // Per physician (ID only)
      const pid = appt.physician;
      if (!byPhysicianMap[pid]) byPhysicianMap[pid] = { total: 0, byStatus: {}, byMonth: {} };
      byPhysicianMap[pid].total++;
      byPhysicianMap[pid].byStatus[status] = (byPhysicianMap[pid].byStatus[status] || 0) + 1;
      if (appt.scheduled_date) {
        const d2    = new Date(appt.scheduled_date);
        const month = `${d2.getUTCFullYear()}-${String(d2.getUTCMonth()+1).padStart(2,"0")}`;
        byPhysicianMap[pid].byMonth[month] = (byPhysicianMap[pid].byMonth[month] || 0) + 1;
      }

      // Peak hour & day — using UTC (Elation timezone configured at practice level)
      if (appt.scheduled_date) {
        const d    = new Date(appt.scheduled_date);
        const hour = d.getUTCHours();
        const day  = DAYS[d.getUTCDay()];
        byHour[hour] = (byHour[hour] || 0) + 1;
        byDayOfWeek[day] = (byDayOfWeek[day] || 0) + 1;
      }

      // Repeat visits (count per patient ID — not PII)
      if (appt.patient) {
        patientCounts[appt.patient] = (patientCounts[appt.patient] || 0) + 1;
      }
    }

    // Peak hour (formatted as "2 PM")
    const peakHourRaw = Object.entries(byHour).sort((a, b) => b[1] - a[1])[0];
    let peakHour = null;
    if (peakHourRaw) {
      const h = parseInt(peakHourRaw[0]);
      peakHour = h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;
    }

    // Peak day
    const peakDayRaw = Object.entries(byDayOfWeek).sort((a, b) => b[1] - a[1])[0];
    const peakDay = peakDayRaw ? peakDayRaw[0] : null;

    // Repeat visit rate (patients with > 1 appointment)
    const totalPatients  = Object.keys(patientCounts).length;
    const repeatPatients = Object.values(patientCounts).filter((c) => c > 1).length;
    const repeatRate     = totalPatients > 0 ? Math.round((repeatPatients / totalPatients) * 100) : 0;

    // Enrich with physician name (not PII)
    const byPhysician = (physicians.results || []).map((ph) => ({
      id:          ph.id,
      name:        `${ph.first_name} ${ph.last_name}`,
      credentials: ph.credentials,
      is_active:   ph.is_active,
      stats:       byPhysicianMap[ph.id] || { total: 0, byStatus: {}, byMonth: {} },
    }));

    return {
      total: appointments.count ?? appts.length,
      byStatus,
      byStatusGroup,
      byMode,
      byType,
      byPhysician,
      peakHour,
      peakDay,
      repeatRate,
      byHour,
      byDayOfWeek,
    };
  },

  // Módulo 3 — Access & Speed-to-Care
  speedToCare({ appointments }) {
    const appts = appointments.results || [];
    const CANCELLED = ["Cancelled"];
    const NO_SHOW   = ["Not Seen"];
    const DONE      = ["Checked Out", "Billed", "Checked In", "With Doctor", "In Room", "In Room - Vitals Taken"];

    let leadTimesHours = [];
    const dist = { "Same day": 0, "1-3 days": 0, "4-7 days": 0, "8+ days": 0 };
    let totalDuration = 0;
    let durationCount = 0;
    let cancelled = 0;
    let noShow = 0;

    for (const appt of appts) {
      const status = appt.status?.status ?? "";
      if (CANCELLED.includes(status)) cancelled++;
      if (NO_SHOW.includes(status))   noShow++;
      if (appt.duration > 0) { totalDuration += appt.duration; durationCount++; }

      if (appt.created_date && appt.scheduled_date) {
        const diffH = (new Date(appt.scheduled_date) - new Date(appt.created_date)) / 36e5;
        if (diffH >= 0) {
          leadTimesHours.push(diffH);
          if      (diffH <  24)  dist["Same day"]++;
          else if (diffH <  72)  dist["1-3 days"]++;
          else if (diffH < 168)  dist["4-7 days"]++;
          else                   dist["8+ days"]++;
        }
      }
    }

    const total = appts.length;
    const avgLeadTimeHours = leadTimesHours.length
      ? Math.round(leadTimesHours.reduce((a, b) => a + b, 0) / leadTimesHours.length)
      : null;
    const sameDayRate    = total > 0 ? Math.round((dist["Same day"] / total) * 100) : 0;
    const cancellationRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;
    const noShowRate     = total > 0 ? Math.round((noShow / total) * 100) : 0;
    const avgDuration    = durationCount > 0 ? Math.round(totalDuration / durationCount) : null;

    return {
      total,
      avgLeadTimeHours,
      sameDayRate,
      cancellationRate,
      noShowRate,
      avgDuration,
      leadTimeDistribution: dist,
    };
  },

  // Módulo 8 — Language, Access & Equity
  languageEquity({ appointments, patients }) {
    const appts   = appointments.results || [];
    const patList = patients.results || [];

    // Map patient ID → raw preferred_language
    const langMap = {};
    for (const p of patList) {
      langMap[p.id] = p.preferred_language || "Other";
    }

    const byLanguage     = {};   // normalized: Portuguese/English/Spanish/Other
    const byLanguageRaw  = {};   // all languages as-is
    const leadTimeByLang = {};
    const leadTimeByLangRaw = {};
    const noShowByLang   = {};
    const noShowByLangRaw = {};

    for (const appt of appts) {
      const rawLang = langMap[appt.patient] || "Other";
      let lang = "Other";
      if (rawLang.toLowerCase().includes("portuguese")) lang = "Portuguese";
      else if (rawLang.toLowerCase().includes("english")) lang = "English";
      else if (rawLang.toLowerCase().includes("spanish")) lang = "Spanish";

      const status = appt.status?.status ?? "";

      // normalized
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;
      if (status === "Not Seen") noShowByLang[lang] = (noShowByLang[lang] || 0) + 1;

      // raw
      byLanguageRaw[rawLang] = (byLanguageRaw[rawLang] || 0) + 1;
      if (status === "Not Seen") noShowByLangRaw[rawLang] = (noShowByLangRaw[rawLang] || 0) + 1;

      if (appt.created_date && appt.scheduled_date) {
        const diffH = (new Date(appt.scheduled_date) - new Date(appt.created_date)) / 36e5;
        if (diffH >= 0) {
          if (!leadTimeByLang[lang]) leadTimeByLang[lang] = [];
          leadTimeByLang[lang].push(diffH);
          if (!leadTimeByLangRaw[rawLang]) leadTimeByLangRaw[rawLang] = [];
          leadTimeByLangRaw[rawLang].push(diffH);
        }
      }
    }

    const total = appts.length || 1;

    const buildSummary = (byLang, ltByLang, nsLang) =>
      Object.keys(byLang).sort((a,b) => byLang[b]-byLang[a]).map(lang => {
        const visits = byLang[lang] || 0;
        const times  = ltByLang[lang] || [];
        const avgHours = times.length ? times.reduce((a,b)=>a+b,0)/times.length : null;
        const avgLead  = avgHours != null ? Math.round(avgHours / 24 * 10) / 10 : null;
        const noShows  = nsLang[lang] || 0;
        return { lang, visits, pct: Math.round((visits/total)*100), avgLeadTimeDays: avgLead, noShowRate: visits > 0 ? Math.round((noShows/visits)*100) : 0 };
      });

    const FIXED = ["Portuguese","English","Spanish","Other"];
    const summary    = FIXED.map(l => buildSummary(byLanguage, leadTimeByLang, noShowByLang).find(s=>s.lang===l) || { lang:l, visits:0, pct:0, avgLeadTimeHours:null, noShowRate:0 });
    const summaryRaw = buildSummary(byLanguageRaw, leadTimeByLangRaw, noShowByLangRaw);

    return { total: appts.length, byLanguage, byLanguageRaw, summary, summaryRaw };
  },

  // Módulo 9 — Clinician Performance
  clinicianPerformance({ appointments, physicians, prescriptions }) {
    const appts  = appointments.results || [];
    const rxList = prescriptions.results || [];

    const COMPLETED_S = ["Checked In","In Room","In Room - Vitals Taken","With Doctor","Checked Out","Billed"];

    // Antibiotic drug name substrings (case-insensitive)
    const ANTIBIOTICS = [
      "amoxicillin","amoxicilina","augmentin","amoxiclav",
      "azithromycin","azitromicina","zithromax",
      "doxycycline","doxiciclina",
      "ciprofloxacin","ciprofloxacino","cipro",
      "levofloxacin","levofloxacino",
      "cephalexin","cefalexin","cefdinir","cefuroxime","ceftriaxone",
      "metronidazole","metronidazol","flagyl",
      "trimethoprim","sulfamethoxazole","bactrim","septra",
      "clindamycin","clindamicina",
      "penicillin","penicilina",
      "nitrofurantoin","macrobid",
      "clarithromycin","erythromycin",
    ];

    const isAntibiotic = (name = "") => {
      const n = name.toLowerCase();
      return ANTIBIOTICS.some((a) => n.includes(a));
    };

    // Per physician stats from appointments
    const phMap = {};
    for (const appt of appts) {
      const pid    = appt.physician;
      const status = appt.status?.status || "Unknown";
      if (!phMap[pid]) phMap[pid] = { total: 0, byStatus: {}, byMonth: {}, rxTotal: 0, rxAntibiotic: 0 };
      phMap[pid].total++;
      phMap[pid].byStatus[status] = (phMap[pid].byStatus[status] || 0) + 1;
      if (appt.scheduled_date) {
        const d = new Date(appt.scheduled_date);
        const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
        phMap[pid].byMonth[m] = (phMap[pid].byMonth[m] || 0) + 1;
      }
    }

    // Per physician stats from prescriptions
    for (const rx of rxList) {
      const pid = rx.prescribing_physician;
      if (!phMap[pid]) phMap[pid] = { total: 0, byStatus: {}, byMonth: {}, rxTotal: 0, rxAntibiotic: 0 };
      phMap[pid].rxTotal++;
      const drugName = rx.medication?.name ?? rx.medication?.brand_name ?? rx.medication?.generic_name ?? "";
      if (isAntibiotic(drugName)) phMap[pid].rxAntibiotic++;
    }

    // Enrich with physician info
    const byPhysician = (physicians.results || []).map((ph) => {
      const stats   = phMap[ph.id] || { total: 0, byStatus: {}, byMonth: {}, rxTotal: 0, rxAntibiotic: 0 };
      const total   = stats.total || 1;
      const completed = COMPLETED_S.reduce((s, k) => s + (stats.byStatus[k] || 0), 0);
      const antibioticRate = stats.rxTotal > 0
        ? Math.round((stats.rxAntibiotic / stats.rxTotal) * 100)
        : null;
      return {
        id:          ph.id,
        name:        `${ph.first_name} ${ph.last_name}`,
        credentials: ph.credentials,
        is_active:   ph.is_active,
        stats: {
          total:          stats.total,
          byStatus:       stats.byStatus,
          byMonth:        stats.byMonth,
          rxTotal:        stats.rxTotal,
          rxAntibiotic:   stats.rxAntibiotic,
          antibioticRate,
          completionRate: Math.round((completed / total) * 100),
          cancellationRate: Math.round(((stats.byStatus["Cancelled"] || 0) / total) * 100),
          noShowRate:       Math.round(((stats.byStatus["Not Seen"]  || 0) / total) * 100),
        },
      };
    });

    const active = byPhysician.filter((p) => p.is_active);
    const totalVisits = active.reduce((s, p) => s + p.stats.total, 0);
    const avgVisits   = active.length > 0 ? Math.round(totalVisits / active.length) : 0;

    return { total: appts.length, totalRx: rxList.length, avgVisits, byPhysician };
  },

  // Módulo 12 — Compliance & Risk
  compliance({ appointments, physicians, visitNotes }) {
    const appts = appointments.results || [];
    const notes = visitNotes.results  || [];

    const COMPLETED = ["Checked In","In Room","In Room - Vitals Taken","With Doctor","Checked Out","Billed"];
    const NO_SHOW   = ["Not Seen"];
    const CANCELLED = ["Cancelled"];

    // Build a set of "physicianId:YYYY-MM-DD" from visit notes
    // (Elation visit notes don't have an appointment field — match by physician + date)
    const noteKeys = new Set(
      notes.map(n => {
        const d = new Date(n.chart_date || n.document_date || n.created_date);
        return `${n.physician}:${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
      })
    );

    // Note signing stats
    const totalNotes  = notes.length;
    const signedNotes = notes.filter(n => n.signed_date || n.signed_by).length;
    const signedRate  = totalNotes > 0 ? Math.round((signedNotes / totalNotes) * 100) : null;

    // Per physician
    const phMap = {};
    for (const appt of appts) {
      const pid    = appt.physician;
      const status = appt.status?.status || "Unknown";
      if (!phMap[pid]) phMap[pid] = { total: 0, completed: 0, noShow: 0, cancelled: 0, documented: 0 };
      phMap[pid].total++;
      if (COMPLETED.includes(status)) {
        phMap[pid].completed++;
        // Check if a note exists for this physician on the same date
        if (appt.scheduled_date) {
          const d2  = new Date(appt.scheduled_date);
          const key = `${pid}:${d2.getUTCFullYear()}-${String(d2.getUTCMonth()+1).padStart(2,"0")}-${String(d2.getUTCDate()).padStart(2,"0")}`;
          if (noteKeys.has(key)) phMap[pid].documented++;
        }
      }
      if (NO_SHOW.includes(status))   phMap[pid].noShow++;
      if (CANCELLED.includes(status)) phMap[pid].cancelled++;
    }

    // Overall doc rate (completed appts matched with a visit note by physician+date)
    const totalCompleted  = appts.filter(a => COMPLETED.includes(a.status?.status || "")).length;
    const totalDocumented = appts.filter(a => {
      if (!COMPLETED.includes(a.status?.status || "")) return false;
      if (!a.scheduled_date) return false;
      const d3  = new Date(a.scheduled_date);
      const key = `${a.physician}:${d3.getUTCFullYear()}-${String(d3.getUTCMonth()+1).padStart(2,"0")}-${String(d3.getUTCDate()).padStart(2,"0")}`;
      return noteKeys.has(key);
    }).length;
    const docRate = totalCompleted > 0 ? Math.round((totalDocumented / totalCompleted) * 100) : null;

    // Outlier thresholds
    const NO_SHOW_TH  = 20;  // %
    const CANCEL_TH   = 15;  // %
    const DOC_RATE_TH = 80;  // % (below this = flagged)

    const outliers = [];

    // Enrich with physician info
    const byPhysician = (physicians.results || []).map(ph => {
      const stats       = phMap[ph.id] || { total: 0, completed: 0, noShow: 0, cancelled: 0, documented: 0 };
      const total       = stats.total || 1;
      const noShowRate  = Math.round((stats.noShow    / total) * 100);
      const cancelRate  = Math.round((stats.cancelled / total) * 100);
      const docRatePh   = stats.completed > 0 ? Math.round((stats.documented / stats.completed) * 100) : null;

      if (noShowRate > NO_SHOW_TH)
        outliers.push({ type: "High no-show rate",       physician: `${ph.first_name} ${ph.last_name}`, value: noShowRate,  threshold: NO_SHOW_TH,  unit: "%" });
      if (cancelRate > CANCEL_TH)
        outliers.push({ type: "High cancellation rate",  physician: `${ph.first_name} ${ph.last_name}`, value: cancelRate,  threshold: CANCEL_TH,   unit: "%" });
      if (docRatePh !== null && docRatePh < DOC_RATE_TH)
        outliers.push({ type: "Low documentation rate",  physician: `${ph.first_name} ${ph.last_name}`, value: docRatePh,   threshold: DOC_RATE_TH, unit: "%" });

      return {
        id:          ph.id,
        name:        `${ph.first_name} ${ph.last_name}`,
        credentials: ph.credentials,
        is_active:   ph.is_active,
        stats: {
          total:      stats.total,
          completed:  stats.completed,
          noShow:     stats.noShow,
          noShowRate,
          cancelled:  stats.cancelled,
          cancelRate,
          documented: stats.documented,
          docRate:    docRatePh,
        },
      };
    });

    return {
      total:        appts.length,
      totalNotes,
      signedNotes,
      signedRate,
      docRate,
      outlierCount: outliers.length,
      outliers,
      byPhysician,
    };
  },

  // Módulo 2 — lista de médicos (sem dados sensíveis)
  physicians(raw) {
    return (raw.results || []).map((ph) => ({
      id:          ph.id,
      name:        `${ph.first_name} ${ph.last_name}`,
      credentials: ph.credentials,
      specialty:   ph.specialty,
      is_active:   ph.is_active,
      npi:         ph.npi,
    }));
  },
};
