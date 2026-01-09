import "dotenv/config";
import express from "express";
import pg from "pg";

const { Pool } = pg;

const app = express();
app.use(express.json());

// Conexão com o Postgres (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Railway às vezes exige SSL em conexão pública; na rede interna geralmente não.
  // Se der erro de SSL, a gente ajusta depois.
  ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

// Listar templates
app.get("/api/templates", async (_req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, original_name, mime_type, size_bytes, created_at FROM templates ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("GET /api/templates failed:", err);
    res.status(500).json({ error: "db_error", detail: String(err.message || err) });
  }
});

// Servir o frontend (sempre por último)
app.use(express.static("./web"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
