import { Router } from "express";
import { getLocalVersion } from "../updater.js";

const router = Router();

router.get("/status", async (_req, res) => {
  try {
    const { version } = await getLocalVersion();
    res.json({ ok: true, version });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
