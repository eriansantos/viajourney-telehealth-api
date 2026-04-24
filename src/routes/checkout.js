// Rotas públicas do checkout — NÃO passa pelo middleware Clerk.
// Montado diretamente em /checkout em src/index.js (antes do /api).

import { Router } from "express";
import { checkoutController } from "../controllers/checkout.js";

const router = Router();

router.get("/plans", checkoutController.plans);
router.get("/lookup", checkoutController.lookup);
router.get("/availability", checkoutController.availability);
router.post("/book", checkoutController.book);
router.post("/setup-intent", checkoutController.setupIntent);
router.post("/finalize", checkoutController.finalize);

export default router;
