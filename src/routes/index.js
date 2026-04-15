import { Router } from "express";
import { requireAuthenticated } from "../middleware/auth.js";
import { validateDateRange } from "../middleware/validate.js";
import { elationController } from "../controllers/elation.js";

const router = Router();

// Todas as rotas /api/* exigem autenticação Clerk
router.use(requireAuthenticated);

// ─── Elation ─────────────────────────────────────────────────────────────────
router.get("/elation/visit-volume",           validateDateRange, elationController.visitVolume);
router.get("/elation/speed-to-care",          validateDateRange, elationController.speedToCare);
router.get("/elation/language-equity",        validateDateRange, elationController.languageEquity);
router.get("/elation/clinician-performance",  validateDateRange, elationController.clinicianPerformance);
router.get("/elation/physicians",                               elationController.physicians);
router.get("/elation/compliance",             validateDateRange, elationController.compliance);
router.get("/elation/appointments",           validateDateRange, elationController.appointments);

export default router;
