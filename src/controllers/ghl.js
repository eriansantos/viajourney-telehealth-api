import { ghlService, ghlIsConfigured } from "../services/ghl.js";
import { elationService }                from "../services/elation.js";
import { hintService, hintIsConfigured } from "../services/hint.js";
import { ghlTransformer }                from "../transformers/ghl.js";

export const ghlController = {
  /**
   * GET /api/ghl/funnel
   *
   * KPIs de Module 11 — Growth & Funnel.
   * - Phase 1 (GHL puro): volume de leads MTD, source breakdown, state breakdown, trend 6m.
   * - Phase 2 (cross-source): lead→booked, lead→paid visit, lead→member.
   *   Cruza email do GHL contra Elation patients/appointments e Hint memberships.
   *
   * Quando GHL não está configurado retorna { configured: false } e o
   * frontend exibe mock.
   */
  async funnel(req, res, next) {
    try {
      if (!ghlIsConfigured()) {
        return res.json({ configured: false });
      }

      const now  = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      const fromIso = from.toISOString().slice(0, 10);
      const toIso   = now.toISOString().slice(0, 10);

      // Em paralelo: GHL + Elation (patients/appointments) + Hint memberships.
      // Falhas das fontes secundárias degradam pra Phase 1 ao invés de quebrar.
      const [
        rawContacts,
        elationPatientsResp,
        elationApptsResp,
        hintMemberships,
      ] = await Promise.all([
        ghlService.listContactsInRange({ from, to: now }),
        elationService.getPatients()
          .catch((err) => { console.warn("[ghl.funnel] elation patients failed:", err.message); return { results: [] }; }),
        elationService.getAppointments({
          scheduled_date_from: fromIso,
          scheduled_date_to:   toIso,
          limit: 200,
        }).catch((err) => { console.warn("[ghl.funnel] elation appts failed:", err.message); return { results: [] }; }),
        hintIsConfigured()
          ? hintService.getMemberships().catch((err) => { console.warn("[ghl.funnel] hint memberships failed:", err.message); return []; })
          : Promise.resolve([]),
      ]);

      // Normaliza GHL contacts (custom fields → state, etc).
      const contacts = rawContacts.map((c) => ({
        ...ghlService.mapContact(c),
        dateAdded: c.dateAdded,
        source:    c.source,
      }));

      const elationPatients     = elationPatientsResp?.results || [];
      const elationAppointments = elationApptsResp?.results    || [];

      res.json({
        configured: true,
        ...ghlTransformer.funnel({
          contacts,
          elationPatients,
          elationAppointments,
          hintMemberships,
        }),
      });
    } catch (err) {
      next(err);
    }
  },
};
