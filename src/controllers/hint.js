import { hintService, hintIsConfigured } from "../services/hint.js";
import { hintTransformer }                from "../transformers/hint.js";

export const hintController = {
  /**
   * GET /api/hint/membership
   *
   * KPIs para Módulo 5 — Membership & Retention.
   * Quando Hint não está configurado (HINT_API_KEY ausente) retorna
   * { configured: false } para o frontend exibir dados mock.
   */
  async membership(req, res, next) {
    try {
      if (!hintIsConfigured()) {
        return res.json({ configured: false });
      }

      const [memberships, plans] = await Promise.all([
        hintService.getMemberships(),
        hintService.getPlans().catch(() => []),
      ]);

      res.json({
        configured: true,
        ...hintTransformer.membership({ memberships, plans }),
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/hint/revenue
   *
   * KPIs para Módulo 6 — Revenue & Financial Health.
   */
  async revenue(req, res, next) {
    try {
      if (!hintIsConfigured()) {
        return res.json({ configured: false });
      }

      const [memberships, payments, patients, practitioners] = await Promise.all([
        hintService.getMemberships(),
        hintService.getPayments().catch(() => []),
        hintService.getPatients().catch(() => []),
        hintService.getPractitioners().catch(() => []),
      ]);

      res.json({
        configured: true,
        ...hintTransformer.revenue({ memberships, payments, patients, practitioners }),
      });
    } catch (err) {
      next(err);
    }
  },
};
