// Express requires all 4 parameters to recognize this as an error handler.
// _req and _next are prefixed to signal intentional disuse to the linter.
export function errorHandler(err, _req, res, _next) {
  console.error("Unhandled server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
}
