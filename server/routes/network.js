import { Router } from "express";
import { networkInterfaces } from "os";

const router = Router();

function getLocalIPs() {
  const ifaces = networkInterfaces();
  const ips = [];
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

router.get("/network-info", (req, res) => {
  try {
    const ips = getLocalIPs();
    const port = req.app.get("port") || Number(process.env.PORT || 3000);
    res.json({ ips, port });
  } catch {
    res.json({ ips: [], port: Number(process.env.PORT || 3000) });
  }
});

export default router;
