import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { rateLimit } from "express-rate-limit";
import config from "./config/index.js";
import { clerk } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";
import checkoutRouter from "./routes/checkout.js";

const app = express();

app.use(helmet());
// Allow: explicit origins from env, any *.vercel.app deploy, and localhost
const explicitOrigins = config.allowedOrigin.split(",").map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                          // server-to-server / curl
    if (explicitOrigins.includes(origin)) return cb(null, true); // env-listed origins
    if (/^https:\/\/[\w-]+(\.vercel\.app)$/.test(origin)) return cb(null, true); // any Vercel preview/prod
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return cb(null, true);        // local dev
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
}));
app.use(morgan("dev"));
app.use(express.json());

// Checkout público (sem Clerk) — DEVE vir antes do middleware clerk
// Rate limit próprio: 60 req / 10 min por IP (evita abuso em endpoint público)
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many checkout requests — please try again later." },
});
app.use("/checkout", checkoutLimiter, checkoutRouter);

app.use(clerk);

// ─── Rate limiting ────────────────────────────────────────────────────────────
// Global: 200 req / 15 min per IP (covers UI polling)
app.use(
  rateLimit({
    windowMs:         15 * 60 * 1000,
    max:              200,
    standardHeaders:  true,   // RateLimit-* headers
    legacyHeaders:    false,
    message:          { error: "Too many requests — please try again later." },
  })
);

// Stricter limit on Elation proxy endpoints (expensive upstream calls)
app.use(
  "/api/elation",
  rateLimit({
    windowMs:         1 * 60 * 1000,
    max:              30,
    standardHeaders:  true,
    legacyHeaders:    false,
    message:          { error: "Elation API rate limit reached — please wait a moment." },
  })
);

// Health (público)
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "viajourney-telehealth-api" });
});

// API (protegida pelo Clerk)
app.use("/api", apiRouter);

// Erro centralizado
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`✅ Via Journey API running on http://localhost:${config.port}`);
});
