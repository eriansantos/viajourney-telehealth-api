import { elationService } from "../services/elation.js";
import { elationTransformer } from "../transformers/elation.js";

export const elationController = {

  // GET /api/elation/visit-volume?from=YYYY-MM-DD&to=YYYY-MM-DD
  async visitVolume(req, res, next) {
    try {
      const { from, to } = req.query;
      const params = {};
      if (from) params.scheduled_date_from = from;
      if (to)   params.scheduled_date_to   = to;

      const [appointments, physicians] = await Promise.all([
        elationService.getAppointments(params),
        elationService.getPhysicians(),
      ]);

      res.json(elationTransformer.visitVolume({ appointments, physicians }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/elation/physicians
  async physicians(req, res, next) {
    try {
      const raw = await elationService.getPhysicians();
      res.json(elationTransformer.physicians(raw));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/elation/appointments?from=&to=&limit=&offset=
  async appointments(req, res, next) {
    try {
      const { from, to, limit, offset } = req.query;
      const params = {};
      if (from)   params.scheduled_date_from = from;
      if (to)     params.scheduled_date_to   = to;
      if (limit)  params.limit               = limit;
      if (offset) params.offset              = offset;

      const data = await elationService.getAppointments(params);
      res.json({ count: data.count, next: !!data.next, previous: !!data.previous, results: data.results });
    } catch (err) {
      next(err);
    }
  },
};
