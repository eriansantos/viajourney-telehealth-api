import pg from "pg";
import { config } from "dotenv";
config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const sql = `
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  CREATE TABLE IF NOT EXISTS form_submissions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id   BIGINT NOT NULL,
    patient_id       BIGINT NOT NULL,
    form_type        VARCHAR(10) NOT NULL CHECK (form_type IN ('48h', '7d')),
    sent_at          TIMESTAMPTZ,
    responded_at     TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS form_responses_48h (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id          UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
    feeling_improvement    VARCHAR(10) NOT NULL CHECK (feeling_improvement IN ('better', 'same', 'worse')),
    went_to_er             BOOLEAN NOT NULL,
    would_have_gone_to_er  VARCHAR(10) NOT NULL CHECK (would_have_gone_to_er IN ('yes', 'no', 'maybe')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS form_responses_7d (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id       UUID NOT NULL REFERENCES form_submissions(id) ON DELETE CASCADE,
    issue_resolved      VARCHAR(15) NOT NULL CHECK (issue_resolved IN ('fully', 'partially', 'no')),
    needed_revisit      BOOLEAN NOT NULL,
    escalated_outside   BOOLEAN NOT NULL,
    went_to_er_7d       BOOLEAN NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`;

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("✅ Tabelas criadas com sucesso.");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => { console.error("❌ Migration error:", err.message); process.exit(1); });
