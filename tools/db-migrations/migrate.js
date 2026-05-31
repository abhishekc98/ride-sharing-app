#!/usr/bin/env node
// Run: node tools/db-migrations/migrate.js
import pg from 'pg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import 'dotenv/config'

const { Pool } = pg
const __dirname = path.dirname(fileURLToPath(import.meta.url))

const pool = new Pool({
  connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
})

await pool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`)

const applied = new Set(
  (await pool.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
)

const files = fs
  .readdirSync(__dirname)
  .filter((f) => f.endsWith('.sql'))
  .sort()

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  skip  ${file}`)
    continue
  }
  const sql = fs.readFileSync(path.join(__dirname, file), 'utf8')
  await pool.query('BEGIN')
  try {
    await pool.query(sql)
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file])
    await pool.query('COMMIT')
    console.log(`  apply ${file}`)
  } catch (err) {
    await pool.query('ROLLBACK')
    console.error(`  error ${file}:`, err.message)
    process.exit(1)
  }
}

console.log('Migrations complete.')
await pool.end()
