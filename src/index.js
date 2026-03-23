import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import config from "./config/index.js";
import { clerk } from "./middleware/auth.js";
import { errorHandler } from "./middleware/errorHandler.js";
import apiRouter from "./routes/index.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: config.allowedOrigin }));
app.use(morgan("dev"));
app.use(express.json());
app.use(clerk);

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
