import { Router } from "express";
import {
  checkForUpdate,
  applyUpdate,
  getUpdateState,
} from "../updater.js";

const router = Router();

router.get("/check", async (_req, res) => {
  try {
    const state = await checkForUpdate();
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post("/apply", async (_req, res) => {
  const current = getUpdateState();
  if (current.status === "downloading" || current.status === "installing") {
    return res
      .status(409)
      .json({ ok: false, error: "Update already in progress" });
  }

  try {
    const state = await applyUpdate();
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get("/status", (_req, res) => {
  res.json({ ok: true, ...getUpdateState() });
});

export default router;
