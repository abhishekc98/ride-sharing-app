import pkg from 'pg'
const { Pool } = pkg
let pool: pkg.Pool | null = null
export const getDb = () => {
  if (!pool) pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 5,
  })
  return pool
}
