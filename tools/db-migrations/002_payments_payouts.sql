-- ─────────────────────────────────────────────────────────────────
-- Migration 002: real payment collection, wallet top-up, driver
-- payouts, cancellation fees.
-- ─────────────────────────────────────────────────────────────────

-- Payments: allow a payment that isn't tied to a ride (wallet top-up),
-- and distinguish what the payment is actually for.
ALTER TABLE payments ALTER COLUMN ride_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'ride_fare'
  CHECK (purpose IN ('ride_fare', 'wallet_topup'));

-- gateway_ref holds the Razorpay *order* id for the life of the payment (the
-- webhook and the checkout-verify route both look a payment up by order id,
-- including on retries after capture). The actual *payment* id Razorpay
-- assigns on capture is stored separately so a later refund can reference it
-- without clobbering the order-id lookup.
ALTER TABLE payments ADD COLUMN gateway_payment_id VARCHAR(100);

-- Rider's chosen payment method at booking time — distinct from
-- rides.payment_method, which records how the ride actually ended up paid.
ALTER TABLE rides ADD COLUMN payment_preference VARCHAR(20) NOT NULL DEFAULT 'wallet'
  CHECK (payment_preference IN ('wallet', 'card', 'cash'));

-- Cash rides settle in person — no gateway/wallet money movement, but we
-- still want a payment method on record without pretending it went through
-- Razorpay or the wallet.
ALTER TABLE rides ADD COLUMN cancellation_fee DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Driver payout requests — MVP has no bank-transfer integration, so a
-- withdrawal moves money out of the driver's in-app wallet immediately
-- (so it can't be double-spent) and waits here for an ops admin to mark
-- it settled once the real bank transfer happens out-of-band.
CREATE TABLE payout_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id     UUID NOT NULL REFERENCES users(id),
  amount        DECIMAL(10,2) NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'settled', 'rejected')),
  note          TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at    TIMESTAMPTZ
);

CREATE INDEX idx_payout_requests_driver ON payout_requests(driver_id, requested_at DESC);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);
