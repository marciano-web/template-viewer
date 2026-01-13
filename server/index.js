import "dotenv/config";
import express from "express";
import pg from "pg";
import multer from "multer";

const { Pool } = pg;
const app = express();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

app.use(express.json());

// ---- DB connection (Railway-friendly) ----
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set. Set it in Railway > web > Variables.");
}

const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes("railway.internal")
    ? undefined
    : { rejectUnauthorized: false },
});

// ---- Helpers ----
function isA1Cell(s) {
  return typeof s === "string" && /^[A-Z]{1,3}[1-9]\d{0,6}$/.test(s.trim());
}
function splitA1Range(rangeRef) {
  if (typeof rangeRef !== "string") return null;
  const parts = rangeRef.trim().toUpperCase().split(":");
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (!isA1Cell(a) || !isA1Cell(b)) return null;
  return [a, b];
}
function colToNum(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
function parseCell(cell) {
  const m = cell.match(/^([A-Z]{1,3})([1-9]\d{0,6})$/);
  if (!m) return null;
  return { col: colToNum(m[1]), row: parseInt(m[2], 10), colStr: m[1] };
}
function rangeCount(rangeRef) {
  const ab = splitA1Range(rangeRef);
  if (!ab) return null;
  const a = parseCell(ab[0]);
  const b = parseCell(ab[1]);
  if (!a || !b) return null;
  const rows = Math.abs(b.row - a.row) + 1;
  const cols = Math.abs(b.col - a.col) + 1;
  return { rows, cols, cells: rows * cols };
}

// ---- Health ----
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- Templates: list + upload ----
app.get("/api/templates", async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, name, original_name, mime_type, size_bytes, created_at
       FROM templates
       ORDER BY created_at DESC`
    );
    res.json(r.rows);
  } catch (err) {
    console.error("GET /api/templates error:", err);
    res.status(500).json({ error: "db_error", detail: String(err.message || err) });
  }
});

app.post("/api/templates", upload.single("file"), async (req, res) => {
  try {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "no_file" });

    const { originalname, mimetype, size, buffer } = f;
    const name = (originalname || "template").replace(/\.[^.]+$/, "");

    await pool.query(
      `INSERT INTO templates (name, original_name, mime_type, size_bytes, file_data)
       VALUES ($1,$2,$3,$4,$5)`,
      [name, originalname, mimetype, size, buffer]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /api/templates upload error:", err);
    res.status(500).json({ error: "upload_failed", detail: String(err.message || err) });
  }
});

// ---- Template Fields (mapping) ----
app.get("/api/templates/:templateId/fields", async (req, res) => {
  try {
    const { templateId } = req.params;
    const r = await pool.query(
      `SELECT id, template_id, kind, label, cell_ref, range_ref, field_type, required, validation_json, created_at
       FROM template_fields
       WHERE template_id = $1
       ORDER BY created_at ASC`,
      [templateId]
    );
    res.json(r.rows);
  } catch (err) {
    console.error("GET template fields error:", err);
    res.status(500).json({ error: "db_error", detail: String(err.message || err) });
  }
});

app.post("/api/templates/:templateId/fields", async (req, res) => {
  try {
    const { templateId } = req.params;
    const {
      kind,
      label,
      cell_ref,
      range_ref,
      field_type,
      required,
      validation_json
    } = req.body || {};

    const kindNorm = String(kind || "").toLowerCase().trim();
    if (!["single", "range"].includes(kindNorm)) {
      return res.status(400).json({ error: "invalid_kind" });
    }
    if (!label || String(label).trim().length < 2) {
      return res.status(400).json({ error: "invalid_label" });
    }
    const ft = String(field_type || "").toLowerCase().trim();
    if (!["text", "number", "date"].includes(ft)) {
      return res.status(400).json({ error: "invalid_field_type" });
    }

    let cellRef = null;
    let rangeRef = null;

    if (kindNorm === "single") {
      cellRef = String(cell_ref || "").toUpperCase().trim();
      if (!isA1Cell(cellRef)) return res.status(400).json({ error: "invalid_cell_ref" });
    } else {
      rangeRef = String(range_ref || "").toUpperCase().trim();
      const rc = rangeCount(rangeRef);
      if (!rc) return res.status(400).json({ error: "invalid_range_ref" });

      // Enforce 1D ranges for MVP (either 1 row or 1 col)
      if (!(rc.rows === 1 || rc.cols === 1)) {
        return res.status(400).json({
          error: "range_must_be_1d",
          detail: "Use a single row or a single column range (e.g., C10:C29 or C10:V10)."
        });
      }

      const exp = validation_json?.expected_count;
      if (exp != null) {
        const expN = Number(exp);
        if (!Number.isFinite(expN) || expN <= 0) {
          return res.status(400).json({ error: "invalid_expected_count" });
        }
        if (expN !== rc.cells) {
          return res.status(400).json({
            error: "expected_count_mismatch",
            detail: `Range has ${rc.cells} cells, expected_count=${expN}.`
          });
        }
      }
    }

    // Avoid duplicates
    if (kindNorm === "single") {
      const dup = await pool.query(
        `SELECT 1 FROM template_fields WHERE template_id=$1 AND kind='single' AND cell_ref=$2 LIMIT 1`,
        [templateId, cellRef]
      );
      if (dup.rowCount) return res.status(409).json({ error: "duplicate_cell_ref" });
    } else {
      const dup = await pool.query(
        `SELECT 1 FROM template_fields WHERE template_id=$1 AND kind='range' AND range_ref=$2 LIMIT 1`,
        [templateId, rangeRef]
      );
      if (dup.rowCount) return res.status(409).json({ error: "duplicate_range_ref" });
    }

    const r = await pool.query(
      `INSERT INTO template_fields
       (template_id, kind, label, cell_ref, range_ref, field_type, required, validation_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, template_id, kind, label, cell_ref, range_ref, field_type, required, validation_json, created_at`,
      [
        templateId,
        kindNorm,
        String(label).trim(),
        cellRef,
        rangeRef,
        ft,
        !!required,
        validation_json || {}
      ]
    );

    res.json({ ok: true, field: r.rows[0] });
  } catch (err) {
    console.error("POST template fields error:", err);
    res.status(500).json({ error: "db_error", detail: String(err.message || err) });
  }
});

app.delete("/api/templates/:templateId/fields/:fieldId", async (req, res) => {
  try {
    const { templateId, fieldId } = req.params;
    const r = await pool.query(
      `DELETE FROM template_fields WHERE template_id=$1 AND id=$2`,
      [templateId, fieldId]
    );
    res.json({ ok: true, deleted: r.rowCount });
  } catch (err) {
    console.error("DELETE template field error:", err);
    res.status(500).json({ error: "db_error", detail: String(err.message || err) });
  }
});

// ---- Serve frontend (last) ----
app.use(express.static("./web"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

process.on("unhandledRejection", (reason) => console.error("UNHANDLED REJECTION:", reason));
process.on("uncaughtException", (err) => console.error("UNCAUGHT EXCEPTION:", err));
