import { Router } from "express";
import {
  getAppointments,
  getVisitNotes,
  getPhysicians,
  getPatients,
  getVisitVolumeSummary,
} from "../services/elation.js";

const router = Router();

// GET /api/elation/appointments?scheduled_date_from=YYYY-MM-DD&scheduled_date_to=YYYY-MM-DD
router.get("/appointments", async (req, res) => {
  try {
    const data = await getAppointments(req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/elation/visit-notes?document_date_from=YYYY-MM-DD&document_date_to=YYYY-MM-DD
router.get("/visit-notes", async (req, res) => {
  try {
    const data = await getVisitNotes(req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/elation/physicians
router.get("/physicians", async (req, res) => {
  try {
    const data = await getPhysicians(req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/elation/patients
router.get("/patients", async (req, res) => {
  try {
    const data = await getPatients(req.query);
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/elation/visit-volume?from=YYYY-MM-DD&to=YYYY-MM-DD
// Módulo 2 — sumário agregado para o dashboard
router.get("/visit-volume", async (req, res) => {
  try {
    const data = await getVisitVolumeSummary({ from: req.query.from, to: req.query.to });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

export default router;
