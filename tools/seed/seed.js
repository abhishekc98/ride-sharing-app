#!/usr/bin/env node
// Seed dev data: admin user, promo codes, sample drivers
import pg from 'pg'
import 'dotenv/config'

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL })

async function seed() {
  console.log('Seeding dev data...')

  // Admin user
  await pool.query(`
    INSERT INTO users (phone, name, email, role, referral_code)
    VALUES ('+919000000000', 'Admin User', 'admin@rideapp.dev', 'admin', 'ADMIN01')
    ON CONFLICT (phone) DO UPDATE SET role = 'admin', name = 'Admin User'
  `)
  console.log('  Created admin user: +919000000000')

  // Test promo codes
  await pool.query(`
    INSERT INTO promo_codes (code, discount_type, discount_value, max_discount, max_uses, expires_at)
    VALUES
      ('FIRST50', 'percent', 50, 100, 1000, NOW() + INTERVAL '1 year'),
      ('FLAT30', 'flat', 30, NULL, 500, NOW() + INTERVAL '1 year'),
      ('WELCOME20', 'percent', 20, 50, 2000, NOW() + INTERVAL '6 months')
    ON CONFLICT (code) DO NOTHING
  `)
  console.log('  Created promo codes: FIRST50, FLAT30, WELCOME20')

  // Test driver
  await pool.query(`
    INSERT INTO users (phone, name, role, referral_code, wallet_balance)
    VALUES ('+919111111111', 'Test Driver', 'driver', 'DRIVER1', 0)
    ON CONFLICT (phone) DO NOTHING
  `)
  const driverRes = await pool.query('SELECT id FROM users WHERE phone = $1', ['+919111111111'])
  const driverId = driverRes.rows[0]?.id
  if (driverId) {
    await pool.query(`INSERT INTO drivers (id) VALUES ($1) ON CONFLICT DO NOTHING`, [driverId])
    await pool.query(`
      INSERT INTO vehicles (driver_id, type, make, model, year, plate_no, color)
      VALUES ($1, 'bike', 'Honda', 'Activa', 2022, 'KA01AB1234', 'Red')
      ON CONFLICT DO NOTHING
    `, [driverId])
    console.log('  Created test driver: +919111111111')
  }

  console.log('Seed complete.')
  await pool.end()
}

seed().catch((err) => { console.error(err); process.exit(1) })
