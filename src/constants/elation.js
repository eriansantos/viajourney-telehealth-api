// ─── Elation domain constants ────────────────────────────────────────────────
// Single source of truth for status strings, thresholds and drug lists.
// Import from here instead of repeating literals in transformers.

// ── Appointment status groups ────────────────────────────────────────────────
export const STATUS = {
  COMPLETED: ["Checked In", "In Room", "In Room - Vitals Taken", "With Doctor", "Checked Out", "Billed"],
  NO_SHOW:   ["Not Seen"],
  CANCELLED: ["Cancelled"],
  PENDING:   ["Scheduled", "Confirmed"],
};

// ── Compliance outlier thresholds (%) ────────────────────────────────────────
export const THRESHOLDS = {
  NO_SHOW:      20,   // flag if physician no-show rate exceeds this
  CANCELLATION: 15,   // flag if physician cancellation rate exceeds this
  DOC_RATE:     80,   // flag if documentation rate falls below this
};

// ── Antibiotic drug name substrings (case-insensitive match) ─────────────────
export const ANTIBIOTICS = [
  "amoxicillin",   "amoxicilina",   "augmentin",     "amoxiclav",
  "azithromycin",  "azitromicina",  "zithromax",
  "doxycycline",   "doxiciclina",
  "ciprofloxacin", "ciprofloxacino","cipro",
  "levofloxacin",  "levofloxacino",
  "cephalexin",    "cefalexin",     "cefdinir",      "cefuroxime",    "ceftriaxone",
  "metronidazole", "metronidazol",  "flagyl",
  "trimethoprim",  "sulfamethoxazole", "bactrim",    "septra",
  "clindamycin",   "clindamicina",
  "penicillin",    "penicilina",
  "nitrofurantoin","macrobid",
  "clarithromycin","erythromycin",
];

export const isAntibiotic = (name = "") => {
  const n = name.toLowerCase();
  return ANTIBIOTICS.some((a) => n.includes(a));
};
