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

  // GET /api/elation/speed-to-care?from=YYYY-MM-DD&to=YYYY-MM-DD
  async speedToCare(req, res, next) {
    try {
      const { from, to } = req.query;
      const params = {};
      if (from) params.scheduled_date_from = from;
      if (to)   params.scheduled_date_to   = to;

      const appointments = await elationService.getAppointments(params);
      res.json(elationTransformer.speedToCare({ appointments }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/elation/language-equity?from=YYYY-MM-DD&to=YYYY-MM-DD
  async languageEquity(req, res, next) {
    try {
      const { from, to } = req.query;
      const params = {};
      if (from) params.scheduled_date_from = from;
      if (to)   params.scheduled_date_to   = to;

      const [appointments, patients] = await Promise.all([
        elationService.getAppointments(params),
        elationService.getPatients(),
      ]);

      res.json(elationTransformer.languageEquity({ appointments, patients }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/elation/clinician-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
  async clinicianPerformance(req, res, next) {
    try {
      const { from, to } = req.query;
      const params = {};
      if (from) params.scheduled_date_from = from;
      if (to)   params.scheduled_date_to   = to;

      const [appointments, physicians, prescriptions] = await Promise.all([
        elationService.getAppointments(params),
        elationService.getPhysicians(),
        elationService.getPrescriptions(),
      ]);

      res.json(elationTransformer.clinicianPerformance({ appointments, physicians, prescriptions }));
    } catch (err) {
      next(err);
    }
  },

  // GET /api/elation/compliance?from=YYYY-MM-DD&to=YYYY-MM-DD
  async compliance(req, res, next) {
    try {
      const { from, to } = req.query;
      const apptParams = {};
      const noteParams = {};
      if (from) { apptParams.scheduled_date_from = from; noteParams.date_of_service_from = from; }
      if (to)   { apptParams.scheduled_date_to   = to;   noteParams.date_of_service_to   = to; }

      const [appointments, physicians, visitNotes] = await Promise.all([
        elationService.getAppointments(apptParams),
        elationService.getPhysicians(),
        elationService.getVisitNotes(noteParams),
      ]);

      res.json(elationTransformer.compliance({ appointments, physicians, visitNotes }));
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
