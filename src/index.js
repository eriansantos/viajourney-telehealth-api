import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "dotenv";

config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:5173" }));
app.use(morgan("dev"));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "viajourney-telehealth-api" });
});

import elationRouter from "./routes/elation.js";

app.use("/api/elation", elationRouter);

app.listen(PORT, () => {
  console.log(`✅ Via Journey API running on http://localhost:${PORT}`);
});
