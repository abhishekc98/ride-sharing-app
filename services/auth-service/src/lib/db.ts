import pkg from 'pg'
const { Pool } = pkg

let pool: pkg.Pool | null = null

export function getDb(): pkg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      max: 10,
    })
  }
  return pool
}

export async function upsertUser(phone: string, role: string) {
  const db = getDb()
  const result = await db.query(
    `INSERT INTO users (phone, role, referral_code, wallet_balance)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
     RETURNING id, phone, name, role, profile_complete, referral_code`,
    [phone, role, generateReferralCode()]
  )
  return result.rows[0]
}

function generateReferralCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}
