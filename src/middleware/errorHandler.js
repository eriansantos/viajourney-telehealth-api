export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  const message = err.message || "Internal Server Error";

  console.error(`[ERROR] ${req.method} ${req.path} → ${status}: ${message}`);

  res.status(status).json({ error: message });
}
