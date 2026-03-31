// Express requires all 4 parameters to recognize this as an error handler
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  console.error("Unhandled server error:", err);
  res.status(500).json({ ok: false, error: "Internal server error" });
}
