import { Router } from "express";

/** BANK-AUTO-1 — optional bank webhook stub (future ZarinPal/Saman). */
const router = Router();

router.post("/bank", (_req, res) => {
  res.status(501).json({ success: false, error: { code: "not_implemented", message: "Bank webhook not implemented" } });
});

export const webhooksRouter = router;
