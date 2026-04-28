import { ghlService, ghlIsConfigured } from "../services/ghl.js";
import { ghlTransformer }                from "../transformers/ghl.js";

export const ghlController = {
  /**
   * GET /api/ghl/funnel
   *
   * KPIs de Module 11 — Growth & Funnel (Phase 1, GHL-only).
   * Quando GHL não está configurado retorna { configured: false }
   * para o frontend exibir mock.
   */
  async funnel(req, res, next) {
    try {
      if (!ghlIsConfigured()) {
        return res.json({ configured: false });
      }

      // Janela: últimos 6 meses + um pequeno buffer pra cobrir prev-month na transição.
      const now  = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      const rawContacts = await ghlService.listContactsInRange({ from, to: now });

      // Normaliza customFields → state (FL/sigla US/BR/""), tags, source.
      // Preserva dateAdded original (mapContact não inclui).
      const contacts = rawContacts.map((c) => ({
        ...ghlService.mapContact(c),
        dateAdded: c.dateAdded,
        source:    c.source,
      }));

      res.json({
        configured: true,
        ...ghlTransformer.funnel({ contacts }),
      });
    } catch (err) {
      next(err);
    }
  },
};
