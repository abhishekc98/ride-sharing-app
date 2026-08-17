import Razorpay from 'razorpay'
import crypto from 'node:crypto'

let rp: Razorpay | null = null

export function getRazorpay(): Razorpay {
  if (!rp) {
    rp = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    })
  }
  return rp
}

export async function createOrder(amount: number, receiptId: string) {
  return getRazorpay().orders.create({
    amount: Math.round(amount * 100), // paise
    currency: 'INR',
    receipt: receiptId,
  })
}

export async function issueRefund(paymentId: string, amount: number) {
  return getRazorpay().payments.refund(paymentId, { amount: Math.round(amount * 100) })
}

// Checkout success verification — distinct from the webhook signature above.
// Razorpay Checkout hands the client an order id, payment id, and a signature
// over `${orderId}|${paymentId}` signed with the *key secret* (not the
// separate webhook secret). Verifying this lets the client confirm payment
// immediately after Checkout closes, without waiting on the webhook (which
// needs a publicly reachable URL — not available for local dev at all).
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET ?? '')
    .update(`${orderId}|${paymentId}`)
    .digest('hex')
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}

// Razorpay signs webhook bodies with HMAC-SHA256 over the raw request body,
// using a secret configured separately from the API key/secret (dashboard →
// Webhooks). Must be verified against the raw string, not the parsed JSON —
// re-serializing can change byte-for-byte formatting and break the signature.
export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET ?? '')
    .update(rawBody)
    .digest('hex')
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}
