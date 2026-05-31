-- ─────────────────────────────────────────────────────────────────
-- Migration 001: Initial schema
-- ─────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Users (riders and drivers share this table)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone           VARCHAR(20) UNIQUE NOT NULL,
  name            VARCHAR(100),
  email           VARCHAR(255),
  profile_photo_url TEXT,
  role            VARCHAR(20) NOT NULL DEFAULT 'rider' CHECK (role IN ('rider','driver','admin')),
  wallet_balance  DECIMAL(10,2) NOT NULL DEFAULT 0,
  referral_code   VARCHAR(10) UNIQUE,
  profile_complete BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Saved addresses for riders
CREATE TABLE saved_addresses (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label     VARCHAR(50) NOT NULL,
  address   TEXT NOT NULL,
  lat       DECIMAL(9,6) NOT NULL,
  lng       DECIMAL(9,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vehicles
CREATE TABLE vehicles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id     UUID NOT NULL,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('bike','auto','cab')),
  make          VARCHAR(50) NOT NULL,
  model         VARCHAR(50) NOT NULL,
  year          SMALLINT NOT NULL,
  plate_no      VARCHAR(20) NOT NULL,
  color         VARCHAR(30) NOT NULL,
  rc_doc_url    TEXT,
  insurance_doc_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drivers
CREATE TABLE drivers (
  id              UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  license_no      VARCHAR(30),
  kyc_status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending','submitted','approved','rejected')),
  kyc_docs        JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(20) NOT NULL DEFAULT 'offline' CHECK (status IN ('offline','online','on_ride')),
  rating          DECIMAL(3,2) NOT NULL DEFAULT 5.0,
  total_rides     INTEGER NOT NULL DEFAULT 0,
  acceptance_rate DECIMAL(5,2) NOT NULL DEFAULT 100.0,
  total_earnings  DECIMAL(10,2) NOT NULL DEFAULT 0,
  pending_payout  DECIMAL(10,2) NOT NULL DEFAULT 0,
  vehicle_id      UUID REFERENCES vehicles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vehicles ADD CONSTRAINT vehicles_driver_fk FOREIGN KEY (driver_id) REFERENCES drivers(id);

-- Rides
CREATE TABLE rides (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rider_id          UUID NOT NULL REFERENCES users(id),
  driver_id         UUID REFERENCES users(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'requested',
  vehicle_type      VARCHAR(10) NOT NULL CHECK (vehicle_type IN ('bike','auto','cab')),
  pickup_address    TEXT NOT NULL,
  pickup_lat        DECIMAL(9,6) NOT NULL,
  pickup_lng        DECIMAL(9,6) NOT NULL,
  drop_address      TEXT NOT NULL,
  drop_lat          DECIMAL(9,6) NOT NULL,
  drop_lng          DECIMAL(9,6) NOT NULL,
  route_polyline    TEXT,
  distance_km       DECIMAL(6,2),
  duration_minutes  DECIMAL(6,2),
  fare_estimate     DECIMAL(10,2) NOT NULL,
  fare_final        DECIMAL(10,2),
  surge_multiplier  DECIMAL(4,2) NOT NULL DEFAULT 1.0,
  promo_code        VARCHAR(30),
  promo_discount    DECIMAL(10,2) DEFAULT 0,
  payment_method    VARCHAR(20),
  payment_status    VARCHAR(20),
  cancelled_by      VARCHAR(20),
  cancel_reason     TEXT,
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_at       TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  cancelled_at      TIMESTAMPTZ
);

-- Payments
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id         UUID NOT NULL REFERENCES rides(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  amount          DECIMAL(10,2) NOT NULL,
  method          VARCHAR(20) NOT NULL,
  gateway_ref     VARCHAR(100),
  idempotency_key VARCHAR(100) UNIQUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wallet transactions (double-entry)
CREATE TABLE wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id),
  type          VARCHAR(10) NOT NULL CHECK (type IN ('credit','debit')),
  amount        DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  reason        VARCHAR(50) NOT NULL,
  ref_id        UUID,
  description   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ratings
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id     UUID NOT NULL REFERENCES rides(id),
  from_user_id UUID NOT NULL REFERENCES users(id),
  to_user_id  UUID NOT NULL REFERENCES users(id),
  role        VARCHAR(10) NOT NULL CHECK (role IN ('rider','driver')),
  score       SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, from_user_id)
);

-- Promo codes
CREATE TABLE promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(30) UNIQUE NOT NULL,
  discount_type   VARCHAR(10) NOT NULL CHECK (discount_type IN ('flat','percent')),
  discount_value  DECIMAL(10,2) NOT NULL,
  max_discount    DECIMAL(10,2),
  min_ride_amount DECIMAL(10,2) DEFAULT 0,
  max_uses        INTEGER NOT NULL DEFAULT 1,
  used_count      INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Promo usage tracking
CREATE TABLE promo_usages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_id    UUID NOT NULL REFERENCES promo_codes(id),
  user_id     UUID NOT NULL REFERENCES users(id),
  ride_id     UUID REFERENCES rides(id),
  used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (promo_id, user_id)
);

-- Referrals
CREATE TABLE referrals (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_id     UUID NOT NULL REFERENCES users(id),
  referred_id     UUID NOT NULL REFERENCES users(id),
  bonus_credited  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_id)
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX idx_rides_rider_id ON rides(rider_id);
CREATE INDEX idx_rides_driver_id ON rides(driver_id);
CREATE INDEX idx_rides_status ON rides(status);
CREATE INDEX idx_rides_requested_at ON rides(requested_at DESC);
CREATE INDEX idx_payments_ride_id ON payments(ride_id);
CREATE INDEX idx_wallet_tx_user_id ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX idx_ratings_to_user ON ratings(to_user_id);
CREATE INDEX idx_saved_addresses_user ON saved_addresses(user_id);
