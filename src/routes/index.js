import { Router } from "express";
import { requireAuthenticated } from "../middleware/auth.js";
import { validateDateRange } from "../middleware/validate.js";
import { elationController } from "../controllers/elation.js";
import { rcController }      from "../controllers/ringcentral.js";
import { hintController }    from "../controllers/hint.js";
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

// ─── RingCentral ──────────────────────────────────────────────────────────────
router.get("/rc/support-load",                validateDateRange, rcController.supportLoad);

// ─── Hint Health ──────────────────────────────────────────────────────────────
router.get("/hint/membership",                                   hintController.membership);
router.get("/hint/revenue",                                      hintController.revenue);

export default router;
