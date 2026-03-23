// Valida parâmetros de data ISO (YYYY-MM-DD)
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(req, res, next) {
  const { from, to } = req.query;

  if (from && !ISO_DATE.test(from)) {
    return res.status(400).json({ error: "Parâmetro 'from' deve estar no formato YYYY-MM-DD" });
  }
  if (to && !ISO_DATE.test(to)) {
    return res.status(400).json({ error: "Parâmetro 'to' deve estar no formato YYYY-MM-DD" });
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: "'from' não pode ser posterior a 'to'" });
  }

  next();
}
