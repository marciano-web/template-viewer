import pg from 'pg';
const {Pool}=pg;
export const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
export async function initDb(){await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto;");}
