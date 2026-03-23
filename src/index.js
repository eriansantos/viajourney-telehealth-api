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

// Routes (a adicionar)
// import ecwRouter from "./routes/ecw.js";
// import hintRouter from "./routes/hint.js";
// import ghlRouter from "./routes/ghl.js";
// import rcRouter from "./routes/ringcentral.js";
// app.use("/api/ecw", ecwRouter);
// app.use("/api/hint", hintRouter);
// app.use("/api/ghl", ghlRouter);
// app.use("/api/rc", rcRouter);

app.listen(PORT, () => {
  console.log(`✅ Via Journey API running on http://localhost:${PORT}`);
});
