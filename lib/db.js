import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set. API calls will fail until it is configured.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

export async function query(text, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}
