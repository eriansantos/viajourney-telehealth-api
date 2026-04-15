import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // In production (Railway/Supabase) the cert is valid — enforce it.
  // In local dev with a self-signed cert, set NODE_ENV=development to relax.
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : { rejectUnauthorized: false },
});

export default pool;
