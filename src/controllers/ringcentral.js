import { rcService, rcIsConfigured } from "../services/ringcentral.js";
import { elationService }           from "../services/elation.js";
import { rcTransformer }            from "../transformers/ringcentral.js";

export const rcController = {
  /**
   * GET /api/rc/support-load?from=YYYY-MM-DD&to=YYYY-MM-DD
   *
   * Retorna KPIs de carga operacional combinando RingCentral (chamadas + SMS)
   * com Elation (volume de visitas, no-show, cancelamentos).
   *
   * Quando RC não está configurado (RC_JWT_TOKEN ausente) retorna
   * { configured: false } para o frontend exibir dados mock.
   */
  async supportLoad(req, res, next) {
    try {
      if (!rcIsConfigured()) {
        return res.json({ configured: false });
      }

      // ── Período de análise: 8 semanas por padrão ───────────────────────────
      const now        = new Date();
      const periodEnd  = req.query.to   ? new Date(req.query.to)   : now;
      const periodStart = req.query.from ? new Date(req.query.from) : new Date(periodEnd.getTime() - 56 * 24 * 60 * 60 * 1000);

      const rcFrom     = periodStart.toISOString();
      const rcTo       = periodEnd.toISOString();
      const elFrom     = periodStart.toISOString().slice(0, 10);
      const elTo       = periodEnd.toISOString().slice(0, 10);

      // ── Chamadas paralelas: RC + Elation (incluindo patients p/ matching) ─
      let calls, messages, appointments, patientsResp;
      try {
        [calls, messages, appointments, patientsResp] = await Promise.all([
          rcService.getCallLog({ dateFrom: rcFrom, dateTo: rcTo }),
          rcService.getMessages({ dateFrom: rcFrom, dateTo: rcTo }),
          elationService.getAppointments({
            scheduled_date_from: elFrom,
            scheduled_date_to:   elTo,
          }),
          elationService.getPatients().catch((err) => {
            console.warn("[rc.supportLoad] elation patients failed:", err.message);
            return { results: [] };
          }),
        ]);
      } catch (rcErr) {
        // RC retornou InsufficientPermissions (403) — app ainda sem as
        // permissões ReadCallLog / ReadMessages no Developer Console.
        // Retornamos configured:false para o frontend exibir dados mock.
        if (rcErr.status === 403 || rcErr.message?.includes("InsufficientPermissions")) {
          console.warn("[RC] InsufficientPermissions — adicione ReadCallLog e ReadMessages no Developer Console:", rcErr.message);
          return res.json({ configured: false, permissionsError: true });
        }
        throw rcErr; // outros erros sobem normalmente
      }

      const appts    = appointments.results ?? [];
      const patients = patientsResp?.results ?? [];

      res.json({
        configured: true,
        ...rcTransformer.supportLoad({ calls, messages, appts, periodStart, patients }),
      });
    } catch (err) {
      next(err);
    }
  },
};
