import 'dotenv/config';
import express from 'express';
import pkg from 'pg';
import multer from 'multer';

const { Pool } = pkg;
const app = express();
const upload = multer();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.static('./web'));

app.get('/api/health', (req,res)=>res.json({ok:true}));

app.get('/api/templates', async (req,res)=>{
  const result = await pool.query(
    "SELECT id,name,original_name,size_bytes,created_at FROM templates ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

app.post('/api/templates', upload.single("file"), async (req,res)=>{
  const f = req.file;
  await pool.query(`
    INSERT INTO templates
    (name, original_name, mime_type, size_bytes, file_data)
    VALUES ($1,$2,$3,$4,$5)
  `,[f.originalname,f.originalname,f.mimetype,f.size,f.buffer]);

  res.json({ok:true});
});

app.listen(process.env.PORT || 3000);
