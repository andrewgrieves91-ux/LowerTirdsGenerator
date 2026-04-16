import { companionCors } from "./cors.js";
import { crossOriginIsolation } from "./crossOrigin.js";

export function headerRouter(req, res, next) {
  if (req.path.startsWith("/api/companion")) {
    companionCors(req, res, next);
  } else {
    crossOriginIsolation(req, res, next);
  }
}
