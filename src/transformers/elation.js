// Transforma dados brutos da Elation em métricas para o dashboard.
// Nenhum dado de paciente (nome, dob, contato) chega aqui.

export const elationTransformer = {

  // Módulo 2 — Visit Volume & Utilization
  visitVolume({ appointments, physicians }) {
    const appts = appointments.results || [];

    const byStatus = {};
    const byMode   = { IN_PERSON: 0, VIDEO: 0, OTHER: 0 };
    const byPhysicianMap = {};

    for (const appt of appts) {
      // Status
      const status = appt.status?.status || "Unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;

      // Modo
      const mode = appt.mode in byMode ? appt.mode : "OTHER";
      byMode[mode]++;

      // Por médico (ID apenas)
      const pid = appt.physician;
      if (!byPhysicianMap[pid]) byPhysicianMap[pid] = { total: 0, byStatus: {} };
      byPhysicianMap[pid].total++;
      byPhysicianMap[pid].byStatus[status] = (byPhysicianMap[pid].byStatus[status] || 0) + 1;
    }

    // Enriquece com nome do médico (não é PII)
    const byPhysician = (physicians.results || []).map((ph) => ({
      id:          ph.id,
      name:        `${ph.first_name} ${ph.last_name}`,
      credentials: ph.credentials,
      is_active:   ph.is_active,
      stats:       byPhysicianMap[ph.id] || { total: 0, byStatus: {} },
    }));

    return {
      total:       appointments.count ?? appts.length,
      byStatus,
      byMode,
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
